# Story debt.14: Guarda da sala por variante e por assento — achados `E43-TST-001`, `E43-TST-002`, `E43-TST-003` do gate de `e4.3`

## Status

Ready

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run check", "npm run sim:check (golden hash idêntico ao baseline atual; diff da saída completa antes×depois SÓ com o texto do bloco `sala pura` mudando de conteúdo — contadores e descrição de cobertura, vereditos ✓ inalterados — mais linha(s) nova(s), nunca linha de outra seção)", "as 12 mutações do contrafactual (Q3 + uma por variante nova de `build`/`buildPadrao`/`pronto`/`compra`/`trocaDeBuild`, Q5, Q6, Q7, Q8, Q12, Q13), cada uma aplicada a `src/net/sala.ts` numa cópia descartável (nunca na árvore compartilhada) e revertida — todas com `node src/tools/determinism.ts` saindo com código diferente de 0", "git show --stat <commit de implementação desta story> — restrito ao bloco `sala pura` de src/tools/determinism.ts; nunca a árvore de trabalho compartilhada"]
```

## Story

**Como** desenvolvedor fechando os achados de teste do gate CONCERNS de `e4.3` (`docs/qa/gates/e4.3-sala-pura.yml`, roteados pelo @po em `docs/stories/e4.3.sala-pura.story.md`, Change Log v1.9.0, commit `c10f287`),
**eu quero** estender a guarda da sala em `src/tools/determinism.ts` — a checagem de `d.jogador` alheio repetida para as cinco variantes de `Decisao` que `E43-TST-001` mostrou destestadas, a conferência de que TODO assento conectado recebe `visao`/`rodadaInicio`/`rodadaFim` (`E43-TST-002`), e os três casos de borda sem regressão de `E43-TST-003` (teto de ticks, reassentamento em `builds` com o prazo restante, queda em `loja`/`builds` abrindo pausa por conta própria) —,
**para que** uma refatoração da checagem de `d.jogador` por `switch (d.t)` — a exata tentação que `E43-TST-001` descreve — ou uma regressão na entrega de `visao`/`rodadaInicio`/`rodadaFim` a um assento só, deixem de passar despercebidas pelo `sim:check`, antes de a `e4.4` ligar a sala ao socket e tornar essas lacunas visíveis a um jogador de verdade.

## Depende de

`e4.3` (`docs/stories/e4.3.sala-pura.story.md`, Done, commit de implementação `99f4ee3`) — entregou `src/net/sala.ts` e o bloco `sala pura` de `determinism.ts` (`guardaSala()`, `:1879` na árvore de hoje). É dona dos três achados que esta story fecha.

`docs/qa/gates/e4.3-sala-pura.yml` (`5f6c44f`, CONCERNS, `e4.3` Done) — os achados `E43-TST-001` (medium), `E43-TST-002` (medium) e `E43-TST-003` (low).

**Roteamento do @po que criou esta story (citado, não resumido de memória, `e4.3` Change Log v1.9.0, commit `c10f287`):**

> **Dono de E43-TST-001, E43-TST-002 e E43-TST-003: story nova, sugestão `debt.14`, a criar pelo @sm. A
> opção de dobrar os três em `debt.12` foi rejeitada.** Três motivos. (a) **Coerência do gate de `debt.12`.**
> `debt.12` é a guarda do FIO: título, AC 2 (diff só no bloco `codec do fio`), AC 6 e AC 9 (mutações
> aplicadas a `codec.ts`) e AC 7 (proíbe `src/net/sala.ts`). As 7 mutações que este gate deixou passar são
> de `sala.ts`, e os casos moram no bloco `sala pura` de `determinism.ts` (`:1295` a `guardaSala()`,
> `:1879`), outro bloco, com outra linha de saída. Absorver reescreveria título, AC 2, AC 6 e AC 7 e poria a
> guarda do fio e a da sala sob um só gate, que é exatamente o que o corte desta story (`1564ae4`) e o
> roteamento do gate de `e4.8` evitaram. (b) **Nenhum custo de prazo.** `e4.4` está bloqueada em R-05, e
> `debt.12` já é pré-condição dela. Uma story a mais atrás de `debt.12` no mesmo arquivo não atrasa nada
> hoje. (c) **`debt.12` está Ready e validada** (GO 9/10, v1.2). Crescer agora exigiria revalidar.

[Fonte: `docs/stories/e4.3.sala-pura.story.md`, Change Log v1.9.0, @po]

**Sequenciada, não dependente em conteúdo, de `debt.12` (Ready, `docs/stories/debt.12.guarda-do-fio-tabela-e-fixture-congelada.story.md`).** A ordem de `src/tools/determinism.ts`, registrada por `docs/architecture-e4.md` §11.6.1, estendida pela §11.6.2 (commit `188998e`: a story de `EventoPartida` no fio, `e4.10`, entra entre `debt.12` e `e4.6`) e atualizada pelo @po em `e4.3` v1.9.0, `debt.12` v1.3 e `e4.4` v1.8.0, é:

**`e4.8` → `debt.11` → `e4.9` → `e4.3` → `debt.12` → `debt.14` → `e4.10` → `e4.6`**

*(A spec citada abaixo, item (g), é anterior à §11.6.2 e ainda mostra `debt.14` → `e4.6`. A citação fica
literal; vale a ordem acima.)*

**`e4.10` vem DEPOIS desta story** (`{t:'evento'}` por assento, `VERSAO_DO_FIO` 1→2, §11.6.2; toca
`src/net/sala.ts` e `src/tools/determinism.ts`; o arquivo da story ainda não foi redigido pelo @sm). Ela
muda o que a sala envia: um `{t:'evento'}` logo depois de cada `{t:'visao'}` de transição (§11.6.2, "Ordem
nos envios"). As conferências de entrega por assento desta story (AC 4, e as dos AC 3 e 5 que olham
envios) têm de continuar valendo depois dela — ver a **Nota para `e4.10`** no AC 8.

Esta story começa **depois do commit de implementação de `debt.12`**, com `git status --short src/tools/determinism.ts` vazio. Não lê nem toca nada de `debt.12` em conteúdo — a dependência é só de sequência na mesma árvore compartilhada (o mesmo motivo já registrado em `debt.11` AC 12 e `e4.8` v1.1.0). *(Nota de estado na criação desta story: `debt.12` ainda está Ready, não implementada. Esta pré-condição bloqueia o INÍCIO da implementação, não a criação da story.)*

**Tem de ter commit de implementação antes da Task 1 de `e4.4`** (`docs/stories/e4.4.servidor-ws.story.md`), que é a story que liga a sala ao socket — a pré-condição já está registrada lá (v1.7.0, AC 1, Task 0).

**Spec completa para o @sm (citada, não resumida, do Change Log de `e4.3` v1.9.0, item (4), commit `c10f287`):**

> **(a) E43-TST-001, recusa por variante.** Na guarda da sala, repetir o caso "→ sala" (hoje só `draft`,
> `determinism.ts:1517`) para `build`, `buildPadrao` e `pronto` (fase `builds`) e para `compra` e
> `trocaDeBuild` (fase `loja`), cada um enviado pelo assento de um jogador em nome do outro, num momento em
> que `aplicar()` **aceitaria** a decisão. Para cada variante, conferir: `{t:'erro'}` só ao remetente,
> `partida` idêntica por referência e `decisoes` sem entrada nova. **Controle positivo obrigatório por
> variante:** a MESMA decisão, enviada pelo assento dono, é aceita (a `partida` muda de identidade). Sem
> ele, um caso num momento em que `aplicar()` recusaria de qualquer jeito passaria verde sem testar a
> checagem da sala. Se alguma variante não tiver momento alcançável em que `aplicar()` a aceite, a story
> para e escala ao @po. Contrafactual: Q3 rc=1, e mais uma mutação por variante, que isenta só ela
> (`msg.d.t !== '<variante>' && msg.d.jogador !== j`), cada uma rc=1 (6 mutações — Q3 mais uma por variante
> nova).
>
> **(b) E43-TST-002, entrega a todo assento.** Em `conduzir`, todo passo em que `c.sala.partida` muda de
> identidade entrega pelo menos um `{t:'visao'}` a cada assento conectado no fim do passo. Por rodada: cada
> assento conectado recebe um `rodadaInicio` e um `rodadaFim` (no assento que caiu e voltou, o
> `rodadaInicio` do reassentamento conta). A contagem exata é do @dev, fixada a partir do que a sala de hoje
> emite. Se a sala de hoje violar a regra, é achado: para e escala, sem tocar `sala.ts`. Contrafactual: Q5,
> Q6 e Q7, cada uma rc=1.
>
> **(c) E43-TST-003, obrigatório aqui** (opcional no gate; é barato e a story existe de qualquer forma, o
> mesmo critério do `E49-TST-003` em `debt.12` v1.2): (i) uma sala descartável com `tetoDeTicks` pequeno (o
> campo existe em `ConfigDaSala`, `sala.ts:131`, validado em `:252`), conferindo o snap final e o
> `rodadaFim` no tick do teto, contrafactual Q8 rc=1; (ii) queda e reassentamento na fase `builds`,
> conferindo que o reassentado recebe `{t:'prazo'}` com o restante (`terminaEmMs` = prazo − decorrido),
> contrafactual Q12 rc=1; (iii) queda na `loja` e em `builds` abrindo pausa por conta própria (não a pausa
> encadeada de um estouro anterior, que é o que a guarda de hoje exercita), com o W.O. da fase no estouro,
> contrafactual Q13 rc=1.
>
> **(d) Escopo:** só `src/tools/determinism.ts`, e dentro dele só o bloco `sala pura`. Proibidos, sem
> exceção: `src/net/sala.ts`, `src/net/codec.ts`, o bloco `codec do fio` (território de `debt.12`),
> `package.json` e `docs/` (exceto a própria story). Um caso novo que falhe contra o código de hoje é achado
> a escalar, não correção. As mutações são aplicadas a `sala.ts` numa cópia descartável, nunca na árvore
> compartilhada.
>
> **(e) Saída:** golden hash idêntico. No diff da saída completa do `sim:check` antes × depois, só as linhas
> do bloco `sala pura` mudam de texto (contadores e descrição de cobertura), com os vereditos ✓ inalterados,
> e mais as linhas novas.
>
> **(f) Contrafactual total:** Q3 + 5 por variante + Q5, Q6, Q7 + Q8, Q12, Q13 = **12 mutações**, todas com
> rc=1.
>
> **(g) Sequência:** a ordem de `determinism.ts` passa a `e4.8` → `debt.11` → `e4.9` → `e4.3` → `debt.12` →
> **`debt.14`** → `e4.6`. Começa depois do commit de implementação de `debt.12`, com `git status --short
> src/tools/determinism.ts` vazio. O escopo é conferido por `git show --stat` do próprio commit. **Tem de
> ter commit de implementação antes da Task 1 de `e4.4`**, porque é a `e4.4` que liga a sala ao socket, e o
> gate pôs o prazo aí. A pré-condição foi registrada em `e4.4` v1.7.0 (AC 1, Task 0).

[Fonte: `docs/stories/e4.3.sala-pura.story.md`, Change Log v1.9.0, item (4), @po, commit `c10f287`]

**Nota de numeração:** a spec citada usa "6 mutações" em (a) contando Q3 junto com as 5 novas; o total em
(f) já soma Q3 dentro do "5 por variante" de forma consistente (1 + 5 = 6 da checagem de variante, mais
Q5/Q6/Q7 = 3, mais Q8/Q12/Q13 = 3 → 12). Este documento usa a contagem de (f): **12 mutações no total**.

## Acceptance Criteria

1. `npm run check` verde.

2. `npm run sim:check` verde, com **golden hash idêntico** ao baseline atual. O diff da saída completa do
   `sim:check` antes × depois desta story tem, **fora do bloco `sala pura`**, zero linhas mudadas — nenhuma
   linha do golden hash, do build coverage, do replay ou do bloco `codec do fio` muda de conteúdo ou troca
   de lugar. **Dentro** do bloco `sala pura`, as linhas existentes (`sala pura`, `bo5`, `flush`, `assentos`,
   `autoridade`, `negativos`) podem mudar de texto — contadores e descrição de cobertura —, com o veredito
   ✓ inalterado, e a story pode acrescentar linha(s) nova(s) de seção.

3. **Recusa de `d.jogador` alheio por variante (`E43-TST-001`).** Hoje a guarda "→ sala" em
   `determinism.ts:1517-1527` testa só a variante `draft` (o assento 0 manda uma decisão `draft` perfeita em
   nome do jogador 1, na vez dele; `aplicar()` a aceitaria, e quem recusa é a sala em `sala.ts:449`). O caso
   é repetido para as outras cinco variantes de `Decisao` (`match/types.ts:148-154`: `build`, `buildPadrao`,
   `compra`, `trocaDeBuild`, `pronto`), cada uma enviada pelo assento de um jogador em nome do outro, num
   momento em que `aplicar()` **aceitaria** a decisão (por exemplo: fase `builds`, antes de o jogador-alvo
   ter declarado `pronto`, para `build`/`buildPadrao`/`pronto`; fase `loja`, antes de o jogador-alvo ter
   declarado `pronto` e com saldo/consistência suficientes para a compra ou troca escolhida, para
   `compra`/`trocaDeBuild`). Para cada variante:
   - `{t:'erro'}` sai **só ao remetente** (o assento que mandou a decisão alheia);
   - `c.sala.partida` continua **idêntica por referência** ao estado anterior ao envio;
   - `c.sala.decisoes` não ganha entrada nova.
   - **Controle positivo obrigatório, por variante:** a MESMA decisão, enviada pelo assento **dono** do
     `d.jogador`, é aceita (`c.sala.partida` muda de identidade). Sem o controle, um momento em que
     `aplicar()` já recusaria por outro motivo (fase errada, jogador já pronto, saldo insuficiente) passaria
     verde sem exercitar a checagem de assento da sala.
   - Se alguma variante não tiver, dentro do roteiro da Bo5 ou de uma sala descartável de negativos, um
     momento alcançável em que `aplicar()` aceitaria a decisão, a story **para nesse ponto** e **escala ao
     @po** — não se resolve inventando um roteiro que não corresponde ao fluxo real do jogo.
   - **O momento existe para as cinco, e foi conferido por execução pelo @po** (v1.1, `passo()` real numa
     cópia descartável de `29d7b51`; ver Dev Notes, "Momento de aceitação por variante"). Duas restrições
     que o exemplo acima não mostra, e que fariam um @dev escalar sem motivo:
     (a) **`compra` e `trocaDeBuild` são recusadas por `aplicar()` na PRIMEIRA `loja`** (depois da rodada
     0 os dois jogadores têm 4 de ouro; o item mais barato custa 6 e a troca custa 5, `ECONOMIA_PROVISORIA`
     e `PRECO_PROVISORIO`). O primeiro momento de aceitação é a `loja` depois da rodada 1 (9 de ouro, se o
     jogador-alvo não gastou). O momento é escolhido pelo predicado de estado (`ouro` do alvo ≥ preço),
     não por índice de rodada fixo no código, porque os números são D-09, provisórios.
     (b) **`build` e `buildPadrao` só têm uma janela na partida**: a fase `builds` que o fim do draft abre.
     Toda rodada termina em `loja` (`redutor.ts:482`). Na mesma janela, os controles positivos de
     `buildPadrao` e de `pronto` marcam o alvo como pronto e fecham o que vem depois para ele. A ordem tem
     de levar isso em conta, e tudo tem de acontecer antes do prazo de RF-04.
   - **Os controles positivos de `buildPadrao` e `trocaDeBuild` não cabem no roteiro da Bo5**: o
     `buildPadrao` do roteiro não é enviado (o relógio de RF-04 o produz, `determinism.ts:1315-1317` e
     `:1483-1486`), e a seed 1 não tem `trocaDeBuild` (§11.6.2, M-5). Uma decisão aceita a mais na Bo5 muda
     o resultado comparado com o arnês e o log `decisoes` conferido em `:1576`. Esses controles vão numa
     sala descartável. Na Bo5, o controle positivo só pode ser a decisão que o próprio roteiro já envia do
     assento dono, como o caso de `draft` de hoje faz em `:1530`.
   - **Contrafactual:** a mutação `Q3` de hoje (`msg.d.t === 'draft' && msg.d.jogador !== j` em
     `sala.ts:449`, restringindo a checagem só a `draft`) sai com `rc=1`. Mais uma mutação por variante nova,
     que isenta só ela (`msg.d.t !== '<variante>' && msg.d.jogador !== j`), cada uma com `rc=1` (5
     mutações, uma por `build`/`buildPadrao`/`pronto`/`compra`/`trocaDeBuild`).
   [Fonte: `docs/qa/gates/e4.3-sala-pura.yml`, achado `E43-TST-001`; `src/net/sala.ts:449`;
   `src/match/types.ts:148-154`; `src/tools/determinism.ts:1517-1527`]

4. **Entrega de `visao`/`rodadaInicio`/`rodadaFim` a TODO assento conectado (`E43-TST-002`).** Hoje a guarda
   de `conduzir` (`determinism.ts:1375-1387`) confere que cada `{t:'visao'}` que CHEGA a um assento é
   `visaoPara(estado, jogador daquele assento)`, mas não que todo assento conectado receba a sua a cada
   mudança de identidade de `c.sala.partida`. A extensão:
   - Todo passo (`conduzir`) em que `c.sala.partida` muda de identidade em relação ao passo anterior **e a
     sala termina o passo em `fase === 'jogando'`** entrega **pelo menos um** `{t:'visao'}` a **cada assento
     conectado** (`n.conectados[j] === true` e `n.assentos[j] !== null`) ao final do passo. "Pelo menos
     um", não "exatamente um" como o gate sugeria: um passo pode ter várias transições (o estouro de RF-04
     aplica `buildPadrao` para cada jogador não pronto, cada um com o seu `enviarVisao`, `sala.ts:624-627`).
     **Exceção esperada, não achado:** a queda no draft (§6, `sala.ts:402-412`) recria a `partida` e devolve
     a sala a `aguardando`. O assento que fica recebe só o `{t:'sala'}` de `aguardando`, sem visão, e a visão
     sai quando alguém ocupa o assento de novo (`sala.ts:389`). O caso já roda na guarda de hoje
     (`salaNegativos`, sala `draft`, `determinism.ts:1866`), e uma regra sem essa exceção acusaria em código
     não mutado.
   - Por rodada: **exatamente um** `rodadaFim` a cada assento conectado no fim da rodada (quem está fora no
     W.O. de R-02 não recebe, e isso está certo: `paraCadaAssento`, `sala.ts:316-321`). E **pelo menos um**
     `rodadaInicio` por assento conectado: o de `iniciarRodada` (`sala.ts:561`) para quem estava conectado
     na largada, mais o do reassentamento (`sala.ts:369`) para quem caiu e voltou. **O assento que caiu e
     voltou no meio da rodada recebe DOIS**, o da largada e o do reassentamento, e isso é o comportamento
     correto de hoje: a Bo5 da guarda o exercita na rodada 1 e já confere `[sala,visao,rodadaInicio]` no
     reassentamento (`determinism.ts:1644-1657`). "Exatamente um `rodadaInicio`" acusaria em código não
     mutado.
   - A contagem exata (quantos `visao`/`rodadaInicio`/`rodadaFim` por passo/rodada) é definida pelo @dev, a
     partir do que a sala de hoje efetivamente emite — não é uma contagem inventada a priori. Se a sala de
     hoje violar a regra acima (por exemplo, um caminho em que um assento conectado não recebe visão depois
     de uma mudança de estado), é **achado**: a story **para** nesse ponto e **escala ao @po**, sem editar
     `sala.ts`.
   - **Contrafactual:** as mutações `Q5` (`enviarVisao`, `sala.ts:338`, só para `j === 0`), `Q6`
     (`rodadaFim`, `sala.ts:610`, só para o assento 0) e `Q7` (`sala.ts:561`, sem o `rodadaInicio`), cada
     uma com `rc=1`.
   [Fonte: `docs/qa/gates/e4.3-sala-pura.yml`, achado `E43-TST-002`; `src/net/sala.ts:337-338, 561, 610`;
   `src/tools/determinism.ts:1375-1387`]

5. **Três caminhos sem regressão, obrigatórios aqui (`E43-TST-003`)** — opcionais no gate, mas baratos e a
   story já existe para o fim acima:
   - **(i) Teto de ticks.** Uma sala descartável criada com `tetoDeTicks` pequeno na configuração
     (`ConfigDaSala.tetoDeTicks`, `sala.ts:131`, validado em `criarSala`, `sala.ts:252-254`). Conduzir a
     rodada até o teto e conferir que sai o snap final no tick do teto, seguido do `rodadaFim` com
     `resultado.ticks === tetoDeTicks`, pelo mesmo ramo de `world.over` (`sala.ts:583`, `avancarUmTick`).
     **Neste caminho o snap final tem `over: false`**, porque o mundo não acabou e quem encerrou foi o
     teto. O @po conferiu por execução (v1.1, `tetoDeTicks: 30`: snap final `over:false, winner:-1`,
     `rodadaFim.resultado.ticks` 30, um `rodadaFim` por assento). A linha `flush` de hoje ("último snap com
     over:true") vale para a Bo5, não para este caso. Contrafactual: a mutação `Q8` (teto conferido com `>`
     em vez de `>=`) sai com `rc=1`.
   - **(ii) Reassentamento em `builds` com o prazo restante.** Uma sala descartável levada à fase `builds`,
     com um assento caindo e reassentando enquanto o prazo de RF-04 está correndo (`n.prazoDeBuilds !==
     null`). Conferir que o reassentado recebe `{t:'prazo', terminaEmMs}` com o **restante** (prazo −
     decorrido), como `assentar()` já calcula em `sala.ts:367` via `msgPrazo`. Contrafactual: a mutação
     `Q12` (reassentamento em `builds` sem reenviar o `{t:'prazo'}`) sai com `rc=1`.
   - **(iii) Queda em `loja` ou em `builds` abrindo pausa por conta própria.** Uma sala descartável em que um
     assento cai durante a fase `loja` ou `builds` (não durante uma rodada, e não encadeada por um estouro de
     prazo anterior — o caminho que a guarda de hoje já exercita via `salaNegativos`/R-02 em rodada).
     Conferir que a queda sozinha abre a pausa (`sala.ts:414`, `if (n.pausa === null) n.pausa = { desde:
     agora }`), com o W.O. da fase correspondente saindo no estouro do prazo de desconexão (`estourarPausa`,
     `sala.ts:653-658`: `buildPadrao` do ausente em `builds`, `pronto` do ausente em `loja`). Em `builds`, a
     queda tem de acontecer cedo o bastante para o prazo de R-02 (20 s) estourar antes do prazo de RF-04
     (30 s). Com a configuração padrão, isso quer dizer nos primeiros 10 s da fase. Senão o relógio de RF-04
     produz o `buildPadrao` primeiro, e o caso passa a testar outra coisa (§11.6.2, M-6, mede exatamente
     essa janela). Contrafactual: a mutação `Q13` (pausa condicionada a `n.rodada !== null`) sai com
     `rc=1`.
   [Fonte: `docs/qa/gates/e4.3-sala-pura.yml`, achado `E43-TST-003`; `src/net/sala.ts:131, 252-254, 367,
   414, 583`]

6. **Contrafactual — as 12 mutações fazem `sim:check` sair com código diferente de 0.** Cada uma aplicada a
   `src/net/sala.ts` numa cópia descartável do commit desta story (nunca na árvore de trabalho
   compartilhada), rodada com `node src/tools/determinism.ts` e revertida, com o resultado (rc e a linha ✗
   relevante) registrado no Dev Agent Record:
   - **Q3** — `d.jogador !== j` conferido só quando `d.t === 'draft'` (`sala.ts:449`);
   - **uma mutação por variante nova** — `build`, `buildPadrao`, `pronto`, `compra`, `trocaDeBuild`: cada
     uma isenta só a si mesma da checagem (`msg.d.t !== '<variante>' && msg.d.jogador !== j`) (5 mutações);
   - **Q5** — `enviarVisao` só para `j === 0` (`sala.ts:338`);
   - **Q6** — `rodadaFim` só para o assento 0 (`sala.ts:610`);
   - **Q7** — rodada sem `rodadaInicio` (`sala.ts:561`);
   - **Q8** — teto de ticks com `>` no lugar de `>=` (`sala.ts:583`);
   - **Q12** — reassentamento em `builds` sem reenviar o `{t:'prazo'}` restante (`sala.ts:367`);
   - **Q13** — pausa condicionada a `n.rodada !== null`, isolando a queda em `loja`/`builds` (`sala.ts:414`).

   As 12 têm de sair com código diferente de 0. Uma mutação que não reprove com a guarda nova é achado, não
   ajuste silencioso da guarda.
   [Fonte: `docs/qa/gates/e4.3-sala-pura.yml`, "Mutações próprias — não pegas"; `docs/stories/e4.3.sala-pura.story.md`
   Change Log v1.9.0]

7. **Escopo de arquivos, fechado.** Esta story abre **só** `src/tools/determinism.ts`, e dentro dele **só**
   o bloco `sala pura` (de `// ------------------------------------------- sala pura (e4.3, AC 11 e 16)`
   até o fim de `guardaSala()`, hoje `determinism.ts:1295-1925` na árvore vigente — a âncora é o nome da
   seção e da função, porque `debt.12` pode deslocar as linhas). Proibidos, sem exceção: `src/net/sala.ts`,
   `src/net/codec.ts`, o bloco `codec do fio` de `determinism.ts` (território de `debt.12`), `package.json`
   (nenhum script novo), `src/net/protocolo.ts`, `src/net/snapshot.ts`, `src/net/projecao.ts`, `src/sim/`,
   `src/match/`, `src/shop/`, `src/bot/`, `src/chars/`, `src/client/`, qualquer outro arquivo de
   `src/tools/` além de `determinism.ts`, e `docs/` (exceto a própria story).

   Se, ao escrever um caso novo dos AC 3, 4 ou 5, o `@dev` encontrar um comportamento do código de hoje que
   **não** corresponde ao que o caso exige — por exemplo, uma variante sem momento alcançável em que
   `aplicar()` a aceitasse, ou um assento conectado que a sala de hoje realmente não avisa —, a story
   **para** nesse ponto, registra o achado no Dev Agent Record com detalhe suficiente para reproduzir, e
   **escala ao @po/@architect**. Um caso novo que falha contra o código de hoje é achado, não desvio de
   escopo — não se corrige `sala.ts` para fazer o caso passar.
   [Fonte: `docs/stories/e4.3.sala-pura.story.md` Change Log v1.9.0, item (4)(d); `docs/stories/debt.12.guarda-do-fio-tabela-e-fixture-congelada.story.md`
   AC 7, mesmo padrão]

