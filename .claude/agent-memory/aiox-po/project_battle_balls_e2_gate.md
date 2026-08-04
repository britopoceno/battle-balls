---
name: battle-balls-e2-gate
description: "Phase 2 (E2, balancing harness) gate rules: golden hash frozen, R-02/R-04 resolved, R-01/R-03 deferred"
metadata:
  type: project
---

Phase 2 (E2 — arnês de balanceamento) builds a measuring instrument and must not change what it
measures. Gate criterion P2.1 requires the golden hash to stay identical, so **every** E2 story
declares "golden hash idêntico" for baseline seeds 1, 2, 3, 7, 11 (`BASELINE` in
`src/tools/determinism.ts`). The first step that may legitimately move the hash is D-05 (HP/damage
tuning), which is Phase 3.

Open questions in `docs/architecture-e2.md` §9, with the user's 2026-07-28 resolutions:
- **R-02 resolved** — P2.3 (negative control) is the A/B protocol with an empty package, NOT the
  whole composition matrix. The matrix reading is unsatisfiable by construction; it *is* the Phase 5
  gate.
- **R-04 resolved** — the Risk #1b trigger is reported as a per-character delta pair; the global
  aggregation rule is deferred to Phase 5.
- **R-01 was deferred to Phase 3 and is now RESOLVED there** (2026-07-29) as `architecture-e3.md`
  §14/R-06, option (b): alternate the player's side each round (`alternarLadoPorRodada: true`), hash
  intact. Re-measured with the heuristic bot: team 0 wins **54.72% ±4.0** in the `[golem,vex]` mirror,
  an interval that excludes 50%. The real simulation fix (simultaneous damage resolution, or
  seed-derived order) moves the hash and stays deferred to whenever Phase 4 forces it.
- **R-03 deferred to Phase 5** — what "28 confrontos" means (210 vs 378 cells, 30x runtime spread).

**Why:** R-01 and R-03 are tempting for an implementer to "just fix" — both are visible, both look
like bugs. Touching either fails Phase 2 by its own first criterion or invents a product decision
the user explicitly deferred (Article IV).

**How to apply:** when validating or reviewing E2 work, treat any story text that proposes
simultaneous damage resolution, seed-permuted combat order, or a fixed confronto count as a
must-fix, not a nice-to-have.

Related: [[story-validation-rigor]]
