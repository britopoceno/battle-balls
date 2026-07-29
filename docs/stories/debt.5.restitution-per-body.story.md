# Story debt.5: Restituição por corpo (`restBall`/`restWall`) — resolve C2 (Borracha)

## Status

Done

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: ["npm run check", "npm run sim:check"]
```

## Story

**Como** desenvolvedor executando o passo 5 da migração de stats — resolve **C2** para o item Borracha
(`docs/prd.md` §4: "+elasticidade" sem ponto de aplicação),
**eu quero** que `restBall`/`restWall` deixem de ser constantes de módulo (`REST_BALL`/`REST_WALL` em
`physics.ts`) e passem a ser stats por corpo, com a regra de combinação **máximo** para colisão bola-bola,
**para que** a Borracha tenha um ponto de aplicação real na simulação.

## Depende de

`debt.4` (Done) — segue a ordem sequencial do plano de migração; `restBall`/`restWall` já existem em
`STAT_KEYS`/`DEFAULT_STATS` desde `debt.1`, mas nesta story eles passam a ser efetivamente lidos pela física.

## Acceptance Criteria

1. `npm run check` (`tsc --noEmit`) verde.
2. `npm run sim:check` verde (autoconsistência 40/40 + baseline).
3. Golden hash **idêntico** ao baseline de `architecture.md` §6.0 (seeds 1, 2, 3, 7, 11). Verificado por
   identidade numérica: `Math.max(0.65, 0.65) === 0.65` — como nenhum personagem do roster declara
   `restBall`/`restWall` próprios hoje, ambos usam o default (0.65/0.72) e a regra de combinação não muda
   nada na prática ainda.
4. `sim/` continua puro: sem `Math.random`, sem DOM, sem I/O, sem importar de `chars/`, `bot/`, `client/`.
5. `CharDef` ganha `restBall?: number` e `restWall?: number` opcionais (se ainda não adicionados em
   `debt.1`). Default vem de `DEFAULT_STATS` (0.65/0.72) quando ausente — nenhum personagem do roster atual
   precisa declará-los.
6. `physics.ts` não tem mais as constantes `REST_BALL`/`REST_WALL` (linhas 4-5 hoje). Todos os três pontos
   de uso passam a ler `stat.restBall`/`stat.restWall`: `collideBalls` (linha 59 hoje), `collideWalls`
   (linhas 78-88 hoje) e `collideZoneWalls` (linha 120 hoje).
7. `collideBalls` combina `a.stat.restBall` e `b.stat.restBall` pela regra **máximo**:
   `e = Math.max(a.stat.restBall, b.stat.restBall)`. Esta é a decisão registrada em `architecture.md` §2.2 —
   não usar média, produto nem média geométrica.
8. `collideWalls` e `collideZoneWalls` usam `b.stat.restWall` **sem mixing** (parede não é corpo, não tem
   stat próprio).
9. Restituição passa pelo clamp de `recomputeStats` (ΣMIN=−0.60, ΣMAX=+0.45, clamp absoluto [0.05, 0.92])
   como qualquer outro stat contínuo — mas como nenhum bônus existe ainda, o clamp nunca morde nesta story.

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type**: Architecture
**Secondary Type(s)**: —
**Complexity**: Low — três pontos de leitura em `physics.ts`, uma regra de combinação simples

### Specialized Agent Assignment

**Primary Agents**:
- @dev
- @architect (dono da decisão "máximo" em §2.2, incluindo o contra-argumento registrado)

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
- Regra de combinação correta: `Math.max`, não média nem produto (erro fácil de introduzir por "parecer mais justo")
- Casos de borda: parede e zone-wall usam `restWall` sem mixing, nunca combinando com o corpo

**Secondary Focus**:
- Remoção completa de `REST_BALL`/`REST_WALL` — nenhuma referência residual em `physics.ts`

## Tasks / Subtasks

- [ ] Task 1 — `CharDef` ganha restituição própria (AC: 5)
  - [ ] Adicionar `restBall?: number` e `restWall?: number` a `CharDef` (se não feito em `debt.1`)
  - [ ] Em `makeBall`: `base.restBall = def.restBall ?? DEFAULT_STATS.restBall`, idem para `restWall`

- [ ] Task 2 — Remover as constantes de módulo (AC: 6)
  - [ ] `physics.ts:4-5`: remover `const REST_BALL = 0.65` e `const REST_WALL = 0.72`

- [ ] Task 3 — Migrar `collideBalls` (AC: 6, 7, 9)
  - [ ] `physics.ts:59`: `const imp = (-(1 + REST_BALL) * vn) / invSum` →
    `const e = Math.max(a.stat.restBall, b.stat.restBall); const imp = (-(1 + e) * vn) / invSum`

- [ ] Task 4 — Migrar `collideWalls` (AC: 6, 8)
  - [ ] `physics.ts:78-88`: cada `REST_WALL` → `b.stat.restWall` (por bola, sem mixing)

- [ ] Task 5 — Migrar `collideZoneWalls` (AC: 6, 8)
  - [ ] `physics.ts:120`: `REST_WALL` → `b.stat.restWall`

- [ ] Task 6 — Verificação (AC: 1, 2, 3, 4)
  - [ ] `npm run check` — 0 erros
  - [ ] `npm run sim:check` — golden hash idêntico ao baseline, autoconsistência 40/40

## Dev Notes

### De constante de módulo a propriedade de corpo (fonte: `architecture.md` §2.1)

Hoje: `REST_BALL = 0.65` e `REST_WALL = 0.72` em `physics.ts:4-5`, usados em três lugares
(`collideBalls:59`, `collideWalls:78-88`, `collideZoneWalls:120`).

Depois: dois stats por corpo, `restBall` e `restWall`, com base vinda do `CharDef` e default `0.65`/`0.72` —
as mesmas constantes, mudadas de casa para `sim/stats.ts` como `DEFAULT_STATS`. Nenhum personagem precisa
declará-las; ausência = default.

### A decisão real: duas bolas, duas elasticidades — por que "máximo" (fonte: `architecture.md` §2.2)

Quatro regras possíveis para combinar `e_a` e `e_b` foram avaliadas. **Recomendação: A — máximo**
(`Math.max(ea, eb)`), por três razões, em ordem de peso:

1. **É a única regra em que o item não depende da build do inimigo.** Com média, produto ou média
   geométrica, o valor entregue pela Borracha é função do que o oponente comprou — o que impede o arnês da
   Fase 2 de atribuir causa quando a matriz de winrate sai de 45–55%, justamente o problema que D-04 resolve
   no combate. Usar uma regra dependente aqui reintroduziria, na física, o problema que D-04 elimina no
   combate.
2. **É o único caminho que preserva o baseline bit a bit**: `Math.max(0.65, 0.65) === 0.65` (verificado).
   Com produto, a restituição cairia de 0.65 para 0.42 e o golden hash mudaria sem necessidade.
3. **O risco #1 do PRD pede um item físico que se sinta.** Elasticidade é a única propriedade puramente
   física da loja. Diluir o único item distintivo da trilha física, numa loja onde a trilha física já é a
   suspeita de morrer, é empurrar o risco na direção errada.

**Contra-argumento honesto, registrado (não é ação desta story):** com `max`, a Borracha do inimigo também
aumenta o quique dele contra você. Se a Fase 2 mostrar que a trilha física está forte demais, a alavanca é
trocar `max` por `√(ea·eb)` — uma linha em `physics.ts`. Não implementar isso agora; é parâmetro reversível
registrado para decisão futura de produto, não desta story.

### Casos de borda decididos (fonte: `architecture.md` §2.3)

| Caso | Regra | Por quê |
|---|---|---|
| Bola × parede da arena | `b.stat.restWall`, sem mixing | Parede não é corpo, não tem stat |
| Bola × zone-wall (Muralha do Golem) | `b.stat.restWall`, sem mixing | v1. A Muralha **poderia** ter restituição própria (`Zone.restitution`) e virar identidade do Golem — registrado como espaço de design não usado, não implementar agora |
| Borracha afeta `restBall` só, ou os dois? | Os dois, com o mesmo bônus | "Quicar na parede" é a metade legível do efeito — mas isto é trabalho do passo 8 (agregação de item), fora do escopo desta story |
| `restWall` estourando o clamp | Clamp em 0.92 morde antes do ΣMAX | Intencional — não é bug se acontecer quando itens existirem |

### Onde mexer

`src/sim/types.ts` (CharDef), `src/sim/world.ts` (`makeBall`), `src/sim/physics.ts` (as três funções).

### Testing

- `npm run check` — 0 erros.
- `npm run sim:check` — golden hash idêntico ao baseline de `debt.0`, autoconsistência 40/40.
- Verificação manual: `grep -n "REST_BALL\|REST_WALL" src/sim/physics.ts` deve retornar vazio ao final.

### Contribuição para o Anexo B

Resolve **C2** (parte da Borracha) do PRD. Fecha mais um dos 8 itens do design com ponto de aplicação
nomeado e lido (**A-5**).

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-28 | 1.0 | Story criada a partir de `architecture.md` §2.1, §2.2, §2.3 e §6.1 (passo 5) | River (@sm) |
| 2026-07-28 | 1.1 | Implementada. Status: Ready → InProgress → InReview. Todos os ACs verificados, incluindo a identidade `Math.max(0.65,0.65)===0.65`. As duas ocorrências de `REST_WALL` em `collideZoneWalls` que o @po sinalizou (v1.0.1) foram ambas migradas. `CharDef.restBall?`/`restWall?` criados nesta story (adiados desde `debt.1`). Regra de combinação `Math.max`, sem mixing em parede/zona, conforme `architecture.md` §2.2/§2.3. | @dev |
| 2026-07-28 | 1.2 | **Gate CONCERNS** — Status: InReview → Done. Os 9 ACs PASS, verificados de forma independente (nada aceito da Debug Log). Regra MÁXIMO **provada por medição** com `restBall` 0.5 vs 0.9 → `e = 0.9000000000`, descartando média/produto/geométrica/mínimo; paredes e zone-wall medidas sem mixing; override e fallback de `CharDef` verificados no valor. Uma ressalva LOW (QA-001): a reordenação do spread em `makeBall` mudou a ordem de chaves de `Ball.base`, que deixou de bater com `STAT_KEYS`/`makeStatBlock` — inerte (delta 0,66%, ruído), corrigível de graça. Gate: `docs/qa/gates/debt.5-restitution-per-body.yml` | Quinn (@qa) |
| 2026-07-28 | 1.3 | **QA-001 corrigido**, exatamente como sugerido: os 6 campos do `CharDef` explícitos primeiro, `...DEFAULT_STATS` depois (nasce na ordem `restBall,restWall,dmg,...` — exatamente a cauda de `STAT_KEYS`), e os overrides de `restBall`/`restWall` por último, atualizando o valor de uma chave já inserida pelo spread sem reordenar. Verificado por execução direta: `Object.keys(ball.base)` agora idêntico a `STAT_KEYS`, byte a byte na mesma ordem que `stat`/`bonusPassive`/`bonusItem`. `tsc` limpo, `sim:check` verde (golden hash + build coverage). | @dev |
| 2026-07-28 | 1.0.1 | Validated GO (9/10) — Status: Draft → Ready. Referências de `physics.ts` conferidas: `REST_BALL` em `:4` e `:59`; `REST_WALL` em `:5`, `:78`, `:81`, `:85`, `:88`, `:120` **e `:121`**. A Task 5 cita só a linha 120 — são **duas** ocorrências em `collideZoneWalls`; migrar só uma deixa a outra órfã (o `tsc` pega, porque a Task 2 remove a constante, mas vale ajustar a task para não depender disso). Decisão "máximo" (AC 7) rastreada até §2.2 e o contra-argumento fica corretamente registrado como parâmetro reversível, não como ação. | @po |

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

$ grep -n "REST_BALL\|REST_WALL" src/sim/physics.ts
(vazio)

$ node -e "console.log(Math.max(0.65, 0.65) === 0.65)"
true
```

