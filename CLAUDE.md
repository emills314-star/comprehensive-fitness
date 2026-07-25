# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Start here

`AGENTS.md` is the binding working agreement for coding agents in this repo — read it before changing code. It defines the mandatory documentation loop, the publishing policy, the privacy review required before every commit, and the status labels (`IMPLEMENTED` / `PARTIALLY IMPLEMENTED` / `PLANNED` / `ASSUMPTION` / `NEEDS REVIEW`) that must be preserved in docs.

The living documents in `docs/` are authoritative for intent; code proves only current behavior. Route changes to the right doc:

| Change | Document |
| --- | --- |
| Product scope / capability | `docs/PROJECT.md` |
| Architecture, persistence, integrations, models | `docs/ARCHITECTURE.md` |
| Readiness, progression, fatigue, volume, scoring | `docs/DECISION_ENGINE.md` |
| Screens, navigation, state, copy, interaction | `docs/UI_UX.md` |
| Status, priority, defects, debt, open questions | `docs/ROADMAP.md` |

An application change that does not update its governing document is incomplete.

## Commands

Node 22.23.x / npm 10.9.x (see `engines`). Dev server: `npm run dev`.

Verification suites (composed in `scripts/run-check-suite.js`):

```bash
npm test              # public test gate (auto-discovers scripts/test-*.js)
npm run check:public  # lint, workflows, privacy, dep audits, tests, research validation, PWA verify
npm run test:all-local # public + private (private needs the local personal-data pipeline)
npm run release:verify # clean-source check, check:public, Playwright UI audit
```

Run a single test directly — every test is a dependency-free Node script:

```bash
node scripts/test-prescription-engine.js
```

`npm run test:public` discovers `scripts/test-*.js` automatically and sets `CF_PUBLIC_CHECKOUT=1`; `scripts/test-personal-fitness-data.js` is excluded because it needs git-ignored personal artifacts. A new `scripts/test-*.js` file joins the gate with no registration step.

Other gates: `npm run lint` (`scripts/lint-static.js`, not ESLint), `npm run audit:ui` (Playwright + axe), `npm run verify:pwa`, `npm run check:privacy`.

## Architecture essentials

Dependency-light static PWA with Capacitor wrappers — **not** a bundled component-framework app. `index.html` is what Vercel serves.

- **Ordered classic scripts.** The runtime is split across `app-foundation.js` → `app-views.js` → `app-analysis.js` → `app-workout.js` → `app-sync.js` → `app-history.js` → `app-import.js` → `app.js`. These intentionally share the browser global lexical environment, and **their load order is a tested dependency contract**. Do not convert them to modules or reorder them casually.
- **Engines are UMD modules:** `prescription-engine.js` (taxonomy, eligibility, ranking, research-backed prescriptions), `guided-mesocycle.js` (pure planning layer), `rest-completion-controller.js`.
- **Views are HTML strings; events are delegated** at the root via `data-action` attributes.
- **Persistence:** IndexedDB `comprehensive-fitness` / store `state` / key `app-data` is primary; localStorage holds legacy fallback plus a compact active draft. JSON schemas live in root `schemas/`.
- **API:** CommonJS Vercel Functions under `api/`; Upstash Redis + QStash + VAPID Web Push (`docs/push-backend.md`).

### Two rules that break the installed app if missed

1. **`www/` is generated, not source.** Root web files are editable; run `npm run sync:web` to copy them into `www/` for the Capacitor payload. Never hand-edit `www/`.
2. **Advance `CACHE_NAME` in `sw.js` for any cross-file runtime contract change.** The cache version is also the installed-PWA update signal. Without a bump, a controlled page can pair a new UI with a stale cached engine, and `registration.updatefound` never surfaces the in-app update action.

### Privacy boundary

Personal health data is deliberately outside Git and deployment: `personal_fitness_data/raw|normalized|derived|reports/`, `private-personal-data/`, `www/private-personal-data/`. `.gitignore` and `.vercelignore` are safeguards, not substitutes — inspect `git status` and the staged file list before every commit. Docs describe contracts and aggregate behavior only; never paste real records into them.

The private pipeline lives in `scripts/personal-fitness/` (`npm run personal:build`, `personal:validate`, `build:app-evidence`). The public research database is under `research_database/` (`npm run research:build`, `research:validate`).

## Native packaging

Capacitor 7, app id `com.emills.comprehensivefitness`. After editing the app: `npm install && npm run sync:web && npm run cap:sync`. iOS builds require macOS + Xcode.