8. **Sequenciamento.** `src/tools/determinism.ts` é disputado pelas stories da ordem `e4.8` →
   `debt.11` → `e4.9` → `e4.3` → `debt.12` → `debt.14` → `e4.10` → `e4.6`. Esta story:
   - **Pré-condição de início:** o commit de implementação de `debt.12` existe, e `git status --short
     src/tools/determinism.ts` sai vazio. A Task 0 registra no Dev Agent Record o hash de `debt.12` usado
     como base.
   - O escopo é conferido por `git show --stat <commit(s) desta story>`, **nunca** pela árvore de trabalho
     compartilhada, porque `e4.10` e `e4.6`, que vêm depois nesta ordem, podem já ter começado a preparar
     mudanças locais.
   - **`e4.10` começa depois do commit de implementação desta story**, pela mesma regra (`git status
     --short src/tools/determinism.ts` vazio), e também edita `src/net/sala.ts`, que esta story proíbe.
   - Esta story tem de ter commit de implementação **antes da Task 1 de `e4.4`** — a pré-condição já está
     registrada em `e4.4` v1.7.0 (AC 1, Task 0), com a ordem atualizada em v1.8.0.
   - **Nota para `e4.10`** (registrada aqui porque a story dela ainda não existe; o @sm a leva para o
     "Depende de" e para o AC de guarda dela ao redigi-la). A `e4.10` muda o que a sala envia: um
     `{t:'evento'}` por evento, logo depois do `{t:'visao'}` da transição, só ao dono quando o evento tem
     `jogador` (§11.6.2, Decisão 1, "O filtro por assento" e "Ordem nos envios"). As conferências desta
     story têm de **continuar verdes** depois da `e4.10`, com o `sim:check` em ✓, ou ser **estendidas pela
     `e4.10`**, nunca afrouxadas por ela: a cobertura por assento do AC 4 (`visao`, `rodadaInicio`,
     `rodadaFim`), o `{t:'prazo'}` do reassentamento em `builds` (AC 5 ii) e os W.O. de `loja`/`builds`
     (AC 5 iii, cujo `buildPadrao` é exatamente o evento privado de M-6). A conferência de entrega do
     `{t:'evento'}` por assento (o filtro `jogador`, o público em `rodadaFim`/`partidaFim`, e nenhum
     reenvio no reassentamento) é escopo da `e4.10`, que a acrescenta ao lado do AC 4 desta story.
     **Para esta story não criar trabalho à toa para a `e4.10`**, as conferências NOVAS dos AC 4 e 5
     contam os envios POR TIPO e por assento (quantos `visao`/`rodadaInicio`/`rodadaFim`/`prazo` cada
     assento recebeu) e não fixam a lista completa de envios de um passo. A única lista completa permitida
     é a da recusa do AC 3, exatamente um `{t:'erro'}` ao remetente: recusa não tem transição, então não
     tem evento. As listas completas que a guarda de hoje já fixa (por exemplo `'0:snap,0:rodadaFim,0:visao'`
     no W.O., `determinism.ts:1839`, e `[sala,visao,rodadaInicio]` no reassentamento, `:1654`) são da
     `e4.3`, ficam como estão, e a `e4.10` as atualiza.
   [Fonte: `docs/architecture-e4.md` §11.6.1 e §11.6.2 (`188998e`); `docs/stories/e4.3.sala-pura.story.md`
   Change Log v1.9.0; `docs/stories/e4.4.servidor-ws.story.md` v1.7.0 e v1.8.0]

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type**: Architecture / Testing (extensão de guarda de regressão — cobertura por variante e por
assento —, sem regra de jogo nova)
**Secondary Type(s)**: — 
**Complexity**: Medium — um único arquivo (`src/tools/determinism.ts`, só o bloco `sala pura`), com 12
mutações de contrafactual e coordenação de sequência com `debt.12` (antes), `e4.10` e `e4.6` (depois) na
mesma árvore.

