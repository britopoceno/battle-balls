---
name: development-bible
description: docs/DEVELOPMENT-BIBLE.md é a síntese de engenharia do Battle Balls — leia antes de reconstruir contexto a partir das 3 arquiteturas e 25 stories
metadata:
  type: project
---

`docs/DEVELOPMENT-BIBLE.md` existe desde 2026-07-29 e é o ponto de entrada de engenharia:
invariantes (I-1..I-15), camada de stats, Pilar 3, bot, arnês, golden hash, processo de QA
observado, glossário técnico, dívida consolidada e — §13 — as inconsistências registradas entre
os 3 documentos de arquitetura e o código.

Divisão de autoridade com o documento irmão: **`docs/GDD.md` é jogo** (visão, mecânicas,
personagens, economia como design); **a Bíblia é engenharia**. O GDD delega explicitamente os
termos de engenharia para ela (GDD §13).

**Why:** reconstruir esse contexto lendo `architecture.md` + `-e2` + `-e3` + 25 stories custa
muito e produz leituras divergentes; a Bíblia foi escrita para ser leitura única.

**How to apply:** ao entrar numa sessão nova deste projeto, ler a Bíblia primeiro e só descer
para o documento de arquitetura da fase quando precisar do detalhe. **Ela reflete `src/` em
2026-07-29** — antes de recomendar algo com base nela, confirmar no código, e se divergir,
atualizar a §13 em vez de agir sobre a memória. Ver [[medir-antes-de-propor]].
