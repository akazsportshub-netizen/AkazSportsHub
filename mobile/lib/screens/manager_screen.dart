import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/manager_models.dart';
import '../l10n/app_strings.dart';
import '../util/format.dart';
import '../widgets.dart';

const List<String> _sports = ['FOOTBALL', 'PADEL', 'BADMINTON', 'BASKETBALL', 'VOLLEYBALL', 'TENNIS', 'CRICKET'];
final RegExp _clock = RegExp(r'^([01]\d|2[0-3]):[0-5]\d$');

/// The console for a venue manager: bookings, courts and prices, closures, earnings.
class ManagerScreen extends StatefulWidget {
  const ManagerScreen({super.key, required this.api});

  final ApiClient api;

  @override
  State<ManagerScreen> createState() => _ManagerScreenState();
}

class _ManagerScreenState extends State<ManagerScreen> {
  late Future<List<ManagerVenue>> _venues = widget.api.managerVenues();
  String? _venueId;

  void _retry() => setState(() { _venues = widget.api.managerVenues(); });

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<ManagerVenue>>(
      future: _venues,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
        if (snapshot.hasError) return ErrorRetry(message: '${snapshot.error}', onRetry: _retry);
        final venues = snapshot.data!;
        if (venues.isEmpty) return EmptyState(icon: Icons.storefront_outlined, message: context.t('mgr_no_venue'));
        final venue = venues.firstWhere((v) => v.id == _venueId, orElse: () => venues.first);
        return Column(
          children: [
            if (venues.length > 1)
              Padding(
                padding: const EdgeInsetsDirectional.fromSTEB(12, 8, 12, 0),
                child: DropdownButton<String>(
                  isExpanded: true,
                  value: venue.id,
                  items: [for (final v in venues) DropdownMenuItem(value: v.id, child: Text(v.name))],
                  onChanged: (id) => setState(() { _venueId = id; }),
                ),
              ),
            Expanded(
              child: DefaultTabController(
                key: ValueKey(venue.id),
                length: 4,
                child: Column(
                  children: [
                    TabBar(
                      isScrollable: true,
                      tabs: [
                        Tab(text: context.t('mgr_bookings')),
                        Tab(text: context.t('mgr_courts')),
                        Tab(text: context.t('mgr_blocks')),
                        Tab(text: context.t('mgr_earnings')),
                      ],
                    ),
                    Expanded(
                      child: TabBarView(
                        children: [
                          _BookingsTab(api: widget.api, venue: venue),
                          _CourtsTab(api: widget.api, venue: venue),
                          _BlocksTab(api: widget.api, venue: venue),
                          _EarningsTab(api: widget.api, venue: venue),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

// ---- bookings -----------------------------------------------------------------

class _BookingsTab extends StatefulWidget {
  const _BookingsTab({required this.api, required this.venue});

  final ApiClient api;
  final ManagerVenue venue;

  @override
  State<_BookingsTab> createState() => _BookingsTabState();
}

class _BookingsTabState extends State<_BookingsTab> {
  late Future<List<ManagerBooking>> _future = widget.api.managerBookings(widget.venue.id);

  Future<void> _reload() async {
    final next = widget.api.managerBookings(widget.venue.id);
    setState(() { _future = next; });
    await next.then((_) {}, onError: (Object _) {});
  }

  Future<void> _open(ManagerBooking booking) async {
    final tz = widget.venue.timezone;
    final cancel = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('${booking.courtName} · ${context.sportName(booking.sport)}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(formatSlot(booking.startsAt, booking.endsAt, tz)),
            const SizedBox(height: 8),
            Text(context.t('mgr_booked_by', {'name': booking.organizerName})),
            SelectableText(booking.organizerPhone),
            const SizedBox(height: 8),
            Text(formatMoney(booking.totalMinor, booking.currency)),
            Text(context.t('mgr_paid_of', {'paid': booking.sharesPaid, 'total': booking.sharesTotal})),
            const SizedBox(height: 8),
            Align(alignment: AlignmentDirectional.centerStart, child: StatusChip(booking.status)),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(context.t('mgr_close'))),
          if (booking.isCancellable)
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
              onPressed: () => Navigator.pop(context, true),
              child: Text(context.t('mgr_cancel_booking')),
            ),
        ],
      ),
    );
    if (cancel != true || !mounted) return;

    final sure = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.t('mgr_cancel_title')),
        content: Text(context.t('mgr_cancel_body')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(context.t('mgr_keep'))),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(context.t('mgr_cancel_booking'))),
        ],
      ),
    );
    if (sure != true || !mounted) return;
    try {
      await widget.api.cancelBooking(booking.id, reason: 'Cancelled by the venue');
      if (!mounted) return;
      showMessage(context, context.t('mgr_cancelled'));
      await _reload();
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tz = widget.venue.timezone;
    return FutureBuilder<List<ManagerBooking>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
        if (snapshot.hasError) return ErrorRetry(message: '${snapshot.error}', onRetry: _reload);
        final bookings = snapshot.data!;
        if (bookings.isEmpty) {
          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView(children: [
              const SizedBox(height: 120),
              EmptyState(icon: Icons.event_busy, message: context.t('mgr_no_bookings')),
            ]),
          );
        }
        final rows = <Widget>[];
        String? lastDay;
        for (final booking in bookings) {
          final day = formatDay(booking.startsAt, tz);
          if (day != lastDay) {
            rows.add(Padding(
              padding: const EdgeInsetsDirectional.fromSTEB(16, 16, 16, 4),
              child: Text(day, style: Theme.of(context).textTheme.titleSmall),
            ));
            lastDay = day;
          }
          rows.add(ListTile(
            title: Text('${formatClock(booking.startsAt, tz)}–${formatClock(booking.endsAt, tz)} · ${booking.courtName}'),
            subtitle: Text('${booking.organizerName} · ${context.t('mgr_paid_of', {'paid': booking.sharesPaid, 'total': booking.sharesTotal})}'),
            trailing: StatusChip(booking.status),
            onTap: () => _open(booking),
          ));
        }
        return RefreshIndicator(onRefresh: _reload, child: ListView(children: rows));
      },
    );
  }
}

