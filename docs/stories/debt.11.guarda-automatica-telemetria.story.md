# Story debt.11: Guarda automática da telemetria no `sim:check` — achado `DEBT10-TST-001`

## Status

Ready

> **Ready, com pré-condição de início (v1.1).** @dev: esta story começa **depois do commit de
> implementação de `e4.8`**, com `git status --short src/tools/determinism.ts` vazio. Ordem registrada pelo
> @po em `e4.8` v1.1.0 e `e4.3` v1.4.0: **`e4.8` → `debt.11` → `e4.3`**. Ver AC 12.

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run check", "npm run sim:check (golden hash idêntico ao baseline atual; diff da saída completa antes×depois SÓ COM INSERÇÃO — R8)", "as 4 mutações do gate aplicadas à mão (M1, M1b, M2, M3), cada uma revertida depois — cada uma deve fazer sim:check sair com código diferente de 0", "grep -rn \"from '\\.\\./client/\" src/tools/ — critério por arquivo e destino, não por contagem (AC 11): as 2 linhas de tools/telemetria.ts sem mudança (→client/input.ts; →client/telemetria.ts, import type) mais 1 ou 2 linhas de tools/guarda-telemetria.ts, todas →client/telemetria.ts; grep -rln com o mesmo padrão devolve exatamente tools/guarda-telemetria.ts e tools/telemetria.ts", "os 5 exports reais de docs/evidence/telemetria/ rodados pelo CLI (tools/telemetria.ts) antes e depois desta story — saída byte a byte idêntica", "node src/tools/telemetria.ts sem argumento continua imprimindo 'uso:' e saindo com 1, depois da guarda de entrada do AC 4", "git show --stat <commit(s) desta story> — NUNCA a árvore de trabalho compartilhada, porque determinism.ts está disputado por outras stories em voo (ver AC 12)"]
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
   **Critério verificável:** para cada chave instalada, o descritor próprio de `globalThis` depois da guarda
   é igual ao de antes, inclusive quando ausente. `console.warn` é capturado durante a execução da guarda, e
   a saída do `sim:check` não ganha linhas `[telemetria]` soltas fora da seção da guarda. A guarda pode
   afirmar sobre os avisos capturados (`architecture-e4.md` §2.2, **R3**).
6. **O fixture misto vive em código, dentro de `guarda-telemetria.ts`, não em `docs/`.** Nada de
   `docs/evidence/telemetria/fixture-misto.json` (a sugestão original do gate foi revista pelo @architect).
   Motivos registrados na fonte: o `sim:check` hoje só lê disco em `src/chars/`; `docs/evidence/` é pasta de
   evidência que humanos substituem/reeditam, e trocar um JSON de lá mudaria o teste sem diff em `src/`; e o
   fixture em código deixa visível, no próprio diff revisável, a propriedade que discrimina. Composição
   mínima do fixture: pelo menos **duas populações conhecidas** com rodadas plausíveis (ex.: (6, 6) e
   (0, 6)) mais eventos sem carimbo, de modo que **nenhuma população tenha o `n` combinado** — a mesma
   propriedade discriminante que o `@qa` usou no gate de `debt.10` (`architecture-e4.md` §2.2, **R4**).
7. **As 4 mutações do gate reprovam o `sim:check`.** Cada uma aplicada à mão, `npm run sim:check` rodado e
   revertido, com resultado registrado no Dev Agent Record:
   - **M1** — sem carimbo em `registrar()`;
   - **M1b** — carimbo movido para `exportar()`;
   - **M2** — `atrasoTicks ?? 0` / `escalaHp ?? 1` em `populacaoDe()`;
   - **M3** — `agregar()` devolvendo `agregarPopulacao(eventos)` sem partição.

   As 4 precisam sair com código diferente de 0. **As asserções sobre `agregar()` leem rótulo e cabeçalho**
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
- @qa (quality gate — confere as 4 mutações de fato reprovando o `sim:check`, a restauração de globais pelo
  descritor, o `diff` da saída só com inserção, e que nenhum arquivo fora da lista fechada foi tocado)

**Supporting Agents**:
- @architect (dono da decisão de forma em `architecture-e4.md` §2.2; consultar só se um dos R1–R10 se
  mostrar inaplicável na implementação — não para decidir de novo o que já foi decidido)
- @po (dono do roteamento que criou esta story e da pergunta em aberto sobre `e4.7`; não implementa)

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
- As 4 mutações do gate (M1, M1b, M2, M3) de fato fazem `sim:check` sair com código diferente de 0 (AC 7)
- Restauração de globais pelo descritor original, em `finally`, nunca por `delete` (AC 5)
- `determinism.ts` não importa `client/` nem `tools/telemetria.ts` diretamente — só `guarda-telemetria.ts`
  (AC 3, 11)
