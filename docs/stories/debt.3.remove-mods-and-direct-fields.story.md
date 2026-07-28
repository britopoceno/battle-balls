# Story debt.3: Remover `Ball.mods` e os campos diretos — resolve C3

## Status

Draft

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: ["npm run check (autoridade final — enumera todos os pontos de leitura quebrados)", "npm run sim:check"]
```

## Story

**Como** desenvolvedor executando o passo 3 da migração de stats — o maior e o que resolve **C3**
(`docs/prd.md` §4: `mods` escrito por atribuição absoluta em vez de acumulação),
**eu quero** remover `Ball.mods`, `Ball.radius`, `Ball.mass`, `Ball.maxSpeed`, `Ball.steer`, `Ball.drag` e
`Ball.maxHp`, migrando `golem.ts`, `vex.ts`, `world.ts`, `render.ts` e `inspect.ts` para `b.stat.*` e
`b.base.*`,
**para que** exista uma única fonte de verdade para cada stat — o pecado de C3 (duas fontes de verdade para
o mesmo número, a última escrita vencendo) deixa de ser possível por construção, não por convenção.

## Depende de

`debt.2` (Done) — os leitores do lado do motor (`effectiveSpeed`, `dealDamage`, `knockback` parcial,
`autoAttack`, `integrate`, `collideBalls`) já devem estar lendo de `stat.*` antes de os campos diretos
desaparecerem. Se `debt.2` deixou a troca de `knockback` pendente (ver seção "Risco não trivial" daquela
story), **esta story é onde ela precisa fechar**, junto da migração do Golem (ver Task 5 abaixo).

## Acceptance Criteria

1. `npm run check` (`tsc --noEmit`) verde. Esta é a verificação principal desta story: `architecture.md`
   §6.1 classifica o risco como "médio: é o passo grande, mas o `tsc` enumera todos os pontos" — a lista
   abaixo é o conjunto **conhecido** de pontos que quebram, mas o compilador é a autoridade final. Se `tsc`
   apontar um site de leitura não listado aqui, corrigir também — a lista não é garantidamente exaustiva.
2. `npm run sim:check` verde (autoconsistência 40/40 + baseline).
3. Golden hash **idêntico** ao baseline de `architecture.md` §6.0 (seeds 1, 2, 3, 7, 11).
4. `sim/` continua puro: sem `Math.random`, sem DOM, sem I/O, sem importar de `chars/`, `bot/`, `client/`.
5. `Ball` (em `sim/types.ts`) não tem mais os campos `mods`, `radius`, `mass`, `maxSpeed`, `steer`, `drag`,
   `maxHp`. Todo acesso passa a ser via `b.stat.*` (ou `b.base.*` onde o valor congelado de criação, não o
   derivado, for o que se quer — ver Dev Notes sobre quando usar cada um).
6. `PassiveDef.init` não existe mais. Passiva estática declara `bonus?: Partial<BonusBlock>`; passiva
   condicional usa `onTick` chamando `ctx.addBonus`.
7. `SimCtx.addBonus: (self: Ball, key: StatKey, amount: number) => void` existe e soma em
   `self.bonusPassive[key]` (nunca sobrescreve — acumula, resolvendo C3 pela raiz).
8. O pipeline de recálculo por tick (`architecture.md` §1.5) está completo: zerar `bonusPassive` (reuso de
   objeto, iterando `STAT_KEYS`), somar `bonus` declarativo de cada passiva ativa, chamar
   `passives[i].onTick?.(ctx, b)`, chamar `char.on.tick?.(ctx, b)`, **então** `recomputeStats(b)` — nesta
   ordem exata.
9. Todos os 6 pontos listados na tabela "O que quebra" (Dev Notes, de `architecture.md` §6.2) estão
   migrados: `golem.ts:94-96`, `golem.ts:102`, `vex.ts:96-98`, `vex.ts:41`, `vex.ts:90`, `world.ts:158`, mais
   `render.ts` e `inspect.ts`.
10. Conversão numérica exata verificada: `1 − 0.6 === 0.4` (Golem, `knockbackResist`→`knockbackTaken`) e
    `250 × 1.25 === 250 × (1 + 0.25)` (Vex, `mods.speed`→bônus de `maxSpeed`) — ambas `true` em binário64.
11. Nenhuma passiva do roster escreve em `stat` diretamente ou em `mods` (que não existe mais) — só em
    `bonusPassive`, via `addBonus` ou `bonus` declarativo (Anexo B item A-6).
12. `golem.ts`'s bloco `on.collide` (linhas 134-144) **permanece intocado nesta story** — sua remoção é
    escopo de `debt.6`. Confirmar que ele não referencia nenhum campo removido (ele usa `ctx.damage`,
    `ctx.knockback` e `self.memory`, nenhum dos quais é `mods` ou um campo direto — não deveria quebrar a
    compilação por esta story).

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type**: Architecture
**Secondary Type(s)**: —
**Complexity**: High — toca 5+ arquivos, remove campos de uma interface central, resolve C3 diretamente

### Specialized Agent Assignment

**Primary Agents**:
- @dev
- @architect (dono da estrutura; valida que a migração do Golem/Vex preserva a semântica descrita em §1.7 e §6.2)

**Supporting Agents**:
- @qa (recomendado — story de maior superfície de mudança do épico, antes de `debt.6`)

### Quality Gate Tasks

- [ ] Pre-Commit (@dev): `npm run check` até zero erros, depois `npm run sim:check`
- [ ] Pre-PR (@github-devops): Rodar antes de criar pull request

### Self-Healing Configuration

**Expected Self-Healing**:
- Primary Agent: @dev (light mode)
- Max Iterations: 2
- Timeout: 15 minutes
- Severity Filter: CRITICAL

**Predicted Behavior**:
- CRITICAL issues: auto_fix (até 2 iterações) — se persistir, escalar para revisão manual dado o tamanho da story
- HIGH issues: document_only

### CodeRabbit Focus Areas

**Primary Focus**:
- Backward compatibility: golden hash idêntico apesar da reestruturação grande
- Completude: todo campo removido de `Ball` tem todos os seus leitores migrados (não só os 6 listados)

**Secondary Focus**:
- Performance: `addBonus`/zeragem de `bonusPassive` seguindo a disciplina de não-alocação de `architecture.md` §7.1
- Semântica: a mudança de `mods.speed = X` (absoluto) para `addBonus(self, 'maxSpeed', 0.25)` (aditivo) é intencional e está documentada, não é regressão

## Tasks / Subtasks

- [ ] Task 1 — Atualizar `PassiveDef` e `SimCtx` em `sim/types.ts` (AC: 6, 7)
  - [ ] Remover `init?: (self: Ball) => void` de `PassiveDef`
  - [ ] Adicionar `bonus?: Partial<BonusBlock>` a `PassiveDef` (declarativo, auditável sem executar código)
  - [ ] Adicionar `addBonus: (self: Ball, key: StatKey, amount: number) => void` a `SimCtx`

- [ ] Task 2 — Implementar `addBonus` e o pipeline completo de tick em `world.ts` (AC: 7, 8)
  - [ ] `addBonus` no `makeCtx`: `self.bonusPassive[key] += amount` (soma, nunca atribuição absoluta)
  - [ ] No laço de `step()`, antes de `recomputeStats(b)`: zerar `b.bonusPassive` reusando o objeto (`for
    (const k of STAT_KEYS) b.bonusPassive[k] = 0` — nunca `{...}`), somar o `bonus` declarativo da passiva
    ativa (`passives[b.passiveIndex].bonus`), chamar `passives[b.passiveIndex].onTick?.(ctx, b)`, chamar
    `def.on?.tick?.(ctx, b)`, **então** `recomputeStats(b)`

- [ ] Task 3 — Migrar `golem.ts` (AC: 9, 10)
  - [ ] `golem.ts:94-96`: `init: (self) => { self.mods.knockbackResist = 0.6 }` → `bonus: { knockbackTaken: -0.6 }`
  - [ ] `golem.ts:102`: `self.hp / self.maxHp > 0.5` → `self.hp / self.stat.maxHp > 0.5`
  - [ ] Confirmar `1 - 0.6 === 0.4` (a conversão do multiplicador antigo para o bônus novo é exata)
  - [ ] **Não tocar** no bloco `on.collide` (linhas 134-144) — fica intocado até `debt.6`

- [ ] Task 4 — Migrar `vex.ts` (AC: 9, 10)
  - [ ] `vex.ts:96-98`: `onTick: (_ctx, self) => { self.mods.speed = self.hp/self.maxHp < 0.4 ? 1.25 : 1 }`
    → `onTick: (ctx, self) => { if (self.hp / self.stat.maxHp < 0.4) ctx.addBonus(self, 'maxSpeed', 0.25) }`
  - [ ] `vex.ts:41`: `alvo.hp / alvo.maxHp < 0.4` → `alvo.hp / alvo.stat.maxHp < 0.4`
  - [ ] `vex.ts:90`: `alvo.hp / alvo.maxHp < 0.5` (dentro de `onDamageDealt` da passiva Predador) →
    `alvo.hp / alvo.stat.maxHp < 0.5`
  - [ ] Confirmar `250 × 1.25 === 250 × (1 + 0.25)` (a conversão é exata)

- [ ] Task 5 — Migrar `world.ts` (AC: 9)
  - [ ] `world.ts:158` (`weakestEnemy`): `b.hp / b.maxHp < best.hp / best.maxHp` → `b.hp / b.stat.maxHp <
    best.hp / best.stat.maxHp`
  - [ ] Fechar a migração de `knockback` para `stat.knockbackTaken`, se ficou pendente em `debt.2` (ver
    "Depende de" acima) — agora que o Golem contribui `-0.6` via `bonus`, `stat.knockbackTaken` do Golem
    deve valer `0.4`, reproduzindo `1 - mods.knockbackResist` exatamente

- [ ] Task 6 — Migrar `render.ts` e `inspect.ts` (AC: 9)
  - [ ] `render.ts` (~linha 147): `b.radius` → `b.stat.radius`
  - [ ] `render.ts` (~linhas 195, 302): `b.hp / b.maxHp` → `b.hp / b.stat.maxHp` (duas ocorrências)
  - [ ] `inspect.ts` (~linha 32): `b.maxHp` (na string de log) → `b.stat.maxHp`

- [ ] Task 7 — Remover os campos de `Ball` e `makeBall` (AC: 5)
  - [ ] `sim/types.ts`: remover `mods`, `radius`, `mass`, `maxSpeed`, `steer`, `drag`, `maxHp` de `Ball`
  - [ ] `sim/world.ts`, `makeBall`: remover a inicialização desses campos do objeto literal (já cobertos por
    `base`, populado desde `debt.1`)

- [ ] Task 8 — Deixar o `tsc` enumerar o resto (AC: 1)
  - [ ] Rodar `npm run check` e corrigir **todo** erro reportado, mesmo que o site não esteja na lista da
    Task 3-6 — a lista é o conjunto conhecido, o compilador é a autoridade final
  - [ ] Repetir até `tsc --noEmit` sair limpo

- [ ] Task 9 — Verificação final (AC: 2, 3, 4, 11, 12)
  - [ ] `npm run sim:check` — golden hash idêntico ao baseline, autoconsistência 40/40
  - [ ] Buscar por `.mods` e `self.mods` em `src/chars/` e `src/sim/` — deve retornar vazio
  - [ ] Confirmar que `golem.ts:134-144` (`on.collide`) não foi tocado

## Dev Notes

### O que quebra, arquivo:linha — copiado de `architecture.md` §6.2, não redescobrir

| Arquivo:linha | Hoje | Depois | Como |
|---|---|---|---|
| `golem.ts:94-96` | `init: (self) => { self.mods.knockbackResist = 0.6 }` | `bonus: { knockbackTaken: -0.6 }` | Erro de compilação (`mods` e `init` não existem). Conversão exata: `1 − 0.6 === 0.4` |
| `golem.ts:102` | `self.hp / self.maxHp > 0.5` | `self.hp / self.stat.maxHp > 0.5` | Erro de compilação, correção mecânica |
| `vex.ts:96-98` | `onTick: (_ctx, self) => { self.mods.speed = ... ? 1.25 : 1 }` | `onTick: (ctx, self) => { if (self.hp / self.stat.maxHp < 0.4) ctx.addBonus(self, 'maxSpeed', 0.25) }` | Erro de compilação. Diferença semântica intencional (ver abaixo). Numericamente idêntico: `250 × 1.25 === 250 × (1 + 0.25)` |
| `vex.ts:41` e `:90` | `alvo.hp / alvo.maxHp` | `alvo.hp / alvo.stat.maxHp` | Compilação |
| `world.ts:158` | `b.hp / b.maxHp` em `weakestEnemy` | `b.hp / b.stat.maxHp` | Compilação |
| `render.ts` (~147, ~195, ~302) | `b.radius`, `b.hp / b.maxHp` (×2) | `b.stat.radius`, `b.hp / b.stat.maxHp` | Compilação |
| `inspect.ts` (~32) | `b.maxHp` | `b.stat.maxHp` | Compilação |

[Fonte: `architecture.md` §6.2 e Anexo A]

### A diferença semântica do Vex que NÃO é regressão

A migração de `self.mods.speed = X` (atribuição absoluta) para `ctx.addBonus(self, 'maxSpeed', 0.25)`
(soma) é exatamente o que resolve **C3**. Hoje, se dois efeitos quisessem modificar `speed` no mesmo tick, o
último a escrever venceria — é literalmente o bug que faz uma Turbina comprada não fazer nada num Vex com a
passiva Fantasma ativa (`docs/prd.md` §4, C3). Com `addBonus`, os dois bônus **coexistem** somados. Hoje,
com um único bônus ativo (a passiva Fantasma), o resultado numérico é idêntico
(`250 × 1.25 === 250 × (1 + 0.25)`), mas o comportamento sob composição já está correto para quando o
primeiro item existir (`debt.3` não implementa itens — isso é a Fase 3, passo 8, fora deste épico — mas a
capacidade de compor já nasce certa).

### Quando usar `base` vs `stat`

`base` é o valor **congelado na criação da bola**, vindo do `CharDef` (mais `DEFAULT_STATS`). `stat` é o
valor **derivado**, recalculado a cada tick (para os campos contínuos) ou em evento explícito (para os
estruturais `maxHp`/`radius`). Qualquer leitura de "o valor efetivo agora" deve usar `stat`. `base` só
importa dentro de `recomputeStats` e em código que precise explicitamente do valor sem bônus (nenhum
consumidor faz isso hoje).

### Onde mexer

`src/sim/types.ts`, `src/sim/world.ts`, `src/chars/golem.ts`, `src/chars/vex.ts`, `src/client/render.ts`,
`src/tools/inspect.ts`.

### Contração de risco: o que o `tsc` pega e o que ele não pega

`architecture.md` §6.2 é explícito sobre isto: `tsc --noEmit` pega **todo** acesso a campo removido — é por
isso que este passo, apesar de grande, é risco "médio" e não "alto": o compilador não deixa nenhum site
escapar silenciosamente. O que o `tsc` **não pega** é mudança de comportamento (isso é `debt.6`, não esta
story) — nesta story a garantia comportamental vem do golden hash (AC 3), não do compilador.

### Testing

- `npm run check` — deve chegar a 0 erros; usar a lista da tabela acima como ponto de partida, mas seguir
  corrigindo até o compilador não reportar mais nada.
- `npm run sim:check` — golden hash idêntico ao baseline de `debt.0`, autoconsistência 40/40.
- Grep de confirmação: `grep -rn "\.mods\b" src/chars src/sim` deve retornar vazio ao final.
- Grep de confirmação: `grep -rn "self\.maxHp\|b\.maxHp\|\.radius\b" src/sim src/chars src/client src/tools`
  — cada ocorrência restante deve ser em `CharDef` (que mantém `maxHp`/`radius` como base) ou em
  `b.stat.maxHp`/`b.stat.radius`, nunca em `Ball` direto.

### Contribuição para o Anexo B

Fecha **A-6** (nenhuma passiva do roster escreve em `stat` ou em `mods`, que não existe mais) e avança
**A-5** para conclusão (todos os 8 itens do design agora têm ponto de aplicação nomeado e **lido de fato**).
Resolve **C3** do PRD (`docs/prd.md` §4) por completo.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-28 | 1.0 | Story criada a partir de `architecture.md` §1.3, §1.7, §6.1 (passo 3) e §6.2 (tabela linha a linha) | River (@sm) |

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
