---
name: fase3-loop-pendencias
description: Estado da Fase 3 (E3 — Loop) do Battle Balls — quais ressalvas R-01..R-07 o usuário já resolveu, quais seguem abertas, e o que cada gate meu deixou como entrada bloqueante da story seguinte
metadata:
  type: project
---

Fase 2 (arnês) fechou em 2026-07-29. Fase 3 autorizada, arquitetada
(`docs/architecture-e3.md`), 8 stories `e3.0`-`e3.7` criadas. **Três fechadas em 2026-07-30, gates
meus, as três CONCERNS, as três com golden hash intacto:**

- **`e3.0`** (REL-001, `hp` nasce de `stat.maxHp`) — `docs/qa/gates/e3.0-rel001-hp-de-stat-maxhp.yml`
- **`e3.1`** (`src/shop/`) — `docs/qa/gates/e3.1-shop-catalogo-agregar.yml`. A-10 pago.
- **`e3.2`** (`src/match/`: tipos, redutor `aplicar`, `setupDaRodada`, Bo5+D-02, economia, `visaoPara`,
  e `src/tools/partida.ts` com o replay de partida) —
  `docs/qa/gates/e3.2-match-tipos-reducer-bo5-economia.yml`. ARCH-E31-003 **fechado dos dois lados**.

**A corrente de entradas bloqueantes funciona e é o padrão a manter:** cada gate meu deixa UMA
obrigação nomeada para o gate da story seguinte, e o gate seguinte exige a **aresta medida**, não a
existência do artefato. ARCH-E31-003 → cobrado e pago em `e3.2`. **Aberta agora: ARCH-E32-001 é
entrada bloqueante do gate de `e3.3`.**

**As outras 5 stories (`e3.3`-`e3.7`) seguem em `Ready`.**

**Achados de `e3.2` que não morrem com a story:**

1. **ARCH-E32-001 — a medição de M-1 no `sim:check` está confundida.** `medirM1` compara
   `createBot(s1)` novo contra `createBot(s0)` sujo: muda seed E sujeira juntas. Medi em 8 seeds —
   **um bot limpo com `s0` já diverge de um limpo com `s1` em 8/8**, então o ramo de falha da guarda
   é inalcançável e a linha "contamina em 3/3" não mede o que afirma. A invariante **é verdadeira**
   (com a seed controlada, limpo × sujo diverge 8/8; e com o `rand` igualmente avançado, zerar
   `porBola` ainda muda 8/8 — os relógios absolutos são causa real). Conserto: ~4 linhas.
2. **ARCH-E32-002 — o redutor não é robusto a `Decisao` malformada**, e `match/` é a camada que a
   Fase 4 expõe à rede. `abilityIndex: 99` é ACEITO, atravessa `setupDaRodada` (que valida `charId` e
   `itens` mas não os índices) e a rodada roda até o fim com saída plausível — o modo de falha de
   ARCH-E30-002 por outro campo do mesmo `PickSetup`. `{t:'pronto', jogador:-1}` polui `prontos` com
   chave que o `JSON` descarta. Para `e3.4` / Fase 4.

**Resolvidas pelo usuário em 2026-07-29** (anotadas em `architecture-e3.md` §14): R-01 → opção B
(estrutura de draft completa, composição fixa `[golem,vex]`); R-02 → item **por personagem**;
R-03 → loja **só entre rodadas**; R-06 → alternar o lado do jogador por rodada.

**Seguem abertas:** R-04 (renda das rodadas 6 e 7), R-05 (morte súbita em 0% mesmo a `maxHp × 3,0`),
R-07 (RF-36 nunca instrumentado). **Da Fase 2 segue aberta** a R-03 *daquele* documento (o que
"28 confrontos" significa) — precisa estar decidida antes de P5.1. Cuidado: `architecture-e2.md` e
`architecture-e3.md` têm cada um um R-03 diferente.

**Erratas minhas, corrigidas por mim nos gates:** `architecture-e3.md` §7.2 e §7.3 (no gate de
`e3.1`); `DEVELOPMENT-BIBLE.md` §7.5 (no gate de `e3.2` — ver [[reprodutibilidade-nao-e-valor]]).
Em `e3.2` **não achei erro meu** nas §2, §3, §4, §5 e §6.

**Why:** o portão da Fase 3 é julgamento humano ("dá vontade de jogar outra partida?"), e decisões
que não são de arquitetura precisam de dono antes de as stories que dependem delas serem
implementadas.

**How to apply:** antes de sugerir implementação da Fase 3, conferir em `architecture-e3.md` §14 se
a pendência que a cobre já foi respondida. Antes de abrir um gate de `e3.N`, ler o gate de `e3.N-1`
e cobrar a entrada bloqueante que ele deixou. Ver [[devolver-decisoes-de-produto]],
[[medir-antes-de-propor]] e [[development-bible]].
