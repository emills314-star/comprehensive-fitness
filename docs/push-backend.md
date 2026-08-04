# Rest notification backend

## Status and boundary

- **Last code review:** 2026-08-01
- **Notification contract:** **IMPLEMENTED LOCALLY**
- **Workout cloud copy:** **REMOVED / HTTP 410**
- **Legacy remote workout cleanup:** **IMPLEMENTED LOCALLY, BOUNDED AND RESUMABLE**
- **Production/device status:** **NEEDS REVIEW**

Comprehensive Fitness can use Web Push for background rest alerts. Foreground timers and the local IndexedDB workout log continue to work when the backend is unavailable.

The product no longer uploads workout/session/exercise/set mutations. `/api/sync/workout` and workout-copy authorization reject new use with HTTP 410. Notification permission does not imply workout upload because there is no current upload capability or setting.

Bounded cleanup remains for legacy workout and mutation keys that may already exist remotely. Installation deletion also remains so the user can revoke notification registration and delete the installation-scoped remote record.

## Services and trust boundaries

- Vercel Functions host `/api/push/*`, `/api/install/delete`, and cleanup-only legacy `/api/sync/consent`.
- Upstash QStash schedules delayed calls to `/api/push/deliver`; delivery verifies the QStash signature.
- Upstash Redis stores installation authorization, push subscription, scoped timer state, deletion cursors, and bounded legacy-cleanup state.
- `web-push` encrypts notification payloads with VAPID.
- There is no account authentication, cloud workout history, cross-device continuity, or restore API.
- Authorization is a random per-installation bearer secret. Redis stores only its hash.

The browser never receives VAPID private keys, QStash signing keys, or Redis credentials.

## Environment variables

Deployment configuration uses:

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

Never print or store values in source, docs, work logs, screenshots, or test artifacts. `WEB_PUSH_ALLOWED_ORIGINS` is optional and accepts only safe HTTPS push-provider origins. `PUBLIC_APP_URL` must be a safe HTTPS root origin outside local development.

## Current storage

| Purpose | Redis key | Retention |
| --- | --- | --- |
| Installation authorization, subscription, lifecycle, and deletion cursor | `cf:install:{installationId}` | rolling 180-day TTL; deletion continuation refreshes the tombstone |
| Global installation registry | `cf:installations` | membership removed at completed deletion |
| Scoped timer | `cf:timer:{installationId}:{scopedTimerId}` | 7 days |
| Legacy timer compatibility during deletion | `cf:timer:{notificationId}` | bounded discovery/cleanup |
| Active timer pointer | `cf:active:{installationId}:{workoutId}` | timer lifecycle |
| Timer index | `cf:timers:{installationId}` | corresponding record lifecycle |
| Bounded deletion work set | `cf:delete:{installationId}:keys` | deletion lifecycle |

Legacy `cf:workout:*`, `cf:mutation:*`, and their per-installation indexes are cleanup inputs only. No current endpoint creates new workout or mutation payloads.

## Scheduling, cancellation, and delivery

1. `/api/push/register` validates an allowed push endpoint and creates or refreshes an active installation.
2. `/api/push/schedule` writes authoritative timer state before publishing to QStash.
3. `/api/push/deliver` verifies the QStash signature, acquires a short-lived claim, and checks installation status, timer identity/version, and active pointer.
4. Delivery confirms the same state again immediately before Web Push.
5. `/api/push/cancel` revokes Redis state and the claim before best-effort scheduler cleanup.

Scheduling transmits only the notification facts needed for the rest alert and return navigation: installation/timer identity, workout/exercise/set identifiers, exercise/upcoming-set label, and completion time. Private message detail changes the visible body but does not remove required routing facts.

The client records cancellation before awaiting an in-flight schedule and reconciles late schedule responses. Ambiguous cancellation remains durably queued rather than being reported as confirmed.

An already-dispatched Web Push network request cannot be recalled. Cancellation and deletion revoke its claim so it cannot commit success, retry, or resurrect state. User-facing copy must not promise perfect recall after dispatch.

## Notification revocation

Disabling notifications:

- disables local notification use;
- unsubscribes the browser where possible;
- calls server revocation when authorized and online;
- retains a retry marker when server revocation cannot be confirmed;
- never deletes local workouts.

Foreground in-app timer behavior remains available when notifications are denied, unsupported, offline, or revoked.

## Installation deletion and legacy cleanup

`/api/install/delete` moves an authorized installation to `deleting`, revokes active delivery use, and processes indexed plus bounded compatibility cleanup.

If cleanup remains, it returns HTTP 202 with a retryable continuation. The client:

- retains the exact installation ID and bearer while deletion is pending;
- honors `Retry-After`;
- prevents overlapping continuations;
- resumes after reload or reconnection;
- clears the local credential only after terminal `deleted`;
- blocks confirmed local clearing while remote cleanup is unresolved, so the required bearer is not orphaned.

The cleanup path removes legacy workout/mutation keys in bounded pages. The cleanup-only `/api/sync/consent` accepts only disable/cleanup requests; enable requests receive HTTP 410.

Local clear-data and remote installation deletion are distinct consequences. Confirmed local clearing must complete required notification cancellation/deletion coordination before it removes local app data.

## Verification

Local verification should include:

- notification registration/config contracts;
- schedule/replace/cancel/version races;
- delivery claims and invalid-subscription behavior;
- offline cancellation/revocation retry;
- resumable installation deletion;
- bounded legacy workout/mutation cleanup;
- rejection of workout-copy authorization and uploads;
- privacy scan and API security checks.

External verification is separate and dated. Confirm current environment configuration without printing values, config response, registration/test delivery, schedule/cancel races, deletion completion, Redis/QStash cleanup, and physical iPhone lock-screen behavior.

Repository state cannot prove current Vercel, Upstash, QStash, Apple/Google push-provider, billing/plan, or physical-device behavior. No external service mutation is authorized by this documentation update.
