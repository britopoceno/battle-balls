# Story debt.12: Guarda do fio dirigida por tabela, fronteira de piso não inteira e fixture congelada — achados `E48-TST-001`, `E48-TST-002`, `E48-ARC-003` (e, desde a v1.2, `E49-TST-001`/`002`/`003`)

## Status

Done

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run check", "npm run sim:check (golden hash idêntico ao baseline atual; diff da saída completa antes×depois SÓ COM INSERÇÃO)", "as 14 mutações do contrafactual (M4a, M4b, M4c, M12, M14, M15, M7, M9, over↔pad, pisoQ→q do AC 6, mais M-HZ-POS, M-HZ-INT, M-ASSENTO e M-SERVIDOR do AC 9), cada uma aplicada numa cópia descartável do commit desta story e revertida — todas devem fazer sim:check sair com código diferente de 0, e M-SERVIDOR com o texto 'sem a propriedade servidor' na linha ✗", "git show --stat <commit(s) desta story> — restrito a src/tools/determinism.ts; NUNCA a árvore de trabalho compartilhada, porque determinism.ts é disputado por outras stories da ordem (e4.9, e4.3, e4.6)", "conferência de FIO_CONGELADO só de acréscimo: git show do commit de mudança de protocolo (se houver) mostra só linha(s) ACRESCENTADAS ao array — qualquer linha removida ou alterada dentro dele é carimbo e reprova"]
```

## Story

**Como** desenvolvedor fechando os achados `E48-TST-001` (medium) e `E48-TST-002` (low) do gate de `e4.8`
(`docs/qa/gates/e4.8-codec-do-fio.yml`), mais a parte 2 do achado `E48-ARC-003` (fixture dourada do fio,
confirmada pelo @architect em `docs/architecture-e4.md` §11.6.1, Decisão 1),
**eu quero** que a guarda do parser em `src/tools/determinism.ts` passe a ser dirigida por tabela — cada
campo numérico e cada campo 0|1 do protocolo testado individualmente com os quatro valores adversariais do
gate, e o descarte de `tick`/`extra` verificado em todas as variantes de `DoCliente` e de `decisao.d`, não
só em `cast` —, que a varredura da fronteira de prontidão do codec inclua limiares de ult **não inteiros**,
e que o texto de um `{t:'snap'}` fixo (`AMOSTRA_DO_FIO`) fique congelado numa lista só de acréscimo
(`FIO_CONGELADO`),
**para que** uma regressão no parser de entrada, no piso de ponto flutuante da fronteira de prontidão, ou
uma mudança silenciosa no layout posicional do fio — a mesma classe de risco que a §11.6 já registrava como
aceita "até haver deploy", e que a medição M-1 da §11.6.1 mostrou passar despercebida com a amostra antiga —
passem a reprovar o `sim:check` automaticamente, em vez de depender de o `@qa` reconstruir o mesmo arnês
adversarial a cada gate. É o mesmo padrão de alcance insuficiente já registrado em `E42-TST-003` e em
`DEBT10-TST-001`/`DEBT11-TST-001` neste projeto: o mecanismo funciona, mas cobre a lista de casos do AC, não
os campos e a propriedade vizinhos.

## Depende de

`e4.8` (`910add8`, Done, gate `docs/qa/gates/e4.8-codec-do-fio.yml`, `438740b`, CONCERNS) — criou
`src/net/codec.ts` e a guarda do fio em `determinism.ts` (`guardaParser()`, `guardaCodec()`), e é dona do
achado `E48-TST-001` (medium) e `E48-TST-002` (low) que esta story fecha.

`docs/architecture-e4.md` §11.6.1 (commit `bed4603`, 2026-09-21) — **decisão vinculante do @architect** que
confirma a fixture congelada (Decisão 1) com os valores exatos de `AMOSTRA_DO_FIO`, a forma de
`FIO_CONGELADO`, os quatro itens que a guarda confere, e a ordem de `determinism.ts`:
**`e4.8` → `debt.11` → `e4.9` → `e4.3` → `debt.12` → `e4.6`**.

**Sequenciada, não dependente em conteúdo, de `e4.9` (Draft, em validação do @po em paralelo — não tocada
por esta story) e de `e4.3` (Ready).** `debt.12` começa **depois do commit de implementação de `e4.3`**, que
por sua vez começa depois de `e4.9`. Esta story não lê nem toca nenhum arquivo de `e4.9` ou de `e4.3` — a
dependência é só de sequência de `git status --short src/tools/determinism.ts` vazio, pelo mesmo motivo já
registrado em `debt.11` (AC 12) e `e4.8` (v1.1.0): a árvore é compartilhada por até quatro stories
concorrentes, e `git diff --stat` absorveria guardas de outra story em voo.

*(@po v1.1 — estado de `e4.9` no momento da validação: implementada no commit `6f2f56c` (Ready for
Review, `502d12b`). Ela entrega `export const VERSAO_DO_FIO = 1` em `src/net/protocolo.ts:65`, e por isso
`FIO_CONGELADO = [{ versao: 1, … }]` satisfaz o item 2 do AC 5 (`última.versao === VERSAO_DO_FIO` e
`length === VERSAO_DO_FIO`, 1 = 1) desde a primeira linha. `e4.9` mudou a forma do `{t:'sala'}`
(`versao`, `assento`, `snapshotHz`), mas não o `{t:'snap'}`. O texto de 287 B da §11.6.1, regenerado a
partir do `codificarDoServidor` de `6f2f56c`, é byte a byte igual, e o ponto fixo continua valendo. A
seção ENTRADA de `codec.ts` (`parseDoCliente` e seus auxiliares) e o tipo `DoCliente` não mudaram, só se
deslocaram uma linha. A pré-condição que continua valendo é o commit de implementação de `e4.3`.)*

*(@po v1.2 — gate de `e4.9`, `docs/qa/gates/e4.9-versao-do-fio-e-assento.yml` (`c4b22db`, CONCERNS, `e4.9`
Done):* os achados `E49-TST-001` (medium), `E49-TST-002` (low) e `E49-TST-003` (low) entram nesta story
como **AC 9**. O motivo é o mesmo que criou esta story: os três são reforço da guarda do `{t:'sala'}`
(linha `versão fio`, lista `formaRuim` e laço `descompassos` em `guardaCodec()`), que mora no mesmo bloco do
codec de `determinism.ts`, e `debt.12` é a próxima story a abrir esse bloco depois de `e4.3`. Os casos são
**só de teste**: o `conferirSala` de hoje (`src/net/codec.ts`, `6f2f56c`) já rejeita os quatro valores
novos. Com isso, esta story passa a editar linhas que `e4.9` criou dentro de `determinism.ts`, mas continua
sem abrir nenhum arquivo além dele. Nada muda na pré-condição de início nem na ordem.

**Não depende de conteúdo de `codec.ts`**: esta story só abre `src/tools/determinism.ts`. Se um caso novo
do AC 3 ou do AC 6 falhar contra o código de `codec.ts` de hoje, isso é **achado**, a story **para** e
**escala** ao @po/@architect — não corrige `codec.ts` por conta própria (ver AC 7).

**Roteamento do @po que criou esta story (citado, não resumido de memória, `e4.8` Change Log v1.4.0):**

> **E48-TST-001 (medium), E48-TST-002 (low) e a fixture do fio de E48-ARC-003 → story debt nova, sugestão
> `debt.12`, a criar pelo @sm.** Não foram para `debt.11`, que está em implementação e também edita
> `determinism.ts`. Também não foram para `e4.3`, que é a maior story da fase e foi cortada exatamente
> para não pôr a guarda do fio e a da sala sob um só gate. Uma story só abre o bloco do codec em
> `determinism.ts:1046-1194` uma vez para os três.

[Fonte: `docs/stories/e4.8.codec-do-fio.story.md`, Change Log v1.4.0, @po]

**A spec de forma final (citada, não resumida), do Change Log v1.5.0 de `e4.8`, que substitui os itens (c),
(d) e (g) da v1.4.0 acima — os itens (a), (b), (e) e (f) da v1.4.0 continuam valendo como estão lá e formam
os AC 3, 4, 2 e 6 abaixo:**

> **(a)** *E48-TST-001:* guarda do parser dirigida por tabela, com os casos que o gate lista. Para cada
> campo numérico (`cast.dx`, `cast.dy`, `cast.mag`, `pong.id`): `NaN`, `1e999` via `JSON.parse`,
> `-Infinity` e `"1"` dão `null`. Para cada campo 0/1 (`cast.ballIndex`, `d.jogador`, `d.slot`/
> `abilityIndex`/`passiveIndex` de `build` e `trocaDeBuild`, `compra.slot`): `2`, `0.5`, `"0"` e `true` dão
> `null`. Para cada uma das 4 variantes de `DoCliente` e das 6 de `decisao.d`: `{…válida, tick, extra}`
> volta sem `tick` e sem `extra`, num objeto novo (`!== raw`, e `.d !== raw.d` em `decisao`).
>
> **(b)** *E48-TST-002:* a varredura da fronteira ganha limiares não inteiros, múltiplos de 0,01, cujo
> produto por 100 cai abaixo do inteiro (110.07, 0.29, 87.04), com `ultCharge = thr` e `thr − 0,004`.
>
> **(c)** Fixture congelada do fio, CONFIRMADA pelo @architect (§11.6.1, Decisão 1). Congela o texto de
> **um** `{t:'snap'}`, produzido por `codificarDoServidor({ t: 'snap', s: AMOSTRA_DO_FIO, seq: 4 })`.
> **Não** usa o `snapshotSintetico`. [...] `AMOSTRA_DO_FIO` é uma função própria em `determinism.ts`, com
> os valores exatos do bloco `ts` da §11.6.1. [...] **Onde mora:** inline em `src/tools/determinism.ts`,
> no bloco do codec, ao lado da guarda que já existe. **Forma:** lista só de acréscimo,
> `FIO_CONGELADO: readonly { versao: number; snap: string }[]`, que nasce com
> `[{ versao: 1, snap: '<texto>' }]`. **A guarda, numa linha própria do `sim:check`, confere quatro
> coisas:** (1) `codificarDoServidor(...) === última.snap`; (2) `última.versao === VERSAO_DO_FIO`, e
> `FIO_CONGELADO.length === VERSAO_DO_FIO`; (3) ponto fixo, `codificarDoServidor(decodificarDoServidor(
> última.snap)) === última.snap`; (4) canário da propriedade discriminante.
>
> **(d)** Contrafactual: as mutações do gate M4a, M4b, M4c, M12, M14, M15 e M7, **mais M9** (`hp ↔
> ultCharge` nos dois lados), **`over ↔ pad`** nos dois lados e **`pisoQ → q`** no `ultCharge`. Cada uma,
> aplicada numa cópia descartável, faz o `sim:check` sair com rc=1, e o resultado é registrado no Dev
> Agent Record.
>
> **(g)** Sequência: começa depois do commit de implementação de `e4.3`, que já vem depois de `e4.9`. Por
> isso `VERSAO_DO_FIO` já existe quando `debt.12` começa, e os quatro itens da guarda entram desde a
> primeira linha. [...] A `debt.12` tem de ter commit de implementação antes da Task 1 de `e4.4`
> (pré-condição em `e4.4`, AC 1 e Task 0). O escopo continua só `src/tools/determinism.ts`.

[Fonte: `docs/stories/e4.8.codec-do-fio.story.md`, Change Log v1.5.0, @po]

**O texto exato da amostra e do valor congelado (citado da §11.6.1, fonte, não ajuste):**

```ts
{ time: 1234.567, over: false, winner: 1, arena: { w: 960, h: 540, pad: 17.254 },
  balls: [{ id: 7, x: 100.25, y: 200.5, facing: 0.75, hp: 432.126, alive: true, ultCharge: 55.559,
            abilityReadyAt: 1234.567 + 183.341, effects: [{ kind: 'slow' }, { kind: 'shield' }] }],
  projectiles: [{ id: 8, x: 10.5, y: 20.75, vx: 300.123, vy: -40.456, radius: 5.555, color: '#b98cff' }],
  zones: [{ id: 9, kind: 'wall', x: 30.25, y: 40.5, angle: 1.234, halfLen: 60.126, radius: 9.994,
            pull: 2.345, ownerColor: '#8a8' }],
  events: [{ t: 'hit', x: 1.5, y: 2.5, amount: 3.14159, targetId: 7, crit: true }] }
