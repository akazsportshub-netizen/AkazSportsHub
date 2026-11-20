import 'package:flutter/material.dart';

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
        title: const Text('Sign out?'),
        content: Text('You are signed in as ${widget.session.user?.fullName ?? 'a demo user'}.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Stay')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Sign out')),
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
    final titles = <String>['Find a court', 'My bookings', 'Ringer invites', if (_isReferee) 'Referee console'];

    return Scaffold(
      appBar: AppBar(
        title: Text(titles[_tab]),
        actions: [
          IconButton(
            tooltip: 'Signed in as ${widget.session.user?.fullName ?? ''}',
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
          const NavigationDestination(icon: Icon(Icons.search), label: 'Discover'),
          const NavigationDestination(icon: Icon(Icons.event_note_outlined), selectedIcon: Icon(Icons.event_note), label: 'Bookings'),
          const NavigationDestination(icon: Icon(Icons.group_add_outlined), selectedIcon: Icon(Icons.group_add), label: 'Invites'),
          if (_isReferee)
            const NavigationDestination(icon: Icon(Icons.sports_soccer_outlined), selectedIcon: Icon(Icons.sports_soccer), label: 'Referee'),
        ],
      ),
    );
  }
}
