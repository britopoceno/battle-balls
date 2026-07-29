---
name: project-migracao-debt
description: Épico debt.0-debt.7 FECHADO em 2026-07-28 com golden hash intacto; lições dos 8 gates e o que continua aberto para a Fase 3 (passo 8, itens)
metadata:
  type: project
---

A story `debt.0` (Done em 2026-07-28) travou 5 seeds (1, 2, 3, 7, 11) com hash/ticks/vencedor
em `BASELINE` dentro de `src/tools/determinism.ts`. As stories `debt.1` a `debt.7` são uma
migração de arquitetura em 8 passos (`docs/architecture.md` §6.1) que declara **hash idêntico
nos passos 1 a 7**.

**Why:** antes só havia autoconsistência (rodar a seed duas vezes e comparar entre si), que
continua verde mesmo se uma refatoração mudar silenciosamente o comportamento do jogo. Sem o
baseline, a migração seria feita no escuro.

**How to apply:** ao revisar qualquer `debt.1`–`debt.7`, um `BASELINE` alterado é sinal de
alarme, não de progresso — exige justificativa registrada no commit e provavelmente significa
que a refatoração mudou o jogo. Sempre conferir a tabela contra o commit de `debt.0`
(`d52c23d`), não só rodar o teste: o teste passa trivialmente se alguém "atualizou" o baseline.

**Ponto cego estrutural do golden hash (descoberto no gate de `debt.2`):** o baseline roda um
roster FIXO de golem+vex (`determinism.ts:15-18`). Qualquer regressão que só se manifeste com
outro personagem, ou com valores fora da faixa desses dois, passa verde. Concretamente: `debt.2`
tornou os clamps `ABS_MIN`/`ABS_MAX` de `stats.ts` load-bearing (agora `stat.radius`/`drag`/
`maxSpeed` são lidos de verdade) e o hash não pode detectar isso porque golem e vex estão dentro
de todas as faixas. Ao revisar `debt.3`–`debt.7`, perguntar sempre: *essa mudança poderia quebrar
algo que golem+vex não exercitam?*

**Técnica que funcionou bem no gate de `debt.2` — controle negativo:** quando a story proíbe uma
mudança, não basta verificar que ninguém a fez; aplicar a mudança proibida numa cópia isolada da
árvore (scratchpad, working tree jamais tocada) e mostrar que o hash quebra. Prova ao mesmo tempo
que o arnês é sensível e que a proibição tinha fundamento. No caso do `knockback`, produziu 11
desvios e inversão de vencedor em 2 seeds.

**O ponto cego tem nome e índice (confirmado no gate de `debt.3`):** o roster do baseline fixa
`passiveIndex: 0` para os dois personagens. No Golem isso é a Âncora (coberta), mas no Vex é o
**Predador** — a passiva **Fantasma nunca é executada pelo golden hash**. Em `debt.3` isso teve
consequência concreta: a mudança de maior risco da story (remover a multiplicação por
`mods.speed`) passaria verde mesmo errada. Ao revisar `debt.4`–`debt.7`, sempre checar se o
código tocado só roda com `passiveIndex`/`abilityIndex` 1.

**Técnica decisiva do gate de `debt.3` — trace bit a bit entre árvores.** Quando uma story muda
uma FÓRMULA (não só a origem de um número), comparar hash final é fraco. O que resolve:
`git archive HEAD src | tar -x -C scratchpad/old`, escrever um `.mjs` no scratchpad que importa
`src/sim/world.ts` de uma raiz arbitrária via `pathToFileURL` (Node 24 faz type-stripping de
`.ts` direto), e amostrar tick a tick a grandeza antiga vs. a nova com `.toPrecision(20)`,
varrendo todas as permutações de roster. Em `debt.3`: 125.464 amostras idênticas, e o controle
negativo (perturbar as constantes numa terceira cópia) divergiu 123.958 delas. Barato e conclusivo.

**Recomendação em aberto para `debt.4`–`debt.7`:** exigir **um commit por troca individual**. Em
`debt.2` o AC pedia `sim:check` isolado por troca e em `debt.3` a Debug Log narrou 11 correções
sequenciais — nos dois casos tudo chegou numa working tree única, e só o estado FINAL é auditável.
Já pedido em dois gates seguidos sem efeito.

