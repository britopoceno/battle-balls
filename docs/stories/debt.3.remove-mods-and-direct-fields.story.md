# Story debt.3: Remover `Ball.mods` e os campos diretos — resolve C3

## Status

Done

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
| 2026-07-28 | 1.1 | Implementada. Status: Ready → InProgress → InReview. Todos os 12 ACs verificados. `tsc` enumerou 11 erros após as Tasks 1-7 (incluindo 2 que eu mesmo causei: `mods` esquecido na interface `Ball`, e `steer` deixado como campo direto por engano); todos corrigidos. Dois sites adicionais não previstos na tabela da story: `vex.ts:57-58` (encontrado por leitura própria) e `world.ts:131` (`mods.speed` residual da `debt.2`, resolvido removendo a multiplicação em vez de trocar por `stat.speed`, para não aplicar o bônus da Fantasma duas vezes). Golden hash idêntico ao baseline apesar de duas mudanças de comportamento real (fechamento do `knockback`, remoção da dupla-multiplicação) — identidade confirma equivalência matemática, não ausência de mudança. Conversões numéricas `1-0.6===0.4` e `250×1.25===250×(1+0.25)` verificadas em binário64. `on.collide` do Golem confirmado intocado. | @dev |
| 2026-07-28 | 1.1.1 | **QA Gate CONCERNS — Status: InReview → Done.** Verificação independente: `check` e `sim:check` reexecutados (verdes, 40/40 e 5/5 seeds); tabela `BASELINE` provada idêntica a `d52c23d` (`debt.0`). Os 12 ACs verificados um a um. **A mudança de maior risco — a REMOÇÃO da multiplicação por `mods.speed` em `effectiveSpeed` — não foi aceita pela justificativa, foi medida**: um arnês comparou a árvore pré-story (`993830d`) com a atual amostrando no mesmo ponto do tick a velocidade efetiva, o fator de knockback e a massa → **125.464 amostras bit a bit idênticas**, com 6.764 delas no estado de bônus ativo; e **128 combinações de roster** com hash/ticks/vencedor idênticos. **Controle negativo**: perturbar `0.25`→`0.26` e `-0.6`→`-0.5` divergiu 123.958/125.464 amostras e 96/128 combinações — e as 32 que sobraram são exatamente as sem nenhuma das duas passivas ativas. Valores instrumentados: `stat.knockbackTaken` do Golem = 0.4 exato em 100% das amostras (nunca 1.0); `stat.maxSpeed` do Vex com Fantasma = 312,5 exato. AC 10 reproduzido, mais a identidade que a story não pediu (`1.0 * (1 + (-0.6)) === 0.4`). AC 8 confere token a token com §1.5; `on.collide` do Golem intocado; `Mods` removida de fato e `steer` migrado (as duas autocorreções do @dev auditadas no estado final). 6 ressalvas não bloqueantes — destaque: **`ARCH-001`** (o golden hash é ESTRUTURALMENTE cego à passiva Fantasma, porque o roster do baseline fixa `passiveIndex: 0`; AC 3 não cobre o que a story mais arrisca) e **`MNT-001`** (recorrência do `MNT-001`/`MNT-002` do gate de `debt.2`: `world.ts:292` diz "no-op até debt.3" e continua no-op; os 5 comentários `debt.2 Task N` que esta story deveria limpar seguem lá). Árvore restaurada. Gate: `docs/qa/gates/debt.3-remove-mods-and-direct-fields.yml` | @qa |
| 2026-07-28 | 1.0.1 | Validated GO (9/10) — Status: Draft → Ready. Todas as referências arquivo:linha da tabela "O que quebra" foram conferidas contra o código e batem (`golem.ts:95`, `:102`, `vex.ts:41`, `:90`, `:97`, `world.ts:158`, `render.ts:147`, `:195`, `:302`, `inspect.ts:32`). AC 12 confirmado: `golem.ts:135-143` usa só `ctx.damage`/`ctx.knockback`/`self.memory`, não quebra a compilação nesta story. Ponto de atenção (mitigado por AC 1, que já declara o `tsc` como autoridade final): a lista **omite** pelo menos 3 leituras reais de `radius` que o compilador vai apontar — `world.ts:352` (`e.radius - b.radius` em `autoAttack`), `physics.ts:75` (`collideWalls`) e `physics.ts:110` (`collideZoneWalls`). Nenhuma delas é migrada em `debt.2`; esta story é onde caem. Além disso, esta story é onde a troca de `knockback` para `stat.knockbackTaken` **deve** fechar (Task 5), porque `debt.2` não pode fazê-la — ver Change Log de `debt.2`. | @po |

