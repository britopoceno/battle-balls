---
name: project-battle-balls-structure
description: Battle Balls project doc structure is monolithic despite core-config claiming sharded, and the arch-debt epic uses non-numeric story IDs
metadata:
  type: project
---

**Battle Balls** (this repo) has `docs/prd.md` and `docs/architecture.md` as single monolithic files.
`.aiox-core/core-config.yaml` claims `prdSharded: true` / `architectureSharded: true` with shard locations
`docs/prd/` and `docs/architecture/` — **neither directory exists**. Treat the monolithic files as source
of truth and don't expect sharded epic files (`epic-{n}*.md`) to be present.

**Why:** the project was bootstrapped with AIOX defaults that assume sharding, but the actual docs were
never split. This is a config/reality drift, not a bug to fix unprompted.

**How to apply:** when loading architecture/PRD context for story creation in this repo, read the monolithic
files directly (`docs/prd.md`, `docs/architecture.md`) rather than looking for sharded subdirectories first.

**Epic numbering for the architecture-debt-payment work:** created 2026-07-28 as `docs/stories/debt.0.*`
through `debt.7.*` — one story per numbered step in `architecture.md` §6.1 (steps 0-7 are frozen-behavior
prep; step 8 is Phase 3/items, explicitly out of scope, becomes its own future epic). Used `debt` as a
non-numeric epic slug because this work sits between phase-epics E2 and E3 and has no PRD-assigned epic
number — story numbers were made to match the architecture doc's own step numbers 1:1 for traceability.

**Known source-doc inconsistency:** `architecture.md` §1.1/§1.3/§1.4 and Anexo B (A-9) refer to "15 campos"
of `StatBlock`, but the literal `STAT_KEYS` array and the §1.4 table only list **14** keys. Flagged
explicitly in story `debt.1` as a documented discrepancy, not resolved/invented — don't silently add a 15th
field to make the count match; ask @architect if it needs reconciling.

**E3 epic (Fase 3 — Loop) story convention:** created 2026-07-29 as `docs/stories/e3.0.*` through
`e3.7.*`, one story per numbered step (0-7) in `docs/architecture-e3.md` §12's "Plano de construção" table
— same 1:1 traceability pattern as the `debt.*` epic. Dependency chain is linear
(e3.0→e3.1→e3.2→e3.3→e3.4→e3.5→e3.6→e3.7) except e3.2, which depends on **both** e3.0 and e3.1 (not just
e3.0) — confirmed by reading §5.2/§2.2 of the architecture doc: `setupDaRodada` (built in e3.2) literally
calls `agregarItens` from `shop/agregar.ts` (built in e3.1). A naive reading of the spawn prompt hedged this
dependency as "not necessarily e3.1"; the source doc resolves it in favor of the dependency. `e3.6` is the
**only** story across the whole epic allowed to move the golden hash (D-05 tuning, `chars/tuning.ts`) — its
ACs are T-1 to T-4 from architecture §9.2, not "hash idêntico". Also found and flagged (not resolved) a
second doc inconsistency in `architecture-e3.md`: §8.1 says `PRESET_SOLO` lives in the same file as
`PRESET_ARNES` (`heuristic.ts`), but Anexo A's file map lists it under `bot/partida.ts` — registered as an
open question for @architect in story `e3.3`, not decided unilaterally.

**`debt.*` numbering continues past `debt.7` for QA-gate-spawned follow-ups, not just architecture-migration
steps.** Created `debt.8` (2026-08-16) from `TEST-102`, a finding in the `e3.6` QA gate
(`docs/qa/gates/e3.6-ajuste-d05-tuning.yml`, gate WAIVED): the `e3.6` re-baseline (`ESCALA_HP` 1.0→6.0) made
seed 11 of `determinism.ts`'s `BASELINE` table stop exercising `winner === -1` (tie path), and the 40-seed
mirror block went from 7/40 ties to 0/40. `debt.8` mandates finding a NEW tie-seed by scanning under the
current tuning (not re-tuning, not touching `sim/`) and pinning it as a 6th `BASELINE` entry — same `debt.N`
slug convention as the original migration epic, but this one has no corresponding architecture.md step; it's
just "next debt number, spawned by a gate finding."

**`debt.9`** (2026-08-16), from `E37-FUP-001` (`e3.7` gate, CONCERNS): "Revisão de D-09, rodada 2" —
re-pricing `src/shop/catalogo.ts`/`ECONOMIA_PROVISORIA` (`src/match/economia.ts`), explicitly BLOCKED on two
preconditions neither satisfied at creation time: (a) formal Risco #1b re-adjudication by @pm/@architect at
n≥3000 (still `ABERTO` per `architecture-e3.md` §14 errata and `e3.6`/`REQ-101`), (b) a fresh human-telemetry
sample collected 100% at `ESCALA_HP=6.0` with a self-justified a-priori floor of n≥30 purchases (real ×6.0
evidence today: 2 matches, 3 purchases — `e3.7` failed at n=11 mixing 4 game scales). Also folds in
`E37-EVD-002` (jurosPorDezOuro/tetoDeJuros never exercised) as a new AC. Same pattern as `debt.8`: gate
finding → next `debt.N`, no architecture.md step behind it.
