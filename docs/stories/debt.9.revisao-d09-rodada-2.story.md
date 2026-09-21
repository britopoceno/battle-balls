# Story debt.9: Revisão de D-09, rodada 2 — condicionada à re-adjudicação do Risco #1b e a uma amostra 100% ×6.0 (E37-FUP-001)

## Status

Draft

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run check", "npm run sim:check (hash idêntico esperado — preço/economia não tocam sim/)", "revisão manual: as duas pré-condições bloqueantes estavam de fato satisfeitas ANTES de qualquer número ser tocado, e cada número revisado cita o dado de telemetria correspondente"]
```

## Story

**Como** desenvolvedor reabrindo o passo 7 da Fase 3 (`docs/architecture-e3.md` §12) depois que `e3.7`
encerrou em insuficiência declarada,
**eu quero** revisar os números provisórios de D-09 (preços do catálogo, `ECONOMIA_PROVISORIA`) **somente
depois** que as duas condições que motivaram a insuficiência de `e3.7` estiverem resolvidas — re-adjudicação
formal do Risco #1b e uma amostra de telemetria humana nova, coletada inteiramente no jogo entregue
(`ESCALA_HP = 6.0`) —,
**para que** D-09 saia do estado "provisório para sempre por default" que `E37-FUP-001` apontou, com um
gatilho de reabertura rastreado nesta story em vez de vivo só em prosa.

## Depende de

Esta story está **explicitamente BLOCKED** em duas pré-condições, **nenhuma satisfeita na data de criação**
(2026-08-16). Nem a Task 1 pode começar antes das duas estarem resolvidas — ver AC 1.

**(a) Re-adjudicação formal do Risco #1b por @pm/@architect, com n≥3000.**

Mandato do gate `e3.6` (`docs/qa/gates/e3.6-ajuste-d05-tuning.yml`, achado `REQ-101`, severidade **high**):

> O gatilho do indicador Risco #1b (PRD §6: físico < +2pp E dano > +5pp → "a trilha física nasce morta"), que
> e2.7 fechou como NÃO para os dois personagens, agora lê SIM para OS DOIS [...] @pm/@architect precisam
> re-adjudicar o Risco #1b formalmente (com n≥3000 — o próprio arnês avisa que ±3,46pp de IC em n=800 é
> grosso demais para um gatilho de ±2pp) ANTES de e3.7 mexer em preços de item de item [...]

Confirmado **ainda ABERTO**, e explicitamente listado como bloqueio de D-09, na errata mais recente de
`docs/architecture-e3.md` §14 (bloco "Resolução do usuário, 2026-08-05"):

> **ABERTO, não resolvido — o Risco #1b reabriu de carona** (gate `e3.6`/REQ-101, high): o gatilho do PRD §6
> [...] lê "SIM" para os dois em ×6.0 (golem físico +0,77pp em n=3000; vex −1,53pp, inversão de sinal
> confirmada em duas amostras). Re-adjudicação formal @pm/@architect pendente; **bloqueia o repreço de itens
> de D-09** (`e3.7` manteve os provisórios também por isso).

Sem essa re-adjudicação registrada em artefato citável (ADR, seção de arquitetura emendada, ou gate formal —
não conversa nem suposição), esta story não pode tocar `src/shop/catalogo.ts` nem a magnitude de itens da
trilha física.

**(b) Amostra de telemetria humana nova, coletada INTEIRAMENTE em `ESCALA_HP = 6.0`, com n ≥ 30 compras
humanas.**

A amostra que `e3.7` tinha disponível misturava quatro escalas de jogo (×1.0, ×2.0, ×3.0, ×6.0) — razão #1 da
insuficiência declarada por `e3.7` (Dev Agent Record: "a amostra mede quatro jogos diferentes [...] revisar
preço com dado majoritariamente de um jogo que não existe mais mediria o jogo errado"). Do que existia,
**só duas partidas eram ×6.0** (`docs/evidence/telemetria/README.md`: partidas `992276418` e `670239056`) —
7 rodadas, **3 compras humanas** (`e3.7`, "Corte só ×6.0 (o jogo entregue)"). Esta story exige que TODA a
amostra usada venha do jogo final — nenhuma partida fora de `ESCALA_HP=6.0` entra no cálculo, mesmo que
exista em `docs/evidence/telemetria/`, e a atribuição de escala por partida é **verificada**, não assumida
(o README já registra duas partidas — `734981348` e `21386782` — "sem atribuição de escala", achado
`E37-DOC-004` do gate de `e3.7`; não presumir que sejam ×6.0 sem confirmar).

**Piso a priori de n ≥ 30 compras humanas em ×6.0 — justificativa, não escolha arbitrária (Artigo IV):** a
insuficiência de `e3.7` foi declarada com **n=11** compras humanas totais (misturando 4 escalas) e, olhando
só o jogo final, **n=3** — a própria razão #5 do Dev Agent Record de `e3.7` diz "11 observações não sustentam
revisão de 8 preços + 6 parâmetros de economia". 30 é quase 3× o n=11 que a story anterior já julgou
insuficiente, e ~10× o n=3 que é toda a evidência ×6.0 hoje. Não é um número "redondo" escolhido a dedo — é o
n=11 falho, multiplicado por uma margem que a própria razão #5 pede implicitamente ("mais que o triplo do que
já falhou"). É um **piso**, não um alvo: se a coleta natural render mais, usar mais.

**PERGUNTA ABERTA para o usuário/@pm (registrada pelo @po em 2026-09-21, NÃO decidida): a pré-condição
(b) deve passar a exigir "×6.0 E atraso de input 6"?** Desde `b8e8a41` (`e4.1`, 2026-09-21) o modo local
aplica `ATRASO_ALVO_TICKS = 6` ao cast humano, e antes o atraso era 0. É uma segunda variável de população,
da mesma natureza que a escala de HP que motivou esta pré-condição, e o gate de `e4.1` a registrou como
E41-TEL-002: o arquivo exportado não distingue as duas populações (`versao` continua
`bb.telemetria.v1`, nenhum evento traz o atraso, e o `localStorage` sobrevive a trocas de build). As duas
leituras possíveis:
- **exigir "×6.0 e atraso 6"**: mede o jogo que existe agora. As compras ×6.0 coletadas antes de
  2026-09-21 deixam de contar para o piso de n≥30, e a atribuição de atraso por partida precisa ser
  verificada, não assumida, pela mesma regra de E37-DOC-004 para a escala;
- **aceitar dado misto explicitamente**: vale se o julgamento for que ~100ms de atraso no efeito do cast
  não muda **o que o jogador compra** (esta story mede loja/economia, não mira). Mas precisa ser uma
  decisão escrita, não uma omissão.

A correção durável da telemetria, que marca o atraso no arquivo, está roteada para uma story nova (pedida
ao @sm, ver Change Log de `e4.1` v1.4.0). Até ela existir, a única separação confiável é a manual: exportar
e zerar na fronteira.

**Pré-condição de COLETA da amostra (b) (v1.2, @po; mesma regra R10 que `e4.7` ganhou na v1.3.0): a amostra
humana usada em (b) é coletada DEPOIS dos commits de implementação de `debt.10` e de `debt.11`.** Origem:
validação de `debt.11` (v1.1, commit `3c6ab23`). O AC 13 de lá fixa o mesmo prazo do AC 11 de `debt.10`:
as duas precisam estar concluídas antes da primeira coleta humana usada como evidência desta pré-condição.
- `debt.10` (Done, `3de1cfe`) carimba nos eventos o atraso de input e a escala de HP. Sem o carimbo, a
  atribuição por partida que (b) exige só é possível pela separação manual descrita acima.
- `debt.11` (Ready, **sem commit de implementação em 2026-09-21**) é a guarda automática de que esse
  carimbo continua saindo no export. Sem ela, um export que perdeu o carimbo passa calado. *(v1.3: o
  commit existe, `971686b`, e `debt.11` está Done pelo gate CONCERNS `ca52e07`.)*

**O valor do carimbo é guardado desde `debt.13` (v1.4).** A guarda confere que o carimbo tem o valor das
constantes do build, e não só que existe (commit de implementação `181db27`, Done pelo gate PASS
`f5d4713`, que fecha `DEBT11-TST-001` e `DEBT11-TST-002`). A cláusula provisória da v1.3, que mandava
esperar ou conferir o valor à mão, foi retirada. **A pré-condição de coleta de (b) passa a ser: a amostra
é coletada depois dos commits de implementação de `debt.11` (`971686b`) e de `debt.13` (`181db27`).** Isso
não decide a pergunta aberta acima ("×6.0 **e** atraso 6" ou dado misto). Só garante que o valor gravado
é o do build.

**O que continua valendo, e é onde é fácil tropeçar: o build publicado no GitHub Pages não grava carimbo
nenhum.** Nenhum dos commits de `debt.10` (`3de1cfe`), `debt.11` e `debt.13` está em `origin/master`. O
último push é `44311f6`, de 2026-08-16, anterior a `debt.10`. Uma partida jogada hoje no Pages não traz
`atrasoTicks` nem `escalaHp` em evento nenhum, por mais recente que seja o horário dela, e por isso não
conta para o `n`. Só conta partida de um build que contenha `3de1cfe` ou posterior: um servidor de dev
local, ou o Pages depois que o @devops fizer push. O `sim:check` do commit do build jogado é o que vale
como conferência do carimbo.

Consequência, independente da pergunta aberta acima: as partidas ×6.0 já existentes em
`docs/evidence/telemetria/` (`992276418` e `670239056`, 3 compras humanas) **não contam** para o piso de
n≥30, porque são anteriores aos dois commits. A pergunta aberta **continua não decidida**. A pré-condição de
coleta garante que o atraso de cada evento seja **atribuível**, mas não responde se a amostra precisa ser
"×6.0 e atraso 6" ou se aceita dado misto. Isso segue com o usuário/@pm.

Não depende funcionalmente de `debt.8` (achado independente, sobre a cobertura de regressão do caminho de
empate na simulação) — as duas stories vivem na mesma numeração `debt.*` por serem follow-ups de gate de QA
pós-`e3.6`/`e3.7`, não por ordem de execução entre si.

## Acceptance Criteria

1. **Gate de entrada, BLOQUEANTE.** Antes de qualquer número de D-09 ser tocado, confirmar por evidência
   citável que (a) a re-adjudicação formal do Risco #1b (`REQ-101`) foi **concluída** — não apenas iniciada
   — e (b) existe amostra de telemetria com **n ≥ 30 compras humanas** coletada inteiramente em
   `ESCALA_HP = 6.0` **e inteiramente depois dos commits de implementação de `debt.10` e `debt.11`**
   (pré-condição de coleta, v1.2, ver "Depende de" (b)), e também depois do commit de implementação de
   `debt.13` (`181db27`, v1.4), de um build que contenha `debt.10` (`3de1cfe`) ou posterior. O Pages
   publicado hoje (`44311f6`) não contém. Se **qualquer uma** das duas não estiver satisfeita no momento em que o `@dev` pegar
   esta story, o desfecho legítimo é **declarar insuficiência de novo e não tocar nenhum número** — mesma
   disciplina do AC 3 de `e3.7` ("se a telemetria coletada até este ponto for insuficiente para uma revisão
   responsável, a story deve declarar isso e manter os provisórios como estão, documentando o motivo"). Isso
   não é fracasso da story: é a mesma saída honesta, desta vez com o gatilho de reabertura já registrado
   (ao contrário do que `E37-FUP-001` aponta como ausente em `e3.7`) — se travar de novo, documentar o que
   ainda falta e devolver ao `@sm` para uma rodada 3, em vez de deixar D-09 provisório em silêncio.
2. `npm run check` verde.
3. `npm run sim:check` verde — **hash idêntico esperado** (mesmo raciocínio confirmado por `e3.7`: preços em
   `catalogo.ts` e parâmetros de `economia.ts` não tocam `sim/` — `BASELINE`/`BUILD_BASELINE` não usam
   `itemBonus`, e `world.ts` só aplica bônus de item se `pick.itemBonus` existir, caminho que essas rodadas
   não entram). Se algo tocar `sim/` ou mover o hash, investigar antes de gravar, não gravar antes de
   investigar.
4. **Revisão dos números de D-09, item a item, cada um citando o dado de telemetria que o motivou** (mesma
   disciplina do AC 3 de `e3.7`) — nenhum número novo "porque parece certo". Insuficiência declarada de novo
   é desfecho legítimo **por item**: é possível revisar `precoTrocaDeBuild` (se a nova amostra tiver trocas,
   ao contrário de `e3.7`, que teve zero) e ainda manter um preço de item sem dado suficiente — não é
   tudo-ou-nada.
5. A amostra usada é **100% `ESCALA_HP = 6.0`**, com o **n real de compras humanas na amostra reportado
   explicitamente** no Dev Agent Record (não assumido, não estimado) — se `n < 30`, aplica-se o AC 1.
6. **R-04 (renda das rodadas 6 e 7, `docs/architecture-e3.md` §14).** A tabela de 5 entradas
   (`rendaPorRodada`) e o fallback `rendaAposATabela` só ganham dois números explícitos se a amostra nova
   tiver **pelo menos uma rodada de índice ≥ 5** — condição que a amostra de `e3.7` teve **zero** vezes
   ("R-04 — dado zero, fallback confirmado por ausência", errata de `architecture-e3.md` §14). Sem essa
   rodada na amostra nova, o fallback "repete o último valor" permanece, e o motivo é registrado (ausência de
   dado, não indecisão).
7. **A sexta razão (`E37-EVD-002`, gate de `e3.7`, severidade low) é checada explicitamente contra a amostra
   nova**, não deixada implícita de novo: `jurosPorDezOuro` e `tetoDeJuros` nunca foram exercitados na
   amostra de `e3.7` (`ouroDepois` máximo observado foi 4, nunca ≥ 10). Esta story reporta o `ouroDepois`
   máximo da amostra nova e se algum jogador alguma vez guardou ≥10 de ouro — se não, os dois parâmetros
   continuam sem evidência para revisão, e isso é dito explicitamente (não silenciado de novo).
8. Nenhuma linha fora de `src/shop/catalogo.ts` (preços/magnitudes) e `src/match/economia.ts`
   (`ECONOMIA_PROVISORIA`) é alterada — mesma fronteira do AC 10 de `e3.7` — e cada mudança é diretamente
   rastreável a um dado de telemetria citado no Dev Agent Record.
9. **Se a re-adjudicação do Risco #1b (pré-condição a) confirmar o gatilho SIM para os dois personagens,
   esta story NÃO decide sozinha a correção de magnitude/preço da trilha física.** A decisão de COMO reagir
   (baixar preço, subir magnitude, redistribuir entre itens) é do `@pm`, informada pela evidência desta
   story; esta story implementa o número que o `@pm` decidir e cita a decisão — não infere a correção
   sozinha a partir do gatilho.

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type**: Balancing / Data revision
**Secondary Type(s)**: — (D-06/randomização já foi decidida em `e3.7` — não randomizar — e não é reaberta aqui)
**Complexity**: Low-Medium — mesma natureza de `e3.7`: a complexidade não é código (edição de constantes),
é garantir que as duas pré-condições bloqueantes foram checadas de verdade antes de qualquer edição, e que
cada número revisado tem evidência por trás.

### Specialized Agent Assignment

**Primary Agents**:
- @dev
- @qa (quality gate — valida que as duas pré-condições do AC 1 estavam de fato satisfeitas ANTES do trabalho
  começar, e que cada número revisado cita a evidência de telemetria correspondente, na mesma disciplina
  adversarial que o gate de `e3.7` aplicou)

**Supporting Agents**:
- @pm (dono da re-adjudicação do Risco #1b, da decisão de R-04 se a amostra permitir, e da decisão de COMO
  reagir se o Risco #1b confirmar SIM — AC 9)
- @architect (co-dono da re-adjudicação do Risco #1b, junto com @pm)

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
- As duas pré-condições do AC 1 (re-adjudicação do Risco #1b concluída; amostra n≥30 100% ×6.0) foram
  verificadas por evidência citável ANTES de qualquer número ser tocado — não assumidas
- Cada número revisado de D-09 cita o dado de telemetria que o motivou; nenhum número "porque parece certo"
- `git diff --stat` restrito aos dois arquivos declarados no AC 8

**Secondary Focus**:
- A amostra usada é filtrada por escala **verificada**, não presumida (achado `E37-DOC-004`: nem toda
  partida do export tem escala atribuída)
- R-04 só ganha números explícitos com rodada de índice ≥5 real na amostra nova

## Tasks / Subtasks

- [ ] Task 1 — Verificar as duas pré-condições bloqueantes (AC: 1)
  - [ ] Localizar o artefato da re-adjudicação formal do Risco #1b (@pm/@architect, n≥3000) — se não existir
        ou estiver incompleto, **parar aqui**, declarar insuficiência (AC 1), documentar o que falta e
        devolver ao `@sm`
  - [ ] Localizar/coletar a amostra de telemetria 100% `ESCALA_HP=6.0` e contar compras humanas reais — se
        `n < 30`, **parar aqui**, declarar insuficiência (AC 1), documentar o `n` real obtido
  - [ ] Confirmar que existem os commits de implementação de `debt.10` (`3de1cfe`) e de `debt.11`, e que
        toda partida da amostra é posterior aos dois. Partida anterior não entra no `n`, mesmo que seja ×6.0
        (AC 1(b), v1.2)
  - [ ] Confirmar que toda partida da amostra é posterior ao commit de implementação de `debt.13`
        (`181db27`) e veio de um build que contém `3de1cfe` ou posterior: servidor de dev local, ou Pages
        depois de um push do @devops. Partida do Pages publicado em `44311f6` não entra no `n`, porque esse
        build não grava carimbo ("Depende de" (b), v1.4)

- [ ] Task 2 — Se as duas pré-condições estiverem satisfeitas: preparar a amostra (AC: 5)
  - [ ] Filtrar os exports de `docs/evidence/telemetria/` (ou exports novos) só para partidas confirmadas em
        `ESCALA_HP=6.0` — verificar a atribuição de escala por partida, não assumir (`E37-DOC-004`)
  - [ ] Agregar com o instrumento oficial (`node src/tools/telemetria.ts`, o mesmo de `e3.5`/`e3.7`) — sem
        cálculo manual
  - [ ] Reportar n de compras humanas, rodadas de índice ≥5, `ouroDepois` máximo, trocas de build

- [ ] Task 3 — Revisar D-09 item a item (AC: 4, 6, 7, 8, 9)
  - [ ] Para cada preço em `src/shop/catalogo.ts`: revisar só se a amostra tiver dado suficiente para aquele
        item específico; citar o dado; senão, manter e declarar insuficiência para aquele item
  - [ ] R-04 (renda 6/7): revisar só se houver rodada de índice ≥5 real na amostra; senão, manter fallback
  - [ ] Checar explicitamente `jurosPorDezOuro`/`tetoDeJuros` contra `ouroDepois` máximo da amostra nova
        (AC 7) — reportar mesmo se a conclusão for "ainda sem evidência"
  - [ ] Se a re-adjudicação do Risco #1b confirmou SIM: levar a evidência ao `@pm`, implementar a decisão
        dele sobre a trilha física, citar a decisão (AC 9) — não decidir a correção sozinho

- [ ] Task 4 — Verificação (AC: 2, 3, 8)
  - [ ] `npm run check` — 0 erros
  - [ ] `npm run sim:check` — hash idêntico (esperado; investigar se divergir)
  - [ ] `git diff --stat` restrito a `src/shop/catalogo.ts` e `src/match/economia.ts` (mais o arquivo desta
        story)

## Dev Notes

### O mandato, na fonte (`E37-FUP-001`)

```yaml
id: 'E37-FUP-001'
severity: medium
finding: >-
  O passo 7 da fase [...] encerrou com insuficiência declarada, e as condições de reabertura
  (re-adjudicação do Risco #1b exigida por e3.6/REQ-101; amostra humana coletada inteiramente em ×6.0
  com n definido a priori; R-04 devolvido ao @pm) vivem só na prosa da story e nos top_issues dos gates.
  Sem item rastreado, D-09 fica provisório para sempre por default.