### Specialized Agent Assignment

**Primary Agents**:
- @dev
- @qa (quality gate — confere que as 12 mutações de fato reprovam o `sim:check`, que o controle positivo
  existe para cada variante nova de `E43-TST-001`, que `E43-TST-002` cobre visão/rodadaInicio/rodadaFim por
  assento conectado, não só por assento que já recebeu algo, e que `src/net/sala.ts` não foi tocado)

**Supporting Agents**:
- @po (dono do roteamento que criou esta story; roteia qualquer achado novo que a story encontre contra o
  código de hoje, não implementa)

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
- As 12 mutações do contrafactual (Q3 + 5 por variante + Q5, Q6, Q7 + Q8, Q12, Q13) de fato fazem
  `sim:check` sair com código diferente de 0 (AC 6)
- Cada variante nova de `E43-TST-001` tem controle positivo (a mesma decisão, do assento dono, é aceita) —
  sem ele o caso não prova nada (AC 3)
- `E43-TST-002` confere entrega a TODO assento conectado, não só ao que já aparece nos envios do passo (AC 4)
- `src/net/sala.ts`, `src/net/codec.ts` e o bloco `codec do fio` não foram tocados; um caso que falhasse
  contra o código de hoje foi registrado como achado, não corrigido por dentro da story (AC 7)

