# Phase 3: algorithm correctness and validation

## October 26 browser/rehearsal follow-up

Continued the existing patch without changing the working algorithms. Added a
loopback-only browser entry using the existing in-memory API test harness; it
loads no env files and pins the API client to its own `/api`. Production entry,
Supabase authentication, authorization and migrations are unchanged.

Actual desktop/phone browser actions, four alternative saves, saved-value checks,
and current limitations are recorded in [readiness](PHASE3_DEMO_READINESS.md),
[save evidence](PHASE3_BROWSER_SAVE_EVIDENCE.json) and the
[defense runbook](PHASE3_DEFENSE_RUNBOOK.md). Browser testing reproduced one
additional presentation defect: a previous builder search remained visible
when locks changed. A keyed previous-input warning now distinguishes that
historical trace from current inputs. It also handles budgets, stock filters,
late results and cached state without rewriting or rerunning the algorithm.

The complete regression run passed **127 backend + 11 frontend = 138 tests**.
The final frontend rerun and build output are retained beside this report.
Earlier counts below are historical checkpoints. Phone checks used a 375×812
browser viewport, not physical mobile hardware. The fixture does not exercise
Supabase session acquisition/refresh. No production data or Phase 2 work changed.

## October 26 follow-up: resumed algorithm and frontend validation

The user stopped backup-storage investigation and resumed Phase 3. No live
credentials/data were used by these tests, no live migrations were run, and no
Phase 2 audit was repeated. Phase 2 backup evidence remains a separate pending
item; it is not claimed complete by this work.

Baseline: 119 existing tests previously passed. Follow-up inspection reproduced
additional defects before implementation: six new regressions initially failed;
a later minimum-budget regression also failed before its correction.

- Decimal demand such as `0.28 * 25` can exceed 7 in binary floating point,
  causing `ceil` to order 8 units or advance the reorder threshold by one. Demand
  ceilings now evaluate the input's decimal representation with integer rational
  arithmetic. Scientific notation and true fractional requirements are preserved;
  an independent integer-arithmetic grid covers 495 hundredth-demand/day cases.
- DP totals already used cents, but remaining/sub-budget subtraction still used
  floats. Those values now come from cent differences. Currency labels retain
  cents instead of rounding a computed amount to whole pesos.
- PC Builder's result panel and toast could claim no solution or completion after
  hitting a node cap. Both now distinguish an incomplete search from exhaustive
  infeasibility. Algorithm Analysis defaults to no locked CPU, so it does not
  depend on a particular seeded record existing.
- The Build Optimizer save action used the original inputs even while an
  alternative was selected. Each alternative now carries its own reproducible
  inputs; the selected configuration submits those inputs to the existing
  authorized save endpoint. Lower-cost alternatives below the supported API
  minimum are omitted. Saving still recomputes against current inventory: it is
  not a reservation or a promise to persist a stale screen snapshot.
- Changed requirements are marked while an older recommendation remains visible.
  Comparison text now describes the rounded-domain objective, including lean mode.

Validation executed:

- `npm test`: 127/127 backend tests and 9/9 frontend tests passed in the first
  complete follow-up run. After the final notification/default changes,
  `npm --prefix Frontend test` passed 10/10. Current total: **137 tests**.
- The new frontend suite uses Vite SSR with env-file loading disabled, React's
  renderer and the real Express API with signed test tokens and fresh in-memory
  PGlite. It checks rendered prices, scores, names, traces, capped/infeasible
  states, stale-catalog snapshot precedence, Analysis data, alternative save
  inputs and staff save denial. It is not a browser click/gesture test suite.
- `npm run build` passed; the existing >500 kB JavaScript chunk warning remains.
- Fixture benchmark script executed: demo BT explored 23 assignments / 29 checks
  from 882000 combinations, stopped at 12 solutions; demo DP considered 48
  platforms / 403910 fitting transitions and returned 69750 at score 76.98;
  greedy at 300000 funded 3 products; the broad 100-node search stopped exactly
  at 100; the 2000-product restock reference was safely omitted.
- One observed run: BT 40.62 ms, DP 93.20 ms, greedy plus reference 11.46 ms,
  broad capped search 11.08 ms, 2000-product greedy 311 ms. These timings include
  machine/load variation and establish no theoretical bound or speedup.
- The static UI detector returned an empty findings list for the changed pages.

The asymptotic bounds below remain applicable. Exact demand-ceiling arithmetic
adds bounded decimal-integer work per product (database demand has two decimal
places); it does not add a new candidate pass or change the greedy ordering rule.
The existing node/state/reference guards remain. See
[demonstration and defense readiness](PHASE3_DEMO_READINESS.md) for the remaining
manual acceptance checklist and explicit modeling/optimality limitations.

