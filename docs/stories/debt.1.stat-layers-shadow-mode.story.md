# Story debt.1: Camadas de stat em modo sombra (`stats.ts`, `recomputeStats`, campos aditivos)

## Status

Done

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: ["npm run check", "npm run sim:check"]
```

## Story

**Como** desenvolvedor executando o passo 1 da migração de stats (`architecture.md` §6.1),
**eu quero** introduzir `sim/stats.ts` (`STAT_KEYS`, `StatBlock`, `BonusBlock`, `DEFAULT_STATS`,
`recomputeStats`) e os campos `base`/`bonusPassive`/`bonusItem`/`stat` em `Ball`, **mantendo `Ball.mods` e os
campos diretos (`radius`, `mass`, `maxSpeed`, `steer`, `drag`, `maxHp`) vivos e ainda sendo os únicos lidos**,
**para que** a estrutura de dados da camada de stats exista e seja exercitada (sem crash) antes de qualquer
leitor real depender dela — preparando o passo 2 (troca de leitores) sem mudar uma vírgula do comportamento
do jogo hoje.

## Depende de

`debt.0` (Done) — sem o baseline golden hash gravado, não há como provar que esta story não mudou o
comportamento do jogo. Esta story só pode começar com `debt.0` em `Done`.

## Acceptance Criteria

1. `npm run check` (`tsc --noEmit`) verde.
2. `npm run sim:check` verde (autoconsistência 40/40 + baseline das 5 seeds, ambos herdados de `debt.0`).
3. Golden hash **idêntico** ao baseline de `architecture.md` §6.0 para as seeds 1, 2, 3, 7, 11 (mesma tabela
   de `debt.0`). Esta story é classificada como risco **baixo** justamente porque os campos novos não são
   lidos por ninguém ainda — é "código morto por um passo" (`architecture.md` §6.1, linha do passo 1). Se o
   hash mudar, algo está lendo os campos novos prematuramente — reverter e localizar o vazamento antes de prosseguir.
4. `sim/` continua: TypeScript puro, zero dependências, sem DOM, sem I/O, sem `Math.random`, sem importar de
   `chars/`, `bot/` ou `client/`.
5. `src/sim/stats.ts` existe com `STAT_KEYS` (as 14 chaves listadas em Dev Notes, exatamente como em
   `architecture.md` §1.3 — ver nota sobre a discrepância "14 vs 15" abaixo), `StatBlock`, `BonusBlock`,
   `DEFAULT_STATS` e `recomputeStats(base, bonusPassive, bonusItem): StatBlock`.
6. `Ball` (em `sim/types.ts`) ganha `base: StatBlock`, `bonusItem: BonusBlock`, `bonusPassive: BonusBlock`,
   `stat: Readonly<StatBlock>` — **sem remover** `mods`, `radius`, `mass`, `maxSpeed`, `steer`, `drag`,
   `maxHp`. A remoção é escopo de `debt.3`.
7. `makeBall` (em `sim/world.ts`) popula `base` a partir do `CharDef` (mais `DEFAULT_STATS` para os campos
   que não têm fonte no `CharDef` hoje: `restBall`, `restWall`, `dmg`, `dmgTaken`, `atkSpeed`, `cdSpeed`,
   `range`, `knockbackTaken` — todos com base neutra 1.0, exceto `restBall`/`restWall` com base 0.65/0.72),
   `bonusItem` e `bonusPassive` zerados, e chama `recomputeStats` uma vez antes de devolver a bola — `stat`
   nunca é lido não inicializado.
8. O ponto único de recálculo por tick (`architecture.md` §1.5) chama `recomputeStats(b)` para cada bola
   viva, na posição indicada pelo pipeline (depois da lógica de passivas do tick, antes do movimento) — mas
   como `bonusPassive`/`bonusItem` estão sempre zerados nesta story, `stat[k] === base[k]` sempre, e nenhum
   leitor real consome `stat` ainda.
9. Nenhum código fora de `sim/stats.ts` e da inicialização/recálculo em `sim/world.ts` referencia `b.stat`,
   `b.base`, `b.bonusItem` ou `b.bonusPassive` nesta story — confirma que os campos são aditivos, não
   substitutivos, neste passo.

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type**: Architecture
**Secondary Type(s)**: —
**Complexity**: Low — arquivo novo + campos aditivos, sem trocar nenhum leitor existente

### Specialized Agent Assignment

**Primary Agents**:
- @dev
- @architect (dono da estrutura de dados; valida tetos de §1.4 e a fórmula de §1.2)

**Supporting Agents**:
- (nenhum)

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
- HIGH issues: document_only

### CodeRabbit Focus Areas

**Primary Focus**:
- Patterns: `STAT_KEYS` como array `const`, nunca `Object.keys()` no caminho quente (`architecture.md` §7.1)
- Performance: zerar `bonusPassive`/`bonusItem` reusando o objeto (iterar `STAT_KEYS`), nunca `{...spread}` nem `Object.assign` com literal

**Secondary Focus**:
- Forma fixa de objeto: `StatBlock`/`BonusBlock` criados com todas as chaves na mesma ordem sempre, nunca `delete`, nunca chave dinâmica

## Tasks / Subtasks

- [ ] Task 1 — Criar `src/sim/stats.ts` (AC: 5)
  - [ ] `STAT_KEYS` — as 14 chaves (ver Dev Notes para a lista exata e a discrepância documental "14 vs 15")
  - [ ] `StatBlock` / `BonusBlock` — `Record<StatKey, number>`
  - [ ] `DEFAULT_STATS` — valores default para campos sem fonte no `CharDef` (ver Dev Notes)
  - [ ] Tabela de tetos ΣMIN/ΣMAX/ABS_MIN/ABS_MAX para os 14 campos (copiar de `architecture.md` §1.4 — ver Dev Notes), como constantes nomeadas
  - [ ] `recomputeStats(base: StatBlock, bonusPassive: BonusBlock, bonusItem: BonusBlock): StatBlock` implementando a fórmula de §1.2 (ver Dev Notes)

- [ ] Task 2 — Estender `Ball` em `sim/types.ts` (AC: 6)
  - [ ] Adicionar `base`, `bonusItem`, `bonusPassive`, `stat: Readonly<StatBlock>`
  - [ ] **Não remover** nenhum campo existente nesta story

- [ ] Task 3 — Popular os novos campos em `makeBall` (AC: 7)
  - [ ] `base` = valores do `CharDef` para os campos estruturais/contínuos existentes + `DEFAULT_STATS` para os 8 campos novos (ver Dev Notes)
  - [ ] `bonusItem` e `bonusPassive` = todas as chaves zeradas
  - [ ] Chamar `recomputeStats` uma vez e atribuir o resultado a `stat`, antes de `makeBall` devolver a bola

- [ ] Task 4 — Wire do ponto de recálculo no tick (AC: 8)
  - [ ] Dentro do laço de bolas em `step()` (`sim/world.ts`), após a lógica de tick de cada bola e antes de `def.move(ctx, b)`, chamar `recomputeStats(b)` e atribuir a `b.stat`
  - [ ] Confirmar que isso não introduz nenhuma leitura nova de `b.stat` em outro lugar do arquivo

- [ ] Task 5 — Confirmar isolamento (AC: 9)
  - [ ] Buscar por `.stat.`, `.base.`, `.bonusItem`, `.bonusPassive` fora de `sim/stats.ts` e da inicialização/recálculo em `sim/world.ts` — não deve haver ocorrências
  - [ ] Rodar `npm run check` e `npm run sim:check`

## Dev Notes

### A fórmula (fonte: `architecture.md` §1.2, literal)

```
Σ[k]     = Σ bônus_passiva[k] + Σ bônus_item[k]
Σef[k]   = clamp( Σ[k], ΣMIN[k], ΣMAX[k] )              ← teto de balanceamento (§1.4)
stat[k]  = clamp( base[k] × (1 + Σef[k]), ABS_MIN[k], ABS_MAX[k] )   ← clamp de motor (§1.4)
```

Nesta story, `bonusPassive` e `bonusItem` são **sempre zero** (nenhum personagem ainda escreve neles — isso
só acontece em `debt.3`), então `Σ[k] = 0`, `Σef[k] = 0` (0 está dentro de qualquer intervalo ΣMIN/ΣMAX
razoável) e `stat[k] = clamp(base[k], ABS_MIN[k], ABS_MAX[k])`. Como os valores base do roster atual já
respeitam os clamps absolutos (são os valores de produção), `stat[k] === base[k]` sempre, byte a byte.

### `STAT_KEYS` — copiar literalmente de `architecture.md` §1.3

```ts
export const STAT_KEYS = [
  // estruturais — recomputados só em evento explícito (§1.5)
  'maxHp', 'radius',
  // contínuos — recomputados uma vez por bola por tick
  'mass', 'maxSpeed', 'steer', 'drag', 'restBall', 'restWall',
  'dmg', 'dmgTaken', 'atkSpeed', 'cdSpeed', 'range', 'knockbackTaken',
] as const