**Secondary Focus**:
- O `diff` do `sim:check` antes × depois não muda nem move nenhuma linha fora do bloco `sala pura` (AC 2)
- Os três casos de `E43-TST-003` (teto, reassentamento em builds, queda em loja/builds) usam salas
  descartáveis, nunca a Bo5 principal (AC 5)

## Tasks / Subtasks

- [ ] Task 0 — Pré-condição de sequência (AC: 8)
  - [ ] Confirmar que o commit de implementação de `debt.12` existe; registrar o hash usado como base no Dev
        Agent Record
  - [ ] Confirmar que `git status --short src/tools/determinism.ts` sai vazio antes de começar

- [ ] Task 1 — Recusa de `d.jogador` alheio por variante (AC: 3, 6)
  - [ ] Para cada uma de `build`, `buildPadrao`, `pronto`, `compra`, `trocaDeBuild`: encontrar (ou construir
        numa sala descartável) um momento em que `aplicar()` aceitaria a decisão enviada pelo assento do
        outro jogador
  - [ ] Repetir o caso "→ sala" (`determinism.ts:1517-1527`) para cada variante: `{t:'erro'}` só ao
        remetente, `partida` idêntica por referência, `decisoes` sem entrada nova
  - [ ] Acrescentar o controle positivo por variante: a mesma decisão, do assento dono, é aceita
  - [ ] Se alguma variante não tiver momento alcançável, parar e escalar ao @po (registrar no Dev Agent
        Record) em vez de prosseguir
  - [ ] Aplicar Q3 e as 5 mutações por variante numa cópia descartável de `sala.ts`; confirmar `rc=1` em
        todas; reverter