## Historical Phase 3 implementation evidence

## A. Baseline assessment (before algorithm changes)

Source: latest remote main `e3e6130` (merges Phase 2 PR #1). Branch:
`fix/unitworks-phase3-algorithm-correctness`. Baseline `npm test`: **97/97 passed**.
The user renewed the instruction to proceed with Phase 3 after the Phase 2 draft.
Phase 2 source is merged, but its report still records production deployment,
full platform recovery verification and final acceptance as pending. This work
uses isolated fixtures and does not claim those operational prerequisites passed.

Data flow inspected: `Frontend/src/services/api.js` → authenticated routes and
algorithm controllers → `Backend/src/services/algorithmServices.js` → inventory
repository's active database records → `shared/uw-core.js`. Results return to
PCBuilder, BuildOptimizer, RestockOptimizer and AlgorithmAnalysis. Dashboard
also calls restock prioritization. PCBuilder uses checkBuild/feasible locally
for instant hints; no algorithm experiment will touch the live database.

Original behavior:

- Backtracking assigns CPU, board, RAM, case, cooler, GPU, PSU, storage, pruning
  failed/unknown constraints and an optimistic cheapest-remaining budget bound.
  Results stop at 12 solutions or 40,000 explored assignments by default. They
  are sorted after discovery; this is not a globally cheapest-K search.
- DP enumerates CPU/board/case platforms and uses four multiple-choice groups
  (RAM, GPU+PSU, cooler, storage) with costs rounded upward to 100-peso units.
  It maximizes normalized additive suitability, optionally minus a rounded-cost
  spending penalty. Motherboard/case constrain choices but contribute no score.
- Greedy ranks reorder candidates by rounded urgency and demand, funds full or
  MOQ-respecting partial orders in that order, and optionally computes a rounded
  full-order 0/1 knapsack reference. MOQ is a minimum, not a pack multiple.

Existing tests compare against enumerations that reuse production compatibility,
candidate and scoring helpers, so they are not independent compatibility oracles.
Missing coverage includes lock/filter conflicts, monetary cents, exact tie
semantics, malformed catalog records, unknown enum/connector information,
rounded infeasibility explanations, and resource limits for large workloads.
Equal-price/priority ties inherit input order. DP uses signed 16-bit choice
indices, which cannot represent large GPU+PSU groups. The analysis page omits
candidate/group storage from space bounds and can claim no feasible build when
only the rounding prevents a result. BuildOptimizer also overstates exact
optimality on arbitrary prices. The reference knapsack's comment calls it exact
without specifying its rounded domain.

Baseline assessment was completed before logic changes. The sections below record
independently reproduced defects, final specifications, fixes and executed validation.

## B. Final algorithm specifications

All three remain their original selected techniques. There are no new database
schema changes, dependencies, production experiments or authentication changes.

Shared core inputs use unique nonempty real-product IDs/categories, nonnegative
integer stock and positive finite real-product prices/unit costs representable
in cents. Archived/virtual catalog rows are excluded; the built-in virtual GPU
is added only where applicable. Invalid direct-core inputs throw RangeError
before table allocation or selection. HTTP inputs retain the existing 400/422
validation and limits. Missing numeric/select specifications normalize to unknown
rather than becoming a compatible default. Missing performance scores retain
the existing illustrative 50-point fallback. Numeric scores, when supplied, must
be finite in [0,100]. Inputs are copied, never mutated.

### Backtracking

Inputs: catalog, optional category locks, optional nonnegative cent budget,
stock-only flag, positive integer result/node caps and nonnegative trace cap.
Defaults remain 12 solutions, 40,000 nodes, 180 trace events (analysis requests
220). Invalid/missing/cross-category locks are errors; locks cannot bypass stock
or archive eligibility. Empty domains immediately produce an exhaustive empty
result. A valid complete configuration has one part per category and passes all
eleven implemented rules; unknowns are rejected from searches.

CPU socket, RAM generation, motherboard form, display output, GPU clearance,
cooler socket/fit/rating, PSU wattage/connectors and storage interface retain
their existing meanings. Native 16-pin support or two known 8-pin connectors
can satisfy the existing adapter assumption. Unknown connector information is
not silently counted as zero. Cooling mode and storage interface must be known.

Domains sort by actual price and then ascending product ID. The optimistic
suffix sum is calculated in cents and ignores remaining compatibility, so it
cannot overestimate the cheapest possible completion. Since real prices are
positive and the virtual GPU is free, the budget pruning is safe. Every assigned
category is removed on return/prune/stop. Output includes candidates, search-space
size, explored/check/prune/backtrack counts, bounded trace, solutions and stop
reason. Only `stopped === null` establishes exhaustiveness. Sorting found results
does not make a truncated traversal a global cheapest-K ranking.

### Dynamic programming

Inputs: catalog, nonnegative cent budget (core maximum 500,000 pesos; HTTP still
requires 15,000–500,000), use case, priorities 1–5 (missing dimensions default 3),
CPU/GPU brand preferences, min RAM 0/32/64, stock flag, lean flag and cent-valued
positive budget unit (default 100). More than 20,001 budget states is rejected.
Zero budget returns infeasible; malformed/negative/unsafe budgets or prices
throw before allocation. All compatible CPU+board+case platforms are considered.

For each platform, compatible options form RAM, GPU+PSU, cooler, and storage
groups. Existing constraints couple no two different groups once platform and
GPU+PSU pairs are fixed. Thus a multiple-choice DP is applicable; this reasoning
must be revisited if a future compatibility rule crosses those boundaries.

The platform cost remains exact in cents. Each group's cost is rounded upward
to `unit`; GPU+PSU round as a pair. `D[0][b]=0` and later unreachable cells are
negative infinity. `D[i][b]=max_k(D[i-1][b-u_k]+value_k)` selects exactly one
option per group. Choice indices are 32-bit. A parallel cost row breaks equal
score ties by lower actual spend; capacity/platform ties use the same secondary
rule, including the top-platform listing, then deterministic ID-ordered traversal. Score comparisons use a 1e-9
tolerance for floating point suitability arithmetic; money never uses that
tolerance or floating accumulation.

Pure objective: `S = sum(weight_c * score_c)`. Gaming uses gaming CPU/GPU indices;
other uses use work indices. Category weights are the existing USE_CASES values,
multiplied by the relevant priority/3 and normalized. CPU, GPU, RAM, storage,
cooler and PSU score; board/case only constrain. Lean maximizes
`S - 15 * rounded_spend / budget`, preserving the existing rounded-spend rule.
It does not promise the highest pure score.

The result is optimal for that objective in the conservative rounded domain
(subject to numeric tolerance), assuming additive scores and the implemented
group-independent constraints. If every price aligns with the step, there is
no rounding loss and the pure score optimum is exact for actual budget as well.
Otherwise each of four groups adds less than one unit: rounding inflation is
strictly less than four units. This is not a bound on score loss or frequency
of missed solutions. Actual totals never exceed budget. `minFeasible` refers
to the cheapest compatible actual-price build, so `ok:false` can occur even when
`minFeasible<=budget`. Both UI callers now explain this rounding case accurately.

Output includes reconstructed parts/prices/score, remaining budget, platform and
transition counters, sampled DP table, path and top platform results. Saving a
run uses the same selected-product snapshot that generated its total and score,
avoiding a second catalog read that could mix price states. Database concurrency
is not solved by the pure solver: it saves historical snapshots, not reservations.
The frontend also gives the returned recommendation/alternative product
snapshots precedence over its separately loaded inventory when displaying
scores, prices and compatibility for that run.

### Greedy restock

Inputs: active real inventory, nonnegative cent budget and coverage 7/14/30.
Stock/minimum/MOQ/lead time must be safe nonnegative integers, with lead/MOQ
positive. Missing MOQ keeps the existing default 1; explicit zero is invalid.
Missing demand is zero; negative/nonfinite demand is invalid. Derived quantities
and costs are checked for safe representation. Unit cost must be positive.

With `daily=d`, lead `l`, minimum `m`, stock `s`, coverage `c`:

- Reorder point = `ceil(d*l+m)`; candidate iff `d>0 && s<=reorder_point`.
- `max_daily=max(0.1, daily for all eligible real products)`, including
  noncandidate products; demand is a stored average, not recomputed history.
- `days_left=s/d`; denominator is at least 0.5 day (zero demand is noncandidate).
- Urgency = `round(100*(0.6*min(l/max(days_left,0.5),3)/3 + 0.4*d/max_daily))`.
- Target = `ceil(m+d*(l+c))`; order quantity = `max(MOQ,target-s)`.
- Sort: urgency descending, demand descending, product ID ascending.
- Fund full quantity if affordable; otherwise fund the largest affordable whole
  quantity meeting MOQ, or skip. MOQ is not a pack multiple: need 26, MOQ 10
  still means 26 units. Funds and order costs are allocated in integer cents.

The optional reference is 0/1 knapsack on full orders with each full-order cost
rounded upward to 100 pesos. It maximizes summed urgency. Greedy permits partial
orders and reports urgency covered proportionally, so these objectives/domains
differ. Reference exactness is restricted to its rounded full-order domain;
neither result is a proof of optimal real-world procurement. It is omitted if
states exceed 20,001 or candidate-state cells exceed 2,000,000. Main greedy
selection continues normally. Zero budget safely skips all candidates.

## C. Independent correctness evidence

`Backend/test/oracles/phase3-reference.js` imports **no production core helpers**.
It implements eleven compatibility predicates, full Cartesian enumeration,
separate literal weight/priority calculations, the actual platform/group rounded
cost objective, greedy scoring/allocation and bounded full-order subset search.
The actual solvers remain backtracking, DP and greedy; exhaustive methods are
test-only. `Backend/test/fixtures/phase3-catalog.js` supplies separate fixed
catalogs for each algorithm without importing production catalog/algorithm code.

Before corrections the first 14 new tests yielded **5 passed / 9 failed**.
Failures reproduced stock-lock bypass, unstable ties, a 3.60-peso exact-budget
build pruned by floating point arithmetic, unknown cooler mode accepted,
expensive equal-score RAM retained, invalid inputs not rejected, and unbounded
reference-table allocation at 2,000 candidates. Additional regression tests
verify choices beyond index 32,767 and the second-read persistence defect.
A final boundary check also reproduced acceptance of 0.5 storage slots despite
the documented rule requiring at least one; the predicate now uses `>=1`.

| Check | Expected and verified result |
| --- | --- |
| Single catalog, all prices 100 | Exactly one discrete-GPU build, total 800 |
| Small BT fixture, budgets 0/799/800/819/820/1000 | Full selection sets equal independent Cartesian oracle, not merely counts |
| Every rule contradicted; missing type/interface/connector/spec data | Zero verified builds; hint view reports unverified for incomplete specifications |
| Air/AIO, native/adapter, NVMe/SATA variants | 16 fixed variants agree with independent compatibility |
| Locked zero-stock CPU with stock-only filter | Zero solutions through both core and HTTP |
| Prices 0.10 through 0.80, exact budget 3.60 | Valid BT solution and cent-unit DP reconstruction, total 3.60 |
| RAM 101 versus equal-score RAM 199 in same rounded bucket | Lower actual total 801 selected consistently after input reversal |
| Budget 801 with 101 RAM and default unit 100 | `ok:false`, `minFeasible:801`; UI explains conservative rounding |
| Four use cases × two lean modes × five budgets | Independent exhaustive DP objective and actual-cost tie result agree (40 scenarios) |
| Sixteen reproducible varied catalogs | Complete BT sets and DP optimum agree under multiple platforms, cents, stock/brand/RAM filters and input reversal |
| 181 GPUs × 182 PSUs = 32,942 options | Winning gpu-180/psu-181 reconstruct correctly beyond the old signed-16-bit limit |
| Five restock budgets × three coverage targets | Exact independent scores, order, quantities, decisions and remaining money agree |
| Rounded full-order subset oracle | Reference knapsack value matches bounded exhaustive subset optimization |
| 110,000,000 unpruned combinations with 100-node cap | Exactly 100 explored assignments and explicit node stop; trace bounded at 5 |
| 2,000 restock candidates, budget 2,000,000 | Valid main plan, reference safely omitted |
| Save with catalog capable of changing on second read | One read; saved header/line prices equal recommendation snapshot |

HTTP integration uses isolated PGlite, locally signed test tokens and existing
permissions. It independently checks scoring/compatibility, restock ordering,
stock locks, invalid fields, zero budget and continued staff-save denial.
Neither expected formulas nor exhaustive answers call the solvers under test.
Original broader enumeration tests remain useful supplementary coverage, with
their shared-helper limitation explicitly acknowledged.

## D. Complexity and representative observations

Let N be catalog size, D=8 categories, C=11 rule checks, n_i domain sizes, S saved
solutions, T trace entries, P compatible platforms, G=4 groups, B the largest
per-platform capacity+1, K the largest group, and n restock candidates.

| Algorithm | Time | Auxiliary/output space retained |
| --- | --- | --- |
| Backtracking | O(N log N) preparation + O(C * sum_d product_{i<=d} n_i); nonempty domains bounded by O(D*C*product n_i) | O(N+D+D*S+T), including sorted domains, recursion, selections and trace |
| DP | O(N log N) preparation; O(n_cpu*n_mb*n_case*C) platform enumeration; O(P*(n_ram+n_cooler+n_storage+n_gpu*n_psu)*C) groups; O(P*G*B*K) recurrence | O(N+G*B+G*K+P), best/current tables and groups plus platform summaries; constant D factors suppressed |
| Greedy | O(N log N+n log n) ordering, O(N) scans/allocation | O(N) rows, candidates, traces |
| Optional knapsack reference | O(n*H), H=floor(budget/100)+1 | O(n*H) choice bits/bytes plus O(H) values |

DP is pseudopolynomial in budget/unit. Capped BT execution does not change its
uncapped worst case, and observed pruning does not establish a complexity-class
improvement. The winning platform's B may be smaller than another platform's.
Space bounds include candidate/options/result storage, which the original page
omitted. The API optimizer times a recommendation and up to three alternatives;
the displayed main transition count describes only the recommendation. Greedy
server timing includes its optional reference, as the page now states.

Reproduce illustrative observations with
`npm --prefix Backend run bench:algorithms`. This imports demo/synthetic fixtures,
never a database or environment file. One local execution (milliseconds, no
strict timing assertions or performance guarantees):

| Workload | Time | Actual counters/results |
| --- | ---: | --- |
| Demo BT | 26.09 | 882,000 combinations; 23 explored, 29 checks, stopped at 12 solutions |
| Demo DP, budget 70,000 | 40.52 | 48 platforms, 403,910 fitting transitions, 576 winning-table states, total 69,750, score 76.98 |
| Demo greedy + reference, budget 300,000 | 2.57 | 25 candidates, 3 selections, spent 300,000 |
| Broad search, 100-node cap | 1.45 | 110,000,000 combinations; exactly 100 explored, node stop |
| 2,000 reorder products | 11.54 | 1,250 full orders, spent 2,000,000, reference omitted |

These observations depend on hardware, warm-up and load. No claim of measured
speed improvement over baseline is made.

## E. Limitations, review and final validation

The eleven rules are application predicates, not a hardware certification.
BIOS versions, detailed memory QVLs, CPU bottlenecks, case-specific radiator
placement, actual adapter availability and multi-device connector sharing are
not modeled. The original 16-pin/two-8-pin adapter assumption is preserved and
documented; verifying real supplied adapters is future product-data work.
No new pack-size, demand-forecasting or scoring business rule has been invented.
Equal-priority business policy was unspecified; ascending product ID supplies
reproducibility without changing urgency/demand priorities. A different tie
policy would be a separate explicit product decision.

Rounded DP can miss valid or higher-scoring exact-price builds; lean optimizes
its penalty objective. No universal exact-price optimality or score-gap bound is
claimed. Greedy has no global quality guarantee; the existing expensive-urgent-
order counterexample remains. Reference and greedy values use different domains.
Large DP platform/GPU-pair counts can still be expensive despite the state cap;
no asynchronous job system or broad redesign was added. Combinatorial `space`
is a JavaScript number and may be approximate above the safe integer range.

The Algorithm Analysis page preserves its existing components/styles while
correcting completeness, ordering, input expectations, rounded feasibility,
objective, time and space explanations. BuildOptimizer and PCBuilder also avoid
overstated exact optimality and cheapest-K claims. README links this evidence.

Executed validation:

- Baseline `npm test`: 97/97 passed before algorithm modifications.
- New pre-fix suite: 5/14 passed, 9 failed (recorded before corrections).
- Final `npm test`: 119/119 passed, including all 97 existing tests and 22
  independent/core/caller/HTTP tests. A final targeted high-demand assertion
  also passed after being added to the greedy boundary case.
- `npm run build`: passed; Vite retains its warning for a bundle over 500 kB.
  The final snapshot-precedence UI adjustment is also validated by a rebuild.
- `npm --prefix Backend run bench:algorithms`: executed; observations above.
- `git diff --check`: passed.
- Root, backend and frontend package scripts expose no lint or type-check
  command. No such checks or manual browser inspection are claimed.

Changed files: `shared/uw-core.js`, the backend algorithm service, benchmark
script and package command, existing algorithm test title, new fixtures/oracles,
`phase3.test.js` and `phase3-api.test.js`, AlgorithmAnalysis/BuildOptimizer/
PCBuilder text and snapshot display, README, and this specification. No database,
authentication, permission, seed or existing migration source changed.

Phase 2's remaining live operational sign-off is explicitly outside this isolated
audit; this PR must not be interpreted as approving/applying production migration
006. The user explicitly asked to continue Phase 3; the report preserves that
operational gap instead of marking Phase 2 complete without evidence.
