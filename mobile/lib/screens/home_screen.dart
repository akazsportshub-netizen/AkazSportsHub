import 'package:flutter/material.dart';

import '../l10n/app_strings.dart';
import '../session.dart';
import 'discover_screen.dart';
import 'invites_screen.dart';
import 'my_bookings_screen.dart';
import 'referee_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.session});

  final Session session;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;

  // Bumped when a booking changes, so My bookings reloads next time it is shown.
  int _bookingsVersion = 0;

  void _bookingsChanged() => setState(() => _bookingsVersion++);

  /// Referees (and admins) get the match console.
  bool get _isReferee {
    final roles = widget.session.user?.roles ?? const <String>[];
    return roles.contains('REFEREE') || roles.contains('ADMIN');
  }

  Future<void> _confirmSignOut() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.t('signout_title')),
        content: Text(context.t('signout_body', {'name': widget.session.user?.fullName ?? context.t('demo_user')})),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(context.t('stay'))),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(context.t('sign_out'))),
        ],
      ),
    );
    if (yes == true) await widget.session.signOut();
  }

  @override
  Widget build(BuildContext context) {
    final api = widget.session.api;
    final user = widget.session.user;
    final pages = <Widget>[
      DiscoverScreen(api: api, onBookingsChanged: _bookingsChanged),
      MyBookingsScreen(key: ValueKey(_bookingsVersion), api: api, onBookingsChanged: _bookingsChanged),
      InvitesScreen(api: api, onBookingsChanged: _bookingsChanged),
      if (_isReferee && user != null) RefereeScreen(api: api, userId: user.id),
    ];
    final titles = <String>[
      context.t('title_find_court'),
      context.t('title_my_bookings'),
      context.t('title_invites'),
      if (_isReferee) context.t('title_referee'),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text(titles[_tab]),
        actions: [
          TextButton(
            onPressed: () => widget.session.setLanguage(widget.session.language == 'ar' ? 'en' : 'ar'),
            child: Text(context.t('switch_language')),
          ),
          IconButton(
            tooltip: context.t('signed_in_as', {'name': widget.session.user?.fullName ?? ''}),
            icon: const Icon(Icons.account_circle_outlined),
            onPressed: _confirmSignOut,
          ),
        ],
      ),
      body: IndexedStack(index: _tab, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (index) => setState(() => _tab = index),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.search), label: context.t('tab_discover')),
          NavigationDestination(
            icon: const Icon(Icons.event_note_outlined),
            selectedIcon: const Icon(Icons.event_note),
            label: context.t('tab_bookings'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.group_add_outlined),
            selectedIcon: const Icon(Icons.group_add),
            label: context.t('tab_invites'),
          ),
          if (_isReferee)
            NavigationDestination(
              icon: const Icon(Icons.sports_soccer_outlined),
              selectedIcon: const Icon(Icons.sports_soccer),
              label: context.t('tab_referee'),
            ),
        ],
      ),
    );
  }
}
