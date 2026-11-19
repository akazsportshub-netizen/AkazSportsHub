import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'models.dart';

/// An error the app can show. [code] is the API's stable error code (SLOT_TAKEN,
/// HOLD_EXPIRED, …) when there is one; [message] is always readable as it is.
class ApiException implements Exception {
  ApiException(this.message, {this.code, this.statusCode});

  final String message;
  final String? code;
  final int? statusCode;

  bool get isUnauthenticated => statusCode == 401;

  @override
  String toString() => message;
}

/// Thin client for the AKAZ Sports Hub API. Every path is relative to `<baseUrl>/v1`.
class ApiClient {
  ApiClient({required String baseUrl, http.Client? httpClient})
      : baseUrl = baseUrl.replaceAll(RegExp(r'/+$'), ''),
        _http = httpClient ?? http.Client();

  final String baseUrl;
  final http.Client _http;

  /// Set after sign-in; sent as `Authorization: Bearer …` on every request.
  String? accessToken;

  /// The signed-in user's id, so screens can tell which share is theirs.
  String? userId;

  /// Called when the API rejects the token, so the app can return to sign-in.
  void Function()? onUnauthenticated;

  static const Duration _timeout = Duration(seconds: 20);

  // ---- sign-in (development only) -----------------------------------------

  Future<List<DevUser>> devUsers() async =>
      asMapList(await _send('GET', '/dev/auth/users')).map(DevUser.fromJson).toList();

  Future<({String token, DevUser user})> devSignIn(String userId) async {
    final body = asMap(await _send('POST', '/dev/auth/token', body: {'user_id': userId}));
    return (token: asString(body['access_token']), user: DevUser.fromJson(asMap(body['user'])));
  }

  // ---- discovery -----------------------------------------------------------

  Future<List<Venue>> nearbyVenues({required double lat, required double lng, double radiusKm = 25, String? sport}) async {
    final query = <String, String>{
      'lat': lat.toString(),
      'lng': lng.toString(),
      'radius_km': radiusKm.toString(),
      if (sport != null) 'sport': sport,
    };
    return asMapList(await _send('GET', '/venues/nearby', query: query)).map(Venue.fromJson).toList();
  }

  Future<Venue> venue(String venueId) async => Venue.fromJson(asMap(await _send('GET', '/venues/$venueId')));

  Future<Availability> availability(String courtId, String isoDate) async =>
      Availability.fromJson(asMap(await _send('GET', '/courts/$courtId/availability', query: {'date': isoDate})));

  // ---- bookings ------------------------------------------------------------

  /// Holds the slot for 15 minutes. With no shares, the caller pays the whole booking.
  Future<Booking> createBooking({required String courtId, required DateTime startsAt, required DateTime endsAt}) async {
    final body = {
      'court_id': courtId,
      'starts_at': startsAt.toUtc().toIso8601String(),
      'ends_at': endsAt.toUtc().toIso8601String(),
    };
    return Booking.fromJson(asMap(await _send('POST', '/bookings', body: body)));
  }

  Future<List<BookingSummary>> myBookings() async =>
      asMapList(await _send('GET', '/bookings/mine')).map(BookingSummary.fromJson).toList();

  Future<Booking> booking(String bookingId) async => Booking.fromJson(asMap(await _send('GET', '/bookings/$bookingId')));

  Future<PaymentStart> startPayment(String bookingId, String shareId) async =>
      PaymentStart.fromJson(asMap(await _send('POST', '/bookings/$bookingId/shares/$shareId/pay', body: {'flow': 'CHARGE'})));

  Future<void> cancelBooking(String bookingId, {String? reason}) async {
    await _send('POST', '/bookings/$bookingId/cancel', body: {if (reason != null && reason.isNotEmpty) 'reason': reason});
  }

  /// Development only: plays the payment provider's part for a mock payment.
  Future<void> simulateMockPayment(String attemptId, {required bool succeed}) async {
    await _send('POST', '/dev/payments/attempts/$attemptId/simulate', body: {'outcome': succeed ? 'CAPTURED' : 'FAILED'});
  }

  // ---- ringers -------------------------------------------------------------

  Future<void> requestRingers(String bookingId, int slotsNeeded) async {
    await _send('POST', '/bookings/$bookingId/ringer-requests', body: {'slots_needed': slotsNeeded});
  }

  Future<List<RingerInvite>> myInvites() async =>
      asMapList(await _send('GET', '/ringer-invites/mine')).map(RingerInvite.fromJson).toList();

  Future<String> respondToInvite(String inviteId, {required bool accept}) async {
    final body = asMap(await _send('POST', '/ringer-invites/$inviteId/respond', body: {'accept': accept}));
    return asString(body['status']);
  }

  // ---- matches (referee) ---------------------------------------------------

  /// Needs the REFEREE, VENUE_MANAGER or ADMIN role. Returns the new match id.
  Future<String> createMatch({
    required String courtId,
    required String homeTeamName,
    required String awayTeamName,
    required DateTime scheduledStart,
  }) async {
    final body = asMap(await _send('POST', '/matches', body: {
      'court_id': courtId,
      'home_team_name': homeTeamName,
      'away_team_name': awayTeamName,
      'scheduled_start': DateTime.fromMillisecondsSinceEpoch(scheduledStart.millisecondsSinceEpoch, isUtc: true).toIso8601String(),
    }));
    return asString(body['id']);
  }

  /// Sends recorded events. Safe to repeat: the API answers with the ids it stored
  /// (`accepted`), already had (`duplicates`) or refused (`rejected`), and the server's clock.
  Future<Map<String, dynamic>> syncMatchEvents(String matchId, {required String deviceId, required List<Map<String, Object?>> events}) async =>
      asMap(await _send('POST', '/matches/$matchId/events/batch', body: {'device_id': deviceId, 'events': events}));

  // ---- transport -----------------------------------------------------------

  Future<Object?> _send(String method, String path, {Map<String, String>? query, Map<String, Object?>? body}) async {
    final uri = Uri.parse('$baseUrl/v1$path').replace(queryParameters: query == null || query.isEmpty ? null : query);
    final headers = <String, String>{
      'Accept': 'application/json',
      if (body != null) 'Content-Type': 'application/json',
      if (accessToken != null) 'Authorization': 'Bearer $accessToken',
    };

    final http.Response response;
    try {
      final request = http.Request(method, uri)..headers.addAll(headers);
      if (body != null) request.body = jsonEncode(body);
      response = await http.Response.fromStream(await _http.send(request).timeout(_timeout));
    } on TimeoutException {
      throw ApiException('The server took too long to answer. Is the backend running?');
    } on Exception {
      throw ApiException('Could not reach the server at $baseUrl. Check that Docker is running and the address is right.');
    }

    Object? decoded;
    if (response.body.isNotEmpty) {
      try {
        decoded = jsonDecode(utf8.decode(response.bodyBytes));
      } on FormatException {
        decoded = null;
      }
    }

    if (response.statusCode >= 200 && response.statusCode < 300) return decoded;

    final error = _readError(decoded, response.statusCode);
    if (error.isUnauthenticated) onUnauthenticated?.call();
    throw error;
  }

  /// The API answers `{code, message}`; validation failures answer `{message: [...], error, statusCode}`.
  static ApiException _readError(Object? decoded, int statusCode) {
    final body = asMap(decoded);
    final rawMessage = body['message'];
    final message = rawMessage is List
        ? rawMessage.join('\n')
        : (rawMessage?.toString() ?? 'Something went wrong (HTTP $statusCode).');
    return ApiException(message, code: asStringOrNull(body['code']), statusCode: statusCode);
  }
}
