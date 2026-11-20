/**
 * End-to-end flows through the real services against a real PostgreSQL database.
 * Redis/BullMQ and the payment providers are replaced by in-memory stand-ins, so the
 * test controls exactly when a "job" runs and what a "provider" answers.
 *
 *   createdb akaz_test
 *   DATABASE_URL=postgres://…/akaz_test npm run db:migrate
 *   DATABASE_URL=postgres://…/akaz_test npm run test:integration
 *
 * The database name must end in `_test`: the suite empties the booking, payment,
 * match and ringer tables before it starts. It needs the seed data from 002_seed_data.sql.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { AuthUser } from '../src/auth/auth.types';
import { BookingsService } from '../src/bookings/bookings.service';
import { AppConfig } from '../src/config/app-config';
import { DatabaseService } from '../src/database/database.service';
import { MatchesService } from '../src/matches/matches.service';
import { MockGateway } from '../src/payments/mock.gateway';
import { CreatePaymentInput, CreatePaymentResult, PaymentGateway, PaymentRef, ProviderActionResult } from '../src/payments/payment-gateway';
import { PaymentGatewayRegistry } from '../src/payments/payment-gateway.registry';
import { PaymentsService } from '../src/payments/payments.service';
import { LockService } from '../src/queues/lock.service';
import { JOB_CAPTURE, JOB_EXPIRE_HOLD, JOB_RECRUIT_RINGERS, JOB_RELEASE, JOB_SWEEP } from '../src/queues/queue.constants';
import { QueuesService } from '../src/queues/queues.service';
import { RingersService } from '../src/ringers/ringers.service';
import { VenuesService } from '../src/venues/venues.service';
import { normalizeCheckoutEvent } from '../src/webhooks/checkout-webhook';
import { normalizeTapEvent } from '../src/webhooks/tap-webhook';
import { HoldExpiryWorker } from '../src/workers/hold-expiry.worker';
import { PaymentSettlementWorker } from '../src/workers/payment-settlement.worker';
import { RingerRecruitmentWorker } from '../src/workers/ringer-recruitment.worker';

// ---------------------------------------------------------------------------
// Seed data (db/migrations/002_seed_data.sql)
// ---------------------------------------------------------------------------
const uid = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
const ADMIN: AuthUser = { id: uid(1), roles: ['ADMIN'] };
const DOHA_MANAGER: AuthUser = { id: uid(2), roles: ['VENUE_MANAGER'] };
const REFEREE: AuthUser = { id: uid(5), roles: ['REFEREE'] };
const P1: AuthUser = { id: uid(10), roles: ['PLAYER'] };
const P2: AuthUser = { id: uid(11), roles: ['PLAYER'] };
const P3: AuthUser = { id: uid(12), roles: ['PLAYER'] };
const P4: AuthUser = { id: uid(13), roles: ['PLAYER'] };
const P5: AuthUser = { id: uid(14), roles: ['PLAYER'] };
const P6: AuthUser = { id: uid(15), roles: ['PLAYER'] };
const PARENT: AuthUser = { id: uid(20), roles: ['PARENT', 'PLAYER'] };

const AL_SADD_VENUE = '00000000-0000-4000-c000-000000000001';
const LUSAIL_VENUE = '00000000-0000-4000-c000-000000000002';
const PITCH_1 = '00000000-0000-4000-d000-000000000001';      // Al Sadd, QAR 250/h, 16:00–01:00, 60-minute slots
const PITCH_2 = '00000000-0000-4000-d000-000000000002';      // Al Sadd, QAR 350/h
const LUSAIL_PITCH = '00000000-0000-4000-d000-000000000003'; // Lusail, QAR 380/h, 15:00–00:00
const JUFFAIR_PITCH = '00000000-0000-4000-d000-000000000010'; // Manama, BHD 30.000/h

// ---------------------------------------------------------------------------
// Stand-ins for Redis, BullMQ and the payment providers
// ---------------------------------------------------------------------------

/** The two Redis commands LockService uses, in memory. */
class FakeRedis {
  private readonly keys = new Map<string, { token: string; expiresAt: number }>();

  async set(key: string, token: string, _px: 'PX', ttlMs: number, _nx: 'NX'): Promise<'OK' | null> {
    const held = this.keys.get(key);
    if (held && held.expiresAt > Date.now()) return null;
    this.keys.set(key, { token, expiresAt: Date.now() + ttlMs });
    return 'OK';
  }

  async eval(_script: string, _numKeys: number, key: string, token: string): Promise<number> {
    if (this.keys.get(key)?.token !== token) return 0;
    this.keys.delete(key);
    return 1;
  }
}

interface RecordedJob {
  name: string;
  data: { bookingId?: string; requestId?: string; wave?: number };
  delayMs?: number;
}

/** Records what would have been queued; the tests run the jobs when they choose to. */
class FakeQueues {
  jobs: RecordedJob[] = [];

  async enqueueHoldExpiry(bookingId: string, holdExpiresAt: Date) {
    this.jobs.push({ name: JOB_EXPIRE_HOLD, data: { bookingId }, delayMs: holdExpiresAt.getTime() - Date.now() });
    return true;
  }
  async enqueueCapture(bookingId: string) {
    this.jobs.push({ name: JOB_CAPTURE, data: { bookingId } });
    return true;
  }
  async enqueueRelease(bookingId: string) {
    this.jobs.push({ name: JOB_RELEASE, data: { bookingId } });
    return true;
  }
  async enqueueRingerWave(requestId: string, wave: number, delayMs = 0) {
    this.jobs.push({ name: JOB_RECRUIT_RINGERS, data: { requestId, wave }, delayMs });
    return true;
  }

  take(name: string): RecordedJob[] {
    const taken = this.jobs.filter((job) => job.name === name);
    this.jobs = this.jobs.filter((job) => job.name !== name);
    return taken;
  }
}

/** A provider whose answers the test scripts: synchronous like Tap or webhook-confirmed like Checkout.com. */
class ScriptedGateway implements PaymentGateway {
  calls: { action: 'create' | 'capture' | 'void' | 'refund'; ref?: PaymentRef; input?: CreatePaymentInput }[] = [];
  failNext: 'capture' | 'void' | 'refund' | null = null;
  private counter = 0;

  constructor(
    readonly name: 'tap' | 'checkout',
    private readonly synchronous: boolean,
  ) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    this.calls.push({ action: 'create', input });
    this.counter += 1;
    const prefix = input.flow === 'AUTHORIZE' ? 'auth' : 'chg';
    return {
      // Checkout.com only reveals the payment id in its first webhook.
      providerPaymentId: this.name === 'tap' ? `${prefix}_${this.counter}_${input.attemptId.slice(0, 8)}` : null,
      checkoutUrl: `https://pay.example.test/${input.attemptId}`,
    };
  }

  capture(ref: PaymentRef) {
    return this.act('capture', ref, `chg_capture_${ref.attemptId.slice(0, 8)}`);
  }
  void(ref: PaymentRef) {
    return this.act('void', ref, null);
  }
  refund(ref: PaymentRef) {
    return this.act('refund', ref, `re_${ref.attemptId.slice(0, 8)}`);
  }

  partialRefund(ref: PaymentRef, amountMinor: number, refundId: string) {
    return this.act('refund', { ...ref, amountMinor }, `re_${refundId.slice(0, 8)}`);
  }

  last(action: 'capture' | 'void' | 'refund'): PaymentRef {
    const call = [...this.calls].reverse().find((entry) => entry.action === action);
    assert.ok(call?.ref, `expected a ${action} call on ${this.name}`);
    return call.ref;
  }

  private async act(action: 'capture' | 'void' | 'refund', ref: PaymentRef, reference: string | null): Promise<ProviderActionResult> {
    if (this.failNext === action) {
      this.failNext = null;
      throw new Error(`${this.name} is down`);
    }
    this.calls.push({ action, ref });
    return { final: this.synchronous, reference };
  }
}

