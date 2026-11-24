import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/rating_models.dart';
import '../l10n/app_strings.dart';
import '../util/format.dart';
import '../widgets.dart';

/// A player's skill rating and how their last matches moved it.
class RatingScreen extends StatefulWidget {
  const RatingScreen({super.key, required this.api});

  final ApiClient api;

  @override
  State<RatingScreen> createState() => _RatingScreenState();
}

class _RatingScreenState extends State<RatingScreen> {
  late Future<MyRating> _future = widget.api.myRating();

  void _reload() => setState(() { _future = widget.api.myRating(); });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(context.t('rating_title'))),
      body: FutureBuilder<MyRating>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snapshot.hasError) return ErrorRetry(message: '${snapshot.error}', onRetry: _reload);
          final rating = snapshot.data!;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Center(child: Text('${rating.rating}', style: theme.textTheme.displayLarge?.copyWith(fontWeight: FontWeight.bold))),
              Center(child: Text(context.t('rating_matches', {'n': rating.ratedMatches}))),
              const SizedBox(height: 8),
              Text(context.t('rating_note'), style: theme.textTheme.bodySmall, textAlign: TextAlign.center),
              const SizedBox(height: 24),
              Text(context.t('rating_history'), style: theme.textTheme.titleMedium),
              const SizedBox(height: 8),
              if (rating.history.isEmpty)
                Padding(padding: const EdgeInsets.all(16), child: Text(context.t('rating_empty'), textAlign: TextAlign.center))
              else
                for (final change in rating.history)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text('${change.homeName} ${change.homeScore}–${change.awayScore} ${change.awayName}'),
                    subtitle: change.endedAt == null ? null : Text(formatDay(change.endedAt!, 'Asia/Qatar')),
                    trailing: Text(
                      '${change.delta > 0 ? '+' : ''}${change.delta}',
                      style: theme.textTheme.titleMedium?.copyWith(
                        color: change.delta > 0 ? Colors.green.shade700 : (change.delta < 0 ? theme.colorScheme.error : null),
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
            ],
          );
        },
      ),
    );
  }
}
