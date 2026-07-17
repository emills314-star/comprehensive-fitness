# Rest Notification Backend

Comprehensive Fitness uses standards-based Web Push for locked-screen rest alerts. The browser never receives VAPID private keys, QStash credentials, Redis credentials, or database service credentials.

## Services

- Vercel Functions host `/api/push/*`, `/api/sync/*`, and installation revocation.
- Upstash QStash schedules one delayed delivery per active rest timer.
- Upstash Redis stores installation-scoped push subscriptions, scheduled timers, idempotency records, and explicitly consented expiring workout copies.
- `web-push` encrypts each payload for the browser subscription using VAPID.

All three services have free tiers suitable for personal use. The foreground timer and IndexedDB workout log continue to work when the notification backend is not configured.

## Live Free-Tier Deployment

Production was configured and verified on 2026-07-11. No paid plan or payment method is required by the current implementation.

| Component | Live resource | Free-plan details used by this app |
| --- | --- | --- |
| Vercel | Hobby project `comprehensive-fitness`, production domain `https://comprehensive-fitness.vercel.app`, functions in `iad1` | Hosts the PWA and Node.js API functions |
| Upstash Redis | Database `comprehensive-fitness`, AWS `us-east-2`, Free Tier | 500,000 commands/month, 256 MB storage, 50 GB monthly bandwidth |
| Upstash QStash | `US Region`, AWS `us-east-1`, Free | 1,000 messages/day, 50 GB monthly bandwidth, three retries, 1 MB messages |
| Web Push | One production VAPID key pair generated 2026-07-11 | Private key exists only in Vercel Production environment variables |

The nine variables below are present only in Vercel Production. The latest deployment is `READY`, and `GET /api/push/config` returns `configured: true` with scheduler `qstash`. A temporary `cf:smoke:*` Redis key was written, read, and deleted successfully during setup, so no smoke-test record remains.

Before an installation enables any backend feature, Redis is expected to contain no persistent app records. Push setup and workout cloud copy can independently authorize the installation. Timer keys appear only for requested background alerts; workout keys appear only after separate explicit cloud-copy consent.

## Environment Variables

Set these in Vercel for Production, Preview, and Development as appropriate:

```text
PUBLIC_APP_URL=https://comprehensive-fitness.vercel.app
VAPID_SUBJECT=mailto:you@example.com
VAPID_PUBLIC_KEY=generated-public-key
VAPID_PRIVATE_KEY=generated-private-key
QSTASH_TOKEN=from-upstash-qstash
QSTASH_CURRENT_SIGNING_KEY=from-upstash-qstash
QSTASH_NEXT_SIGNING_KEY=from-upstash-qstash
UPSTASH_REDIS_REST_URL=from-upstash-redis
UPSTASH_REDIS_REST_TOKEN=from-upstash-redis
```

Generate VAPID keys locally once:

```powershell
npx web-push generate-vapid-keys
```

Keep the private key server-side. Redeploy after setting all variables.

## Redis Schema

### Push subscriptions

Key: `cf:install:{installationId}` (hash)

Fields include `installationId`, push subscription material/status, timestamps, `deviceId`, the hashed installation secret, and `syncConsent` plus consent/revocation timestamps. Workout consent is never inferred from push status.

Key: `cf:installations` (set) contains registered installation IDs for operational auditing.

The browser receives a random installation bearer token once. Only its SHA-256 hash is stored. Expired subscriptions are marked inactive after a `404` or `410` push response.

### Scheduled rest notifications

Key: `cf:timer:{notificationId}` (hash)

Fields: `notificationId`, `installationId`, `userId`, `workoutId`, `exerciseId`, `setId`, `upcomingSetId`, `upcomingSetNumber`, `upcomingSetLabel`, `timerVersion`, `exerciseName`, `messageDetail`, `scheduledCompletionAt`, `status`, `createdAt`, `canceledAt`, `deliveredAt`, `messageId`, `cancelReason`, `deliveryError`.

Key: `cf:active:{installationId}:{workoutId}` points to the only active notification ID for that workout. Scheduling a replacement cancels the prior QStash message first.

### Workout synchronization

Key: `cf:workout:{installationId}:{sessionId}` (hash)

Fields: `installationId`, `sessionId`, `revision`, `payload`, `updatedAt`.

Workout hashes, the per-installation workout-key index, and mutation idempotency records expire within 90 days. Duplicate mutations return success without creating duplicate workout or set records. Disabling cloud copy scans and deletes both indexed and legacy workout/mutation keys before recording revoked consent.

### Consent and revocation flow

1. Workout cloud copy defaults off and is controlled separately from notifications in Settings.
2. `/api/sync/authorize` creates installation authorization without requiring a push subscription.
3. `/api/sync/consent` records explicit consent or disables it and deletes retained workout data.
4. `/api/sync/workout` rejects authorized installations whose server consent is not active.
5. `/api/push/revoke` cancels active timers and removes push subscription material without disabling independently consented workout copy.
6. `/api/installation/revoke` cancels push, deletes retained workouts/mutations, and deletes the installation credential. Local clearing waits for this confirmation rather than orphaning server data.

Public sync authorization is limited to ten attempts per source-address hash per hour. Authorized workout mutations larger than 256 KB are rejected before Redis idempotency or workout keys are written.

## Free-Tier Operations

- Check Upstash Redis **Commands**, **Storage**, and **Bandwidth** monthly. The personal app should remain far below the free limits; do not select **Upgrade** or add a payment method.
- Check QStash **Messages**, **DLQ**, and **Schedules** if a locked-screen notification fails. The current free allowance is ample for personal rest timers.
- Rotate Redis, QStash, or VAPID credentials only when compromised or intentionally migrating. Update all matching Vercel Production variables together and redeploy immediately.
- Historical workout recommendation snapshots are client-side IndexedDB data and are not silently rewritten by these backend services. Exported app backups remain the authoritative restore source.

## Delivery Flow

1. The installed PWA requests permission only after the user taps Enable.
2. The push subscription is registered with an installation-scoped secret.
3. Starting a timer stores an absolute end timestamp and schedules a QStash message using a unique notification ID.
4. Adding time, pausing, canceling, skipping, deleting, or ending the workout cancels that exact message.
5. QStash signs calls to `/api/push/deliver`; the function verifies the signature before reading timer data.
6. The service worker shows `Rest complete` and deep-links to the active workout and upcoming set.

## Physical iPhone Test

Desktop emulation cannot validate iOS installation, suspension, Silent Mode, Focus, or lock-screen delivery. On an iPhone:

1. Install from Safari using Add to Home Screen.
2. Open Settings > iPhone app setup and enable notifications.
3. Send the test notification while the phone is locked.
4. Start a short rest timer, switch apps, and verify delivery and deep linking.
5. Repeat after extending, pausing, skipping, and canceling the timer to confirm stale notifications do not arrive.
