---
name: battle-balls-e3-gate
description: "Phase 3 (E3, match loop) gate rules: e3.6 is the ONLY story allowed to move the golden hash; the user's §14 resolutions of R-01/02/03/06/07"
metadata:
  type: project
---

Phase 3 (E3 — draft/builds/Bo5/shop/economy) is the first phase that **changes the game on purpose**.
Validated 2026-07-29: 8 stories `e3.0`-`e3.7`, all GO, all `Ready`.

**The golden-hash rule flips, but only once.** Steps 0-5 and 7 (`e3.0`-`e3.5`, `e3.7`) still require
`golden hash idêntico` on seeds 1/2/3/7/11. **`e3.6` (D-05 HP/damage tuning) is the single authorized
exception** and its acceptance criteria are T-1..T-4 of `architecture-e3.md` §9.2, *not* "hash
identical": re-record `BASELINE` (`determinism.ts:78-84`, 5 seeds) **and** `BUILD_BASELINE`
(`determinism.ts:100`+, 5 variants) in the same commit with the `ESCALA_*` value written into the commit
justification; median 25-35s measured with a human playing (P3.1, not `sim:check`); the E2 harness must
still detect the mutant (`--mutacao=vex:dmg:+0.30 --n=3000`); `--risco-1b` deltas must not flip sign.

**The user's resolutions in §14 (2026-07-29) are decided, not open.** Do not let a story re-open them
or make them conditional on further @pm confirmation:
- **R-01 → option B**: full draft structure, fixed `[golem,vex]` composition until Phase 5.
- **R-02 → per character**: items attach to one character, not the team.
- **R-03 → between rounds only**: shop does not open before round 1; initial `fase` is `builds`;
  economic curve is 3.31 openings/match, not 4.31.
- **R-06 → option (b)**: alternate player side each round. See [[battle-balls-e2-gate]].
- **R-07 → in scope**: "RF-36 entra de carona no substrato de §10" is affirmative. The `cast` event
  belongs to `e3.5`. A story that defers it to @pm has misread the resolution — RF-36 was already
  approved in PRD §6 for Phase 1 and never instrumented.
- R-04 (round 6/7 income) stays provisional-and-marked; R-05 (sudden death) waits for P3.2.

**Why this matters:** D-05 and D-09 numbers are deliberately *not* in any document. Any story that
states a final HP scale, price, or income number is inventing (Article IV). Stories must deliver the
**mechanism** for measuring and moving those numbers, plus the measurement — never the value.

**Layer trap to watch:** §2.3 describes `ResultadoRodada.hash` as "reusando `tools/harness.hash`", but
§2.2 puts `tools/` *above* `match/`. `match/` must never import from `tools/`; the caller computes the
hash and passes the string in.

Related: [[story-validation-rigor]], [[battle-balls-e2-gate]]
