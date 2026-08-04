---
name: project-fase2-arnes
description: Épico E2 (Fase 2, arnês de balanceamento) FECHADO em e2.8 — o que o golden hash NÃO protege (inclusive o caminho de instrumentação ligada), achados dos 9 gates, dívida MEDIUM aberta para Fase 3/5 e as técnicas de verificação que funcionaram
metadata:
  type: project
---

O épico **E2** (`docs/architecture-e2.md`) constrói o arnês de balanceamento em 9 passos (0-8),
**todos com golden hash idêntico** — a Fase 2 constrói um instrumento e não pode mexer no que ele
mede. `e2.0` (passo 0, PASS em 2026-07-29) extraiu `runRound`/`hash` de `determinism.ts` para
`src/tools/harness.ts`.

**Why:** o primeiro passo que legitimamente muda o hash é o ajuste de HP/dano de D-05 (Fase 3).
Até lá, a regra de alarme de [[project-migracao-debt]] continua valendo integralmente.

**How to apply:** ao revisar `e2.1`–`e2.8`, `BASELINE`/`BUILD_BASELINE` alterados = alarme.

---

**Descoberta do gate de `e2.0`, com consequência para todo o resto do épico: o golden hash é
INSENSÍVEL À ORDEM dos comandos dentro de um tick.** Medido, não suposto:

- Nas 5 seeds do baseline há **22 ticks com comandos dos dois times** — o cenário ocorre, o teste
  não é vácuo.
- Inverter `[...time0, ...time1]` para `[...time1, ...time0]` dá hash **idêntico em todos os
  ticks**, não só no final. Comandos **duplicados** também passam despercebidos.
- O hash **detecta**: comandos de um time faltando, driver mudo, teto de ticks alterado, constante
  FNV alterada.
- Causa: `castCommand` (`world.ts:405`) não consome `world.rng` e só toca a própria bola; a ordem
  de inserção em `world.projectiles`/`zones` não sobrevive à quantização de 4 casas do hash.

Isso **falsifica** a prosa de `architecture-e2.md` §6.1 (e do PRD irmão), que cita "ordem de
concatenação de comandos diferente" como a divergência que o golden hash pegaria. Registrado como
QA-001 do gate de `e2.0`, para o @architect corrigir. Consequência prática para `e2.4`/`e2.5`:
ordem de driver é garantia **de arquitetura** (uma definição só, em `harness.ts`), nunca de teste
— se a ordem importar em algum ponto, exigir asserção dedicada.

**Armadilha ao construir controle negativo neste projeto:** minha primeira tentativa de controle
foi justamente inverter a ordem dos comandos, e deu 0/40 — o comparador parecia vazio quando na
verdade a perturbação é que era invisível. Antes de concluir "o teste está quebrado", medir se a
perturbação escolhida é sequer detectável. Perturbações que funcionam: teto de ticks (dev usou
`60*5`; `60*20` **não** basta, 1200 ticks ainda é mais que a partida mais longa do baseline em
1168), constante FNV, suprimir um dos times.

**Técnica nova e a mais barata do gate de `e2.0` — rodar o script PRÉ-refatoração direto.** Quando
a story é refatoração pura de um script executável, não reimplemente nada primeiro:
`git archive HEAD src | tar -x -C scratchpad/old` e `node scratchpad/old/src/tools/determinism.ts`.
A saída completa pré vs pós sai comparável por `diff`, incluindo números derivados de 40 seeds
(espelho 2v2, mediana de duração) que denunciam qualquer desvio do laço. Zero código escrito.
Complementar a isso, o arnês velho-vs-novo verbatim (2 720 partidas: 16 builds × 150 seeds + 320
com times **assimétricos**, caminho que `determinism.ts` nunca exercita) rodou em 48s.

**Regra que vale reaplicar: quando o @dev roda UM teste negativo, achar a metade que ele não
cobre.** Em `e2.0` o @dev perturbou `MAX_ROUND_TICKS` e provou que o **laço** vem de `harness.ts`
— mas aquele mesmo teste passaria idêntico se `determinism.ts` tivesse ficado com uma cópia
própria do `hash`. Perturbei `0x01000193` → `0x01000195` e fechei a outra metade. Irmã da matriz
2×2 de `debt.7`: o teste do @dev quase sempre cobre um eixo só.

**Achados LOW que continuam abertos depois de `e2.0`:** (a) `src/tools/inspect.ts:18` mantém a
terceira cópia do laço com o literal `60 * 180` e **não** roda no `sim:check` — se
`MAX_ROUND_TICKS` mudar, diverge em silêncio; (b) remover `!world.over` da condição de parada de
`runRound` faz o `sim:check` **travar para sempre** em vez de falhar (`step` retorna cedo quando
`world.over`, então `world.tick` nunca avança) — agora que o laço é único, um erro ali trava todos
os consumidores sem diagnóstico, o que importa para o CLI de 10k rodadas de `e2.5`.

