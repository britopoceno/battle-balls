# Story debt.13: Guarda da telemetria confere o VALOR do carimbo — achados `DEBT11-TST-001` e `DEBT11-TST-002`

## Status

Draft

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
3. **Valor do carimbo (`DEBT11-TST-001`).** Em `guarda-telemetria.ts`, todo evento novo do export
   (identificado por `partida === PARTIDA_NOVA`, a mesma constante que já existe na linha 190) tem
   `atrasoTicks === ATRASO_ALVO_TICKS` **e** `escalaHp === ESCALA_HP`, importados de
   `../net/protocolo.ts` e de `../chars/tuning.ts`. A comparação é por `===`, **sem tolerância**, porque o
   coletor **copia** a constante em `registrar()` e não calcula nada — qualquer desvio é bug, não ruído de
   ponto flutuante. A asserção de **presença** que já existe (`novosCarimbados !== doExportNovo.length`,
   linha 232, que pega `M1`) **continua**; a de **valor** é uma asserção **própria**, separada, que
   registra um problema com o valor achado e o valor esperado de cada campo — para que "sem carimbo" e
   "carimbo com valor errado" não se confundam na mensagem nem no diagnóstico de quem lê a saída do
   `sim:check`.
4. **Setas, sem mudança.** Os dois imports novos usam `tools/ → net/` (declarada desde `e4.2`, §2.2 de
   `architecture-e4.md`) e `tools/ → chars/` (na tabela de camadas desde sempre). `net/protocolo.ts` só
   tem `import type` nos seus próprios consumidores — o import desta story é de **valor**
   (`ATRASO_ALVO_TICKS`), e `chars/tuning.ts` não tem import nenhum, então nenhum módulo novo entra no
   fecho de execução do `sim:check`. **Nenhum destino novo em `client/`**:
   `grep -rln "from '\.\./client/" src/tools/` continua devolvendo **exatamente**
   `src/tools/guarda-telemetria.ts` e `src/tools/telemetria.ts`, e a linha de import de `client/` da guarda
   (linha 1, `client/telemetria.ts`) não muda.
5. **Carimbo parcial no fixture (`DEBT11-TST-002`).** O `FIXTURE` (`guarda-telemetria.ts:60-68`) ganha
   dois eventos novos: um com `{ escalaHp: 6 }` **sem** `atrasoTicks`, e outro com `{ atrasoTicks: 6 }`
   **sem** `escalaHp`. Os dois caem na população **desconhecida** (pela definição única `semCarimbo`,
   linha 29-31: `!Number.isFinite(atrasoTicks) || !Number.isFinite(escalaHp)` — basta um campo ausente
   para o evento inteiro contar como sem carimbo). `SEM_CARIMBO_FIXTURE` e `N_COMBINADO_FIXTURE`
   (linhas 70-71) **continuam derivados** do `FIXTURE` por `.filter(...)`, nunca literais, e passam a
   valer **4** e **9** respectivamente (hoje 2 e 7). Nenhuma população conhecida tem `n=9` — as três
   ficam com `n=3` (6,6), `n=2` (0,6) e `n=4` (desconhecida), preservando a propriedade que discrimina
   `M3` (agregar sem partição). `POPULACOES_FIXTURE` (linha 69) **continua 3**. O comentário do fixture
   (linhas 54-58, hoje "o `n` combinado é 7") é atualizado para 9. **Os dois sentidos são necessários**: um
   evento com carimbo parcial só num campo pega uma M2 parcial no outro campo, e vice-versa — daí os dois
   eventos, não um só.
6. **Contrafactual — os 5 casos novos, mais os 6 já existentes reaplicados.** Numa cópia descartável do
   código, cada resultado registrado no Dev Agent Record. Saem com **rc=1**:
   - **Q12** — `registrar()` grava `atrasoTicks: 0, escalaHp: 1` **literais** em vez das constantes
     importadas;
   - **Q12a** — só `atrasoTicks: 0` literal (escala continua correta);
   - **Q12b** — só `escalaHp: 1` literal (atraso continua correto);
   - **Q13** — `atrasoTicks ?? 0` só no atraso de `populacaoDe()` em `tools/telemetria.ts` (mutação
     parcial no agregador, não no coletor);
   - **Q13b** — `escalaHp ?? 1` só na escala de `populacaoDe()`.

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
- O carimbo parcial do fixture cobre os dois sentidos (só atraso, só escala) e cai na desconhecida (AC 5)