- [ ] Task 2 — Entrega a todo assento conectado (AC: 4, 6)
  - [ ] Estender `conduzir` (`determinism.ts:1345-1389`) para conferir, em todo passo em que
        `c.sala.partida` muda de identidade, que cada assento conectado recebeu ao menos um `{t:'visao'}`
  - [ ] Por rodada: conferir exatamente um `rodadaFim` por assento conectado no fim, e pelo menos um
        `rodadaInicio` por assento conectado (o assento que caiu e voltou recebe dois, o da largada e o do
        reassentamento — AC 4); a queda no draft (§6) é exceção esperada da regra da visão
  - [ ] Contar envios por tipo e por assento, sem fixar a lista completa de um passo (AC 8, Nota para
        `e4.10`)
  - [ ] Se a sala de hoje violar a regra em algum caminho, parar e escalar ao @po (registrar achado) em vez
        de editar `sala.ts`
  - [ ] Aplicar Q5, Q6 e Q7 numa cópia descartável de `sala.ts`; confirmar `rc=1` nas três; reverter

- [ ] Task 3 — Três casos sem regressão (AC: 5, 6)
  - [ ] (i) Sala descartável com `tetoDeTicks` pequeno; conferir snap final e `rodadaFim` no tick do teto;
        aplicar Q8, confirmar `rc=1`, reverter
  - [ ] (ii) Sala descartável em `builds` com queda e reassentamento durante o prazo; conferir
        `{t:'prazo', terminaEmMs}` com o restante no reassentado; aplicar Q12, confirmar `rc=1`, reverter
  - [ ] (iii) Sala descartável com queda em `loja` e em `builds` (sem estouro de prazo anterior), conferindo
        que a pausa abre por conta própria; aplicar Q13, confirmar `rc=1`, reverter