---

**Gate de `e2.1` (CONCERNS em 2026-07-29, `PickSetup.itemBonus`) — três coisas que valem para todo
`e2.2`–`e2.8` e para a loja da Fase 3:**

- **`b.hp` nasce de `def.maxHp`, não de `stat.maxHp`** (`world.ts:116`). Como **cinco** leitores usam
  a fração `hp / stat.maxHp` como gatilho (`world.ts:216` `weakestEnemy`, `vex.ts:41`, `vex.ts:92`,
  `vex.ts:102`, `golem.ts:105`), um item de `+maxHp` faz a bola **nascer "ferida"** — no teto
  (`ΣMAX.maxHp = 1.0`) ela nasce em 50% exatos e o golem perde a mitigação da própria passiva no
  primeiro dano. Um item de vida mediria **pior** que a linha-base. Nenhuma passiva do roster toca
  `maxHp`, então `e2.1` é o que tornou esse estado alcançável pela primeira vez. **Bloqueia** qualquer
  story futura de item/pacote/mutação de `maxHp`; não afeta `e2.6`/`e2.7` (§5.2 usa mass/drag/dmg).
- **`clamp` (`stats.ts:71`) trata ±`Infinity` corretamente; só `NaN` vaza.** Medido —
  `{dmg: Infinity}` → `stat.dmg` 2.0 (= ΣMAX), `{dmg: -Infinity}` → 0.25 (= ΣMIN). O relato do @dev
  dizia "`NaN`/`Infinity`". Não repetir a imprecisão: a superfície é só `NaN`.
- **Técnica de regressão bit-a-bit, mais forte que o golden hash e igualmente barata:**
  `git show HEAD:src/sim/world.ts` para uma cópia de `src/` no scratchpad, e importar as DUAS versões
  no mesmo processo Node (`import(pathToFileURL(...))`, o type stripping do Node lê `.ts` direto).
  Comparar o estado **completo** das bolas por tick — inclusive `Object.keys(bonusItem).join(',')`,
  que policia a hidden class de `architecture.md` §7.1 de graça. O golden hash só olha 7 campos
  quantizados a 4 casas no **fim** da partida; isso olha tudo, a cada tick.

---

**Gate de `e2.2` (CONCERNS em 2026-07-29, `AimSpec` obrigatório) — o achado que restringe `e2.3`:**

- **`dash.speed` é velocidade INICIAL, e §2.3 usa `tImpacto = d / S.speed` para `dash` e `raio` na
  mesma linha.** Medido num mundo real: o Golem percorre 247,4px nos 450ms da janela = **550px/s de
  média, 61% dos 900 declarados** (`drag: 0.3`, `physics.ts:18` aplica `Math.pow(drag, dt)` por tick).
  A mesma fórmula é **98,2% fiel** para o `raio` do Vex — projétil não sofre drag (609 contra
  620px/s medidos). A assimetria é o problema: um NÚMERO, não um ramo de código, reintroduz o
  confundidor pelo qual a opção C de §2.2 foi rejeitada. Para alvo a 280px (`maxRange`), §2.3 estima
  311ms contra ~580ms reais. Registrado como ARCH-001; **o gate de `e2.3` tem de exigir evidência de
  tratamento**, não aceitar nota de interpretação.
- **§2.3/§2.4 não leem `ms` em lugar nenhum**, nem `reposicao.speed`. Três dos doze números
  declarados não têm consumidor — é o que rebaixa a duplicação `sismico.aim.ms` × `contactWindows.ms`
  a LOW: não há leitor para divergir. Também significa que **nada detecta divergência dos doze
  números até a auditoria de §6.3 existir** (deve ser AC explícito de `e2.5`, falhando e não avisando).
- **Janela do dash acaba em ~247px, mas o slot declara `maxRange: 280`** — os ~12% finais do alcance
  do Impacto Sísmico não têm dano de contato. Anterior a `e2.2`; só ficou visível porque a geometria
  virou dado.
- **Técnica: bateria negativa de `tsc` em cópia isolada.** `cp -r src tsconfig.json` para o
  scratchpad + junction para `node_modules` → perturba à vontade sem tocar `src/` real. Permitiu 6
  variantes onde o @dev fez 1, e as 4 extras é que provaram o que importava: união FECHADA (`kind`
  inventado → TS2322 enumerando as 5 variantes) e **dano rejeitado por construção** (TS2353), ou seja
  o AC "sem campo de dano" é imposto pelo compilador, não por disciplina.
