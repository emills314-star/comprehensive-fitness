# Full feature test matrix

## Shared public synthetic fixtures

| ID | Fixture |
| --- | --- |
| F0 | Empty first-run state |
| F1 | Small coherent templates/history dataset |
| F2 | Four-day guided plan with equipment/scope variants |
| F3 | Active workout covering all resistance types and readiness states |
| F4 | Large history: 1,000 sessions/10,000 sets, boundary dates, long labels |
| F5 | Legacy taxonomy, units, snapshots, duplicates, and orphan references |
| F6 | Malformed, oversized, and hostile backup JSON |
| F7 | Valid/invalid/duplicate Strong CSV |
| F8 | Synthetic aggregate-evidence package containing no personal records |
| F9 | Fake push/sync identities with mocked Redis/QStash |
| F10 | Public PWA asset/cache/update fixture |
| F11 | Miniature public research database with complete aliases/maps |
| F12 | Synthetic workout/wearable/nutrition/body-composition pipeline inputs |
| F13 | Native packaging tree with private-file sentinels |

## Per-feature assignments

`FT-nn-C` uses the critical feature-test profile; `FT-nn-S` uses the standard profile. Every result receives a separate `IR-nn` independent-review turn.

| # | Feature and source boundary | Core happy/boundary/error cases | Specialist coverage | Fixture / turns |
| ---: | --- | --- | --- | --- |
| 1 | Five-tab shell, `primaryTabIds`, `render`, `setActiveTab` | Navigate/hash/theme/unit; reload/deep link/repeated tab; unknown hash/storage/render failure | Route focus/skip/current announcement; responsive/dark/zoom; transition timing; query privacy | F0/F1/F4 Ã‚Â· FT-01-S Ã‚Â· IR-01 |
| 2 | Lift overview/quick start | Start/resume; empty/long labels/active conflict; missing template/engine unavailable/cancel | Protected visual/behavior, button semantics, readiness/prescription agreement, large render | F0/F1/F3/F4 Ã‚Â· FT-02-C Ã‚Â· IR-02 |
| 3 | Template CRUD/start | Create/edit/duplicate/delete/start/save; 0/1/many exercises and max sets; invalid/cancel/storage error | Escaping, planned intent/resistance persistence, disclosure focus/mobile, progressive render | F0/F1/F4 Ã‚Â· FT-03-S Ã‚Â· IR-03 |
| 4 | Guided GuideÃ¢â€ â€™SetupÃ¢â€ â€™BuildÃ¢â€ â€™CheckÃ¢â€ â€™Create | 1Ã¢â‚¬â€œ7 days, 2Ã¢â‚¬â€œ12 weeks, all/restricted scope; blockers/stale viability/idempotent retry | Taxonomy/equipment/time/scope invariants, volume/frequency property tests, keyboard/mobile/science | F2/F4/F5/F11 Ã‚Â· FT-04-C Ã‚Â· IR-04 |
| 5 | Legacy automatic mesocycle compatibility | Deserialize/view every version/lifecycle; missing/corrupt references; explicit unreachable classification | Historical immutability, no false reachability claims, archive performance | F5 Ã‚Â· FT-05-C Ã‚Â· IR-05 |
| 6 | Available Equipment | All/specific selection; AND/OR requirements; unknown legacy values and impossible candidates | Persisted aliases; no unavailable candidates/substitutes; named group/touch/wrap | F2/F5/F11 Ã‚Â· FT-06-C Ã‚Â· IR-06 |
| 7 | Muscle Group Scope | All/subset/empty; every canonical/family collision; legacy/unmapped/unavailable | Exact scope precedence, no family double count, omissions, named group/responsive | F2/F5/F11 Ã‚Â· FT-07-C Ã‚Â· IR-07 |
| 8 | Readiness/start preview | Valid/missing/conflicting/correlated inputs; illness/pain/invalid/engine unavailable | Health-data privacy, no fabricated inference, deterministic hold/substitute, dialog focus | F3 Ã‚Â· FT-08-C Ã‚Â· IR-08 |
| 9 | Active workout editing | Create/add/remove/reorder/replace/save/cancel; first/last/empty/concurrent; interrupted save/start | Single-active/draft recovery, hard constraints, contextual names/focus/mobile/large render | F1/F3/F4 Ã‚Â· FT-09-C Ã‚Â· IR-09 |
| 10 | Set logging/completion | Every resistance/set type; min/max values; complete/skip/undo/duplicate; invalid/double click/retry | History migration, progression evidence, contextual live names, 10k-set indexing | F3/F4/F5 Ã‚Â· FT-10-C Ã‚Â· IR-10 |
| 11 | Custom exercises | Create/edit/delete/use; duplicate/case/alias; blank/hostile/unknown metadata | Saved references, escaping, explicit custom-only fallback, equipment fail-closed, long names | F1/F4/F5/F11 Ã‚Â· FT-11-C Ã‚Â· IR-11 |
| 12 | Plate/resistance models | External/bodyweight/added/assisted/duration/distance; increments and unit round trip; invalid plates/values | Less assistance is progress, model comparability, labelled calculator, conversion properties | F3/F5 Ã‚Â· FT-12-C Ã‚Â· IR-12 |
| 13 | Unified prescription | Generate/store/reopen/explain across goals/experience/constraints/sparse/stale/conflict; engine failure | Immutable versions/checksum, explicit vs inferred data, golden/property/invariant/counterfactual/determinism, latency | F1Ã¢â‚¬â€œF5/F8/F11 Ã‚Â· FT-13-C Ã‚Â· IR-13 |
| 14 | Manual override | Valid ordinary override; repeated/bounds; unknown/incoherent/hard-safety weakening | Append-only audit/outcome, safe substitute only, locked/error focus/mobile disclosure | F3/F11 Ã‚Â· FT-14-C Ã‚Â· IR-14 |
| 15 | Rest lifecycle | Start/pause/complete/dismiss/return; exact expiry/background/last set; duplicate/reload/cancel/wake-lock denial | Runtime restore, private detail, live timing, reduced motion, timer-storm performance, device | F3/F9 Ã‚Â· FT-15-S Ã‚Â· IR-15 |
| 16 | Web Push alerts | Register/schedule/deliver/cancel/test; permissions/token/duplicate; offline/retry/revoke/delete | Auth/quotas/TTL/minimal payload/separate sync consent, permission UX, mocked API + device | F9 Ã‚Â· FT-16-C Ã‚Â· IR-16 |
| 17 | Submission/grade/PR/summary | ConfirmÃ¢â€ â€™submitÃ¢â€ â€™summary; partial/skipped/deload/resistance variants; double/cancel/save failure | Exactly-once history, sync consent, coherent grading/PR, focus/live/mobile/large workout | F3/F4 Ã‚Â· FT-17-C Ã‚Â· IR-17 |
| 18 | History/edit transaction | View/edit/save/cancel; oldest/newest/legacy/mixed unit; invalid/interrupted/rollback | Atomic replacement/cache invalidation, escaping, future recommendation effects, long/large history | F4/F5 Ã‚Â· FT-18-C Ã‚Â· IR-18 |
| 19 | Dashboard | Volume/fatigue/detail; week/date/empty/large/legacy; unmapped/invalid/evidence unavailable | Canonical credits/deload filtering, protected visual/a11y/zoom, finite traceable totals, aggregation budget | F0/F4/F5/F11 Ã‚Â· FT-19-C Ã‚Â· IR-19 |
| 20 | Charts/expectations/points | Exercise/period/point; no/one/many/mixed/date edges; invalid/unmapped/empty | Comparable-set correctness, textual chart alternative, keyboard points/mobile labels/query timing | F0/F4/F5 Ã‚Â· FT-20-S Ã‚Â· IR-20 |
| 21 | Search/filter/options | Exact/partial/case/alias/combined; no result/ties/legacy/long; malformed query | Escaping, canonical/equipment/scope constraints, keyboard names/count announcements, 10k options | F4/F5/F11 Ã‚Â· FT-21-S Ã‚Â· IR-21 |
| 22 | Backup JSON | Round trip/legacy/duplicate/idempotent; malformed/oversized/invalid refs/partial read | Transaction/rollback/counts, stored-XSS/prototype pollution, snapshot checksums, size/memory | F0/F5/F6 Ã‚Â· FT-22-C Ã‚Â· IR-22 |
| 23 | Strong CSV | Import/counts/templates; units/quotes/roles/duplicates/old dates; invalid/missing/partial/rollback | External-ID idempotency, raw retention, formula/HTML safety, taxonomy/resistance, 100k rows | F7 Ã‚Â· FT-23-C Ã‚Â· IR-23 |
| 24 | Aggregate evidence import | Valid initialization; sparse/stale/version/crosswalk; missing/invalid/research unavailable | Private/public/cache/log boundary, source weighting, one research fetch, large package timing | F8/F11 Ã‚Â· FT-24-C Ã‚Â· IR-24 |
| 25 | Clear local data | Review/typed confirm/complete; empty/active/queued; cancel/wrong phrase/partial cleanup | Store/cache/queue reconciliation, remote revoke/delete, export-first, dialog focus/cleanup duration | F0/F3/F4/F9 Ã‚Â· FT-25-C Ã‚Â· IR-25 |
| 26 | Offline/install/update | Install/cache/offline/start/update; first/return/deep link/update-active; missing/corrupt/timeout | Draft preservation, public allowlist, offline banner, cache size/startup, installed PWA | F10/F13 Ã‚Â· FT-26-C Ã‚Â· IR-26 |
| 27 | Workout mutation sync | Explicit-consent queue/flush; duplicate/reordered/concurrent; default-off/offline/auth/error/retry | Durable idempotency/conflict/TTL/delete, separate consent, status/error a11y, queue latency | F3/F9 Ã‚Â· FT-27-C Ã‚Â· IR-27 |
| 28 | Privacy/Support | Local/hosted/back; responsive/zoom/offline; broken asset/link | Content matches sync/retention/deletion and non-medical scope; landmarks/contrast/keyboard | F0/F10 Ã‚Â· FT-28-S Ã‚Â· IR-28 |
| 29 | Research DB build/validation | SourceÃ¢â€ â€™all exports; every vocabulary/table/alias/map; duplicate/orphan/hash/version/rollback | Stable IDs/determinism/counts, public-only, citations/uncertainty/policy labels, build size/time | F11 Ã‚Â· FT-29-C Ã‚Â· IR-29 |
| 30 | Private normalization/analysis | Synthetic inputsÃ¢â€ â€™outputs; duplicate/missing/unit/timezone/alias; malformed/partial/restart | Stable IDs/counts/reproducibility, publication privacy, fact/inference distinction, large runtime | F12 Ã‚Â· FT-30-C Ã‚Â· IR-30 |
| 31 | Capacitor packaging | Public syncÃ¢â€ â€™native; clean/stale/debug/release/safe area; missing/signing/sync mismatch | Data upgrade, no private sentinel, backup/provider scope, engine parity, native a11y/startup/device | F10/F13 Ã‚Â· FT-31-C Ã‚Â· IR-31 |