// ---- courts -------------------------------------------------------------------

class _CourtsTab extends StatefulWidget {
  const _CourtsTab({required this.api, required this.venue});

  final ApiClient api;
  final ManagerVenue venue;

  @override
  State<_CourtsTab> createState() => _CourtsTabState();
}

class _CourtsTabState extends State<_CourtsTab> {
  late Future<List<ManagerCourt>> _future = widget.api.managerCourts(widget.venue.id);

  Future<void> _reload() async {
    final next = widget.api.managerCourts(widget.venue.id);
    setState(() { _future = next; });
    await next.then((_) {}, onError: (Object _) {});
  }

  Future<void> _edit([ManagerCourt? court]) async {
    final fields = await showDialog<Map<String, Object?>>(
      context: context,
      builder: (context) => _CourtDialog(currency: widget.venue.currency, court: court),
    );
    if (fields == null || fields.isEmpty || !mounted) return;
    try {
      if (court == null) {
        await widget.api.createCourt(widget.venue.id, fields);
      } else {
        await widget.api.updateCourt(court.id, fields);
      }
      if (!mounted) return;
      showMessage(context, context.t('mgr_saved'));
      await _reload();
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final currency = widget.venue.currency;
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _edit,
        icon: const Icon(Icons.add),
        label: Text(context.t('mgr_add_court')),
      ),
      body: FutureBuilder<List<ManagerCourt>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snapshot.hasError) return ErrorRetry(message: '${snapshot.error}', onRetry: _reload);
          final courts = snapshot.data!;
          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              padding: const EdgeInsets.only(bottom: 88),
              children: [
                for (final court in courts)
                  ListTile(
                    title: Text(court.name),
                    subtitle: Text(
                      '${context.t('mgr_court_line', {'sport': context.sportName(court.sport), 'players': court.capacityPlayers, 'price': formatMoney(court.pricePerHourMinor, currency)})}\n'
                      '${context.t('mgr_hours_line', {'opens': court.opensAt, 'closes': court.closesAt, 'minutes': court.slotMinutes})}',
                    ),
                    isThreeLine: true,
                    trailing: court.isActive ? const Icon(Icons.edit_outlined) : Text(context.t('mgr_inactive')),
                    onTap: () => _edit(court),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _CourtDialog extends StatefulWidget {
  const _CourtDialog({required this.currency, this.court});

  final String currency;
  final ManagerCourt? court;

  @override
  State<_CourtDialog> createState() => _CourtDialogState();
}

class _CourtDialogState extends State<_CourtDialog> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name = TextEditingController(text: widget.court?.name ?? '');
  late final TextEditingController _price =
      TextEditingController(text: widget.court == null ? '' : minorToPlain(widget.court!.pricePerHourMinor, widget.currency));
  late final TextEditingController _capacity = TextEditingController(text: '${widget.court?.capacityPlayers ?? 10}');
  late final TextEditingController _opens = TextEditingController(text: widget.court?.opensAt ?? '06:00');
  late final TextEditingController _closes = TextEditingController(text: widget.court?.closesAt ?? '00:00');
  late String _sport = widget.court?.sport ?? 'FOOTBALL';
  late int _slot = widget.court?.slotMinutes ?? 60;
  late bool _active = widget.court?.isActive ?? true;

  @override
  void dispose() {
    _name.dispose();
    _price.dispose();
    _capacity.dispose();
    _opens.dispose();
    _closes.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_form.currentState!.validate()) {
      showMessage(context, context.t('mgr_invalid'));
      return;
    }
    final fields = <String, Object?>{
      'name': _name.text.trim(),
      'capacity_players': int.parse(_capacity.text.trim()),
      'price_per_hour_minor': parseMinor(_price.text, widget.currency)!,
      'slot_minutes': _slot,
      'opens_at': _opens.text.trim(),
      'closes_at': _closes.text.trim(),
    };
    final existing = widget.court;
    if (existing == null) {
      fields['sport'] = _sport;
    } else {
      // Only what changed is sent: touching hours or slot length is refused while bookings exist.
      fields['is_active'] = _active;
      final original = <String, Object?>{
        'name': existing.name,
        'capacity_players': existing.capacityPlayers,
        'price_per_hour_minor': existing.pricePerHourMinor,
        'slot_minutes': existing.slotMinutes,
        'opens_at': existing.opensAt,
        'closes_at': existing.closesAt,
        'is_active': existing.isActive,
      };
      fields.removeWhere((key, value) => original[key] == value);
    }
    Navigator.pop(context, fields);
  }

  String? _clockError(String? value) => _clock.hasMatch((value ?? '').trim()) ? null : context.t('mgr_invalid');

  @override
  Widget build(BuildContext context) {
    final editing = widget.court != null;
    return AlertDialog(
      title: Text(context.t(editing ? 'mgr_edit_court' : 'mgr_add_court')),
      content: SingleChildScrollView(
        child: Form(
          key: _form,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextFormField(
                controller: _name,
                decoration: InputDecoration(labelText: context.t('mgr_court_name')),
                validator: (value) => (value ?? '').trim().isEmpty ? context.t('mgr_invalid') : null,
              ),
              if (!editing)
                DropdownButtonFormField<String>(
                  value: _sport,
                  decoration: InputDecoration(labelText: context.t('mgr_sport')),
                  items: [for (final sport in _sports) DropdownMenuItem(value: sport, child: Text(context.sportName(sport)))],
                  onChanged: (value) => setState(() { _sport = value ?? _sport; }),
                ),
              TextFormField(
                controller: _price,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(
                  labelText: context.t('mgr_price', {'currency': widget.currency}),
                  helperText: editing ? context.t('mgr_price_note') : null,
                  helperMaxLines: 2,
                ),
                validator: (value) => parseMinor(value ?? '', widget.currency) == null ? context.t('mgr_invalid') : null,
              ),
              TextFormField(
                controller: _capacity,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(labelText: context.t('mgr_capacity')),
                validator: (value) {
                  final n = int.tryParse((value ?? '').trim());
                  return n == null || n < 2 || n > 30 ? context.t('mgr_invalid') : null;
                },
              ),
              DropdownButtonFormField<int>(
                value: _slot,
                decoration: InputDecoration(labelText: context.t('mgr_slot')),
                items: [for (final minutes in const [30, 60, 90, 120]) DropdownMenuItem(value: minutes, child: Text('$minutes'))],
                onChanged: (value) => setState(() { _slot = value ?? _slot; }),
              ),
              TextFormField(
                controller: _opens,
                decoration: InputDecoration(labelText: context.t('mgr_opens')),
                validator: _clockError,
              ),
              TextFormField(
                controller: _closes,
                decoration: InputDecoration(labelText: context.t('mgr_closes')),
                validator: _clockError,
              ),
              if (editing)
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(context.t('mgr_active')),
                  value: _active,
                  onChanged: (value) => setState(() { _active = value; }),
                ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(context.t('cancel'))),
        FilledButton(onPressed: _submit, child: Text(context.t('mgr_save'))),
      ],
    );
  }
}

// ---- closures -----------------------------------------------------------------

class _BlocksTab extends StatefulWidget {
  const _BlocksTab({required this.api, required this.venue});

