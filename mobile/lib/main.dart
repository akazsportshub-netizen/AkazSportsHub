import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'api/api_client.dart';
import 'l10n/app_strings.dart';
import 'screens/home_screen.dart';
import 'screens/sign_in_screen.dart';
import 'session.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final session = Session(ApiClient(baseUrl: defaultApiBaseUrl));
  session.restore();
  runApp(AkazApp(session: session));
}

class AkazApp extends StatelessWidget {
  const AkazApp({super.key, required this.session});

  final Session session;

  @override
  Widget build(BuildContext context) {
    // Rebuilt when the language or the signed-in person changes; Arabic flips the layout right to left.
    return ListenableBuilder(
      listenable: session,
      builder: (context, _) => MaterialApp(
        title: 'AKAZ Sports Hub',
        debugShowCheckedModeBanner: false,
        locale: session.locale,
        supportedLocales: AppStrings.supportedLocales,
        localizationsDelegates: const [
          AppStrings.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0B7A3E)),
          useMaterial3: true,
        ),
        home: !session.isRestored
            ? const Scaffold(body: Center(child: CircularProgressIndicator()))
            : (session.isSignedIn ? HomeScreen(session: session) : SignInScreen(session: session)),
      ),
    );
  }
}
