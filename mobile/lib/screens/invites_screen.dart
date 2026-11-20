import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../l10n/app_strings.dart';
import '../util/format.dart';
import '../widgets.dart';
import 'booking_screen.dart';

/// Games near you that are a player short. Push notifications come later; for now
/// invitations are fetched when this tab is opened or pulled down.
class InvitesScreen extends StatefulWidget {
  const InvitesScreen({super.key, required this.api, required this.onBookingsChanged});

  final ApiClient api;
  final VoidCallback onBookingsChanged;

  @override
  State<InvitesScreen> createState() => _InvitesScreenState();
}

class _InvitesScreenState extends State<InvitesScreen> {
  late Future<List<RingerInvite>> _invites;
  String? _answering;

  @override
  void initState() {
    super.initState();
    _invites = widget.api.myInvites();
  }

  Future<void> _reload() async {
    final next = widget.api.myInvites();
    setState(() { _invites = next; });
    await next.catchError((Object _) => <RingerInvite>[]);
  }

  Future<void> _respond(RingerInvite invite, bool accept) async {
    setState(() => _answering = invite.id);
    try {
      final answer = await widget.api.respondToInvite(invite.id, accept: accept);
      if (!mounted) return;
      if (answer.accepted && answer.bookingId != null) {
        widget.onBookingsChanged();
        showMessage(
          context,
          context.t('invite_accepted_pay', {'amount': formatMoney(answer.amountMinor ?? 0, answer.currency ?? '')}),
        );
        await Navigator.push(
          context,
          MaterialPageRoute<void>(
            builder: (_) => BookingScreen(api: widget.api, bookingId: answer.bookingId!, onBookingsChanged: widget.onBookingsChanged),
          ),
        );
      } else {
        showMessage(context, context.t(answer.accepted ? 'invite_in' : 'invite_declined'));
      }
    } on ApiException catch (error) {
      if (mounted) {
        showMessage(context, error.code == 'REQUEST_CLOSED' ? context.t('too_late') : error.message);
      }
    } finally {
      if (mounted) {
        setState(() => _answering = null);
        await _reload();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<RingerInvite>>(
      future: _invites,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) return ErrorRetry(message: snapshot.error.toString(), onRetry: _reload);
        final invites = snapshot.data!;
        return RefreshIndicator(
          onRefresh: _reload,
          child: invites.isEmpty
              ? ListView(
                  children: [
                    const SizedBox(height: 120),
                    EmptyState(icon: Icons.group_add_outlined, message: context.t('no_invites')),
                  ],
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: invites.length,
                  itemBuilder: (context, index) => _card(context, invites[index]),
                ),
        );
      },
    );
  }

  Widget _card(BuildContext context, RingerInvite invite) {
    final theme = Theme.of(context);
    final busy = _answering == invite.id;
    final placesLeft = invite.slotsNeeded - invite.slotsFilled;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    context.t('invite_title', {'sport': context.sportName(invite.sport), 'venue': invite.venueName}),
                    style: theme.textTheme.titleMedium,
                  ),
                ),
                StatusChip(invite.status),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              '${invite.courtName} · ${invite.city}'
              '${invite.distanceM == null ? '' : ' · ${context.t('away', {'distance': formatDistance(invite.distanceM!)})}'}',
            ),
            Text(formatSlot(invite.startsAt, invite.endsAt, invite.timezone)),
            const SizedBox(height: 4),
            Text(
              placesLeft > 0 ? context.t('places_left', {'left': placesLeft, 'total': invite.slotsNeeded}) : context.t('all_taken'),
              style: theme.textTheme.bodySmall,
            ),
            if (invite.requiresTurfFootwear) Text(context.t('turf_only'), style: theme.textTheme.bodySmall),
            if (invite.canRespond) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(onPressed: busy ? null : () => _respond(invite, false), child: Text(context.t('decline'))),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      onPressed: busy ? null : () => _respond(invite, true),
                      child: busy
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : Text(context.t('im_in')),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
