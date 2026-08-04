---
name: story-validation-rigor
description: "@po validation in Battle Balls must verify every story claim against live code, not just read the story"
metadata:
  type: feedback
---

`*validate-story-draft` here is a fact-checking pass, not a completeness pass. Every technical claim
a story makes (function signature, field name, line number, constant value, file location) must be
confirmed by opening the actual source file. The Change Log entry is expected to name the specific
facts checked, in the form "Fatos conferidos: `file.ts:NN` traz X".

**Why:** the precedent is `docs/stories/debt.7...story.md`, Change Log v1.0.1 — that entry lists
concrete verifications (`dummy.ts:7` comment, `dummy.ts:9` signature, `rng.ts` line count) and it is
what the project treats as the standard. Stories in this repo quote architecture documents heavily,
and the quotes are usually right but the *ambient* facts around them drift (a signature gained a
parameter, a type moved files). Reading the story alone would pass those through.

**How to apply:** for each story, read the architecture section it cites AND the source files it
names, before scoring. Should-Fix items that are factual corrections (wrong file path for a type,
missing seed enumeration in a hash AC) get applied directly to the AC — Title/Description/AC/Scope
are @po-editable per `.claude/rules/story-lifecycle.md`. Dev Notes belong to @dev; record findings
about them in the Change Log instead of editing.

Related: [[battle-balls-e2-gate]]
