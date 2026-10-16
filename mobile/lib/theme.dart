import 'package:flutter/material.dart';

const bg = Color(0xFFF4F2F7);
const ink = Color(0xFF17131F);
const accent = Color(0xFFD92D55);
const saffron = Color(0xFFF5B83D);
const muted = Color(0xFF625C6E);
const line = Color(0xFFE4E0EA);
const good = Color(0xFF14935F);

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: accent, primary: accent, surface: Colors.white);
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: bg,
    fontFamily: 'Roboto',
    appBarTheme: const AppBarTheme(backgroundColor: bg, foregroundColor: ink, elevation: 0, scrolledUnderElevation: 0),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: line, width: 1.5)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: line, width: 1.5)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: accent, width: 2)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        foregroundColor: ink,
        side: const BorderSide(color: line, width: 1.5),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
      ),
    ),
  );
}