// ---------------------------------------------------------------------------
// Wiring (what the Nest container does in production)
// ---------------------------------------------------------------------------
const databaseUrl = process.env.DATABASE_URL ?? '';

const config: AppConfig = {
  nodeEnv: 'test',
  port: 0,
  databaseUrl,
  databasePoolMax: 5,
  redisUrl: 'redis://unused',
  jwtSecret: 'integration-test-secret-integration-test-secret',
  publicBaseUrl: 'https://api.example.test',
  paymentReturnUrl: 'akaz://payment-complete',
  paymentProvider: 'mock',
  holdMinutes: 15,
  runWorkers: false,
  tap: { secretKey: 'sk_test_x', apiBase: 'https://tap.example.test' },
  checkout: { secretKey: 'sk_x', webhookSecret: 'whsec_x', processingChannelId: 'pc_x', apiBase: 'https://cko.example.test' },
};

let db: DatabaseService;
let queues: FakeQueues;
let tap: ScriptedGateway;
let checkout: ScriptedGateway;
let payments: PaymentsService;
let bookings: BookingsService;
let venues: VenuesService;
let matches: MatchesService;
let ringers: RingersService;
let holdWorker: HoldExpiryWorker;
let settlementWorker: PaymentSettlementWorker;
let ringerWorker: RingerRecruitmentWorker;

const job = (name: string, data: object) => ({ name, data }) as never;

/** Runs every queued capture and release job, as the payment worker would. */
async function runPaymentJobs(): Promise<void> {
  for (const queued of [...queues.take(JOB_CAPTURE), ...queues.take(JOB_RELEASE)]) {
    await settlementWorker.process(job(queued.name, queued.data));
  }
}

/** Pretends the 15 minutes have passed. */
async function letHoldLapse(bookingId: string): Promise<void> {
  await db.query(`UPDATE bookings SET hold_expires_at = now() - interval '1 second' WHERE id = $1`, [bookingId]);
}

