# Rest Notification Backend

Comprehensive Fitness uses standards-based Web Push for locked-screen rest alerts. The browser never receives VAPID private keys, QStash credentials, Redis credentials, or database service credentials.

## Services

- Vercel Functions host `/api/push/*` and `/api/sync/workout`.
- Upstash QStash schedules one delayed delivery per active rest timer.
- Upstash Redis stores installation-scoped push subscriptions, scheduled timers, idempotency records, and workout sync payloads.
- `web-push` encrypts each payload for the browser subscription using VAPID.

All three services have free tiers suitable for personal use. The foreground timer and IndexedDB workout log continue to work when the notification backend is not configured.

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

Fields: `installationId`, `userId`, `endpoint`, `p256dh`, `auth`, `createdAt`, `updatedAt`, `lastSuccessfulDeliveryAt`, `deviceId`, `active`, `invalidAt`, `secretHash`.

The browser receives a random installation bearer token once. Only its SHA-256 hash is stored. Expired subscriptions are marked inactive after a `404` or `410` push response.

### Scheduled rest notifications

Key: `cf:timer:{notificationId}` (hash)

Fields: `notificationId`, `installationId`, `userId`, `workoutId`, `exerciseId`, `setId`, `upcomingSetId`, `upcomingSetNumber`, `exerciseName`, `messageDetail`, `scheduledCompletionAt`, `status`, `createdAt`, `canceledAt`, `deliveredAt`, `messageId`, `cancelReason`, `deliveryError`.

Key: `cf:active:{installationId}:{workoutId}` points to the only active notification ID for that workout. Scheduling a replacement cancels the prior QStash message first.

### Workout synchronization

Key: `cf:workout:{installationId}:{sessionId}` (hash)

Fields: `installationId`, `sessionId`, `revision`, `payload`, `updatedAt`.

Key: `cf:mutation:{installationId}:{mutationId}` is an expiring idempotency record. Duplicate mutations return success without creating duplicate workout or set records.

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
