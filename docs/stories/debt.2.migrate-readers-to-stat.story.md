# Story debt.2: Trocar os leitores para `stat.*`, um de cada vez

## Status

Done

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
5. **Cinco** leitores abaixo passam a ler de `b.stat.*` em vez dos campos diretos de `Ball` (que **continuam
   existindo** em `Ball` nesta story — a remoção é `debt.3`). `knockback` **NÃO** está nesta lista — ver AC 7.
   - `effectiveSpeed` (`world.ts:118`) → `b.stat.maxSpeed` (a multiplicação por `b.mods.speed` continua
     intocada, ver Dev Notes)
   - `dealDamage` (`world.ts:254`) → `source.stat.dmg` e `target.stat.dmgTaken`
   - `autoAttack` (`world.ts:341-398`) → `def.atk.range * b.stat.range` e `def.atk.cd / b.stat.atkSpeed`
   - `integrate` (`physics.ts:7-25`) → `b.stat.drag`
   - `collideBalls` (`physics.ts:27-69`) → `a.stat.mass`/`b.stat.mass` e `a.stat.radius`/`b.stat.radius`
6. Cada uma das 5 trocas foi seguida de uma execução isolada de `npm run sim:check` antes de prosseguir para
   a próxima — registrado no File List/Completion Notes qual troca foi feita em qual ordem.
7. **`knockback` NÃO é trocado nesta story — decisão, não risco.** O @po determinou (Change Log v1.0.1,
   confirmado no código) que a troca quebraria o golden hash com certeza: `golem.ts:94-96` escreve
   `mods.knockbackResist = 0.6` no `init`, e até `debt.3` migrar esse `init` para `bonus.knockbackTaken`,
   `stat.knockbackTaken` ficaria neutro (1.0) para todo o roster — removendo a resistência a knockback do
   Golem por um passo inteiro, com efeito físico mensurável no golden hash. `SimCtx.knockback` continua lendo
   `target.mods.knockbackResist`/`target.mass`, inalterado. O fechamento é `debt.3` Task 5.

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

- [ ] Task 6 — `knockback`: NÃO migrar nesta story (AC: 7)
  - [ ] Confirmar que `SimCtx.knockback` (`world.ts:216-221`) permanece lendo `target.mods.knockbackResist` e
    `target.mass` — nenhuma edição neste trecho
  - [ ] Não é experimento nem tentativa: o @po já determinou que a troca quebra o hash com certeza (AC 7).
    Fecha em `debt.3` Task 5, junto da migração do `init` do Golem

- [ ] Task 7 — Verificação final (AC: 1, 2, 3, 4)
  - [ ] `npm run check` — 0 erros
  - [ ] `npm run sim:check` — golden hash idêntico ao baseline, autoconsistência 40/40
  - [ ] Confirmar que nenhum campo direto de `Ball` foi removido nesta story (isso é `debt.3`)
  - [ ] Confirmar que `SimCtx.knockback` não foi tocado (AC 7)

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
| 2026-07-28 | 1.1 | Implementada. Status: Ready → InProgress → InReview. As 5 trocas migradas uma de cada vez, cada uma com `sim:check` isolado antes de avançar — todas idênticas ao baseline. `knockback` confirmado como não-edição (AC 7). Nenhum campo direto de `Ball` removido. Escopo de `.radius` respeitado nos limites exatos: as outras leituras diretas em `physics.ts` (`collideWalls`, `collideZoneWalls`) e em `world.ts` ficaram intocadas por não estarem na lista de 5 leitores — são trabalho de `debt.3`. | @dev |
| 2026-07-28 | 1.1.1 | **QA Gate CONCERNS — Status: InReview → Done.** Verificação independente: `check` e `sim:check` reexecutados (verdes); tabela `BASELINE` de `determinism.ts` provada idêntica byte a byte ao commit `d52c23d` (`debt.0`) — o critério de aprovação não foi adulterado; as 5 trocas **reconstruídas uma a uma** a partir de `HEAD(debt.1)` em cópia isolada da árvore, cada uma com `sim:check` próprio → 5/5 hash-neutras individualmente (AC 6 verificado em substância, não aceito por confiança na Debug Log). **Controle negativo**: aplicar a troca proibida do `knockback` na cópia isolada produziu 11 desvios do baseline, com inversão de vencedor nas seeds 3 e 7 — prova que o arnês é sensível e que a determinação do @po na v1.0.1 era certeza. `SimCtx.knockback` intocado; nenhum campo direto de `Ball` removido; nada em `chars/`/`bot/`/`client/`; árvore restaurada após os experimentos. Escopo das demais leituras de `.radius` julgado **correto** (efeito nulo hoje, compilador cobre todas em `debt.3`). 4 ressalvas não bloqueantes: MNT-001 (dois comentários em `world.ts:515` e `types.ts:63` que esta story tornou falsos), ARCH-001 (clamps de `stats.ts` viraram load-bearing sem teste, e o golden hash não cobre isso — roster fixo de 2), PROC-001 (AC 6 satisfeito mas não auditável: sem commits intermediários), MNT-002 (comentários `Task N` são ruído e ficam obsoletos em `debt.3`). Gate: `docs/qa/gates/debt.2-migrate-readers-to-stat.yml` | @qa |
| 2026-07-28 | 1.0.2 | Correção aplicada mecanicamente, exatamente como especificado em v1.0.1 — não é novo julgamento, é execução da determinação já dada pelo @po. AC 5 reduzido a 5 trocas (knockback removido da lista); AC 7 reescrito como decisão, não risco condicional; Task 6 convertida de "tentar e reverter" para "confirmar que não foi tocado"; Task 7 ganhou item de verificação correspondente. | @sm |

