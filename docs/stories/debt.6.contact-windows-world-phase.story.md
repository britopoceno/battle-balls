# Story debt.6: Janela de dano por contato declarada, `world.phase`, checagem em `dealDamage` — resolve D-07/C1

## Status

Done

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
   **primeira linha**, se `world.phase === 'collide'` no momento da chamada. **`charId` identifica o
   INFRATOR (`source`, quem chamou `damage` de dentro de `on.collide`), não a vítima** — corrigido do texto
   original, que escrevia `charOf(world, target).id` (nomeia quem levou o dano). O diagnóstico útil é o
   personagem cujo `on.collide` causou a chamada indevida. Isto roda sempre (inclusive em produção — não é
   modo de teste separado, porque modo de teste diferente de produção é fonte de divergência de
   determinismo).
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
    - A5: **redefinido** (o arnês de N lutas × 28 confrontos é artefato da Fase 2/RF-48, não existe ainda) —
      as 40 seeds de autoconsistência do `sim:check` atual, roster de 2 personagens, com a camada 2
      (checagem de fase) ligada em toda execução → zero exceções de Pilar 3. Cobertura plena de A5 fica
      diferida para quando o arnês da Fase 2 existir; esta story cobre o que é possível medir hoje
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
  - [ ] Primeira linha da função: `if (world.phase === 'collide') throw new Error(\`Pilar 3: dano por contato fora de janela declarada · ${source ? charOf(world, source).id : '(sem source)'}\`)` — identifica o INFRATOR (`source`), não a vítima (`target`). `source` pode ser `null` na assinatura de `dealDamage`; tratar esse caso no texto do erro em vez de acessar `charOf(world, null)`

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
  - [ ] A5 (redefinido — ver AC 13): rodar as 40 seeds de `sim:check` com a checagem de fase ativa e confirmar zero exceções de Pilar 3
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
| 2026-07-28 | 1.0.2 | Correções do @po (v1.0.1) aplicadas ao corpo da story antes do desenvolvimento — execução mecânica, não novo julgamento. AC 9/Task 5: erro identifica `source` (infrator), não `target` (vítima). AC 13/A5 e Task 8/A5: redefinido para "as 40 seeds de `sim:check` atuais, checagem de fase ligada" — o arnês da Fase 2 não existe ainda; cobertura plena de A5 fica diferida. | @sm |
| 2026-07-28 | 1.1 | Implementada. Status: Ready → InProgress → InReview. Golden hash **idêntico** ao baseline apesar da reestruturação completa do mecanismo de dano por contato — prova forte de correção, não coincidência. Os dois modos de falha do topo da story reproduzidos de verdade: modo 1 lança `Error: Pilar 3: dano por contato fora de janela declarada · golem` (infrator correto); modo 2 não lança nada, mas diverge o hash em 11 campos — exatamente como descrito. **Bug real encontrado e corrigido durante o desenvolvimento**: a Camada 1 (auditoria estática) falhava silenciosamente porque um comentário de código continha a substring "collide:" e desviava a busca textual para o bloco errado — corrigido removendo comentários antes de escanear (`semComentarios`), em `auditarCamada1` e no A4. A1, A2 e A4 testados individualmente com violação induzida e revertida; A2 fecha a invariante deixada pendente em `debt.4`. Nova devDependency `@types/node` (escopo `src/tools/`, não `sim/` — invariante de pureza reconfirmado). | @dev |
| 2026-07-28 | 1.2 | Gate de QA: **CONCERNS**. Status: InReview → Done. Os 14 AC passam. Verificação independente, sem aceitar a Debug Log: `BASELINE` conferido contra o commit `d52c23d` (debt.0) além de rodar o teste; os dois modos de falha reproduzidos do zero com valores próprios (modo 1 lança a mensagem exata nomeando o infrator; modo 2 é silencioso e produz 11 desvios de hash + 9 de build coverage); a correção `semComentarios` provada **necessária** revertendo-a com o mesmo teste (sem ela a violação passa despercebida); A1/A2/A4 exercitados com violações minhas; reentrância (morte dentro da janela → `on.kill` causando mais dano) e trava de re-hit global validadas com harness próprio, sem tocar em `src/`. Fecha a pendência QA-001 herdada do gate de `debt.4`: com `cd 800` o piso `MIN_ABILITY_CD_MS` vira o termo dominante e A2 reprova — a invariante não é vacuamente verde. Achados registrados, nenhum bloqueante: QA-001 (a Camada 2 não é "exata" — dano via `fx.dot` de 1 tick em `on.collide` atravessa as 3 camadas, provado), QA-002 (`openContactWindow` com `source` não declarado é silêncio total; sugerido A6), QA-003 (`@types/node` vaza para o espaço de tipos de `sim/`), QA-004 (`world.phase` fica em `'collide'` até o fim do tick), QA-005/006/007 (registros). | Quinn (@qa) |
| 2026-07-28 | 1.3 | **QA-004 corrigido**: `world.phase = 'tick'` (neutro) adicionado logo após `collideBalls` finalizar, antes de `collideWalls` — sem isso, a fase ficava em `'collide'` até o `'cast'` do tick seguinte, risco de falso positivo do Pilar 3 para qualquer dano futuro causado depois de `collideBalls` no mesmo tick. Hash confirmado idêntico (fase não é lida por nenhum cálculo físico). **QA-001 e QA-002 documentados, não corrigidos** (fechar é auditoria de roster em escala — Fase 2/6, fora do escopo desta story): a alegação de "exato" na Camada 2 foi corrigida em `architecture.md` §4.3 e no comentário de `dealDamage`, qualificando que só pega chamada síncrona (dano via `Effect` de 1 tick escapa); `openContactWindow` ganhou comentário documentando que A1 audita só o sentido inverso, não o call site. | @dev |
| 2026-07-28 | 1.0.1 | Validated GO (8/10) — Status: Draft → Ready. Os valores da janela declarada em AC 6 foram conferidos um a um contra `golem.ts` e batem exatamente: `source 'sismico'` (`:43`), `ms 450` (`:52`), `dmg 14` (`:141`), `knockback 520` (`:142`), `reHitMs 250` (`:139`). A seção "Leia isto antes de começar" é o melhor registro de risco do épico. Dois pontos a resolver **antes** de o @dev pegar a story: (1) **AC 13/A5 depende de um arnês que não existe** — a story pede "N rodadas de cada confronto do arnês", mas o arnês é artefato da Fase 2 (RF-48) e hoje o único executor é o laço de 40 seeds de `determinism.ts`, com roster de 2 personagens; definir A5 como "as 40 seeds de `sim:check` com a checagem de fase ligada, zero exceções" ou declarar o item como diferido. (2) **A mensagem de erro de AC 9 identifica a vítima, não o infrator** — Task 5 escreve `charOf(world, target).id`, o que nomeia quem levou o dano; o diagnóstico útil é o personagem cujo `on.collide` causou o dano (`source`, quando houver). Corrigir antes de implementar, senão o erro aponta para o arquivo errado. | @po |