### Completion Notes List

- **A ressalva do @po sobre `collideZoneWalls` ter DUAS ocorrências de `REST_WALL`**
  (linhas 122 e 123, não só uma como a Task 5 original citava) foi confirmada e as duas
  migradas — `b.vx -=` e `b.vy -=`, ambas para `b.stat.restWall`.
- **`CharDef.restBall?`/`restWall?` criados nesta story** (a `debt.1` havia deixado como
  opção adiável, e adiou). `base.restBall`/`restWall` em `makeBall` usam `def.restBall ??
  DEFAULT_STATS.restBall` — reordenei o objeto literal para o spread de `DEFAULT_STATS`
  vir primeiro e os campos explícitos (incluindo os dois novos) por cima, em vez de
  manter os dois grupos separados como antes; mais direto que misturar spread-depois com
  override condicional.
- **Regra de combinação implementada exatamente como `architecture.md` §2.2 manda:
  `Math.max`, não média nem produto.** O comentário no código nomeia a razão (item não
  pode depender da build do inimigo) para quem só ler `collideBalls` sem abrir a
  arquitetura entender por que não é a escolha "mais justa" aparente.
- **Bola × parede e bola × zone-wall usam `b.stat.restWall` sem mixing**, como as duas
  linhas da tabela de casos de borda exigem — parede e zona não têm stat próprio.
