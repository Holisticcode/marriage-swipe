# Marriage Swipe: Android app (Flutter)

The Dart code is in `lib/`. The Android wrapper is generated on your computer (or in the cloud build) so it always matches the Flutter version you use.

## One-time setup
1. Install Flutter (https://docs.flutter.dev/get-started/install), then `flutter doctor`.
2. In this folder run: `APP_ID=com.yourcompany.marriageswipe python3 tool/prepare_android.py`
   Pick your own app ID once. It can never change after you publish.
3. `flutter pub get`

## Run on a phone or emulator
`flutter run --dart-define=API_URL=https://yourdomain.com/api --dart-define=SITE_URL=https://yourdomain.com`

## Build for Google Play
1. Make a signing key once and keep it safe (lose it and you cannot update the app):
   `keytool -genkey -v -keystore ~/marriageswipe-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`
2. Create `android/key.properties`:
   ```
   storePassword=...
   keyPassword=...
   keyAlias=upload
   storeFile=/full/path/to/marriageswipe-upload.jks
   ```
3. `flutter build appbundle --release --dart-define=API_URL=https://yourdomain.com/api --dart-define=SITE_URL=https://yourdomain.com`
4. Upload `build/app/outputs/bundle/release/app-release.aab` in Play Console.

Or build in the cloud with the included GitHub Actions workflow (`.github/workflows/android.yml`, copy it to the root of your repository).
Set the app version in `pubspec.yaml` (`version: 1.0.0+1`). The number after `+` must go up with every upload.
