# Story debt.15: Teto natural do replay, 8 canários na guarda da v2 e identidade do base do personagem — achados `E412-REL-001`, `E412-TST-001` e `E411-TST-001`

## Status

Draft

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run check", "npm run sim:check (golden hash idêntico ao baseline atual)", "npm run build", "npm run replay:check contra a reprodução real do E412-REL-001 (30 cliques por jogador na fase builds, num servidor local descartável, portas livres — nunca 5341-5345, usadas pelo gate)", "as mutações do contrafactual (a que restaura o teto fixo em reproduzirPartida, a que tira o termo do teto de classificarEncerramento, e as demais listadas no AC 7), cada uma numa cópia descartável, nunca na árvore compartilhada — todas com sim:check saindo com código diferente de 0", "git show --stat <commit de implementação> — restrito a src/tools/partida.ts, src/tools/determinism.ts e (só se necessário) src/tools/replay-check.ts"]
```

## Story

**Como** desenvolvedor fechando três achados abertos pelo @qa nos gates de `e4.12` e `e4.11` (Done, `docs/qa/gates/e4.12-replay-v2-causa-do-fim-pool-e-carimbo.yml` e `docs/qa/gates/e4.11-segredo-de-assento-e-loja-no-modo-conectado.yml`),
**eu quero** trocar o teto fixo `MAX_PASSOS` do caminho de replay de `reproduzirPartida` por um limite natural derivado da própria gravação, estender a guarda de `bb.replay.v2` em `src/tools/determinism.ts` com 8 canários baratos para as mutações que hoje sobrevivem, e dar à guarda uma checagem de identidade para `baseDoPersonagem`,
**para que** um replay honesto de uma partida longa (ou de um jogador clicando demais na tela de build) deixe de reprovar por falso negativo antes da coleta de `e4.7`, e para que uma regressão na causa do fim de rodada/partida, no formato v2 ou no cache do base do personagem deixe de passar despercebida pelo `sim:check`.

## Depende de

`e4.12` (`docs/stories/e4.12.replay-v2-causa-do-fim-pool-e-carimbo.story.md`, Done, commit de implementação `a9ad204`) — é dona de `E412-REL-001` e `E412-TST-001`, os dois achados do gate `docs/qa/gates/e4.12-replay-v2-causa-do-fim-pool-e-carimbo.yml` (CONCERNS, revisão `a9ad204`) que esta story fecha.

`e4.11` (`docs/stories/e4.11.segredo-de-assento-e-loja-no-modo-conectado.story.md`, Done, commit de implementação `eccff6a`) — é dona de `E411-TST-001`, o achado do gate `docs/qa/gates/e4.11-segredo-de-assento-e-loja-no-modo-conectado.yml` (CONCERNS, revisão `eccff6a`) que esta story fecha.

**Sem story de bloqueio na ordem de `src/tools/determinism.ts`.** `e4.12`, `e4.11`, `e4.10`, `debt.14` e `e4.6` estão todos Done (`docs/architecture-e4.md` §11.6.2 fecha a ordem `e4.8` → `debt.11` → `e4.9` → `e4.3` → `debt.12` → `debt.14` → `e4.10` → `e4.6`, e `e4.12`/`e4.11` vieram depois, também Done). **Pré-condição de início:** `git status --short src/tools/partida.ts src/tools/determinism.ts src/tools/replay-check.ts` sai vazio.

**Achado NÃO endereçado por esta story, roteado ao @architect (registrado aqui só como nota, sem AC):** `E412-DOC-001` (low, docs) — o AC 6 de `e4.12` cita "`9aa1b500` no tick 90, na medição da fonte", valor que o @qa não conseguiu reproduzir a partir do driver que a §7.3 descreve (o driver independente do @qa deu `7aec17ab` no mesmo tick, idêntico em três commits). O que o AC realmente exige (W.O. numa rodada ≠ 0, hash conferido no tick do corte, `ticks−1` reprovando) continua provado. **Este achado é texto de story já Done (`e4.12` AC 6), edição exclusiva do @po** — não é escopo de implementação, e não entra nas Acceptance Criteria abaixo.
[Fonte: `docs/qa/gates/e4.12-replay-v2-causa-do-fim-pool-e-carimbo.yml`, achado `E412-DOC-001`]

## Acceptance Criteria

1. `npm run check` verde.

2. `npm run sim:check` verde, com **golden hash idêntico** ao baseline atual (nenhuma linha do golden hash muda de valor). As linhas que mudam de conteúdo são só as que os AC 4, 5 e 6 abaixo tocam diretamente (a saída da guarda `bb.replay.v2` dentro do bloco `sala pura`, e a linha que ganha a checagem de identidade do AC 5); nenhuma outra seção (globais, telemetria, base, replay v1, codec do fio, etc.) muda de texto.

3. **`E412-REL-001` — teto natural no caminho do replay.** Hoje `MAX_PASSOS = 64` (`src/tools/partida.ts:130`) é o mesmo teto fixo usado nas três funções que percorrem uma partida: `jogarPartida` (`:323-324`), `reproduzirPartida` (`:371`) e a partida por política (`:512-513`). No replay, esse número é controlado pela **entrada do jogador**: `{t:'build'}` é aceito toda vez que chega, mesmo repetido (`redutor.ts`, `aplicarBuild`; cada clique nos 8 botões da tela de build manda um, `telas.ts:162`, `main.ts:558`, e a sala grava todos). **MEDIDO pelo @qa** (gate de `e4.12`, `avaliacoes_pedidas.max_passos_64`): replays honestos de uma Bo5 dão 19 passos (3 rodadas), 24 (4) e 29 (5); repetindo o primeiro build K vezes, a falha começa em exatamente 66 passos (K=47 com 3 rodadas, K=37 com 5); no **servidor real** (porta 5345), 30 cliques por jogador na fase builds deram 64 builds aceitos e 79 passos, e `replay:check` deu `rc=1` com "a reprodução não chegou ao fim da partida: … não terminou (fase builds)"; o mesmo arquivo, numa cópia com `MAX_PASSOS = 640`, deu `rc=0`. O pior caso de 7 rodadas sem clique redundante fica em ≤ 51 passos (4 draft + 4 build + 2 pronto + 7 rodadas + 12 prontos de loja + ≤ 22 compras/trocas), então só builds redundantes estouram o teto de 64 hoje.

   A correção troca, **só em `reproduzirPartida` (`:371`)**, o teto fixo `MAX_PASSOS` pelo limite natural da própria gravação: `g.decisoes.length + g.rodadas.length + 1` (cada volta do laço consome exatamente uma decisão ou fecha exatamente uma rodada gravada, então esse limite nunca é curto demais para uma gravação genuína, e sobra 1 de folga para o `passo` de saída do laço). **`MAX_PASSOS` continua exatamente como está, sem tocar**, em `jogarPartida` (`:323-324`) e na partida por política (`:512-513`) — são a política de geração, não o replay, e o gate é claro: "`MAX_PASSOS` fica para `jogarPartida` e para o roteiro por política".

   **Guarda em `sim:check` (contrafactual, sem depender de servidor).** Numa das funções de `src/tools/determinism.ts` que já montam um `PartidaGravada`/gravação disponível para replay (por exemplo dentro de `guardaReplayV2`, ao lado dos cenários `wo`/`anular`/`queda`, `:2965-3095`), acrescentar um caso que reproduz o achado do gate DENTRO do `sim:check`: uma sala onde um jogador manda a mesma decisão `{t:'build', ...}` aceita repetidas vezes (o `redutor.ts` aceita builds repetidos enquanto o jogador não estiver `pronto`) até o total de passos da gravação (`decisoes.length + rodadas.length`) passar de 64 — o teto de hoje — mas continuar coberto pelo limite natural. Depois do fix, `reproduzirPartida` sobre essa gravação **não lança**. Registrar o resultado como mais uma linha do bloco `bb.replay.v2` (ao lado de `replay W.O.`/`replay anul.`/`replay queda`).

   **Contrafactual:** uma mutação que restaura o teto fixo (`MAX_PASSOS` no lugar do limite natural, só na linha `:371`) aplicada a uma cópia descartável tem de fazer esse caso novo reprovar (`sim:check` código diferente de 0, com a mesma mensagem "não terminou (fase builds)" que o gate mediu no servidor real).

   **Verificação adicional (registrada no Dev Agent Record, não é AC repetida):** reproduzir, contra um servidor local descartável (portas livres, nunca 5341-5345, que o gate já usou), o cenário exato que o gate mediu — 30 cliques por jogador na fase builds — e confirmar que `npm run replay:check` no arquivo resultante agora dá `rc=0` (antes da correção, o gate mediu `rc=1`).
   [Fonte: `docs/qa/gates/e4.12-replay-v2-causa-do-fim-pool-e-carimbo.yml`, achado `E412-REL-001`; `src/tools/partida.ts:130, 323-324, 360-390, 512-513`]

4. **`E412-TST-001` — 8 canários baratos na guarda de `bb.replay.v2`, um por mutação sobrevivente.** O gate mediu 8 mutações próprias que hoje sobrevivem à guarda (`sim:check` sai `rc=0` mesmo com elas aplicadas): `R1`, `R3`, `R4`, `R6`, `R6b`, `R6c`, `R6d` e `R13`. Cada uma ganha um canário na guarda, dentro de `guardaReplayV2` (`src/tools/determinism.ts:2965-3095`) ou de `salaNegativos` (`:2236-…`, que já cria condutores com `.gravacao` via `novoCondutor`, `:1672-1677`), reaproveitando fixtures que já existem sempre que possível — os canários pedidos pelo gate são deliberadamente baratos:

   - **(a) `R1` — o termo do teto na classificação (`classificarEncerramento`, `src/net/replay.ts:209-218`: `e.encerramento = w.over || w.tick >= depois.config.tetoDeTicks ? 'natural' : 'wo'`).** `salaNegativos` já tem, no caso do AC 5(i) de `debt.14` (`:2439-2459`), uma sala com `tetoDeTicks: TETO` pequeno cujo round 0 fecha exatamente no teto com `over: false` (o snap final confere `!snapFinal.s.over` na linha 2451) — é uma rodada que só fecha pelo TERMO do teto, nunca por `world.over`. Essa sala já roda com um `Condutor` (`nova(...)`) que tem `.gravacao` por construção. **Canário:** depois de fechar o round 0 nesse ponto, montar o replay dessa gravação (`montarReplay(v.gravacao, v.sala)`, como `replayDoCondutor` já faz noutros pontos do arquivo) e afirmar que `rodadas[0].encerramento === 'natural'`. Sem o termo do teto (mutação: `w.over ? 'natural' : 'wo'`), a classificação vira `'wo'` para esse round, com `aoVivo.vencedor` provavelmente `-1` — o que também reprova a regra já existente do verificador ("W.O. com vencedor -1 ao vivo", `replay-check.ts:165-167`), então a asserção direta do canário é a defesa principal, e essa regra é uma segunda linha.
   - **(b) `R4` — a partida completa rotulada `'interrompida'` tem de reprovar.** Reaproveitar um replay `'fim'` já montado dentro de `guardaReplayV2` (por exemplo `rw.lido`, do cenário `wo`, ou qualquer replay completo do bloco). Numa CÓPIA do objeto lido, trocar `encerramento` para `'interrompida'` e chamar `verificarReplay`; tem de sair com o problema "o arquivo diz partida interrompida, e a reprodução chegou à fase fim" (`replay-check.ts:183`).
   - **(c) `R3` — a partida `'interrompida'` com uma decisão extra no fim tem de reprovar.** Reaproveitar `ra.lido` (o cenário `'anular'`, já `'interrompida'`, `:3040-3061`). Numa CÓPIA, acrescentar **uma decisão qualquer** (tipo `Decisao` válido, qualquer valor — por exemplo repetir a última) ao FIM de `decisoes`, e chamar `verificarReplay`; tem de sair com o problema de `decisoesConsumidas !== r.decisoes.length` (`replay-check.ts:184-186`). *(A reprodução para de consumir decisões assim que a fase volta a `'rodada'` com o limite de rodadas já atingido — `partida.ts:373` — então a decisão extra no fim nunca chega a ser tocada, e o teste não precisa reproduzir o jogo além do que já está gravado.)*
   - **(d) `R6`/`R6b`/`R6c`/`R6d` — um caso negativo por campo da v2 em `lerReplay` (`src/tools/replay-check.ts:50-92`).** Quatro casos, cada um partindo de um replay v2 válido serializado (`serializarReplay`/`JSON.parse`), mutado num único campo, e confirmando que `lerReplay` **lança**:
     - `R6` — `rodadas[i].encerramento` fora de `'natural' | 'wo'` (linhas 74-76);
     - `R6b` — `encerramento` (o da partida, nível raiz) fora de `'fim' | 'interrompida'` (linha 90);
     - `R6c` — `pool` vazio (`[]`) (linha 85, `r.pool.length === 0`);
     - `R6d` — `codigo` malformado — por exemplo `commit` não string/null, ou `sujo` não boolean/null (linhas 86-89).
   - **(e) `R13` — o carimbo sobrevive à volta `montarReplay` → `serializarReplay` → `lerReplay`.** Um `Condutor` novo criado com `criarGravacao({ commit: 'sentinela-e412', sujo: true })` no lugar do `CODIGO_DESCONHECIDO` padrão de `novoCondutor` (`:1677`), jogado até o fim, montado, serializado e relido; afirmar que `lido.codigo.commit === 'sentinela-e412'` e `lido.codigo.sujo === true`. Sem essa checagem, `montarReplay` perdendo o carimbo (por exemplo devolvendo `CODIGO_DESCONHECIDO` fixo) passa verde, porque a guarda de hoje só grava com carimbo desconhecido e confere `null` (a lição de `e4.8`/`e4.9`: guarda por caso ≠ por campo).

   Cada canário soma à(s) linha(s) de saída do bloco `bb.replay.v2` dentro de `sala pura` (ao lado de `replay W.O.`/`replay anul.`/`replay queda`, `:3146-3147`), sem mudar nenhuma outra seção do `sim:check`.
   [Fonte: `docs/qa/gates/e4.12-replay-v2-causa-do-fim-pool-e-carimbo.yml`, achado `E412-TST-001`, `verificacao_independente` "Mutações próprias (15)"; `src/net/replay.ts:73-77, 209-218, 257-277`; `src/tools/replay-check.ts:50-92, 165-167, 181-190`; `src/tools/determinism.ts:1656-1677, 2439-2459, 2965-3095`]

5. **`E411-TST-001` — identidade de `baseDoPersonagem`.** O AC 8 de `e4.11` exige que `baseDoPersonagem` (`src/sim/stats.ts:166-178`) devolva "um objeto novo a cada chamada; nada de cache por `def`". Nenhuma guarda do repositório confere isso hoje: a mutação `QM-B2` do gate (um cache por `def`, tipo `Map<CharDef, StatBlock>`) passa em `tsc`, em `sim:check` (golden hash ✓) e no one-liner do AC 15 de `e4.11`. Só a comparação por identidade pega. Duas linhas em `src/tools/determinism.ts` (numa checagem já existente que tenha `CHARS` à mão — por exemplo perto de `createWorld(CHARS, setup(SEED_GUARDA))`, `:414`, ou como parte da checagem de escala já feita sobre `basePorChar`/`STAT_KEYS`, se existir uma; a escolha do ponto exato é do @dev):
   - `baseDoPersonagem(def) !== baseDoPersonagem(def)` para um `def` qualquer de `CHARS` — duas chamadas devolvem objetos distintos;
   - para o mesmo `charId`, dois `baseDoPersonagem(CHARS[charId])` (ou duas bolas do mesmo personagem criadas por `createWorld`) têm `.base` distintos por referência (`!==`).

   **Contrafactual:** a mutação `QM-B2` do gate de `e4.11` — um `Map` cacheando por `def` dentro de `baseDoPersonagem` — aplicada a uma cópia descartável, tem de fazer o `sim:check` sair com código diferente de 0 por essa checagem nova.
   [Fonte: `docs/qa/gates/e4.11-segredo-de-assento-e-loja-no-modo-conectado.yml`, achado `E411-TST-001`; `src/sim/stats.ts:151-178`]

6. **Golden hash e escopo dos ACs 3-5 não se misturam com outra seção.** As mudanças dos AC 3 e 4 ficam dentro do bloco `bb.replay.v2`/`sala pura` de `determinism.ts` (mais a linha `:371` de `partida.ts`, e `net/replay.ts`/`replay-check.ts` só como LEITURA, salvo se o AC 4(d) precisar tocar `replay-check.ts` — ver AC 7). A mudança do AC 5 fica confinada a, no máximo, duas linhas novas de checagem e o import de `baseDoPersonagem`/`CHARS` se ainda não estiverem no arquivo. Nenhuma das três toca `src/net/sala.ts`, `src/net/codec.ts`, `src/match/`, `src/shop/`, `src/bot/`, `src/chars/` ou `src/client/`.

7. **Escopo de arquivos, fechado.**

   | Permitido | Motivo |
   |---|---|
   | `src/tools/partida.ts` | só a linha `:371` de `reproduzirPartida` (AC 3) |
   | `src/tools/determinism.ts` | os 8 canários (AC 4) e as duas linhas de identidade (AC 5) |
   | `src/tools/replay-check.ts` | **só se** o AC 4(d) precisar de um pequeno ajuste para permitir a mutação de teste do campo (por exemplo, se `lerReplay` não expuser um jeito de o canário montar o JSON malformado sem duplicar a serialização) — nenhuma regra de validação nova além das já existentes nas linhas citadas no AC 4(d); se não precisar, o arquivo não é tocado |

   **Proibido, sem exceção:** `src/net/replay.ts` (é só leitura/citação — nenhuma linha de código muda lá; o termo do teto em `classificarEncerramento` continua como está, e o canário do AC 4(a) testa o comportamento de hoje, não corrige nada), `src/net/sala.ts`, `src/net/codec.ts`, `src/net/protocolo.ts`, `src/match/`, `src/shop/`, `src/bot/`, `src/chars/`, `src/client/`, `package.json` (nenhum script novo) e `docs/` (exceto a própria story). Prova por `git show --stat <commit(s) desta story>`.

8. **Contrafactual total, cada mutação com `sim:check` saindo com código diferente de 0, numa cópia descartável, revertida ao final:**
   - **MUT-REL-001** — restaurar `MAX_PASSOS` (teto fixo) no lugar do limite natural em `reproduzirPartida` (`partida.ts:371`);
   - **MUT-R1** — `classificarEncerramento` sem o termo do teto (`w.over` no lugar de `w.over || w.tick >= …`);
   - **MUT-R4** — (verificação de fixture, não mutação de código): confirmar que o canário do AC 4(b) reprova ao relabelar `'fim'` → `'interrompida'`;
   - **MUT-R3** — (idem): confirmar que o canário do AC 4(c) reprova com a decisão extra;
   - **MUT-R6/R6b/R6c/R6d** — (idem, 4 casos): confirmar que cada `lerReplay` negativo do AC 4(d) lança;
   - **MUT-R13** — `montarReplay` devolvendo `CODIGO_DESCONHECIDO` fixo em vez de `g.codigo` (perde o carimbo sentinela);
   - **QM-B2** — cache por `def` (`Map`) dentro de `baseDoPersonagem` (AC 5).

   Os itens "MUT-R4"/"MUT-R3"/"MUT-R6*" não são mutações de código-fonte — são a prova de que os PRÓPRIOS canários (que são fixtures, não guardas de comportamento de produção) de fato disparam a checagem correspondente do verificador já existente; registrar o resultado de cada um (rc e a mensagem) no Dev Agent Record, do mesmo jeito que as mutações de código.
   [Fonte: consolidação dos AC 3, 4 e 5 acima]

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type**: Architecture / Testing (fecha um achado de comportamento — falso negativo de replay — e estende uma guarda de regressão já existente, sem regra de jogo nova)
**Secondary Type(s)**: —
**Complexity**: Medium — três arquivos no máximo, dois deles (`determinism.ts`, `replay-check.ts` se tocado) já com estrutura de guarda estabelecida; o risco principal é a matemática do teto natural (AC 3) e a fidelidade de cada canário ao comportamento que ele diz proteger.

### Specialized Agent Assignment

**Primary Agents**:
- @dev
- @qa (quality gate — confere a matemática do teto natural contra os números medidos pelo gate de `e4.12`, que cada um dos 8 canários do AC 4 de fato reprova quando a mutação correspondente é aplicada, que a checagem de identidade do AC 5 pega `QM-B2`, e que o golden hash fica idêntico)

**Supporting Agents**:
- @po (dono do roteamento dos três achados; se algum caso novo dos AC 3-5 encontrar comportamento do código de hoje que não corresponde ao esperado, a story para e escala a ele, sem "corrigir" por dentro)

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
- O teto natural (`g.decisoes.length + g.rodadas.length + 1`) substitui `MAX_PASSOS` **só** na linha `:371` de `reproduzirPartida` — `jogarPartida` e a partida por política continuam com `MAX_PASSOS` (AC 3)
- Os 8 canários do AC 4 de fato reprovam sob a mutação correspondente, cada um registrado com rc e mensagem no Dev Agent Record (AC 4, AC 8)
- A checagem de identidade de `baseDoPersonagem` pega `QM-B2` (cache por `def`) sem falsos positivos sobre o código de hoje (AC 5)

**Secondary Focus**:
- Golden hash idêntico, e nenhuma seção do `sim:check` fora do bloco `bb.replay.v2`/identidade do base muda de conteúdo (AC 2, AC 6)
- `src/net/replay.ts` não é tocado — o AC 4(a) testa o comportamento de hoje, não o corrige (AC 7)

## Tasks / Subtasks

- [ ] Task 0 — Pré-condição de início
  - [ ] Confirmar que `e4.12` (`a9ad204`) e `e4.11` (`eccff6a`) estão Done
  - [ ] Confirmar que `git status --short src/tools/partida.ts src/tools/determinism.ts src/tools/replay-check.ts` sai vazio

- [ ] Task 1 — `E412-REL-001`, teto natural (AC: 3, 8)
  - [ ] Trocar `if (passo > MAX_PASSOS)` por `if (passo > g.decisoes.length + g.rodadas.length + 1)` só na linha `:371` de `reproduzirPartida`, sem tocar `:323-324` nem `:512-513`
  - [ ] Construir, dentro de `guardaReplayV2` (ou função-irmã no mesmo arquivo), uma gravação com builds redundantes que ultrapassa 64 passos mas fica dentro do limite natural; confirmar que `reproduzirPartida`/o replay dela passa sem lançar
  - [ ] Aplicar MUT-REL-001 (restaurar `MAX_PASSOS`) numa cópia descartável; confirmar `sim:check` código != 0 com a mensagem "não terminou (fase builds)"; reverter
  - [ ] Verificação adicional: reproduzir os 30 cliques por jogador contra um servidor local descartável (portas livres); confirmar `npm run replay:check` dá `rc=0`; registrar porta, comandos e saída no Dev Agent Record

- [ ] Task 2 — `E412-TST-001`, os 8 canários (AC: 4, 7, 8)
  - [ ] (a) `R1` — estender o cenário de teto pequeno de `salaNegativos` (AC 5(i) de `debt.14`, `:2439-2459`) com a asserção `rodadas[0].encerramento === 'natural'` sobre o replay montado da gravação
  - [ ] (b) `R4` — reaproveitar um replay `'fim'` já existente em `guardaReplayV2`; numa cópia, relabelar `'interrompida'`; confirmar que `verificarReplay` reprova
  - [ ] (c) `R3` — reaproveitar `ra.lido` (cenário `'anular'`); numa cópia, empurrar uma decisão extra ao fim de `decisoes`; confirmar que `verificarReplay` reprova por `decisoesConsumidas`
  - [ ] (d) `R6`/`R6b`/`R6c`/`R6d` — 4 casos negativos de `lerReplay`, um por campo (encerramento de rodada, encerramento de partida, pool vazio, codigo malformado); confirmar que cada um lança
  - [ ] (e) `R13` — condutor com carimbo sentinela não nulo; montar, serializar, reler; confirmar que o carimbo sobrevive
  - [ ] Aplicar MUT-R1 e MUT-R13 (mutações de código) numa cópia descartável; confirmar `sim:check` código != 0 nos dois; reverter
  - [ ] Registrar, para os 6 casos de fixture (b, c, d×4), o resultado de cada um (rc e mensagem) no Dev Agent Record

- [ ] Task 3 — `E411-TST-001`, identidade do base (AC: 5, 8)
  - [ ] Escolher o ponto de inserção em `determinism.ts` (checagem existente com `CHARS` à mão, ou nova checagem pequena e autocontida)
  - [ ] Acrescentar as duas linhas de identidade (`baseDoPersonagem(def) !== baseDoPersonagem(def)`; dois `.base` de bolas do mesmo `charId` distintos por referência)
  - [ ] Aplicar QM-B2 (cache por `def`) numa cópia descartável; confirmar `sim:check` código != 0; reverter

- [ ] Task 4 — Verificação (AC: 1, 2, 6, 7)
  - [ ] `npm run check` — 0 erros
  - [ ] `npm run sim:check` antes e depois — golden hash idêntico; diff só dentro do bloco `bb.replay.v2` e da(s) linha(s) de identidade
  - [ ] `npm run build` — rc=0
  - [ ] `git show --stat` do(s) commit(s) desta story, restrito aos arquivos do AC 7

## Dev Notes

### `reproduzirPartida` hoje, e o ponto exato do AC 3 (fonte: `src/tools/partida.ts`)

```ts
// linha 130
const MAX_PASSOS = 64