- **Armadilha do `execSync` no Windows:** `execSync('./node_modules/.bin/tsc ...')` cai em `cmd.exe` e
  falha com `'.' não é reconhecido` — EXIT=1 nas 6 perturbações **e no controle**. Use
  `node node_modules/typescript/bin/tsc`. Sem um controle limpo, seria uma bateria inteira "passando"
  pelo motivo errado.
- **Prova de neutralidade de runtime mais forte que hash idêntico:** grep em todo o `src/` por
  `Object.keys`/`Object.entries`/`Object.assign`/`JSON.stringify`/`for-in`/spread de def → **zero
  ocorrências**. Acrescentar propriedade a um literal de personagem não PODE mudar comportamento.
  Reutilizável em qualquer story que só some campo declarativo.
- Ao recomputar o golden hash por script próprio, **não reimplemente o driver**: o real é
  `dummyCommands(view,0) ++ dummyCommands(view,1)` de `src/bot/dummy.ts`. Reimplementar deu 0/5 e a
  leitura apressada seria "o hash mudou".

---

**Gate de `e2.3` (CONCERNS em 2026-07-29, `src/bot/heuristic.ts` — o passo grande do épico):**

- **ARCH-001 ENCERRADO.** O @dev corrigiu `tImpacto` do `dash` com a média da lei real do motor:
  `v̄ = S.speed·(1−drag^T)/(T·−ln drag)`. **A matemática está certa** — `physics.ts:18` roda
  `v *= Math.pow(drag,dt)` por tick, e `drag^dt` composto *n* vezes é `drag^(n·dt)`, logo
  `v(t)=v0·drag^t` exatamente; a fórmula é a integral disso. Verificado por três caminhos: analítico
  694,85px/s (77,21%), integração discreta do laço exato de `physics.ts` 687,91px/s (1,00% de desvio,
  o `dt/2` de Riemann), e medição real com IA de movimento 543,22px/s. **A asserção que importa é a
  ORDENAÇÃO** `real < modelado < declarado` — a correção anda para a realidade sem ultrapassá-la e o
  sinal do erro não inverte. Aprovar correção de modelo assim, e não pelo valor bater.
- **Fidelidade do `raio` do Vex é 100,0%, não os 98,2% que o gate de `e2.2` registrou** (meu próprio
  número anterior, corrigido). Os 98,2% vieram de dividir o alcance TOTAL (578,7px, que embute o
  offset de spawn em `self.stat.radius` e um tick final truncado) pela vida do projétil. Projétil não
  sofre `drag`: a fidelidade é exata por construção. Usar 100% como referência em §6.3.
- **A classe de bug mais valiosa deste gate — `!(x > 0)` barra NaN, mas `x < limiar` DEIXA NaN
  PASSAR.** É a mesma propriedade ("toda comparação com NaN é falsa") agindo nos dois sentidos. O
  @dev aplicou a idiomática defensiva a quatro denominadores e o quinto ponto onde um NaN decide é o
  próprio limiar: `if (melhorVE < limiar) return null` aceita `VE = NaN`. **Ao auditar guardas de
  NaN, procurar sempre os comparadores de ACEITE, não só os de rejeição.** Registrado como BOT-001.
- **Cadeia de alcançabilidade de NaN neste projeto, confirmada de ponta a ponta:**
  `PickSetup.itemBonus:{dmg:NaN}` (porta aberta por `e2.1`, que o CLI de `e2.6` vai alimentar de
  string) → `recomputeStats` → `stat.dmg` NaN → ~80 ticks → `hp` NaN → `peso()` NaN → `VE` NaN.
  Complementa a nota de `e2.1` de que "só `NaN` vaza" no `clamp`. `e2.6` tem de validar com
  `Number.isFinite` na entrada.
- **`PRESET_ARNES` é `Readonly` só de TIPO** — muta em runtime, sem `Object.freeze`. §8.4 promete
  "congelado por `BOT_VERSION`", o que hoje não é verdade em runtime. Verificar em `e2.5`/`e2.6`.
- **Lâmina Fantasma: `pAcerto` máximo vs Vex = 0,5 EXATO** (`raioEf = 9+15 = 24`; `sigma` mínimo =
  `JITTER_RAD·200 = 24`). Mas **`VE = Σ pAcerto·peso` com `peso ∈ [1,2]` cruza 0,55 assim que o alvo
  cai a 90% de hp** — não é "kit morto", é **kit adiado**. Lição: neste bot, nunca comparar `pAcerto`
  direto com `LIMIAR`; o que enfrenta o limiar é `VE`, que soma sobre todos os inimigos e pondera por
  ferimento. `e2.5` deve reportar o **tick mediano do primeiro cast por slot** — é o número que separa
  kit morto de kit adiado.
