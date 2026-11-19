import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../util/format.dart';
import '../widgets.dart';
import 'court_slots_screen.dart';

class VenueScreen extends StatefulWidget {
  const VenueScreen({super.key, required this.api, required this.venueId, required this.title, required this.onBookingsChanged});

  final ApiClient api;
  final String venueId;
  final String title;
  final VoidCallback onBookingsChanged;

  @override
  State<VenueScreen> createState() => _VenueScreenState();
}

class _VenueScreenState extends State<VenueScreen> {
  late Future<Venue> _venue;

  @override
  void initState() {
    super.initState();
    _venue = widget.api.venue(widget.venueId);
  }

  void _reload() => setState(() => _venue = widget.api.venue(widget.venueId));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: FutureBuilder<Venue>(
        future: _venue,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) return ErrorRetry(message: snapshot.error.toString(), onRetry: _reload);
          return _VenueBody(venue: snapshot.data!, api: widget.api, onBookingsChanged: widget.onBookingsChanged);
        },
      ),
    );
  }
}

class _VenueBody extends StatelessWidget {
  const _VenueBody({required this.venue, required this.api, required this.onBookingsChanged});

  final Venue venue;
  final ApiClient api;
  final VoidCallback onBookingsChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final rules = venue.rules.entries.where((entry) => entry.value != null).toList();
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(venue.name, style: theme.textTheme.headlineSmall),
        const SizedBox(height: 4),
        Text(venue.address ?? venue.city, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        if (venue.description != null) ...[
          const SizedBox(height: 12),
          Text(venue.description!),
        ],
        if (venue.requiresTurfFootwear) ...[
          const SizedBox(height: 12),
          Card(
            color: theme.colorScheme.tertiaryContainer,
            child: ListTile(
              leading: const Icon(Icons.warning_amber_rounded),
              title: const Text('Turf shoes only'),
              subtitle: Text(asString(venue.rules['footwear'], 'TF turf shoes required — no metal or FG studs.')),
            ),
          ),
        ],
        if (rules.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text('Venue rules', style: theme.textTheme.titleMedium),
          const SizedBox(height: 4),
          for (final rule in rules)
            if (rule.key != 'footwear')
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Text('• ${_ruleText(rule.key, rule.value)}'),
              ),
        ],
        const SizedBox(height: 20),
        Text('Courts', style: theme.textTheme.titleMedium),
        const SizedBox(height: 8),
        if (venue.courts.isEmpty) const Text('No courts are open for booking at this venue yet.'),
        for (final court in venue.courts)
          Card(
            child: ListTile(
              title: Text(court.name),
              subtitle: Text([
                titleCase(court.sport),
                if (court.surface != null) court.surface!,
                'up to ${court.capacityPlayers} players',
                '${court.opensAt}–${court.closesAt}',
              ].join(' · ')),
              trailing: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(formatMoney(court.pricePerHourMinor, venue.currency), style: const TextStyle(fontWeight: FontWeight.w600)),
                  const Text('per hour', style: TextStyle(fontSize: 12)),
                ],
              ),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute<void>(
                  builder: (_) => CourtSlotsScreen(api: api, venue: venue, court: court, onBookingsChanged: onBookingsChanged),
                ),
              ),
            ),
          ),
      ],
    );
  }

  static String _ruleText(String key, Object? value) {
    if (key == 'arrive_minutes_early') return 'Arrive $value minutes before your slot';
    final label = key.replaceAll('_', ' ');
    return '${label[0].toUpperCase()}${label.substring(1)}: $value';
  }
}