suggested_action: >-
  @pm/@sm criam "Revisão de D-09, rodada 2" como story/backlog item condicionado a (a) re-adjudicação
  formal do Risco #1b (n≥3000) e (b) amostra de telemetria humana 100% ×6.0 com n de compras definido a
  priori, citando R-04 e esta story. ENCAMINHADO: draft delegado ao @sm nesta mesma rodada do pipeline.
```

[Fonte: `docs/qa/gates/e3.7-revisao-d09-d06.yml`, achado `E37-FUP-001` — o mandato literal desta story]

### Os provisórios que continuam abertos (fonte: `src/shop/catalogo.ts`, `src/match/economia.ts`)

```ts
// src/shop/catalogo.ts
export const PRECO_PROVISORIO = 6   // os 8 itens do roster usam este preço plano, sem diferenciação

// src/match/economia.ts
export const ECONOMIA_PROVISORIA: ParametrosEconomia = {
  ouroInicial: 0,
  rendaPorRodada: [4, 5, 6, 7, 8],
  rendaAposATabela: 8,
  jurosPorDezOuro: 1,
  tetoDeJuros: 3,
  precoTrocaDeBuild: 5,
}
```

Nenhum destes valores mudou desde `e3.2` (onde `ECONOMIA_PROVISORIA` nasceu) — `e3.7` confirmou, por
verificação independente do `@qa`, que "nenhum número foi alterado" e que o `File List` daquela story ficou
vazio por construção.

[Fonte: `src/shop/catalogo.ts:72`; `src/match/economia.ts:35-42`; `docs/stories/e3.7.revisao-d09-d06.story.md`, Dev Agent Record §"File List"]

### Por que `e3.7` não pôde repreçar — as cinco razões, e quais esta story resolve

O Dev Agent Record de `e3.7` lista cinco razões para a insuficiência. Esta story ataca diretamente as
razões #1, #3, #4 e #5; a razão #2 (`precoTrocaDeBuild` nunca exercitado) só se resolve se a amostra nova
tiver trocas de build — não é garantido, é um resultado a observar, não a forçar.

1. Amostra misturava 4 escalas de jogo → **resolvido pelo requisito de amostra 100% ×6.0 (pré-condição b)**.
2. `precoTrocaDeBuild` nunca exercitado (0 trocas em 7 partidas) → depende do que a amostra nova mostrar;
   não há como garantir de antemão.
3. R-04 (renda 6/7) nunca exercitado (zero rodadas ≥5) → **AC 6 desta story reabre a condição, sem forçar o
   resultado** — só resolve se a amostra nova tiver a rodada.
4. Risco #1b em disputa formal (gate `e3.6`/`REQ-101`) → **é a pré-condição (a) desta story**, bloqueante.
5. n=11 é pequeno demais para 8 preços + 6 parâmetros → **é a origem do piso n≥30 desta story**
   (pré-condição b).

[Fonte: `docs/stories/e3.7.revisao-d09-d06.story.md`, Dev Agent Record §"D-09 — insuficiência declarada, provisórios mantidos"]

### A sexta razão que não foi enumerada (`E37-EVD-002`)

```yaml
id: 'E37-EVD-002'
severity: low
finding: >-
  A declaração de insuficiência tem uma sexta razão que os dados sustentam e o registro não lista
  explicitamente: jurosPorDezOuro e tetoDeJuros também nunca foram exercitados (ouroDepois máximo 4,
  nunca ≥10 — verificado). Implícito em "zero sinal de poupança", não enumerado.
