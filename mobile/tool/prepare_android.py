#!/usr/bin/env python3
"""Generates the Android project (flutter create) and patches it for release:
   internet + camera permissions, app name, minSdk 23, and signing from android/key.properties.
   Usage (inside mobile/):  APP_ID=com.yourcompany.marriageswipe python3 tool/prepare_android.py
   Safe to run twice."""
import os, re, subprocess, sys, pathlib

app_id = os.environ.get('APP_ID', 'com.marriageswipe.app')
root = pathlib.Path(__file__).resolve().parent.parent
if not (root / 'android').exists():
    subprocess.check_call(['flutter', 'create', '--platforms=android', '--org', app_id.rsplit('.', 1)[0], '--project-name', 'marriage_swipe', '.'], cwd=root)

# manifest
mf = root / 'android/app/src/main/AndroidManifest.xml'
t = mf.read_text()
perms = ['android.permission.INTERNET', 'android.permission.CAMERA']
for pm in perms:
    if pm not in t:
        t = t.replace('<application', f'<uses-permission android:name="{pm}"/>\n    <application', 1)
if 'android.hardware.camera' not in t:
    t = t.replace('<application', '<uses-feature android:name="android.hardware.camera" android:required="false"/>\n    <application', 1)
t = re.sub(r'android:label="[^"]*"', 'android:label="Marriage Swipe"', t, count=1)
if 'usesCleartextTraffic' not in t:
    t = t.replace('<application', '<application android:usesCleartextTraffic="false"', 1)
mf.write_text(t)

# gradle
kts = root / 'android/app/build.gradle.kts'
groovy = root / 'android/app/build.gradle'
if kts.exists():
    g = kts.read_text()
    g = re.sub(r'applicationId\s*=\s*"[^"]*"', f'applicationId = "{app_id}"', g)
    g = re.sub(r'namespace\s*=\s*"[^"]*"', f'namespace = "{app_id}"', g)
    g = re.sub(r'minSdk\s*=\s*flutter\.minSdkVersion', 'minSdk = 23', g)
    if 'keystoreProperties' not in g:
        g = 'import java.io.FileInputStream\nimport java.util.Properties\n\n' + g
        g = g.replace('android {', '''val keystoreProperties = Properties()
val keystoreFile = rootProject.file("key.properties")
if (keystoreFile.exists()) keystoreProperties.load(FileInputStream(keystoreFile))

android {''', 1)
        g = g.replace('buildTypes {', '''signingConfigs {
        create("release") {
            if (keystoreFile.exists()) {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }

    buildTypes {''', 1)
        g = re.sub(r'signingConfig\s*=\s*signingConfigs\.getByName\("debug"\)', 'signingConfig = signingConfigs.getByName("release")', g)
    kts.write_text(g)
elif groovy.exists():
    g = groovy.read_text()
    g = re.sub(r'applicationId\s+"[^"]*"', f'applicationId "{app_id}"', g)
    g = re.sub(r'namespace\s+"[^"]*"', f'namespace "{app_id}"', g)
    g = re.sub(r'minSdkVersion\s+flutter\.minSdkVersion', 'minSdkVersion 23', g)
    if 'keystoreProperties' not in g:
        g = g.replace('android {', '''def keystoreProperties = new Properties()
def keystoreFile = rootProject.file('key.properties')
if (keystoreFile.exists()) keystoreProperties.load(new FileInputStream(keystoreFile))

android {''', 1)
        g = g.replace('buildTypes {', '''signingConfigs {
        release {
            if (keystoreFile.exists()) {
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
            }
        }
    }

    buildTypes {''', 1)
        g = g.replace('signingConfig signingConfigs.debug', 'signingConfig signingConfigs.release')
    groovy.write_text(g)
else:
    sys.exit('Could not find android/app/build.gradle(.kts)')
# Move MainActivity into the applicationId package. `flutter create` puts it under <org>.<project_name>
# (e.g. com.marriage_swipe) but the manifest resolves ".MainActivity" against the namespace (= app_id),
# which crashes at launch with ClassNotFoundException if the two differ.
src_root = root / 'android/app/src/main'
for lang, ext in (('kotlin', 'kt'), ('java', 'java')):
    base = src_root / lang
    if not base.exists():
        continue
    for old in list(base.rglob('MainActivity.' + ext)):
        target = base.joinpath(*app_id.split('.')) / old.name
        code = old.read_text()
        code = re.sub(r'^package\s+[\w.]+', f'package {app_id}', code, count=1, flags=re.M)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(code)
        if old.resolve() != target.resolve():
            old.unlink()
            d = old.parent
            while d != base and not any(d.iterdir()):
                d.rmdir(); d = d.parent

print('Android project ready for', app_id)
