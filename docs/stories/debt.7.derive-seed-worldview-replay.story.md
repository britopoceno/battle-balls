# Story debt.7: `deriveSeed`, `WorldView`, teste de replay — resolve D-08

## Status

Done

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

- [x] Task 1 — `deriveSeed` em `sim/rng.ts` (AC: 5, 8)
  - [ ] Assinatura: `export function deriveSeed(seed: number, streamId: number): number`
  - [ ] Implementar mistura splitmix32 (ver nota de pendência em Dev Notes)
  - [ ] Comentário com a tabela de streams reservados (ids 0-4+)

- [x] Task 2 — `WorldView` em `sim/types.ts` (AC: 6)
  - [ ] `export type WorldView = Omit<World, 'rng'>`

- [x] Task 3 — Atualizar a assinatura de `dummyCommands` (AC: 6)
  - [ ] `src/bot/dummy.ts`: `dummyCommands(world: World, team: Team)` → `dummyCommands(view: WorldView, team: Team)`
  - [ ] Ajustar os pontos de chamada (`src/tools/determinism.ts`, `src/tools/inspect.ts`) para o novo nome de parâmetro (o tipo `World` já satisfaz `WorldView` estruturalmente, então a chamada em si não deveria precisar de conversão explícita — confirmar com `tsc`)
  - [ ] Confirmar que `dummyCommands` não referencia `.rng` em nenhum ponto (hoje não referencia — "Determinístico: não consome RNG e depende só do estado do mundo", comentário já existente em `dummy.ts:7`)

- [x] Task 4 — Teste de replay (AC: 7)
  - [ ] Em `src/tools/determinism.ts` (ou função auxiliar): rodar a partida normalmente, gravando `Command[]` produzido a cada tick (`dummyCommands` para os dois times)
  - [ ] Recriar o mundo com a mesma seed, e no laço de `step`, passar os comandos **gravados** em vez de chamar `dummyCommands` de novo
  - [ ] Comparar `hash(mundo com bot) === hash(mundo com replay gravado)` para cada seed testada
  - [ ] Rodar para as 5 seeds do baseline no mínimo; reportar falha nomeando a seed, igual ao padrão de `debt.0`

- [x] Task 5 — Documentar a invariante de não-reordenação (AC: 9)
  - [ ] Revisar `world.ts`/`physics.ts` e confirmar que nenhum `.sort(` é aplicado sobre `world.balls` (ou cópia usada para decisão que afete o resultado)
  - [ ] Registrar a invariante como comentário perto da declaração de `World.balls` em `sim/types.ts`: nunca reordenar por valor; se necessário, ordenar cópia, sempre com desempate por `id`

- [x] Task 6 — Verificação (AC: 1, 2, 3, 4)
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
| 2026-07-28 | 1.1 | Implementada. Status: Ready → InProgress → InReview. Todos os ACs verificados. Should-Fix do @po resolvido: colisão de `deriveSeed` definida como "nenhum par de streamId diferentes produz o mesmo valor derivado, para a mesma seed" e verificada em 80 combinações (5 seeds baseline × streamId 0-15), zero colisões. Regra 1 confirmada por tipo (`view.rng()` recusado pelo `tsc`). Teste dirigido além do pedido pela story: bot consumindo `world.rng` via cast não divergiu o replay isoladamente (esperado — nada consome rng hoje); com um consumidor de `ctx.rand` simulado num personagem, o replay divergiu nas 5 seeds, provando que o mecanismo funciona quando há consumidor real. Último passo do épico — dívida de arquitetura que bloqueava a Fase 3 paga por completo. | @dev |
| 2026-07-28 | 1.2 | **Gate PASS** — Status: InReview → Done. Verificação independente, nada aceito da Debug Log: `tsc` e `sim:check` reexecutados (golden hash conferido linha a linha contra `architecture.md` §6.0); colisão de `deriveSeed` reproduzida com range/seeds próprios (10,7 bi de pares, 0 colisões) **e** demonstrada estruturalmente impossível (Weyl ímpar ⇒ injetora; finalizador bijetor) — garantia vale para todo `streamId`, não só o range testado; `lowbias32` reimplementado da literatura, 0 divergências em 180k amostras; Regra 1 confirmada por `tsc` em 3 formas de acesso, inclusive `view['rng']` (TS7053), com `dummy.ts` restaurado e md5 reconferido; teste dirigido de replay reconstruído do zero **sem editar `src/`** (injeção de `CHARS` via parâmetro de `createWorld`), matriz 2×2 completa — S2 (vazamento só) não diverge, S3 (`ctx.rand` só, **controle ausente no teste do @dev**) não diverge, S4 (ambos) diverge 5/5, provando que a divergência é atribuível ao vazamento; AC4 (pureza de `sim/`) e AC9 (`.sort(` vazio em `src/sim/`) verificados por grep. 3 issues LOW, 0 HIGH/CRITICAL. `git diff` final contém apenas os 4 arquivos da File List. Fechamento do épico: `debt.0`-`debt.7` todas em Done. | Quinn (@qa) |
| 2026-07-28 | 1.0.1 | Validated GO (9/10) — Status: Draft → Ready. Fatos conferidos: `dummy.ts:7` traz o comentário "Determinístico: não consome RNG" citado pela story; `dummyCommands(world: World, team: Team)` em `dummy.ts:9`; chamadas em `determinism.ts:27` e `inspect.ts:19`; `sim/rng.ts` tem 14 linhas e nenhum `deriveSeed`. AC 6 está certo: `World` satisfaz `Omit<World,'rng'>` estruturalmente, então os pontos de chamada não precisam de conversão. A recusa em fixar as constantes do splitmix32 (Dev Notes) é a decisão correta sob Article IV — a arquitetura de fato não as especifica. Should-Fix menor: o critério funcional que substitui a especificação ("streams de `streamId` diferentes não colidam nas seeds testadas") não está quantificado; definir o que conta como colisão antes de implementar. | @po |