export type StatKey  = typeof STAT_KEYS[number]
export type StatBlock  = Record<StatKey, number>
export type BonusBlock = Record<StatKey, number>
```

**Nota de discrepância documental — não inventar um 15º campo.** `architecture.md` §1.1 e o Anexo B (item
A-9) dizem "os 15 campos" / "todos os 15 tetos", mas o array `STAT_KEYS` acima e a tabela de tetos de §1.4
listam **14** chaves (contadas: `maxHp, radius, mass, maxSpeed, steer, drag, restBall, restWall, dmg,
dmgTaken, atkSpeed, cdSpeed, range, knockbackTaken`). Isto é uma inconsistência do próprio documento-fonte,
não resolvida aqui — **implementar literalmente os 14 campos listados**, não inventar um 15º para bater com
o número do texto. Se o @architect quiser reconciliar o número, é decisão dele, registrada como pendência,
não como bloqueio desta story.

### Tabela de tetos — copiar de `architecture.md` §1.4 para `sim/stats.ts`

| Stat | Base (Golem / Vex) | ΣMIN | ΣMAX | Clamp absoluto |
|---|---|---|---|---|
| `maxHp` | 190 / 100 | −0.50 | +1.00 | ≥ 20 |
| `radius` | 24 / 15 | −0.20 | +0.30 | [8, 40] |
| `mass` | 3.2 / 0.9 | −0.50 | +1.50 | ≥ 0.20 |
| `maxSpeed` | 105 / 250 | −0.85 | +0.60 | [20, 420] |
| `steer` | 1.3 / 3.2 | −0.40 | +0.60 | [0.2, 6.0] |
| `drag` | 0.30 / 0.22 | −0.60 | +1.20 | [0.05, 0.60] |
| `restBall` | 0.65 | −0.60 | +0.45 | [0.05, 0.92] |
| `restWall` | 0.72 | −0.60 | +0.45 | [0.05, 0.92] |
| `dmg` | 1.00 | −0.75 | +1.00 | — |
| `dmgTaken` | 1.00 | −0.60 | +1.00 | [0.30, 2.50] |
| `atkSpeed` | 1.00 | −0.60 | +1.00 | cd efetivo ≥ 120 ms |
| `cdSpeed` | 1.00 | −0.50 | +1.00 | cd efetivo ≥ 500 ms *(corrigido de 400 — ver Change Log)* |
| `range` | 1.00 | −0.50 | +0.60 | alcance ef. ≤ 324 px |
| `knockbackTaken` | 1.00 | −0.75 | +1.00 | [0.25, 2.00] |

[Fonte: `architecture.md` §1.4 — a justificativa numérica de cada linha está lá; não repetida aqui para não
duplicar manutenção, mas cada teto deve entrar em `stats.ts` como **constante nomeada** (Anexo B item A-9).]

**Campos `atkSpeed`/`cdSpeed`/`range`** têm o clamp absoluto expresso como "cd efetivo ≥ X ms" ou "alcance
efetivo ≤ Y px" — isto é, o clamp absoluto não é sobre `stat[k]` diretamente, mas sobre o valor derivado no
ponto de uso (`cd / stat.cdSpeed`, `def.atk.range * stat.range`). Ver `debt.4` e `debt.5`/`debt.2` para onde
esses pontos de uso entram. Nesta story, basta que a constante nomeada exista e que a tabela ΣMIN/ΣMAX seja
aplicada a `Σef` normalmente — o clamp absoluto "derivado" é aplicado no ponto de consumo, não dentro de
`recomputeStats`, exceto para os campos cujo clamp absoluto É sobre `stat[k]` diretamente (`maxHp`, `radius`,
`mass`, `maxSpeed`, `steer`, `drag`, `restBall`, `restWall`, `dmgTaken`, `knockbackTaken`).

### `DEFAULT_STATS` — o que precisa de valor default

Campos que já vêm do `CharDef` hoje (não precisam de default, `base[k] = def[k]`): `maxHp`, `radius`,
`mass`, `maxSpeed`, `steer`, `drag`.

Campos que **não existem** no `CharDef` hoje e precisam de um default neutro em `DEFAULT_STATS`:

| Campo | Default | Origem |
|---|---|---|
| `restBall` | 0.65 | Era `REST_BALL` em `physics.ts:4` (migra em `debt.5`) |
| `restWall` | 0.72 | Era `REST_WALL` em `physics.ts:5` (migra em `debt.5`) |
| `dmg` | 1.00 | Base neutra — multiplicador |
| `dmgTaken` | 1.00 | Campo novo, hoje sempre 1.0 (`architecture.md` §1.4) |
| `atkSpeed` | 1.00 | Base neutra — multiplicador |
| `cdSpeed` | 1.00 | Base neutra — multiplicador (migra em `debt.4`) |
| `range` | 1.00 | Base neutra — multiplicador |
| `knockbackTaken` | 1.00 | Base neutra — multiplicador |

`CharDef` ganha `restBall?: number` e `restWall?: number` opcionais nesta story ou em `debt.5` — como
nenhum personagem do roster hoje declara restituição própria, é seguro adicionar o campo opcional já aqui
(fica não lido até `debt.5`) ou adiar para lá; **decisão do @dev**, ambas preservam o hash. Se adiado, marcar
como nota no File List desta story para o revisor de `debt.5` não redescobrir.

### Onde mexer

- `src/sim/stats.ts` — **novo arquivo**.
- `src/sim/types.ts` — `Ball` ganha os 4 campos novos (aditivo).
- `src/sim/world.ts` — `makeBall` popula os campos novos; `step()` ganha a chamada a `recomputeStats` no
  ponto indicado por §1.5.

### Performance (`architecture.md` §7.1 — vale desde este passo)

> **Nunca alocar no caminho quente.** Zerar `bonusPassive` reusando o objeto
> (`for (const k of STAT_KEYS) bonus[k] = 0`), jamais `{...}`, `Object.assign` com literal ou spread.

Isso vale mesmo que `bonusPassive` não seja escrito por nenhum personagem ainda nesta story — o padrão de
alocação já precisa estar certo, porque o custo (4 objetos por tick × 40M ticks no arnês da Fase 2 = 160
milhões de objetos) é medido em `architecture.md` §7.1 e a correção é mais barata de fazer agora do que
depois. `StatBlock`/`BonusBlock` devem ser criados com todas as chaves na mesma ordem, sempre — uma única
hidden class no V8.

### Testing

- `npm run check` — 0 erros.
- `npm run sim:check` — golden hash idêntico ao baseline de `debt.0` para as 5 seeds, **e** autoconsistência
  40/40 preservada.
- Verificação manual (não precisa de teste automatizado dedicado): buscar `.stat.` fora de `sim/stats.ts` e
  do trecho de `world.ts` alterado — deve retornar vazio, confirmando que os campos novos são código morto
  por enquanto.

### Contribuição para o Anexo B

Estabelece a base de **A-5** (os 8 itens do design têm ponto de aplicação nomeado no `StatBlock`) e **A-9**
(tetos como constantes nomeadas em `sim/stats.ts`) — com a ressalva da discrepância 14/15 registrada acima.
A validação completa de A-5/A-9 só fecha depois que os leitores forem trocados (`debt.2`) e `mods` for
removido (`debt.3`).

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-28 | 1.0 | Story criada a partir de `architecture.md` §1.2, §1.3, §1.4, §1.5 e §6.1 (passo 1) | River (@sm) |
| 2026-07-28 | 1.1 | Implementada. Status: Ready → InProgress → InReview. Todos os 9 ACs verificados: `tsc` limpo, golden hash idêntico ao baseline de `debt.0`, isolamento confirmado por grep (zero ocorrências de `.stat.`/`.base`/`.bonusItem`/`.bonusPassive` fora dos 2 arquivos esperados), 14 chaves confirmadas por execução direta. Assinatura de `recomputeStats` resolvida a favor de `(b: Ball): void` mutando in-place, conforme o Should-Fix apontado abaixo — a alternativa pura alocaria por chamada, contrariando §7.1. `restBall`/`restWall` adiados para `debt.5` (opção prevista na própria story), com nota deixada para o revisor daquela story. | @dev |
| 2026-07-28 | 1.0.1 | Validated GO (9/10) — Status: Draft → Ready. **Discrepância 14/15 resolvida pelo @po: 14 é o número correto.** `architecture.md` §1.3 (array `STAT_KEYS`) e §1.4 (tabela de tetos) enumeram 14 chaves cada; nenhum 15º campo é nomeado em lugar algum do documento. O "15" aparece só em prosa não enumerada (§0 linha 19, §7.1 linha 750, §8/R-01 linha 849, Anexo B A-9) — é erro do documento-fonte. A decisão do @sm de implementar os 14 literais está **confirmada** (Article IV). Pendência para @architect (não bloqueia): reconciliar os 4 pontos, incluindo `3 600 recálculos/s` em §7.1 que deriva de 15 (com 14 seriam 3 360). Correção de citação: o "15" **não** está em §1.1, como afirma a nota da story. Should-Fix antes da implementação: AC 5 declara `recomputeStats(base, bonusPassive, bonusItem): StatBlock` (função pura que devolve bloco novo) mas AC 8, Task 3 e Task 4 chamam `recomputeStats(b)` — as duas formas são incompatíveis, e a que devolve `StatBlock` novo aloca por tick, contrariando §7.1. @dev/@architect decidem a assinatura única antes de codar. | @po |
| 2026-07-28 | 1.2 | QA Gate CONCERNS — Status: InReview → Done. Verificação independente: `check`/`sim:check` reexecutados, baseline de `debt.0` confirmado intacto e o golden hash provado como tripwire vivo por teste negativo reproduzido do zero (`REST_BALL` +0,015% → 5 desvios, arquivo restaurado). Tabela de tetos conferida 14/14 contra `architecture.md` §1.4 sem erro de transcrição; `STAT_KEYS.length === 14` por execução; `stat[k] === base[k]` instrumentado tick a tick nas 5 seeds do baseline → **0 violações em 4.543 ticks**, e 0 drift entre `base` e os campos diretos; ordem de chaves idêntica a `STAT_KEYS` nos 4 blocos das 4 bolas. Cast `as StatBlock` confirmado único no repositório e endossado como escape hatch isolado. 5 ressalvas `low` (REQ-001 texto do AC5 desatualizado → @po; MNT-001 `zeroBonus` morto; ARCH-001 ciclo de import type-only; PERF-001 `Partial` nos clamps; DOC-001 checkboxes → @dev). Gate: `docs/qa/gates/debt.1-stat-layers-shadow-mode.yml`. | @qa |
| 2026-07-28 | 1.3 | Correção retroativa (QA-001 do gate de `debt.4`): a tabela de tetos desta story (Dev Notes) copiava `cd efetivo ≥ 400 ms` de `architecture.md` §1.4, valor que ficava abaixo dos 450ms que deveria proteger. `architecture.md` e a implementação em `world.ts` (`MIN_ABILITY_CD_MS`) foram corrigidos para 500ms; esta linha de documentação atualizada para não divergir da fonte. Nenhum código desta story foi alterado — o campo `cdSpeed` em si (base, tetos ΣMIN/ΣMAX) está correto; só o clamp absoluto derivado mudou de valor, e ele é aplicado no ponto de consumo (`debt.4`), não em `recomputeStats`. | @dev |

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
espelho 2v2    time0 19 · time1 14 · empate 7
duração        mediana 13.8s · min 12.3s · max 19.5s

$ grep -rn "\.stat\." src --include="*.ts" | grep -v "sim/stats.ts\|sim/world.ts"
(vazio)
$ grep -rnE "\.(base|bonusItem|bonusPassive)\b" src --include="*.ts" | grep -v "sim/stats.ts\|sim/world.ts"
(vazio)

$ node --experimental-strip-types -e "import('./src/sim/stats.ts').then(m => console.log(m.STAT_KEYS.length))"
14
```

