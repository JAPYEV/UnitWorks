# UnitWorks: Phase 3 demonstration and defense readiness

Updated October 26, 2026 (Asia/Manila). Backup/storage investigation is stopped
at the user's request. This checklist concerns algorithm correctness and its
existing frontend integration only. Phase 2 recovery evidence stays pending;
no live database audit, modification, migration or deployment was performed.

## Completed and verified in this follow-up

- [x] Inspect the current backtracking, DP and greedy implementations and their
  independent reference fixtures before changing code.
- [x] Preserve the original algorithms, 11 compatibility rules, permissions,
  existing styling and server/database responsibilities.
- [x] Reproduce decimal-demand ceiling errors, floating budget remainders and
  whole-peso labels before fixing them.
- [x] Fix exact target/reorder calculations; verify 495 hundredth-demand/day
  combinations against independent integer arithmetic.
- [x] Keep DP remaining/sub-budget amounts and displayed currency cent-accurate.
- [x] Distinguish node-limited searches from proven exhaustive infeasibility in
  results and notifications; remove Analysis's default dependency on a seed CPU.
- [x] Carry alternative-specific inputs from the optimizer to the selected save
  action; omit unsupported sub-minimum lower-cost alternatives.
- [x] Mark recommendations as using previous requirements after inputs change.
- [x] Test actual rendered API results, including names/prices/score/traces,
  unknown/unreachable DP cells, snapshot precedence and staff save denial.
- [x] Backend regression suite: 127 passed / 0 failed, using disposable PGlite.
- [x] Final frontend integration suite: 11 passed / 0 failed, no production env.
- [x] Production frontend build passes. Existing chunk-size warning remains.
- [x] Execute the fixture benchmark and retain operation-count evidence in the
  Phase 3 correctness report. Do not interpret timing as a complexity proof.

## Browser acceptance — October 26, 2026

- [x] Actual browser click-through at 1366×900 and 375×812, using the real App,
  pages, API client and Express authorization against disposable in-memory PGlite.
- [x] All six pages navigated at both widths. Mobile drawer opens/closes;
  inventory uses cards/expandable filters; builder specification dialog works;
  optimizer alternatives use cards; Analysis tables remain within scroll areas.
  Loaded phone pages measured 365 px document width within a 375 px viewport.
- [x] Generate Gaming/70000, change to 50000 and observe previous-requirements
  warning; return to 70000, choose alternatives and transfer into PC Builder.
  Desktop productivity build: 69850, 8 parts, 11 passing rules. Phone lower-cost
  transfer: 55700, 8 parts. These were mouse-driven browser checks at phone width,
  not physical touchscreen/device testing. Tablet widths were not rechecked.
- [x] Desktop search/trace, inventory search (Ryzen → four products), detail dialog,
  zero-budget restock and all three Analysis tabs checked. Phone filters, dialog,
  alternative cards and all three Analysis tabs checked with loaded results.
- [x] Four actual Save-this-configuration clicks as fixture admin. SQL-backed
  evidence matched every selected component, eight line prices, total, budget
  and priorities. Reloading through role switch retained the four saved builds.
- [x] Fixture staff can recommend/search; optimizer/build saves, inventory add/edit/
  stock controls and restock save/receive controls absent. Separate direct HTTP
  staff-save attempt returned 403, left four runs unchanged; anonymous inventory
  returned 401. See [sanitized save evidence](PHASE3_BROWSER_SAVE_EVIDENCE.json).
- [x] Reproduced stale builder search after another optimizer build was loaded.
  Added a previous-input warning keyed to locks/budget/stock filter. Browser
  verified warning appears after edits and clears after rerun; regression covers
  changed locks, valid/invalid budgets, stock filter and old cached state.
- [x] Rehearsed AM4/AM5 rejection: 2 assignments, 1 check, 1 prune, 0 solutions;
  unrestricted search capped at 12 (23 assignments/29 checks); impossible 1000
  budget fully exhausted (7 assignments/7 budget prunes); greedy 600000/7 days
  funded 5 products including one partial, 599160 spent, 840 left. Zero budget
  funded none and skipped all 25 candidates.
- [x] Browser console captured no warnings/errors during the final click-through.
- [x] Selected the existing controlled 44-product illustrative seed catalog and
  documented a repeatable reset/start plan in the [defense runbook](PHASE3_DEFENSE_RUNBOOK.md).

This rehearsal does **not** validate live Supabase login, session restoration or
hosted token refresh: the test entry replaces only identity acquisition with
locally signed fixture identities. Actual API token verification, database role
lookup and permission enforcement still run. Production authentication code and
credentials were unchanged. No live requests or live writes were performed.

## Automated verification after the browser defect fix

- `npm test`: 127 backend + 11 frontend tests passed, zero failures. Backend
  duration 63279.7107 ms; frontend duration 9535.7728 ms in the full run. This
  includes isolated database regressions; no live Phase 2 audit was repeated.
- Final frontend rerun after the invalid-budget assertion: see
  [raw test output](PHASE3_FRONTEND_TEST_OUTPUT.txt).