- **Técnicas que funcionaram e vale reaplicar:** (a) **N-3/"não escreve no view" prova-se por
  snapshot** — `JSON.stringify(world, (k,v)=>typeof v==='function'?undefined:v)` antes e depois de
  cada chamada, ao longo de 900 ticks; pega escrita por alias e por referência aninhada, que o grep de
  atribuição não pega. (b) **Ordem de saque do PRNG prova-se instrumentando `bot.rand`** com um
  contador — o check decisivo é o cenário em que a bola decide e **não** casta (tem de sacar 1). (c)
  **Simetria RF-45 prova-se com mundo refletido 180°** dando ao bot do time 1 o *stream* do time 0:
  isola os dois pontos permitidos de qualquer terceiro ramo. Cuidado com a versão vácua — se os dois
  lados estiverem calados, dois arrays vazios são trivialmente iguais; avançar até um estado em que o
  bot de fato casta.

---

**Gate de `e2.4` (PASS em 2026-07-29, bloco P2.5 no `sim:check` + correção de BOT-001):**

- **TÉCNICA NOVA, a mais forte de escopo que encontrei até aqui: prova por reversão de sha256.**
  Quando o arquivo é **untracked** (nasceu numa story anterior ainda não commitada), `git diff` não
  serve. Mas se um gate anterior registrou o `sha256` do arquivo, basta reverter a mudança que a
  story DECLARA ter feito e conferir o hash: se bater, o delta é exatamente aquilo e nada mais, em
  todas as outras linhas. Funcionou dígito a dígito em `heuristic.ts` (`80dcd986…`). **Consequência
  operacional: registrar `sha256` de arquivos untracked no `reviewed_revision` de todo gate** — é o
  que torna o escopo da story SEGUINTE auditável de graça.
- **Rodar o `sim:check` na cópia REVERTIDA prova duas coisas numa execução:** que o teste novo não é
  vácuo (falha, EXIT=1) e que a correção não move nenhum hash (as outras linhas de saída ficam
  idênticas). Mais barato e mais conclusivo do que fazer os dois separados.
- **Fechar o comparador de aceite fail-closed tem um custo que é preciso registrar.** Com
  `!(melhorVE >= limiar)`, um `hp = NaN` em UM inimigo torna `VE` NaN para TODOS os candidatos
  (porque `valorEsperado` soma sobre todos os inimigos vivos) — medido 7/7 casts por VE suprimidos.
  Direção segura, mas a matriz de winrate leria "bot parou de usar o kit" como "personagem fraco".
  Registrado como BOT-006 para `e2.5`.
- **Gargalo de decisão ≠ gargalo de NaN.** O ponto de VE cobre `burst`/`raio`/`dash`; as outras duas
  formas de `AimSpec` têm comparador próprio e continuam abertas: `politicaReposicao` decide fuga
  com `fracHp < FUGA`, e `NaN < 0.35` é `false` → medido, com `hp = 10` o Vex foge, com `hp = NaN`
  não. Degradação de política, não corrupção (BOT-007). Ao auditar "fechei o ponto de decisão",
  **contar quantos pontos de decisão existem**.
- **Correção de um raciocínio do @dev que parecia óbvio e não era:** a seed que mascara a
  perturbação de N-3 não é mascarada por "a bola morreu". Seeds 2 e 11 também terminam com a bola 0
  morta e **divergem**. O que mascara é a perturbação não mudar NADA no estado final quantizado (na
  seed 3 o hash perturbado é idêntico ao não perturbado — dano fatal por overkill, morte no mesmo
  tick, `hp` clampado em 0). Lição geral: **quando o @dev explica por que UMA célula não divergiu,
  conferir se a explicação também prediz as células que DIVERGIRAM.** Aqui ela não predizia.
- **Ao construir negativo de não-determinismo em bot com PRNG próprio, perturbar os DOIS caminhos:**
  o saque que roda em toda decisão (agendamento, §3.2 saque 1) e os que só rodam ao castar (jitter,
  saques 2-5). O @dev cobriu só o segundo. Ambos deram 5/5 — e o canário de "gravar alterou a
  partida" disparou junto nas 5, o que prova que aquela linha não é morta.

---

**Gate de `e2.5` (CONCERNS em 2026-07-29, `src/tools/balance.ts` — o CLI de balanceamento):**