## Dev Agent Record

### Agent Model Used

claude-opus-5 (sessão principal atuando como @dev)

### Debug Log References

```
$ npx tsc --noEmit
(sem saída — 0 erros; precisou de @types/node, instalado como devDependency
 para os node:fs/node:path/node:url usados na auditoria estática de debt.6)

$ npm run sim:check
determinismo   ✓ ok
golden hash    ✓ ok — 5 seeds batem o baseline
build coverage ✓ ok — 5 variantes batem
espelho 2v2    time0 19 · time1 14 · empate 7
duração        mediana 13.8s · min 12.3s · max 19.5s

janelas de dano por contato (Pilar 3)
  golem  sismico    450ms  dmg 14  kb 520  re-hit 250ms   cd_min 3500ms  ✓
  vex    —         (nenhuma)                                            ✓

pilar 3        ✓ ok — camadas 1 e 3 sem violação
```

**Os dois modos de falha do topo da story, testados de verdade:**

Modo 1 (cast migrado, on.collide legado esquecido chamando `damage(` direto):
```
Error: Pilar 3: dano por contato fora de janela declarada · golem
```
Exceção correta, nomeando o infrator (golem), não a vítima — a correção do @po (v1.0.2)
confirmada em produção real, não só no texto do AC.

Modo 2 (on.collide removido, `resolveContactWindow` desconectado de `step()`):
```
(nenhuma exceção — "pilar 3 ✓ ok")
Error: comportamento divergiu do baseline em 11 campo(s).
```
Exatamente como a story descreve: nada quebra em runtime, só o golden hash pega — o dano
do dash simplesmente some, silenciosamente, sem o mecanismo de contato.