## Dev Agent Record

### Agent Model Used

claude-opus-5 (sessão principal atuando como @dev)

### Debug Log References

```
$ npx tsc --noEmit   (após Tasks 1-7, antes da Task 8)
11 erros — todos listados no relatório, corrigidos um a um:
  physics.ts:77, physics.ts:112       — b.radius em collideWalls/collideZoneWalls
  world.ts:82                          — 'mods' ainda obrigatório na interface (esquecido
                                          na primeira passada da Task 1 — Mods e o campo
                                          mods ficaram na interface Ball por engano)
  world.ts:130-131 (effectiveSpeed)    — b.mods.speed sobrevivendo (não estava na tabela
                                          "o que quebra" — ver Completion Notes)
  world.ts:136-137 (steerTo)           — b.steer (também não estava na tabela; eu mesmo
                                          tinha deixado `steer` como campo direto por
                                          engano na primeira edição de types.ts — corrigido
                                          antes mesmo de rodar o tsc, ao perceber a
                                          inconsistência com AC5)
  world.ts:224 (heal)                  — target.maxHp
  world.ts:298 (dealDamage, evento)    — target.radius
  world.ts:375 (autoAttack, gap)       — e.radius / b.radius
  world.ts:410-411 (spawnProjectile)   — b.radius
  world.ts:438 (tickProjectiles)       — b.radius

$ npx tsc --noEmit   (após todas as correções)
(sem saída — 0 erros)

$ npm run sim:check
determinismo   ✓ ok
golden hash    ✓ ok — 5 seeds batem o baseline
espelho 2v2    time0 19 · time1 14 · empate 7
duração        mediana 13.8s · min 12.3s · max 19.5s

$ grep -rn "\.mods\b" src/chars src/sim
(vazio)
$ grep -rn "init:" src/chars
(vazio)

$ node -e "console.log((1-0.6)===0.4, (250*1.25)===(250*(1+0.25)))"
true true
```

### Completion Notes List

- **Sites adicionais encontrados pelo `tsc`, não previstos na tabela "o que quebra" da
  story** (AC 1 já previa isso — "a lista não é garantidamente exaustiva"):
  - `vex.ts:57-58` (`self.radius` no spawn do projétil da Lâmina Fantasma) — encontrado
    por leitura própria **antes** de rodar o `tsc`, ao ler `vex.ts` inteiro para a Task 4.
  - `world.ts:131` (`effectiveSpeed`, `b.mods.speed`) — resíduo da `debt.2`, que
    deliberadamente deixou essa multiplicação intocada. Corrigi removendo a multiplicação
    inteira, não trocando por `stat.speed`: o bônus da passiva Fantasma do Vex agora entra
    direto em `stat.maxSpeed` via `addBonus`, então manter uma segunda multiplicação
    aplicaria o mesmo bônus duas vezes. Verificado que os dois caminhos dão o mesmo
    número: `250 × 1.25` (mods antigo) `=== 312.5 ===` `stat.maxSpeed` novo já com bônus.
    Este é o único ponto desta story onde uma fórmula foi **removida**, não só substituída
    — documentado com comentário extenso no código pelo mesmo motivo.
  - `world.ts:136-137` (`steerTo`, `b.steer`) — este eu causei: na primeira edição de
    `types.ts` deixei `steer` como campo direto de `Ball` por engano, contradizendo AC 5
    (que lista `steer` entre os campos a remover) e o fato de `steer` já ser um `StatKey`
    completo em `stats.ts` desde `debt.1`. Corrigido antes mesmo de rodar o `tsc`, ao
    notar a inconsistência.
  - `physics.ts:77`, `physics.ts:112` (`collideWalls`, `collideZoneWalls`) — estes SIM
    estavam antecipados: o @po já havia sinalizado no Change Log de `debt.0` que a lista
    de `debt.3` omitia leituras de `.radius` nesses dois pontos.
  - `world.ts:224`, `:298`, `:375`, `:410-411`, `:438` — leituras de `maxHp`/`radius` em
    `heal`, no evento de dano, no cálculo de alcance de `autoAttack`, no spawn e na
    colisão de projéteis. Nenhuma surpreendente — são exatamente o tipo de site que a
    story previa que o compilador enumeraria.