- **A classe de achado que domina uma story de FERRAMENTA é cobertura, não defeito.** Nas 7 issues
  o código estava correto em todos os pontos; o que faltava era guarda. A pergunta produtiva num CLI
  não é "isto está errado?" e sim **"perturbar isto passa pelos autotestes?"**. 17 perturbações, 11
  detectadas — as 6 que passaram viraram os achados. Perturbações que passam despercebidas são o
  produto do gate.
- **Achado mais valioso: a FIAÇÃO entre partes testadas não é testada.** `autotesteVeredito` chama
  `vereditoDe(w, n)` direto; `rodarConfronto` chama `icPp(nDec)`. Trocar para `icPp(nSeeds)` passa as
  14 asserções e sai plausível. **Regra geral: quando o @dev testa A e testa B, perturbar o ARGUMENTO
  que A passa para B.** Irmã da "metade que ele não cobre".
- **Métrica cujo valor verdadeiro é 0 é indistinguível de contador morto.** Morte súbita reportava
  0,0% e um contador zerado também. Solução barata: **canário de limiar** — trocar `SUDDEN_DEATH_MS`
  por 20000 nas MESMAS rodadas dá 19,5%. Reaplicar em qualquer métrica que reporte 0/vazio.
- **Como julgar adaptação de especificação (o @dev leu "metade das seeds" de §4.2 como "metade das
  DECIDIDAS"): não compare a FORMA, compare contra a PROPRIEDADE que o texto invoca.** §4.2 justifica
  o cancelamento com "mesmo n"; sob a leitura literal o "mesmo n" conta seeds e o denominador conta
  decididas, então com empate assimétrico por lado o cancelamento QUEBRA. Construí o cenário (lado 0
  empata 60%, lado 1 nunca, time 0 sempre vence): implementado **50,0000%**, literal **28,57%**. A
  adaptação era mais fiel que o literal. Aprovar assim, e não por deferência nem por "está registrado".
- **TÉCNICA NOVA: dirigir as funções REAIS de um script executável sem reimplementá-las.** Script de
  topo não pode ser importado (roda o `main`). Corte o arquivo na marca do bloco `main`, confira
  `s.startsWith(prefixo)`, anexe um bloco de `export` e importe isso. Nenhum corpo de função é tocado
  e você ganha injeção de dependência de graça (aqui, o `type Rodada` já injetável). Foi o que
  permitiu 13 ensaios próprios de contabilidade.
- **A prova por sha256 registrada em gate anterior funcionou pela 2ª vez, agora sem reverter nada:**
  `heuristic.ts` e `determinism.ts` bateram dígito a dígito os hashes do gate de `e2.4` ⇒ a story não
  os tocou. Custo zero. **Continuar registrando sha256 de TODOS os arquivos relevantes**, não só dos
  que a story mexeu — `harness.ts` e `balance.ts` ficaram registrados agora para `e2.6`.
- **Guarda defensiva pode criar o buraco que ela quer tapar.** `sair()` usa `p?.exit?.(codigo)` por
  não assumir `process`; o bloco da auditoria confia nessa chamada como único freio, e sem
  `process.exit` ele imprime "Nenhum confronto foi rodado" **e roda todos**, EXIT=0. `falhar()` não
  tem o problema porque faz `throw` depois. **Ao auditar um `exit` guardado, perguntar o que acontece
  quando o guard degrada.**
- **BOT-006 confirmado, com refinamento que restringe `e2.6`:** `itemBonus {dmg: NaN}` sobe "% sem
  ativa" de 0,0% para 50,0%; mas **`{maxHp: NaN}` NÃO produz sinal nenhum** e `{dmg: Infinity}` produz
  sinal só parcial. A tabela de utilização **não** é justificativa suficiente para a validação de
  `Number.isFinite` — ela cobre um caminho dos três.
- **Números da Fase 2, medidos com o bot heurístico:** empate 2,8% (contra 11,1% de §1.3 e 17,5% do
  `dummy` — fator 6); morte súbita 0,0% em 823 rodadas (máx. 35,1s); viés de lado de `[golem,vex]`
  53,00% ±3,46 (IC cruza a borda: inconclusivo); ~10,3ms/rodada ⇒ ~6h para o portão de 210×10 000.

---

**Gate de `e2.6` (CONCERNS em 2026-07-29, `packages.ts` + protocolo A/B — onde P2.2/P2.3 viram comando):**

- **A classe de achado mais importante deste gate não é bug nem cobertura: é um PORTÃO QUE NÃO É
  SATISFAZÍVEL NO `n` QUE ELE PRÓPRIO MANDA USAR.** §4.4 exige o IC **inteiro** dentro de 45–55% para
  "✓ dentro"; a n=800 o IC é ±3,46pp, logo a janela conclusiva é de só **±1,54pp** em torno de 50% —
  30,8% da faixa. Um pipeline **perfeitamente justo** tem **61,5%** de chance de sair conclusivo.
  P(conclusivo) por n: 800→61,5% · 1000→77,1% · 1500→94,4% · 2000→98,8% · ≥3000→~100%.
  **Ao auditar qualquer critério do tipo "ponto E IC dentro de uma faixa", calcular a probabilidade
  de veredito conclusivo sob a hipótese nula ANTES de julgar o resultado medido.**
- **Como separar "o pipeline é injusto" de "a amostra é azarada", barato e decisivo: varrer a BASE DE
  SEED, não só o `n`.** P2.3 com seed=1 (o default) dá 52,25% `? inconclusivo`; com 1001/2001/3001/
  4001/5001 dá 49,13 · 49,50 · 50,13 · 50,50 · 48,63, **todas ✓ dentro**, média das seis = **50,02%**.
  Subir o `n` com a mesma seed confunde as duas hipóteses (as amostras são aninhadas — as seeds são
  consumidas em ordem crescente); trocar a seed base as separa.
- **A perturbação que faltava numa story cujo tema é um SINAL: inverter o sinal no CONSUMO, não no
  dado.** O @dev perturbou `PACOTES.fisico.drag` (barrado por `autotestePacotes`). Perturbei
  `itemBonus: {...bonus}` → map que nega cada valor, com `packages.ts` **intacto**: barrado por
  `autotesteAb`. Regra geral: quando a story protege uma CONSTANTE, perturbar também a FIAÇÃO que a
  lê. Irmã da "fiação entre partes testadas" de `e2.5`.
- **Prova de equivalência em runtime, mais forte que autoteste de constante:** dois caminhos de
  entrada diferentes que deveriam medir a mesma coisa têm de dar o mesmo número E a mesma contagem de
  seeds. `--pacote=fisico --alvo=vex` e `--mutacao=vex:mass:+0.20 --mutacao=vex:drag:+0.20` dão
  **60,62% / 829 seeds** os dois. O autoteste prova o conteúdo da constante; isso prova o caminho.
- **Limiar sobre um DELTA precisa do IC do delta, não do IC do winrate.** O gatilho de #1b ("físico <
  +2pp") é comparado contra deltas cujo IC a tabela nunca imprime — ela imprime o ±3,46pp do
  *winrate*, o que **convida** à leitura errada. ⚠ **CORRIGIDO no gate de `e2.7`:** o ±4,90pp que
  registrei aqui vem da fórmula **NÃO PAREADA** `1,96·√(2·0,25/n)` e **superestima**. O desenho é
  pareado (mesma seed base nos dois lados) e o pareamento cancela boa parte da variância comum:
  medido em 4 bases de seed, o desvio-padrão do delta é ≈1,25pp ⇒ IC ≈ **±2,5pp**. A conclusão
  sobrevive à correção (±2,5pp em torno de +2,62pp atravessa o limiar de +2), mas **não repetir o
  ±4,90pp como se fosse o número do desenho pareado**. Lição geral: fórmula de duas proporções
  independentes não descreve medição pareada — medir em vez de derivar.
- **Resíduo de validação que sobrevive a `Number.isFinite`: underflow.** O regex de decimal aceita
  expoente, `Number('1e-400')` é **0** e finito ⇒ mutação nula aceita em silêncio — a mesma armadilha
  de `Number('')` por outra porta. Ao auditar guarda de entrada numérica, testar os dois extremos do
  expoente, não só `1e400`.
- **Contrato documentado em TSDoc não é contrato.** `NOMES_PACOTE` promete "o controle primeiro… a
  ordem que `e2.7` vai percorrer", e o autoteste compara conjuntos **ordenados** — reordenar passa
  EXIT=0. Procurar sempre a distância entre o que o comentário promete e o que a asserção mede.
- Números confirmados: P2.2 79,63% ±3,46 (+27,38pp, 7,1 larguras de IC da borda); empate cai 2,8% →
  **0,2%** com mutante forte na mesma composição/seeds (§8.7 medido); morte súbita 0,0% em 2448
  rodadas; ~19,5ms/rodada no plano A/B de duas linhas.

---

**Gate de `e2.7` (CONCERNS em 2026-07-29, `--risco-1b` — última story de conteúdo do épico E2):**

- **A varredura de base de seed não serve só para diagnosticar viés — ela DERRUBA vereditos.** Rodei
  a bateria em 4 bases (1/1001/2001/3001), n=800 em todas: o gatilho do golem sai NÃO, NÃO, NÃO e
  **SIM**. O físico do golem varia de +1,50 a +4,50pp em torno de um limiar de +2,00pp; como o dano
  dele fica sempre >+5, o gatilho depende inteiramente da metade instável. O vex é robusto (físico
  5–8pp acima do limiar em toda base). **Regra: quando o veredito de uma story é um teste de limiar,
  variar a base de seed ANTES de aceitar o veredito — 4 execuções custaram 10 min e mostraram que a
  leitura publicada é uma moeda.** Irmã da varredura de `e2.6`, mas ali serviu para absolver o
  pipeline e aqui para invalidar a leitura.
- **A classe QA-E25/E26 apareceu pela TERCEIRA vez, e é a única perturbação que passa:** o call site
  não é testado. `deltaPp()` tem 4 asserções (as duas bordas de float, delta negativo, 2 casas), mas
  a ORDEM DOS ARGUMENTOS em `deltaPp(linha.res, controle!)` não é aserida — invertê-la roda EXIT=0 e
  imprime tabela plausível. **Ao revisar qualquer função pura bem testada, perturbar a chamada, não
  o corpo.** Em 8 perturbações, foi a única que passou (as outras 7 caem em autoteste com EXIT=1).
- **Autoteste do @dev sobre a função pura ≠ prova da fiação.** O @dev provou `ordemDaBateria` com uma
  lista invertida em memória. Inverti `NOMES_PACOTE` **de verdade** em `packages.ts` numa cópia
  isolada e rodei o CLI — aí sim é prova de ponta a ponta (passou: controle primeiro, deltas
  idênticos). Custo: um `sed` e 40s.
- **Guarda que só existe no console é meia guarda.** A conferência "os controles de todos os
  personagens têm de ser numericamente idênticos" é uma ótima ideia e é VIVA (forcei divergência com
  `seedBase+1` e o ⚠ disparou) — mas o `--json` não traz vestígio dela e entrega `gatilho: true` como
  se valesse. **Ao aprovar uma guarda, perguntar por quais SAÍDAS ela viaja**, não só se dispara.
