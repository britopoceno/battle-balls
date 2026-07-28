---
name: project-migracao-debt
description: O golden hash de determinism.ts é o critério de aprovação das stories debt.1 a debt.7 — hash IDÊNTICO é obrigatório nos passos 1 a 7
metadata:
  type: project
---

A story `debt.0` (Done em 2026-07-28) travou 5 seeds (1, 2, 3, 7, 11) com hash/ticks/vencedor
em `BASELINE` dentro de `src/tools/determinism.ts`. As stories `debt.1` a `debt.7` são uma
migração de arquitetura em 8 passos (`docs/architecture.md` §6.1) que declara **hash idêntico
nos passos 1 a 7**.

**Why:** antes só havia autoconsistência (rodar a seed duas vezes e comparar entre si), que
continua verde mesmo se uma refatoração mudar silenciosamente o comportamento do jogo. Sem o
baseline, a migração seria feita no escuro.

**How to apply:** ao revisar qualquer `debt.1`–`debt.7`, um `BASELINE` alterado é sinal de
alarme, não de progresso — exige justificativa registrada no commit e provavelmente significa
que a refatoração mudou o jogo. Limitação conhecida (`MNT-001`, registrada no gate de `debt.0`):
a mensagem de erro nomeia seed e campo mas o hash não localiza *onde* divergiu; `debt.2`
(migração de leitores de stat, divergência esperada é aritmética) provavelmente precisará de
bisecção por tick.

Ver também [[feedback-verificacao-independente]].
