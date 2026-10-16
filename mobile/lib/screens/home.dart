import 'dart:async';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api.dart';
import '../config.dart';
import '../main.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'chat.dart';
import 'setup.dart';

class HomeScreen extends StatefulWidget {
  final AppState state;
  final Me me;
  const HomeScreen({super.key, required this.state, required this.me});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int tab = 0;
  List<MatchRow>? matches;
  Timer? timer;

  @override
  void initState() {
    super.initState();
    loadMatches();
    timer = Timer.periodic(const Duration(seconds: 15), (_) => loadMatches());
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> loadMatches() async {
    try {
      final d = await Api.instance.get('/matches');
      if (mounted) setState(() => matches = (d['matches'] as List).map((e) => MatchRow.fromJson(e)).toList());
    } catch (_) {}
  }

  Future<void> openChat(MatchRow m) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => ChatScreen(match: m)));
    loadMatches();
  }

  void onMatch(String id, Profile p) {
    loadMatches();
    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        backgroundColor: ink,
        insetPadding: const EdgeInsets.all(20),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [Avatar(url: widget.me.selfie?.url, size: 96), const SizedBox(width: 12), Avatar(url: p.photos.isEmpty ? null : p.photos.first, hue: p.hue, size: 96)]),
            const SizedBox(height: 18),
            const Text("It's a match", style: TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text('You and ${p.name} like each other.', style: const TextStyle(color: Colors.white70)),
            const SizedBox(height: 18),
            FilledButton(onPressed: () { Navigator.pop(ctx); openChat(MatchRow(id, p, null, false, 0)); }, child: const Text('Say hello')),
            const SizedBox(height: 8),
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Keep swiping', style: TextStyle(color: Colors.white))),
          ]),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final unread = (matches ?? []).fold<int>(0, (n, m) => n + m.unread);
    final pages = [
      DiscoverTab(onMatch: onMatch),
      MatchesTab(matches: matches, onOpen: openChat, onRefresh: loadMatches),
      ProfileTab(state: widget.state, me: widget.me),
    ];
    return Scaffold(
      body: SafeArea(child: IndexedStack(index: tab, children: pages)),
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab,
        onDestinationSelected: (i) => setState(() => tab = i),
        backgroundColor: Colors.white,
        indicatorColor: accent.withOpacity(.15),
        destinations: [
          const NavigationDestination(icon: Icon(Icons.favorite_border), selectedIcon: Icon(Icons.favorite, color: accent), label: 'Discover'),
          NavigationDestination(icon: Badge(isLabelVisible: unread > 0, label: Text('$unread'), child: const Icon(Icons.chat_bubble_outline)), selectedIcon: const Icon(Icons.chat_bubble, color: accent), label: 'Matches'),
          const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person, color: accent), label: 'Profile'),
        ],
      ),
    );
  }
}

const reportReasons = ['Fake profile or photos', 'Nudity or sexual content', 'Harassment or abuse', 'Asking for money', 'Looks under 18', 'Something else'];

/// Returns a message to show when the person was reported or blocked, otherwise null.
Future<String?> showReportSheet(BuildContext context, String userId, String name) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => _ReportSheet(userId: userId, name: name),
  );
}

