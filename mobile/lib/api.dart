import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'config.dart';

class ApiException implements Exception {
  final int status;
  final String code, message;
  ApiException(this.status, this.code, this.message);
  @override
  String toString() => message;
}

/// Talks to the Node API. Tokens live in the Android Keystore (flutter_secure_storage), never in plain preferences.
class Api {
  Api._();
  static final Api instance = Api._();
  final _store = const FlutterSecureStorage(aOptions: AndroidOptions(encryptedSharedPreferences: true));
  String? _access, _refresh;
  Future<bool>? _refreshing;
  void Function()? onSignedOut;

  Future<void> load() async {
    _access = await _store.read(key: 'access');
    _refresh = await _store.read(key: 'refresh');
  }

  bool get hasSession => _refresh != null;

  Future<void> setTokens(String? a, String? r) async {
    _access = a;
    _refresh = r;
    if (a == null || r == null) {
      await _store.delete(key: 'access');
      await _store.delete(key: 'refresh');
    } else {
      await _store.write(key: 'access', value: a);
      await _store.write(key: 'refresh', value: r);
    }
  }

  Future<bool> _doRefresh() async {
    final r = _refresh;
    if (r == null) return false;
    try {
      final res = await http.post(Uri.parse('$apiUrl/auth/refresh'), headers: {'Content-Type': 'application/json'}, body: jsonEncode({'refreshToken': r}));
      if (res.statusCode != 200) {
        await setTokens(null, null);
        onSignedOut?.call();
        return false;
      }
      final d = jsonDecode(res.body);
      await setTokens(d['accessToken'], d['refreshToken']);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> _refreshOnce() {
    return _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);
  }

  Future<dynamic> _send(Future<http.Response> Function(Map<String, String> headers) go, {bool auth = true, Map<String, String>? extra}) async {
    Map<String, String> h() => {if (auth && _access != null) 'Authorization': 'Bearer $_access', ...?extra};
    http.Response res;
    try {
      res = await go(h()).timeout(const Duration(seconds: 60));
    } catch (_) {
      throw ApiException(0, 'NETWORK', 'Could not reach the server. Check your connection.');
    }
    if (res.statusCode == 401 && auth && _refresh != null) {
      if (await _refreshOnce()) res = await go(h());
    }
    dynamic data;
    try {
      data = res.body.isEmpty ? null : jsonDecode(res.body);
    } catch (_) {}
    if (res.statusCode >= 400) {
      final e = (data is Map ? data['error'] : null) as Map?;
      throw ApiException(res.statusCode, e?['code'] ?? 'ERROR', e?['message'] ?? 'Something went wrong. Please try again.');
    }
    return data;
  }

  Uri _u(String p) => Uri.parse('$apiUrl$p');
  static const _json = {'Content-Type': 'application/json'};

  Future<dynamic> get(String p) => _send((h) => http.get(_u(p), headers: h));
  Future<dynamic> post(String p, [Object? body, bool auth = true]) =>
      _send((h) => http.post(_u(p), headers: {...h, ..._json}, body: jsonEncode(body ?? {})), auth: auth);
  Future<dynamic> put(String p, Object body) => _send((h) => http.put(_u(p), headers: {...h, ..._json}, body: jsonEncode(body)));
  Future<dynamic> delete(String p, [Object? body]) =>
      _send((h) => http.delete(_u(p), headers: {...h, ..._json}, body: body == null ? null : jsonEncode(body)));

  Future<dynamic> upload(String p, Uint8List bytes) => _send((h) async {
        final req = http.MultipartRequest('POST', _u(p))
          ..headers.addAll(h)
          ..files.add(http.MultipartFile.fromBytes('photo', bytes, filename: 'photo.jpg', contentType: MediaType('image', 'jpeg')));
        return http.Response.fromStream(await req.send());
      });

  Future<Map<String, dynamic>> authenticate(String path, Map<String, dynamic> body) async {
    final d = await post(path, body, false);
    await setTokens(d['accessToken'], d['refreshToken']);
    return d;
  }

  Future<void> logout() async {
    final r = _refresh;
    try {
      if (r != null) await post('/auth/logout', {'refreshToken': r}, false);
    } catch (_) {}
    await setTokens(null, null);
  }
}