- **Arredondar para escapar de borda de float desloca o problema, não o remove.** `Math.round(x*100)/100`
  a n=800: a granularidade do delta é 0,125pp, então todo múltiplo ÍMPAR de 0,125 cai exatamente no
  empate de 2 casas e o float decide o sentido — nesta própria story +2,625 saiu `+2.62` e +10,625
  saiu `+10.63`, o mesmo empate resolvido nos dois sentidos em linhas vizinhas. E com n grande o
  arredondamento **inverte** o gatilho (+1,995 → 2,00 a n=20000). **Correção certa para limiar sobre
  proporções: decidir no domínio INTEIRO** (`100·(v_t − v_c) < 2·n`), exato em qualquer n. Confirmei
  também a metade que valida o @dev: no caminho real `440/800 − 400/800 = 5.000000000000004`, e o
  `> 5` estrito dispararia num +5,00pp exato — o defeito era real.
- **A prova de escopo por sha256 funcionou pela 3ª vez e agora é rotina barata:** 16 arquivos
  conferidos contra o gate de `e2.6`, todos idênticos exceto `balance.ts`. Também pegou um erro meu:
  o gate de `e2.6` registrou `effects.ts` com um `0` a mais no início (65 dígitos). **Conferir o
  comprimento do hash ao transcrever.**