**Secondary Focus**:
- Nenhuma linha de código muda em `tools/telemetria.ts` — só o comentário do AC 8
- O limite conhecido (campos trocados com o mesmo valor numérico) está documentado no Dev Notes, sem
  asserção nova exigida (AC 7)

## Tasks / Subtasks

- [ ] Task 0 — Pré-condição de início (AC: "Depende de")
  - [ ] Confirmar que `debt.11` está Done (`971686b`)
  - [ ] Confirmar que `git status --short src/tools/guarda-telemetria.ts src/tools/telemetria.ts` sai
        vazio; se outra story tiver mudança não commitada em outros arquivos de `src/`, preparar um
        worktree descartável do commit de implementação para a verificação

- [ ] Task 1 — `src/tools/guarda-telemetria.ts`, asserção de valor (AC: 3, 4)
  - [ ] Importar `ATRASO_ALVO_TICKS` de `../net/protocolo.ts` e `ESCALA_HP` de `../chars/tuning.ts`
  - [ ] Acrescentar, sobre `doExportNovo` (os eventos com `partida === PARTIDA_NOVA`), uma asserção de
        valor separada da de presença: cada evento tem `atrasoTicks === ATRASO_ALVO_TICKS` e
        `escalaHp === ESCALA_HP`; problema registrado com o valor achado e o esperado por campo
  - [ ] Atualizar a linha de status `telemetria` para imprimir os dois valores esperados

- [ ] Task 2 — `src/tools/guarda-telemetria.ts`, carimbo parcial no fixture (AC: 5)
  - [ ] Acrescentar ao `FIXTURE` um evento `{ escalaHp: 6 }` sem `atrasoTicks`
  - [ ] Acrescentar ao `FIXTURE` um evento `{ atrasoTicks: 6 }` sem `escalaHp`
  - [ ] Confirmar que `SEM_CARIMBO_FIXTURE`/`N_COMBINADO_FIXTURE` (já derivados por `.filter`) passam a 4
        e 9, e que nenhuma população conhecida chega a `n=9`
  - [ ] Atualizar o comentário do fixture (linhas 54-58) para refletir o novo `n` combinado

- [ ] Task 3 — `src/tools/telemetria.ts`, comentário (AC: 8)
  - [ ] Remover, do bloco de `populacaoDe()` (linhas 57-58), a frase "`tools/ → net/` não existe na
        tabela de camadas"; manter o motivo de o agregador não importar as constantes-fonte

- [ ] Task 4 — Contrafactual (AC: 6, 7)
  - [ ] Q12, Q12a, Q12b — aplicar em `registrar()`, rodar `sim:check`, confirmar código != 0, reverter
  - [ ] Q13, Q13b — aplicar em `populacaoDe()`, rodar `sim:check`, confirmar código != 0, reverter
  - [ ] Reaplicar M1, M1b, M2, M3, MR1 e as duas formas de MR2 de `debt.11` — confirmar código != 0 sem
        regressão, reverter
  - [ ] Reaplicar Q1 (formato de número) — confirmar código == 0 (benigna)
  - [ ] Registrar no Dev Notes, sem implementar asserção, o limite dos campos trocados com o mesmo valor
        numérico (AC 7)

- [ ] Task 5 — Verificação (AC: 1, 2, 9)
  - [ ] `npm run check` — 0 erros
  - [ ] `npm run sim:check` antes e depois — golden hash idêntico; só a linha `telemetria` muda de
        conteúdo
  - [ ] `git show --stat` do commit de implementação, restrito aos 2 arquivos do AC 9

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

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-09-21 | 1.0 | Story criada a partir dos achados `DEBT11-TST-001` (medium) e `DEBT11-TST-002` (low) do gate de `debt.11` (`docs/qa/gates/debt.11-guarda-automatica-telemetria.yml`, `ca52e07`), conforme a spec completa roteada pelo @po no Change Log v1.5 de `docs/stories/debt.11.guarda-automatica-telemetria.story.md`. Escopo: `src/tools/guarda-telemetria.ts` (asserção de valor do carimbo, fixture com carimbo parcial) e `src/tools/telemetria.ts` (só o comentário desatualizado de `populacaoDe()`, sem mudança de código). Não entra na ordem de `src/tools/determinism.ts` e pode começar já, em paralelo com qualquer story dessa ordem. Prazo (R10): commit de implementação antes da primeira coleta humana usada como evidência de `debt.9` (pré-condição b) ou de `e4.7` (AC 8). Ao fechar, o @po retira a cláusula provisória registrada em `e4.7` v1.6.0 e `debt.9` v1.3. Status: Draft. | River (@sm) |
