import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'academy_models.dart';
import 'manager_models.dart';
import 'models.dart';
import 'rating_models.dart';

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

  /// Sent to /auth/refresh when the access token has expired. Replaced by every refresh.
  String? refreshToken;

  /// Called after a refresh, so the app can save the new tokens.
  void Function(String accessToken, String refreshToken)? onTokensRefreshed;

  /// Called when the API rejects the token, so the app can return to sign-in.
  void Function()? onUnauthenticated;

  Future<bool>? _refreshing;

  static const Duration _timeout = Duration(seconds: 20);

  // ---- sign-in (development only) -----------------------------------------

  Future<List<DevUser>> devUsers() async =>
      asMapList(await _send('GET', '/dev/auth/users')).map(DevUser.fromJson).toList();

  Future<({String token, String? refreshToken, DevUser user})> devSignIn(String userId) async {
    final body = asMap(await _send('POST', '/dev/auth/token', body: {'user_id': userId}));
    return (token: asString(body['access_token']), refreshToken: asStringOrNull(body['refresh_token']), user: DevUser.fromJson(asMap(body['user'])));
  }

  // ---- sign-in with a phone number ----------------------------------------

  /// Sends a six-digit code by SMS. Throws RATE_LIMITED after too many requests.
  Future<void> requestSignInCode(String phone, {String? locale}) async {
    await _send('POST', '/auth/otp/request', body: {'phone': phone, if (locale != null) 'locale': locale});
  }

  /// Exchanges the code for a token. A first-time number needs [fullName]; without it the
  /// server answers NAME_REQUIRED and keeps the code usable.
  Future<({String token, String? refreshToken, DevUser user})> verifySignInCode(String phone, String code, {String? fullName, String? locale}) async {
    final body = asMap(await _send('POST', '/auth/otp/verify', body: {
      'phone': phone,
      'code': code,
      if (fullName != null && fullName.trim().isNotEmpty) 'full_name': fullName.trim(),
      if (locale != null) 'locale': locale,
    }));
    return (token: asString(body['access_token']), refreshToken: asStringOrNull(body['refresh_token']), user: DevUser.fromJson(asMap(body['user'])));
  }

  /// Ends this device's session on the server. Never throws: signing out must always work.
  Future<void> revokeRefreshToken(String token) async {
    try {
      await _send('POST', '/auth/logout', body: {'refresh_token': token});
    } on ApiException {
      // Offline or already expired: the token stops working by itself in time.
    }
  }

  /// One refresh at a time, so several requests failing together do not use the same token twice.
  Future<bool> _refreshTokens() => _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);

  /// True when new tokens were stored; false when the server no longer accepts the refresh token.
  /// Throws ApiException when the server cannot be reached, so a bad connection never signs anyone out.
  Future<bool> _doRefresh() async {
    final token = refreshToken;
    if (token == null) return false;
    final http.Response response;
    try {
      response = await _http
          .post(
            Uri.parse('$baseUrl/v1/auth/refresh'),
            headers: {'Accept': 'application/json', 'Content-Type': 'application/json'},
            body: jsonEncode({'refresh_token': token}),
          )
          .timeout(_timeout);
    } on TimeoutException {
      throw ApiException('The server took too long to answer. Is the backend running?');
    } on Exception {
      throw ApiException('Could not reach the server at $baseUrl. Check that Docker is running and the address is right.');
    }
    if (response.statusCode >= 500) throw ApiException('The server had a problem. Please try again.', statusCode: response.statusCode);
    if (response.statusCode != 200) {
      refreshToken = null;
      return false;
    }
    final body = asMap(jsonDecode(utf8.decode(response.bodyBytes)));
    accessToken = asString(body['access_token']);
    refreshToken = asString(body['refresh_token']);
    onTokensRefreshed?.call(accessToken!, refreshToken!);
    return true;
  }

  // ---- sign-in with an email address --------------------------------------

  /// Emails a six-digit code. Throws RATE_LIMITED after too many requests.
  Future<void> requestEmailCode(String email, {String? locale}) async {
    await _send('POST', '/auth/email/request', body: {'email': email, if (locale != null) 'locale': locale});
  }

  /// Exchanges the code for tokens. A first-time address needs [fullName] and [country]; without
  /// them the server answers NAME_REQUIRED or COUNTRY_REQUIRED and keeps the code usable.
  Future<({String token, String? refreshToken, DevUser user})> verifyEmailCode(String email, String code, {String? fullName, String? country, String? locale}) async {
    final body = asMap(await _send('POST', '/auth/email/verify', body: {
      'email': email,
      'code': code,
      if (fullName != null && fullName.trim().isNotEmpty) 'full_name': fullName.trim(),
      if (country != null && fullName != null && fullName.trim().isNotEmpty) 'country': country,
      if (locale != null) 'locale': locale,
    }));
    return (token: asString(body['access_token']), refreshToken: asStringOrNull(body['refresh_token']), user: DevUser.fromJson(asMap(body['user'])));
  }

  /// Saves the player's home area so nearby games can invite them. The server rounds it to about 100 m.
  Future<void> saveHomeLocation({required double lat, required double lng, bool? openToRinger}) async {
    await _send('PATCH', '/users/me/location', body: {
      'lat': lat,
      'lng': lng,
      if (openToRinger != null) 'open_to_ringer': openToRinger,
    });
  }

  /// Sets the language for the messages we send this player (the app switches its own screens).
  Future<void> setLanguage(String locale) async {
    await _send('PATCH', '/users/me/language', body: {'locale': locale});
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

  /// Holds the slot for 15 minutes. With no friends, the caller pays the whole booking;
  /// with friends, the price is split equally and the caller is listed first.
  Future<Booking> createBooking({
    required String courtId,
    required DateTime startsAt,
    required DateTime endsAt,
    List<Friend> friends = const [],
  }) async {
    final body = <String, Object?>{
      'court_id': courtId,
      'starts_at': startsAt.toUtc().toIso8601String(),
      'ends_at': endsAt.toUtc().toIso8601String(),
      if (friends.isNotEmpty)
        'shares': [
          {'user_id': userId},
          for (final friend in friends) {'user_id': friend.id},
        ],
    };
    return Booking.fromJson(asMap(await _send('POST', '/bookings', body: body)));
  }

  /// Finds an AKAZ player by phone number (international format). Throws USER_NOT_FOUND if there is none.
  Future<Friend> lookupUser(String phone) async =>
      Friend.fromJson(asMap(await _send('GET', '/users/lookup', query: {'phone': phone})));

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

  Future<InviteAnswer> respondToInvite(String inviteId, {required bool accept}) async =>
      InviteAnswer.fromJson(asMap(await _send('POST', '/ringer-invites/$inviteId/respond', body: {'accept': accept})));

  // ---- matches (referee) ---------------------------------------------------

  /// Needs the REFEREE, VENUE_MANAGER or ADMIN role. Returns the new match id.
  Future<String> createMatch({
    required String courtId,
    required String homeTeamName,
    required String awayTeamName,
    required DateTime scheduledStart,
    String? bookingId,
  }) async {
    final body = asMap(await _send('POST', '/matches', body: {
      'court_id': courtId,
      if (bookingId != null) 'booking_id': bookingId,
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

  // ---- skill ratings and teams ---------------------------------------------

  Future<MyRating> myRating() async => MyRating.fromJson(asMap(await _send('GET', '/ratings/me')));

  /// Bookings around now on a court that a referee can start a rated match from.
  Future<List<CandidateBooking>> refereeBookings(String courtId) async =>
      asMapList(await _send('GET', '/referee/bookings', query: {'court_id': courtId})).map(CandidateBooking.fromJson).toList();

  Future<MatchTeams> matchTeams(String matchId) async => MatchTeams.fromJson(asMap(await _send('GET', '/matches/$matchId/teams')));

  /// Splits the booking's paid players into two teams of similar strength.
  Future<MatchTeams> autoBalanceTeams(String matchId) async =>
      MatchTeams.fromJson(asMap(await _send('POST', '/matches/$matchId/teams/auto')));

  Future<MatchTeams> setTeams(String matchId, Map<String, String> sideByUserId) async => MatchTeams.fromJson(asMap(await _send(
        'PUT',
        '/matches/$matchId/teams',
        body: {
          'assignments': [for (final entry in sideByUserId.entries) {'user_id': entry.key, 'side': entry.value}],
        },
      )));

  // ---- academy -------------------------------------------------------------

  Future<List<AcademyGroup>> academyGroups({String? venueId}) async => asMapList(
          await _send('GET', '/academy/groups', query: {if (venueId != null) 'venue_id': venueId}))
      .map(AcademyGroup.fromJson)
      .toList();

  Future<List<Child>> myChildren() async => asMapList(await _send('GET', '/academy/children')).map(Child.fromJson).toList();

  Future<Child> addChild(String fullName, {String? ageGroup}) async {
    final body = asMap(await _send(
      'POST',
      '/academy/children',
      body: {'full_name': fullName, if (ageGroup != null && ageGroup.isNotEmpty) 'age_group': ageGroup},
    ));
    return Child(id: asString(body['id']), fullName: fullName, ageGroup: ageGroup);
  }

  Future<void> enrolInGroup(String groupId, {String? childId}) async {
    await _send('POST', '/academy/groups/$groupId/enrol', body: {if (childId != null) 'dependent_id': childId});
  }

  Future<List<MyEnrolment>> myEnrolments() async => asMapList(await _send('GET', '/academy/enrolments')).map(MyEnrolment.fromJson).toList();

  Future<EnrolmentDetail> enrolmentDetail(String id) async => EnrolmentDetail.fromJson(asMap(await _send('GET', '/academy/enrolments/$id')));

  Future<void> leaveGroup(String enrolmentId) async {
    await _send('POST', '/academy/enrolments/$enrolmentId/leave');
  }

  Future<List<AcademyGroup>> managerAcademyGroups(String venueId) async =>
      asMapList(await _send('GET', '/manager/venues/$venueId/academy/groups')).map(AcademyGroup.fromJson).toList();

  Future<void> createAcademyGroup(String venueId, Map<String, Object?> fields) async {
    await _send('POST', '/manager/venues/$venueId/academy/groups', body: fields);
  }

  Future<void> updateAcademyGroup(String groupId, Map<String, Object?> fields) async {
    await _send('PATCH', '/manager/academy/groups/$groupId', body: fields);
  }

  Future<List<RosterEntry>> academyRoster(String groupId) async =>
      asMapList(await _send('GET', '/manager/academy/groups/$groupId/roster')).map(RosterEntry.fromJson).toList();

  Future<List<AcademySession>> academySessions(String groupId) async =>
      asMapList(await _send('GET', '/manager/academy/groups/$groupId/sessions')).map(AcademySession.fromJson).toList();

  Future<void> moreAcademySessions(String groupId, int weeks) async {
    await _send('POST', '/manager/academy/groups/$groupId/sessions', body: {'weeks': weeks});
  }

  Future<void> updateAcademySession(String sessionId, {bool? cancelled}) async {
    await _send('PATCH', '/manager/academy/sessions/$sessionId', body: {if (cancelled != null) 'cancelled': cancelled});
  }

  Future<AttendanceSheet> academyAttendance(String sessionId) async =>
      AttendanceSheet.fromJson(asMap(await _send('GET', '/manager/academy/sessions/$sessionId/attendance')));

  Future<void> markAcademyAttendance(String sessionId, Map<String, String> statusByEnrolment) async {
    await _send('PUT', '/manager/academy/sessions/$sessionId/attendance', body: {
      'marks': [for (final entry in statusByEnrolment.entries) {'enrolment_id': entry.key, 'status': entry.value}],
    });
  }

  /// Creates the month's fee for every active player who does not have one yet. Returns how many were created.
  Future<int> createAcademyInvoices(String venueId, String month) async =>
      asInt(asMap(await _send('POST', '/manager/venues/$venueId/academy/invoices', body: {'month': month}))['created']);

  Future<List<AcademyInvoice>> academyInvoices(String venueId, {String? month, String? status}) async => asMapList(await _send(
          'GET', '/manager/venues/$venueId/academy/invoices',
          query: {if (month != null) 'month': month, if (status != null) 'status': status}))
      .map(AcademyInvoice.fromJson)
      .toList();

  Future<void> payAcademyInvoice(String invoiceId, String method) async {
    await _send('POST', '/manager/academy/invoices/$invoiceId/pay', body: {'method': method});
  }

  Future<void> waiveAcademyInvoice(String invoiceId) async {
    await _send('POST', '/manager/academy/invoices/$invoiceId/waive', body: {});
  }

  // ---- venue manager -------------------------------------------------------

  Future<List<ManagerVenue>> managerVenues() async => asMapList(await _send('GET', '/manager/venues')).map(ManagerVenue.fromJson).toList();

  Future<List<ManagerBooking>> managerBookings(String venueId) async =>
      asMapList(await _send('GET', '/manager/venues/$venueId/bookings')).map(ManagerBooking.fromJson).toList();

  Future<List<ManagerCourt>> managerCourts(String venueId) async =>
      asMapList(await _send('GET', '/manager/venues/$venueId/courts')).map(ManagerCourt.fromJson).toList();

  Future<void> createCourt(String venueId, Map<String, Object?> fields) async {
    await _send('POST', '/manager/venues/$venueId/courts', body: fields);
  }

  /// Send only the fields that changed: touching hours or slot length is refused while bookings exist.
  Future<void> updateCourt(String courtId, Map<String, Object?> fields) async {
    await _send('PATCH', '/manager/courts/$courtId', body: fields);
  }

  Future<List<CourtBlock>> managerBlocks(String venueId) async =>
      asMapList(await _send('GET', '/manager/venues/$venueId/blocks')).map(CourtBlock.fromJson).toList();

  Future<void> createBlock(String courtId, {required DateTime startsAt, required DateTime endsAt, String? reason}) async {
    await _send('POST', '/manager/courts/$courtId/blocks', body: {
      'starts_at': startsAt.toUtc().toIso8601String(),
      'ends_at': endsAt.toUtc().toIso8601String(),
      if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
    });
  }

  Future<void> deleteBlock(String blockId) async {
    await _send('DELETE', '/manager/blocks/$blockId');
  }

  Future<Earnings> managerEarnings(String venueId, {String? from, String? to}) async => Earnings.fromJson(asMap(await _send(
        'GET',
        '/manager/venues/$venueId/earnings',
        query: {if (from != null) 'from': from, if (to != null) 'to': to},
      )));

  // ---- transport -----------------------------------------------------------

  Future<Object?> _send(String method, String path, {Map<String, String>? query, Map<String, Object?>? body, bool retryAfterRefresh = true}) async {
    final sentWith = accessToken;
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
    if (error.isUnauthenticated && retryAfterRefresh && sentWith != null && !path.startsWith('/auth/')) {
      // Someone else may have refreshed while this request was in flight: then just retry with the new token.
      if (accessToken != sentWith || await _refreshTokens()) {
        return _send(method, path, query: query, body: body, retryAfterRefresh: false);
      }
    }
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
