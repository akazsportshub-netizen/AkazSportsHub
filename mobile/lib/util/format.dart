/// Money and time formatting.
///
/// The API sends money as whole minor units (QAR 250.00 = 25000) and times as UTC.
/// Times are shown in the venue's own zone. Every GCC zone has a fixed offset with no
/// daylight saving, so a small table is exact and avoids a time-zone database.
library;

const Map<String, int> _currencyDecimals = {
  'QAR': 2,
  'SAR': 2,
  'AED': 2,
  'BHD': 3,
  'OMR': 3,
  'KWD': 3,
};

const Map<String, int> _zoneOffsetMinutes = {
  'Asia/Qatar': 180,
  'Asia/Riyadh': 180,
  'Asia/Bahrain': 180,
  'Asia/Kuwait': 180,
  'Asia/Dubai': 240,
  'Asia/Muscat': 240,
};

/// 25000, 'QAR' → "QAR 250.00"; 30000, 'BHD' → "BHD 30.000".
String formatMoney(int amountMinor, String currency) {
  final decimals = _currencyDecimals[currency] ?? 2;
  final negative = amountMinor < 0;
  final digits = amountMinor.abs().toString().padLeft(decimals + 1, '0');
  final whole = digits.substring(0, digits.length - decimals);
  final fraction = digits.substring(digits.length - decimals);
  return '${negative ? '-' : ''}$currency $whole.$fraction';
}

/// The venue's offset from UTC. Unknown zones fall back to +03:00, the most common in the GCC.
Duration zoneOffset(String timezone) => Duration(minutes: _zoneOffsetMinutes[timezone] ?? 180);

/// A UTC instant as wall-clock time in the venue's zone. The result is a UTC DateTime
/// whose fields read as local time; use it only for display.
DateTime toVenueTime(DateTime instant, String timezone) => instant.toUtc().add(zoneOffset(timezone));

/// 'en' or 'ar'. Set by the app whenever the language changes, so dates and distances read in it.
String formatLanguageCode = 'en';

bool get _arabic => formatLanguageCode == 'ar';

String _two(int value) => value.toString().padLeft(2, '0');

const List<String> _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const List<String> _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const List<String> _weekdaysAr = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
const List<String> _monthsAr = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر', //
];

String _weekdayName(int weekday) => (_arabic ? _weekdaysAr : _weekdays)[weekday - 1];
String _monthName(int month) => (_arabic ? _monthsAr : _months)[month - 1];

/// "18:00"
String formatClock(DateTime instant, String timezone) {
  final local = toVenueTime(instant, timezone);
  return '${_two(local.hour)}:${_two(local.minute)}';
}

/// "Fri 20 Nov"
String formatDay(DateTime instant, String timezone) {
  final local = toVenueTime(instant, timezone);
  return '${_weekdayName(local.weekday)} ${local.day} ${_monthName(local.month)}';
}

/// A calendar date (year, month and day only) as "Fri 20 Nov".
String formatCalendarDay(DateTime day) {
  final date = DateTime.utc(day.year, day.month, day.day);
  return '${_weekdayName(date.weekday)} ${date.day} ${_monthName(date.month)}';
}

/// "Fri 20 Nov, 18:00–19:00"
String formatSlot(DateTime startsAt, DateTime endsAt, String timezone) =>
    '${formatDay(startsAt, timezone)}, ${formatClock(startsAt, timezone)}–${formatClock(endsAt, timezone)}';

/// The calendar day the API expects for availability: "2026-11-20".
String isoDate(DateTime day) => '${day.year}-${_two(day.month)}-${_two(day.day)}';

/// Today's date in the venue's zone, as a date-only value.
DateTime venueToday(String timezone, {DateTime? now}) {
  final local = toVenueTime(now ?? DateTime.now(), timezone);
  return DateTime(local.year, local.month, local.day);
}

/// "1.2 km" / "800 m"
String formatDistance(int metres) {
  if (metres < 1000) return _arabic ? '$metres م' : '$metres m';
  return _arabic ? '${(metres / 1000).toStringAsFixed(1)} كم' : '${(metres / 1000).toStringAsFixed(1)} km';
}

/// "FOOTBALL" → "Football"
String titleCase(String value) {
  if (value.isEmpty) return value;
  return value[0].toUpperCase() + value.substring(1).toLowerCase();
}

/// "4:05" left on a countdown; "0:00" once it has passed.
String formatCountdown(Duration remaining) {
  if (remaining.isNegative) return '0:00';
  final minutes = remaining.inMinutes;
  final seconds = remaining.inSeconds % 60;
  return '$minutes:${_two(seconds)}';
}

/// 25000, 'QAR' → "250.00": an amount as typed into a price field (no currency name).
String minorToPlain(int amountMinor, String currency) {
  final decimals = _currencyDecimals[currency] ?? 2;
  final digits = amountMinor.abs().toString().padLeft(decimals + 1, '0');
  return '${digits.substring(0, digits.length - decimals)}.${digits.substring(digits.length - decimals)}';
}

/// "250" or "250.5" or "250.50" → 25000, 'QAR'. Null when it is not a positive amount the currency can hold.
int? parseMinor(String text, String currency) {
  final decimals = _currencyDecimals[currency] ?? 2;
  final cleaned = text.trim().replaceAll(',', '.');
  final match = RegExp(r'^(\d{1,9})(?:\.(\d+))?$').firstMatch(cleaned);
  if (match == null) return null;
  final fraction = match.group(2) ?? '';
  if (fraction.length > decimals) return null;
  final minor = int.parse(match.group(1)!) * _pow10(decimals) + (fraction.isEmpty ? 0 : int.parse(fraction.padRight(decimals, '0')));
  return minor > 0 ? minor : null;
}

int _pow10(int exponent) {
  var result = 1;
  for (var i = 0; i < exponent; i++) {
    result *= 10;
  }
  return result;
}

/// The reverse of [toVenueTime]: wall-clock time at the venue → the UTC instant.
DateTime fromVenueTime(DateTime wallClock, String timezone) =>
    DateTime.utc(wallClock.year, wallClock.month, wallClock.day, wallClock.hour, wallClock.minute).subtract(zoneOffset(timezone));
