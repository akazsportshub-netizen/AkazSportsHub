import 'dart:convert';

import 'dart:async';
import 'dart:ui' show Locale, PlatformDispatcher;

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api/api_client.dart';
import 'api/models.dart';
import 'util/format.dart';

/// Where the API is. Override at build time:
///   flutter run --dart-define=API_BASE_URL=http://192.168.1.20:3000
/// The default reaches the computer running Docker from the Android emulator.
const String defaultApiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:3000');

/// Who is signed in, kept across app restarts.
class Session extends ChangeNotifier {
  Session(this.api) {
    api.onUnauthenticated = () {
      if (_user != null) signOut();
    };
    api.onTokensRefreshed = (accessToken, refreshToken) async {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_tokenKey, accessToken);
      await prefs.setString(_refreshKey, refreshToken);
    };
  }

  final ApiClient api;

  static const _tokenKey = 'akaz.access_token';
  static const _refreshKey = 'akaz.refresh_token';
  static const _userKey = 'akaz.user';
  static const _languageKey = 'akaz.language';

  String _language = PlatformDispatcher.instance.locale.languageCode == 'ar' ? 'ar' : 'en';

  /// 'en' or 'ar': what the screens and the messages we send are written in.
  String get language => _language;
  Locale get locale => Locale(_language);

  /// Switches the language now, remembers it, and tells the server so our messages follow.
  Future<void> setLanguage(String code) async {
    _language = code == 'ar' ? 'ar' : 'en';
    formatLanguageCode = _language;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_languageKey, _language);
    if (isSignedIn) unawaited(api.setLanguage(_language).catchError((Object _) {}));
  }

  DevUser? _user;
  bool _restored = false;

  DevUser? get user => _user;
  bool get isSignedIn => _user != null;
  bool get isRestored => _restored;

  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    final savedLanguage = prefs.getString(_languageKey);
    if (savedLanguage != null) _language = savedLanguage == 'ar' ? 'ar' : 'en';
    formatLanguageCode = _language;
    final token = prefs.getString(_tokenKey);
    final userJson = prefs.getString(_userKey);
    if (token != null && userJson != null) {
      try {
        _user = DevUser.fromJson(asMap(jsonDecode(userJson)));
        api.accessToken = token;
        api.refreshToken = prefs.getString(_refreshKey);
        api.userId = _user!.id;
      } on FormatException {
        await prefs.remove(_tokenKey);
        await prefs.remove(_refreshKey);
        await prefs.remove(_userKey);
      }
    }
    _restored = true;
    notifyListeners();
  }

  Future<void> signInAs(String userId) async => _start(await api.devSignIn(userId));

  Future<void> signInWithCode(String phone, String code, {String? fullName}) async =>
      _start(await api.verifySignInCode(phone, code, fullName: fullName, locale: _language));

  Future<void> _start(({String token, String? refreshToken, DevUser user}) result) async {
    api.accessToken = result.token;
    api.refreshToken = result.refreshToken;
    api.userId = result.user.id;
    _user = result.user;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, result.token);
    if (result.refreshToken != null) {
      await prefs.setString(_refreshKey, result.refreshToken!);
    } else {
      await prefs.remove(_refreshKey);
    }
    await prefs.setString(_userKey, jsonEncode(result.user.toJson()));
    // The language chosen in the app decides the language of our messages.
    unawaited(api.setLanguage(_language).catchError((Object _) {}));
    notifyListeners();
  }

  Future<void> signOut() async {
    final refreshToken = api.refreshToken;
    api.accessToken = null;
    api.refreshToken = null;
    api.userId = null;
    _user = null;
    // End the session on the server too, so a copied token cannot be used later.
    if (refreshToken != null) unawaited(api.revokeRefreshToken(refreshToken));
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_refreshKey);
    await prefs.remove(_userKey);
    notifyListeners();
  }
}