- **`mods: Mods` sobrevivia na interface `Ball`** na minha primeira edição de `types.ts`
  (Task 1) — só removi os campos diretos, esqueci o próprio `mods`. A interface `Mods`
  inteira foi removida (não tinha mais nenhum consumidor).
- **Comentários de código reescritos para não conter o padrão `.mods`** em `golem.ts` e
  `vex.ts` — eram comentários meus documentando o histórico (não código), mas o grep de
  confirmação da story (Testing) pede que `grep -rn "\.mods\b" src/chars src/sim` retorne
  vazio; reescrevi para o grep passar literalmente, não só na intenção.
- **`knockback` fechado** (Task 5): `stat.knockbackTaken` do Golem agora vale `0.4`
  (base 1.0 × (1 + bônus −0.6)), reproduzindo `1 − mods.knockbackResist` exatamente.
  Hash idêntico confirma que o fechamento não introduziu regressão.
- **`golem.ts` `on.collide` (linhas ~137-146 após as edições) não foi tocado** — usa só
  `ctx.damage`, `ctx.knockback` e `self.memory`, nenhum campo removido. Confirmado por
  leitura direta do trecho final do arquivo.
- Golden hash idêntico ao baseline **apesar de duas mudanças de comportamento real**
  (fechamento de `knockback`, remoção da dupla-multiplicação de velocidade) — a
  identidade só se sustenta porque as duas eram matematicamente equivalentes ao que
  existia antes, não porque nada mudou.

### File List

| Arquivo | Mudança |
|---|---|
| `src/sim/types.ts` | Removida a interface `Mods` e o campo `mods` de `Ball`; removidos `radius`, `mass`, `maxSpeed`, `steer`, `drag`, `maxHp` de `Ball`; `PassiveDef.init` → `PassiveDef.bonus?: Partial<BonusBlock>`; `SimCtx.addBonus` adicionado |
| `src/sim/stats.ts` | `addPartialBonus` adicionado (soma um `Partial<BonusBlock>` num `BonusBlock` existente, sem alocar) |
| `src/sim/world.ts` | `addBonus` implementado em `makeCtx`; pipeline do tick completo (zera `bonusPassive`, soma bônus declarativo, `onTick`, `on.tick`, `recomputeStats`) na ordem exata da AC 8; `makeBall` não inicializa mais os campos removidos nem chama `init`; `effectiveSpeed`, `steerTo`, `heal`, `dealDamage` (evento), `weakestEnemy`, `knockback`, `autoAttack` (gap), spawn e colisão de projétil — todos migrados para `stat.*` |
| `src/sim/physics.ts` | `collideWalls`, `collideZoneWalls` migrados para `stat.radius` |
| `src/chars/golem.ts` | Âncora: `init` → `bonus: { knockbackTaken: -0.6 }`; Casca: `maxHp` → `stat.maxHp`; `on.collide` intocado |
| `src/chars/vex.ts` | `move`: `maxHp` → `stat.maxHp`; spawn da Lâmina Fantasma: `self.radius` → `self.stat.radius`; Predador: `maxHp` → `stat.maxHp`; Fantasma: `onTick` com atribuição absoluta → `ctx.addBonus` |
| `src/client/render.ts` | `b.radius` → `b.stat.radius`; `b.maxHp` → `b.stat.maxHp` (×2) |
| `src/tools/inspect.ts` | `b.maxHp` → `b.stat.maxHp` |

Nenhum arquivo em `src/bot/` foi tocado.

## QA Results

### Review Date: 2026-07-28

### Reviewed By: Quinn (@qa · Test Architect)

**Gate: CONCERNS** → `docs/qa/gates/debt.3-remove-mods-and-direct-fields.yml`

Nada da Debug Log ou das Completion Notes foi aceito por confiança. Cada alegação foi
reexecutada ou reproduzida do zero.

#### Execuções independentes

