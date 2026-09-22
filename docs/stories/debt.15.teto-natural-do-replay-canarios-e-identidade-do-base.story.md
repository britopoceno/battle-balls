# Story debt.15: Teto natural do replay, 8 canários na guarda da v2, identidade do base do personagem e `sujo` do carimbo ancorado na raiz — achados `E412-REL-001`, `E412-TST-001`, `E411-TST-001` e `E412-ARC-001`

## Status

Ready

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run check", "npm run sim:check (golden hash idêntico ao baseline atual)", "npm run build", "npm run replay:check contra a reprodução real do E412-REL-001 (30 cliques por jogador na fase builds, num servidor local descartável, portas livres — nunca 5341-5345, usadas pelo gate)", "as mutações do contrafactual (a que restaura o teto fixo em reproduzirPartida, a que tira o termo do teto de classificarEncerramento, e as demais listadas no AC 8 — 10 mutações de código, v1.1), cada uma numa cópia descartável, nunca na árvore compartilhada — todas com sim:check saindo com código diferente de 0", "AC 9 (E412-ARC-001): tabela do carimbo sujo numa cópia descartável com git, registrada no Dev Agent Record e não no sim:check — cenários (0)-(iv) com o valor esperado, e as quatro mutações do pathspec reprovando no cenário indicado, cada variante commitada na cópia antes dos cenários", "git show --stat <commit de implementação> — restrito a src/tools/partida.ts, src/tools/determinism.ts, src/server/main.ts, src/net/replay.ts (só o comentário de CodigoDoReplay) e (só se necessário) src/tools/replay-check.ts"]
```

## Story

**Como** desenvolvedor fechando quatro achados abertos pelo @qa nos gates de `e4.12` e `e4.11` (três de implementação direta e `E412-ARC-001` pela emenda do @architect à §7.3; Done, `docs/qa/gates/e4.12-replay-v2-causa-do-fim-pool-e-carimbo.yml` e `docs/qa/gates/e4.11-segredo-de-assento-e-loja-no-modo-conectado.yml`),
**eu quero** trocar o teto fixo `MAX_PASSOS` do caminho de replay de `reproduzirPartida` por um limite natural derivado da própria gravação, estender a guarda de `bb.replay.v2` em `src/tools/determinism.ts` com 8 canários baratos para as mutações que hoje sobrevivem, dar à guarda uma checagem de identidade para `baseDoPersonagem`, e fazer o `sujo` do carimbo do servidor olhar só o código que roda (`src/`, `package.json`, `package-lock.json`), por pathspec ancorado na raiz,
**para que** um replay honesto de uma partida longa (ou de um jogador clicando demais na tela de build) deixe de reprovar por falso negativo antes da coleta de `e4.7`, para que uma regressão na causa do fim de rodada/partida, no formato v2 ou no cache do base do personagem deixe de passar despercebida pelo `sim:check`, e para que `codigo.sujo` passe a dizer se o código que gravou difere do `commit` (hoje sai `true` quase sempre e não informa nada).

## Depende de

`e4.12` (`docs/stories/e4.12.replay-v2-causa-do-fim-pool-e-carimbo.story.md`, Done, commit de implementação `a9ad204`) — é dona de `E412-REL-001` e `E412-TST-001`, os dois achados do gate `docs/qa/gates/e4.12-replay-v2-causa-do-fim-pool-e-carimbo.yml` (CONCERNS, revisão `a9ad204`) que esta story fecha.

`e4.11` (`docs/stories/e4.11.segredo-de-assento-e-loja-no-modo-conectado.story.md`, Done, commit de implementação `eccff6a`) — é dona de `E411-TST-001`, o achado do gate `docs/qa/gates/e4.11-segredo-de-assento-e-loja-no-modo-conectado.yml` (CONCERNS, revisão `eccff6a`) que esta story fecha.

`docs/architecture-e4.md` §7.3, **"Emenda ao item 4 — `sujo` olha só o que roda"** (@architect, commit `3b6891c`, decisão sobre `E412-ARC-001`, o quarto achado do gate de `e4.12`). A emenda manda o delta de implementação para esta story (AC 9): uma linha de `src/server/main.ts` e dois comentários.

**Sem story de bloqueio na ordem de `src/tools/determinism.ts`.** `e4.12`, `e4.11`, `e4.10`, `debt.14` e `e4.6` estão todos Done (`docs/architecture-e4.md` §11.6.2 fecha a ordem `e4.8` → `debt.11` → `e4.9` → `e4.3` → `debt.12` → `debt.14` → `e4.10` → `e4.6`, e `e4.12`/`e4.11` vieram depois, também Done). **Pré-condição de início:** `git status --short src/tools/partida.ts src/tools/determinism.ts src/tools/replay-check.ts src/server/main.ts src/net/replay.ts` sai vazio.

**Ordem em `src/server/main.ts` (v1.1, decisão do @po): esta story vem ANTES da `e4.7`.** As duas abrem o arquivo (esta pelo AC 9, a `e4.7` pelo override de operação do AC 4 dela e pela constante de deflate). A `e4.7` só edita `src/server/main.ts` com esta story em **InReview ou Done** e com `git status --short src/server/main.ts` vazio; a condição é o Status, e não "o commit existe". Motivo: esta story é pequena e está pronta para começar, a linha `:121` citada aqui deslocaria com o override da `e4.7`, e o escopo de cada uma se prova por `git show --stat <commit de implementação>`, nunca por `git diff --stat` na árvore compartilhada.

**Esta story é pré-condição de COLETA da `e4.7` (v1.1, decisão do @po): Status Done antes da primeira partida da evidência.** Não é pré-condição de início da `e4.7` (a preparação dela não espera, fora de `src/server/main.ts`). Motivos: (a) `E412-REL-001` faz um replay honesto com cliques redundantes na tela de build reprovar, e a regra do AC 8 da `e4.7` chamaria isso de achado de determinismo; (b) sem o AC 9, o `codigo.sujo` dos replays da coleta sai `true` quase sempre e não serve de critério. O mesmo texto está em "Depende de" da `e4.7` (v1.14.0), como a pré-condição da `e4.11`.

**`E412-DOC-001` (low, docs) — fechado pelo @po fora desta story, sem AC aqui.** O AC 6 de `e4.12` citava "`9aa1b500` no tick 90, na medição da fonte", valor que o @qa não reproduziu a partir do driver da §7.3 (o driver independente deu `7aec17ab` no mesmo tick, idêntico em três commits). O texto do AC 6 de `e4.12` foi marcado como ilustrativo na `e4.12` v1.4.0. Não é escopo de implementação.
[Fonte: `docs/qa/gates/e4.12-replay-v2-causa-do-fim-pool-e-carimbo.yml`, achados `E412-DOC-001` e `E412-ARC-001`; `docs/architecture-e4.md` §7.3, emenda ao item 4]

## Acceptance Criteria

1. `npm run check` verde.

2. `npm run sim:check` verde, com **golden hash idêntico** ao baseline atual (nenhuma linha do golden hash muda de valor). As linhas que mudam de conteúdo são só as que os AC 4, 5 e 6 abaixo tocam diretamente (a saída da guarda `bb.replay.v2` dentro do bloco `sala pura`, a linha que ganha a checagem de identidade do AC 5 e, **só se** o canário do AC 4(a) acrescentar texto de sucesso ao `tetoTxt` de `salaVariantesEBordas`, a linha que imprime `bordas` — `determinism.ts:2557`); nenhuma outra seção (globais, telemetria, base, replay v1, codec do fio, etc.) muda de texto. O AC 9 não muda linha nenhuma do `sim:check` (a guarda usa `CODIGO_DESCONHECIDO` e não lê git).

3. **`E412-REL-001` — teto natural no caminho do replay.** Hoje `MAX_PASSOS = 64` (`src/tools/partida.ts:130`) é o mesmo teto fixo usado nas três funções que percorrem uma partida: `jogarPartida` (`:323-324`), `reproduzirPartida` (`:371`) e a partida por política (`:512-513`). No replay, esse número é controlado pela **entrada do jogador**: `{t:'build'}` é aceito toda vez que chega, mesmo repetido (`redutor.ts`, `aplicarBuild`; cada clique nos 8 botões da tela de build manda um, `telas.ts:162`, `main.ts:558`, e a sala grava todos). **MEDIDO pelo @qa** (gate de `e4.12`, `avaliacoes_pedidas.max_passos_64`): replays honestos de uma Bo5 dão 19 passos (3 rodadas), 24 (4) e 29 (5); repetindo o primeiro build K vezes, a falha começa em exatamente 66 passos (K=47 com 3 rodadas, K=37 com 5); no **servidor real** (porta 5345), 30 cliques por jogador na fase builds deram 64 builds aceitos e 79 passos, e `replay:check` deu `rc=1` com "a reprodução não chegou ao fim da partida: … não terminou (fase builds)"; o mesmo arquivo, numa cópia com `MAX_PASSOS = 640`, deu `rc=0`. O pior caso de 7 rodadas sem clique redundante fica em ≤ 51 passos (4 draft + 4 build + 2 pronto + 7 rodadas + 12 prontos de loja + ≤ 22 compras/trocas), então só builds redundantes estouram o teto de 64 hoje.

   A correção troca, **só em `reproduzirPartida` (`:371`)**, o teto fixo `MAX_PASSOS` pelo limite natural da própria gravação: `g.decisoes.length + g.rodadas.length + 1` (cada volta do laço consome exatamente uma decisão ou fecha exatamente uma rodada gravada, então esse limite nunca é curto demais para uma gravação genuína, e sobra 1 de folga para o `passo` de saída do laço). **`MAX_PASSOS` continua exatamente como está, sem tocar**, em `jogarPartida` (`:323-324`) e na partida por política (`:512-513`) — são a política de geração, não o replay, e o gate é claro: "`MAX_PASSOS` fica para `jogarPartida` e para o roteiro por política".

   **Guarda em `sim:check` (contrafactual, sem depender de servidor).** Numa das funções de `src/tools/determinism.ts` que já montam um `PartidaGravada`/gravação disponível para replay (por exemplo dentro de `guardaReplayV2`, ao lado dos cenários `wo`/`anular`/`queda`, `:2965-3095`), acrescentar um caso que reproduz o achado do gate DENTRO do `sim:check`: uma sala onde um jogador manda a mesma decisão `{t:'build', ...}` aceita repetidas vezes (o `redutor.ts` aceita builds repetidos enquanto o jogador não estiver `pronto`) até o total de passos da gravação (`decisoes.length + rodadas.length`) passar de 64 — o teto de hoje — mas continuar coberto pelo limite natural. Depois do fix, `reproduzirPartida` sobre essa gravação **não lança**. Registrar o resultado como mais uma linha do bloco `bb.replay.v2` (ao lado de `replay W.O.`/`replay anul.`/`replay queda`).

   **Contrafactual:** uma mutação que restaura o teto fixo (`MAX_PASSOS` no lugar do limite natural, só na linha `:371`) aplicada a uma cópia descartável tem de fazer esse caso novo reprovar (`sim:check` código diferente de 0, com a mesma mensagem "não terminou (fase builds)" que o gate mediu no servidor real).

   **Verificação adicional (registrada no Dev Agent Record, não é AC repetida):** reproduzir, contra um servidor local descartável (portas livres, nunca 5341-5345, que o gate já usou), o cenário exato que o gate mediu — 30 cliques por jogador na fase builds — e confirmar que `npm run replay:check` no arquivo resultante agora dá `rc=0` (antes da correção, o gate mediu `rc=1`).
   [Fonte: `docs/qa/gates/e4.12-replay-v2-causa-do-fim-pool-e-carimbo.yml`, achado `E412-REL-001`; `src/tools/partida.ts:130, 323-324, 360-390, 512-513`]

4. **`E412-TST-001` — 8 canários baratos na guarda de `bb.replay.v2`, um por mutação sobrevivente.** O gate mediu 8 mutações próprias que hoje sobrevivem à guarda (`sim:check` sai `rc=0` mesmo com elas aplicadas): `R1`, `R3`, `R4`, `R6`, `R6b`, `R6c`, `R6d` e `R13`. Cada uma ganha um canário na guarda, dentro de `guardaReplayV2` (`src/tools/determinism.ts:2965-3095`) ou de `salaVariantesEBordas` (`:2371-…`, que já cria condutores com `.gravacao` via `novoCondutor`, `:1672-1677`, pela `nova` local de `:2376`), reaproveitando fixtures que já existem sempre que possível — os canários pedidos pelo gate são deliberadamente baratos:

   - **(a) `R1` — o termo do teto na classificação (`classificarEncerramento`, `src/net/replay.ts:209-218`: `e.encerramento = w.over || w.tick >= depois.config.tetoDeTicks ? 'natural' : 'wo'`).** `salaVariantesEBordas` (`:2371`; **não** `salaNegativos`, `:2236`, como dizia a v1.0) já tem, no caso do AC 5(i) de `debt.14` (`:2439-2459`), a sala `v = nova('variantes', { tetoDeTicks: TETO })` (`:2429`, `TETO = 30` em `:2375`) cujo round 0 fecha exatamente no teto com `over: false` (o snap final confere `!snapFinal.s.over` na linha 2451) — é uma rodada que só fecha pelo TERMO do teto, nunca por `world.over`. Essa sala já roda com um `Condutor` que tem `.gravacao` por construção, e `montarReplay` vale no meio da partida (monta só as rodadas do `historico`, `net/replay.ts:252-256`). O canário falha por `falha(...)` (que empurra em `problemas`); o texto de sucesso, se houver, vai no `tetoTxt` (AC 2). **Canário:** depois de fechar o round 0 nesse ponto, montar o replay dessa gravação (`montarReplay(v.gravacao, v.sala)`, como `replayDoCondutor` já faz noutros pontos do arquivo) e afirmar que `rodadas[0].encerramento === 'natural'`. Sem o termo do teto (mutação: `w.over ? 'natural' : 'wo'`), a classificação vira `'wo'` para esse round, com `aoVivo.vencedor` provavelmente `-1` — o que também reprova a regra já existente do verificador ("W.O. com vencedor -1 ao vivo", `replay-check.ts:165-167`), então a asserção direta do canário é a defesa principal, e essa regra é uma segunda linha.
   - **(b) `R4` — a partida completa rotulada `'interrompida'` tem de reprovar.** Reaproveitar um replay `'fim'` já montado dentro de `guardaReplayV2` (por exemplo `rw.lido`, do cenário `wo`, ou qualquer replay completo do bloco). Numa CÓPIA do objeto lido, trocar `encerramento` para `'interrompida'` e chamar `verificarReplay`; tem de sair com o problema "o arquivo diz partida interrompida, e a reprodução chegou à fase fim" (`replay-check.ts:183`).
   - **(c) `R3` — a partida `'interrompida'` com uma decisão extra no fim tem de reprovar.** Reaproveitar `ra.lido` (o cenário `'anular'`, já `'interrompida'`, `:3040-3061`). Numa CÓPIA, acrescentar **uma decisão qualquer** (tipo `Decisao` válido, qualquer valor — por exemplo repetir a última) ao FIM de `decisoes`, e chamar `verificarReplay`; tem de sair com o problema de `decisoesConsumidas !== r.decisoes.length` (`replay-check.ts:184-186`). *(A reprodução para de consumir decisões assim que a fase volta a `'rodada'` com o limite de rodadas já atingido — `partida.ts:373` — então a decisão extra no fim nunca chega a ser tocada, e o teste não precisa reproduzir o jogo além do que já está gravado.)*
   - **(d) `R6`/`R6b`/`R6c`/`R6d` — um caso negativo por campo da v2 em `lerReplay` (`src/tools/replay-check.ts:50-92`).** Quatro casos, cada um partindo de um replay v2 válido serializado (`serializarReplay`/`JSON.parse`), mutado num único campo, e confirmando que `lerReplay` **lança**:
     - `R6` — `rodadas[i].encerramento` fora de `'natural' | 'wo'` (linhas 74-76);
     - `R6b` — `encerramento` (o da partida, nível raiz) fora de `'fim' | 'interrompida'` (linha 90);
     - `R6c` — `pool` vazio (`[]`) (linha 85, `r.pool.length === 0`);
     - `R6d` — `codigo` malformado — por exemplo `commit` não string/null, ou `sujo` não boolean/null (linhas 86-89).
     - *(v1.1, regra do contrafactual)* Cada amostra negativa é a amostra válida com **um** campo trocado, e o valor escolhido reprova **um** termo só do predicado: `R6c` com `pool: []` (reprova só `length === 0`, não `Array.isArray` nem o `every`); `R6d` com `codigo: { commit: 5, sujo: null }` (reprova só o termo do `commit`). Uma amostra que reprova dois termos deixa uma mutação que tira só um deles passar verde.
   - **(e) `R13` — o carimbo sobrevive à volta `montarReplay` → `serializarReplay` → `lerReplay`.** Um `Condutor` novo criado com `criarGravacao({ commit: 'sentinela-e412', sujo: true })` no lugar do `CODIGO_DESCONHECIDO` padrão de `novoCondutor` (`:1677`), jogado até o fim, montado, serializado e relido; afirmar que `lido.codigo.commit === 'sentinela-e412'` e `lido.codigo.sujo === true`. Sem essa checagem, `montarReplay` perdendo o carimbo (por exemplo devolvendo `CODIGO_DESCONHECIDO` fixo) passa verde, porque a guarda de hoje só grava com carimbo desconhecido e confere `null` (a lição de `e4.8`/`e4.9`: guarda por caso ≠ por campo).

   Cada canário soma à(s) linha(s) de saída do bloco `bb.replay.v2` dentro de `sala pura` (ao lado de `replay W.O.`/`replay anul.`/`replay queda`, `:3146-3147`), sem mudar nenhuma outra seção do `sim:check`.
   [Fonte: `docs/qa/gates/e4.12-replay-v2-causa-do-fim-pool-e-carimbo.yml`, achado `E412-TST-001`, `verificacao_independente` "Mutações próprias (15)"; `src/net/replay.ts:73-77, 209-218, 257-277`; `src/tools/replay-check.ts:50-92, 165-167, 181-190`; `src/tools/determinism.ts:1656-1677, 2439-2459, 2965-3095`]

5. **`E411-TST-001` — identidade de `baseDoPersonagem`.** O AC 8 de `e4.11` exige que `baseDoPersonagem` (`src/sim/stats.ts:166-178`) devolva "um objeto novo a cada chamada; nada de cache por `def`". Nenhuma guarda do repositório confere isso hoje: a mutação `QM-B2` do gate (um cache por `def`, tipo `Map<CharDef, StatBlock>`) passa em `tsc`, em `sim:check` (golden hash ✓) e no one-liner do AC 15 de `e4.11`. Só a comparação por identidade pega. Duas linhas em `src/tools/determinism.ts` (numa checagem já existente que tenha `CHARS` à mão — por exemplo perto de `createWorld(CHARS, setup(SEED_GUARDA))`, `:414`, ou como parte da checagem de escala já feita sobre `basePorChar`/`STAT_KEYS`, se existir uma; a escolha do ponto exato é do @dev):
   - `baseDoPersonagem(def) !== baseDoPersonagem(def)` para um `def` qualquer de `CHARS` — duas chamadas devolvem objetos distintos;
   - para o mesmo `charId`, dois `baseDoPersonagem(CHARS[charId])` (ou duas bolas do mesmo personagem criadas por `createWorld`) têm `.base` distintos por referência (`!==`).

   **Contrafactual:** a mutação `QM-B2` do gate de `e4.11` — um `Map` cacheando por `def` dentro de `baseDoPersonagem` — aplicada a uma cópia descartável, tem de fazer o `sim:check` sair com código diferente de 0 por essa checagem nova.
   [Fonte: `docs/qa/gates/e4.11-segredo-de-assento-e-loja-no-modo-conectado.yml`, achado `E411-TST-001`; `src/sim/stats.ts:151-178`]

6. **Golden hash e escopo dos ACs 3-5 e 9 não se misturam com outra seção.** As mudanças dos AC 3 e 4 ficam dentro do bloco `bb.replay.v2`/`sala pura` de `determinism.ts` (mais o canário do AC 4(a) em `salaVariantesEBordas`, a linha `:371` de `partida.ts`, e `net/replay.ts`/`replay-check.ts` só como LEITURA, salvo se o AC 4(d) precisar tocar `replay-check.ts` — ver AC 7). A mudança do AC 5 fica confinada a, no máximo, duas linhas novas de checagem e o import de `baseDoPersonagem`/`CHARS` se ainda não estiverem no arquivo. A do AC 9 fica confinada à linha `:121` e ao comentário `:106-114` de `src/server/main.ts` e ao comentário `:82-87` de `src/net/replay.ts`. Nenhuma delas toca `src/net/sala.ts`, `src/net/codec.ts`, `src/match/`, `src/shop/`, `src/bot/`, `src/chars/` ou `src/client/`.

7. **Escopo de arquivos, fechado.**

   | Permitido | Motivo |
   |---|---|
   | `src/tools/partida.ts` | só a linha `:371` de `reproduzirPartida` (AC 3) |
   | `src/tools/determinism.ts` | os 8 canários (AC 4) e as duas linhas de identidade (AC 5) |
   | `src/tools/replay-check.ts` | **só se** o AC 4(d) precisar de um pequeno ajuste para permitir a mutação de teste do campo (por exemplo, se `lerReplay` não expuser um jeito de o canário montar o JSON malformado sem duplicar a serialização) — nenhuma regra de validação nova além das já existentes nas linhas citadas no AC 4(d); se não precisar, o arquivo não é tocado |
   | `src/server/main.ts` | *(v1.1, AC 9)* a linha `:121` de `lerCodigo()` (o pathspec ancorado) e o comentário `:106-114` acima da função; nada mais (o `cwd`, o `rev-parse`, o `try/catch`, `CODIGO_DO_SERVIDOR` e o resto do arquivo não mudam) |
   | `src/net/replay.ts` | *(v1.1, AC 9)* **só** o comentário de `CodigoDoReplay` (`:82-87`); nenhuma linha de código |

   *(v1.1)* O bullet de Dev Notes "O que esta story explicitamente NÃO faz" que diz "esta story não abre `server/main.ts`" está superado por este AC e pelo AC 9; os ACs prevalecem.

   **Proibido, sem exceção:** qualquer linha de **código** de `src/net/replay.ts` (o arquivo entra só pelo comentário do AC 9; o termo do teto em `classificarEncerramento` continua como está, e o canário do AC 4(a) testa o comportamento de hoje, não corrige nada), `src/net/sala.ts`, `src/net/codec.ts`, `src/net/protocolo.ts`, `src/match/`, `src/shop/`, `src/bot/`, `src/chars/`, `src/client/`, `package.json` (nenhum script novo) e `docs/` (exceto a própria story). Prova por `git show --stat <commit(s) desta story>`.

8. **Contrafactual total, cada mutação com `sim:check` saindo com código diferente de 0, numa cópia descartável, revertida ao final:**
   - **MUT-REL-001** — restaurar `MAX_PASSOS` (teto fixo) no lugar do limite natural em `reproduzirPartida` (`partida.ts:371`);
   - **MUT-R1** — `classificarEncerramento` sem o termo do teto (`w.over` no lugar de `w.over || w.tick >= …`);
   - **MUT-R4** — `verificarReplay` sem a conferência `if (rep.chegouAoFim) problemas.push(...)` (`replay-check.ts:183`); o canário do AC 4(b) tem de reprovar;
   - **MUT-R3** — `verificarReplay` sem a conferência `rep.decisoesConsumidas !== r.decisoes.length` (`replay-check.ts:184-186`); o canário do AC 4(c) tem de reprovar;
   - **MUT-R6/R6b/R6c/R6d** — `lerReplay` sem, um de cada vez, a checagem do `encerramento` por rodada (`:74-76`), a do `encerramento` da partida (`:90`), o termo `r.pool.length === 0` (`:85`) e o termo do `commit` na forma do `codigo` (`:87`); o canário correspondente do AC 4(d) tem de reprovar (4 mutações);
   - **MUT-R13** — `montarReplay` devolvendo `CODIGO_DESCONHECIDO` fixo em vez de `g.codigo` (perde o carimbo sentinela);
   - **QM-B2** — cache por `def` (`Map`) dentro de `baseDoPersonagem` (AC 5).

   *(v1.1, correção do @po.)* A v1.0 tratava MUT-R4, MUT-R3 e MUT-R6* como "verificação de fixture", e não como mutação de código. Mas R3, R4, R6, R6b, R6c e R6d do gate de `e4.12` **são** mutações de código de `replay-check.ts` (o gate: "R3 (interrompida sem a conferência de decisões consumidas); R4 (interrompida sem `chegouAoFim`); R6… (lerReplay v2 sem validar…)"), e confirmar que o canário dispara no código de hoje é só o controle positivo dele, que não prova dente. As duas coisas ficam: o controle positivo (o canário passa no código de hoje, com a mensagem esperada) e a mutação (o canário reprova com a checagem removida). São **10 mutações de código** ao todo (MUT-REL-001, R1, R3, R4, R6, R6b, R6c, R6d, R13, QM-B2), cada uma numa cópia descartável, com rc e a mensagem registrados no Dev Agent Record. As mutações do AC 9 não entram aqui: não são de `sim:check`.
   [Fonte: consolidação dos AC 3, 4 e 5 acima; `docs/qa/gates/e4.12-replay-v2-causa-do-fim-pool-e-carimbo.yml`, "Mutações próprias (15)"]

9. **`E412-ARC-001` — `sujo` do carimbo olha só o que roda, por pathspec ancorado na raiz** *(v1.1, delta do @architect, `docs/architecture-e4.md` §7.3, "Emenda ao item 4", commit `3b6891c`).*

   **Código (uma linha).** Em `lerCodigo()` (`src/server/main.ts:116-126`), a linha `:121` troca `git(['status', '--porcelain'])` por:
   ```ts
   git(['status', '--porcelain', '--', ':(top)src/', ':(top)package.json', ':(top)package-lock.json'])
   ```
   O `cwd` continua o de hoje, a pasta do arquivo (`src/server/`, `:117-118`). Sem `--untracked-files=no`, sem pathspec relativo, e nada mais muda na função. `sujo` passa a querer dizer **"o código que o servidor executa difere de `commit`"**, e não "a árvore tem qualquer mudança". Formato, versão (`bb.replay.v2`), `lerReplay` e a guarda do `sim:check` não mudam (a guarda usa `CODIGO_DESCONHECIDO`, `net/replay.ts:94`, e não lê git).

   **Comentários (dois, só texto).** (a) `src/server/main.ts:106-114`: o texto de `:106-108` ("se a árvore dele tem mudança não commitada (`git status --porcelain` não vazio)") e o parágrafo ⚠️ de `:112-114` (que descreve o defeito como vigente, e ainda cita `replays/` "enquanto não estiver no `.gitignore`", que já está desde a `e4.11`) passam a dizer o que o campo significa, por que são esses três caminhos (§7.3: `src/` é o que roda, `package.json` decide o `"type": "module"`, `package-lock.json` fixa o `ws`; `tsconfig.json` e `node_modules/` ficam de fora), e **por que o `:(top)` é obrigatório**: com o `cwd` em `src/server/`, o pathspec relativo `src/` resolve para `src/server/src/` e o `sujo` sai sempre `false`, inclusive com `src/` modificado. (b) `src/net/replay.ts:82-87`, doc de `CodigoDoReplay`: o mesmo significado, sem o aviso antigo.

   **Verificação discriminante (registrada no Dev Agent Record; NÃO é `sim:check`).** Numa cópia descartável com git, fora da árvore do projeto (por exemplo `git archive HEAD src package.json package-lock.json tsconfig.json .gitignore` extraído no scratch, `git init`, commit, e uma junção para o `node_modules` do projeto, porque `main.ts` importa `ws`):
   - **A sonda lê o valor do código real, e não um comando redigitado.** Uma linha logo depois de `const CODIGO_DO_SERVIDOR = lerCodigo()` imprime `JSON.stringify(CODIGO_DO_SERVIDOR)` e chama `process.exit(0)` antes de o servidor escutar; roda com `node src/server/main.ts` na raiz da cópia.
   - **A sonda e cada variante do pathspec são COMMITADAS na cópia antes dos cenários.** Sem isso, a própria edição de `src/server/main.ts` suja `src/` e o cenário (i) dá `true` com o código certo (medido pelo @po: variante correta não commitada, árvore limpa fora dela → `sujo: true`).
   - Cenários, cada um desfeito antes do próximo:
     - **(0)** cópia recém-commitada, `git status --porcelain` vazio → `sujo: false`;
     - **(i)** + um arquivo não rastreado na raiz (fora de `src/`) → `false`;
     - **(ii)** + um arquivo rastreado de `src/` modificado → `true`;
     - **(iii)** + um arquivo **novo**, não rastreado, em `src/` → `true`;
     - **(iv)** *(acréscimo do @po)* + `package-lock.json` modificado → `true`.
   - **Mutações que têm de FALHAR** (cada uma é uma variante commitada na cópia, rodando os mesmos cenários): pathspec **relativo** (`-- src/ package.json package-lock.json`) reprova em (ii), (iii) e (iv); `--untracked-files=no` (sozinho ou somado ao `:(top)`) reprova em (iii); a **árvore inteira** (a linha de hoje) reprova em (i); só `':(top)src/'`, sem os dois `package*.json`, reprova em (iv).
   - "O campo existe e é booleano" **não** vale como verificação: o pathspec relativo passa nela.
   - Registrar no Dev Agent Record a tabela variante × cenário, com o valor de `sujo` lido pela sonda. **Medido pelo @po em `2e7dd25`, nesta receita, antes da implementação:** `:(top)` dá (0)=false, (i)=false, (ii)=true, (iii)=true, (iv)=true; relativo dá false nos cinco; `--untracked-files=no` dá (iii)=false; árvore inteira dá (i)=true; `:(top)src/` só dá (iv)=false. O @dev reproduz no commit de implementação, e não copia esta linha.
   [Fonte: `docs/architecture-e4.md` §7.3, "Emenda ao item 4" (`3b6891c`); `docs/qa/gates/e4.12-replay-v2-causa-do-fim-pool-e-carimbo.yml`, achado `E412-ARC-001`; `src/server/main.ts:105-128`; `src/net/replay.ts:82-94`]

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type**: Architecture / Testing (fecha um achado de comportamento — falso negativo de replay — e estende uma guarda de regressão já existente, sem regra de jogo nova)
**Secondary Type(s)**: —
**Complexity**: Medium — cinco arquivos no máximo (v1.1: + `server/main.ts`, uma linha e um comentário, e `net/replay.ts`, só comentário), dois deles (`determinism.ts`, `replay-check.ts` se tocado) já com estrutura de guarda estabelecida; o risco principal é a matemática do teto natural (AC 3) e a fidelidade de cada canário ao comportamento que ele diz proteger.

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
- `src/net/replay.ts` só no comentário de `CodigoDoReplay` (AC 9) — o AC 4(a) testa o comportamento de hoje, não o corrige (AC 7)
- *(v1.1, AC 9)* `lerCodigo()` com o pathspec ancorado `:(top)`, nunca o relativo (com `cwd` em `src/server/`, o relativo dá `sujo` sempre `false`) nem `--untracked-files=no` (cego a arquivo novo em `src/`)

## Tasks / Subtasks

- [ ] Task 0 — Pré-condição de início
  - [ ] Confirmar que `e4.12` (`a9ad204`) e `e4.11` (`eccff6a`) estão Done
  - [ ] Confirmar que `git status --short src/tools/partida.ts src/tools/determinism.ts src/tools/replay-check.ts src/server/main.ts src/net/replay.ts` sai vazio *(v1.1: + `server/main.ts` e `net/replay.ts`, AC 9)*

- [ ] Task 1 — `E412-REL-001`, teto natural (AC: 3, 8)
  - [ ] Trocar `if (passo > MAX_PASSOS)` por `if (passo > g.decisoes.length + g.rodadas.length + 1)` só na linha `:371` de `reproduzirPartida`, sem tocar `:323-324` nem `:512-513`
  - [ ] Construir, dentro de `guardaReplayV2` (ou função-irmã no mesmo arquivo), uma gravação com builds redundantes que ultrapassa 64 passos mas fica dentro do limite natural; confirmar que `reproduzirPartida`/o replay dela passa sem lançar
  - [ ] Aplicar MUT-REL-001 (restaurar `MAX_PASSOS`) numa cópia descartável; confirmar `sim:check` código != 0 com a mensagem "não terminou (fase builds)"; reverter
  - [ ] Verificação adicional: reproduzir os 30 cliques por jogador contra um servidor local descartável (portas livres); confirmar `npm run replay:check` dá `rc=0`; registrar porta, comandos e saída no Dev Agent Record

- [ ] Task 2 — `E412-TST-001`, os 8 canários (AC: 4, 7, 8)
  - [ ] (a) `R1` — estender o cenário de teto pequeno de `salaVariantesEBordas` (`:2371`, *v1.1: não `salaNegativos`*; AC 5(i) de `debt.14`, `:2439-2459`) com a asserção `rodadas[0].encerramento === 'natural'` sobre o replay montado da gravação
  - [ ] (b) `R4` — reaproveitar um replay `'fim'` já existente em `guardaReplayV2`; numa cópia, relabelar `'interrompida'`; confirmar que `verificarReplay` reprova
  - [ ] (c) `R3` — reaproveitar `ra.lido` (cenário `'anular'`); numa cópia, empurrar uma decisão extra ao fim de `decisoes`; confirmar que `verificarReplay` reprova por `decisoesConsumidas`
  - [ ] (d) `R6`/`R6b`/`R6c`/`R6d` — 4 casos negativos de `lerReplay`, um por campo (encerramento de rodada, encerramento de partida, pool vazio, codigo malformado); confirmar que cada um lança
  - [ ] (e) `R13` — condutor com carimbo sentinela não nulo; montar, serializar, reler; confirmar que o carimbo sobrevive
  - [ ] Aplicar MUT-R1, MUT-R3, MUT-R4, MUT-R6, MUT-R6b, MUT-R6c, MUT-R6d e MUT-R13 (todas mutações de código, AC 8 v1.1), cada uma numa cópia descartável; confirmar `sim:check` código != 0 em todas; reverter
  - [ ] Registrar, para os 6 canários de fixture (b, c, d×4), o controle positivo (passa no código de hoje, com a mensagem esperada) e a mutação correspondente (rc e mensagem) no Dev Agent Record

- [ ] Task 3 — `E411-TST-001`, identidade do base (AC: 5, 8)
  - [ ] Escolher o ponto de inserção em `determinism.ts` (checagem existente com `CHARS` à mão, ou nova checagem pequena e autocontida)
  - [ ] Acrescentar as duas linhas de identidade (`baseDoPersonagem(def) !== baseDoPersonagem(def)`; dois `.base` de bolas do mesmo `charId` distintos por referência)
  - [ ] Aplicar QM-B2 (cache por `def`) numa cópia descartável; confirmar `sim:check` código != 0; reverter

- [ ] Task 4 — Verificação (AC: 1, 2, 6, 7)
  - [ ] `npm run check` — 0 erros
  - [ ] `npm run sim:check` antes e depois — golden hash idêntico; diff só dentro do bloco `bb.replay.v2` e da(s) linha(s) de identidade
  - [ ] `npm run build` — rc=0
  - [ ] `git show --stat` do(s) commit(s) desta story, restrito aos arquivos do AC 7 (e, em `net/replay.ts`, só linhas do comentário de `CodigoDoReplay`)

- [ ] Task 5 — `E412-ARC-001`, `sujo` ancorado na raiz (AC: 6, 7, 9) *(v1.1)*
  - [ ] `src/server/main.ts:121`: o pathspec `-- ':(top)src/' ':(top)package.json' ':(top)package-lock.json'`, com o `cwd` de hoje
  - [ ] Comentários: `src/server/main.ts:106-114` e `src/net/replay.ts:82-87` com o significado novo e o porquê do `:(top)`; nenhuma linha de código em `net/replay.ts`
  - [ ] Cópia descartável com git, sonda e variante COMMITADAS; cenários (0)-(iv) na variante certa; as quatro mutações do AC 9 reprovando no cenário indicado; tabela no Dev Agent Record
  - [ ] Remover a cópia ao fim; nenhum processo fica escutando (a sonda sai antes de o servidor escutar)

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
| 2026-09-22 | 1.1 | **Delta do @architect dobrado na story (`E412-ARC-001`, `docs/architecture-e4.md` §7.3 "Emenda ao item 4", commit `3b6891c`). Status permanece Draft até a validação.** **(1) AC 9 novo:** `lerCodigo()` usa `git status --porcelain -- ':(top)src/' ':(top)package.json' ':(top)package-lock.json'` em `src/server/main.ts:121`, com o `cwd` de hoje (`src/server/`); comentários de `main.ts:106-114` e `net/replay.ts:82-87` com o significado novo. Verificação numa cópia descartável com git, no Dev Agent Record (não no `sim:check`): (0) limpa → false; (i) não rastreado fora de `src/` → false; (ii) `src/` modificado → true; (iii) arquivo novo em `src/` → true; mutações relativo / `--untracked-files=no` / árvore inteira reprovando em (ii)(iii) / (iii) / (i). **[AUTO-DECISION]** Cenário (iv) `package-lock.json` modificado → true, e a mutação "só `:(top)src/`" reprovando nele → acrescentados (razão: a emenda justifica os três caminhos, e sem (iv) tirar os dois `package*.json` do pathspec passaria verde). **Armadilha que o delta não trazia, medida pelo @po:** a sonda e cada variante têm de ser COMMITADAS na cópia antes dos cenários; a própria edição de `main.ts` suja `src/` e dá `sujo: true` no cenário (i) com a variante certa. **(2) Escopo:** AC 6/AC 7 passam de 3 para 5 arquivos (`server/main.ts` linha `:121` + comentário; `net/replay.ts` só comentário, nenhuma linha de código); o bullet de Dev Notes "não abre `server/main.ts`" fica superado pelo AC 7 (Dev Notes são do @dev; não editado). **(3) "Depende de":** fonte da emenda; pré-condição de início com `server/main.ts` e `net/replay.ts`; ordem em `server/main.ts` (esta story antes da `e4.7`); esta story é pré-condição de COLETA da `e4.7` (Status Done). `E412-DOC-001` passa de "roteado ao @architect" a "fechado pelo @po na `e4.12` v1.4.0". **(4) Título, Story, Executor Assignment, Tasks (Task 0, nova Task 5, Task 4) e CodeRabbit Focus** acompanham. Fatos conferidos em `2e7dd25`: `main.ts:121` traz `git(['status', '--porcelain'])`; `main.ts:112-114` é o parágrafo ⚠️; `main.ts:117-118` define `pasta` e o `cwd`; `net/replay.ts:82-87` é o doc de `CodigoDoReplay` e `:94` é `CODIGO_DESCONHECIDO`; `package.json:5` `"type": "module"`, `:12` `node src/server/main.ts`, `:22` `ws`. | Pax (@po) |
| 2026-09-22 | 1.2 | **Validação @po (`*validate-story-draft`, 10 pontos): GO 9/10. Status: Draft → Ready.** Ponto perdido: item 3 (ACs testáveis), por dois defeitos da v1.0, os dois corrigidos aqui. **(a) AC 8 sem dente em 6 das 10 mutações:** MUT-R3, MUT-R4 e MUT-R6/R6b/R6c/R6d eram "verificação de fixture" (confirmar que o canário dispara no código de hoje), que é só o controle positivo. No gate de `e4.12` elas são mutações de código de `replay-check.ts` (tirar a conferência de `:183`, de `:184-186`, e cada validação de `:74-76`, `:85`, `:87`, `:90`). Agora são 10 mutações de código, e o controle positivo continua registrado. O AC 4(d) ganhou a regra "uma amostra, um campo, um termo" (`pool: []`, `codigo.commit: 5`). **(b) AC 4(a) citava a função errada:** o cenário do teto (`v = nova('variantes', { tetoDeTicks: TETO })`, `:2429`) está em `salaVariantesEBordas` (`:2371`), e não em `salaNegativos` (`:2236`). Corrigidos o AC 4 (intro e (a)) e a Task 2(a); o AC 2 passa a admitir a linha de `bordas` (`:2557`) se o canário acrescentar texto ao `tetoTxt`. **Itens:** 1 título ✓ · 2 descrição ✓ · 3 ACs testáveis ✗→corrigido · 4 escopo ✓ (5 arquivos, `net/replay.ts` só comentário) · 5 dependências ✓ (`e4.12`/`e4.11` Done, emenda `3b6891c`, ordem em `server/main.ts`) · 6 complexidade ✓ (Medium) · 7 valor ✓ (falso negativo antes da coleta da `e4.7`; `sujo` passa a informar) · 8 riscos ✓ (escala ao @po se o código de hoje divergir; armadilhas do pathspec e da sonda não commitada) · 9 DoD ✓ (Tasks 4-5, AC 1/2/8/9) · 10 alinhamento ✓ (gate de `e4.12`/`e4.11` e §7.3). **Fatos conferidos em `2e7dd25`:** `partida.ts:130` `MAX_PASSOS = 64`, `:360` `reproduzirPartida`, `:371` o teto do replay, `:323-324` e `:512-513` os outros dois usos; `redutor.ts:262-277` `aplicarBuild` aceita build repetido até o `pronto`; `net/replay.ts:209` `classificarEncerramento`, `:217` o termo do teto, `:257` `montarReplay` (monta a qualquer momento, `:252-256`), `:266` o carimbo; `replay-check.ts:50` `lerReplay`, `:74`, `:85`, `:87`, `:90` as quatro validações, `:166` a regra do W.O. com vencedor −1, `:174` `pararDepoisDeRodadas`, `:183`/`:184` as duas conferências da interrompida; `determinism.ts:1672-1677` `novoCondutor` com `CODIGO_DESCONHECIDO`, `:2451` `!snapFinal.s.over`, `:2937` `replayDoCondutor`, `:2965` `guardaReplayV2`, `:2999`/`:3040` `rw`/`ra` (`{lido, texto} | null`), `:3146-3147` a saída; `stats.ts:166` `baseDoPersonagem`; `world.ts:137` `base: baseDoPersonagem(def)`. **AC 9 medido pelo @po numa cópia descartável** (`git archive` de `2e7dd25` + `git init` + junção de `node_modules` + sonda commitada): a matriz de variantes × cenários do AC 9 bate com a emenda do @architect, e a sonda não commitada dá `sujo: true` no cenário (i). A cópia foi apagada; nenhum processo ficou escutando. **Decisões do @po:** ordem em `server/main.ts` (esta antes da `e4.7`), pré-condição de COLETA da `e4.7` (Status Done), e o `codigo.sujo === false` aceito como equivalente à conferência manual do AC 8 da `e4.7` (registrado na `e4.7` v1.14.0). | Pax (@po) |
