# iPhone PWA Personal Coach Setup

This is the operational runbook for using Comprehensive Fitness as a private personal coach on an iPhone without a Mac or Apple Developer Program membership.

## Current production app

- URL: `https://comprehensive-fitness.vercel.app`
- Minimum iOS version for Home Screen Web Push: iOS 16.4
- Personal data and the optional offline personal-analysis pipeline are intentionally excluded from GitHub and Vercel; they are not app input.
- The installed PWA stores its state in that installation's IndexedDB. Exported app backups remain the authoritative recovery method.

## 1. Push backend status: reverify before use

The coaching engine works without this backend. The backend is required for reliable rest-complete delivery while the PWA is backgrounded or the phone is locked.

The production backend was configured and smoke-tested on 2026-07-11. That is a historical observation, not proof of its current service, plan, region, credential, or delivery state:

- Upstash Redis: `comprehensive-fitness`, AWS `us-east-2`, Free Tier.
- Upstash QStash: US Region, AWS `us-east-1`, Free.
- Vercel: Hobby project, Production variables only.
- Live check: `https://comprehensive-fitness.vercel.app/api/push/config` returns `"configured": true` and `"scheduler": "qstash"`.
- Direct Redis write/read/delete and protected live route checks passed.

Reverify the current configuration without printing secrets before making an operational claim. Do not create another database, select **Upgrade**, add a credit card, or regenerate credentials during normal setup. The following subsections are recovery instructions for a separately authorized credential rotation or account migration.

### Recovery: recreate Upstash Redis

1. Sign into Upstash.
2. Open **Redis** and select **Create Database**.
3. Name it `comprehensive-fitness` and select a region near the Vercel deployment.
4. Open the database's REST API/connection section.
5. Copy `UPSTASH_REDIS_REST_URL`.
6. Copy the standard `UPSTASH_REDIS_REST_TOKEN`, not the read-only token.

### Recovery: collect QStash credentials

1. Open **QStash** in Upstash.
2. Copy `QSTASH_TOKEN`.
3. Copy `QSTASH_CURRENT_SIGNING_KEY`.
4. Copy `QSTASH_NEXT_SIGNING_KEY`.
5. Keep all three values in a password manager.

### Recovery: generate VAPID credentials

From PowerShell in the repository:

```powershell
npx web-push generate-vapid-keys
```

Keep both keys in a password manager. Never commit the private key or paste it into client-side code.

### Recovery: update Vercel environment variables

Open Vercel, select **comprehensive-fitness**, then open **Settings > Environment Variables**. Add these values to Production:

```text
PUBLIC_APP_URL=https://comprehensive-fitness.vercel.app
VAPID_SUBJECT=mailto:YOUR_EMAIL_ADDRESS
VAPID_PUBLIC_KEY=YOUR_GENERATED_PUBLIC_KEY
VAPID_PRIVATE_KEY=YOUR_GENERATED_PRIVATE_KEY
QSTASH_TOKEN=YOUR_QSTASH_TOKEN
QSTASH_CURRENT_SIGNING_KEY=YOUR_CURRENT_SIGNING_KEY
QSTASH_NEXT_SIGNING_KEY=YOUR_NEXT_SIGNING_KEY
UPSTASH_REDIS_REST_URL=YOUR_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN=YOUR_STANDARD_REDIS_REST_TOKEN
```

Redeploy the latest production deployment after saving the variables. Then open:

```text
https://comprehensive-fitness.vercel.app/api/push/config
```

Do not continue after a recovery change until it again returns `"configured": true` and `"scheduler": "qstash"`.

## 2. Install the PWA

1. Open `https://comprehensive-fitness.vercel.app` in iPhone Safari.
2. Tap **Share > Add to Home Screen**.
3. Enable **Open as Web App** when shown.
4. Name it **Comprehensive Fitness** and tap **Add**.
5. Close Safari and launch Comprehensive Fitness from its Home Screen icon.

Always use the same production domain. IndexedDB, notification permission, and the Web Push subscription are domain- and installation-specific.

## 3. Restore an app backup when needed

Export an app backup before replacing an installation or clearing browser storage. Restore only the supported app-backup format through **Settings > Data and backup**.

Legacy backups may retain immutable historical recommendation/prescription snapshots and source-unit provenance. They are historical compatibility material: restoring them does not enable personal-evidence import, research/prescription generation, or analytical coaching. Do not edit backup JSON to bypass validation.

## 4. Enable iPhone notifications

1. In the installed PWA, open **Settings > iPhone app setup**.
2. Enable lock-screen rest notifications.
3. Tap the notification test action and choose **Allow** at the iOS prompt.
4. Open iPhone **Settings > Notifications > Comprehensive Fitness**.
5. Enable **Allow Notifications**, **Lock Screen**, **Notification Center**, **Banners**, and **Sounds**.
6. Add Comprehensive Fitness to the allowed apps for any Focus mode used at the gym.
7. Keep ringer/notification volume audible. A web app cannot override Silent Mode or Focus.

Recommended app settings:

- Foreground completion sound: on
- Rest-complete sound: Sharp two-tone
- Sound volume: 0.85-1.0 after testing with gym music
- Browser vibration: on where supported
- In-app completion alert: on
- Alert auto-dismiss: 5 seconds
- Auto-return: off unless explicitly preferred