## Dev Agent Record

### Agent Model Used

claude-opus-5 (sessão principal atuando como @dev)

### Debug Log References

Cada troca rodou `npx tsc --noEmit` + `npm run sim:check` isoladamente, **antes** de
avançar para a próxima. Todas as 5 execuções intermediárias:

```
Task 1 (effectiveSpeed) → determinismo ✓ ok · golden hash ✓ ok — 5 seeds batem o baseline
Task 2 (dealDamage)     → determinismo ✓ ok · golden hash ✓ ok — 5 seeds batem o baseline
Task 3 (autoAttack)     → determinismo ✓ ok · golden hash ✓ ok — 5 seeds batem o baseline
Task 4 (integrate)      → determinismo ✓ ok · golden hash ✓ ok — 5 seeds batem o baseline
Task 5 (collideBalls)   → determinismo ✓ ok · golden hash ✓ ok — 5 seeds batem o baseline
```

Verificação final (Task 7):

```
determinismo   ✓ ok
golden hash    ✓ ok — 5 seeds batem o baseline
espelho 2v2    time0 19 · time1 14 · empate 7
duração        mediana 13.8s · min 12.3s · max 19.5s
```

### Completion Notes List

- **Correção do @po aplicada antes de iniciar** (Change Log v1.0.2): `knockback` removido de
  AC 5, Task 6 convertida de "tentar e reverter" para "confirmar que não foi tocado". Não foi
  um novo julgamento — só execução mecânica do que o @po já havia determinado com certeza.
- **Task 6 confirmada como não-edição**: `SimCtx.knockback` (`world.ts:236`) continua lendo
  `target.mods.knockbackResist` e `target.mass`, sem nenhuma linha tocada. Verificado por
  grep — zero ocorrências de `knockbackTaken` em `world.ts` fora da declaração em `stats.ts`
  (importada por tipo).
- **Escopo de `.radius` confirmado nos limites exatos da story.** `physics.ts` tem outras duas
  leituras de `.radius` direto (`collideWalls` e `collideZoneWalls`) e `world.ts` tem várias
  (gap de alcance em `autoAttack`, spawn de projétil, raio de zona) — nenhuma delas está na
  lista de 5 leitores desta story, então nenhuma foi tocada. Ficam para o compilador apontar
  quando `debt.3` remover os campos diretos.
- Nenhum campo direto de `Ball` foi removido (`radius`, `mass`, `maxSpeed`, `steer`, `drag`,
  `maxHp`, `mods` todos continuam declarados em `types.ts`) — confirmado por grep, não só
  por não ter escrito código de remoção.
- Cada troca ganhou um comentário de uma linha (`// debt.2 Task N: campo migrado para
  stat.*`) no ponto exato da mudança — não um bloco extenso, só o suficiente para quem for
  ler `git blame` depois entender a proveniência sem abrir esta story.

### File List

| Arquivo | Mudança |
|---|---|
| `src/sim/world.ts` | `effectiveSpeed` (Task 1), `dealDamage` (Task 2), `autoAttack` ×2 (Task 3) — 5 linhas trocadas + comentários |
| `src/sim/physics.ts` | `integrate` (Task 4), `collideBalls` ×4 (Task 5) — 5 linhas trocadas + comentários |