  final ApiClient api;
  final ManagerVenue venue;

  @override
  State<_BlocksTab> createState() => _BlocksTabState();
}

class _BlocksTabState extends State<_BlocksTab> {
  late Future<List<CourtBlock>> _future = widget.api.managerBlocks(widget.venue.id);

  Future<void> _reload() async {
    final next = widget.api.managerBlocks(widget.venue.id);
    setState(() { _future = next; });
    await next.then((_) {}, onError: (Object _) {});
  }

  Future<void> _add() async {
    try {
      final courts = (await widget.api.managerCourts(widget.venue.id)).where((court) => court.isActive).toList();
      if (!mounted) return;
      if (courts.isEmpty) {
        showMessage(context, context.t('mgr_invalid'));
        return;
      }
      final choice = await showDialog<({String courtId, DateTime startsAt, DateTime endsAt, String reason})>(
        context: context,
        builder: (context) => _BlockDialog(courts: courts, timezone: widget.venue.timezone),
      );
      if (choice == null || !mounted) return;
      await widget.api.createBlock(choice.courtId, startsAt: choice.startsAt, endsAt: choice.endsAt, reason: choice.reason);
      if (!mounted) return;
      showMessage(context, context.t('mgr_block_added'));
      await _reload();
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    }
  }

  Future<void> _remove(CourtBlock block) async {
    try {
      await widget.api.deleteBlock(block.id);
      if (!mounted) return;
      showMessage(context, context.t('mgr_block_removed'));
      await _reload();
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tz = widget.venue.timezone;
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _add,
        icon: const Icon(Icons.block),
        label: Text(context.t('mgr_block_court')),
      ),
      body: FutureBuilder<List<CourtBlock>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snapshot.hasError) return ErrorRetry(message: '${snapshot.error}', onRetry: _reload);
          final blocks = snapshot.data!;
          if (blocks.isEmpty) {
            return RefreshIndicator(
              onRefresh: _reload,
              child: ListView(children: [
                const SizedBox(height: 120),
                EmptyState(icon: Icons.event_available, message: context.t('mgr_no_blocks')),
              ]),
            );
          }
          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              padding: const EdgeInsets.only(bottom: 88),
              children: [
                for (final block in blocks)
                  ListTile(
                    title: Text('${block.courtName} · ${formatSlot(block.startsAt, block.endsAt, tz)}'),
                    subtitle: block.reason == null ? null : Text(block.reason!),
                    trailing: IconButton(
                      tooltip: context.t('mgr_remove'),
                      icon: const Icon(Icons.delete_outline),
                      onPressed: () => _remove(block),
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

class _BlockDialog extends StatefulWidget {
  const _BlockDialog({required this.courts, required this.timezone});

  final List<ManagerCourt> courts;
  final String timezone;

  @override
  State<_BlockDialog> createState() => _BlockDialogState();
}

class _BlockDialogState extends State<_BlockDialog> {
  late String _courtId = widget.courts.first.id;
  late DateTime _date = venueToday(widget.timezone);
  TimeOfDay _from = const TimeOfDay(hour: 18, minute: 0);
  TimeOfDay _to = const TimeOfDay(hour: 20, minute: 0);
  final TextEditingController _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final today = venueToday(widget.timezone);
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: today,
      lastDate: DateTime(today.year + 1, today.month, today.day),
    );
    if (picked != null) setState(() { _date = picked; });
  }

  Future<void> _pickTime(bool from) async {
    final picked = await showTimePicker(context: context, initialTime: from ? _from : _to);
    if (picked == null) return;
    setState(() {
      if (from) {
        _from = picked;
      } else {
        _to = picked;
      }
    });
  }

  void _submit() {
    final start = DateTime(_date.year, _date.month, _date.day, _from.hour, _from.minute);
    var end = DateTime(_date.year, _date.month, _date.day, _to.hour, _to.minute);
    // A closure that ends "before" it starts runs past midnight.
    if (!end.isAfter(start)) end = DateTime(_date.year, _date.month, _date.day + 1, _to.hour, _to.minute);
    Navigator.pop(context, (
      courtId: _courtId,
      startsAt: fromVenueTime(start, widget.timezone),
      endsAt: fromVenueTime(end, widget.timezone),
      reason: _reason.text.trim(),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(context.t('mgr_block_court')),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            DropdownButtonFormField<String>(
              value: _courtId,
              decoration: InputDecoration(labelText: context.t('mgr_pick_court')),
              items: [for (final court in widget.courts) DropdownMenuItem(value: court.id, child: Text(court.name))],
              onChanged: (value) => setState(() { _courtId = value ?? _courtId; }),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _pickDate,
              icon: const Icon(Icons.calendar_today, size: 18),
              label: Text('${context.t('mgr_block_date')}: ${formatCalendarDay(_date)}'),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(onPressed: () => _pickTime(true), child: Text('${context.t('mgr_block_from')} ${_from.format(context)}')),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(onPressed: () => _pickTime(false), child: Text('${context.t('mgr_block_to')} ${_to.format(context)}')),
                ),
              ],
            ),
            TextField(controller: _reason, maxLength: 200, decoration: InputDecoration(labelText: context.t('mgr_block_reason'))),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(context.t('cancel'))),
        FilledButton(onPressed: _submit, child: Text(context.t('mgr_block_add'))),
      ],
    );
  }
}