- [ ] Task 4 — Verificação (AC: 1, 2, 6, 7, 8)
  - [ ] `npm run check` — 0 erros
  - [ ] `npm run sim:check` antes e depois da mudança — golden hash idêntico; diff só dentro do bloco
        `sala pura`
  - [ ] Confirmar as 12 mutações com `rc=1`, cada resultado registrado no Dev Agent Record
  - [ ] `git show --stat` do(s) commit(s) desta story, restrito ao bloco `sala pura` de
        `src/tools/determinism.ts`

## Dev Notes

### O bloco `sala pura` hoje, e onde cada AC entra (fonte: `src/tools/determinism.ts`, árvore vigente antes
de `debt.12`; as linhas vão se mover com `debt.12`, então a âncora é o nome da seção/função)

```
1295 // ------------------------------------------- sala pura (e4.3, AC 11 e 16)
1333 interface Condutor { sala; hz; rotulo; problemas; conf }
1345 function conduzir(c, agora, entrada): Envio[]           <- AC 4 estende esta função
1375-1387   checagem de {t:'visao'} recebido == visaoPara    <- não confere que TODO assento receba
1446 function bo5PelaSala(g, problemas): ResumoBo5            <- Task 1 usa o roteiro da Bo5 quando der
1517-1527   caso "→ sala", só draft, jogador 1                <- AC 3 estende para as outras 5 variantes
1757 function salaNegativos(problemas)                        <- Task 3 acrescenta os 3 casos aqui
1879 function guardaSala(): { linhas; problemas }
1883-1885   tripwires tetoDeTicks/snapshotHz
1911-1923   as 6 linhas de saída (sala pura, bo5, flush, assentos, autoridade, negativos)
```

[Fonte: `src/tools/determinism.ts:1295-1925`]

### A checagem de `d.jogador` alheio hoje, e o gap exato (AC 3)

```ts
// sala.ts:446-454
if (msg.d.jogador !== j) {                    // <- comparação única, igual para as 6 variantes
  erro(envios, chave, `decisão em nome do jogador ${msg.d.jogador} vinda do assento do jogador ${j} — recusada`)
  return
}
decidir(n, msg.d, agora, envios, chave)
```

O código de `sala.ts` já está correto — a checagem vale para as 6 variantes, sem `switch (d.t)`. O gap é só
na GUARDA (`determinism.ts:1517-1527`), que testa a checagem com uma única variante (`draft`). É a mesma
classe de risco de `E48-TST-001`: guarda por caso do AC não é guarda por variante.

`Decisao` tem 6 variantes (`match/types.ts:148-154`): `draft`, `build`, `buildPadrao`, `compra`,
`trocaDeBuild`, `pronto`. Fases em que cada uma é legal, por `aplicar()`/`redutor.ts` (não checa
`remetente`, só o estado do `d.jogador`):
- `build` — fase `builds`, `!e.prontos[d.jogador]` (`redutor.ts:262-270`)
- `buildPadrao` — fase `builds`, `!e.prontos[d.jogador]` (`redutor.ts:292-294`)
- `compra` — fase `loja`, `!e.prontos[d.jogador]`, item existente no catálogo, `validarCompra` da lista
  futura sem problema e ouro suficiente (`redutor.ts:327-348`)
- `trocaDeBuild` — fase `loja`, `!e.prontos[d.jogador]`, ouro suficiente para `economia.precoTrocaDeBuild`
  (`redutor.ts:375-385`)
- `pronto` — fase `builds` OU `loja`, e `!e.prontos[d.jogador]` (`redutor.ts:401-405`)

[Fonte: `src/net/sala.ts:446-454`; `src/match/redutor.ts:262-405`; `src/match/types.ts:148-154`]

### Momento de aceitação por variante — conferido por execução pelo @po (v1.1)

Sonda descartável: `git archive 29d7b51 src` num scratch. Ela importa `criarSala`/`passo` reais,
`CHARS`, `hash` e `CATALOGO`, e roda uma sala com `tetoDeTicks: 30`, seed 1, os dois assentados e o draft
feito pelas decisões de cada dono. Nenhum arquivo do repositório foi tocado. Para cada variante, o assento
do OUTRO jogador manda a decisão (resultado: 1 `{t:'erro'}` só a ele, `partida` idêntica, `decisoes` sem
entrada nova), e em seguida o assento DONO manda a mesma decisão (resultado: `partida` muda de identidade):

| variante | momento usado | recusa pela sala | controle positivo |
|---|---|---|---|
| `build` (jogador 1) | `builds`, antes de qualquer pronto | ✓ | ✓ aceita |
| `buildPadrao` (jogador 1) | `builds`, depois do `build` acima | ✓ | ✓ aceita (jogador 1 fica pronto) |
| `pronto` (jogador 0) | `builds`, depois do anterior | ✓ | ✓ aceita (a rodada 0 abre) |
| `compra` (jogador 1) | `loja` depois da rodada **1** (ouro [9, 9]) | ✓ | ✓ aceita |
| `trocaDeBuild` (jogador 0) | a mesma `loja`, jogador diferente do da compra | ✓ | ✓ aceita |
| `pronto` (jogador 1) | a mesma `loja` | ✓ | ✓ aceita |