- Golden hash idêntico prova, por construção, que o clamp de `recomputeStats` (ΣMIN=−0.60,
  ΣMAX=+0.45, absoluto [0.05, 0.92]) não morde com os valores atuais (0.65/0.72,
  bônus sempre zero) — se mordesse, o valor mudaria e o hash divergiria.

### File List

| Arquivo | Mudança |
|---|---|
| `src/sim/types.ts` | `CharDef` ganha `restBall?`/`restWall?` opcionais |
| `src/sim/world.ts` | `makeBall`: `base.restBall`/`restWall` com fallback para `DEFAULT_STATS` |
| `src/sim/physics.ts` | Constantes de módulo removidas; `collideBalls` (regra máximo), `collideWalls` (×4) e `collideZoneWalls` (×2) migrados para `stat.restBall`/`stat.restWall` |

Nenhum personagem em `src/chars/` foi tocado — nenhum do roster atual declara restituição
própria, então não há o que migrar ali.

## QA Results

**Gate: CONCERNS** — Status `InReview` → `Done`. Revisor: Quinn (@qa) · 2026-07-28 · working tree sobre
`4c2e458`. Gate: `docs/qa/gates/debt.5-restitution-per-body.yml`.

### Verificação executada (nada aceito da Debug Log)

| # | Verificação | Método | Resultado |
|---|---|---|---|
| 1 | Diff completo | `git diff` dos 3 arquivos | 25 inserções, 14 remoções. Nenhum import novo, nenhuma mudança fora do escopo |
| 2 | AC 1 | `npm run check` reexecutado | 0 erros |
| 3 | AC 2/3 | `npm run sim:check` reexecutado | determinismo ✓ · **golden hash ✓ 5 seeds** · **build coverage ✓ 5 variantes** |
| 4 | Integridade do critério | `git status` | `src/tools/determinism.ts` **não modificado** — BASELINE e tabela de cobertura intactas |
| 5 | AC 3 — identidade | `Math.max(0.65,0.65)===0.65` | `true`, reproduzido |
| 6 | AC 6 | grep `REST_BALL\|REST_WALL` em todo `src/` | **zero** ocorrências, nem em comentário |
| 7 | AC 4 | grep `Math.random`/DOM/`chars`,`bot`,`client` em `src/sim/` | só a nota de `rng.ts`. Limpo |
| 8 | AC 9 | leitura de `stats.ts` | restBall/restWall estão em STAT_KEYS, ΣMIN/ΣMAX (−0.60/+0.45) e ABS [0.05, 0.92]; `recomputeStats` itera STAT_KEYS ⇒ passam pelo clamp |

