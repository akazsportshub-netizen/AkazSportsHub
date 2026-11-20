import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../l10n/app_strings.dart';
import '../util/format.dart';

/// Turns what the person typed into the international format the server wants, or null.
String? normalizePhone(String input) {
  final cleaned = input.replaceAll(RegExp(r'[\s-]'), '');
  return RegExp(r'^\+[1-9][0-9]{7,14}$').hasMatch(cleaned) ? cleaned : null;
}

/// Each person's equal share of [totalMinor] among [people]; the first people get the odd units.
List<int> equalShares(int totalMinor, int people) {
  final base = totalMinor ~/ people;
  final extra = totalMinor % people;
  return [for (var i = 0; i < people; i++) base + (i < extra ? 1 : 0)];
}

/// Asks to hold a slot, optionally splitting the cost with friends found by phone number.
/// Returns the friends to split with (empty = pay it all), or null if the person cancelled.
Future<List<Friend>?> showHoldDialog(
  BuildContext context, {
  required ApiClient api,
  required String summary,
  required int priceMinor,
  required String currency,
  required int maxPlayers,
}) {
  return showDialog<List<Friend>>(
    context: context,
    builder: (_) => _HoldDialog(api: api, summary: summary, priceMinor: priceMinor, currency: currency, maxPlayers: maxPlayers),
  );
}

class _HoldDialog extends StatefulWidget {
  const _HoldDialog({required this.api, required this.summary, required this.priceMinor, required this.currency, required this.maxPlayers});

  final ApiClient api;
  final String summary;
  final int priceMinor;
  final String currency;
  final int maxPlayers;

  @override
  State<_HoldDialog> createState() => _HoldDialogState();
}

class _HoldDialogState extends State<_HoldDialog> {
  final _phone = TextEditingController();
  final _friends = <Friend>[];
  bool _split = false;
  bool _looking = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<void> _add() async {
    final phone = normalizePhone(_phone.text);
    if (phone == null) {
      setState(() { _error = context.t('hold_err_phone'); });
      return;
    }
    if (_friends.length + 1 >= widget.maxPlayers) {
      setState(() { _error = context.t('court_holds', {'n': widget.maxPlayers}); });
      return;
    }
    setState(() { _looking = true; _error = null; });
    try {
      final friend = await widget.api.lookupUser(phone);
      if (!mounted) return;
      setState(() {
        if (friend.id == widget.api.userId) {
          _error = context.t('own_number');
        } else if (_friends.any((f) => f.id == friend.id)) {
          _error = context.t('already_added', {'name': friend.fullName});
        } else {
          _friends.add(friend);
          _phone.clear();
        }
      });
    } on ApiException catch (error) {
      if (mounted) setState(() { _error = error.code == 'USER_NOT_FOUND' ? context.t('no_player_number') : error.message; });
    } finally {
      if (mounted) setState(() { _looking = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final people = _split ? _friends.length + 1 : 1;
    final share = equalShares(widget.priceMinor, people).first;
    return AlertDialog(
      title: Text(context.t('hold_title')),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${widget.summary}\n\n${formatMoney(widget.priceMinor, widget.currency)}'),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(context.t('split_with_friends')),
              value: _split,
              onChanged: widget.maxPlayers < 2 ? null : (value) => setState(() { _split = value; }),
            ),
            if (_split) ...[
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      decoration: InputDecoration(labelText: context.t('friend_phone'), hintText: '+97455512345'),
                      onSubmitted: (_) => _add(),
                    ),
                  ),
                  IconButton(
                    onPressed: _looking ? null : _add,
                    icon: _looking
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.person_add),
                    tooltip: context.t('add_friend'),
                  ),
                ],
              ),
              if (_error != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                children: [
                  for (final friend in _friends)
                    InputChip(label: Text(friend.fullName), onDeleted: () => setState(() { _friends.remove(friend); })),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                people == 1
                    ? context.t('add_one_friend')
                    : context.t('split_summary', {'people': people, 'share': formatMoney(share, widget.currency)}),
              ),
            ] else
              Text(context.t('hold_alone')),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(context.t('cancel'))),
        FilledButton(
          onPressed: _split && _friends.isEmpty ? null : () => Navigator.pop(context, _split ? List<Friend>.of(_friends) : <Friend>[]),
          child: Text(context.t('hold_slot')),
        ),
      ],
    );
  }
}
