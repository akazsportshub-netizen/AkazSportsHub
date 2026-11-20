// Unit tests for ringer payments: reading the invite answer and the extra-player share fields.
import 'dart:convert';

import 'package:akaz_sports_hub/api/api_client.dart';
import 'package:akaz_sports_hub/api/models.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const _json = {'content-type': 'application/json'};

void main() {
  test('an accepted invite carries the booking and the share to pay', () async {
    final client = MockClient((request) async {
      expect(request.url.path, '/v1/ringer-invites/i-1/respond');
      return http.Response(
        jsonEncode({'invite_id': 'i-1', 'status': 'ACCEPTED', 'booking_id': 'b-1', 'share_id': 's-1', 'amount_minor': 3333, 'currency': 'QAR'}),
        200,
        headers: _json,
      );
    });
    final api = ApiClient(baseUrl: 'http://api.test', httpClient: client);
    final answer = await api.respondToInvite('i-1', accept: true);
    expect(answer.accepted, isTrue);
    expect(answer.bookingId, 'b-1');
    expect(answer.amountMinor, 3333);
    expect(answer.currency, 'QAR');
  });

  test('a declined invite has no booking', () async {
    final client = MockClient((_) async => http.Response(jsonEncode({'invite_id': 'i-1', 'status': 'DECLINED'}), 200, headers: _json));
    final api = ApiClient(baseUrl: 'http://api.test', httpClient: client);
    final answer = await api.respondToInvite('i-1', accept: false);
    expect(answer.accepted, isFalse);
    expect(answer.bookingId, isNull);
  });

  test('a share knows when it belongs to an extra player and when to pay by', () {
    final share = Share.fromJson({
      'id': 's-1',
      'user_id': 'u-1',
      'full_name': 'Omar',
      'amount_minor': 3333,
      'currency': 'QAR',
      'status': 'PENDING',
      'is_ringer': true,
      'pay_by': '2026-11-20T18:15:00.000Z',
    });
    expect(share.isRinger, isTrue);
    expect(share.payBy, DateTime.utc(2026, 11, 20, 18, 15));
  });

  test('an ordinary share is not an extra player', () {
    final share = Share.fromJson({'id': 's-2', 'user_id': 'u-2', 'full_name': 'Sara', 'amount_minor': 5000, 'currency': 'QAR', 'status': 'PAID'});
    expect(share.isRinger, isFalse);
    expect(share.payBy, isNull);
  });
}
