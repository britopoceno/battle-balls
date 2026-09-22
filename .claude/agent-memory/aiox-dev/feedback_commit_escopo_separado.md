---
name: commit-escopo-separado
description: Quando o AC de escopo exige que `git show --stat` do commit de implementação liste só arquivos de src/, commitar a story num segundo commit
metadata:
  type: feedback
---

Se um AC de escopo diz que `git show --stat <commit de implementação>` tem de listar SÓ certos arquivos de
código, faça dois commits: primeiro o de implementação (só esses arquivos, adicionados por nome), depois um
`docs(dev): … Ready for Review` com a story, citando o hash do primeiro.

**Why:** em e4.8 (2026-09-21) o lead pediu um commit só, mas o AC 8 exigia o stat com 2 arquivos. Com a
story junto, o stat teria 3 e o gate poderia reprovar pela letra. O commit separado também permite que o
Dev Agent Record cite o hash de implementação, o que um commit único não permite.

**How to apply:** vale para as stories de E4 que dividem `src/tools/determinism.ts` (e4.3, e4.6, debt.11).
Informe o lead da divisão no relatório. Ver também [[escopo-da-story-vence-artefato]].

Nota de toolchain relacionada: um script de scratch que faça `import()` dinâmico de um caminho absoluto no
Windows precisa de `file:///C:/…`. Com `C:/…` puro, o Node lança ERR_UNSUPPORTED_ESM_URL_SCHEME.
