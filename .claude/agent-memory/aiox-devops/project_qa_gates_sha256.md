---
name: qa-gates-sha256
description: Os gates de QA em docs/qa/gates/*.yml registram sha256 por arquivo e por story — use-os para verificar particionamento retroativo de commits
metadata:
  type: project
---

Cada gate em `docs/qa/gates/*.yml` traz um bloco `reviewed_revision` com o **sha256
de cada arquivo de `src/`** no estado em que aquela story foi revisada, e marca quais
não mudaram desde o gate anterior ("IDÊNTICO a e2.5").

**Why:** o @qa (Quinn) fecha escopo por fingerprint, não por confiança na File List.
Efeito colateral valioso para o @devops: quando várias stories chegam sem commit e um
mesmo arquivo foi tocado por mais de uma, o sha256 do gate é o **alvo de verificação**
da reconstrução do estado intermediário. Reconstruí `heuristic.ts` no estado de `e2.3`
e bati o hash do gate byte a byte; `balance.ts` (2726 linhas, 4 stories) não fecha
byte a byte porque as stories posteriores editaram linhas existentes, não só
acrescentaram.

**How to apply:** antes de fatiar commits retroativamente, leia os gates e monte a
tabela de hashes por story. Onde a story só ACRESCENTOU, a reversão bate o hash e o
particionamento é provado. Onde ela EDITOU prosa/wrappers, aceite reconstrução
aproximada e declare a concessão. Verifique cada commit isoladamente com
`git archive <commit> src tsconfig.json vite.config.ts | tar -x -C .verify` +
`npx tsc -p .verify/tsconfig.json --noEmit` — `noUnusedLocals: true` no tsconfig
transforma "removi de menos" em erro de compilação, que é a rede de segurança real.
Ver [[battle-balls-hosting]] para as regras de push deste repo.

**Atribuição de arquivo por story quando a story ainda não tem gate:** os autores deste
repo escrevem o ID da story DENTRO do comentário que acrescentam (`// e3.0 (REL-001):`,
"AC 6 de `e3.2`"). Isso é mais confiável que inferir pelo diretório. Peguei `src/sim/rng.ts`
aparecendo como modificado num lote em que a única story de `sim/` era `e3.0`; o próprio
comentário dizia ser AC 6 de `e3.2` (story `InProgress`, interrompida) e reservava streams
de RNG para `e3.3` — teria entrado no commit errado se eu tivesse confiado no caminho do
arquivo. Sempre leia o `git diff` de cada arquivo antes de estagiar, e cruze com o campo
File List da story (que aqui costuma até declarar "arquivo X aparece modificado no working
tree, é de outra story").

**Doc-mãe de fase entra em commit próprio, antes da primeira story:** precedente
`5f8f87d` (`docs/architecture-e2.md`, sozinho, imediatamente antes de `e2.0`); repeti com
`architecture-e3.md`. Concessão inevitável: os gates do @architect editam esse mesmo
documento DEPOIS, e como ele chega ao repo como arquivo novo não rastreado não existe
versão pré-gate para diferenciar — `git add -p` só produziria um documento com lacunas que
nunca existiu em disco. Commite inteiro e declare a concessão no corpo do commit.
