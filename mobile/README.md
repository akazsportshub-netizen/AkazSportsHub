# AKAZ Sports Hub — mobile app (Flutter)

First version of the player app, talking to the Platform API in the repository root.

| Screen | What it does | API |
| --- | --- | --- |
| Sign in | Development only: pick a seeded demo user | `GET /v1/dev/auth/users`, `POST /v1/dev/auth/token` |
| Discover | Venues near a chosen GCC city, filtered by sport | `GET /v1/venues/nearby` |
| Venue | Details, footwear rule, courts and prices | `GET /v1/venues/:id` |
| Court | 14-day date strip and free slots; tap to hold for 15 minutes | `GET /v1/courts/:id/availability`, `POST /v1/bookings` |
| Booking | Hold countdown, shares, pay, cancel, "we are players short" | `GET /v1/bookings/:id`, `…/shares/:id/pay`, `…/cancel`, `…/ringer-requests` |
| My bookings | Upcoming and past bookings | `GET /v1/bookings/mine` |
| Invites | Ringer invitations to accept or decline | `GET /v1/ringer-invites/mine`, `…/respond` |

Times are shown in the venue's time zone, and money is formatted from minor units with the right decimals for each currency (BHD and OMR have three).

## Run it on the Android emulator (Windows)

1. Start the backend from the repository root, with development sign-in switched on. In `.env` set `DEV_LOGIN=true`, then:

   ```
   docker compose up -d
   ```

2. Generate the Android and iOS project files once. This keeps the code in `lib/` and the files already here:

   ```
   cd mobile
   flutter create . --project-name akaz_sports_hub --org com.akazsportshub --platforms android,ios
   flutter pub get
   ```

3. Start an emulator from Android Studio (**Device Manager → ▶**), then:

   ```
   flutter run
   ```

The app reaches the backend at `http://10.0.2.2:3000`, which is how the Android emulator addresses the computer it runs on. To use another address:

```
flutter run --dart-define=API_BASE_URL=http://192.168.1.20:3000
```

A physical phone needs the computer's network address, and the API port opened beyond `127.0.0.1` in `docker-compose.yml`.

Plain `http://` works only in debug builds (`android/app/src/debug/AndroidManifest.xml`); release builds will need HTTPS.

## Payments

With `PAYMENT_PROVIDER=mock` the Pay button opens a test sheet: choose **Payment succeeds** or **Payment fails** and the app plays the provider's part through `/v1/dev/payments`. With Tap or Checkout.com it opens the provider's hosted payment page in the browser and refreshes the booking when you come back.

## Checks

```
flutter analyze
flutter test
```

## Not in this version

- **Real sign-in.** Phone-number OTP needs the API to issue tokens first.
- **Split-pay with friends.** The API can split a booking between users, but has no way yet to find a friend's account, so every booking is paid by the person who makes it.
- **Location.** You pick a city instead of using GPS, to keep location permissions out of testing.
- **Push notifications** for ringer invitations, a deep link back from the payment page (`akaz://payment-complete`), Arabic and right-to-left layout, and app-store builds.
