# Story debt.1: Camadas de stat em modo sombra (`stats.ts`, `recomputeStats`, campos aditivos)

## Status

Ready

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
| `cdSpeed` | 1.00 | −0.50 | +1.00 | cd efetivo ≥ 400 ms |
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
| 2026-07-28 | 1.0.1 | Validated GO (9/10) — Status: Draft → Ready. **Discrepância 14/15 resolvida pelo @po: 14 é o número correto.** `architecture.md` §1.3 (array `STAT_KEYS`) e §1.4 (tabela de tetos) enumeram 14 chaves cada; nenhum 15º campo é nomeado em lugar algum do documento. O "15" aparece só em prosa não enumerada (§0 linha 19, §7.1 linha 750, §8/R-01 linha 849, Anexo B A-9) — é erro do documento-fonte. A decisão do @sm de implementar os 14 literais está **confirmada** (Article IV). Pendência para @architect (não bloqueia): reconciliar os 4 pontos, incluindo `3 600 recálculos/s` em §7.1 que deriva de 15 (com 14 seriam 3 360). Correção de citação: o "15" **não** está em §1.1, como afirma a nota da story. Should-Fix antes da implementação: AC 5 declara `recomputeStats(base, bonusPassive, bonusItem): StatBlock` (função pura que devolve bloco novo) mas AC 8, Task 3 e Task 4 chamam `recomputeStats(b)` — as duas formas são incompatíveis, e a que devolve `StatBlock` novo aloca por tick, contrariando §7.1. @dev/@architect decidem a assinatura única antes de codar. | @po |

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
