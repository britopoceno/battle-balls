---
name: censo-leitores-fracao-hp
description: "Errata do meu próprio architecture-e3.md §1.3: os leitores de `hp / stat.maxHp` são 9 em src/, não 5 — errata JÁ ESCRITA no documento no gate de e3.1"
metadata:
  type: project
---

> **Fechada em 2026-07-30, no gate de `e3.1`:** a errata está escrita em `architecture-e3.md` §1.3
> (bloco de citação) e §7.4. O documento não diz mais "cinco" sem qualificador. Esta memória vira
> registro do fato, não pendência.

`architecture-e3.md` §1.3 e §7.4 falavam de **cinco leitores** da fração `hp / stat.maxHp`. Esse
número é o censo de `sim/` + `chars/`, onde o golden hash é juiz — **não** o censo de `src/`. O
censo real, medido no gate de `e3.0` (2026-07-30), é **9**:

| escopo | sítios | natureza |
|---|---|---|
| `sim/`+`chars/` (os "cinco") | `world.ts` `weakestEnemy`, `vex.ts` mergulho/Predador/Fantasma, `golem.ts` Casca | decisão, cobertas pelo hash |
| `bot/` | `heuristic.ts` `peso()` e `heuristic.ts` política de fuga | **decisão**, fora do hash |
| `client/` | `render.ts` ×2 | cosmético |

O que importa: **`peso()` é o único dos nove sem degrau.** É contínuo —
`peso = 1 + PESO_FERIDO × (1 − frac)` com `PESO_FERIDO = 1.0` —, somado por `valorEsperado()` sobre
todos os inimigos vivos para escolher quando/onde castar. Medido: com REL-001 vivo, um vex `+100%`
`maxHp` tinha peso **1,500** contra 1,000 de quem não comprou nada, **desde o tick 0**; a `+50%`,
1,333. Todos os outros oito têm limiar, e o vex a `+50%` fica abaixo de todos eles — logo `peso()`
é provavelmente o mecanismo dominante da inversão de sinal de 50pp que §1.3 mediu, e ele não está
no documento.

**Why:** §1.3 explica a inversão listando cinco gatilhos de degrau, e conclui que "o sinal depende
de qual dos cinco domina, o que só é medível". Com um nono leitor contínuo na conta, a explicação
muda de forma: existe um termo que morde SEMPRE, proporcional ao bônus comprado.

**How to apply:** quando `e3.6` medir a Couraça e sobrar resíduo de sinal, `peso()` é o primeiro
suspeito, não o último. Antes de reescrever §1.3, refazer o grep — o censo é barato de confirmar e
eu já errei o número uma vez. Ver [[fase3-loop-pendencias]] e [[medir-antes-de-propor]].
