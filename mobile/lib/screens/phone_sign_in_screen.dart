import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../session.dart';
import '../widgets.dart';

/// Turns what the person typed into the international format the server wants, or null.
String? normalizeSignInPhone(String input) {
  final cleaned = input.replaceAll(RegExp(r'[\s-]'), '');
  return RegExp(r'^\+[1-9][0-9]{7,14}$').hasMatch(cleaned) ? cleaned : null;
}

/// Phone-number sign-in: enter the number, then the 6-digit code from the SMS.
/// A number that has never signed in is asked for a name to create the account.
class PhoneSignInScreen extends StatefulWidget {
  const PhoneSignInScreen({super.key, required this.session});

  final Session session;

  @override
  State<PhoneSignInScreen> createState() => _PhoneSignInScreenState();
}

class _PhoneSignInScreenState extends State<PhoneSignInScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  final _name = TextEditingController();
  String? _sentTo;
  bool _needsName = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    _code.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    final phone = normalizeSignInPhone(_phone.text);
    if (phone == null) {
      setState(() { _error = 'Enter your number with the country code, e.g. +97455500010.'; });
      return;
    }
    setState(() { _busy = true; _error = null; });
    try {
      await widget.session.api.requestSignInCode(phone);
      if (mounted) setState(() { _sentTo = phone; _code.clear(); _needsName = false; });
    } on ApiException catch (error) {
      if (mounted) setState(() { _error = error.message; });
    } finally {
      if (mounted) setState(() { _busy = false; });
    }
  }

  Future<void> _verify() async {
    final phone = _sentTo!;
    if (!RegExp(r'^[0-9]{6}$').hasMatch(_code.text.trim())) {
      setState(() { _error = 'Enter the 6 digits from the message.'; });
      return;
    }
    setState(() { _busy = true; _error = null; });
    try {
      await widget.session.signInWithCode(phone, _code.text.trim(), fullName: _name.text);
      // The app swaps to the home screen by itself; close this page so it is not left on top.
      if (mounted) Navigator.of(context).popUntil((route) => route.isFirst);
    } on ApiException catch (error) {
      if (!mounted) return;
      if (error.code == 'NAME_REQUIRED') {
        setState(() { _needsName = true; _error = _name.text.trim().isEmpty ? null : error.message; });
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
      appBar: AppBar(title: const Text('Sign in')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              codeStep ? 'Enter the code we sent to $_sentTo.' : 'Enter your phone number and we will text you a code.',
              style: theme.textTheme.bodyLarge,
            ),
            const SizedBox(height: 16),
            if (!codeStep)
              TextField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                autofocus: true,
                decoration: const InputDecoration(labelText: 'Phone number', hintText: '+97455500010'),
                onSubmitted: (_) => _busy ? null : _sendCode(),
              )
            else ...[
              TextField(
                controller: _code,
                keyboardType: TextInputType.number,
                autofocus: true,
                maxLength: 6,
                decoration: const InputDecoration(labelText: '6-digit code'),
                onSubmitted: (_) => _busy ? null : _verify(),
              ),
              const SizedBox(height: 8),
              // Shown every time so a new number can create its account in one step; ignored for existing accounts.
              Text(_needsName ? 'This number is new to AKAZ. What should we call you?' : 'New to AKAZ? Add your name to create your account.'),
              TextField(
                controller: _name,
                decoration: const InputDecoration(labelText: 'Your name (new numbers only)'),
                textCapitalization: TextCapitalization.words,
                onSubmitted: (_) => _busy ? null : _verify(),
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
                  : Text(codeStep ? 'Sign in' : 'Send code'),
            ),
            if (codeStep)
              TextButton(
                onPressed: _busy ? null : () => setState(() { _sentTo = null; _error = null; _needsName = false; }),
                child: const Text('Use a different number'),
              ),
          ],
        ),
      ),
    );
  }
}
