# Story debt.13: Guarda da telemetria confere o VALOR do carimbo — achados `DEBT11-TST-001` e `DEBT11-TST-002`

## Status

Done

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run check", "npm run sim:check (golden hash idêntico ao baseline atual; na saída, SÓ a linha 'telemetria' pode mudar de conteúdo — 'globais' e todas as demais seções ficam byte a byte iguais)", "o contrafactual completo (Q12, Q12a, Q12b, Q13, Q13b, mais M1, M1b, M2, M3, MR1 e as duas formas de MR2 reaplicadas), cada um numa cópia descartável — todos devem fazer sim:check sair com código diferente de 0, exceto a benigna Q1 (formato de número), que deve continuar em 0", "git show --stat <commit de implementação> — restrito a src/tools/guarda-telemetria.ts e src/tools/telemetria.ts (este só no comentário do AC 8); NUNCA a árvore de trabalho compartilhada, se outra story (ex.: e4.9) tiver mudança não commitada em src/ no momento da verificação, rodar num worktree descartável do commit de implementação"]
```

## Story

**Como** desenvolvedor fechando os achados `DEBT11-TST-001` (medium) e `DEBT11-TST-002` (low) do gate de
`debt.11` (`docs/qa/gates/debt.11-guarda-automatica-telemetria.yml`),
**eu quero** que `verificarTelemetria()` (`src/tools/guarda-telemetria.ts`) passe a afirmar que o valor do
carimbo de cada evento novo é o **certo** (`atrasoTicks === ATRASO_ALVO_TICKS` e `escalaHp === ESCALA_HP`),
e não só que ele existe e é finito, e que o fixture misto passe a conter carimbo **parcial** (um campo
presente, o outro ausente),
**para que** um `registrar()` que grave valores literais errados, ou uma correção parcial que só carimbe um
dos dois campos, deixe de passar despercebido pelo `sim:check` — exatamente a lacuna que `debt.11` (AC 5)
deixou aberta por pedir só "finitos", e que contaminaria, sem nenhum aviso, a mesma evidência de `debt.9`
(pré-condição b) e do baseline de P4.4 (`e4.7`) que `debt.10`/`debt.11` existem para proteger.

## Depende de

`debt.11` (`971686b`, Done, gate `docs/qa/gates/debt.11-guarda-automatica-telemetria.yml`, `ca52e07`,
CONCERNS) — criou `src/tools/guarda-telemetria.ts` e é dona dos dois achados que esta story fecha. **Não
depende de mais nada** — em particular, **não entra na ordem de `src/tools/determinism.ts`**
(`e4.8` → `debt.11` → `e4.9` → `e4.3` → `debt.12` → `e4.6`), porque não abre esse arquivo. Pode começar já,
em paralelo com qualquer story dessa ordem, cujo escopo (`protocolo.ts`, `codec.ts`, `determinism.ts`) não
toca os dois arquivos que esta story abre.

**Roteamento do @po que criou esta story (citado, não resumido de memória — a spec completa, do Change Log
v1.5 de `debt.11`):**

> **Dono de `DEBT11-TST-001` e `DEBT11-TST-002`: story nova, sugestão `debt.13`.** [...] **Origem:** gate
> de `debt.11` (`docs/qa/gates/debt.11-guarda-automatica-telemetria.yml`, `ca52e07`), TST-001 (medium) e
> TST-002 (low). O AC 5 de `debt.11` pedia só "finitos", então o achado é de alcance, e não desvio.
> **Depende de:** `debt.11` Done (`971686b`), e nada mais. **Não entra na ordem de `determinism.ts`,
> porque não abre esse arquivo.** **Pré-condição de início:**
> `git status --short src/tools/guarda-telemetria.ts src/tools/telemetria.ts` vazio. **Árvore
> compartilhada:** se, na hora da verificação, outra story (por exemplo `e4.9`) tiver mudança não
> commitada em `src/`, check, sim:check e mutações rodam num worktree descartável do commit de
> implementação desta story, e não na árvore. Escopo sempre por `git show --stat <commit de
> implementação>`, nunca por `git diff --stat`. **Prazo (R10):** commit de implementação antes da
> primeira coleta humana usada como evidência de `debt.9` (b) ou de `e4.7` AC 8, salvo a conferência
> manual que essas duas stories admitem.

[Fonte: `docs/stories/debt.11.guarda-automatica-telemetria.story.md`, Change Log v1.5, @po]

**Os dois achados, na fonte do gate (citados, não resumidos):**

> `DEBT11-TST-001` | medium | A guarda afirma que o carimbo dos eventos novos EXISTE e é finito, não que
> ele tem o VALOR que o build aplica. Com `eventos.push({ ...e, partida, atrasoTicks: 0, escalaHp: 1 })`
> em `registrar()` (Q12), o `sim:check` sai com 0. Um build com atraso 6 passaria a gravar eventos
> rotulados "atraso 0 · ESCALA_HP ×1", e o agregador os reportaria como uma população conhecida e
> plausível, sem aviso. [...] Observação: hoje `ATRASO_ALVO_TICKS = 6` e `ESCALA_HP = 6.0`, então um
> carimbo com os dois campos TROCADOS é invisível até para uma checagem de valor, enquanto os dois
> valores forem iguais.
>
> `DEBT11-TST-002` | low | Os 2 eventos sem carimbo do fixture não têm os DOIS campos: um não tem nenhum
> e o outro tem os dois `null`. Por isso uma M2 parcial (`atrasoTicks ?? 0` só no atraso, Q13) passa
> verde: a escala continua ausente e o evento continua desconhecido.

[Fonte: `docs/qa/gates/debt.11-guarda-automatica-telemetria.yml`, `top_issues`]

## Acceptance Criteria

1. `npm run check` verde.
2. `npm run sim:check` verde, com **golden hash idêntico** ao baseline atual. Na saída completa do
   `sim:check`, **só a linha `telemetria` pode mudar de conteúdo** em relação ao estado atual (ela ganha
   a checagem de valor); a linha `globais` e toda e qualquer outra seção ficam byte a byte iguais.
   *(@po v1.1: a linha `globais` imprime a contagem de `console.warn` capturados — hoje **3**. Ela só fica
   igual se os dois eventos novos do AC 5 estiverem em **partidas diferentes entre si** e das existentes:
   com a mesma partida nos dois, `agregar()` emite o aviso "partida(s) com eventos em mais de uma
   população" (`tools/telemetria.ts`, bloco `partidasPartidas`) e a contagem vai a 4. Medido numa cópia
   de `d378ca5`.)*
3. **Valor do carimbo (`DEBT11-TST-001`).** Em `guarda-telemetria.ts`, todo evento novo do export
   (identificado por `partida === PARTIDA_NOVA`, a mesma constante que já existe na linha 190) tem
   `atrasoTicks === ATRASO_ALVO_TICKS` **e** `escalaHp === ESCALA_HP`, importados de
   `../net/protocolo.ts` e de `../chars/tuning.ts`. A comparação é por `===`, **sem tolerância**, porque o
   coletor **copia** a constante em `registrar()` e não calcula nada — qualquer desvio é bug, não ruído de
   ponto flutuante. A asserção de **presença** que já existe (`novosCarimbados !== doExportNovo.length`,
   linha 232, que pega `M1`) **continua**; a de **valor** é uma asserção **própria**, separada, que
   registra um problema com o valor achado e o valor esperado de cada campo — para que "sem carimbo" e
   "carimbo com valor errado" não se confundam na mensagem nem no diagnóstico de quem lê a saída do
   `sim:check`. *(@po v1.1: para a separação valer também sob `M1`, a asserção de valor corre sobre os
   novos **carimbados** — `doExportNovo.filter((e) => !semCarimbo(e))` —, e não sobre todos os novos.
   Sem esse filtro, `M1` dispara as duas mensagens ao mesmo tempo, com "valor errado atraso=undefined",
   que é exatamente a confusão que este AC proíbe. `Q12`/`Q12a`/`Q12b` continuam pegos, porque 0 e 1 são
   finitos.)*
4. **Setas, sem mudança.** Os dois imports novos usam `tools/ → net/` (declarada desde `e4.2`, §2.2 de
   `architecture-e4.md`, linha `tools/ … → sim/, chars/, bot/, match/, shop/, net/`) e `tools/ → chars/`
   (na mesma linha, desde sempre). O import desta story é de **valor** (`ATRASO_ALVO_TICKS`, `ESCALA_HP`),
   mas os dois módulos **já estão** no fecho de execução do `sim:check`: `client/telemetria.ts:1,3` já os
   importa como valor, e a §2.2 registra isso na tabela "27 → 32". Os próprios imports deles não trazem
   nada novo: `net/protocolo.ts` só tem `import type` (linhas 1-2) e `chars/tuning.ts` não importa nada.
   Logo nenhum módulo novo entra no fecho. **Nenhum destino novo em `client/`**:
   `grep -rln "from '\.\./client/" src/tools/` continua devolvendo **exatamente**
   `src/tools/guarda-telemetria.ts` e `src/tools/telemetria.ts`, e a linha de import de `client/` da guarda
   (linha 1, `client/telemetria.ts`) não muda.
5. **Carimbo parcial no fixture (`DEBT11-TST-002`).** O `FIXTURE` (`guarda-telemetria.ts:60-68`) ganha
   dois eventos novos, **cada um numa partida própria, diferente entre si e das já usadas** (por exemplo
   44 e 55 — ver a nota do AC 2): um com `{ escalaHp: 6 }` **sem** `atrasoTicks`, e outro com
   `{ atrasoTicks: 6 }` **sem** `escalaHp`. Os dois contam como **sem carimbo** pela definição única
   `semCarimbo` (linhas 29-31: `!Number.isFinite(atrasoTicks) || !Number.isFinite(escalaHp)` — basta um
   campo ausente), e `agregar()` os marca `conhecida: false`.

   **Mas não caem no mesmo grupo que os dois sem carimbo que já existem** *(corrigido pelo @po na v1.1 —
   a v1.0, e a spec do @po no Change Log v1.5 de `debt.11` que ela citou, diziam "3 populações, a
   desconhecida com n=4", o que é falso contra o código)*. `agregar()` agrupa por **rótulo**
   (`tools/telemetria.ts`, `grupos.set(rotulo, …)`), e `populacaoDe()` escreve o rótulo campo a campo. O
   fixture passa a ter **5 populações: 2 conhecidas e 3 desconhecidas**, estas por último:
   - `atraso 6 tick(s) · ESCALA_HP desconhecida` — 1 evento (o de `{ atrasoTicks: 6 }`);
   - `atraso desconhecido · ESCALA_HP ×6` — 1 evento (o de `{ escalaHp: 6 }`);
   - `atraso desconhecido · ESCALA_HP desconhecida` — 2 eventos (os de hoje, `{}` e os dois `null`).

   Implementado ao pé da letra da v1.0, o `sim:check` sai **vermelho sem mutação nenhuma**, com dois
   problemas: "5 bloco(s) P3.1 e 5 rótulo(s) — esperado 3" e "3 população(ões) desconhecida — esperada 1"
   (medido numa cópia descartável de `d378ca5`, Node 24.13.1). Por isso a guarda muda assim, **sem tocar
   o código de `tools/telemetria.ts`** (AC 8):
   - `POPULACOES_FIXTURE` (linha 69) passa de **3 para 5**, e entra `DESCONHECIDAS_FIXTURE = 3`. Os dois
     são **literais de propósito**: derivá-los exigiria replicar a regra de rótulo de `populacaoDe()`, que
     é o código sob teste (mesmo princípio de "coletor real, não réplica", R3 de `debt.11`).
   - A checagem de `M2` (linha 264, hoje "exatamente 1 desconhecida, a última") passa a exigir
     **exatamente `DESCONHECIDAS_FIXTURE` rótulos desconhecidos, e que sejam os últimos
     `DESCONHECIDAS_FIXTURE`** da saída.
   - A checagem de R6 (linhas 270-274, hoje "o cabeçalho da desconhecida abre com `eventos 2 ·`") passa a
     exigir que a **soma** dos `eventos N ·` dos cabeçalhos das desconhecidas seja `SEM_CARIMBO_FIXTURE`.
     O mesmo princípio de antes: a população desconhecida, somada, tem exatamente os eventos que a
     definição única chama de sem carimbo.

   `SEM_CARIMBO_FIXTURE` e `N_COMBINADO_FIXTURE` (linhas 70-71) **continuam derivados** do `FIXTURE` por
   `.filter(...)`, nunca literais, e passam a valer **4** e **9** (hoje 2 e 7). Nenhum bloco tem `n=9`
   (os cinco ficam com n=3, 2, 1, 1 e 2), o que preserva a propriedade que discrimina `M3`. O comentário
   do fixture (linhas 54-58) é atualizado: 5 populações, 3 delas desconhecidas, e `n` combinado 9.

   **Os dois sentidos são necessários** *(conferido na v1.1 com a guarda assim ajustada)*. `Q13`
   (`?? 0` só no atraso) funde o evento `{ escalaHp: 6 }` na população (0, 6) e reprova por duas
   checagens: 4 populações e 2 desconhecidas. `Q13b` (`?? 1` só na escala) cria a população conhecida
   (6, 1) e deixa o **total** em 5. Por isso só a checagem de **quantas são desconhecidas** a pega. Essa
   checagem sustenta sozinha o caso `Q13b` e não pode ser afrouxada para "pelo menos uma".
6. **Contrafactual — os 5 casos novos, mais os 6 já existentes reaplicados.** Numa cópia descartável do
   código, cada resultado registrado no Dev Agent Record. Saem com **rc=1**:
   - **Q12** — `registrar()` grava `atrasoTicks: 0, escalaHp: 1` **literais** em vez das constantes
     importadas;
   - **Q12a** — só `atrasoTicks: 0` literal (escala continua correta);
   - **Q12b** — só `escalaHp: 1` literal (atraso continua correto);
   - **Q13** — `atrasoTicks ?? 0` só no atraso de `populacaoDe()` em `tools/telemetria.ts` (mutação
     parcial no agregador, não no coletor);
   - **Q13b** — `escalaHp ?? 1` só na escala de `populacaoDe()`.

   *(@po v1.1 — forma exata de Q13/Q13b: trocar **toda** leitura do campo dentro de `populacaoDe()`,
   tanto no `Number.isFinite(...)` quanto no texto do rótulo, por `(e.atrasoTicks ?? 0)` ou
   `(e.escalaHp ?? 1)`. Trocar só o `isFinite` gera rótulos "atraso undefined"/"atraso null", que a
   guarda de hoje já pega. Isso não é a lacuna que `DEBT11-TST-002` descreve.)*

   Reaplicar também as 6 mutações de `debt.11` (**M1**, **M1b**, **M2**, **M3**, **MR1**, e as **duas
   formas de MR2**) — todas continuam saindo com rc=1, sem regressão introduzida por esta story.
   A benigna **Q1** (formato de número em `agregarPopulacao()`) **continua saindo com rc=0** — é a prova
   de que as asserções leem rótulo e cabeçalho, não número formatado (mesmo princípio R5 de `debt.11`).
7. **Limite conhecido, registrado e explicitamente NÃO corrigido.** Enquanto `ATRASO_ALVO_TICKS` e
   `ESCALA_HP` valerem o mesmo número (6 e 6.0, hoje), um carimbo com os **dois campos trocados**
   (`atrasoTicks: 6.0` vindo de `ESCALA_HP` e `escalaHp: 6` vindo de `ATRASO_ALVO_TICKS`) passa pela
   checagem de valor sem ser pego — os dois valores batem, só que trocados de campo. Os Dev Notes desta
   story registram esse limite com todas as letras, e a linha `telemetria` do `sim:check` passa a imprimir
   os dois valores esperados (por exemplo, "esperado atraso=6, escala=6"), para que quem revisar a saída
   veja o número e perceba quando os dois deixarem de coincidir. **Nenhuma asserção nova é exigida** para
   pegar essa troca — é limite documentado, não item de implementação.
8. **Comentário desatualizado em `tools/telemetria.ts`.** O bloco de `populacaoDe()`
   (`tools/telemetria.ts:57-58`) tem a frase "`tools/ → net/` não existe na tabela de camadas" — **falsa
   desde `e4.2`** (a seta existe desde a §2.2 de `architecture-e4.md`, usada por `debt.10`/`debt.11` para
   os imports de `client/`, e agora por esta story para `net/protocolo.ts`). A frase sai. **O motivo que
   continua certo permanece**: o agregador não importa as constantes de propósito, porque o valor
   histórico correto é o gravado no arquivo, não o que a constante vale hoje. O diff desse arquivo tem
   **só** linhas de comentário desse bloco — nenhuma linha de código muda em `tools/telemetria.ts`.
9. **Escopo de arquivos, fechado.**

   | Permitido | Motivo |
   |---|---|
   | `src/tools/guarda-telemetria.ts` | asserção de valor (AC 3), fixture com carimbo parcial (AC 5), imports novos de `net/`/`chars/` (AC 4) |
   | `src/tools/telemetria.ts` | **só** o comentário do AC 8 — nenhuma linha de código |

   **Proibido, sem exceção:** `src/tools/determinism.ts` (não entra na ordem — AC do "Depende de"),
   `src/client/`, `src/net/` (além da leitura de `ATRASO_ALVO_TICKS`, que não altera arquivo nenhum de
   `net/`), `src/chars/` (idem, `ESCALA_HP`), `src/sim/`, `src/match/`, e `docs/` — exceto a própria
   story. Prova por `git show --stat <commit de implementação>`.

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type**: Architecture / Testing (fecha um gap de alcance de uma guarda de regressão já existente,
sem regra de jogo nova)
**Secondary Type(s)**: N/A
**Complexity**: XS — dois arquivos, um deles só com mudança de comentário; o maior risco é esquecer um dos
dois sentidos do carimbo parcial no fixture.

### Specialized Agent Assignment

**Primary Agents**:
- @dev
- @qa (quality gate — confere que Q12/Q12a/Q12b/Q13/Q13b reprovam de fato, que as 6 mutações de `debt.11`
  continuam reprovando sem regressão, que a benigna Q1 continua passando, e que só a linha `telemetria` do
  `sim:check` muda)

**Supporting Agents**:
- @po (dono do roteamento que criou esta story e da cláusula provisória em `e4.7`/`debt.9`; não implementa)

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
- A asserção de valor (`=== ATRASO_ALVO_TICKS`, `=== ESCALA_HP`) é separada da asserção de presença, com
  mensagem própria (AC 3)
- Q12, Q12a, Q12b, Q13 e Q13b reprovam o `sim:check`, e as 6 mutações de `debt.11` continuam reprovando
  sem regressão (AC 6)
- O carimbo parcial do fixture cobre os dois sentidos (só atraso, só escala), em partidas distintas, e a
  guarda espera 5 populações com 3 desconhecidas por último, somando `SEM_CARIMBO_FIXTURE` (AC 5)

**Secondary Focus**:
- Nenhuma linha de código muda em `tools/telemetria.ts` — só o comentário do AC 8
- O limite conhecido (campos trocados com o mesmo valor numérico) está documentado no Dev Notes, sem
  asserção nova exigida (AC 7)

## Tasks / Subtasks

- [x] Task 0 — Pré-condição de início (AC: "Depende de")
  - [x] Confirmar que `debt.11` está Done (`971686b`)
  - [x] Confirmar que `git status --short src/tools/guarda-telemetria.ts src/tools/telemetria.ts` sai
        vazio; se outra story tiver mudança não commitada em outros arquivos de `src/`, preparar um
        worktree descartável do commit de implementação para a verificação

- [x] Task 1 — `src/tools/guarda-telemetria.ts`, asserção de valor (AC: 3, 4)
  - [x] Importar `ATRASO_ALVO_TICKS` de `../net/protocolo.ts` e `ESCALA_HP` de `../chars/tuning.ts`
  - [x] Acrescentar, sobre `doExportNovo` (os eventos com `partida === PARTIDA_NOVA`), uma asserção de
        valor separada da de presença: cada evento tem `atrasoTicks === ATRASO_ALVO_TICKS` e
        `escalaHp === ESCALA_HP`; problema registrado com o valor achado e o esperado por campo
  - [x] Atualizar a linha de status `telemetria` para imprimir os dois valores esperados

- [x] Task 2 — `src/tools/guarda-telemetria.ts`, carimbo parcial no fixture (AC: 5)
  - [x] Acrescentar ao `FIXTURE` um evento `{ escalaHp: 6 }` sem `atrasoTicks` (partida própria, ex.: 44)
  - [x] Acrescentar ao `FIXTURE` um evento `{ atrasoTicks: 6 }` sem `escalaHp` (outra partida, ex.: 55)
  - [x] `POPULACOES_FIXTURE` 3 → 5; novo `DESCONHECIDAS_FIXTURE = 3`; checagem de M2 → exatamente 3
        desconhecidas, as 3 últimas; checagem de R6 → soma dos `eventos N ·` das desconhecidas =
        `SEM_CARIMBO_FIXTURE` (AC 5, v1.1)
  - [x] Confirmar que `SEM_CARIMBO_FIXTURE`/`N_COMBINADO_FIXTURE` (já derivados por `.filter`) passam a 4
        e 9, e que nenhum bloco chega a `n=9`
  - [x] Atualizar o comentário do fixture (linhas 54-58): 5 populações, 3 desconhecidas, `n` combinado 9

- [x] Task 3 — `src/tools/telemetria.ts`, comentário (AC: 8)
  - [x] Remover, do bloco de `populacaoDe()` (linhas 57-58), a frase "`tools/ → net/` não existe na
        tabela de camadas"; manter o motivo de o agregador não importar as constantes-fonte

- [x] Task 4 — Contrafactual (AC: 6, 7)
  - [x] Q12, Q12a, Q12b — aplicar em `registrar()`, rodar `sim:check`, confirmar código != 0, reverter
  - [x] Q13, Q13b — aplicar em `populacaoDe()`, rodar `sim:check`, confirmar código != 0, reverter
  - [x] Reaplicar M1, M1b, M2, M3, MR1 e as duas formas de MR2 de `debt.11` — confirmar código != 0 sem
        regressão, reverter
  - [x] Reaplicar Q1 (formato de número) — confirmar código == 0 (benigna)
  - [x] Registrar no Dev Notes, sem implementar asserção, o limite dos campos trocados com o mesmo valor
        numérico (AC 7)

- [x] Task 5 — Verificação (AC: 1, 2, 9)
  - [x] `npm run check` — 0 erros
  - [x] `npm run sim:check` antes e depois — golden hash idêntico; só a linha `telemetria` muda de
        conteúdo
  - [x] `git show --stat` do commit de implementação, restrito aos 2 arquivos do AC 9

## Dev Notes

### O que já existe em `guarda-telemetria.ts` — os pontos exatos que esta story estende (fonte: o arquivo)

```ts
// linhas 189-190
const PARTIDA_ANTIGA = 900
const PARTIDA_NOVA = 901
// linha 221 — asserção de PRESENÇA que já existe e continua
novosCarimbados = doExportNovo.filter((e) => !semCarimbo(e)).length
// linhas 232-236 — pega M1 (sem carimbo), continua como está
if (novosCarimbados !== doExportNovo.length) {
  problemas.push(`  ✗ telemetria: ${...} evento(s) novo(s) sem atrasoTicks/escalaHp finitos ... (M1)`)
}
```

A asserção de **valor** desta story é **nova e separada**: lê os mesmos `doExportNovo`, mas confere
`atrasoTicks === ATRASO_ALVO_TICKS` e `escalaHp === ESCALA_HP` campo a campo, com mensagem própria (não
reaproveitar o texto de M1, para "sem carimbo" e "carimbo errado" não se confundirem na saída).

[Fonte: `src/tools/guarda-telemetria.ts:1, 29-31, 189-236`]

### O fixture hoje — onde entram os dois eventos de carimbo parcial (fonte: o arquivo)

```ts
// linhas 60-68
const FIXTURE: readonly EventoRegistrado[] = [
  rodadaFim(11, 1, 21000, { atrasoTicks: 6, escalaHp: 6 }),
  rodadaFim(11, 2, 23000, { atrasoTicks: 6, escalaHp: 6 }),
  rodadaFim(11, 3, 25000, { atrasoTicks: 6, escalaHp: 6 }),   // (6,6) n=3
  rodadaFim(22, 1, 19000, { atrasoTicks: 0, escalaHp: 6 }),
  rodadaFim(22, 2, 20000, { atrasoTicks: 0, escalaHp: 6 }),   // (0,6) n=2
  rodadaFim(33, 1, 14000, {}),                                 // sem carimbo (nenhum campo)
  rodadaFim(33, 2, 15000, { atrasoTicks: null, escalaHp: null }), // sem carimbo (os dois null)
]
const POPULACOES_FIXTURE = 3
const N_COMBINADO_FIXTURE = FIXTURE.filter((e) => e.t === 'rodadaFim').length   // hoje 7
const SEM_CARIMBO_FIXTURE = FIXTURE.filter(semCarimbo).length                    // hoje 2
```

Os dois eventos novos desta story (`{ escalaHp: 6 }` sem `atrasoTicks`, e `{ atrasoTicks: 6 }` sem
`escalaHp`) entram na mesma lista, com `partida` nova (por exemplo 44) para não colidir com as já
existentes. `N_COMBINADO_FIXTURE` sobe para 9 e `SEM_CARIMBO_FIXTURE` para 4 automaticamente, porque os
dois já são **derivados**, não literais — não editar esses dois valores à mão.

[Fonte: `src/tools/guarda-telemetria.ts:54-71`]

### O comentário a corrigir em `tools/telemetria.ts` (fonte: o arquivo)

```ts
// linhas 53-61
/**
 * debt.10 / `E41-TEL-002` — a população de um evento: o (atraso de input, `ESCALA_HP`) GRAVADO nele
 * pelo coletor no instante do `registrar()`.
 *
 * O agregador lê o valor do ARQUIVO e nunca importa as constantes-fonte: `tools/ → net/` não existe
 * na tabela de camadas (`architecture-e4.md` §2.2), e o valor histórico certo é o que foi gravado, não
 * o que a constante vale hoje. Campo ausente ou não-numérico é DESCONHECIDO — nunca atraso 0 nem escala
 * 1.0 por omissão, mesmo molde do `mag` ausente (TEL-E35-001) mais abaixo.
 */