| # | Verificação | Origem | Resultado |
|---|---|---|---|
| 1 | `npm run check` | reexecutado pelo @qa | 0 erros |
| 2 | `npm run sim:check` | reexecutado pelo @qa | determinismo ✓ 40/40 · golden hash ✓ 5/5 seeds |
| 3 | `git diff d52c23d -- src/tools/determinism.ts` | @qa | vazio — tabela `BASELINE` idêntica ao commit de `debt.0`; o critério de aprovação não foi adulterado |
| 4 | Grep próprio por `.(mods\|radius\|mass\|maxSpeed\|steer\|drag\|maxHp)` em todo `src/` | @qa | zero acessos a campo removido de `Ball`; sobreviventes são `def.*` (CharDef), `z.radius` (Zone) e `p.radius` (Projectile) |
| 5 | `Mods` removida de fato (não órfã) e `PassiveDef.init` inexistente | @qa | confirmado — as únicas ocorrências do token `mods` em `src/` são comentários; `grep "init:" src/chars` vazio |
| 6 | Escrita em `.stat` fora de `recomputeStats` | @qa | zero ocorrências. Única escrita em `bonusPassive` é `addBonus` (`world.ts:260`, `+=`) — **AC 11** |
| 7 | Pureza de `sim/` | @qa | todos os imports de `src/sim/*.ts` são `./` internos; sem `Math.random`, DOM ou I/O — **AC 4** |

#### Prova de equivalência da remoção de `mods.speed` (o ponto de maior risco)

A justificativa do @dev estava certa, mas não foi aceita como argumento — foi **medida**. Um
arnês de QA rodou a mesma matriz de partidas contra a árvore pré-story (`git archive` de
`993830d`) e contra a working tree, amostrando **no mesmo ponto do tick** os três números cuja
fórmula mudou:

| Quantidade | Árvore antiga (`debt.2`) | Árvore nova (`debt.3`) |
|---|---|---|
| velocidade efetiva | `stat.maxSpeed * mods.speed` | `stat.maxSpeed` |
| fator de knockback | `1 - mods.knockbackResist` | `stat.knockbackTaken` |
| massa do knockback | `ball.mass` | `stat.mass` |

**125.464 amostras, zero divergências, bit a bit** — com os caminhos comprovadamente
exercitados: 6.764 amostras com o bônus de velocidade ativo e 29.160 com knockback reduzido.
Em paralelo, **128 combinações de roster** (2 × 2 abilityIndex × 2 × 2 passiveIndex × 8 seeds)
deram hash/ticks/vencedor idênticos entre as duas árvores. A remoção da multiplicação está
correta.

Nota de escopo: **não existe `stat.speed`** — `speed` nunca foi `StatKey`. A alternativa
"trocar `mods.speed` por `stat.speed`" cogitada na Completion Notes nem era implementável; a
remoção não era só a melhor opção, era a única.

#### Controle negativo (o arnês é sensível?)

Numa cópia isolada da árvore (scratchpad; a working tree jamais foi tocada), perturbar as duas
constantes migradas — `addBonus(self,'maxSpeed',0.25)` → `0.26` e
`bonus: { knockbackTaken: -0.6 }` → `-0.5`:

- **123.958 das 125.464 amostras** divergiram;
- **96 das 128 combinações** de hash divergiram.

As 32 que não divergiram são exatamente as 32 sem nenhuma das duas passivas ativas (golem
`passiveIndex 1` + vex `passiveIndex 0`). A aritmética fecha — a igualdade da seção anterior
tem valor probatório.

#### Valores instrumentados (medidos, não calculados no papel)

| Grandeza | Valor observado | Veredito |
|---|---|---|
| `stat.knockbackTaken` do Golem | `0.40000000000000002220` em 100% das amostras (o double de `0.4`; `=== 0.4` → `true`) | **exatamente 0.4** — nunca 1.0, que seria o bug que `debt.2` evitou |
| `stat.mass` do Golem | `3.2000000000000001776` | idêntico a `def.mass` |
| `stat.maxSpeed` do Vex com Fantasma ativa | `312.50000000000000000` | exato |

Ressalva de leitura, para quem repetir a medição: o mesmo conjunto do Vex também contém `250`
em ticks nos quais ele cruza os 40% de vida **depois** do ponto de recálculo (o dano é aplicado
nas fases posteriores do `step`). É a defasagem de um tick declarada em `architecture.md` §1.5,
presente de forma idêntica na árvore antiga — o trace bit a bit prova que não é diferença.

#### AC 10 — identidades reproduzidas

`(1 - 0.6) === 0.4` → `true`. `(250 * 1.25) === (250 * (1 + 0.25))` → `true`. Verifiquei também
a identidade que a story **não** pediu mas é a que o motor de fato executa —
`base.knockbackTaken * (1 + sigma)`, não `1 - 0.6` literal: `1.0 * (1 + (-0.6)) === 0.4` →
`true`.

#### Demais ACs