// linhas 360-390
export function reproduzirPartida(g: PartidaGravada, como: ComoReproduzir = {}): PartidaReproduzida {
  let e = criarPartida({ seed: g.matchSeed, pool: como.pool === undefined ? POOL : [...como.pool] })
  const rodadas: ResultadoRodada[] = []
  const recusadas: string[] = []
  let iDecisao = 0
  let iRodada = 0
  const limite = como.pararDepoisDeRodadas
  const erro = (m: string) => new Error(...)

  for (let passo = 0; e.fase !== 'fim'; passo++) {
    if (passo > MAX_PASSOS) throw erro(`replay de ${g.matchSeed} não terminou (fase ${e.fase})`)   // <- linha 371, o AC 3 troca só esta
    if (limite !== undefined && iRodada >= limite && (e.fase === 'rodada' || iDecisao >= g.decisoes.length)) break
    if (e.fase === 'rodada') {
      const corte = como.cortes?.[iRodada] ?? null
      const gravada = g.rodadas[iRodada++]
      if (!gravada) throw erro(`replay de ${g.matchSeed} pediu a rodada ${iRodada} sem gravação`)
      const f = fecharRodada(e, gravada.comandos, corte)
      rodadas.push(f.resultado)
      e = f.estado
      continue
    }
    const d = g.decisoes[iDecisao++]
    if (!d) throw erro(`replay de ${g.matchSeed} ficou sem decisões antes do fim da partida`)
    const t = aplicar(e, d)
    if (t.erro !== undefined) recusadas.push(...)
    e = t.estado
  }
  return { placar: ..., vencedor: ..., rodadas, decisoesConsumidas: iDecisao, recusadas, chegouAoFim: e.fase === 'fim' }
}
```

Cada volta do laço OU fecha uma rodada gravada (`iRodada++`) OU consome uma decisão gravada (`iDecisao++`) — nunca as duas. Por isso `g.decisoes.length + g.rodadas.length` é o número MÁXIMO de voltas que uma gravação genuína pode produzir (uma gravação real não tem "voltas extras": ela só passa pelo `for` uma vez por decisão ou por rodada que de fato gravou). O `+1` do limite natural é folga para o `passo` em que o laço sai (`e.fase === 'fim'` já é verdade, mas o `passo` já foi incrementado uma vez a mais pela mecânica do `for`). `MAX_PASSOS` (64) é hoje o único fator que faz esse número FIXO em vez de derivado da gravação — e é exatamente isso que o clique redundante em `build` explora, porque cada clique é uma entrada NOVA em `g.decisoes` que não muda `g.rodadas.length`.

**Outros dois usos de `MAX_PASSOS`, que NÃO mudam:**
```ts
// linhas 323-324, dentro de jogarPartida (gera a gravação, não a reproduz)
if (passo > MAX_PASSOS) {
  throw new Error(`partida ${matchSeed} não terminou em ${MAX_PASSOS} passos (fase ${e.fase})`)
}
// linhas 512-513, dentro da partida por política
if (passo > MAX_PASSOS) {
  throw new Error(`partida por política ${matchSeed} não terminou em ${MAX_PASSOS} passos (fase ${e.fase})`)
}
```
Essas duas geram decisões (a política ou o roteiro decidem quantas), então não têm uma "gravação anterior" da qual derivar um limite natural — o teto delas é política do gerador, não do leitor, e o gate confirma: "`MAX_PASSOS` fica para `jogarPartida` e para o roteiro por política".

[Fonte: `src/tools/partida.ts:130, 323-324, 360-390, 512-513`; `docs/qa/gates/e4.12-replay-v2-causa-do-fim-pool-e-carimbo.yml`, `top_issues.E412-REL-001`]

### `classificarEncerramento`, `montarReplay` e `lerReplay` — os pontos exatos do AC 4 (fonte: `src/net/replay.ts` e `src/tools/replay-check.ts`)

```ts
// src/net/replay.ts:209-218 — classificarEncerramento (R1: o termo do teto é `w.tick >= depois.config.tetoDeTicks`)
function classificarEncerramento(g: GravacaoDeReplay, m: MarcaDoPasso, depois: Sala): void {
  if (m.rodada === null || depois.rodada === m.rodada) return
  const fechadas = depois.partida.historico.length - m.partida.historico.length
  if (fechadas <= 0) return
  if (fechadas > 1) throw new Error(...)
  const e = entradaDa(g, m.rodada)
  if (e.encerramento !== null) throw new Error(...)
  const w = m.rodada.world
  e.encerramento = w.over || w.tick >= depois.config.tetoDeTicks ? 'natural' : 'wo'   // <- R1
}

