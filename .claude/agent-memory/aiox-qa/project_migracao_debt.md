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
que a refatoração mudou o jogo. Sempre conferir a tabela contra o commit de `debt.0`
(`d52c23d`), não só rodar o teste: o teste passa trivialmente se alguém "atualizou" o baseline.

**Ponto cego estrutural do golden hash (descoberto no gate de `debt.2`):** o baseline roda um
roster FIXO de golem+vex (`determinism.ts:15-18`). Qualquer regressão que só se manifeste com
outro personagem, ou com valores fora da faixa desses dois, passa verde. Concretamente: `debt.2`
tornou os clamps `ABS_MIN`/`ABS_MAX` de `stats.ts` load-bearing (agora `stat.radius`/`drag`/
`maxSpeed` são lidos de verdade) e o hash não pode detectar isso porque golem e vex estão dentro
de todas as faixas. Ao revisar `debt.3`–`debt.7`, perguntar sempre: *essa mudança poderia quebrar
algo que golem+vex não exercitam?*

**Técnica que funcionou bem no gate de `debt.2` — controle negativo:** quando a story proíbe uma
mudança, não basta verificar que ninguém a fez; aplicar a mudança proibida numa cópia isolada da
árvore (scratchpad, working tree jamais tocada) e mostrar que o hash quebra. Prova ao mesmo tempo
que o arnês é sensível e que a proibição tinha fundamento. No caso do `knockback`, produziu 11
desvios e inversão de vencedor em 2 seeds.

**Recomendação em aberto para `debt.3`–`debt.7`:** exigir **um commit por troca individual**. Em
`debt.2` o AC pedia `sim:check` isolado por troca, mas tudo chegou numa working tree única — a
sequência era inverificável e precisou ser reconstruída do zero pelo @qa.

Ver também [[feedback-verificacao-independente]].
