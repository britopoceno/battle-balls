---
name: project-e4-determinism-sequencing
description: Fase 4 (net/) stories share a single non-worktree edit queue on src/tools/determinism.ts; sequencing lives in architecture-e4.md §11.6.x and gets re-confirmed in each story's "Depende de"
metadata:
  type: project
---

`src/tools/determinism.ts` is edited by a long, ordered chain of Fase 4 stories, all on the same working
tree (no worktree isolation): `e4.8` → `debt.11` → `e4.9` → `e4.3` → `debt.12` → `debt.14` → `e4.10` →
`e4.6`. As of 2026-09-21, `e4.8`/`debt.11`/`e4.9`/`e4.3`/`debt.12` are Done, `debt.14` is Ready (validated,
no implementation commit), and `e4.10` was just drafted (commit `2129004`) to sit right after `debt.14`.

**Why:** the file is a single shared queue, and each story's guard measures the sala/codec/fio behavior
that the *previous* story in the chain left behind. Reordering silently would mean a later story's guard
gets written against code that doesn't reflect the newest contract yet (e.g. `e4.10`, which changes what
the sala sends, has to run *after* `debt.14` hardens the sala's guard — not before — so `debt.14` doesn't
have to re-baseline counts against a sala that just changed).

**How to apply:** when drafting any new Fase 4 story that touches `determinism.ts`, always:
1. Read the *latest* Change Log entry of the immediately-preceding story in the chain (not just
   `architecture-e4.md`) — the @po often re-confirms or overrides the architecture doc's stated order
   there (e.g. `e4.3` v1.10.0 explicitly overrides `architecture-e4.md` §11.6.2's order because `debt.14`
   wasn't in the queue yet when the architecture doc was written).
2. Copy the "pré-condição de início" pattern verbatim: `git status --short src/tools/determinism.ts` must
   be empty before starting, and scope proof is always `git show --stat <own commit>`, never
   `git diff --stat` on the shared tree.
3. If a later story already left a "Nota para {next-story}" in its own AC/Depende-de section (see
   `debt.14` AC 8), quote it in full in the new story's "Depende de" — don't paraphrase. These notes
   pin down non-regression constraints (e.g. don't fix a complete list of wire messages if a known future
   story will extend that list) that are easy to violate by accident.

See also [[project-battle-balls-structure]].
