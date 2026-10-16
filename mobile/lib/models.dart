class Photo {
  final String id, kind, status, url;
  final String? reason;
  Photo(this.id, this.kind, this.status, this.url, this.reason);
  factory Photo.fromJson(Map<String, dynamic> j) => Photo(j['id'], j['kind'], j['status'], j['url'], j['reason']);
}

class MyProfile {
  final String name, gender, lookingFor, status, city, bio;
  final int age;
  MyProfile(this.name, this.age, this.gender, this.lookingFor, this.status, this.city, this.bio);
  factory MyProfile.fromJson(Map<String, dynamic> j) =>
      MyProfile(j['name'], (j['age'] as num).toInt(), j['gender'], j['lookingFor'], j['status'], j['city'], j['bio'] ?? '');
}

class Me {
  final String id, role;
  final String? email, phone;
  final bool emailVerified, requiresEmailVerification;
  final MyProfile? profile;
  final String verification; // none | pending | verified
  final List<Photo> photos;
  final int maxExtraPhotos;
  Me(this.id, this.role, this.email, this.phone, this.emailVerified, this.requiresEmailVerification, this.profile, this.verification, this.photos, this.maxExtraPhotos);
  factory Me.fromJson(Map<String, dynamic> j) => Me(
        j['id'],
        j['role'],
        j['email'],
        j['phone'],
        j['emailVerified'] == true,
        j['requiresEmailVerification'] == true,
        j['profile'] == null ? null : MyProfile.fromJson(j['profile']),
        j['verification'],
        (j['photos'] as List).map((p) => Photo.fromJson(p)).toList(),
        (j['limits']?['maxExtraPhotos'] as num?)?.toInt() ?? 5,
      );
  Photo? get selfie {
    for (final p in photos) {
      if (p.kind == 'selfie') return p;
    }
    return null;
  }

  List<Photo> get extras => photos.where((p) => p.kind == 'extra').toList();
}

class Profile {
  final String id, name, gender, status, city, bio;
  final int age;
  final bool verified, sample;
  final int hue;
  final List<String> photos;
  Profile(this.id, this.name, this.age, this.gender, this.status, this.city, this.bio, this.verified, this.sample, this.hue, this.photos);
  factory Profile.fromJson(Map<String, dynamic> j) => Profile(
        j['id'],
        j['name'] ?? '',
        (j['age'] as num?)?.toInt() ?? 0,
        j['gender'] ?? '',
        j['status'] ?? '',
        j['city'] ?? '',
        j['bio'] ?? '',
        j['verified'] == true,
        j['sample'] == true,
        (j['hue'] as num?)?.toInt() ?? 280,
        (j['photos'] as List? ?? []).map((e) => e.toString()).toList(),
      );
}

class Msg {
  final int id;
  final bool mine;
  final String text;
  Msg(this.id, this.mine, this.text);
  factory Msg.fromJson(Map<String, dynamic> j) => Msg((j['id'] as num).toInt(), j['mine'] == true, j['text'] ?? '');
}

class MatchRow {
  final String id;
  final Profile profile;
  final String? lastText;
  final bool lastMine;
  final int unread;
  MatchRow(this.id, this.profile, this.lastText, this.lastMine, this.unread);
  factory MatchRow.fromJson(Map<String, dynamic> j) => MatchRow(
        j['id'],
        Profile.fromJson(j['profile']),
        j['lastMessage']?['text'],
        j['lastMessage']?['mine'] == true,
        (j['unread'] as num?)?.toInt() ?? 0,
      );
}
