// Unit tests for staying signed in: the client renews an expired access token once and retries.
import 'dart:convert';

import 'package:akaz_sports_hub/api/api_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(int status, Object body) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  test('an expired token is refreshed and the request is retried once', () async {
    final seen = <String>[];
    final client = MockClient((request) async {
      seen.add('${request.method} ${request.url.path} ${request.headers['Authorization'] ?? ''}');
      if (request.url.path == '/v1/auth/refresh') {
        expect(jsonDecode(request.body), {'refresh_token': 'r1'});
        return _json(200, {'access_token': 'a2', 'refresh_token': 'r2', 'expires_in': 3600});
      }
      return request.headers['Authorization'] == 'Bearer a2' ? _json(200, <Object>[]) : _json(401, {'code': 'UNAUTHENTICATED', 'message': 'expired'});
    });
    final api = ApiClient(baseUrl: 'http://api.test', httpClient: client)
      ..accessToken = 'a1'
      ..refreshToken = 'r1';
    String? saved;
    api.onTokensRefreshed = (a, r) => saved = '$a/$r';

    await api.myBookings();

    expect(saved, 'a2/r2');
    expect(api.refreshToken, 'r2');
    expect(seen.length, 3);
    expect(seen[0], endsWith('Bearer a1'));
    expect(seen[1], startsWith('POST /v1/auth/refresh'));
    expect(seen[2], endsWith('Bearer a2'));
  });

  test('requests that fail together share one refresh', () async {
    var refreshes = 0;
    final client = MockClient((request) async {
      if (request.url.path == '/v1/auth/refresh') {
        refreshes++;
        await Future<void>.delayed(const Duration(milliseconds: 20));
        return _json(200, {'access_token': 'a2', 'refresh_token': 'r2'});
      }
      return request.headers['Authorization'] == 'Bearer a2' ? _json(200, <Object>[]) : _json(401, {'message': 'expired'});
    });
    final api = ApiClient(baseUrl: 'http://api.test', httpClient: client)
      ..accessToken = 'a1'
      ..refreshToken = 'r1';
    await Future.wait([api.myBookings(), api.myBookings(), api.myBookings()]);
    expect(refreshes, 1);
  });

  test('a refused refresh token signs the person out', () async {
    final client = MockClient((request) async {
      if (request.url.path == '/v1/auth/refresh') return _json(401, {'code': 'INVALID_REFRESH_TOKEN', 'message': 'Please sign in again.'});
      return _json(401, {'message': 'expired'});
    });
    final api = ApiClient(baseUrl: 'http://api.test', httpClient: client)
      ..accessToken = 'a1'
      ..refreshToken = 'r1';
    var signedOut = false;
    api.onUnauthenticated = () => signedOut = true;
    await expectLater(api.myBookings(), throwsA(isA<ApiException>()));
    expect(signedOut, isTrue);
    expect(api.refreshToken, isNull);
  });

  test('no connection while refreshing does not sign the person out', () async {
    final client = MockClient((request) async {
      if (request.url.path == '/v1/auth/refresh') throw http.ClientException('offline');
      return _json(401, {'message': 'expired'});
    });
    final api = ApiClient(baseUrl: 'http://api.test', httpClient: client)
      ..accessToken = 'a1'
      ..refreshToken = 'r1';
    var signedOut = false;
    api.onUnauthenticated = () => signedOut = true;
    await expectLater(api.myBookings(), throwsA(isA<ApiException>()));
    expect(signedOut, isFalse);
    expect(api.refreshToken, 'r1');
  });
}