### Completion Notes List

- **Assinatura de `recomputeStats` resolvida a favor da performance**, conforme o Should-Fix
  do @po no Change Log: `recomputeStats(b: Ball): void`, mutando `b.stat` no lugar. A forma
  pura (`recomputeStats(base, bonusPassive, bonusItem): StatBlock`) alocaria um `StatBlock`
  por chamada — contraria `architecture.md` §7.1, citado na própria story. Documentado como
  comentário no código-fonte, não só aqui.
- **`b.stat` é `Readonly<StatBlock>`** (AC 6, literal). `recomputeStats` escreve nele via
  `b.stat as StatBlock` — cast único e deliberado, comentado no local exato. É o ponto de
  exceção controlada à proteção de tipo; nenhum outro código no repositório faz esse cast
  (confirmado pelo grep de isolamento acima).
- **`restBall`/`restWall` adiados para `debt.5`** (a story permitia as duas opções). `base`
  usa `DEFAULT_STATS.restBall`/`restWall` (0.65/0.72) via spread — nenhum `CharDef` do roster
  declara restituição própria hoje, então isso é idêntico ao comportamento atual. **Nota para
  o revisor de `debt.5`:** `CharDef` ainda não tem `restBall?`/`restWall?` opcionais; ao migrar
  a restituição por corpo, adicionar esses campos ao `CharDef` e trocar a fonte de `base` de
  `DEFAULT_STATS` para `def.restBall ?? DEFAULT_STATS.restBall` (mesmo padrão para wall).