Na `loja` depois da rodada 0 o ouro é [4, 4], e `aplicar()` recusa as duas: "ouro insuficiente: jogador 1
tem 4, 'chumbo' custa 6" e "a troca custa 5". Isso vem de `ouroInicial: 0`, `rendaPorRodada[0] = 4`,
`precoTrocaDeBuild: 5` (`match/economia.ts:35-42`) e `PRECO_PROVISORIO = 6` (`shop/catalogo.ts:72`).
`compra` e `trocaDeBuild` foram feitas em jogadores DIFERENTES porque, com 9 de ouro, uma consome o que a
outra precisaria (9 − 6 = 3 < 5, e 9 − 5 = 4 < 6). O `tetoDeTicks` pequeno encerra as rodadas 0 e 1 em 30
ticks cada, com empate. A economia avança igual (D-02), então chegar à segunda `loja` custa pouco, e é o
mesmo recurso do AC 5 (i). Uma Bo5 sempre tem a segunda `loja`, porque ninguém faz 3 vitórias em 2 rodadas.

**Resposta à pergunta de alcançabilidade:** há momento alcançável pela guarda da sala para as cinco
variantes novas, inclusive `trocaDeBuild` (só a partir da segunda `loja`) e `buildPadrao` (só na janela
única de `builds`, antes do prazo de RF-04, e numa sala descartável, porque a Bo5 nunca o envia).

### A checagem de visão/rodada hoje, e o gap exato (AC 4)

```ts
// determinism.ts:1375-1387, dentro de conduzir()
for (const { assento, msg } of r.envios) {
  ...
  if (msg.t === 'visao') {
    c.conf.visoes++
    ultimaVisao.set(assento, msg.v)             // <- só registra o que CHEGOU
  }
}
for (const [assento, v] of ultimaVisao) {       // <- itera só quem chegou, nunca quem faltou
  const j = s.assentos.indexOf(assento)
  if (j < 0 || !profundamenteIgual(v, visaoPara(s.partida, j as Jogador))) {
    falha(`{t:'visao'} endereçado a '${assento}' não é visaoPara(estado, jogador ${j}) — broadcast ou projeção alheia (AC 8)`)
  }
}
```

A guarda confere a PROJEÇÃO de quem recebeu, nunca a COBERTURA (quem deveria ter recebido e não recebeu).
`enviarVisao` (`sala.ts:337-338`), `iniciarRodada` (`sala.ts:549-561`) e `encerrarRodada`
(`sala.ts:595-611`) já usam `paraCadaAssento`/`enviarAosDois`, que endereçam aos dois assentos conectados —
o código está correto; falta a guarda de cobertura.

[Fonte: `src/tools/determinism.ts:1375-1387`; `src/net/sala.ts:316-321, 337-338, 561, 610`]

### Os três casos de `E43-TST-003` — onde cada um entra em `sala.ts`

- **Teto de ticks:** `ConfigDaSala.tetoDeTicks` (`sala.ts:126-131`), validado em `criarSala`
  (`sala.ts:252-254`: `Number.isInteger` e `> 0`). Usado em `avancarUmTick` (`sala.ts:583`:
  `w.tick >= n.config.tetoDeTicks`). A guarda de hoje (`guardaSala`, `determinism.ts:1883-1885`) só confere
  que o PADRÃO bate com `MAX_ROUND_TICKS`, nunca exercita um teto customizado numa rodada de verdade.
- **Reassentamento em `builds`:** `assentar()` (`sala.ts:358-372`). Reassentamento (`ja !== null`) reenvia
  `{t:'sala'}` sempre, `{t:'visao'}` se a sala não está `aguardando`, e — a linha do caso — `{t:'prazo'}`
  via `msgPrazo` **só se** `n.partida.fase === 'builds' && n.prazoDeBuilds !== null` (`sala.ts:367`).
  `msgPrazo` (`sala.ts:346-350`) calcula o restante como `Math.max(0, (n.prazoDeBuilds ?? agora) - agora)`.
  A guarda de hoje só exercita reassentamento DURANTE UMA RODADA (`determinism.ts:1644-1657`, `iRod === 1`),
  nunca em `builds`.
- **Queda abrindo pausa por conta própria em `loja`/`builds`:** `cair()` (`sala.ts:393-415`). Fora da fase
  `draft` (que devolve a sala a `aguardando`, `sala.ts:402-412`), toda queda com `n.pausa === null` abre a
  pausa (`sala.ts:414`), **independente da fase da partida** (`rodada`, `builds` ou `loja`). A guarda de hoje
  só exercita a queda DURANTE UMA RODADA (`salaNegativos`, `determinism.ts:1828-1842`, W.O. de R-02), nunca
  em `loja` ou `builds` isoladamente — o W.O. de `loja` que a guarda já confere (`determinism.ts:1843-1850`)
  vem encadeado do estouro anterior na rodada, não de uma queda nova em `loja`.

[Fonte: `src/net/sala.ts:126-131, 252-254, 346-350, 358-415, 583`; `src/tools/determinism.ts:1644-1657,
1828-1850, 1883-1885`]

### O que esta story explicitamente NÃO faz

- Não corrige nem toca `src/net/sala.ts` nem `src/net/codec.ts`. O código de ambos está correto hoje — o
  gap é só de cobertura de teste. Um caso novo que falhe contra o código de hoje é achado, e a story para
  (AC 7).
- Não toca o bloco `codec do fio` de `determinism.ts` — território de `debt.12`.
- Não decide nem discute a política de desconexão de R-02 (isso é decisão do @pm/usuário, registrada como
  provisória em `POLITICA_DE_DESCONEXAO_PROVISORIA`, `sala.ts:99-102`). Os casos de queda desta story usam
  a política provisória como está.
- Não move nem renumera os ACs de `e4.3` — a story origem permanece Done, com o texto dela intocado.

### Testing

- `npm run check` — 0 erros.
- `npm run sim:check` — rodado antes e depois da mudança; golden hash idêntico; `diff` da saída completa só
  com linhas do bloco `sala pura` mudando de texto (contadores/cobertura, vereditos ✓ inalterados) ou linhas
  novas dentro dele.
- As 12 mutações do contrafactual (Q3, uma por variante nova de `build`/`buildPadrao`/`pronto`/
  `compra`/`trocaDeBuild`, Q5, Q6, Q7, Q8, Q12, Q13), cada uma aplicada a `src/net/sala.ts` numa cópia
  descartável, testada e revertida — todas com `sim:check` saindo com código diferente de 0.
