---
name: net-purity-grep
description: O gate de pureza de src/net/ (stories e4.x) é um grep por "ws" — comentários que citam a lib de socket fazem o gate falhar; o grep literal das stories precisa de -r
metadata:
  type: project
---

As stories da Fase 4 (e4.0, e4.2, e4.3...) verificam a pureza de `src/net/` com
`grep -n "ws\|document\|window\|localStorage\|Date.now\|performance.now\|Math.random" src/net/`.

- Esse grep casa com **comentários** também: escrever "não conhece `ws`" num comentário faz o gate falhar.
  Em e4.0 os comentários dizem "socket" / "a biblioteca de socket do servidor", sem nomeá-la.
- Na forma literal (`grep -n ... src/net/`) ele erra com "Is a directory"; rode com `-r`.

**Why:** o @qa roda o grep como está na story; um match de comentário vira falso FAIL no gate.
**How to apply:** em qualquer arquivo novo de `src/net/`, rode `grep -rn` com o padrão da story antes de
entregar e mantenha-o vazio, inclusive em comentários.
