# UnitWorks: repeatable algorithm defense rehearsal

Validated October 26, 2026. Use the existing demo seed: 44 products, 8 categories,
376 units initially. Prices, demand, purchasing costs and performance indices
are illustrative educational inputs, not measured market/performance forecasts.
The real hardware names do not imply complete manufacturer verification.

## Start and isolation boundary

From the UnitWorks root, with existing frontend/backend dependencies installed:

```powershell
npm --prefix Frontend run demo:isolated
```

Open `http://127.0.0.1:5188/`. Confirm the green **Isolated rehearsal · temporary
data only** banner. Do not use the production localhost:5173 tab for demo writes.
The script binds only to loopback, creates a fresh in-memory PGlite database,
applies the existing migrations and illustrative seed there, and starts the real
Express application with locally signed test identities. It reads no env files,
rejects an inherited DATABASE_URL, and forces the frontend API base to `/api`.
If DATABASE_URL is inherited, use a fresh terminal without loading production
environment variables; do not alter the production .env files.

The fixture role selector is test scaffolding, not a product login feature.
Supabase identity acquisition is replaced only in this test entry. API JWT
verification, trusted database roles and authorization are real. The production
frontend entry does not import this scaffolding. Do not publish this fixture or
put private records in it: anyone on the same computer can select test admin.
Tokens expire after one hour; restart a rehearsal for fresh tokens.