class _ReportSheet extends StatefulWidget {
  final String userId, name;
  const _ReportSheet({required this.userId, required this.name});
  @override
  State<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends State<_ReportSheet> {
  String? reason, err;
  bool busy = false;
  final note = TextEditingController();

  Future<void> run(Future<void> Function() f, String done) async {
    setState(() { busy = true; err = null; });
    try {
      await f();
      if (mounted) Navigator.pop(context, done);
    } on ApiException catch (e) {
      if (mounted) setState(() { err = e.message; busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = widget.name;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Text('Report or block $name', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20)),
          const SizedBox(height: 8),
          for (final r in reportReasons)
            RadioListTile<String>(value: r, groupValue: reason, onChanged: (v) => setState(() => reason = v), title: Text(r), contentPadding: EdgeInsets.zero),
          TextField(controller: note, maxLength: 300, maxLines: 2, decoration: const InputDecoration(labelText: 'Details (optional)')),
          ErrorText(err),
          FilledButton(
            onPressed: busy ? null : () {
              if (reason == null) { setState(() => err = 'Choose a reason.'); return; }
              run(() => Api.instance.post('/reports', {'userId': widget.userId, 'reason': reason, if (note.text.isNotEmpty) 'note': note.text}), 'Thanks. $name is hidden from you and our team will review this profile.');
            },
            child: const Text('Send report'),
          ),
          const SizedBox(height: 8),
          OutlinedButton(onPressed: busy ? null : () => run(() => Api.instance.post('/users/${widget.userId}/block'), '$name is blocked.'), child: const Text('Just block them')),
        ]),
      ),
    );
  }
}

class DiscoverTab extends StatefulWidget {
  final void Function(String matchId, Profile p) onMatch;
  const DiscoverTab({super.key, required this.onMatch});
  @override
  State<DiscoverTab> createState() => _DiscoverTabState();
}

class _DiscoverTabState extends State<DiscoverTab> {
  List<Profile>? deck;
  List<String> cities = [];
  String city = '';
  String? err;
  Offset drag = Offset.zero;
  int photoIdx = 0;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    load();
    Api.instance.get('/discover/cities').then((d) { if (mounted) setState(() => cities = List<String>.from(d['cities'])); }).catchError((_) {});
  }

  Future<void> load() async {
    setState(() { err = null; });
    try {
      final d = await Api.instance.get('/discover?city=${Uri.encodeQueryComponent(city)}');
      setState(() { deck = (d['profiles'] as List).map((e) => Profile.fromJson(e)).toList(); photoIdx = 0; });
    } on ApiException catch (e) {
      setState(() { err = e.message; deck = []; });
    }
  }

  Future<void> swipe(String dir) async {
    if (busy || deck == null || deck!.isEmpty) return;
    busy = true;
    final p = deck!.first;
    setState(() { deck!.removeAt(0); drag = Offset.zero; photoIdx = 0; });
    try {
      final r = await Api.instance.post('/swipes', {'userId': p.id, 'direction': dir});
      if (r['matched'] == true) widget.onMatch(r['match']['id'], p);
    } on ApiException catch (e) {
      if (mounted) snack(context, e.message);
    } finally {
      busy = false;
    }
  }

  Future<void> menu(Profile p) async {
    final msg = await showReportSheet(context, p.id, p.name);
    if (msg != null && mounted) {
      setState(() => deck?.removeWhere((x) => x.id == p.id));
      snack(context, msg);
    }
  }

  @override
  Widget build(BuildContext context) {
    final top = (deck != null && deck!.isNotEmpty) ? deck!.first : null;
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 16, 4),
        child: Row(children: [
          const Text('Discover', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20)),
          const Spacer(),
          DropdownButton<String>(
            value: cities.contains(city) ? city : '',
            underline: const SizedBox(),
            items: [const DropdownMenuItem(value: '', child: Text('Anywhere')), for (final c in cities) DropdownMenuItem(value: c, child: Text(c))],
            onChanged: (v) { city = v ?? ''; load(); },
          ),
        ]),
      ),
      Expanded(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
          child: deck == null
              ? const Center(child: CircularProgressIndicator())
              : top == null
                  ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                      const Text('You are all caught up', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 22)),
                      const SizedBox(height: 8),
                      Text(err ?? 'No new profiles right now. Try another city or check back soon.', textAlign: TextAlign.center, style: const TextStyle(color: muted)),
                      const SizedBox(height: 16),
                      SizedBox(width: 180, child: OutlinedButton(onPressed: load, child: const Text('Refresh'))),
                    ]))
                  : LayoutBuilder(builder: (context, box) {
                      return GestureDetector(
                        onPanUpdate: (d) => setState(() => drag += Offset(d.delta.dx, 0)),
                        onPanEnd: (_) {
                          if (drag.dx > 110) { swipe('yes'); } else if (drag.dx < -110) { swipe('no'); } else { setState(() => drag = Offset.zero); }
                        },
                        onTapUp: (_) { if (top.photos.length > 1) setState(() => photoIdx = (photoIdx + 1) % top.photos.length); },
                        child: Transform.translate(
                          offset: drag,
                          child: Transform.rotate(angle: drag.dx / 1800, child: ProfileCard(p: top, photoIdx: photoIdx, drag: drag.dx, onMenu: () => menu(top))),
                        ),
                      );
                    }),
        ),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          IconButton.filled(onPressed: top == null ? null : () => swipe('no'), style: IconButton.styleFrom(backgroundColor: Colors.white, foregroundColor: ink, minimumSize: const Size(64, 64), elevation: 3), icon: const Icon(Icons.close, size: 28), tooltip: 'Pass'),
          const SizedBox(width: 28),
          IconButton.filled(onPressed: top == null ? null : () => swipe('yes'), style: IconButton.styleFrom(backgroundColor: accent, foregroundColor: Colors.white, minimumSize: const Size(76, 76)), icon: const Icon(Icons.favorite, size: 34), tooltip: 'Like'),
        ]),
      ),
    ]);
  }
}

