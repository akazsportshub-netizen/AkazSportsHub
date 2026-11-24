import 'package:flutter/material.dart';

import '../api/academy_models.dart';
import '../api/api_client.dart';
import '../api/manager_models.dart';
import '../l10n/app_strings.dart';
import '../util/format.dart';
import '../widgets.dart';

const List<String> _sports = ['FOOTBALL', 'PADEL', 'BADMINTON', 'BASKETBALL', 'VOLLEYBALL', 'TENNIS', 'CRICKET'];
final RegExp _clock = RegExp(r'^([01]\d|2[0-3]):[0-5]\d$');

String _dayLabel(String isoDay) {
  final day = parseDay(isoDay);
  return day == null ? isoDay : formatCalendarDay(day);
}

/// The Academy tab of the venue console: training groups, and the monthly fees.
class AcademyTab extends StatefulWidget {
  const AcademyTab({super.key, required this.api, required this.venue});

  final ApiClient api;
  final ManagerVenue venue;

  @override
  State<AcademyTab> createState() => _AcademyTabState();
}

class _AcademyTabState extends State<AcademyTab> {
  late Future<List<AcademyGroup>> _future = widget.api.managerAcademyGroups(widget.venue.id);

  Future<void> _reload() async {
    final next = widget.api.managerAcademyGroups(widget.venue.id);
    setState(() { _future = next; });
    await next.then((_) {}, onError: (Object _) {});
  }

  Future<void> _create() async {
    final fields = await showDialog<Map<String, Object?>>(context: context, builder: (_) => _GroupDialog(currency: widget.venue.currency));
    if (fields == null || !mounted) return;
    try {
      await widget.api.createAcademyGroup(widget.venue.id, fields);
      if (!mounted) return;
      showMessage(context, context.t('mgr_saved'));
      await _reload();
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    }
  }

