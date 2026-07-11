# Comprehensive Fitness

A local-first, installable workout tracker for logging strength sessions and getting transparent progression guidance.

The repository also contains a private, reproducible [personal fitness data layer](personal_fitness_data/README.md). Its raw and generated health data are intentionally excluded from Git and deployment.

For future prescription-engine work, [Training Prescription Data and Integration Map](docs/training-prescription-data.md) inventories both databases, their current versions and record counts, crosswalk/weighting rules, app persistence contract, privacy boundary, and regeneration commands.

To install and finish configuring the personal coach on an iPhone without an Apple Developer membership, follow the [iPhone PWA Personal Coach Setup](docs/iphone-pwa-personal-coach-setup.md).

## Current App

The web app is intentionally simple and self-contained:

- `index.html` runs directly in a browser and is what Vercel serves.
- `www/index.html` is the bundled payload Capacitor will copy into native builds.
- Workout data is stored primarily in IndexedDB, with active-workout runtime state restored after reload or suspension.
- `manifest.webmanifest`, `sw.js`, and `resources/icon-*.png` make the Vercel app installable from iPhone Safari.
- Optional Web Push uses Vercel Functions, Upstash QStash, Upstash Redis, and VAPID. It does not require an Apple Developer Program membership.

## Install On iPhone From Vercel

After Vercel redeploys the latest `main` branch:

1. Open the Vercel app URL in Safari on your iPhone.
2. Tap the Share button.
3. Tap `Add to Home Screen`.
4. Enable `Open as Web App` when that option appears.
5. Name it `Comprehensive Fitness` and tap `Add`.
6. Open it from the new Home Screen icon, then use Settings > iPhone app setup to enable and test notifications.

Workout data is stored locally for that installed web app/site. Export a backup from Settings before switching domains, clearing Safari data, or replacing the phone.

## Locked-Screen Rest Notifications

The foreground timer works without backend configuration. Reliable locked-screen notifications require the free-tier-compatible push services documented in [docs/push-backend.md](docs/push-backend.md). Add the listed environment variables to Vercel and redeploy.

## PWA Maintenance

When the app changes, sync the root web files into the native bundle and verify the PWA files:

```powershell
npm run sync:web
npm run verify:pwa
```

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
