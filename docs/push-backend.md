# Rest Notification and Workout Sync Backend

## Status and boundary

- **Last code review:** 2026-07-14, including frontend privacy/lifecycle integration
- **Backend contract:** **IMPLEMENTED** in `api/`
- **Frontend lifecycle:** **PARTIALLY IMPLEMENTED** for cancel/schedule reconciliation, epoch-guarded workout-upload consent, explicit resumable installation deletion, and local-clear retention guards; automatic remote deletion across every ordinary disable/reset/clear path remains **NEEDS REVIEW**
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
| Installation authorization, subscription, lifecycle, and deletion cursors | `cf:install:{installationId}` | rolling 180-day hash TTL; deletion continuation refreshes the tombstone TTL |
| Global installation registry | `cf:installations` | no key/member TTL; membership is removed at completed deletion |
| Scoped timer | `cf:timer:{installationId}:{scopedTimerId}` | 7 days |
| Legacy timer compatibility during deletion | `cf:timer:{notificationId}` | discovered in bounded scans |
| Active workout timer pointer | `cf:active:{installationId}:{workoutId}` | timer lifecycle |
| Per-installation timer/workout/mutation indexes | `cf:timers:{installationId}`, `cf:workouts:{installationId}`, `cf:mutations:{installationId}` | corresponding record lifecycle |
| Workout payload | `cf:workout:{installationId}:{sessionId}` | 90 days |
| Mutation idempotency receipt | `cf:mutation:{installationId}:{mutationId}` | 90 days |
| Bounded deletion work set | `cf:delete:{installationId}:keys` | deletion lifecycle |

Registration returns the bearer secret once. Supported installation updates refresh the 180-day record TTL. A record in `deleting` or `deleted` state is a tombstone and cannot be reactivated with old credentials. Push responses `404` or `410` invalidate the subscription. Expiration of an installation hash does not itself remove its ID from the global registry; completed deletion does.

Timer IDs are derived from the installation ID plus the caller's requested ID, so two installations cannot address the same timer key. Every schedule includes a `timerVersion`. Active-pointer, cancellation, delivery, and completion writes check both ownership and version; a stale request receives a conflict instead of changing the replacement timer.

The frontend sends the exact `timerVersion` in immediate and queued cancellation requests. Its pending-cancel queue deduplicates only the same notification/version pair. Transient/network and authorization/ownership failures retain a durable cancellation and are not reported as confirmed; stale-version or revoked-installation responses are terminal for that timer. Service-worker cache version 33 records cancellation by composite ID/version and tests both payload `notificationId` and client `timerId`; legacy payloads default to version 1, so canceling version 1 cannot suppress a later version 2 notification with the same requested ID. API and sensitive private/backup/export paths are never satisfied from the offline cache.

## Scheduling, cancellation, and delivery

1. `POST /api/push/register` validates an allowed push endpoint and creates or refreshes an active installation.
2. `POST /api/push/schedule` writes authoritative Redis state before publishing to QStash. Replacing a workout timer revokes the prior state and claim.
3. QStash calls `/api/push/deliver`. The handler verifies the signature, acquires a short-lived delivery claim, and checks installation state, timer ownership/version, and active pointer.
4. Immediately before Web Push, delivery confirms the same claim and state again. Success, retry, and invalidation updates can commit only while that claim remains current.
5. `POST /api/push/cancel` revokes Redis state and the delivery claim before attempting scheduler cleanup. A QStash deletion failure cannot make the canceled timer authoritative again.

The client also closes the schedule-response race. It records the client timer ID/version as canceled before awaiting any in-flight schedule. A later successful schedule response is reconciled to its authoritative server notification ID and canceled immediately. If the schedule outcome is ambiguous, the client durably queues cancellation under the client ID/version instead of claiming success; the cancel endpoint resolves that client ID against the stored timer.

The material race boundary is explicit: once the server has dispatched a Web Push network request, it cannot recall that request. Cancellation or deletion still revokes the Redis claim, so the request cannot commit success, schedule a retry, or resurrect timer state. User-facing copy and tests must not promise perfect recall after dispatch.

Only allowlisted HTTPS push origins may be registered or delivered. Timer state, installation lifecycle, and version checks are deterministic safety/security controls; QStash and Web Push availability remain external operational dependencies.