**Pendência aberta que `debt.6` precisa absorver (achado QA-001 do gate de `debt.4`):**
`MIN_ABILITY_CD_MS = 400` é MENOR que a maior janela de dano por contato do roster (450 ms,
`golem.ts:52`), embora a justificativa do próprio piso (em `architecture.md` §3.3 e no comentário
de `world.ts`) diga que ele existe para impedir o cooldown de descer abaixo dessa janela. Hoje é
código inalcançável (`cdSpeed ≤ 2.0` ⇒ cd efetivo mínimo 3500 ms). O risco é que a invariante A2
de `debt.6` — `max(MIN_ABILITY_CD_MS, cd/cdSpeedMax) ≥ W.ms` — **passa verde porque o `max`
escolhe 3500, não porque o piso protege**. Ao revisar `debt.6`, não aceitar essa invariante verde
sem checar o caso `cd` baixo (`cd ≤ 800`), onde o piso vira o termo dominante e falha.

**Armadilha de harness em `world.ts` (custou uma rodada falsa no gate de `debt.4`):** dentro de
`step`, `castCommand` roda ANTES de `recomputeStats`. Um teste que força `b.base.X` depois de
`createWorld` e casta no mesmo tick lê o stat VELHO e produz um falso negativo convincente (o
efeito parece simplesmente não existir). Rodar um `step(world, [])` de aquecimento antes do tick
do cast. Vale para qualquer stat consumido em cast, não só `cdSpeed`.

**Terceira face do ponto cego, agora sobre FÓRMULA (gate de `debt.5`):** quando uma story
introduz uma regra que combina dois valores e o roster tem os dois valores IGUAIS, o hash não
distingue qual regra foi escrita. Em `debt.5` (`restBall` 0.65 nos dois corpos), `Math.max`,
`Math.min`, média e média geométrica devolvem todas 0.65 — só *produto* seria flagrado. Hash
idêntico prova que o comportamento não mudou; **não** prova qual fórmula está no arquivo.
Regra prática para `debt.6`/`debt.7` e para o passo 8 (itens): se a story introduz combinação,
seleção ou escolha entre valores, o gate precisa de harness próprio com valores DIFERENTES.

**Técnica barata que substitui o `git archive` quando basta variar dados (gate de `debt.5`):**
clonar o registro de personagens em vez de copiar a árvore — `{...CHARS, golem: {...CHARS.golem,
restBall: 0.5}}` — e passar para `createWorld`. Depois, recuperar a constante analiticamente do
resultado físico (das velocidades pós-colisão e das massas reais, `e = -imp·invSum/vn - 1`) e
comparar com TODAS as candidatas plausíveis numa tabela. Distingue max/min/média/geométrica/
produto em uma rodada, sem tocar em `src/`. Arquivos ficam no scratchpad e importam `src/` por
`file:///C:/...` (Node faz type-stripping de `.ts` por caminho absoluto também).

**Sempre olhar a ORDEM das chaves quando um literal de stats é reordenado (achado QA-001 de
`debt.5`):** `Ball.base` é montado como literal com `...DEFAULT_STATS` e mover o spread muda a
ordem de inserção, quebrando a coincidência com `STAT_KEYS`/`makeStatBlock` que `stats.ts:71`
declara querer ("mesma hidden class no V8"). É invisível no diff, no `tsc` e no hash. Checar com
`Object.keys(b.base).join() === STAT_KEYS.join()`. Medir antes de escalar a severidade: em
`debt.5` o custo real foi 0,66% em 4M chamadas de `recomputeStats`, ou seja, ruído.

**QA-001 de `debt.4` está FECHADA (gate de `debt.6`):** com `MIN_ABILITY_CD_MS = 500` e a maior janela
de contato em 450 ms, nenhuma ability pode satisfazer A2 vacuamente. Verificado forçando `cd: 800`
(⇒ `cd/2 = 400 < 500`, o piso vira o termo dominante) e vendo A2 reprovar `ms: 550`.

**Buraco conhecido no Pilar 3, aberto depois de `debt.6` (achado QA-001 daquele gate):** `architecture.md`
§4.3 afirma que a Camada 2 (checagem de fase em `dealDamage`) é "exata, pega qualquer caminho de código".
**Não é.** Um `on.collide` que faz `ctx.apply(other, fx.dot(840, 17), self)` (~14 de dano em 1 tick)
atravessa as três camadas: sem `damage(` no bloco (Camada 1), e o dano materializa no tick seguinte em
`tickEffects` sob `phase === 'effect'` (Camada 2). Junto com isso, `openContactWindow` com `source` que
não corresponde a nenhuma janela declarada é silêncio total — A4 só olha personagens **sem**
`contactWindows`. Os dois só são pegos pelo golden hash, que tem roster congelado. Ao revisar `debt.7`,
a Fase 2 ou qualquer personagem novo, verificar se algum deles foi fechado.