- **14 campos confirmados por execução direta** (`STAT_KEYS.length === 14`), não só por
  contagem visual da lista — fecha a verificação que o @po havia feito por leitura.
- Golden hash idêntico ao baseline de `debt.0` para as 5 seeds — confirma que os campos novos
  são aditivos e não alteram o comportamento, como a classificação de risco "baixo" da story
  previa.
- `zeroBonus()` foi criado em `stats.ts` conforme a Task 1 pedia a estrutura, mas **não é
  chamado em lugar nenhum ainda** — nada escreve em `bonusPassive` nesta story (isso é
  `debt.3`), então zerar a cada tick seria trabalho sem efeito. Fica pronto para `debt.3`
  usar.

### File List

| Arquivo | Mudança |
|---|---|
| `src/sim/stats.ts` | **novo** — `STAT_KEYS`, `StatBlock`, `BonusBlock`, `DEFAULT_STATS`, tabelas `SIGMA_MIN/MAX` e `ABS_MIN/MAX`, `makeStatBlock`, `zeroBonus`, `recomputeStats` |
| `src/sim/types.ts` | `Ball` ganha `base`, `bonusPassive`, `bonusItem`, `stat` (aditivo — nada removido) |
| `src/sim/world.ts` | import de `stats.ts`; `makeBall` popula os 4 campos novos e chama `recomputeStats` uma vez; `step()` chama `recomputeStats(b)` por bola viva, entre `def.on?.tick` e `def.move` |

