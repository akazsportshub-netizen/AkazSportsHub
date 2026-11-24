import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../l10n/app_strings.dart';
import '../session.dart';
import '../widgets.dart';
import 'email_sign_in_screen.dart';
import 'phone_sign_in_screen.dart';

/// Development sign-in: pick one of the demo users seeded in the database.
/// Replaced by phone-number OTP once the API issues real tokens.
class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key, required this.session});

  final Session session;

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  late Future<List<DevUser>> _users;
  String? _signingInAs;

  @override
  void initState() {
    super.initState();
    _users = widget.session.api.devUsers();
  }

  void _reload() => setState(() { _users = widget.session.api.devUsers(); });

  Future<void> _signIn(DevUser user) async {
    setState(() => _signingInAs = user.id);
    try {
      await widget.session.signInAs(user.id);
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    } finally {
      if (mounted) setState(() => _signingInAs = null);
    }
  }

  String _explain(Object error) {
    if (error is ApiException && error.statusCode == 404) {
      return 'Development sign-in is switched off.\n\nSet DEV_LOGIN=true in the backend .env file, '
          'then restart it with "docker compose up -d".';
    }
    return error.toString();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        actions: [
          TextButton(
            onPressed: () => widget.session.setLanguage(widget.session.language == 'ar' ? 'en' : 'ar'),
            child: Text(context.t('switch_language')),
          ),
        ],
      ),
      body: SafeArea(
        child: FutureBuilder<List<DevUser>>(
          future: _users,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              // The demo list is switched off (production): phone sign-in is the way in.
              if (snapshot.error is ApiException && (snapshot.error as ApiException).statusCode == 404) {
                return _phoneOnly(theme);
              }
              return ErrorRetry(message: _explain(snapshot.error!), onRetry: _reload);
            }
            final users = snapshot.data!;
            final players = users.where((user) => user.roles.contains('PLAYER')).toList();
            final others = users.where((user) => !user.roles.contains('PLAYER')).toList();
            return ListView(
              padding: const EdgeInsets.all(20),
              children: [
                const SizedBox(height: 24),
                Text('AKAZ Sports Hub', style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                FilledButton.icon(
                  onPressed: _openEmailSignIn,
                  icon: const Icon(Icons.email_outlined),
                  label: Text(context.t('sign_in_email_button')),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: _openPhoneSignIn,
                  icon: const Icon(Icons.sms),
                  label: Text(context.t('sign_in_phone_button')),
                ),
                const SizedBox(height: 16),
                Text(context.t('dev_signin_hint'), style: theme.textTheme.bodyLarge),
                const SizedBox(height: 4),
                Text(widget.session.api.baseUrl, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline)),
                const SizedBox(height: 20),
                if (players.isNotEmpty) ...[
                  Text(context.t('players'), style: theme.textTheme.titleMedium),
                  const SizedBox(height: 8),
                  ...players.map(_tile),
                  const SizedBox(height: 20),
                ],
                if (others.isNotEmpty) ...[
                  Text(context.t('other_roles'), style: theme.textTheme.titleMedium),
                  const SizedBox(height: 8),
                  ...others.map(_tile),
                ],
              ],
            );
          },
        ),
      ),
    );
  }

  void _openEmailSignIn() {
    Navigator.push(context, MaterialPageRoute<void>(builder: (_) => EmailSignInScreen(session: widget.session)));
  }

  void _openPhoneSignIn() {
    Navigator.push(context, MaterialPageRoute<void>(builder: (_) => PhoneSignInScreen(session: widget.session)));
  }

  Widget _phoneOnly(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('AKAZ Sports Hub', style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold), textAlign: TextAlign.center),
          const SizedBox(height: 24),
          FilledButton.icon(onPressed: _openEmailSignIn, icon: const Icon(Icons.email_outlined), label: Text(context.t('sign_in_email_button'))),
          const SizedBox(height: 8),
          OutlinedButton.icon(onPressed: _openPhoneSignIn, icon: const Icon(Icons.sms), label: Text(context.t('sign_in_phone_button'))),
        ],
      ),
    );
  }

  Widget _tile(DevUser user) {
    final busy = _signingInAs == user.id;
    return Card(
      child: ListTile(
        leading: CircleAvatar(child: Text(user.fullName.isEmpty ? '?' : user.fullName[0])),
        title: Text(user.fullName),
        subtitle: Text('${user.roles.join(', ')} · ${user.countryCode}${user.phone == null ? '' : ' · ${user.phone}'}'),
        trailing: busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.chevron_right),
        onTap: _signingInAs == null ? () => _signIn(user) : null,
      ),
    );
  }
}
