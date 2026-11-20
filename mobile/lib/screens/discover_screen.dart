import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../l10n/app_strings.dart';
import '../util/format.dart';
import '../widgets.dart';
import 'venue_screen.dart';

/// A place to search around. Using the phone's GPS comes later; for now the player
/// picks a city, which keeps the app free of location permissions while testing.
class _City {
  const _City(this.key, this.lat, this.lng);

  /// Translation key of the city's name.
  final String key;
  final double lat;
  final double lng;
}

const List<_City> _cities = [
  _City('city_doha', 25.2860, 51.5000),
  _City('city_lusail', 25.4200, 51.4900),
  _City('city_riyadh', 24.6900, 46.6850),
  _City('city_dubai', 25.1400, 55.2300),
  _City('city_manama', 26.2100, 50.6000),
  _City('city_muscat', 23.5950, 58.4300),
];

const List<String> _sports = ['FOOTBALL', 'PADEL', 'BADMINTON', 'BASKETBALL', 'VOLLEYBALL', 'TENNIS', 'CRICKET'];

class DiscoverScreen extends StatefulWidget {
  const DiscoverScreen({super.key, required this.api, required this.onBookingsChanged});

  final ApiClient api;
  final VoidCallback onBookingsChanged;

  @override
  State<DiscoverScreen> createState() => _DiscoverScreenState();
}

class _DiscoverScreenState extends State<DiscoverScreen> {
  _City _city = _cities.first;
  String? _sport;
  late Future<List<Venue>> _venues;

  @override
  void initState() {
    super.initState();
    _venues = _load();
  }

  Future<List<Venue>> _load() => widget.api.nearbyVenues(lat: _city.lat, lng: _city.lng, radiusKm: 30, sport: _sport);

  void _reload() => setState(() { _venues = _load(); });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(
          height: 52,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
            children: [
              for (final city in _cities)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(context.t(city.key)),
                    selected: city == _city,
                    onSelected: (_) {
                      _city = city;
                      _reload();
                    },
                  ),
                ),
            ],
          ),
        ),
        SizedBox(
          height: 48,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
            children: [
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilterChip(
                  label: Text(context.t('all_sports')),
                  selected: _sport == null,
                  onSelected: (_) {
                    _sport = null;
                    _reload();
                  },
                ),
              ),
              for (final sport in _sports)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(context.sportName(sport)),
                    selected: _sport == sport,
                    onSelected: (_) {
                      _sport = _sport == sport ? null : sport;
                      _reload();
                    },
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: FutureBuilder<List<Venue>>(
            future: _venues,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snapshot.hasError) return ErrorRetry(message: snapshot.error.toString(), onRetry: _reload);
              final venues = snapshot.data!;
              if (venues.isEmpty) {
                return EmptyState(
                  icon: Icons.sports_soccer_outlined,
                  message: _sport == null
                      ? context.t('no_venues', {'city': context.t(_city.key)})
                      : context.t('no_venues_sport', {'sport': context.sportName(_sport!), 'city': context.t(_city.key)}),
                );
              }
              return RefreshIndicator(
                onRefresh: () async {
                  _reload();
                  await _venues.catchError((Object _) => <Venue>[]);
                },
                child: ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: venues.length,
                  itemBuilder: (context, index) => _VenueCard(
                    venue: venues[index],
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute<void>(
                        builder: (_) => VenueScreen(
                          api: widget.api,
                          venueId: venues[index].id,
                          title: venues[index].name,
                          onBookingsChanged: widget.onBookingsChanged,
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _VenueCard extends StatelessWidget {
  const _VenueCard({required this.venue, required this.onTap});

  final Venue venue;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final price = venue.fromPricePerHourMinor;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(venue.name, style: theme.textTheme.titleMedium)),
                  if (venue.distanceM != null) Text(formatDistance(venue.distanceM!), style: theme.textTheme.bodySmall),
                ],
              ),
              const SizedBox(height: 4),
              Text(venue.address ?? venue.city, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
              const SizedBox(height: 10),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final sport in venue.sports) Chip(label: Text(context.sportName(sport)), visualDensity: VisualDensity.compact),
                ],
              ),
              if (price != null) ...[
                const SizedBox(height: 8),
                Text(context.t('from_price', {'price': formatMoney(price, venue.currency)}),
                    style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600, color: theme.colorScheme.primary)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
