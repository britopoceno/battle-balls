# Story debt.11: Guarda automática da telemetria no `sim:check` — achado `DEBT10-TST-001`

## Status

Done

> **Ready, com pré-condição de início (v1.1).** @dev: esta story começa **depois do commit de
> implementação de `e4.8`**, com `git status --short src/tools/determinism.ts` vazio. Ordem registrada pelo
> @po em `e4.8` v1.1.0 e `e4.3` v1.4.0: **`e4.8` → `debt.11` → `e4.3`**. Ver AC 12.
>
> *(v1.5, @po: a nota acima é histórica, e a story está Done desde o gate CONCERNS `ca52e07`. A ordem
> vigente de `src/tools/determinism.ts` é `e4.8` → `debt.11` → `e4.9` → `e4.3` → `debt.12` → `e4.6`, pela
> §11.6.1 de `architecture-e4.md` e `e4.8` v1.5.0. Os achados do gate vão para `debt.13`, que não entra
> nessa ordem. Ver o Change Log, v1.5.)*

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run check", "npm run sim:check (golden hash idêntico ao baseline atual; diff da saída completa antes×depois SÓ COM INSERÇÃO — R8)", "as 6 mutações aplicadas à mão (M1, M1b, M2, M3 do gate; MR1, MR2 da restauração — AC 7), cada uma revertida depois — cada uma deve fazer sim:check sair com código diferente de 0", "restauração dos globais (AC 5): critério por par (objeto, chave), inclusive URL.createObjectURL; descritores comparados campo a campo (value/get/set por Object.is, os três atributos por igualdade), nunca por JSON.stringify; ramo 'tinha descritor' exercitado pelo menos uma vez", "grep -rn \"from '\\.\\./client/\" src/tools/ — critério por arquivo e destino, não por contagem (AC 11): as 2 linhas de tools/telemetria.ts sem mudança (→client/input.ts; →client/telemetria.ts, import type) mais 1 ou 2 linhas de tools/guarda-telemetria.ts, todas →client/telemetria.ts; grep -rln com o mesmo padrão devolve exatamente tools/guarda-telemetria.ts e tools/telemetria.ts", "os 5 exports reais de docs/evidence/telemetria/ rodados pelo CLI (tools/telemetria.ts) antes e depois desta story — saída byte a byte idêntica", "node src/tools/telemetria.ts sem argumento continua imprimindo 'uso:' e saindo com 1, depois da guarda de entrada do AC 4", "git show --stat <commit(s) desta story> — NUNCA a árvore de trabalho compartilhada, porque determinism.ts está disputado por outras stories em voo (ver AC 12)"]
```

## Story

**Como** desenvolvedor fechando o achado `DEBT10-TST-001` do gate de `debt.10`
(`docs/qa/gates/debt.10-telemetria-marca-atraso-de-input.yml`, severidade medium),
**eu quero** uma guarda automática, headless, dentro do `sim:check`, que exercite o coletor real
(`client/telemetria.ts`) e o agregador real (`tools/telemetria.ts`) contra um fixture misto sintético e
contra as 4 mutações que o gate de `debt.10` já demonstrou serem invisíveis para `check`/`sim:check`/`build`,
**para que** uma edição futura que desfaça o carimbo por evento ou a partição por população seja pega
automaticamente, em vez de precisar de novo de um `@qa` reconstruindo o mesmo arnês manual no scratchpad —
exatamente o defeito que `DEBT10-TST-001` registrou, e cujo custo, se não fechado, é contaminar de novo a
evidência que `debt.9` (pré-condição b) e o baseline de P4.4 (`e4.7`) vão precisar usar.

## Depende de

`debt.10` (`3de1cfe`, Done, 2026-09-21) — abriu o achado `DEBT10-TST-001` (gate
`docs/qa/gates/debt.10-telemetria-marca-atraso-de-input.yml`, severidade medium) que esta story fecha, e é
dona do estado de `src/client/telemetria.ts` (carimbo por evento de `atrasoTicks`/`escalaHp` dentro de
`registrar()`) e `src/tools/telemetria.ts` (partição por população em `agregar()`) que esta guarda passa a
proteger contra regressão.

`docs/architecture-e4.md` §2.2 (commit `6f8ee7c`, 2026-09-21) — **decisão vinculante do @architect**, que
fixa onde a guarda mora, como ela se conecta a `determinism.ts`, a forma do fixture, as 4 mutações que ela
precisa pegar, a definição única de "sem carimbo", o escopo fechado de arquivos, a imobilidade do golden
hash e a seta de camada `tools/ → client/`, agora **declarada** com lista fechada (era um desvio não
documentado desde `e3.5`; §2.2 a formaliza no mesmo commit que autoriza esta story). Os itens **R1–R10**
dessa seção são o contrato de forma desta story — citados abaixo, não resumidos de memória.

**Não depende de conteúdo de `e4.3`, `e4.6` nem `e4.8`, mas é SEQUENCIADA entre elas (R9, ver AC 12).**
As quatro disputam `src/tools/determinism.ts` numa árvore de trabalho só. Estado em 2026-09-21 (commit
`b76b6ff`): `e4.8` Ready (GO 10/10), `e4.3` Ready (v1.4.0, GO 9/10), `e4.6` Ready. **Ordem decidida pelo
@po** e registrada em `e4.8` ("Depende de", v1.1.0) e `e4.3` ("Sequência", v1.4.0): **`e4.8` → `debt.11` →
`e4.3`**. `e4.6` depende de `e4.3` e de `e4.4`, e por isso já vem depois das três. A implementação desta
story começa depois do commit de implementação de `e4.8`. Ver AC 12 para o caso de exceção.
*(v1.5: ordem vigente `e4.8` → `debt.11` → `e4.9` → `e4.3` → `debt.12` → `e4.6`, por `e4.8` v1.5.0. A
posição de `debt.11` não mudou, e a implementação `971686b` seguiu a ordem da época.)*

**Origem exata do achado — citado, não resumido de memória:**

> Nenhuma guarda no repositório protege o que esta story entrega. As 4 mutações que rodei (sem carimbo,
> carimbo no export, ausente → 0/1.0, sem partição) passam em check, sim:check e build. Os 11 testes do
> @dev e o meu arnês ficaram no scratchpad, porque o AC 10 não autoriza arquivo de teste, então a omissão é
> correta dentro do escopo. O sim:check não carrega client/ nem tools/telemetria.ts. É mais uma ocorrência
> do padrão "o caminho que importa nunca é testado" deste projeto (E41-TST-003 na e4.1). Aqui o custo de uma
> regressão é exatamente o defeito que a story fechou: evidência de debt.9 (pré-condição b) e baseline de
> P4.4 (e4.7) contaminadas sem nenhum sinal.

[Fonte: `docs/qa/gates/debt.10-telemetria-marca-atraso-de-input.yml`, achado `DEBT10-TST-001`]

**Roteamento do @po que criou esta story (citado, não resumido):**

> **DEBT10-TST-001 (medium) → STORY NOVA, a criar pelo @sm (`*create-story`, sugestão `debt.11`: "guarda
> headless da partição de telemetria").** Não cabe em nenhuma story existente. `e4.5` proíbe
> `client/telemetria.ts` e `src/tools/` (AC 12/14). `e4.3` e a story do codec abrem `determinism.ts`, mas
> nada de telemetria, e anexar lá misturaria o gate do fio com o da telemetria. [...] **Onde a guarda vive:
> recomendação do @po, dentro do `sim:check`**, porque é o comando que todo gate já roda [...] **A seta é
> decisão do @architect**, e é pré-condição da story: `tools/determinism.ts → tools/telemetria.ts →
> client/`. [...] **Sequência:** `determinism.ts` é disputado pela story do codec e por `e4.3`. `debt.11`
> começa depois do commit de implementação da que estiver em curso, com escopo conferido por `git show
> --stat <commit próprio>`. **Prazo:** o do AC 11 desta story [`debt.10`], antes da primeira coleta humana
> usada como evidência de `debt.9` (pré-condição b) ou como baseline de P4.4 (`e4.7`).

[Fonte: `docs/stories/debt.10.telemetria-marca-atraso-de-input.story.md`, Change Log v1.4, @po]

**R10, decidido pelo @po (v1.1): sim, `e4.7` deve listar `debt.11` como pré-condição.** O motivo é o AC 8
de `e4.7`: a evidência de P4.4 inclui "exports de telemetria das partidas", ou seja, a coleta que o prazo
de R10 protege. A forma da pré-condição é **de coleta, não de início**: nenhuma partida cujo export entre
na evidência de `e4.7` é jogada antes do commit de implementação de `debt.11` existir. `e4.7` pode ser
preparada antes disso (aparelhos, override de operação). A emenda no texto de `e4.7` **não** é feita por
esta story nem nesta validação. Fica roteada ao @po para a próxima edição de `e4.7`. Ver AC 13.

## Acceptance Criteria

1. `npm run check` verde.
2. `npm run sim:check` verde, com **golden hash idêntico** ao baseline atual. O `diff` da saída completa do
   `sim:check` antes × depois desta story é **só inserção**: as linhas da seção nova da guarda, num ponto
   fixo depois das seções que já existem hoje. Nenhuma linha existente muda de conteúdo ou troca de lugar.
   O argumento de neutralidade é de construção: a guarda não chama nada de `sim/` nem de `match/`, e os
   módulos novos no fecho de execução não têm estado de topo que `sim/` leia. A prova é o `diff`, não a
   afirmação (`architecture-e4.md` §2.2, **R8**).
3. **Casa da guarda.** A guarda mora em `src/tools/guarda-telemetria.ts` (novo), que exporta uma função no
   mesmo molde de `verificarPartida` (`src/tools/partida.ts:880`) —
   `export function verificarTelemetria(): { linhas: string[]; problemas: string[] }`, **sem lançar e sem
   `process.exit`**. `src/tools/determinism.ts` recebe **só**: o import dessa função, a chamada, uma linha
   de seção na saída (`console.log` das `linhas`) e um bloco `throw` no mesmo padrão dos que já existem
   (ex.: `throw new Error(...)` quando `problemas.length > 0`, como o bloco de `verificarPartida` na
   linha ~961). `determinism.ts` **não** recebe import de `client/` nem de `tools/telemetria.ts`
   diretamente — só de `guarda-telemetria.ts` (`architecture-e4.md` §2.2, **R1**).
4. **Guarda de ponto de entrada em `tools/telemetria.ts`.** `main()` (hoje chamado incondicionalmente na
   linha 307) passa a rodar **só quando o arquivo é a entrada do processo**. Forma preferida:
   `if (import.meta.main) main()`. Se o `@dev` usar comparação de `process.argv[1]` com `import.meta.url`
   em vez disso, registrar no Dev Agent Record o cuidado com a caixa da letra de unidade no Windows. **Essa
   é a única mudança de corpo em `tools/telemetria.ts`**, fora o texto opcional do AC 9
   (`DEBT10-COD-003`). Nenhum import novo fora de `node:`, nenhum `export` novo — a guarda lê `agregar()`,
   que já é exportado. **Provas obrigatórias, registradas no Dev Agent Record:**
   - (a) importar o módulo (como a guarda faz) **não** encerra o processo;
   - (b) `node src/tools/telemetria.ts`, sem argumento, continua imprimindo `uso: node
     src/tools/telemetria.ts <arquivo.json>` e saindo com código 1;
   - (c) sobre os 5 exports reais de `docs/evidence/telemetria/`, a saída do CLI é **byte a byte igual** à
     de antes desta story.

   Sem (b) e (c), uma guarda de entrada que nunca é verdadeira passaria despercebida — o CLI ficaria mudo e
   o `sim:check` continuaria verde. Registrar também a versão do Node usada: `import.meta.main` não existe
   em versões antigas, e ali o CLI ficaria mudo sem erro (`architecture-e4.md` §2.2, **R2**).
5. **A guarda exercita o coletor real, não uma réplica.** `verificarTelemetria()` chama
   `criarTelemetria()`/`registrar()` de `client/telemetria.ts` de verdade, com um `localStorage` falso, e
   observa o que `exportar()` entregaria (pode capturar o conteúdo do `Blob` com um `document` mínimo).
   **O cenário do coletor é o do gate de `debt.10`:** o `localStorage` falso começa com pelo menos um evento
   **sem carimbo** gravado sob `CHAVE` (acúmulo antigo). A guarda chama `criarTelemetria()`, registra
   eventos novos e captura o conteúdo exportado. Depois afirma as duas direções sobre esse conteúdo: todo
   evento novo traz `atrasoTicks` e `escalaHp` finitos, e o evento antigo continua sem carimbo. A primeira
   asserção pega a M1 e a segunda pega a M1b (AC 7), e a guarda precisa das duas. Todo global instalado
   (`localStorage`, `document`, etc., e qualquer propriedade de global nativo trocada, como
   `URL.createObjectURL`) é **restaurado pelo descritor original** num bloco `finally`. O descritor é
   capturado com `Object.getOwnPropertyDescriptor` antes de instalar. **Se ele existia**, a restauração é
   `defineProperty` com ele, **nunca** `delete`. É o caso que R3 protege: um `localStorage` nativo de um
   Node futuro não pode ser apagado. **Se ele não existia**, a propriedade é a que a própria guarda criou, e
   removê-la é o único jeito de voltar ao estado anterior. Esse é o caso de `localStorage` e `document` no
   Node 24.13.1 deste projeto, que não têm descritor próprio em `globalThis` (medido na validação do @po).
   **Critério verificável:** para cada par (objeto, chave) trocado pela guarda (`globalThis.localStorage`,
   `globalThis.document`, `URL.createObjectURL` e qualquer outro), o descritor próprio depois da guarda é
   igual ao de antes, inclusive quando ausente. A comparação é campo a campo (`value`/`get`/`set` por
   `Object.is`, os três atributos por igualdade), não por `JSON.stringify`. Todos os descritores são
   capturados antes da primeira instalação, e a propriedade criada no caso ausente leva
   `configurable: true`. A guarda confere o critério ela mesma, depois do `finally`, e a divergência vira problema. O ramo
   'tinha descritor' roda pelo menos uma vez no Node do projeto: pela troca de `URL.createObjectURL` ou por
   um objeto de sonda com propriedade pré-existente. `console.warn` é capturado durante a execução da guarda, e
   a saída do `sim:check` não ganha linhas `[telemetria]` soltas fora da seção da guarda. A guarda pode
   afirmar sobre os avisos capturados (`architecture-e4.md` §2.2, **R3**, e a ratificação de 2026-09-21,
   `d72325b`, precisões **P1–P3**).
6. **O fixture misto vive em código, dentro de `guarda-telemetria.ts`, não em `docs/`.** Nada de
   `docs/evidence/telemetria/fixture-misto.json` (a sugestão original do gate foi revista pelo @architect).
   Motivos registrados na fonte: o `sim:check` hoje só lê disco em `src/chars/`; `docs/evidence/` é pasta de
   evidência que humanos substituem/reeditam, e trocar um JSON de lá mudaria o teste sem diff em `src/`; e o
   fixture em código deixa visível, no próprio diff revisável, a propriedade que discrimina. Composição
   mínima do fixture: pelo menos **duas populações conhecidas** com rodadas plausíveis (ex.: (6, 6) e
   (0, 6)) mais eventos sem carimbo, de modo que **nenhuma população tenha o `n` combinado** — a mesma
   propriedade discriminante que o `@qa` usou no gate de `debt.10` (`architecture-e4.md` §2.2, **R4**).
7. **As 4 mutações do gate e as 2 da restauração reprovam o `sim:check`.** Cada uma aplicada à mão,
   `npm run sim:check` rodado e revertido, com resultado registrado no Dev Agent Record:
   - **M1** — sem carimbo em `registrar()`;
   - **M1b** — carimbo movido para `exportar()`;
   - **M2** — `atrasoTicks ?? 0` / `escalaHp ?? 1` em `populacaoDe()`;
   - **M3** — `agregar()` devolvendo `agregarPopulacao(eventos)` sem partição;
   - **MR1** — a restauração sempre com `delete`;
   - **MR2** — o caso ausente restaurado por atribuição (`= undefined` ou `defineProperty` com
     `value: undefined`) em vez de `delete`.

   As 6 precisam sair com código diferente de 0. MR1 e MR2 vêm da precisão **P2** da ratificação de R3
   (`architecture-e4.md` §2.2, `d72325b`): sem elas, uma restauração que sempre faz `delete` passa verde no
   Node 24.13.1 e apagaria o `localStorage` nativo de um Node futuro. **As asserções sobre `agregar()` leem rótulo e cabeçalho**
   (quantos blocos `P3.1`, presença da população "desconhecida"), **não números formatados**. Uma asserção
   que só confere "o carimbo existe" não pega a M2; uma que só confere "há aviso" não pega a M3 —
   precedente exato do que o `@qa` observou no gate (`architecture-e4.md` §2.2, **R5**).
8. **Uma só definição de "sem carimbo".** A guarda fixa a definição já usada no agregador
   (`!Number.isFinite`, validada no gate de `debt.10`). Se o `@dev` também aplicar `DEBT10-COD-003` nesta
   story (opcional — alinhar `ler()`, hoje `=== undefined`, à mesma definição), a guarda pode afirmar que a
   contagem do aviso de `ler()` bate com a população desconhecida. **Se `DEBT10-COD-003` não entrar, a
   guarda não afirma nada sobre a contagem de `ler()` para `null`/string** — fixar a divergência num teste
   sem corrigi-la seria pior do que deixá-la registrada (`architecture-e4.md` §2.2, **R6**; achado
   `DEBT10-COD-003` no gate de `debt.10`).
9. **`DEBT10-DOC-002` (opcional, mesmo escopo de arquivo já aberto por esta story).**
   `docs/evidence/telemetria/README.md`, linha `b8e8a41`: a janela de atraso 6 sem carimbo passa a valer
   explicitamente **só para um bundle que contém `b8e8a41` e não contém o commit de `debt.10`** — como os
   dois vão no mesmo push, essa janela é vazia no build publicado e só existe em sessões de dev server
   local. A linha `debt.10` ganha a hora (`2026-09-21 03:58:44 −03`), no mesmo formato das outras duas
   linhas da tabela.
10. **Escopo de arquivos (lista fechada, `architecture-e4.md` §2.2, R7).**

    | Permitido | Motivo |
    |---|---|
    | `src/tools/guarda-telemetria.ts` | novo — a guarda, o fixture sintético (AC 6), a restauração de globais (AC 5) |
    | `src/tools/determinism.ts` | **só** o import da guarda, a chamada, a linha de seção e o bloco `throw` (AC 3) |
    | `src/tools/telemetria.ts` | **só** a guarda de ponto de entrada (AC 4) e, opcionalmente, o texto de `DEBT10-COD-003` |
    | `src/client/telemetria.ts` | **só se** `DEBT10-COD-003` entrar nesta story, e **só** o predicado de `ler()` (AC 8) |
    | `docs/evidence/telemetria/README.md` | anotação de `DEBT10-DOC-002` (AC 9) |

    **Proibido, sem exceção:** `package.json` (nenhum script novo — a guarda roda dentro do `sim:check`
    existente, não por um comando irmão); `src/sim/`, `src/match/`, `src/shop/`, `src/bot/`, `src/chars/`,
    `src/net/`; `client/main.ts`, `client/input.ts`, `client/layout.ts`, `client/render.ts`; e qualquer
    outro arquivo de `tools/` além dos três listados acima (inclui `tools/harness.ts` e `tools/partida.ts`,
    que a guarda só pode citar como precedente de forma, não importar).
11. **Seta `tools/ → client/`, declarada e fechada (`architecture-e4.md` §2.2).** A conferência é
    ```sh
    grep -rn "from '\.\./client/" src/tools/
    ```
    e o critério é **por arquivo e por módulo de destino, não por contagem de linhas**. A tabela abaixo lista
    pares (arquivo de `tools/` → módulo de `client/`), não linhas do grep. Um arquivo pode importar valores
    e tipos numa linha só ou em duas (`import { … }` e `import type { … }`). **Hoje, antes de `debt.11`**, o
    grep devolve **2 linhas, de 1 arquivo** (`tools/telemetria.ts:2` → `client/input.ts`, `:3` →
    `client/telemetria.ts`, `import type`). **Depois de `debt.11`**, ele devolve essas 2 linhas **sem
    mudança de conteúdo**, mais 1 ou 2 linhas de `tools/guarda-telemetria.ts`, **todas com destino
    `../client/telemetria.ts`**. Conferência do conjunto de arquivos, que deve ser exatamente
    `src/tools/guarda-telemetria.ts` e `src/tools/telemetria.ts` (os "dois arquivos" de §2.2):
    ```sh
    grep -rln "from '\.\./client/" src/tools/
    ```
    Os pares permitidos são os da lista fechada:

    | Arquivo de `tools/` | Importa de `client/` | Tipo |
    |---|---|---|
    | `tools/telemetria.ts` | `client/input.ts` (`ARRASTO_MAX`, `LIMIAR_ARRASTO_PX`) | execução (pré-existente, `e3.5`) |
    | `tools/telemetria.ts` | `client/telemetria.ts` (`ArquivoTelemetria`, `EventoRegistrado`) | só tipo (pré-existente) |
    | `tools/guarda-telemetria.ts` | `client/telemetria.ts` (`criarTelemetria`, `CHAVE` e os tipos) | execução (novo, esta story) |

    Nenhum arquivo novo entra nessa lista por decisão desta story — um arquivo novo é emenda de
    `architecture-e4.md` §2.2, não decisão de story. `determinism.ts`, `harness.ts` e `partida.ts` **não**
    importam `client/` — se o grep os incluir, é regressão.
12. **Sequenciamento (R9), decidido pelo @po.** `src/tools/determinism.ts` é disputado por `e4.8`, esta
    story, `e4.3` e `e4.6`, todas Ready. A ordem é **`e4.8` → `debt.11` → `e4.3`**, a mesma registrada em
    `e4.8` v1.1.0 e `e4.3` v1.4.0. `e4.6` depende de `e4.3` e `e4.4` e já vem depois.
    *(v1.5, @po, anotação sem mudança de critério: a ordem vigente é `e4.8` → `debt.11` → `e4.9` →
    `e4.3` → `debt.12` → `e4.6`, por `e4.8` v1.5.0. Este AC foi cumprido na ordem da época, conforme o
    gate.)*
    - **Pré-condição de início:** o commit de implementação de `e4.8` existe e
      `git status --short src/tools/determinism.ts` sai vazio.
    - **Exceção, pela regra de `e4.3` v1.4.0:** se `e4.3` tiver começado antes desta (por exemplo, porque
      `e4.8` fechou com `debt.11` ainda não iniciada), esta começa depois do commit de implementação de
      `e4.3`, com a mesma pré-condição de árvore limpa.
    - A Task 0 registra no Dev Agent Record o hash usado como base e qual dos dois casos valeu.

    O escopo é conferido por `git show --stat <commit(s) desta story>`, **nunca** pela árvore de trabalho
    compartilhada, porque mais de uma story concorrente pode ter arquivos de `determinism.ts` modificados ao
    mesmo tempo. As stories
    seguintes que fazem "`sim:check` antes × depois" passam a ver a seção da guarda de telemetria na saída;
    como a inserção é fixa (AC 2), o `diff` delas continua vazio desde que o "antes" seja tirado depois de
    `debt.11`.
13. **Prazo (R10).** Esta story deve estar concluída antes da primeira coleta humana usada como evidência
    de `debt.9` (pré-condição b) ou como baseline de P4.4 (`e4.7`, hoje Ready) — o mesmo prazo do AC 11 de
    `debt.10`. **Roteamento do @po (v1.1): `e4.7` passa a listar `debt.11` como pré-condição de coleta.**
    Nenhuma partida cujo export entre na evidência do AC 8 de `e4.7` é jogada antes do commit de
    implementação desta story. A emenda de `e4.7` é do @po, numa edição própria de `e4.7`. Esta story não
    edita `e4.7`, e o fechamento desta story não depende dessa emenda.

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type**: Architecture / Testing (guarda headless de regressão, sem regra de jogo nova)
**Secondary Type(s)**: Frontend / Instrumentation (toca o coletor real de `client/telemetria.ts` só para
exercitá-lo, mesma classificação de `debt.10`)
**Complexity**: Medium — a superfície de código é pequena (1 arquivo novo, mudanças mínimas em 2 arquivos
existentes), mas a story carrega uma restrição de forma fechada e detalhada pelo @architect (R1–R10), uma
seta de camada nova a manter fechada por grep, e coordenação de sequência com até três stories concorrentes
em `determinism.ts`.

### Specialized Agent Assignment

**Primary Agents**:
- @dev
- @qa (quality gate — confere as 6 mutações do AC 7 de fato reprovando o `sim:check`, a restauração de globais pelo
  descritor, o `diff` da saída só com inserção, e que nenhum arquivo fora da lista fechada foi tocado)

**Supporting Agents**:
- @architect (dono da decisão de forma em `architecture-e4.md` §2.2; consultar só se um dos R1–R10 se
  mostrar inaplicável na implementação — não para decidir de novo o que já foi decidido)
- @po (dono do roteamento que criou esta story e da pergunta em aberto sobre `e4.7`; não implementa)

### Quality Gate Tasks

- [x] Pre-Commit (@dev): Rodar antes de marcar a story como completa
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
- As 6 mutações (M1, M1b, M2, M3 do gate; MR1, MR2 da restauração) de fato fazem `sim:check` sair com
  código diferente de 0 (AC 7)
- Restauração de globais em `finally`, por par (objeto, chave): com descritor original, `defineProperty`
  dele e nunca `delete`; ausente, `delete` da propriedade criada com `configurable: true`. Comparação campo
  a campo, e o ramo "tinha descritor" exercitado (AC 5)
- `determinism.ts` não importa `client/` nem `tools/telemetria.ts` diretamente — só `guarda-telemetria.ts`
  (AC 3, 11)
- O `diff` do `sim:check` antes × depois é só inserção, sem mover nem alterar linha existente (AC 2)

**Secondary Focus**:
- `tools/telemetria.ts` não ganha import nem export novo além da guarda de entrada (AC 4)
- Nenhuma seta nova de camada além das três já declaradas em `architecture-e4.md` §2.2 (AC 11)

## Tasks / Subtasks

- [x] Task 0 — Pré-condição de sequência (AC: 12)
  - [x] Confirmar que o commit de implementação de `e4.8` existe (ou, na exceção do AC 12, o de `e4.3`);
        registrar o hash usado como base e qual caso valeu no Dev Agent Record
  - [x] Confirmar que `git status --short src/tools/determinism.ts` sai vazio

- [x] Task 1 — `src/tools/guarda-telemetria.ts` (AC: 3, 5, 6, 8)
  - [x] Criar o arquivo, exportando `verificarTelemetria(): { linhas: string[]; problemas: string[] }`, no
        molde de `verificarPartida` (`src/tools/partida.ts:880`)
  - [x] Montar o fixture misto sintético em código (mínimo: duas populações conhecidas + eventos sem
        carimbo, nenhuma com o `n` combinado)
  - [x] Instalar `localStorage`/`document`/`Blob` falsos, com o `localStorage` já contendo ao menos um evento
        sem carimbo sob `CHAVE`; exercitar `criarTelemetria()`/`registrar()` real, capturar o que
        `exportar()` entregaria e afirmar: eventos novos com carimbo finito, evento antigo sem carimbo (AC 5)
  - [x] Capturar **antes da primeira instalação** o descritor próprio de cada par (objeto, chave) trocado
        (`globalThis.localStorage`, `globalThis.document`, `URL.createObjectURL`, ...); no caso ausente,
        instalar com `configurable: true`
  - [x] Restaurar num `finally`: com descritor, `defineProperty` dele (nunca `delete`); ausente, `delete`
  - [x] Depois do `finally`, conferir o critério do AC 5 campo a campo (`value`/`get`/`set` por `Object.is`,
        atributos por igualdade, não `JSON.stringify`); divergência vira problema
  - [x] Garantir que o ramo "tinha descritor" roda no Node do projeto (troca de `URL.createObjectURL` ou
        objeto de sonda com propriedade pré-existente)
  - [x] Capturar `console.warn` durante a execução da guarda
  - [x] Chamar `agregar()` real sobre o fixture; afirmar por rótulo/cabeçalho (não por número formatado):
        quantidade de blocos, presença de população "desconhecida", ausência de bloco com `n` combinado
  - [ ] Se `DEBT10-COD-003` entrar (Task 2b): afirmar que a contagem do aviso de `ler()` bate com a
        população desconhecida

- [x] Task 2 — `src/tools/telemetria.ts` (AC: 4)
  - [x] Trocar a chamada incondicional de `main()` (linha 307) por `if (import.meta.main) main()`
  - [x] Registrar a versão do Node usada e confirmar que `import.meta.main` está disponível
  - [ ] Task 2b (opcional, `DEBT10-COD-003`, AC 8, 9): alinhar o critério de "sem carimbo" em
        `client/telemetria.ts:ler()` a `!Number.isFinite`; no texto do agregador, distinguir "sem carimbo"
        de "carimbo inválido" — registrar a decisão de incluir ou não no Dev Agent Record

- [x] Task 3 — `src/tools/determinism.ts` (AC: 3, 11)
  - [x] Importar `verificarTelemetria` de `./guarda-telemetria.ts`
  - [x] Chamar a função, imprimir a(s) linha(s) de seção no ponto fixo depois das seções existentes
  - [x] Acrescentar o bloco `throw` no padrão dos que já existem, disparando quando `problemas.length > 0`

- [x] Task 4 — Documentação (AC: 9, opcional junto com `DEBT10-COD-003`)
  - [x] Emendar a linha `b8e8a41` de `docs/evidence/telemetria/README.md` (janela vazia no build publicado)
  - [x] Acrescentar a hora à linha `debt.10` da mesma tabela

- [x] Task 5 — As 6 mutações, aplicadas e revertidas (AC: 7)
  - [x] M1 — sem carimbo em `registrar()`: aplicar, rodar `sim:check`, confirmar código != 0, reverter
  - [x] M1b — carimbo em `exportar()`: aplicar, rodar `sim:check`, confirmar código != 0, reverter
  - [x] M2 — `?? 0` / `?? 1` em `populacaoDe()`: aplicar, rodar `sim:check`, confirmar código != 0, reverter
  - [x] M3 — `agregar()` sem partição: aplicar, rodar `sim:check`, confirmar código != 0, reverter
  - [x] MR1 — restauração sempre com `delete`: aplicar, rodar `sim:check`, confirmar código != 0, reverter
  - [x] MR2 — caso ausente restaurado por atribuição (`= undefined` ou `defineProperty` com
        `value: undefined`): aplicar, rodar `sim:check`, confirmar código != 0, reverter

- [x] Task 6 — Verificação (AC: 1, 2, 4, 10, 11, 12)
  - [x] `npm run check` — 0 erros
  - [x] `npm run sim:check` antes e depois da mudança — golden hash idêntico, `diff` só com inserção
  - [x] `git show --stat` do(s) commit(s) desta story, restrito à lista fechada do AC 10
  - [x] `grep -rn "from '\.\./client/" src/tools/` — as 2 linhas de `tools/telemetria.ts` sem mudança, mais
        1 ou 2 de `tools/guarda-telemetria.ts`, todas para `client/telemetria.ts`; `grep -rln` = os 2 arquivos (AC 11)
  - [x] Os 5 exports reais de `docs/evidence/telemetria/` rodados pelo CLI, antes × depois — byte a byte
        idênticos
  - [x] `node src/tools/telemetria.ts` sem argumento — ainda imprime `uso:` e sai com 1

## Dev Notes

### O achado, na fonte (fonte: gate de `debt.10`)

```
DEBT10-TST-001 | medium | @po / @architect | Nenhuma guarda no repositório. As 4 mutações passam em
check, sim:check e build, e as provas ficaram no scratchpad porque o AC 10 [de debt.10] não autoriza
arquivo de teste. Criar uma guarda headless (fixture misto e coletor) antes da primeira coleta usada
como evidência de debt.9 ou P4.4.
```

[Fonte: `docs/qa/gates/debt.10-telemetria-marca-atraso-de-input.yml`, achado `DEBT10-TST-001`]

### `tools/telemetria.ts` hoje — o problema concreto que motiva o AC 4

```ts
// linha 289
function main(): void {
  const caminho = process.argv[2]
  if (!caminho) {
    console.error('uso: node src/tools/telemetria.ts <arquivo.json>')
    process.exit(1)
  }
  // ...
}
// linha 307
main()
```

`main()` roda **incondicionalmente** ao carregar o módulo. Sem argumento, `process.exit(1)` mata o processo
que importou o arquivo — o que significa que uma guarda dentro do `sim:check` que apenas `import`asse
`tools/telemetria.ts` derrubaria o `sim:check` inteiro. Esse é o motivo concreto, medido antes da decisão de
`architecture-e4.md` §2.2, para o AC 4 existir.

[Fonte: `src/tools/telemetria.ts:1-3, 289-307`]

### O molde de guarda a seguir (fonte: `tools/partida.ts`)

```ts
// src/tools/partida.ts:880
export function verificarPartida(): { linhas: string[]; problemas: string[] } {
  const linhas: string[] = []
  const problemas: string[] = []
  // ...
  return { linhas, problemas }
}
```

E como `determinism.ts` a consome (fonte: `tools/determinism.ts`):

```ts
import { verificarPartida } from './partida.ts'
// ...
const { linhas: linhasPartida, problemas: problemasPartida } = verificarPartida()
// ...
for (const linha of linhasPartida) console.log(linha)
console.log('')
// ...
if (problemasPartida.length) {
  for (const p of problemasPartida) console.log(p)
  throw new Error(/* ... */)
}
```

`verificarTelemetria()` segue exatamente essa forma: `guarda-telemetria.ts` não lança nem chama
`process.exit`; quem decide se o `sim:check` falha é o bloco `throw` já existente em `determinism.ts`, no
mesmo padrão dos outros.

[Fonte: `src/tools/partida.ts:880-895`; `src/tools/determinism.ts:38, 859, 902-903, 961-963`]

### As restrições R1–R10, citadas na íntegra (fonte: `architecture-e4.md` §2.2)

> - **(R1) Casa.** A guarda mora em `src/tools/guarda-telemetria.ts`, que exporta uma função no molde de
>   `verificarPartida` (devolve linhas e problemas, sem lançar e sem `process.exit`). `determinism.ts`
>   recebe **só** o import dessa função, a chamada, uma linha de seção na saída e um bloco `throw` no
>   padrão dos que já existem. Não recebe import de `client/` nem de `tools/telemetria.ts`.
> - **(R2) Guarda de ponto de entrada no agregador.** Em `tools/telemetria.ts`, `main()` roda só quando o
>   arquivo é a entrada do processo. Preferência: `if (import.meta.main) main()`. [...] **Prova
>   discriminante das duas direções:** (a) importar o módulo não encerra o processo; (b) `node
>   src/tools/telemetria.ts` sem argumento continua imprimindo `uso:` e saindo com 1; (c) sobre os 5
>   exports reais de `docs/evidence/telemetria/`, a saída do CLI é byte a byte igual à de antes.
> - **(R3) Coletor real, não réplica.** A guarda exercita `criarTelemetria()`/`registrar()` do
>   `client/telemetria.ts` real, com `localStorage` falso [...]. Todo global instalado é **restaurado pelo
>   descritor original** [...] num `finally`. [...] `console.warn` é capturado durante a guarda.
> - **(R4) Fixture em código, não em `docs/`.** [...] Composição mínima: pelo menos duas populações
>   conhecidas com rodadas de humano (por exemplo (6, 6) e (0, 6)) mais eventos sem carimbo, de modo que
>   **nenhuma população tenha o `n` combinado**.
> - **(R5) As 4 mutações do gate reprovam o `sim:check`.** [...] **M1**, sem carimbo em `registrar()`;
>   **M1b**, carimbo movido para `exportar()`; **M2**, `?? 0` / `?? 1` em `populacaoDe()`; **M3**,
>   `agregar()` devolvendo `agregarPopulacao(eventos)` sem partição. As 4 precisam sair com código diferente
>   de 0. As asserções sobre `agregar()` leem **rótulo e cabeçalho** [...], não números formatados.
> - **(R6) Uma só definição de "sem carimbo".** A guarda fixa a do agregador (`!Number.isFinite`, já
>   validada no gate).
> - **(R7) Arquivos permitidos:** `src/tools/guarda-telemetria.ts` (novo); `src/tools/determinism.ts` (só
>   R1); `src/tools/telemetria.ts` (só R2 e, opcionalmente, o texto de `DEBT10-COD-003`); `src/client/telemetria.ts`
>   (só se `DEBT10-COD-003` entrar, e só o predicado de `ler()`); `docs/evidence/telemetria/README.md`
>   (`DEBT10-DOC-002`). **Proibidos:** `package.json` (nenhum script novo), `src/sim/`, `src/match/`,
>   `src/shop/`, `src/bot/`, `src/chars/`, `src/net/`, `client/main.ts`, `client/input.ts`,
>   `client/layout.ts`, `client/render.ts` e qualquer outro arquivo de `tools/`.
> - **(R8) Golden hash imóvel, saída do `sim:check` só com inserção.** [...] O `diff` da saída completa
>   antes × depois é **só inserção** [...]. Nenhuma linha existente muda ou troca de lugar.
> - **(R9) Sequência.** `determinism.ts` é disputado por `e4.3` (Draft), `e4.6` (Ready) e pela story do
>   codec que o @sm está escrevendo. `debt.11` começa depois do commit de implementação da que estiver em
>   curso, e o escopo é conferido por `git show --stat <commit próprio>`, nunca pela árvore.
> - **(R10) Prazo.** É o do AC 11 de `debt.10`: antes da primeira coleta humana usada como evidência de
>   `debt.9` (pré-condição b) ou como baseline de P4.4 (`e4.7`, hoje Ready). Se `e4.7` deve listar `debt.11`
>   como pré-condição é roteamento do @po.

[Fonte: `docs/architecture-e4.md` §2.2, linhas 407–476, decisão do @architect de 2026-09-21, commit
`6f8ee7c`]

### A seta declarada — tabela e invariante (fonte: mesma seção)

```
| Arquivo de tools/                     | Importa de client/                                | Tipo      |
|---------------------------------------|----------------------------------------------------|-----------|
| tools/telemetria.ts (CLI, e3.5)       | client/input.ts (ARRASTO_MAX, LIMIAR_ARRASTO_PX)    | execução  |
| tools/telemetria.ts                   | client/telemetria.ts (ArquivoTelemetria, ...)       | só tipo   |
| tools/guarda-telemetria.ts (debt.11)  | client/telemetria.ts (criarTelemetria, CHAVE, ...)  | execução  |
```

> **Invariante de importabilidade.** Todo arquivo de `client/` alcançado por `tools/` (hoje
> `client/input.ts`, `client/layout.ts` e `client/telemetria.ts`) não acessa `window`, `document`,
> `localStorage` nem `canvas` no topo do módulo. Esses acessos ficam dentro de funções, como já estão. Se um
> desses arquivos precisar de efeito no topo, a mudança dele é que abre handoff, não a guarda.
>
> **A outra direção fica como está.** `client/ → tools/` continua sendo só `client/main.ts →
> tools/harness.ts` (`hash`). Nenhum arquivo de `client/` importa `tools/telemetria.ts` nem
> `tools/guarda-telemetria.ts`.
>
> **Sem ciclo de arquivo** é condição da seta. Pastas que se apontam mutuamente são toleradas, desde que com
> a lista fechada acima. Um ciclo de arquivo de execução entre `tools/` e `client/` é regressão.

[Fonte: `docs/architecture-e4.md` §2.2, linhas 377–400]

### Por que a opção escolhida (D) e não as outras (fonte: mesma seção)

O @architect avaliou quatro opções antes de decidir: **A** (corpo da guarda dentro de `determinism.ts`,
importando `client/` direto — rejeitada, contraria o precedente de `tools/partida.ts`); **B** (script irmão
`npm run telemetria:check` — rejeitada, só protege se todo `quality_gate_tools` futuro lembrar de listá-lo,
o mesmo esquecimento de `E41-TST-003`/`DEBT10-TST-001`); **C** (extrair carimbo/partição para um módulo
puro fora de `client/` e testar esse módulo — rejeitada, **não pega a mutação que importa**: um teste de
função pura continua verde se `registrar()` parar de chamá-la); **D** (arquivo próprio
`src/tools/guarda-telemetria.ts`, chamado pelo `sim:check` — **escolhida**). O custo aceito da D é que o
`sim:check` passa a carregar 3 arquivos de `client/` (27 → 32 módulos no fecho de execução), o que já era
verdade parcialmente desde `e3.5` (o CLI já carrega `client/input.ts` e `client/layout.ts`).

[Fonte: `docs/architecture-e4.md` §2.2, linhas 360–375]

### O README de evidência — formato já estabelecido por `debt.10`

```
| 2026-09-21 03:24:48 | b8e8a41 (e4.1) | ... Rodadas gravadas daqui em diante têm atraso 6 — ainda sem
carimbo: no arquivo são indistinguíveis das de atraso 0 |
| 2026-09-21 | commit [debt.10] (hash: ...) | client/telemetria.ts passa a gravar atrasoTicks e escalaHp
em cada evento ... |
```

O AC 9 desta story (opcional, `DEBT10-DOC-002`) emenda a primeira linha (a janela é vazia no build
publicado, porque `b8e8a41` e o commit de `debt.10` vão no mesmo push) e acrescenta a hora à segunda linha,
para as três linhas da tabela ficarem no mesmo formato.

[Fonte: `docs/evidence/telemetria/README.md:39-51`]

### O que esta story explicitamente NÃO faz

- Não decide se `e4.7` deve listar `debt.11` como pré-condição — roteamento do @po (R10).
- Não corrige nenhum número de P3.1/P3.2/P3.3/RF-36 nem muda o cálculo do agregador — só adiciona uma
  guarda que exercita o código existente.
- Não abre script novo em `package.json` — a guarda roda dentro do `sim:check` já existente (R7).
- Não decide sozinha qual das três stories concorrentes (`e4.3`/`e4.6`/`e4.8`) é a base de sequência — é
  uma assunção de trabalho a confirmar pelo @po (AC 12).
- Não torna `DEBT10-COD-003` obrigatória — é item opcional do @dev, herdado do gate de `debt.10`.

### Testing

- `npm run check` — 0 erros.
- `npm run sim:check` — rodado antes e depois da mudança; golden hash idêntico; `diff` da saída completa
  só com linhas inseridas.
- As 6 mutações (M1, M1b, M2, M3 do gate; MR1, MR2 da restauração, AC 7), cada uma aplicada, testada e
  revertida — todas devem fazer `sim:check` sair com código diferente de 0.
- Restauração dos globais conferida pela própria guarda (AC 5): por par (objeto, chave), campo a campo, com
  o ramo "tinha descritor" exercitado pelo menos uma vez no Node do projeto.
- `node src/tools/telemetria.ts` sem argumento — continua imprimindo `uso:` e saindo com 1, depois da
  guarda de entrada.
- Os 5 exports reais de `docs/evidence/telemetria/` rodados pelo CLI, antes × depois — saída byte a byte
  idêntica.
- `grep -rn "from '\.\./client/" src/tools/` — só os pares da tabela de setas declarada (critério por
  arquivo e destino, não por contagem de linhas; ver AC 11).

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (1M context), como Dex (@dev), modo YOLO.

### Debug Log References

**Task 0 (AC 12), caso normal:** o commit de implementação de `e4.8` é `910add8`, e `e4.8` está Done
(gate `438740b`). Base usada: `438740b` (o sim:check e o CLI de "antes" foram medidos ali). O pai de `971686b` é `f8be842`, um commit do @po que entrou em paralelo e só toca `docs/stories/` (e4.3, e4.4, e4.6, e4.7 e e4.8), sem nenhum arquivo de `src/`. `git status --short src/tools/determinism.ts` saiu vazio antes do
início. `e4.3` não tinha começado, então a exceção do AC 12 não se aplica.

**Commit de implementação: `971686b`.** `git show --stat 971686b`:

```
 docs/evidence/telemetria/README.md |   4 +-
 src/tools/determinism.ts           |  12 ++
 src/tools/guarda-telemetria.ts     | 322 +++++++++++++++++++++++++++++++++++++
 src/tools/telemetria.ts            |   2 +-
 4 files changed, 337 insertions(+), 3 deletions(-)