- Épico E2 fechado em `e2.7`: e2.0–e2.7 todas Done (1 PASS, 6 CONCERNS, + este), `e2.8`
  (contadores/clamp/tunneling) fica `Ready` e é não-bloqueante.

---

**Gate de `e2.8` (CONCERNS em 2026-07-29, contadores de clamp §7.3 e de tunelamento §7.4) — ÚLTIMA
story do épico, que agora está de fato FECHADO (9 stories, 2 PASS + 7 CONCERNS, 0 FAIL):**

- **A CLASSE MAIS IMPORTANTE DESTE GATE: um interruptor de instrumentação cria um segundo caminho de
  execução que NENHUM teste de regressão cobre.** Os contadores moram em `sim/` atrás de
  `observing`, `false` por padrão. O golden hash roda com `observing: false` — logo ele certifica o
  caminho *off*, e o caminho *on* (o único que o arnês inteiro usa) não é certificado por nada.
  Medido: a perturbação `let v = b.base[k]*(1 + (obs ? raw : sigma))` — o arnês passa a medir um
  jogo sem os tetos Σ — passa por `tsc`, golden hash, build coverage, os 15 ensaios permanentes **e
  até por uma paridade on/off nas 5 seeds do baseline** (porque com o roster de hoje nenhum clamp
  morde, então `raw === sigma` e a perturbação é invisível *nessas seeds*). **Regra: ao revisar
  qualquer flag de instrumentação/debug/telemetria, perguntar qual teste roda com a flag LIGADA. Em
  geral: nenhum.** E a guarda certa é sintética (dois `recomputeStats`, on e off, sobre uma entrada
  em que o clamp MORDE), não uma partida inteira — a partida não distingue.