- O `diff` do `sim:check` antes × depois é só inserção, sem mover nem alterar linha existente (AC 2)

**Secondary Focus**:
- `tools/telemetria.ts` não ganha import nem export novo além da guarda de entrada (AC 4)
- Nenhuma seta nova de camada além das três já declaradas em `architecture-e4.md` §2.2 (AC 11)

## Tasks / Subtasks

- [ ] Task 0 — Pré-condição de sequência (AC: 12)
  - [ ] Confirmar que o commit de implementação de `e4.8` existe (ou, na exceção do AC 12, o de `e4.3`);
        registrar o hash usado como base e qual caso valeu no Dev Agent Record
  - [ ] Confirmar que `git status --short src/tools/determinism.ts` sai vazio

- [ ] Task 1 — `src/tools/guarda-telemetria.ts` (AC: 3, 5, 6, 8)
  - [ ] Criar o arquivo, exportando `verificarTelemetria(): { linhas: string[]; problemas: string[] }`, no
        molde de `verificarPartida` (`src/tools/partida.ts:880`)
  - [ ] Montar o fixture misto sintético em código (mínimo: duas populações conhecidas + eventos sem
        carimbo, nenhuma com o `n` combinado)
  - [ ] Instalar `localStorage`/`document`/`Blob` falsos, com o `localStorage` já contendo ao menos um evento
        sem carimbo sob `CHAVE`; exercitar `criarTelemetria()`/`registrar()` real, capturar o que
        `exportar()` entregaria e afirmar: eventos novos com carimbo finito, evento antigo sem carimbo (AC 5)
  - [ ] Restaurar cada global pelo descritor original (`getOwnPropertyDescriptor`/`defineProperty`) num
        `finally`
  - [ ] Capturar `console.warn` durante a execução da guarda
  - [ ] Chamar `agregar()` real sobre o fixture; afirmar por rótulo/cabeçalho (não por número formatado):
        quantidade de blocos, presença de população "desconhecida", ausência de bloco com `n` combinado
  - [ ] Se `DEBT10-COD-003` entrar (Task 2b): afirmar que a contagem do aviso de `ler()` bate com a
        população desconhecida

- [ ] Task 2 — `src/tools/telemetria.ts` (AC: 4)
  - [ ] Trocar a chamada incondicional de `main()` (linha 307) por `if (import.meta.main) main()`
  - [ ] Registrar a versão do Node usada e confirmar que `import.meta.main` está disponível
  - [ ] Task 2b (opcional, `DEBT10-COD-003`, AC 8, 9): alinhar o critério de "sem carimbo" em
        `client/telemetria.ts:ler()` a `!Number.isFinite`; no texto do agregador, distinguir "sem carimbo"
        de "carimbo inválido" — registrar a decisão de incluir ou não no Dev Agent Record

- [ ] Task 3 — `src/tools/determinism.ts` (AC: 3, 11)
  - [ ] Importar `verificarTelemetria` de `./guarda-telemetria.ts`
  - [ ] Chamar a função, imprimir a(s) linha(s) de seção no ponto fixo depois das seções existentes
  - [ ] Acrescentar o bloco `throw` no padrão dos que já existem, disparando quando `problemas.length > 0`

- [ ] Task 4 — Documentação (AC: 9, opcional junto com `DEBT10-COD-003`)
  - [ ] Emendar a linha `b8e8a41` de `docs/evidence/telemetria/README.md` (janela vazia no build publicado)
  - [ ] Acrescentar a hora à linha `debt.10` da mesma tabela

- [ ] Task 5 — As 4 mutações, aplicadas e revertidas (AC: 7)
  - [ ] M1 — sem carimbo em `registrar()`: aplicar, rodar `sim:check`, confirmar código != 0, reverter
  - [ ] M1b — carimbo em `exportar()`: aplicar, rodar `sim:check`, confirmar código != 0, reverter
  - [ ] M2 — `?? 0` / `?? 1` em `populacaoDe()`: aplicar, rodar `sim:check`, confirmar código != 0, reverter
  - [ ] M3 — `agregar()` sem partição: aplicar, rodar `sim:check`, confirmar código != 0, reverter

