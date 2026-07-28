---
name: projeto-battle-balls-estado
description: Battle Balls está na Fase 0 com portão pendente de julgamento humano; a Fase 3 está bloqueada por dívida de arquitetura em mods/loja
metadata:
  type: project
---

Em 2026-07-28: Fase 0 construída e medida, **portão pendente** — o usuário precisa jogar
(de preferência em celular real) para dizer se "mirar habilidades em bolas que andam
sozinhas é divertido". Nada da Fase 1 em diante começa antes disso.

A Fase 3 (loop: draft + Bo5 + loja) tem bloqueio conhecido: dois dos oito itens da loja
não têm ponto de aplicação no simulador (elasticidade e redução de cooldown de habilidade)
e `mods` é escrito por atribuição absoluta pelas passivas, então não compõe com itens.
Resolver é trabalho do @architect. Além disso, três decisões de produto precisam fechar
antes: regra de empate no Bo5 (17,5% das rodadas medidas caíram nela), escopo do +alcance,
e ordem de aplicação de mods de item.

**Why:** o método do projeto é fases com portão e não se avança sem passar (decisão #15
do `DESIGN.md`). Escrever requisito de loja antes de resolver a dívida produziria
requisito inimplementável.

**How to apply:** antes de sugerir trabalho de qualquer fase, confirmar no `README.md` e
em `docs/prd.md` §4-§5 se o portão anterior passou e se os bloqueios foram resolvidos —
esta memória congela o estado de 2026-07-28 e envelhece rápido.
Ver [[feedback-decisoes-travadas]].
