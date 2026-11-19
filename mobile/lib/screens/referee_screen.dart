import 'dart:async';

import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../referee/referee_models.dart';
import '../referee/referee_store.dart';
import '../widgets.dart';

/// The referee's match console. The match and its events are kept on the device, so
/// recording carries on with no signal and everything is sent when the connection is back.
class RefereeScreen extends StatefulWidget {
  const RefereeScreen({super.key, required this.api, required this.userId});

  final ApiClient api;
  final String userId;

  @override
  State<RefereeScreen> createState() => _RefereeScreenState();
}

class _RefereeScreenState extends State<RefereeScreen> {
  late final RefereeStore _store;
  Timer? _tick;
  Timer? _syncTimer;

  @override
  void initState() {
    super.initState();
    _store = RefereeStore(api: widget.api, userId: widget.userId);
    _store.load();
    // Redraw every second so the clock and the sin-bin countdowns move.
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && _store.match != null) setState(() {});
    });
    // Try again every few seconds while anything is waiting to be sent.
    _syncTimer = Timer.periodic(const Duration(seconds: 15), (_) => _store.sync());
  }

  @override
  void dispose() {
    _tick?.cancel();
    _syncTimer?.cancel();
    _store.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _store,
      builder: (context, _) {
        if (!_store.isLoaded) return const Center(child: CircularProgressIndicator());
        final match = _store.match;
        if (match == null) return _NewMatchForm(api: widget.api, store: _store);
        return _Console(store: _store, match: match);
      },
    );
  }
}

// ---------------------------------------------------------------------------
// New match

class _NewMatchForm extends StatefulWidget {
  const _NewMatchForm({required this.api, required this.store});

  final ApiClient api;
  final RefereeStore store;

  @override
  State<_NewMatchForm> createState() => _NewMatchFormState();
}

class _NewMatchFormState extends State<_NewMatchForm> {
  final _home = TextEditingController(text: 'Home');
  final _away = TextEditingController(text: 'Away');
  late Future<List<Venue>> _venues;
  Future<Venue>? _venue;
  String? _venueId;
  String? _courtId;
  bool _creating = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _venues = _loadVenues();
  }

  @override
  void dispose() {
    _home.dispose();
    _away.dispose();
    super.dispose();
  }

  // Football venues around Doha, like the Discover tab. A GPS search comes later.
  Future<List<Venue>> _loadVenues() => widget.api.nearbyVenues(lat: 25.2860, lng: 51.5000, radiusKm: 30, sport: 'FOOTBALL');

  void _reloadVenues() => setState(() { _venues = _loadVenues(); });

  void _pickVenue(Venue venue) => setState(() {
        _venueId = venue.id;
        _courtId = null;
        _venue = widget.api.venue(venue.id);
      });

  Future<void> _create() async {
    final home = _home.text.trim();
    final away = _away.text.trim();
    final courtId = _courtId;
    if (home.isEmpty || away.isEmpty || courtId == null) {
      setState(() { _error = 'Enter both team names and choose a court.'; });
      return;
    }
    setState(() { _creating = true; _error = null; });
    try {
      await widget.store.createMatch(courtId: courtId, home: home, away: away);
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _error = error.code == 'NOT_A_REFEREE' || error.statusCode == 403
              ? 'Only a referee can start a match. Sign in as the demo referee.'
              : error.message;
        });
      }
    } finally {
      if (mounted) setState(() { _creating = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('New match', style: theme.textTheme.titleLarge),
        const SizedBox(height: 4),
        Text(
          'You need a connection to start the match. After that you can record events with no signal; they are sent when you are back online.',
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: 16),
        TextField(controller: _home, decoration: const InputDecoration(labelText: 'Home team', border: OutlineInputBorder())),
        const SizedBox(height: 12),
        TextField(controller: _away, decoration: const InputDecoration(labelText: 'Away team', border: OutlineInputBorder())),
        const SizedBox(height: 16),
        Text('Venue', style: theme.textTheme.titleSmall),
        const SizedBox(height: 8),
        FutureBuilder<List<Venue>>(
          future: _venues,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Padding(padding: EdgeInsets.all(12), child: LinearProgressIndicator());
            }
            if (snapshot.hasError) {
              return ErrorRetry(message: snapshot.error.toString(), onRetry: _reloadVenues);
            }
            final venues = snapshot.data!;
            if (venues.isEmpty) return const Text('No football venues found nearby.');
            return Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final venue in venues)
                  ChoiceChip(label: Text(venue.name), selected: _venueId == venue.id, onSelected: (_) => _pickVenue(venue)),
              ],
            );
          },
        ),
        if (_venue != null) ...[
          const SizedBox(height: 16),
          Text('Court', style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          FutureBuilder<Venue>(
            future: _venue,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const Padding(padding: EdgeInsets.all(12), child: LinearProgressIndicator());
              }
              if (snapshot.hasError) return Text(snapshot.error.toString());
              final courts = snapshot.data!.courts.where((court) => court.sport == 'FOOTBALL').toList();
              if (courts.isEmpty) return const Text('This venue has no football courts.');
              return Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final court in courts)
                    ChoiceChip(
                      label: Text(court.name),
                      selected: _courtId == court.id,
                      onSelected: (_) => setState(() { _courtId = court.id; }),
                    ),
                ],
              );
            },
          ),
        ],
        if (_error != null) ...[
          const SizedBox(height: 16),
          Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
        ],
        const SizedBox(height: 20),
        FilledButton.icon(
          onPressed: _creating ? null : _create,
          icon: _creating
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.sports_soccer),
          label: const Text('Create match'),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Console