## Pairwise axes

Use pairwise generation instead of multiplying every combination:

- viewport: small mobile, large mobile, desktop;
- theme/unit: light/dark Ãƒâ€” lb/kg;
- data: empty, normal, large, legacy;
- network: online, offline, timeout/server failure;
- lifecycle: draft, active, submitted, archived;
- evidence: absent, valid, stale/conflicting;
- constraints: all, restricted, impossible;
- input: missing, valid boundary, invalid/hostile.

## Cross-feature properties and invariants

- ImportÃ¢â€ â€™exportÃ¢â€ â€™import preserves allowed facts, IDs, and counts.
- Unit conversion round-trips within defined increment tolerance.
- Canonical normalization is idempotent; every public name/alias maps exactly once.
- Foreign keys remain valid and IDs unique after retry/import/migration.
- Only submitted workouts affect canonical history/analytics.
- Equipment, exclusion, scope, time, and hard-safety constraints cannot be bypassed.
- Same normalized input produces the same recommendation and identifier.
- Historical snapshots are never silently rewritten.
- Volume/fatigue values remain finite, nonnegative, and traceable to eligible sets.
- Queue, submission, import, and template generation retries are idempotent.
- Public builds/caches/native packages contain no private-path sentinel.
- Untrusted text cannot create executable DOM attributes.
- Dataset growth does not change semantic results and stays inside documented complexity budgets.

Physical lock-screen notification behavior, native signing/device accessibility, live service latency, and production deployment remain external **NEEDS REVIEW** surfaces; synthetic fixtures verify repository contracts without using personal data.