Nenhum arquivo em `src/chars/`, `src/bot/` ou `src/client/` foi tocado — só o lado do motor
mudou, exatamente como as Dev Notes previam.

## QA Results

### Review Date: 2026-07-28

### Reviewed By: Quinn (@qa, Test Architect)

### Postura desta revisão

Nada da Debug Log do @dev foi aceito por confiança. As 5 execuções isoladas alegadas
foram **reconstruídas do zero** pelo @qa numa cópia isolada da árvore, e a proibição do
`knockback` foi testada com **controle negativo** — não bastava ver que ninguém tocou no
código, era preciso provar que tocar quebraria.

### Verificação independente

| Verificação | Método | Resultado |
|---|---|---|
| `npm run check` | reexecutado pelo @qa | 0 erros |
| `npm run sim:check` | reexecutado pelo @qa | determinismo ✓ · golden hash ✓ 5/5 seeds |
| Integridade do baseline | `git show d52c23d:src/tools/determinism.ts` vs. working tree | tabela `BASELINE` **idêntica byte a byte** ao commit de `debt.0` — o critério de aprovação não foi adulterado |
| 5 trocas isoladas | cada troca reconstruída sozinha a partir de `HEAD(debt.1)` em cópia isolada, com `sim:check` próprio | **5/5 hash-neutras individualmente** |
| `SimCtx.knockback` intocado | ausência no diff + `grep knockbackTaken src/` | zero ocorrências fora de `stats.ts` — `world.ts:236` segue lendo `target.mods.knockbackResist` / `target.mass` |
| Controle negativo do `knockback` | troca aplicada na cópia isolada | **11 desvios do baseline** |
| Campos diretos de `Ball` preservados | leitura de `types.ts:28-73` | `radius`, `mass`, `maxSpeed`, `steer`, `drag`, `maxHp`, `mods` todos presentes |
| Pureza de `sim/` | grep por `Math.random`/DOM/IO/imports de `chars`,`bot`,`client` | limpo (único match é um comentário dizendo que nunca se usa) |
| Escopo de arquivos | `git status --porcelain` | só `world.ts`, `physics.ts` e esta story — nada em `chars/`, `bot/`, `client/` |
| Árvore restaurada | `git status` pós-experimentos | idêntico ao pré · zero arquivos não rastreados em `src/` |

### O controle negativo, em detalhe

Aplicando na cópia isolada exatamente a troca que a story proíbe
(`(force * (1 - target.mods.knockbackResist)) / target.mass` → `(force * target.stat.knockbackTaken) / target.stat.mass`):

```
✗ baseline seed 1:  hash 96de1201 → d66f92f1
✗ baseline seed 2:  hash f66a7416 → b1ad34f9 · ticks 961 → 1102
✗ baseline seed 3:  hash a8db9c28 → b510af5d · ticks 830 → 1168 · vencedor 0 → 1
✗ baseline seed 7:  hash cb77dbe0 → 596b2c29 · ticks 831 →  779 · vencedor 0 → 1
✗ baseline seed 11: hash 6aede2d9 → 96d54c2a · ticks 1168 → 1169
golden hash    ✗ 11 desvio(s)
```

Isso prova duas coisas ao mesmo tempo: o arnês de verificação **é sensível** (não é um teste
que passa com qualquer coisa), e a determinação do @po na v1.0.1 era **certeza, não hipótese** —
a troca não só muda o hash como **inverte o vencedor em 2 das 5 seeds**. A correção da v1.0.2
economizou um ciclo inteiro gasto num experimento de resultado conhecido.

### Julgamentos de escopo pedidos

**As outras leituras de `.radius` ficaram de fora corretamente.** `collideBalls` agora lê
`stat.radius`, enquanto `collideWalls` (`physics.ts:77`), `collideZoneWalls` (`physics.ts:112`),
o gap de alcance (`world.ts:374`), o spawn de projétil (`world.ts:409-410`), a colisão de
projétil (`world.ts:437`) e o popup de dano (`world.ts:297`) seguem lendo `b.radius` direto.
É uma inconsistência real, mas de **janela fechada e efeito nulo**: hoje
`stat.radius === base.radius === b.radius` (bônus sempre 0, valores dentro dos clamps), e
`debt.3` remove os campos diretos de `Ball` — momento em que o compilador aponta **cada um**
desses sites, porque `Ball` é interface sem index signature. A rede de proteção citada nas
Completion Notes é real, não esperança. Migrá-los aqui seria estender AC 5 além do que o @po
validou e além do que `architecture.md` §6.1 define como passo 2. As leituras de `z.radius`
nem são candidatas — `Zone` não tem camada de stats.