**Técnica nova do gate de `debt.6` — provar que uma correção é necessária, não cosmética.** Quando o
@dev alega ter corrigido um bug numa *ferramenta de verificação*, construir um caso que a ferramenta
deveria pegar, confirmar que pega, e então **reverter só a correção** mantendo o mesmo caso. Se o caso
continua sendo pego, a "correção" era cosmética. Em `debt.6` (correção `semComentarios` na Camada 1),
sem a correção a violação passava despercebida — correção load-bearing, confirmada.

**Reentrância e fase: harness sem tocar em `src/`.** Clonar `CHARS` em memória para injetar `on.kill`
que causa mais dano, e zerar `atk.dmg` do atacante para que a morte venha do mecanismo sob teste (o
melee mata antes, senão, e o teste passa pelo caminho errado — custou uma rodada). Depois posicionar as
bolas à mão a cada tick e castar pelo caminho real de produção (`step(world, [cmd])`).

**ÉPICO FECHADO em 2026-07-28 (gate de `debt.7`, PASS).** `debt.0`-`debt.7` todas em Done. Os 5
hashes do baseline (`96de1201`/`f66a7416`/`a8db9c28`/`cb77dbe0`/`6aede2d9`) atravessaram as sete
refatorações sem mover um dígito. **O passo 8 (camada de itens, `src/shop/`, Fase 3) é o primeiro
em que o hash DEVE mudar** — ali, hash alterado vira sinal de progresso e atualizar a tabela do
`BASELINE` passa a ser legítimo, com justificativa no commit. Até lá, a regra de alarme acima
continua valendo. Note que o `BASELINE` hoje vive em `determinism.ts` junto de um `BUILD_BASELINE`
separado (5 variantes de ability/passive index) que fecha o ponto cego de roster descrito acima.

**Técnica decisiva do gate de `debt.7` — matriz 2×2 em vez de dois testes soltos.** Quando o @dev
alega "com o defeito X o teste dispara, sem X não dispara", ele tipicamente roda 2 células e para.
Faltam os controles que **isolam a causa**. Em `debt.7` o @dev testou (vazamento só → não diverge)
e (vazamento + consumidor de `ctx.rand` → diverge), e concluiu que o mecanismo funciona. A célula
ausente era (consumidor de `ctx.rand` só, sem vazamento): sem ela, a divergência podia ser artefato
de ter adicionado consumo de RNG, não do vazamento. Rodei as 4 e a conclusão se sustentou — mas a
conclusão só passou a ser *demonstrada* com o controle. Aplicar sempre que a alegação for causal.

**Quando o AC pede "sem colisão nas seeds testadas", checar se a propriedade é ESTRUTURAL.**
Amostragem responde "não vi colisão"; álgebra responde "não pode haver". Em `deriveSeed`
(`sim/rng.ts`), `seed + streamId × 0x9e3779b9 (mod 2³²)` é injetora porque o incremento é ímpar, e
o finalizador `lowbias32` é composição de bijeções — colisão entre streams é impossível para
**todo** `streamId`, não só o range amostrado. Upgrade gratuito da garantia; vale registrar no gate
para que a Fase 2 não reverifique.

**Cuidado: avalanche média NÃO detecta erro de dígito em constante de hash.** Testei — variantes
com um dígito trocado, e até com shift errado, dão avalanche ~16.000 bits/32 igual à correta.
Para auditar constantes, reimplemente da literatura e compare bit a bit; e verifique se o AC
sequer *depende* delas (em `deriveSeed` não dependia: qualquer multiplicador ímpar preserva a
bijeção, logo o risco era limitado por construção).

**Aberto ao entrar na Fase 3:** (a) o buraco do Pilar 3 descrito acima (dano via `ctx.apply` em
`on.collide` atravessa as 3 camadas; `openContactWindow` com `source` inexistente é silêncio);
(b) `WorldView = Omit<World,'rng'>` é raso — `view.balls[0].hp` segue mutável, decisão registrada
do @architect de endurecer só sob caso real; (c) o teste de replay de `debt.7` tem poder
discriminante **prospectivo** — verifiquei que um bot vazando `world.rng` passa verde hoje, porque
nenhum personagem consome `ctx.rand` (`grep -rn "rand" src/chars/` é vazio). Ele passa a carregar
peso sozinho quando o primeiro personagem consumir. Não superestimar essa proteção antes disso.

Ver também [[feedback-verificacao-independente]].
