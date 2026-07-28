# Story debt.7: `deriveSeed`, `WorldView`, teste de replay — resolve D-08

## Status

Draft

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: ["npm run check (a Regra 1 é forçada pelo compilador — tsc é o próprio teste)", "npm run sim:check"]
```

## Story

**Como** desenvolvedor executando o passo 7 — o último passo de preparação, resolve **D-08**
(`docs/prd.md` §5: bot recebe stream de PRNG próprio, semeado a partir da seed da partida),
**eu quero** adicionar `deriveSeed` a `sim/rng.ts`, o tipo `WorldView` (que oculta `rng` do bot **por tipo**,
não por convenção) e um teste de replay que prova isolamento de RNG,
**para que** o stream de PRNG do bot seja estrutural e verificável — impossível de violar sem erro de
compilação — antes de a Fase 2 escrever o bot de verdade.

## Depende de

`debt.6` (Done) — último passo de preparação; todos os anteriores precisam estar `Done` para este ser o
fechamento do épico de 8 passos (0-7). O passo 8 (camada de itens) **não** é escopo desta story nem deste
épico — é a Fase 3, tratada como próximo épico separado.

## Acceptance Criteria

1. `npm run check` (`tsc --noEmit`) verde.
2. `npm run sim:check` verde: autoconsistência 40/40, baseline das 5 seeds, **e** o novo teste de replay
   passando (ver AC 7).
3. Golden hash **idêntico** ao baseline de `architecture.md` §6.0 (seeds 1, 2, 3, 7, 11) — "o `dummy` não
   usa rng" (`architecture.md` §6.1), então a mudança é puramente estrutural/de tipo, sem efeito em tempo de
   execução hoje.
4. `sim/` continua puro: sem `Math.random`, sem DOM, sem I/O, sem importar de `chars/`, `bot/`, `client/`.
5. `sim/rng.ts` ganha `deriveSeed(seed: number, streamId: number): number`, mistura splitmix32 (ver nota de
   pendência de implementação em Dev Notes — a arquitetura não fecha os bit-ops exatos).
6. `sim/types.ts` ganha `export type WorldView = Omit<World, 'rng'>`. `dummyCommands` (`src/bot/dummy.ts`)
   passa a receber `WorldView` em vez de `World` — tentar chamar `.rng()` a partir daí é erro de compilação,
   não uma violação descoberta em code review depois.
7. Teste de replay (regra 3 de `architecture.md` §5.2) adicionado ao `sim:check`:
   (i) roda a partida com o bot, gravando `Command[]` por tick;
   (ii) recria o mundo com a **mesma seed** e reproduz os comandos gravados, **sem bot algum**;
   (iii) `hash(i) === hash(ii)`.
   Roda para as 5 seeds do baseline no mínimo.
8. Tabela de streams reservados (id 0 simulação, 1 bot time 0, 2 bot time 1, 3 cliente/efeitos visuais nunca
   afeta a simulação, 4+ reservado) documentada como comentário perto de `deriveSeed` — mesmo que nada além
   da simulação consuma um stream ainda (nenhum personagem chama `ctx.rand` hoje).
9. Invariante registrada, sem necessidade de enforcement automático nesta story: `world.balls` nunca é
   reordenado por valor (sem `sort` por HP, distância ou dano) — confirmado por revisão que nenhum código
   atual viola isso.

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type**: Architecture
**Secondary Type(s)**: Integration (fronteira `bot → sim`)
**Complexity**: Medium — poucas linhas de tipo/infra, mas o teste de replay é uma peça nova de verificação

### Specialized Agent Assignment

**Primary Agents**:
- @dev
- @architect (dono do design de isolamento de RNG e do teste de replay)

**Supporting Agents**:
- (nenhum)

### Quality Gate Tasks

- [ ] Pre-Commit (@dev): `npm run check` (a garantia de tipo é o próprio teste da Regra 1) e `npm run sim:check`
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
- `WorldView` de fato oculta `rng` — confirmar por tipo, não por teste em runtime, que `dummyCommands` não pode chamar `.rng()`
- O teste de replay usa a mesma seed nos dois lados e compara hash, não só "não lançou erro"

**Secondary Focus**:
- `Omit` é raso — `view.balls[0].hp` continua mutável; aceito por ora (ver Dev Notes), não tentar consertar nesta story
- Nenhum `sort()` por valor sobre `world.balls` no código atual

## Tasks / Subtasks

- [ ] Task 1 — `deriveSeed` em `sim/rng.ts` (AC: 5, 8)
  - [ ] Assinatura: `export function deriveSeed(seed: number, streamId: number): number`
  - [ ] Implementar mistura splitmix32 (ver nota de pendência em Dev Notes)
  - [ ] Comentário com a tabela de streams reservados (ids 0-4+)

- [ ] Task 2 — `WorldView` em `sim/types.ts` (AC: 6)
  - [ ] `export type WorldView = Omit<World, 'rng'>`

- [ ] Task 3 — Atualizar a assinatura de `dummyCommands` (AC: 6)
  - [ ] `src/bot/dummy.ts`: `dummyCommands(world: World, team: Team)` → `dummyCommands(view: WorldView, team: Team)`
  - [ ] Ajustar os pontos de chamada (`src/tools/determinism.ts`, `src/tools/inspect.ts`) para o novo nome de parâmetro (o tipo `World` já satisfaz `WorldView` estruturalmente, então a chamada em si não deveria precisar de conversão explícita — confirmar com `tsc`)
  - [ ] Confirmar que `dummyCommands` não referencia `.rng` em nenhum ponto (hoje não referencia — "Determinístico: não consome RNG e depende só do estado do mundo", comentário já existente em `dummy.ts:7`)

- [ ] Task 4 — Teste de replay (AC: 7)
  - [ ] Em `src/tools/determinism.ts` (ou função auxiliar): rodar a partida normalmente, gravando `Command[]` produzido a cada tick (`dummyCommands` para os dois times)
  - [ ] Recriar o mundo com a mesma seed, e no laço de `step`, passar os comandos **gravados** em vez de chamar `dummyCommands` de novo
  - [ ] Comparar `hash(mundo com bot) === hash(mundo com replay gravado)` para cada seed testada
  - [ ] Rodar para as 5 seeds do baseline no mínimo; reportar falha nomeando a seed, igual ao padrão de `debt.0`

- [ ] Task 5 — Documentar a invariante de não-reordenação (AC: 9)
  - [ ] Revisar `world.ts`/`physics.ts` e confirmar que nenhum `.sort(` é aplicado sobre `world.balls` (ou cópia usada para decisão que afete o resultado)
  - [ ] Registrar a invariante como comentário perto da declaração de `World.balls` em `sim/types.ts`: nunca reordenar por valor; se necessário, ordenar cópia, sempre com desempate por `id`

- [ ] Task 6 — Verificação (AC: 1, 2, 3, 4)
  - [ ] `npm run check` — 0 erros
  - [ ] `npm run sim:check` — golden hash idêntico ao baseline, autoconsistência 40/40, teste de replay passando

## Dev Notes

### Onde `deriveSeed` nasce (fonte: `architecture.md` §5.1)

`sim/` **não pode** importar de `bot/` — invariante RF-19. Mas o bot precisa de uma seed derivada da seed da
partida. A direção permitida é `bot → sim`, então a função de derivação mora em `sim/rng.ts` e o bot a
consome:

```ts
// sim/rng.ts — adição
/** Deriva seeds descorrelacionadas de uma seed-mãe. Mistura splitmix32. */
export function deriveSeed(seed: number, streamId: number): number
```

**Tabela de streams reservados — escrita, não implícita:**

| id | Dono | Consumido por |
|---|---|---|
| 0 | `world.rng` — a simulação | `createWorld` (ruído de largada) e `ctx.rand` dentro de personagens |
| 1 | Bot do time 0 | jitter de mira, limiar de decisão |
| 2 | Bot do time 1 | idem |
| 3 | Cliente — efeitos visuais | **nunca** pode afetar a simulação |
| 4+ | Arnês, telemetria, geração de cenário | reservado |

**Nota de pendência de implementação — não inventar bit-ops que a arquitetura não especifica.**
`architecture.md` §5.1 dá a assinatura e diz "mistura splitmix32", mas não especifica as constantes exatas
(incremento, shifts). Implementar um splitmix32 padrão (ex.: incremento de Weyl `0x9e3779b9`, mix de
`splitmix32` de referência) é razoável e dentro do espírito do documento, mas **isto é uma escolha de
implementação do @dev, não uma especificação fechada pelo @architect** — se o @architect tiver uma
implementação de referência específica em mente, confirmar antes de commitar. O que importa para o teste
(AC 7) é que streams derivados de `streamId` diferentes não colidam nas seeds testadas — não a forma exata
do algoritmo.

**Nada consome `deriveSeed` de verdade nesta story.** `dummyCommands` (o bot placeholder da Fase 0) "não
consome RNG e depende só do estado do mundo" (comentário já existente em `dummy.ts:7`). `deriveSeed` é
infraestrutura para a Fase 2 (bot real, `docs/prd.md` E2), não tem consumidor nesta story além do próprio
teste de replay indireto. Isto é esperado — não é código morto sem propósito, é a infraestrutura entrando
antes de precisar, o que é exatamente o padrão dos passos 1-7 deste épico.

### Como o determinismo é preservado — três regras (fonte: `architecture.md` §5.2)

**Regra 1 (a boa) — o bot não recebe acesso ao `rng` da simulação. Não como convenção: como tipo.**

```ts
// sim/types.ts
export type WorldView = Omit<World, 'rng'>

// bot/
export function botCommands(view: WorldView, bot: BotState): Command[]
```

O bot deixa de receber `World` e passa a receber `WorldView`. Tentar chamar `world.rng()` vira **erro de
compilação**. O mesmo vale para `SimCtx`: o bot nunca o recebe, então `ctx.rand` também está fora de alcance
— isso já é verdade hoje (`dummyCommands` não recebe `SimCtx`), esta story só formaliza o lado de `World`.

*Ressalva técnica, registrada, não implementada nesta story:* `Omit` é raso. Um `DeepReadonly<WorldView>`
fecharia também a escrita acidental em `view.balls[0].hp`, ao custo de tipagem mais pesada. A recomendação
do @architect é **começar com `Omit` + a Regra 3** (que pega a violação em runtime, indiretamente, via
comparação de hash) **e endurecer só se aparecer um caso real** — não implementar `DeepReadonly` de saída.

**Regra 2 — o stream do bot avança por decisão, nunca por relógio.** `dummy.ts:11` já reage a cada N ticks
(estado determinístico). Fato relevante sobre o código atual: hoje **nada consome `world.rng` depois de
`createWorld`** — nenhum personagem chama `ctx.rand`. A simulação saca exatamente `4 × nBolas` números na
largada e nunca mais. Quando personagens começarem a usar `ctx.rand` (fora do escopo deste épico), a ordem
de consumo passará a depender da ordem de iteração de `world.balls` — daí a invariante da Task 5:

> **`world.balls` nunca pode ser reordenado por valor.** Nada de `sort` por HP, distância ou dano. Se
> alguma lógica precisar de ordem diferente, ela ordena uma **cópia**, sempre com desempate por `id` —
> porque `Array.prototype.sort` só é estável dentro de um mesmo engine, e a Fase 4 roda Node e Chrome ao
> mesmo tempo.

**Regra 3 — o teste de isolamento, escrevível hoje, antes de o bot existir.**

```
(i)   rodar a partida com o bot, gravando Command[] por tick
(ii)  recriar o mundo com a MESMA seed e reproduzir os comandos gravados, sem bot algum
(iii) hash(i) === hash(ii)
```

Se o bot estivesse sacando de `world.rng`, o passo (ii) divergiria imediatamente, porque a simulação teria
consumido números diferentes. Este é literalmente o critério **P4.3** do PRD ("replay reconstrói a partida a
partir de seed + linha do tempo de inputs, com hash idêntico"), validando a infraestrutura de replay dois
épicos antes de a Fase 4 começar — quando corrigir ainda é barato.

### Onde mexer

`src/sim/rng.ts` (`deriveSeed`), `src/sim/types.ts` (`WorldView`), `src/bot/dummy.ts` (assinatura de
`dummyCommands`), `src/tools/determinism.ts` (teste de replay + pontos de chamada de `dummyCommands`),
`src/tools/inspect.ts` (ponto de chamada de `dummyCommands`, se a assinatura mudar de forma que afete a
chamada).

### Testing

- `npm run check` — 0 erros, incluindo a confirmação de que `dummyCommands` aceita `WorldView` e que
  nenhuma chamada residual passa `World` de um jeito que quebre (deve ser transparente, já que `World`
  satisfaz `WorldView` estruturalmente).
- `npm run sim:check` — golden hash idêntico ao baseline de `debt.0`, autoconsistência 40/40, e o novo teste
  de replay passando para as 5 seeds do baseline.
- Verificação manual: tentar (de propósito, durante o desenvolvimento, não como código final) chamar
  `view.rng()` dentro de `dummyCommands` e confirmar que o `tsc` recusa — prova que a Regra 1 é
  estruturalmente forçada, não só documentada.

### Contribuição para o Anexo B

Fecha **A-8** (teste de replay verde). Resolve **D-08** do PRD. Com esta story `Done`, os passos 0-7 do
plano de migração (`architecture.md` §6.1) estão completos — o portão de Anexo B fica pendente apenas dos
itens que dependem do passo 8 (**A-10**, teste de agregação de item byte-idêntico), que é **fora do escopo
deste épico** e entra como próximo épico (Fase 3, catálogo de itens em `src/shop/`).

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-28 | 1.0 | Story criada a partir de `architecture.md` §5.1, §5.2, §6.1 (passo 7) e Anexo A | River (@sm) |

## Dev Agent Record

### Agent Model Used

_A preencher pelo @dev._

### Debug Log References

_A preencher pelo @dev._

### Completion Notes List

_A preencher pelo @dev._

### File List

_A preencher pelo @dev._

## QA Results

_A preencher pelo @qa._
