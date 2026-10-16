import 'package:flutter_test/flutter_test.dart';
import 'package:marriage_swipe/models.dart';

void main() {
  test('parses a profile from the API', () {
    final p = Profile.fromJson({
      'id': 'a1', 'name': 'Asha', 'age': 29, 'gender': 'Woman', 'status': 'Single', 'city': 'Pune',
      'bio': 'Hi', 'verified': true, 'sample': false, 'hue': 120, 'photos': ['https://x/y.jpg'],
    });
    expect(p.name, 'Asha');
    expect(p.verified, isTrue);
    expect(p.photos.length, 1);
  });

  test('parses the signed-in member', () {
    final m = Me.fromJson({
      'id': 'u1', 'role': 'user', 'email': 'a@b.co', 'phone': '+61400000000', 'emailVerified': false,
      'requiresEmailVerification': false, 'profile': null, 'verification': 'none',
      'photos': [{'id': 'p1', 'kind': 'selfie', 'status': 'approved', 'url': 'u', 'reason': null}],
      'limits': {'maxExtraPhotos': 5},
    });
    expect(m.selfie?.id, 'p1');
    expect(m.extras, isEmpty);
  });
}