### A regra de combinação, medida (o roster não a exercita)

Harness temporário no scratchpad (working tree jamais tocada) com `CharDef` clonado: golem `restBall` 0.5,
vex 0.9, colisão frontal controlada, `e` recuperado da variação de velocidade e das massas reais.

| Candidata | Valor | Bate? |
|---|---|---|
| **máximo** | **0.9000000000** | **✓ é esta** |
| média | 0.7000000000 | não |
| produto | 0.4500000000 | não |
| geométrica | 0.6708203932 | não |
| mínimo | 0.5000000000 | não |

Repetido com os valores invertidos (golem 0.9, vex 0.5): `e = 0.9` de novo — a regra é simétrica, não é
"usa o do primeiro corpo".

**Paredes sem mixing, também medido:** duas bolas com `restWall` 0.11 e 0.9 no mesmo passo →
`collideWalls` devolveu 11 e 90 sobre v=−100; `collideZoneWalls` (com segmento injetado) devolveu −11 e
−90. Cada corpo com o próprio fator, zero combinação. As **duas** ocorrências que o @po sinalizou na
v1.0.1 (`physics.ts:128-129`) estão ambas migradas.

**`CharDef` override e fallback:** `restBall: 0.5`/`restWall: 0.11` declarados → `base` e `stat` valem
0.5/0.11 (o `??` não engole o valor). Override parcial funciona (só `restBall` → 0.9/0.72). Com os
CharDefs reais (nenhum dos 2 declara restituição), `base` = 0.65/0.72 exatos — nunca `undefined`, nunca
`NaN`. A reordenação do spread não regride os 6 stats do CharDef (`base.maxHp` = 190 = `def.maxHp`):
`DEFAULT_STATS` é um `Pick` de 8 chaves disjuntas.

