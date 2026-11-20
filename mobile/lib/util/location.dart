import 'package:geolocator/geolocator.dart';

/// Where the phone is, or why we could not find out.
sealed class LocationResult {
  const LocationResult();
}

class LocationFound extends LocationResult {
  const LocationFound(this.lat, this.lng);

  final double lat;
  final double lng;
}

/// The person said no (or "never ask again"). Only the device settings can change that.
class LocationDenied extends LocationResult {
  const LocationDenied();
}

/// The device's location service is switched off.
class LocationOff extends LocationResult {
  const LocationOff();
}

/// Permission was fine but no position arrived (no signal, timeout).
class LocationFailed extends LocationResult {
  const LocationFailed();
}

/// Asks the device where it is. Replaceable in tests.
abstract class LocationProvider {
  Future<LocationResult> current();
}

class DeviceLocationProvider implements LocationProvider {
  const DeviceLocationProvider();

  @override
  Future<LocationResult> current() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return const LocationOff();

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        return const LocationDenied();
      }

      // Courts are minutes apart by car, so a coarse fix is plenty and arrives faster.
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.low, timeLimit: Duration(seconds: 15)),
      );
      return LocationFound(position.latitude, position.longitude);
    } on Exception {
      return const LocationFailed();
    }
  }
}
