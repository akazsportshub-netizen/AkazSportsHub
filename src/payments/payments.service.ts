import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser, hasRole } from '../auth/auth.types';
import { apiError, errorMessage } from '../common/api-error';
import { CurrencyCode } from '../common/money';
import { APP_CONFIG, AppConfig, PaymentProviderName } from '../config/app-config';
import { DatabaseService, Queryable } from '../database/database.service';
import { LockService } from '../queues/lock.service';
import { QueuesService } from '../queues/queues.service';
import { ProviderEvent, ProviderEventOutcome } from './payment-events';
import { PaymentFlow, PaymentRef } from './payment-gateway';
import { bookingContext, phonesOf } from '../notifications/context';
import { queueMessages } from '../notifications/outbox';
import { planRebalance } from './rebalance';
import { PaymentGatewayRegistry } from './payment-gateway.registry';

type AttemptStatus =
  | 'CREATED'
  | 'AUTHORIZED'
  | 'CAPTURE_PENDING'
  | 'CAPTURED'
  | 'VOID_PENDING'
  | 'VOIDED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'FAILED';

type BookingStatus = 'HOLD' | 'CONFIRMED' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
type ShareStatus = 'PENDING' | 'PAID' | 'REFUNDED' | 'CANCELLED';

interface AttemptRow {
  id: string;
  share_id: string;
  provider: PaymentProviderName;
  flow: PaymentFlow;
  status: AttemptStatus;
  amount_minor: number;
  currency: CurrencyCode;
  provider_payment_id: string | null;
  provider_capture_id: string | null;
  provider_customer_id: string | null;
  needs_review: boolean;
  /** Set only by releaseBooking: partial refunds already made or promised. */
  refunded_minor?: number;
}

/** Booking → share → attempt, locked in that order everywhere to avoid deadlocks. */
interface LockedRows {
  booking: { id: string; status: BookingStatus };
  share: { id: string; status: ShareStatus; paid_attempt_id: string | null; is_ringer: boolean };
  attempt: AttemptRow;
}

interface FollowUps {
  capture: Set<string>;
  release: Set<string>;
  /** Bookings that may need their ringer re-split and refunds sent. */
  settle: Set<string>;
}

export interface StartPaymentResult {
  attempt_id: string;
  provider: PaymentProviderName;
  flow: PaymentFlow;
  checkout_url: string;
  amount_minor: number;
  currency: CurrencyCode;
  hold_expires_at: Date;
}

const MAX_ATTEMPTS_PER_SHARE = 5;
const PAYMENT_LOCK = { ttlMs: 120_000, waitMs: 5_000 };

const ATTEMPT_COLUMNS = `a.id, a.share_id, a.provider, a.flow, a.status, a.amount_minor, a.currency,
       a.provider_payment_id, a.provider_capture_id, a.provider_customer_id, a.needs_review`;

