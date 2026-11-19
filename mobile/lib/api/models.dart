/// Data returned by the AKAZ Sports Hub API (`/v1`). Field names follow the API's
/// snake_case JSON. Parsing is lenient about numbers, which may arrive as int,
/// double or string, so a change in the database driver cannot break the app.
library;

int asInt(Object? value, [int fallback = 0]) {
  if (value is int) return value;
  if (value is num) return value.round();
  if (value is String) return int.tryParse(value) ?? double.tryParse(value)?.round() ?? fallback;
  return fallback;
}

int? asIntOrNull(Object? value) => value == null ? null : asInt(value);

double asDouble(Object? value, [double fallback = 0]) {
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value) ?? fallback;
  return fallback;
}

String asString(Object? value, [String fallback = '']) => value == null ? fallback : value.toString();

String? asStringOrNull(Object? value) => value?.toString();

DateTime asDate(Object? value) => DateTime.parse(asString(value)).toUtc();

DateTime? asDateOrNull(Object? value) => value == null ? null : DateTime.tryParse(value.toString())?.toUtc();

List<String> asStringList(Object? value) =>
    value is List ? value.map((item) => item.toString()).toList() : const <String>[];

Map<String, dynamic> asMap(Object? value) =>
    value is Map ? value.map((key, item) => MapEntry(key.toString(), item)) : <String, dynamic>{};

List<Map<String, dynamic>> asMapList(Object? value) =>
    value is List ? value.map(asMap).toList() : const <Map<String, dynamic>>[];

// ---------------------------------------------------------------------------

class DevUser {
  DevUser({required this.id, required this.fullName, required this.countryCode, required this.roles});

  factory DevUser.fromJson(Map<String, dynamic> json) => DevUser(
        id: asString(json['id']),
        fullName: asString(json['full_name']),
        countryCode: asString(json['country_code']),
        roles: asStringList(json['roles']),
      );

  final String id;
  final String fullName;
  final String countryCode;
  final List<String> roles;

  Map<String, dynamic> toJson() => {'id': id, 'full_name': fullName, 'country_code': countryCode, 'roles': roles};
}

class Venue {
  Venue({
    required this.id,
    required this.name,
    required this.description,
    required this.city,
    required this.address,
    required this.currency,
    required this.timezone,
    required this.requiresTurfFootwear,
    required this.rules,
    required this.distanceM,
    required this.fromPricePerHourMinor,
    required this.sports,
    required this.courts,
  });

  factory Venue.fromJson(Map<String, dynamic> json) => Venue(
        id: asString(json['id']),
        name: asString(json['name']),
        description: asStringOrNull(json['description']),
        city: asString(json['city']),
        address: asStringOrNull(json['address']),
        currency: asString(json['currency'], 'QAR'),
        timezone: asString(json['timezone'], 'Asia/Qatar'),
        requiresTurfFootwear: json['requires_turf_footwear'] == true,
        rules: asMap(json['rules']),
        distanceM: asIntOrNull(json['distance_m']),
        fromPricePerHourMinor: asIntOrNull(json['from_price_per_hour_minor']),
        sports: asStringList(json['sports']),
        courts: asMapList(json['courts']).map(Court.fromJson).toList(),
      );

  final String id;
  final String name;
  final String? description;
  final String city;
  final String? address;
  final String currency;
  final String timezone;
  final bool requiresTurfFootwear;
  final Map<String, dynamic> rules;

  /// Only on search results.
  final int? distanceM;
  final int? fromPricePerHourMinor;
  final List<String> sports;

  /// Only on the venue detail.
  final List<Court> courts;
}

class Court {
  Court({
    required this.id,
    required this.name,
    required this.sport,
    required this.surface,
    required this.capacityPlayers,
    required this.pricePerHourMinor,
    required this.slotMinutes,
    required this.opensAt,
    required this.closesAt,
  });

  factory Court.fromJson(Map<String, dynamic> json) => Court(
        id: asString(json['id']),
        name: asString(json['name']),
        sport: asString(json['sport']),
        surface: asStringOrNull(json['surface']),
        capacityPlayers: asInt(json['capacity_players']),
        pricePerHourMinor: asInt(json['price_per_hour_minor']),
        slotMinutes: asInt(json['slot_minutes'], 60),
        opensAt: asString(json['opens_at']),
        closesAt: asString(json['closes_at']),
      );