## Dev Agent Record

### Agent Model Used

claude-opus-5 (sessão principal atuando como @dev)

### Debug Log References

```
$ npx tsc --noEmit
(sem saída — 0 erros)

$ npm run sim:check
determinismo   ✓ ok
golden hash    ✓ ok — 5 seeds batem o baseline
build coverage ✓ ok — 5 variantes batem
espelho 2v2    time0 19 · time1 14 · empate 7
duração        mediana 13.8s · min 12.3s · max 19.5s
replay         ✓ ok — 5 seeds reproduzidas sem bot

janelas de dano por contato (Pilar 3)
  golem  sismico    450ms  dmg 14  kb 520  re-hit 250ms   cd_min 3500ms  ✓
  vex    —         (nenhuma)                                            ✓

pilar 3        ✓ ok — camadas 1 e 3 sem violação

$ grep -rn "\.balls\.sort\|\.sort(" src/sim/
(vazio)
```

**Verificação de colisão de `deriveSeed`** (definição quantificada, resolvendo o Should-Fix
do @po v1.0.1): para as 5 seeds do baseline × `streamId` 0-15 (folga além dos streams 0-4
reservados), nenhum par de `streamId` diferentes produziu o mesmo valor derivado para a
mesma seed — 0 colisões em 80 combinações.

**Regra 1 verificada por tipo, de propósito** (Testing section): tentei `view.rng()` dentro
de `dummyCommands` e o `tsc` recusou:
```
error TS2339: Property 'rng' does not exist on type 'WorldView'.
```
Revertido.

**Teste dirigido do mecanismo do replay, além do que a story pedia.** Primeiro tentei um bot
que consome `world.rng` via `(view as any).rng()` (burlando o tipo) — o replay **não
divergiu**. Investigando: isso é esperado, não um defeito — hoje nada na simulação lê de
`world.rng` depois de `createWorld` (nenhum personagem chama `ctx.rand`), então avançar o
gerador não tem efeito observável nenhum; a proteção do teste de replay é prospectiva, não
carrega peso hoje. Para confirmar que o mecanismo *funciona* quando há consumidor real,
simulei um "personagem futuro": Golem temporariamente consumindo `ctx.rand()` no `move`
(pequena perturbação de velocidade) **e** o bot consumindo `world.rng` via cast antes de
gerar comandos. Com os dois juntos: **replay divergiu nas 5 seeds** (hash com bot ≠ hash
replay em todas). Prova que a infraestrutura vai pegar a violação de verdade quando
`ctx.rand` ganhar o primeiro consumidor real (fora do escopo deste épico). Ambos os
arquivos revertidos, `tsc`/`sim:check` limpos depois.

### Completion Notes List

- **`deriveSeed` implementado com splitmix32 padrão** (constantes de Chris Wellons,
  `0x21f0aaad`/`0x735a2d97`, incremento de Weyl `0x9e3779b9`) — decisão de implementação
  do @dev, não fechada pela arquitetura (Dev Notes já avisava disso). Critério de
  aceitação definido e verificado: zero colisão entre streams para as 5 seeds do baseline
  × `streamId` 0-15.
- **Tabela de streams reservados documentada como comentário** junto de `deriveSeed`, não
  em lugar separado — para ficar visível a quem for consumi-la na Fase 2.