- [ ] Task 6 — Verificação (AC: 1, 2, 4, 10, 11, 12)
  - [ ] `npm run check` — 0 erros
  - [ ] `npm run sim:check` antes e depois da mudança — golden hash idêntico, `diff` só com inserção
  - [ ] `git show --stat` do(s) commit(s) desta story, restrito à lista fechada do AC 10
  - [ ] `grep -rn "from '\.\./client/" src/tools/` — as 2 linhas de `tools/telemetria.ts` sem mudança, mais
        1 ou 2 de `tools/guarda-telemetria.ts`, todas para `client/telemetria.ts`; `grep -rln` = os 2 arquivos (AC 11)
  - [ ] Os 5 exports reais de `docs/evidence/telemetria/` rodados pelo CLI, antes × depois — byte a byte
        idênticos
  - [ ] `node src/tools/telemetria.ts` sem argumento — ainda imprime `uso:` e sai com 1

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
- As 4 mutações do gate (M1, M1b, M2, M3), cada uma aplicada, testada e revertida — todas devem fazer
  `sim:check` sair com código diferente de 0.
- `node src/tools/telemetria.ts` sem argumento — continua imprimindo `uso:` e saindo com 1, depois da
  guarda de entrada.
- Os 5 exports reais de `docs/evidence/telemetria/` rodados pelo CLI, antes × depois — saída byte a byte
  idêntica.
- `grep -rn "from '\.\./client/" src/tools/` — só os pares da tabela de setas declarada (critério por
  arquivo e destino, não por contagem de linhas; ver AC 11).

## Dev Agent Record

### Agent Model Used

_A preencher pelo @dev._

### Debug Log References

_A preencher pelo @dev._

### Completion Notes

_A preencher pelo @dev._

### File List

_A preencher pelo @dev._

## QA Results

