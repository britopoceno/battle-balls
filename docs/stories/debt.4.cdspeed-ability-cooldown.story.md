# Story debt.4: `cdSpeed` no `castCommand` — resolve C2 (Relicário)

## Status

Ready

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: ["npm run check", "npm run sim:check"]
```

## Story

**Como** desenvolvedor executando o passo 4 da migração de stats — resolve **C2** para o item Relicário
(`docs/prd.md` §4: "−cooldown" sem ponto de aplicação),
**eu quero** aplicar `stat.cdSpeed` no cálculo de `abilityReadyAt` dentro de `castCommand`, com um piso
absoluto de motor `MIN_ABILITY_CD_MS`,
**para que** o cooldown de habilidade tenha um ponto de aplicação real — sem permitir que ele chegue perto de
zero e reabra, indefinidamente, uma janela de dano por contato.

## Depende de

`debt.3` (Done) — `stat.cdSpeed` já existe desde `debt.1` (campo com base neutra 1.0 em `DEFAULT_STATS`),
mas esta story assume que a estrutura de stats já está totalmente migrada (sem `mods` residual) para não
misturar dois modelos de leitura no mesmo arquivo (`world.ts`).

## Acceptance Criteria

1. `npm run check` (`tsc --noEmit`) verde.
2. `npm run sim:check` verde (autoconsistência 40/40 + baseline).
3. Golden hash **idêntico** ao baseline de `architecture.md` §6.0 (seeds 1, 2, 3, 7, 11). Verificado por
   identidade numérica: `7000 / 1.0 === 7000` (divisão por 1.0 é exata em IEEE 754) — com `cdSpeed` default
   1.0, nenhum cooldown muda de valor.
4. `sim/` continua puro: sem `Math.random`, sem DOM, sem I/O, sem importar de `chars/`, `bot/`, `client/`.
5. `castCommand` (`world.ts:316`) calcula `self.abilityReadyAt` como
   `world.time + Math.max(MIN_ABILITY_CD_MS, ab.cd / self.stat.cdSpeed)` — não mais `world.time + ab.cd`.
6. Constante `MIN_ABILITY_CD_MS = 400` (ms) existe como constante nomeada.
7. **Escopo negativo, explícito**: `cdSpeed` **não** é aplicado em `AtkDef.cd` (ataque básico — esse
   continua governado só por `atkSpeed`, já existente) nem no `cast` da ult (a ult não recebe CDR — é
   balanceada por regra de carga variável por personagem, decisão #10; o campo `ultChargeRate` fica
   **nomeado e não implementado**, para o dia em que alguém quiser).
8. `abilityReadyAt` continua sendo um **instante absoluto**, fixado no momento do cast — uma mudança de
   `cdSpeed` no meio de um cooldown em andamento **não o encolhe retroativamente**. Isto já é verdade por
   construção (o campo não é recalculado depois de escrito); esta story não precisa adicionar código para
   isso, só não regredir a propriedade.

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type**: Architecture
**Secondary Type(s)**: —
**Complexity**: Low — uma linha de fórmula, uma constante nova

### Specialized Agent Assignment

**Primary Agents**:
- @dev
- @architect (validação do piso `MIN_ABILITY_CD_MS = 400` e da fronteira de escopo)

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
- Escopo: confirmar que `cdSpeed` não vaza para `AtkDef.cd` nem para o cast da ult
- Precisão numérica: `Math.max(MIN_ABILITY_CD_MS, ab.cd / self.stat.cdSpeed)`, não `Math.min` (erro fácil de inverter)

**Secondary Focus**:
- Nomeação clara da constante `MIN_ABILITY_CD_MS`, com o valor 400 rastreável até a justificativa em Dev Notes

## Tasks / Subtasks

- [ ] Task 1 — Adicionar `MIN_ABILITY_CD_MS` (AC: 6)
  - [ ] Constante nomeada, valor `400` (ms), próxima às demais constantes de `world.ts` (`TICK_HZ`,
    `SUDDEN_DEATH_MS`, `MAX_SLOW`) ou em `sim/stats.ts`, à escolha do @dev — não prescrito pela arquitetura

- [ ] Task 2 — Aplicar `cdSpeed` em `castCommand` (AC: 5)
  - [ ] `world.ts:316`: `self.abilityReadyAt = world.time + ab.cd` → `self.abilityReadyAt = world.time +
    Math.max(MIN_ABILITY_CD_MS, ab.cd / self.stat.cdSpeed)`

- [ ] Task 3 — Confirmar a fronteira de escopo (AC: 7)
  - [ ] Revisar `autoAttack` (`world.ts:341-398`) e confirmar que `atkReadyAt` continua calculado só com
    `atkSpeed` (já migrado em `debt.2`), sem `cdSpeed`
  - [ ] Revisar `castCommand`, ramo `slot === 'ult'` (`world.ts:320-326`), e confirmar que nenhuma leitura de
    `cdSpeed` foi introduzida ali

- [ ] Task 4 — Verificação (AC: 1, 2, 3, 4)
  - [ ] `npm run check` — 0 erros
  - [ ] `npm run sim:check` — golden hash idêntico ao baseline, autoconsistência 40/40

## Dev Notes

### Onde entra o multiplicador (fonte: `architecture.md` §3.1, literal)

```
antes:  self.abilityReadyAt = world.time + ab.cd
depois: self.abilityReadyAt = world.time + max(MIN_ABILITY_CD_MS, ab.cd / self.stat.cdSpeed)
```

Com `cdSpeed = 1.0` (default), `ab.cd / 1.0 === ab.cd` exatamente — divisão por 1.0 é exata em IEEE 754,
verificado pelo @architect. O hash não muda.

### Escopo — o que `cdSpeed` NÃO toca (fonte: `architecture.md` §3.2)

| Recurso | Governado por | Motivo |
|---|---|---|
| Ativa (`AbilityDef.cd`) | **`cdSpeed`** | É o alvo do Relicário |
| Ataque básico (`AtkDef.cd`) | `atkSpeed` (já existe, `world.ts:360`, migrado em `debt.2`) | Dois campos separados, dois itens separados. Se fossem um só, Lâmina e Relicário competiriam pelo mesmo teto |
| Ult | **nada** | A ult é balanceada por regra de carga variável por personagem (decisão #10). CDR sobre ela seria um segundo eixo sobre um recurso que já tem regra própria. `ultChargeRate` fica nomeado e não implementado |

### Por que dois mecanismos impedem o cooldown de chegar a zero (fonte: `architecture.md` §3.3)

**Mecanismo 1 — teto de balanceamento (D-04).** `ΣMAX[cdSpeed] = +1.00` (já em `sim/stats.ts` desde
`debt.1`) ⇒ `cdSpeed ≤ 2.0` ⇒ o cooldown nunca desce abaixo de 50% do base. Regra de jogo, mexível por
decisão de produto.

**Mecanismo 2 — piso absoluto de motor: `MIN_ABILITY_CD_MS = 400`.** Não é redundante com o mecanismo 1:

> A maior **janela de dano por contato** declarada no roster é a do dash do Golem: **450 ms**
> (`golem.ts:52`). Se o cooldown efetivo de uma habilidade descesse abaixo da janela que ela abre, o jogador
> poderia recastar antes de a janela anterior fechar, a janela seria reaberta indefinidamente, e **o dano por
> contato viraria permanente** — quebrando D-07 por dentro.

Isso gera uma invariante testável que liga esta story a `debt.6`:

```
para todo personagem C, para toda janela W declarada em C.contactWindows:
    cd_efetivo_mínimo(fonte de W)  ≥  W.ms