- **`WorldView = Omit<World, 'rng'>`** e `dummyCommands` migrado para recebê-lo, com o
  parâmetro renomeado de `world` para `view` em toda a função (incluindo o helper
  `maisProximo`) — como o AC pedia literalmente, não só o tipo.
- **Nenhum ponto de chamada precisou de conversão** (`determinism.ts`, `inspect.ts`
  continuam passando `World`) — confirmado por `tsc` limpo, `World` satisfaz `WorldView`
  estruturalmente como a story previa.
- **Teste de replay implementado exatamente como Task 4 pede**: `rodarComGravacao` roda
  com bot gravando `Command[]`; `rodarReplay` reconstrói do zero com a mesma seed e só os
  comandos gravados, sem chamar `dummyCommands` nenhuma vez. Rodado para as 5 seeds do
  `BASELINE`.
- **Invariante de não-reordenação registrada** como comentário em `World.balls`
  (`types.ts`), não só em prosa solta — e confirmada por grep que nenhum `.sort()` toca
  `world.balls` hoje.
- Este é o **último passo do épico de 8 passos** (`architecture.md` §6.1, passos 0-7).
  Com `debt.7` em `Done`, a dívida de arquitetura que bloqueava a Fase 3 (C2, C3) está
  paga por completo — o passo 8 (camada de itens) é a Fase 3, próximo épico separado.

### File List

| Arquivo | Mudança |
|---|---|
| `src/sim/rng.ts` | `deriveSeed`, `splitmix32Mix`, tabela de streams reservados em comentário |
| `src/sim/types.ts` | `WorldView` (novo tipo); comentário de invariante em `World.balls` |
| `src/bot/dummy.ts` | `dummyCommands` recebe `WorldView`; parâmetro renomeado `world` → `view` em toda a função |
| `src/tools/determinism.ts` | `rodarComGravacao`, `rodarReplay`, teste de replay para as 5 seeds do baseline, ligado ao resumo final e ao `throw` |

Nenhum arquivo em `src/chars/`, `src/client/` ou `physics.ts` foi alterado permanentemente
(`golem.ts` foi tocado só durante o teste dirigido do mecanismo de replay, revertido).

## QA Results

**Gate: PASS** · Quinn (@qa) · 2026-07-28 · revisão sobre working tree (base `ccf1daf`)

Nada abaixo foi aceito com base na Debug Log. Todo item foi reexecutado, e os dois testes
dirigidos foram reconstruídos do zero com abordagem própria.

### Verificação de ACs

| AC | Verificação independente | Resultado |
|---|---|---|
| 1 | `npx tsc --noEmit` rodado por mim | ✓ 0 erros |
| 2 | `npm run sim:check` rodado por mim | ✓ determinismo 40/40, baseline 5 seeds, build coverage 5/5, Pilar 3 camadas 1 e 3, `replay ✓ ok — 5 seeds` |
| 3 | `BASELINE` de `determinism.ts:82-86` conferido **linha a linha** contra a tabela de `architecture.md` §6.0 | ✓ `96de1201`/`f66a7416`/`a8db9c28`/`cb77dbe0`/`6aede2d9` idênticos. Meu arnês independente (fora de `determinism.ts`) reproduziu os 5 hashes e as 5 contagens de tick |
| 4 | grep de `Math.random`/DOM/`node:fs`/`require` e de imports `../chars`/`../bot`/`../client` em `src/sim/` | ✓ puro. Todos os imports de `src/sim/` apontam para `./` — única ocorrência de `Math.random` é o comentário em `rng.ts:2` dizendo que nunca é usado |
| 5 | ver "Colisão" abaixo | ✓ com margem muito maior que a alegada |
| 6 | ver "Regra 1 por tipo" abaixo | ✓ recusado em 3 formas de acesso |
| 7 | ver "Mecanismo de replay" abaixo | ✓ matriz 2×2 completa |
| 8 | tabela de streams 0/1/2/3/4+ em `rng.ts:33-38`, colada em `deriveSeed` | ✓ |
| 9 | `grep -rn "\.sort(" src/sim/` → **vazio**. Comentário da invariante em `types.ts:141-147`, imediatamente acima de `balls: Ball[]` (lugar certo — não em prosa solta nem no topo do arquivo) | ✓ |

### Colisão de `deriveSeed` — a definição do @dev é satisfatória, e a cobertura é maior do que ele sabia

