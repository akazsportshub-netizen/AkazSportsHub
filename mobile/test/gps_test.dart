// Unit tests for GPS search: the request that saves the home area.
import 'dart:convert';

import 'package:akaz_sports_hub/api/api_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('saveHomeLocation sends the position and the invite choice', () async {
    late http.Request seen;
    final client = MockClient((request) async {
      seen = request;
      return http.Response(jsonEncode({'lat': 25.286, 'lng': 51.535, 'open_to_ringer': true}), 200, headers: {'content-type': 'application/json'});
    });
    await ApiClient(baseUrl: 'http://api.test', httpClient: client).saveHomeLocation(lat: 25.2861, lng: 51.5348, openToRinger: true);
    expect(seen.method, 'PATCH');
    expect(seen.url.path, '/v1/users/me/location');
    expect(jsonDecode(seen.body), {'lat': 25.2861, 'lng': 51.5348, 'open_to_ringer': true});
  });

  test('saveHomeLocation leaves the invite choice out when not given', () async {
    Map<String, dynamic>? sent;
    final client = MockClient((request) async {
      sent = jsonDecode(request.body) as Map<String, dynamic>;
      return http.Response('{}', 200, headers: {'content-type': 'application/json'});
    });
    await ApiClient(baseUrl: 'http://api.test', httpClient: client).saveHomeLocation(lat: 1, lng: 2);
    expect(sent!.containsKey('open_to_ringer'), isFalse);
  });
}
