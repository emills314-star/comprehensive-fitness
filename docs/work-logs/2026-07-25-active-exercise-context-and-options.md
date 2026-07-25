# Active exercise context and Exercise options session updates

## Change

- Previous now opens the exact matching exercise in the submitted source session.
- Return to active session restores the originating exercise in the active workout.
- Shared Exercise defaults supersede a previously active individual-set plan when a shared field is edited; a later individual-row edit makes the per-set plan authoritative again.
- Applying defaults updates the owning active session timestamp and both the exercise-local and top-level override ledgers while leaving submitted history and completed work unchanged.

## Evidence

- Files changed: application foundation/view/workout/interaction segments, service-worker cache, focused static/browser tests, synchronized public/native assets, and governing documentation.
- Documentation updated: `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/UI_UX.md`, `docs/ROADMAP.md`, and this log.
- Focused validation: the active-return/static contracts passed; the new Playwright regression and the existing advanced individual-set/no-guidance cases passed 6/6 across mobile and desktop.
- Broader validation: 48/50 public harnesses passed in the sandbox; the two read-only Git subprocess checks then passed with the required permission. Static lint, tracked-content privacy review, `sync:web`, Capacitor synchronization, and PWA/native parity all passed.
- PWA delivery: cache generation advanced to `comprehensive-fitness-pwa-v68`.

## Expected result

Activating Previous from any active exercise lands on that same exercise’s comparable submitted record. Returning lands on the originating active exercise. Applying shared or individual Exercise options updates only the current active session according to the most recently edited surface, persists through reload, and retains completed/submitted records unchanged.

## Status

**IMPLEMENTED LOCALLY — NOT HOSTED-VERIFIED:** local behavior, persistence, regression, documentation, privacy, and public/native packaging checks pass. Hosted deployment verification is not yet claimed.
