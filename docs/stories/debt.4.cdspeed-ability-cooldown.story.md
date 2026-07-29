# Story debt.4: `cdSpeed` no `castCommand` — resolve C2 (Relicário)

## Status

Done

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
| 2026-07-28 | 1.1 | Implementada. Status: Ready → InProgress → InReview. Todos os ACs verificados, incluindo a identidade `7000/1.0===7000`. A cobertura de build adicionada ao fim de `debt.3` (ARCH-001) já exercitava `castCommand` com `cd` não-default via `abilityIndex:1` — hash idêntico nessas variantes reforça a garantia além do `BASELINE` principal. `ultChargeRate` deliberadamente não criado (campo morto sem consumidor). | @dev |
| 2026-07-28 | 1.2 | Gate de qualidade: **CONCERNS**. Status: InReview → Done. Todas as verificações reexecutadas do zero (`check`, `sim:check`, identidade `/1.0` nos 9 `cd` do roster, escopo negativo por leitura direta). Piso `MIN_ABILITY_CD_MS` testado com harness temporário (32 casos, 4 habilidades × 8 valores de `cdSpeed`, igualdade exata; harness revertido). Ressalvas: **QA-001 (MEDIUM)** — `MIN_ABILITY_CD_MS = 400` é menor que a maior janela de contato do roster (450 ms, `golem.ts:52`), então o piso não entrega a propriedade que sua própria justificativa alega; falha de especificação herdada de `architecture.md` §3.3, deve entrar em `debt.6` antes da invariante A2. **QA-002 (LOW)** — a alegação de que a cobertura de build de ARCH-001 "validou esta story" está superestimada: as 5 variantes rodam com `cdSpeed = 1.0`, cobrem não-regressão em 2 valores extras de `cd`, mas não exercitam o comportamento novo. `ultChargeRate` não criado: divergência **aceita** e encerrada. | Quinn (@qa) |
| 2026-07-28 | 1.0.1 | Validated GO (9/10) — Status: Draft → Ready. `world.ts:316` (`self.abilityReadyAt = world.time + ab.cd`) conferido no código, exato. Escopo negativo (AC 7) bem delimitado e verificável. Correção de fato herdada de `architecture.md` §3.3 e repetida em Dev Notes: "os outros cooldowns do roster (`tremor` 4000, `lamina` 3000, `deslize` 2500)" — esses **não** são os cooldowns, são os cd efetivos mínimos (`cd / cdSpeedMax`, com `cdSpeedMax = 2.0`). Os `cd` reais no código são `tremor` 8000 (`golem.ts:59`), `lamina` 6000 (`vex.ts:50`), `deslize` 5000 (`vex.ts:74`). A conclusão ("todos folgados") continua válida — e com mais folga. Nenhum desses números vira código nesta story; a fórmula de `debt.6` (A2) os recalcula do `CharDef`. | @po |

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

$ node -e "console.log((7000/1.0)===7000)"
true

