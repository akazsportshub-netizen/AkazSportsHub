import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../l10n/app_strings.dart';
import '../session.dart';

/// Trimmed and lower-cased, or null when it does not look like an email address.
String? normalizeSignInEmail(String input) {
  final cleaned = input.trim().toLowerCase();
  return cleaned.length <= 254 && RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch(cleaned) ? cleaned : null;
}

const List<String> signInCountries = ['QA', 'SA', 'AE', 'KW', 'BH', 'OM'];

/// Email sign-in: enter the address, then the 6-digit code we email.
/// An address that has never signed in is asked for a name and country to create the account.
class EmailSignInScreen extends StatefulWidget {
  const EmailSignInScreen({super.key, required this.session});

  final Session session;

  @override
  State<EmailSignInScreen> createState() => _EmailSignInScreenState();
}

class _EmailSignInScreenState extends State<EmailSignInScreen> {
  final _email = TextEditingController();
  final _code = TextEditingController();
  final _name = TextEditingController();
  String _country = 'QA';
  String? _sentTo;
  bool _needsDetails = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    final email = normalizeSignInEmail(_email.text);
    if (email == null) {
      setState(() { _error = context.t('err_email'); });
      return;
    }
    setState(() { _busy = true; _error = null; });
    try {
      await widget.session.api.requestEmailCode(email, locale: widget.session.language);
      if (mounted) setState(() { _sentTo = email; _code.clear(); _needsDetails = false; });
    } on ApiException catch (error) {
      if (mounted) setState(() { _error = error.message; });
    } finally {
      if (mounted) setState(() { _busy = false; });
    }
  }

  Future<void> _verify() async {
    final email = _sentTo!;
    if (!RegExp(r'^[0-9]{6}$').hasMatch(_code.text.trim())) {
      setState(() { _error = context.t('err_code'); });
      return;
    }
    setState(() { _busy = true; _error = null; });
    try {
      await widget.session.signInWithEmailCode(email, _code.text.trim(), fullName: _name.text, country: _country);
      // The app swaps to the home screen by itself; close this page so it is not left on top.
      if (mounted) Navigator.of(context).popUntil((route) => route.isFirst);
    } on ApiException catch (error) {
      if (!mounted) return;
      if (error.code == 'NAME_REQUIRED' || error.code == 'COUNTRY_REQUIRED') {
        setState(() { _needsDetails = true; _error = _name.text.trim().isEmpty ? null : error.message; });
      } else {
        setState(() { _error = error.message; });
      }
    } finally {
      if (mounted) setState(() { _busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final codeStep = _sentTo != null;
    return Scaffold(
      appBar: AppBar(title: Text(context.t('sign_in'))),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              codeStep ? context.t('esi_enter_code', {'email': _sentTo!}) : context.t('esi_enter_email'),
              style: theme.textTheme.bodyLarge,
            ),
            const SizedBox(height: 16),
            if (!codeStep)
              TextField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                autofocus: true,
                decoration: InputDecoration(labelText: context.t('email_address'), hintText: 'name@example.com'),
                onSubmitted: (_) => _busy ? null : _sendCode(),
              )
            else ...[
              TextField(
                controller: _code,
                keyboardType: TextInputType.number,
                autofocus: true,
                maxLength: 6,
                decoration: InputDecoration(labelText: context.t('code_label')),
                onSubmitted: (_) => _busy ? null : _verify(),
              ),
              const SizedBox(height: 8),
              // Shown every time so a new address can create its account in one step; ignored for existing accounts.
              Text(context.t(_needsDetails ? 'details_required_hint' : 'details_new_hint')),
              TextField(
                controller: _name,
                decoration: InputDecoration(labelText: context.t('your_name')),
                textCapitalization: TextCapitalization.words,
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                value: _country,
                decoration: InputDecoration(labelText: context.t('your_country')),
                items: [for (final code in signInCountries) DropdownMenuItem(value: code, child: Text(context.t('country_${code.toLowerCase()}')))],
                onChanged: (value) => setState(() { _country = value ?? _country; }),
              ),
            ],
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
              ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : (codeStep ? _verify : _sendCode),
              child: _busy
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(codeStep ? context.t('sign_in') : context.t('send_code')),
            ),
            if (codeStep)
              TextButton(
                onPressed: _busy ? null : () => setState(() { _sentTo = null; _error = null; _needsDetails = false; }),
                child: Text(context.t('use_other_email')),
              ),
          ],
        ),
      ),
    );
  }
}
