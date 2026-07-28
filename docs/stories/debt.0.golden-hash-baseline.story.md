# Story debt.0: Golden hash — baseline verificável no `sim:check`

## Status

Done

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: ["npm run check", "npm run sim:check", "revisão manual da tabela de baseline copiada de architecture.md §6.0"]
```

## Story

**Como** desenvolvedor executando a migração de 8 passos da dívida de arquitetura (C2/C3, `docs/prd.md` §4),
**eu quero** que `src/tools/determinism.ts` compare cada execução de `sim:check` contra um baseline de hash
fixo (não apenas rodar a mesma seed duas vezes),
**para que** os passos 1 a 7 da migração deixem de ser "plausíveis" e passem a ser **verificáveis**: qualquer
mudança silenciosa de comportamento do jogo é pega no ato, e não só a falta de reprodutibilidade.

## Contexto — por que esta story é bloqueante de TODAS as outras

`determinism.ts` hoje roda cada seed **duas vezes** e compara os hashes entre si — isso prova que a
simulação é **reprodutível**, não que ela é **a mesma de ontem**. Uma migração de 8 passos (`architecture.md`
§6.1) feita sob esse critério é feita no escuro: uma refatoração poderia mudar o resultado do jogo e o
`sim:check` continuaria verde, porque as duas execuções ainda dariam hashes iguais entre si — só que
diferentes do que davam ontem.

Esta story grava o baseline medido nesta sessão, **com o código atual, sem modificá-lo em `src/sim/`,
`src/chars/` ou `src/bot/`**. É pré-requisito de todas as stories `debt.1` a `debt.7`: nenhuma delas pode
começar antes de esta estar `Done`, porque sem o baseline não há como provar que a refatoração preservou o
comportamento — só como afirmar que preservou, o que é exatamente o problema que esta story resolve.

## Acceptance Criteria

1. `npm run check` (`tsc --noEmit`) permanece verde, sem erros novos.
2. `npm run sim:check` permanece verde: determinismo 40/40 seeds (teste de autoconsistência **existente**,
   preservado — não substituído).
3. Para as seeds **1, 2, 3, 7, 11**, `sim:check` compara o hash/ticks/vencedor obtidos na execução atual
   contra a tabela de baseline abaixo (idêntica a `architecture.md` §6.0). Se **qualquer** valor não bater,
   o script relata **qual seed, qual campo, esperado vs. obtido** e lança erro (mesmo padrão de
   `if (divergentes > 0) throw new Error(...)` já existente), fazendo o processo sair com falha.
4. Nenhuma linha de `src/sim/`, `src/chars/` ou `src/bot/` é alterada nesta story. A mudança fica contida
   em `src/tools/determinism.ts`.
5. `sim/` continua: TypeScript puro, zero dependências externas, sem DOM, sem I/O, sem `Math.random`, e não
   importa de `chars/`, `bot/` nem `client/` — verificável por `grep -rn "Math.random" src/sim` e
   `grep -rn "from '\.\./chars\|from '\.\./bot\|from '\.\./client" src/sim` retornando vazio (invariante que
   já vale hoje; esta story não a toca, apenas confirma que continua valendo).

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type**: Architecture
**Secondary Type(s)**: —
**Complexity**: Low — um arquivo, ~15 linhas adicionadas, nenhuma lógica de `sim/` tocada

### Specialized Agent Assignment

**Primary Agents**:
- @dev (implementação)
- @architect (dono do plano de migração, valida que o baseline bate com o medido em §6.0)

**Supporting Agents**:
- (nenhum necessário — mudança isolada em ferramenta de verificação)

### Quality Gate Tasks

- [ ] Pre-Commit (@dev): Rodar antes de marcar a story como completa
- [ ] Pre-PR (@github-devops): Rodar antes de criar pull request

### Self-Healing Configuration

**Expected Self-Healing**:
- Primary Agent: @dev (light mode)
- Max Iterations: 2
- Timeout: 15 minutes
- Severity Filter: CRITICAL

**Predicted Behavior**:
- CRITICAL issues: auto_fix (até 2 iterações)
- HIGH issues: document_only (registrado em Dev Notes, não bloqueia)

### CodeRabbit Focus Areas

**Primary Focus**:
- Backward compatibility: o teste de autoconsistência existente não pode ser removido, só complementado
- Precisão numérica: os 5 valores do baseline devem ser copiados exatamente da tabela abaixo, sem transcrever errado

**Secondary Focus**:
- Legibilidade da mensagem de erro (deve dizer seed + campo + esperado vs. obtido, não só "diverge")

## Tasks / Subtasks

- [ ] Task 1 — Adicionar tabela de baseline golden hash (AC: 3)
  - [ ] Copiar a tabela de `architecture.md` §6.0 literalmente para uma constante em `determinism.ts` (ver Dev Notes)
  - [ ] Cada entrada: `{ seed, hash, ticks, winner }`

- [ ] Task 2 — Comparar execução atual contra o baseline (AC: 3)
  - [ ] Para cada seed do baseline, rodar `rodar(seed)` (função já existente) e comparar `hash`, `ticks` e `winner`
  - [ ] Se algum campo divergir, imprimir `seed`, campo, valor esperado e valor obtido — não só um booleano
  - [ ] Se qualquer seed do baseline divergir em qualquer campo, contar como falha e propagar para o `throw` final

- [ ] Task 3 — Preservar o teste de autoconsistência existente (AC: 2)
  - [ ] O laço atual (`for seed 1..40`, roda duas vezes, compara `a.hash !== b.hash`) continua existindo, sem alteração de comportamento
  - [ ] O teste de baseline (Task 2) é **adicional**, não substitui

- [ ] Task 4 — Rodar os comandos de verificação (AC: 1, 2, 4, 5)
  - [ ] `npm run check` — deve passar sem erros
  - [ ] `npm run sim:check` — deve reportar tanto a autoconsistência 40/40 quanto o baseline das 5 seeds batendo
  - [ ] Confirmar por `git diff` (ou equivalente) que nenhum arquivo fora de `src/tools/determinism.ts` foi tocado

## Dev Notes

### Por que esta story existe (fonte: `architecture.md` §6.0)

> `determinism.ts` hoje verifica **autoconsistência**: roda cada seed duas vezes e compara. Isso continuaria
> verde mesmo se a refatoração mudasse silenciosamente o comportamento do jogo — ele prova que a simulação
> é reprodutível, não que ela é *a mesma de ontem*. Uma migração de 8 passos feita sob esse critério é feita
> no escuro.
>
> **Ação:** gravar um trio (ou quinteto) de hashes de referência e comparar a cada execução. Baseline medido
> nesta sessão, com o código atual, sem modificá-lo [...] Custo: ~15 linhas em `determinism.ts`. Retorno: os
> passos 1 a 7 abaixo passam a ser **verificáveis** em vez de plausíveis.

[Fonte: `architecture.md` §6.0]

### Tabela de baseline — copiar literalmente

| seed | hash | ticks | vencedor |
|---|---|---|---|
| 1 | `96de1201` | 753 | time 1 |
| 2 | `f66a7416` | 961 | time 0 |
| 3 | `a8db9c28` | 830 | time 0 |
| 7 | `cb77dbe0` | 831 | time 0 |
| 11 | `6aede2d9` | 1168 | empate (duplo-KO) |

[Fonte: `architecture.md` §6.0 — mesma tabela referenciada em Anexo B item A-2]

A seed 11 é bônus deliberado: exercita o caminho de empate (`winner === -1`), que é o caminho que D-02
(`docs/prd.md` §5) regulamenta. Não descartar essa seed do baseline achando que é ruído.

### Onde mexer

`src/tools/determinism.ts` — arquivo completo já lido nesta sessão. Estrutura atual relevante:

```ts
function rodar(seed: number) {
  const world = createWorld(CHARS, setup(seed))
  while (!world.over && world.tick < 60 * 180) {
    step(world, [...dummyCommands(world, 0), ...dummyCommands(world, 1)])
  }
  return { winner: world.winner, ticks: world.tick, hash: hash(world) }
}
// ...
for (let seed = 1; seed <= SEEDS; seed++) {
  const a = rodar(seed)
  const b = rodar(seed)
  if (a.hash !== b.hash || a.ticks !== b.ticks) { /* autoconsistência */ }
  // ...
}
// ...
if (divergentes > 0) throw new Error('simulação não é determinística')
```

A função `rodar(seed)` já devolve exatamente `{ winner, ticks, hash }` — reaproveitar, não duplicar. Basta
adicionar um segundo laço (ou estender o existente) que compara `rodar(seed)` contra a linha correspondente
da tabela de baseline, para as 5 seeds listadas.

### Contrato de erro

Seguir o padrão já existente: acumular divergências num contador/lista e, ao final, se houver qualquer uma,
`throw new Error(...)`. A mensagem deve nomear a seed e o campo que divergiu (ex.:
`` `✗ baseline seed 1: hash esperado 96de1201, obtido a1b2c3d4` ``), porque é essa mensagem que o passo 2 da
migração (`debt.2`) vai usar para saber **exatamente onde** a aritmética divergiu, caso divirja.

### O que esta story explicitamente NÃO faz

- Não toca em `src/sim/`, `src/chars/`, `src/bot/`.
- Não implementa `stats.ts`, `recomputeStats`, `contactWindows`, `deriveSeed` nem qualquer outra peça do
  plano de migração — essas são as stories `debt.1` a `debt.7`.
- Não recalcula o baseline. Os 5 valores acima são o baseline; se a execução atual não bater com eles, o
  bug está na execução atual (ou a tabela foi copiada errada), não motivo para "atualizar" a tabela.

### Testing

- Rodar `npm run sim:check` e confirmar:
  - Bloco de autoconsistência: `determinismo ✓ ok` (0/40 divergentes), inalterado.
  - Novo bloco de baseline: as 5 seeds batendo hash+ticks+vencedor contra a tabela acima.
- Rodar `npm run check` e confirmar 0 erros de `tsc`.
- Rodar `git status`/`git diff --stat` e confirmar que o único arquivo modificado é
  `src/tools/determinism.ts`.
- Teste negativo manual (não precisa virar teste automatizado, mas vale rodar uma vez durante o
  desenvolvimento): alterar deliberadamente um dígito do hash esperado de uma seed no código e confirmar que
  o script realmente lança erro e nomeia a seed/campo — prova que a comparação está de fato acontecendo, não
  só existindo como código morto.

### Contribuição para o Anexo B (`architecture.md`, checklist de portão da Fase 3)

Esta story estabelece a infraestrutura de **A-2** (golden hash das 5 seeds igual ao baseline de §6.0). As
demais stories (`debt.1`-`debt.7`) dependem desta infraestrutura para provar que preservam A-2 a cada passo.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-28 | 1.0 | Story criada a partir de `architecture.md` §6.0 e §6.1 (passo 0) | River (@sm) |
| 2026-07-28 | 1.1 | Implementada. Status: Ready → InProgress → InReview. Todos os 5 ACs verificados: `tsc` verde, `sim:check` verde com bloco de autoconsistência preservado, 5 seeds batendo baseline, único arquivo tocado é `src/tools/determinism.ts`, invariantes de pureza de `sim/` confirmadas. Teste negativo executado e registrado no Debug Log — a comparação dispara e nomeia seed/campo. | @dev |
| 2026-07-28 | 1.1.1 | QA Gate CONCERNS — Status: InReview → Done. 5/5 ACs verificados independentemente pelo @qa: `npm run check` e `npm run sim:check` reexecutados (EXIT=0), **teste negativo reproduzido do zero com campos diferentes dos do @dev** (seed 2 hash, seed 3 ticks, seed 11 vencedor → 3 desvios nomeados, EXIT=1), arquivo restaurado e `git diff` vazio confirmado, escopo do diff conferido em `d52c23d`, invariantes de pureza de `sim/` confirmadas por grep. 6 ressalvas low, nenhuma bloqueante — destaque: `MNT-001` (hash não localiza a divergência; `debt.2` deve prever bisecção por tick) e `DOC-001` (checkboxes de Task não marcados). Gate: `docs/qa/gates/debt.0-golden-hash-baseline.yml` | Quinn (@qa) |
| 2026-07-28 | 1.0.1 | Validated GO (10/10) — Status: Draft → Ready. Tabela de baseline de §6.0 **reproduzida e conferida pelo @po** com o código atual: as 5 seeds batem hash, ticks e vencedor exatamente (seed 11 → `winner === -1`). `npm run check` e `npm run sim:check` verdes na validação. Nota ao @dev: o grep de AC 5 `grep -rn "Math.random" src/sim` **não** retorna vazio — casa o comentário de `rng.ts:2`; a invariante vale, só o comando precisa ignorar comentários. | @po |

## Dev Agent Record

### Agent Model Used

claude-opus-5 (sessão principal atuando como @dev)

### Debug Log References

Teste negativo executado (corrompendo `hash: '96de1201', ticks: 753` → `'96de12FF', 999`):

```
  ✗ baseline seed 1: hash esperado 96de12FF, obtido 96de1201
  ✗ baseline seed 1: ticks esperado 999, obtido 753