### QA-001 · LOW · o refactor não pedido mudou a forma de `Ball.base`

Mover `...DEFAULT_STATS` para o topo do literal era **necessário** — com o spread no fim, a linha
`restBall: def.restBall ?? ...` seria sobrescrita pelo default e o override do CharDef nunca funcionaria.
O @dev viu o problema certo. Mas era a única das duas soluções que muda a **ordem de inserção de chaves**:

```
STAT_KEYS  : maxHp,radius,mass,maxSpeed,steer,drag,restBall,restWall,dmg,...
base ANTES : maxHp,radius,mass,maxSpeed,steer,drag,restBall,restWall,dmg,...   (idêntica)
base AGORA : restBall,restWall,dmg,...,knockbackTaken,maxHp,radius,...,drag    (diferente)
```

`base` deixou de compartilhar a forma de `stat`/`bonusPassive`/`bonusItem`, contrariando o que
`stats.ts:71` declara em voz alta ("as 14 chaves em forma fixa — mesma hidden class no V8") num objeto
lido chave a chave por `recomputeStats` a cada bola a cada tick. **Medido:** microbenchmark com as duas
ordens, 4M chamadas × 2 rodadas alternadas → delta 0,66%, dentro do ruído. Não custa nada hoje; o defeito
é a deriva silenciosa entre intenção documentada e código.

Correção de custo zero: deixar `...DEFAULT_STATS` depois dos 6 campos do CharDef (como era) e pôr as duas
linhas `restBall`/`restWall` como as **últimas** do literal — reatribuir chave existente não muda a
posição dela, então a ordem volta a bater e o override continua vencendo. Alternativa igualmente válida:
manter como está e atualizar o comentário de `stats.ts:71`.

### Registrado, sem ação nesta story

- **ARCH-001 (low):** a regra MÁXIMO não tem cobertura versionada. Com `restBall` igual nos dois corpos,
  máximo, mínimo, média e geométrica devolvem todas 0.65 — o golden hash só flagraria a troca por
  *produto*. Ele prova que o comportamento não mudou, não prova **qual** regra foi escrita. A prova está
  no harness deste gate, que não fica versionado. Fechar no passo 8 (itens), quando a regra ficar viva.
- **PROC-001 (low):** as 6 Tasks / 13 subtasks continuam `[ ]` desmarcadas. O @qa não tem autoridade
  para marcá-las.

Working tree pós-gate idêntica à pré: só os 3 arquivos de `src/` da story, zero arquivos novos no
repositório (todos os experimentos rodaram no scratchpad, importando `src/` por `file://`).
