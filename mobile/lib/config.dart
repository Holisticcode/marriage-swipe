// Set at build time:  flutter build appbundle --dart-define=API_URL=https://yourdomain.com/api --dart-define=SITE_URL=https://yourdomain.com
const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:3000/api'); // 10.0.2.2 = your computer from the Android emulator
const siteUrl = String.fromEnvironment('SITE_URL', defaultValue: 'http://10.0.2.2:3000');