/**
 * Split-pay escrow. Each participant pays their share through a payment attempt; the
 * booking is confirmed only when every share is paid, and any money that should not be
 * kept (the hold expired, the booking was cancelled, someone paid twice) is voided or
 * refunded automatically.
 *
 * External provider calls never run inside a database transaction. Each one is bracketed
 * by a claim (… → *_PENDING) and a settle step, so a crash in between leaves a visible
 * *_PENDING row for the sweep to flag instead of silently losing or double-moving money.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: DatabaseService,
    private readonly gateways: PaymentGatewayRegistry,
    private readonly locks: LockService,
    private readonly queues: QueuesService,
  ) {}

  // ---------------------------------------------------------------------------
  // Starting a payment
  // ---------------------------------------------------------------------------

  /** Opens a hosted payment page for one share of a booking that is still on hold. */
  async startPayment(user: AuthUser, bookingId: string, shareId: string, flow: PaymentFlow): Promise<StartPaymentResult> {
    const rows = await this.db.query<{
      share_user_id: string;
      amount_minor: number;
      currency: CurrencyCode;
      share_status: ShareStatus;
      booking_status: BookingStatus;
      hold_expires_at: Date;
      hold_active: boolean;
      organizer_user_id: string;
      venue_country: string;
      venue_name: string;
      court_name: string;
      full_name: string;
      email: string | null;
      phone_e164: string | null;
      is_ringer: boolean;
      pay_by: Date | null;
      ringer_window: boolean;
      attempt_count: number;
    }>(
      /* sql */ `
      SELECT s.user_id AS share_user_id, s.amount_minor, s.currency, s.status AS share_status,
             b.status AS booking_status, b.hold_expires_at, (b.hold_expires_at > now()) AS hold_active,
             b.organizer_user_id, v.country_code AS venue_country, v.name AS venue_name, c.name AS court_name,
             u.full_name, u.email, u.phone_e164,
             s.is_ringer, s.pay_by, (s.pay_by IS NOT NULL AND s.pay_by > now()) AS ringer_window,
             (SELECT count(*) FROM payment_attempts a WHERE a.share_id = s.id)::int AS attempt_count
        FROM booking_split_shares s
        JOIN bookings b ON b.id = s.booking_id
        JOIN courts c ON c.id = b.court_id
        JOIN venues v ON v.id = c.venue_id
        JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND b.id = $2`,
      [shareId, bookingId],
    );
    const share = rows[0];
    if (!share) throw new NotFoundException(apiError('SHARE_NOT_FOUND', 'Payment share not found'));

    const mayPay = share.share_user_id === user.id || share.organizer_user_id === user.id || hasRole(user, 'ADMIN');
    if (!mayPay) throw new ForbiddenException(apiError('FORBIDDEN', 'Only the payer or the organizer can pay this share'));

    // A ringer who accepts a place on an already confirmed booking pays within their own window.
    const ringerOpen = share.is_ringer && share.booking_status === 'CONFIRMED' && share.ringer_window;
    if (!ringerOpen && (share.booking_status !== 'HOLD' || !share.hold_active)) {
      throw new ConflictException(apiError('HOLD_NOT_ACTIVE', 'This booking is no longer awaiting payment'));
    }
    if (share.share_status !== 'PENDING') {
      throw new ConflictException(apiError('SHARE_ALREADY_PAID', 'This share has already been paid'));
    }
    if (share.attempt_count >= MAX_ATTEMPTS_PER_SHARE) {
      throw new HttpException(
        apiError('TOO_MANY_ATTEMPTS', 'Too many payment attempts for this share'),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const gateway = this.gateways.forNewPayments();
    const [created] = await this.db.query<{ id: string }>(
      /* sql */ `
      INSERT INTO payment_attempts (share_id, provider, flow, amount_minor, currency)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id`,
      [shareId, gateway.name, flow, share.amount_minor, share.currency],
    );

    try {
      const payment = await gateway.createPayment({
        attemptId: created.id,
        bookingId,
        shareId,
        flow,
        amountMinor: share.amount_minor,
        currency: share.currency,
        countryCode: share.venue_country,
        description: `${share.venue_name} — ${share.court_name}`,
        payer: { fullName: share.full_name, email: share.email, phoneE164: share.phone_e164 },
      });
      await this.db.query(
        /* sql */ `
        UPDATE payment_attempts
           SET provider_payment_id = $2, checkout_url = $3
         WHERE id = $1`,
        [created.id, payment.providerPaymentId, payment.checkoutUrl],
      );
      return {
        attempt_id: created.id,
        provider: gateway.name,
        flow,
        checkout_url: payment.checkoutUrl,
        amount_minor: share.amount_minor,
        currency: share.currency,
        hold_expires_at: ringerOpen && share.pay_by ? share.pay_by : share.hold_expires_at,
      };
    } catch (error) {
      await this.db.query(
        /* sql */ `
        UPDATE payment_attempts
           SET status = 'FAILED', failure_reason = $2
         WHERE id = $1 AND status = 'CREATED'`,
        [created.id, errorMessage(error).slice(0, 500)],
      );
      this.logger.error(`Could not start payment for share ${shareId}: ${errorMessage(error)}`);
      throw new BadGatewayException(apiError('PAYMENT_PROVIDER_ERROR', 'The payment provider could not start the payment. Please try again.'));
    }
  }

  // ---------------------------------------------------------------------------
  // Provider notifications
  // ---------------------------------------------------------------------------

  /**
   * Applies a verified provider notification exactly once. The event row and every
   * state change commit together, so a failure rolls both back and the provider's
   * redelivery is processed from scratch.
   */
  async applyProviderEvent(event: ProviderEvent): Promise<ProviderEventOutcome> {
    const followUps: FollowUps = { capture: new Set(), release: new Set(), settle: new Set() };

    const outcome = await this.db.tx<ProviderEventOutcome>(async (q) => {
      const inserted = await q.query<{ id: number }>(
        /* sql */ `
        INSERT INTO payment_webhook_events (provider, event_key, event_type, outcome, payload)
        VALUES ($1, $2, $3, 'RECEIVED', $4::jsonb)
        ON CONFLICT (provider, event_key) DO NOTHING
        RETURNING id`,
        [event.provider, event.eventKey, event.eventType, JSON.stringify(event.payload ?? null)],
      );
      if (inserted.length === 0) return 'DUPLICATE';

      const result = await this.applyEventInTx(q, event, followUps);
      await q.query(
        /* sql */ `
        UPDATE payment_webhook_events
           SET outcome = $2, attempt_id = $3
         WHERE id = $1`,
        [inserted[0].id, result.outcome, result.attemptId],
      );
      return result.outcome;
    });

    // Only after the commit: workers must see the new state.
    for (const bookingId of followUps.capture) await this.queues.enqueueCapture(bookingId);
    for (const bookingId of followUps.release) await this.queues.enqueueRelease(bookingId);
    for (const bookingId of followUps.settle) await this.settleRingers(bookingId);

    if (outcome === 'UNMATCHED') {
      this.logger.warn(`Unmatched ${event.provider} notification ${event.eventKey} (${event.eventType})`);
    }
    return outcome;
  }

  private async applyEventInTx(
    q: Queryable,
    event: ProviderEvent,
    followUps: FollowUps,
  ): Promise<{ outcome: ProviderEventOutcome; attemptId: string | null }> {
    if (!event.kind) return { outcome: 'IGNORED', attemptId: null };

    const found = await q.query<{ id: string }>(
      /* sql */ `
      SELECT a.id
        FROM payment_attempts a
       WHERE a.provider = $1
         AND (a.id = $2::uuid
              OR ($3::text IS NOT NULL AND (a.provider_payment_id = $3::text OR a.provider_capture_id = $3::text)))
       ORDER BY (a.id = $2::uuid) DESC NULLS LAST
       LIMIT 1`,
      [event.provider, event.attemptId, event.providerPaymentId],
    );
    if (found.length === 0) return { outcome: 'UNMATCHED', attemptId: null };

    const rows = await this.lockRows(q, found[0].id);
    if (!rows) return { outcome: 'UNMATCHED', attemptId: null };
    const attemptId = rows.attempt.id;

    let applied: boolean;
    switch (event.kind) {
      case 'AUTHORIZED':
      case 'CAPTURED':
        applied = await this.applySuccess(q, rows, event, followUps);
        break;
      case 'FAILED':
        applied = rows.attempt.status === 'CREATED';
        if (applied) {
          await q.query(
            /* sql */ `
            UPDATE payment_attempts
               SET status = 'FAILED', failure_reason = $2
             WHERE id = $1`,
            [attemptId, event.eventType.slice(0, 500)],
          );
        }
        break;
      case 'VOIDED':
        applied = await this.settleRelease(q, rows, 'VOIDED', null);
        break;
      case 'REFUNDED':
        // A partial refund (a ringer joined) must not mark the whole payment as refunded.
        applied =
          (await this.settleShareRefund(q, rows.attempt, event)) ||
          (await this.settleRelease(q, rows, 'REFUNDED', event.providerRefundId));
        break;
      case 'ACTION_FAILED':
        // A capture, void or refund we asked for was rejected. Put the attempt back in
        // its last confirmed state and stop automating it until someone has looked.
        await q.query(
          /* sql */ `
          UPDATE payment_attempts
             SET needs_review = true,
                 failure_reason = $2,
                 status = CASE status
                            WHEN 'CAPTURE_PENDING' THEN 'AUTHORIZED'
                            WHEN 'VOID_PENDING' THEN 'AUTHORIZED'
                            WHEN 'REFUND_PENDING' THEN 'CAPTURED'
                            ELSE status
                          END
           WHERE id = $1`,
          [attemptId, event.eventType.slice(0, 500)],
        );
        this.logger.error(`Provider rejected an action on attempt ${attemptId}: ${event.eventType} — flagged for review`);
        applied = true;
        break;
    }
    return { outcome: applied ? 'APPLIED' : 'STALE', attemptId };
  }

  /** Funds are held (AUTHORIZED) or taken (CAPTURED) for an attempt. */
  private async applySuccess(q: Queryable, rows: LockedRows, event: ProviderEvent, followUps: FollowUps): Promise<boolean> {
    const { booking, share, attempt } = rows;
    const target = event.kind === 'CAPTURED' ? 'CAPTURED' : 'AUTHORIZED';
    const allowedFrom: AttemptStatus[] =
      target === 'AUTHORIZED'
        ? ['CREATED', 'FAILED']
        : ['CREATED', 'FAILED', 'AUTHORIZED', 'CAPTURE_PENDING', 'VOID_PENDING'];
    // At Tap, capturing an authorization creates a separate charge; keep its id for refunds.
    const captureId =
      target === 'CAPTURED' &&
      event.providerPaymentId !== null &&
      attempt.provider_payment_id !== null &&
      event.providerPaymentId !== attempt.provider_payment_id
        ? event.providerPaymentId
        : null;

    if (!allowedFrom.includes(attempt.status)) {
      // Already captured, but this notification is the first to tell us the capture charge id.
      if (attempt.status === 'CAPTURED' && captureId && !attempt.provider_capture_id) {
        await q.query(/* sql */ `UPDATE payment_attempts SET provider_capture_id = $2 WHERE id = $1`, [attempt.id, captureId]);
        return true;
      }
      return false;
    }

    // Never trust a notification whose amount differs from what we asked for.
    const mismatch = event.amountMinor !== attempt.amount_minor || event.currency !== attempt.currency;

    await q.query(
      /* sql */ `
      UPDATE payment_attempts
         SET status = $2::text,
             authorized_at = COALESCE(authorized_at, now()),
             captured_at = CASE WHEN $2::text = 'CAPTURED' THEN now() ELSE captured_at END,
             provider_payment_id = COALESCE(provider_payment_id, $3::text),
             provider_capture_id = COALESCE($4::text, provider_capture_id),
             provider_customer_id = COALESCE($5::text, provider_customer_id),
             needs_review = needs_review OR $6::boolean,
             failure_reason = CASE WHEN $6::boolean THEN 'AMOUNT_MISMATCH' ELSE NULL END
       WHERE id = $1`,
      [attempt.id, target, event.providerPaymentId, captureId, event.providerCustomerId, mismatch],
    );

    if (mismatch) {
      this.logger.error(
        `Amount mismatch on attempt ${attempt.id}: expected ${attempt.amount_minor} ${attempt.currency}, ` +
          `provider reported ${event.amountMinor} ${event.currency} — flagged for review, share not marked paid`,
      );
      return true;
    }

    if (share.paid_attempt_id === attempt.id) {
      // Already this share's payment (e.g. the capture confirmation of an authorized hold).
      if (booking.status === 'EXPIRED' || booking.status === 'CANCELLED') followUps.release.add(booking.id);
      else if (target === 'CAPTURED') followUps.settle.add(booking.id);
      return true;
    }

    // A ringer's place on a booking that is already confirmed is paid after the fact.
    const ringerLate = booking.status === 'CONFIRMED' && share.status === 'PENDING' && share.is_ringer;
    if ((booking.status === 'HOLD' || ringerLate) && share.status === 'PENDING') {
      await q.query(
        /* sql */ `
        UPDATE booking_split_shares
           SET status = 'PAID', paid_attempt_id = $2, paid_at = now()
         WHERE id = $1`,
        [share.id, attempt.id],
      );
      if (ringerLate) followUps.capture.add(booking.id);
      let confirmed = booking.status === 'CONFIRMED';
      if (booking.status === 'HOLD') {
        // Ringers never hold up the booking: it is confirmed when every original player has paid.
        const [{ unpaid }] = await q.query<{ unpaid: number }>(
          /* sql */ `
          SELECT count(*)::int AS unpaid
            FROM booking_split_shares
           WHERE booking_id = $1 AND status <> 'PAID' AND NOT is_ringer`,
          [booking.id],
        );
        if (unpaid === 0) {
          await q.query(
            /* sql */ `
            UPDATE bookings
               SET status = 'CONFIRMED', confirmed_at = now()
             WHERE id = $1 AND status = 'HOLD'`,
            [booking.id],
          );
          followUps.capture.add(booking.id);
          confirmed = true;
          this.logger.log(`Booking ${booking.id} confirmed: all shares paid`);
        }
      }
      if (confirmed) followUps.settle.add(booking.id);
      return true;
    }

    // Money arrived that the booking cannot use: the hold already expired, the booking was
    // cancelled, or the share was paid through another attempt. Give it straight back.
    followUps.release.add(booking.id);
    return true;
  }

  /** A hold was released (VOIDED) or captured money was returned (REFUNDED). */
  private async settleRelease(
    q: Queryable,
    rows: LockedRows,
    target: 'VOIDED' | 'REFUNDED',
    providerRefundId: string | null,
  ): Promise<boolean> {
    const { booking, share, attempt } = rows;
    const allowedFrom: AttemptStatus[] =
      target === 'VOIDED' ? ['CREATED', 'AUTHORIZED', 'CAPTURE_PENDING', 'VOID_PENDING'] : ['CAPTURED', 'REFUND_PENDING'];
    if (!allowedFrom.includes(attempt.status)) return false;

    await q.query(
      /* sql */ `
      UPDATE payment_attempts
         SET status = $2::text, released_at = now(), provider_refund_id = COALESCE($3::text, provider_refund_id)
       WHERE id = $1`,
      [attempt.id, target, providerRefundId],
    );

    if (share.paid_attempt_id !== attempt.id || share.status !== 'PAID') return true;

    if (booking.status === 'EXPIRED' || booking.status === 'CANCELLED') {
      await q.query(/* sql */ `UPDATE booking_split_shares SET status = 'REFUNDED' WHERE id = $1`, [share.id]);
    } else if (booking.status === 'HOLD') {
      // The payer's money went back while the hold is still open (bank reversal, provider auto-void):
      // the share is unpaid again and can be retried.
      await q.query(
        /* sql */ `
        UPDATE booking_split_shares
           SET status = 'PENDING', paid_attempt_id = NULL, paid_at = NULL
         WHERE id = $1`,
        [share.id],
      );
    } else {
      await q.query(
        /* sql */ `
        UPDATE payment_attempts
           SET needs_review = true, failure_reason = 'RELEASED_ON_LIVE_BOOKING'
         WHERE id = $1`,
        [attempt.id],
      );
      this.logger.error(`Payment ${attempt.id} was ${target} while booking ${booking.id} is ${booking.status} — flagged for review`);
    }
    return true;
  }

  private async lockRows(q: Queryable, attemptId: string): Promise<LockedRows | null> {
    const [ids] = await q.query<{ share_id: string; booking_id: string }>(
      /* sql */ `
      SELECT a.share_id, s.booking_id
        FROM payment_attempts a
        JOIN booking_split_shares s ON s.id = a.share_id
       WHERE a.id = $1`,
      [attemptId],
    );
    if (!ids) return null;

    const [booking] = await q.query<LockedRows['booking']>(
      /* sql */ `SELECT id, status FROM bookings WHERE id = $1 FOR UPDATE`,
      [ids.booking_id],
    );
    const [share] = await q.query<LockedRows['share']>(
      /* sql */ `SELECT id, status, paid_attempt_id, is_ringer FROM booking_split_shares WHERE id = $1 FOR UPDATE`,
      [ids.share_id],
    );
    const [attempt] = await q.query<AttemptRow>(
      /* sql */ `
      SELECT a.id, a.share_id, a.provider, a.flow, a.status, a.amount_minor, a.currency,
             a.provider_payment_id, a.provider_capture_id, a.provider_customer_id, a.needs_review
        FROM payment_attempts a
       WHERE a.id = $1
         FOR UPDATE`,
      [attemptId],
    );
    if (!booking || !share || !attempt) return null;
    return { booking, share, attempt };
  }

  // ---------------------------------------------------------------------------
  // Ringers: equal re-split and partial refunds
  // ---------------------------------------------------------------------------

  /**
   * A refund webhook for one of our partial refunds. Matched by the provider's refund id,
   * or (only while the payment is still captured and the id has not been stored yet) by amount.
   */
  private async settleShareRefund(q: Queryable, attempt: AttemptRow, event: ProviderEvent): Promise<boolean> {
    const [refund] = await q.query<{ id: string }>(
      /* sql */ `
      SELECT id
        FROM share_refunds
       WHERE attempt_id = $1
         AND status = 'PENDING'
         AND (($2::text IS NOT NULL AND provider_refund_id = $2::text)
              OR ($3::text = 'CAPTURED' AND $4::bigint IS NOT NULL AND amount_minor = $4::bigint
                  AND ($2::text IS NULL OR provider_refund_id IS NULL)))
       ORDER BY (provider_refund_id IS NOT NULL) DESC, created_at
       LIMIT 1
         FOR UPDATE`,
      [attempt.id, event.providerRefundId, attempt.status, event.amountMinor],
    );
    if (!refund) return false;
    await q.query(
      /* sql */ `
      UPDATE share_refunds
         SET status = 'REFUNDED', provider_refund_id = COALESCE($2::text, provider_refund_id), failure_reason = NULL
       WHERE id = $1`,
      [refund.id, event.providerRefundId],
    );
    return true;
  }

  /** Re-splits a booking that has paid ringers, then sends the refunds that are due. Safe to repeat. */
  async settleRingers(bookingId: string): Promise<void> {
    try {
      await this.rebalanceBooking(bookingId);
      await this.sendShareRefunds(bookingId);
    } catch (error) {
      // The minute sweep picks it up again.
      this.logger.error(`Could not settle ringers for booking ${bookingId}: ${errorMessage(error)}`);
    }
  }

  /**
   * Once every payment on a confirmed booking is captured, everyone's share becomes an equal
   * part of the total and the overpaid amounts are queued as refunds. Runs in one transaction.
   */
  private async rebalanceBooking(bookingId: string): Promise<number> {
    return this.locks.withLock(`payments:${bookingId}`, PAYMENT_LOCK, () =>
      this.db.tx(async (q) => {
        const [booking] = await q.query<{ status: BookingStatus; total_minor: number; currency: CurrencyCode }>(
          /* sql */ `SELECT status, total_minor, currency FROM bookings WHERE id = $1 FOR UPDATE`,
          [bookingId],
        );
        if (!booking || (booking.status !== 'CONFIRMED' && booking.status !== 'COMPLETED')) return 0;

        const paid = await q.query<{
          share_id: string;
          attempt_id: string;
          attempt_status: AttemptStatus;
          needs_review: boolean;
          is_ringer: boolean;
          created_at: Date;
          net_minor: number;
        }>(
          /* sql */ `
          SELECT s.id AS share_id, a.id AS attempt_id, a.status AS attempt_status, a.needs_review,
                 s.is_ringer, s.created_at,
                 (a.amount_minor - (SELECT coalesce(sum(r.amount_minor), 0) FROM share_refunds r
                                     WHERE r.attempt_id = a.id AND r.status <> 'FAILED'))::int AS net_minor
            FROM booking_split_shares s
            JOIN payment_attempts a ON a.id = s.paid_attempt_id
           WHERE s.booking_id = $1 AND s.status = 'PAID'
           ORDER BY s.created_at, s.id
             FOR UPDATE OF s`,
          [bookingId],
        );
        if (!paid.some((row) => row.is_ringer) || paid.length < 2) return 0;
        // Refund only against money we really hold: wait until every payment is captured.
        if (paid.some((row) => row.attempt_status !== 'CAPTURED' || row.needs_review)) return 0;

        const plan = planRebalance(
          booking.total_minor,
          paid.map((row) => ({
            shareId: row.share_id,
            attemptId: row.attempt_id,
            paidMinor: row.net_minor,
            isRinger: row.is_ringer,
            createdAt: new Date(row.created_at).getTime(),
          })),
        );
        if (plan.collectedMinor < booking.total_minor) {
          this.logger.error(
            `Booking ${bookingId} holds ${plan.collectedMinor} of ${booking.total_minor} ${booking.currency} after re-splitting — check its shares`,
          );
        }

        let refunds = 0;
        const refunded: { shareId: string; refundMinor: number }[] = [];
        for (const step of plan.steps) {
          await q.query(/* sql */ `UPDATE booking_split_shares SET amount_minor = $2 WHERE id = $1`, [step.shareId, step.newAmountMinor]);
          if (step.refundMinor > 0) {
            await q.query(
              /* sql */ `
              INSERT INTO share_refunds (share_id, attempt_id, amount_minor, currency, reason)
              VALUES ($1, $2, $3, $4, 'RINGER_JOINED')`,
              [step.shareId, step.attemptId, step.refundMinor, booking.currency],
            );
            refunds += 1;
            refunded.push({ shareId: step.shareId, refundMinor: step.refundMinor });
          }
        }

        // Tell each player their share dropped and how much is coming back.
        if (refunded.length > 0) {
          const owners = await q.query<{ id: string; user_id: string }>(
            /* sql */ `SELECT id, user_id FROM booking_split_shares WHERE id = ANY($1::uuid[])`,
            [refunded.map((row) => row.shareId)],
          );
          const people = await phonesOf(q, owners.map((row) => row.user_id));
          const context = await bookingContext(q, bookingId);
          if (context) {
            await queueMessages(
              q,
              refunded.flatMap((row) => {
                const userId = owners.find((owner) => owner.id === row.shareId)?.user_id;
                const person = userId ? people.get(userId) : undefined;
                if (!userId || !person) return [];
                return [
                  {
                    userId,
                    phone: person.phone,
                    locale: person.locale,
                    kind: 'SHARE_REFUND' as const,
                    vars: { court: context.court, venue: context.venue, startsAt: context.startsAt, timezone: context.timezone, amountMinor: row.refundMinor, currency: booking.currency },
                  },
                ];
              }),
            );
          }
        }
        return refunds;
      }),
    );
  }

  /** Sends every partial refund that is due. A refund the provider has not confirmed yet is left for its webhook. */
  private async sendShareRefunds(bookingId: string): Promise<void> {
    await this.locks.withLock(`payments:${bookingId}`, PAYMENT_LOCK, async () => {
      const due = await this.db.query<AttemptRow & { refund_id: string; refund_minor: number }>(
        /* sql */ `
        SELECT ${ATTEMPT_COLUMNS}, r.id AS refund_id, r.amount_minor AS refund_minor
          FROM share_refunds r
          JOIN payment_attempts a ON a.id = r.attempt_id
          JOIN booking_split_shares s ON s.id = a.share_id
         WHERE s.booking_id = $1
           AND r.status = 'PENDING'
           AND r.provider_refund_id IS NULL
           AND a.status = 'CAPTURED'
           AND a.needs_review = false
           AND a.provider_payment_id IS NOT NULL
         ORDER BY r.created_at`,
        [bookingId],
      );
      for (const row of due) {
        try {
          const result = await this.gateways.get(row.provider).partialRefund(this.toRef(row), row.refund_minor, row.refund_id);
          await this.db.query(
            /* sql */ `
            UPDATE share_refunds
               SET status = CASE WHEN $2::boolean THEN 'REFUNDED' ELSE status END,
                   provider_refund_id = COALESCE($3::text, provider_refund_id), failure_reason = NULL
             WHERE id = $1 AND status = 'PENDING'`,
            [row.refund_id, result.final, result.reference],
          );
        } catch (error) {
          await this.db.query(/* sql */ `UPDATE share_refunds SET failure_reason = $2 WHERE id = $1`, [
            row.refund_id,
            errorMessage(error).slice(0, 500),
          ]);
          this.logger.error(`Partial refund ${row.refund_id} failed: ${errorMessage(error)}`);
        }
      }
    });
  }

  /**
   * Minute sweep for ringers: cancels places whose payment window ran out (and reopens the
   * place), and retries re-splits and refunds that did not finish.
   */
  async sweepRingers(): Promise<{ expiredShares: number; settled: number }> {
    const expired = await this.db.query<{ booking_id: string }>(
      /* sql */ `
      UPDATE booking_split_shares s
         SET status = 'CANCELLED'
       WHERE s.is_ringer AND s.status = 'PENDING' AND s.pay_by IS NOT NULL AND s.pay_by < now()
      RETURNING s.booking_id`,
    );
    for (const { booking_id: bookingId } of expired) {
      await this.db.query(
        /* sql */ `
        UPDATE ringer_requests r
           SET slots_filled = greatest(r.slots_filled - 1, 0),
               status = CASE WHEN r.status = 'FILLED' AND r.expires_at > now() THEN 'OPEN' ELSE r.status END
         WHERE r.id = (SELECT id FROM ringer_requests
                        WHERE booking_id = $1 AND status IN ('OPEN', 'FILLED')
                        ORDER BY created_at DESC LIMIT 1)
           AND NOT (r.status = 'FILLED' AND EXISTS (SELECT 1 FROM ringer_requests o WHERE o.booking_id = $1 AND o.status = 'OPEN'))`,
        [bookingId],
      );
    }

    const toSettle = await this.db.query<{ id: string }>(
      /* sql */ `
      SELECT DISTINCT b.id
        FROM bookings b
        JOIN booking_split_shares s ON s.booking_id = b.id AND s.is_ringer AND s.status = 'PAID'
       WHERE b.status IN ('CONFIRMED', 'COMPLETED')
         AND (
           (SELECT coalesce(sum(p.amount_minor), 0) FROM booking_split_shares p WHERE p.booking_id = b.id AND p.status = 'PAID') > b.total_minor
           OR EXISTS (SELECT 1 FROM share_refunds r JOIN payment_attempts a ON a.id = r.attempt_id
                       JOIN booking_split_shares x ON x.id = a.share_id
                      WHERE x.booking_id = b.id AND r.status = 'PENDING' AND r.provider_refund_id IS NULL)
         )
       LIMIT 50`,
    );
    for (const { id } of toSettle) await this.settleRingers(id);
    return { expiredShares: expired.length, settled: toSettle.length };
  }

  // ---------------------------------------------------------------------------
  // Background work (called by the payment worker)
  // ---------------------------------------------------------------------------

  /** Captures the card holds of a confirmed booking. Safe to run any number of times. */
  async captureBooking(bookingId: string): Promise<void> {
    await this.locks.withLock(`payments:${bookingId}`, PAYMENT_LOCK, async () => {
      const attempts = await this.db.query<AttemptRow>(
        /* sql */ `
        SELECT ${ATTEMPT_COLUMNS}
          FROM payment_attempts a
          JOIN booking_split_shares s ON s.paid_attempt_id = a.id
          JOIN bookings b ON b.id = s.booking_id
         WHERE b.id = $1
           AND b.status IN ('CONFIRMED', 'COMPLETED')
           AND a.status = 'AUTHORIZED'
           AND a.flow = 'AUTHORIZE'
           AND a.provider_payment_id IS NOT NULL
           AND a.needs_review = false`,
        [bookingId],
      );

      const failures: string[] = [];
      for (const attempt of attempts) {
        const claimed = await this.db.query(
          /* sql */ `
          UPDATE payment_attempts SET status = 'CAPTURE_PENDING'
           WHERE id = $1 AND status = 'AUTHORIZED'
          RETURNING id`,
          [attempt.id],
        );
        if (claimed.length === 0) continue;

        try {
          const result = await this.gateways.get(attempt.provider).capture(this.toRef(attempt));
          if (result.final) {
            await this.db.query(
              /* sql */ `
              UPDATE payment_attempts
                 SET status = 'CAPTURED', captured_at = now(),
                     provider_capture_id = COALESCE($2::text, provider_capture_id), failure_reason = NULL
               WHERE id = $1 AND status = 'CAPTURE_PENDING'`,
              [attempt.id, result.reference],
            );
          }
        } catch (error) {
          await this.db.query(
            /* sql */ `
            UPDATE payment_attempts SET status = 'AUTHORIZED', failure_reason = $2
             WHERE id = $1 AND status = 'CAPTURE_PENDING'`,
            [attempt.id, errorMessage(error).slice(0, 500)],
          );
          failures.push(`${attempt.id}: ${errorMessage(error)}`);
        }
      }
      if (failures.length > 0) throw new Error(`Capture failed for booking ${bookingId} — ${failures.join('; ')}`);
    });
    await this.settleRingers(bookingId);
  }

  /**
   * Returns every payment the booking must not keep: all of them when the booking
   * expired or was cancelled, otherwise only surplus attempts (a share paid twice).
   * Holds are voided, captured money is refunded. Safe to run any number of times.
   */
  async releaseBooking(bookingId: string): Promise<void> {
    await this.locks.withLock(`payments:${bookingId}`, PAYMENT_LOCK, async () => {
      const attempts = await this.db.query<AttemptRow>(
        /* sql */ `
        SELECT ${ATTEMPT_COLUMNS},
               (SELECT coalesce(sum(r.amount_minor), 0)::int FROM share_refunds r
                 WHERE r.attempt_id = a.id AND r.status <> 'FAILED') AS refunded_minor
          FROM payment_attempts a
          JOIN booking_split_shares s ON s.id = a.share_id
          JOIN bookings b ON b.id = s.booking_id
         WHERE b.id = $1
           AND a.status IN ('AUTHORIZED', 'CAPTURED')
           AND a.provider_payment_id IS NOT NULL
           AND a.needs_review = false
           AND (b.status IN ('EXPIRED', 'CANCELLED') OR s.paid_attempt_id IS DISTINCT FROM a.id)`,
        [bookingId],
      );

      const failures: string[] = [];
      for (const attempt of attempts) {
        const isHold = attempt.status === 'AUTHORIZED';
        const pending: AttemptStatus = isHold ? 'VOID_PENDING' : 'REFUND_PENDING';
        const claimed = await this.db.query(
          /* sql */ `
          UPDATE payment_attempts SET status = $2::text
           WHERE id = $1 AND status = $3::text
          RETURNING id`,
          [attempt.id, pending, attempt.status],
        );
        if (claimed.length === 0) continue;

        try {
          const gateway = this.gateways.get(attempt.provider);
          const result = isHold
            ? await gateway.void(this.toRef(attempt))
            : await gateway.refund(this.toRef(attempt, attempt.amount_minor - (attempt.refunded_minor ?? 0)));
          if (result.final) {
            await this.db.tx(async (q) => {
              const rows = await this.lockRows(q, attempt.id);
              if (rows) await this.settleRelease(q, rows, isHold ? 'VOIDED' : 'REFUNDED', isHold ? null : result.reference);
            });
          } else if (!isHold && result.reference) {
            await this.db.query(
              /* sql */ `UPDATE payment_attempts SET provider_refund_id = COALESCE(provider_refund_id, $2::text) WHERE id = $1`,
              [attempt.id, result.reference],
            );
          }
        } catch (error) {
          await this.db.query(
            /* sql */ `
            UPDATE payment_attempts SET status = $3::text, failure_reason = $2
             WHERE id = $1 AND status = $4::text`,
            [attempt.id, errorMessage(error).slice(0, 500), attempt.status, pending],
          );
          failures.push(`${attempt.id}: ${errorMessage(error)}`);
        }
      }
      if (failures.length > 0) throw new Error(`Release failed for booking ${bookingId} — ${failures.join('; ')}`);
    });
  }

  /**
   * Safety net, run every minute: re-queues captures and releases whose job was lost,
   * and flags provider actions that never got confirmed.
   */
  async sweep(): Promise<{ captures: number; releases: number; flagged: number }> {
    const toCapture = await this.db.query<{ id: string }>(
      /* sql */ `
      SELECT DISTINCT b.id
        FROM bookings b
        JOIN booking_split_shares s ON s.booking_id = b.id
        JOIN payment_attempts a ON a.id = s.paid_attempt_id
       WHERE b.status IN ('CONFIRMED', 'COMPLETED')
         AND a.status = 'AUTHORIZED' AND a.flow = 'AUTHORIZE'
         AND a.needs_review = false
         AND a.updated_at < now() - interval '2 minutes'
       LIMIT 200`,
    );
    const toRelease = await this.db.query<{ id: string }>(
      /* sql */ `
      SELECT DISTINCT b.id
        FROM bookings b
        JOIN booking_split_shares s ON s.booking_id = b.id
        JOIN payment_attempts a ON a.share_id = s.id
       WHERE a.status IN ('AUTHORIZED', 'CAPTURED')
         AND a.needs_review = false
         AND (b.status IN ('EXPIRED', 'CANCELLED') OR s.paid_attempt_id IS DISTINCT FROM a.id)
         AND a.updated_at < now() - interval '2 minutes'
       LIMIT 200`,
    );
    const flagged = await this.db.query<{ id: string }>(
      /* sql */ `
      UPDATE payment_attempts
         SET needs_review = true, failure_reason = COALESCE(failure_reason, 'PROVIDER_CONFIRMATION_OVERDUE')
       WHERE status IN ('CAPTURE_PENDING', 'VOID_PENDING', 'REFUND_PENDING')
         AND needs_review = false
         AND updated_at < now() - interval '60 minutes'
      RETURNING id`,
    );

    for (const { id } of toCapture) await this.queues.enqueueCapture(id);
    for (const { id } of toRelease) await this.queues.enqueueRelease(id);
    if (flagged.length > 0) {
      this.logger.error(`Payment attempts awaiting provider confirmation for over an hour, flagged for review: ${flagged.map((r) => r.id).join(', ')}`);
    }
    return { captures: toCapture.length, releases: toRelease.length, flagged: flagged.length };
  }

  // ---------------------------------------------------------------------------
  // Development helper
  // ---------------------------------------------------------------------------

  /** Plays the provider's part for a mock attempt. Disabled unless PAYMENT_PROVIDER=mock. */
  assertMockEnabled(): void {
    if (this.config.paymentProvider !== 'mock' || this.config.nodeEnv === 'production') {
      throw new NotFoundException(apiError('NOT_FOUND', 'Not found'));
    }
  }

  async simulateMockOutcome(attemptId: string, outcome: 'AUTHORIZED' | 'CAPTURED' | 'FAILED'): Promise<ProviderEventOutcome> {
    this.assertMockEnabled();
    const [attempt] = await this.db.query<{ amount_minor: number; currency: string; provider_payment_id: string | null }>(
      /* sql */ `
      SELECT amount_minor, currency, provider_payment_id
        FROM payment_attempts
       WHERE id = $1 AND provider = 'mock'`,
      [attemptId],
    );
    if (!attempt) throw new NotFoundException(apiError('ATTEMPT_NOT_FOUND', 'Mock payment attempt not found'));

    return this.applyProviderEvent({
      provider: 'mock',
      eventKey: `${attemptId}:${outcome}`,
      eventType: `mock:${outcome}`,
      kind: outcome,
      attemptId,
      providerPaymentId: attempt.provider_payment_id,
      providerRefundId: null,
      providerCustomerId: null,
      amountMinor: attempt.amount_minor,
      currency: attempt.currency,
      payload: { simulated: true, outcome },
    });
  }

  private toRef(attempt: AttemptRow, amountMinor: number = attempt.amount_minor): PaymentRef {
    if (!attempt.provider_payment_id) {
      throw new Error(`Attempt ${attempt.id} has no provider payment id`);
    }
    return {
      attemptId: attempt.id,
      providerPaymentId: attempt.provider_payment_id,
      providerCaptureId: attempt.provider_capture_id,
      providerCustomerId: attempt.provider_customer_id,
      amountMinor,
      currency: attempt.currency,
    };
  }
}
