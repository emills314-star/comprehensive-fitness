# Comprehensive Fitness

A local-first workout tracker for logging strength sessions and getting transparent progression guidance.

## Current App

The web app is intentionally simple and self-contained:

- `index.html` runs directly in a browser and is what Vercel serves.
- `www/index.html` is the bundled payload Capacitor will copy into native builds.
- Workout data is stored locally in the user's browser/app storage.

## Native App Packaging

This repository includes Capacitor native projects with app id:

`com.emills.comprehensivefitness`

Node.js/npm dependencies are installed locally with `package-lock.json`. To refresh the bundled web payload and native assets after editing the app:

```powershell
npm install
npm run sync:web
npm run cap:sync
```

Generated native folders:

- `android/`
- `ios/`

Build and store submission:

- iOS: open the generated iOS project in Xcode with `npm run cap:open:ios` on macOS, install CocoaPods if prompted, configure signing, archive, and upload through App Store Connect.
- Android: open Android Studio with `npm run cap:open:android`, configure signing, and build a release Android App Bundle for Google Play.

## Store Notes

- Apple App Store submission requires an Apple Developer Program account.
- iOS builds and App Store upload require macOS with Xcode.
- Google Play submission requires a signed Android App Bundle.
- Keep `privacy.html` and `support.html` live on Vercel and use those URLs in store metadata.
- Before submission, create final app icons, screenshots, and an app privacy declaration.