_A preencher pelo @qa._

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-09-21 | 1.0 | Story criada a partir do achado `DEBT10-TST-001` do gate `CONCERNS` de `debt.10` (`docs/qa/gates/debt.10-telemetria-marca-atraso-de-input.yml`, severidade medium), conforme roteamento do @po registrado no Change Log v1.4 de `docs/stories/debt.10.telemetria-marca-atraso-de-input.story.md`. Os Acceptance Criteria (R1–R10) transcrevem, com citação e sem paráfrase onde a fonte já era precisa, a decisão vinculante do @architect em `docs/architecture-e4.md` §2.2 (commit `6f8ee7c`), que também declara e fecha a seta de camada `tools/ → client/`. Escopo: `src/tools/guarda-telemetria.ts` (novo), `src/tools/determinism.ts` (só R1), `src/tools/telemetria.ts` (só R2, e opcionalmente `DEBT10-COD-003`), `src/client/telemetria.ts` (só se `DEBT10-COD-003` entrar) e `docs/evidence/telemetria/README.md` (`DEBT10-DOC-002`). **Sequenciamento (R9):** registrado como assunção de trabalho que a implementação começa depois do commit de `e4.8` (story do codec do fio, criada no mesmo dia), a confirmar pelo @po, já que `e4.3` e `e4.6` também disputam `src/tools/determinism.ts`. **Pergunta em aberto para o @po (R10):** se `e4.7` deve listar `debt.11` como pré-condição no seu próprio texto — não decidida por esta story, nem por `architecture-e4.md` §2.2. Status: Draft. | River (@sm) |
| 2026-09-21 | 1.1 | **Validação @po: GO 10/10 (8/10 antes das correções: itens 3 "AC testáveis" e 5 "dependências" estavam parciais). Status: Draft → Ready.** **R1–R10 conferidos um a um contra `architecture-e4.md` §2.2 (`6f8ee7c`, linhas 341–476):** R1→AC 3, R2→AC 4, R3→AC 5, R4→AC 6, R5→AC 7, R6→AC 8, R7→AC 10, R8→AC 2, R9→AC 12, R10→AC 13, e a seta declarada→AC 11. As citações de Dev Notes batem com a fonte, com as elisões marcadas. **Fatos conferidos:** `tools/telemetria.ts` tem 307 linhas, com `main()` em `:289`, `process.exit(1)` sem `argv[2]` e `main()` incondicional em `:307`; `:2` importa valor de `client/input.ts` (`ARRASTO_MAX`, `LIMIAR_ARRASTO_PX`) e `:3` faz `import type` de `client/telemetria.ts`; `agregar` exportado em `:84`, `populacaoDe` com `Number.isFinite` em `:62-64` (o alvo da M2), `agregarPopulacao` em `:146` e o cabeçalho `'P3.1  mediana…'` em `:170`. `client/telemetria.ts` exporta `CHAVE` (`:35`) e `criarTelemetria` (`:145`). `localStorage` só aparece dentro de funções (`persistir` `:150`, `ler` `:191`), e `document` só em `baixar` (`:220`). O carimbo está em `registrar` (`:163`), `exportar` em `:167`, e `ler` usa `=== undefined` (`:202`, alvo de `DEBT10-COD-003`). `partida.ts:880` traz `verificarPartida(): { linhas; problemas }`. `determinism.ts` tem 985 linhas, com import em `:38`, chamada em `:859`, impressão em `:902` e bloco `throw` em `:960-963`. Node local é 24.13.1: `import.meta.main` foi medido em arquivos de scratchpad (`true` como entrada, `false` importado) e está declarado em `@types/node` 26.1.2 (`web-globals/importmeta.d.ts:9`). O CI (`deploy-pages.yml`) usa Node 20, mas só roda `vite build`, que não empacota `tools/`, e por isso o CLI mudo em Node antigo não chega ao CI. Mutações M1/M1b/M2/M3 conferidas contra o gate de `debt.10` (evidência "Mutações próprias"). Há 5 exports em `docs/evidence/telemetria/`, e as linhas `b8e8a41`/`debt.10` do README estão como AC 9 descreve. `3de1cfe` é de 2026-09-21 03:58:44 −03. **Correções no lugar:** **(1) AC 11 — contagem errada.** "Exatamente as 3 linhas" confundia os pares da tabela de §2.2 com linhas do grep. A própria §2.2 diz que o grep "deve devolver só os **dois arquivos**". Hoje o grep devolve 2 linhas de 1 arquivo. Depois de `debt.11`, devolve essas 2 linhas mais 1 ou 2 de `guarda-telemetria.ts`, conforme o @dev junte ou separe `import type`. Com a redação antiga, a forma com `import type` separado reprovaria um código correto. O critério agora é por arquivo e destino (`grep -rln` = os 2 arquivos, as 2 linhas pré-existentes sem mudança e todo destino novo em `client/telemetria.ts`). Corrigido no AC 11, em `quality_gate_tools`, na Task 6 e em Testing. **(2) AC 5 — "nunca `delete`" contra "voltar a `undefined`".** No Node 24.13.1, `localStorage` e `document` **não têm descritor próprio** em `globalThis` (medido). Sem `delete`, a restauração deixaria uma propriedade que não existia antes, e as duas exigências do AC eram incompatíveis. A regra agora segue o motivo que R3 declara: com descritor original, `defineProperty` e nunca `delete` (protege um `localStorage` nativo futuro); sem descritor, remove-se a propriedade que a própria guarda criou. Critério: descritor antes igual ao descritor depois, inclusive ausente. **@architect: interpretação de R3 registrada para ratificação, não bloqueante.** **(3) AC 5 + Task 1 — cenário do coletor explícito.** O AC 7 exige que a M1b reprove, mas nenhum AC obrigava pré-carregar um evento antigo sem carimbo nem afirmar que ele continua sem carimbo no export, que é o que pega a M1b ("velho ganhou carimbo", no gate). Agora é explícito, junto com a asserção do carimbo nos novos, que pega a M1. É a sugestão (b) do gate. **(4) "Depende de" e AC 12 (R9) — decisão do @po.** Os estados estavam desatualizados: `e4.3` e `e4.8` apareciam como Draft e as duas estão Ready desde `b76b6ff`. Fica registrada a ordem **`e4.8` → `debt.11` → `e4.3`**, idêntica à de `e4.8` v1.1.0 e `e4.3` v1.4.0 e sem contradizê-las. A exceção da regra de `e4.3` também entra: se `e4.3` começar antes, esta começa depois do commit dela. A pré-condição de início passa a ser `git status --short src/tools/determinism.ts` vazio, e a Task 0 foi alinhada. `e4.6` sai da lista de candidatas a base, porque depende de `e4.3`. **(5) AC 13 e "Depende de" (R10) — decisão do @po: sim.** `e4.7` deve listar `debt.11` como **pré-condição de coleta**, não de início: nenhuma partida cujo export entre na evidência do AC 8 de `e4.7` é jogada antes do commit de implementação desta story. `e4.7` **não foi editada** nesta validação, e a emenda fica roteada ao @po. **Registrado, fora desta story:** `debt.9` (Draft) tem o mesmo prazo pela pré-condição (b), e a mesma pré-condição de coleta vale para ela na próxima edição. **Não editado (Dev Notes são do @dev):** os bullets de "O que esta story explicitamente NÃO faz" sobre `e4.7` e sobre a base de sequência continuam verdadeiros, porque a decisão foi do @po e não da story, e foram superados pelos AC 12/13. `quality_gate: @qa` fora da lista do task genérico é convenção do projeto em todas as stories. | Pax (@po) |
