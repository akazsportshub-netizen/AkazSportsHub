import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { apiError } from '../common/api-error';
import { DatabaseService, PG_UNIQUE_VIOLATION, pgErrorCode, Queryable } from '../database/database.service';
import { addDays, attendanceProblem, AttendanceStatus, monthStart, sessionDates, summarizeAttendance } from './academy';
import {
  BrowseGroupsDto, CreateChildDto, CreateGroupDto, EnrolDto, InvoicesQueryDto, MarkAttendanceDto, MoreSessionsDto, PayInvoiceDto,
  UpdateGroupDto, UpdateSessionDto, WaiveInvoiceDto,
} from './dto/academy.dto';

/** How far ahead sessions are created when a group is set up. */
const FIRST_WEEKS = 8;

interface GroupRow { id: string; venue_id: string; timezone: string; currency: string; weekday: number; capacity: number }

@Injectable()
export class AcademyService {
  constructor(private readonly db: DatabaseService) {}

  // ---- ownership ---------------------------------------------------------------

  private async ownVenue(q: Queryable, venueId: string, user: AuthUser) {
    const [venue] = await q.query<{ id: string; timezone: string; currency: string }>(
      /* sql */ `SELECT id, timezone, currency FROM venues WHERE id = $1 AND manager_user_id = $2`, [venueId, user.id]);
    if (!venue) throw new NotFoundException(apiError('VENUE_NOT_FOUND', 'Venue not found'));
    return venue;
  }

  /** The group, only if the caller manages its venue. Others get "not found". */
  private async ownGroup(q: Queryable, groupId: string, user: AuthUser, lock = false): Promise<GroupRow> {
    const [group] = await q.query<GroupRow>(
      /* sql */ `
      SELECT g.id, g.venue_id, v.timezone, v.currency, g.weekday, g.capacity
        FROM academy_groups g JOIN venues v ON v.id = g.venue_id
       WHERE g.id = $1 AND v.manager_user_id = $2 ${lock ? 'FOR UPDATE OF g' : ''}`, [groupId, user.id]);
    if (!group) throw new NotFoundException(apiError('GROUP_NOT_FOUND', 'Group not found'));
    return group;
  }

  private async ownSession(q: Queryable, sessionId: string, user: AuthUser) {
    const [row] = await q.query<{ id: string; group_id: string; session_date: string; cancelled: boolean; timezone: string }>(
      /* sql */ `
      SELECT s.id, s.group_id, to_char(s.session_date, 'YYYY-MM-DD') AS session_date, s.cancelled, v.timezone
        FROM academy_sessions s JOIN academy_groups g ON g.id = s.group_id JOIN venues v ON v.id = g.venue_id
       WHERE s.id = $1 AND v.manager_user_id = $2`, [sessionId, user.id]);
    if (!row) throw new NotFoundException(apiError('SESSION_NOT_FOUND', 'Session not found'));
    return row;
  }

  private async localToday(q: Queryable, timezone: string): Promise<string> {
    const [row] = await q.query<{ today: string }>(/* sql */ `SELECT to_char((now() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS today`, [timezone]);
    return row.today;
  }

