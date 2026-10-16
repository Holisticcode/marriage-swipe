import 'package:flutter/material.dart';
import '../theme.dart';

class Avatar extends StatelessWidget {
  final String? url;
  final int hue;
  final double size;
  const Avatar({super.key, this.url, this.hue = 280, this.size = 56});
  @override
  Widget build(BuildContext context) {
    return ClipOval(child: SizedBox(width: size, height: size, child: PhotoFill(url: url, hue: hue)));
  }
}

class PhotoFill extends StatelessWidget {
  final String? url;
  final int hue;
  const PhotoFill({super.key, this.url, this.hue = 280});
  @override
  Widget build(BuildContext context) {
    final color = HSLColor.fromAHSL(1, hue.toDouble() % 360, .4, .55).toColor();
    final fallback = Container(color: color, child: const Center(child: Icon(Icons.person, size: 72, color: Colors.white70)));
    if (url == null) return fallback;
    return Image.network(url!, fit: BoxFit.cover, errorBuilder: (_, __, ___) => fallback, loadingBuilder: (c, w, p) => p == null ? w : fallback);
  }
}

class ErrorText extends StatelessWidget {
  final String? text;
  const ErrorText(this.text, {super.key});
  @override
  Widget build(BuildContext context) => (text == null || text!.isEmpty)
      ? const SizedBox(height: 8)
      : Padding(padding: const EdgeInsets.only(bottom: 10), child: Text(text!, style: const TextStyle(color: Color(0xFFC0263F)), semanticsLabel: 'Error: $text'));
}

class PasswordField extends StatefulWidget {
  final TextEditingController controller;
  final String label;
  final bool newPassword;
  const PasswordField({super.key, required this.controller, this.label = 'Password', this.newPassword = false});
  @override
  State<PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<PasswordField> {
  bool show = false;
  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: widget.controller,
      obscureText: !show,
      autofillHints: [widget.newPassword ? AutofillHints.newPassword : AutofillHints.password],
      decoration: InputDecoration(labelText: widget.label, suffixIcon: TextButton(onPressed: () => setState(() => show = !show), child: Text(show ? 'Hide' : 'Show'))),
    );
  }
}

class Choice extends StatelessWidget {
  final String label;
  final List<String> options;
  final String value;
  final ValueChanged<String> onChanged;
  const Choice({super.key, required this.label, required this.options, required this.value, required this.onChanged});
  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700, color: muted, fontSize: 13))),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final o in options)
          ChoiceChip(label: Text(o), selected: value == o, onSelected: (_) => onChanged(o), selectedColor: ink, labelStyle: TextStyle(color: value == o ? Colors.white : ink, fontWeight: FontWeight.w600), showCheckmark: false, backgroundColor: Colors.white),
      ]),
      const SizedBox(height: 16),
    ]);
  }
}

void snack(BuildContext c, String m) => ScaffoldMessenger.of(c).showSnackBar(SnackBar(content: Text(m), behavior: SnackBarBehavior.floating));

class HeadingEm extends StatelessWidget {
  final String plain, em;
  const HeadingEm(this.plain, this.em, {super.key});
  @override
  Widget build(BuildContext context) => Text.rich(TextSpan(children: [
        TextSpan(text: '$plain '),
        TextSpan(text: em, style: const TextStyle(fontStyle: FontStyle.italic, color: accent, fontWeight: FontWeight.w400, fontFamily: 'serif')),
      ]), style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w800, height: 1.05, letterSpacing: -1, color: ink));
}