onde  cd_efetivo_mínimo(a) = max(MIN_ABILITY_CD_MS, a.cd / cdSpeedMax)
```

**Esta invariante completa só pode ser implementada como teste automatizado em `debt.6`**, porque
`contactWindows` (o campo `CharDef.contactWindows`) ainda não existe nesta story — ele é criado em `debt.6`.
Nesta story (`debt.4`), o que existe e é verificável é só a metade da fórmula: `cd_efetivo_mínimo(a) =
max(MIN_ABILITY_CD_MS, a.cd / cdSpeedMax)`, aplicada à habilidade em si, sem ainda cruzar contra nenhuma
janela declarada. Não tentar antecipar o teste completo aqui — ele pertence a `debt.6` (camada 3 da auditoria
descrita em `architecture.md` §4.3, item A2).

Estado atual, para referência (não precisa ser testado ainda, é o número que `debt.6` vai validar
formalmente): Golem `sismico` → `max(400, 7000/2) = 3500 ms ≥ 450 ms` ✓ (fator 7,8 de folga). Os outros
cooldowns do roster (`tremor` 4000, `lamina` 3000, `deslize` 2500) são ainda mais folgados.

### CDR é amostrado no instante do cast (fonte: `architecture.md` §3.4)

`abilityReadyAt` é um instante absoluto, fixado quando o cast acontece. Se uma passiva ligar CDR no meio do
cooldown, o cooldown em curso **não encolhe**. Isso é intencional — a alternativa (guardar `castAt` + `cd` e
comparar contra o `stat` corrente) permitiria CDR dinâmico, mas abriria a porta para o cooldown encolher
retroativamente e ficar pronto no mesmo tick em que a passiva liga (exploit de ligar/desligar). Como itens
são comprados entre rodadas e a bola é recriada, a limitação não custa nada hoje. **Não "consertar" isso** —
é comportamento decidido, não uma lacuna.

### Onde mexer

`src/sim/world.ts` — função `castCommand`, e a constante nova (posição à escolha do @dev).

### Testing

- `npm run check` — 0 erros.
- `npm run sim:check` — golden hash idêntico ao baseline de `debt.0`, autoconsistência 40/40.
- Verificação manual: como nenhum personagem do roster hoje tem `cdSpeed` diferente de 1.0 (nenhum bônus de
  item ainda existe — isso é a Fase 3, passo 8, fora deste épico), não há cenário de teste que exercite o
  piso de 400ms na prática ainda. A invariante completa (`cd_efetivo_mínimo ≥ janela declarada`) é
  responsabilidade de `debt.6`.

### Contribuição para o Anexo B

Resolve **C2** (parte do Relicário) do PRD. Avança **A-9** (mais um teto com constante nomeada, agora usado
de fato). A validação plena da invariante de `debt.6` (item A2 da camada 3 de auditoria) depende desta story
estar `Done`.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-28 | 1.0 | Story criada a partir de `architecture.md` §3.1, §3.2, §3.3, §3.4 e §6.1 (passo 4) | River (@sm) |
| 2026-07-28 | 1.0.1 | Validated GO (9/10) — Status: Draft → Ready. `world.ts:316` (`self.abilityReadyAt = world.time + ab.cd`) conferido no código, exato. Escopo negativo (AC 7) bem delimitado e verificável. Correção de fato herdada de `architecture.md` §3.3 e repetida em Dev Notes: "os outros cooldowns do roster (`tremor` 4000, `lamina` 3000, `deslize` 2500)" — esses **não** são os cooldowns, são os cd efetivos mínimos (`cd / cdSpeedMax`, com `cdSpeedMax = 2.0`). Os `cd` reais no código são `tremor` 8000 (`golem.ts:59`), `lamina` 6000 (`vex.ts:50`), `deslize` 5000 (`vex.ts:74`). A conclusão ("todos folgados") continua válida — e com mais folga. Nenhum desses números vira código nesta story; a fórmula de `debt.6` (A2) os recalcula do `CharDef`. | @po |

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