  final String id;
  final String name;
  final String sport;
  final String? surface;
  final int capacityPlayers;
  final int pricePerHourMinor;
  final int slotMinutes;
  final String opensAt;
  final String closesAt;
}

class Slot {
  Slot({required this.startsAt, required this.endsAt, required this.priceMinor, required this.currency, required this.available});

  factory Slot.fromJson(Map<String, dynamic> json) => Slot(
        startsAt: asDate(json['starts_at']),
        endsAt: asDate(json['ends_at']),
        priceMinor: asInt(json['price_minor']),
        currency: asString(json['currency'], 'QAR'),
        available: json['available'] == true,
      );

  final DateTime startsAt;
  final DateTime endsAt;
  final int priceMinor;
  final String currency;
  final bool available;
}

class Availability {
  Availability({required this.courtId, required this.date, required this.timezone, required this.slotMinutes, required this.slots});

  factory Availability.fromJson(Map<String, dynamic> json) => Availability(
        courtId: asString(json['court_id']),
        date: asString(json['date']),
        timezone: asString(json['timezone'], 'Asia/Qatar'),
        slotMinutes: asInt(json['slot_minutes'], 60),
        slots: asMapList(json['slots']).map(Slot.fromJson).toList(),
      );

  final String courtId;
  final String date;
  final String timezone;
  final int slotMinutes;
  final List<Slot> slots;
}

class Share {
  Share({
    required this.id,
    required this.userId,
    required this.fullName,
    required this.amountMinor,
    required this.currency,
    required this.status,
    required this.paidAt,
    required this.escrowStatus,
  });

  factory Share.fromJson(Map<String, dynamic> json) => Share(
        id: asString(json['id']),
        userId: asString(json['user_id']),
        fullName: asString(json['full_name']),
        amountMinor: asInt(json['amount_minor']),
        currency: asString(json['currency'], 'QAR'),
        status: asString(json['status']),
        paidAt: asDateOrNull(json['paid_at']),
        escrowStatus: asStringOrNull(json['escrow_status']),
      );

  final String id;
  final String userId;
  final String fullName;
  final int amountMinor;
  final String currency;

  /// PENDING, PAID, REFUNDED or CANCELLED.
  final String status;
  final DateTime? paidAt;
  final String? escrowStatus;

  bool get isPaid => status == 'PAID';
}

/// A booking in full, from `GET /bookings/:id` and `POST /bookings`.
class Booking {
  Booking({
    required this.id,
    required this.status,
    required this.currency,
    required this.totalMinor,
    required this.startsAt,
    required this.endsAt,
    required this.holdExpiresAt,
    required this.organizerUserId,
    required this.courtName,
    required this.sport,
    required this.venueName,
    required this.timezone,
    required this.requiresTurfFootwear,
    required this.freeCancellationHours,
    required this.shares,
  });

  factory Booking.fromJson(Map<String, dynamic> json) => Booking(
        id: asString(json['id']),
        status: asString(json['status']),
        currency: asString(json['currency'], 'QAR'),
        totalMinor: asInt(json['total_minor']),
        startsAt: asDate(json['starts_at']),
        endsAt: asDate(json['ends_at']),
        holdExpiresAt: asDateOrNull(json['hold_expires_at']),
        organizerUserId: asString(json['organizer_user_id']),
        courtName: asString(json['court_name']),
        sport: asString(json['sport']),
        venueName: asString(json['venue_name']),
        timezone: asString(json['timezone'], 'Asia/Qatar'),
        requiresTurfFootwear: json['requires_turf_footwear'] == true,
        freeCancellationHours: asInt(json['free_cancellation_hours'], 24),
        shares: asMapList(json['shares']).map(Share.fromJson).toList(),
      );

  final String id;

  /// HOLD, CONFIRMED, COMPLETED, EXPIRED or CANCELLED.
  final String status;
  final String currency;
  final int totalMinor;
  final DateTime startsAt;
  final DateTime endsAt;
  final DateTime? holdExpiresAt;
  final String organizerUserId;
  final String courtName;
  final String sport;
  final String venueName;
  final String timezone;
  final bool requiresTurfFootwear;
  final int freeCancellationHours;
  final List<Share> shares;

