// Unit tests for split-pay: phone cleaning, equal shares, and the requests the app sends.
import 'dart:convert';

import 'package:akaz_sports_hub/api/api_client.dart';
import 'package:akaz_sports_hub/api/models.dart';
import 'package:akaz_sports_hub/screens/hold_dialog.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const _json = {'content-type': 'application/json'};

void main() {
  group('normalizePhone', () {
    test('accepts international numbers and ignores spaces and dashes', () {
      expect(normalizePhone('+974 5551-2345'), '+97455512345');
    });

    test('refuses numbers without a country code or too short', () {
      expect(normalizePhone('55512345'), isNull);
      expect(normalizePhone('+123'), isNull);
      expect(normalizePhone('+0974555123'), isNull);
    });
  });

  group('equalShares', () {
    test('adds up to the total, with the odd units on the first people', () {
      expect(equalShares(10000, 4), [2500, 2500, 2500, 2500]);
      expect(equalShares(10001, 3), [3334, 3334, 3333]);
      expect(equalShares(10001, 3).reduce((a, b) => a + b), 10001);
    });

    test('one person pays everything', () {
      expect(equalShares(8000, 1), [8000]);
    });
  });

  group('requests', () {
    test('lookupUser sends the + escaped and reads the answer', () async {
      late Uri seen;
      final client = MockClient((request) async {
        seen = request.url;
        return http.Response(jsonEncode({'id': 'u-2', 'full_name': 'Sara'}), 200, headers: _json);
      });
      final api = ApiClient(baseUrl: 'http://api.test', httpClient: client);
      final friend = await api.lookupUser('+97455512345');
      expect(seen.path, '/v1/users/lookup');
      expect(seen.toString(), contains('phone=%2B97455512345'));
      expect(friend.fullName, 'Sara');
    });

    test('createBooking lists the organizer first, then the friends', () async {
      Map<String, dynamic>? sent;
      final client = MockClient((request) async {
        sent = jsonDecode(request.body) as Map<String, dynamic>;
        return http.Response('{"error":"stop"}', 500, headers: _json);
      });
      final api = ApiClient(baseUrl: 'http://api.test', httpClient: client)..userId = 'me';
      final friends = [Friend(id: 'a', fullName: 'A'), Friend(id: 'b', fullName: 'B')];
      try {
        await api.createBooking(courtId: 'c', startsAt: DateTime.utc(2026, 11, 21, 15), endsAt: DateTime.utc(2026, 11, 21, 16), friends: friends);
      } on ApiException {
        // The fake server refuses on purpose; only the request matters here.
      }
      expect((sent!['shares'] as List).map((s) => (s as Map)['user_id']), ['me', 'a', 'b']);
    });

    test('createBooking sends no shares when paying alone', () async {
      Map<String, dynamic>? sent;
      final client = MockClient((request) async {
        sent = jsonDecode(request.body) as Map<String, dynamic>;
        return http.Response('{"error":"stop"}', 500, headers: _json);
      });
      final api = ApiClient(baseUrl: 'http://api.test', httpClient: client)..userId = 'me';
      try {
        await api.createBooking(courtId: 'c', startsAt: DateTime.utc(2026, 11, 21, 15), endsAt: DateTime.utc(2026, 11, 21, 16));
      } on ApiException {
        // Expected.
      }
      expect(sent!.containsKey('shares'), isFalse);
    });
  });
}
