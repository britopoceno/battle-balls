# Story debt.10: Telemetria marca o atraso de input (e `ESCALA_HP`) por evento — achado `E41-TEL-002`

## Status

Draft

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run check", "npm run sim:check (hash idêntico esperado — esta story não toca sim/ nem match/)", "sim:check rodado antes e depois, diff da saída completa vazio", "git diff --stat restrito ao escopo do AC 10 — confirmar ausência de src/net/snapshot.ts, src/net/projecao.ts, src/client/render.ts e src/tools/determinism.ts (conflito com e4.2, em implementação)", "revisão manual: cada evento novo carrega o atraso e a escala em vigor no INSTANTE DA GRAVAÇÃO, não do export; dado exportado antes desta story não é lido como atraso 0 / escala 1.0 por omissão"]
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

**Não depende de `e4.2`** (que está sendo implementada agora), mas os dois trabalhos coexistem sobre o mesmo
diretório `src/`. `e4.2` é dona de `src/net/snapshot.ts`, `src/net/projecao.ts`, e das **únicas** alterações
permitidas em `src/tools/determinism.ts` e `src/client/render.ts` (AC 14 de `e4.2`) — inclusive um golden
hash e uma guarda de ida-e-volta que não podem se mover. Esta story não toca nenhum dos quatro arquivos (ver
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
   permitidas em `src/tools/determinism.ts` e `src/client/render.ts` — inclusive um golden hash e uma
   guarda de ida-e-volta próprios. Esta story **não toca nenhum dos quatro arquivos**, em nenhuma hipótese.
   `git diff --stat` desta story não deve conter nenhum deles.
4. **Cada evento novo grava o atraso e a escala em vigor no INSTANTE DA GRAVAÇÃO, não do export.** Como o
   `localStorage` acumula entre trocas de build (`e3.5` AC 4 / docblock de `CHAVE`,
   `client/telemetria.ts:20-25`), um único array pode conter eventos escritos sob código antigo (atraso 0)
   e código novo (atraso 6) — carimbar só no momento do `exportar()` (`client/telemetria.ts:137-144`)
   atribuiria o valor ATUAL a eventos que foram gravados sob um valor diferente. A gravação já carimba
   `partida` por evento (`registrar`, `client/telemetria.ts:131-136`); o carimbo novo segue o mesmo
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
     misturado, sob `v1`.
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
   `e4.1`, `INPUT_DELAY_TICKS` 0→6 efetivo no modo local), no mesmo formato da tabela/linha do tempo já
   existente no arquivo (seção "A linha do tempo intercala exatamente com os commits da bissecção de
   e3.6" é o precedente de formato a seguir, não a copiar literalmente — o evento aqui é outro).
10. **Escopo de arquivos.**

    | Permitido | Motivo |
    |---|---|
    | `src/client/telemetria.ts` | o coletor — campo(s) novos por evento, leitura de dado antigo tratada como "desconhecido" |
    | `src/client/main.ts` | **só a ligação**: repassar ao coletor o valor já lido de `ATRASO_ALVO_TICKS` (import já existe, `main.ts:8`) e de `ESCALA_HP` (import novo, de `chars/tuning.ts`) no ponto de gravação — nenhuma regra de jogo nova |
    | `src/tools/telemetria.ts` | o agregador — agrupamento por (atraso, escala), avisos de mistura e de dado desconhecido |
    | `docs/evidence/telemetria/README.md` | anotação da fronteira (AC 9) |

    **Proibido, sem exceção:** `src/sim/`, `src/match/`, `src/shop/`, `src/bot/`, `src/chars/` (além da
    leitura de `ESCALA_HP`, que não altera o arquivo), `src/net/` (além da leitura já existente de
    `ATRASO_ALVO_TICKS`, que não altera o arquivo), `src/client/render.ts`, `src/client/input.ts`,
    `src/tools/determinism.ts` (conflito com `e4.2`, ver AC 3), `src/net/snapshot.ts`,
    `src/net/projecao.ts` (não existem ainda nesta story; são de `e4.2`).

    **Nenhuma seta nova na tabela de camadas** (`architecture-e4.md` §2.2, linhas 280-287): `client/ →
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

- [ ] Task 1 — Decidir a forma do carimbo (AC: 4, 8)
  - [ ] Escolher: campo por evento, e/ou bump de `CHAVE`/`versao`; nome do(s) campo(s); se cobre
        `ESCALA_HP` nesta story ou fica para outra — registrar a decisão e a justificativa no Dev Agent
        Record
  - [ ] Se decidir que a forma deve ser fixada pelo @architect antes de implementar, registrar o handoff
        (mesmo padrão de `e4.1`/`e4.2`) e parar aqui até resposta

- [ ] Task 2 — `client/telemetria.ts` (AC: 4, 5, 7)
  - [ ] Adicionar o(s) campo(s) decidido(s) na gravação por evento (`registrar`)
  - [ ] Em `ler()`, tratar acúmulo anterior sem o campo como "desconhecido" na leitura — nunca reescrever
        com um valor assumido

- [ ] Task 3 — `client/main.ts`, ligação (AC: 4, 8, 10)
  - [ ] Repassar `ATRASO_ALVO_TICKS` (import já existe, `main.ts:8`) ao coletor no ponto de gravação
  - [ ] Se AC 8 estiver dentro do escopo: importar `ESCALA_HP` de `../chars/tuning.ts` e repassar do mesmo
        jeito — nenhuma regra de jogo nova, só ligação

- [ ] Task 4 — `tools/telemetria.ts`, agregador (AC: 6, 7)
  - [ ] Agrupar eventos por (atraso, escala) antes de calcular P3.1/P3.2/P3.3/RF-36
  - [ ] Se houver mais de um grupo conhecido: reportar cada um separadamente, ou recusar o número
        combinado e avisar qual é a mistura — nunca calcular um número único misturando os dois
  - [ ] Grupo "desconhecido" para dado sem o campo (AC 7), no mesmo padrão de aviso de `mag` ausente
        (`tools/telemetria.ts:154-158`)

- [ ] Task 5 — Documentação (AC: 9)
  - [ ] Anotar a fronteira `b8e8a41` / 2026-09-21 em `docs/evidence/telemetria/README.md`

- [ ] Task 6 — Verificação (AC: 1, 2, 3, 10)
  - [ ] `npm run check` — 0 erros
  - [ ] `npm run sim:check` antes e depois da mudança — `diff` da saída completa vazio
  - [ ] `git diff --stat` restrito ao escopo do AC 10 — confirmar ausência de `src/net/snapshot.ts`,
        `src/net/projecao.ts`, `src/client/render.ts`, `src/tools/determinism.ts`
  - [ ] Teste de aceitação do AC 5: fixture/export sintético com duas combinações (atraso, escala),
        confirmar que dá para particionar só com o conteúdo do arquivo
  - [ ] Teste de compatibilidade do AC 7: export sem os campos novos não quebra o agregador

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

A tabela de camadas (`architecture-e4.md` §2.2, linhas 280-287) permite `tools/ → sim/, chars/, bot/,
match/, shop/` — **não** `tools/ → net/`. `e4.2` (AC 11) já registrou que abrir `tools/ → net/` é uma seta
nova que "ninguém aprovou ainda" e a tratou como handoff ao `@architect`, não como fato consumado. Esta
story evita o problema por construção: o agregador só precisa **ler o campo já gravado no arquivo
exportado** — ele nunca precisa importar a constante-fonte, porque o valor histórico correto pode ser
diferente do valor atual da constante. Isso também é logicamente mais correto: um arquivo antigo gravado
sob `ATRASO_ALVO_TICKS = 6` continua correto mesmo que a constante mude no futuro.

[Fonte: `docs/architecture-e4.md:280-287`; `docs/stories/e4.2.snapshot-e-projecao.story.md`, AC 11]

### O desvio de camada pré-existente, e por que ele não cresce aqui

```
Ela é ANTERIOR a esta story (desvio já julgado no gate de e3.5) e não entrou neste commit e o sim:check
não a carrega.
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

### File List

_(a preencher pelo @dev)_

### Decisão de forma do carimbo (AC 4, 8)

_(a preencher pelo @dev — nome de campo(s), por evento ou bump de versão, se `ESCALA_HP` entrou nesta story
ou foi adiado, com justificativa)_

## QA Results

_(a preencher pelo @qa)_

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-09-21 | 1.0 | Story criada a partir do achado `E41-TEL-002` do gate `PENDING` de `e4.1` (`docs/qa/gates/e4.1-ativar-atraso-de-input.yml`, severidade medium), conforme roteamento do @po registrado no Change Log v1.4.0 de `docs/stories/e4.1.ativar-atraso-de-input.story.md`. Escopo: `client/telemetria.ts`, `client/main.ts` (ligação), `tools/telemetria.ts`, `docs/evidence/telemetria/README.md`. A forma exata do carimbo (nome de campo, por evento vs. bump de versão, cobertura de `ESCALA_HP`) é deixada como decisão do `@dev`/`@architect` (AC 4, 8), por não haver documento de arquitetura que a fixe hoje. Registrado o conflito de arquivo em andamento com `e4.2` (AC 3, 10): nenhum dos quatro arquivos que `e4.2` está implementando/restringindo é tocado. Não bloqueia o re-gate de `e4.1`; precede qualquer coleta humana usada como evidência de `debt.9` (pré-condição b) ou baseline de P4.4. Não decide a pergunta aberta de `debt.9` v1.1. | River (@sm) |