class _Console extends StatelessWidget {
  const _Console({required this.store, required this.match});

  final RefereeStore store;
  final RefMatch match;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final sinBins = match.activeSinBins(now);
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        _Scoreboard(match: match, now: now),
        const SizedBox(height: 8),
        _SyncBar(store: store, match: match),
        const SizedBox(height: 8),
        _MatchControls(store: store, match: match),
        if (match.isLive) ...[
          const SizedBox(height: 8),
          _TeamPanel(store: store, side: sideHome, name: match.homeName),
          const SizedBox(height: 8),
          _TeamPanel(store: store, side: sideAway, name: match.awayName),
        ],
        if (sinBins.isNotEmpty) ...[
          const SizedBox(height: 8),
          _SinBinCard(match: match, sinBins: sinBins, now: now),
        ],
        const SizedBox(height: 8),
        _EventLog(match: match),
      ],
    );
  }
}

class _Scoreboard extends StatelessWidget {
  const _Scoreboard({required this.match, required this.now});

  final RefMatch match;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = match.isFinished ? 'Full time' : (match.isLive ? 'Live' : 'Not started');
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(child: Text(match.homeName, style: theme.textTheme.titleMedium, overflow: TextOverflow.ellipsis)),
                Text('${match.homeScore}  –  ${match.awayScore}', style: theme.textTheme.displaySmall),
                Expanded(
                  child: Text(match.awayName, style: theme.textTheme.titleMedium, textAlign: TextAlign.end, overflow: TextOverflow.ellipsis),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text('${formatMatchClock(match.clockSeconds(now))}  ·  $status', style: theme.textTheme.titleMedium),
          ],
        ),
      ),
    );
  }
}

class _SyncBar extends StatelessWidget {
  const _SyncBar({required this.store, required this.match});

  final RefereeStore store;
  final RefMatch match;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final pending = match.pendingCount;
    final refused = match.rejectedCount;
    final offset = store.clockOffsetSeconds;

    final IconData icon;
    final String text;
    if (store.isSyncing) {
      icon = Icons.sync;
      text = 'Syncing…';
    } else if (store.syncError != null) {
      icon = Icons.cloud_off;
      text = '$pending waiting to sync. ${store.syncError}';
    } else if (pending > 0) {
      icon = Icons.cloud_upload_outlined;
      text = '$pending ${pending == 1 ? 'event is' : 'events are'} waiting to sync';
    } else {
      icon = Icons.cloud_done_outlined;
      text = 'All events are saved on the server';
    }

    return Card(
      color: theme.colorScheme.surfaceContainerHighest,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 20),
                const SizedBox(width: 8),
                Expanded(child: Text(text)),
                TextButton(onPressed: store.isSyncing || pending == 0 ? null : store.sync, child: const Text('Sync now')),
              ],
            ),
            if (refused > 0)
              Text(
                '$refused ${refused == 1 ? 'event was' : 'events were'} refused by the server (see the list below).',
                style: TextStyle(color: theme.colorScheme.error),
              ),
            if (offset != null && offset.abs() >= 60)
              Text(
                'This device\'s clock is ${offset.abs()} s ${offset > 0 ? 'behind' : 'ahead of'} the server. Fix the time, or sin-bin timers will be off.',
                style: TextStyle(color: theme.colorScheme.error),
              ),
          ],
        ),
      ),
    );
  }
}

class _MatchControls extends StatelessWidget {
  const _MatchControls({required this.store, required this.match});

  final RefereeStore store;
  final RefMatch match;

  Future<void> _end(BuildContext context) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('End the match?'),
        content: Text('Final score: ${match.homeName} ${match.homeScore} – ${match.awayScore} ${match.awayName}.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep playing')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('End match')),
        ],
      ),
    );
    if (yes == true) await store.record(evMatchEnd);
  }

  Future<void> _finish(BuildContext context) async {
    final closed = await store.finish();
    if (!closed && context.mounted) showMessage(context, 'Some events have not been sent yet. Sync first.');
  }

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        if (match.startedAt == null)
          FilledButton.icon(
            onPressed: () => store.record(evMatchStart),
            icon: const Icon(Icons.play_arrow),
            label: const Text('Start match'),
          ),
        if (match.isLive)
          OutlinedButton.icon(
            onPressed: () => _end(context),
            icon: const Icon(Icons.flag_outlined),
            label: const Text('End match'),
          ),
        if (match.isFinished)
          FilledButton.icon(
            onPressed: match.pendingCount == 0 ? () => _finish(context) : null,
            icon: const Icon(Icons.check),
            label: Text(match.pendingCount == 0 ? 'Finish and close' : 'Sync before closing'),
          ),
        if (store.canUndo)
          TextButton.icon(
            onPressed: store.undoLast,
            icon: const Icon(Icons.undo),
            label: const Text('Undo last'),
          ),
      ],
    );
  }
}