- **A classe "o call site nunca é testado" apareceu pela QUARTA vez consecutiva** (e2.5 fiação
  A→B, e2.6 fiação que lê a constante, e2.7 ordem dos argumentos, e2.8 o `medir`). Os 15 ensaios
  chamam `resetClampCounters`/`resetTunnelingCounter` direto; ninguém assere o `medir`, que é quem o
  AC de reset governa. Fazer `medir` ligar/desligar sem zerar faz o denominador acumular
  34495→68990→…→237078 entre contextos e **nada acusa**. Já é padrão do projeto, não coincidência:
  **procurar o call site primeiro, não por último.**
- **Perturbação que dá no-op é informação, não desperdício.** Remover só *um* dos dois resets de
  `medir` não mudou nada — porque ele reseta na entrada **e** na saída. Descobri a defesa dupla ao
  falhar em quebrá-la. Registrar isso como ponto forte, não descartar o ensaio.
- **Denominador acrescentado a uma métrica pedida "crua" é interpretação legítima quando a FONTE
  pede uma leitura de fração.** §7.3 pede a trichotomia nunca/às vezes/**sempre**; o terceiro estado
  é indecidível sem denominador, então `calls` é condição de executar a letra, não escopo novo
  (Artigo IV OK). **Mas o denominador escolhido decide o que a leitura consegue mostrar:** com
  `chamadas` sobre TODAS as bolas e só 1 de 4 mutada no A/B, o teto observável de `frac` é ~26,7% e
  o estado "morde SEMPRE" fica inalcançável. Ao aprovar um denominador, **calcular o teto do
  quociente no desenho real** antes de aceitar que ele suporta a leitura prometida.
- **"Nenhum, de N contadores" só é lido corretamente se a saída disser o que fica FORA do N.** Os 46
  contadores cobrem as 4 tabelas de `sim/stats.ts`, mas `MIN_ABILITY_CD_MS` (teto efetivo de
  `cdSpeed`, em `world.ts`) e `MAX_SLOW` não têm contador — a premissa de §7.3 ("todos os tetos
  moram em `sim/stats.ts`") é falsa hoje. Não é buraco (a auditoria A2 do roster cobre o primeiro),
  é texto.
- **A prova de escopo por sha256 funcionou pela 4ª vez e agora é o padrão do épico:** 17 arquivos +
  `package.json` conferidos contra o gate de `e2.7`, exatamente 3 diferem (os 3 do File List).
  `package.json` idêntico é a prova barata de "nenhuma flag nova". Reforçada por mtime e por grep do
  marcador da story (`e2.8|§7.3|§7.4` → 3 arquivos, só esses).
- **Medição de fechamento da Fase 2, agora número em vez de argumento:** nenhum dos 46 clamps mordeu
  em **2 847 670** recálculos e nenhuma das **2 841 927** observações bola×tick passou da margem de
  tunelamento. §7.3 ("nunca morde → rede de segurança barata, mantém") e §7.4 ("está seguro hoje")
  deixaram de ser autocrítica do arquiteto.
- **Portão da Fase 2 executável e VERDE, medido por mim num comando** (`--mutacao=vex:dmg:+0.30
  --n=3000`, 1m43s): P2.2 79,00% ±1,79 ✗ fora (mutante detectado) · P2.3 50,10% ±1,79 ✓ dentro ·
  P2.4 n_dec=3000 · P2.1/P2.5 pelo `sim:check`. O `n≥2000` da nota de execução de QA-E26-001 é o que
  torna P2.3 conclusivo — no piso de 800 a seed default sai `? inconclusivo`.
- **Dívida MEDIUM aberta ao fim do épico (7):** REL-001 (`b.hp` nasce de `def.maxHp` — bloqueia item
  de `+maxHp` na Fase 3) · ARCH-001/e2.2 (modelo de `tImpacto` do dash, Fase 5) · QA-E27-001/002/004
  (sinal do delta no call site; guarda de divergência ausente do `--json`; IC do delta não impresso)
  · QA-E28-001/002 (caminho `observing: true` e `medir` sem guarda). Fechadas durante o épico:
  BOT-001 (e2.4), QA-E25-001 (e2.6, ensaio 3b), QA-E26-003 (e2.7), QA-E26-001 (nota de execução do
  Anexo B).

Ver também [[feedback-verificacao-independente]] e [[project-migracao-debt]].
