// Unit tests for phone sign-in: number cleaning and the requests the app sends.
import 'dart:convert';

import 'package:akaz_sports_hub/api/api_client.dart';
import 'package:akaz_sports_hub/screens/phone_sign_in_screen.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const _json = {'content-type': 'application/json'};

void main() {
  test('normalizeSignInPhone cleans good numbers and refuses bad ones', () {
    expect(normalizeSignInPhone('+974 5550-0010'), '+97455500010');
    expect(normalizeSignInPhone('55500010'), isNull);
    expect(normalizeSignInPhone('+123'), isNull);
  });

  test('requestSignInCode posts the number', () async {
    Map<String, dynamic>? sent;
    final client = MockClient((request) async {
      expect(request.url.path, '/v1/auth/otp/request');
      sent = jsonDecode(request.body) as Map<String, dynamic>;
      return http.Response(jsonEncode({'sent': true, 'expires_in': 300}), 200, headers: _json);
    });
    await ApiClient(baseUrl: 'http://api.test', httpClient: client).requestSignInCode('+97455500010');
    expect(sent, {'phone': '+97455500010'});
  });

  test('verifySignInCode returns the token and user, and sends the name only when given', () async {
    final bodies = <Map<String, dynamic>>[];
    final client = MockClient((request) async {
      bodies.add(jsonDecode(request.body) as Map<String, dynamic>);
      return http.Response(
        jsonEncode({
          'access_token': 'tok',
          'expires_in': 43200,
          'user': {'id': 'u-1', 'full_name': 'Omar', 'country_code': 'QA', 'roles': ['PLAYER'], 'phone_e164': '+97455500010'},
        }),
        200,
        headers: _json,
      );
    });
    final api = ApiClient(baseUrl: 'http://api.test', httpClient: client);
    final result = await api.verifySignInCode('+97455500010', '123456');
    expect(result.token, 'tok');
    expect(result.user.fullName, 'Omar');
    await api.verifySignInCode('+97455500010', '123456', fullName: ' Omar ');
    expect(bodies.first.containsKey('full_name'), isFalse);
    expect(bodies.last['full_name'], 'Omar');
  });

  test('a wrong code surfaces the server error code', () async {
    final client = MockClient(
      (_) async => http.Response(jsonEncode({'code': 'INVALID_CODE', 'message': 'That code is wrong or has expired.'}), 401, headers: _json),
    );
    final api = ApiClient(baseUrl: 'http://api.test', httpClient: client);
    await expectLater(
      api.verifySignInCode('+97455500010', '000000'),
      throwsA(isA<ApiException>().having((e) => e.code, 'code', 'INVALID_CODE')),
    );
  });
}
