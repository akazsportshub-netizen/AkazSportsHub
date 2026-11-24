import 'package:shared_preferences/shared_preferences.dart';

/// Where sign-in tokens are kept between app launches.
abstract class TokenStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

/// Ordinary app storage. This is the stand-in used while the system's protected storage
/// (Keychain, Keystore, Credential Manager) is not part of the app. It is fine for development;
/// before release on phones, a protected [TokenStore] should take its place (only this file and
/// the default in `Session` change).
class PrefsTokenStore implements TokenStore {
  const PrefsTokenStore();

  // A different name from the one earlier versions used, so moving old tokens over cannot delete them.
  static String _name(String key) => 'tokens.$key';

  @override
  Future<String?> read(String key) async => (await SharedPreferences.getInstance()).getString(_name(key));

  @override
  Future<void> write(String key, String value) async => (await SharedPreferences.getInstance()).setString(_name(key), value);

  @override
  Future<void> delete(String key) async => (await SharedPreferences.getInstance()).remove(_name(key));
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
