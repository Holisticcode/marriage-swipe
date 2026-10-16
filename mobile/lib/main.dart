import 'package:flutter/material.dart';
import 'api.dart';
import 'models.dart';
import 'screens/auth.dart';
import 'screens/home.dart';
import 'screens/setup.dart';
import 'theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Api.instance.load();
  runApp(const MarriageSwipeApp());
}

/// Holds the signed-in member and decides which screen to show.
class AppState extends ChangeNotifier {
  Me? me;
  bool loading = true;
  String? fatal;

  Future<void> boot() async {
    Api.instance.onSignedOut = () {
      me = null;
      notifyListeners();
    };
    if (!Api.instance.hasSession) {
      loading = false;
      notifyListeners();
      return;
    }
    await refresh();
  }

  Future<void> refresh() async {
    try {
      final d = await Api.instance.get('/me');
      final m = Me.fromJson(d['user']);
      if (m.role == 'admin') {
        fatal = 'This is an admin account. Use the admin console on the website.';
        await Api.instance.logout();
      } else {
        me = m;
        fatal = null;
      }
    } on ApiException catch (e) {
      if (e.status == 401 || e.status == 403) {
        await Api.instance.setTokens(null, null);
        me = null;
        fatal = e.status == 403 ? e.message : null;
      } else {
        fatal = e.message;
      }
    }
    loading = false;
    notifyListeners();
  }

  void clear() {
    me = null;
    notifyListeners();
  }

  void setMe(Me m) {
    me = m;
    notifyListeners();
  }

  Future<void> signedIn(Map<String, dynamic> d) async {
    final m = Me.fromJson(d['user']);
    if (m.role == 'admin') {
      await Api.instance.logout();
      throw ApiException(403, 'ADMIN', 'Admins sign in on the website at /admin.');
    }
    me = m;
    fatal = null;
    notifyListeners();
  }

  Future<void> logout() async {
    await Api.instance.logout();
    me = null;
    notifyListeners();
  }
}

class MarriageSwipeApp extends StatefulWidget {
  const MarriageSwipeApp({super.key});
  @override
  State<MarriageSwipeApp> createState() => _AppState();
}

class _AppState extends State<MarriageSwipeApp> {
  final state = AppState();
  @override
  void initState() {
    super.initState();
    state.boot();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Marriage Swipe',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: ListenableBuilder(
        listenable: state,
        builder: (context, _) {
          if (state.loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
          final me = state.me;
          if (me == null) return AuthScreen(state: state, notice: state.fatal);
          if (me.profile == null) return ProfileSetupScreen(state: state, me: me);
          if (me.verification != 'verified') return SelfieScreen(state: state, me: me);
          return HomeScreen(state: state, me: me);
        },
      ),
    );
  }
}
