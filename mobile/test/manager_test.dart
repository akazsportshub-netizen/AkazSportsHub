// Unit tests for the venue manager console: money entry, venue-time conversion, API calls, and parsing.
import 'dart:convert';

import 'package:akaz_sports_hub/api/api_client.dart';
import 'package:akaz_sports_hub/util/format.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(Object body) => http.Response(jsonEncode(body), 200, headers: {'content-type': 'application/json'});

void main() {
  group('price entry', () {
    test('turns typed prices into minor units', () {
      expect(parseMinor('250', 'QAR'), 25000);
      expect(parseMinor('250.5', 'QAR'), 25050);
      expect(parseMinor('250,50', 'QAR'), 25050);
      expect(parseMinor('12.345', 'BHD'), 12345);
    });

    test('refuses what a currency cannot hold', () {
      expect(parseMinor('250.555', 'QAR'), isNull);
      expect(parseMinor('0', 'QAR'), isNull);
      expect(parseMinor('-5', 'QAR'), isNull);
      expect(parseMinor('abc', 'QAR'), isNull);
      expect(parseMinor('', 'QAR'), isNull);
    });

    test('shows minor units as typed', () {
      expect(minorToPlain(25000, 'QAR'), '250.00');
      expect(minorToPlain(12345, 'BHD'), '12.345');
      expect(parseMinor(minorToPlain(9050, 'QAR'), 'QAR'), 9050);
    });
  });

  test('venue wall-clock time converts to the right UTC instant and back', () {
    final instant = fromVenueTime(DateTime(2026, 11, 20, 18, 0), 'Asia/Qatar');
    expect(instant, DateTime.utc(2026, 11, 20, 15, 0));
    expect(toVenueTime(instant, 'Asia/Qatar').hour, 18);
    expect(fromVenueTime(DateTime(2026, 11, 20, 18, 0), 'Asia/Dubai'), DateTime.utc(2026, 11, 20, 14, 0));
  });

  test('createBlock sends UTC times and leaves out an empty reason', () async {
    late http.Request seen;
    final api = ApiClient(
      baseUrl: 'http://api.test',
      httpClient: MockClient((request) async {
        seen = request;
        return _json({'id': 'b1'});
      }),
    );
    await api.createBlock('court-1', startsAt: DateTime.utc(2026, 11, 20, 15), endsAt: DateTime.utc(2026, 11, 20, 17), reason: '  ');
    expect(seen.method, 'POST');
    expect(seen.url.path, '/v1/manager/courts/court-1/blocks');
    expect(jsonDecode(seen.body), {'starts_at': '2026-11-20T15:00:00.000Z', 'ends_at': '2026-11-20T17:00:00.000Z'});
  });

  test('updateCourt sends only the given fields, to the right place', () async {
    late http.Request seen;
    final api = ApiClient(
      baseUrl: 'http://api.test',
      httpClient: MockClient((request) async {
        seen = request;
        return _json({'ok': true});
      }),
    );
    await api.updateCourt('court-1', {'price_per_hour_minor': 9000});
    expect(seen.method, 'PATCH');
    expect(seen.url.path, '/v1/manager/courts/court-1');
    expect(jsonDecode(seen.body), {'price_per_hour_minor': 9000});
  });

  test('earnings and bookings are read from the API', () async {
    final api = ApiClient(
      baseUrl: 'http://api.test',
      httpClient: MockClient((request) async {
        if (request.url.path.endsWith('/earnings')) {
          expect(request.url.queryParameters, {'from': '2026-11-01', 'to': '2026-11-20'});
          return _json({
            'currency': 'QAR', 'from': '2026-11-01', 'to': '2026-11-20', 'bookings': 3,
            'gross_minor': 30000, 'commission_minor': 3000, 'net_minor': 27000,
            'days': [{'day': '2026-11-19', 'bookings': 3, 'gross_minor': 30000, 'commission_minor': 3000, 'net_minor': 27000}],
          });
        }
        return _json([
          {
            'id': 'b1', 'court_id': 'c1', 'court_name': 'Court 1', 'sport': 'PADEL',
            'starts_at': '2026-11-20T15:00:00.000Z', 'ends_at': '2026-11-20T16:00:00.000Z',
            'status': 'CONFIRMED', 'total_minor': 12000, 'currency': 'QAR', 'organizer_name': 'Omar',
            'organizer_phone': '+97455500010', 'shares_total': 4, 'shares_paid': '4',
          },
        ]);
      }),
    );
    final earnings = await api.managerEarnings('v1', from: '2026-11-01', to: '2026-11-20');
    expect(earnings.netMinor, 27000);
    expect(earnings.days.single.bookings, 3);
    final bookings = await api.managerBookings('v1');
    expect(bookings.single.sharesPaid, 4);
    expect(bookings.single.isCancellable, isTrue);
  });
}