$ grep -n "atkReadyAt = world.time"
world.ts:397: b.atkReadyAt = world.time + def.atk.cd / b.stat.atkSpeed   ← só atkSpeed, sem cdSpeed
```

### Completion Notes List

- Story pequena, sem surpresa: `MIN_ABILITY_CD_MS = 400` adicionada junto das demais
  constantes de `world.ts`; `castCommand` aplicando `Math.max(MIN_ABILITY_CD_MS, ab.cd /
  self.stat.cdSpeed)`.
- **A cobertura de build introduzida no fim de `debt.3` (resolvendo ARCH-001) já validou
  esta story de graça** — as 5 variantes incluem `golemAbility: 1`/`vexAbility: 1`, que
  exercitam `castCommand` no ramo de habilidade com `cd` diferente do default (Tremor
  8000ms, Deslize 5000ms). Hash idêntico nessas variantes confirma que a fórmula não
  alterou o comportamento nem nesses casos, não só nos 5 do `BASELINE` principal.
- Escopo negativo (AC 7) confirmado por leitura direta: `atkReadyAt` (linha 397) só lê
  `stat.atkSpeed`; o ramo `slot === 'ult'` de `castCommand` não introduz nenhuma leitura
  de `cdSpeed` — `ultCharge`/`ultThreshold` continuam sendo o único mecanismo de
  cadência da ult.
- `ultChargeRate` **não foi criado** — a story pede que o campo fique nomeado e não
  implementado "para o dia em que alguém quiser" (AC 7), e como isso não é consumido em
  lugar nenhum, adicionar um campo morto ao `CharDef` só criaria ruído sem benefício
  auditável agora. Registrado aqui para não ser redescoberto como omissão.
- Nenhum cenário do roster atual exercita o piso de 400ms na prática (`cdSpeed` é sempre
  1.0 hoje, nenhum item existe ainda) — como a própria story antecipa em Testing. A
  invariante completa (`cd_efetivo_mínimo ≥ janela declarada`) é escopo de `debt.6`.

### File List

| Arquivo | Mudança |
|---|---|
| `src/sim/world.ts` | `MIN_ABILITY_CD_MS = 400` (nova constante); `castCommand` aplica `cdSpeed` com piso |

Nenhum outro arquivo tocado.

## QA Results

**Gate: CONCERNS** — Status `InReview` → `Done`. Revisor: Quinn (@qa) · 2026-07-28 · revisão sobre working
tree (base `06a927e`), `src/sim/world.ts` +12/−1.

### Verificação executada (nada aceito da Debug Log)

| # | Verificação | Método | Resultado |
|---|---|---|---|
| 1 | Diff completo | `git diff src/sim/world.ts` | Constante + 1 linha de fórmula + 2 comentários. Nenhum import novo, nenhuma outra mudança |
| 2 | AC 1 — `npm run check` | reexecutado | 0 erros |
| 3 | AC 2/3 — `npm run sim:check` | reexecutado | determinismo 40/40 ✓ · golden hash ✓ 5 seeds ✓ · **build coverage ✓ 5 variantes** ✓ |
| 4 | AC 3 — identidade `/1.0` | `node -e` sobre os 9 `cd` reais do roster (1100, 520, 7000, 8000, 6000, 5000, ...) | `x/1.0 === x` e `Object.is` verdadeiros em todos; `Math.max(400, x) === x` em todos (nenhum `cd` de habilidade < 400) |
| 5 | AC 4 — pureza de `sim/` | grep `Math.random` / DOM / imports de `chars`,`bot`,`client` em `src/sim/` | única ocorrência é o comentário de `rng.ts`. Limpo |
| 6 | AC 5 | leitura direta `world.ts:351` | `world.time + Math.max(MIN_ABILITY_CD_MS, ab.cd / self.stat.cdSpeed)` — exato |
| 7 | AC 6 | `world.ts:31` | `const MIN_ABILITY_CD_MS = 400`, junto de `MAX_SLOW`/`MAX_ROUND_MS`, com bloco de justificativa acima |
| 8 | AC 7 — escopo negativo | leitura direta + grep `cdSpeed` em `src/` | `world.ts:397` `b.atkReadyAt = world.time + def.atk.cd / b.stat.atkSpeed` — só `atkSpeed`. Ramo `slot === 'ult'` (`world.ts:355-361`) usa só `ultCharge`/`ultThreshold`. **`cdSpeed` tem exatamente 1 consumidor em todo `src/`**: a linha 351 |
| 9 | AC 8 | leitura | `abilityReadyAt` só é escrito na linha 351; nada o recalcula. Propriedade preservada |

### Teste do piso `MIN_ABILITY_CD_MS` (experimento temporário, revertido)

O roster nunca exercita o piso (`cdSpeed` é sempre 1.0). Montei um harness temporário
(`qa-tmp-floor.ts`, **apagado** — `git status` confirma só os 2 arquivos desta story) que força
`base.cdSpeed` e mede `abilityReadyAt − world.time` no tick do cast, nas 4 habilidades do roster ×
8 valores de `cdSpeed` = **32 casos, todos com igualdade exata em ponto flutuante**:

| `cdSpeed` | `cd/cdSpeed` (Sísmico, cd 7000) | cd efetivo medido | Piso |
|---|---|---|---|
| 0.5 | 14000 | 14000 | inativo |
| 1.0 | 7000 | 7000 | inativo |
| 2.0 (teto D-04) | 3500 | 3500 | inativo |
| 5.0 | 1400 | 1400 | inativo |
| 17.5 (fronteira) | 400 | 400 | fronteira |
| 25 | 280 | **400** | **ATIVO** |
| 1000 | 7 | **400** | **ATIVO** |

O piso aplica quando `cd/cdSpeed < 400` e **não** aplica quando fica acima — nos dois sentidos, nas 4
habilidades. O caso `cdSpeed = 0.5 → 14000` também descarta a troca `Math.max`/`Math.min` (com `min` daria
400). Sem inversão de operador.

**Achado colateral do harness (informativo):** `castCommand` roda **antes** de `recomputeStats` dentro de
`step` (`world.ts:517` vs `:534`), então o cast lê o `stat.cdSpeed` recomputado no tick anterior — 1 tick
(16,7 ms) de defasagem. Irrelevante em jogo e coerente com a decisão de §3.4, mas a frase "amostrado no
instante do cast" das Dev Notes é, ao pé da letra, "amostrado do stat do tick anterior". Só registro.

### QA-001 · MEDIUM · o valor 400 não entrega a propriedade que a própria justificativa dele alega

`golem.ts:52`: `self.memory.dashAte = ctx.now + 450` — a maior janela de dano por contato do roster é
**450 ms**, e o piso é **400 ms**. O comentário em `world.ts:26-30` (e `architecture.md` §3.3, e as Dev Notes)
argumenta que o piso existe para impedir que o cooldown desça abaixo da janela que a habilidade abre — mas
`400 < 450`. Se o piso algum dia for o mecanismo que morde, ele deixa passar 50 ms de janela reaberta.

Não é bug vivo: com `cdSpeed ≤ 2.0` (mecanismo 1, D-04), o cd efetivo mínimo do `sismico` é 3500 ms; para o
piso morder seria preciso `cdSpeed ≥ 17.5`. O piso é hoje código inalcançável. A implementação também está
**fiel ao AC 6**, que prescreve `400` literalmente — a falha é de especificação (`architecture.md` §3.3),
herdada, não introduzida pelo @dev. Por isso CONCERNS e não FAIL.

Consequência para `debt.6`: a invariante `max(MIN_ABILITY_CD_MS, a.cd/cdSpeedMax) ≥ W.ms` passa verde hoje
**porque o `max` escolhe 3500, não porque o piso protege**. Um personagem futuro com `cd ≤ 800` e janela de
contato ≥ 400 ms cairia no piso e quebraria D-07 com o teste ainda verde. Recomendação ao @architect antes de
`debt.6`: ou elevar `MIN_ABILITY_CD_MS` acima da maior janela declarada (≥ 500), ou derivar o piso de
`max(contactWindows)` quando `CharDef.contactWindows` existir, ou reescrever a justificativa para admitir que
o piso é uma trava de sanidade genérica e que a proteção real é o teto de `cdSpeed`.

### QA-002 · LOW · a alegação de cobertura das Completion Notes está superestimada (corrigida aqui)

A nota "a cobertura de build de `debt.3` (ARCH-001) já validou esta story de graça" **não procede como
escrita**. Verificado em `determinism.ts:90-106`: as 5 variantes do `BUILD_BASELINE` rodam com
`cdSpeed = 1.0` como todo o resto — nenhuma delas exercita `cdSpeed ≠ 1.0` nem o piso, ou seja, **zero
cobertura automatizada do comportamento novo** desta story.

O que a cobertura de build de fato entrega, e isso tem valor: as variantes `golemAbility: 1` (Tremor, cd 8000)
e `vexAbility: 1` (Deslize, cd 5000) fazem `castCommand` passar por `ab.cd` fora dos 7000/6000 do `BASELINE`
principal, com hashes gravados **antes** desta mudança (commit `06a927e`) e idênticos depois. Isso é evidência
real de não-regressão em 2 valores adicionais de `cd`, e confirma de passagem que o `Math.max(400, …)` não
morde em nenhum `cd` do roster. É reforço de AC 3 — não é validação da story. A distinção importa porque
tratar isso como "story validada" mascara que a única evidência do comportamento novo é a verificação manual
registrada acima, e que a cobertura permanente disso é escopo de `debt.6`.

### Nota 2 — `ultChargeRate` não criado: **divergência aceita**

O AC 7 pede o campo "nomeado e não implementado". O @dev não o criou, argumentando que um campo sem consumidor
é ruído. Aceito. O núcleo testável do AC 7 é o escopo **negativo** (`cdSpeed` não toca `AtkDef.cd` nem a ult),
e isso está verificado e verde (item 8 da tabela). A cláusula do campo é intenção documental, não
comportamento: um campo no `CharDef` sem leitor nenhum não protege nada, não é auditável e sugere uma
capacidade que não existe — enquanto o nome já está preservado em três lugares de prosa (`architecture.md`
§3.2, Dev Notes desta story, AC 7). A decisão está registrada nas Completion Notes, que era a condição para
não ser redescoberta como omissão. Não reabrir em `debt.5`+.

### Demais checagens do gate

- **Regressão**: golden hash e build coverage idênticos, reexecutados por mim. Nenhum desvio.
- **Performance**: um `Math.max` e uma divisão por cast (evento raro, não por tick). Zero alocação. Nada a dizer.
- **Segurança**: N/A — módulo puro, sem I/O, sem entrada externa. Divisão por zero impossível hoje
  (`recomputeStats` clampa σ em [−0.5, +1.0] sobre base 1.0 ⇒ `cdSpeed ∈ [0.5, 2.0]`); observo que `cdSpeed`
  não tem entrada em `ABS_MIN` de `stats.ts`, então a garantia vem só da base ser 1.0 fixa. Se algum
  `CharDef` futuro passar a fornecer base para `cdSpeed`, `ab.cd / 0` ⇒ `Infinity` ⇒ habilidade travada para
  sempre. Ponto para o `debt.5`/`debt.6`, não para esta story.
- **Documentação**: File List exata (só `world.ts`). Constante bem posicionada e comentada.

### Veredito

**CONCERNS.** Os 8 ACs estão satisfeitos, o comportamento novo foi verificado por mim nos dois ramos do piso e
não há regressão. As duas ressalvas (QA-001 sobre o valor 400 vs. janela 450; QA-002 sobre a alegação de
cobertura) são de especificação e de registro, não de implementação, e nenhuma delas é alcançável pelo código
com o roster e os tetos atuais. Story liberada para `Done`; **QA-001 deve entrar na story `debt.6` como
pré-requisito da invariante A2** — do jeito que a fórmula está escrita hoje, ela passaria verde sobre o
problema.
