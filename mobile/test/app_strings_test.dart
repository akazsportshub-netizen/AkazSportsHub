// The Arabic table must stay in step with the English one.
import 'package:akaz_sports_hub/l10n/app_strings.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

Set<String> _placeholders(String text) => RegExp(r'\{(\w+)\}').allMatches(text).map((m) => m.group(1)!).toSet();

void main() {
  final en = AppStrings.english;
  final ar = AppStrings.arabic;

  test('every English text has an Arabic one, and no Arabic text is orphaned', () {
    expect(en.keys.toSet().difference(ar.keys.toSet()), isEmpty, reason: 'missing in Arabic');
    expect(ar.keys.toSet().difference(en.keys.toSet()), isEmpty, reason: 'missing in English');
  });

  test('Arabic keeps the same placeholders as English', () {
    for (final key in en.keys) {
      expect(_placeholders(ar[key]!), _placeholders(en[key]!), reason: key);
    }
  });

  test('Arabic texts are really Arabic (apart from brand names)', () {
    for (final key in ar.keys) {
      if (key == 'switch_language') continue; // the button names the OTHER language
      expect(RegExp(r'[؀-ۿ]').hasMatch(ar[key]!), isTrue, reason: key);
    }
  });

  test('t() fills placeholders and falls back to English, then to the key', () {
    final english = AppStrings(const Locale('en'));
    final arabic = AppStrings(const Locale('ar'));
    expect(english.t('signed_in_as', {'name': 'Omar'}), 'Signed in as Omar');
    expect(arabic.t('signed_in_as', {'name': 'Omar'}), 'مسجّل الدخول باسم Omar');
    expect(english.t('no_such_key'), 'no_such_key');
  });
}
