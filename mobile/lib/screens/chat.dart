import 'dart:async';
import 'package:flutter/material.dart';
import '../api.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'home.dart';

class ChatScreen extends StatefulWidget {
  final MatchRow match;
  const ChatScreen({super.key, required this.match});
  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final msgs = <Msg>[];
  final input = TextEditingController();
  final scroll = ScrollController();
  Timer? timer;
  int last = 0;

  @override
  void initState() {
    super.initState();
    poll();
    timer = Timer.periodic(const Duration(milliseconds: 3500), (_) => poll());
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> poll() async {
    try {
      final d = await Api.instance.get('/matches/${widget.match.id}/messages?after=$last');
      final fresh = (d['messages'] as List).map((e) => Msg.fromJson(e)).toList();
      if (fresh.isEmpty || !mounted) return;
      last = fresh.last.id;
      setState(() => msgs.addAll(fresh));
      WidgetsBinding.instance.addPostFrameCallback((_) { if (scroll.hasClients) scroll.jumpTo(scroll.position.maxScrollExtent); });
    } on ApiException catch (e) {
      if ((e.status == 404 || e.status == 403) && mounted) {
        timer?.cancel();
        snack(context, 'This chat is no longer available.');
        Navigator.pop(context);
      }
    }
  }

  Future<void> send() async {
    final t = input.text.trim();
    if (t.isEmpty) return;
    input.clear();
    try {
      final d = await Api.instance.post('/matches/${widget.match.id}/messages', {'text': t});
      final m = Msg.fromJson(d['message']);
      last = m.id > last ? m.id : last;
      setState(() => msgs.add(m));
      WidgetsBinding.instance.addPostFrameCallback((_) { if (scroll.hasClients) scroll.jumpTo(scroll.position.maxScrollExtent); });
    } on ApiException catch (e) {
      input.text = t;
      if (mounted) snack(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.match.profile;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(children: [Avatar(url: p.photos.isEmpty ? null : p.photos.first, hue: p.hue, size: 40), const SizedBox(width: 10), Flexible(child: Text('${p.name}, ${p.age}', overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)))]),
        actions: [
          IconButton(
            icon: const Icon(Icons.more_horiz),
            tooltip: 'Report or block',
            onPressed: () async {
              final msg = await showReportSheet(context, p.id, p.name);
              if (msg != null && mounted) { snack(context, msg); Navigator.pop(context); }
            },
          ),
        ],
      ),
      body: Column(children: [
        Expanded(
          child: ListView(controller: scroll, padding: const EdgeInsets.all(16), children: [
            Container(padding: const EdgeInsets.all(12), margin: const EdgeInsets.only(bottom: 12), decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)), child: const Text('Keep it respectful. Phone numbers and emails are removed from messages until you both decide to share them.', textAlign: TextAlign.center, style: TextStyle(color: muted, fontSize: 12))),
            for (final m in msgs)
              Align(
                alignment: m.mine ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * .76),
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 11),
                  decoration: BoxDecoration(color: m.mine ? accent : Colors.white, borderRadius: BorderRadius.only(topLeft: const Radius.circular(22), topRight: const Radius.circular(22), bottomLeft: Radius.circular(m.mine ? 22 : 6), bottomRight: Radius.circular(m.mine ? 6 : 22))),
                  child: Text(m.text, style: TextStyle(color: m.mine ? Colors.white : ink, fontSize: 15.5)),
                ),
              ),
          ]),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
            child: Row(children: [
              Expanded(child: TextField(controller: input, maxLength: 300, onSubmitted: (_) => send(), decoration: const InputDecoration(hintText: 'Write a message', counterText: ''))),
              const SizedBox(width: 8),
              IconButton.filled(onPressed: send, icon: const Icon(Icons.send), style: IconButton.styleFrom(backgroundColor: accent, minimumSize: const Size(52, 52)), tooltip: 'Send'),
            ]),
          ),
        ),
      ]),
    );
  }
}
