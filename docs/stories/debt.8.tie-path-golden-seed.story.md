# Story debt.8: seed de empate pinada em `BASELINE` — restaura a cobertura de `winner === -1` (TEST-102)

## Status

InReview

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run check", "npm run sim:check (golden hash das 10 entradas existentes idêntico + nova entrada de empate batendo)", "revisão manual: git diff --stat restrito a src/tools/ (nada em src/sim/ ou src/chars/tuning.ts)"]
```

## Story

**Como** desenvolvedor que depende do `sim:check` como única fonte de verdade sobre regressão comportamental
da simulação (`docs/architecture.md` §6.0; D-02, `docs/prd.md` §5),
**eu quero** que o caminho de empate (`winner === -1`, produzido por `checkEnd` em `src/sim/world.ts`) volte a
ter uma entrada golden pinada — achada por **busca** sob a sintonia atual de D-05 (`ESCALA_HP = 6.0`), não por
re-tunar o jogo nem por inventar um número —,
**para que** uma regressão futura que quebre esse ramo do motor seja pega pelo `sim:check` de verdade, em vez
de continuar invisível como está desde o re-baseline de `e3.6`.

## Depende de

`e3.6` (Done, gate **WAIVED** — `docs/qa/gates/e3.6-ajuste-d05-tuning.yml`). É o gate de `e3.6` que abre esta
story. O achado `TEST-102` (severidade medium) diz, verbatim:

> O caminho de empate da simulação (winner === -1, D-02) perdeu TODA a cobertura de regressão fixada: a seed
> 11 do BASELINE era deliberada para exercitá-lo e agora grava winner 1; nenhuma entrada de
> BASELINE/BUILD_BASELINE empata; o espelho 2v2 reporta empate 0 (7 em ×1.0); e o teste "empate → 4/4" do
> match é sintético (registra o VALOR no redutor, não simula uma rodada que termina −1). Sinalizado
> honestamente pelo @dev em determinism.ts, mas sem follow-up criado — a mesma forma de rot de
> ARCH-E32-001/TEL-E35-003.

E o `suggested_action` do mesmo achado, que é o mandato literal desta story:

> Criar debt story: achar uma seed que empate sob ESCALA_HP=6.0 (ou fixture de timeout forçado via
> MAX_ROUND_MS) para re-fixar winner === -1 no caminho real da sim, e considerar afirmar empates >= 1 no
> espelho para a rede não sumir de novo em silêncio.

[Fonte: `docs/qa/gates/e3.6-ajuste-d05-tuning.yml`, achado `TEST-102`]

Não depende funcionalmente de `debt.7` — a migração de arquitetura de 8 passos (`debt.0`-`debt.7`) já está
fechada (todas `Done`) e esta story não a continua. Mas herda o mesmo arquivo que `debt.7` estruturou
(`rodarComGravacao`/`rodarReplay`, `RoundDriver`) e cujo `BASELINE`/`BUILD_BASELINE` `e3.6` re-gravou por
último — qualquer mudança aqui soma-se a esse histórico, não o substitui.

## Acceptance Criteria

1. `npm run check` (`tsc --noEmit`) permanece verde, zero erros novos.

2. `npm run sim:check` permanece **totalmente** verde, e os 10 valores hoje pinados não mudam **um dígito** —
   confirmado por comparação campo a campo, não por "parece igual":

   | seed | hash | ticks | winner |
   |---|---|---|---|
   | 1 | `327b60f3` | 4110 | 1 |
   | 2 | `6c9ec9a8` | 4177 | 0 |
   | 3 | `adfceac2` | 4099 | 0 |
   | 7 | `cdd32326` | 3972 | 1 |
   | 11 | `5904fbe4` | 4279 | 1 |

   | label (`BUILD_BASELINE`) | seed | hash | ticks | winner |
   |---|---|---|---|---|
   | golem Tremor (ability1) | 101 | `dbb0d9cb` | 3197 | 1 |
   | golem Casca (passive1) | 102 | `3fec7f2c` | 4247 | 0 |
   | vex Deslize (ability1) | 103 | `acbd87c3` | 3882 | 0 |
   | vex Fantasma (passive1) | 104 | `9c156606` | 4347 | 0 |
   | golem Casca + vex Fantasma | 105 | `9636d92d` | 4576 | 0 |

   [Fonte: `src/tools/determinism.ts:100-141`, conferido nesta sessão de draft com `npm run sim:check`]

3. Uma nova entrada golden para o caminho de empate (`winner === -1`) é adicionada, exercitada pelo caminho
   **real** da simulação — `createWorld` + laço de `step` até o fim natural (seja duplo-KO no mesmo tick, seja
   o teto `MAX_ROUND_MS`, `src/sim/world.ts:31`) — nunca por uma construção sintética de `ResultadoRodada`
   como a de `invarianteCompra` em `src/tools/partida.ts:786-793` (que fabrica `vencedor: -1` direto num
   objeto, para testar RF-23/economia, sem rodar `step` nenhuma vez). A entrada pina `seed` + `hash` + `ticks`
   + `winner: -1` e falha o `sim:check` — nomeando seed, campo, esperado e obtido, no mesmo contrato de erro
   já usado por `BASELINE`/`BUILD_BASELINE` — se qualquer um dos três divergir numa execução futura.

4. A seed (ou mecanismo) do AC 3 é achada por **busca** sob a sintonia atual de D-05 (`ESCALA_HP = 6.0`,
   `ESCALA_DMG = 1.0`, `src/chars/tuning.ts` intocado) — nunca escolhida a dedo ou estimada (Artigo IV — sem
   invenção). **Abordagem recomendada:** varrer seeds candidatas (fora das já reservadas — 1/2/3/7/11 do
   `BASELINE`, 101-105 do `BUILD_BASELINE`, 9001 da guarda BOT-001, 1-40 do espelho) até achar uma que produza
   `winner === -1` com o `TIME` padrão (`golem`+`vex`, `abilityIndex`/`passiveIndex` 0), e adicioná-la como 6ª
   linha de `BASELINE`. **Alternativa aceitável:** uma checagem de empate forçado dedicada dentro de
   `determinism.ts`, desde que também passe pelo caminho real de `step`/`checkEnd` (ex.: um cenário HP baixo
   configurado de forma a bater o teto `MAX_ROUND_MS` de propósito) — a escolha do mecanismo é do `@dev`; o
   que a story mandata é o **resultado** (empate real, pinado), não a técnica.

5. Nenhuma linha de `src/sim/` é tocada — nem `world.ts`, nem `checkEnd`, nem `MAX_ROUND_MS`/`SUDDEN_DEATH_MS`
   — mandato da Fase 3 (`docs/architecture-e3.md` §9.2: só `e3.0` foi autorizada a tocar `world.ts`).
   `src/chars/tuning.ts` também não é tocado — a busca acontece sob o valor de produto já fixado (`ESCALA_HP
   = 6.0`, decisão registrada no gate WAIVED de `e3.6`), não é uma segunda bissecção. A mudança fica inteira
   em `src/tools/` (idealmente só `determinism.ts`). Confirmável por `git diff --stat`.

6. A entrada nova traz um comentário explicando **como** foi achada (faixa de seeds varrida, quantas seeds
   até achar a primeira que empata) — não "deliberada" como o comentário original da seed 11 dizia. O
   comentário existente sobre a seed 11 (`determinism.ts:74-76` e o bloco de achado em `:93-98`) é corrigido/
   atualizado para não seguir afirmando que ela "exercita o caminho de empate", o que o re-baseline de `e3.6`
   tornou falso (`winner: 1` hoje).

7. **SHOULD, não bloqueante.** Avaliar se vale adicionar uma verificação de "pelo menos 1 empate" num bloco
   de execução mais longa, para a rede não sumir de novo em silêncio no futuro. Esta verificação **não pode**
   ser uma asserção ingênua sobre o bloco existente do espelho 2v2 de 40 seeds (`SEEDS = 40`,
   `determinism.ts:143`) tal como ele é hoje: medido nesta sessão de draft (`npm run sim:check`,
   2026-08-16), esse bloco reporta `empate 0` sob `ESCALA_HP = 6.0` — uma asserção `empates >= 1` ali
   quebraria o `sim:check` imediatamente, o que não é o objetivo desta story. Se implementada, a verificação
   deve incidir sobre um conjunto onde >=1 empate é garantido **por construção** (ex.: incluir a seed pinada
   do AC 3/4 na contagem, ou expandir a varredura até achar um segundo empate) — nunca uma aposta estatística
   sobre seeds não controladas. Se a decisão for não implementar, registrar o motivo — não deixar implícito.

8. O teste sintético de empate em `src/tools/partida.ts` (`invarianteCompra`, `vencedor: -1` fabricado num
   `ResultadoRodada` em `:786-793`) permanece como está — ele cobre RF-23 (vencer a rodada não dá ouro, e
   empate não pune), não o caminho de empate do motor. Fora de escopo; não precisa mudar.

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type**: Architecture
**Secondary Type(s)**: Integration (fronteira `tools/` → `sim/`, a mesma que `debt.0`/`debt.7` protegem)
**Complexity**: Low-Medium — uma entrada de tabela e um comentário, mas achar a seed exige busca real (sem
atalho) e a fronteira "nada em `sim/`" precisa de disciplina, não só de intenção

### Specialized Agent Assignment

**Primary Agents**:
- @dev
- @architect (dono do mandato "sim/ intocado" da Fase 3 e do golden hash, `docs/architecture-e3.md` §9.2)

**Supporting Agents**:
- (nenhum)

### Quality Gate Tasks

- [ ] Pre-Commit (@dev): `npm run check` e `npm run sim:check` — confirmar as 10 entradas existentes idênticas E a nova entrada de empate batendo
- [ ] Pre-PR (@github-devops): Rodar antes de criar pull request

### Self-Healing Configuration

**Expected Self-Healing**:
- Primary Agent: @dev (light mode)
- Max Iterations: 2
- Timeout: 15 minutes
- Severity Filter: CRITICAL

**Predicted Behavior**:
- CRITICAL issues: auto_fix (até 2 iterações)
- HIGH issues: document_only

### CodeRabbit Focus Areas

**Primary Focus**:
- Os 10 valores existentes de `BASELINE`/`BUILD_BASELINE` batem byte a byte — confirmar por execução, não por leitura do diff
- A nova seed de empate foi **achada por busca**, não escolhida — o comentário precisa mostrar o processo (faixa varrida, contagem), não só afirmar "empata"
- `git diff --stat` não toca `src/sim/` nem `src/chars/tuning.ts`

**Secondary Focus**:
- O comentário obsoleto da seed 11 é corrigido, não deixado a afirmar algo falso
- Se o AC 7 (SHOULD) for implementado, a asserção de empate não pode depender de sorte estatística sobre seeds não controladas

## Tasks / Subtasks

- [x] Task 1 — Localizar seed(s) candidata(s) por busca (AC: 3, 4)
  - [x] Escrever um scanner (script standalone em `src/tools/`, ou execução ad-hoc reaproveitando `rodar(seed)` já existente em `determinism.ts`) que testa seeds fora das já reservadas (1/2/3/7/11, 101-105, 9001, 1-40) com o `TIME` padrão, até achar uma que retorne `winner === -1`
  - [x] Registrar, a partir da execução real, quantas seeds foram varridas até achar a primeira (não estimar)
  - [x] Confirmar reprodutibilidade: rodar a seed achada duas vezes e conferir hash/ticks idênticos entre as execuções (mesmo critério do bloco de autoconsistência)

- [x] Task 2 — Pinar a entrada golden (AC: 3, 5, 6)
  - [x] Adicionar a seed achada como 6ª linha de `BASELINE` com `{ seed, hash, ticks, winner: -1 }` (ou implementar a checagem dedicada, se essa for a rota escolhida no AC 4)
  - [x] Escrever o comentário de origem (busca, faixa, contagem) e corrigir o comentário existente sobre a seed 11 que hoje afirma algo que `e3.6` tornou falso
  - [x] Confirmar que o laço de comparação existente (`for (const esperado of BASELINE)`, `determinism.ts:166-178`) cobre a nova linha sem mudança de lógica — só de dado

- [x] Task 3 — Confirmar a fronteira `sim/`/`tuning.ts` intocada (AC: 5)
  - [x] `git diff --stat` restrito a `src/tools/` (e ao arquivo desta story)
  - [x] Confirmar `ESCALA_HP`/`ESCALA_DMG` em `src/chars/tuning.ts` inalterados (6.0 / 1.0)

- [x] Task 4 — Avaliar o SHOULD do AC 7 (AC: 7)
  - [x] Decidir se vale implementar uma rede de "empates >= 1" sobre um conjunto com garantia por construção; registrar a decisão e o motivo, seja qual for
  - [x] Se implementado: confirmar que o conjunto escolhido inclui a seed do AC 3/4 (ou outro mecanismo que garanta >=1 empate sem depender de sorte)
  - [x] Se não implementado: registrar o motivo na Dev Agent Record, não deixar implícito

- [x] Task 5 — Verificação final (AC: 1, 2, 3, 5)
  - [x] `npm run check` — 0 erros
  - [x] `npm run sim:check` — as 10 entradas existentes idênticas às do AC 2, a nova entrada de empate batendo, resto do relatório verde (determinismo 40/40, build coverage, replay, bot dupla execução, bot replay, guarda BOT-001, catálogo, replay de partida Bo5, Pilar 3)
  - [x] Teste negativo manual (mesmo padrão de `debt.0`): corromper um dígito da nova entrada e confirmar que o script lança erro nomeando seed/campo/esperado/obtido; restaurar em seguida

## Dev Notes

### Por que esta story existe — o achado, na fonte

`TEST-102` foi registrado pelo `@qa` no gate `WAIVED` de `e3.6`, mas a raiz já estava documentada pelo
próprio `@dev` no código, em `src/tools/determinism.ts:74-76` (comentário do `BASELINE`):

> A seed 11 é deliberada: exercita o caminho de empate (winner === -1), que é o que a decisão D-02
> (`docs/prd.md` §5) regulamenta.

E, mais abaixo, no bloco adicionado pelo re-baseline de `e3.6` (`determinism.ts:93-98`):

> Achado registrado, não corrigido aqui: a seed 11 era deliberada para exercitar o caminho de EMPATE
> (winner === -1, ver comentário acima). Neste re-baseline ela não empata mais (winner: 1) — a cobertura do
> caminho de empate perdeu a seed que a garantia. Não é escopo desta story achar uma seed substituta [...]
> fica para quem tocar BASELINE a seguir confirmar se algum caminho ainda exercita winner === -1, ou se a
> Fase 3 perdeu essa rede sem perceber.

A própria story `e3.6` repete o achado na seção "Achado — seed 11 perdeu a cobertura do caminho de empate"
(`docs/stories/e3.6.ajuste-d05-tuning.story.md`), incluindo o dado do espelho: `empate 7` em 40 seeds sob
`ESCALA_HP = 1.0` (pré-`e3.6`), `empate 0` sob `ESCALA_HP = 6.0` (pós-`e3.6`, confirmado de novo nesta sessão
de draft — ver abaixo).

[Fonte: `src/tools/determinism.ts:74-98`; `docs/stories/e3.6.ajuste-d05-tuning.story.md` §"Achado — seed 11
perdeu a cobertura do caminho de empate"; `docs/qa/gates/e3.6-ajuste-d05-tuning.yml`, achado `TEST-102`]

### Onde `winner === -1` nasce (fonte: `src/sim/world.ts`)

```ts
// src/sim/world.ts
export const SUDDEN_DEATH_MS = 60_000       // linha 28 — abre encolhimento de arena, não decide fim
const MAX_ROUND_MS = 150_000                // linha 31 — "trava dura: se ninguém morreu até aqui, é empate"