Nenhum arquivo em `chars/`, `bot/` ou `client/` foi tocado.

## QA Results

### Review Date: 2026-07-28

### Reviewed By: Quinn (@qa — Test Architect)

**Revisão independente.** Nada abaixo foi aceito da Debug Log ou das Completion Notes do @dev:
todos os comandos foram reexecutados, o teste negativo foi reproduzido do zero e a invariante
central foi instrumentada em vez de assumida.

#### O que foi verificado, e como

| # | Verificação | Método | Resultado |
|---|---|---|---|
| 1 | `npm run check` | reexecutado pelo @qa | 0 erros |
| 2 | `npm run sim:check` | reexecutado pelo @qa | determinismo ✓ · golden hash ✓ 5 seeds |
| 3 | Baseline não foi adulterado | `git diff src/tools/determinism.ts` + comparação valor a valor com `architecture.md` §6.0 | vazio; os 5 hashes conferem |
| 4 | O golden hash é tripwire vivo | `REST_BALL` 0.65 → 0.6501 em `physics.ts` (0,015%), rodar, restaurar | `golden hash ✗ 5 desvio(s)` + throw. Arquivo restaurado, `git status` limpo |
| 5 | Ticks por seed | medidos pelo @qa | 753 / 961 / 830 / 831 / 1168 — batem o BASELINE (confirmação cruzada além do hash) |
| 6 | Tabela de tetos vs `architecture.md` §1.4 | linha a linha, campo a campo | **14/14 corretos**, sem erro de transcrição |
| 7 | `STAT_KEYS.length` | execução direta + `Set(...).size` | **14**, sem duplicatas — confirma a resolução do @po |
| 8 | `stat[k] === base[k]` | instrumentado com `Object.is` nas 14 chaves × 4 bolas × cada tick das 5 seeds do baseline | **0 violações em 4.543 ticks** |
| 9 | `base[k]` vs campo direto | mesma instrumentação | **0 drift** — nenhum `init`/`onTick` de passiva desincroniza os dois |
| 10 | Forma de objeto (§7.1) | `Object.keys()` de `base`/`stat`/`bonusPassive`/`bonusItem` nas 4 bolas | ordem idêntica a `STAT_KEYS` nos 4 blocos — hidden class única |
| 11 | Isolamento (AC9) | grep próprio `/\.(stat\|base\|bonusItem\|bonusPassive)\b/` em `src` | só `sim/stats.ts` + 1 comentário em `sim/world.ts` |
| 12 | Cast `as StatBlock` | grep no repositório inteiro | **único** (`stats.ts:98`) |
| 13 | Pureza de `sim/` (AC4) | leitura dos imports | `stats.ts` tem só `import type` — zero runtime dep, zero DOM/IO/`Math.random` |

