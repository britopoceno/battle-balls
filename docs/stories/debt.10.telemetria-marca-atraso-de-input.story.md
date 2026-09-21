# Story debt.10: Telemetria marca o atraso de input (e `ESCALA_HP`) por evento — achado `E41-TEL-002`

## Status

Done

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run check", "npm run sim:check (hash idêntico esperado — esta story não toca sim/ nem match/)", "sim:check rodado antes e depois, diff da saída completa vazio", "git show --stat <commit(s) desta story> restrito ao escopo do AC 10 — medir pelo commit desta story, NUNCA pela árvore de trabalho compartilhada; confirmar ausência de src/net/snapshot.ts, src/net/projecao.ts, src/client/render.ts e src/tools/determinism.ts (conflito com e4.2, ver AC 3)", "revisão manual: cada evento novo carrega o atraso e a escala em vigor no INSTANTE DA GRAVAÇÃO, não do export; dado exportado antes desta story não é lido como atraso 0 / escala 1.0 por omissão"]
```

## Story

**Como** desenvolvedor corrigindo o achado `E41-TEL-002` do gate de `e4.1`
(`docs/qa/gates/e4.1-ativar-atraso-de-input.yml`),
**eu quero** que cada evento gravado pelo coletor de telemetria (`client/telemetria.ts`) carregue o atraso de
input (`ATRASO_ALVO_TICKS`) e a escala de HP (`ESCALA_HP`) em vigor no momento em que foi gravado, e que o
agregador (`tools/telemetria.ts`) reporte essas populações separadamente ou avise em vez de misturá-las
caladamente,
**para que** uma única exportação de `localStorage` — que **sobrevive a trocas de build** — não misture, sem
nenhuma marca, sessões jogadas com atraso 0 e sessões jogadas com atraso 6 (nem escalas de HP diferentes),
contaminando exatamente as comparações que `debt.9` (pré-condição b) e o baseline de P4.4 (`e4.7`) vão
precisar fazer.

## Depende de

`e4.1` (`b8e8a41`, 2026-09-21) — ativou `ATRASO_ALVO_TICKS` no modo local e é a origem do achado. `e3.6` —
fixou `ESCALA_HP = 6.0` (`src/chars/tuning.ts:10`). `e3.5` — criou o coletor (`client/telemetria.ts`) e o
agregador (`tools/telemetria.ts`).

**Não depende de `e4.2` em conteúdo, mas é SEQUENCIADA depois dela** (ver AC 3). `e4.2` está sendo
implementada agora na mesma árvore de trabalho, e é dona de `src/net/snapshot.ts`, `src/net/projecao.ts`, e
das **únicas** alterações permitidas em `src/tools/determinism.ts` e `src/client/render.ts` (AC 14 de
`e4.2`) — a guarda de ida-e-volta (AC 7) e a asserção QA-D8-01 (AC 13) que ela acrescenta ao `sim:check`,
com o golden hash que as duas stories mantêm idêntico. Esta story não toca nenhum dos quatro arquivos (ver
AC 3 e AC 10) e não decide sozinha o que fazer se um conflito de merge aparecer — nesse caso, resolver
localmente sem alterar o conteúdo que é escopo de `e4.2`.

**Origem exata do mandato — citado, não resumido de memória:**

> **(i)** um arquivo exportado permite separar sessões com atraso 0 de sessões com atraso 6 **sem
> reconstruir pela linha do tempo de commits**. Hoje `CHAVE = 'bb.telemetria.v1'`
> (`client/telemetria.ts:25`) é também a `versao` do export (`:139`), nenhum evento traz o atraso, e o
> `localStorage` sobrevive a trocas de build. [...] **(ii)** O agregador (`tools/telemetria.ts`) reporta a
> população por atraso, ou avisa em vez de misturar calado, no mesmo padrão do aviso de `mag` ausente
> (TEL-E35-001). **(iii)** A fronteira (`b8e8a41`, 2026-09-21) fica anotada em
> `docs/evidence/telemetria/README.md`. **Sugestão ao @architect:** decidir junto se o marcador cobre
> também `ESCALA_HP`. É a mesma classe de defeito: `E37-DOC-004` deixou duas partidas (`734981348`,
> `21386782`) sem atribuição de escala porque o arquivo não dizia qual era. **Escopo provável:**
> `client/telemetria.ts`, talvez `client/main.ts` (ligação), `tools/telemetria.ts` e o README;
> hash-neutro, sem `sim/`/`match/`; tamanho S. Numeração sugerida: `debt.10` [...] **Prioridade:** precede
> qualquer coleta humana que se pretenda usar como evidência de `debt.9` (pré-condição b) ou como baseline
> de P4.4 (`e4.7`). **Não bloqueia** o re-gate desta story [e4.1].

[Fonte: `docs/stories/e4.1.ativar-atraso-de-input.story.md`, Change Log v1.4.0, @po]

O achado original, na fonte do gate:

> A telemetria não tem como separar sessões com atraso 0 de sessões com atraso 6. `versao` continua
> 'bb.telemetria.v1', nenhum evento traz o atraso, e o coletor espelha em localStorage, que SOBREVIVE a
> trocas de build. Uma única exportação feita depois de b8e8a41 pode misturar rodadas de antes e de
> depois sem nenhuma marca [...] Também soma uma segunda variável de população à amostra ×6.0 que a
> debt.9 espera.

[Fonte: `docs/qa/gates/e4.1-ativar-atraso-de-input.yml`, achado `E41-TEL-002`, severidade medium]

**Não decide** a pergunta aberta registrada em `debt.9` v1.1 ("a pré-condição (b) passa a exigir '×6.0 **e**
atraso 6', ou aceita dado misto explicitamente?") — essa é decisão do usuário/@pm. Esta story só torna a
resposta **aplicável** depois, gravando o dado que hoje falta. Não editar `debt.9` nem `e4.1` a partir desta
story: o precedente do projeto (`e3.7` → `debt.9`) não retroalimenta a story de origem com uma referência
cruzada quando a story de destino nasce — o Change Log de `e4.1` v1.4.0 já é o registro suficiente do
roteamento.

## Acceptance Criteria

1. `npm run check` verde.
2. `npm run sim:check` verde, com **golden hash idêntico** ao baseline atual. Esta story não toca
   `src/sim/`, `src/match/`, `src/shop/`, `src/bot/`, nem `src/net/`/`src/chars/` além da **leitura** já
   existente de `ATRASO_ALVO_TICKS` (`client/main.ts:8`) e da leitura nova, também só de leitura, de
   `ESCALA_HP`. Rodar `sim:check` antes e depois da mudança e conferir que o `diff` da saída completa é
   vazio — mesmo padrão de prova usado em `e4.1`/`e4.2`.
3. **Conflito de arquivo em andamento com `e4.2` (story em implementação no momento em que esta foi
   escrita).** `e4.2` é dona de `src/net/snapshot.ts`, `src/net/projecao.ts`, e das únicas alterações
   permitidas em `src/tools/determinism.ts` e `src/client/render.ts` — a guarda de ida-e-volta e a
   asserção QA-D8-01 que ela acrescenta ao `sim:check`. Esta story **não toca nenhum dos quatro arquivos**,
   em nenhuma hipótese. `git show --stat` do(s) commit(s) desta story não deve conter nenhum deles.

   **Sequenciamento explícito (adicionado na validação @po):**
   - **A implementação desta story começa só depois que o commit de implementação de `e4.2` existir**, ou
     seja, quando as alterações de `e4.2` em `render.ts`, `determinism.ts`, `net/snapshot.ts` e
     `net/projecao.ts` tiverem saído da árvore de trabalho para um commit. A dependência não é de conteúdo,
     é de prova. Com `e4.2` ainda não commitada na mesma árvore, (a) o `sim:check` "antes e depois" do AC 2
     absorveria as linhas novas da guarda de `e4.2`, e o `diff` deixaria de sair vazio por causa dela; e
     (b) qualquer `git diff --stat` da árvore mostraria os arquivos de `e4.2` como se fossem desta story.
     Não é preciso esperar `e4.2` chegar a Done.
   - **`client/main.ts`.** O AC 14 de `e4.2` proíbe **a `e4.2`** de alterá-lo, e o gate de `e4.2` confere
     "`main.ts` intocado". Se esta story tocar `main.ts` (AC 10, só ligação), a mudança vai num commit
     **desta** story, posterior ao de `e4.2`. A conferência de `e4.2` continua válida porque é feita sobre
     o(s) commit(s) de `e4.2`, não sobre a árvore.
   - **Forma preferida, que elimina o contato com `main.ts`:** carimbar dentro de `registrar()` em
     `client/telemetria.ts`, importando ali `ATRASO_ALVO_TICKS` e `ESCALA_HP` (`client/ → todos` está na
     tabela). Os três pontos de chamada em `main.ts` (`:134`, `:238`, `:319`) não mudam, nem a assinatura
     `registrar(partida, eventos)`. `tools/telemetria.ts:3` importa de `client/telemetria.ts` **só tipos**
     (`import type`, que é apagado na execução), então essa forma não cria aresta de execução
     `tools/ → net/`. Se o `@dev` escolher outra forma que exija `main.ts`, registra o motivo no Dev Agent
     Record.
4. **Cada evento novo grava o atraso e a escala em vigor no INSTANTE DA GRAVAÇÃO, não do export.** Como o
   `localStorage` acumula entre trocas de build (`e3.5` AC 4 / docblock de `CHAVE`,
   `client/telemetria.ts:20-25`), um único array pode conter eventos escritos sob código antigo (atraso 0)
   e código novo (atraso 6) — carimbar só no momento do `exportar()` (`client/telemetria.ts:137-144`)
   atribuiria o valor ATUAL a eventos que foram gravados sob um valor diferente. A gravação já carimba
   `partida` por evento (`registrar`, `client/telemetria.ts:132-136`); o carimbo novo segue o mesmo
   mecanismo — por evento, não por export.

   **A forma exata do campo é decisão do `@dev` (ou handoff para `@architect`, ver abaixo), restrita por:**
   - deve ser **por evento** (ou por unidade que já existe por evento, como `partida`) — nunca só no nível
     do objeto exportado (`exportadoEm`, `ArquivoTelemetria.versao`), pelo motivo do parágrafo acima;
   - o valor gravado é **lido da constante em tempo de execução** (`ATRASO_ALVO_TICKS` de
     `net/protocolo.ts:38`, `ESCALA_HP` de `chars/tuning.ts:10`) — nunca inferido de data, de hash de
     commit ou de heurística sobre a duração da rodada;
   - dado exportado **antes** desta story (sem o campo novo) é lido como **"desconhecido"** — nunca como
     atraso 0 ou escala 1.0 por omissão silenciosa, mesmo padrão do aviso de `mag` ausente
     (`tools/telemetria.ts:154-158`, achado `TEL-E35-001`);
   - se a solução escolhida for subir `CHAVE`/a `versao` do arquivo para `bb.telemetria.v2` em vez de (ou
     além de) carimbar o campo por evento, documentar explicitamente no Dev Agent Record por que isso
     também satisfaz o AC 5 — bump de versão sozinho separa por **chave de armazenamento** o que for
     gravado a partir da troca, mas não tem efeito retroativo sobre o que já estiver acumulado hoje,
     misturado, sob `v1`. **O bump também tem um modo de falha próprio:** `ler()` e `exportar()` só
     enxergam a chave corrente (`client/telemetria.ts:161` e `:139`). O acúmulo que ficar sob `v1` deixa
     de ser exportável pelo jogo e fica órfão no `localStorage`, sem nenhum chamador que o leia. Se houver
     bump, o @dev registra no Dev Agent Record o destino do acúmulo `v1`: exportado antes, lido junto como
     "desconhecido", ou perda aceita explicitamente. Descarte silencioso não é aceitável.
   - se o `@dev` julgar que a forma deve ser fixada pelo `@architect` antes da implementação (porque
     nenhum documento de arquitetura a fixa hoje), este AC vira **handoff** — registrado no Dev Agent
     Record, no mesmo padrão de `e4.1`/`e4.2` (documento de forma é decisão do `@architect`, quem
     implementa é o `@dev`) — e a story para aqui até a resposta, em vez de inventar a forma sozinha.
5. **O arquivo exportado permite separar sessões de atraso 0 das de atraso 6, e escalas de HP diferentes,
   sem reconstruir pela linha do tempo de commits.** Teste de aceitação: gerar (ou simular, com um fixture)
   um export com eventos de pelo menos duas combinações diferentes de (atraso, escala) e confirmar que dá
   para particionar os eventos por essas combinações usando **só** o conteúdo do arquivo.
6. **`tools/telemetria.ts` reporta cada população (atraso, escala) separadamente, ou avisa explicitamente
   em vez de misturar calado** — mesmo padrão do aviso de `mag` ausente (`tools/telemetria.ts:154-158`) e
   de `anguloErro` inválido (`:164-170`). Se o arquivo tiver eventos de mais de uma combinação de
   (atraso, escala), o agregador **não** reporta um único número de P3.1/P3.2/P3.3/RF-36 misturando as
   duas — ou particiona e reporta cada uma, ou recusa o cálculo combinado e avisa qual é a mistura
   encontrada.
7. **Compatibilidade com dado antigo.** Um arquivo exportado antes desta story (sem os campos novos)
   continua sendo aceito pelo agregador sem crash — os eventos sem o campo caem no grupo "desconhecido",
   relatado como tal (mesma disciplina do AC 4), nunca silenciosamente somado a um grupo conhecido.
8. **`ESCALA_HP` (`src/chars/tuning.ts:10`) é registrado pelo mesmo mecanismo do atraso** (mesma decisão de
   forma do AC 4), cobrindo a mesma classe de defeito que `E37-DOC-004` (partidas do README de evidência
   sem atribuição de escala). Se o `@dev` (ou o `@architect`, caso o AC 4 vire handoff) decidir, com
   justificativa registrada no Dev Agent Record, que só o atraso é resolvido nesta story e a escala fica
   para outra story, isso é aceitável — mas precisa ser decisão explícita, não omissão silenciosa.
9. `docs/evidence/telemetria/README.md` ganha uma entrada anotando a fronteira `b8e8a41` (2026-09-21,
   `e4.1`: sai o literal `INPUT_DELAY_TICKS = 0` de `client/main.ts`, e o cast humano do modo local passa
   a usar `ATRASO_ALVO_TICKS` = 6, de `net/protocolo.ts`). A entrada anota também a fronteira do commit
   desta story, a partir do qual os eventos trazem o carimbo, no mesmo formato da tabela/linha do tempo já
   existente no arquivo (seção "A linha do tempo intercala exatamente com os commits da bissecção de
   e3.6" é o precedente de formato a seguir, não a copiar literalmente — o evento aqui é outro).
10. **Escopo de arquivos.**

    | Permitido | Motivo |
    |---|---|
    | `src/client/telemetria.ts` | o coletor — campo(s) novos por evento, leitura de dado antigo tratada como "desconhecido" |
    | `src/client/main.ts` | **só se a forma escolhida exigir** (a forma preferida do AC 3 não exige), em commit posterior ao de `e4.2` (AC 3), e **só a ligação**: repassar ao coletor o valor já lido de `ATRASO_ALVO_TICKS` (import já existe, `main.ts:8`) e de `ESCALA_HP` (import novo, de `chars/tuning.ts`) no ponto de gravação — nenhuma regra de jogo nova |
    | `src/tools/telemetria.ts` | o agregador — agrupamento por (atraso, escala), avisos de mistura e de dado desconhecido |
    | `docs/evidence/telemetria/README.md` | anotação da fronteira (AC 9) |

    **Proibido, sem exceção:** `src/sim/`, `src/match/`, `src/shop/`, `src/bot/`, `src/chars/` (além da
    leitura de `ESCALA_HP`, que não altera o arquivo), `src/net/` (além da leitura já existente de
    `ATRASO_ALVO_TICKS`, que não altera o arquivo), `src/client/render.ts`, `src/client/input.ts`,
    `src/tools/determinism.ts` (conflito com `e4.2`, ver AC 3), `src/net/snapshot.ts`,
    `src/net/projecao.ts` (não existem ainda nesta story; são de `e4.2`).

    **Nenhuma seta nova na tabela de camadas** (`architecture-e4.md` §2.2, linhas 279-287): `client/ →
    net/` e `client/ → chars/` já existem na tabela (`client/ → todos`); `tools/ → chars/` já existe na
    tabela. O desvio pré-existente `tools/telemetria.ts → client/` (tipos de `client/telemetria.ts`,
    símbolos de `client/input.ts`) já foi julgado no gate de `e3.5` e não cresce nesta story — nenhum
    símbolo novo de `client/` entra em `tools/telemetria.ts`. **`tools/ → net/` não existe na tabela e não
    é criada aqui**: se a forma escolhida no AC 4 precisar que o agregador leia `ATRASO_ALVO_TICKS`
    diretamente de `net/protocolo.ts`, a saída correta é o valor já vir GRAVADO no arquivo (o agregador só
    lê dado, nunca a constante-fonte) — não abrir uma seta nova. Se, ainda assim, a forma escolhida exigir
    uma seta nova, documentar o pedido como handoff ao `@architect` (mesmo padrão do AC 11 de `e4.2`) e não
    implementá-la sem essa aprovação.
11. **Prioridade e não-bloqueio.** Esta story deve estar concluída **antes** de qualquer coleta humana que
    se pretenda usar como evidência de `debt.9` (pré-condição b) ou como baseline de P4.4 (`e4.7`) — não
    por regra de sprint, mas porque sem ela essa coleta carregaria a mesma contaminação de população que
    motivou esta story. **Não bloqueia** o re-gate de `e4.1`, que segue com a mitigação manual já registrada
    no próprio gate (exportar, guardar como "pré-e4.1", zerar antes de jogar).
12. **Não decide** a pergunta em aberto de `debt.9` v1.1 ("a pré-condição (b) exige '×6.0 e atraso 6', ou
    aceita dado misto?"). Essa é decisão do usuário/@pm; esta story só grava o dado que a torna decidível.

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type**: Frontend / Instrumentation (mesma classificação de `e3.5`, que criou o coletor)
**Secondary Type(s)**: Data — compatibilidade retroativa de formato exportado, mesma disciplina de
"chave versionada" que `e3.5` já declarou como intenção (`CHAVE`, `client/telemetria.ts:20-25`)
**Complexity**: Medium — a superfície de código é pequena (4 arquivos, nenhum novo arquivo), mas a story
carrega uma decisão de forma não fixada em nenhum documento de arquitetura (AC 4/8), coordenação de escopo
com uma story em implementação (`e4.2`, AC 3), e o requisito duro de não inferir silenciosamente dado que
não existe (AC 4, 6, 7).

### Specialized Agent Assignment

**Primary Agents**:
- @dev
- @qa (quality gate — confere que o carimbo é por evento e não por export, que dado antigo vira
  "desconhecido" e nunca 0/1.0 por omissão, e que nenhum dos quatro arquivos de `e4.2` foi tocado)

**Supporting Agents**:
- @architect (só se o AC 4 virar handoff — decisão de forma do campo/versão, e qualquer seta nova de
  camada que a forma exigir)
- @po (dono do roteamento que criou esta story; não implementa)

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
- O carimbo é gravado por evento, no instante da gravação — não no export, não inferido (AC 4)
- Dado exportado antes desta story não é lido como atraso 0 / escala 1.0 por omissão (AC 4, 7)
- `tools/telemetria.ts` não calcula um número combinado quando há mais de uma população (AC 6)
- Nenhum dos quatro arquivos de `e4.2` (`net/snapshot.ts`, `net/projecao.ts`, `client/render.ts`,
  `tools/determinism.ts`) foi tocado (AC 3, 10)

**Secondary Focus**:
- Nenhuma seta nova na tabela de camadas sem handoff registrado ao @architect (AC 10)
- `docs/evidence/telemetria/README.md` anotado no formato existente (AC 9)

## Tasks / Subtasks

- [x] Task 0 — Pré-condição de sequência (AC: 2, 3)
  - [x] Confirmar que o commit de implementação de `e4.2` existe e que `git status --short` não mostra
        `render.ts`, `determinism.ts`, `net/snapshot.ts` nem `net/projecao.ts` modificados ou não
        rastreados. Registrar no Dev Agent Record o hash de `e4.2` usado como base

- [x] Task 1 — Decidir a forma do carimbo (AC: 4, 8)
  - [x] Escolher: campo por evento, e/ou bump de `CHAVE`/`versao`; nome do(s) campo(s); se cobre
        `ESCALA_HP` nesta story ou fica para outra — registrar a decisão e a justificativa no Dev Agent
        Record
  - [ ] ~~Se decidir que a forma deve ser fixada pelo @architect antes de implementar, registrar o handoff
        (mesmo padrão de `e4.1`/`e4.2`) e parar aqui até resposta~~ — não se aplica: forma decidida pelo @dev, sem handoff (ver Dev Agent Record)

- [x] Task 2 — `client/telemetria.ts` (AC: 4, 5, 7)
  - [x] Adicionar o(s) campo(s) decidido(s) na gravação por evento (`registrar`)
  - [x] Em `ler()`, tratar acúmulo anterior sem o campo como "desconhecido" na leitura — nunca reescrever
        com um valor assumido

- [ ] Task 3 — **PULADA** (forma preferida do AC 3: carimbo dentro de `registrar()`, `main.ts` fora do diff) — `client/main.ts`, ligação (AC: 3, 4, 8, 10). **Pular se a forma escolhida carimbar dentro de
      `registrar()`** (forma preferida do AC 3); nesse caso `main.ts` não aparece no diff
  - [ ] ~~Repassar `ATRASO_ALVO_TICKS` (import já existe, `main.ts:8`) ao coletor no ponto de gravação~~ — pulada
  - [ ] ~~Se AC 8 estiver dentro do escopo: importar `ESCALA_HP` de `../chars/tuning.ts` e repassar do mesmo
        jeito — nenhuma regra de jogo nova, só ligação~~ — pulada (`ESCALA_HP` é importado em `client/telemetria.ts`)

- [x] Task 4 — `tools/telemetria.ts`, agregador (AC: 6, 7)
  - [x] Agrupar eventos por (atraso, escala) antes de calcular P3.1/P3.2/P3.3/RF-36
  - [x] Se houver mais de um grupo conhecido: reportar cada um separadamente, ou recusar o número
        combinado e avisar qual é a mistura — nunca calcular um número único misturando os dois
  - [x] Grupo "desconhecido" para dado sem o campo (AC 7), no mesmo padrão de aviso de `mag` ausente
        (`tools/telemetria.ts:154-158`)

- [x] Task 5 — Documentação (AC: 9)
  - [x] Anotar a fronteira `b8e8a41` / 2026-09-21 em `docs/evidence/telemetria/README.md`

- [x] Task 6 — Verificação (AC: 1, 2, 3, 10)
  - [x] `npm run check` — 0 erros
  - [x] `npm run sim:check` antes e depois da mudança — `diff` da saída completa vazio
  - [x] `git show --stat` do(s) commit(s) desta story, restrito ao escopo do AC 10: confirmar ausência de
        `src/net/snapshot.ts`, `src/net/projecao.ts`, `src/client/render.ts`, `src/tools/determinism.ts`
  - [x] Teste de aceitação do AC 5: fixture/export sintético com duas combinações (atraso, escala),
        confirmar que dá para particionar só com o conteúdo do arquivo
  - [x] Teste de compatibilidade do AC 7: export sem os campos novos não quebra o agregador

## Dev Notes

### O coletor hoje — o que existe e o que falta (fonte: `src/client/telemetria.ts`)

```ts
export const CHAVE = 'bb.telemetria.v1'
// ...
export interface ArquivoTelemetria {
  versao: string
  exportadoEm: string
  eventos: EventoRegistrado[]
}
// ...
export function criarTelemetria(): Telemetria {
  let eventos: EventoRegistrado[] = ler()
  // ...
  return {
    registrar(partida, novos) {
      if (novos.length === 0) return
      for (const e of novos) eventos.push({ ...e, partida })   // <- carimbo por evento já existe (partida)
      persistir()
    },
    exportar() {
      const arquivo: ArquivoTelemetria = { versao: CHAVE, exportadoEm: new Date().toISOString(), eventos }
      baixar(...)
    },
    // ...
  }
}
```

O mecanismo que esta story precisa replicar já existe: `partida` é gravado **por evento**, no momento do
`registrar()`, exatamente porque um array plano não permite desempatar "2ª rodada da partida A" de "2ª
rodada da partida B" (docblock de `EventoRegistrado`, `client/telemetria.ts:87-95`). O atraso e a escala
são a mesma classe de problema: sem carimbo por evento, "esta sessão foi jogada com atraso 6" é
inderivável do array plano assim que ele acumula mais de uma sessão.

[Fonte: `src/client/telemetria.ts:25, 97-101, 118-151`]

### O agregador hoje — o padrão de aviso a seguir (fonte: `src/tools/telemetria.ts`)

```ts
const magAusente = casts.filter((c) => !Number.isFinite(c.mag)).length
if (magAusente > 0) {
  console.warn(
    `[telemetria] ${magAusente} cast(s) sem campo 'mag' (arquivo exportado antes da correção ` +
    `TEL-E35-001/006) — taxa de desperdício não inclui esses casts`,
  )
}
```

Este é o precedente exato para o AC 6/7: um campo que passou a existir numa versão do coletor e pode estar
ausente em arquivos exportados antes dela vira um **aviso explícito com contagem**, e os eventos afetados
são excluídos do cálculo em vez de contarem para o resultado errado por omissão. O carimbo de
atraso/escala segue o mesmo molde — trocando "sem mira real" por "sem atraso conhecido" / "sem escala
conhecida".

[Fonte: `src/tools/telemetria.ts:154-158`, achado `TEL-E35-001`]

### As duas constantes-fonte, hoje só-leitura para este trabalho

```ts
// src/net/protocolo.ts:38 (comentário resumido)
// RF-38 / P4.1 — o atraso de input, em ticks (~100ms a 60 Hz). Definição ÚNICA do projeto.
export const ATRASO_ALVO_TICKS = 6
```

```ts
// src/chars/tuning.ts:10
// A ALAVANCA DE D-05 — o único ponto da Fase 3 autorizado a mover o golden hash.
export const ESCALA_HP = 6.0
```

`client/main.ts` já importa `ATRASO_ALVO_TICKS` de `net/protocolo.ts` (linha 8) e `CHARS` de
`chars/index.ts` (linha 1); `chars/index.ts` já importa `ESCALA_HP` de `chars/tuning.ts`. Importar
`ESCALA_HP` diretamente em `main.ts` não abre nenhuma seta nova — `client/ → chars/` já está na tabela.

[Fonte: `src/net/protocolo.ts` (docblock + declaração); `src/chars/tuning.ts:1-10`;
`src/client/main.ts:1,8`]

### Por que o agregador não deve importar `net/protocolo.ts` diretamente

A tabela de camadas (`architecture-e4.md` §2.2, linhas 279-287) permite `tools/ → sim/, chars/, bot/,
match/, shop/` — **não** `tools/ → net/`. `e4.2` (AC 11) já registrou que abrir `tools/ → net/` é uma seta
nova que "ninguém aprovou ainda" e a tratou como handoff ao `@architect`, não como fato consumado. Esta
story evita o problema por construção: o agregador só precisa **ler o campo já gravado no arquivo
exportado** — ele nunca precisa importar a constante-fonte, porque o valor histórico correto pode ser
diferente do valor atual da constante. Isso também é logicamente mais correto: um arquivo antigo gravado
sob `ATRASO_ALVO_TICKS = 6` continua correto mesmo que a constante mude no futuro.

[Fonte: `docs/architecture-e4.md:279-287`; `docs/stories/e4.2.snapshot-e-projecao.story.md`, AC 11]

### O desvio de camada pré-existente, e por que ele não cresce aqui

```
A única ocorrência é src/tools/telemetria.ts → client/. Ela é ANTERIOR a esta story (desvio
já julgado no gate de e3.5), não entrou neste commit e o sim:check não a carrega.
```

`src/tools/telemetria.ts` já importa de `client/` (o tipo `EventoRegistrado`/`ArquivoTelemetria` de
`client/telemetria.ts`, e `ARRASTO_MAX`/`LIMIAR_ARRASTO_PX` de `client/input.ts`) — um desvio da tabela de
camadas (`tools/` não lista `client/` entre seus destinos permitidos) que o gate de `e4.1` já revisitou e
aceitou como julgado anteriormente em `e3.5`. Esta story pode continuar usando esses dois símbolos (nenhuma
mudança nesse ponto) mas **não adiciona nenhum símbolo novo** de `client/` a essa lista — o campo de
atraso/escala chega ao agregador como parte do tipo `EventoRegistrado` já importado, não como um símbolo
novo.

[Fonte: `docs/qa/gates/e4.1-ativar-atraso-de-input.yml`, item "Setas (architecture-e4 §2.2)"]

### O conflito de arquivo com `e4.2` (story em implementação)

`e4.2` (`docs/stories/e4.2.snapshot-e-projecao.story.md`, AC 14) restringe o próprio escopo a
`src/net/snapshot.ts`, `src/net/projecao.ts` (novos), e alterações **só** em `src/tools/determinism.ts`
(guarda de ida-e-volta do AC 7 + asserção `QA-D8-01` do AC 13) e `src/client/render.ts` (**só** anotações
de tipo do AC 6, nenhuma linha de corpo). Um golden hash e uma guarda nova dependem desse escopo ficando
intocado por qualquer outra story enquanto `e4.2` está em voo. Esta story não tem motivo para tocar nenhum
dos quatro arquivos — o trabalho inteiro vive em `client/telemetria.ts`, `client/main.ts` (só ligação),
`tools/telemetria.ts` e o README de evidência.

[Fonte: `docs/stories/e4.2.snapshot-e-projecao.story.md`, AC 14]

### O README de evidência — formato a seguir (fonte: `docs/evidence/telemetria/README.md`)

O arquivo já registra uma fronteira análoga (a bissecção de `ESCALA_HP` em `e3.6`) como uma tabela de
hora × evento, com o texto explicando o que mudou em cada commit. A nova entrada desta story (fronteira de
`ATRASO_ALVO_TICKS`, `b8e8a41`) deve seguir esse padrão de citação, não necessariamente a mesma tabela — o
evento é de natureza diferente (uma constante de código mudando de valor, não uma sessão específica sendo
jogada).

[Fonte: `docs/evidence/telemetria/README.md`, seção "A linha do tempo intercala exatamente com os commits
da bissecção de e3.6"]

### O que esta story explicitamente NÃO faz

- Não decide se a pré-condição (b) de `debt.9` passa a exigir "×6.0 e atraso 6" — decisão do usuário/@pm,
  registrada como pergunta aberta em `debt.9` v1.1.
- Não recalcula nem revisa nenhum número de D-09 (`shop/catalogo.ts`, `match/economia.ts`) — fora de
  escopo, pertence a `debt.9`.
- Não abre socket, não cria protocolo novo, não altera `net/protocolo.ts` — só lê constantes já
  exportadas de lá.
- Não decide `SNAPSHOT_HZ` nem qualquer assunto de `e4.2` — arquivos e responsabilidades continuam
  totalmente separados (AC 3).
- Não dá chamador de UI a `limpar()` (`client/telemetria.ts:145`). O gate de `e4.1` registra que ela não
  tem chamador. A mitigação manual do gate continua sendo `localStorage.removeItem('bb.telemetria.v1')`
  no console. Um botão de zerar, se o usuário quiser, é outra story.

### Testing

- `npm run check` — 0 erros.
- `npm run sim:check` — rodado antes e depois da mudança, `diff` da saída completa vazio (esta story não
  toca `sim/`/`match/`).
- Teste de aceitação do AC 5: fixture ou export real com eventos de pelo menos duas combinações
  (atraso, escala) — confirmar que o particionamento é possível só com o conteúdo do arquivo.
- Teste de compatibilidade do AC 7: um export gerado antes desta story (sem os campos novos) não quebra o
  agregador — os eventos caem no grupo "desconhecido" e isso é relatado, não silenciado.
- Teste do AC 6: com duas populações presentes, o agregador não produz um único número de
  P3.1/P3.2/P3.3/RF-36 misturando as duas.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (1M context), como Dex (@dev), em modo YOLO.

### Task 0: base de sequência (AC 3)

Commit de implementação de `e4.2` usado como base: **`b1c0668`** (`feat(net): snapshot e projeção`).
No início, `git status --short` mostrava só `.claude/agent-memory/` modificado ou não rastreado. Nenhum
de `render.ts`, `determinism.ts`, `net/snapshot.ts` ou `net/projecao.ts` estava na árvore. O `sim:check`
"antes" foi capturado nesse estado, antes de qualquer edição.

### File List

| Arquivo | Mudança |
|---|---|
| `src/client/telemetria.ts` | Importa `ATRASO_ALVO_TICKS` (`net/protocolo.ts`) e `ESCALA_HP` (`chars/tuning.ts`). `EventoRegistrado` ganha `atrasoTicks?`/`escalaHp?` (opcionais; ausente = desconhecido). `registrar()` carimba os dois em cada evento. `ler()` avisa quantos eventos do acúmulo estão sem carimbo e não os reescreve. O docblock de `CHAVE` explica por que não houve bump. |
| `src/tools/telemetria.ts` | `agregar()` particiona por (atraso, escala) lidos do arquivo e roda o corpo original em cada população. O corpo virou `agregarPopulacao()`, sem mudança de cálculo. Três avisos novos: população desconhecida, mistura de populações e partida dividida entre populações. Com mais de uma população, os avisos de `mag`/`anguloErro` levam o rótulo dela. Imports inalterados. |
| `docs/evidence/telemetria/README.md` | Seção nova "Fronteiras de atraso de input e do carimbo por evento (e4.1 → debt.10)" (AC 9). |
| `docs/stories/debt.10.telemetria-marca-atraso-de-input.story.md` | Este registro. |

**Não tocados:** `src/client/main.ts` (Task 3 pulada), `src/net/`, `src/chars/`, `src/client/render.ts`,
`src/client/input.ts`, `src/tools/determinism.ts`, `src/sim/`, `src/match/`, `src/shop/`, `src/bot/`.

### Decisão de forma do carimbo (AC 4, 8)

- **Campo por evento, sem bump de chave.** Cada `EventoRegistrado` ganha dois campos numéricos:
  `atrasoTicks` (= `ATRASO_ALVO_TICKS`) e `escalaHp` (= `ESCALA_HP`). Eles são gravados dentro de
  `registrar()`, ao lado de `partida`, pelo mesmo mecanismo que já existia. O valor sai das constantes
  importadas no momento do `push`. Não é inferido e não é carimbado no `exportar()`.
- **Forma preferida do AC 3 adotada.** Os imports ficam em `client/telemetria.ts`, o que a regra
  `client/ → todos` permite. `main.ts`, os três pontos de chamada e a assinatura `registrar(partida, eventos)`
  não mudam.
- **Campos opcionais no tipo; ausente = desconhecido.** O agregador lê arquivos pelo mesmo tipo, e um
  arquivo antigo não tem esses campos. Torná-los obrigatórios mentiria sobre o dado lido. O agregador
  trata `!Number.isFinite` (ausente, `null`, string) como desconhecido, **nunca** como 0 ou 1.0.
- **`ESCALA_HP` entrou nesta story (AC 8)**, pelo mesmo mecanismo. É a mesma classe de defeito
  (`E37-DOC-004`) e custa uma linha a mais, então não havia motivo para adiar.
- **[AUTO-DECISION] Subir `CHAVE` para `v2`? → Não.** Motivo: a mudança só acrescenta campos, e a
  ausência deles já marca "gravado antes do carimbo". O bump não separaria nada do que já foi gravado e
  deixaria o acúmulo `v1` órfão, porque `ler()`/`exportar()` só enxergam a chave corrente. **Destino do
  acúmulo `v1`: fica sob a mesma chave, é lido e exportado junto, e sai como população desconhecida.**
  Nada é descartado nem perdido. O docblock de `CHAVE` registra esse desvio da intenção original
  ("formato muda → v2").
- **[AUTO-DECISION] Handoff ao @architect? → Não.** Motivo: a forma não cria seta nova de camada nem muda
  contrato de `net/`. É um campo de dado local do coletor, dentro do que o AC 4 deixa ao @dev.
- **Camadas (AC 10).** `tools/telemetria.ts` não importa nada novo. `atrasoTicks`/`escalaHp` chegam
  como membros do tipo `EventoRegistrado`, que já era importado com `import type` (apagado na execução).
  Não existe `tools/ → net/`: o agregador lê o valor gravado no arquivo.
- **[AUTO-DECISION] Particionar ou recusar (AC 6)? → Particionar.** Cada população sai numa seção
  própria, com seus P3.1/P3.2/P3.3/extras/RF-36. Antes das seções vêm o cabeçalho
  `⚠ N populações … nenhum número combinado` e um `console.warn` que lista a mistura. As populações
  conhecidas saem primeiro e a desconhecida por último. Acrescentei também um aviso para partida com
  eventos em mais de uma população, porque aí o join de P3.3 (compra × `rodadaFim` da mesma partida)
  seria cortado em silêncio. Com dado do coletor isso não acontece, já que uma partida vive num só
  carregamento de página, mas pode acontecer com arquivo editado à mão.

### Debug Log / Verificação

Os artefatos ficaram no scratchpad da sessão, fora do repositório, porque a story não autoriza arquivo
de teste novo (AC 10).

| Prova | Resultado |
|---|---|
| `npm run check` | 0 erros |
| `npm run sim:check` antes (base `b1c0668`, árvore limpa) × depois | Exit 0 nos dois. **O `diff` da saída completa (50 linhas) é vazio.** `golden hash ✓ ok — 6 seeds batem o baseline` |
| `npm run build` | ok, 32 módulos |
| Agregador × os 5 exports reais de `docs/evidence/telemetria/` (antes × depois) | Exit 0 nos 5. **Toda linha de métrica ficou idêntica.** O diff só acrescenta a linha `população: atraso desconhecido · ESCALA_HP desconhecida (…)` e o aviso `N evento(s) sem carimbo …`, com N = 14/32/154/197/372. **AC 7** |
| Coletor real: `criarTelemetria` com `localStorage` falso contendo os 372 eventos do export definitivo | `ler()` avisa 372 eventos sem carimbo. Um `registrar()` novo grava `atrasoTicks=6` e `escalaHp=6`, iguais às constantes. Os 372 antigos continuam **sem** os campos, e `CHAVE` segue `bb.telemetria.v1`. **AC 4** |
| Fixture misto: export definitivo com 992276418/670239056 → (6, 6), 12294565 → (0, 3), resto sem carimbo | A partição sai só do `JSON.parse` do arquivo: `?\|?` 154, `0\|3` 43, `6\|6` 175. **AC 5** |
| CLI sobre o misto | 3 blocos P3.1 e 3 blocos RF-36. O `n` de P3.1 por seção é `[4, 7, 14]`: soma 25 e nenhum é 25 (o número combinado de antes). A seção (6, 6) reproduz a mediana ×6.0 do README (58.4s, n=7). A desconhecida vem por último. **AC 6** |
| CLI sobre array cru com uma partida dividida | Aviso `1 partida(s) com eventos em mais de uma população (992276418)` |
| **Bateria negativa** (perturbar, rodar, restaurar e conferir com `cmp`) | (1) Sem carimbo em `registrar()` → o teste de carimbo falha. (2) `agregar()` sem partição → 5 testes falham (AC 6/7). Os testes enxergam as duas regressões. Arquivos restaurados byte a byte, e os 11 testes voltam a passar. |
| Imports | Os imports de `tools/telemetria.ts` não mudaram: `node:fs`, `client/input.ts` e `import type` de `client/telemetria.ts`. |

### Completion Notes

- CodeRabbit (Pre-Commit) **não rodou**: o CLI via WSL não está disponível nesta máquina. A cobertura
  veio de `npm run check`, `sim:check` e dos testes dirigidos acima. A caixa de Quality Gate Tasks
  ficou desmarcada de propósito.
- O projeto não tem script `lint`; o gate estático é `npm run check` (`tsc --noEmit`).
- A janela `b8e8a41` → `debt.10` (atraso 6, sem carimbo) **não é recuperável pelo arquivo**. O README a
  registra junto com a mitigação manual do gate de `e4.1`.
- O README cita o commit desta story por `git log --grep`, e não por hash, porque um commit não pode
  conter o próprio hash. O hash vai no relatório de entrega e no gate.
- AC 11/12: nada foi decidido sobre `debt.9`, e `debt.9` e `e4.1` não foram editadas.

### Self-critique (checkpoints 5.5 / 6.5)

- O carimbo acontece na gravação, não no export: ✓ (código, teste e perturbação 1).
- Dado antigo nunca vira 0 ou 1.0: ✓ (`Number.isFinite` no agregador; `ler()` não reescreve).
- Com mais de uma população, não sai número combinado: ✓ (perturbação 2).
- Arquivo exportado antes da story não quebra o agregador: ✓ (5 exports reais, exit 0).
- Escopo: 3 arquivos de código/doc mais a story. Nenhum dos 4 arquivos de `e4.2` foi tocado, e `main.ts`
  também não.
- Risco residual: um arquivo com carimbo parcial (só um dos dois campos) vira uma população própria,
  rotulada com o campo que falta como desconhecido, e não é somado a uma conhecida. Isso é intencional,
  e o coletor nunca produz esse caso.

## QA Results

### Gate: CONCERNS — Quinn (@qa), 2026-09-21, revisão `3de1cfe`

Gate: `docs/qa/gates/debt.10-telemetria-marca-atraso-de-input.yml`. **Status: Ready for Review → Done.**

**Os 12 ACs estão MET.** Conferi cada um do zero, sem confiar no Dev Agent Record.

| AC | Veredito | Prova independente |
|---|---|---|
| 1 | MET | `npm run check` exit 0 |
| 2 | MET | `sim:check` exit 0, golden hash ok. A saída completa num worktree em `3de1cfe^` (= `b1c0668`) e num em `3de1cfe` tem 46 linhas, e o `diff` é **vazio**. O HEAD (`db2408f`) é idêntico ao worktree de `3de1cfe`. `build` exit 0 |
| 3, 10 | MET | `git show --stat 3de1cfe` lista 4 arquivos. Não aparecem `snapshot.ts`, `projecao.ts`, `render.ts`, `determinism.ts` nem `main.ts`. Os imports de `tools/telemetria.ts` estão inalterados, sem `tools/ → net/`. As setas novas `client/ → net/` e `client/ → chars/` são permitidas |
| 4 | MET | O carimbo é gravado dentro de `registrar()` (`:161-164`), depois do spread. Rodei o coletor real num arnês com `localStorage` falso: evento novo sai 6/6, evento antigo sai **sem** as chaves no export e no storage, e a chave continua `v1`. Mutação "carimbo no `exportar()`" → pega |
| 5 | MET | No meu fixture (5 populações, com `null` e `"6"` string), a partição sai só do JSON do arquivo |
| 6 | MET | 5 blocos de P3.1 com n = 4/3/4/2/12, nenhum com o 25 combinado, e o cabeçalho "nenhum número combinado". Mutação "sem partição" → sai n=25 e é pega |
| 7 | MET | Os 5 exports reais: exit 0, e toda linha de métrica é idêntica antes e depois (o diff só acrescenta o aviso e o rótulo da população). Mutação "ausente → 0/1.0" → pega |
| 8 | MET | `ESCALA_HP` é carimbado pelo mesmo mecanismo |
| 9 | MET | A seção do README existe. `git log --grep='debt.10\]' -- src/client/telemetria.ts` resolve para `3de1cfe`, e só para ele. Imprecisão baixa em DEBT10-DOC-002 |
| 11, 12 | MET | `debt.9` e `e4.1` não foram tocadas, e nada foi decidido sobre a pré-condição (b) |

**Julgamentos pedidos:**
1. **Sem bump para `v2`: correto.** O AC 4 exige carimbo por evento e trata o bump como opcional. O bump deixaria o acúmulo `v1` órfão, e o destino dele foi declarado ("lido junto como desconhecido"). Nota para o futuro: uma mudança **não** aditiva de formato ainda exige bump.
2. **Aviso de partida dividida: aceito.** Só escreve no console. `partida` é uma seed aleatória de 1e9, então não gera ruído com dado real, e o aviso protege o join de P3.3 contra arquivo mesclado à mão.
3. **Lacuna `b8e8a41` → `3de1cfe`: documentada onde o usuário a vê.** Está no `pedido_ao_usuario` do gate de `e4.1` e na tabela de achados da story de `e4.1`, que dizem "exportar e zerar antes do smoke". Fato novo: `b8e8a41` **não está em `origin/master`**. Qualquer push publica os dois commits juntos, então o build publicado nunca rodou atraso 6 sem carimbo. A janela só existe em sessões de dev server local.

**Achados (nenhum bloqueia):**

| ID | Sev. | Dono | Resumo |
|---|---|---|---|
| DEBT10-TST-001 | medium | @po / @architect | Nenhuma guarda no repositório. As 4 mutações passam em check, sim:check e build, e as provas ficaram no scratchpad porque o AC 10 não autoriza arquivo de teste. Criar uma guarda headless (fixture misto e coletor) antes da primeira coleta usada como evidência de `debt.9` ou P4.4 |
| DEBT10-DOC-002 | low | @dev | README: "daqui em diante têm atraso 6" conta a partir do commit. O efeito conta a partir do bundle no navegador, e `b8e8a41` não foi publicado. Falta também a hora na linha `debt.10` |
| DEBT10-COD-003 | low | @dev (opcional) | `ler()` conta sem carimbo com `=== undefined`, e o agregador com `!Number.isFinite`. Carimbo malformado é rotulado "anterior a debt.10". Afeta só texto e contagem de aviso |
| DEBT10-INFO-004 | low | @qa (re-gate e4.1) / @devops | E41-TEL-002 foi resolvido aqui. O re-gate de `e4.1` não deve mais registrar CONCERNS por ele, e deve conferir `atrasoTicks=6` no export do smoke. Não publicar `b8e8a41` isolado |

CodeRabbit: SKIPPED (WSL indisponível, como em e3.7 e e4.1).

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-09-21 | 1.0 | Story criada a partir do achado `E41-TEL-002` do gate `PENDING` de `e4.1` (`docs/qa/gates/e4.1-ativar-atraso-de-input.yml`, severidade medium), conforme roteamento do @po registrado no Change Log v1.4.0 de `docs/stories/e4.1.ativar-atraso-de-input.story.md`. Escopo: `client/telemetria.ts`, `client/main.ts` (ligação), `tools/telemetria.ts`, `docs/evidence/telemetria/README.md`. A forma exata do carimbo (nome de campo, por evento vs. bump de versão, cobertura de `ESCALA_HP`) é deixada como decisão do `@dev`/`@architect` (AC 4, 8), por não haver documento de arquitetura que a fixe hoje. Registrado o conflito de arquivo em andamento com `e4.2` (AC 3, 10): nenhum dos quatro arquivos que `e4.2` está implementando/restringindo é tocado. Não bloqueia o re-gate de `e4.1`; precede qualquer coleta humana usada como evidência de `debt.9` (pré-condição b) ou baseline de P4.4. Não decide a pergunta aberta de `debt.9` v1.1. | River (@sm) |
| 2026-09-21 | 1.1 | **Validação @po: GO 10/10** (8/10 antes das correções: itens 5 "dependências" e 8 "riscos" estavam parciais). **Status: Draft → Ready.** **Conferido na fonte antes de emendar:** `client/telemetria.ts:25` (`CHAVE`), `:20-25` (docblock), `:87-95` (docblock de `EventoRegistrado`), `:132-136` (`registrar` carimba `partida`), `:137-144`/`:139` (`exportar`, `versao: CHAVE`), `:145` (`limpar`), `:161` (`ler` só lê a chave corrente); `tools/telemetria.ts:2-3` (import de valor de `client/input.ts` e **só de tipo** de `client/telemetria.ts`), `:154-158` (aviso de `mag`, TEL-E35-001), `:164-170` (`anguloErro`), `:201-202` (aceita `{versao,...}` ou array cru, não confere `versao`); `chars/tuning.ts:10` (`ESCALA_HP = 6.0`) e `chars/index.ts:3` (já o importa); `net/protocolo.ts:38` (`ATRASO_ALVO_TICKS = 6`); `client/main.ts:1`, `:8` e os três pontos de chamada de `registrar` (`:134`, `:238`, `:319`); `architecture-e4.md:279-287` (`client/ → todos` existe, `tools/ → net/` não existe, `tools/ → chars/` existe); `b8e8a41` (2026-09-21, só `main.ts` + story, troca o literal `INPUT_DELAY_TICKS = 0` por `ATRASO_ALVO_TICKS`); `docs/evidence/telemetria/README.md` (a seção de formato citada existe e nenhuma entrada de `b8e8a41` existe ainda, o que é correto: é o AC 9); as citações do gate `E41-TEL-002` e do Change Log v1.4.0 de `e4.1` conferem, com as elisões marcadas; `debt.9` v1.1 registra a pergunta aberta; `e4.2` AC 11 ("ninguém aprovou ainda") e AC 14 (proíbe `main.ts` **à própria `e4.2`**). **Correções no lugar:** **(1) Sequenciamento com `e4.2`, agora explícito no AC 3** (antes era "não depende"). A implementação de debt.10 começa só depois que o commit de implementação de `e4.2` existir; não é preciso esperar Done. O motivo é de prova: hoje `render.ts`/`determinism.ts` estão modificados e `net/snapshot.ts`/`net/projecao.ts` estão não rastreados na mesma árvore. Com isso, o `sim:check` antes/depois do AC 2 absorveria a guarda nova de `e4.2`, e `git diff --stat` mostraria os arquivos dela. Nova Task 0. A verificação de escopo passa de `git diff --stat` (árvore) para `git show --stat` do(s) commit(s) desta story, em `quality_gate_tools`, AC 3 e Task 6. **(2) `main.ts`:** vira "só se a forma exigir", em commit posterior ao de `e4.2`, e a conferência "main.ts intocado" de `e4.2` é feita sobre o commit de `e4.2`. Fica registrada a **forma preferida**, que elimina o contato: carimbar dentro de `registrar()` importando as duas constantes em `client/telemetria.ts`. A tabela de camadas permite, e como `tools/telemetria.ts:3` é `import type`, não nasce aresta de execução `tools/ → net/`. A decisão de forma continua do @dev/@architect (AC 4). Task 3 pode ser pulada. **(3) AC 4, risco que faltava:** um bump para `v2` deixa o acúmulo `v1` órfão, porque `ler`/`exportar` só enxergam a chave corrente. O destino desse acúmulo passa a ser declarado obrigatoriamente. **(4) AC 3 e "Depende de":** "um golden hash e uma guarda próprios" de `e4.2` estava impreciso. O golden hash é do projeto e `e4.2` o mantém idêntico; o que `e4.2` acrescenta é a guarda de ida-e-volta (AC 7) e a asserção QA-D8-01 (AC 13). **(5) AC 9:** `INPUT_DELAY_TICKS` 0→6 nomeava uma constante que não existe mais (E41-TST-003). Passa a descrever a troca real do `b8e8a41` e pede também a fronteira do commit desta story. **(6) Citações:** tabela de camadas `280-287` → `279-287` (3 lugares), `registrar` `:131-136` → `:132-136`, e a citação do gate em Dev Notes restaurada verbatim. **(7) "NÃO faz":** sem chamador de UI para `limpar()`; a mitigação continua no console, conforme o gate. Complexidade: o mandato diz tamanho S e a seção CodeRabbit diz "Medium"; os dois ficam, por medirem coisas diferentes (superfície e decisão de forma). | Pax (@po) |
| 2026-09-21 | 1.2 | **Implementação @dev (YOLO). Status: Ready → InProgress → Ready for Review.** Base `e4.2` = `b1c0668` (Task 0). Forma escolhida: `atrasoTicks`/`escalaHp` por evento, gravados em `registrar()` de `client/telemetria.ts` a partir de `ATRASO_ALVO_TICKS`/`ESCALA_HP`. É a forma preferida do AC 3: `main.ts` fica intocado e a Task 3 foi pulada. Sem bump de `CHAVE`; o acúmulo `v1` continua exportável e sai como população desconhecida. `ESCALA_HP` coberto (AC 8). `tools/telemetria.ts` particiona por (atraso, escala) lidos do arquivo, sem número combinado e com avisos; imports inalterados, sem `tools/ → net/`. README ganha as fronteiras `13ee9d8`/`b8e8a41`/`debt.10` (AC 9). Verificação: `check` ok; `sim:check` com diff antes/depois vazio e golden hash idêntico; `build` ok; os 5 exports reais rodam sem crash e com métricas idênticas; fixture misto particionado; a bateria negativa detectou as 2 regressões plantadas. CodeRabbit indisponível na máquina. | Dex (@dev) |
| 2026-09-21 | 1.3 | **Gate @qa: CONCERNS. Status: Ready for Review → Done.** Os 12 ACs estão MET, verificados de forma independente: sim:check antes (`b1c0668`) × depois (`3de1cfe`) com diff vazio; 5 exports reais com métricas idênticas; fixture misto próprio; 4 mutações próprias, todas pegas. Achados: DEBT10-TST-001 (medium, sem guarda no repositório), DEBT10-DOC-002, DEBT10-COD-003 e DEBT10-INFO-004 (low). Gate: `docs/qa/gates/debt.10-telemetria-marca-atraso-de-input.yml`. | Quinn (@qa) |