// Slots are placed a week ahead; each scenario uses its own day so they never collide.
function slot(dayOffset: number, hour: number, hours = 1) {
  const date = new Date(Date.now() + (7 + dayOffset) * 86_400_000).toISOString().slice(0, 10);
  const start = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+03:00`);
  return { starts_at: start.toISOString(), ends_at: new Date(start.getTime() + hours * 3_600_000).toISOString() };
}

type Booking = Awaited<ReturnType<BookingsService['getBooking']>>;

const shareOf = (booking: Booking, user: AuthUser) => {
  const share = booking.shares.find((candidate) => candidate.user_id === user.id);
  assert.ok(share, `no share for ${user.id}`);
  return share;
};

async function attemptsOf(bookingId: string) {
  return db.query<{ id: string; share_id: string; status: string; flow: string; needs_review: boolean; failure_reason: string | null; provider_payment_id: string | null; provider_capture_id: string | null }>(
    `SELECT a.id, a.share_id, a.status, a.flow, a.needs_review, a.failure_reason, a.provider_payment_id, a.provider_capture_id
       FROM payment_attempts a JOIN booking_split_shares s ON s.id = a.share_id
      WHERE s.booking_id = $1
      ORDER BY a.created_at, a.id`,
    [bookingId],
  );
}

function httpError(status: number, code: string) {
  return (error: unknown) => {
    const candidate = error as { getStatus?: () => number; getResponse?: () => { code?: string } };
    assert.equal(candidate.getStatus?.(), status, `expected HTTP ${status}, got ${String(error)}`);
    assert.equal(candidate.getResponse?.().code, code);
    return true;
  };
}

/** Pays one share through the mock provider and returns the attempt id. */
async function payWithMock(booking: Booking, payer: AuthUser, flow: 'AUTHORIZE' | 'CHARGE'): Promise<string> {
  const started = await payments.startPayment(payer, booking.id, shareOf(booking, payer).id, flow);
  const outcome = await payments.simulateMockOutcome(started.attempt_id, flow === 'AUTHORIZE' ? 'AUTHORIZED' : 'CAPTURED');
  assert.equal(outcome, 'APPLIED');
  return started.attempt_id;
}

const checkoutEvent = (id: string, type: string, attemptId: string, amount: number, currency = 'QAR') =>
  normalizeCheckoutEvent({ id, type, data: { id: `pay_${attemptId.slice(0, 8)}`, amount, currency, reference: attemptId, metadata: { attempt_id: attemptId } } });

before(async () => {
  const databaseName = (() => {
    try {
      return new URL(databaseUrl).pathname.replace(/^\//, '');
    } catch {
      return '';
    }
  })();
  assert.ok(databaseName.endsWith('_test'), `DATABASE_URL must point at a database whose name ends in "_test" (got "${databaseName}")`);

  db = new DatabaseService(config);
  queues = new FakeQueues();
  const queuesService = queues as unknown as QueuesService;
  const locks = new LockService(new FakeRedis() as never);
  tap = new ScriptedGateway('tap', true);
  checkout = new ScriptedGateway('checkout', false);
  const registry = new PaymentGatewayRegistry(config, tap as never, checkout as never, new MockGateway(config));

  payments = new PaymentsService(config, db, registry, locks, queuesService);
  bookings = new BookingsService(config, db, locks, queuesService);
  venues = new VenuesService(db);
  matches = new MatchesService(db);
  ringers = new RingersService(db, queuesService);
  holdWorker = new HoldExpiryWorker(bookings, payments);
  settlementWorker = new PaymentSettlementWorker(payments);
  ringerWorker = new RingerRecruitmentWorker(ringers);

  await db.query(
    `TRUNCATE payment_webhook_events, ringer_invites, ringer_requests, match_events, matches,
              payment_attempts, booking_split_shares, bookings CASCADE`,
  );
  const [{ users }] = await db.query<{ users: number }>(`SELECT count(*)::int AS users FROM users`);
  assert.ok(users >= 12, 'seed data missing — run the migrations including 002_seed_data.sql');
});

after(async () => {
  await db.onModuleDestroy();
});

// ---------------------------------------------------------------------------
describe('court discovery', () => {
  it('finds venues around a point, nearest first', async () => {
    const found = await venues.findNearby({ lat: 25.2854, lng: 51.531, radius_km: 25 });
    assert.deepEqual(found.map((venue) => venue.id), [AL_SADD_VENUE, LUSAIL_VENUE]);
    assert.ok(found[0].distance_m > 2_000 && found[0].distance_m < 4_500, `Al Sadd distance ${found[0].distance_m} m`);
    assert.ok(found[0].distance_m < found[1].distance_m);
    assert.equal(found[0].from_price_per_hour_minor, 25000);
    assert.equal(found[0].requires_turf_footwear, true);
    assert.deepEqual(found[1].sports, ['BADMINTON', 'FOOTBALL', 'PADEL']);
  });

  it('respects the radius and the sport filter', async () => {
    const close = await venues.findNearby({ lat: 25.2854, lng: 51.531, radius_km: 5 });
    assert.deepEqual(close.map((venue) => venue.id), [AL_SADD_VENUE]);

    const padel = await venues.findNearby({ lat: 25.2854, lng: 51.531, radius_km: 25, sport: 'PADEL' });
    assert.deepEqual(padel.map((venue) => venue.id), [LUSAIL_VENUE]);
    assert.equal(padel[0].from_price_per_hour_minor, 20000);

    assert.deepEqual(await venues.findNearby({ lat: 48.8566, lng: 2.3522, radius_km: 100 }), []);
  });

  it('lists a day of slots in the venue’s time zone, running past midnight', async () => {
    const day = slot(20, 16).starts_at.slice(0, 10);
    const availability = await venues.getCourtAvailability(PITCH_1, day);
    assert.equal(availability.timezone, 'Asia/Qatar');
    assert.equal(availability.slots.length, 9);                                   // 16:00 → 01:00
    assert.equal(availability.slots[0].starts_at.toISOString(), `${day}T13:00:00.000Z`);   // 16:00 in Doha
    assert.equal(availability.slots[8].ends_at.getTime() - availability.slots[0].starts_at.getTime(), 9 * 3_600_000);
    assert.ok(availability.slots.every((entry) => entry.available && entry.price_minor === 25000 && entry.currency === 'QAR'));
  });
});

// ---------------------------------------------------------------------------
describe('split-pay booking: everyone pays', () => {
  let booking: Booking;
  const when = slot(0, 18);

  it('holds the slot and splits the price to the last halala', async () => {
    booking = await bookings.createHold(P1, { court_id: PITCH_1, ...when, shares: [{ user_id: P1.id }, { user_id: P2.id }, { user_id: P3.id }] });
    assert.equal(booking.status, 'HOLD');
    assert.equal(booking.total_minor, 25000);
    assert.equal(booking.platform_fee_minor, 2500);                                // 10 % commission
    assert.deepEqual([P1, P2, P3].map((payer) => shareOf(booking, payer).amount_minor), [8334, 8333, 8333]);
    assert.ok(booking.shares.every((share) => share.status === 'PENDING'));

    const minutesLeft = (booking.hold_expires_at.getTime() - Date.now()) / 60_000;
    assert.ok(minutesLeft > 14 && minutesLeft <= 15, `hold lasts ${minutesLeft} minutes`);

    const [expiry] = queues.take(JOB_EXPIRE_HOLD);
    assert.equal(expiry.data.bookingId, booking.id);
    assert.ok((expiry.delayMs ?? 0) > 14 * 60_000);
  });

  it('refuses the same slot to anyone else, and shows it as taken', async () => {
    await assert.rejects(bookings.createHold(P4, { court_id: PITCH_1, ...when }), httpError(409, 'SLOT_TAKEN'));

    const availability = await venues.getCourtAvailability(PITCH_1, when.starts_at.slice(0, 10));
    const taken = availability.slots.filter((entry) => !entry.available);
    assert.equal(taken.length, 1);
    assert.equal(taken[0].starts_at.toISOString(), new Date(when.starts_at).toISOString());

    // The neighbouring slot and the neighbouring pitch are unaffected.
    const next = await bookings.createHold(P4, { court_id: PITCH_1, ...slot(0, 19) });
    const otherPitch = await bookings.createHold(P4, { court_id: PITCH_2, ...when });
    assert.equal(next.status, 'HOLD');
    assert.equal(otherPitch.total_minor, 35000);
    queues.jobs = [];
  });

  it('keeps the booking on hold until the last share is in', async () => {
    await payWithMock(booking, P1, 'AUTHORIZE');
    await payWithMock(booking, P2, 'AUTHORIZE');
    const partly = await bookings.getBooking(P1, booking.id);
    assert.equal(partly.status, 'HOLD');
    assert.deepEqual([P1, P2, P3].map((payer) => shareOf(partly, payer).status), ['PAID', 'PAID', 'PENDING']);
    assert.equal(queues.take(JOB_CAPTURE).length, 0);
  });

  it('confirms the booking when the last share is paid and then captures the card holds', async () => {
    await payWithMock(booking, P3, 'AUTHORIZE');
    const confirmed = await bookings.getBooking(P2, booking.id);
    assert.equal(confirmed.status, 'CONFIRMED');
    assert.ok(confirmed.confirmed_at instanceof Date);
    assert.ok(confirmed.shares.every((share) => share.status === 'PAID' && share.escrow_status === 'AUTHORIZED'));

    await runPaymentJobs();
    const captured = await bookings.getBooking(P1, booking.id);
    assert.ok(captured.shares.every((share) => share.escrow_status === 'CAPTURED'));
  });

  it('ignores a provider notification it has already processed', async () => {
    const [attempt] = await attemptsOf(booking.id);
    assert.equal(await payments.simulateMockOutcome(attempt.id, 'AUTHORIZED'), 'DUPLICATE');
    assert.equal((await bookings.getBooking(P1, booking.id)).status, 'CONFIRMED');
  });

  it('never expires a paid booking', async () => {
    await letHoldLapse(booking.id);
    assert.equal(await bookings.expireHold(booking.id), false);
    await holdWorker.process(job(JOB_SWEEP, {}));
    assert.equal((await bookings.getBooking(P1, booking.id)).status, 'CONFIRMED');
  });

  it('hides the booking from people who have nothing to do with it', async () => {
    await assert.rejects(bookings.getBooking(P6, booking.id), httpError(404, 'BOOKING_NOT_FOUND'));
    assert.equal((await bookings.getBooking(DOHA_MANAGER, booking.id)).id, booking.id);
    assert.equal((await bookings.getBooking(ADMIN, booking.id)).id, booking.id);
    assert.ok((await bookings.listMine(P3)).some((row) => (row as { id: string }).id === booking.id));
  });

  it('refunds everyone when the organizer cancels in time, and frees the slot', async () => {
    await assert.rejects(bookings.cancel(P2, booking.id, undefined), httpError(403, 'FORBIDDEN'));

    const cancelled = await bookings.cancel(P1, booking.id, 'Rain');
    assert.equal(cancelled.status, 'CANCELLED');
    await runPaymentJobs();

    const refunded = await bookings.getBooking(P1, booking.id);
    assert.ok(refunded.shares.every((share) => share.status === 'REFUNDED' && share.escrow_status === 'REFUNDED'));

    const rebooked = await bookings.createHold(P4, { court_id: PITCH_1, ...when });
    assert.equal(rebooked.status, 'HOLD');
    await assert.rejects(bookings.cancel(P1, booking.id, undefined), httpError(409, 'NOT_CANCELLABLE'));
    queues.jobs = [];
  });
});

// ---------------------------------------------------------------------------
describe('split-pay booking: the hold runs out', () => {
  it('releases the court and refunds whoever had already paid', async () => {
    const when = slot(1, 18);
    const booking = await bookings.createHold(P1, { court_id: PITCH_1, ...when, shares: [{ user_id: P1.id }, { user_id: P2.id }] });
    await payWithMock(booking, P1, 'CHARGE');                 // debit-style: money taken immediately
    const lateStart = await payments.startPayment(P2, booking.id, shareOf(booking, P2).id, 'CHARGE');   // P2 opens the page but dawdles

    await letHoldLapse(booking.id);
    await assert.rejects(payments.startPayment(P2, booking.id, shareOf(booking, P2).id, 'CHARGE'), httpError(409, 'HOLD_NOT_ACTIVE'));

    const [expiry] = queues.take(JOB_EXPIRE_HOLD);
    await holdWorker.process(job(JOB_EXPIRE_HOLD, expiry.data));
    await runPaymentJobs();

    const expired = await bookings.getBooking(P1, booking.id);
    assert.equal(expired.status, 'EXPIRED');
    assert.equal(shareOf(expired, P1).status, 'REFUNDED');
    assert.equal(shareOf(expired, P1).escrow_status, 'REFUNDED');
    assert.equal(shareOf(expired, P2).status, 'CANCELLED');

    // P2's payment completes a moment after the deadline: it must come straight back.
    assert.equal(await payments.simulateMockOutcome(lateStart.attempt_id, 'CAPTURED'), 'APPLIED');
    await runPaymentJobs();
    const attempts = await attemptsOf(booking.id);
    assert.deepEqual(attempts.map((attempt) => attempt.status).sort(), ['REFUNDED', 'REFUNDED']);
    assert.equal(shareOf(await bookings.getBooking(P1, booking.id), P2).status, 'CANCELLED');

    // The court is bookable again.
    assert.equal((await bookings.createHold(P3, { court_id: PITCH_1, ...when })).status, 'HOLD');
    queues.jobs = [];
  });

  it('frees a lapsed slot for the next customer even before the worker has run', async () => {
    const when = slot(1, 20);
    const stale = await bookings.createHold(P1, { court_id: PITCH_1, ...when });
    const paidLate = await payments.startPayment(P1, stale.id, stale.shares[0].id, 'AUTHORIZE');
    await letHoldLapse(stale.id);
    queues.jobs = [];

    const fresh = await bookings.createHold(P2, { court_id: PITCH_1, ...when });
    assert.equal(fresh.status, 'HOLD');
    assert.equal((await bookings.getBooking(P1, stale.id)).status, 'EXPIRED');
    assert.deepEqual(queues.take(JOB_RELEASE).map((queued) => queued.data.bookingId), [stale.id]);

    // The card hold that lands on the dead booking is voided, not kept.
    await payments.simulateMockOutcome(paidLate.attempt_id, 'AUTHORIZED');
    await runPaymentJobs();
    assert.deepEqual((await attemptsOf(stale.id)).map((attempt) => attempt.status), ['VOIDED']);
    queues.jobs = [];
  });

  it('sweeps up holds whose expiry job was lost', async () => {
    const booking = await bookings.createHold(P1, { court_id: PITCH_1, ...slot(1, 22) });
    queues.jobs = [];                                         // the delayed job never fires
    await letHoldLapse(booking.id);
    await holdWorker.process(job(JOB_SWEEP, {}));
    assert.equal((await bookings.getBooking(P1, booking.id)).status, 'EXPIRED');
    queues.jobs = [];
  });
});

// ---------------------------------------------------------------------------
describe('split-pay booking: awkward payments', () => {
  it('gives back the second payment when a share is paid twice', async () => {
    const booking = await bookings.createHold(P1, { court_id: PITCH_1, ...slot(2, 18), shares: [{ user_id: P1.id }, { user_id: P2.id }] });
    const share = shareOf(booking, P1);
    const first = await payments.startPayment(P1, booking.id, share.id, 'CHARGE');
    const second = await payments.startPayment(P1, booking.id, share.id, 'CHARGE');       // a second browser tab
    await payments.simulateMockOutcome(first.attempt_id, 'CAPTURED');
    await payments.simulateMockOutcome(second.attempt_id, 'CAPTURED');
    await runPaymentJobs();

    const attempts = await attemptsOf(booking.id);
    assert.equal(attempts.find((attempt) => attempt.id === first.attempt_id)?.status, 'CAPTURED');
    assert.equal(attempts.find((attempt) => attempt.id === second.attempt_id)?.status, 'REFUNDED');
    const after = await bookings.getBooking(P1, booking.id);
    assert.equal(shareOf(after, P1).status, 'PAID');
    assert.equal(after.status, 'HOLD');                        // P2 has not paid yet
    await assert.rejects(payments.startPayment(P1, booking.id, share.id, 'CHARGE'), httpError(409, 'SHARE_ALREADY_PAID'));
    queues.jobs = [];
  });

  it('does not accept a notification for the wrong amount', async () => {
    const booking = await bookings.createHold(P1, { court_id: PITCH_1, ...slot(2, 19) });
    config.paymentProvider = 'checkout';
    const started = await payments.startPayment(P1, booking.id, booking.shares[0].id, 'CHARGE');
    config.paymentProvider = 'mock';

    assert.equal(await payments.applyProviderEvent(checkoutEvent('evt_mismatch', 'payment_captured', started.attempt_id, 100)), 'APPLIED');
    const [attempt] = await attemptsOf(booking.id);
    assert.equal(attempt.needs_review, true);
    assert.equal(attempt.failure_reason, 'AMOUNT_MISMATCH');
    const after = await bookings.getBooking(P1, booking.id);
    assert.equal(after.status, 'HOLD');
    assert.equal(after.shares[0].status, 'PENDING');
    assert.equal(queues.jobs.filter((queued) => queued.name !== JOB_EXPIRE_HOLD).length, 0);   // nothing automated touches it
    queues.jobs = [];
  });

  it('lets a payer retry after a declined payment, up to a limit', async () => {
    const booking = await bookings.createHold(P1, { court_id: PITCH_1, ...slot(2, 20) });
    const share = booking.shares[0];
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const started = await payments.startPayment(P1, booking.id, share.id, 'CHARGE');
      assert.equal(await payments.simulateMockOutcome(started.attempt_id, 'FAILED'), 'APPLIED');
    }
    assert.equal((await bookings.getBooking(P1, booking.id)).shares[0].status, 'PENDING');
    const fifth = await payments.startPayment(P1, booking.id, share.id, 'CHARGE');
    await assert.rejects(payments.startPayment(P1, booking.id, share.id, 'CHARGE'), httpError(429, 'TOO_MANY_ATTEMPTS'));
    await payments.simulateMockOutcome(fifth.attempt_id, 'CAPTURED');
    assert.equal((await bookings.getBooking(P1, booking.id)).status, 'CONFIRMED');
    queues.jobs = [];
  });

  it('only lets the payer, the organizer or an admin pay a share', async () => {
    const booking = await bookings.createHold(P1, { court_id: PITCH_1, ...slot(2, 21), shares: [{ user_id: P1.id }, { user_id: P2.id }] });
    await assert.rejects(payments.startPayment(P3, booking.id, shareOf(booking, P2).id, 'CHARGE'), httpError(403, 'FORBIDDEN'));
    await assert.rejects(payments.startPayment(P2, booking.id, shareOf(booking, P1).id, 'CHARGE'), httpError(403, 'FORBIDDEN'));
    assert.ok((await payments.startPayment(P1, booking.id, shareOf(booking, P2).id, 'CHARGE')).checkout_url);   // organizer covers a friend
    await assert.rejects(payments.startPayment(P1, booking.id, uid(999), 'CHARGE'), httpError(404, 'SHARE_NOT_FOUND'));
    queues.jobs = [];
  });
});

// ---------------------------------------------------------------------------
describe('provider with webhook-confirmed actions (Checkout.com style)', () => {
  it('follows authorize → capture → refund through notifications', async () => {
    const booking = await bookings.createHold(P1, { court_id: LUSAIL_PITCH, ...slot(3, 18) });
    config.paymentProvider = 'checkout';
    const started = await payments.startPayment(P1, booking.id, booking.shares[0].id, 'AUTHORIZE');
    config.paymentProvider = 'mock';
    const attemptId = started.attempt_id;
    assert.equal((await attemptsOf(booking.id))[0].provider_payment_id, null);     // not known yet

    assert.equal(await payments.applyProviderEvent(checkoutEvent('evt_1', 'payment_approved', attemptId, 38000)), 'APPLIED');
    assert.equal((await bookings.getBooking(P1, booking.id)).status, 'CONFIRMED');
    assert.equal((await attemptsOf(booking.id))[0].provider_payment_id, `pay_${attemptId.slice(0, 8)}`);

    await runPaymentJobs();                                   // capture is requested…
    assert.equal(checkout.last('capture').providerPaymentId, `pay_${attemptId.slice(0, 8)}`);
    assert.equal((await attemptsOf(booking.id))[0].status, 'CAPTURE_PENDING');
    assert.equal(await payments.applyProviderEvent(checkoutEvent('evt_2', 'payment_captured', attemptId, 38000)), 'APPLIED');
    assert.equal((await attemptsOf(booking.id))[0].status, 'CAPTURED');            // …and confirmed by webhook

    // Redelivery and out-of-order delivery change nothing.
    assert.equal(await payments.applyProviderEvent(checkoutEvent('evt_2', 'payment_captured', attemptId, 38000)), 'DUPLICATE');
    assert.equal(await payments.applyProviderEvent(checkoutEvent('evt_late', 'payment_approved', attemptId, 38000)), 'STALE');

    await bookings.cancel(ADMIN, booking.id, 'Pitch maintenance');
    await runPaymentJobs();
    assert.equal(checkout.last('refund').amountMinor, 38000);
    assert.equal((await attemptsOf(booking.id))[0].status, 'REFUND_PENDING');
    assert.equal((await bookings.getBooking(P1, booking.id)).shares[0].status, 'PAID');   // not refunded until the provider says so

    assert.equal(await payments.applyProviderEvent(checkoutEvent('evt_3', 'payment_refunded', attemptId, 38000)), 'APPLIED');
    const done = await bookings.getBooking(P1, booking.id);
    assert.equal(done.shares[0].status, 'REFUNDED');
    assert.equal(done.shares[0].escrow_status, 'REFUNDED');
    queues.jobs = [];
  });

  it('stores notifications it cannot match without failing', async () => {
    assert.equal(await payments.applyProviderEvent(checkoutEvent('evt_unknown', 'payment_approved', uid(424242), 100)), 'UNMATCHED');
    assert.equal(await payments.applyProviderEvent(checkoutEvent('evt_dispute', 'dispute_received', uid(424242), 100)), 'IGNORED');
    const stored = await db.query<{ outcome: string }>(`SELECT outcome FROM payment_webhook_events WHERE event_key IN ('evt_unknown', 'evt_dispute') ORDER BY event_key`);
    assert.deepEqual(stored.map((row) => row.outcome), ['IGNORED', 'UNMATCHED']);
  });

  it('stops automating a payment when the provider rejects a refund', async () => {
    const booking = await bookings.createHold(P1, { court_id: LUSAIL_PITCH, ...slot(3, 19) });
    config.paymentProvider = 'checkout';
    const started = await payments.startPayment(P1, booking.id, booking.shares[0].id, 'CHARGE');
    config.paymentProvider = 'mock';
    await payments.applyProviderEvent(checkoutEvent('evt_r1', 'payment_captured', started.attempt_id, 38000));
    await bookings.cancel(P1, booking.id, undefined);
    await runPaymentJobs();
    await payments.applyProviderEvent(checkoutEvent('evt_r2', 'payment_refund_declined', started.attempt_id, 38000));

    const [attempt] = await attemptsOf(booking.id);
    assert.equal(attempt.status, 'CAPTURED');
    assert.equal(attempt.needs_review, true);
    await payments.releaseBooking(booking.id);                // a retry leaves it alone
    assert.equal((await attemptsOf(booking.id))[0].status, 'CAPTURED');
    queues.jobs = [];
  });
});

// ---------------------------------------------------------------------------
describe('provider with immediate answers (Tap style)', () => {
  it('refunds a captured authorization against the capture charge', async () => {
    const booking = await bookings.createHold(P1, { court_id: LUSAIL_PITCH, ...slot(4, 18) });
    config.paymentProvider = 'tap';
    const started = await payments.startPayment(P1, booking.id, booking.shares[0].id, 'AUTHORIZE');
    config.paymentProvider = 'mock';
    const [created] = await attemptsOf(booking.id);
    assert.match(created.provider_payment_id ?? '', /^auth_/);

    const authorized = normalizeTapEvent({
      id: created.provider_payment_id, object: 'authorize', status: 'AUTHORIZED', amount: 380, currency: 'QAR',
      transaction: { created: '1' }, customer: { id: 'cus_42' }, metadata: { attempt_id: started.attempt_id },
    });
    assert.equal(await payments.applyProviderEvent(authorized), 'APPLIED');
    await runPaymentJobs();
    assert.equal(tap.last('capture').providerCustomerId, 'cus_42');

    const [captured] = await attemptsOf(booking.id);
    assert.equal(captured.status, 'CAPTURED');
    assert.match(captured.provider_capture_id ?? '', /^chg_capture_/);

    await bookings.cancel(P1, booking.id, undefined);
    await runPaymentJobs();
    assert.equal(tap.last('refund').providerCaptureId, captured.provider_capture_id);
    assert.equal((await bookings.getBooking(P1, booking.id)).shares[0].status, 'REFUNDED');
    queues.jobs = [];
  });

  it('retries a refund after a provider outage without losing track of the money', async () => {
    const booking = await bookings.createHold(P1, { court_id: LUSAIL_PITCH, ...slot(4, 19) });
    config.paymentProvider = 'tap';
    const started = await payments.startPayment(P1, booking.id, booking.shares[0].id, 'CHARGE');
    config.paymentProvider = 'mock';
    const [created] = await attemptsOf(booking.id);
    await payments.applyProviderEvent(normalizeTapEvent({
      id: created.provider_payment_id, object: 'charge', status: 'CAPTURED', amount: 380.0, currency: 'QAR',
      transaction: { created: '2' }, metadata: { attempt_id: started.attempt_id },
    }));
    await bookings.cancel(P1, booking.id, undefined);

    tap.failNext = 'refund';
    const [release] = queues.take(JOB_RELEASE);
    await assert.rejects(settlementWorker.process(job(JOB_RELEASE, release.data)), /Release failed/);   // BullMQ would retry
    const [failed] = await attemptsOf(booking.id);
    assert.equal(failed.status, 'CAPTURED');
    assert.match(failed.failure_reason ?? '', /tap is down/);

    await settlementWorker.process(job(JOB_RELEASE, release.data));
    assert.equal((await attemptsOf(booking.id))[0].status, 'REFUNDED');
    assert.equal((await bookings.getBooking(P1, booking.id)).shares[0].status, 'REFUNDED');
    queues.jobs = [];
  });
});

// ---------------------------------------------------------------------------
describe('booking rules', () => {
  it('rejects slots outside opening hours, off the grid, too long or in the past', async () => {
    await assert.rejects(bookings.createHold(P1, { court_id: PITCH_1, ...slot(5, 10) }), httpError(422, 'OUTSIDE_OPENING_HOURS'));
    await assert.rejects(bookings.createHold(P1, { court_id: PITCH_1, ...slot(5, 23, 3) }), httpError(422, 'OUTSIDE_OPENING_HOURS'));

    const half = slot(5, 18);
    const offGrid = { starts_at: new Date(new Date(half.starts_at).getTime() + 30 * 60_000).toISOString(), ends_at: new Date(new Date(half.ends_at).getTime() + 30 * 60_000).toISOString() };
    await assert.rejects(bookings.createHold(P1, { court_id: PITCH_1, ...offGrid }), httpError(422, 'MISALIGNED_SLOT'));

    await assert.rejects(bookings.createHold(P1, { court_id: PITCH_1, ...slot(5, 16, 5) }), httpError(400, 'BOOKING_TOO_LONG'));
    await assert.rejects(bookings.createHold(P1, { court_id: PITCH_1, ...slot(-8, 18) }), httpError(400, 'SLOT_IN_PAST'));
    await assert.rejects(bookings.createHold(P1, { court_id: uid(31337), ...slot(5, 18) }), httpError(404, 'COURT_NOT_FOUND'));
  });

  it('accepts a slot that crosses midnight and prices several hours', async () => {
    const late = await bookings.createHold(P1, { court_id: PITCH_1, ...slot(5, 23, 2) });      // 23:00 → 01:00
    assert.equal(late.total_minor, 50000);
    queues.jobs = [];
  });

  it('rejects bad splits and unknown payers', async () => {
    const when = slot(5, 20);
    await assert.rejects(
      bookings.createHold(P1, { court_id: PITCH_1, ...when, shares: [{ user_id: P1.id, amount_minor: 20000 }, { user_id: P2.id, amount_minor: 4000 }] }),
      httpError(422, 'SHARES_DO_NOT_ADD_UP'),
    );
    await assert.rejects(
      bookings.createHold(P1, { court_id: PITCH_1, ...when, shares: [{ user_id: P1.id }, { user_id: P1.id }] }),
      httpError(422, 'DUPLICATE_PAYER'),
    );
    await assert.rejects(
      bookings.createHold(P1, { court_id: PITCH_1, ...when, shares: [{ user_id: P1.id }, { user_id: uid(777) }] }),
      httpError(422, 'UNKNOWN_PAYER'),
    );
    // None of the failed attempts left a hold behind.
    const custom = await bookings.createHold(P1, { court_id: PITCH_1, ...when, shares: [{ user_id: P1.id, amount_minor: 20000 }, { user_id: P2.id, amount_minor: 5000 }] });
    assert.deepEqual([shareOf(custom, P1).amount_minor, shareOf(custom, P2).amount_minor], [20000, 5000]);
    queues.jobs = [];
  });

  it('splits a three-decimal currency without losing a fils', async () => {
    const start = new Date(`${slot(5, 18).starts_at.slice(0, 10)}T18:00:00+03:00`);            // Bahrain is UTC+3 too
    const booking = await bookings.createHold(P1, {
      court_id: JUFFAIR_PITCH, starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 3_600_000).toISOString(),
      shares: [P1, P2, P3, P4, P5, P6, PARENT].map((payer) => ({ user_id: payer.id })),
    });
    assert.equal(booking.currency, 'BHD');
    assert.equal(booking.total_minor, 30000);                                                   // BHD 30.000
    assert.deepEqual(booking.shares.map((share) => share.amount_minor).sort((a, b) => b - a), [4286, 4286, 4286, 4286, 4286, 4285, 4285]);
    assert.equal(booking.shares.reduce((total, share) => total + share.amount_minor, 0), 30000);
    queues.jobs = [];
  });

  it('lets exactly one of several simultaneous requests win a slot', async () => {
    const when = slot(6, 18);
    const results = await Promise.allSettled([P1, P2, P3, P4].map((player) => bookings.createHold(player, { court_id: PITCH_2, ...when })));
    const won = results.filter((result) => result.status === 'fulfilled');
    const lost = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    assert.equal(won.length, 1);
    assert.equal(lost.length, 3);
    for (const failure of lost) httpError(409, 'SLOT_TAKEN')(failure.reason);
    const [{ live }] = await db.query<{ live: number }>(
      `SELECT count(*)::int AS live FROM bookings WHERE court_id = $1 AND status = 'HOLD' AND lower(slot_range) = $2::timestamptz`,
      [PITCH_2, when.starts_at],
    );
    assert.equal(live, 1);
    queues.jobs = [];
  });

  it('closes free cancellation at the venue’s cut-off, except for the venue and admins', async () => {
    const booking = await bookings.createHold(P1, { court_id: LUSAIL_PITCH, ...slot(6, 20) });
    await payWithMock(booking, P1, 'CHARGE');
    await db.query(`UPDATE venues SET free_cancellation_hours = 1000 WHERE id = $1`, [LUSAIL_VENUE]);
    try {
      await assert.rejects(bookings.cancel(P1, booking.id, undefined), httpError(409, 'CANCELLATION_WINDOW_CLOSED'));
      assert.equal((await bookings.cancel(DOHA_MANAGER, booking.id, 'Venue closed')).status, 'CANCELLED');
    } finally {
      await db.query(`UPDATE venues SET free_cancellation_hours = 24 WHERE id = $1`, [LUSAIL_VENUE]);
    }
    await runPaymentJobs();
    assert.equal((await bookings.getBooking(P1, booking.id)).shares[0].status, 'REFUNDED');
    queues.jobs = [];
  });
});

// ---------------------------------------------------------------------------
describe('referee console sync', () => {
  const eid = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
  const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();
  let matchId: string;

  it('creates a match with the calling referee assigned', async () => {
    const match = await matches.create(REFEREE, { court_id: PITCH_1, home_team_name: ' Al Sadd Stars ', away_team_name: 'Lusail Lions', scheduled_start: slot(0, 18).starts_at });
    matchId = match.id;
    assert.equal(match.referee_user_id, REFEREE.id);
    assert.equal(match.home_team_name, 'Al Sadd Stars');
    assert.equal(match.status, 'SCHEDULED');
    await assert.rejects(
      matches.create(ADMIN, { court_id: PITCH_1, home_team_name: 'A', away_team_name: 'B', scheduled_start: slot(0, 18).starts_at, referee_user_id: P1.id }),
      httpError(422, 'NOT_A_REFEREE'),
    );
  });

  it('stores an offline batch, keeps score and starts the sin-bin clock from the card', async () => {
    const result = await matches.syncEvents(REFEREE, matchId, {
      device_id: 'ref-phone-1',
      events: [
        { id: eid(1), type: 'MATCH_START', match_clock_seconds: 0, occurred_at: ago(600) },
        { id: eid(2), type: 'GOAL', team_side: 'HOME', player_user_id: P1.id, shirt_number: 9, match_clock_seconds: 180, occurred_at: ago(420) },
        { id: eid(3), type: 'OWN_GOAL', team_side: 'HOME', match_clock_seconds: 300, occurred_at: ago(300) },
        { id: eid(4), type: 'WHITE_CARD', team_side: 'AWAY', player_name: 'No. 4', shirt_number: 4, match_clock_seconds: 570, occurred_at: ago(30) },
        { id: eid(5), type: 'WHITE_CARD', team_side: 'HOME', shirt_number: 7, match_clock_seconds: 200, occurred_at: ago(400) },
      ],
    });
    assert.deepEqual(result.accepted, [eid(1), eid(2), eid(3), eid(4), eid(5)]);
    assert.deepEqual(result.rejected, []);
    assert.equal(result.match.status, 'LIVE');
    assert.deepEqual([result.match.home_score, result.match.away_score], [1, 1]);

    // The card from 30 seconds ago has about 90 seconds left; the one from 400 seconds ago is over.
    assert.equal(result.active_sin_bins.length, 1);
    const [sinBin] = result.active_sin_bins;
    assert.equal(sinBin.event_id, eid(4));
    assert.equal(sinBin.sin_bin_release_at.getTime() - sinBin.occurred_at.getTime(), 120_000);
    assert.ok(sinBin.seconds_remaining >= 85 && sinBin.seconds_remaining <= 90, `remaining ${sinBin.seconds_remaining}s`);
  });

  it('changes nothing when the same batch is sent again', async () => {
    const again = await matches.syncEvents(REFEREE, matchId.toUpperCase(), {
      events: [
        { id: eid(2), type: 'GOAL', team_side: 'HOME', match_clock_seconds: 180, occurred_at: ago(420) },
        { id: eid(4).toUpperCase(), type: 'WHITE_CARD', team_side: 'AWAY', match_clock_seconds: 570, occurred_at: ago(30) },
      ],
    });
    assert.deepEqual(again.accepted, []);
    assert.deepEqual(again.duplicates, [eid(2), eid(4)]);
    assert.deepEqual([again.match.home_score, again.match.away_score], [1, 1]);
    assert.equal((await matches.get(matchId)).events.length, 5);
  });

  it('stores the good events of a batch and reports the bad ones', async () => {
    const mixed = await matches.syncEvents(REFEREE, matchId, {
      events: [
        { id: eid(10), type: 'GOAL', team_side: 'AWAY', match_clock_seconds: 620, occurred_at: ago(20) },
        { id: eid(11), type: 'YELLOW_CARD', match_clock_seconds: 630, occurred_at: ago(15) },                                   // no team
        { id: eid(12), type: 'GOAL', team_side: 'AWAY', match_clock_seconds: 640, occurred_at: new Date(Date.now() + 3_600_000).toISOString() },
        { id: eid(13), type: 'GOAL', team_side: 'AWAY', player_user_id: uid(555), match_clock_seconds: 650, occurred_at: ago(10) },
        { id: eid(10), type: 'GOAL', team_side: 'AWAY', match_clock_seconds: 620, occurred_at: ago(20) },                       // repeated inside the batch
        { id: eid(14), type: 'MATCH_END', match_clock_seconds: 700, occurred_at: ago(1) },
      ],
    });
    assert.deepEqual(mixed.accepted, [eid(10), eid(14)]);
    assert.deepEqual(mixed.duplicates, [eid(10)]);
    assert.deepEqual(mixed.rejected, [
      { id: eid(11), reason: 'TEAM_SIDE_REQUIRED' },
      { id: eid(12), reason: 'OCCURRED_IN_FUTURE' },
      { id: eid(13), reason: 'UNKNOWN_PLAYER' },
    ]);
    assert.equal(mixed.match.status, 'FINISHED');
    assert.deepEqual([mixed.match.home_score, mixed.match.away_score], [1, 2]);
    assert.ok(mixed.match.ended_at instanceof Date);
  });

  it('only accepts events from the match referee or an admin', async () => {
    const one = { events: [{ id: eid(20), type: 'GOAL' as const, team_side: 'HOME' as const, match_clock_seconds: 1, occurred_at: ago(5) }] };
    await assert.rejects(matches.syncEvents({ id: P1.id, roles: ['REFEREE'] }, matchId, one), httpError(403, 'NOT_MATCH_REFEREE'));
    await assert.rejects(matches.syncEvents(REFEREE, uid(404), one), httpError(404, 'MATCH_NOT_FOUND'));
    assert.deepEqual((await matches.syncEvents(ADMIN, matchId, one)).accepted, [eid(20)]);
  });

  it('refuses an event id that belongs to another match', async () => {
    const other = await matches.create(REFEREE, { court_id: PITCH_2, home_team_name: 'C', away_team_name: 'D', scheduled_start: slot(0, 20).starts_at });
    const clash = await matches.syncEvents(REFEREE, other.id, {
      events: [{ id: eid(2), type: 'GOAL', team_side: 'AWAY', match_clock_seconds: 5, occurred_at: ago(5) }],
    });
    assert.deepEqual(clash.rejected, [{ id: eid(2), reason: 'ID_IN_USE' }]);
    assert.deepEqual([clash.match.home_score, clash.match.away_score], [0, 0]);
    assert.equal((await matches.getSinBins(matchId)).active_sin_bins.length, 1);
  });
});

// ---------------------------------------------------------------------------
describe('ringer recruitment', () => {
  let bookingId: string;
  let requestId: string;
  const invitedUsers = async () =>
    (await db.query<{ user_id: string }>(`SELECT user_id FROM ringer_invites WHERE request_id = $1 ORDER BY wave, user_id`, [requestId])).map((row) => row.user_id);
  const inviteOf = async (user: AuthUser) =>
    (await db.query<{ id: string; status: string }>(`SELECT id, status FROM ringer_invites WHERE request_id = $1 AND user_id = $2`, [requestId, user.id]))[0];

  it('opens a request for the organizer only', async () => {
    const booking = await bookings.createHold(PARENT, { court_id: PITCH_1, ...slot(7, 18) });       // organizer ELO 1200
    bookingId = booking.id;
    queues.jobs = [];
    await assert.rejects(ringers.createRequest(P1, bookingId, 2), httpError(403, 'FORBIDDEN'));

    const request = await ringers.createRequest(PARENT, bookingId, 2);
    requestId = request.id;
    assert.equal(request.status, 'OPEN');
    assert.deepEqual(queues.jobs.map((queued) => [queued.name, queued.data.wave]), [[JOB_RECRUIT_RINGERS, 0]]);
    await assert.rejects(ringers.createRequest(PARENT, bookingId, 1), httpError(409, 'REQUEST_EXISTS'));
  });

  it('invites close, similar-level, reliable players first and widens wave by wave', async () => {
    const [first] = queues.take(JOB_RECRUIT_RINGERS);
    await ringerWorker.process(job(JOB_RECRUIT_RINGERS, first.data));
    // Within 5 km and 100 ELO of 1200: players Two (1280) and Three (1190).
    // Not One (1340, too strong for now), Four (6.7 km away), Five (reliability 62), Six (in Riyadh).
    assert.deepEqual(await invitedUsers(), [P2.id, P3.id]);

    const [second] = queues.take(JOB_RECRUIT_RINGERS);
    assert.equal(second.data.wave, 1);
    assert.equal(second.delayMs, 5 * 60_000);
    await ringerWorker.process(job(JOB_RECRUIT_RINGERS, second.data));
    assert.deepEqual(await invitedUsers(), [P2.id, P3.id, P1.id]);               // 10 km / 200 ELO lets player One in

    // A retried job for a wave that already ran invites nobody twice.
    await ringerWorker.process(job(JOB_RECRUIT_RINGERS, second.data));
    assert.equal((await invitedUsers()).length, 3);
    assert.ok(!(await invitedUsers()).includes(P5.id));
  });

  it('gives the places to the first players who accept and closes the rest', async () => {
    assert.equal((await ringers.listMyInvites(P3)).length, 1);
    await assert.rejects(ringers.respond(P4, (await inviteOf(P3)).id, true), httpError(404, 'INVITE_NOT_FOUND'));

    assert.equal((await ringers.respond(P3, (await inviteOf(P3)).id, true)).status, 'ACCEPTED');
    assert.equal((await ringers.respond(P2, (await inviteOf(P2)).id, true)).status, 'ACCEPTED');

    const [request] = await db.query<{ status: string; slots_filled: number }>(`SELECT status, slots_filled FROM ringer_requests WHERE id = $1`, [requestId]);
    assert.deepEqual(request, { status: 'FILLED', slots_filled: 2 });
    assert.equal((await inviteOf(P1)).status, 'EXPIRED');
    await assert.rejects(ringers.respond(P1, (await inviteOf(P1)).id, true), httpError(409, 'INVITE_CLOSED'));
    await assert.rejects(ringers.respond(P3, (await inviteOf(P3)).id, false), httpError(409, 'INVITE_CLOSED'));
  });

  it('stops recruiting once the request is filled', async () => {
    queues.jobs = [];
    assert.deepEqual(await ringers.runWave(requestId, 2), { invited: 0, state: 'CLOSED' });
    assert.equal(queues.jobs.length, 0);
    assert.equal((await invitedUsers()).length, 3);
  });

  it('closes an open request when its booking is cancelled', async () => {
    const booking = await bookings.createHold(PARENT, { court_id: PITCH_1, ...slot(7, 20) });
    const request = await ringers.createRequest(PARENT, booking.id, 1);
    await bookings.cancel(PARENT, booking.id, undefined);
    const [row] = await db.query<{ status: string }>(`SELECT status FROM ringer_requests WHERE id = $1`, [request.id]);
    assert.equal(row.status, 'CANCELLED');
    assert.deepEqual(await ringers.runWave(request.id, 0), { invited: 0, state: 'CLOSED' });
    queues.jobs = [];
  });
});

// ---------------------------------------------------------------------------
describe('housekeeping sweep', () => {
  it('re-queues lost payment work, flags stuck provider actions and completes finished bookings', async () => {
    // A confirmed booking whose capture job was lost.
    const lostCapture = await bookings.createHold(P1, { court_id: PITCH_2, ...slot(8, 18) });
    await payWithMock(lostCapture, P1, 'AUTHORIZE');
    // An expired booking whose release job was lost.
    const lostRelease = await bookings.createHold(P1, { court_id: PITCH_2, ...slot(8, 19), shares: [{ user_id: P1.id }, { user_id: P2.id }] });
    await payWithMock(lostRelease, P1, 'CHARGE');
    await letHoldLapse(lostRelease.id);
    await bookings.expireHold(lostRelease.id);
    // A refund the provider never confirmed.
    const stuck = await bookings.createHold(P1, { court_id: PITCH_2, ...slot(8, 20) });
    const stuckAttempt = await payWithMock(stuck, P1, 'CHARGE');
    // A confirmed booking whose slot is over.
    const played = await bookings.createHold(P1, { court_id: PITCH_2, ...slot(8, 21) });
    await payWithMock(played, P1, 'CHARGE');
    queues.jobs = [];

    // Age the rows: the sweep leaves fresh work to the normal jobs.
    await db.query(`ALTER TABLE payment_attempts DISABLE TRIGGER payment_attempts_set_updated_at`);
    try {
      await db.query(`UPDATE payment_attempts SET status = 'REFUND_PENDING' WHERE id = $1`, [stuckAttempt]);
      await db.query(`UPDATE payment_attempts SET updated_at = now() - interval '2 hours'`);
    } finally {
      await db.query(`ALTER TABLE payment_attempts ENABLE TRIGGER payment_attempts_set_updated_at`);
    }
    await db.query(`UPDATE bookings SET slot_range = tstzrange(now() - interval '2 hours', now() - interval '1 hour', '[)') WHERE id = $1`, [played.id]);

    await holdWorker.process(job(JOB_SWEEP, {}));

    assert.ok(queues.jobs.some((queued) => queued.name === JOB_CAPTURE && queued.data.bookingId === lostCapture.id));
    assert.ok(queues.jobs.some((queued) => queued.name === JOB_RELEASE && queued.data.bookingId === lostRelease.id));
    assert.ok(!queues.jobs.some((queued) => queued.data.bookingId === stuck.id));
    const [flagged] = await attemptsOf(stuck.id);
    assert.equal(flagged.needs_review, true);
    assert.equal(flagged.failure_reason, 'PROVIDER_CONFIRMATION_OVERDUE');
    assert.equal((await bookings.getBooking(P1, played.id)).status, 'COMPLETED');

    await runPaymentJobs();
    assert.equal((await attemptsOf(lostCapture.id))[0].status, 'CAPTURED');
    assert.equal((await attemptsOf(lostRelease.id))[0].status, 'REFUNDED');
  });

  it('leaves no live booking overlapping another on the same court', async () => {
    const overlaps = await db.query(
      `SELECT a.id FROM bookings a JOIN bookings b
          ON a.court_id = b.court_id AND a.id < b.id AND a.slot_range && b.slot_range
       WHERE a.status IN ('HOLD', 'CONFIRMED', 'COMPLETED') AND b.status IN ('HOLD', 'CONFIRMED', 'COMPLETED')`,
    );
    assert.equal(overlaps.length, 0);
  });

  it('accounts for every payment: nothing captured is left on a dead booking', async () => {
    const stranded = await db.query(
      `SELECT a.id FROM payment_attempts a
         JOIN booking_split_shares s ON s.id = a.share_id
         JOIN bookings b ON b.id = s.booking_id
        WHERE a.status IN ('AUTHORIZED', 'CAPTURED', 'CAPTURE_PENDING')
          AND a.needs_review = false
          AND (b.status IN ('EXPIRED', 'CANCELLED') OR s.paid_attempt_id IS DISTINCT FROM a.id)`,
    );
    assert.equal(stranded.length, 0);
  });
});