suggested_action: 'Registrado aqui como complemento do inventário; sem edição retroativa do Dev Agent Record.'
```

O `suggested_action` do próprio achado diz explicitamente que não há edição retroativa devida — mas esta
story, ao revisitar a mesma classe de evidência, deve **checar essa razão de propósito** (AC 7), não deixá-la
implícita de novo.

[Fonte: `docs/qa/gates/e3.7-revisao-d09-d06.yml`, achado `E37-EVD-002`]

### O estado do Risco #1b — o que "re-adjudicado" precisa significar

```
> ABERTO, não resolvido — o Risco #1b reabriu de carona (gate e3.6/REQ-101, high): o gatilho do PRD §6
> (físico < +2pp E dano > +5pp), que e2.7 fechou como "NÃO" para os dois personagens, lê "SIM" para os
> dois em ×6.0 (golem físico +0,77pp em n=3000; vex −1,53pp, inversão de sinal confirmada em duas
> amostras). Re-adjudicação formal @pm/@architect pendente; bloqueia o repreço de itens de D-09
> (e3.7 manteve os provisórios também por isso).
```

"Re-adjudicar" aqui não significa "@pm concorda informalmente que o número está certo" — o gate de `e3.6`
pede explicitamente n≥3000 (o arnês já tem esse piso implementado, `npm run balance -- --risco-1b`, usado em
T-4 de `e3.6`) e um veredito formal, análogo ao que fechou o mesmo indicador como "NÃO" em `e2.7`. Esta story
não pode substituir essa re-adjudicação por sua própria leitura da telemetria de compra — são instrumentos
diferentes (telemetria de compra humana mede o QUE os jogadores escolhem; o arnês do Risco #1b mede o
DESEMPENHO da trilha física em confronto simulado).

[Fonte: `docs/architecture-e3.md` §14, bloco "Resolução do usuário, 2026-08-05"; `docs/qa/gates/e3.6-ajuste-d05-tuning.yml`, achado `REQ-101`]

### Onde mexer

`src/shop/catalogo.ts` (preços/magnitudes), `src/match/economia.ts` (`ECONOMIA_PROVISORIA`) — mesma fronteira
do AC 10 de `e3.7`. Nenhum outro arquivo, incluindo `src/sim/`, `src/client/` ou `docs/architecture-e3.md`
(emendar a arquitetura para fechar R-04/Risco #1b é escopo de `@pm`/`@architect`, não desta story de
implementação).

### Testing

- `npm run check` — 0 erros.
- `npm run sim:check` — reportar explicitamente "hash idêntico" (esperado) com a confirmação de que nenhuma
  linha de `sim/` foi tocada.
- Para cada número de D-09 revisado (ou mantido por insuficiência item a item): citar o dado de telemetria
  (arquivo exportado, métrica, valor) — mesmo padrão de `e3.7`.
- Confirmar por evidência, não por memória: n real de compras humanas na amostra ×6.0, contagem de rodadas
  de índice ≥5, `ouroDepois` máximo observado.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-08-16 | 1.0 | Story criada a partir do achado `E37-FUP-001` do gate `CONCERNS` de `e3.7` (`docs/qa/gates/e3.7-revisao-d09-d06.yml`), condicionada às duas pré-condições que o próprio achado nomeia (`REQ-101` de `e3.6` e amostra 100% ×6.0), com o piso de amostra (n≥30) justificado a partir do n=11 que `e3.7` já julgou insuficiente. Achado complementar `E37-EVD-002` (juros/teto nunca exercitados) incorporado como AC 7. | River (@sm) |
| 2026-09-21 | 1.1 | **Nota @po, sem mudança de AC nem de status (continua Draft/BLOCKED).** Adicionada em "Depende de" (b) uma **pergunta aberta ao usuário/@pm**: a pré-condição passa a exigir "×6.0 **e** atraso de input 6", ou aceita dado misto explicitamente? Origem: E41-TEL-002 do gate de `e4.1` (`docs/qa/gates/e4.1-ativar-atraso-de-input.yml`). Desde `b8e8a41` o cast humano tem atraso 6 no modo local, e a telemetria não distingue as duas populações. O @po não decide: a pré-condição foi escrita a partir da decisão de produto sobre a amostra, e mudá-la é do usuário/@pm. Se a resposta for "exigir", o AC 1(b), o AC 5 e a Task de verificação de amostra ganham "e atraso 6" numa revisão seguinte. | @po |
| 2026-09-21 | 1.2 | **Pré-condição de coleta de `debt.11` (R10, validação de `debt.11` v1.1, `3c6ab23`). Status permanece Draft/BLOCKED.** Emenda que a validação de `debt.11` registrou para esta story ("a mesma pré-condição de coleta vale para ela na próxima edição"). **(1) "Depende de" (b):** a amostra humana usada em (b) é coletada **depois** dos commits de implementação de `debt.10` (Done, `3de1cfe`) e de `debt.11` (Ready, ainda sem commit de implementação). É o prazo do AC 13 de `debt.11` e do AC 11 de `debt.10`. **(2) AC 1(b)** ganha a mesma condição, e a **Task 1** ganha a verificação dos dois commits contra o horário de cada partida. **(3) Consequência registrada:** as duas partidas ×6.0 já existentes (`992276418`, `670239056`, 3 compras) não contam para o piso de n≥30. **Não mexido:** a pergunta aberta da v1.1 ("×6.0 **e** atraso 6" ou dado misto aceito explicitamente?) continua não decidida e com o texto intacto. A pré-condição de coleta torna o atraso atribuível por evento, mas não escolhe entre as duas leituras. Essa escolha segue com o usuário/@pm. | @po |
| 2026-09-21 | 1.3 | **Cláusula provisória de coleta, roteada do gate CONCERNS de `debt.11` (`docs/qa/gates/debt.11-guarda-automatica-telemetria.yml`, `ca52e07`, achado `DEBT11-TST-001`, medium). Status permanece Draft/BLOCKED.** A guarda de `debt.11` confere que o carimbo existe e é finito, mas não o valor dele. Com `atrasoTicks: 0, escalaHp: 1` literais em `registrar()`, o `sim:check` sai com 0, e a amostra (b) sairia rotulada como uma população errada e plausível. A correção vai para uma story nova, sugestão `debt.13`, com spec no Change Log de `debt.11` v1.5. Ela não entra na ordem de `determinism.ts` e pode começar já. **(1) "Depende de" (b):** até o commit de implementação de `debt.13` existir, a coleta espera esse commit, **ou** cada export da amostra tem o valor do carimbo conferido à mão contra as constantes do build jogado, com comando e resultado registrados. Fica registrado o limite das duas formas: um carimbo com os campos trocados passa enquanto as duas constantes valerem 6. A nota "`debt.11` sem commit de implementação" ganhou a anotação de que ele existe (`971686b`, Done). **(2) AC 1(b)** e **Task 1** ganham a mesma condição. **Não mexido:** a pergunta aberta da v1.1 continua não decidida, e a cláusula não a responde. Quando `debt.13` estiver Done, o @po retira a cláusula. **Por que esta story é a que mais ganha com uma `debt.13` separada:** a coleta de (b) é de um aparelho só e não depende da rede, então poderia começar antes de `e4.3`. Se a correção fosse dobrada em `debt.12`, ela ficaria atrás de `e4.9` e `e4.3`. **Fatos conferidos:** `registrar()` em `src/client/telemetria.ts:163`, `ATRASO_ALVO_TICKS = 6` em `src/net/protocolo.ts:38`, `ESCALA_HP = 6.0` em `src/chars/tuning.ts:10`. O comando de conferência rodou sobre um export antigo de `docs/evidence/telemetria/` e deu `14 14`, o esperado para um export sem carimbo. | @po |
| 2026-09-21 | 1.4 | **Cláusula provisória de coleta retirada, porque `debt.13` está Done (gate PASS `docs/qa/gates/debt.13-guarda-telemetria-confere-valor-do-carimbo.yml`, `f5d4713`, implementação `181db27`). Status permanece Draft/BLOCKED.** O gate fecha `DEBT11-TST-001` e `DEBT11-TST-002` e recomenda a retirada. **(1) "Depende de" (b):** o bloco da v1.3, com as opções (i)/(ii) e o parágrafo "Limite", sai. Entra uma nota curta: o valor do carimbo é guardado desde `debt.13`, e a pré-condição de coleta de (b) passa a ser "depois dos commits de implementação de `debt.11` (`971686b`) e de `debt.13` (`181db27`)". **(2) O que continua valendo, dito às claras:** o corte de build de `debt.10`/`e4.1`. Nenhum desses commits está em `origin/master`, e o build publicado no Pages (`44311f6`, 2026-08-16) não grava carimbo nenhum. Só conta para o `n` partida de um build que contenha `3de1cfe` ou posterior (servidor de dev local, ou Pages depois do push do @devops). **(3)** AC 1(b) e Task 1 foram ajustados da mesma forma. **Não mexido:** a pergunta aberta da v1.1 ("×6.0 **e** atraso 6" ou dado misto aceito explicitamente?) continua com o texto intacto e não decidida, e segue com o usuário/@pm. A consequência sobre `992276418` e `670239056` também não muda. **Fatos conferidos:** as linhas citadas pelo gate (101-118, 136-137, 241-243) batem com a v1.3 do arquivo, e foram conferidas antes de apagar. `git merge-base --is-ancestor` dá rc=1 para `3de1cfe`, `971686b` e `181db27` contra `origin/master`. `origin/master` é `44311f6`, de 2026-08-16. | Pax (@po) |
