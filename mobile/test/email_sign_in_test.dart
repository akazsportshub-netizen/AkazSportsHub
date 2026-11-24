// Unit tests for email sign-in: address cleaning and the requests the app sends.
import 'dart:convert';

import 'package:akaz_sports_hub/api/api_client.dart';
import 'package:akaz_sports_hub/screens/email_sign_in_screen.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const _json = {'content-type': 'application/json'};

void main() {
  test('normalizeSignInEmail cleans good addresses and refuses bad ones', () {
    expect(normalizeSignInEmail('  Omar@Example.COM '), 'omar@example.com');
    expect(normalizeSignInEmail('omar'), isNull);
    expect(normalizeSignInEmail('omar@example'), isNull);
    expect(normalizeSignInEmail(''), isNull);
  });

  test('requestEmailCode posts the address and language', () async {
    late http.Request seen;
    final client = MockClient((request) async {
      seen = request;
      return http.Response(jsonEncode({'sent': true, 'expires_in': 300}), 200, headers: _json);
    });
    await ApiClient(baseUrl: 'http://api.test', httpClient: client).requestEmailCode('omar@example.com', locale: 'ar');
    expect(seen.url.path, '/v1/auth/email/request');
    expect(jsonDecode(seen.body), {'email': 'omar@example.com', 'locale': 'ar'});
  });

  test('verifyEmailCode returns tokens and an email-only user, and sends name and country only when given', () async {
    final bodies = <Map<String, dynamic>>[];
    final client = MockClient((request) async {
      bodies.add(jsonDecode(request.body) as Map<String, dynamic>);
      return http.Response(
        jsonEncode({
          'access_token': 'tok',
          'refresh_token': 'ref',
          'expires_in': 3600,
          'user': {'id': 'u-1', 'full_name': 'Omar', 'country_code': 'QA', 'roles': ['PLAYER'], 'phone_e164': null, 'email': 'omar@example.com'},
        }),
        200,
        headers: _json,
      );
    });
    final api = ApiClient(baseUrl: 'http://api.test', httpClient: client);
    final first = await api.verifyEmailCode('omar@example.com', '123456');
    expect(first.token, 'tok');
    expect(first.refreshToken, 'ref');
    expect(first.user.phone, isNull);
    await api.verifyEmailCode('omar@example.com', '123456', fullName: ' Omar ', country: 'QA');
    expect(bodies[0], {'email': 'omar@example.com', 'code': '123456'});
    expect(bodies[1], {'email': 'omar@example.com', 'code': '123456', 'full_name': 'Omar', 'country': 'QA'});
  });
}
