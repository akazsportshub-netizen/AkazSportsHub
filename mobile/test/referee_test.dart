// Unit tests for the referee console: event ids, score, clock, sin-bin timers, and
// syncing against a fake server (offline first, then online, then a retry).
import 'dart:convert';

import 'package:akaz_sports_hub/api/api_client.dart';
import 'package:akaz_sports_hub/api/models.dart';
import 'package:akaz_sports_hub/referee/referee_models.dart';
import 'package:akaz_sports_hub/referee/referee_store.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _json = {'content-type': 'application/json'};

RefEvent _event(String type, DateTime at, {String? side, int? shirt}) =>
    RefEvent(id: newEventId(), type: type, teamSide: side, shirtNumber: shirt, clockSeconds: 0, occurredAt: at);

void main() {
  group('event ids', () {
    test('are version-4 UUIDs with a valid variant, which the server requires', () {
      final pattern = RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
      for (var i = 0; i < 200; i++) {
        expect(newEventId(), matches(pattern));
      }
    });

    test('are different every time', () {
      expect({for (var i = 0; i < 100; i++) newEventId()}.length, 100);
    });
  });

  group('time text', () {
    test('device time is sent in UTC with milliseconds', () {
      final text = isoMillis(DateTime.utc(2026, 11, 19, 21, 4, 5, 678));
      expect(text, '2026-11-19T21:04:05.678Z');
    });

    test('the match clock does not roll over to hours', () {
      expect(formatMatchClock(125), '02:05');
      expect(formatMatchClock(3725), '62:05');
      expect(formatMatchClock(-5), '00:00');
    });
  });

  group('score and clock', () {
    final start = DateTime.utc(2026, 11, 20, 15);

    test('a goal counts for its team and an own goal for the other', () {
      final match = RefMatch(id: 'm', homeName: 'Home', awayName: 'Away', events: [
        _event(evMatchStart, start),
        _event(evGoal, start, side: sideHome),
        _event(evGoal, start, side: sideHome),
        _event(evOwnGoal, start, side: sideHome),
        _event(evGoal, start, side: sideAway),
        _event(evOwnGoal, start, side: sideAway),
      ]);
      expect(match.homeScore, 3);
      expect(match.awayScore, 2);
    });

    test('the clock starts at the kick-off and freezes at full time', () {
      final match = RefMatch(id: 'm', homeName: 'Home', awayName: 'Away');
      expect(match.clockSeconds(start), 0);
      expect(match.isLive, isFalse);

      match.events.add(_event(evMatchStart, start));
      expect(match.isLive, isTrue);
      expect(match.clockSeconds(start.add(const Duration(minutes: 5))), 300);

      match.events.add(_event(evMatchEnd, start.add(const Duration(minutes: 40))));
      expect(match.isFinished, isTrue);
      expect(match.clockSeconds(start.add(const Duration(hours: 3))), 2400);
    });
  });

  group('sin bin', () {
    final shown = DateTime.utc(2026, 11, 20, 15, 10);

    test('lasts two minutes from the moment the card was shown', () {
      final bin = SinBin(_event(evWhiteCard, shown, side: sideAway, shirt: 4));
      expect(bin.releaseAt, shown.add(const Duration(minutes: 2)));
      expect(bin.remainingSeconds(shown), 120);
      expect(bin.remainingSeconds(shown.add(const Duration(seconds: 30))), 90);
      expect(bin.remainingSeconds(shown.add(const Duration(milliseconds: 119500))), 1);
      expect(bin.remainingSeconds(shown.add(const Duration(minutes: 2))), 0);
      expect(bin.remainingSeconds(shown.add(const Duration(minutes: 5))), 0);
    });

    test('a card that reached the device late still counts from when it was shown', () {
      final match = RefMatch(id: 'm', homeName: 'Home', awayName: 'Away', events: [
        _event(evWhiteCard, shown, side: sideHome, shirt: 7),
      ]);
      expect(match.activeSinBins(shown.add(const Duration(seconds: 90))).single.remainingSeconds(shown.add(const Duration(seconds: 90))), 30);
      expect(match.activeSinBins(shown.add(const Duration(seconds: 121))), isEmpty);
    });

    test('only white cards send a player off', () {
      final match = RefMatch(id: 'm', homeName: 'Home', awayName: 'Away', events: [
        _event(evYellowCard, shown, side: sideHome, shirt: 3),
        _event(evRedCard, shown, side: sideAway, shirt: 5),
      ]);
      expect(match.activeSinBins(shown), isEmpty);
    });
  });

  group('saving on the device', () {
    test('an event survives being written and read back', () {
      final original = RefEvent(
        id: newEventId(),
        type: evWhiteCard,
        teamSide: sideAway,
        shirtNumber: 4,
        playerName: 'Test Defender',
        clockSeconds: 420,
        occurredAt: DateTime.utc(2026, 11, 20, 15, 7, 1, 250),
        synced: true,
      );
      final copy = RefEvent.fromJson(asMap(jsonDecode(jsonEncode(original.toJson()))));
      expect(copy.id, original.id);
      expect(copy.type, evWhiteCard);
      expect(copy.teamSide, sideAway);
      expect(copy.shirtNumber, 4);
      expect(copy.playerName, 'Test Defender');
      expect(copy.clockSeconds, 420);
      expect(copy.occurredAt, original.occurredAt);
      expect(copy.synced, isTrue);
    });

    test('the API shape carries the device time and leaves out empty fields', () {
      final event = RefEvent(id: newEventId(), type: evGoal, teamSide: sideHome, clockSeconds: 300, occurredAt: DateTime.utc(2026, 11, 20, 15, 5));
      final body = event.toApiJson();
      expect(body['type'], 'GOAL');
      expect(body['team_side'], 'HOME');
      expect(body['match_clock_seconds'], 300);
      expect(body['occurred_at'], '2026-11-20T15:05:00.000Z');
      expect(body.containsKey('shirt_number'), isFalse);
      expect(body.containsKey('player_name'), isFalse);
    });
  });

  group('syncing', () {
    late bool online;
    late List<Map<String, dynamic>> batches;
    late RefereeStore store;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      online = true;
      batches = [];
      final client = MockClient((request) async {
        if (!online) throw http.ClientException('no signal');
        if (request.url.path.endsWith('/events/batch')) {
          final sent = asMap(jsonDecode(request.body));
          batches.add(sent);
          final ids = asMapList(sent['events']).map((event) => event['id']).toList();
          return http.Response(
            jsonEncode({'accepted': ids, 'duplicates': [], 'rejected': [], 'server_time': DateTime.now().toUtc().toIso8601String()}),
            200,
            headers: _json,
          );
        }
        return http.Response(jsonEncode({'id': '6bc5455d-cdcd-495f-a218-12ccc6c6a6e6'}), 201, headers: _json);
      });
      final api = ApiClient(baseUrl: 'http://api.test', httpClient: client);
      store = RefereeStore(api: api, userId: 'referee-1');
      await store.load();
      await store.createMatch(courtId: '00000000-0000-4000-9000-000000000001', home: 'Home FC', away: 'Away FC');
    });

    test('events recorded with no signal wait, then are sent once the connection is back', () async {
      online = false;
      await store.record(evMatchStart);
      await store.record(evGoal, teamSide: sideHome);
      await store.record(evWhiteCard, teamSide: sideAway, shirtNumber: 4);
      await pumpEventQueue(times: 200);

      expect(store.match!.events.length, 3);
      expect(store.match!.pendingCount, 3);
      expect(store.syncError, isNotNull);
      expect(store.match!.homeScore, 1);
      expect(store.match!.activeSinBins(DateTime.now()).length, 1);

      online = true;
      await store.sync();

      expect(store.match!.pendingCount, 0);
      expect(store.syncError, isNull);
      expect(batches.length, 1);
      expect(asMapList(batches.single['events']).length, 3);
    });

    test('nothing is sent twice once the server has it', () async {
      await store.record(evMatchStart);
      await pumpEventQueue(times: 200);
      final sentBefore = batches.length;
      await store.sync();
      await store.sync();
      expect(batches.length, sentBefore);
      expect(store.match!.pendingCount, 0);
    });

    test('an event the server refuses is marked and not retried', () async {
      final refusing = MockClient((request) async {
        if (request.url.path.endsWith('/events/batch')) {
          final ids = asMapList(asMap(jsonDecode(request.body))['events']).map((event) => event['id']).toList();
          return http.Response(
            jsonEncode({
              'accepted': [],
              'duplicates': [],
              'rejected': [for (final id in ids) {'id': id, 'reason': 'OCCURRED_IN_FUTURE'}],
              'server_time': DateTime.now().toUtc().toIso8601String(),
            }),
            200,
            headers: _json,
          );
        }
        return http.Response(jsonEncode({'id': 'm'}), 201, headers: _json);
      });
      final other = RefereeStore(api: ApiClient(baseUrl: 'http://api.test', httpClient: refusing), userId: 'referee-2');
      await other.load();
      await other.createMatch(courtId: 'c', home: 'A', away: 'B');
      await other.record(evMatchStart);
      await pumpEventQueue(times: 200);

      expect(other.match!.pendingCount, 0);
      expect(other.match!.rejectedCount, 1);
      expect(other.match!.events.single.rejectedReason, 'OCCURRED_IN_FUTURE');
    });

    test('the last event can be taken back only while it is still on the device', () async {
      online = false;
      await store.record(evMatchStart);
      await store.record(evGoal, teamSide: sideAway);
      await pumpEventQueue(times: 200);
      expect(store.canUndo, isTrue);

      expect(await store.undoLast(), isTrue);
      expect(store.match!.awayScore, 0);

      online = true;
      await store.sync();
      expect(store.canUndo, isFalse);
      expect(await store.undoLast(), isFalse);
    });

    test('events recorded in quick succession all go out without waiting for the timer', () async {
      await store.record(evMatchStart);
      await store.record(evGoal, teamSide: sideHome);
      await store.record(evGoal, teamSide: sideAway);
      await pumpEventQueue(times: 200);

      expect(store.match!.pendingCount, 0);
      final sentIds = batches.expand((batch) => asMapList(batch['events'])).map((event) => event['id']).toList();
      expect(sentIds.length, 3);
      expect(sentIds.toSet().length, 3);
    });

    test('the match can be closed only after every event has been sent', () async {
      online = false;
      await store.record(evMatchStart);
      await store.record(evMatchEnd);
      await pumpEventQueue(times: 200);
      expect(await store.finish(), isFalse);
      expect(store.match, isNotNull);

      online = true;
      await store.sync();
      expect(await store.finish(), isTrue);
      expect(store.match, isNull);
    });

    test('the match survives closing and reopening the app', () async {
      online = false;
      await store.record(evMatchStart);
      await store.record(evGoal, teamSide: sideHome);
      await pumpEventQueue(times: 200);

      final reopened = RefereeStore(
        api: ApiClient(baseUrl: 'http://api.test', httpClient: MockClient((_) async => throw http.ClientException('no signal'))),
        userId: 'referee-1',
      );
      await reopened.load();
      expect(reopened.match, isNotNull);
      expect(reopened.match!.homeName, 'Home FC');
      expect(reopened.match!.events.length, 2);
      expect(reopened.match!.homeScore, 1);
      expect(reopened.match!.pendingCount, 2);
    });
  });
}