**Os comentários `// debt.2 Task N` são metade sinal, metade ruído.** A parte substantiva é
útil e devia existir: `"mods.speed intocado (migra em debt.3)"` e `"dmgTaken sempre 1.0 hoje —
no-op até debt.3"` explicam decisões que o código não explica. A parte `"Task N"` é ruído —
aponta para uma numeração interna a uma story que será arquivada e que foi **renumerada no meio
do caminho** (Change Log v1.0.2 reescreveu a Task 6). O resto (`"drag migrado para stat.*"`)
só repete a linha abaixo, coisa que `git blame` já faz melhor. Ver MNT-002.

### Ressalvas (não bloqueantes)

- **MNT-001 (medium)** — Dois comentários que esta story tornou **falsos** e não atualizou:
  `world.ts:515-516` ("nenhum leitor real consome `b.stat` ainda (isso é `debt.2`)") e
  `types.ts:63-64` ("`mods` e os campos diretos acima ainda são os únicos lidos até `debt.3`").
  Eram verdadeiros quando escritos em `debt.1`; esta story os invalidou. O leitor natural dos
  dois é o dev de `debt.3` — exatamente quem mais precisa da informação correta.
- **ARCH-001 (medium)** — Esta story tornou os clamps `ABS_MIN`/`ABS_MAX` de `stats.ts`
  **load-bearing** sem cobertura de teste. Até `debt.1` eram inertes. Agora `radius` é clampado
  em 8..40, `maxSpeed` em 20..420, `drag` em 0.05..0.6 no caminho de leitura real. Golem
  (r24/d0.3/m3.2/v105) e Vex (r15/d0.22/m0.9/v250) estão dentro das faixas — verifiquei um a
  um, é por isso que o hash não mudou. Mas um personagem novo fora de faixa teria a física
  silenciosamente alterada, e o **golden hash não pode detectar isso**: o baseline roda um
  roster fixo de golem+vex. É um ponto cego estrutural do instrumento de verificação,
  introduzido por esta story.
- **PROC-001 (low)** — AC 6 foi satisfeito em substância (verifiquei), mas não é auditável:
  tudo chegou numa working tree única, sem commits intermediários. Recomendação para
  `debt.3`-`debt.7`: **um commit por troca**, para que a evidência de AC 6 viva no `git log`
  em vez de depender de confiança na Debug Log.
- **MNT-002 (low)** — Ver julgamento sobre os comentários acima. Além do ruído, 5 deles dizem
  "até `debt.3`" e viram lixo no dia em que `debt.3` fechar, sem que ninguém tenha registrado
  essa obrigação de limpeza.

### Rastreabilidade dos AC

| AC | Veredito | Evidência |
|---|---|---|
| 1 — `tsc --noEmit` verde | PASS | reexecutado, 0 erros |
| 2 — `sim:check` verde | PASS | reexecutado, 40/40 + baseline |
| 3 — golden hash idêntico ao `debt.0` | PASS | 5/5 seeds; tabela `BASELINE` provada intacta vs. `d52c23d` |
| 4 — `sim/` puro | PASS | grep limpo; o diff não adiciona import nenhum |
| 5 — 5 leitores migrados | PASS | diff confere exatamente 5 pontos, nem um a mais |
| 6 — verificação isolada por troca | PASS | reproduzido pelo @qa: 5/5 hash-neutras isoladamente (processo não auditável — PROC-001) |
| 7 — `knockback` intocado | PASS | ausente do diff + grep + controle negativo |

### Gate Status

Gate: CONCERNS → docs/qa/gates/debt.2-migrate-readers-to-stat.yml

### Recomendação

**Aprovado para `Done`.** As 4 ressalvas são todas de manutenibilidade/processo e nenhuma
afeta comportamento — o jogo de hoje é bit a bit o de `debt.0`. MNT-001 e ARCH-001 devem ser
endereçados em `debt.3`, que é a próxima story a mexer nesses mesmos pontos.
