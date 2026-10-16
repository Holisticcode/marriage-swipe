import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../api.dart';
import '../main.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/common.dart';

class ProfileSetupScreen extends StatefulWidget {
  final AppState state;
  final Me me;
  final bool editing;
  const ProfileSetupScreen({super.key, required this.state, required this.me, this.editing = false});
  @override
  State<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends State<ProfileSetupScreen> {
  late final name = TextEditingController(text: widget.me.profile?.name);
  late final age = TextEditingController(text: widget.me.profile?.age.toString());
  late final city = TextEditingController(text: widget.me.profile?.city);
  late final bio = TextEditingController(text: widget.me.profile?.bio);
  late String gender = widget.me.profile?.gender ?? '';
  late String lookingFor = widget.me.profile?.lookingFor ?? '';
  late String status = widget.me.profile?.status ?? '';
  late bool adult = widget.me.profile != null;
  bool busy = false;
  String? err;

  Future<void> save() async {
    setState(() { err = null; busy = true; });
    try {
      final d = await Api.instance.put('/me/profile', {
        'name': name.text,
        'age': int.tryParse(age.text) ?? 0,
        'gender': gender,
        'lookingFor': lookingFor,
        'status': status,
        'city': city.text,
        'bio': bio.text,
        'adult': adult,
      });
      widget.state.setMe(Me.fromJson(d['user']));
      if (widget.editing && mounted) Navigator.pop(context);
    } on ApiException catch (e) {
      setState(() => err = e.message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.editing ? 'Edit profile' : 'Step 1 of 2'), actions: [if (!widget.editing) TextButton(onPressed: widget.state.logout, child: const Text('Log out'))]),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.fromLTRB(24, 8, 24, 32), children: [
          HeadingEm(widget.editing ? 'Your' : 'Tell us', widget.editing ? 'details' : 'about you'),
          const SizedBox(height: 22),
          TextField(controller: name, maxLength: 24, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'First name', counterText: '')),
          const SizedBox(height: 14),
          TextField(controller: age, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Age')),
          const SizedBox(height: 18),
          Choice(label: 'I am', options: const ['Man', 'Woman'], value: gender, onChanged: (v) => setState(() => gender = v)),
          Choice(label: 'Looking for', options: const ['Man', 'Woman', 'Everyone'], value: lookingFor, onChanged: (v) => setState(() => lookingFor = v)),
          Choice(label: 'Status', options: const ['Single', 'Divorced', 'Widowed', 'Separated'], value: status, onChanged: (v) => setState(() => status = v)),
          TextField(controller: city, maxLength: 40, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'City', counterText: '')),
          const SizedBox(height: 14),
          TextField(controller: bio, maxLength: 140, maxLines: 3, decoration: const InputDecoration(labelText: 'One line about you', helperText: 'No phone numbers or emails. Those stay private.')),
          CheckboxListTile(contentPadding: EdgeInsets.zero, controlAffinity: ListTileControlAffinity.leading, value: adult, onChanged: (v) => setState(() => adult = v ?? false), title: const Text('I confirm I am 18 or older and looking for marriage.', style: TextStyle(fontSize: 14))),
          ErrorText(err),
          FilledButton(onPressed: busy ? null : save, child: Text(busy ? 'Saving…' : widget.editing ? 'Save' : 'Continue')),
        ]),
      ),
    );
  }
}

class SelfieScreen extends StatefulWidget {
  final AppState state;
  final Me me;
  const SelfieScreen({super.key, required this.state, required this.me});
  @override
  State<SelfieScreen> createState() => _SelfieScreenState();
}

class _SelfieScreenState extends State<SelfieScreen> {
  Uint8List? bytes;
  bool busy = false, retake = false;
  String? err, note;

  Future<void> pick(ImageSource src) async {
    try {
      final f = await ImagePicker().pickImage(source: src, preferredCameraDevice: CameraDevice.front, maxWidth: 1280, imageQuality: 90);
      if (f == null) return;
      final b = await f.readAsBytes();
      setState(() { bytes = b; err = null; });
    } catch (_) {
      setState(() => err = 'We could not open the camera. Allow camera access in Settings, or choose a photo.');
    }
  }

  Future<void> send() async {
    setState(() { busy = true; err = null; });
    try {
      final d = await Api.instance.upload('/me/selfie', bytes!);
      note = d['message'];
      widget.state.setMe(Me.fromJson(d['user']));
    } on ApiException catch (e) {
      setState(() { err = e.message; bytes = null; });
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pending = widget.me.verification == 'pending' && !retake;
    return Scaffold(
      appBar: AppBar(title: Text(pending ? 'Almost there' : 'Step 2 of 2'), actions: [TextButton(onPressed: widget.state.logout, child: const Text('Log out'))]),
      body: SafeArea(
        child: pending
            ? Padding(
                padding: const EdgeInsets.all(24),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const HeadingEm('A person is', 'checking'),
                  const SizedBox(height: 4),
                  const Text('your selfie', style: TextStyle(fontSize: 34, fontWeight: FontWeight.w800, letterSpacing: -1)),
                  const SizedBox(height: 12),
                  Text(note ?? 'The automatic check could not decide, so a moderator will look. You can use the app as soon as it is approved.', style: const TextStyle(color: muted, fontSize: 16)),
                  const Spacer(),
                  FilledButton(onPressed: widget.state.refresh, child: const Text('Check again')),
                  const SizedBox(height: 10),
                  OutlinedButton(onPressed: () => setState(() => retake = true), child: const Text('Take a new selfie')),
                ]),
              )
            : ListView(padding: const EdgeInsets.all(24), children: [
                const HeadingEm('Verify', 'your face'),
                const SizedBox(height: 8),
                const Text('Take a clear selfie in good light. Every photo you add later has to match it. Photos with nudity are never allowed.', style: TextStyle(color: muted, fontSize: 16)),
                const SizedBox(height: 24),
                Center(
                  child: Container(
                    width: 232,
                    height: 296,
                    decoration: BoxDecoration(shape: BoxShape.rectangle, borderRadius: BorderRadius.circular(116), border: Border.all(color: err != null ? const Color(0xFFC0263F) : bytes != null ? good : line, width: 3), color: const Color(0xFFECE8F1)),
                    clipBehavior: Clip.antiAlias,
                    child: bytes != null ? Image.memory(bytes!, fit: BoxFit.cover) : const Padding(padding: EdgeInsets.all(28), child: Center(child: Text('Face the camera, no hat or sunglasses, only you in the frame.', textAlign: TextAlign.center, style: TextStyle(color: muted)))),
                  ),
                ),
                const SizedBox(height: 22),
                ErrorText(err),
                if (bytes == null) ...[
                  FilledButton(onPressed: () => pick(ImageSource.camera), child: const Text('Open camera')),
                  const SizedBox(height: 10),
                  OutlinedButton(onPressed: () => pick(ImageSource.gallery), child: const Text('Choose a photo instead')),
                ] else ...[
                  FilledButton(onPressed: busy ? null : send, child: Text(busy ? 'Checking…' : 'Use this selfie')),
                  const SizedBox(height: 10),
                  OutlinedButton(onPressed: busy ? null : () => setState(() => bytes = null), child: const Text('Retake')),
                ],
                const SizedBox(height: 14),
                const Text('The AI check runs on our own server. Your selfie is not shared with any outside service.', style: TextStyle(fontSize: 12, color: muted)),
              ]),
      ),
    );
  }
}
