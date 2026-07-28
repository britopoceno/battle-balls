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
