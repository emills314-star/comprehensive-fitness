# Rest Notification and Workout Sync Backend

## Status and boundary

- **Last code review:** 2026-07-13, accepted foundation changes through `ce13f1e`
- **Backend contract:** **IMPLEMENTED** in `api/`
- **Frontend lifecycle:** **PLANNED / NEEDS REVIEW** for complete disable/unsubscribe/delete orchestration
- **Production/device status:** **NEEDS REVIEW**; repository state cannot prove current Vercel, Upstash, QStash, or physical iPhone behavior

Comprehensive Fitness can use standards-based Web Push for background rest alerts and an installation-authorized, write-only workout mutation endpoint. Foreground timers and the local IndexedDB workout log continue to work when the backend is absent. The browser never receives VAPID private keys, QStash signing keys, or Redis credentials.

## Services and trust boundaries

- Vercel Functions host `/api/push/*`, `/api/install/delete`, and `/api/sync/workout`.
- Upstash QStash schedules delayed calls to `/api/push/deliver`; delivery verifies the QStash signature.
- Upstash Redis stores installation records, scoped timer state, deletion indexes, mutation receipts, and serialized workout payloads.
- `web-push` encrypts browser payloads with VAPID.
- There is no account authentication or cross-device restore API. Authorization is scoped to a random per-installation bearer secret; Redis stores only its SHA-256 hash and compares it in constant time.

## Environment variables

Set secrets in the deployment environment, never in source:

```text
PUBLIC_APP_URL=https://example.com
VAPID_SUBJECT=mailto:you@example.com
VAPID_PUBLIC_KEY=generated-public-key
VAPID_PRIVATE_KEY=generated-private-key
QSTASH_TOKEN=from-upstash-qstash
QSTASH_CURRENT_SIGNING_KEY=from-upstash-qstash
QSTASH_NEXT_SIGNING_KEY=from-upstash-qstash
UPSTASH_REDIS_REST_URL=from-upstash-redis
UPSTASH_REDIS_REST_TOKEN=from-upstash-redis
WEB_PUSH_ALLOWED_ORIGINS=https://additional-provider.example
```

`WEB_PUSH_ALLOWED_ORIGINS` is optional. Without it, the backend permits the HTTPS origins for Firebase Cloud Messaging, Mozilla Push, and Apple Push. Extra entries must be HTTPS origins without credentials, ports, paths, queries, fragments, local hosts, or IP literals. `PUBLIC_APP_URL` must be a safe HTTPS root origin outside local development.

Generate VAPID keys locally once with `npx web-push generate-vapid-keys`, retain the private key server-side, and redeploy after changing credentials.

## Storage model and retention

| Purpose | Redis key | Retention |
| --- | --- | --- |
| Installation authorization, subscription, lifecycle, and deletion cursors | `cf:install:{installationId}` | 180 days |
| Installation registry | `cf:installations` | membership removed at completed deletion |
| Scoped timer | `cf:timer:{installationId}:{scopedTimerId}` | 7 days |
| Legacy timer compatibility during deletion | `cf:timer:{notificationId}` | discovered in bounded scans |
| Active workout timer pointer | `cf:active:{installationId}:{workoutId}` | timer lifecycle |
| Per-installation timer/workout/mutation indexes | `cf:timers:{installationId}`, `cf:workouts:{installationId}`, `cf:mutations:{installationId}` | corresponding record lifecycle |
| Workout payload | `cf:workout:{installationId}:{sessionId}` | 90 days |
| Mutation idempotency receipt | `cf:mutation:{installationId}:{mutationId}` | 90 days |
| Bounded deletion work set | `cf:delete:{installationId}:keys` | deletion lifecycle |

Registration returns the bearer secret once. A record in `deleting` or `deleted` state is a tombstone and cannot be reactivated with old credentials. Push responses `404` or `410` invalidate the subscription.