function populacaoDe(e: EventoRegistrado): { rotulo: string; conhecida: boolean } { ... }
```

A frase "`tools/ → net/` não existe na tabela de camadas" sai; o resto do parágrafo (a razão de o
agregador não importar as constantes) fica, porque continua verdadeiro e é o motivo real. Esta função
(`populacaoDe`) em si **não muda de código** — só o comentário acima dela.

[Fonte: `src/tools/telemetria.ts:53-70`]

### As constantes-fonte, hoje só-leitura para este trabalho

```ts
// src/net/protocolo.ts:38
export const ATRASO_ALVO_TICKS = 6
// src/chars/tuning.ts:10
export const ESCALA_HP = 6.0
```

`guarda-telemetria.ts` (em `src/tools/`) importa as duas como valor. A seta `tools/ → net/` já está
declarada desde `e4.2` (§2.2 de `architecture-e4.md`), e `tools/ → chars/` está na tabela desde sempre —
nenhuma seta nova.

[Fonte: `src/net/protocolo.ts:38`; `src/chars/tuning.ts:10`; `docs/stories/debt.10.telemetria-marca-atraso-de-input.story.md` Dev Notes]

### Limite conhecido — campos trocados com o mesmo valor (AC 7, registrado pelo @dev)

A asserção de valor compara `atrasoTicks === ATRASO_ALVO_TICKS` e `escalaHp === ESCALA_HP`. Hoje
`ATRASO_ALVO_TICKS = 6` e `ESCALA_HP = 6.0`, e em JavaScript `6 === 6.0`. Por isso um `registrar()` que
grave `{ atrasoTicks: ESCALA_HP, escalaHp: ATRASO_ALVO_TICKS }`, com os dois campos **trocados**, passa
pela checagem **sem ser pego**. Isso foi medido: a mutação T7 da bateria sai com `sim:check` rc=0. A troca
só fica visível quando as duas constantes deixarem de valer o mesmo número. Nenhuma asserção foi
acrescentada para isso, conforme o AC 7. A mitigação é a linha `telemetria` do `sim:check`, que agora
imprime `com o valor esperado (atraso=6, escala=6)`: quem revisar a saída vê os dois números lado a lado
e percebe quando deixarem de coincidir. O mesmo limite está escrito no cabeçalho de
`src/tools/guarda-telemetria.ts`.

### O que esta story explicitamente NÃO faz

- Não corrige o caso em que os dois campos são trocados por engano mas mantêm o mesmo valor numérico
  (`ATRASO_ALVO_TICKS === ESCALA_HP` hoje) — é limite documentado (AC 7), não implementado.
- Não abre `src/tools/determinism.ts` — esta story não entra na ordem `e4.8 → debt.11 → e4.9 → e4.3 →
  debt.12 → e4.6`.
- Não decide se `e4.7`/`debt.9` deixam de precisar da cláusula provisória de "valor do carimbo não
  guardado" — isso é ação do @po **ao fechar** esta story (retirar a cláusula de `e4.7` v1.6.0 e
  `debt.9` v1.3), não parte da implementação.
- Não altera `DEBT10-COD-003` (permanece aberto, opcional, fora do escopo desta story).

### Testing

- `npm run check` — 0 erros.
- `npm run sim:check` — rodado antes e depois; golden hash idêntico; **só** a linha `telemetria` muda de
  conteúdo na saída completa.
- Contrafactual completo: Q12, Q12a, Q12b, Q13, Q13b (novos) e M1, M1b, M2, M3, MR1, as duas formas de
  MR2 (reaplicados de `debt.11`) — todos com `sim:check` saindo com código diferente de 0. Q1 (benigna)
  continua saindo com código 0.
- `grep -rln "from '\.\./client/" src/tools/` — continua devolvendo exatamente `guarda-telemetria.ts` e
  `telemetria.ts`, sem mudança na linha de import de `client/`.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (1M context), como Dex (@dev), em modo YOLO.

### Commits

- **Implementação:** `181db27`, `test(telemetria): guarda confere o valor do carimbo [debt.13][DEBT11-TST-001]`.
  O pai é `c4b22db` (gate de `e4.9` pelo @qa, commitado em paralelo, que só mexe em `docs/`).
  `git show --stat 181db27` lista `src/tools/guarda-telemetria.ts | 68 +++---` e
  `src/tools/telemetria.ts | 8 ++--`, 2 arquivos, 60 inserções e 16 remoções (AC 9).
- **Story:** commit separado, só com este arquivo, no mesmo molde de `e4.8`, `debt.11` e `e4.9`.

### Debug Log References

**Task 0.** `debt.11` está Done (`971686b`). `git status --short src/` saiu vazio antes da primeira edição,
então a verificação rodou na árvore. As mutações rodaram numa cópia descartável de `src/` no scratchpad,
pelo motivo descrito abaixo.

**AC 1:** `npm run check` (`tsc --noEmit`) saiu com rc=0. **Build:** `npm run build` saiu com rc=0.

**AC 2.** A saída completa do `sim:check` foi salva antes da primeira edição e de novo sobre a árvore
commitada, e as duas foram comparadas com `diff`. As duas saem com rc=0. `golden hash ✓ ok — 6 seeds batem
o baseline` ficou idêntico. O diff tem **uma única linha trocada** (2 linhas `<`/`>`), a 61:

```
< telemetria     ✓ ok — coletor real: 2 evento(s) novo(s) carimbado(s), 1 antigo(s) sem carimbo no export (3) · agregar() do fixture: 3 bloco(s) P3.1, 3 população(ões), a desconhecida à parte, nenhum n combinado
> telemetria     ✓ ok — coletor real: 2 evento(s) novo(s) carimbado(s), 2 com o valor esperado (atraso=6, escala=6), 1 antigo(s) sem carimbo no export (3) · agregar() do fixture: 5 bloco(s) P3.1, 5 população(ões), as 3 desconhecidas à parte, nenhum n combinado
```

A linha `globais` continua byte a byte igual, com `3 console.warn capturado(s)`, porque os eventos
parciais estão nas partidas 44 e 55.

**AC 4.** `grep -rln "from '\.\./client/" src/tools/` devolve exatamente `src/tools/guarda-telemetria.ts`
e `src/tools/telemetria.ts`. A linha 1 da guarda, o import de `client/telemetria.ts`, não mudou. Os
imports novos entraram nas linhas 3-4: `ESCALA_HP` de `../chars/tuning.ts` e `ATRASO_ALVO_TICKS` de
`../net/protocolo.ts`.

**AC 8.** `git diff -U0 src/tools/telemetria.ts` tem 4 linhas `-` e 4 linhas `+`, todas dentro do bloco
`/** … */` de `populacaoDe()`. Nenhuma linha de código mudou.

**AC 6: contrafactual.** O script `bateria.mjs`, no scratchpad, copia `src/` e `package.json` para um
diretório descartável. Para cada mutação ele confere que cada padrão casa **exatamente 1 vez**
(senão aborta), grava, roda `node src/tools/determinism.ts`, registra o rc e as linhas `✗` e restaura o
arquivo. Ao final, `diff -r` entre a árvore e a cópia saiu vazio. A árvore compartilhada nunca foi
mutada, porque o @qa estava fazendo o gate de `e4.9` em paralelo. Resultados, rodados sobre o código
final:

| Caso | Aplicada como | rc | Problema acusado pela guarda |
|---|---|---|---|
| **Q12** | `registrar()` com `atrasoTicks: 0, escalaHp: 1` | **1** | `2 evento(s) novo(s) com carimbo de VALOR errado no export — achado atraso=0, escala=1; esperado atraso=6, escala=6 … (DEBT11-TST-001)` |
| **Q12a** | só `atrasoTicks: 0` | **1** | idem, `achado atraso=0, escala=6` |
| **Q12b** | só `escalaHp: 1` | **1** | idem, `achado atraso=6, escala=1` |
| **Q13** | em `populacaoDe()`, `e.atrasoTicks` → `(e.atrasoTicks ?? 0)` no `isFinite` **e** no rótulo | **1** | `4 bloco(s) P3.1 e 4 rótulo(s) — esperado 5`; `2 população(ões) "desconhecida" — esperadas 3, as últimas (M2 …)` |
| **Q13b** | `e.escalaHp` → `(e.escalaHp ?? 1)` no `isFinite` **e** no rótulo | **1** | só `2 população(ões) "desconhecida" — esperadas 3` (o total fica em 5, como o AC 5 previa) |
| **M1** | `registrar()` grava `{ ...e, partida }` | **1** | só a mensagem de presença `(M1)`. A de valor **não** dispara, como pede a separação do AC 3 |
| **M1b** | M1 mais `exportar()` com `eventos.map(… carimbo …)` | **1** | `o evento antigo saiu carimbado no export … (M1b)` |
| **M2** | `populacaoDe()` começa com `e = { ...e, atrasoTicks: e.atrasoTicks ?? 0, escalaHp: e.escalaHp ?? 1 }` | **1** | `4 bloco(s) … esperado 5`; `0 população(ões) "desconhecida"`; `não avisou sobre os eventos sem carimbo` |
| **M3** | `agregar()` começa com `return agregarPopulacao(eventos)` | **1** | `1 bloco(s) P3.1 e 0 rótulo(s)`, sem `⚠`, `0 desconhecida`, `n combinado (9)` e sem aviso de sem carimbo |
| **MR1** | `restaurar()` começa com `return Reflect.deleteProperty(alvo, chave)` | **1** | `console.warn`, `globalThis.Blob`, `URL.createObjectURL` e `URL.revokeObjectURL` `não voltou ao descritor de antes` |
| **MR2 (a)** | caso ausente vira `defineProperty(…, { value: undefined, … })` | **1** | `globalThis.localStorage` e `globalThis.document` `não voltou … (estava ausente)` |
| **MR2 (b)** | caso ausente vira `alvo[chave] = undefined` | **1** | idem |
| **Q1** (benigna) | `(medHumano / 1000).toFixed(1)` → `toFixed(2)` em P3.1 | **0** | nenhum; as duas linhas de status ficam `✓ ok` |
| **T7** (limite do AC 7) | `registrar()` com `atrasoTicks: ESCALA_HP, escalaHp: ATRASO_ALVO_TICKS` | **0** | nenhum. É o limite documentado, sem asserção nova, conforme o AC 7 |

O script terminou com 0 falhas, e a execução final da cópia restaurada saiu com rc=0.

### Completion Notes

- **AC 3, valor do carimbo.** `carimbadosNovos = doExportNovo.filter((e) => !semCarimbo(e))`. A asserção de
  valor corre só sobre eles e dispara se algum tiver `atrasoTicks !== ATRASO_ALVO_TICKS ||
  escalaHp !== ESCALA_HP`, por `===` e sem tolerância. A mensagem tem os pares achados distintos e o
  par esperado. A asserção de presença (M1) ficou como estava, e `novosCarimbados` agora é
  `carimbadosNovos.length`, com o mesmo valor de antes.
- **AC 5, fixture.** Entraram `rodadaFim(44, 1, 16000, { escalaHp: 6 })` e
  `rodadaFim(55, 1, 17000, { atrasoTicks: 6 })`. `POPULACOES_FIXTURE = 5` e `DESCONHECIDAS_FIXTURE = 3` são
  literais, com comentário explicando por quê. `SEM_CARIMBO_FIXTURE` e `N_COMBINADO_FIXTURE` continuam
  derivados e passaram a 4 e 9. Os blocos ficaram com n=3, 2, 1, 1 e 2, e nenhum tem 9. A checagem de M2
  exige `desconhecidas.length === 3` e que os índices sejam os 3 últimos de `indicesPopulacao`. A de R6
  lê `^eventos (\d+) ·` no cabeçalho de cada desconhecida, exige que todos casem e que a soma seja
  `SEM_CARIMBO_FIXTURE`. O comentário do fixture foi atualizado.
- **AC 7.** O limite ficou registrado nos Dev Notes (subseção própria) e no cabeçalho da guarda. A linha
  de status imprime `atraso=6, escala=6`.

**Decisões autônomas:**
- [AUTO-DECISION] O AC 3 pede "valor achado e esperado de cada campo". Um problema por evento ou um só?
  → **Um só**, com a contagem e os pares distintos achados (motivo: no molde de M1, que também é um
  problema agregado, e com 2 eventos novos isso evita repetir a mesma linha).
- [AUTO-DECISION] O que a linha de status imprime? → `N com o valor esperado (atraso=…, escala=…)`, logo
  depois da contagem de carimbados, e o sufixo `ok` passa a `as 3 desconhecidas à parte` (motivo: o AC 7
  pede os dois valores esperados na linha, e o sufixo antigo, no singular, deixou de ser verdade).
- [AUTO-DECISION] Rodar T7 (campos trocados), mesmo sem o AC pedir? → **Sim, como medição, sem asserção**
  (motivo: transforma o limite do AC 7 de afirmação em fato medido, rc=0).
- [AUTO-DECISION] Onde entram os imports novos? → Nas linhas 3-4, depois do import de `./telemetria.ts`
  (motivo: o AC 4 exige que a linha 1, o import de `client/`, não mude).
- [AUTO-DECISION] Status final → `Ready for Review`, como pedido na delegação e no mesmo molde de
  `e4.9`/`debt.11`.

**Incidente, sem efeito no commit:** uma primeira tentativa de edição por script de shell quebrou na
interpolação de crases e gravou texto truncado. Reverti com `git checkout --`, que, com
`core.autocrlf=true`, regravou o arquivo em CRLF. Normalizei de volta para LF antes do commit. O diff
commitado tem só as 60/16 linhas reais.

**Self-critique (passos 5.5/6.5):** não há `any` nem `as` novo. Não há import fora das setas declaradas
(`tools/ → net/`, `tools/ → chars/`). A guarda continua sem lançar e sem `process.exit`. `Number(c)` só
roda depois de conferir que nenhuma contagem é `undefined`. Nenhuma asserção lê número formatado: `eventos
N ·` é contagem inteira, a mesma leitura que R6 já fazia, e Q1 continua rc=0. A checagem de M2 não foi
afrouxada para "pelo menos uma", e Q13b prova que ela sustenta o caso sozinha. `determinism.ts` não foi
aberto.

**Em aberto:** CodeRabbit não roda nesta máquina (gate por WSL), então as caixas Pre-Commit/Pre-PR do
bloco CodeRabbit ficaram desmarcadas. A cobertura foi `npm run check`, `npm run sim:check`,
`npm run build` e a bateria acima. Retirar a cláusula provisória de `e4.7` v1.6.0 e de `debt.9` v1.3 é
ação do @po ao fechar esta story.

### File List

| Arquivo | Mudança |
|---|---|
| `src/tools/guarda-telemetria.ts` | imports de `ATRASO_ALVO_TICKS`/`ESCALA_HP`, asserção de valor separada (AC 3), fixture com carimbo parcial em 44/55, `POPULACOES_FIXTURE = 5`, `DESCONHECIDAS_FIXTURE = 3`, M2 e R6 ajustadas (AC 5), linha de status com os valores esperados (AC 7), cabeçalho e comentário do fixture |
| `src/tools/telemetria.ts` | só o comentário de `populacaoDe()` (AC 8) |
| `docs/stories/debt.13.guarda-telemetria-confere-valor-do-carimbo.story.md` | Status, checkboxes, Dev Notes (limite do AC 7), Dev Agent Record, File List e Change Log, em commit separado |

## QA Results

### Review Date: 2026-09-21

### Reviewed By: Quinn (@qa) — gate `docs/qa/gates/debt.13-guarda-telemetria-confere-valor-do-carimbo.yml`

**Gate: PASS → Status Done.** Revisão avaliada: `181db27` (implementação). O pai é `c4b22db`, só docs. O registro é `1fa6301`, que toca só a story. `git diff --stat 181db27 HEAD -- src` está vazio. O commit é local e não publicado (`merge-base --is-ancestor 181db27 origin/master` rc=1).

**Verificação independente (tudo refeito do zero, em worktrees descartáveis de `181db27` e `181db27^`, porque a árvore compartilhada está com a e4.3 em andamento):**

| AC | Veredito | Evidência |
|---|---|---|
| 1, 2 | MET | `check`, `sim:check` e `build` com rc=0, golden hash ✓, stderr vazio. O `diff` da saída inteira contra `181db27^` é um único bloco `57c57`, só a linha `telemetria`. `cmp` da linha `globais`: idêntica, 3 console.warn |
| 3 | MET | `!==` contra `ATRASO_ALVO_TICKS`/`ESCALA_HP` importados, só sobre `carimbadosNovos`, com mensagem própria (achado e esperado). Sob M1, sai só a mensagem de presença |
| 4 | MET | `grep -rln` devolve exatamente os 2 arquivos. A linha 1 da guarda não mudou. `tools/ → net/` e `tools/ → chars/` estão em `architecture-e4.md:317`, e o fecho em `:357` |
| 5 | MET | Partidas 44 e 55. `POPULACOES_FIXTURE = 5` e `DESCONHECIDAS_FIXTURE = 3` literais. SEM/N derivados (4 e 9). Cabeçalhos das desconhecidas: 1, 1 e 2. M2 exata com posição, R6 por soma |
| 6 | MET | Reaplicados em cópia descartável: Q12, Q12a, Q12b, Q13, Q13b, M1, M1b, M2, M3, MR1, MR2a e MR2b com rc=1. Q1 com rc=0 |
| 7 | MET | Limite nos Dev Notes e no cabeçalho da guarda. A linha de status imprime `atraso=6, escala=6`. T7 com rc=0. Com `ATRASO_ALVO_TICKS = 7`, a troca é acusada |
| 8 | MET | Os 8 hunks de `tools/telemetria.ts` são todos comentário do bloco de `populacaoDe()` |
| 9 | MET | `git show --stat 181db27`: 2 arquivos, 60/16. Blobs com 0 CR, `i/lf w/lf`, mesmo stat com `-w`. O incidente de CRLF não deixou resíduo |

**Mutações próprias (14):** R6a (constante errada), R6b (um grupo fora da soma) e R6e (regex que não casa) reprovam o baseline: a R6 está viva. R6c, de produção (`agregar()` trunca as desconhecidas), tem a R6 como único ✗. R6d, a R6c com a R6 desligada, passa verde: a R6 é a única defesa contra essa classe. X1/X1b: o carimbo string `"6"` é pego pela M1 (`Number.isFinite("6")` é false). Com esse filtro, `!=` no lugar de `!==` é um mutante equivalente. X3 (escala ×(1+1e-9)) e X4 (só o cast errado) reprovam. X2 (checagem de valor sobre todos os novos) só muda a mensagem, não o rc. X5, X5b e X6: a contagem, a posição e a soma da R6 seguram Q13b cada uma sozinha.

**Achados (todos LOW, nenhum bloqueia):**
- **DEBT13-DOC-001 (low, docs; @dev, opcional, na próxima story que abrir `determinism.ts`):** a lista de "Suspeitos" do `throw` da guarda não inclui o carimbo com valor errado. A linha ✗ nomeia o caso certo.
- **DEBT13-DOC-002 (low, docs; @po/@dev, opcional):** o AC 5 e o comentário da M2 dizem que "só a contagem" pega Q13b. Medido, a posição e a R6 também pegam. É uma imprecisão a favor da segurança.
- **DEBT13-TST-003 (low, tests; fechado por este gate):** a lacuna da R6 era real só no registro do @dev. R6a–R6e são a evidência que faltava.

**Pergunta 2 (fecha `DEBT11-TST-001`/`002`?):** sim, fecha os dois. **@po: a cláusula provisória de COLETA pode ser retirada de `e4.7` (v1.6.0) e de `debt.9` (v1.3)**, com os itens dela: (i)/(ii), o parágrafo "Limite", a conferência manual no AC 8 e nas Tasks de `e4.7`, e o subitem de conferência de `debt.9`. As linhas exatas estão no gate. O limite da troca não contamina o dado: com as constantes iguais, a troca grava os mesmos números, e quando elas diferem a guarda acusa. O coletor é byte a byte o mesmo desde `3de1cfe` (debt.10), então a guarda atesta, retroativamente, qualquer build a partir de `3de1cfe`. **O que continua valendo:** a fronteira de debt.10/e4.1. Nada disso está em `origin/master` (último push `44311f6`, 2026-08-16), e o build publicado não tem carimbo nenhum.

**Observações:** o Status veio "Ready for Review" (o canônico é "InReview"), e a transição foi registrada como Ready for Review → Done. CodeRabbit não roda nesta máquina (WSL). Worktrees removidos.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-09-21 | 1.0 | Story criada a partir dos achados `DEBT11-TST-001` (medium) e `DEBT11-TST-002` (low) do gate de `debt.11` (`docs/qa/gates/debt.11-guarda-automatica-telemetria.yml`, `ca52e07`), conforme a spec completa roteada pelo @po no Change Log v1.5 de `docs/stories/debt.11.guarda-automatica-telemetria.story.md`. Escopo: `src/tools/guarda-telemetria.ts` (asserção de valor do carimbo, fixture com carimbo parcial) e `src/tools/telemetria.ts` (só o comentário desatualizado de `populacaoDe()`, sem mudança de código). Não entra na ordem de `src/tools/determinism.ts` e pode começar já, em paralelo com qualquer story dessa ordem. Prazo (R10): commit de implementação antes da primeira coleta humana usada como evidência de `debt.9` (pré-condição b) ou de `e4.7` (AC 8). Ao fechar, o @po retira a cláusula provisória registrada em `e4.7` v1.6.0 e `debt.9` v1.3. Status: Draft. | River (@sm) |
| 2026-09-21 | 1.1 | **Validação @po (`*validate-story-draft`): GO 8/10, Draft → Ready.** Checklist de 10 pontos: 1 título ✓, 2 descrição ✓, 3 ACs testáveis ⚠ (AC 5 falso contra o código até esta versão, corrigido abaixo), 4 escopo ✓, 5 dependências ✓, 6 complexidade ✓ (XS), 7 valor ✓ (gate de R10 para `debt.9` (b) e `e4.7` AC 8), 8 riscos ✓ (limite dos campos trocados, AC 7), 9 DoD ✓, 10 alinhamento ⚠ (a spec de origem, Change Log v1.5 de `debt.11`, era do próprio @po e trazia o erro do AC 5). **Correção bloqueante (AC 5).** `agregar()` agrupa por RÓTULO, e o rótulo de `populacaoDe()` é escrito campo a campo. Os dois eventos de carimbo parcial viram 2 populações desconhecidas novas, e não entram na que já existe. São 5 populações (2 conhecidas e 3 desconhecidas), e não 3. Ao pé da letra, a v1.0 deixava o `sim:check` vermelho sem mutação ("5 blocos, esperado 3" e "3 desconhecidas, esperada 1"). O AC 5 agora pede `POPULACOES_FIXTURE` 3 → 5, `DESCONHECIDAS_FIXTURE = 3` literal, M2 com "exatamente 3, as 3 últimas" e R6 com a soma dos `eventos N ·` das desconhecidas igual a `SEM_CARIMBO_FIXTURE`. **Segunda correção (AC 2 e AC 5):** os dois eventos novos ficam em partidas distintas. Na mesma partida, `agregar()` emite o aviso `partidasPartidas`, e a linha `globais` passa de "3 console.warn" a 4, o que viola o AC 2. **Ajustes menores:** o AC 3 aplica a asserção de valor só aos novos carimbados, senão M1 dispara as duas mensagens. O AC 4 cita o fecho real (`client/telemetria.ts:1,3` já importa as duas constantes; tabela "27 → 32" da §2.2). O AC 6 fixa a forma exata de Q13/Q13b (toda leitura do campo em `populacaoDe()`, não só o `isFinite`). Tasks 2 e CodeRabbit Focus foram alinhadas ao AC 5. Os Dev Notes (@dev) ainda dizem "partida nova (por exemplo 44)" para os dois eventos, e onde divergirem o AC 5 prevalece. **Prova medida** numa cópia descartável de `d378ca5` (Node 24.13.1), sem tocar a árvore. Com a guarda ajustada como no AC 5 e mais a asserção de valor, o baseline sai ✓ ("5 bloco(s) P3.1, 5 população(ões)"), e `globais` fica byte a byte igual ("3 console.warn capturado(s)"). Q12, Q12a, Q12b, M1, Q13, Q13b, M2 e M3 reprovam, e Q1 (`toFixed(1)` → `toFixed(2)` em P3.1) passa. M1b, MR1 e MR2 não foram rodadas aqui, porque estão em caminhos que esta story não muda, e ficam para o Dev Agent Record. Sem a mudança, Q13 passa verde na guarda de hoje, o que reproduz `DEBT11-TST-002`. **Fatos conferidos:** `guarda-telemetria.ts:1` (import de `client/`), `:29-31` (`semCarimbo`), `:54-58` (comentário "n combinado é 7"), `:60-68` (FIXTURE com 7 eventos), `:69-71` (`POPULACOES_FIXTURE = 3` literal; N/SEM derivados), `:190` (`PARTIDA_NOVA = 901`), `:221` e `:232-236` (presença/M1), `:264` (M2), `:270-274` (R6), `:318` (linha `globais` com a contagem de warns). `tools/telemetria.ts:57-58` traz a frase "`tools/ → net/` não existe na tabela de camadas", e o agrupamento por rótulo está em `agregar()` (`grupos.set(rotulo, …)`). `client/telemetria.ts:163` carimba com as constantes. `net/protocolo.ts:38` traz `ATRASO_ALVO_TICKS = 6`, com imports só `import type` (em `d378ca5` e em `6f2f56c` de `e4.9`). `chars/tuning.ts:10` traz `ESCALA_HP = 6.0`, sem imports. `architecture-e4.md:317` traz `tools/ … → sim/, chars/, bot/, match/, shop/, net/`, e `:357` diz que `chars/tuning.ts` e `net/protocolo.ts` já estavam no fecho. `grep -rln "from '\.\./client/" src/tools/` devolve exatamente os 2 arquivos. `e4.9` foi commitada durante esta validação (`6f2f56c`), sem tocar nenhum dos 2 arquivos desta story. | Pax (@po) |
| 2026-09-21 | 1.2 | **Implementação @dev: Ready → InProgress → Ready for Review.** Commit de implementação `181db27` (pai `c4b22db`, só `docs/`). `git show --stat` mostra 2 arquivos: `src/tools/guarda-telemetria.ts` e `src/tools/telemetria.ts`, este só com comentário. `determinism.ts` não foi aberto. check, sim:check e build saem com 0. O golden hash é idêntico, e o diff da saída do `sim:check` tem só a linha `telemetria` trocada (`globais` igual, 3 warns). Contrafactual numa cópia descartável: Q12, Q12a, Q12b, Q13, Q13b, M1, M1b, M2, M3, MR1, MR2a e MR2b saem com rc=1. Q1 sai com rc=0. T7 (campos trocados) sai com rc=0, e é o limite do AC 7, medido e documentado nos Dev Notes. Detalhes no Dev Agent Record. | Dex (@dev) |
| 2026-09-21 | 1.3 | **Gate @qa: PASS, Ready for Review → Done.** Gate `docs/qa/gates/debt.13-guarda-telemetria-confere-valor-do-carimbo.yml`, revisão `181db27`. Os 9 ACs estão MET, verificados do zero em worktrees descartáveis de `181db27` e `181db27^`. O diff do `sim:check` tem só a linha `telemetria`, e `globais` é idêntica. O escopo tem 2 arquivos, com blobs LF. As 14 mutações da story foram reaplicadas com os resultados declarados, e há 14 mutações próprias. A R6 está viva e é a única que pega a R6c. Três LOW opcionais: DEBT13-DOC-001, DOC-002 e TST-003 (este fechado pelo próprio gate). `DEBT11-TST-001`/`002` estão fechados, e o @po pode retirar a cláusula provisória de coleta de `e4.7` v1.6.0 e de `debt.9` v1.3. | Quinn (@qa) |