  Future<void> _open(AcademyGroup group) async {
    await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => _GroupScreen(api: widget.api, venue: widget.venue, group: group)));
    if (mounted) await _reload();
  }

  Future<void> _fees() => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => _FeesScreen(api: widget.api, venue: widget.venue)));

  @override
  Widget build(BuildContext context) {
    final currency = widget.venue.currency;
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(onPressed: _create, icon: const Icon(Icons.add), label: Text(context.t('acad_new_group'))),
      body: FutureBuilder<List<AcademyGroup>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snapshot.hasError) return ErrorRetry(message: '${snapshot.error}', onRetry: _reload);
          final groups = snapshot.data!;
          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              padding: const EdgeInsets.only(bottom: 88),
              children: [
                ListTile(
                  leading: const Icon(Icons.receipt_long_outlined),
                  title: Text(context.t('acad_monthly_fees')),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: _fees,
                ),
                const Divider(height: 1),
                if (groups.isEmpty) Padding(padding: const EdgeInsets.all(24), child: Text(context.t('acad_mgr_empty'), textAlign: TextAlign.center)),
                for (final g in groups)
                  ListTile(
                    onTap: () => _open(g),
                    title: Text('${g.name}${g.ageGroup == null ? '' : ' · ${g.ageGroup}'}'),
                    subtitle: Text(
                      '${context.sportName(g.sport)} · ${weekdayName(g.weekday)} ${g.startsAt}\n'
                      '${context.t('acad_enrolled_of', {'n': g.enrolled, 'max': g.capacity})} · ${context.t('acad_per_month', {'price': formatMoney(g.monthlyFeeMinor, currency)})}',
                    ),
                    isThreeLine: true,
                    trailing: g.isActive ? const Icon(Icons.chevron_right) : Text(context.t('mgr_inactive')),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _GroupDialog extends StatefulWidget {
  const _GroupDialog({required this.currency});

  final String currency;

  @override
  State<_GroupDialog> createState() => _GroupDialogState();
}

class _GroupDialogState extends State<_GroupDialog> {
  final _name = TextEditingController();
  final _age = TextEditingController();
  final _coach = TextEditingController();
  final _time = TextEditingController(text: '17:00');
  final _duration = TextEditingController(text: '60');
  final _fee = TextEditingController();
  final _capacity = TextEditingController(text: '20');
  String _sport = 'FOOTBALL';
  int _weekday = 4;
  String? _error;

  @override
  void dispose() {
    for (final c in [_name, _age, _coach, _time, _duration, _fee, _capacity]) {
      c.dispose();
    }
    super.dispose();
  }

  void _save() {
    final name = _name.text.trim();
    final fee = parseMinor(_fee.text, widget.currency);
    final duration = int.tryParse(_duration.text.trim());
    final capacity = int.tryParse(_capacity.text.trim());
    String? problem;
    if (name.isEmpty) {
      problem = context.t('acad_err_name');
    } else if (!_clock.hasMatch(_time.text.trim())) {
      problem = context.t('acad_err_time');
    } else if (duration == null || duration < 15 || duration > 240) {
      problem = context.t('acad_err_duration');
    } else if (fee == null) {
      problem = context.t('acad_err_price');
    } else if (capacity == null || capacity < 1 || capacity > 200) {
      problem = context.t('acad_err_capacity');
    }
    if (problem != null) {
      setState(() { _error = problem; });
      return;
    }
    Navigator.pop<Map<String, Object?>>(context, {
      'name': name,
      'sport': _sport,
      if (_age.text.trim().isNotEmpty) 'age_group': _age.text.trim(),
      if (_coach.text.trim().isNotEmpty) 'coach_name': _coach.text.trim(),
      'weekday': _weekday,
      'starts_at': _time.text.trim(),
      'duration_minutes': duration,
      'monthly_fee_minor': fee,
      'capacity': capacity,
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(context.t('acad_new_group')),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: _name, decoration: InputDecoration(labelText: context.t('acad_group_name'))),
            DropdownButtonFormField<String>(
              value: _sport,
              decoration: InputDecoration(labelText: context.t('mgr_sport')),
              items: [for (final s in _sports) DropdownMenuItem(value: s, child: Text(context.sportName(s)))],
              onChanged: (v) => setState(() { _sport = v ?? _sport; }),
            ),
            TextField(controller: _age, decoration: InputDecoration(labelText: context.t('acad_child_age_group'), hintText: 'U-10')),
            TextField(controller: _coach, decoration: InputDecoration(labelText: context.t('acad_coach_name'))),
            DropdownButtonFormField<int>(
              value: _weekday,
              decoration: InputDecoration(labelText: context.t('acad_weekday')),
              items: [for (var d = 1; d <= 7; d++) DropdownMenuItem(value: d, child: Text(weekdayName(d)))],
              onChanged: (v) => setState(() { _weekday = v ?? _weekday; }),
            ),
            TextField(controller: _time, decoration: InputDecoration(labelText: context.t('acad_starts_at'), hintText: '17:30')),
            TextField(controller: _duration, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: context.t('acad_duration'))),
            TextField(
              controller: _fee,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(labelText: context.t('acad_fee', {'currency': widget.currency})),
            ),
            TextField(controller: _capacity, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: context.t('acad_capacity'))),
            if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(context.t('cancel'))),
        FilledButton(onPressed: _save, child: Text(context.t('mgr_save'))),
      ],
    );
  }
}

// ---- one group: players and sessions ------------------------------------------------

class _GroupScreen extends StatefulWidget {
  const _GroupScreen({required this.api, required this.venue, required this.group});

  final ApiClient api;
  final ManagerVenue venue;
  final AcademyGroup group;

  @override
  State<_GroupScreen> createState() => _GroupScreenState();
}

class _GroupScreenState extends State<_GroupScreen> {
  late Future<List<RosterEntry>> _roster = widget.api.academyRoster(widget.group.id);
  late Future<List<AcademySession>> _sessions = widget.api.academySessions(widget.group.id);

  void _reloadSessions() => setState(() { _sessions = widget.api.academySessions(widget.group.id); });

  Future<void> _more() async {
    try {
      await widget.api.moreAcademySessions(widget.group.id, 8);
      if (mounted) _reloadSessions();
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    }
  }

  Future<void> _toggleCancel(AcademySession s) async {
    try {
      await widget.api.updateAcademySession(s.id, cancelled: !s.cancelled);
      if (mounted) _reloadSessions();
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    }
  }