class ProfileCard extends StatelessWidget {
  final Profile p;
  final int photoIdx;
  final double drag;
  final VoidCallback onMenu;
  const ProfileCard({super.key, required this.p, required this.photoIdx, required this.drag, required this.onMenu});
  @override
  Widget build(BuildContext context) {
    final url = p.photos.isEmpty ? null : p.photos[photoIdx % p.photos.length];
    return ClipRRect(
      borderRadius: BorderRadius.circular(32),
      child: Stack(fit: StackFit.expand, children: [
        PhotoFill(url: url, hue: p.hue),
        if (p.sample) Positioned(top: 14, left: 14, child: _pill('DEMO PROFILE')),
        Positioned(top: 6, right: 6, child: IconButton(onPressed: onMenu, icon: const Icon(Icons.more_horiz, color: Colors.white), tooltip: 'Report or block', style: IconButton.styleFrom(backgroundColor: Colors.black38))),
        Positioned(top: 40, left: 18, child: Opacity(opacity: (drag / 110).clamp(0.0, 1.0), child: _stamp('YES', const Color(0xFF4BE3A8)))),
        Positioned(top: 40, right: 18, child: Opacity(opacity: (-drag / 110).clamp(0.0, 1.0), child: _stamp('NO', const Color(0xFFFF8597)))),
        Positioned(
          left: 10, right: 10, bottom: 10,
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: const Color(0xC717131F), borderRadius: BorderRadius.circular(24)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              Row(children: [
                Flexible(child: Text('${p.name}  ${p.age}', style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800))),
                if (p.verified) const Padding(padding: EdgeInsets.only(left: 8), child: Icon(Icons.verified, color: Color(0xFF2B7FFF), size: 22)),
              ]),
              const SizedBox(height: 8),
              Wrap(spacing: 6, children: [_chip(p.city, false), _chip(p.status, true), if (p.photos.length > 1) _chip('${(photoIdx % p.photos.length) + 1}/${p.photos.length} photos', false)]),
              if (p.bio.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 10), child: Text(p.bio, style: const TextStyle(color: Colors.white, height: 1.4))),
            ]),
          ),
        ),
      ]),
    );
  }

  Widget _chip(String t, bool hi) => Container(padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 5), decoration: BoxDecoration(color: hi ? saffron : Colors.white24, borderRadius: BorderRadius.circular(99)), child: Text(t, style: TextStyle(color: hi ? ink : Colors.white, fontWeight: FontWeight.w700, fontSize: 12.5)));
  Widget _pill(String t) => Container(padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6), decoration: BoxDecoration(color: Colors.black45, borderRadius: BorderRadius.circular(99)), child: Text(t, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: .6)));
  Widget _stamp(String t, Color c) => Container(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4), decoration: BoxDecoration(border: Border.all(color: c, width: 4), borderRadius: BorderRadius.circular(12)), child: Text(t, style: TextStyle(color: c, fontSize: 24, fontWeight: FontWeight.w800)));
}

