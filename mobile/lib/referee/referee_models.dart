/// What the referee console remembers about a match on the device.
///
/// Events are written here first and sent to the server later, so the console keeps
/// working with no signal. Each event carries an id made on the device; the server
/// ignores an id it has already stored, so sending the same event twice is harmless.
library;

import 'dart:math';

import '../api/models.dart' show asInt, asIntOrNull, asMapList, asString, asStringOrNull;

/// How long a White Card keeps a player off the pitch. Keep in step with the server
/// (`SIN_BIN_SECONDS` in src/matches/sin-bin.ts).
const int sinBinSeconds = 120;

/// The server refuses a match clock above four hours.
const int maxClockSeconds = 4 * 60 * 60;

const String evMatchStart = 'MATCH_START';
const String evMatchEnd = 'MATCH_END';
const String evGoal = 'GOAL';
const String evOwnGoal = 'OWN_GOAL';
const String evYellowCard = 'YELLOW_CARD';
const String evRedCard = 'RED_CARD';
const String evWhiteCard = 'WHITE_CARD';

const String sideHome = 'HOME';
const String sideAway = 'AWAY';

/// A device time as the ISO text the API expects: UTC, with milliseconds and a `Z`.
String isoMillis(DateTime instant) =>
    DateTime.fromMillisecondsSinceEpoch(instant.millisecondsSinceEpoch, isUtc: true).toIso8601String();

/// A random version-4 UUID. The server checks event ids strictly, so the version
/// digit is 4 and the variant digit is 8, 9, a or b.
String newEventId([Random? random]) {
  final source = random ?? Random.secure();
  final bytes = List<int>.generate(16, (_) => source.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

/// 125 → "02:05"; 3725 → "62:05" (a match clock does not roll over to hours).
String formatMatchClock(int seconds) {
  final safe = seconds < 0 ? 0 : seconds;
  final minutes = (safe ~/ 60).toString().padLeft(2, '0');
  final rest = (safe % 60).toString().padLeft(2, '0');
  return '$minutes:$rest';
}

class RefEvent {
  RefEvent({
    required this.id,
    required this.type,
    required this.clockSeconds,
    required this.occurredAt,
    this.teamSide,
    this.shirtNumber,
    this.playerName,
    this.synced = false,
    this.rejectedReason,
  });

  factory RefEvent.fromJson(Map<String, dynamic> json) => RefEvent(
        id: asString(json['id']),
        type: asString(json['type']),
        teamSide: asStringOrNull(json['team_side']),
        shirtNumber: asIntOrNull(json['shirt_number']),
        playerName: asStringOrNull(json['player_name']),
        clockSeconds: asInt(json['clock_seconds']),
        occurredAt: DateTime.fromMillisecondsSinceEpoch(asInt(json['occurred_at_ms']), isUtc: true),
        synced: json['synced'] == true,
        rejectedReason: asStringOrNull(json['rejected_reason']),
      );

  final String id;
  final String type;
  final String? teamSide;
  final int? shirtNumber;
  final String? playerName;

  /// Seconds on the match clock when it happened.
  final int clockSeconds;

  /// Device time when it happened (UTC).
  final DateTime occurredAt;

  /// The server has stored it.
  bool synced;

  /// Set when the server refused it for good (so the app stops retrying it).
  String? rejectedReason;

  /// Still has to be sent.
  bool get isPending => !synced && rejectedReason == null;

  Map<String, Object?> toJson() => {
        'id': id,
        'type': type,
        'team_side': teamSide,
        'shirt_number': shirtNumber,
        'player_name': playerName,
        'clock_seconds': clockSeconds,
        'occurred_at_ms': occurredAt.millisecondsSinceEpoch,
        'synced': synced,
        'rejected_reason': rejectedReason,
      };

  /// The shape the API's batch endpoint takes.
  Map<String, Object?> toApiJson() => {
        'id': id,
        'type': type,
        if (teamSide != null) 'team_side': teamSide,
        if (shirtNumber != null) 'shirt_number': shirtNumber,
        if (playerName != null && playerName!.isNotEmpty) 'player_name': playerName,
        'match_clock_seconds': clockSeconds,
        'occurred_at': isoMillis(occurredAt),
      };
}

/// A player serving a White Card, with the time they may return.
class SinBin {
  SinBin(this.event) : releaseAt = event.occurredAt.add(const Duration(seconds: sinBinSeconds));

  final RefEvent event;
  final DateTime releaseAt;

  /// Whole seconds left, rounded up like the server does; 0 once the time is served.
  int remainingSeconds(DateTime now) {
    final milliseconds = releaseAt.difference(now).inMilliseconds;
    return milliseconds <= 0 ? 0 : (milliseconds / 1000).ceil();
  }
}

class RefMatch {
  RefMatch({required this.id, required this.homeName, required this.awayName, this.bookingId, List<RefEvent>? events}) : events = events ?? <RefEvent>[];

  factory RefMatch.fromJson(Map<String, dynamic> json) => RefMatch(
        id: asString(json['id']),
        homeName: asString(json['home_name']),
        awayName: asString(json['away_name']),
        bookingId: asStringOrNull(json['booking_id']),
        events: asMapList(json['events']).map(RefEvent.fromJson).toList(),
      );

  final String id;
  final String homeName;
  final String awayName;

  /// Set when the match is played in a booking: its players can be split into teams and rated.
  final String? bookingId;

  /// In the order they were recorded.
  final List<RefEvent> events;

  Map<String, Object?> toJson() => {
        'id': id,
        'home_name': homeName,
        'away_name': awayName,
        if (bookingId != null) 'booking_id': bookingId,
        'events': events.map((event) => event.toJson()).toList(),
      };

  DateTime? get startedAt {
    for (final event in events) {
      if (event.type == evMatchStart) return event.occurredAt;
    }
    return null;
  }

  DateTime? get endedAt {
    for (final event in events.reversed) {
      if (event.type == evMatchEnd) return event.occurredAt;
    }
    return null;
  }

  bool get isLive => startedAt != null && endedAt == null;
  bool get isFinished => endedAt != null;

  /// Same rule as the server: a goal counts for its team, an own goal for the other.
  int get homeScore =>
      events.where((e) => (e.type == evGoal && e.teamSide == sideHome) || (e.type == evOwnGoal && e.teamSide == sideAway)).length;

  int get awayScore =>
      events.where((e) => (e.type == evGoal && e.teamSide == sideAway) || (e.type == evOwnGoal && e.teamSide == sideHome)).length;

  /// Seconds on the match clock: 0 before the start, frozen after the end.
  int clockSeconds(DateTime now) {
    final start = startedAt;
    if (start == null) return 0;
    final seconds = (endedAt ?? now).difference(start).inSeconds;
    if (seconds < 0) return 0;
    return seconds > maxClockSeconds ? maxClockSeconds : seconds;
  }

  List<SinBin> activeSinBins(DateTime now) {
    final bins = [for (final event in events) if (event.type == evWhiteCard) SinBin(event)]
        .where((bin) => bin.remainingSeconds(now) > 0)
        .toList()
      ..sort((a, b) => a.releaseAt.compareTo(b.releaseAt));
    return bins;
  }

  int get pendingCount => events.where((event) => event.isPending).length;
  int get rejectedCount => events.where((event) => event.rejectedReason != null).length;

  String teamName(String? side) => side == sideHome ? homeName : (side == sideAway ? awayName : '');
}
