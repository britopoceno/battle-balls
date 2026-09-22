---
name: e4-sujo-pathspec
description: E412-ARC-001 (2026-09-22, 3b6891c) — `sujo` do replay usa pathspec `:(top)` src/package*.json; pathspec relativo com cwd src/server é sempre vazio
metadata:
  type: project
---

§7.3 item 4 emendado: `sujo` = `git status --porcelain -- ':(top)src/' ':(top)package.json' ':(top)package-lock.json'`.
tsconfig fora (Node type stripping não o lê). Delta ao @po: `main.ts:121` + comentários em main.ts e net/replay.ts
na story curta de dívida (`partida.ts` + `determinism.ts` → 4 arquivos).

**Why:** `lerCodigo()` roda git com cwd `src/server/`; `-- src/` relativo vira `src/server/src/` e sai sempre vazio
(sujo sempre false, mesmo com src/ mudado). `--untracked-files=no` segue true (agent-memory rastreado) e é cego a arquivo novo.

**How to apply:** qualquer comando git lido de dentro de `src/` precisa de pathspec `:(top)`; ao revisar o delta,
o cenário discriminante é src/ modificado e arquivo novo não rastreado em src/. Relacionado: [[feedback_medir_antes_de_propor]].
