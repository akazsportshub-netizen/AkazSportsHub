import 'package:flutter/material.dart';

import 'api/api_client.dart';
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
    return MaterialApp(
      title: 'AKAZ Sports Hub',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0B7A3E)),
        useMaterial3: true,
      ),
      home: ListenableBuilder(
        listenable: session,
        builder: (context, _) {
          if (!session.isRestored) {
            return const Scaffold(body: Center(child: CircularProgressIndicator()));
          }
          return session.isSignedIn ? HomeScreen(session: session) : SignInScreen(session: session);
        },
      ),
    );
  }
}