**Achado durante o desenvolvimento — bug real na Camada 1, corrigido antes do gate:**
testei a Camada 1 isoladamente (não apenas via os dois modos acima, que só exercitam a
Camada 2) injetando um `damage(` estruturalmente inalcançável (`if (false) ctx.damage(...)`)
num `on.collide` temporário. A auditoria **não detectou** — investigando, a busca textual
`indexOf('collide:')` encontrava meu próprio comentário de código
("...idênticos ao antigo on.collide: dmg 14, knockback 520...") antes do `on.collide` de
verdade, e a partir daí toda a lógica de casamento de chaves pegava o bloco errado (o
`cast` da Muralha). Corrigido stripando comentários (`//` e `/* */`) antes de qualquer
busca textual, em `auditarCamada1` e no A4 de `auditarCamada3`. Reproduzido depois da
correção: a Camada 1 pegou o `damage(` inalcançável corretamente.

**A1, A2, A4 testados individualmente**, cada um com violação induzida e revertida:
- A1: `source: 'sismico_INEXISTENTE'` → `✗ A1: golem.contactWindows source
  'sismico_INEXISTENTE' não corresponde a nenhuma ability/ult`
- A2: `ms: 4000` (> cd_efetivo_mínimo 3500ms) → `✗ A2: golem.sismico janela 4000ms >
  cd_efetivo_mínimo 3500ms` — fecha a invariante que `debt.4` deixou pendente
- A4: injetei `ctx.openContactWindow(self, 'lamina')` no `cast` do Vex sem declarar
  `contactWindows` → `✗ A4: vex.ts chama openContactWindow sem declarar contactWindows`

Todos os experimentos revertidos, `tsc`/`sim:check` limpos depois de cada um.

### Completion Notes List

- **As duas correções do @po (v1.0.1) foram aplicadas ao corpo da story antes do
  desenvolvimento** (v1.0.2, execução mecânica): AC 9 identifica o infrator (`source`),
  não a vítima; AC 13/A5 redefinido para as seeds de `sim:check` já existentes, já que o
  arnês da Fase 2 não existe.
- **`world.phase` gerenciado por atribuição direta em cada bloco do pipeline** (`cast`,
  `effect`, `tick`, `attack`, `zone`, `projectile`, `contact`, `collide`) — nenhum
  `try/finally`, conforme AC 8 exige explicitamente por causa da reentrância real
  (dano → morte → `on.kill` → mais dano).
- **`resolveContactWindow` segue o pseudocódigo de `architecture.md` §4.2 literalmente**,
  incluindo a trava de re-hit global por atacante (`ContactState.lastHitAt` é um único
  valor, não por par atacante-alvo) — reproduz `memory.dashUltimoAcerto` exatamente.