golden hash    ✗ 2 desvio(s)
Error: comportamento divergiu do baseline em 2 campo(s). ...
EXIT=1
```

Arquivo restaurado em seguida; `sim:check` verde. **A comparação dispara de fato** — não é
código morto. Ela nomeia seed e campo, que é exatamente o que `debt.2` vai precisar para
localizar uma divergência de aritmética.

### Completion Notes List

- `BASELINE` como constante nomeada com as 5 seeds de `architecture.md` §6.0, incluindo a
  seed 11 (caminho de empate, `winner === -1`).
- Reaproveitada a função `rodar(seed)` existente, conforme as Dev Notes — nada duplicado.
- Bloco de autoconsistência **preservado intacto** (AC 2): as duas verificações são
  independentes e nenhuma substitui a outra.
- Contrato de erro seguindo o padrão existente: acumula desvios, imprime cada um nomeando
  seed e campo, e lança ao final. A mensagem de erro instrui sobre o que fazer se a mudança
  tiver sido intencional.
- Comentário no código proíbe explicitamente "atualizar" o baseline para fazer o teste
  passar — que é o modo de falha óbvio deste mecanismo.
- **Nota do @po sobre AC 5 confirmada:** `grep -rn "Math.random" src/sim` casa o comentário
  de `rng.ts:2`. A invariante vale; verificado com o comentário excluído do grep.

### Saída atual do `sim:check`

```
determinismo   ✓ ok
golden hash    ✓ ok — 5 seeds batem o baseline
espelho 2v2    time0 19 · time1 14 · empate 7   (esperado ~50/50)
duração        mediana 13.8s · min 12.3s · max 19.5s
```

### File List

| Arquivo | Mudança |
|---|---|
| `src/tools/determinism.ts` | +55 linhas — `BASELINE`, laço de comparação, saída e `throw` |

Nenhum arquivo em `src/sim/`, `src/chars/` ou `src/bot/` foi tocado (AC 4 ✓).

## QA Results

### Review Date: 2026-07-28

### Reviewed By: Quinn (@qa — Test Architect)

### Revisão: `commit:d52c23d`

Nada aqui foi aceito por alegação. Cada item abaixo foi executado nesta sessão.

#### Verificações executadas

| # | Verificação | Resultado |
|---|---|---|
| 1 | `npm run check` (`tsc --noEmit`) | 0 erros. `tsconfig.include` cobre `src`, e `noUnusedLocals: true` garante que `BASELINE`/`desvios` são de fato consumidos — não passariam como código morto declarado. |
| 2 | `npm run sim:check` | `determinismo ✓ ok` · `golden hash ✓ ok — 5 seeds batem o baseline` · `EXIT=0`. Wall clock <1s. |
| 3 | **Teste negativo reproduzido do zero** | Corrompi campos **diferentes** dos que o @dev usou, para exercitar os três: seed 2 `hash → deadbeef`, seed 3 `ticks → 12345`, seed 11 `winner → 0`. Saída: 3 linhas nomeando seed, campo, esperado e obtido; `golden hash ✗ 3 desvio(s)`; `Error: comportamento divergiu do baseline em 3 campo(s)`; `EXIT=1`. **A comparação dispara de verdade e cobre os 3 campos, não só o hash.** |
| 4 | Restauração | Arquivo restaurado; `git diff -- src/tools/determinism.ts` vazio; `git status --short` limpo. |
| 5 | Escopo do diff | `git show --stat d52c23d`: único arquivo de código é `src/tools/determinism.ts` (+55). Demais entradas são `docs/stories/`. |
| 6 | Pureza de `sim/` — `Math.random` | Única ocorrência em `src/sim` é o comentário de `rng.ts:2` (*"a simulação NUNCA usa Math.random"*). Zero uso funcional. |
| 7 | Pureza de `sim/` — imports | Todos os imports de `src/sim` são internos: `./rng.ts`, `./effects.ts`, `./physics.ts`, `./types.ts`. Zero `chars/`, `bot/`, `client/`; zero DOM, zero I/O. |
| 8 | Contaminação do bundle | `determinism.ts` não é importado por nenhum arquivo em `src/`. Script standalone com efeitos colaterais no topo — se fosse importado pelo client, rodaria 85 simulações no navegador. Não é o caso. |

#### Acceptance Criteria — 5/5 verificados

| AC | Veredito | Evidência |
|---|---|---|
| 1 — `tsc` verde | ✅ PASS | Verificação 1 |
| 2 — autoconsistência 40/40 preservada | ✅ PASS | O laço `for seed 1..40` está intacto no diff (nenhuma linha removida). O bloco de baseline é adicional, sob comentário separador próprio, e não interfere no contador `divergentes`. |
| 3 — baseline das 5 seeds com erro nomeando seed/campo/esperado/obtido | ✅ PASS | Verificações 2 e 3. Os 5 pares hash/ticks/winner conferem contra a tabela de `architecture.md` §6.0 linha a linha, inclusive seed 11 `winner: -1` (caminho de empate). |
| 4 — nada fora de `determinism.ts` | ✅ PASS | Verificação 5 |
| 5 — invariantes de pureza de `sim/` | ✅ PASS | Verificações 6 e 7 |

#### Qualidade do código

O que está bem feito: `rodar(seed)` foi reaproveitada em vez de duplicada, conforme as Dev Notes. `BASELINE` é uma constante nomeada com tipo explícito, e o bloco de comentário acima dela explica *por que* o baseline existe e proíbe nominalmente o modo de falha óbvio deste mecanismo ("não 'atualize' a tabela para o teste passar") — isso é o que impede a próxima pessoa de neutralizar a proteção sem perceber. O laço de comparação usa uma tupla `[campo, esperado, obtido]`, o que faz os três campos serem tratados uniformemente em vez de três `if` copiados. A mensagem do `throw` aponta para `architecture.md` §6.1 e diz o que fazer se a mudança tiver sido intencional — é acionável, não decorativa.

Sobre a pergunta central — **a mensagem serve para `debt.2`?** Parcialmente, e vale ser honesto sobre o limite. Ela entrega o que o AC 3 pede e é suficiente para *detectar* e *reproduzir* (seed determinística, campo nomeado). Mas `hash esperado 96de1201, obtido a1b2c3d4` diz **que** o estado divergiu, não **onde**: hash é sem localidade por construção. Quem migrar os leitores de stat em `debt.2` e vir esse erro ainda terá de instrumentar tick a tick à mão para achar o ponto da divergência aritmética. Isso não é defeito de `debt.0` — está registrado como `MNT-001` com a recomendação de que `debt.2` inclua no próprio escopo um helper de bisecção (hash por tick → primeiro tick divergente), em vez de assumir que esta mensagem basta.

#### Ressalvas (nenhuma bloqueante)

| ID | Sev | Achado |
|---|---|---|
| `REL-001` | low | O `throw` de autoconsistência (l. 126) precede o do baseline (l. 127). Se os dois falharem juntos — combinação plausível numa refatoração ruim —, o `Error` final cita só "simulação não é determinística". Os desvios do baseline já foram impressos em stdout antes, então o diagnóstico não se perde; só a mensagem terminal fica incompleta. |
| `MNT-001` | low | Hash não localiza a divergência (ver acima). Ação recomendada em `debt.2`, não aqui. |
| `PERF-001` | low | O laço de baseline roda `rodar(seed)` uma 3ª vez para as seeds 1, 2, 3, 7 e 11, que o laço de 40 já executou duas vezes cada: 5 execuções redundantes de 85 (+6%). Impacto real desprezível (<1s total) e a independência entre os blocos é defensável. Registrado para não ser redescoberto como "bug". |
| `DOC-001` | low | Os checkboxes de Task 1 a 4 e de Quality Gate Tasks seguem `[ ]` com a story implementada. Seção do @dev — @qa não edita. |
| `DOC-002` | low | O commit `d52c23d` agrupou a implementação com as edições de validação do @po nas stories `debt.1`–`debt.7`. Higiene de commit, não afeta código. |
| `REQ-001` | low | O AC 5 afirma que o grep de `Math.random` retorna vazio; ele casa o comentário de `rng.ts:2`. Já apontado pelo @po. A invariante substantiva foi confirmada. Imprecisão de redação. |

#### 7 verificações padrão

| Verificação | Resultado |
|---|---|
| Code review | ✅ PASS |
| Testes | ✅ PASS — inclusive o negativo, reproduzido independentemente |
| Critérios de aceitação | ✅ PASS — 5/5 |
| Ausência de regressão | ✅ PASS — bloco de autoconsistência intacto, `sim/` não tocada, script não entra no bundle |
| Performance | ✅ PASS — `PERF-001` é informativo |
| Segurança | ✅ PASS — sem I/O, rede, entrada externa, segredos ou dependências; tool script fora do artefato de produção |
| Documentação | ⚠️ CONCERNS — `DOC-001` (checkboxes), `DOC-002` (commit) |

### Gate Status

Gate: CONCERNS → `docs/qa/gates/debt.0-golden-hash-baseline.yml`

**A infraestrutura de baseline está funcional e provada.** As stories `debt.1` a `debt.7` estão liberadas para começar: o A-2 do Anexo B tem agora um mecanismo que falha de verdade quando o comportamento muda. Recomendação para `debt.2`: ler `MNT-001` antes de planejar a depuração.
