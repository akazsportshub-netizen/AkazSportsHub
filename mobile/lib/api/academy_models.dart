/// Data for the academy: training groups, enrolments, sessions, attendance and fees (`/v1/academy`, `/v1/manager/.../academy`).
library;

import 'models.dart';

class AcademyGroup {
  AcademyGroup({
    required this.id,
    required this.name,
    required this.sport,
    required this.ageGroup,
    required this.coachName,
    required this.weekday,
    required this.startsAt,
    required this.durationMinutes,
    required this.monthlyFeeMinor,
    required this.currency,
    required this.venueName,
    required this.capacity,
    required this.enrolled,
    required this.spotsLeft,
    required this.isActive,
  });

  /// Works for both the public list (`spots_left`, `venue_name`, `currency`) and the manager list (`enrolled`, `capacity`).
  factory AcademyGroup.fromJson(Map<String, dynamic> json) {
    final capacity = asInt(json['capacity']);
    final enrolled = asInt(json['enrolled']);
    return AcademyGroup(
      id: asString(json['id']),
      name: asString(json['name']),
      sport: asString(json['sport']),
      ageGroup: json['age_group'] == null ? null : asString(json['age_group']),
      coachName: json['coach_name'] == null ? null : asString(json['coach_name']),
      weekday: asInt(json['weekday'], 1),
      startsAt: asString(json['starts_at']),
      durationMinutes: asInt(json['duration_minutes'], 60),
      monthlyFeeMinor: asInt(json['monthly_fee_minor']),
      currency: asString(json['currency']),
      venueName: asString(json['venue_name']),
      capacity: capacity,
      enrolled: enrolled,
      spotsLeft: json['spots_left'] == null ? capacity - enrolled : asInt(json['spots_left']),
      isActive: json['is_active'] != false,
    );
  }

  final String id;
  final String name;
  final String sport;
  final String? ageGroup;
  final String? coachName;
  final int weekday; // 1 = Monday ... 7 = Sunday
  final String startsAt; // "17:30"
  final int durationMinutes;
  final int monthlyFeeMinor;
  final String currency; // empty on the manager list: the venue's currency applies
  final String venueName;
  final int capacity;
  final int enrolled;
  final int spotsLeft;
  final bool isActive;
}

class Child {
  Child({required this.id, required this.fullName, this.ageGroup});

  factory Child.fromJson(Map<String, dynamic> json) =>
      Child(id: asString(json['id']), fullName: asString(json['full_name']), ageGroup: json['age_group'] == null ? null : asString(json['age_group']));

  final String id;
  final String fullName;
  final String? ageGroup;
}

class AttendanceSummary {
  AttendanceSummary({required this.present, required this.absent, required this.excused, required this.percent});

  factory AttendanceSummary.fromJson(Map<String, dynamic> json) => AttendanceSummary(
        present: asInt(json['present']),
        absent: asInt(json['absent']),
        excused: asInt(json['excused']),
        percent: asIntOrNull(json['percent']),
      );

  final int present;
  final int absent;
  final int excused;
  final int? percent;
}

class MyEnrolment {
  MyEnrolment({
    required this.id,
    required this.status,
    required this.playerName,
    required this.groupName,
    required this.sport,
    required this.venueName,
    required this.weekday,
    required this.startsAt,
    required this.monthlyFeeMinor,
    required this.currency,
    required this.nextSession,
    required this.invoicesDue,
    required this.attendance,
  });

  factory MyEnrolment.fromJson(Map<String, dynamic> json) => MyEnrolment(
        id: asString(json['id']),
        status: asString(json['status']),
        playerName: asString(json['player_name']),
        groupName: asString(json['group_name']),
        sport: asString(json['sport']),
        venueName: asString(json['venue_name']),
        weekday: asInt(json['weekday'], 1),
        startsAt: asString(json['starts_at']),
        monthlyFeeMinor: asInt(json['monthly_fee_minor']),
        currency: asString(json['currency']),
        nextSession: json['next_session'] == null ? null : asString(json['next_session']),
        invoicesDue: asInt(json['invoices_due']),
        attendance: AttendanceSummary.fromJson(asMap(json['attendance'])),
      );