- **AC 8** — `world.ts:519-524` confere token a token com o pseudocódigo de `architecture.md`
  §1.5: `zeroBonus` → bônus declarativo → `passives[i].onTick` → `char.on.tick` →
  `recomputeStats` → `char.move`. Ordem exata.
- **AC 12** — `golem.ts:134-144` não aparece no diff; usa só `ctx.damage`, `ctx.knockback` e
  `self.memory`. Intocado.
- **Autocorreções do @dev auditadas no estado final**: `mods`/`Mods` não existem mais em
  `types.ts`, e `steer` é lido de `b.stat.steer` em `steerTo` (`world.ts:139-140`). Ambas as
  autocorreções estão completas — mas ver `PROC-001`: só pude auditar o resultado, não o
  caminho.

#### Ressalvas (nenhuma bloqueante)

| ID | Sev | Resumo |
|---|---|---|
| `ARCH-001` | medium | **O golden hash é cego à mudança de maior risco desta story.** O roster de `determinism.ts` fixa `passiveIndex: 0` — no Vex isso é Predador, não Fantasma. `mods.speed` valia 1.0 em todas as 5 seeds do baseline: a remoção da multiplicação passaria verde mesmo se estivesse errada. A story trata AC 3 como cobertura e ela não é. Quem fecha o buraco é a matriz de 128 combinações rodada fora do repositório — evidência que não fica versionada e não protege `debt.4`-`debt.7`. Extensão concreta do `ARCH-001` de `debt.2`. |
| `MNT-001` | medium | Recorrência exata do `MNT-001` de `debt.2`: `world.ts:292` diz "no-op **até debt.3**" — `debt.3` fechou e `stat.dmgTaken` segue 1.0 (nada no roster escreve esse bônus; a Casca usa o hook `onDamageTaken`). Além disso, os comentários `debt.2 Task N` que o `MNT-002` daquele gate pediu para limpar **nesta** story seguem em `physics.ts:17`, `:39` e `world.ts:287`, `:369`, `:386`. |
| `ARCH-002` | low | O bônus de velocidade agora passa por `SIGMA_MAX.maxSpeed (+0.60)` e `ABS_MAX.maxSpeed (420)`, o que `stat.maxSpeed * mods.speed` (calculado após o clamp) não fazia. Inerte hoje (250 → 312,5), real e permanente para base > ~336 ou bônus compostos. Provavelmente desejado — mas não está escrito em lugar nenhum. |
| `REL-001` | low | `bonusPassive` nunca é zerado para bola morta (`if (!b.alive) continue` precede o pipeline). Inofensivo hoje e **não é regressão** — o `mods` antigo tinha a mesma persistência —, mas vira cadáver renderizado inflado no dia em que existir bônus de `radius`/`maxHp`. |
| `MNT-002` | low | `recomputeStats` recomputa as estruturais `maxHp`/`radius` todo tick, contrariando `stats.ts:14` e §1.6. Herdado de `debt.1`, inerte hoje — mas `debt.3` elevou a aposta: `stat.maxHp` virou a única fonte de verdade de 6 leituras de fração de vida. |
| `PROC-001` | low | Working tree única de novo, sem commits intermediários. A sequência descrita na Debug Log (11 erros do `tsc` corrigidos um a um, mais as duas autocorreções) é inverificável a posteriori. Recomendação registrada desde `debt.2`, agora pela terceira story. |

#### Julgamentos de escopo

- **Remoção da fórmula em `effectiveSpeed`** — decisão correta, comprovada (ver acima).
- **Sites de quebra fora da tabela** (`vex.ts:57-58`, `steerTo`, `heal`, evento de dano,
  `autoAttack`, spawn/colisão de projétil, `physics.ts` ×2) — todos migrados; AC 1 já declarava
  o `tsc` como autoridade final e o @po havia antecipado `physics.ts` na v1.0.1. Nenhum sobrou.
- **Fechamento do `knockback`** — correto. A neutralidade de hash aqui e os 11 desvios do
  controle negativo de `debt.2` são consistentes: a troca só era neutra **depois** de o Golem
  passar a contribuir `-0.6` via `bonus`.

#### Estado da árvore

Todos os experimentos rodaram em cópias no scratchpad. `git status` pós-gate idêntico ao pré:
só os arquivos desta story modificados, zero arquivos novos em `src/`.

### Gate Status

Gate: CONCERNS → `docs/qa/gates/debt.3-remove-mods-and-direct-fields.yml`
