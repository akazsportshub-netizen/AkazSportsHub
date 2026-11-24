import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where sign-in tokens are kept between app launches.
abstract class TokenStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

/// The system's protected storage: Keychain (iOS), Keystore (Android), Credential Manager (Windows).
/// If the system refuses (for example no keyring on a Linux desktop), it falls back to ordinary
/// app storage rather than stopping the person from signing in.
class SecureTokenStore implements TokenStore {
  const SecureTokenStore();

  static const FlutterSecureStorage _secure = FlutterSecureStorage();

  @override
  Future<String?> read(String key) async {
    try {
      final value = await _secure.read(key: key);
      if (value != null) return value;
    } on Object catch (error) {
      debugPrint('Secure storage unavailable ($error); using app storage.');
    }
    return (await SharedPreferences.getInstance()).getString(_fallbackKey(key));
  }

  @override
  Future<void> write(String key, String value) async {
    try {
      await _secure.write(key: key, value: value);
      // Never leave a copy in the unprotected place.
      await (await SharedPreferences.getInstance()).remove(_fallbackKey(key));
      return;
    } on Object catch (error) {
      debugPrint('Secure storage unavailable ($error); using app storage.');
    }
    await (await SharedPreferences.getInstance()).setString(_fallbackKey(key), value);
  }

  @override
  Future<void> delete(String key) async {
    try {
      await _secure.delete(key: key);
    } on Object catch (error) {
      debugPrint('Secure storage unavailable ($error).');
    }
    await (await SharedPreferences.getInstance()).remove(_fallbackKey(key));
  }

  static String _fallbackKey(String key) => 'fallback.$key';
}

/// Keeps tokens in memory only. For tests.
class MemoryTokenStore implements TokenStore {
  final Map<String, String> values = {};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> delete(String key) async => values.remove(key);
}
