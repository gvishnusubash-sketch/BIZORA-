# BIZORA Android build

This project is prepared to be packaged with Capacitor.

## Build an APK with GitHub Actions

1. Upload/extract the project files into the root of the `BIZORA-` GitHub repository. Keep the `.github/workflows/android-apk.yml` file and `capacitor.config.ts` at the repository root.
2. Open the repository's **Actions** tab.
3. Select **Build BIZORA Android APK** and choose **Run workflow** (or push a change to `main`).
4. When the workflow completes, open its run and download the `BIZORA-Android-debug-APK` artifact.
5. Extract the artifact ZIP; it contains `app-debug.apk`.

## Important authentication note

The current app uses Firebase Web Authentication with `signInWithPopup` for Google sign-in. That browser popup flow is not guaranteed to work inside the Android WebView. Before treating the APK as production-ready, configure native Google sign-in for Android (Firebase Android app registration, package name `com.bizora.app`, SHA-1/SHA-256 fingerprints, and the corresponding Google OAuth setup), then update the authentication flow to use the native provider. Email/password or other existing Firebase flows should be tested separately.

## Release note

The workflow produces a **debug APK** for testing. A distributable release APK should be signed with a private release keystore stored in GitHub Actions secrets. Never commit the keystore or passwords to the repository.