Timer IDs are derived from the installation ID plus the caller's requested ID, so two installations cannot address the same timer key. Every schedule includes a `timerVersion`. Active-pointer, cancellation, delivery, and completion writes check both ownership and version; a stale request receives a conflict instead of changing the replacement timer.

## Scheduling, cancellation, and delivery

1. `POST /api/push/register` validates an allowed push endpoint and creates or refreshes an active installation.
2. `POST /api/push/schedule` writes authoritative Redis state before publishing to QStash. Replacing a workout timer revokes the prior state and claim.
3. QStash calls `/api/push/deliver`. The handler verifies the signature, acquires a short-lived delivery claim, and checks installation state, timer ownership/version, and active pointer.
4. Immediately before Web Push, delivery confirms the same claim and state again. Success, retry, and invalidation updates can commit only while that claim remains current.
5. `POST /api/push/cancel` revokes Redis state and the delivery claim before attempting scheduler cleanup. A QStash deletion failure cannot make the canceled timer authoritative again.

The material race boundary is explicit: once the server has dispatched a Web Push network request, it cannot recall that request. Cancellation or deletion still revokes the Redis claim, so the request cannot commit success, schedule a retry, or resurrect timer state. User-facing copy and tests must not promise perfect recall after dispatch.

Only allowlisted HTTPS push origins may be registered or delivered. Timer state, installation lifecycle, and version checks are deterministic safety/security controls; QStash and Web Push availability remain external operational dependencies.

## Installation deletion

`POST` or `DELETE /api/install/delete` immediately moves an authorized installation to `deleting`, clears active credentials/subscription use, and begins cleanup. Per-installation registries are scanned in bounded pages; compatibility scans are also capped, and deletion processes a bounded batch per request.

If work remains, the endpoint returns HTTP 202 with `status: "deleting"`, `cleanupTruncated: true`, and `retryable: true`. The caller must repeat the authorized request until HTTP 200 returns `status: "deleted"`. Continuation is idempotent and is not blocked by the initial deletion rate limit. The final 180-day tombstone keeps the installation ID unusable and blanks the subscription endpoint/key material while retaining the secret hash for authorized idempotent status checks. Scheduler cancellation failures are reported separately; Redis revocation remains authoritative.

**PLANNED / NEEDS REVIEW:** accepted frontend code does not yet prove that disabling notifications, clearing local app data, or resetting the app always cancels active timers, unsubscribes the browser, and continues this endpoint to terminal deletion. Do not describe the user-facing deletion lifecycle as complete until those paths and retry/reload behavior are integrated and tested.

## Workout mutation sync

`POST /api/sync/workout` is installation-authorized and write-only. It enforces a 256 KiB request limit, at most 100 exercises and 1,000 sets, referential consistency, and bounded identifiers. Mutation IDs provide idempotency. A repeated revision with different content returns a conflict, a stale revision cannot overwrite newer data, and a deleting/deleted installation is rejected. Payloads and mutation receipts expire after 90 days.

This is not cloud history, backup recovery, or multi-device continuity. There is no read/restore endpoint, account ownership model, or verified restore UI. Exported local app backups remain the only implemented user-managed restore source.

## Verification

Repository verification should include the backend security/race tests, public privacy scan, workflow validator, public test gate, and release gate. Exact commands are maintained in `package.json`; the principal entry points are `npm test`, `npm run check:public`, and `npm run release:verify`.

External verification is separate and must be dated. Confirm environment configuration without printing values, `GET /api/push/config`, registration and test delivery, schedule/replace/cancel races, resumable deletion, Redis/QStash cleanup, and physical iPhone lock-screen behavior. Desktop emulation cannot validate iOS installation, suspension, Focus/Silent Mode, or delivery timing. Never place credentials, subscription endpoints, bearer secrets, or workout payloads in a work log.

## Dated operational observation

Repository history records that production was configured and smoke-tested on 2026-07-11. That is a historical observation, not proof of current service state, plan limits, billing, region, readiness, or device behavior. Reverify external status before making a release claim; do not create or upgrade a paid service without authorization.
