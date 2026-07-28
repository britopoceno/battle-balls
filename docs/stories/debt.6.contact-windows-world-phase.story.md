# Story debt.6: Janela de dano por contato declarada, `world.phase`, checagem em `dealDamage` — resolve D-07/C1

## Status

Draft

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: ["npm run check", "npm run sim:check (única fonte de verdade sobre se o golden hash sobreviveu)"]
```

## Story

**Como** desenvolvedor executando o passo 6 da migração de stats — o de **maior risco** do épico, resolve
**D-07/C1** (`docs/prd.md` §4/§5: o Pilar 3 — "colisão causa 0 dano" — não é auditável),
**eu quero** que o dash do Golem declare sua janela de dano por contato como campo tipado do personagem
(`CharDef.contactWindows`), que o motor resolva essa janela genericamente dentro de `collideBalls`, e que
`dealDamage` recuse dano fora de janela declarada,
**para que** o Pilar 3 reformulado (D-07: "colisão passiva causa 0 dano; dano por contato existe apenas
dentro de janela explícita de habilidade, declarada no personagem") seja verificável para qualquer
personagem futuro, não só auditável lendo `golem.ts` linha a linha.

## Depende de

`debt.5` (Done) — segue a ordem sequencial. Esta é a story de **maior risco** do épico inteiro: é a única
cujo golden hash depende de **ordem de execução**, não só de aritmética (`architecture.md` §6.1, linha do
passo 6: "idêntico **se** a ordem de pares de `collideBalls` for preservada").

## ⚠️ Leia isto antes de começar — modos de falha conhecidos

Esta migração tem duas metades que precisam fechar **juntas**, no mesmo commit. Fazer só uma metade
**não gera erro de compilação** — `Ball.memory` continua sendo `Record<string, number>`, então
`self.memory.dashAte` continuaria compilando mesmo depois de tudo migrado. Os dois modos de falha conhecidos
(fonte: `architecture.md` §6.2, linha `golem.ts:52`):

1. **Migrar o `cast` (chamar `ctx.openContactWindow`) e esquecer de deletar o `on.collide` antigo** → o
   `sim:check` **explode**: `dealDamage` chamado de dentro de `on.collide` roda sob `world.phase ===
   'collide'` e lança `Error('Pilar 3: dano por contato fora de janela declarada · golem')`. Falha ruidosa,
   fácil de diagnosticar.
2. **Deletar o `on.collide` e esquecer de migrar o `cast`** (ou esquecer de conectar
   `resolveContactWindow` dentro de `collideBalls`) → **nada quebra em tempo de execução**. A janela nunca
   abre, o dano do dash do Golem simplesmente some, sem erro, sem exceção. **Só o golden hash pega isso** —
   os ticks/hp finais divergem do baseline porque o Golem para de causar 14 de dano por contato.

Trate o golden hash como parte da suíte de testes desta story com o mesmo peso que `tsc`, não como
formalidade final.

## Acceptance Criteria

1. `npm run check` (`tsc --noEmit`) verde.
2. `npm run sim:check` verde: autoconsistência 40/40, baseline das 5 seeds, **e** zero violações de fase
   reportadas pela tabela de janelas de contato (ver AC 8).
3. Golden hash **idêntico** ao baseline de `architecture.md` §6.0 (seeds 1, 2, 3, 7, 11) — condicional à
   ordem de pares de `collideBalls` (`onCollide(a,b)` depois `onCollide(b,a)`, `physics.ts:65-66`) ser
   preservada, e a `resolveContactWindow` rodar **antes** de `char.on.collide` dentro de cada chamada.
4. `sim/` continua puro: sem `Math.random`, sem DOM, sem I/O, sem importar de `chars/`, `bot/`, `client/`.
5. `sim/types.ts` ganha: `ContactWindowDef` (`source`, `ms`, `dmg`, `knockback`, `reHitMs`, `onHit?`),
   `ContactState` (`source`, `endsAt`, `lastHitAt`), `CharDef.contactWindows?: ContactWindowDef[]`,
   `Ball.contact: ContactState | null`, `World.phase: 'cast' | 'tick' | 'effect' | 'attack' | 'zone' |
   'projectile' | 'contact' | 'collide'`, `SimCtx.openContactWindow: (self: Ball, source: string) => void`.
6. Golem declara `contactWindows: [{ source: 'sismico', ms: 450, dmg: 14, knockback: 520, reHitMs: 250 }]`
   em seu `CharDef`. O `cast` de `sismico` troca `self.memory.dashAte = ctx.now + 450` por
   `ctx.openContactWindow(self, 'sismico')`.
7. O bloco `on.collide` do Golem (`golem.ts:134-144`) é **deletado inteiro** — o motor faz o trabalho, uma
   vez, para todo o roster.
8. `world.phase` é atualizado corretamente em cada fase do `step()` (`cast`, `tick`, `effect`, `attack`,
   `zone`, `projectile`, `contact`, `collide`), salvo e restaurado por atribuição direta
   (`const prev = world.phase; ...; world.phase = prev`), **não** por `try/finally` — há reentrância real
   (dano da janela → morte → `on.kill` → mais dano) que `try/finally` não modela corretamente.
9. `dealDamage` lança `Error('Pilar 3: dano por contato fora de janela declarada · ' + charId)` como
   **primeira linha**, se `world.phase === 'collide'` no momento da chamada. Isto roda sempre (inclusive em
   produção — não é modo de teste separado, porque modo de teste diferente de produção é fonte de
   divergência de determinismo).
10. Dentro do callback de `collideBalls`, para cada par `(a, other)`: `phase = 'contact'`;
    `resolveContactWindow(world, ctx, a, other)`; **depois** `phase = 'collide'`; `char.on.collide(ctx, a,
    other)` — nesta ordem, preservando a ordem de pares existente (`onCollide(a,b)` e depois `onCollide(b,a)`).
11. `resolveContactWindow` implementa exatamente o pseudocódigo de `architecture.md` §4.2 (ver Dev Notes),
    incluindo a trava de re-hit **global por atacante** (um único `lastHitAt` em `ContactState`, não por par
    atacante-alvo) — reproduzindo a semântica atual de `memory.dashUltimoAcerto`.
12. Camada 1 (auditoria estática): nenhum bloco `on.collide` em `src/chars/*.ts` contém uma chamada a
    `damage(` — verificação simples, sabidamente incompleta (não pega chamada indireta), mas roda em
    milissegundos.
13. Camada 3 (auditoria de roster) adicionada ao `sim:check`:
    - A1: todo `contactWindows[i].source` corresponde a um `abilities[].id` ou a `ult.id` existente no
      mesmo personagem
    - A2: `contactWindows[i].ms ≤ cd_efetivo_mínimo(source)`, onde `cd_efetivo_mínimo(a) =
      max(MIN_ABILITY_CD_MS, a.cd / cdSpeedMax)` e `cdSpeedMax = 1 + ΣMAX[cdSpeed] = 2.0` (fecha a
      invariante deixada pendente em `debt.4`)
    - A4: nenhum personagem sem `contactWindows` chama `ctx.openContactWindow`
    - A5: N rodadas de cada confronto do arnês, com a camada 2 (checagem de fase) ligada → zero violações
14. `sim:check` imprime a tabela de janelas de dano por contato do roster (formato em Dev Notes) — o
    artefato de auditoria humana que D-07 pede.

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type**: Architecture
**Secondary Type(s)**: Security (no sentido de "invariante que, se violada, deve travar ruidosamente")
**Complexity**: High — a única story do épico cuja correção depende de ordem de execução, não só de aritmética

### Specialized Agent Assignment

**Primary Agents**:
- @dev
- @architect (dono do design de `resolveContactWindow` e da semântica de fase)

**Supporting Agents**:
- @qa (fortemente recomendado — maior risco do épico; validar especificamente os dois modos de falha descritos acima, não só rodar a suíte)

### Quality Gate Tasks

- [ ] Pre-Commit (@dev): `npm run check` e `npm run sim:check`, incluindo a tabela de janelas de contato impressa e a contagem de violações de fase
- [ ] Pre-PR (@github-devops): Rodar antes de criar pull request

### Self-Healing Configuration

**Expected Self-Healing**:
- Primary Agent: @dev (light mode)
- Max Iterations: 2
- Timeout: 15 minutes
- Severity Filter: CRITICAL

**Predicted Behavior**:
- CRITICAL issues: auto_fix (até 2 iterações) — se um erro de fase (`Pilar 3: dano por contato fora de janela`) aparecer no `sim:check`, tratar como CRITICAL, não como flake
- HIGH issues: document_only

### CodeRabbit Focus Areas

**Primary Focus**:
- Ordem de execução: `resolveContactWindow` antes de `on.collide`, ordem de pares preservada
- Reentrância: `world.phase` restaurado por atribuição direta, nunca `try/finally`
- Completude da migração: `cast` E `on.collide` do Golem migrados juntos, no mesmo commit

**Secondary Focus**:
- A checagem de fase em `dealDamage` roda sempre (produção incluída), não só em modo de teste
- A trava de re-hit é global por atacante (um `lastHitAt`), não por par

## Tasks / Subtasks

- [ ] Task 1 — Tipos novos em `sim/types.ts` (AC: 5)
  - [ ] `ContactWindowDef { source: string; ms: number; dmg: number; knockback: number; reHitMs: number; onHit?: (ctx: SimCtx, self: Ball, other: Ball) => void }`
  - [ ] `ContactState { source: string; endsAt: number; lastHitAt: number }`
  - [ ] `CharDef.contactWindows?: ContactWindowDef[]`
  - [ ] `Ball.contact: ContactState | null`
  - [ ] `World.phase: 'cast' | 'tick' | 'effect' | 'attack' | 'zone' | 'projectile' | 'contact' | 'collide'`
  - [ ] `SimCtx.openContactWindow: (self: Ball, source: string) => void`

- [ ] Task 2 — Implementar `ctx.openContactWindow` (AC: 6)
  - [ ] Em `makeCtx` (`world.ts`): localizar `windowDef = charOf(world, self).contactWindows?.find(w => w.source === source)`
  - [ ] `self.contact = { source, endsAt: ctx.now + windowDef.ms, lastHitAt: -Infinity }` (ou equivalente que garanta que o primeiro acerto não seja bloqueado pelo `reHitMs`)

- [ ] Task 3 — Implementar `resolveContactWindow` (AC: 11)
  - [ ] Seguir o pseudocódigo de `architecture.md` §4.2 literalmente (ver Dev Notes)
  - [ ] `lastHitAt` é único por `ContactState` (não por par atacante-alvo) — reproduz a trava global atual

- [ ] Task 4 — Gerenciar `world.phase` em `step()` (AC: 8, 10)
  - [ ] Atribuir `world.phase` no início de cada bloco do pipeline (`cast`, `tick`/`effect` no laço de bolas, `attack`, `zone`, `projectile`)
  - [ ] Dentro do callback de `collideBalls`: `phase = 'contact'; resolveContactWindow(...)` seguido de `phase = 'collide'; char.on.collide(...)` — **preservando a ordem de pares existente** (`onCollide(a,b)` depois `onCollide(b,a)`, `physics.ts:65-66`)
  - [ ] Salvar/restaurar fase por atribuição direta onde houver reentrância (dano → morte → `on.kill`), nunca `try/finally`

- [ ] Task 5 — Checagem de fase em `dealDamage` (AC: 9)
  - [ ] Primeira linha da função: `if (world.phase === 'collide') throw new Error(\`Pilar 3: dano por contato fora de janela declarada · ${charOf(world, target).id}\`)` — ajustar a variável de identificação do personagem conforme o contexto disponível na função

- [ ] Task 6 — Migrar o Golem (AC: 6, 7)
  - [ ] `golem.ts`: adicionar `contactWindows: [{ source: 'sismico', ms: 450, dmg: 14, knockback: 520, reHitMs: 250 }]` ao `CharDef`
  - [ ] `cast` de `sismico`: `self.memory.dashAte = ctx.now + 450` → `ctx.openContactWindow(self, 'sismico')`
  - [ ] **Deletar inteiramente** o bloco `on: { collide: (ctx, self, other) => { ... } }` (linhas 134-144)
  - [ ] Conferir se `self.memory.dashUltimoAcerto` ainda é referenciado em algum lugar — não deveria ser, remover se sobrar código morto

- [ ] Task 7 — Camada 1: auditoria estática (AC: 12)
  - [ ] Script/verificação simples (pode viver em `determinism.ts` ou tool dedicado): varrer `src/chars/*.ts`, confirmar que nenhum bloco `on.collide` contém a substring `damage(`
  - [ ] Confirmar que isto **não** bloqueia `ctx.apply(fx.slow(...))` dentro de `on.collide` — o pilar fala de *dano*, não de efeito (nenhum personagem do roster atual usa isso, mas não proibir)

- [ ] Task 8 — Camada 3: auditoria de roster no `sim:check` (AC: 13, 14)
  - [ ] A1: para cada personagem, cada `contactWindows[i].source` bate com `abilities[].id` ou `ult.id`
  - [ ] A2: `contactWindows[i].ms ≤ max(MIN_ABILITY_CD_MS, ability.cd / cdSpeedMax)`, `cdSpeedMax = 1 + ΣMAX[cdSpeed] = 2.0` (fecha a invariante de `debt.4`)
  - [ ] A4: nenhum personagem sem `contactWindows` chama `openContactWindow`
  - [ ] A5: rodar as seeds do arnês com a checagem de fase ativa e confirmar zero exceções de Pilar 3
  - [ ] Imprimir a tabela (formato exato em Dev Notes)

- [ ] Task 9 — Verificação final (AC: 1, 2, 3, 4)
  - [ ] `npm run check` — 0 erros
  - [ ] `npm run sim:check` — golden hash idêntico ao baseline, autoconsistência 40/40, tabela de janelas impressa com zero violações

## Dev Notes

### O campo que substitui `memory.dashAte` (fonte: `architecture.md` §4.1)

Hoje o dash do Golem se apoia em três coisas soltas: `self.memory.dashAte` escrito no `cast` (`golem.ts:52`),
`self.memory.dashUltimoAcerto` como trava de re-hit, e 10 linhas de `on.collide` (`golem.ts:134-144`) que
chamam `ctx.damage`. Nada disso é legível de fora do arquivo — é por isso que o Pilar 3 não era auditável.

```ts
// sim/types.ts
export interface ContactWindowDef {
  source: string
  ms: number
  dmg: number
  knockback: number
  reHitMs: number
  onHit?: (ctx: SimCtx, self: Ball, other: Ball) => void
}

export interface ContactState {
  source: string
  endsAt: number
  lastHitAt: number
}
```

Golem passa a declarar, de forma legível sem abrir `on.collide`:

```ts
contactWindows: [
  { source: 'sismico', ms: 450, dmg: 14, knockback: 520, reHitMs: 250 },
],
```

**Regra derivada, que vale mais que o campo:** `Ball.memory` continua existindo como rascunho livre do
personagem, mas **o motor nunca lê de `memory`**. Qualquer estado que o motor precise interpretar tem que
ser campo tipado. `memory.dashAte` violava isso.

**Nota de fidelidade:** a trava de re-hit atual é **global por atacante**, não por alvo (`golem.ts:139` usa
um único `dashUltimoAcerto`). Numa janela de 450ms com `reHitMs` 250, o dash acerta no máximo 2 vezes no
total, não 2 por inimigo. `ContactState.lastHitAt` sendo um número único reproduz isso exatamente.

### Resolução no motor — pseudocódigo literal (fonte: `architecture.md` §4.2)

Dentro do callback de `collideBalls`, **antes** de `on.collide`, preservando a ordem de pares atual
(`onCollide(a,b)` e depois `onCollide(b,a)` — `physics.ts:65-66`):

```
resolveContactWindow(world, ctx, self, other):
    se self.contact == null                       → retorna
    se now >= self.contact.endsAt                 → self.contact = null; retorna
    se other.team === self.team                   → retorna
    se now - self.contact.lastHitAt < W.reHitMs   → retorna
    self.contact.lastHitAt = now
    phase = 'contact'
    dealDamage(other, W.dmg, self)
    knockback(other, other.x - self.x, other.y - self.y, W.knockback)
    W.onHit?.(ctx, self, other)
```

`W` é `charOf(world, self).contactWindows.find(w => w.source === self.contact.source)`.

### As três camadas de auditoria (fonte: `architecture.md` §4.3) — nenhuma sozinha basta

**Camada 1 — estática (barata, incompleta).** Varredura sobre `src/chars/*.ts`: nenhum bloco `on.collide`
pode conter `damage(`. Custa 10 linhas, roda em milissegundos, pega o caso óbvio. **Não pega** chamada
indireta, helper compartilhado, ou dano aplicado via `fx.dot` de duração 1 tick. `ctx.apply(fx.slow(...))`
em `on.collide` **continua permitido** — o pilar fala de dano, não de efeito.

**Camada 2 — dinâmica por fase (exata, é a que vale).** `World.phase` + checagem em `dealDamage`:

```
se world.phase === 'collide'  →  lançar Error(`Pilar 3: dano por contato fora de janela declarada · ${charId}`)
```

Isto é **exato, não heurístico**: pega chamada indireta, helper, qualquer caminho de código, porque verifica
o fato (dano ocorreu durante o callback de colisão), não a sintaxe. **Recomendo deixar sempre ligada,
inclusive em produção** — modo de teste diferente do modo de produção é fonte de divergência de
determinismo, que é precisamente o que não pode existir na Fase 4.

**Armadilha de implementação registrada:** a fase precisa ser salva e restaurada, não empilhada com
`try/finally`, porque há reentrância real (dano da janela → morte → `on.kill` → mais dano):
`const prev = world.phase; ...; world.phase = prev`.

**Camada 3 — auditoria de roster (o artefato que D-07 pede).** Para cada personagem:

| # | Verificação |
|---|---|
| A1 | Todo `contactWindows[i].source` corresponde a um `abilities[].id` ou a `ult.id` existente |
| A2 | `contactWindows[i].ms ≤ cd_efetivo_mínimo(source)` — a invariante de §3.3, deixada pendente em `debt.4` |
| A3 | `contactWindows[i].ms ≤ MIN_ABILITY_CD_MS` não é exigido, mas `≤` o cd real, sim |
| A4 | Nenhum personagem sem `contactWindows` chama `openContactWindow` |
| A5 | Rodar N rodadas de cada confronto com a camada 2 ligada → zero violações de fase |

`npm run sim:check` passa a imprimir a tabela de janelas declaradas do roster:

```
janelas de dano por contato (Pilar 3)
  golem  sismico   450ms  dmg 14  kb 520  re-hit 250ms   cd_min 3500ms  ✓
  vex    —         (nenhuma)                                             ✓
```

Com 8 personagens (roster futuro), é uma tabela que cabe na tela e que ninguém consegue burlar sem que
apareça ali.

### Por que o hash é condicional a ordem, não só a aritmética

Esta é a única story do épico onde `architecture.md` §6.1 escreve "idêntico **se**" em vez de "idêntico". A
condição: a ordem de pares de `collideBalls` (`onCollide(a,b)` depois `onCollide(b,a)`) precisa ser
preservada, **e** `resolveContactWindow` precisa rodar antes de `on.collide` dentro de cada chamada — nunca
depois, nunca só um dos dois. Qualquer reordenação, mesmo "equivalente" na cabeça de quem programa, é
suspeita até o golden hash confirmar o contrário.

### Onde mexer

`src/sim/types.ts`, `src/sim/world.ts` (`step`, `makeCtx`, `dealDamage`, nova função
`resolveContactWindow`), `src/chars/golem.ts`, e um script leve para a camada 1 (pode viver em
`src/tools/determinism.ts` ou arquivo próprio).

### Testing

- `npm run check` — 0 erros.
- `npm run sim:check` — golden hash idêntico ao baseline de `debt.0`, autoconsistência 40/40, tabela de
  janelas impressa, zero violações de fase reportadas.
- Teste dirigido (recomendado, não estritamente exigido pelo `architecture.md`, mas cobre o vetor #4 de
  §7.2): matar uma bola **dentro** da janela de contato do Golem, forçando `on.kill` a rodar em plena
  reentrância de fase, e confirmar que `world.phase` é restaurado corretamente (não fica preso em
  `'collide'` ou `'contact'` após o evento de morte).
- Teste dirigido dos dois modos de falha descritos no topo desta story — vale rodar manualmente uma vez
  durante o desenvolvimento (comentar a migração do `cast` ou do `on.collide` isoladamente) para confirmar
  que cada modo de falha realmente se manifesta como descrito, antes de assumir que a migração completa está
  correta.

### Contribuição para o Anexo B

Fecha **A-7** (tabela de janelas de contato impressa, zero violações de fase) e completa **A-2**
(consultando A1-A5 da camada 3). Fecha a invariante de `debt.4` (**A-2** da §3.3, agora com `contactWindows`
existindo para cruzar). Resolve **D-07/C1** do PRD por completo.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-28 | 1.0 | Story criada a partir de `architecture.md` §4.1, §4.2, §4.3, §6.1 (passo 6), §6.2 (linha `golem.ts:52`) e §7.2 (vetor #4) | River (@sm) |

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