  Future<void> _attendance(AcademySession s) async {
    await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => _AttendanceScreen(api: widget.api, session: s)));
    if (mounted) _reloadSessions();
  }

  @override
  Widget build(BuildContext context) {
    final g = widget.group;
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(g.name),
          bottom: TabBar(tabs: [Tab(text: context.t('acad_players')), Tab(text: context.t('acad_sessions'))]),
        ),
        body: TabBarView(
          children: [
            FutureBuilder<List<RosterEntry>>(
              future: _roster,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
                if (snapshot.hasError) return ErrorRetry(message: '${snapshot.error}', onRetry: () => setState(() { _roster = widget.api.academyRoster(g.id); }));
                final players = snapshot.data!;
                if (players.isEmpty) return EmptyState(icon: Icons.groups_outlined, message: context.t('acad_no_players'));
                return ListView(
                  children: [
                    for (final p in players)
                      ListTile(
                        title: Text(p.playerName),
                        subtitle: SelectableText('${p.contactName} · ${p.contactPhone}'),
                        trailing: p.invoicesDue > 0 ? Chip(label: Text(context.t('acad_fees_due', {'n': p.invoicesDue}))) : null,
                      ),
                  ],
                );
              },
            ),
            FutureBuilder<List<AcademySession>>(
              future: _sessions,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
                if (snapshot.hasError) return ErrorRetry(message: '${snapshot.error}', onRetry: _reloadSessions);
                final sessions = snapshot.data!;
                return ListView(
                  children: [
                    for (final s in sessions)
                      ListTile(
                        enabled: !s.cancelled,
                        title: Text('${_dayLabel(s.sessionDate)} · ${g.startsAt}'),
                        subtitle: Text(s.cancelled ? context.t('status_cancelled') : (s.marked > 0 ? context.t('acad_marked', {'n': s.marked}) : context.t('acad_not_marked'))),
                        onTap: s.cancelled ? null : () => _attendance(s),
                        trailing: IconButton(
                          tooltip: s.cancelled ? context.t('acad_restore') : context.t('acad_cancel_session'),
                          icon: Icon(s.cancelled ? Icons.restore : Icons.event_busy_outlined),
                          onPressed: () => _toggleCancel(s),
                        ),
                      ),
                    Padding(padding: const EdgeInsets.all(12), child: OutlinedButton(onPressed: _more, child: Text(context.t('acad_more_sessions')))),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _AttendanceScreen extends StatefulWidget {
  const _AttendanceScreen({required this.api, required this.session});

  final ApiClient api;
  final AcademySession session;

  @override
  State<_AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<_AttendanceScreen> {
  late Future<AttendanceSheet> _future = widget.api.academyAttendance(widget.session.id);
  bool _saving = false;

  Future<void> _save(AttendanceSheet sheet) async {
    final marks = {for (final p in sheet.players) if (p.status != null) p.enrolmentId: p.status!};
    if (marks.isEmpty) return;
    setState(() { _saving = true; });
    try {
      await widget.api.markAcademyAttendance(widget.session.id, marks);
      if (!mounted) return;
      showMessage(context, context.t('mgr_saved'));
      Navigator.pop(context);
    } on ApiException catch (error) {
      if (mounted) {
        setState(() { _saving = false; });
        showMessage(context, error.message);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_dayLabel(widget.session.sessionDate))),
      body: FutureBuilder<AttendanceSheet>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snapshot.hasError) return ErrorRetry(message: '${snapshot.error}', onRetry: () => setState(() { _future = widget.api.academyAttendance(widget.session.id); }));
          final sheet = snapshot.data!;
          if (sheet.players.isEmpty) return EmptyState(icon: Icons.groups_outlined, message: context.t('acad_no_players'));
          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(12),
                  children: [
                    for (final p in sheet.players)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(p.playerName, style: Theme.of(context).textTheme.titleSmall),
                            const SizedBox(height: 4),
                            SegmentedButton<String>(
                              emptySelectionAllowed: true,
                              showSelectedIcon: false,
                              segments: [
                                ButtonSegment(value: 'PRESENT', label: Text(context.t('acad_present'))),
                                ButtonSegment(value: 'ABSENT', label: Text(context.t('acad_absent'))),
                                ButtonSegment(value: 'EXCUSED', label: Text(context.t('acad_excused'))),
                              ],
                              selected: {if (p.status != null) p.status!},
                              onSelectionChanged: (set) => setState(() { p.status = set.isEmpty ? null : set.first; }),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: SizedBox(
                    width: double.infinity,
                    child: FilledButton(onPressed: _saving ? null : () => _save(sheet), child: Text(context.t('mgr_save'))),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ---- monthly fees --------------------------------------------------------------------

class _FeesScreen extends StatefulWidget {
  const _FeesScreen({required this.api, required this.venue});

  final ApiClient api;
  final ManagerVenue venue;

  @override
  State<_FeesScreen> createState() => _FeesScreenState();
}

class _FeesScreenState extends State<_FeesScreen> {
  late int _year;
  late int _month;
  late Future<List<AcademyInvoice>> _future;

  @override
  void initState() {
    super.initState();
    final today = venueToday(widget.venue.timezone);
    _year = today.year;
    _month = today.month;
    _future = _load();
  }

  String get _monthKey => '$_year-${_month.toString().padLeft(2, '0')}';

  Future<List<AcademyInvoice>> _load() => widget.api.academyInvoices(widget.venue.id, month: _monthKey);

  void _reload() => setState(() { _future = _load(); });

  void _shift(int by) {
    var m = _month + by;
    var y = _year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setState(() { _year = y; _month = m; _future = _load(); });
  }

  Future<void> _create() async {
    try {
      final n = await widget.api.createAcademyInvoices(widget.venue.id, _monthKey);
      if (!mounted) return;
      showMessage(context, context.t('acad_fees_created', {'n': n}));
      _reload();
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    }
  }

  Future<void> _settle(AcademyInvoice invoice) async {
    final choice = await showDialog<String>(
      context: context,
      builder: (context) => SimpleDialog(
        title: Text('${invoice.playerName} · ${formatMoney(invoice.amountMinor, invoice.currency)}'),
        children: [
          SimpleDialogOption(onPressed: () => Navigator.pop(context, 'CASH'), child: Text(context.t('acad_paid_cash'))),
          SimpleDialogOption(onPressed: () => Navigator.pop(context, 'BANK'), child: Text(context.t('acad_paid_bank'))),
          SimpleDialogOption(onPressed: () => Navigator.pop(context, 'OTHER'), child: Text(context.t('acad_paid_other'))),
          SimpleDialogOption(onPressed: () => Navigator.pop(context, 'WAIVE'), child: Text(context.t('acad_waive'))),
        ],
      ),
    );
    if (choice == null || !mounted) return;
    try {
      if (choice == 'WAIVE') {
        await widget.api.waiveAcademyInvoice(invoice.id);
      } else {
        await widget.api.payAcademyInvoice(invoice.id, choice);
      }
      if (mounted) _reload();
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.t('acad_monthly_fees'))),
      body: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              IconButton(icon: const Icon(Icons.chevron_left), onPressed: () => _shift(-1)),
              Text(_monthKey, style: Theme.of(context).textTheme.titleMedium),
              IconButton(icon: const Icon(Icons.chevron_right), onPressed: () => _shift(1)),
            ],
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: OutlinedButton(onPressed: _create, child: Text(context.t('acad_create_fees', {'month': _monthKey}))),
          ),
          Expanded(
            child: FutureBuilder<List<AcademyInvoice>>(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
                if (snapshot.hasError) return ErrorRetry(message: '${snapshot.error}', onRetry: _reload);
                final invoices = snapshot.data!;
                if (invoices.isEmpty) return EmptyState(icon: Icons.receipt_long_outlined, message: context.t('acad_no_invoices'));
                return ListView(
                  children: [
                    for (final i in invoices)
                      ListTile(
                        title: Text('${i.playerName} · ${i.groupName}'),
                        subtitle: Text('${formatMoney(i.amountMinor, i.currency)} · ${i.contactPhone}'),
                        trailing: StatusChip(i.status),
                        onTap: i.status == 'DUE' ? () => _settle(i) : null,
                      ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