Workout cloud copy is permanently disabled. There is no upload control, queue, cloud history, cross-device continuity, or restore endpoint. Notifications transmit only the bounded rest-alert facts described in `push-backend.md`. Continue exporting app backups.

### Delete remote installation data

Settings > **Danger Zone > Delete Remote Installation Data** revokes the backend installation while preserving local workouts. Cleanup may show **deleting** and continue in bounded retries; keep the app online or reopen it later until Settings reports deletion. **Clear All Local App Data** is paused while cleanup needs the retained authorization and while an active rest notification cannot be canceled reliably. Once neither condition applies, local clearing is available, but it is local-only unless remote deletion already completed. A non-retryable authorization error stays visible and requires a manual retry. An alert already dispatched to the browser push service cannot be recalled, although revoked server state cannot create later retries.

## 5. Physical acceptance test

### Workout behavior and historical compatibility

1. Start the expected workout from Today, or use contextual Routines, and confirm no planner or mesocycle lifecycle surface is available.
2. Import a synthetic legacy backup only in the supported verification environment and confirm workout/routine-template facts survive without recreated planner state.
3. Enter direct pain/injury or illness and confirm the single advisory action preserves logging.
4. Confirm ordinary sessions remain quiet: no live prescription, research, personal-evidence, confidence, volume, fatigue, or analytics coaching appears.

### Rest completion

1. Play music from another app.
2. Start a 10-second timer while Comprehensive Fitness remains visible.
3. Confirm one completion sound and one Rest Complete overlay.
4. Confirm the overlay disappears after five seconds and no new timer starts.
5. Repeat and tap **Return to Workout**; confirm the next incomplete set is focused.
6. Start another timer, background the PWA, and confirm one notification arrives.
7. Repeat with the phone locked.
8. Tap the notification and confirm it returns to the active workout and next set.
9. Extend and cancel timers to confirm stale notifications do not arrive.

### Persistence

1. Complete a workout and reopen it from Progress.
2. Confirm submitted set facts and raw source-unit provenance remain unchanged when the display unit changes.
3. Import a supported legacy backup only in the verification environment and confirm any historical snapshot checksum/version remains unchanged and does not create current coaching.
4. Export a full app backup and verify the JSON exists in Files.
5. Confirm Settings has no workout-upload control and completing a set creates no workout-copy request.

## Platform workarounds

| Limitation | Workaround |
| --- | --- |
| No custom lock-screen sound | Use the noticeable foreground two-tone, enable iOS notification sounds, and test the chosen tone while music is playing. Background Web Push uses the operating-system sound. |
| No reliable browser vibration on iOS | Use sound, the overlay, banners, and lock-screen delivery. If an Apple Watch is available, mirror Comprehensive Fitness notifications for a wrist tap. |
| The PWA cannot explicitly duck music | Test the sharp two-tone and whistle sounds with the real headphones/music level. Web Audio mixes with other audio but cannot request a native iOS audio session. |
| A suspended page cannot repaint at the deadline | Web Push provides the external alert. The controller stores an absolute completion/dismissal timestamp and reconciles immediately when iOS resumes the PWA. |
| Background delivery needs connectivity | Keep cellular data enabled when starting a rest period. Foreground timing remains local if the backend cannot be reached. |
| iOS can evict web storage | Export a backup weekly and before iOS upgrades, domain changes, clearing Safari data, or reinstalling the PWA. |
| There is no workout cloud restore | Treat exported app JSON as the authoritative backup. Notification success is not a workout backup. |
| Remote cleanup is resumable rather than instantaneous | Leave the installation authorization intact until Settings reports remote data deleted; the app pauses local clearing while that authorization is required. Retry after reconnecting if an error remains visible. |
| PWA update appears delayed | Export first, open the PWA online, wait briefly, close it from the app switcher, and reopen it. Delete/reinstall only after a verified backup. |

## Manual account-security task

Vercel displayed its optional two-factor-authentication setup prompt during configuration. It was skipped because completing authenticator enrollment requires your phone and recovery-code storage; this does not affect app functionality. To secure the deployment account without paying:

1. Install or open a free authenticator such as Google Authenticator, Microsoft Authenticator, or 2FAS on your phone.
2. Sign in to Vercel, open your avatar menu, and choose **Account Settings**.
3. Open **Security** and choose **Set Up Two-Factor Authentication**.
4. Scan the QR code with the authenticator app.
5. Enter the current six-digit code in Vercel.
6. Save the recovery codes in your password manager and one encrypted offline backup.
7. Sign out and back in once to confirm the authenticator works before relying on it.

## Offline personal-analysis pipeline

The local personal-data pipeline may still be used offline for private analysis. It is not an app setup step, must not be imported into the PWA, and must not be uploaded to GitHub or Vercel. Completed workouts do not use it to generate future targets or coaching. If reviewing a historical backup, keep its stored snapshot versions, raw-unit provenance, and checksums unchanged.

## Native alternative

The existing Capacitor project cannot be installed as a dependable native iPhone app without Apple signing. A borrowed Mac plus a free Apple Personal Team can install a private development build, but it must be re-provisioned periodically and is not an App Store/TestFlight distribution path. AltStore/cloud-signing routes still require an iOS build/signing workflow and add recurring refresh or credential risk. The PWA is therefore the supported no-Mac, no-fee route.