Stop with Ctrl+C. All database saves disappear on process exit. Restart for a
fresh catalog. Clear the fixture build using **Reset build** and confirm, or
switch the fixture role (which clears only that origin's build draft), then
switch back to Administrator. Reload the page to clear in-memory page state.
Nothing in this reset procedure changes production or its browser origin.

## 1. Backtracking (about three minutes)

1. PC Builder → Reset build if necessary; leave budget empty and stock-only off.
   Run compatibility search. Observe 12 found solutions, 23 partial assignments,
   29 checks and two prunes. Explain the 12-solution cap and the trace. Results
   are sorted only within those found; this is not globally cheapest-K.
2. Enter budget 1000. The previous-input warning should appear. Rerun: seven
   partial assignments/budget prunes, no solutions, exhaustive completion.
   Explain the cheapest-remaining lower bound versus enumerating full builds.
3. Build Optimizer → Gaming, 70000, balanced priorities, default brand/RAM
   preferences, exclude out-of-stock on, lean off. Generate; select Productivity-
   focused; Open in PC Builder. Clear the builder budget if it remains 1000.
4. CPU tab → replace Ryzen 5 7600 with Ryzen 5 5600. Keep ASUS TUF Gaming
   B650M-Plus WiFi. Observe AM4 versus AM5 conflict. Run compatibility search:
   two assignments, one evaluated rule, one prune, zero valid configurations.
   The branch stops as soon as motherboard and CPU establish the contradiction.

Explain worst-case growth as the product of domain sizes, early pruning and
explicit completeness caps. Current timings are observations, not complexity
proofs. Eleven rules omit BIOS/QVL/detailed radiator-placement checks.

## 2. Dynamic programming and saving (about four minutes)

1. Restore the default Gaming/70000 inputs above and generate. Recommended build
   costs 69750, score 76.98 (77.0 displayed), remaining budget 250.
2. Open the DP explanation. Show platform enumeration, compatible GPU/PSU pairs,
   four independent groups and the recurrence. Winning platform has 576 budget
   states; this fixture evaluates 48 platforms and 403910 fitting transitions.
3. Change budget to 50000 to show the previous-requirements warning; restore
   70000. Select each alternative, then Save this configuration as fixture admin.
   Each save recomputes the chosen input against current inventory.

| Configuration | Saved budget | Graphics/processing/memory priorities | Total | Stored own-weight score |
| --- | ---: | --- | ---: | ---: |
| Recommended | 70000 | 3 / 3 / 3 | 69750 | 76.98 |
| Graphics-focused | 70000 | 5 / 2 / 2 | 69750 | 81.43 |
| Productivity-focused | 70000 | 1 / 5 / 5 | 69850 | 77.27 |
| Lower cost | 56000 | 3 / 3 / 3 | 55700 | 67.46 |

Alternative tabs compare suitability using the original customer's weighting:
77.0, 68.6 and 67.5 displayed respectively. The saved run uses its own priorities,
so productivity's stored 77.27 is not the original-weight comparison 68.6.
Graphics-focused happens to select the same parts here; priorities still differ.

Use **Saved-value evidence** to inspect only disposable data; never show real
credentials or production records. The retained JSON records this rehearsal's
actual browser saves, SQL line totals, component equality and denied staff save.
For a fresh run, compare `/__fixture/evidence` runs with recommendations by
budget/priorities, match all eight component IDs and sum the eight unit prices
in cents. Row count should remain unchanged after a forbidden staff save.

Explain conservative 100-peso group rounding and exact platform cents. DP is
optimal in its implemented rounded additive domain; arbitrary cent prices can
lose feasible builds. Lean changes the objective by penalizing spend. Complexity
includes platform/group preparation as documented in Algorithm Analysis, plus
O(P·G·B·K) transitions and O(G·B) table space per platform.

## 3. Greedy restocking (about three minutes)

1. Restock Optimizer → budget 600000, coverage 7 days → Run greedy optimizer.
   There are 25 candidates, 19 not needed. Five funded products include one
   partial; total purchasing cost 599160, unspent 840, 20 skipped.
2. Show selected quantities: RTX 4060 = 16; Kingston NV2 = 22; Ryzen 7800X3D =
   10; Crucial MX500 = 10; RX 7800 XT = 3 of a target 10 (MOQ 2).
   Explain urgency, lead time/demand, integer-cent allocation and why the last
   line is reduced. MOQ is a minimum, not a pack multiple.
3. Change budget to 0 and rerun: no products funded, all 25 candidates skipped,
   cost/remainder zero. Inspect the explicit MOQ-affordability reasons.
4. Algorithm Analysis → Greedy: distinguish the rounded full-order knapsack
   reference from proportional urgency for partial orders. They are different
   comparison domains; greedy has no global optimality guarantee.

Do not click **Mark plan as received** during a read-only walkthrough. Saving
and receiving are restricted to admin and write only to the fixture if used.
No receive action was part of this browser rehearsal. Complexity includes
catalog/candidate sorting and linear allocation; optional reference has its own
resource guard and O(n·H) cost.

## 4. Staff and mobile (about two minutes)

Use Fixture role → Staff. Generate recommendations and run compatibility search.
Save-this-configuration, Save build, inventory add/edit/stock, and restock save/
receive actions must be absent. The real backend rejects direct staff saving
with 403; hiding controls is not the security boundary. Admin can access saved
results again after switching back. Roles come from fixture database profiles.

At phone viewport 375×812, open the navigation drawer and visit all six pages.
Check inventory cards/Filters, optimizer alternative cards, builder specification
dialog and scrollable Analysis tables. This was browser-verified; physical touch,
projector resolution and the actual defense computer need a pre-presentation check.

## Evidence, optional edge cases and limits

- `PHASE3_BROWSER_SAVE_EVIDENCE.json`: four real browser saves + sanitized SQL
  comparisons, direct staff 403/anonymous 401, unchanged save count and fixture
  ledger check. This is not a production snapshot or backup.
- `PHASE3_FRONTEND_TEST_OUTPUT.txt`, `PHASE3_BUILD_OUTPUT.txt`: final raw outputs.
- Full regression run: 127 backend + 11 frontend, zero failures. Synthetic
  unknown specs, no-iGPU, zero-stock locks, one-node cap, rounded infeasibility,
  decimal demand .28×25 and 2000-item cases are automated evidence, not claimed
  separate browser demonstrations. Use the existing tests for those questions.
- Browser checks do not verify Supabase login/session refresh; production auth
  code was preserved. Saved builds do not reserve stock.
- Phase 2 missing backup/restore evidence is still pending. Full hosted Supabase
  disaster recovery/cutover remains untested. An algorithm defense is not a
  production-readiness or recovery sign-off.
