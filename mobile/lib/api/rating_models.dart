/// Data for skill ratings and team balancing (`/v1/ratings`, `/v1/matches/:id/teams`).
library;

import 'models.dart';

class TeamPlayer {
  TeamPlayer({required this.userId, required this.fullName, required this.side, required this.rating});

  factory TeamPlayer.fromJson(Map<String, dynamic> json) => TeamPlayer(
        userId: asString(json['user_id']),
        fullName: asString(json['full_name']),
        side: asString(json['side']),
        rating: asInt(json['rating'], 1200),
      );

  final String userId;
  final String fullName;
  final String side; // HOME or AWAY
  final int rating;
}

class MatchTeams {
  MatchTeams({required this.players, this.homeAvg, this.awayAvg, this.homeWinProbability});

  factory MatchTeams.fromJson(Map<String, dynamic> json) => MatchTeams(
        players: asMapList(json['players']).map(TeamPlayer.fromJson).toList(),
        homeAvg: asIntOrNull(json['home_avg']),
        awayAvg: asIntOrNull(json['away_avg']),
        homeWinProbability: json['home_win_probability'] == null ? null : asDouble(json['home_win_probability']),
      );

  final List<TeamPlayer> players;
  final int? homeAvg;
  final int? awayAvg;
  final double? homeWinProbability;

  List<TeamPlayer> get home => players.where((p) => p.side == 'HOME').toList();
  List<TeamPlayer> get away => players.where((p) => p.side == 'AWAY').toList();
}

class CandidateBooking {
  CandidateBooking({required this.id, required this.startsAt, required this.endsAt, required this.organizerName, required this.paidPlayers});

  factory CandidateBooking.fromJson(Map<String, dynamic> json) => CandidateBooking(
        id: asString(json['id']),
        startsAt: asDate(json['starts_at']),
        endsAt: asDate(json['ends_at']),
        organizerName: asString(json['organizer_name']),
        paidPlayers: asInt(json['paid_players']),
      );

  final String id;
  final DateTime startsAt;
  final DateTime endsAt;
  final String organizerName;
  final int paidPlayers;
}

class RatingChange {
  RatingChange({required this.endedAt, required this.homeName, required this.awayName, required this.homeScore, required this.awayScore, required this.delta, required this.after});

  factory RatingChange.fromJson(Map<String, dynamic> json) => RatingChange(
        endedAt: asDateOrNull(json['ended_at']),
        homeName: asString(json['home_team_name']),
        awayName: asString(json['away_team_name']),
        homeScore: asInt(json['home_score']),
        awayScore: asInt(json['away_score']),
        delta: asInt(json['delta']),
        after: asInt(json['rating_after']),
      );

  final DateTime? endedAt;
  final String homeName;
  final String awayName;
  final int homeScore;
  final int awayScore;
  final int delta;
  final int after;
}

class MyRating {
  MyRating({required this.rating, required this.ratedMatches, required this.history});

  factory MyRating.fromJson(Map<String, dynamic> json) => MyRating(
        rating: asInt(json['elo_rating'], 1200),
        ratedMatches: asInt(json['rated_matches']),
        history: asMapList(json['history']).map(RatingChange.fromJson).toList(),
      );

  final int rating;
  final int ratedMatches;
  final List<RatingChange> history;
}
