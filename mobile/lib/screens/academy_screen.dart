import 'package:flutter/material.dart';

import '../api/academy_models.dart';
import '../api/api_client.dart';
import '../l10n/app_strings.dart';
import '../util/format.dart';
import '../widgets.dart';

String _when(BuildContext context, int weekday, String startsAt) => '${weekdayName(weekday)} $startsAt';

/// For parents and players: their academy groups, attendance and fees, and a way to join more.
class AcademyScreen extends StatefulWidget {
  const AcademyScreen({super.key, required this.api});

  final ApiClient api;

  @override
  State<AcademyScreen> createState() => _AcademyScreenState();
}

class _AcademyScreenState extends State<AcademyScreen> {
  late Future<List<MyEnrolment>> _future = widget.api.myEnrolments();

  Future<void> _reload() async {
    final next = widget.api.myEnrolments();
    setState(() { _future = next; });
    await next.then((_) {}, onError: (Object _) {});
  }

  Future<void> _find() async {
    await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => _FindGroupScreen(api: widget.api)));
    if (mounted) await _reload();
  }

  Future<void> _open(MyEnrolment enrolment) async {
    await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => _EnrolmentScreen(api: widget.api, enrolment: enrolment)));
    if (mounted) await _reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.t('acad_title'))),
      floatingActionButton: FloatingActionButton.extended(onPressed: _find, icon: const Icon(Icons.add), label: Text(context.t('acad_find'))),
      body: FutureBuilder<List<MyEnrolment>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snapshot.hasError) return ErrorRetry(message: '${snapshot.error}', onRetry: _reload);
          final items = snapshot.data!;
          if (items.isEmpty) return EmptyState(icon: Icons.school_outlined, message: context.t('acad_empty'));
          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
              children: [
                for (final e in items)
                  Card(
                    child: ListTile(
                      onTap: () => _open(e),
                      title: Text('${e.playerName} · ${e.groupName}'),
                      subtitle: Text([
                        '${e.venueName} · ${_when(context, e.weekday, e.startsAt)}',
                        if (e.isActive && e.nextSession != null) context.t('acad_next', {'day': _dayLabel(e.nextSession!)}),
                        if (e.attendance.percent != null) context.t('acad_attendance_pct', {'pct': e.attendance.percent!}),
                      ].join('\n')),
                      isThreeLine: true,
                      trailing: !e.isActive
                          ? StatusChip(e.status)
                          : (e.invoicesDue > 0 ? Chip(label: Text(context.t('acad_fees_due', {'n': e.invoicesDue}))) : null),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

String _dayLabel(String isoDay) {
  final day = parseDay(isoDay);
  return day == null ? isoDay : formatCalendarDay(day);
}

// ---- find and join a group ------------------------------------------------------

class _FindGroupScreen extends StatefulWidget {
  const _FindGroupScreen({required this.api});

  final ApiClient api;

  @override
  State<_FindGroupScreen> createState() => _FindGroupScreenState();
}

class _FindGroupScreenState extends State<_FindGroupScreen> {
  late Future<List<AcademyGroup>> _future = widget.api.academyGroups();

  void _reload() => setState(() { _future = widget.api.academyGroups(); });

  Future<void> _join(AcademyGroup group) async {
    final children = await widget.api.myChildren().catchError((Object _) => <Child>[]);
    if (!mounted) return;
    final choice = await showDialog<_Who>(context: context, builder: (_) => _WhoDialog(api: widget.api, children: children, group: group));
    if (choice == null || !mounted) return;
    try {
      await widget.api.enrolInGroup(group.id, childId: choice.childId);
      if (!mounted) return;
      showMessage(context, context.t('acad_joined', {'name': choice.name}));
      _reload();
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.t('acad_find'))),
      body: FutureBuilder<List<AcademyGroup>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snapshot.hasError) return ErrorRetry(message: '${snapshot.error}', onRetry: _reload);
          final groups = snapshot.data!;
          if (groups.isEmpty) return EmptyState(icon: Icons.school_outlined, message: context.t('acad_no_groups'));
          return ListView(
            padding: const EdgeInsets.all(12),
            children: [
              for (final g in groups)
                Card(
                  child: ListTile(
                    title: Text('${g.name}${g.ageGroup == null ? '' : ' · ${g.ageGroup}'}'),
                    subtitle: Text([
                      '${g.venueName} · ${context.sportName(g.sport)}',
                      '${_when(context, g.weekday, g.startsAt)} · ${context.t('acad_minutes', {'n': g.durationMinutes})}',
                      if (g.coachName != null) context.t('acad_coach', {'name': g.coachName!}),
                      '${context.t('acad_per_month', {'price': formatMoney(g.monthlyFeeMinor, g.currency)})} · ${g.spotsLeft > 0 ? context.t('acad_spots', {'n': g.spotsLeft}) : context.t('acad_full')}',
                    ].join('\n')),
                    isThreeLine: true,
                    trailing: FilledButton.tonal(onPressed: g.spotsLeft > 0 ? () => _join(g) : null, child: Text(context.t('acad_join'))),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _Who {
  const _Who(this.name, this.childId);

  final String name;
  final String? childId; // null: the signed-in person
}

class _WhoDialog extends StatefulWidget {
  const _WhoDialog({required this.api, required this.children, required this.group});

  final ApiClient api;
  final List<Child> children;
  final AcademyGroup group;

  @override
  State<_WhoDialog> createState() => _WhoDialogState();
}

class _WhoDialogState extends State<_WhoDialog> {
  late final List<Child> _children = [...widget.children];
  final _name = TextEditingController();
  final _age = TextEditingController();
  bool _adding = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _age.dispose();
    super.dispose();
  }

  Future<void> _addChild() async {
    final name = _name.text.trim();
    if (name.isEmpty) {
      setState(() { _error = context.t('acad_child_name_needed'); });
      return;
    }
    setState(() { _busy = true; _error = null; });
    try {
      final child = await widget.api.addChild(name, ageGroup: _age.text.trim());
      if (!mounted) return;
      Navigator.pop(context, _Who(child.fullName, child.id));
    } on ApiException catch (error) {
      if (mounted) setState(() { _busy = false; _error = error.message; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(context.t('acad_who', {'group': widget.group.name})),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!_adding) ...[
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.person_outline),
                title: Text(context.t('acad_myself')),
                onTap: () => Navigator.pop(context, _Who(context.t('acad_myself'), null)),
              ),
              for (final child in _children)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.child_care),
                  title: Text(child.fullName),
                  subtitle: child.ageGroup == null || child.ageGroup!.isEmpty ? null : Text(child.ageGroup!),
                  onTap: () => Navigator.pop(context, _Who(child.fullName, child.id)),
                ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.add),
                title: Text(context.t('acad_add_child')),
                onTap: () => setState(() { _adding = true; }),
              ),
            ] else ...[
              TextField(controller: _name, decoration: InputDecoration(labelText: context.t('acad_child_name')), textCapitalization: TextCapitalization.words),
              TextField(controller: _age, decoration: InputDecoration(labelText: context.t('acad_child_age_group'), hintText: 'U-10')),
              if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => _adding ? setState(() { _adding = false; _error = null; }) : Navigator.pop(context), child: Text(context.t('cancel'))),
        if (_adding) FilledButton(onPressed: _busy ? null : _addChild, child: Text(context.t('acad_add_and_join'))),
      ],
    );
  }
}

// ---- one enrolment: attendance and fees -------------------------------------------

class _EnrolmentScreen extends StatefulWidget {
  const _EnrolmentScreen({required this.api, required this.enrolment});

  final ApiClient api;
  final MyEnrolment enrolment;

  @override
  State<_EnrolmentScreen> createState() => _EnrolmentScreenState();
}

class _EnrolmentScreenState extends State<_EnrolmentScreen> {
  late Future<EnrolmentDetail> _future = widget.api.enrolmentDetail(widget.enrolment.id);

  void _reload() => setState(() { _future = widget.api.enrolmentDetail(widget.enrolment.id); });

  Future<void> _leave() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.t('acad_leave_title', {'name': widget.enrolment.playerName})),
        content: Text(context.t('acad_leave_body')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(context.t('stay'))),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(context.t('acad_leave'))),
        ],
      ),
    );
    if (yes != true || !mounted) return;
    try {
      await widget.api.leaveGroup(widget.enrolment.id);
      if (mounted) Navigator.pop(context);
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final e = widget.enrolment;
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(e.playerName)),
      body: FutureBuilder<EnrolmentDetail>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snapshot.hasError) return ErrorRetry(message: '${snapshot.error}', onRetry: _reload);
          final detail = snapshot.data!;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(e.groupName, style: theme.textTheme.titleLarge),
              Text('${e.venueName} · ${context.sportName(e.sport)} · ${_when(context, e.weekday, e.startsAt)}'),
              const SizedBox(height: 4),
              Text(context.t('acad_per_month', {'price': formatMoney(e.monthlyFeeMinor, e.currency)})),
              const SizedBox(height: 20),
              Text(context.t('acad_attendance'), style: theme.textTheme.titleMedium),
              if (e.attendance.percent != null)
                Text(context.t('acad_attendance_line', {'pct': e.attendance.percent!, 'present': e.attendance.present, 'absent': e.attendance.absent, 'excused': e.attendance.excused})),
              const SizedBox(height: 8),
              if (detail.history.isEmpty)
                Text(context.t('acad_no_attendance'))
              else
                Wrap(spacing: 8, runSpacing: 4, children: [
                  for (final m in detail.history) Chip(label: Text('${_dayLabel(m.sessionDate)} · ${context.statusLabel(m.status)}')),
                ]),
              const SizedBox(height: 20),
              Text(context.t('acad_fees'), style: theme.textTheme.titleMedium),
              if (detail.invoices.isEmpty) Text(context.t('acad_no_fees')),
              for (final i in detail.invoices)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(i.month),
                  subtitle: Text(formatMoney(i.amountMinor, i.currency)),
                  trailing: StatusChip(i.status),
                ),
              if (detail.invoices.any((i) => i.status == 'DUE')) Text(context.t('acad_pay_at_venue'), style: theme.textTheme.bodySmall),
              const SizedBox(height: 24),
              if (e.isActive)
                OutlinedButton(
                  style: OutlinedButton.styleFrom(foregroundColor: theme.colorScheme.error),
                  onPressed: _leave,
                  child: Text(context.t('acad_leave')),
                ),
            ],
          );
        },
      ),
    );
  }
}