  private async addSessions(q: Queryable, group: GroupRow, from: string, to: string) {
    for (const day of sessionDates(group.weekday, from, to)) {
      await q.query(/* sql */ `INSERT INTO academy_sessions (group_id, session_date) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [group.id, day]);
    }
  }

  // ---- venue manager: groups ---------------------------------------------------

  async managerGroups(venueId: string, user: AuthUser) {
    await this.ownVenue(this.db, venueId, user);
    return this.db.query(/* sql */ `
      SELECT g.id, g.name, g.sport, g.age_group, g.coach_name, g.weekday, to_char(g.starts_at, 'HH24:MI') AS starts_at,
             g.duration_minutes, g.monthly_fee_minor, g.capacity, g.is_active,
             (SELECT count(*)::int FROM academy_enrolments e WHERE e.group_id = g.id AND e.status = 'ACTIVE') AS enrolled
        FROM academy_groups g WHERE g.venue_id = $1 ORDER BY g.is_active DESC, g.weekday, g.starts_at, g.name`, [venueId]);
  }

  async createGroup(venueId: string, dto: CreateGroupDto, user: AuthUser) {
    const venue = await this.ownVenue(this.db, venueId, user);
    try {
      return await this.db.tx(async (q) => {
        const [group] = await q.query<{ id: string }>(/* sql */ `
          INSERT INTO academy_groups (venue_id, name, sport, age_group, coach_name, weekday, starts_at, duration_minutes, monthly_fee_minor, capacity)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [venueId, dto.name.trim(), dto.sport, dto.age_group ?? null, dto.coach_name ?? null, dto.weekday, dto.starts_at,
           dto.duration_minutes, dto.monthly_fee_minor, dto.capacity]);
        const today = await this.localToday(q, venue.timezone);
        await this.addSessions(q, { id: group.id, venue_id: venueId, timezone: venue.timezone, currency: venue.currency, weekday: dto.weekday, capacity: dto.capacity },
          today, addDays(today, FIRST_WEEKS * 7));
        return { id: group.id };
      });
    } catch (error) {
      if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) throw new ConflictException(apiError('GROUP_NAME_TAKEN', 'This venue already has a group with that name'));
      throw error;
    }
  }

  async updateGroup(groupId: string, dto: UpdateGroupDto, user: AuthUser) {
    return this.db.tx(async (q) => {
      const group = await this.ownGroup(q, groupId, user, true);
      if (dto.capacity !== undefined) {
        const [{ n }] = await q.query<{ n: number }>(/* sql */ `SELECT count(*)::int AS n FROM academy_enrolments WHERE group_id = $1 AND status = 'ACTIVE'`, [group.id]);
        if (dto.capacity < n) throw new UnprocessableEntityException(apiError('CAPACITY_BELOW_ENROLLED', `${n} players are enrolled; capacity cannot be lower`));
      }
      const columns = ['name', 'age_group', 'coach_name', 'monthly_fee_minor', 'capacity', 'is_active'] as const;
      const sets: string[] = [];
      const values: unknown[] = [group.id];
      for (const column of columns) {
        const value = dto[column];
        if (value === undefined) continue;
        values.push(typeof value === 'string' ? value.trim() : value);
        sets.push(`${column} = $${values.length}`);
      }
      if (sets.length === 0) throw new UnprocessableEntityException(apiError('NOTHING_TO_UPDATE', 'No changes were sent'));
      try {
        await q.query(`UPDATE academy_groups SET ${sets.join(', ')} WHERE id = $1`, values);
      } catch (error) {
        if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) throw new ConflictException(apiError('GROUP_NAME_TAKEN', 'This venue already has a group with that name'));
        throw error;
      }
      return { id: group.id };
    });
  }

  async roster(groupId: string, user: AuthUser) {
    await this.ownGroup(this.db, groupId, user);
    return this.db.query(/* sql */ `
      SELECT e.id AS enrolment_id, coalesce(d.full_name, u.full_name) AS player_name, d.age_group,
             u.full_name AS contact_name, u.phone_e164 AS contact_phone, u.email AS contact_email,
             to_char(e.started_on, 'YYYY-MM-DD') AS started_on,
             (SELECT count(*)::int FROM academy_invoices i WHERE i.enrolment_id = e.id AND i.status = 'DUE') AS invoices_due
        FROM academy_enrolments e JOIN users u ON u.id = e.user_id LEFT JOIN dependent_profiles d ON d.id = e.dependent_id
       WHERE e.group_id = $1 AND e.status = 'ACTIVE' ORDER BY player_name`, [groupId]);
  }

  // ---- venue manager: sessions and attendance ----------------------------------

  async moreSessions(groupId: string, dto: MoreSessionsDto, user: AuthUser) {
    const group = await this.ownGroup(this.db, groupId, user);
    const today = await this.localToday(this.db, group.timezone);
    await this.addSessions(this.db, group, today, addDays(today, dto.weeks * 7));
    return { ok: true };
  }

  async sessions(groupId: string, user: AuthUser) {
    const group = await this.ownGroup(this.db, groupId, user);
    const today = await this.localToday(this.db, group.timezone);
    return this.db.query(/* sql */ `
      SELECT s.id, to_char(s.session_date, 'YYYY-MM-DD') AS session_date, s.cancelled, s.note,
             (SELECT count(*)::int FROM academy_attendance a WHERE a.session_id = s.id) AS marked
        FROM academy_sessions s
       WHERE s.group_id = $1 AND s.session_date BETWEEN $2::date - 28 AND $2::date + 28
       ORDER BY s.session_date`, [group.id, today]);
  }

  async updateSession(sessionId: string, dto: UpdateSessionDto, user: AuthUser) {
    const session = await this.ownSession(this.db, sessionId, user);
    if (dto.cancelled === undefined && dto.note === undefined) throw new UnprocessableEntityException(apiError('NOTHING_TO_UPDATE', 'No changes were sent'));
    await this.db.query(/* sql */ `
      UPDATE academy_sessions SET cancelled = coalesce($2, cancelled), note = coalesce($3, note) WHERE id = $1`,
      [session.id, dto.cancelled ?? null, dto.note ?? null]);
    return { id: session.id };
  }

  async attendance(sessionId: string, user: AuthUser) {
    const session = await this.ownSession(this.db, sessionId, user);
    const players = await this.db.query(/* sql */ `
      SELECT e.id AS enrolment_id, coalesce(d.full_name, u.full_name) AS player_name, a.status
        FROM academy_enrolments e JOIN users u ON u.id = e.user_id LEFT JOIN dependent_profiles d ON d.id = e.dependent_id
        LEFT JOIN academy_attendance a ON a.session_id = $1 AND a.enrolment_id = e.id
       WHERE e.group_id = $2 AND (e.status = 'ACTIVE' OR a.session_id IS NOT NULL)
       ORDER BY player_name`, [session.id, session.group_id]);
    return { session_date: session.session_date, cancelled: session.cancelled, players };
  }

  async markAttendance(sessionId: string, dto: MarkAttendanceDto, user: AuthUser) {
    return this.db.tx(async (q) => {
      const session = await this.ownSession(q, sessionId, user);
      const problem = attendanceProblem(session.session_date, await this.localToday(q, session.timezone), session.cancelled);
      if (problem === 'CANCELLED') throw new UnprocessableEntityException(apiError('SESSION_CANCELLED', 'This session was cancelled'));
      if (problem === 'FUTURE_SESSION') throw new UnprocessableEntityException(apiError('SESSION_NOT_STARTED', 'Attendance can be marked once the day has come'));
      const ids = [...new Set(dto.marks.map((m) => m.enrolment_id))];
      const found = await q.query<{ id: string }>(/* sql */ `SELECT id FROM academy_enrolments WHERE group_id = $1 AND id = ANY($2::uuid[])`, [session.group_id, ids]);
      if (found.length !== ids.length) throw new UnprocessableEntityException(apiError('NOT_IN_GROUP', 'One of these players is not in this group'));
      for (const mark of dto.marks) {
        await q.query(/* sql */ `
          INSERT INTO academy_attendance (session_id, enrolment_id, status, marked_by) VALUES ($1,$2,$3,$4)
          ON CONFLICT (session_id, enrolment_id) DO UPDATE SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by, marked_at = now()`,
          [session.id, mark.enrolment_id, mark.status, user.id]);
      }
      return { saved: dto.marks.length };
    });
  }

  // ---- venue manager: fees -----------------------------------------------------

  /** Creates the month's fee for every active player who does not have one yet. Safe to run twice. */
  async createInvoices(venueId: string, month: string, user: AuthUser) {
    const venue = await this.ownVenue(this.db, venueId, user);
    const period = monthStart(month);
    if (!period) throw new UnprocessableEntityException(apiError('INVALID_MONTH', 'month must look like 2026-12'));
    const created = await this.db.query<{ id: string }>(/* sql */ `
      INSERT INTO academy_invoices (enrolment_id, period, amount_minor, currency)
      SELECT e.id, $2::date, g.monthly_fee_minor, $3
        FROM academy_enrolments e JOIN academy_groups g ON g.id = e.group_id
       WHERE g.venue_id = $1 AND e.status = 'ACTIVE' AND g.monthly_fee_minor > 0 AND e.started_on < ($2::date + interval '1 month')
      ON CONFLICT (enrolment_id, period) DO NOTHING
      RETURNING id`, [venueId, period, venue.currency]);
    return { created: created.length };
  }

  async invoices(venueId: string, query: InvoicesQueryDto, user: AuthUser) {
    await this.ownVenue(this.db, venueId, user);
    const period = query.month ? monthStart(query.month) : null;
    if (query.month && !period) throw new UnprocessableEntityException(apiError('INVALID_MONTH', 'month must look like 2026-12'));
    return this.db.query(/* sql */ `
      SELECT i.id, to_char(i.period, 'YYYY-MM') AS month, i.amount_minor, i.currency, i.status, i.paid_at, i.pay_method, i.note,
             coalesce(d.full_name, u.full_name) AS player_name, g.name AS group_name, u.full_name AS contact_name, u.phone_e164 AS contact_phone
        FROM academy_invoices i JOIN academy_enrolments e ON e.id = i.enrolment_id JOIN academy_groups g ON g.id = e.group_id
        JOIN users u ON u.id = e.user_id LEFT JOIN dependent_profiles d ON d.id = e.dependent_id
       WHERE g.venue_id = $1 AND ($2::date IS NULL OR i.period = $2::date) AND ($3::text IS NULL OR i.status = $3)
       ORDER BY i.period DESC, (i.status = 'DUE') DESC, player_name LIMIT 500`, [venueId, period, query.status ?? null]);
  }

  private async settle(invoiceId: string, status: 'PAID' | 'WAIVED', method: string | null, note: string | undefined, user: AuthUser) {
    const rows = await this.db.query<{ id: string }>(/* sql */ `
      UPDATE academy_invoices i SET status = $3, paid_at = CASE WHEN $3 = 'PAID' THEN now() ELSE NULL END, pay_method = $4, note = $5
        FROM academy_enrolments e, academy_groups g, venues v
       WHERE i.id = $1 AND e.id = i.enrolment_id AND g.id = e.group_id AND v.id = g.venue_id AND v.manager_user_id = $2 AND i.status = 'DUE'
      RETURNING i.id`, [invoiceId, user.id, status, method, note ?? null]);
    if (rows.length === 0) {
      const [exists] = await this.db.query(/* sql */ `
        SELECT 1 FROM academy_invoices i JOIN academy_enrolments e ON e.id = i.enrolment_id JOIN academy_groups g ON g.id = e.group_id
          JOIN venues v ON v.id = g.venue_id WHERE i.id = $1 AND v.manager_user_id = $2`, [invoiceId, user.id]);
      if (!exists) throw new NotFoundException(apiError('INVOICE_NOT_FOUND', 'Invoice not found'));
      throw new ConflictException(apiError('INVOICE_NOT_DUE', 'This fee is already settled'));
    }
    return { id: rows[0].id, status };
  }

  markPaid(invoiceId: string, dto: PayInvoiceDto, user: AuthUser) {
    return this.settle(invoiceId, 'PAID', dto.method, dto.note, user);
  }

  waive(invoiceId: string, dto: WaiveInvoiceDto, user: AuthUser) {
    return this.settle(invoiceId, 'WAIVED', null, dto.note, user);
  }

  // ---- parents and players -----------------------------------------------------

  children(user: AuthUser) {
    return this.db.query(/* sql */ `
      SELECT id, full_name, to_char(date_of_birth, 'YYYY-MM-DD') AS date_of_birth, age_group
        FROM dependent_profiles WHERE guardian_user_id = $1 ORDER BY created_at`, [user.id]);
  }

  async addChild(dto: CreateChildDto, user: AuthUser) {
    const [row] = await this.db.query<{ id: string }>(/* sql */ `
      INSERT INTO dependent_profiles (guardian_user_id, full_name, date_of_birth, age_group) VALUES ($1,$2,$3,$4) RETURNING id`,
      [user.id, dto.full_name.trim(), dto.date_of_birth ?? null, dto.age_group ?? null]);
    return { id: row.id };
  }

  browse(query: BrowseGroupsDto) {
    return this.db.query(/* sql */ `
      SELECT g.id, g.name, g.sport, g.age_group, g.coach_name, g.weekday, to_char(g.starts_at, 'HH24:MI') AS starts_at,
             g.duration_minutes, g.monthly_fee_minor, v.currency, v.id AS venue_id, v.name AS venue_name, v.city,
             g.capacity - (SELECT count(*)::int FROM academy_enrolments e WHERE e.group_id = g.id AND e.status = 'ACTIVE') AS spots_left
        FROM academy_groups g JOIN venues v ON v.id = g.venue_id
       WHERE g.is_active AND v.is_active AND ($1::uuid IS NULL OR v.id = $1) AND ($2::text IS NULL OR g.sport = $2)
       ORDER BY v.name, g.weekday, g.starts_at LIMIT 200`, [query.venue_id ?? null, query.sport ?? null]);
  }

  async enrol(groupId: string, dto: EnrolDto, user: AuthUser) {
    try {
      return await this.db.tx(async (q) => {
        const [group] = await q.query<{ id: string; capacity: number; timezone: string }>(/* sql */ `
          SELECT g.id, g.capacity, v.timezone FROM academy_groups g JOIN venues v ON v.id = g.venue_id
           WHERE g.id = $1 AND g.is_active AND v.is_active FOR UPDATE OF g`, [groupId]);
        if (!group) throw new NotFoundException(apiError('GROUP_NOT_FOUND', 'Group not found'));
        if (dto.dependent_id) {
          const [child] = await q.query(/* sql */ `SELECT 1 FROM dependent_profiles WHERE id = $1 AND guardian_user_id = $2`, [dto.dependent_id, user.id]);
          if (!child) throw new ForbiddenException(apiError('NOT_YOUR_CHILD', 'That child profile is not yours'));
        }
        const [{ n }] = await q.query<{ n: number }>(/* sql */ `SELECT count(*)::int AS n FROM academy_enrolments WHERE group_id = $1 AND status = 'ACTIVE'`, [group.id]);
        if (n >= group.capacity) throw new ConflictException(apiError('GROUP_FULL', 'This group is full'));
        const today = await this.localToday(q, group.timezone);
        const [row] = await q.query<{ id: string }>(/* sql */ `
          INSERT INTO academy_enrolments (group_id, user_id, dependent_id, started_on) VALUES ($1,$2,$3,$4) RETURNING id`,
          [group.id, user.id, dto.dependent_id ?? null, today]);
        return { id: row.id };
      });
    } catch (error) {
      if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) throw new ConflictException(apiError('ALREADY_ENROLLED', 'Already enrolled in this group'));
      throw error;
    }
  }

  async myEnrolments(user: AuthUser) {
    const rows = await this.db.query<{ id: string; group_id: string; timezone: string } & Record<string, unknown>>(/* sql */ `
      SELECT e.id, e.group_id, e.status, coalesce(d.full_name, u.full_name) AS player_name,
             g.name AS group_name, g.sport, g.coach_name, g.weekday, to_char(g.starts_at, 'HH24:MI') AS starts_at, g.duration_minutes,
             g.monthly_fee_minor, v.currency, v.name AS venue_name, v.timezone,
             (SELECT to_char(min(s.session_date), 'YYYY-MM-DD') FROM academy_sessions s
               WHERE s.group_id = g.id AND NOT s.cancelled AND s.session_date >= (now() AT TIME ZONE v.timezone)::date) AS next_session,
             (SELECT count(*)::int FROM academy_invoices i WHERE i.enrolment_id = e.id AND i.status = 'DUE') AS invoices_due
        FROM academy_enrolments e JOIN users u ON u.id = e.user_id LEFT JOIN dependent_profiles d ON d.id = e.dependent_id
        JOIN academy_groups g ON g.id = e.group_id JOIN venues v ON v.id = g.venue_id
       WHERE e.user_id = $1 ORDER BY (e.status = 'ACTIVE') DESC, player_name, g.name`, [user.id]);
    const out = [];
    for (const row of rows) {
      const marks = await this.db.query<{ status: AttendanceStatus }>(/* sql */ `SELECT status FROM academy_attendance WHERE enrolment_id = $1`, [row.id]);
      out.push({ ...row, timezone: undefined, group_id: undefined, attendance: summarizeAttendance(marks.map((m) => m.status)) });
    }
    return out;
  }

  private async ownEnrolment(q: Queryable, id: string, user: AuthUser) {
    const [row] = await q.query<{ id: string; status: string }>(/* sql */ `SELECT id, status FROM academy_enrolments WHERE id = $1 AND user_id = $2`, [id, user.id]);
    if (!row) throw new NotFoundException(apiError('ENROLMENT_NOT_FOUND', 'Enrolment not found'));
    return row;
  }

  async enrolmentDetail(id: string, user: AuthUser) {
    await this.ownEnrolment(this.db, id, user);
    const history = await this.db.query(/* sql */ `
      SELECT to_char(s.session_date, 'YYYY-MM-DD') AS session_date, a.status
        FROM academy_attendance a JOIN academy_sessions s ON s.id = a.session_id
       WHERE a.enrolment_id = $1 ORDER BY s.session_date DESC LIMIT 30`, [id]);
    const invoices = await this.db.query(/* sql */ `
      SELECT id, to_char(period, 'YYYY-MM') AS month, amount_minor, currency, status, paid_at
        FROM academy_invoices WHERE enrolment_id = $1 ORDER BY period DESC LIMIT 24`, [id]);
    return { history, invoices };
  }

  async leave(id: string, user: AuthUser) {
    const enrolment = await this.ownEnrolment(this.db, id, user);
    if (enrolment.status !== 'ACTIVE') throw new ConflictException(apiError('ALREADY_LEFT', 'Already left this group'));
    await this.db.query(/* sql */ `
      UPDATE academy_enrolments e SET status = 'ENDED',
             ended_on = (now() AT TIME ZONE (SELECT v.timezone FROM academy_groups g JOIN venues v ON v.id = g.venue_id WHERE g.id = e.group_id))::date
       WHERE e.id = $1`, [id]);
    return { id };
  }
}
