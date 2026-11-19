import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../util/format.dart';
import '../widgets.dart';

/// One booking: the hold countdown, who pays what, paying your share, cancelling,
/// and asking for extra players.
class BookingScreen extends StatefulWidget {
  const BookingScreen({super.key, required this.api, required this.bookingId, this.initial, required this.onBookingsChanged});

  final ApiClient api;
  final String bookingId;
  final Booking? initial;
  final VoidCallback onBookingsChanged;

  @override
  State<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends State<BookingScreen> with WidgetsBindingObserver {
  Booking? _booking;
  String? _error;
  bool _busy = false;
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _booking = widget.initial;
    if (_booking == null) _reload();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && _booking?.isHold == true) setState(() {});
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _ticker?.cancel();
    super.dispose();
  }

  /// Coming back from a provider's payment page in the browser: show the new state.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _reload();
  }

  Future<void> _reload() async {
    try {
      final booking = await widget.api.booking(widget.bookingId);
      if (!mounted) return;
      setState(() {
        _booking = booking;
        _error = null;
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pay(Share share) => _run(() async {
        final payment = await widget.api.startPayment(widget.bookingId, share.id);
        if (!mounted) return;
        if (payment.isMock) {
          final succeed = await _askMockOutcome(payment);
          if (succeed == null) return;
          await widget.api.simulateMockPayment(payment.attemptId, succeed: succeed);
          await _waitForChange(share.id);
          widget.onBookingsChanged();
          if (mounted) showMessage(context, succeed ? 'Payment received.' : 'The payment failed. You can try again.');
        } else {
          final opened = await launchUrl(Uri.parse(payment.checkoutUrl), mode: LaunchMode.externalApplication);
          if (!opened && mounted) showMessage(context, 'Could not open the payment page.');
        }
      });

  /// The API applies a payment and confirms the booking in its own time; look a few times.
  Future<void> _waitForChange(String shareId) async {
    for (var attempt = 0; attempt < 6; attempt++) {
      await _reload();
      final share = _booking?.shares.where((item) => item.id == shareId).firstOrNull;
      if (share == null || share.status != 'PENDING') return;
      await Future<void>.delayed(const Duration(milliseconds: 700));
    }
  }

  Future<bool?> _askMockOutcome(PaymentStart payment) => showModalBottomSheet<bool>(
        context: context,
        builder: (context) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Test payment', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                Text('${formatMoney(payment.amountMinor, payment.currency)}\n\n'
                    'The backend is using mock payments, so no real money moves. Choose what the payment provider should answer.'),
                const SizedBox(height: 20),
                FilledButton.icon(
                  onPressed: () => Navigator.pop(context, true),
                  icon: const Icon(Icons.check),
                  label: const Text('Payment succeeds'),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: () => Navigator.pop(context, false),
                  icon: const Icon(Icons.close),
                  label: const Text('Payment fails'),
                ),
              ],
            ),
          ),
        ),
      );

  Future<void> _cancel() async {
    final booking = _booking!;
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel this booking?'),
        content: Text(booking.isConfirmed
            ? 'Everyone who paid gets their money back. Free cancellation ends ${booking.freeCancellationHours} hours before the start.'
            : 'The slot is released and nobody is charged.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep it')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Cancel booking')),
        ],
      ),
    );
    if (yes != true) return;
    await _run(() async {
      await widget.api.cancelBooking(widget.bookingId);
      await _reload();
      widget.onBookingsChanged();
      if (mounted) showMessage(context, 'Booking cancelled.');
    });
  }

  Future<void> _askForPlayers() async {
    var count = 1;
    final chosen = await showDialog<int>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Players short?'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('We will invite nearby players with a good reliability score, closest first.'),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton(onPressed: count > 1 ? () => setDialogState(() => count--) : null, icon: const Icon(Icons.remove)),
                  Text('$count', style: Theme.of(context).textTheme.headlineSmall),
                  IconButton(onPressed: count < 10 ? () => setDialogState(() => count++) : null, icon: const Icon(Icons.add)),
                ],
              ),
              Text(count == 1 ? 'player needed' : 'players needed'),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, count), child: const Text('Find players')),
          ],
        ),
      ),
    );
    if (chosen == null) return;
    await _run(() async {
      await widget.api.requestRingers(widget.bookingId, chosen);
      if (mounted) showMessage(context, 'Looking for $chosen ${chosen == 1 ? 'player' : 'players'}. Invitations go out in waves.');
    });
  }

  @override
  Widget build(BuildContext context) {
    final booking = _booking;
    return Scaffold(
      appBar: AppBar(title: const Text('Booking')),
      body: booking == null
          ? (_error == null
              ? const Center(child: CircularProgressIndicator())
              : ErrorRetry(message: _error!, onRetry: _reload))
          : RefreshIndicator(onRefresh: _reload, child: _body(context, booking)),
      bottomNavigationBar: _busy ? const LinearProgressIndicator() : null,
    );
  }

  Widget _body(BuildContext context, Booking booking) {
    final theme = Theme.of(context);
    final holdLeft = booking.holdExpiresAt?.difference(DateTime.now().toUtc());
    final pending = booking.shares.where((share) => share.status == 'PENDING').toList();
    final upcoming = booking.startsAt.isAfter(DateTime.now().toUtc());
    final canAct = !_busy;
    final me = widget.api.userId;
    final isOrganizer = booking.organizerUserId == me;

    return ListView(
      padding: const EdgeInsets.all(16),
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        Row(
          children: [
            Expanded(child: Text(booking.venueName, style: theme.textTheme.titleLarge)),
            StatusChip(booking.status),
          ],
        ),
        const SizedBox(height: 4),
        Text('${booking.courtName} · ${titleCase(booking.sport)}'),
        const SizedBox(height: 4),
        Text(formatSlot(booking.startsAt, booking.endsAt, booking.timezone), style: theme.textTheme.titleMedium),
        const SizedBox(height: 16),

        if (booking.isHold && holdLeft != null)
          Card(
            color: holdLeft.isNegative ? theme.colorScheme.errorContainer : theme.colorScheme.tertiaryContainer,
            child: ListTile(
              leading: const Icon(Icons.timer_outlined),
              title: Text(holdLeft.isNegative ? 'The hold has run out' : 'Held for ${formatCountdown(holdLeft)}'),
              subtitle: Text(holdLeft.isNegative
                  ? 'The slot is being released. Pull down to refresh.'
                  : 'Pay before the timer ends or the slot is released.'),
            ),
          ),
        if (booking.isConfirmed)
          Card(
            color: theme.colorScheme.primaryContainer,
            child: const ListTile(
              leading: Icon(Icons.check_circle_outline),
              title: Text('Confirmed'),
              subtitle: Text('Everyone has paid. See you on the pitch.'),
            ),
          ),
        if (booking.requiresTurfFootwear)
          const Card(
            child: ListTile(
              leading: Icon(Icons.warning_amber_rounded),
              title: Text('Turf shoes only'),
              subtitle: Text('TF turf shoes — no metal or FG studs.'),
            ),
          ),

        const SizedBox(height: 12),
        Text('Payment', style: theme.textTheme.titleMedium),
        const SizedBox(height: 4),
        for (final share in booking.shares)
          Card(
            child: ListTile(
              title: Text(share.fullName),
              subtitle: Text(formatMoney(share.amountMinor, share.currency)),
              trailing: booking.isHold && share.status == 'PENDING' && share.userId == me
                  ? FilledButton(onPressed: canAct ? () => _pay(share) : null, child: const Text('Pay'))
                  : StatusChip(share.status),
            ),
          ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
          child: Row(
            children: [
              const Expanded(child: Text('Total')),
              Text(formatMoney(booking.totalMinor, booking.currency), style: const TextStyle(fontWeight: FontWeight.w600)),
            ],
          ),
        ),
        if (booking.isHold && pending.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text('All shares are paid. Confirming the booking…'),
          ),

        const SizedBox(height: 16),
        if (isOrganizer && upcoming && (booking.isHold || booking.isConfirmed)) ...[
          OutlinedButton.icon(
            onPressed: canAct ? _askForPlayers : null,
            icon: const Icon(Icons.group_add_outlined),
            label: const Text('We are players short'),
          ),
          const SizedBox(height: 8),
          TextButton.icon(
            onPressed: canAct ? _cancel : null,
            icon: const Icon(Icons.cancel_outlined),
            label: const Text('Cancel booking'),
            style: TextButton.styleFrom(foregroundColor: theme.colorScheme.error),
          ),
        ],
      ],
    );
  }
}