function checkEnd(world: World): void {
  const alive0 = world.balls.some((b) => b.alive && b.team === 0)
  const alive1 = world.balls.some((b) => b.alive && b.team === 1)
  if (alive0 && alive1 && world.time < MAX_ROUND_MS) return
  world.over = true
  world.winner = alive0 === alive1 ? -1 : alive0 ? 0 : 1   // duplo-KO OU duplo-vivo no teto ⇒ -1
  world.events.push({ t: 'roundEnd', winner: world.winner })
}
```

Dois caminhos legítimos para `winner === -1`: (a) os dois times ficam sem bola viva no **mesmo tick**
(duplo-KO — raro, mas possível por dano simultâneo), ou (b) `world.time >= MAX_ROUND_MS` com pelo menos uma
bola viva de cada lado (teto de tempo — o caminho que `SUDDEN_DEATH_MS` só torna mais provável, encolhendo a
arena, sem forçá-lo). `SUDDEN_DEATH_MS` **não** decide o fim sozinho — só abre o encolhimento; quem decide é
sempre `checkEnd`. Nenhuma destas linhas deve ser tocada por esta story (AC 5).

[Fonte: `src/sim/world.ts:25-31,610-617`]

### A sintonia atual — por que não é uma segunda bissecção

```ts
// src/chars/tuning.ts
export const ESCALA_HP = 6.0
export const ESCALA_DMG = 1.0
```

Este valor é decisão de **produto**, fixada no gate `WAIVED` de `e3.6` ("Não tem problema algum o
sudden-death, gostei da escala HPx6.0" — usuário, citado verbatim no Dev Agent Record de `e3.6` e no commit
`13ee9d8`). Esta story busca uma seed que empate **sob este valor**, não questiona nem re-bissecta o valor —
`e3.6` foi "a ÚNICA story da Fase 3 autorizada a mover o golden hash" (`determinism.ts:82`), e essa
autorização não se estende aqui.

[Fonte: `src/chars/tuning.ts`; `docs/qa/gates/e3.6-ajuste-d05-tuning.yml`, seção `waiver`]

### Por que a busca é factível — e por que o número não pode ser copiado às cegas

O gate de `e3.6` mediu, na bateria de carona de T-3 (`--mutacao=vex:dmg:+0.30 --n=3000`, **bot heuristic**,
não `dummyDriver`): "9020 rodadas, mediana 67,0s, empates-por-teto 0,2%". Isso é evidência de que empate não é
um evento inexistente sob `ESCALA_HP = 6.0` — mas é uma taxa medida com o bot `heuristic`, sob mutação, não
uma previsão para o `dummyDriver` (o bot fixo e sem estado usado por `BASELINE`) nem para uma seed específica.
Não tratar "0,2%" como um número que se aplica diretamente à varredura desta story — é contexto de
plausibilidade, não uma garantia de quantas seeds serão necessárias. O número real vem de rodar a varredura
(AC 4, Task 1).

[Fonte: `docs/qa/gates/e3.6-ajuste-d05-tuning.yml`, verificação `T-3`]

### Custo de uma seed que empata — medido nesta sessão de draft

Reexecutei `npm run sim:check` durante o preparo desta story (2026-08-16). Saída relevante:

```
golden hash    ✓ ok — 5 seeds batem o baseline
build coverage ✓ ok — 5 variantes batem
espelho 2v2    time0 24 · time1 16 · empate 0   (esperado ~50/50)
duração        mediana 60.0s · min 52.1s · max 76.8s
```

`TICK_HZ = 60` ⇒ `TICK_MS ≈ 16,667ms` (`world.ts:25-26`). O teto `MAX_ROUND_MS = 150_000ms` equivale
exatamente a **9000 ticks** (`150000 / (1000/60)`). A mediana atual do bloco espelho (`dummyDriver`, 40
seeds) é 60,0s — na faixa de **~3600 ticks**. Uma seed que só termina no teto roda até 9000 ticks, cerca de
**2,5× a duração mediana atual** — sensivelmente mais lenta do que uma seed comum. Isso não bloqueia nada,
mas é uma seed "cara" de rodar: se a varredura da Task 1 percorrer muitas seeds, e algumas delas também
estourarem o teto sem empatar de fato (o que não deveria acontecer, já que estourar o teto COM pelo menos uma
bola viva de cada lado é justamente o critério de empate — mas vale medir na prática, não assumir), o custo
de tempo de execução do scanner pode não ser desprezível. Vale rodar o scanner separado do `sim:check`
principal, não embutido nele, para não pagar esse custo em toda execução de CI/dev enquanto a varredura ainda
está em andamento.

[Fonte: `src/sim/world.ts:25-26,31`; saída de `npm run sim:check` reexecutada nesta sessão]

### O teste sintético que NÃO cobre isto (fora de escopo, AC 8)

```ts
// src/tools/partida.ts:786-793 — dentro de invarianteCompra()
const fake = (indice: number): ResultadoRodada => ({
  indice,
  seedDaRodada: 1,
  ladoDoJogador: [0, 1],
  vencedor: -1,        // fabricado direto, nenhum step() rodou
  ticks: 600,
  hash: 'bbbbbbbb',
})
```

Este teste prova a invariante de economia RF-23 (vencer rodada não dá ouro; empate não pune) alimentando o
redutor de partida com um `ResultadoRodada` fabricado — é útil e correto para o que testa, mas não passa pelo
motor (`step`/`checkEnd`) nenhuma vez. É exatamente o gap que `TEST-102` aponta: "o teste 'empate → 4/4' do
match é sintético (registra o VALOR no redutor, não simula uma rodada que termina −1)". Não mexer nele — ele
não é o alvo desta story.

[Fonte: `src/tools/partida.ts:779-793`; `docs/qa/gates/e3.6-ajuste-d05-tuning.yml`, achado `TEST-102`]

### Onde mexer

`src/tools/determinism.ts` — único arquivo de deliverable esperado, salvo se o `@dev` optar pela alternativa
de checagem dedicada do AC 4, que também mora aí. Um scanner auxiliar (Task 1) pode existir como script
descartável durante o desenvolvimento — não precisa virar parte permanente do repositório, a não ser que o
`@dev` julgue valioso mantê-lo (nesse caso, documentar o motivo).

### Testing

- `npm run check` — 0 erros.
- `npm run sim:check` — as 10 entradas existentes de `BASELINE`/`BUILD_BASELINE` idênticas ao AC 2, mais a
  nova entrada de empate batendo hash+ticks+winner; resto do relatório (determinismo 40/40, replay, bot
  dupla execução, bot replay, guarda BOT-001, catálogo, replay de partida Bo5, Pilar 3) inalterado.
- Teste negativo (mesmo padrão de `debt.0`): corromper um dígito da nova entrada golden e confirmar que o
  script nomeia seed/campo/esperado/obtido e sai com erro; restaurar depois.
- `git diff --stat` conferido para garantir que nada em `src/sim/` ou `src/chars/tuning.ts` foi tocado.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-08-16 | 1.0 | Story criada a partir do achado `TEST-102` do gate `WAIVED` de `e3.6` (`docs/qa/gates/e3.6-ajuste-d05-tuning.yml`) e do comentário já existente em `src/tools/determinism.ts` sobre a seed 11. | River (@sm) |
| 2026-08-16 | 1.1.0 | Validated GO (9/10) — Status: Draft → Ready. **Os 10 valores do AC 2 foram reconferidos campo a campo contra `src/tools/determinism.ts` no HEAD (não contra a prosa da story): as 5 linhas de `BASELINE` (`:101-105`) e as 5 de `BUILD_BASELINE` (`:136-140`) batem seed, hash, ticks e vencedor exatamente, incluindo os rótulos das variantes.** Todas as referências de linha citadas existem onde alegado: `world.ts:28` `SUDDEN_DEATH_MS = 60_000`, `world.ts:31` `const MAX_ROUND_MS = 150_000` (não exportado — ver ressalva abaixo), `world.ts:610-617` `checkEnd` (o bloco transcrito na Dev Notes é fiel linha a linha), `world.ts:25-26` `TICK_HZ`/`TICK_MS`, `partida.ts:779-793` `invarianteCompra` com o `ResultadoRodada` fabricado em `:786-793` (`vencedor: -1`, `ticks: 600`, `hash: 'bbbbbbbb'` — verbatim), `determinism.ts:74-76` (comentário "a seed 11 é deliberada"), `:82` (a exceção de `e3.6`), `:93-98` (o achado do @dev), `:143` (`SEEDS = 40`), `:166-178` (o laço de comparação, que é dirigido por dado e cobre uma 6ª linha sem mudança de lógica — Task 2 está certa). Lista de seeds reservadas do AC 4 correta e completa para o alcance da story: 1/2/3/7/11 (`BASELINE`), 101-105 (`BUILD_BASELINE`), 9001 (`SEED_GUARDA`, `:347`), 1-40 (espelho). **Artigo IV — nenhum AC inventa número:** `ESCALA_HP = 6.0`/`ESCALA_DMG = 1.0` conferidos em `tuning.ts:10-11`; os 9000 ticks do teto são derivação correta de `150_000 / (1000/60)`; o espelho "24 · 16 · empate 0" da sessão de draft bate com o gate de `e3.6` ("Espelho 2v2: 24-16-0"); "empate 7 em ×1.0" tem **duas** fontes independentes (gate `REQ-006` e PRD §5/D-02, "7 de 40 rodadas (17,5%) — todos duplo-KO"); a citação de `TEST-102` e do `suggested_action` é verbatim; e o "0,2% de empates-por-teto" está corretamente rotulado como contexto de plausibilidade do `heuristic` sob mutação, **não** como previsão para o `dummyDriver` — exatamente a disciplina que o Artigo IV pede. **Executabilidade do AC 3 conferida no código, e ela não era óbvia:** `runRound` tem teto próprio, `MAX_ROUND_TICKS = 60 * 180 = 10800` (`harness.ts:20,68`), acima dos 9000 ticks em que `checkEnd` declara empate — o caminho de empate por teto **é alcançável** através de `rodar()`, com 1800 ticks de folga. **Ressalva que o @dev precisa ver antes de implementar o AC 7:** `createWorld` inicializa `world.winner = -1` (`world.ts:76`), então `winner === -1` sozinho **não** discrimina empate real de rodada que saiu do laço sem `over` — o que fecha esse buraco é justamente o AC 3 exigir `hash` + `ticks` pinados junto do vencedor. Uma contagem de empates que teste só `winner === -1` (a forma do bloco do espelho, `:157-159`) herdaria o mesmo modo de falha silenciosa que a story existe para corrigir. **Should-Fix não bloqueante, registrado sem emendar o AC:** o exemplo da "alternativa aceitável" do AC 4 está invertido — "cenário HP baixo" **encurta** a rodada e afasta do teto de 150s; para bater o teto é preciso o contrário (HP alto ou dano baixo), e o caminho limpo existe sem tocar `sim/`, porque `createWorld(chars, setup)` e `runRound(chars, ...)` recebem o registro de personagens por parâmetro (`world.ts:62`, `harness.ts:61-66`) — dá para injetar um `CHARS` inflado de dentro de `tools/`. Somado a isso: `MAX_ROUND_MS` **não é exportado**, então a alternativa não pode referenciar a constante, e exportá-la violaria o AC 5, que a nomeia explicitamente como intocável. Nada disso bloqueia: o AC 4 delega o mecanismo ao @dev e a rota primária (varredura de seeds) é inequívoca. **Imprecisão de citação (única dedução real):** o AC 5 atribui a `architecture-e3.md` §9.2 a frase "só `e3.0` foi autorizada a tocar `world.ts`" — o mandato existe e é verdadeiro, mas mora em **§9.1** ("`sim/` permanece intocado por toda a fase — só o passo 0 (REL-001) encosta em `world.ts`"); §9.2 trata da autorização de mover o **hash**, que a story cita corretamente noutro ponto. Confirmado que **nenhum AC exige tocar `src/sim/` ou `src/chars/tuning.ts`**, e que o AC 7 acerta ao proibir a asserção ingênua sobre o espelho (ela quebraria o `sim:check` na hora, com `empate 0` hoje). Escopo IN/OUT explícito, dependência de `e3.6` correta, AC 8 corretamente fora de escopo. | @po (Pax) |
