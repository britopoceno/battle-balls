---
name: projeto-battle-balls-estado
description: Battle Balls passou os portões de E0/E1/E2; a Fase 3 (Loop) está autorizada e arquitetada mas com zero código (snapshot 2026-07-29)
metadata:
  type: project
---

Em 2026-07-29:

- **E0 (Núcleo), E1 (Sensação), E2 (Arnês)** — portões **passados**. E0 e E1 por julgamento humano;
  E2 por verificação (mutante Vex +30% dmg detectado a 79,00%, controle 50,10%, n=3000).
- **E3 (Loop)** — **desbloqueada** (a dívida C2/C3 foi paga em `debt.0`-`debt.7`), arquitetada em
  `docs/architecture-e3.md`, quebrada em 8 stories `e3.0`-`e3.7` todas `Ready`, **nenhuma
  implementada** (`src/` não tem `match/` nem `shop/`).
- **E4/E5/E6** — não iniciadas.

**Decisões que o usuário fechou em 2026-07-29** (R-01..R-06 de `architecture-e3.md` §14): draft com
estrutura completa mas composição fixa `[golem,vex]` até a Fase 5; item **por personagem**; loja
**só entre rodadas** (não antes da R1); **alternância de lado** por rodada para cancelar o viés de
54,72% do time 0.

**Segue aberto, e não se chuta valor:** D-05 (o valor da mediana-alvo — a faixa 25-35s está
aprovada), D-09 (preços/renda/juros, todos provisórios marcados), R-05 (morte súbita a 0% mesmo com
HP ×3 — decide depois de P3.2), R-04 (agregação do Risco #1b → Fase 5), R-03 ("28 confrontos" →
antes de P5.1), C4 (teto de 150s).

**Why:** o método é fases com portão (decisão #15) e a Fase 3 é a primeira que **muda o jogo de
propósito** — o hash de referência deixa de ser o juiz da fase e passa a ser o juiz de cada passo,
com uma única story autorizada a movê-lo (o ajuste de D-05).

**How to apply:** existe um **GDD consolidado em `docs/GDD.md`** (síntese de leitura única, escrito
2026-07-29) — ler ele antes de vasculhar as 5 fontes. Para o detalhe canônico, a ordem segue
`docs/brief.md` → `DESIGN.md` → `docs/prd.md` → `README.md`. Esta memória congela 2026-07-29 e
envelhece rápido: confirmar status em `docs/prd.md` §2 e nos status das stories antes de agir.
Ver [[feedback-decisoes-travadas]].
