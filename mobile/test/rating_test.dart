// Unit tests for skill ratings in the app: reading ratings and teams, and the requests sent.
import 'dart:convert';

import 'package:akaz_sports_hub/api/api_client.dart';
import 'package:akaz_sports_hub/referee/referee_models.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(Object body) => http.Response(jsonEncode(body), 200, headers: {'content-type': 'application/json'});

const _teams = {
  'match_id': 'm1',
  'players': [
    {'user_id': 'a', 'full_name': 'Omar', 'side': 'HOME', 'rating': 1300},
    {'user_id': 'b', 'full_name': 'Sara', 'side': 'AWAY', 'rating': '1250'},
  ],
  'home_avg': 1300,
  'away_avg': 1250,
  'home_win_probability': 0.57,
};

void main() {
  test('my rating is read with its history', () async {
    final api = ApiClient(
      baseUrl: 'http://api.test',
      httpClient: MockClient((request) async {
        expect(request.url.path, '/v1/ratings/me');
        return _json({
          'elo_rating': 1222,
          'rated_matches': 3,
          'history': [
            {'match_id': 'm1', 'ended_at': '2026-11-20T16:00:00.000Z', 'side': 'HOME', 'rating_before': 1200, 'rating_after': 1222, 'delta': 22,
             'home_team_name': 'Reds', 'away_team_name': 'Blues', 'home_score': 3, 'away_score': 1},
          ],
        });
      }),
    );
    final rating = await api.myRating();
    expect(rating.rating, 1222);
    expect(rating.ratedMatches, 3);
    expect(rating.history.single.delta, 22);
    expect(rating.history.single.homeName, 'Reds');
  });

  test('teams are read, balanced and changed through the right requests', () async {
    final seen = <String>[];
    Object? lastBody;
    final api = ApiClient(
      baseUrl: 'http://api.test',
      httpClient: MockClient((request) async {
        seen.add('${request.method} ${request.url.path}');
        if (request.body.isNotEmpty) lastBody = jsonDecode(request.body);
        return _json(_teams);
      }),
    );
    final teams = await api.matchTeams('m1');
    expect(teams.home.single.fullName, 'Omar');
    expect(teams.away.single.rating, 1250);
    expect(teams.homeWinProbability, 0.57);
    await api.autoBalanceTeams('m1');
    await api.setTeams('m1', {'a': 'AWAY'});
    expect(seen, ['GET /v1/matches/m1/teams', 'POST /v1/matches/m1/teams/auto', 'PUT /v1/matches/m1/teams']);
    expect(lastBody, {'assignments': [{'user_id': 'a', 'side': 'AWAY'}]});
  });

  test('candidate bookings are asked for by court, and a booking can be linked to a new match', () async {
    final bodies = <Map<String, dynamic>>[];
    final api = ApiClient(
      baseUrl: 'http://api.test',
      httpClient: MockClient((request) async {
        if (request.url.path == '/v1/referee/bookings') {
          expect(request.url.queryParameters, {'court_id': 'c1'});
          return _json([
            {'id': 'b1', 'starts_at': '2026-11-20T15:00:00.000Z', 'ends_at': '2026-11-20T16:00:00.000Z', 'organizer_name': 'Omar', 'paid_players': 10},
          ]);
        }
        bodies.add(jsonDecode(request.body) as Map<String, dynamic>);
        return _json({'id': 'm1'});
      }),
    );
    final candidates = await api.refereeBookings('c1');
    expect(candidates.single.paidPlayers, 10);
    await api.createMatch(courtId: 'c1', homeTeamName: 'H', awayTeamName: 'A', scheduledStart: DateTime.utc(2026, 11, 20, 15), bookingId: 'b1');
    await api.createMatch(courtId: 'c1', homeTeamName: 'H', awayTeamName: 'A', scheduledStart: DateTime.utc(2026, 11, 20, 15));
    expect(bodies[0]['booking_id'], 'b1');
    expect(bodies[1].containsKey('booking_id'), isFalse);
  });

  test('a referee match remembers its booking, and old saved matches still load', () {
    final match = RefMatch(id: 'm', homeName: 'H', awayName: 'A', bookingId: 'b1');
    final restored = RefMatch.fromJson(match.toJson());
    expect(restored.bookingId, 'b1');
    expect(RefMatch.fromJson({'id': 'm', 'home_name': 'H', 'away_name': 'A', 'events': []}).bookingId, isNull);
  });
}
