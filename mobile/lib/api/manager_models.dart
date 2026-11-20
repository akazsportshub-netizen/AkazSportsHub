/// Data for the venue manager console (`/v1/manager/...`).
library;

import 'models.dart';

class ManagerVenue {
  ManagerVenue({required this.id, required this.name, required this.city, required this.currency, required this.timezone});

  factory ManagerVenue.fromJson(Map<String, dynamic> json) => ManagerVenue(
        id: asString(json['id']),
        name: asString(json['name']),
        city: asString(json['city']),
        currency: asString(json['currency']),
        timezone: asString(json['timezone'], 'Asia/Qatar'),
      );

  final String id;
  final String name;
  final String city;
  final String currency;
  final String timezone;
}

class ManagerBooking {
  ManagerBooking({
    required this.id,
    required this.courtName,
    required this.sport,
    required this.startsAt,
    required this.endsAt,
    required this.status,
    required this.totalMinor,
    required this.currency,
    required this.organizerName,
    required this.organizerPhone,
    required this.sharesTotal,
    required this.sharesPaid,
  });

  factory ManagerBooking.fromJson(Map<String, dynamic> json) => ManagerBooking(
        id: asString(json['id']),
        courtName: asString(json['court_name']),
        sport: asString(json['sport']),
        startsAt: asDate(json['starts_at']),
        endsAt: asDate(json['ends_at']),
        status: asString(json['status']),
        totalMinor: asInt(json['total_minor']),
        currency: asString(json['currency']),
        organizerName: asString(json['organizer_name']),
        organizerPhone: asString(json['organizer_phone']),
        sharesTotal: asInt(json['shares_total']),
        sharesPaid: asInt(json['shares_paid']),
      );

  final String id;
  final String courtName;
  final String sport;
  final DateTime startsAt;
  final DateTime endsAt;
  final String status;
  final int totalMinor;
  final String currency;
  final String organizerName;
  final String organizerPhone;
  final int sharesTotal;
  final int sharesPaid;

  /// Only these can still be cancelled by the venue.
  bool get isCancellable => status == 'HOLD' || status == 'CONFIRMED';
}

class ManagerCourt {
  ManagerCourt({
    required this.id,
    required this.name,
    required this.sport,
    required this.capacityPlayers,
    required this.pricePerHourMinor,
    required this.slotMinutes,
    required this.opensAt,
    required this.closesAt,
    required this.isActive,
  });

  factory ManagerCourt.fromJson(Map<String, dynamic> json) => ManagerCourt(
        id: asString(json['id']),
        name: asString(json['name']),
        sport: asString(json['sport']),
        capacityPlayers: asInt(json['capacity_players']),
        pricePerHourMinor: asInt(json['price_per_hour_minor']),
        slotMinutes: asInt(json['slot_minutes'], 60),
        opensAt: asString(json['opens_at'], '06:00'),
        closesAt: asString(json['closes_at'], '00:00'),
        isActive: json['is_active'] != false,
      );

  final String id;
  final String name;
  final String sport;
  final int capacityPlayers;
  final int pricePerHourMinor;
  final int slotMinutes;
  final String opensAt;
  final String closesAt;
  final bool isActive;
}

class CourtBlock {
  CourtBlock({required this.id, required this.courtId, required this.courtName, required this.startsAt, required this.endsAt, required this.reason});

  factory CourtBlock.fromJson(Map<String, dynamic> json) => CourtBlock(
        id: asString(json['id']),
        courtId: asString(json['court_id']),
        courtName: asString(json['court_name']),
        startsAt: asDate(json['starts_at']),
        endsAt: asDate(json['ends_at']),
        reason: asStringOrNull(json['reason']),
      );

  final String id;
  final String courtId;
  final String courtName;
  final DateTime startsAt;
  final DateTime endsAt;
  final String? reason;
}

class EarningsDay {
  EarningsDay({required this.date, required this.bookings, required this.grossMinor, required this.commissionMinor, required this.netMinor});

  factory EarningsDay.fromJson(Map<String, dynamic> json) => EarningsDay(
        date: asString(json['day']),
        bookings: asInt(json['bookings']),
        grossMinor: asInt(json['gross_minor']),
        commissionMinor: asInt(json['commission_minor']),
        netMinor: asInt(json['net_minor']),
      );

  final String date;
  final int bookings;
  final int grossMinor;
  final int commissionMinor;
  final int netMinor;
}

class Earnings {
  Earnings({
    required this.currency,
    required this.from,
    required this.to,
    required this.bookings,
    required this.grossMinor,
    required this.commissionMinor,
    required this.netMinor,
    required this.days,
  });

  factory Earnings.fromJson(Map<String, dynamic> json) => Earnings(
        currency: asString(json['currency']),
        from: asString(json['from']),
        to: asString(json['to']),
        bookings: asInt(json['bookings']),
        grossMinor: asInt(json['gross_minor']),
        commissionMinor: asInt(json['commission_minor']),
        netMinor: asInt(json['net_minor']),
        days: asMapList(json['days']).map(EarningsDay.fromJson).toList(),
      );

  final String currency;
  final String from;
  final String to;
  final int bookings;
  final int grossMinor;
  final int commissionMinor;
  final int netMinor;
  final List<EarningsDay> days;
}
