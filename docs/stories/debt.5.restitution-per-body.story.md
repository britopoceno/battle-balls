# Story debt.5: Restituição por corpo (`restBall`/`restWall`) — resolve C2 (Borracha)

## Status

Draft

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