**Sobre a tabela de tetos (item 6).** Conferi os 14 campos contra `architecture.md` §1.4 sem
atalho, incluindo as quatro ausências deliberadas de clamp absoluto: `dmg` não tem clamp (`—` na
tabela) e `atkSpeed`/`cdSpeed`/`range` têm teto expresso sobre o valor **derivado** (cd efetivo,
alcance efetivo), aplicado no ponto de consumo em `debt.2`/`debt.4`/`debt.5`, não dentro de
`recomputeStats`. O `Partial<StatBlock>` do @dev codifica exatamente essa distinção, e o
comentário no arquivo a explica. Nenhum número foi transcrito errado — que era o risco silencioso
desta story, porque só apareceria na Fase 3.

**Sobre a assinatura de `recomputeStats` (item 12).** A resolução é tecnicamente correta e eu a
endosso. O argumento do @dev não é preferência: a forma pura alocaria um `StatBlock` por chamada
no laço de tick, e `architecture.md` §7.1 proíbe alocar no caminho quente com número medido. O
cast `b.stat as StatBlock` é escape hatch **limpo e isolado**, por três razões verificadas:
(a) é o único cast de escrita no repositório inteiro; (b) é local — a referência mutável fica numa
`const` dentro da função, nunca escapa nem é devolvida; (c) o `Readonly<StatBlock>` continua
valendo para todo o resto do código, que é exatamente onde a proteção importa. Não abre buraco
explorável: qualquer outro arquivo que quisesse escrever em `b.stat` teria de escrever o próprio
cast, o que é ruído visível em revisão, não um vazamento silencioso. Ressalva registrada como
REQ-001 é sobre o **texto do AC5**, que ficou desatualizado — não sobre a implementação.