A definição ("nenhum par de `streamId` diferentes produz o mesmo valor derivado, para a mesma
seed") é a definição **certa** — é exatamente o que o consumidor da Fase 2 precisa garantir. O
Should-Fix v1.0.1 do @po está resolvido.

Reproduzi com range e seeds próprios:

| Amostra | Pares comparados | Colisões |
|---|---|---|
| A. reprodução literal do @dev (5 seeds × 0-15) | 600 | **0** |
| B. 5 seeds baseline × `streamId` **0-65535** | 10 737 254 400 | **0** |
| C. 22 seeds que o @dev **não** usou (inclui bordas `0`, `2³¹`, `2³²−1` e as próprias constantes) × 0-4095 | 184 504 320 | **0** |
| D. 300 seeds pseudo-aleatórias × 0-1023 | 157 132 800 | **0** |
| E. bijetividade: seed 0 × `streamId` 0-1048575 | — | 1 048 576 valores **distintos** |
| F. domínio: todos os retornos são uint32 válidos | 30 000 | **0** fora de faixa |

**Achado que fortalece o AC além do que a story alega:** colisão entre streams aqui não é
"rara", é **estruturalmente impossível**. `state = (seed + streamId × 0x9e3779b9) mod 2³²` é
injetora em `streamId` porque `0x9e3779b9` é ímpar, logo invertível mod 2³²; e o finalizador é
composição de xorshift e multiplicações por ímpar, todas bijeções. A garantia vale para
**todo** `streamId`, não só o range testado. Registro isto para a Fase 2: quem for consumir
`deriveSeed(seed, 1)` e `deriveSeed(seed, 2)` não precisa reverificar.

### Qualidade do splitmix32 — constantes corretas, e o risco é limitado mesmo se não fossem

Reimplementei `lowbias32` do zero a partir da literatura (shifts 16/15/15, `0x21f0aaad`,
`0x735a2d97`) sem olhar o código do @dev: **0 divergências em 180 000 amostras** contra
`deriveSeed`. A transcrição está correta, incluindo o incremento de Weyl `0x9e3779b9`.

Ressalva metodológica honesta: montei também um teste de avalanche para tentar *detectar* um
erro de dígito, e **ele não discrimina** — variantes com um dígito trocado, e até com shift
errado, dão avalanche média ~16.000 bits/32 igual à correta. Então a confiança nas constantes
vem da revisão de transcrição, não do teste estatístico. Isso é aceitável aqui porque o
**AC 5 não depende de as constantes serem exatamente as de Wellons**: qualquer multiplicador
ímpar preserva a bijeção, logo um eventual erro de dígito não quebraria o critério de não
colisão. Risco limitado por construção.

Nomenclatura: o comentário diz "mistura splitmix32... (constantes de Chris Wellons,
`lowbias32`)". É um híbrido — incremento de Weyl no estilo splitmix + finalizador `lowbias32`.
O comentário é explícito sobre isso, então não é alegação enganosa.

### Regra 1 por tipo — confirmada por mim, em 3 formas de acesso

Fiz backup de `src/bot/dummy.ts` por md5, inseri três tentativas de vazamento dentro de
`dummyCommands` e rodei `tsc`:

```
src/bot/dummy.ts(16,24): error TS2339: Property 'rng' does not exist on type 'WorldView'.   // view.rng()
src/bot/dummy.ts(17,24): error TS2339: Property 'rng' does not exist on type 'WorldView'.   // view.rng
src/bot/dummy.ts(18,27): error TS7053: Element implicitly has an 'any' type ...             // view['rng']()
```

A recusa cobre inclusive indexação por colchete (graças a `noImplicitAny`) — a fuga por
`view['rng']` que costuma escapar de `Omit` está fechada. Só um `as any` explícito passa, o que
é fronteira aceitável. Arquivo restaurado e md5 reconferido idêntico (`1c5635ad…`), `tsc` limpo
depois.

### Mecanismo de replay — reconstruí o teste dirigido do zero, com o controle que faltava

Não editei nenhum arquivo de `src/` para isto. `createWorld(chars, setup)` recebe o registro de
personagens **por parâmetro**, então injetei um `CHARS` modificado em memória (envelopando
`golem.move` para sacar `ctx.rand()`) e um bot que vaza `world.rng` via cast. Rodei a **matriz
2×2 completa** — o @dev rodou só 2 das 4 células:

| Célula | Bot vaza `world.rng`? | Personagem consome `ctx.rand`? | Esperado | Medido |
|---|---|---|---|---|
| S1 | não | não | igual | **0/5 divergiram** — e os 5 hashes batem o golden baseline |
| S2 | **sim** | não | igual | **0/5 divergiram** |
| S3 | não | **sim** | igual | **0/5 divergiram** |
| S4 | **sim** | **sim** | divergir | **5/5 divergiram** (ex.: seed 1 `3e638529@945` vs `da9c9eed@1009`) |

