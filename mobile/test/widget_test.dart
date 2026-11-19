// Unit tests for money, time and JSON parsing. Run with: flutter test
import 'package:akaz_sports_hub/api/models.dart';
import 'package:akaz_sports_hub/util/format.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('formatMoney', () {
    test('uses two decimals for QAR, SAR and AED', () {
      expect(formatMoney(25000, 'QAR'), 'QAR 250.00');
      expect(formatMoney(5, 'SAR'), 'SAR 0.05');
      expect(formatMoney(0, 'AED'), 'AED 0.00');
    });

    test('uses three decimals for BHD and OMR', () {
      expect(formatMoney(30000, 'BHD'), 'BHD 30.000');
      expect(formatMoney(1250, 'OMR'), 'OMR 1.250');
    });

    test('keeps the sign of a refund', () {
      expect(formatMoney(-8000, 'QAR'), '-QAR 80.00');
    });
  });

  group('venue time', () {
    final sixPmDoha = DateTime.utc(2026, 11, 20, 15); // 18:00 in Doha, 19:00 in Dubai

    test('shows the clock in the venue zone, not the phone zone', () {
      expect(formatClock(sixPmDoha, 'Asia/Qatar'), '18:00');
      expect(formatClock(sixPmDoha, 'Asia/Dubai'), '19:00');
    });

    test('formats a slot with its day', () {
      expect(formatSlot(sixPmDoha, sixPmDoha.add(const Duration(hours: 1)), 'Asia/Qatar'), 'Fri 20 Nov, 18:00–19:00');
    });

    test('moves to the next day after local midnight', () {
      final lateUtc = DateTime.utc(2026, 11, 20, 22); // 01:00 on the 21st in Doha
      expect(formatDay(lateUtc, 'Asia/Qatar'), 'Sat 21 Nov');
      expect(venueToday('Asia/Qatar', now: lateUtc), DateTime(2026, 11, 21));
    });

    test('labels and formats calendar dates', () {
      expect(formatCalendarDay(DateTime(2026, 11, 20)), 'Fri 20 Nov');
      expect(isoDate(DateTime(2026, 1, 5)), '2026-01-05');
    });

    test('counts down a hold', () {
      expect(formatCountdown(const Duration(minutes: 4, seconds: 5)), '4:05');
      expect(formatCountdown(const Duration(seconds: -3)), '0:00');
    });
  });

  group('JSON parsing', () {
    test('reads numbers sent as strings', () {
      expect(asInt('25000'), 25000);
      expect(asInt(12.6), 13);
      expect(asInt(null, 7), 7);
    });

    test('reads a booking with its shares', () {
      final booking = Booking.fromJson({
        'id': 'b1',
        'status': 'HOLD',
        'currency': 'QAR',
        'total_minor': '25000',
        'starts_at': '2026-11-20T15:00:00.000Z',
        'ends_at': '2026-11-20T16:00:00.000Z',
        'hold_expires_at': '2026-11-19T13:15:00.000Z',
        'organizer_user_id': 'u1',
        'court_name': 'Pitch 1 (5-a-side)',
        'sport': 'FOOTBALL',
        'venue_name': 'Akaz Demo Arena — Al Sadd',
        'timezone': 'Asia/Qatar',
        'requires_turf_footwear': true,
        'free_cancellation_hours': 24,
        'shares': [
          {'id': 's1', 'user_id': 'u1', 'full_name': 'Demo Player One', 'amount_minor': 25000, 'currency': 'QAR', 'status': 'PENDING'},
        ],
      });
      expect(booking.isHold, isTrue);
      expect(booking.totalMinor, 25000);
      expect(booking.startsAt, DateTime.utc(2026, 11, 20, 15));
      expect(booking.shares.single.isPaid, isFalse);
    });
  });
}