- **`ordem de pares preservada**: `collideBalls` continua chamando `onCollide(a,b)` depois
  `onCollide(b,a)` (não tocado em `physics.ts`); dentro de cada chamada, `resolveContactWindow`
  roda antes de `on.collide`, nunca as duas sob um único `try/finally`.
- **Golem migrado por completo**: `contactWindows` declarado, `cast` do `sismico` chama
  `ctx.openContactWindow`, bloco `on.collide` inteiro deletado. Nenhuma referência
  residual a `memory.dashAte`/`dashUltimoAcerto` em lugar nenhum do código (confirmado
  por grep).
- **`SIGMA_MAX` e `MIN_ABILITY_CD_MS` exportados** (eram privados) — a auditoria A2
  precisa deles para calcular `cdSpeedMax = 1 + ΣMAX[cdSpeed]` e `cd_efetivo_mínimo`.
- **Nova dependência: `@types/node`**, para os módulos `node:fs`/`node:path`/`node:url`
  usados na auditoria estática. Escopo é `src/tools/` (ferramenta de verificação), não
  `sim/` — não viola o invariante de pureza de `sim/` (AC 4), que continua valendo e foi
  reconfirmado.
- **Camada 1 e A4 agora removem comentários antes de escanear** (`semComentarios`),
  corrigindo o bug descrito acima — descoberto testando a própria auditoria, não só o
  comportamento do jogo.

### File List

| Arquivo | Mudança |
|---|---|
| `src/sim/types.ts` | `ContactWindowDef`, `ContactState`, `Ball.contact`, `CharDef.contactWindows?`, `World.phase`, `SimCtx.openContactWindow` |
| `src/sim/world.ts` | `openContactWindow` em `makeCtx`; `resolveContactWindow` (nova função); checagem de fase em `dealDamage` (primeira linha); `world.phase` gerenciada em todo o pipeline de `step()`; `collideBalls` religado com `resolveContactWindow` antes de `on.collide`; `MIN_ABILITY_CD_MS` exportada; `phase: 'tick'` inicial em `createWorld`; `contact: null` em `makeBall` |
| `src/sim/stats.ts` | `SIGMA_MAX`/`SIGMA_MIN` exportados |
| `src/chars/golem.ts` | `contactWindows` declarado; `cast` de `sismico` usa `ctx.openContactWindow`; bloco `on.collide` inteiro removido |
| `src/tools/determinism.ts` | `auditarCamada1` (estática, `on.collide` sem `damage(`), `auditarCamada3` (A1/A2/A4 + tabela de janelas), `semComentarios` (correção de bug), ligados ao resumo final e ao `throw` |
| `package.json` / `package-lock.json` | `@types/node` adicionado como devDependency |

Nenhum arquivo em `src/client/`, `src/bot/` ou `vex.ts` foi alterado permanentemente
(`vex.ts` foi tocado só durante o teste de A4, revertido).

## QA Results

### Gate: **CONCERNS** — 2026-07-28 · Quinn (@qa)

Story de maior risco do épico. Nada da Debug Log foi aceito como evidência: os 5 arquivos foram
lidos em diff completo, os dois modos de falha reproduzidos do zero, a correção do bug da Camada 1
testada com um caso construído por mim e depois com a correção revertida para provar necessidade,
e A1/A2/A4 exercitados com valores diferentes dos do @dev. **Todos os 14 AC passam.** Os itens
abaixo são registros para stories futuras, nenhum bloqueia.

#### Verificação executada

| # | Verificação | Resultado |
|---|---|---|
| 1 | `npm run check` (`tsc --noEmit`) | 0 erros |
| 2 | `npm run sim:check` | determinismo ✓ · golden hash ✓ 5/5 · build coverage ✓ 5/5 · tabela impressa · `pilar 3 ✓ ok` |
| 3 | `BASELINE` conferido **contra o commit `d52c23d`** (debt.0), não só "o teste passou" | 5 seeds byte a byte idênticas — baseline **não** foi "atualizado" |
| 4 | `BUILD_BASELINE` (ARCH-001, debt.3) | não tocado no diff; 5 variantes batem |
| 5 | `physics.ts` | **não tocado** por esta story; `onCollide(a,b)` → `onCollide(b,a)` intacto (`:71-72`) |
| 6 | `try`/`catch`/`finally` em `world.ts` | **nenhum** — só duas menções em comentário. AC 8 ✓ |
| 7 | `memory.dashAte` / `memory.dashUltimoAcerto` em `src/` | zero em código; só o comentário histórico de `golem.ts:52` |
| 8 | Pureza de `sim/` (AC 4) | nenhum import fora de `./`, nenhum `Math.random`/DOM/`process`/`require`; `node:*` só em `src/tools/determinism.ts` |
| 9 | `resolveContactWindow` vs. pseudocódigo §4.2 | linha a linha, na ordem exata (o único acréscimo é o guarda `if (!w) return`, sem efeito colateral antes dele) |
| 10 | `ctx.now` vs. `world.time` | `now` é snapshot de `world.time` (`world.ts:167`), e `world.time` só muda na última linha de `step()` — usar `world.time` em `openContactWindow`/`resolveContactWindow` é equivalente exato |

#### Modo de falha 1 — reproduzido do zero (não o teste do @dev)

Reintroduzi um `on.collide` no Golem com valor **diferente** do original (`ctx.damage(other, 7, self)`):

```
Error: Pilar 3: dano por contato fora de janela declarada · golem
    at dealDamage (src/sim/world.ts:322:11)
    at Object.collide (src/chars/golem.ts:145:11)
    at src/sim/world.ts:620:35
    at collideBalls (src/sim/physics.ts:71:7)
```

Mensagem exata do AC 9, e nomeia o **infrator** (`golem`, o atacante) — a vítima no stack é o `vex`.
A correção do @po (v1.0.2) está de fato no código, não só no texto do AC. Revertido; `sim:check` limpo.

#### Modo de falha 2 — reproduzido do zero

Desconectei apenas a chamada a `resolveContactWindow` do callback de `collideBalls`, mantendo fases,
tipos, `contactWindows` e o `cast` migrado:

```
determinismo   ✓ ok
pilar 3        ✓ ok — camadas 1 e 3 sem violação
golden hash    ✗ 11 desvio(s)        (seeds 1,2,3,7,11 — inclusive inversão de vencedor em 1 e 3)
build coverage ✗ 9 desvio(s)
```

Nenhuma exceção, nenhuma camada de auditoria acusa: só o hash pega. Exatamente como o topo da story
descreve. Confirma também que `resolveContactWindow` é **load-bearing** — não é código morto que
passa verde. Revertido; `sim:check` limpo.

#### Bug da Camada 1 — correção verificada de forma independente

Construí meu próprio caso: `on.collide` temporário no **`golem.ts`** (o arquivo que contém o
comentário "...idênticos ao antigo on.collide: dmg 14..." que causou o bug) com um `damage(`
estruturalmente inalcançável — `if (Math.min(1, 0) > 0) ctx.damage(other, 3, self)`. Golden hash
verde (código inalcançável não muda comportamento), Camada 2 muda: só a Camada 1 pode pegar.

| Estado de `semComentarios` | Resultado |
|---|---|
| Como está no código | `✗ camada 1: golem.ts tem on.collide chamando damage( diretamente` → `throw` |
| Revertida para `return texto` (busca no texto bruto), **mesmo teste** | `pilar 3 ✓ ok` — **violação passa despercebida** |

A correção é **necessária, não cosmética**: provado. Tudo revertido.

#### A1, A2, A4 — cada um com violação induzida por mim

| Check | Violação induzida (valores meus) | Saída |
|---|---|---|
| A1 | `source: 'terremoto'` | `✗ A1: golem.contactWindows source 'terremoto' não corresponde a nenhuma ability/ult` |
| A1 (ramo positivo da ult) | `source: 'muralha'` (id da ult) | aceito `✓`, com `cd_min —` |
| A2 | `ms: 3600` com `cd 7000` (cd_ef_min 3500) | `✗ A2: golem.sismico janela 3600ms > cd_efetivo_mínimo 3500ms` |
| A2 | `cd: 800` + `ms: 550` | `cd_min 500ms  ✗` — **o piso `MIN_ABILITY_CD_MS` é o termo dominante** |
| A2 (fronteira) | `cd: 800` + `ms: 450` | `cd_min 500ms  ✓` |
| A4 | `ctx.openContactWindow(self, 'deslize')` no `cast` do Vex | `✗ A4: vex.ts chama openContactWindow sem declarar contactWindows` |
| Camada 1 (falso positivo) | `on.collide` só com `ctx.apply(other, fx.slow(...), self)` | `pilar 3 ✓ ok` — efeito continua permitido (Task 7, 2º bullet) |

**Pendência herdada QA-001 do gate de `debt.4` está FECHADA.** Aquele gate alertou que a invariante A2
poderia passar verde vacuamente, porque `max(MIN_ABILITY_CD_MS, cd/2)` escolhia 3500 e não o piso. Com
`cd: 800` o piso vira o termo dominante (`cd/2 = 400 < 500`) e A2 **reprova** `ms: 550`. Como o piso
é 500 e a maior janela do roster é 450, nenhuma ability, por menor que seja o `cd`, pode satisfazer A2
vacuamente. A invariante tem dente.

#### Ordem de execução dentro do callback (AC 3, 10)

`world.ts:612-621` — para **cada** chamada do callback, na ordem: `phase = 'contact'` →
`resolveContactWindow(world, ctx, a, other)` → `phase = 'collide'` → `charOf(world, a).on?.collide?.(...)`.
Sem `try/finally` envolvendo o par. `physics.ts` não foi tocado, então a ordem de pares
`onCollide(a,b)` seguida de `onCollide(b,a)` é a mesma de antes — que é a condição escrita em
`architecture.md` §6.1 para o hash sobreviver, e ele sobreviveu.

#### Reentrância real (Testing, vetor #4 de §7.2) — harness próprio

Clonei o registro de personagens em memória (`{...CHARS, golem: {...}}`, sem tocar em `src/`) para
injetar um `on.kill` que causa **mais dano** a um segundo inimigo, e neutralizei o melee do Golem para
que a morte viesse da janela de contato. Cast real de `sismico` pelo caminho de produção:

```
janela aberta após o cast: {"source":"sismico","endsAt":466.67,"lastHitAt":16.67}
on.death do vex 2      (fase=contact)
on.kill disparado      (fase=contact)
  dano em cadeia 30 -> bola 3 (fase=contact) hp=170.0
exceção lançada?        NENHUMA
world.phase pós-morte   projectile
próximo tick ok?        sim (tick 3 -> 4)
```

Este é o teste que justifica AC 8: `on.death`/`on.kill` rodam com `phase === 'contact'`, então o dano
em cadeia **passa**. Um `try/finally` que ligasse `'collide'` cedo demais faria esse dano legítimo ser
recusado com um "Pilar 3" falso. A fase não fica presa em `'contact'` nem em `'collide'` e o pipeline
segue normal no tick seguinte.

#### Trava de re-hit global por atacante (AC 11) — harness próprio

Dois inimigos encostados no Golem ao mesmo tempo, hp inflado, melee zerado, janela aberta pelo cast real:

```
t=266.7ms  dano vex1=14.00  dano vex2=0.00
alvos atingidos por evento : 1
```

Um único alvo por evento de acerto, e o segundo acerto em `16.7 + 250 = 266.7ms` exatos. Se a trava
fosse por par atacante-alvo, os dois vex teriam levado 14 no mesmo tick. Reproduz `dashUltimoAcerto`:
no máximo 2 acertos **no total** dentro dos 450ms, não 2 por inimigo.

#### Achados (nenhum bloqueia)

**QA-001 · MEDIUM · arquitetura — a Camada 2 não é "exata", como `architecture.md` §4.3 afirma.**
Provado: um `on.collide` que faz `ctx.apply(other, fx.dot(840, 17), self)` (≈14 de dano num tick)
atravessa a Camada 1 (não há `damage(` no bloco), a Camada 2 (o dano só materializa no tick seguinte,
em `tickEffects`, sob `phase === 'effect'`) e a Camada 3. `pilar 3 ✓ ok`. Só o golden hash notou — e
o hash tem roster congelado, então não protegeria um personagem novo. O §4.3 registra o `fx.dot` de
1 tick como limitação da Camada 1, mas em seguida afirma que a Camada 2 "pega qualquer caminho de
código, porque verifica o fato". Não pega. Recomendo corrigir o texto de `architecture.md` e abrir
item para a Fase 2 (ex.: recusar `ctx.apply` de `kind: 'dot'` durante `phase === 'collide'`, ou marcar
o efeito com a fase de origem e checar em `tickEffects`).

**QA-002 · MEDIUM · auditoria — `openContactWindow` com `source` inexistente é silêncio total.**
A4 só olha personagens **sem** `contactWindows`. Troquei `ctx.openContactWindow(self, 'sismico')` por
`'tremor'` no Golem (uma ability real, mas sem janela declarada): `pilar 3 ✓ ok`, nenhuma violação —
`makeCtx` retorna cedo, a janela nunca abre e o dash perde o dano em silêncio. Isto é o modo de falha
2 na sua forma generalizada, e é o modo de falha que um personagem novo vai encontrar. Sugiro um
**A6** barato na Camada 3: extrair os literais de `openContactWindow(self, '...')` de cada
`src/chars/*.ts` (o `semComentarios` já existe) e exigir que cada um bata com um `contactWindows[].source`
declarado. Fecha a simetria de A1 (declarado→existe) com o caminho inverso (chamado→declarado).

**QA-003 · LOW · pureza — `@types/node` vaza para o espaço de tipos de `sim/`.** O `tsconfig.json`
não tem campo `types`, então os globais do Node ficam visíveis em todo `src`. Provado: `void process.pid`
dentro de `src/sim/world.ts` compila com `npm run check` verde; com um tsconfig de sonda usando
`"types": []` sobre `src/sim` + `src/chars`, o mesmo código dá `TS2591: Cannot find name 'process'` — e
nada mais falha. O runtime está correto (nenhum `node:*` fora de `src/tools/`, AC 4 verificado), mas a
story afirma escopo `src/tools/` e no espaço de tipos isso não é verdade: antes desta story, escrever
`process.env` em `sim/` era erro de compilação; agora compila. Contenção validada por mim: `tsconfig.json`
com `"types": []` cobrindo `sim`/`chars`/`bot`/`client` + um `tsconfig.tools.json` com `"types": ["node"]`
para `src/tools`, com `check` rodando os dois.

**QA-004 · LOW · `world.phase` fica em `'collide'` até o fim do tick.** Depois de `collideBalls`, nada
reatribui a fase: `collideWalls`, o bloco de morte súbita e `checkEnd` rodam sob `'collide'`. Auditei os
5 chamadores de `dealDamage` (`world.ts:382, 427, 460, 511, 532`) e nenhum está nesse trecho, então é
inofensivo hoje. Mas é uma armadilha plantada: qualquer dano futuro no fim do tick (dano por ficar fora
da área na morte súbita é o candidato óbvio) lançaria um `Pilar 3` falso, apontando o personagem errado.
Uma linha resolve: `world.phase = 'tick'` logo após `collideBalls`.

**QA-005 · LOW · divergência semântica inobservável hoje.** `ContactState.lastHitAt` volta a `-Infinity`
a cada `openContactWindow`; `memory.dashUltimoAcerto` persistia entre dashes. Se duas janelas abrissem a
menos de `reHitMs` uma da outra, o comportamento diferiria. Inalcançável no roster atual (`cd 7000` ≫
`reHitMs 250`) e A2 mantém a janela dentro do cooldown, mas A2 garante que as janelas não se sobrepõem —
não que os acertos fiquem a ≥ `reHitMs` de distância **através** de janelas. Registrar; a semântica nova
é provavelmente a desejável.

**QA-006 · INFO · A2 não se aplica a janela ancorada na ult.** `UltDef` não tem `cd` (carrega por
`charge`), então `ability` é `undefined`, a checagem é pulada e a tabela imprime `cd_min —  ✓`.
Estruturalmente correto, mas quando o roster de 8 personagens tiver uma janela de ult ela ficará sem
limite superior de duração. Vale uma nota no `architecture.md` §4.3.

**QA-007 · INFO · limitações da Camada 1, coerentes com "barata, incompleta".** `indexOf('collide:')`
acha só a primeira ocorrência do arquivo e o casamento de chaves depende de arrow function — um
`collide(ctx, self, other) { ... }` em method shorthand faria a busca por `=>` cair no bloco errado.
Um personagem = um arquivo = um `on` hoje, então não morde. A Camada 2 cobre o caso real; registrado
para quem for reescrever isto com um parser.

#### Conclusão

O golden hash idêntico **com o `BASELINE` conferido contra o commit de `debt.0`**, somado ao modo de
falha 2 mostrando 11 desvios quando o mecanismo é desconectado, é a evidência mais forte possível aqui:
o mecanismo novo é exercitado de verdade e reproduz o comportamento antigo bit a bit, apesar de o dano
por contato ter sido inteiramente reestruturado. O bug da Camada 1 que o @dev encontrou era real e a
correção é necessária — verifiquei os dois lados.

**CONCERNS** e não PASS por QA-001 e QA-002: as duas dizem respeito à **completude da auditoria**, que é
o produto que esta story entrega. O Pilar 3 continua auditável para o vetor que motivou D-07 (o
`on.collide` chamando `damage` direto), mas ainda tem dois caminhos por onde um personagem futuro escapa
— um por baixo (dano via efeito) e um por cima (janela que nunca abre). Ambos são silenciosos e ambos
hoje só são pegos pelo golden hash, que tem roster congelado em golem+vex. Nenhum é regressão desta
story; nenhum tem AC que os exija. Story liberada para `Done`.

Todos os experimentos revertidos; `git status` restrito aos arquivos da story, `npm run check` e
`npm run sim:check` verdes na árvore final.