// src/net/replay.ts:257-277 — montarReplay (R13: o carimbo vem de g.codigo, sem transformação)
export function montarReplay(g: GravacaoDeReplay, s: Sala): Replay {
  ...
  return {
    formato: FORMATO_DO_REPLAY,
    matchSeed: s.injetado.seed,
    pool: [...s.injetado.pool],
    codigo: { commit: g.codigo.commit, sujo: g.codigo.sujo },   // <- R13
    encerramento: s.partida.fase === 'fim' ? 'fim' : 'interrompida',
    ...
  }
}
```

```ts
// src/tools/replay-check.ts:50-92 — lerReplay, os 4 campos do AC 4(d)
for (const [i, x] of (r.rodadas as unknown[]).entries()) {
  ...
  if (!v1 && rod.encerramento !== 'natural' && rod.encerramento !== 'wo') {          // <- R6, linha 74-76
    throw new Error(`replay: a rodada ${i} tem encerramento ...`)
  }
}
...
if (!Array.isArray(r.pool) || r.pool.length === 0 || ...) throw new Error(...)        // <- R6c, linha 85
const c = r.codigo as Record<string, unknown> | null
if (typeof c !== 'object' || c === null || (c.commit !== null && typeof c.commit !== 'string') || (c.sujo !== null && typeof c.sujo !== 'boolean')) {
  throw new Error(...)                                                                // <- R6d, linhas 86-89
}
if (r.encerramento !== 'fim' && r.encerramento !== 'interrompida') throw new Error(...) // <- R6b, linha 90

