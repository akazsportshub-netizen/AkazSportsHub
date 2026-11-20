import { CurrencyCode } from '../common/money';
import { Queryable } from '../database/database.service';
import { Locale, toLocale } from './templates';

export interface BookingContext {
  court: string;
  venue: string;
  sport: string;
  startsAt: Date;
  timezone: string;
  totalMinor: number;
  currency: CurrencyCode;
  organizerId: string;
}

/** What a message needs to say about a booking: where, when (in the venue's time zone) and how much. */
export async function bookingContext(q: Queryable, bookingId: string): Promise<BookingContext | null> {
  const [row] = await q.query<{
    court: string;
    venue: string;
    sport: string;
    timezone: string;
    starts_at: Date;
    total_minor: number;
    currency: CurrencyCode;
    organizer_id: string;
  }>(
    /* sql */ `
    SELECT c.name AS court, v.name AS venue, c.sport, v.timezone, lower(b.slot_range) AS starts_at,
           b.total_minor, b.currency, b.organizer_user_id AS organizer_id
      FROM bookings b
      JOIN courts c ON c.id = b.court_id
      JOIN venues v ON v.id = c.venue_id
     WHERE b.id = $1`,
    [bookingId],
  );
  if (!row) return null;
  return {
    court: row.court,
    venue: row.venue,
    sport: row.sport,
    startsAt: row.starts_at,
    timezone: row.timezone,
    totalMinor: row.total_minor,
    currency: row.currency,
    organizerId: row.organizer_id,
  };
}

export async function phonesOf(q: Queryable, userIds: readonly string[]): Promise<Map<string, { phone: string; name: string; locale: Locale }>> {
  if (userIds.length === 0) return new Map();
  const rows = await q.query<{ id: string; phone_e164: string; full_name: string; locale: string }>(
    /* sql */ `SELECT id, phone_e164, full_name, locale FROM users WHERE id = ANY($1::uuid[])`,
    [userIds],
  );
  return new Map(rows.map((row) => [row.id, { phone: row.phone_e164, name: row.full_name, locale: toLocale(row.locale) }]));
}