**Sobre o adiamento de `restBall`/`restWall` para `debt.5` (permitido pela story).** Suficiente,
e por um motivo melhor que a nota do @dev: fui conferir a story `debt.5` e ela **já** prevê o caso
no próprio texto — AC5 diz "`CharDef` ganha `restBall?`/`restWall?` opcionais (se ainda não
adicionados em `debt.1`)" e a Task 1 repete "(se não feito em `debt.1`)". Ou seja, a informação
não depende de alguém lembrar de ler o File List de `debt.1`: está no caminho crítico de quem for
implementar `debt.5`. A nota do @dev é redundância útil, não a única defesa.

**Armadilha latente que procurei e não encontrei.** `bonusPassive` nunca é zerado nesta story
(`zeroBonus` existe e não é chamado). Se `debt.3` começar a escrever bônus sem zerar por tick, os
bônus acumulariam para sempre — bug grave e difícil de ver. Fui conferir: `debt.3` AC8 e Task 2 já
mandam zerar `b.bonusPassive` reusando o objeto, antes de `recomputeStats`. Coberto a jusante.

#### Blast radius

3 arquivos, +33 linhas em `src/` (`stats.ts` novo, `types.ts` +12, `world.ts` +21), nenhum arquivo
em `chars/`, `bot/`, `client/` ou `tools/` tocado. Zero leitores reais dos campos novos — o
"código morto por um passo" que a story prometia é literal, e agora está provado numericamente,
não alegado.

