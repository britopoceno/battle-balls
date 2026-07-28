---
name: feedback-verificacao-independente
description: No projeto Battle Balls, gates de QA exigem reexecutar as verificações e reproduzir testes negativos do zero — nunca aceitar a alegação da story
metadata:
  type: feedback
---

Ao rodar um gate de QA neste projeto, **reexecute** `npm run check` / `npm run sim:check`
e **reproduza** qualquer teste negativo que a story alegue ter feito, preferencialmente
corrompendo campos **diferentes** dos que o @dev usou. Nunca aceitar "testei e funcionou"
do Dev Agent Record como evidência.

**Why:** é norma estabelecida aqui, não zelo isolado — o @po validou `debt.0` reproduzindo
o baseline rodando a simulação em vez de conferir a tabela no papel, e o usuário pediu
explicitamente o mesmo do @qa. A classe de bug que o projeto teme é justamente a
verificação que existe como código mas nunca dispara (código morto que passa verde).

**How to apply:** vale para toda story cujo entregável é um mecanismo de verificação
(as 8 stories `debt.*` da migração de arquitetura são todas assim). Restaurar o arquivo
depois e confirmar `git diff` vazio nele antes de fechar o gate.

Ver também [[project-migracao-debt]].