```

Os quatro arquivos estão na lista fechada do AC 10. `src/client/telemetria.ts` não entrou, porque
`DEBT10-COD-003` ficou de fora. Esta story vai num commit de docs separado, porque o AC 10 não inclui o
arquivo da story na lista fechada (mesmo corte de `e4.8`).

**AC 1:** `npm run check` sai com 0. **`npm run build`** sai com 0 (`dist/assets/index-*.js` 53.27 kB),
porque nenhum arquivo de `client/` importa a guarda nem `tools/telemetria.ts`. O `grep -rn` de
`guarda-telemetria|tools/telemetria` em `src/client/` só casa comentários. **`npm run lint`:** o
`package.json` não tem script `lint`, e o gate estático do projeto é `npm run check`.

**AC 2 (R8):** `node src/tools/determinism.ts` rodado em `438740b` (antes) e na árvore de `971686b`
(depois). Os dois saem com 0 e com stderr vazio (0 bytes). A linha `golden hash    ✓ ok — 6 seeds batem o
baseline` é idêntica. `diff antes depois` dá só inserção, depois da última linha existente (`55a56,58`):

```
> telemetria     ✓ ok — coletor real: 2 evento(s) novo(s) carimbado(s), 1 antigo(s) sem carimbo no export (3) · agregar() do fixture: 3 bloco(s) P3.1, 3 população(ões), a desconhecida à parte, nenhum n combinado
> globais        ✓ ok — 6 pares (objeto, chave) trocados: 4 com descritor próprio, 2 ausentes, todos de volta ao descritor de antes · 3 console.warn capturado(s)
>
```

Nenhuma linha `[telemetria]` solta aparece na saída. Os 3 avisos (1 de `ler()` e 2 de `agregar()`) foram
capturados.

**AC 4 (R2), no Node v24.13.1:**
- (a) `node --input-type=module -e "await import('./src/tools/telemetria.ts')…"` imprime
  `importado, processo vivo; agregar é function` e sai com 0. O próprio `sim:check` importa o módulo pela
  guarda e sai com 0.
- (b) `node src/tools/telemetria.ts` sem argumento imprime `uso: node src/tools/telemetria.ts
  <arquivo.json>` e sai com 1. stdout e stderr são byte a byte iguais aos de antes.
- (c) Os 5 exports de `docs/evidence/telemetria/` (`…1785815023371`, `…1785816621271`, `…1785908807719`,
  `…1785909111972`, `…1785909682703`) dão stdout **e** stderr byte a byte iguais antes e depois (`cmp`), e
  todos saem com 0.
- Forma usada: `if (import.meta.main) main()`. A comparação de `process.argv[1]` não foi usada, e por isso
  a questão da caixa da letra de unidade não se aplica. Em Node sem `import.meta.main`, o CLI ficaria mudo.
  O CI (`deploy-pages.yml`, Node 20) não roda o CLI.

**AC 7, as 6 mutações.** Cada uma foi aplicada por substituição de texto (um script Node no scratchpad
confere que o padrão casa exatamente 1 vez antes de gravar), seguida de `npm run sim:check`. Depois o
arquivo voltou da cópia de segurança. A bateria rodou duas vezes, e a segunda foi sobre o código final:

| Mutação | Aplicada como | `sim:check` | Problema acusado pela guarda |
|---|---|---|---|
| **M1** | `registrar()` grava `{ ...e, partida }` (sem carimbo) | **exit 1** | `2 evento(s) novo(s) sem atrasoTicks/escalaHp finitos no export — registrar() deixou de carimbar (M1)` |
| **M1b** | a mesma M1 mais `exportar()` com `eventos: eventos.map((e) => ({ ...e, atrasoTicks: ATRASO_ALVO_TICKS, escalaHp: ESCALA_HP }))` | **exit 1** | `o evento antigo saiu carimbado no export — … (M1b)` |
| **M2** | `populacaoDe()` começa com `e = { ...e, atrasoTicks: e.atrasoTicks ?? 0, escalaHp: e.escalaHp ?? 1 }` | **exit 1** | `0 população(ões) "desconhecida" no agregado — esperada 1, a última (M2 …)`; `agregar() não avisou sobre os eventos sem carimbo do fixture` |
| **M3** | `agregar()` começa com `return agregarPopulacao(eventos)` | **exit 1** | `1 bloco(s) P3.1 e 0 rótulo(s) de população — esperado 3 de cada (M3: sem partição)`, mais 4 (sem aviso ⚠, sem desconhecida, `n combinado (7)`, sem aviso de sem carimbo) |
| **MR1** | `restaurar()` começa com `return Reflect.deleteProperty(alvo, chave)` | **exit 1** | `console.warn`, `globalThis.Blob`, `URL.createObjectURL` e `URL.revokeObjectURL` `não voltou ao descritor de antes (tinha descritor próprio)` |
| **MR2** (a) | caso ausente vira `defineProperty(alvo, chave, { value: undefined, writable, enumerable, configurable: true })` | **exit 1** | `globalThis.localStorage` e `globalThis.document` `não voltou ao descritor de antes (estava ausente)` |
| **MR2** (b) | caso ausente vira `alvo[chave] = undefined` | **exit 1** | idem |

Depois das reversões, `git status --short src/` mostrou só os 3 arquivos da story (`client/telemetria.ts`
intacto), e `npm run sim:check` voltou a sair com 0.

**AC 11:** `grep -rn "from '\.\./client/" src/tools/` devolve 3 linhas: `telemetria.ts:2` (→
`client/input.ts`) e `:3` (→ `client/telemetria.ts`, `import type`), ambas sem mudança, e
`guarda-telemetria.ts:1` (→ `client/telemetria.ts`, valores e tipos numa linha só). `grep -rln` devolve
exatamente `src/tools/guarda-telemetria.ts` e `src/tools/telemetria.ts`.

### Completion Notes

- **Coletor real (AC 5).** O `localStorage` falso começa com 1 `rodadaFim` sem carimbo sob `CHAVE`
  (partida 900). A guarda chama `criarTelemetria()`, depois `registrar(901, [rodadaFim, cast])`, depois
  `exportar()`. O conteúdo chega por um `Blob` falso, capturado no `URL.createObjectURL` falso. A guarda
  afirma: novos com `atrasoTicks`/`escalaHp` finitos (M1), antigo ainda sem carimbo (M1b), `versao ===
  CHAVE`, contagens 1 e 2, a sequência Blob → createObjectURL → click → revokeObjectURL da mesma URL, que
  `ler()` avisou e que `persistir()` não falhou. Os eventos são identificados por `partida`, não por
  índice.
- **Restauração (AC 5, P1–P3).** São 6 pares (objeto, chave): `console.warn`, `globalThis.localStorage`,
  `globalThis.document`, `globalThis.Blob`, `URL.createObjectURL` e `URL.revokeObjectURL`. Todos os
  descritores são capturados antes da primeira instalação. O par ausente é criado com `configurable:
  true`. O `finally` desfaz na ordem inversa, só o que chegou a ser instalado: com descritor, faz
  `defineProperty(original)`; ausente, faz `Reflect.deleteProperty`, e um `false` vira problema. Depois
  do `finally`, a guarda compara cada par campo a campo (presença de cada campo e `Object.is`). No Node
  24.13.1, **4 pares caem no ramo "tinha descritor"** e 2 no ausente. Um canário acusa problema se nenhum
  par tiver descritor próprio (P2).
- **Fixture (AC 6).** Fica em código. A população (6, 6) tem n=3, a (0, 6) tem n=2, e há 2 eventos sem
  carimbo (um sem os campos e um com `null`). O n combinado é 7 e nenhuma população tem 7. As asserções
  sobre `agregar()` leem o cabeçalho `P3.1  mediana…` (3 blocos), os rótulos `população: ` (3), a
  "desconhecida" (exatamente 1, a última), o aviso `⚠` na primeira linha e a ausência de `(n=7`. Também
  conferem que o cabeçalho da população desconhecida começa com `eventos 2 ·`, a contagem que a definição
  única dá, e que `agregar()` avisou sobre eventos sem carimbo.
- **Definição única (AC 8, R6).** A guarda tem um só predicado, `semCarimbo = !Number.isFinite(atraso) ||
  !Number.isFinite(escala)`, igual ao de `populacaoDe()`. Ele serve às asserções do coletor e à contagem
  esperada do fixture.
- **Nunca lança (AC 3).** Todo o corpo roda em `try/catch/finally`. Exceção do cenário, falha de
  instalação e falha de restauração viram `problemas`.

**Decisões autônomas:**
- [AUTO-DECISION] Aplicar `DEBT10-COD-003`? → **Não** (motivo: é opcional, e sem ele
  `src/client/telemetria.ts` fica fora do commit. Pelo R6, a guarda não afirma a contagem do aviso de
  `ler()`, só que ele avisou). As duas caixas que dependem disso (Task 1, último item, e Task 2b) ficaram
  desmarcadas de propósito.
- [AUTO-DECISION] Aplicar `DEBT10-DOC-002` (AC 9)? → **Sim** (motivo: é opcional, mas o arquivo já está
  na lista fechada e a mudança é pequena). A linha `debt.10` ganhou só a hora; o placeholder do hash ficou
  como estava, porque o AC pede a hora e não o hash.
- [AUTO-DECISION] Como capturar o conteúdo exportado, se `Blob.text()` é assíncrono e a guarda é
  síncrona? → **Trocar também `globalThis.Blob`** por um falso que guarda as partes (motivo: mantém
  `verificarTelemetria()` síncrona, no molde de `verificarPartida`, e acrescenta mais um par ao ramo
  "tinha descritor").
- [AUTO-DECISION] `console.warn` entra na lista de pares restaurados? → **Sim**, mesma regra dos outros
  (motivo: é uma troca de propriedade de objeto nativo, e deixá-la fora do critério abriria a brecha de
  P1).
- [AUTO-DECISION] Onde entra a seção nova no `sim:check`? → **Depois do último `console.log('')`
  existente** (depois do bloco `pilar 3`), e o `''` final vem dentro das `linhas` da guarda (motivo: o AC
  3 dá a `determinism.ts` uma só linha de saída, e o `diff` fica só com inserção no fim). A chamada fica
  logo depois de `verificarPartida()`, e o bloco `throw` fica por último, com o `for … console.log(p)`
  antes do `throw`, no mesmo padrão do bloco de `verificarPartida`.
- [AUTO-DECISION] MR2 tem duas formas no AC. → **Rodei as duas** (`defineProperty` com `value:
  undefined` e `= undefined`), e as duas reprovam.

**Self-critique (passos 5.5/6.5), registrado aqui pelo AC 10:** não há `any`. Não há import fora da seta
declarada: a guarda importa só `../client/telemetria.ts` e `./telemetria.ts`, sem tipo de `match/`, porque
o tipo vem de `EventoTelemetria`. A guarda não tem estado de topo além de constantes, e o fixture é
`readonly`. A linha de status não afirma "desconhecida à parte, nenhum n combinado" nem "todos de volta
ao descritor" quando a guarda falha: na primeira bateria de mutações ela afirmava, e foi corrigido antes
do commit. Não adicionei script ao `package.json`.

**Em aberto (fora do escopo):** CodeRabbit não está disponível nesta máquina (o gate WSL não roda aqui),
e a cobertura foi `npm run check` + `npm run sim:check` + `npm run build` + a bateria de mutações. A
emenda de `e4.7`/`debt.9` (pré-condição de coleta, AC 13) continua com o @po. `DEBT10-COD-003` continua
aberto para uma story futura.

### File List

| Arquivo | Ação | Commit |
|---|---|---|
| `src/tools/guarda-telemetria.ts` | criado: `verificarTelemetria()`, fixture misto e restauração de globais | `971686b` |
| `src/tools/determinism.ts` | modificado: só import, chamada, linha de seção e bloco `throw` (+12) | `971686b` |
| `src/tools/telemetria.ts` | modificado: `if (import.meta.main) main()` (1 linha) | `971686b` |
| `docs/evidence/telemetria/README.md` | modificado: `DEBT10-DOC-002` (janela de `b8e8a41`; hora de `debt.10`) | `971686b` |
| `docs/stories/debt.11.guarda-automatica-telemetria.story.md` | modificado: checkboxes, Dev Agent Record, Change Log, Status | commit de docs |

## QA Results

### Review Date: 2026-09-21

### Reviewed By: Quinn (Test Architect)

**Gate: CONCERNS** → `docs/qa/gates/debt.11-guarda-automatica-telemetria.yml`. Revisão:
`971686b` (implementação). O src/ do HEAD é idêntico ao de `971686b`. `8e027cb` toca só esta story.
Nenhum dos dois está em `origin/master`.

**Resumo.** Os 13 ACs estão MET, e `DEBT10-TST-001` está fechado. Conferi tudo do zero, sem confiar no
Dev Agent Record. Fica em CONCERNS, e não PASS, por um MEDIUM de alcance: a guarda confere que o carimbo
existe e é finito, não que ele tem o valor certo (`DEBT11-TST-001`).

**Verificação independente**
- **AC 1/2:** `npm run check`, `npm run sim:check` e `npm run build` saíram com rc=0, e o golden hash
  ficou idêntico. O diff da saída inteira do `sim:check` contra um worktree de `971686b^` (`f8be842`) é
  um único bloco `55a56,58`, só com `>` (`telemetria`, `globais` e uma linha em branco). stderr tem 0
  bytes nos dois lados, e não há linha `[telemetria]` solta.
- **AC 3:** o diff de `determinism.ts` tem só o import, a chamada, o laço de impressão e o bloco `throw`.
  A guarda não lança: com `registrar()` lançando, o `sim:check` sai com 1, com "a guarda lançou", e os
  globais voltam.
- **AC 4 (Node v24.13.1):** (a) importar o módulo mantém o processo vivo, rc=0. (b) Sem argumento, o
  CLI sai com rc=1, e stdout/stderr são byte a byte iguais aos de `f8be842`. (c) Nos 5 exports reais,
  stdout e stderr são idênticos por `cmp`, e todos saem com rc=0.
- **AC 5 (P1–P3):** são 6 pares (objeto, chave), incluindo `URL.createObjectURL`/`revokeObjectURL`,
  `console.warn` e `Blob`. Os descritores são capturados antes do laço, o par ausente é criado com
  `configurable: true`, e a comparação é campo a campo com `Object.is`. O ramo "tinha descritor" roda
  em 4 pares. Um script meu comparou 219 descritores próprios antes e depois da guarda. A única
  divergência também aparece nos dois controles sem a guarda, então não é vazamento dela. Identidades
  preservadas, `localStorage`/`document` de volta a ausentes, e o `Blob` real funciona depois.
- **AC 6/8:** o fixture fica em código, e o n combinado 7 não aparece em nenhuma população. Há um só
  predicado, `!Number.isFinite`. Sobre `ler()`, a guarda só afirma que ele avisou, nunca a contagem.
- **AC 7:** reapliquei M1, M1b, M2, M3, MR1, MR2a e MR2b, e todas saíram com exit 1. Das minhas 14
  mutações, 10 nocivas foram pegas: carimbo reescrito em `ler()`, carimbo só no que falta em
  `exportar()`, `Blob` falso vazando, `registrar()` lançando, predicado de `ler()` no agregador,
  partição só no rótulo, `console.warn` não capturado, carimbo só com escala, atributo do descritor
  errado e linha de seção removida. A benigna (formato de número) passou verde, como o R5 exige.
  Não pegas: carimbo com valor literal errado (→ `DEBT11-TST-001`), M2 só no atraso (→ `DEBT11-TST-002`)
  e bloco `throw` desligado (propriedade de toda seção, sem ação).
- **AC 10/11/12:** o `--stat` tem os 4 arquivos da lista fechada. `grep -rln` dá exatamente
  `guarda-telemetria.ts` e `telemetria.ts`, e as 2 linhas antigas estão sem mudança. `910add8` é
  ancestral. O pai `f8be842` só toca stories.
- **AC 9:** a premissa do "mesmo push" foi conferida no remoto: nem `b8e8a41` nem `3de1cfe` estão em
  `origin/master`, e a história é linear. A hora 03:58:44 bate com `3de1cfe`.

**Avaliações pedidas**
1. **`Blob` substituído:** está coberto pela mesma disciplina (4º par, ramo "tinha descritor",
   conferido depois do `finally`). Um vazamento e um atributo errado reprovam. É aceitável: o AC 5
   cobre "qualquer propriedade de global nativo trocada", e a troca mantém a guarda síncrona.
2. **`DEBT10-COD-003` fora:** é consistente com o R6, que diz literalmente que sem o COD-003 a guarda
   não afirma a contagem de `ler()`. Ela afirma só a presença do aviso.
3. **Dois commits, com `f8be842` como pai:** é correto e exigido pela letra do AC 10, como em `e4.8`.
   `f8be842` só toca stories, então o src/ de `971686b^` é igual ao da base declarada, `438740b`.
4. **README (`DEBT10-DOC-002`):** está correto e fecha o achado.

**Achados**

| ID | Severidade | Dono | Resumo |
|---|---|---|---|
| `DEBT11-TST-001` | medium | @dev, via @po; prazo R10 | Com `registrar()` gravando `atrasoTicks: 0, escalaHp: 1` literais, o `sim:check` sai com 0. A população é rotulada errado, sem aviso. Correção: afirmar `=== ATRASO_ALVO_TICKS` / `=== ESCALA_HP` nos eventos novos, com as setas `tools/ → net/` e `tools/ → chars/` já declaradas. Até lá, o @po registra na pré-condição de coleta de `e4.7`/`debt.9` que o valor do carimbo não é guardado. |
| `DEBT11-TST-002` | low | @dev (opcional) | Nenhum evento do fixture tem carimbo parcial, então uma M2 só no atraso passa. Efeito real nulo hoje. |

**Refatoração pelo QA:** nenhuma. **Status:** Ready for Review → **Done** (CONCERNS, por
`story-lifecycle.md`).

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-09-21 | 1.0 | Story criada a partir do achado `DEBT10-TST-001` do gate `CONCERNS` de `debt.10` (`docs/qa/gates/debt.10-telemetria-marca-atraso-de-input.yml`, severidade medium), conforme roteamento do @po registrado no Change Log v1.4 de `docs/stories/debt.10.telemetria-marca-atraso-de-input.story.md`. Os Acceptance Criteria (R1–R10) transcrevem, com citação e sem paráfrase onde a fonte já era precisa, a decisão vinculante do @architect em `docs/architecture-e4.md` §2.2 (commit `6f8ee7c`), que também declara e fecha a seta de camada `tools/ → client/`. Escopo: `src/tools/guarda-telemetria.ts` (novo), `src/tools/determinism.ts` (só R1), `src/tools/telemetria.ts` (só R2, e opcionalmente `DEBT10-COD-003`), `src/client/telemetria.ts` (só se `DEBT10-COD-003` entrar) e `docs/evidence/telemetria/README.md` (`DEBT10-DOC-002`). **Sequenciamento (R9):** registrado como assunção de trabalho que a implementação começa depois do commit de `e4.8` (story do codec do fio, criada no mesmo dia), a confirmar pelo @po, já que `e4.3` e `e4.6` também disputam `src/tools/determinism.ts`. **Pergunta em aberto para o @po (R10):** se `e4.7` deve listar `debt.11` como pré-condição no seu próprio texto — não decidida por esta story, nem por `architecture-e4.md` §2.2. Status: Draft. | River (@sm) |
| 2026-09-21 | 1.1 | **Validação @po: GO 10/10 (8/10 antes das correções: itens 3 "AC testáveis" e 5 "dependências" estavam parciais). Status: Draft → Ready.** **R1–R10 conferidos um a um contra `architecture-e4.md` §2.2 (`6f8ee7c`, linhas 341–476):** R1→AC 3, R2→AC 4, R3→AC 5, R4→AC 6, R5→AC 7, R6→AC 8, R7→AC 10, R8→AC 2, R9→AC 12, R10→AC 13, e a seta declarada→AC 11. As citações de Dev Notes batem com a fonte, com as elisões marcadas. **Fatos conferidos:** `tools/telemetria.ts` tem 307 linhas, com `main()` em `:289`, `process.exit(1)` sem `argv[2]` e `main()` incondicional em `:307`; `:2` importa valor de `client/input.ts` (`ARRASTO_MAX`, `LIMIAR_ARRASTO_PX`) e `:3` faz `import type` de `client/telemetria.ts`; `agregar` exportado em `:84`, `populacaoDe` com `Number.isFinite` em `:62-64` (o alvo da M2), `agregarPopulacao` em `:146` e o cabeçalho `'P3.1  mediana…'` em `:170`. `client/telemetria.ts` exporta `CHAVE` (`:35`) e `criarTelemetria` (`:145`). `localStorage` só aparece dentro de funções (`persistir` `:150`, `ler` `:191`), e `document` só em `baixar` (`:220`). O carimbo está em `registrar` (`:163`), `exportar` em `:167`, e `ler` usa `=== undefined` (`:202`, alvo de `DEBT10-COD-003`). `partida.ts:880` traz `verificarPartida(): { linhas; problemas }`. `determinism.ts` tem 985 linhas, com import em `:38`, chamada em `:859`, impressão em `:902` e bloco `throw` em `:960-963`. Node local é 24.13.1: `import.meta.main` foi medido em arquivos de scratchpad (`true` como entrada, `false` importado) e está declarado em `@types/node` 26.1.2 (`web-globals/importmeta.d.ts:9`). O CI (`deploy-pages.yml`) usa Node 20, mas só roda `vite build`, que não empacota `tools/`, e por isso o CLI mudo em Node antigo não chega ao CI. Mutações M1/M1b/M2/M3 conferidas contra o gate de `debt.10` (evidência "Mutações próprias"). Há 5 exports em `docs/evidence/telemetria/`, e as linhas `b8e8a41`/`debt.10` do README estão como AC 9 descreve. `3de1cfe` é de 2026-09-21 03:58:44 −03. **Correções no lugar:** **(1) AC 11 — contagem errada.** "Exatamente as 3 linhas" confundia os pares da tabela de §2.2 com linhas do grep. A própria §2.2 diz que o grep "deve devolver só os **dois arquivos**". Hoje o grep devolve 2 linhas de 1 arquivo. Depois de `debt.11`, devolve essas 2 linhas mais 1 ou 2 de `guarda-telemetria.ts`, conforme o @dev junte ou separe `import type`. Com a redação antiga, a forma com `import type` separado reprovaria um código correto. O critério agora é por arquivo e destino (`grep -rln` = os 2 arquivos, as 2 linhas pré-existentes sem mudança e todo destino novo em `client/telemetria.ts`). Corrigido no AC 11, em `quality_gate_tools`, na Task 6 e em Testing. **(2) AC 5 — "nunca `delete`" contra "voltar a `undefined`".** No Node 24.13.1, `localStorage` e `document` **não têm descritor próprio** em `globalThis` (medido). Sem `delete`, a restauração deixaria uma propriedade que não existia antes, e as duas exigências do AC eram incompatíveis. A regra agora segue o motivo que R3 declara: com descritor original, `defineProperty` e nunca `delete` (protege um `localStorage` nativo futuro); sem descritor, remove-se a propriedade que a própria guarda criou. Critério: descritor antes igual ao descritor depois, inclusive ausente. **@architect: interpretação de R3 registrada para ratificação, não bloqueante.** **(3) AC 5 + Task 1 — cenário do coletor explícito.** O AC 7 exige que a M1b reprove, mas nenhum AC obrigava pré-carregar um evento antigo sem carimbo nem afirmar que ele continua sem carimbo no export, que é o que pega a M1b ("velho ganhou carimbo", no gate). Agora é explícito, junto com a asserção do carimbo nos novos, que pega a M1. É a sugestão (b) do gate. **(4) "Depende de" e AC 12 (R9) — decisão do @po.** Os estados estavam desatualizados: `e4.3` e `e4.8` apareciam como Draft e as duas estão Ready desde `b76b6ff`. Fica registrada a ordem **`e4.8` → `debt.11` → `e4.3`**, idêntica à de `e4.8` v1.1.0 e `e4.3` v1.4.0 e sem contradizê-las. A exceção da regra de `e4.3` também entra: se `e4.3` começar antes, esta começa depois do commit dela. A pré-condição de início passa a ser `git status --short src/tools/determinism.ts` vazio, e a Task 0 foi alinhada. `e4.6` sai da lista de candidatas a base, porque depende de `e4.3`. **(5) AC 13 e "Depende de" (R10) — decisão do @po: sim.** `e4.7` deve listar `debt.11` como **pré-condição de coleta**, não de início: nenhuma partida cujo export entre na evidência do AC 8 de `e4.7` é jogada antes do commit de implementação desta story. `e4.7` **não foi editada** nesta validação, e a emenda fica roteada ao @po. **Registrado, fora desta story:** `debt.9` (Draft) tem o mesmo prazo pela pré-condição (b), e a mesma pré-condição de coleta vale para ela na próxima edição. **Não editado (Dev Notes são do @dev):** os bullets de "O que esta story explicitamente NÃO faz" sobre `e4.7` e sobre a base de sequência continuam verdadeiros, porque a decisão foi do @po e não da story, e foram superados pelos AC 12/13. `quality_gate: @qa` fora da lista do task genérico é convenção do projeto em todas as stories. | Pax (@po) |
| 2026-09-21 | 1.2 | **AC 5 e AC 7 recebem as precisões P1–P3 da ratificação de R3 pelo @architect (`docs/architecture-e4.md` §2.2, bloco "Ratificação (2026-09-21…)", commit `d72325b`). Status: continua Ready.** A leitura de R3 registrada na v1.1 (com descritor, `defineProperty` e nunca `delete`; ausente, `delete` da propriedade criada; critério "descritor depois = antes, ausente conta como estado") foi ratificada. **AC 5:** o período "Critério verificável" foi trocado **verbatim** pelo texto do delta de §2.2: critério por par (objeto, chave), alcançando `URL.createObjectURL` (P1); comparação campo a campo, `value`/`get`/`set` por `Object.is` e atributos por igualdade, nunca `JSON.stringify` (P3); todos os descritores capturados antes da primeira instalação e propriedade ausente criada com `configurable: true` (P3); a guarda confere o critério ela mesma depois do `finally`; ramo "tinha descritor" exercitado pelo menos uma vez no Node do projeto (P2). A referência final do AC passa a citar a ratificação. **AC 7:** entram **MR1** (restauração sempre com `delete`) e **MR2** (caso ausente restaurado por atribuição, `= undefined` ou `defineProperty` com `value: undefined`), com a redação de P2, às M1/M1b/M2/M3, com o mesmo registro no Dev Agent Record; "as 4" vira "as 6". **Repetições alinhadas:** `quality_gate_tools` (6 mutações e um item novo para a restauração), CodeRabbit Focus Areas e a linha do @qa em Specialized Agents (a linha antiga "nunca por `delete`" contradizia o AC 5 desde a v1.1), Task 1 (captura prévia, `configurable: true`, conferência campo a campo, ramo exercitado), Task 5 (MR1, MR2) e Testing. **Fatos conferidos no Node 24.13.1 desta sessão:** `localStorage` e `document` sem descritor próprio em `globalThis`; `URL.createObjectURL` e `URL.revokeObjectURL` com descritor próprio do objeto `URL` (`value`, `writable`, `enumerable`, `configurable`, os três `true`); `baixar()` em `src/client/telemetria.ts:219-224` chama os dois. **Não editado:** Dev Notes (a citação de R3 continua a da fonte original; a ratificação vive em §2.2 e nos AC 5/7), a menção às "4 mutações" do gate em Story, "Depende de" e na citação do achado (referem-se ao gate de `debt.10`, e continuam verdadeiras). Nenhum outro AC muda, conforme o delta. **Readiness:** o delta fecha brechas sem mudar escopo de arquivo, sequência nem dependência; o @architect o declara não bloqueante. GO 10/10 mantido. | Pax (@po) |
| 2026-09-21 | 1.3 | **Implementação @dev: Ready → InProgress → Ready for Review.** Commit de implementação `971686b` (base `438740b`, caso normal do AC 12, depois do commit de implementação de `e4.8`, `910add8`). Arquivos: `src/tools/guarda-telemetria.ts` (novo), `determinism.ts` (+12: import, chamada, linha de seção e `throw`), `tools/telemetria.ts` (`if (import.meta.main) main()`) e `docs/evidence/telemetria/README.md` (`DEBT10-DOC-002`). `DEBT10-COD-003` não entrou. check, sim:check e build saem com 0; o golden hash é idêntico; o diff do `sim:check` tem só 3 linhas inseridas no fim. As 6 mutações (M1, M1b, M2, M3, MR1 e as duas formas de MR2) saem com exit 1. As provas do AC 4 (a/b/c) foram registradas no Node v24.13.1. Detalhes no Dev Agent Record. | Dex (@dev) |
| 2026-09-21 | 1.4 | **Gate @qa: CONCERNS. Status: Ready for Review → Done.** Gate em `docs/qa/gates/debt.11-guarda-automatica-telemetria.yml`, revisão `971686b`. Os 13 ACs estão MET, e `DEBT10-TST-001` está fechado. check, sim:check e build saíram com 0, o golden hash ficou idêntico e o diff contra `971686b^` é só inserção (`55a56,58`). As provas do AC 4 batem byte a byte. As 6 mutações da story reprovam, e 10 das minhas 14 também. Não há vazamento de globais. Achados: `DEBT11-TST-001` (medium, valor do carimbo não guardado, @dev via @po, prazo R10) e `DEBT11-TST-002` (low, fixture sem carimbo parcial). | Quinn (@qa) |
| 2026-09-21 | 1.5 | **Roteamento @po dos achados do gate CONCERNS (`ca52e07`) e ordem de `determinism.ts` atualizada. Status permanece Done. Nenhum AC muda de critério, e QA Results não foi tocado.** **(1) Ordem:** as três menções à ordem antiga (nota do Status, "Depende de" e AC 12) ganharam uma anotação em itálico com a ordem vigente, `e4.8` → `debt.11` → `e4.9` → `e4.3` → `debt.12` → `e4.6` (§11.6.1 de `architecture-e4.md`, `e4.8` v1.5.0). O texto original ficou, porque descreve a ordem em que `971686b` foi feito e o gate conferiu. **(2) Dono de `DEBT11-TST-001` e `DEBT11-TST-002`: story nova, sugestão `debt.13` (opção B). A opção A, dobrar os dois em `debt.12`, foi rejeitada.** Três motivos. (a) **Prazo R10.** `debt.12` começa depois do commit de implementação de `e4.3`, que vem depois de `e4.9`, e `e4.3` é a maior story da fase. Com A, a correção fica atrás da cadeia inteira. `e4.7` coleta depois disso de qualquer jeito, mas a coleta de `debt.9` (b) é de um aparelho só, não depende da rede e poderia começar antes. A opção A a travaria sem motivo técnico. (b) **R9 não se aplica.** A correção abre `src/tools/guarda-telemetria.ts`, e não `determinism.ts`. A chamada, a impressão e o `throw` de `determinism.ts` já tratam qualquer problema novo que a guarda devolva. Por isso a story nova fica fora da ordem e pode começar já, em paralelo com `e4.9`, cujo escopo (`protocolo.ts`, `codec.ts`, `determinism.ts`) não toca os dois arquivos dela. (c) **Coesão.** `debt.12` tem escopo "só `determinism.ts`" e um gate sobre a fixture do fio. Pôr telemetria nela misturaria dois assuntos num gate e quebraria a frase de escopo que `e4.4` AC 1 e Task 0 citam. B custa uma story de 2 arquivos, e um deles só muda comentário. **(3) Pré-condição de coleta provisória** registrada em `e4.7` v1.6.0 e `debt.9` v1.3: até o commit de implementação de `debt.13` existir, o **valor** do carimbo não é guardado. A coleta espera esse commit, ou cada export da evidência é conferido à mão. —— **SPEC `debt.13` para o @sm (o número é do @sm). Título sugerido: "Guarda da telemetria confere o VALOR do carimbo — achados `DEBT11-TST-001` e `DEBT11-TST-002`".** **Origem:** gate de `debt.11` (`docs/qa/gates/debt.11-guarda-automatica-telemetria.yml`, `ca52e07`), TST-001 (medium) e TST-002 (low). O AC 5 de `debt.11` pedia só "finitos", então o achado é de alcance, e não desvio. **Depende de:** `debt.11` Done (`971686b`), e nada mais. **Não entra na ordem de `determinism.ts`, porque não abre esse arquivo.** **Pré-condição de início:** `git status --short src/tools/guarda-telemetria.ts src/tools/telemetria.ts` vazio. **Árvore compartilhada:** se, na hora da verificação, outra story (por exemplo `e4.9`) tiver mudança não commitada em `src/`, check, sim:check e mutações rodam num worktree descartável do commit de implementação desta story, e não na árvore. Escopo sempre por `git show --stat <commit de implementação>`, nunca por `git diff --stat`. **Prazo (R10):** commit de implementação antes da primeira coleta humana usada como evidência de `debt.9` (b) ou de `e4.7` AC 8, salvo a conferência manual que essas duas stories admitem. **ACs a levar:** (1) `npm run check` verde. (2) `npm run sim:check` verde, com golden hash idêntico. Na saída, só a linha `telemetria` pode mudar. (3) **Valor do carimbo (TST-001).** Em `guarda-telemetria.ts`, todo evento novo do export (`partida === PARTIDA_NOVA`) tem `atrasoTicks === ATRASO_ALVO_TICKS` e `escalaHp === ESCALA_HP`, importados de `../net/protocolo.ts` e de `../chars/tuning.ts`. A comparação é por `===`, sem tolerância, porque o coletor copia a constante e não calcula nada. A asserção de presença (M1) continua, e a de valor gera um problema próprio, com o valor achado e o esperado de cada campo, para que "sem carimbo" e "carimbo errado" não se confundam. (4) **Setas.** Os dois imports novos usam `tools/ → net/` (declarada em §2.2 desde `e4.2`) e `tools/ → chars/` (na tabela desde sempre). Conferido por @po na §2.2 de `architecture-e4.md`, linha `tools/ … → sim/, chars/, bot/, match/, shop/, net/`. `net/protocolo.ts` só tem `import type`, e `chars/tuning.ts` não tem import, então nenhum módulo novo entra em runtime. Nenhum destino novo em `client/`: `grep -rln "from '\.\./client/" src/tools/` continua devolvendo exatamente `guarda-telemetria.ts` e `telemetria.ts`, e a linha de import de `client/` da guarda não muda. (5) **Carimbo parcial no fixture (TST-002).** O `FIXTURE` ganha dois eventos, um com `{ escalaHp: 6 }` sem `atrasoTicks` e outro com `{ atrasoTicks: 6 }` sem `escalaHp`. Os dois caem na população desconhecida. `SEM_CARIMBO_FIXTURE` e `N_COMBINADO_FIXTURE` continuam **derivados** do fixture, e não literais, e passam a 4 e 9. Nenhuma população tem 9 (as três ficam com 3, 2 e 4), então a propriedade que pega a M3 se mantém. `POPULACOES_FIXTURE` continua 3. O comentário do fixture (hoje "n combinado é 7") é atualizado. Os dois sentidos são necessários: um só evento pega a M2 parcial num campo e deixa passar a do outro. (6) **Contrafactual**, numa cópia descartável, com cada resultado no Dev Agent Record. Saem com rc=1: Q12 (`atrasoTicks: 0, escalaHp: 1` literais em `registrar()`), Q12a (só `atrasoTicks: 0`), Q12b (só `escalaHp: 1`), Q13 (`atrasoTicks ?? 0` só no atraso de `populacaoDe()`) e Q13b (`escalaHp ?? 1` só na escala). Reaplicar também M1, M1b, M2, M3, MR1 e as duas formas de MR2, que continuam com rc=1. A benigna Q1 (formato de número em `agregarPopulacao()`) continua com rc=0. (7) **Limite conhecido, registrado e não corrigido.** Enquanto `ATRASO_ALVO_TICKS` e `ESCALA_HP` valerem o mesmo (6 e 6.0 hoje), um carimbo com os dois campos trocados passa pela checagem de valor. Os Dev Notes dizem isso, e a linha `telemetria` do `sim:check` imprime os dois valores esperados, para que quem revisar veja quando deixarem de coincidir. Nenhuma asserção é exigida. (8) **Comentário desatualizado em `tools/telemetria.ts`** (bloco de `populacaoDe()`, `:57-58`). A frase "`tools/ → net/` não existe na tabela de camadas" é falsa desde `e4.2`, e sai. O motivo que continua certo fica: o agregador não importa as constantes de propósito, porque o valor histórico certo é o gravado, não o de hoje. O diff desse arquivo tem só linhas de comentário daquele bloco. (9) **Escopo:** `src/tools/guarda-telemetria.ts` e `src/tools/telemetria.ts`, este só no comentário do AC 8. Proibido: `src/tools/determinism.ts`, `src/client/`, `src/net/`, `src/chars/`, `src/sim/`, `src/match/` e `docs/`, exceto a própria story. Prova por `git show --stat <commit de implementação>`. **Complexidade sugerida:** XS. São 2 arquivos, e o maior risco é esquecer o sentido inverso do fixture. **Ao fechar:** o @po retira a cláusula provisória de `e4.7` v1.6.0 e de `debt.9` v1.3. **Fatos conferidos para esta linha:** `registrar()` carimba em `src/client/telemetria.ts:163` com `ATRASO_ALVO_TICKS` (`net/protocolo.ts:38`, valor 6) e `ESCALA_HP` (`chars/tuning.ts:10`, valor 6.0). A guarda afirma só `!semCarimbo` nos novos (`guarda-telemetria.ts:221` e `:232-236`), e `PARTIDA_NOVA = 901` fica em `:190`. O fixture tem 7 eventos (`:60-68`), com `N_COMBINADO_FIXTURE` e `SEM_CARIMBO_FIXTURE` derivados em `:70-71`. O comentário desatualizado está em `tools/telemetria.ts:57-58`. As setas estão no bloco de camadas da §2.2 de `architecture-e4.md`. Nenhuma story Ready ou Draft abre `guarda-telemetria.ts`. Das que citam `tools/telemetria.ts`, `debt.9` só o executa, e as outras estão Done. O arquivo de `e4.9` que o @sm está criando não foi lido nem tocado. | Pax (@po) |