// src/tools/replay-check.ts:181-190 — verificarReplay, as duas conferências da 'interrompida'
if (interrompida) {
  if (rep.chegouAoFim) problemas.push('o arquivo diz partida interrompida, e a reprodução chegou à fase fim')   // <- R4, linha 183
  if (rep.decisoesConsumidas !== r.decisoes.length) {
    problemas.push(`partida interrompida: a reprodução consumiu ${rep.decisoesConsumidas} de ${r.decisoes.length} decisão(ões) gravada(s)`)  // <- R3, linhas 184-186
  }
}
```

[Fonte: `src/net/replay.ts:209-218, 257-277`; `src/tools/replay-check.ts:50-92, 181-190`]

### Os três cenários já existentes em `guardaReplayV2` (fonte: `src/tools/determinism.ts:2965-3095`)

A função já monta e lê replays completos de três jeitos: `wo` (W.O. na rodada 1, termina `'fim'`), `anular` (queda dupla, termina `'interrompida'`) e `draft` (queda no draft, termina `'fim'`). Os três usam `novoCondutor` (`:1672-1677`), que cria `.gravacao = criarGravacao(CODIGO_DESCONHECIDO)` por padrão, e `replayDoCondutor` (`:2937-…`) para montar+serializar+reler. Os canários do AC 4(b) e 4(c) **reaproveitam os objetos `lido` que esses três cenários já produzem** (por exemplo `rw.lido` do cenário `wo`, que é `'fim'`; `ra.lido` do cenário `anular`, que já é `'interrompida'`) — não precisam de uma sala nova.

`salaNegativos` (`:2236-…`) também usa `novoCondutor` via a própria `nova(...)` local (`:2429`), e já tem, no bloco do AC 5(i) de `debt.14` (`:2439-2459`), uma sala com `tetoDeTicks: TETO` pequeno cujo round 0 fecha no teto com `over: false` confirmado (`:2451`, `!snapFinal.s.over`) — é o fixture pronto para o canário do AC 4(a).

[Fonte: `src/tools/determinism.ts:1656-1677, 2236-2461, 2937-3095`]

### `baseDoPersonagem` hoje (fonte: `src/sim/stats.ts:151-178`)

```ts
/**
 * ...
 * Devolve um objeto NOVO a cada chamada, sem cache por `def`: cada bola tem o próprio `base`.
 */
