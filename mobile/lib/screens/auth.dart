import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api.dart';
import '../config.dart';
import '../main.dart';
import '../theme.dart';
import '../widgets/common.dart';

class AuthScreen extends StatefulWidget {
  final AppState state;
  final String? notice;
  const AuthScreen({super.key, required this.state, this.notice});
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool signup = false;
  final id = TextEditingController(), email = TextEditingController(), phone = TextEditingController(), pw = TextEditingController();
  bool terms = false, busy = false;
  String? err;

  Future<void> submit() async {
    setState(() { err = null; busy = true; });
    try {
      if (signup) {
        final p = phone.text.replaceAll(RegExp(r'[\s()-]'), '');
        if (!RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(p)) throw ApiException(0, 'PHONE', 'Enter your mobile number with country code, like +61 412 345 678.');
        final d = await Api.instance.authenticate('/auth/signup', {'email': email.text.trim(), 'phone': p, 'password': pw.text, 'acceptTerms': terms});
        await widget.state.signedIn(d);
      } else {
        final d = await Api.instance.authenticate('/auth/login', {'identifier': id.text.trim(), 'password': pw.text});
        await widget.state.signedIn(d);
      }
    } on ApiException catch (e) {
      setState(() => err = e.message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void open(String path) => launchUrl(Uri.parse('$siteUrl$path'), mode: LaunchMode.externalApplication);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(24), children: [
          const SizedBox(height: 12),
          const Text('Marriage Swipe', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 24),
          HeadingEm(signup ? 'Create your' : 'Welcome', signup ? 'account' : 'back'),
          const SizedBox(height: 8),
          Text(signup ? 'Your email and number stay private. Nobody else sees them.' : 'Log in with your email or mobile number.', style: const TextStyle(color: muted, fontSize: 16)),
          const SizedBox(height: 22),
          if (widget.notice != null) ErrorText(widget.notice),
          if (signup) ...[
            TextField(controller: email, keyboardType: TextInputType.emailAddress, autofillHints: const [AutofillHints.email], decoration: const InputDecoration(labelText: 'Email')),
            const SizedBox(height: 14),
            TextField(controller: phone, keyboardType: TextInputType.phone, autofillHints: const [AutofillHints.telephoneNumber], decoration: const InputDecoration(labelText: 'Mobile number', hintText: '+61 412 345 678', helperText: 'Include your country code')),
          ] else
            TextField(controller: id, keyboardType: TextInputType.emailAddress, autofillHints: const [AutofillHints.username], decoration: const InputDecoration(labelText: 'Email or mobile number')),
          const SizedBox(height: 14),
          PasswordField(controller: pw, label: signup ? 'Create a password' : 'Password', newPassword: signup),
          if (signup) ...[
            const Padding(padding: EdgeInsets.only(top: 6, left: 4), child: Text('8 or more characters with letters and numbers.', style: TextStyle(fontSize: 12, color: muted))),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              value: terms,
              onChanged: (v) => setState(() => terms = v ?? false),
              title: Text.rich(TextSpan(style: const TextStyle(fontSize: 13, color: muted), children: [
                const TextSpan(text: 'I am 18 or older and agree to the '),
                TextSpan(text: 'community rules', style: const TextStyle(decoration: TextDecoration.underline), recognizer: null),
                const TextSpan(text: ' and privacy policy.'),
              ])),
            ),
            Row(children: [TextButton(onPressed: () => open('/terms'), child: const Text('Read rules')), TextButton(onPressed: () => open('/privacy'), child: const Text('Read privacy policy'))]),
          ],
          const SizedBox(height: 8),
          ErrorText(err),
          FilledButton(onPressed: busy ? null : submit, child: Text(busy ? 'Please wait…' : signup ? 'Create account' : 'Log in')),
          const SizedBox(height: 12),
          if (!signup) TextButton(onPressed: () => open('/forgot'), child: const Text('Forgot password?')),
          TextButton(onPressed: () => setState(() { signup = !signup; err = null; }), child: Text(signup ? 'Already a member? Log in' : 'New here? Create an account')),
        ]),
      ),
    );
  }
}
