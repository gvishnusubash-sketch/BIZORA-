# BIZORA Android build

The Android APK is built from the latest project archive `bizora (2).zip` by GitHub Actions.

## Build an APK

1. Open the repository's Actions tab.
2. Open the latest **Build BIZORA Android APK** run.
3. Download the `BIZORA-Android-debug-APK` artifact.
4. Extract the ZIP to get `app-debug.apk`.

## Google sign-in setup

The app uses the native `@capacitor-firebase/authentication` Google provider on Android and Firebase JS credentials for the app's JavaScript auth state.

For Google sign-in to work in Android:

1. In Firebase Console, open Project settings > Your apps > Android app `com.bizora.app`.
2. Add the SHA-1 and SHA-256 fingerprints for the debug signing certificate used by the GitHub Actions build.
3. In Authentication > Sign-in method, ensure Google is enabled.
4. Download the updated `google-services.json` and replace the repository-root copy. The GitHub Actions workflow copies it into `android/app/google-services.json` during the build.
5. A push of the updated `google-services.json` automatically starts a new APK build.

The workflow caches the Android debug keystore so the debug signing fingerprints remain stable between builds. The current signing fingerprints are printed in the `BIZORA-auth-diagnostic` artifact for the latest run.

## Release note

The workflow produces a debug APK for testing. A production release APK must be signed with a private release keystore; never commit the keystore or its passwords to the repository.