#### Ressalvas (todas `low`, nenhuma bloqueia)

| ID | Achado |
|---|---|
| REQ-001 | Texto do AC5 ainda declara a assinatura pura, divergindo do código. Resolução autorizada e documentada em 3 lugares, mas o AC nunca foi emendado — @po. |
| MNT-001 | `zeroBonus` é código morto; o projeto não tem script `lint` e `tsc` não sinaliza export órfão. Coberto por `debt.3`. |
| ARCH-001 | `types.ts` ↔ `stats.ts` agora se importam mutuamente. Inofensivo hoje (`import type` dos dois lados, apagado em runtime); vira ciclo real se alguém trocar por import de valor em `debt.2`/`debt.3`. |
| PERF-001 | `ABS_MIN`/`ABS_MAX` como `Partial` geram 4 leituras de propriedade ausente por bola por tick. Desprezível hoje; se o arnês de 40M ticks apontar, trocar por sentinelas ±Infinity. |
| DOC-001 | Checkboxes de Tasks 1-5 e Quality Gate ainda `[ ]`. Segunda ocorrência (idem `debt.0`) — está virando padrão. @dev. |

#### Higiene do gate

Todos os experimentos do @qa foram revertidos: `physics.ts` restaurado do backup e `sim:check`
reexecutado verde depois; script de instrumentação removido. `git status` ao final mostra apenas
os 3 arquivos desta story mais o próprio story file.

### Gate Status

Gate: CONCERNS → `docs/qa/gates/debt.1-stat-layers-shadow-mode.yml`

### Recommended Status

**Done** — pronto para `debt.2`. As 5 ressalvas são `low` e nenhuma toca o comportamento do jogo
nem a estrutura de dados entregue.