- Controle positivo presente e verde para cada uma das 5 variantes novas de `Decisao` na checagem do AC 3
  (a decisão aceita pelo assento dono muda a identidade de `c.sala.partida`). O `draft` já tem o seu: a
  mesma decisão, reenviada pelo dono em `determinism.ts:1530`, tem de ser aceita, ou a contagem de
  rejeições diverge do arnês.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-09-21 | 1.0 | Story criada a partir dos achados `E43-TST-001` (medium), `E43-TST-002` (medium) e `E43-TST-003` (low) do gate de `e4.3` (`docs/qa/gates/e4.3-sala-pura.yml`), conforme roteamento do @po em `docs/stories/e4.3.sala-pura.story.md` Change Log v1.9.0 (commit `c10f287`). Escopo fechado: só `src/tools/determinism.ts`, e dentro dele só o bloco `sala pura`; `src/net/sala.ts`, `src/net/codec.ts` e o bloco `codec do fio` são proibidos, e um caso novo que falhe contra o código de hoje é achado a escalar, não correção dentro da story. Sequenciada depois do commit de implementação de `debt.12`, na ordem `e4.8` → `debt.11` → `e4.9` → `e4.3` → `debt.12` → `debt.14` → `e4.6`. Precondição registrada em `e4.4` v1.7.0 (AC 1, Task 0): commit de implementação desta story antes da Task 1 de `e4.4`. Status: Draft. | River (@sm) |
| 2026-09-21 | 1.1 | **Validada pelo @po (`*validate-story-draft`): GO 9/10. Status Draft → Ready.** Conferido contra o código, não contra o texto da story: `src/net/sala.ts` e `src/match/{types,redutor,economia}.ts` na árvore de `29d7b51`, e o bloco `sala pura` de `determinism.ts` em `HEAD:` (a árvore de trabalho tem mudanças locais da `debt.12`, não conferidas). Uma sonda descartável (`git archive 29d7b51 src` num scratch) rodou `passo()` real. **Checklist de 10 pontos:** título ✓, descrição ✓, ACs testáveis ✓ (depois das correções abaixo), escopo IN/OUT ✓, dependências ✓ (com a ordem nova), complexidade ✓ (Medium), valor ✓, riscos ⚠ (as saídas por escalada estão escritas, mas faltava a interação com a `e4.10`; foi acrescentada, e o item fica parcial), DoD ✓, alinhamento com gate e spec ✓. **Linhas conferidas, e corretas:** `sala.ts:131, 252-254, 316-321, 337-338, 346-350, 358-372, 367, 369, 393-415, 402-412, 414, 446-454, 449, 549-561, 583, 595-611, 610`; `types.ts:148-154`; `determinism.ts` (HEAD) `:1295, 1345, 1375-1387, 1446, 1517-1527, 1644-1657, 1757, 1828-1850, 1879, 1883-1885, 1911-1923`, fim do bloco `:1925`. **Correções no lugar:** (1) **AC 3, alcançabilidade (a pergunta do coordenador).** Há momento alcançável pela guarda da sala para as cinco variantes novas, provado com controle negativo e positivo para cada uma (tabela nova em Dev Notes). Duas restrições que a story não dizia e que fariam o @dev escalar sem motivo: `compra` e `trocaDeBuild` são RECUSADAS por `aplicar()` na primeira `loja` (ouro [4,4] contra 6 e 5, `economia.ts:35-42`, `catalogo.ts:72`) e só são aceitas da segunda `loja` em diante (ouro [9,9]), em jogadores diferentes; `build`/`buildPadrao` têm uma janela só (a `builds` que o draft abre; toda rodada termina em `loja`, `redutor.ts:482`). Os controles positivos de `buildPadrao` e `trocaDeBuild` não cabem na Bo5 (o `buildPadrao` do roteiro não é enviado, `determinism.ts:1315-1317/1483-1486`; a seed 1 não tem `trocaDeBuild`, §11.6.2 M-5; e uma decisão aceita a mais quebraria Bo5 = arnês e o log de `:1576`), então vão numa sala descartável. O `tetoDeTicks` pequeno do AC 5 (i) torna a segunda `loja` barata. (2) **AC 4: duas regras que acusariam em código não mutado.** "Exatamente um `rodadaInicio`" falha no reassentamento da rodada 1 da Bo5, que recebe o da largada mais o do reassentamento (`sala.ts:561` + `:369`, já conferido em `determinism.ts:1654`). Passou a "pelo menos um `rodadaInicio`, exatamente um `rodadaFim` a quem está conectado no fim". A regra da visão ganhou a condição "sala termina o passo `jogando`" e a exceção da queda no draft (§6, `sala.ts:402-412`: a `partida` é recriada e só sai `{t:'sala'}`), que roda hoje em `salaNegativos` (`:1866`). O "pelo menos um `visao`" do @sm foi mantido contra o "exatamente um" do gate: o estouro de RF-04 dá dois `enviarVisao` num passo (`sala.ts:624-627`). (3) **AC 5 (i):** "snap final (`over: true`)" estava errado. No teto o mundo não acabou, e o snap final tem `over:false` (medido: `tetoDeTicks` 30, `over:false, winner:-1`, `rodadaFim.resultado.ticks` 30). A spec de v1.9.0 não pedia `over`; o critério passou a ser snap no tick do teto mais `resultado.ticks === tetoDeTicks`. (4) **AC 5 (iii):** em `builds`, a queda tem de acontecer nos primeiros 10 s (prazo de R-02 de 20 s < prazo de RF-04 de 30 s), senão o RF-04 produz o `buildPadrao` primeiro. (5) **Dev Notes:** as condições de `compra` (faltava `validarCompra`, `:327-348`), `trocaDeBuild` (`:375-385`) e `pronto` (não é "sem outra condição": exige `!prontos[d.jogador]`, `:401-405`); `interface Condutor` está em `:1333`, não em `:1332`. **Sequenciamento (coordenado com a outra rodada do @po):** a ordem de `determinism.ts` passou a `e4.8` → `debt.11` → `e4.9` → `e4.3` → `debt.12` → `debt.14` → **`e4.10`** → `e4.6` ("Depende de", AC 8, CodeRabbit). A citação literal da spec, item (g), ficou como estava, com nota. AC 8 diz agora que `e4.10` começa depois do commit desta story. **Nota para `e4.10`** (AC 8; o arquivo da story ainda não existe): ela muda o que a sala envia (`{t:'evento'}` depois de cada `{t:'visao'}`, só ao dono quando tem `jogador`, §11.6.2). As conferências dos AC 4/5 têm de continuar verdes ou ser estendidas por ela, nunca afrouxadas. A cobertura por assento do `{t:'evento'}` é dela. [AUTO-DECISION] Fixar a lista completa de envios nas conferências novas ou contar por tipo? → Contar por tipo e por assento; a única lista completa é a da recusa do AC 3, que não tem transição (motivo: uma lista completa quebraria na `e4.10` sem regressão nenhuma, e a contagem por tipo pega Q5/Q6/Q7 igual). As listas completas da `e4.3` (`:1654`, `:1839`) ficam; atualizá-las é da `e4.10`. ACs 1, 2, 6 e 7 e o total de 12 mutações não mudaram. | Pax (@po) |
