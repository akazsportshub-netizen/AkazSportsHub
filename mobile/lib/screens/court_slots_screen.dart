import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../l10n/app_strings.dart';
import '../util/format.dart';
import '../widgets.dart';
import 'booking_screen.dart';
import 'hold_dialog.dart';

/// Pick a day and a free slot, then hold it.
class CourtSlotsScreen extends StatefulWidget {
  const CourtSlotsScreen({super.key, required this.api, required this.venue, required this.court, required this.onBookingsChanged});

  final ApiClient api;
  final Venue venue;
  final Court court;
  final VoidCallback onBookingsChanged;

  @override
  State<CourtSlotsScreen> createState() => _CourtSlotsScreenState();
}

class _CourtSlotsScreenState extends State<CourtSlotsScreen> {
  static const int _daysAhead = 14;

  late final List<DateTime> _days;
  late DateTime _day;
  late Future<Availability> _availability;
  bool _booking = false;

  @override
  void initState() {
    super.initState();
    final today = venueToday(widget.venue.timezone);
    _days = List.generate(_daysAhead, (index) => DateTime(today.year, today.month, today.day + index));
    _day = _days.first;
    _availability = _load();
  }

  Future<Availability> _load() => widget.api.availability(widget.court.id, isoDate(_day));

  void _reload() => setState(() { _availability = _load(); });

  Future<void> _hold(Slot slot) async {
    final timezone = widget.venue.timezone;
    final friends = await showHoldDialog(
      context,
      api: widget.api,
      summary: '${widget.court.name}\n${formatSlot(slot.startsAt, slot.endsAt, timezone)}',
      priceMinor: slot.priceMinor,
      currency: slot.currency,
      maxPlayers: widget.court.capacityPlayers,
    );
    if (friends == null || !mounted) return;

    setState(() { _booking = true; });
    try {
      final booking = await widget.api.createBooking(courtId: widget.court.id, startsAt: slot.startsAt, endsAt: slot.endsAt, friends: friends);
      widget.onBookingsChanged();
      if (!mounted) return;
      await Navigator.push(
        context,
        MaterialPageRoute<void>(
          builder: (_) => BookingScreen(api: widget.api, bookingId: booking.id, initial: booking, onBookingsChanged: widget.onBookingsChanged),
        ),
      );
      if (mounted) _reload();
    } on ApiException catch (error) {
      if (!mounted) return;
      showMessage(context, error.code == 'SLOT_TAKEN' ? context.t('slot_taken') : error.message);
      _reload();
    } finally {
      if (mounted) setState(() { _booking = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final timezone = widget.venue.timezone;
    return Scaffold(
      appBar: AppBar(title: Text(widget.court.name)),
      body: Column(
        children: [
          SizedBox(
            height: 76,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              itemCount: _days.length,
              itemBuilder: (context, index) {
                final day = _days[index];
                final selected = day == _day;
                final parts = formatCalendarDay(day).split(' ');
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    selected: selected,
                    onSelected: (_) {
                      _day = day;
                      _reload();
                    },
                    label: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(index == 0 ? context.t('today') : parts[0], style: const TextStyle(fontSize: 12)),
                        Text('${parts[1]} ${parts[2]}', style: const TextStyle(fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: FutureBuilder<Availability>(
              future: _availability,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) return ErrorRetry(message: snapshot.error.toString(), onRetry: _reload);
                final now = DateTime.now().toUtc();
                final slots = snapshot.data!.slots.where((slot) => slot.startsAt.isAfter(now)).toList();
                if (slots.isEmpty) {
                  return EmptyState(icon: Icons.event_busy, message: context.t('no_slots'));
                }
                return AbsorbPointer(
                  absorbing: _booking,
                  child: GridView.builder(
                    padding: const EdgeInsets.all(12),
                    gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                      maxCrossAxisExtent: 180,
                      mainAxisExtent: 76,
                      crossAxisSpacing: 8,
                      mainAxisSpacing: 8,
                    ),
                    itemCount: slots.length,
                    itemBuilder: (context, index) => _SlotTile(slot: slots[index], timezone: timezone, onTap: () => _hold(slots[index])),
                  ),
                );
              },
            ),
          ),
          if (_booking) const LinearProgressIndicator(),
        ],
      ),
    );
  }
}

class _SlotTile extends StatelessWidget {
  const _SlotTile({required this.slot, required this.timezone, required this.onTap});

  final Slot slot;
  final String timezone;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final available = slot.available;
    return Material(
      color: available ? scheme.primaryContainer : scheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: available ? onTap : null,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                '${formatClock(slot.startsAt, timezone)}–${formatClock(slot.endsAt, timezone)}',
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: available ? scheme.onPrimaryContainer : scheme.outline,
                  decoration: available ? null : TextDecoration.lineThrough,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                available ? formatMoney(slot.priceMinor, slot.currency) : context.t('booked'),
                style: TextStyle(fontSize: 12, color: available ? scheme.onPrimaryContainer : scheme.outline),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
