# Publishing on Google Play

You do the logins and the final clicks. Nothing here needs you to share a password with anyone.

## Before you start
1. The web app and API must be live on HTTPS (see DEPLOY-HOSTINGER.md). The Android app talks to the same server.
2. Create a Google Play developer account at https://play.google.com/console (one-time US$25, ID verification).
   A **personal** account created after Nov 2023 must run a **closed test with at least 12 testers for 14 days** before it can ask for production access. An **organization** account (needs a D-U-N-S number) skips this.
   Check the current rules in Play Console, they change.

## Build the app
Follow `mobile/README.md`: prepare the Android project, create the signing key (back it up!), build `app-release.aab`.
Or use the GitHub Actions workflow in `.github/workflows/android.yml`: add repository variables `APP_ID`, `API_URL` (`https://YOUR-DOMAIN/api`), `SITE_URL`, and secrets `UPLOAD_KEYSTORE_BASE64` (`base64 -w0 upload.jks`), `KEYSTORE_PASSWORD`, `KEY_PASSWORD`, `KEY_ALIAS`.
Turn on **Play App Signing** when you create the app (the default).

## Create the app in Play Console
- App name: Marriage Swipe. Default language, **App** (not game), **Free**.
- Store listing: use `docs/store-listing.md`. Needs a 512×512 icon, a 1024×500 feature graphic, and at least 2 phone screenshots (take them from the running app).
- **App content** section (all required):
  - Privacy policy URL: `https://YOUR-DOMAIN/privacy`
  - **Account deletion**: in-app (Profile → Delete my account) and web URL `https://YOUR-DOMAIN/delete-account`
  - Data safety form: collected = email, phone number, name, age, gender, photos (including face data for verification), messages, approximate city. Purposes: app functionality, account management, safety/fraud prevention. Encrypted in transit: yes. Users can request deletion: yes. Data shared with third parties: none (add your email/SMS provider if they receive addresses/numbers).
  - Content rating: answer the questionnaire honestly (user-generated content, user interaction, dating). Dating apps are 18+.
  - Target audience: **18 and over only**. Not a children's app.
  - Ads: none. Government app: no. Financial features: none.
  - Dating apps and user-generated content have extra policy requirements (reporting, blocking, moderation, safety tips). The app has report, block and admin moderation. Re-read the current "User Generated Content" and dating policies in Play Console before submitting.
- Test credentials: if review asks, create a test account and give it a verified selfie via the admin console, and put its login in **App access**.

## Release path
1. **Testing → Closed testing**: upload the `.aab`, add 12+ tester emails (friends and family on Gmail), roll out, and ask them to install and use it. Keep it live for 14 days.
2. **Apply for production** in the Dashboard once eligible.
3. **Production**: create a release with the same or a newer `.aab`, submit for review (a few days).
4. Updates: raise the number after `+` in `mobile/pubspec.yaml`, rebuild, upload.

## Be ready for review
Google (and users) will look for: working report/block, moderation of nudity (done by AI + admin), 18+ gate, privacy policy that matches what the app does, and a working account deletion. Keep the admin console checked daily.
