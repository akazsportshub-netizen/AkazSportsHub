import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../l10n/app_strings.dart';
import '../util/format.dart';
import '../widgets.dart';
import 'booking_screen.dart';

class MyBookingsScreen extends StatefulWidget {
  const MyBookingsScreen({super.key, required this.api, required this.onBookingsChanged});

  final ApiClient api;
  final VoidCallback onBookingsChanged;

  @override
  State<MyBookingsScreen> createState() => _MyBookingsScreenState();
}

class _MyBookingsScreenState extends State<MyBookingsScreen> {
  late Future<List<BookingSummary>> _bookings;

  @override
  void initState() {
    super.initState();
    _bookings = widget.api.myBookings();
  }

  Future<void> _reload() async {
    final next = widget.api.myBookings();
    setState(() { _bookings = next; });
    await next.catchError((Object _) => <BookingSummary>[]);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<BookingSummary>>(
      future: _bookings,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) return ErrorRetry(message: snapshot.error.toString(), onRetry: _reload);
        final bookings = snapshot.data!;
        if (bookings.isEmpty) {
          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              children: [
                const SizedBox(height: 120),
                EmptyState(icon: Icons.event_note_outlined, message: context.t('no_bookings')),
              ],
            ),
          );
        }

        final now = DateTime.now().toUtc();
        final upcoming = bookings.where((booking) => booking.endsAt.isAfter(now) && !_isClosed(booking.status)).toList()
          ..sort((a, b) => a.startsAt.compareTo(b.startsAt));
        final past = bookings.where((booking) => !upcoming.contains(booking)).toList();

        return RefreshIndicator(
          onRefresh: _reload,
          child: ListView(
            padding: const EdgeInsets.all(12),
            children: [
              if (upcoming.isNotEmpty) _header(context, context.t('upcoming')),
              ...upcoming.map(_tile),
              if (past.isNotEmpty) _header(context, context.t('past_cancelled')),
              ...past.map(_tile),
            ],
          ),
        );
      },
    );
  }

  static bool _isClosed(String status) => status == 'EXPIRED' || status == 'CANCELLED' || status == 'COMPLETED';

  Widget _header(BuildContext context, String text) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 12, 4, 6),
        child: Text(text, style: Theme.of(context).textTheme.titleMedium),
      );

  Widget _tile(BookingSummary booking) {
    final yourPart = booking.myShareMinor == null
        ? null
        : context.t('your_share', {'amount': formatMoney(booking.myShareMinor!, booking.currency)}) +
            (booking.myShareStatus == 'PAID' ? ' · ${context.t('paid_suffix')}' : '');
    return Card(
      child: ListTile(
        title: Text(booking.venueName),
        subtitle: Text([
          booking.courtName,
          formatSlot(booking.startsAt, booking.endsAt, booking.timezone),
          if (yourPart != null) yourPart,
        ].join('\n')),
        isThreeLine: true,
        trailing: StatusChip(booking.status),
        onTap: () async {
          await Navigator.push(
            context,
            MaterialPageRoute<void>(
              builder: (_) => BookingScreen(api: widget.api, bookingId: booking.id, onBookingsChanged: widget.onBookingsChanged),
            ),
          );
          if (mounted) await _reload();
        },
      ),
    );
  }
}