- Final production build: see [raw build output](PHASE3_BUILD_OUTPUT.txt).
  Existing >500 kB warning remains; no new dependency or algorithm change.
- Rendering/API tests are automated; the browser actions above are separately
  observed manual interaction evidence, not a new automated end-to-end suite.

## Remaining work and readiness decision

**Ready for a controlled algorithm defense using the isolated runbook.** No
reproduced algorithm/browser blocker remains in that scope. Before presenting,
start a fresh fixture and confirm the projector/browser and viewport on the
actual presentation machine. That machine, physical touch input and tablet
width were not verified here. Synthetic edge cases in the table below remain
supported by automated fixtures unless explicitly listed as browser-rehearsed.

Production release readiness is a separate decision: live Supabase session
flows were not revalidated here, and missing Phase 2 recovery evidence remains
pending. Full hosted Supabase disaster recovery/cutover remains untested.

## Defense scenarios and the expected explanation

| Scenario | Expected result / what to explain |
| --- | --- |
| AM4 CPU plus AM5 board | Socket conflict; branch rejected when both parts are known |
| CPU without integrated graphics, virtual GPU | Display rule fails; a real GPU is required |
| Unknown GPU length | Unverified clearance, never assumed compatible |
| Zero-stock locked CPU with stock-only search | No eligible solutions; lock cannot bypass stock filtering |
| Synthetic one-node cap | Search incomplete, not a proof of incompatibility |
| Impossible fully explored budget | Exhaustive empty result; no eligible compatible build within the limit |
| Demo Gaming budget 70000 | Fixture benchmark returns 69750, score 76.98; additive illustrative weights |
| Synthetic actual price fits but rounded groups do not | Explain conservative rounding, not hardware incompatibility |
| Alternative selected and saved in disposable data | Alternative-specific priorities/budget are submitted; server recomputes current inventory |
| Demand .28 per day over 25 days | Exactly 7 units before minimum stock; no floating-point phantom unit |
| Restock zero budget or MOQ unaffordable | Skipped lines with reasons; never overspend |
| Partial restock order | Largest affordable quantity meeting MOQ; MOQ is a minimum, not a pack multiple |
| 2000 reorder candidates | Main greedy plan runs; optional reference omitted by resource guard |

## Claims and limitations to state accurately

- **Backtracking:** explores assignments with early compatibility/budget pruning.
  Default 12-solution / 40000-node caps limit completeness. Price-sorting the
  found solutions does not make them the globally cheapest K configurations.
- **DP:** maximizes the additive objective in the rounded-cost domain. It is
  exact for aligned prices under the implemented rules; arbitrary cent prices
  can lose feasible/high-scoring builds through rounding. Lean mode optimizes
  score minus a spend penalty, not pure score alone.
- **Greedy:** urgency-first allocation with explainable full/partial/skipped
  decisions. It is not globally optimal. The rounded full-order knapsack is a
  different comparison domain, not proof of a real-world optimality gap.
- **Complexity:** distinguish candidate preparation, traversal/DP work and retained
  result/trace storage. Operation counts and one timing are different evidence.
  DP/GPU-pair growth can still be expensive for catalogs much larger than the
  demonstration fixtures; no background job system was introduced.
- **Hardware model:** BIOS versions, memory QVLs, detailed radiator placement,
  bottlenecks and real adapter availability are not verified by these 11 rules.
- **Persistence:** saved builds are historical configurations, not stock reservations.
  Saving recomputes the selected inputs using current inventory. Receiving a plan
  changes stock and is reserved for an isolated demo or an intentional real action.
- **Security:** admin/staff enforcement remains on the API; test tokens are
  generated locally and never accepted by the production project's verifier.
- **Recovery:** full hosted Supabase disaster recovery remains untested. Phase 3
  correctness evidence does not close the missing Phase 2 backup-evidence item.

## Reproduce verification

From the UnitWorks root:

```powershell
npm test
npm run build
npm --prefix Backend run bench:algorithms
```

The test suites initialize fresh in-memory databases and signed fixture sessions.
They do not load Backend/.env. Frontend tests disable Vite env-file loading.
The build uses the existing frontend configuration; never commit real env files.
No extra dependencies were added for this follow-up. No new hosted deployment,
backup, database schema or authentication mode is needed for these checks.

## Final clean-start check and screenshots

The documented demo command was stopped and restarted successfully after the
fixture API pin was added. Fresh evidence reported zero saved runs, 44 catalog
products and no fixture ledger differences; a real browser compatibility search
worked again. Previous save evidence remains retained in the JSON, not in the
newly reset database. The fixture uses its local auth-context module and API.
The API pin was verified in Vite dev-mode env initialization, which retains the
property access rather than replacing its expression directly. An initial check
incorrectly expected direct expression replacement and was corrected.

Screenshots: [phone alternative](phase3-evidence/unitworks-mobile.png) and
[previous-search warning](phase3-evidence/unitworks-stale-search.png). These show
only illustrative fixture data. The current fixture can be stopped with Ctrl+C.
