import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import 'referee_models.dart';

/// Keeps the match the referee is running, on the device, and sends its events to the
/// server whenever there is a connection.
///
/// Recording never waits for the network: an event is stored first, then a sync is
/// attempted. A failed sync leaves the event waiting and the next attempt (every few
/// seconds, or the Sync button) sends it. Creating the match is the one step that needs
/// a connection, because the server makes the match id.
class RefereeStore extends ChangeNotifier {
  RefereeStore({required this.api, required this.userId});

  final ApiClient api;
  final String userId;

  /// The server accepts at most 200 events per request.
  static const int maxBatch = 200;

  static const _deviceKey = 'akaz.device_id';

  RefMatch? _match;
  bool _loaded = false;
  bool _syncing = false;
  bool _syncAgain = false;
  String? _syncError;
  int? _clockOffsetSeconds;
  String _deviceId = '';

  RefMatch? get match => _match;
  bool get isLoaded => _loaded;
  bool get isSyncing => _syncing;
  String? get syncError => _syncError;

  /// Server time minus device time, in seconds, from the last sync. Positive means this
  /// device's clock is behind. Null until a sync has succeeded.
  int? get clockOffsetSeconds => _clockOffsetSeconds;

  /// The last event can be taken back only while it has not left the device.
  bool get canUndo {
    final current = _match;
    return current != null && !_syncing && current.events.isNotEmpty && current.events.last.isPending;
  }

  String get _matchKey => 'akaz.referee.match.$userId';

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    var device = prefs.getString(_deviceKey) ?? '';
    if (device.isEmpty) {
      device = 'device-${newEventId().substring(0, 8)}';
      await prefs.setString(_deviceKey, device);
    }
    _deviceId = device;

    final raw = prefs.getString(_matchKey);
    if (raw != null) {
      try {
        _match = RefMatch.fromJson(asMap(jsonDecode(raw)));
      } on FormatException {
        await prefs.remove(_matchKey);
      }
    }
    _loaded = true;
    notifyListeners();
  }

  Future<void> _save() async {
    final prefs = await SharedPreferences.getInstance();
    final current = _match;
    if (current == null) {
      await prefs.remove(_matchKey);
    } else {
      await prefs.setString(_matchKey, jsonEncode(current.toJson()));
    }
  }

  /// Needs a connection: the server creates the match and gives it an id.
  Future<void> createMatch({required String courtId, required String home, required String away, String? bookingId}) async {
    final id = await api.createMatch(courtId: courtId, homeTeamName: home, awayTeamName: away, scheduledStart: DateTime.now(), bookingId: bookingId);
    _match = RefMatch(id: id, homeName: home, awayName: away, bookingId: bookingId);
    _syncError = null;
    await _save();
    notifyListeners();
  }

  /// Records an event on the device and tries to send it. Returns null when it does not
  /// apply (no match, starting twice, ending a match that is not running).
  Future<RefEvent?> record(String type, {String? teamSide, int? shirtNumber, String? playerName}) async {
    final current = _match;
    if (current == null) return null;
    if (type == evMatchStart && current.startedAt != null) return null;
    if (type == evMatchEnd && !current.isLive) return null;

    final now = DateTime.now().toUtc();
    final event = RefEvent(
      id: newEventId(),
      type: type,
      teamSide: teamSide,
      shirtNumber: shirtNumber,
      playerName: playerName,
      clockSeconds: current.clockSeconds(now),
      occurredAt: now,
    );
    current.events.add(event);
    notifyListeners();
    await _save();
    unawaited(sync());
    return event;
  }

  /// Takes back the last event if it has not been sent yet.
  Future<bool> undoLast() async {
    if (!canUndo) return false;
    _match!.events.removeLast();
    notifyListeners();
    await _save();
    return true;
  }

  /// Sends everything that is waiting. Safe to call at any time and as often as you like.
  Future<void> sync() async {
    final current = _match;
    if (current == null) return;
    if (_syncing) {
      // Something was recorded while a send is under way; send it right after.
      _syncAgain = true;
      return;
    }
    final pending = current.events.where((event) => event.isPending).toList();
    if (pending.isEmpty) {
      if (_syncError != null) {
        _syncError = null;
        notifyListeners();
      }
      return;
    }

    _syncing = true;
    _syncAgain = false;
    _syncError = null;
    notifyListeners();
    try {
      for (var start = 0; start < pending.length; start += maxBatch) {
        final chunk = pending.sublist(start, min(start + maxBatch, pending.length));
        final sentAt = DateTime.now().toUtc();
        final result = await api.syncMatchEvents(
          current.id,
          deviceId: _deviceId,
          events: [for (final event in chunk) event.toApiJson()],
        );
        _apply(current, result, sentAt);
      }
    } on ApiException catch (error) {
      _syncError = error.message;
    } finally {
      _syncing = false;
      await _save();
      notifyListeners();
    }
    // Only chase stragglers while the connection is working; otherwise the timer retries.
    if (_syncAgain && _syncError == null) {
      _syncAgain = false;
      await sync();
    }
  }

  void _apply(RefMatch current, Map<String, dynamic> result, DateTime sentAt) {
    final stored = <String>{...asStringList(result['accepted']), ...asStringList(result['duplicates'])};
    final refused = <String, String>{
      for (final item in asMapList(result['rejected'])) asString(item['id']): asString(item['reason']),
    };
    for (final event in current.events) {
      if (stored.contains(event.id)) {
        event.synced = true;
      } else if (refused.containsKey(event.id)) {
        event.rejectedReason = refused[event.id];
      }
    }
    final serverTime = asDateOrNull(result['server_time']);
    if (serverTime != null) _clockOffsetSeconds = serverTime.difference(sentAt).inSeconds;
  }

  /// Closes the match on this device once every event has reached the server.
  Future<bool> finish() async {
    final current = _match;
    if (current == null) return true;
    if (current.pendingCount > 0) return false;
    _match = null;
    _syncError = null;
    await _save();
    notifyListeners();
    return true;
  }
}
