// Unit tests for sign-in storage: tokens go to the token store, never to ordinary app storage.
import 'dart:convert';

import 'package:akaz_sports_hub/api/api_client.dart';
import 'package:akaz_sports_hub/session.dart';
import 'package:akaz_sports_hub/util/token_store.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _user = {'id': 'u-1', 'full_name': 'Omar', 'country_code': 'QA', 'roles': ['PLAYER']};

Session _session(MemoryTokenStore store) {
  final client = MockClient((request) async => http.Response(
        jsonEncode({'access_token': 'a1', 'refresh_token': 'r1', 'expires_in': 3600, 'user': _user}),
        200,
        headers: {'content-type': 'application/json'},
      ));
  return Session(ApiClient(baseUrl: 'http://api.test', httpClient: client), tokens: store);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('signing in keeps tokens in the token store and out of app storage', () async {
    SharedPreferences.setMockInitialValues({});
    final store = MemoryTokenStore();
    await _session(store).signInAs('u-1');
    expect(store.values['akaz.access_token'], 'a1');
    expect(store.values['akaz.refresh_token'], 'r1');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('akaz.access_token'), isNull);
    expect(prefs.getString('akaz.refresh_token'), isNull);
  });

  test('a restart restores the session from the token store', () async {
    SharedPreferences.setMockInitialValues({});
    final store = MemoryTokenStore();
    await _session(store).signInAs('u-1');
    final again = _session(store);
    await again.restore();
    expect(again.isSignedIn, isTrue);
    expect(again.api.accessToken, 'a1');
    expect(again.api.refreshToken, 'r1');
  });

  test('tokens saved by an earlier version are moved over and removed from app storage', () async {
    SharedPreferences.setMockInitialValues({
      'akaz.access_token': 'old-a',
      'akaz.refresh_token': 'old-r',
      'akaz.user': jsonEncode(_user),
    });
    final store = MemoryTokenStore();
    final session = _session(store);
    await session.restore();
    expect(session.isSignedIn, isTrue);
    expect(session.api.accessToken, 'old-a');
    expect(store.values['akaz.access_token'], 'old-a');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('akaz.access_token'), isNull);
    expect(prefs.getString('akaz.refresh_token'), isNull);
  });

  test('signing out clears the token store', () async {
    SharedPreferences.setMockInitialValues({});
    final store = MemoryTokenStore();
    final session = _session(store);
    await session.signInAs('u-1');
    await session.signOut();
    expect(store.values, isEmpty);
    expect(session.isSignedIn, isFalse);
  });
}