Future<(bool, int?)?> _askShirt(BuildContext context, String title) {
  final controller = TextEditingController();
  return showDialog<(bool, int?)>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: TextField(
        controller: controller,
        autofocus: true,
        keyboardType: TextInputType.number,
        maxLength: 2,
        decoration: const InputDecoration(labelText: 'Shirt number (optional)'),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(
          onPressed: () => Navigator.pop(context, (true, int.tryParse(controller.text.trim()))),
          child: const Text('Record'),
        ),
      ],
    ),
  );
}

class _TeamPanel extends StatelessWidget {
  const _TeamPanel({required this.store, required this.side, required this.name});

  final RefereeStore store;
  final String side;
  final String name;

  Future<void> _goal(BuildContext context, String type, String label) async {
    await store.record(type, teamSide: side);
    if (context.mounted) showMessage(context, '$label — $name');
  }

  Future<void> _card(BuildContext context, String type, String label) async {
    final answer = await _askShirt(context, '$label — $name');
    if (answer == null || !answer.$1) return;
    await store.record(type, teamSide: side, shirtNumber: answer.$2);
    if (context.mounted) showMessage(context, '$label recorded for $name');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('$name  ·  ${side == sideHome ? 'Home' : 'Away'}', style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton.icon(onPressed: () => _goal(context, evGoal, 'Goal'), icon: const Icon(Icons.sports_soccer), label: const Text('Goal')),
                OutlinedButton(onPressed: () => _goal(context, evOwnGoal, 'Own goal'), child: const Text('Own goal')),
                OutlinedButton.icon(
                  onPressed: () => _card(context, evWhiteCard, 'White card'),
                  icon: const Icon(Icons.style_outlined),
                  label: const Text('White card'),
                ),
                OutlinedButton(onPressed: () => _card(context, evYellowCard, 'Yellow card'), child: const Text('Yellow')),
                OutlinedButton(onPressed: () => _card(context, evRedCard, 'Red card'), child: const Text('Red')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SinBinCard extends StatelessWidget {
  const _SinBinCard({required this.match, required this.sinBins, required this.now});

  final RefMatch match;
  final List<SinBin> sinBins;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      color: theme.colorScheme.tertiaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Sin bin', style: theme.textTheme.titleSmall),
            for (final bin in sinBins)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.timer_outlined),
                title: Text(
                  '${match.teamName(bin.event.teamSide)}  ${bin.event.shirtNumber == null ? '(no number)' : '#${bin.event.shirtNumber}'}',
                ),
                subtitle: Text('Back on at ${_clockTime(bin.releaseAt)}'),
                trailing: Text(
                  formatMatchClock(bin.remainingSeconds(now)),
                  style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
          ],
        ),
      ),
    );
  }

  static String _clockTime(DateTime instant) {
    final local = instant.toLocal();
    String two(int value) => value.toString().padLeft(2, '0');
    return '${two(local.hour)}:${two(local.minute)}:${two(local.second)}';
  }
}

class _EventLog extends StatelessWidget {
  const _EventLog({required this.match});

  final RefMatch match;

  static const Map<String, String> _labels = {
    evMatchStart: 'Match start',
    evMatchEnd: 'Match end',
    evGoal: 'Goal',
    evOwnGoal: 'Own goal',
    evYellowCard: 'Yellow card',
    evRedCard: 'Red card',
    evWhiteCard: 'White card (2 min)',
  };

  static String _reason(String reason) => switch (reason) {
        'OCCURRED_IN_FUTURE' => 'device clock is ahead of the server',
        'ID_IN_USE' => 'id already used by another match',
        'TEAM_SIDE_REQUIRED' => 'team missing',
        'UNKNOWN_PLAYER' => 'unknown player',
        _ => reason.toLowerCase(),
      };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final events = match.events.reversed.toList();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Events (${events.length})', style: theme.textTheme.titleSmall),
            if (events.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Text('Nothing recorded yet.')),
            for (final event in events)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: Text(formatMatchClock(event.clockSeconds), style: theme.textTheme.titleSmall),
                title: Text(
                  [
                    _labels[event.type] ?? event.type,
                    if (event.teamSide != null) match.teamName(event.teamSide),
                    if (event.shirtNumber != null) '#${event.shirtNumber}',
                  ].join('  ·  '),
                ),
                subtitle: event.rejectedReason == null ? null : Text('Refused: ${_reason(event.rejectedReason!)}'),
                trailing: Icon(
                  event.rejectedReason != null
                      ? Icons.error_outline
                      : (event.synced ? Icons.cloud_done_outlined : Icons.cloud_upload_outlined),
                  size: 20,
                  color: event.rejectedReason != null ? theme.colorScheme.error : null,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