  final String id;
  final String status; // ACTIVE or ENDED
  final String playerName;
  final String groupName;
  final String sport;
  final String venueName;
  final int weekday;
  final String startsAt;
  final int monthlyFeeMinor;
  final String currency;
  final String? nextSession; // "2026-11-26"
  final int invoicesDue;
  final AttendanceSummary attendance;

  bool get isActive => status == 'ACTIVE';
}

class AttendanceMark {
  AttendanceMark({required this.sessionDate, required this.status});

  factory AttendanceMark.fromJson(Map<String, dynamic> json) => AttendanceMark(sessionDate: asString(json['session_date']), status: asString(json['status']));

  final String sessionDate;
  final String status; // PRESENT, ABSENT or EXCUSED
}

class AcademyInvoice {
  AcademyInvoice({required this.id, required this.month, required this.amountMinor, required this.currency, required this.status, this.playerName = '', this.groupName = '', this.contactPhone = ''});

  factory AcademyInvoice.fromJson(Map<String, dynamic> json) => AcademyInvoice(
        id: asString(json['id']),
        month: asString(json['month']),
        amountMinor: asInt(json['amount_minor']),
        currency: asString(json['currency']),
        status: asString(json['status']),
        playerName: asString(json['player_name']),
        groupName: asString(json['group_name']),
        contactPhone: asString(json['contact_phone']),
      );

  final String id;
  final String month; // "2026-12"
  final int amountMinor;
  final String currency;
  final String status; // DUE, PAID or WAIVED
  final String playerName;
  final String groupName;
  final String contactPhone;
}

class EnrolmentDetail {
  EnrolmentDetail({required this.history, required this.invoices});

  factory EnrolmentDetail.fromJson(Map<String, dynamic> json) => EnrolmentDetail(
        history: asMapList(json['history']).map(AttendanceMark.fromJson).toList(),
        invoices: asMapList(json['invoices']).map(AcademyInvoice.fromJson).toList(),
      );

  final List<AttendanceMark> history;
  final List<AcademyInvoice> invoices;
}

class RosterEntry {
  RosterEntry({required this.enrolmentId, required this.playerName, required this.contactName, required this.contactPhone, required this.invoicesDue});

  factory RosterEntry.fromJson(Map<String, dynamic> json) => RosterEntry(
        enrolmentId: asString(json['enrolment_id']),
        playerName: asString(json['player_name']),
        contactName: asString(json['contact_name']),
        contactPhone: asString(json['contact_phone']),
        invoicesDue: asInt(json['invoices_due']),
      );

  final String enrolmentId;
  final String playerName;
  final String contactName;
  final String contactPhone;
  final int invoicesDue;
}

class AcademySession {
  AcademySession({required this.id, required this.sessionDate, required this.cancelled, required this.marked});

  factory AcademySession.fromJson(Map<String, dynamic> json) => AcademySession(
        id: asString(json['id']),
        sessionDate: asString(json['session_date']),
        cancelled: json['cancelled'] == true,
        marked: asInt(json['marked']),
      );

  final String id;
  final String sessionDate; // "2026-11-26"
  final bool cancelled;
  final int marked;
}

class AttendanceRow {
  AttendanceRow({required this.enrolmentId, required this.playerName, this.status});

  factory AttendanceRow.fromJson(Map<String, dynamic> json) => AttendanceRow(
        enrolmentId: asString(json['enrolment_id']),
        playerName: asString(json['player_name']),
        status: json['status'] == null ? null : asString(json['status']),
      );

  final String enrolmentId;
  final String playerName;
  String? status; // null until marked
}

class AttendanceSheet {
  AttendanceSheet({required this.sessionDate, required this.cancelled, required this.players});

  factory AttendanceSheet.fromJson(Map<String, dynamic> json) => AttendanceSheet(
        sessionDate: asString(json['session_date']),
        cancelled: json['cancelled'] == true,
        players: asMapList(json['players']).map(AttendanceRow.fromJson).toList(),
      );

  final String sessionDate;
  final bool cancelled;
  final List<AttendanceRow> players;
}

/// "2026-11-26" → a date-only value; null if it is not one.
DateTime? parseDay(String value) {
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(value);
  if (match == null) return null;
  return DateTime.utc(int.parse(match.group(1)!), int.parse(match.group(2)!), int.parse(match.group(3)!));
}