export function baseDoPersonagem(def: CharDef): StatBlock {
  return {
    maxHp: def.maxHp,
    radius: def.radius,
    mass: def.mass,
    maxSpeed: def.maxSpeed,
    steer: def.steer,
    drag: def.drag,
    ...DEFAULT_STATS,
    restBall: def.restBall ?? DEFAULT_STATS.restBall,
    restWall: def.restWall ?? DEFAULT_STATS.restWall,
  }
}
```

O comentário já promete "objeto novo a cada chamada"; o AC 5 só acrescenta a checagem que falta. `determinism.ts` importa `CHARS` (`:4`) e `createWorld` (`:7-16`), que por sua vez chama `baseDoPersonagem` internamente (`src/sim/world.ts:135-137`) — não é preciso importar `baseDoPersonagem` diretamente se o canário preferir construir duas bolas do mesmo `charId` via `createWorld` e comparar `.base`; se preferir a chamada direta, importar `baseDoPersonagem` de `../sim/stats.ts`.

[Fonte: `src/sim/stats.ts:151-178`; `src/sim/world.ts:135-137`; `src/tools/determinism.ts:4-16`]

### O que esta story explicitamente NÃO faz

- Não corrige nem toca `net/replay.ts` — o termo do teto em `classificarEncerramento` (AC 4a) continua exatamente como está; o canário só prova que a guarda depende dele.
- Não resolve `E412-DOC-001` (texto do AC 6 de `e4.12`) — é edição de story já Done, exclusiva do @po (ver "Depende de").
- Não decide `E412-ARC-001` (o campo `sujo` do carimbo) — está em progresso com o @architect, roteado separadamente; esta story não abre `server/main.ts`.
- Não adiciona um visualizador de replay nem muda a engine de verificação (Node, `replay-check.ts:29-38`).

### Testing

- `npm run check` — 0 erros.
- `npm run sim:check` — rodado antes e depois; golden hash idêntico; diff só dentro do bloco `bb.replay.v2`/`sala pura` e da(s) linha(s) de identidade do AC 5.
- `npm run build` — rc=0.
- Contrafactual completo (AC 8): MUT-REL-001, MUT-R1, MUT-R13, QM-B2 (mutações de código, cada uma numa cópia descartável, revertida) e os 6 casos de fixture (MUT-R4, MUT-R3, MUT-R6/R6b/R6c/R6d) — todos com o resultado (rc e mensagem) registrado no Dev Agent Record.
- Verificação adicional do AC 3: reprodução real dos 30 cliques por jogador contra um servidor local descartável (portas livres, nunca 5341-5345), com `npm run replay:check` dando `rc=0` no arquivo resultante.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-09-22 | 1.0 | Story criada a partir de `E412-REL-001` (medium) e `E412-TST-001` (low) do gate de `e4.12` (`docs/qa/gates/e4.12-replay-v2-causa-do-fim-pool-e-carimbo.yml`, revisão `a9ad204`) e de `E411-TST-001` (low) do gate de `e4.11` (`docs/qa/gates/e4.11-segredo-de-assento-e-loja-no-modo-conectado.yml`, revisão `eccff6a`). Escopo: `src/tools/partida.ts` (teto natural em `reproduzirPartida`, linha 371 só), `src/tools/determinism.ts` (8 canários na guarda de `bb.replay.v2` + 2 linhas de identidade do base do personagem), e `src/tools/replay-check.ts` só se necessário para o AC 4(d). `E412-DOC-001` fica registrado como nota em "Depende de", fora das Acceptance Criteria — é edição de texto de `e4.12` (story Done), exclusiva do @po. Status: Draft. | River (@sm) |