class MatchesTab extends StatelessWidget {
  final List<MatchRow>? matches;
  final void Function(MatchRow) onOpen;
  final Future<void> Function() onRefresh;
  const MatchesTab({super.key, required this.matches, required this.onOpen, required this.onRefresh});
  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(padding: const EdgeInsets.all(20), children: [
        const Text('Matches', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20)),
        const SizedBox(height: 12),
        if (matches == null) const Center(child: Padding(padding: EdgeInsets.all(40), child: CircularProgressIndicator()))
        else if (matches!.isEmpty) const Padding(padding: EdgeInsets.all(32), child: Center(child: Text('No matches yet.\nWhen you both like each other, you can chat here.', textAlign: TextAlign.center, style: TextStyle(color: muted))))
        else
          for (final m in matches!)
            Card(
              elevation: 0, color: Colors.white, margin: const EdgeInsets.only(bottom: 10),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
              child: ListTile(
                contentPadding: const EdgeInsets.all(12),
                leading: Avatar(url: m.profile.photos.isEmpty ? null : m.profile.photos.first, hue: m.profile.hue),
                title: Text('${m.profile.name}, ${m.profile.age}', style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(m.lastText == null ? 'Say hello' : '${m.lastMine ? 'You: ' : ''}${m.lastText}', maxLines: 1, overflow: TextOverflow.ellipsis),
                trailing: m.unread > 0 ? Badge(label: Text('${m.unread}')) : null,
                onTap: () => onOpen(m),
              ),
            ),
      ]),
    );
  }
}

class ProfileTab extends StatefulWidget {
  final AppState state;
  final Me me;
  const ProfileTab({super.key, required this.state, required this.me});
  @override
  State<ProfileTab> createState() => _ProfileTabState();
}

class _ProfileTabState extends State<ProfileTab> {
  bool busy = false;