- **S2 confirma a alegação do @dev**, e agora como fato reproduzido: vazamento sozinho **não**
  é detectado hoje. A explicação dele está certa — `world.rng` só é sacado em `world.ts:84-87`
  (ruído de largada) e nada mais o lê depois; `ctx.rand` é exposto em `world.ts:299` mas
  `grep -rn "rand" src/chars/` **não retorna nada**. Adiantar o gerador não tem efeito observável.
- **S3 é o controle que o @dev não fez, e é o que torna a alegação rigorosa.** Sem ele, a
  divergência de S4 poderia ser artefato de simplesmente ter adicionado consumo de RNG. S3
  mostra que um consumidor real de `ctx.rand`, com bot limpo, mantém o replay idêntico — logo a
  divergência de S4 é atribuível **ao vazamento**, não ao consumo.
- **S4 confirma que o mecanismo dispara** quando existe consumidor real.

Também auditei que o teste não é vácuo: 11-16 comandos gravados por partida (67-71 por cenário),
não zero. E verifiquei `rodarReplay` linha a linha — ele **não** chama `dummyCommands` em
momento algum; reconstrói com `createWorld(CHARS, setup(seed))` e só reproduz o array gravado.
Passar o array inteiro a cada tick é correto porque `step` filtra por `c.tick === world.tick`
(`world.ts:585-586`), preservando a ordem intra-tick.

### `deriveSeed` sem consumidor — esperado, confirmado

`grep -rn "deriveSeed" src/` retorna só a definição em `rng.ts:46` e uma menção em comentário em
`dummy.ts:11`. Zero call sites. É infraestrutura da Fase 2, exatamente como a story declara e
como os passos 1-7 vêm fazendo. Não conto como código morto.

### Issues

| ID | Sev | Cat | Descrição | Recomendação |
|---|---|---|---|---|
| QA-001 | LOW | docs | `src/sim/rng.ts:29` abre com `debt.6/D-08` — a story é a **debt.7**. Erro de digitação no comentário | Corrigir no próximo toque em `rng.ts`. Não vale um commit próprio |
| QA-002 | LOW | tests | Risco residual **registrado, não corrigível nesta story**: o teste de replay tem poder discriminante prospectivo. Comprovado por mim em S2, não só afirmado. Um leitor futuro pode superestimar a proteção | Quando o primeiro personagem consumir `ctx.rand` (Fase 2/3), o teste passa a carregar peso sozinho — nada a fazer antes disso |
| QA-003 | LOW | process | Os checkboxes de Tasks 1-6 e dos Quality Gate Tasks continuam `[ ]` apesar de tudo estar implementado e verificado | @dev marcar. Fora da minha autoridade de edição |

Nenhum bloqueia. Zero HIGH, zero CRITICAL.

### Fechamento do épico

Conferi o Status dos 8 arquivos: `debt.0` a `debt.6` em **Done**, `debt.7` movida para **Done**
por este gate. O épico de dívida de arquitetura de `architecture.md` §6.1 (passos 0-7) está
fechado.

Observação de estado geral, já que este é o gate final: a propriedade que o épico prometeu —
**"passos 1 a 7 são preparação com comportamento congelado"** — sustentou-se do começo ao fim. O
golden hash das 5 seeds (`96de1201`/`f66a7416`/`a8db9c28`/`cb77dbe0`/`6aede2d9`) atravessou sete
refatorações estruturais sem mover um dígito, e continua batendo `architecture.md` §6.0 neste
gate. Isso é o que diferencia esta migração de uma reescrita: cada passo foi verificável, não
plausível. A rede de proteção também cresceu ao longo do caminho e não só no papel — golden hash
(debt.0), cobertura de build para ramos que o baseline não tocava (ARCH-001, debt.3), auditoria
do Pilar 3 em camadas (debt.6) e agora o replay (debt.7).

Dívida conhecida que o épico deliberadamente **não** pagou, e que deve continuar visível:
`Omit` é raso (`view.balls[0].hp` segue mutável — decisão registrada do @architect, endurecer só
sob caso real); a limitação QA-002 do gate de `debt.6` (auditoria de `openContactWindow` só no
sentido inverso); e o QA-002 acima. Nenhuma delas bloqueia a Fase 3. O passo 8 (camada de itens,
`src/shop/`) é o primeiro passo em que o golden hash **deve** mudar — quando isso acontecer, será
sinal de progresso, não de regressão, e é o único contexto em que atualizar aquela tabela é
legítimo.

**Recomendação:** liberado para `@devops` fazer o push.
