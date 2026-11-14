import { Injectable, NotFoundException } from '@nestjs/common';
import { apiError } from '../common/api-error';
import { DatabaseService } from '../database/database.service';
import { NearbyVenuesQueryDto } from './dto/venue-queries.dto';

export interface NearbyVenue {
  id: string;
  name: string;
  description: string | null;
  city: string;
  country_code: string;
  address: string | null;
  currency: string;
  timezone: string;
  requires_turf_footwear: boolean;
  rules: Record<string, unknown>;
  lat: number;
  lng: number;
  distance_m: number;
  from_price_per_hour_minor: number | null;
  sports: string[] | null;
}

export interface CourtSummary {
  id: string;
  name: string;
  sport: string;
  surface: string | null;
  capacity_players: number;
  price_per_hour_minor: number;
  slot_minutes: number;
  opens_at: string;
  closes_at: string;
}

export interface AvailabilitySlot {
  starts_at: Date;
  ends_at: Date;
  price_minor: number;
  currency: string;
  available: boolean;
}

@Injectable()
export class VenuesService {
  constructor(private readonly db: DatabaseService) {}

  /** Venues within the radius, nearest first. Uses the GiST index on venues.location. */
  findNearby(query: NearbyVenuesQueryDto): Promise<NearbyVenue[]> {
    const radiusMetres = (query.radius_km ?? 10) * 1000;
    return this.db.query<NearbyVenue>(
      /* sql */ `
      SELECT v.id, v.name, v.description, v.city, v.country_code, v.address, v.currency, v.timezone,
             v.requires_turf_footwear, v.rules,
             ST_Y(v.location::geometry) AS lat,
             ST_X(v.location::geometry) AS lng,
             round(ST_Distance(v.location, ST_SetSRID(ST_MakePoint($2::float8, $1::float8), 4326)::geography))::int AS distance_m,
             (SELECT min(c.price_per_hour_minor)
                FROM courts c
               WHERE c.venue_id = v.id AND c.is_active AND ($4::text IS NULL OR c.sport = $4::text)) AS from_price_per_hour_minor,
             (SELECT array_agg(DISTINCT c.sport ORDER BY c.sport)
                FROM courts c
               WHERE c.venue_id = v.id AND c.is_active) AS sports
        FROM venues v
       WHERE v.is_active
         AND ST_DWithin(v.location, ST_SetSRID(ST_MakePoint($2::float8, $1::float8), 4326)::geography, $3::float8)
         AND ($4::text IS NULL OR EXISTS (
               SELECT 1 FROM courts c WHERE c.venue_id = v.id AND c.is_active AND c.sport = $4::text))
       ORDER BY distance_m, v.name
       LIMIT $5::int`,
      [query.lat, query.lng, radiusMetres, query.sport ?? null, query.limit ?? 20],
    );
  }

  async getVenue(venueId: string) {
    const [venue] = await this.db.query<Omit<NearbyVenue, 'distance_m' | 'from_price_per_hour_minor' | 'sports'> & { free_cancellation_hours: number }>(
      /* sql */ `
      SELECT v.id, v.name, v.description, v.city, v.country_code, v.address, v.currency, v.timezone,
             v.requires_turf_footwear, v.rules, v.free_cancellation_hours,
             ST_Y(v.location::geometry) AS lat,
             ST_X(v.location::geometry) AS lng
        FROM venues v
       WHERE v.id = $1 AND v.is_active`,
      [venueId],
    );
    if (!venue) throw new NotFoundException(apiError('VENUE_NOT_FOUND', 'Venue not found'));

    const courts = await this.db.query<CourtSummary>(
      /* sql */ `
      SELECT c.id, c.name, c.sport, c.surface, c.capacity_players, c.price_per_hour_minor, c.slot_minutes,
             to_char(c.opens_at, 'HH24:MI') AS opens_at, to_char(c.closes_at, 'HH24:MI') AS closes_at
        FROM courts c
       WHERE c.venue_id = $1 AND c.is_active
       ORDER BY c.sport, c.name`,
      [venueId],
    );
    return { ...venue, courts };
  }

  /**
   * Every bookable slot of one court for one local day, each marked available or not.
   * The session starts at the court's opening time on that day and may run past midnight.
   * An unpaid hold blocks its slot only until the hold deadline.
   */
  async getCourtAvailability(courtId: string, date: string) {
    const [court] = await this.db.query<{ id: string; timezone: string; slot_minutes: number }>(
      /* sql */ `
      SELECT c.id, v.timezone, c.slot_minutes
        FROM courts c JOIN venues v ON v.id = c.venue_id
       WHERE c.id = $1 AND c.is_active AND v.is_active`,
      [courtId],
    );
    if (!court) throw new NotFoundException(apiError('COURT_NOT_FOUND', 'Court not found'));

    const slots = await this.db.query<AvailabilitySlot>(
      /* sql */ `
      WITH court AS (
        SELECT c.id, c.slot_minutes, c.price_per_hour_minor, v.currency, v.timezone,
               ($2::date + c.opens_at) AS open_local,
               ($2::date + c.opens_at)
                 + CASE WHEN c.closes_at - c.opens_at <= interval '0'
                        THEN c.closes_at - c.opens_at + interval '24 hours'
                        ELSE c.closes_at - c.opens_at
                   END AS close_local
          FROM courts c JOIN venues v ON v.id = c.venue_id
         WHERE c.id = $1
      ), slots AS (
        SELECT court.id AS court_id, court.currency,
               round(court.price_per_hour_minor * court.slot_minutes / 60.0)::bigint AS price_minor,
               (local_start AT TIME ZONE court.timezone) AS starts_at,
               ((local_start + make_interval(mins => court.slot_minutes)) AT TIME ZONE court.timezone) AS ends_at
          FROM court,
               generate_series(
                 court.open_local,
                 court.close_local - make_interval(mins => court.slot_minutes),
                 make_interval(mins => court.slot_minutes)
               ) AS local_start
      )
      SELECT s.starts_at, s.ends_at, s.price_minor, s.currency,
             (s.starts_at > now() AND NOT EXISTS (
                SELECT 1 FROM bookings b
                 WHERE b.court_id = s.court_id
                   AND b.slot_range && tstzrange(s.starts_at, s.ends_at, '[)')
                   AND (b.status IN ('CONFIRMED', 'COMPLETED')
                        OR (b.status = 'HOLD' AND b.hold_expires_at > now()))
             )) AS available
        FROM slots s
       ORDER BY s.starts_at`,
      [courtId, date],
    );
    return { court_id: court.id, date, timezone: court.timezone, slot_minutes: court.slot_minutes, slots };
  }
}