  Future<void> addPhoto() async {
    final f = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1600, imageQuality: 90);
    if (f == null) return;
    setState(() => busy = true);
    try {
      final d = await Api.instance.upload('/me/photos', await f.readAsBytes());
      widget.state.setMe(Me.fromJson(d['user']));
      if (mounted) snack(context, d['message'] ?? 'Photo added.');
    } on ApiException catch (e) {
      if (mounted) snack(context, e.message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> removePhoto(Photo p) async {
    try {
      final d = await Api.instance.delete('/me/photos/${p.id}');
      widget.state.setMe(Me.fromJson(d['user']));
    } on ApiException catch (e) {
      if (mounted) snack(context, e.message);
    }
  }

  Future<void> changePassword() async {
    final cur = TextEditingController(), next = TextEditingController();
    String? err;
    await showDialog(context: context, builder: (ctx) => StatefulBuilder(builder: (ctx, set) => AlertDialog(
      title: const Text('Change password'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [PasswordField(controller: cur, label: 'Current password'), const SizedBox(height: 12), PasswordField(controller: next, label: 'New password', newPassword: true), ErrorText(err)]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        TextButton(onPressed: () async {
          try { await Api.instance.post('/me/password', {'current': cur.text, 'next': next.text}); if (ctx.mounted) Navigator.pop(ctx); if (mounted) snack(context, 'Password changed.'); } on ApiException catch (e) { set(() => err = e.message); }
        }, child: const Text('Save')),
      ],
    )));
  }

  Future<void> deleteAccount() async {
    final pw = TextEditingController();
    String? err;
    await showDialog(context: context, builder: (ctx) => StatefulBuilder(builder: (ctx, set) => AlertDialog(
      title: const Text('Delete my account'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        const Text('This permanently removes your profile, photos, matches and messages. Enter your password to confirm.'),
        const SizedBox(height: 12),
        PasswordField(controller: pw),
        ErrorText(err),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Keep my account')),
        TextButton(style: TextButton.styleFrom(foregroundColor: const Color(0xFFC0263F)), onPressed: () async {
          try { await Api.instance.delete('/me', {'password': pw.text}); await Api.instance.setTokens(null, null); if (ctx.mounted) Navigator.pop(ctx); widget.state.clear(); } on ApiException catch (e) { set(() => err = e.message); }
        }, child: const Text('Delete everything')),
      ],
    )));
  }

  @override
  Widget build(BuildContext context) {
    final me = widget.me;
    final p = me.profile!;
    return ListView(padding: const EdgeInsets.all(20), children: [
      Row(children: [const Text('Your profile', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20)), const Spacer(), TextButton(onPressed: widget.state.logout, child: const Text('Log out'))]),
      const SizedBox(height: 8),
      AspectRatio(
        aspectRatio: 4 / 5,
        child: ClipRRect(borderRadius: BorderRadius.circular(28), child: Stack(fit: StackFit.expand, children: [
          PhotoFill(url: me.selfie?.url),
          Positioned(left: 10, right: 10, bottom: 10, child: Container(padding: const EdgeInsets.all(14), decoration: BoxDecoration(color: const Color(0xC717131F), borderRadius: BorderRadius.circular(22)), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${p.name}  ${p.age}', style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800)),
            Text('${p.city} · ${p.status}', style: const TextStyle(color: Colors.white70)),
            if (p.bio.isNotEmpty) Text(p.bio, style: const TextStyle(color: Colors.white)),
          ]))),
        ])),
      ),
      const SizedBox(height: 12),
      OutlinedButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ProfileSetupScreen(state: widget.state, me: me, editing: true))), child: const Text('Edit details')),
      const SizedBox(height: 22),
      const Text('More photos', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
      const Padding(padding: EdgeInsets.symmetric(vertical: 4), child: Text('Each photo is checked. It has to show you (matching your selfie) and be fully clothed.', style: TextStyle(color: muted, fontSize: 13))),
      const SizedBox(height: 8),
      GridView.count(shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), crossAxisCount: 3, crossAxisSpacing: 8, mainAxisSpacing: 8, childAspectRatio: .75, children: [
        for (final ph in me.extras)
          ClipRRect(borderRadius: BorderRadius.circular(14), child: Stack(fit: StackFit.expand, children: [
            PhotoFill(url: ph.url),
            if (ph.status == 'review') const Positioned(left: 6, top: 6, child: Chip(label: Text('In review', style: TextStyle(fontSize: 10)), visualDensity: VisualDensity.compact, padding: EdgeInsets.zero)),
            Positioned(right: 2, top: 2, child: IconButton(onPressed: () => removePhoto(ph), icon: const Icon(Icons.close, size: 18), tooltip: 'Remove photo', style: IconButton.styleFrom(backgroundColor: Colors.white70, minimumSize: const Size(30, 30)))),
          ])),
      ]),
      const SizedBox(height: 12),
      if (me.extras.length < me.maxExtraPhotos) OutlinedButton(onPressed: busy ? null : addPhoto, child: Text(busy ? 'Checking photo…' : 'Add a photo')),
      const SizedBox(height: 26),
      const Text('Account', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
      const SizedBox(height: 8),
      Text('${me.email ?? ''}\n${me.phone ?? ''}', style: const TextStyle(color: muted)),
      const SizedBox(height: 10),
      OutlinedButton(onPressed: changePassword, child: const Text('Change password')),
      TextButton(onPressed: () => launchUrl(Uri.parse('$siteUrl/privacy'), mode: LaunchMode.externalApplication), child: const Text('Privacy policy')),
      TextButton(onPressed: () => launchUrl(Uri.parse('$siteUrl/terms'), mode: LaunchMode.externalApplication), child: const Text('Community rules')),
      TextButton(style: TextButton.styleFrom(foregroundColor: const Color(0xFFC0263F)), onPressed: deleteAccount, child: const Text('Delete my account')),
    ]);
  }
}