// ---- earnings -----------------------------------------------------------------

class _EarningsTab extends StatefulWidget {
  const _EarningsTab({required this.api, required this.venue});

  final ApiClient api;
  final ManagerVenue venue;

  @override
  State<_EarningsTab> createState() => _EarningsTabState();
}

class _EarningsTabState extends State<_EarningsTab> {
  int _range = 0;
  late Future<Earnings> _future = _load();

  Future<Earnings> _load() {
    final today = venueToday(widget.venue.timezone);
    final (DateTime from, DateTime to) = switch (_range) {
      1 => (DateTime(today.year, today.month, today.day - 6), today),
      2 => (DateTime(today.year, today.month - 1, 1), DateTime(today.year, today.month, 0)),
      _ => (DateTime(today.year, today.month, 1), today),
    };
    return widget.api.managerEarnings(widget.venue.id, from: isoDate(from), to: isoDate(to));
  }

  void _choose(int range) => setState(() {
        _range = range;
        _future = _load();
      });

  Future<void> _reload() async {
    final next = _load();
    setState(() { _future = next; });
    await next.then((_) {}, onError: (Object _) {});
  }

  @override
  Widget build(BuildContext context) {
    final labels = [context.t('mgr_this_month'), context.t('mgr_last_7'), context.t('mgr_last_month')];
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
          child: Wrap(
            spacing: 8,
            children: [
              for (var i = 0; i < labels.length; i++)
                ChoiceChip(label: Text(labels[i]), selected: _range == i, onSelected: (_) => _choose(i)),
            ],
          ),
        ),
        Expanded(
          child: FutureBuilder<Earnings>(
            future: _future,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
              if (snapshot.hasError) return ErrorRetry(message: '${snapshot.error}', onRetry: _reload);
              final earnings = snapshot.data!;
              final money = (int minor) => formatMoney(minor, earnings.currency);
              return RefreshIndicator(
                onRefresh: _reload,
                child: ListView(
                  padding: const EdgeInsets.all(12),
                  children: [
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(money(earnings.netMinor), style: Theme.of(context).textTheme.headlineMedium),
                            Text(context.t('mgr_net')),
                            const Divider(height: 24),
                            _line(context.t('mgr_gross'), money(earnings.grossMinor)),
                            _line(context.t('mgr_commission'), '-${money(earnings.commissionMinor)}'),
                            _line(context.t('mgr_count', {'n': earnings.bookings}), ''),
                          ],
                        ),
                      ),
                    ),
                    if (earnings.days.isEmpty)
                      Padding(padding: const EdgeInsets.all(16), child: Center(child: Text(context.t('mgr_no_earnings'))))
                    else
                      for (final day in earnings.days)
                        ListTile(
                          title: Text(formatCalendarDay(DateTime.parse(day.date))),
                          subtitle: Text(context.t('mgr_count', {'n': day.bookings})),
                          trailing: Text(money(day.netMinor), style: Theme.of(context).textTheme.titleMedium),
                        ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(4, 16, 4, 24),
                      child: Text(context.t('mgr_earn_note'), style: Theme.of(context).textTheme.bodySmall),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _line(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text(label), Text(value)]),
      );
}