```

Texto que ela produz em `f8be842` (287 B), **conferência, não fonte** — `debt.12` gera a fixture a partir
do codec no próprio commit em que começa, e se o resultado divergir desta linha, o codec mudou sem mudança
de protocolo registrada, o que é achado, não ajuste:

```
{"t":"snap","seq":4,"s":[1234.57,0,1,960,540,17.25,[[7,100.25,200.5,0.75,432.13,1,55.55,183.35,["slow","shield"]]],[[8,10.5,20.75,300.12,-40.46,5.56,"#b98cff"]],[[9,"wall",30.25,40.5,1.234,60.13,9.99,2.35,"#8a8"]],[{"t":"hit","x":1.5,"y":2.5,"amount":3.14159,"targetId":7,"crit":true}]]}
```

[Fonte: `docs/architecture-e4.md` §11.6.1, "Decisão 1 — fixture congelada do fio", linhas 1251–1276]

## Acceptance Criteria

1. `npm run check` verde.
2. `npm run sim:check` verde, com **golden hash idêntico** ao baseline atual. O `diff` da saída completa
   do `sim:check` antes × depois desta story é **só inserção**: a linha `parser` do bloco `codec do fio`
   pode mudar de conteúdo (ela descreve a cobertura da guarda, não um valor de jogo), a linha `fronteira`
   ganha os novos limiares no texto, a linha `versão fio` muda só nos contadores e na lista de casos que
   descreve (de `6/6` para `10/10` em `formaRuim`, AC 9), com o veredito ✓ inalterado, e a fixture entra
   como linha(s) nova(s) de seção. Nenhuma linha do
   golden hash, do build coverage, do replay, nem de qualquer seção anterior ao bloco do codec muda de
   conteúdo ou troca de lugar.
3. **Guarda do parser dirigida por tabela (`E48-TST-001`).** `guardaParser()`
   (`src/tools/determinism.ts:981-1047` em `6f2f56c`; *as linhas deste AC são de `6f2f56c` e vão se mover
   de novo com `e4.3`, então a âncora é o nome da função e da lista*) deixa de ser uma lista fixa de casos
   e passa a testar, por campo:
   - **Campos numéricos** — `cast.dx`, `cast.dy`, `cast.mag`, `pong.id`: cada um, isoladamente, com `NaN`,
     `1e999` (via `JSON.parse`, como o valor chega do socket; o literal `1e999` no código-fonte já é
     `Infinity` antes de chegar ao parser), `-Infinity` e `"1"`. Os quatro têm de dar `null`. Hoje a
     lista `nulos` cobre só combinações soltas: `dx` com `NaN`, `1e999` e `"1"`, `mag` com `-Infinity`,
     e `pong.id` com `Infinity` e ausente (linhas 992-995 e 1007). **`dy` nunca aparece**, e é o gap
     citado no achado (M12).
   - **Campos 0|1** — `cast.ballIndex`, `d.jogador`, `d.slot`/`abilityIndex`/`passiveIndex` de `build` e de
     `trocaDeBuild`, `compra.slot`: cada um, isoladamente, com `2`, `0.5`, `"0"` e `true`. Os quatro têm
     de dar `null`. Hoje só `ballIndex` (linhas 997-998, com `2` e `0.5`) e `d.jogador` (linha 999, com
     `2`) são testados; a faixa
     de `abilityIndex`/`passiveIndex` de build/trocaDeBuild e de `slot` de compra não é — os gaps exatos
     de `M14` e `M15` no gate.
   - **Descarte de `tick`/`extra`** — hoje só provado para `cast` (linhas 1016-1022, o caso `comExtra`).
     Passa a valer para as 4 variantes de `DoCliente` (`entrar`, `decisao`, `cast`, `pong`) e para as 6 de
     `decisao.d` (`draft`, `build`, `buildPadrao`, `compra`, `trocaDeBuild`, `pronto`): cada uma recebe
     `{ …válida, tick: 5, extra: 1 }` (e, em `decisao`, também `{ …válida, d: { …d válido, tick, extra } }`)
     e o resultado parseado não contém `tick` nem `extra`, é um objeto novo (`!== raw`), e em `decisao`
     também `.d !== raw.d`. São os gaps exatos de `M4a` (`pronto`/`buildPadrao`), `M4b` (`entrar`) e `M4c`
     (`pong`) no gate. *(@po v1.1: `entrar` entra **duas vezes**, sem `assento` e com `assento: 'segredo'`,
     porque `parseDoCliente` tem dois `return` distintos nessa variante (`src/net/codec.ts`, `case
     'entrar'`), e uma mutação num deles não aparece no outro. `assento` é o campo do achado M-4 da
     §11.6.1, que `e4.9` pôs no `{t:'sala'}` e que volta em `{t:'entrar', assento}`.)*
   - A lista de casos "→ `null`" que já existe (`nulos`, linhas 985-1009) e os de "→ parse OK" (`validos`,
     linhas 1028-1040) continuam — a tabela **complementa**, não substitui, o que já prova o AC 4 de
     `e4.8`.
   - *(@po v1.1 — conferência dos campos contra a fonte:* as listas deste AC batem com a seção ENTRADA de
     `src/net/codec.ts` em `6f2f56c`. Passam por `finito()` exatamente `cast.dx`, `cast.dy`, `cast.mag` e
     `pong.id`. Passam por `bit()` exatamente `cast.ballIndex`, `d.jogador` (antes do `switch`, nas 6
     variantes), `slot`/`abilityIndex`/`passiveIndex` de `build`/`trocaDeBuild` e `compra.slot`. Batem
     também com `DoCliente` (`net/protocolo.ts`) e `Decisao` (`match/types.ts:148-154`). Os campos string
     (`entrar.sala`, `entrar.assento`, `draft.charId`, `compra.itemId`, `cast.slot`) ficam fora da tabela
     de propósito, porque o achado não os cita. `nulos` já tem caso para `sala`, `assento`, `itemId` e
     `cast.slot`. `draft.charId` não tem nenhum, e isso fica registrado como fora do escopo, sem ser
     exigido aqui. `e4.9` não mudou `parseDoCliente` nem `DoCliente`.)*
   [Fonte: `docs/qa/gates/e4.8-codec-do-fio.yml`, achado `E48-TST-001`; `docs/stories/e4.8.codec-do-fio.story.md`,
   Change Log v1.4.0 item (a) e v1.5.0]
4. **Fronteira do piso de FP com limiares não inteiros (`E48-TST-002`).** A varredura de `guardaCodec()`
   (`src/tools/determinism.ts:1093-1125` em `6f2f56c`), que hoje só usa os limiares do roster (110 e 130,
   inteiros), ganha limiares sintéticos **não inteiros, múltiplos de 0,01**: **110.07, 0.29, 87.04**, a
   lista que o gate sugere. Para cada um, `ultCharge = thr` e `ultCharge = thr − 0,004` (o mesmo par que a
   varredura já usa para os limiares do roster). Esses limiares sintéticos **não** substituem os do
   roster; entram como casos adicionais da mesma varredura.

   *(@po v1.1 — correção factual, medida no Node 24.13.1.)* A v1.0 dizia que os três têm "produto por 100
   abaixo do inteiro" e que "`pisoQ(110.07)` dá `110.06` sem a correção". O gate, a decisão 4 do @dev em
   `e4.8` e o roteamento do @po diziam o mesmo, mas **só vale para 0.29**:
   - `0.29 * 100 === 28.999999999999996`, e o piso ingênuo dá `0.28`;
   - `110.07 * 100 === 11007` e `87.04 * 100 === 8704`, exatos, e o piso ingênuo acerta os dois.

   Com a mutação `M7` (sem a correção para cima do `pisoQ`) aplicada numa cópia de `6f2f56c`, a
   varredura dá 0 viradas em 110, 130, 110.07 e 87.04, e **4 viradas em 0.29**. É **0.29 que carrega
   `M7`**. Os outros dois ficam, porque não custam nada e são o que o gate pediu, mas não sustentam o
   contrafactual. Por isso a guarda ganha um **canário**, na mesma lógica do item 4 do AC 5 e do
   "contrafactual ingênuo NÃO falhou" que já existe: pelo menos um limiar sintético tem
   `thr * 100 < Math.round(thr * 100)`, e se nenhum tiver, é problema no `sim:check` ("os limiares
   sintéticos perderam poder discriminante"). Sem o canário, trocar 0.29 por outro valor "bonito"
   deixaria `M7` passar verde em silêncio.
   [Fonte: `docs/qa/gates/e4.8-codec-do-fio.yml`, achado `E48-TST-002`; `docs/stories/e4.8.codec-do-fio.story.md`,
   Change Log v1.4.0 item (b)]
5. **Fixture congelada do fio (`E48-ARC-003`, parte 2 — Decisão 1 da §11.6.1).**
   - **`AMOSTRA_DO_FIO`**, uma função própria em `src/tools/determinism.ts`, devolve exatamente o
     `Snapshot` citado em "Depende de" acima, com os valores exatos do bloco `ts` da §11.6.1 — não o
     `snapshotSintetico` já existente (linha 1056 em `6f2f56c`), que tem três colisões de valor entre posições
     escalares da mesma tupla (`over`/`arena.pad`, `id`/`alive`, `y`/restante da habilidade) e por isso
     deixa passar despercebidas trocas com a forma de `M9` (medição M-1 da §11.6.1). A amostra nova
     garante que nenhuma posição escalar repete valor dentro da mesma tupla, e que todo campo quantizado
     está fora da grade de 0,01, com o valor separando explicitamente uma regra de quantização da outra
     (`pisoQ(ultCharge) ≠ q(ultCharge)`, `tetoQ(restante) ≠ q(restante)`).
   - **`FIO_CONGELADO: readonly { versao: number; snap: string }[]`**, uma lista **só de acréscimo**, que
     nasce com `[{ versao: 1, snap: '<texto de 287 B citado acima>' }]`. Mora inline em
     `src/tools/determinism.ts`, no bloco do codec (ao lado de `guardaCodec()`), no mesmo padrão do
     `BASELINE` do golden hash (linha 123 em `6f2f56c`) — um array congelado, comentado, dentro do próprio
     arquivo, não um JSON à parte em `docs/`.
   - **A guarda confere, numa linha própria do `sim:check`, dentro do bloco `codec do fio`** *(@po v1.1:
     com rótulo distinto do `versão fio` que `e4.9` já pôs nesse bloco, por exemplo `fio congelado`. São
     duas guardas diferentes: a de `e4.9` confere o decodificador do `{t:'sala'}`, e esta confere o texto
     do `{t:'snap'}`)*:
     1. `codificarDoServidor({ t: 'snap', s: AMOSTRA_DO_FIO(), seq: 4 }) === última.snap`. Se falhar, a
        mensagem de problema aponta a **primeira posição divergente** da tupla, com o caminho (ex.:
        `s[6][0][4]`), o valor congelado e o atual, e o texto: "se foi de propósito, incremente
        `VERSAO_DO_FIO` em `net/protocolo.ts` e ACRESCENTE uma entrada; nunca edite uma existente
        (§11.6.1)".
     2. `última.versao === VERSAO_DO_FIO` (importado de `net/protocolo.ts`, seta `tools/ → net/` já
        declarada desde `e4.2`/§2.2), e `FIO_CONGELADO.length === VERSAO_DO_FIO`, com as versões
        consecutivas a partir de 1.
     3. Ponto fixo: `codificarDoServidor(decodificarDoServidor(última.snap)) === última.snap`.
     4. Canário da propriedade discriminante: no texto congelado, nenhuma posição escalar de uma mesma
        tupla repete valor, e `AMOSTRA_DO_FIO()` mantém `pisoQ(ultCharge) ≠ q(ultCharge)` e
        `tetoQ(restante) ≠ q(restante)`.
   - **Nota de contingência (não se aplica nesta ordem, registrar mesmo assim no Dev Notes):** a §11.6.1
     prevê que, se `debt.12` viesse antes de `VERSAO_DO_FIO` existir, a fixture nasceria com `versao: 1`
     literal e só com os itens 1, 3 e 4 (sem o item 2). Pela ordem vigente (`e4.8` → `debt.11` → `e4.9` →
     `e4.3` → `debt.12` → `e4.6`), `VERSAO_DO_FIO` já existe quando esta story começa (é entregue por
     `e4.9`), então esse caso **não se aplica** — mas se a Task 0 (AC 8) encontrar `VERSAO_DO_FIO`
     ausente, é sinal de que a ordem foi quebrada, e a story deve parar e escalar ao @po, não implementar
     o caso de contingência sozinha.
   [Fonte: `docs/architecture-e4.md` §11.6.1, "Decisão 1"; `docs/stories/e4.8.codec-do-fio.story.md`,
   Change Log v1.5.0, item (c)]
6. **Contrafactual — as 10 mutações fazem `sim:check` sair com código diferente de 0.** Cada uma aplicada
   numa cópia descartável (worktree ou diretório temporário do commit desta story), rodada e revertida,
   com o resultado registrado no Dev Agent Record:
   - **M4a** — `decisao.d` `'pronto'`/`'buildPadrao'` devolvendo `{ ...raw, t, jogador }` (extra/tick
     vazam);
   - **M4b** — `entrar` devolvendo `{ ...raw, t, sala }`;
   - **M4c** — `pong` devolvendo `raw`;
   - **M12** — `dy` verificado só com `typeof`, sem `isFinite`;
   - **M14** — `abilityIndex` de `build`/`trocaDeBuild` sem checagem de faixa;
   - **M15** — `slot` de `compra` sem checagem de faixa;
   - **M7** — `pisoQ` sem a correção de ponto flutuante para cima, a que evita "ult cheia um passo
     abaixo". O caso que a pega é `0.29 * 100 = 28.999…`, e não `110.07`, que é exato (ver AC 4, v1.1);
   - **M9** — `hp ↔ ultCharge` trocados nos **dois** lados (codificador e decodificador) — mudança de
     layout consistente, a mesma classe de risco da §11.6;
   - **`over ↔ pad`** — troca de posição entre `over` e `arena.pad` nos dois lados, a mesma troca que a
     medição M-1 mostrou passar despercebida com a amostra antiga (`snapshotSintetico`);
   - **`pisoQ → q`** — trocar a função de quantização do `ultCharge` de `pisoQ` (piso) para `q`
     (arredondamento simples), que muda o texto codificado da amostra congelada.

   As 10 têm de sair com código diferente de 0. Uma mutação que não reprove com a amostra nova é achado,
   não ajuste silencioso da amostra. *(@po v1.2: o AC 9 acrescenta mais 4 mutações, M-HZ-POS, M-HZ-INT,
   M-ASSENTO e M-SERVIDOR, com o mesmo procedimento. O total do contrafactual desta story passa a 14.)*
   [Fonte: `docs/qa/gates/e4.8-codec-do-fio.yml`, "Mutações próprias"; `docs/stories/e4.8.codec-do-fio.story.md`,
   Change Log v1.5.0, item (d)]
7. **Escopo de arquivos, fechado.** Esta story abre **só** `src/tools/determinism.ts`. `src/net/codec.ts`
   é **proibido**, sem exceção: se, ao escrever um caso novo do AC 3, do AC 4 ou do AC 6, o `@dev`
   encontrar um comportamento do código de hoje que **não** corresponde ao que o caso exige (por exemplo,
   um campo do parser que hoje realmente deixa `tick`/`extra` vazarem, ou uma mutação do AC 6 que já passa
   verde sem ser aplicada), a story **para** nesse ponto, registra o achado no Dev Agent Record com
   detalhe suficiente para reproduzir, e escala ao @po/@architect — **não** corrige `codec.ts` para fazer
   o caso passar. Um caso novo que falha contra o código de hoje é achado, não desvio de escopo. Proibido
   também, sem exceção: `package.json` (nenhum script novo — a guarda roda dentro do `sim:check`
   existente), `src/net/protocolo.ts`, `src/net/sala.ts`, `src/net/snapshot.ts`, `src/net/projecao.ts`,
   `src/sim/`, `src/match/`, `src/shop/`, `src/bot/`, `src/chars/`, `src/client/`, e qualquer outro arquivo
   de `src/tools/` além de `determinism.ts`, e `docs/` (exceto a própria story).
   *(@po v1.3: dentro de `determinism.ts`, o bloco `sala pura` de `e4.3` (de `// ... sala pura (e4.3, AC 11
   e 16)` até `guardaSala()`) também fica fora. Os achados E43-TST-001/002/003 do gate de `e4.3` vão para
   uma story própria, sugestão `debt.14`, que vem depois desta. Esta story não os absorve.)*
8. **Sequenciamento.** `src/tools/determinism.ts` é disputado por `e4.9` (implementada em `6f2f56c`,
   Ready for Review no momento desta validação), `e4.3` (Ready) e `e4.6` (Ready), além desta story. A ordem, decidida pelo @architect na §11.6.1 e registrada por `e4.8`
   v1.5.0, é **`e4.8` → `debt.11` → `e4.9` → `e4.3` → `debt.12` → `e4.6`**.
   *(@po v1.3: ordem vigente, `e4.8` → `debt.11` → `e4.9` → `e4.3` → `debt.12` → `debt.14` → `e4.6`.
   `debt.14` entra depois desta, e nada muda na pré-condição de início nem no prazo desta story. `e4.3`
   está Done, e o commit de implementação dela é `99f4ee3`.)*
   - **Pré-condição de início:** o commit de implementação de `e4.3` existe, e
     `git status --short src/tools/determinism.ts` sai vazio.
   - A Task 0 registra no Dev Agent Record o hash de `e4.3` usado como base, e confirma que
     `VERSAO_DO_FIO` já existe em `net/protocolo.ts` (entregue por `e4.9`, que vem antes de `e4.3` nesta
     ordem) — se não existir, ver a nota de contingência do AC 5.
   - O escopo é conferido por `git show --stat <commit(s) desta story>`, **nunca** pela árvore de trabalho
     compartilhada, porque `e4.6` (que vem depois nesta ordem) pode já ter começado a preparar mudanças
     locais.
   - Esta story tem de ter commit de implementação **antes da Task 1 de `e4.4`** — a pré-condição já está
     registrada em `e4.4` v1.5.0 (AC 1, Task 0), `e4.3` v1.5.0 e `e4.6` v1.2.0. Não é responsabilidade
     desta story editar essas três; a pré-condição já existe nelas.
   [Fonte: `docs/architecture-e4.md` §11.6.1, "Decisão 1", bullet "Ordem de `determinism.ts`"; `docs/stories/e4.8.codec-do-fio.story.md`,
   Change Log v1.5.0, item (g)]
9. **Guarda do `{t:'sala'}` por termo, não só por caso (`E49-TST-001`, `E49-TST-002`, `E49-TST-003`,
   @po v1.2).** A guarda de `e4.9` em `guardaCodec()` (lista `formaRuim` e laço `descompassos`, linha
   `versão fio` do bloco `codec do fio`; em `c4b22db` estão em `determinism.ts:1197-1242` e `:1258`, mas
   `e4.3` vai movê-las, então a âncora é o nome da lista) cobre os casos mínimos do AC 10 de `e4.9`
   (ausente, 0, 7, `"30"`; ausente, `''`), e não os termos dos predicados do AC 7 (b) e (c) de `e4.9`.
   - **(a) `E49-TST-001`, snapshotHz.** Acrescentar à lista `formaRuim`, cada um como a amostra válida
     com só esse campo alterado (o `salaCom` que já existe): `snapshotHz: -30`, `snapshotHz: 7.5` e
     `snapshotHz: 120`. Cada valor isola **um** termo de `typeof hz === 'number' && Number.isInteger(hz)
     && hz > 0 && 60 % hz === 0`: -30 é inteiro e divide 60, e só `hz > 0` o recusa; 7.5 é positivo e
     divide 60 (`60 % 7.5 === 0`), e só `Number.isInteger` o recusa; 120 é inteiro positivo, e só o
     divisor o recusa.
   - **(b) `E49-TST-002`, assento.** Acrescentar à mesma lista `assento: 123`, que só o termo
     `typeof assento !== 'string'` recusa.
   - Com (a) e (b), `formaRuim` vai de 6 para **10** casos, e o contador da linha `versão fio` de `6/6`
     para `10/10`. Os 6 casos existentes ficam. Os 4 novos, como os antigos, têm de lançar erro que **não**
     é `DescompassoDeVersao` (o laço existente já confere isso).
   - **(c) `E49-TST-003`, diagnóstico.** No laço `descompassos`, quando `!('servidor' in e)`, a linha ✗
     diz `DescompassoDeVersao sem a propriedade servidor`, e não o par "servidor undefined (esperado
     undefined)", que hoje sai igual quando só o `in` falha. Os outros dois ramos (valor de `servidor` e
     `cliente`) continuam com a mensagem de hoje. É mudança só de texto de diagnóstico: o que conta como
     ok não muda, e a linha `versão fio` segue `4/4`.
   - **(d) Contrafactual.** Cada mutação é aplicada ao `src/net/codec.ts` de uma cópia descartável do
     commit desta story, como no AC 6 (nunca na árvore compartilhada, AC 7), roda o `sim:check` e é
     revertida. As quatro têm de sair com código diferente de
     0, com o resultado no Dev Agent Record:
     - **M-HZ-POS** (`Q3` do gate): tirar `hz > 0` de `conferirSala`. Reprova pelo caso -30.
     - **M-HZ-INT** (`Q2`): tirar `Number.isInteger(hz)`. Reprova pelo caso 7.5.
     - **M-ASSENTO** (`Q5`): trocar a checagem de assento por `assento === undefined || assento === ''`.
       Reprova pelo caso 123.
     - **M-SERVIDOR** (`Q6b`): tirar a declaração `readonly servidor: unknown` do corpo de
       `DescompassoDeVersao` e atribuir `this.servidor` só quando `servidor !== undefined`. Tem de sair
       com código diferente de 0 **e** a saída tem de conter `sem a propriedade servidor` (casos "versao
       ausente" e "forma de hoje").
   - **Mutante equivalente, não exigido:** tirar `typeof hz === 'number' &&`. `Number.isInteger` já recusa
     todo não número (`"30"` continua recusado), então nenhum caso pode separar os dois programas.
     Registrar no Dev Agent Record como equivalente, não como lacuna.
   - **Fato conferido pelo @po em `c4b22db`** (cópia descartável via `git archive`, Node 24.13.1): o
     `decodificarDoServidor` de hoje lança `Error` (não `DescompassoDeVersao`) para -30, 7.5, 120 e
     `assento: 123`, e aceita 20. Com os 4 casos na lista, o `sim:check` sai rc=0 com `10/10`. M-HZ-POS,
     M-HZ-INT e M-ASSENTO saíram rc=1 (`9/10`, cada uma pelo caso previsto). Com o ramo (c), M-SERVIDOR saiu
     rc=1 com as duas linhas "sem a propriedade servidor". Tirar o `typeof` saiu rc=0 (equivalente). Se um
     caso novo falhar contra o código de hoje quando o @dev chegar aqui, vale o AC 7: parar e escalar, sem
     tocar `codec.ts`.
   - O escopo continua o do AC 7: só `src/tools/determinism.ts`.
   [Fonte: `docs/qa/gates/e4.9-versao-do-fio-e-assento.yml`, achados `E49-TST-001`, `E49-TST-002`,
   `E49-TST-003` e "Mutações próprias"; `src/net/codec.ts` `conferirSala` em `6f2f56c`]

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type**: Architecture / Testing (guarda de regressão dirigida por tabela e fixture congelada de
formato de fio, sem regra de jogo nova)
**Secondary Type(s)**: Integration (o fio cliente-servidor é o contrato que a fixture protege)
**Complexity**: Medium — um único arquivo (`src/tools/determinism.ts`), mas com uma tabela de casos
adversariais detalhada (campo por campo), uma fixture com texto byte-exato ditado pelo @architect, e
coordenação de sequência com até três stories concorrentes em `determinism.ts`.

### Specialized Agent Assignment

**Primary Agents**:
- @dev
- @qa (quality gate — confere que as 10 mutações do AC 6 e as 4 do AC 9 de fato reprovam o `sim:check`, que o texto
  congelado bate byte a byte com o da §11.6.1, que `FIO_CONGELADO` só ganha linhas em diff (nunca edita
  uma existente), e que a guarda do parser cobre cada campo listado no AC 3, não só a lista de casos que
  já existia)

**Supporting Agents**:
- @architect (dono da decisão de forma da fixture em `architecture-e4.md` §11.6.1; consultar só se um dos
  quatro itens da guarda ou os valores de `AMOSTRA_DO_FIO` se mostrarem inaplicáveis na implementação — não
  para decidir de novo o que já foi decidido)
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
- As 10 mutações do contrafactual (M4a, M4b, M4c, M12, M14, M15, M7, M9, `over↔pad`, `pisoQ→q`) de fato
  fazem `sim:check` sair com código diferente de 0 (AC 6)
- O texto de `AMOSTRA_DO_FIO` codificado bate byte a byte com o citado na §11.6.1, e `FIO_CONGELADO` é
  tratado como lista só de acréscimo — nenhuma entrada existente é editada (AC 5)
- A guarda do parser testa cada campo numérico e cada campo 0|1 isoladamente, não só a lista de casos que
  já existia (AC 3)
- `src/net/codec.ts` não foi tocado; qualquer caso que falhasse contra o código de hoje foi registrado
  como achado, não corrigido por dentro da story (AC 7)

- A lista `formaRuim` da guarda do `{t:'sala'}` tem -30, 7.5, 120 e `assento: 123`, cada um prendendo um
  termo do predicado, e M-HZ-POS, M-HZ-INT, M-ASSENTO e M-SERVIDOR reprovam (AC 9)

**Secondary Focus**:
- O `diff` do `sim:check` antes × depois não remove nem move nenhuma linha fora das seções do AC 2 (AC 2)
- A mensagem do laço `descompassos` separa "sem a propriedade servidor" do par de valores (AC 9 c)
- A fronteira do piso de FP cobre os três limiares não inteiros exigidos, e o canário exige pelo menos um
  com produto por 100 abaixo do inteiro, hoje só 0.29 (AC 4)

## Tasks / Subtasks

- [x] Task 0 — Pré-condição de sequência (AC: 8)
  - [x] Confirmar que o commit de implementação de `e4.3` existe; registrar o hash usado como base no Dev
        Agent Record
  - [x] Confirmar que `git status --short src/tools/determinism.ts` sai vazio
  - [x] Confirmar que `VERSAO_DO_FIO` já existe em `src/net/protocolo.ts` (entregue por `e4.9`); se não
        existir, parar e escalar ao @po antes de prosseguir

- [x] Task 1 — Guarda do parser por tabela (AC: 3)
  - [x] Reescrever/estender `guardaParser()` (`determinism.ts:978-1044`) com uma tabela de (campo, tipo)
        para os 4 campos numéricos (`cast.dx`, `cast.dy`, `cast.mag`, `pong.id`), cada um testado com
        `NaN`, `1e999` via `JSON.parse`, `-Infinity` e `"1"`
  - [x] Acrescentar a tabela dos 6 campos 0|1 (`cast.ballIndex`, `d.jogador`, `d.slot`/`abilityIndex`/
        `passiveIndex` de `build` e `trocaDeBuild`, `compra.slot`), cada um testado com `2`, `0.5`, `"0"`
        e `true`
  - [x] Estender o descarte de `tick`/`extra` (hoje só em `cast`) às 4 variantes de `DoCliente` e às 6 de
        `decisao.d`, conferindo objeto novo (`!== raw`, `.d !== raw.d` em `decisao`)
  - [x] Preservar os casos "→ `null`" e "→ parse OK" já existentes

- [x] Task 2 — Fronteira do piso de FP (AC: 4)
  - [x] Acrescentar os limiares sintéticos 110.07, 0.29 e 87.04 à varredura de `guardaCodec()`
        (`determinism.ts:1093-1125` em `6f2f56c`), cada um com `ultCharge = thr` e `thr − 0,004`
  - [x] Canário: pelo menos um limiar sintético com `thr * 100 < Math.round(thr * 100)` (hoje só 0.29),
        senão problema no `sim:check` (AC 4, v1.1)

- [x] Task 3 — Fixture congelada do fio (AC: 5)
  - [x] Criar `AMOSTRA_DO_FIO()` com os valores exatos citados na §11.6.1
  - [x] Criar `FIO_CONGELADO: readonly { versao: number; snap: string }[]`, iniciando com
        `[{ versao: 1, snap: <texto gerado pelo codec no commit desta story> }]`
  - [x] Implementar os 4 checks da guarda (igualdade com `última.snap`, `versao === VERSAO_DO_FIO` +
        `length === VERSAO_DO_FIO`, ponto fixo do decodificador, canário de não-colisão)
  - [x] Acrescentar a linha de seção própria no `sim:check`, no ponto fixo depois das linhas do bloco
        `codec do fio` já existentes

- [x] Task 4 — Contrafactual, as 10 mutações (AC: 6)
  - [x] M4a, M4b, M4c, M12, M14, M15, M7 — aplicar, rodar `sim:check`, confirmar código != 0, reverter
  - [x] M9 (`hp ↔ ultCharge` nos dois lados) — aplicar, rodar, confirmar código != 0, reverter
  - [x] `over ↔ pad` nos dois lados — aplicar, rodar, confirmar código != 0, reverter
  - [x] `pisoQ → q` no `ultCharge` — aplicar, rodar, confirmar código != 0, reverter

- [x] Task 6 — Guarda do `{t:'sala'}` por termo (AC: 9)
  - [x] Acrescentar à lista `formaRuim`: `snapshotHz` -30, 7.5 e 120, e `assento: 123` (6 → 10 casos)
  - [x] No laço `descompassos`, ramo próprio para `!('servidor' in e)` com "sem a propriedade servidor"
  - [x] Mutações M-HZ-POS, M-HZ-INT, M-ASSENTO e M-SERVIDOR numa cópia descartável, cada uma com código
        != 0 (M-SERVIDOR também com o texto novo na saída); registrar o `typeof` como mutante equivalente

- [x] Task 5 — Verificação (AC: 1, 2, 7, 8, 9)
  - [x] `npm run check` — 0 erros
  - [x] `npm run sim:check` antes e depois da mudança — golden hash idêntico, `diff` só com inserção
  - [x] `git show --stat` do(s) commit(s) desta story, restrito a `src/tools/determinism.ts`

## Dev Notes

### O bloco do codec hoje, e onde cada AC entra (fonte: `src/tools/determinism.ts`)

```
970  // parser de entrada (e4.8, AC 4) — parseDoCliente
978  function guardaParser(): { linha; problemas }        <- AC 3 estende esta função
1047 // codec de saída (e4.8, AC 5) — fronteira, roster, fio
1053 function snapshotSintetico(...)                       <- NÃO usar para a fixture (AC 5)
1078 function guardaCodec(a): { linhas; problemas }        <- AC 4 estende a varredura da fronteira (linhas 1090-1122)
1210 const { linha: linhaParser, ... } = guardaParser()
1211 const { linhas: linhasCodecSaida, ... } = guardaCodec(achadosCodec)
1213 const linhasCodec = [ ... ]                            <- AC 5 acrescenta linha(s) de seção aqui
```

[Fonte: `src/tools/determinism.ts:970-1217`]

### O texto atual do parser — os gaps exatos que o AC 3 fecha

```ts
// linha 980
const cast = { t: 'cast', ballIndex: 0, slot: 'ability', dx: 0.6, dy: -0.8, mag: 0.5 }
// linhas 989-992 — só dx é testado
['dx NaN', { ...cast, dx: NaN }],
['dx de JSON.parse 1e999', JSON.parse('{"t":"cast",...,"dx":1e999,...}')],
['mag -Infinity', { ...cast, mag: -Infinity }],
['dx "1"', { ...cast, dx: '1' }],
// linhas 994-996 — só ballIndex e d.jogador
['ballIndex 2', { ...cast, ballIndex: 2 }],
['ballIndex 0.5', { ...cast, ballIndex: 0.5 }],
['d.jogador 2', { t: 'decisao', d: { t: 'pronto', jogador: 2 } }],
```

`dy` nunca aparece na lista `nulos`; `abilityIndex`/`passiveIndex` de `build`/`trocaDeBuild` e `slot` de
`compra` também não. O descarte de `tick`/`extra` (linhas 1013-1019) só é provado para `cast`.

[Fonte: `src/tools/determinism.ts:978-1023`]

### A varredura da fronteira hoje — onde entram os limiares não inteiros (AC 4)

```ts
// linha 1084
const limiares = Object.values(CHARS).map((c) => ({ id: c.id, thr: c.ult.threshold }))
// linha 1096-1099
for (const time of tempos) {
  for (const { thr } of limiares) {
    for (const restante of [0.004, 0, -0.004]) {
      for (const ultCharge of [thr - 0.004, thr]) {
```

Os `limiares` vêm hoje só do roster (110 e 130). O AC 4 pede limiares sintéticos adicionais — não trocar os
do roster, acrescentar 110.07, 0.29 e 87.04 à mesma varredura ou a uma paralela que reusa o mesmo laço.

[Fonte: `src/tools/determinism.ts:1084-1122`]

### O padrão de array congelado a seguir para `FIO_CONGELADO` (fonte: `BASELINE`)

```ts
// linha 120
const BASELINE: { seed: number; hash: string; ticks: number; winner: number }[] = [ ... ]
```

`FIO_CONGELADO` segue a mesma forma — array de literais dentro do próprio `determinism.ts`, comentado,
nunca um arquivo em `docs/`. A diferença é que `BASELINE` é substituído inteiro numa re-baseline
autorizada (ver comentário da linha 104), e `FIO_CONGELADO` é **só de acréscimo**: nenhuma entrada
existente é editada, nunca.

[Fonte: `src/tools/determinism.ts:104-120`]

### O comentário desatualizado que NÃO é escopo desta story

`src/tools/telemetria.ts:57-58` tem um comentário que diz "`tools/ → net/` não existe na tabela de camadas
(`architecture-e4.md` §2.2)" — falso desde `e4.2`. A correção desse comentário é escopo de `debt.13`
(AC 8 dela), não desta story. Esta story não toca `tools/telemetria.ts`.

[Fonte: `docs/stories/debt.11.guarda-automatica-telemetria.story.md`, Change Log v1.5]

### O que esta story explicitamente NÃO faz

- Não corrige nem toca `src/net/codec.ts`. Um caso adversarial novo que falhe contra o código de hoje é
  achado, e a story para (AC 7).
- Não decide a versão do formato do `{t:'sala'}` nem o campo `assento`/`snapshotHz` — isso é `e4.9`
  (Draft, em validação em paralelo; não tocada por esta story).
- Não implementa a máquina de estados da sala nem toca `src/net/sala.ts` — isso é `e4.3`.
- Não altera `BASELINE`, `BUILD_BASELINE` nem qualquer valor do golden hash existente.

### Testing

- `npm run check` — 0 erros.
- `npm run sim:check` — rodado antes e depois da mudança; golden hash idêntico; `diff` da saída completa
  só com linhas inseridas ou com o conteúdo da linha `parser`/`fronteira` mudando de texto (não de
  resultado ✓/✗) dentro do bloco `codec do fio`.
- As 14 mutações do contrafactual (M4a, M4b, M4c, M12, M14, M15, M7, M9, `over↔pad`, `pisoQ→q` do AC 6,
  e M-HZ-POS, M-HZ-INT, M-ASSENTO, M-SERVIDOR do AC 9), cada uma aplicada numa cópia descartável, testada
  e revertida — todas devem fazer `sim:check` sair com código diferente de 0.
- A linha `versão fio` mostra `10/10` em `formaRuim` e `4/4` em `descompassos` (AC 9), sem outra mudança
  de texto além da lista de casos que ela descreve.
- Conferência de que `FIO_CONGELADO` é só de acréscimo: no commit desta story, a entrada `{versao:1,...}`
  é criada, não editada (é a primeira entrada).

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (1M context), como Dex (@dev), modo YOLO.

### Task 0: pré-condição (AC 8)

- Commit de implementação de `e4.3`: `99f4ee3`. `git status --short src/tools/determinism.ts` estava vazio no início.
- O pai do commit de implementação desta story é `29d7b51` (docs do @sm, `debt.14`). Antes dele vieram `188998e`
  (@architect) e `c10f287` (@po), também só de docs. `git diff --stat 99f4ee3 5766137^ -- src` sai vazio, então o
  código de base é o de `e4.3`, sem mudança.
- `VERSAO_DO_FIO = 1` existe em `src/net/protocolo.ts:65`. A nota de contingência do AC 5 não se aplica (ver Dev Notes).

### Commits

- **Implementação: `5766137`** (`test(net): guarda do fio por tabela, limiares FP e fixture congelada [debt.12][E48-TST-001]`).
  `git show --stat 5766137` mostra `src/tools/determinism.ts | 312 +++…--`, 1 arquivo, 303 inserções e 9 remoções.
  Não há nenhum outro arquivo (AC 7).
- **Story:** commit separado, `docs(dev)`, logo depois. Assim o stat do commit de implementação fica só com o arquivo de
  código, no mesmo padrão de `e4.8`/`e4.9`/`e4.3`.

### O que entrou, por AC (tudo no bloco do codec, entre `// ... parser de entrada (e4.8, AC 4)` e `// ... sala pura`)

- **AC 3, `guardaParser()`:** `nulos`, `comExtra`, `semAssento` e `validos` ficaram intactos. Depois deles entraram:
  - `numericos`: `cast.dx`, `cast.dy`, `cast.mag` e `pong.id`, cada um com `NaN`, `1e999` via `JSON.parse`, `-Infinity`
    e `"1"`, o que dá 16 casos → `null`. O `1e999` é montado por texto e depois conferido como `Infinity`. Se a
    montagem falhar, isso vira um ✗ próprio ("o caso não testa nada").
  - `bits`: `cast.ballIndex`, o `jogador` nas 6 variantes de `decisao.d` (o `bit()` roda antes do `switch`, então cada
    variante é um caminho), `slot`, `abilityIndex` e `passiveIndex` de `build` e de `trocaDeBuild`, e `compra.slot`. São
    14 campos × `2`, `0.5`, `"0"` e `true`, o que dá 56 casos → `null`.
  - `descartes`: 16 formas. São as 4 variantes de `DoCliente`, com `entrar` duas vezes (sem `assento` e com
    `assento: 'segredo'`), e as 6 de `decisao.d` duas vezes cada, com `tick`/`extra` por fora e dentro de `d`. Cada forma
    tem de voltar profundamente igual à válida, com `!== raw` e, em `decisao`, `.d !== raw.d`.
- **AC 4, `guardaCodec()`:** `LIMIARES_SINTETICOS = [110.07, 0.29, 87.04]` usa os mesmos tempos, os mesmos restantes e
  o par `thr − 0,004`/`thr` da varredura do roster, num laço paralelo. Assim os contadores `0/48` e `40` da varredura do
  roster não mudam de texto. O resultado é 0/72 viradas. O canário `thr * 100 < Math.round(thr * 100)` hoje só é
  verdadeiro para `[0.29]`, e a linha imprime essa lista.
- **AC 5:** `AMOSTRA_DO_FIO()`, `FIO_CONGELADO` e `guardaFioCongelado()` ficam logo depois de `ORCAMENTO_SNAP_B`, e
  `primeiraDivergencia()` monta o caminho `s[6][0][4]`. A linha nova, `fio congelado`, entra depois de `orçamento`, no
  bloco `codec do fio`. Os problemas dela entram em `problemasCodec`, então o rc do `sim:check` já responde a ela.
  - O texto congelado foi **gerado pelo codec** de hoje e comparado por script: é igual caractere a caractere ao da
    §11.6.1 e ao da story, com 287 B e ponto fixo válido. `FIO_CONGELADO[0].versao === VERSAO_DO_FIO === 1`.
  - Os itens 1 a 4 seguem a §11.6.1. A mensagem do item 1 dá o caminho, o valor congelado, o valor atual e o texto
    "se foi de propósito, incremente…".
- **AC 9:** `formaRuim` foi de 6 para 10 casos, com `snapshotHz` -30, 7.5 e 120 e `assento: 123`. O laço
  `descompassos` ganhou um ramo próprio para `!('servidor' in e)`, que imprime "DescompassoDeVersao sem a propriedade
  servidor". O ramo de valor seguiu com a mensagem de antes.

### Por orientação do @architect (`188998e`, §11.6.1 emendada e §11.6.2), pedida pelo lead antes do commit

O texto dos ACs **não** foi editado. O @po registra o delta de AC depois.

1. **Fixture, item 5 (AC 5/6):** a entrada virou `{ versao, snap, variantes }`, e a primeira tem
   `variantes: 'erro,ping,prazo,rodadaFim,rodadaInicio,sala,snap,visao'`. O item 5 confere se a lista atual é igual a
   `última.variantes`, com a mesma instrução do item 1. A lista atual vem, como a §11.6.2 manda, das chaves de
   `amostras` da guarda `não-snap` (o `satisfies` obriga uma chave por variante que não é `snap`) mais `'snap'`, em
   `sort()` padrão e unida por vírgula. `guardaCodec()` passou a devolver `variantesNaoSnap: Object.keys(amostras)`.
   *O lead escreveu "a lista de `T_DO_SERVIDOR`". Essa lista é privada de `codec.ts`, que é proibido, e a §11.6.2 manda
   derivar de `amostras`. Segui a §11.6.2.* **M-VARIANTE** saiu rc=1 (abaixo).
2. **Versão errada relativa (AC 9, recomendado, M-9 da §11.6.2):** `['versao 2', salaCom('versao', 2), 2]` virou
   `` [`versao ${VERSAO_DO_FIO + 1}`, salaCom('versao', VERSAO_DO_FIO + 1), VERSAO_DO_FIO + 1] ``, e o "2" do texto da
   linha `versão fio` virou `${VERSAO_DO_FIO + 1}`. Com a v1, a saída é byte a byte a mesma. Numa cópia com
   `VERSAO_DO_FIO = 2` e a entrada v2 acrescentada, o `sim:check` sai rc=0, e a linha `versão fio` fica ✓ com "3".

### Verificação

- `npm run check`: 0 erros. `npm run build`: ok (vite, 53.27 kB).
- `npm run sim:check`: rc=0 e `golden hash ✓ ok — 6 seeds batem o baseline`. A saída antes (em `29d7b51`) e depois foi
  comparada inteira com `diff`, e só estas linhas mudam:
  - `parser` (26c26): o texto antigo continua como prefixo, e o final ganhou "· por campo: 4 numéricos × 4 = 16 e 14
    campos 0|1 × 4 = 56 → null · tick/extra descartados em 16 formas (…)".
  - `fronteira` (28c28): o texto antigo continua como prefixo, e o final ganhou "· limiares não inteiros [110.07, 0.29,
    87.04]: ✓ vira 0/72, com thr × 100 abaixo do inteiro em [0.29]".
  - `versão fio` (31c31): só `6/6` → `10/10`. O ✓ ficou.
  - `fio congelado` (32a33): linha nova, "✓ FIO_CONGELADO v1 (287 B, 1 entrada(s), só de acréscimo): … = congelado ✓ ·
    versão = VERSAO_DO_FIO 1 ✓ · ponto fixo ✓ · canário: 0 colisões …, piso ≠ arredondado … ✓ · variantes de DoServidor
    = congeladas (8) ✓".
  - Nenhuma outra linha mudou ou trocou de lugar: nem o golden hash, nem o build coverage, nem o replay, nem `sala pura`.
- Escopo: `git show --stat 5766137` lista só `src/tools/determinism.ts`. `git show 5766137 | grep -c '^-.*FIO_CONGELADO'`
  dá 0, porque a lista foi criada, não editada. `codec.ts`, `sala.ts` e `protocolo.ts` não aparecem, e o bloco
  `sala pura` não tem hunk.
- CodeRabbit (Pre-Commit): não roda nesta máquina (sem WSL/CLI). A cobertura foi `check`, `sim:check`, `build` e a
  bateria de mutações. O checkbox de Quality Gate Tasks fica sem marcar por isso.

### Contrafactual (AC 6 e AC 9 d), cópia descartável, nunca a árvore compartilhada

Script `bateria.mjs` no scratchpad. Cada mutação roda numa cópia nova de `src/` + `package.json`, com o arquivo idêntico
ao do commit `5766137` (conferido com `cmp`). Cada padrão tem de casar **exatamente 1 vez**, senão a mutação aborta, para
não ter verde falso. O script roda `node src/tools/determinism.ts`, anota o rc e as linhas ✗, e depois a cópia é
descartada. Node 24.13.1.

| Mutação (em `codec.ts` da cópia, salvo nota) | rc | Linha ✗ que pega |
|---|---|---|
| controle (sem mutação) | 0 | — |
| M4a (`pronto`/`buildPadrao` → `{ ...raw, t, jogador }`) | 1 | `parser`: "decisao buildPadrao, extra em d" e "decisao pronto, extra em d" |
| M4b (`entrar` sem assento → `{ ...raw, t, sala }`) | 1 | `parser`: "entrar sem assento com tick/extra" |
| M4b' (extra: 2º `return` de `entrar`) | 1 | `parser`: "entrar com assento com tick/extra" |
| M4c (`pong` → `raw`) | 1 | `parser`: "pong com tick/extra" |
| M12 (`dy` só `typeof`) | 1 | `parser`: `cast.dy` NaN, 1e999 de JSON.parse e -Infinity |
| M14 (`abilityIndex` sem faixa) | 1 | `parser`: `build.abilityIndex` e `trocaDeBuild.abilityIndex` com 2 e 0.5 |
| M15 (`compra.slot` sem faixa) | 1 | `parser`: `compra.slot` com 2 e 0.5 |
| M7 (`pisoQ` sem a correção para cima) | 1 | `fronteira`: sintéticos "vira 12/72". Todas as viradas são do 0.29, e o roster segue 0/48 |
| M9 (`hp ↔ ultCharge` nos dois lados) | 1 | `fio congelado`: "s[6][0][4]: congelado 432.13, atual 55.55" |
| `over ↔ pad` nos dois lados | 1 | `fio congelado`: "s[1]: congelado 0, atual 17.25", e o ponto fixo também falha em s[5] |
| `pisoQ → q` no `ultCharge` | 1 | `fio congelado`, `fronteira` (24/48 e 36/72) e `fidelidade` |
| M-HZ-POS (sem `hz > 0`) | 1 | `versão fio` 9/10: "snapshotHz -30 não lançou" |
| M-HZ-INT (sem `Number.isInteger`) | 1 | `versão fio` 9/10: "snapshotHz 7.5 não lançou" |
| M-ASSENTO (`assento === undefined \|\| assento === ''`) | 1 | `versão fio` 9/10: "assento 123 não lançou" |
| M-SERVIDOR (sem `readonly servidor`, atribuído só se `!== undefined`) | 1 | `versão fio` 2/4, com "DescompassoDeVersao sem a propriedade servidor" ×2 ("versao ausente" e "forma de hoje") |
| **M-VARIANTE** (@architect, `188998e`): `\| { t: 'x' }` em `DoServidor` (`protocolo.ts`), `x: true` em `T_DO_SERVIDOR` e amostra `x` em `determinism.ts`, sem subir a versão | 1 | `fio congelado`: "as variantes de DoServidor [erro,…,visao,x] não são as da v1 […]". Os itens 1 a 4 seguem ✓, e só o item 5 pega |
| demo: `VERSAO_DO_FIO = 2` + entrada v2 acrescentada | 0 | — (o procedimento legítimo passa: `fio congelado` v2, 2 entradas, e `versão fio` v2 ✓ com o caso "3") |
| demo: `VERSAO_DO_FIO = 2` sem entrada nova | 1 | `fio congelado`: "FIO_CONGELADO [1] não termina em VERSAO_DO_FIO 2" |
| tirar `typeof hz === 'number' &&` | 0 | **mutante equivalente, não exigido** (AC 9): `Number.isInteger` já recusa não número |

Resultado: as 14 exigidas e a M-VARIANTE saem com rc=1. Nenhum caso novo falhou contra o código de hoje, então o AC 7 não
foi acionado.

### Decisões (autônomas, YOLO)

- [AUTO-DECISION] `'shield'` não está em `EffectKind` (`'slow' | 'dot' | 'amp' | 'vuln'`), e o `tsc` recusou a amostra
  como a §11.6.1 a escreveu. A escolha foi manter o valor exato, com `'shield' as Snapshot[…]['kind']` comentado em
  `AMOSTRA_DO_FIO`. Motivo: a posição é `[lit]`, e trocar para um kind válido mudaria os 287 B decididos, que é
  justamente o que a story chama de achado. **Fica para o @architect:** a amostra tem um `kind` fora do vocabulário.
  Isso não afeta o layout, mas a próxima revisão da §11.6.1 pode querer registrar.
- [AUTO-DECISION] AC 4 "na mesma varredura": a escolha foi um laço paralelo, com os mesmos tempos, restantes e par de
  `ultCharge`, e não misturar os sintéticos em `limiares`. Motivo: o AC 2 quer o diff "só inserção". Misturar mudaria
  os contadores `0/48` e `40 (habilidade 16, ult 24)` do texto de hoje, e o contrafactual ingênuo nos sintéticos não é
  pedido. O veredito ✓ da linha `fronteira` passou a exigir também `viradasSinteticas === 0` e o canário.
- [AUTO-DECISION] `d.jogador` foi testado nas 6 variantes de `decisao.d`, e não numa só. É um caso por variante, com o
  mesmo custo, e mais estrito que o AC.
- [AUTO-DECISION] O rótulo da linha é `fio congelado`, o exemplo do AC 5. Com 13 caracteres, fica uma coluna à frente
  do alinhamento das outras. A escolha foi clareza em vez de alinhamento.
- [AUTO-DECISION] O canário do item 4 usa piso, teto e arredondamento **locais** e ingênuos, porque os do codec são
  privados e `codec.ts` é proibido. Para 55.559 e 183.341, que estão longe de meio-passo, eles dão o mesmo resultado
  que os do codec.
- [AUTO-DECISION] A mensagem de erro final da guarda do codec (o `throw` depois do `console.log`) não foi mudada. A
  linha ✗ do fio congelado já traz a instrução, e o `throw` só aparece quando algo falha.

### Em aberto

- `draft.charId` continua sem caso em `nulos`, como o AC 3 registra. Está fora do escopo.
- O `kind: 'shield'` fora de `EffectKind` na amostra da §11.6.1 é observação para o @architect, e não bloqueia.
- O AC 5 e o AC 6 ainda não trazem o texto do item 5 nem da M-VARIANTE, e o AC 9 não traz a versão relativa. O @po
  registra esse delta depois deste commit, como o lead combinou.

### File List

| Arquivo | Mudança |
|---|---|
| `src/tools/determinism.ts` | Modificado (só o bloco do codec): tabela do parser, limiares sintéticos + canário, `AMOSTRA_DO_FIO` / `FIO_CONGELADO` / `primeiraDivergencia` / `guardaFioCongelado` (itens 1-5), linha `fio congelado`, `formaRuim` 6 → 10, ramo "sem a propriedade servidor", versão errada relativa |
| `docs/stories/debt.12.guarda-do-fio-tabela-e-fixture-congelada.story.md` | Checkboxes, Status, Dev Agent Record, File List, Change Log |

## QA Results

### Review Date: 2026-09-21

### Reviewed By: Quinn (@qa) — gate `docs/qa/gates/debt.12-guarda-do-fio-tabela-e-fixture-congelada.yml`

**Gate: CONCERNS → Status Done.** Revisão avaliada: `5766137` (implementação). O pai é `29d7b51`, só docs, e o código-base é o de `e4.3` (`git diff --stat 99f4ee3 5766137^ -- src` vazio). O registro é `9de7cd9`, que toca só a story. `17ecf5c` (`debt.14`) mexe só no bloco `sala pura`, e o bloco do codec está byte a byte igual no HEAD. O commit é local e não publicado (`merge-base --is-ancestor 5766137 origin/master` rc=1).

**Verificação independente (tudo refeito do zero, em worktrees descartáveis de `5766137` e `5766137^`):**

| AC | Veredito | Evidência |
|---|---|---|
| 1, 2 | MET | `check`, `sim:check` e `build` com rc=0, golden hash ✓, stderr vazio. O `diff` da saída inteira contra `5766137^` tem só 4 blocos: `parser` e `fronteira` com texto acrescentado no fim (o antigo continua como prefixo), `versão fio` `6/6 → 10/10` com ✓, e `fio congelado` como linha nova |
| 3 | MET | 4 numéricos × 4, 14 campos 0/1 × 4, 16 formas de descarte com `!== raw` e `.d !== raw.d`. O 1e999 é conferido `=== Infinity`. `nulos`/`validos` intactos. M4c, M12 e M15 reprovam. P7 (`bit` só em `pronto`) reprova por draft/build/…, então o caso por variante tem dente |
| 4 | MET | 110.07, 0.29 e 87.04 × (`thr`, `thr − 0,004`), 0/72. M7 reprova só pelo 0.29 (12/72). O canário está vivo (P3, 0.29 → 0.3, rc=1) e é a única defesa de M7 nesse caso (P3c, com o canário desligado, rc=0) |
| 5 | MET | Texto **gerado por mim** a partir do codec: 287 B, igual caractere a caractere à §11.6.1 e ao literal. Ponto fixo ok. Itens 1-4 e **item 5** (§11.6.2) presentes. M9, over↔pad, pisoQ→q e M-VARIANTE reprovam. Canário com ressalva (DEBT12-TST-001) |
| 6, 9 | MET | 10 mutações da story reaplicadas, todas com rc=1: M9, over↔pad, M7, pisoQ→q, M-HZ-INT, M-HZ-POS, M4c, M12, M15 e M-VARIANTE. O caso `VERSAO_DO_FIO + 1` passa com a v2 (Q3a: "3" ✓) |
| 7 | MET | `git show --stat 5766137`: só `determinism.ts`, 303/9, igual com `-w`, 0 CR. Os 8 hunks ficam entre o cabeçalho do parser (988) e o de `sala pura` (1589), sem hunk em `sala pura`. `codec.ts`, `protocolo.ts` e `sala.ts` não foram tocados |
| 8 | MET | O código-base é o de `e4.3` (`99f4ee3`). `VERSAO_DO_FIO = 1` existe. A contingência não se aplica |

**Mutações próprias (25):** Q2a/Q2b (variante sem amostra), Q3a–Q3f (procedimento de versão), P1–P10 (tabela, canários, item 5 e decodificador). Os detalhes estão no gate.

**Perguntas do lead:**
1. **`kind: 'shield'`**: aceitável como está. A posição é `[lit]`, e trocar o valor mudaria os 287 B, o que exigiria subir a versão sem que o protocolo tenha mudado. O dono é o @architect, com uma errata de texto na §11.6.1, sem bump (DEBT12-ARC-001).
2. **`variantes` a partir de `amostras`**: não é tautológico, mas o elo é o `tsc`. Uma variante nova em `DoServidor`/`T_DO_SERVIDOR` sem amostra passa pelo `sim:check` sozinho (Q2a/Q2b rc=0), e o `npm run check` a pega (rc=2). A derivação é a que a §11.6.2 manda (DEBT12-TST-002).
3. **Procedimento**: v2 acrescentada com bump passa (Q3a, Q3b). Bump sem acrescentar reprova (Q3c). Editar a v1 no lugar com `versao: 2` reprova (Q3e). Editar a v1 no lugar sem bump (Q3d), ou reescrever a v1 e acrescentar a v2 (Q3f), passa verde. Esse é o limite que a §11.6.1 declara, e só a forma do diff o denuncia. Fica com o @qa em todo gate que tocar `FIO_CONGELADO`.
4. **Mais estrito que o AC**: `d.jogador` nas 6 variantes tem dente (P7). Os arredondamentos locais do canário estão certos para os valores de hoje e errados na borda de ponto flutuante (P6b).

**Achados (todos LOW):**
- **DEBT12-TST-001 (low, tests; @dev, opcional, na próxima story do bloco do codec):** o canário do item 4 usa piso e arredondamento ingênuos locais. Com ultCharge 0.29, o codec escreve 0.29, igual ao arredondado, e o canário diz "piso ≠ arredondado ✓" (P6b rc=0). Correção: ancorar o canário no valor **codificado** (`s[6][0][6]` e `s[6][0][7]`) em vez do piso local.
- **DEBT12-TST-002 (low, tests; @po/@sm na e4.10, @devops opcional):** o item 5 depende de `npm run check`. A prova é o par `check && sim:check`, e nenhum CI roda os dois.
- **DEBT12-TST-003 (low, tests; @dev, opcional):** a tabela não tem trava de tamanho. Remover a linha `cast.dy` mais M12 (P1), ou `compra.slot` mais M15 (P2), passa verde.
- **DEBT12-ARC-001 (low, docs; @architect):** errata do `'shield'` na §11.6.1, sem bump.
- **DEBT12-REQ-001 (low, requirements; @po):** o item 5 com M-VARIANTE e o caso `VERSAO_DO_FIO + 1` ainda não estão no texto dos ACs (delta já combinado).

**Observações:** o Status veio "Ready for Review" (o canônico é "InReview"), e a transição foi registrada como Ready for Review → Done. CodeRabbit não roda nesta máquina. Worktrees e cópias de mutação foram removidos.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-09-21 | 1.0 | Story criada a partir dos achados `E48-TST-001` (medium) e `E48-TST-002` (low) do gate de `e4.8` (`docs/qa/gates/e4.8-codec-do-fio.yml`), e da parte 2 do achado `E48-ARC-003`, conforme roteamento do @po em `docs/stories/e4.8.codec-do-fio.story.md` Change Log v1.4.0 (itens a, b, e, f) e v1.5.0 (itens c, d, g, que substituem os equivalentes da v1.4.0, decididos pelo @architect na §11.6.1 de `architecture-e4.md`, commit `bed4603`). Escopo fechado: só `src/tools/determinism.ts`; `src/net/codec.ts` é proibido, e um caso novo que falhe contra o código de hoje é achado a escalar, não correção dentro da story. Sequenciada depois do commit de implementação de `e4.3` (que já vem depois de `e4.9`), na ordem `e4.8` → `debt.11` → `e4.9` → `e4.3` → `debt.12` → `e4.6` registrada pela §11.6.1. `e4.9` está Draft, em validação do @po em paralelo, e não é tocada por esta story. Precondição registrada em `e4.4` v1.5.0 (Task 0), `e4.3` v1.5.0 e `e4.6` v1.2.0: commit de implementação desta story antes da Task 1 de `e4.4`. Status: Draft. | River (@sm) |
| 2026-09-21 | 1.1 | **Validação @po (`*validate-story-draft`): GO 9/10, Draft → Ready.** Checklist de 10 pontos: 1 título ✓, 2 descrição ✓, 3 ACs testáveis ✓ (com a correção do AC 4), 4 escopo ✓ (só `determinism.ts`, com prova por `git show --stat`), 5 dependências ✓, 6 complexidade ✓ (Medium), 7 valor ✓, 8 riscos ✓, 9 DoD ✓, 10 alinhamento ⚠ (a narrativa de FP do AC 4, herdada do gate e do roteamento do @po, estava errada em 2 dos 3 limiares). **Conferência caractere a caractere com a §11.6.1** (script, e não leitura a olho): o bloco `ts` de `AMOSTRA_DO_FIO` da story (7 linhas) é idêntico a `architecture-e4.md:1264-1270`, com espaços iniciais normalizados. O texto congelado é idêntico ao de `:1273`, com 287 B. As 4 checagens, a lista `FIO_CONGELADO` só de acréscimo com `{ versao, snap }` e o procedimento de mudança deliberada batem com `:1277-1323`. **Regenerado a partir do codec:** `codificarDoServidor({ t:'snap', s: AMOSTRA, seq: 4 })` dá os mesmos 287 B, byte a byte, com o `codec.ts` de `d378ca5` e com o de `6f2f56c` (`e4.9`). O ponto fixo vale nos dois. **Coerência com `e4.9`:** `VERSAO_DO_FIO = 1` em `protocolo.ts:65` (`6f2f56c`), então `[{ versao: 1 }]` e `length === VERSAO_DO_FIO` fecham (1 = 1). O diff `d378ca5..6f2f56c` de `codec.ts` não tem hunk na seção ENTRADA (`:30-162`, só deslocada uma linha pelo import de `VERSAO_DO_FIO`). `DoCliente` e `Decisao` não mudaram, e a tabela do AC 3 não conflita. **Correções aplicadas:** (1) **AC 4, fato de FP errado.** No Node 24.13.1, `110.07 * 100 === 11007` e `87.04 * 100 === 8704`, exatos. Só `0.29 * 100 === 28.999999999999996` cai abaixo do inteiro. Com `M7` aplicada numa cópia de `6f2f56c`, a varredura dá 0 viradas em 110, 130, 110.07 e 87.04, e 4 em 0.29. Os três limiares ficam, e entra um **canário** (pelo menos um limiar sintético com `thr*100 < round(thr*100)`), para que `M7` não perca o dente se alguém trocar 0.29. O texto de `M7` no AC 6 foi alinhado. (2) **AC 3:** saiu a frase "`codec.ts:1-3` só recebe `import type`", que ficou falsa desde `6f2f56c` (a linha 3 importa o valor `VERSAO_DO_FIO`) e era irrelevante para o motivo do `JSON.parse`. "Hoje só `dx` é testado" foi corrigido para a cobertura real (`dx`, `mag -Infinity`, `pong.id Infinity`/ausente, e `dy` nunca). `entrar` entra no descarte com e sem `assento`, porque são dois `return`. Entrou uma nota com a conferência campo a campo contra `finito()`/`bit()` da seção ENTRADA. (3) **Linhas de `determinism.ts`** nos ACs 3, 4 e 5 e na Task 2 atualizadas para `6f2f56c` (+3), com a âncora declarada como nome de função, porque `e4.3` vai movê-las de novo. (4) **AC 5:** a linha nova precisa de rótulo distinto do `versão fio` que `e4.9` pôs no bloco. (5) **"Depende de" e AC 8:** estado de `e4.9` atualizado (implementada, `6f2f56c`). A pré-condição de início continua sendo o commit de `e4.3`. **Não editado (Dev Notes, @dev):** o mapa de linhas (970/978/1053/1078/1210/1213, de `d378ca5`) e "`e4.9` (Draft…)" em "O que NÃO faz". Onde divergirem, os ACs prevalecem. **Observação fora do escopo:** `draft.charId` não tem caso em `nulos`. Não é exigido aqui, porque o achado não o cita. **Fatos conferidos:** `determinism.ts` em `6f2f56c`: `:23` (import de `VERSAO_DO_FIO`), `:123` (`BASELINE`), `:981` (`guardaParser`), `:985-1009` (`nulos`), `:992-995` (dx/mag), `:997-999` (ballIndex/d.jogador), `:1007` (pong id Infinity), `:1016-1022` (`comExtra`), `:1028-1040` (`validos`), `:1056` (`snapshotSintetico`), `:1081` (`guardaCodec`), `:1087` (`limiares` do roster), `:1102` (`[thr - 0.004, thr]`), `:1258` (linha `versão fio`). `codec.ts`: `bit()`/`finito()` e os dois `return` de `entrar`; `pisoQ`/`tetoQ`/`q` em `:283-306`. Os três irmãos citados no AC 8 têm a pré-condição de `debt.12` nas linhas de versão citadas (`e4.4` v1.5.0, `e4.3` v1.5.0, `e4.6` v1.2.0). | Pax (@po) |
| 2026-09-21 | 1.2 | **Achados do gate de `e4.9` absorvidos (`docs/qa/gates/e4.9-versao-do-fio-e-assento.yml`, `c4b22db`, CONCERNS). Status permanece Ready:** o acréscimo são 4 linhas numa lista que já existe, um ramo de mensagem e 4 mutações, tudo no mesmo arquivo e no mesmo bloco do codec. **Roteamento:** `E49-TST-001` (medium), `E49-TST-002` (low) e `E49-TST-003` (low, opcional no gate, **obrigatório aqui**, porque é uma condição a mais e a M-SERVIDOR já o prova) viram o **AC 9** novo. `debt.12` é a casa porque só abre `determinism.ts`, roda depois de `e4.3` e é a próxima story a abrir o bloco do codec. `e4.3` está em implementação e não foi tocada. `E49-REQ-004` (@architect) não entra aqui: ficou registrado no Change Log de `e4.9` v1.2.0. **Mudanças:** título; `quality_gate_tools` (10 → 14 mutações); "Depende de" (nota v1.2); AC 2 (a linha `versão fio` pode mudar os contadores, `6/6` → `10/10`, com ✓ inalterado); AC 6 (ponteiro para as 4 do AC 9); AC 9 novo; CodeRabbit Focus; Task 6 nova; Task 5 e Testing. **Fatos conferidos** numa cópia descartável de `c4b22db` (`git archive HEAD src`, Node 24.13.1), e não copiados do gate: `conferirSala` (`src/net/codec.ts`, `6f2f56c`) lança `Error` para `snapshotHz` -30, 7.5 e 120 e para `assento: 123`, e aceita 20. Com os 4 casos em `formaRuim`, `node src/tools/determinism.ts` sai rc=0 com `10/10` (o gate falava em `9/9` porque contava só o TST-001). Q3/M-HZ-POS, Q2/M-HZ-INT e Q5/M-ASSENTO saem rc=1, cada uma com `9/10` e o ✗ no caso previsto. Q1 (sem divisor) reprova por 7 e 120, e Q9 (`hz <= 60`) por 7. Com o ramo (c) aplicado na cópia, Q6b/M-SERVIDOR sai rc=1 e imprime "sem a propriedade servidor" em "versao ausente" e "forma de hoje". Tirar `typeof hz === 'number'` sai rc=0, e é mutante equivalente, porque `Number.isInteger` já recusa não números. O AC registra isso como não exigido. Linhas da guarda em `c4b22db`: `formaRuim` `:1222-1229`, laço `descompassos` `:1197-1220`, mensagem de três condições `:1213-1216`, linha `versão fio` `:1258`. | Pax (@po) |
| 2026-09-21 | 1.3 | **Gate de `e4.3` (`docs/qa/gates/e4.3-sala-pura.yml`, `5f6c44f`, CONCERNS, `e4.3` Done): os achados de teste da sala NÃO entram aqui. Status permanece Ready. Nenhum AC muda de critério.** O gate listou `debt.12` como candidata para E43-TST-001/002/003, porque é a próxima story a abrir `determinism.ts`. O @po decidiu por uma story própria, sugestão `debt.14`, a criar pelo @sm, com spec no Change Log de `e4.3` v1.9.0. Absorver mudaria o título, o AC 2 (diff só no bloco `codec do fio`), o AC 6 e o AC 9 (mutações em `codec.ts`) e o AC 7 (proíbe `sala.ts`), e poria a guarda do fio e a da sala sob um só gate, o que o corte de `e4.3` (`1564ae4`) e o roteamento de `e4.8` v1.4.0 evitaram. Também exigiria revalidar esta story. **Mudanças:** (1) AC 7 ganhou uma nota em itálico: o bloco `sala pura` de `determinism.ts` fica fora do escopo. (2) AC 8 ganhou a ordem vigente em itálico, com `debt.14` entre esta e `e4.6`. O texto original ficou. Nada muda na pré-condição de início (commit de `e4.3`, que é `99f4ee3`), no prazo (antes da Task 1 de `e4.4`) nem nas 14 mutações. | Pax (@po) |
| 2026-09-21 | 1.4 | **Implementação @dev. Ready → InProgress → Ready for Review.** Commit de implementação `5766137`, só `src/tools/determinism.ts`, com pai `29d7b51` e código-base de `e4.3` (`99f4ee3`), sem mudança. Os AC 3, 4, 5 e 9 foram implementados no bloco do codec. O texto congelado foi gerado pelo codec e é igual caractere a caractere ao da §11.6.1 (287 B). Golden hash idêntico. O diff do `sim:check` só muda `parser` e `fronteira` (texto acrescentado no fim), `versão fio` (`6/6` → `10/10`) e ganha a linha nova `fio congelado`. As 14 mutações do contrafactual saem rc=1, e o `typeof hz` é equivalente (rc=0). **Por orientação do @architect (`188998e`, §11.6.2), pedida pelo lead antes do commit, e sem editar os ACs:** a entrada ganhou `variantes` e a guarda ganhou o item 5 (M-VARIANTE rc=1), e o caso de versão errada passou a `VERSAO_DO_FIO + 1`. Nenhum caso novo falhou contra o código de hoje (o AC 7 não foi acionado). O delta de AC fica com o @po. | Dex (@dev) |
| 2026-09-21 | 1.5 | **Gate @qa: CONCERNS, Ready for Review → Done** (`docs/qa/gates/debt.12-guarda-do-fio-tabela-e-fixture-congelada.yml`). Os 9 ACs estão MET, e também o item 5/M-VARIANTE e o caso `VERSAO_DO_FIO + 1` (§11.6.2, em escopo por orientação do @architect). Tudo foi verificado do zero em worktrees de `5766137`/`5766137^`: `check`, `sim:check` e `build` com rc=0, golden hash idêntico, e o diff da saída com só as 4 mudanças permitidas. O texto congelado foi gerado pelo @qa a partir do codec (287 B, igual à §11.6.1). As 10 mutações da story reaplicadas deram rc=1, e o @qa rodou mais 25 próprias. E48-TST-001, E48-TST-002, E48-ARC-003 (parte 2) e E49-TST-001/002/003 estão fechados. Achados, todos LOW: DEBT12-TST-001 (canário do item 4 com arredondamento local, ✓ falso na borda de FP; @dev), DEBT12-TST-002 (item 5 depende de `npm run check`; @po/@sm na e4.10), DEBT12-TST-003 (tabela sem trava de tamanho; @dev), DEBT12-ARC-001 (errata do `'shield'`, sem bump; @architect) e DEBT12-REQ-001 (delta de AC; @po). | Quinn (@qa) |