  bool get isHold => status == 'HOLD';
  bool get isConfirmed => status == 'CONFIRMED';
  bool get isClosed => status == 'EXPIRED' || status == 'CANCELLED' || status == 'COMPLETED';
}

/// A row of `GET /bookings/mine`.
class BookingSummary {
  BookingSummary({
    required this.id,
    required this.status,
    required this.currency,
    required this.totalMinor,
    required this.startsAt,
    required this.endsAt,
    required this.courtName,
    required this.venueName,
    required this.timezone,
    required this.isOrganizer,
    required this.myShareMinor,
    required this.myShareStatus,
  });

  factory BookingSummary.fromJson(Map<String, dynamic> json) => BookingSummary(
        id: asString(json['id']),
        status: asString(json['status']),
        currency: asString(json['currency'], 'QAR'),
        totalMinor: asInt(json['total_minor']),
        startsAt: asDate(json['starts_at']),
        endsAt: asDate(json['ends_at']),
        courtName: asString(json['court_name']),
        venueName: asString(json['venue_name']),
        timezone: asString(json['timezone'], 'Asia/Qatar'),
        isOrganizer: json['is_organizer'] == true,
        myShareMinor: asIntOrNull(json['my_share_minor']),
        myShareStatus: asStringOrNull(json['my_share_status']),
      );

  final String id;
  final String status;
  final String currency;
  final int totalMinor;
  final DateTime startsAt;
  final DateTime endsAt;
  final String courtName;
  final String venueName;
  final String timezone;
  final bool isOrganizer;
  final int? myShareMinor;
  final String? myShareStatus;
}

class PaymentStart {
  PaymentStart({required this.attemptId, required this.provider, required this.checkoutUrl, required this.amountMinor, required this.currency});

  factory PaymentStart.fromJson(Map<String, dynamic> json) => PaymentStart(
        attemptId: asString(json['attempt_id']),
        provider: asString(json['provider']),
        checkoutUrl: asString(json['checkout_url']),
        amountMinor: asInt(json['amount_minor']),
        currency: asString(json['currency'], 'QAR'),
      );

  final String attemptId;

  /// mock, tap or checkout.
  final String provider;
  final String checkoutUrl;
  final int amountMinor;
  final String currency;

  bool get isMock => provider == 'mock';
}

/// A row of `GET /ringer-invites/mine`.
class RingerInvite {
  RingerInvite({
    required this.id,
    required this.status,
    required this.distanceM,
    required this.slotsNeeded,
    required this.slotsFilled,
    required this.requestStatus,
    required this.startsAt,
    required this.endsAt,
    required this.courtName,
    required this.sport,
    required this.venueName,
    required this.city,
    required this.timezone,
    required this.requiresTurfFootwear,
  });

  factory RingerInvite.fromJson(Map<String, dynamic> json) => RingerInvite(
        id: asString(json['id']),
        status: asString(json['status']),
        distanceM: asIntOrNull(json['distance_m']),
        slotsNeeded: asInt(json['slots_needed']),
        slotsFilled: asInt(json['slots_filled']),
        requestStatus: asString(json['request_status']),
        startsAt: asDate(json['starts_at']),
        endsAt: asDate(json['ends_at']),
        courtName: asString(json['court_name']),
        sport: asString(json['sport']),
        venueName: asString(json['venue_name']),
        city: asString(json['city']),
        timezone: asString(json['timezone'], 'Asia/Qatar'),
        requiresTurfFootwear: json['requires_turf_footwear'] == true,
      );

  final String id;

  /// SENT, ACCEPTED, DECLINED or EXPIRED.
  final String status;
  final int? distanceM;
  final int slotsNeeded;
  final int slotsFilled;
  final String requestStatus;
  final DateTime startsAt;
  final DateTime endsAt;
  final String courtName;
  final String sport;
  final String venueName;
  final String city;
  final String timezone;
  final bool requiresTurfFootwear;

  bool get canRespond => status == 'SENT' && requestStatus == 'OPEN';
}