## Installation deletion

`POST` or `DELETE /api/install/delete` immediately moves an authorized installation to `deleting`, clears active credentials/subscription use, and begins cleanup. Per-installation registries are scanned in bounded pages; compatibility scans are also capped, and deletion processes a bounded batch per request.

If work remains, the endpoint returns HTTP 202 with `status: "deleting"`, `cleanupTruncated: true`, and `retryable: true`. The caller must repeat the authorized request until HTTP 200 returns `status: "deleted"`. Continuation is idempotent and is not blocked by the initial deletion rate limit. The final 180-day tombstone keeps the installation ID unusable and blanks the subscription endpoint/key material while retaining the secret hash for authorized idempotent status checks. Scheduler cancellation failures are reported separately; Redis revocation remains authoritative.

The Settings Danger Zone starts this endpoint explicitly and renders its state. The client keeps the exact installation ID, device ID, and bearer token during `deleting`, follows HTTP 202, honors numeric or HTTP-date `Retry-After`, prevents overlapping continuations, and resumes after reload or an `online` event. On startup it compares IndexedDB with the localStorage failed-write journal rather than treating a null/stale IndexedDB read as authoritative. Pending deletion with a bearer wins over a different ordinary/generated identity; for the same installation, a strictly newer terminal deletion wins so stale fallback data cannot resurrect authorization. The selected state is successfully written to IndexedDB before the journal is removed. Only terminal `deleted` clears the local token and workout-sync queue. Network, HTTP 429, and 5xx failures remain retryable; HTTP 401/403 remains visible for manual retry instead of erasing the credential prematurely. Local clearing is disabled during deleting/retry/error states. It also awaits authenticated active-timer cancellation and preserves IndexedDB, bearer, timer, and durable cancellation state when cancellation cannot be confirmed.

**PARTIALLY IMPLEMENTED / NEEDS REVIEW:** explicit remote deletion, retry/reload behavior, active-timer cancellation, consent revocation, and terminal installation deletion before confirmed local clear are integrated and tested locally. Local clearing pauses offline or on incomplete cleanup rather than discarding the bearer. Notification-disable orchestration and the irreducible already-dispatched Web Push boundary still require qualified product interpretation.

## Workout mutation sync

`POST /api/sync/workout` is installation-authorized and write-only. It enforces a 256 KiB request limit, at most 100 exercises and 1,000 sets, referential consistency, and bounded identifiers. Mutation IDs provide idempotency. A repeated revision with different content returns a conflict, a stale revision cannot overwrite newer data, and a deleting/deleted installation is rejected. Payloads and mutation receipts expire after 90 days.

The frontend requires a separate persisted `cloudWorkoutSyncConsent` value that defaults to `false`. Notification enrollment never sets it. Enabling becomes locally active only after installation authorization and server consent succeed. Each transition advances a consent epoch synchronously; queue work and uploads recheck that epoch around asynchronous reads, writes, timers, and requests. Revocation clears the delay, aborts active fetches, waits for stale operations, durably empties the queue, and calls server consent revocation to delete retained workout/mutation keys. Offline or failed revocation is persisted for retry.

This is not cloud history, backup recovery, or multi-device continuity. There is no read/restore endpoint, account ownership model, or verified restore UI. Exported local app backups remain the only implemented user-managed restore source.

## Verification

Repository verification should include the backend security/race tests, public privacy scan, workflow validator, public test gate, and release gate. Exact commands are maintained in `package.json`; the principal entry points are `npm test`, `npm run check:public`, and `npm run release:verify`.

External verification is separate and must be dated. Confirm environment configuration without printing values, `GET /api/push/config`, registration and test delivery, schedule/replace/cancel races, resumable deletion, Redis/QStash cleanup, and physical iPhone lock-screen behavior. Desktop emulation cannot validate iOS installation, suspension, Focus/Silent Mode, or delivery timing. Never place credentials, subscription endpoints, bearer secrets, or workout payloads in a work log.

## Dated operational observation

Repository history records that production was configured and smoke-tested on 2026-07-11. That is a historical observation, not proof of current service state, plan limits, billing, region, readiness, or device behavior. Reverify external status before making a release claim; do not create or upgrade a paid service without authorization.
