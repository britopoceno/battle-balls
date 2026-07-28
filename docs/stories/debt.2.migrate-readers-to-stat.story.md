# Story debt.2: Trocar os leitores para `stat.*`, um de cada vez

## Status

Ready

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: ["npm run check", "npm run sim:check (rodado após CADA troca individual, não só no final)"]
```

## Story

**Como** desenvolvedor executando o passo 2 da migração de stats (`architecture.md` §6.1),
**eu quero** trocar, **um de cada vez**, os seis pontos que hoje leem campos diretos de `Ball`
(`effectiveSpeed`, `dealDamage`, `knockback`, `autoAttack`, `integrate`, `collideBalls`) para lerem de
`b.stat.*`,
**para que** cada troca seja verificada isoladamente pelo golden hash — e se uma delas quebrar, o teste diga
exatamente qual, em vez de uma pilha de mudanças simultâneas esconder a causa.

## Depende de

`debt.1` (Done) — `b.stat` precisa existir e estar sendo recalculado (mesmo que ainda não lido) antes de
qualquer leitor poder ser trocado.

## Acceptance Criteria

1. `npm run check` (`tsc --noEmit`) verde.
2. `npm run sim:check` verde (autoconsistência 40/40 + baseline).
3. Golden hash **idêntico** ao baseline de `architecture.md` §6.0 (seeds 1, 2, 3, 7, 11) — a tabela é a
   mesma de `debt.0`. `architecture.md` §6.1 classifica este passo como "idêntico — identidades verificadas
   em §1.7" e risco baixo, "se o golden hash mudar aqui, a aritmética divergiu e o teste diz exatamente
   onde" — **isso só é verdade se cada troca for verificada isoladamente** (ver Task list e a nota de risco
   sobre `knockback` abaixo).
4. `sim/` continua puro: sem `Math.random`, sem DOM, sem I/O, sem importar de `chars/`, `bot/`, `client/`.
5. Os seis leitores abaixo passam a ler de `b.stat.*` em vez dos campos diretos de `Ball` (que **continuam
   existindo** em `Ball` nesta story — a remoção é `debt.3`):
   - `effectiveSpeed` (`world.ts:118`) → `b.stat.maxSpeed` (a multiplicação por `b.mods.speed` continua
     intocada, ver Dev Notes)
   - `dealDamage` (`world.ts:254`) → `source.stat.dmg` e `target.stat.dmgTaken`
   - `knockback` em `SimCtx.knockback` (`world.ts:216-221`) → `target.stat.knockbackTaken` **(ver risco abaixo)**
   - `autoAttack` (`world.ts:341-398`) → `def.atk.range * b.stat.range` e `def.atk.cd / b.stat.atkSpeed`
   - `integrate` (`physics.ts:7-25`) → `b.stat.drag`
   - `collideBalls` (`physics.ts:27-69`) → `a.stat.mass`/`b.stat.mass` e `a.stat.radius`/`b.stat.radius`
6. Cada uma das 6 trocas foi seguida de uma execução isolada de `npm run sim:check` antes de prosseguir para
   a próxima — registrado no File List/Completion Notes qual troca foi feita em qual ordem.
7. **Risco conhecido, documentado explicitamente**: se a troca de `knockback` para `stat.knockbackTaken`
   quebrar o golden hash **isoladamente**, não forçar a troca. Ver "Risco não trivial" em Dev Notes — pode
   significar que esta troca específica depende de trabalho que só é concluído em `debt.3`.

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type**: Architecture
**Secondary Type(s)**: —
**Complexity**: Medium — mudança pequena em volume de código, mas com uma dependência de ordem não óbvia (ver Dev Notes)

### Specialized Agent Assignment

**Primary Agents**:
- @dev
- @architect (única autoridade para resolver a tensão descrita em "Risco não trivial", se ela se concretizar)

**Supporting Agents**:
- @qa (recomendado para revisar a evidência de que cada troca foi testada isoladamente, não em lote)

### Quality Gate Tasks

- [ ] Pre-Commit (@dev): Rodar `sim:check` após cada uma das 6 trocas individuais, não só no final
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
- Backward compatibility: cada troca isolada precisa preservar o golden hash
- Ordem de execução: a evidência de que as trocas foram feitas e testadas uma de cada vez, não em lote

**Secondary Focus**:
- Legibilidade: comentário no código apontando que `mods.speed`/`mods.dmg`/etc. ainda são lidos em paralelo até `debt.3`

## Tasks / Subtasks

- [ ] Task 1 — Trocar `effectiveSpeed` (AC: 5, 6)
  - [ ] `world.ts:118-121`: `b.maxSpeed * b.mods.speed * (1 - slow)` → `b.stat.maxSpeed * b.mods.speed * (1 - slow)` (a multiplicação por `mods.speed` fica **intocada** — ver Dev Notes)
  - [ ] Rodar `npm run sim:check` isoladamente — hash deve bater

- [ ] Task 2 — Trocar `dealDamage` (AC: 5, 6)
  - [ ] `world.ts:264-270`: `amt *= source.mods.dmg` → `amt *= source.stat.dmg`
  - [ ] Adicionar `amt *= target.stat.dmgTaken` (multiplicação nova, `dmgTaken` é sempre 1.0 hoje — no-op)
  - [ ] Rodar `npm run sim:check` isoladamente — hash deve bater

- [ ] Task 3 — Trocar `autoAttack` (AC: 5, 6)
  - [ ] `world.ts:344`: `def.atk.range * b.mods.range` → `def.atk.range * b.stat.range`
  - [ ] `world.ts:360`: `def.atk.cd / b.mods.atkSpeed` → `def.atk.cd / b.stat.atkSpeed`
  - [ ] Rodar `npm run sim:check` isoladamente — hash deve bater

- [ ] Task 4 — Trocar `integrate` (AC: 5, 6)
  - [ ] `physics.ts:17`: `Math.pow(b.drag, dt)` → `Math.pow(b.stat.drag, dt)`
  - [ ] Rodar `npm run sim:check` isoladamente — hash deve bater

- [ ] Task 5 — Trocar `collideBalls` (AC: 5, 6)
  - [ ] `physics.ts:40, 48-50`: `a.radius`/`b.radius`/`a.mass`/`b.mass` → `a.stat.radius`/`b.stat.radius`/`a.stat.mass`/`b.stat.mass`
  - [ ] Rodar `npm run sim:check` isoladamente — hash deve bater

- [ ] Task 6 — Trocar `knockback`, com cautela (AC: 5, 6, 7)
  - [ ] `world.ts:218`: `(force * (1 - target.mods.knockbackResist)) / target.mass` → `(force * target.stat.knockbackTaken) / target.stat.mass`
  - [ ] Rodar `npm run sim:check` isoladamente
  - [ ] **Se o hash divergir especificamente nesta troca** (e só nesta): não insistir. Reverter só esta troca, documentar em Completion Notes que ficou pendente para `debt.3` (onde a migração do Golem torna `stat.knockbackTaken` correto), e seguir com as outras 5 trocas já validadas
  - [ ] Se o hash **não** divergir (ex.: porque `stat.knockbackTaken` já reflete corretamente o default neutro e nenhum personagem testado depende do valor não-neutro no caminho exercitado pelas seeds de baseline — improvável dado que o roster de teste inclui Golem, mas registrar a evidência de qualquer forma), manter a troca e registrar a constatação

- [ ] Task 7 — Verificação final (AC: 1, 2, 3, 4)
  - [ ] `npm run check` — 0 erros
  - [ ] `npm run sim:check` — golden hash idêntico ao baseline, autoconsistência 40/40
  - [ ] Confirmar que nenhum campo direto de `Ball` foi removido nesta story (isso é `debt.3`)

## Dev Notes

### Por que "um de cada vez" importa aqui mais do que em qualquer outra story deste épico

`architecture.md` §6.1 descreve o passo 2 como risco baixo porque, se o hash mudar, "a aritmética divergiu e
o teste diz exatamente onde". Essa garantia **só é verdadeira se as trocas forem feitas e verificadas
isoladamente**. Se todas as 6 trocas forem feitas em um único commit e só então `sim:check` for rodado, e o
hash divergir, o desenvolvedor está de volta à mesma situação que o passo 0 existe para evitar: sabendo que
algo quebrou, sem saber o quê. Este é o motivo desta story ter uma task por troca, cada uma com seu próprio
checkpoint de `sim:check`.

### Por que 5 das 6 trocas são seguras incondicionalmente, e uma não é

Analisando cada campo trocado contra o que **escreve** nele hoje:

| Campo trocado | O que escreve nele hoje | Por que a troca é segura |
|---|---|---|
| `maxSpeed` (em `effectiveSpeed`) | Ninguém — `b.maxSpeed` é constante por personagem, nunca mutado. O multiplicador vem de `mods.speed`, que **não muda nesta troca** | `stat.maxSpeed` (com bônus=0) `=== base.maxSpeed === b.maxSpeed` antigo, byte a byte |
| `dmg` (em `dealDamage`, fonte) | Ninguém no roster atual (`mods.dmg` é sempre 1, default, nenhuma passiva o escreve) | `stat.dmg` (bônus=0) `=== 1.0 === mods.dmg` antigo |
| `dmgTaken` (em `dealDamage`, alvo) | Ninguém — campo **novo**, não existia antes | Multiplicação nova por 1.0 é no-op |
| `range`/`atkSpeed` (em `autoAttack`) | Ninguém no roster atual (`mods.range`/`mods.atkSpeed` sempre 1, default) | Idem — troca de uma constante por outra constante igual |
| `drag` (em `integrate`) | Ninguém — `b.drag` é constante por personagem | `stat.drag` (bônus=0) `=== base.drag === b.drag` antigo |
| `mass`/`radius` (em `collideBalls`) | Ninguém — campos constantes por personagem | Idem |
| **`knockbackResist` → `knockbackTaken` (em `knockback`)** | **`golem.ts:95`, no `init` da passiva Âncora: `self.mods.knockbackResist = 0.6`** | **Não é seguro incondicionalmente.** A migração do `init` do Golem para `bonus: { knockbackTaken: -0.6 }` só acontece em `debt.3`. Até lá, `bonusPassive.knockbackTaken` continua zero para todo mundo, então `stat.knockbackTaken` seria sempre `1.0` (neutro) — **diferente** de `1 - 0.6 = 0.4` que o Golem tem hoje via `mods.knockbackResist`. Trocar este leitor antes da migração do Golem **removeria silenciosamente a resistência a knockback do Golem por um passo inteiro**, e isso teria efeito físico mensurável no golden hash (o Golem voaria mais longe quando empurrado) |

Esta é a única das 6 trocas listadas em `architecture.md` §6.1 (linha do passo 2) que tem uma dependência
real de ordenação com `debt.3` (migração do Golem, `architecture.md` §6.2). O documento de arquitetura lista
as 6 trocas juntas sob o passo 2 sem destacar essa diferença; esta story torna a diferença explícita para
que o dev não seja pego de surpresa.

### Protocolo se a Task 6 (knockback) quebrar o hash

1. Reverter **só** essa troca (manter as outras 5 já validadas).
2. Registrar em Completion Notes: "troca de `knockback` para `stat.knockbackTaken` adiada para `debt.3` —
   depende da migração do `init` do Golem (`golem.ts:94-96`) para `bonus: { knockbackTaken: -0.6 }`."
3. Marcar a Task 6 como parcialmente concluída (código revertido, decisão documentada) — não é falha da
   story, é uma dependência real descoberta pelo processo que o passo 0 existe para expor.
4. Se o motivo da divergência não for óbvio a partir da mensagem de erro do `sim:check` (que deve nomear a
   seed e os valores), escalar para @architect antes de tentar consertar às cegas.

### Onde mexer

- `src/sim/world.ts` — `effectiveSpeed`, `dealDamage`, `SimCtx.knockback`, `autoAttack`.
- `src/sim/physics.ts` — `integrate`, `collideBalls`.

Nenhum arquivo de `src/chars/` é tocado nesta story — os personagens continuam escrevendo em `mods` como
hoje; só os leitores do lado do motor mudam.

### Testing

- Depois de cada uma das 6 trocas: `npm run sim:check` isolado, confirmando golden hash idêntico ao baseline
  de `debt.0` para as 5 seeds.
- Ao final: `npm run check` (0 erros) e `npm run sim:check` completo (autoconsistência + baseline).
- Não introduzir testes automatizados novos nesta story — o golden hash já existente (`debt.0`) é o
  instrumento de verificação. A disciplina de "um de cada vez" é processo, não código.

### Contribuição para o Anexo B

Avança **A-5** (ponto de aplicação nomeado no `StatBlock` — agora efetivamente *lido*, não só existente) sem
fechar nenhum item sozinho; a validação plena continua dependendo de `debt.3` (remoção de `mods`).

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-28 | 1.0 | Story criada a partir de `architecture.md` §6.1 (passo 2) e §6.2 (cruzamento com a migração do Golem em `debt.3`) | River (@sm) |
| 2026-07-28 | 1.0.1 | Validated GO (8/10) — Status: Draft → Ready. **Risco de sequenciamento do `knockback` julgado pelo @po: não é risco, é certeza — a troca DEVE ser adiada para `debt.3`, sem tentativa.** Evidência verificada no código: `golem.ts:94-96` (`init` da Âncora) é chamado por `world.ts:110` em `makeBall`, então `mods.knockbackResist === 0.6` em runtime; o roster do baseline é golem+vex nos dois times (`determinism.ts:15-18`), logo o Golem está sempre em campo nas 5 seeds. Até `debt.3`, `stat.knockbackTaken` vale 1.0 para todos, contra os 0.4 efetivos de hoje — o hash **vai** divergir. A story continua bem-escopada (o risco está documentado e o protocolo de reversão é correto), mas AC 5 (que lista as 6 trocas como concluídas) contradiz AC 7 (que permite uma não concluir). Correção pedida ao @sm **antes** de `debt.2` entrar em desenvolvimento: mover a troca de `knockback` de AC 5 para escopo de `debt.3` e converter a Task 6 de "tentar e reverter" em "não fazer, fecha em `debt.3` Task 5" — a Task 6 atual gasta um ciclo num experimento de resultado conhecido. `debt.3` Task 5 já prevê o fechamento. | @po |

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
