import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api/api_client.dart';
import 'api/models.dart';

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
  }

  final ApiClient api;

  static const _tokenKey = 'akaz.access_token';
  static const _userKey = 'akaz.user';

  DevUser? _user;
  bool _restored = false;

  DevUser? get user => _user;
  bool get isSignedIn => _user != null;
  bool get isRestored => _restored;

  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(_tokenKey);
    final userJson = prefs.getString(_userKey);
    if (token != null && userJson != null) {
      try {
        _user = DevUser.fromJson(asMap(jsonDecode(userJson)));
        api.accessToken = token;
        api.userId = _user!.id;
      } on FormatException {
        await prefs.remove(_tokenKey);
        await prefs.remove(_userKey);
      }
    }
    _restored = true;
    notifyListeners();
  }

  Future<void> signInAs(String userId) async {
    final result = await api.devSignIn(userId);
    api.accessToken = result.token;
    api.userId = result.user.id;
    _user = result.user;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, result.token);
    await prefs.setString(_userKey, jsonEncode(result.user.toJson()));
    notifyListeners();
  }

  Future<void> signOut() async {
    api.accessToken = null;
    api.userId = null;
    _user = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_userKey);
    notifyListeners();
  }
}
