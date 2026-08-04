# Battle Balls — Arquitetura da partida: draft, builds, Bo5, economia e loja (Fase 3 / E3)

> Projeta a **Fase 3 — Loop** (`docs/prd.md` §2, E3): a partida inteira, local, contra o bot —
> draft (RF-01 a RF-07), Bo5 com placar e empate (RF-20, RF-21), economia (RF-22, RF-23),
> loja de 8 itens em duas trilhas (RF-24 a RF-28) e a telemetria local que informa o portão
> **P3.1 a P3.4**. É a fase em que a **camada de itens** — o passo 8 da migração da dívida,
> declarado e nunca implementado (`docs/architecture.md` §6.1) — finalmente existe.
> Não reabre decisão de produto. Não decide os números de **D-05** nem de **D-09**: desenha a
> capacidade de medi-los e de mexê-los, que é o que a fase pede. Onde o texto aprovado é
> ambíguo ou onde falta decisão, isso está isolado na §14 — o usuário e o @pm decidem.
> **Este documento projeta. Não implementa.** Nenhuma linha de `src/` foi alterada ao escrevê-lo.
> Data: 2026-07-29 · Autor: @architect (Aria) · Documentos irmãos: `docs/architecture.md`
> (dívida C2/C3/D-07/D-08) e `docs/architecture-e2.md` (arnês).
> Todos os números da §1 foram medidos nesta sessão, com o código atual, sem modificá-lo.

---

## 0. O que este documento fecha

| Item | Onde | Estado |
|---|---|---|
| RF-01 a RF-03 — draft snake aberto, sem bans, 2 personagens por jogador | §3 | Estrutura fechada. **Degenera com roster 2** — devolvido em §14/R-01 |
| RF-04, RF-05 — build simultânea e secreta, timer de 30s, revelação na largada | §4 | Segredo por **projeção de estado** (`visaoPara`), não por convenção de UI |
| RF-06 / D-06 — estouro do timer → default determinística | §4.2 | Fechado: decisão explícita no log, não ausência de decisão |
| RF-07 / D-01 — troca de build entre rodadas, com custo em ouro | §4.3 | Fechado como decisão de loja; preço é D-09 (provisório marcado) |
| RF-20, RF-21 / D-02 — Bo5, placar, empate nulo, teto de 7 rodadas | §5 | Camada `match/` fora de `sim/`; **jogador ≠ lado** (§5.3) |
| RF-22, RF-23 / D-09 — renda igual, juros, sem snowball | §6 | Fechado em forma; números **provisórios e marcados** |
| RF-24 a RF-28 — loja, 2 trilhas, 8 itens → `itemBonus` | §7 | Catálogo em `src/shop/`; agregação em ordem canônica, medida em §1.6 |
| **REL-001** — `b.hp` nasce de `def.maxHp` e a Couraça não funciona | §7.4, §12 passo 0 | **Medido: o bug não enfraquece o item, inverte o sinal dele** (§1.3). Correção é **hash-neutra hoje** (medido) |
| RF-27 / D-04 — ordem de aplicação de mods | §7.5 | Nada a reabrir: a loja só popula `itemBonus`. Confirmado por leitura de `stats.ts` |
| RF-43 — o mesmo bot como oponente de partida | §8 | `heuristic.ts` serve sem modificação; falta uma **camada acima** dele (draft/build/compra) |
| D-05 — alavanca de ajuste de HP/dano, sem decidir o número | §9 | Alavanca medida (§1.4), mora em `chars/`, `sim/` não muda |
| Riscos #1, #5, #6 — telemetria local (P3.1 a P3.3) | §10 | Eventos puros em `match/`, coletor em `client/`. `sim/` intacto |
| O que substitui o golden hash quando o jogo muda de propósito | §9.3 | **Uma única story autorizada a mover o hash**, e três redes que não dependem de número absoluto |
| Ordem de construção verificável | §12 | 8 passos, 7 deles com golden hash **idêntico** |
| Riscos da proposta | §13 | Custo, segredo sem servidor, o bot virando sujeito da medição |

**O que NÃO está aqui, deliberadamente:** o número de D-05 (mediana-alvo) e os números de D-09
(preço, renda, juros) — são medidos **nesta fase, com humano no controle**, depois que a
arquitetura existir; pixel, cor e layout das telas novas (é @ux-design-expert); netcode (Fase 4);
roster de 8 e telemetria de jogadores reais (Fase 5).

---

## 1. Medições feitas para escrever este documento

O documento irmão da dívida começou gravando um baseline; o do arnês começou calibrando o
instrumento. Aqui o motivo é um terceiro: **esta é a primeira fase que muda o jogo de propósito**,
e três das decisões abaixo dependem de saber o que o jogo faz hoje quando um item existe. Rodei o
simulador atual, com o **bot heurístico** (`heuristic-1`, `PRESET_ARNES`), emulando `itemBonus` pela
porta que `e2.1` já abriu.

Convenção: composição `[golem, vex]` dos dois lados, `abilityIndex 0` / `passiveIndex 0`.
IC 95% para n=600 decididas é **±4,0pp**; para a **diferença** entre duas células, **±5,7pp** —
qualquer delta menor que isso não se distingue de zero, e está marcado como tal.

### 1.1 Linha-base com o bot heurístico

| Medida | Valor (n=600) |
|---|---|
| Winrate do **time 0** no espelho | **54,72%** ±4,0 |
| Empates | **2,83%** |
| Duração: mediana · p10 · p90 · máx | **14,5s** · 13,2s · 24,3s · 35,1s |
| Rodadas que atingem 60s (morte súbita) | **0,00%** |

Três leituras:

1. **A mediana continua em ~14,5s** — 1,7× a 2,4× abaixo da faixa-alvo de D-05 (25-35s). O número
   que o `README.md` mediu na Fase 0 (13,8s, com `dummy`) não era artefato do bot placeholder.
2. **O empate confirma a re-medição de E2** (2,8%), agora com n=600 e o bot heurístico. D-02 segue
   sendo salvaguarda barata.
3. **O viés de lado de R-01 (`architecture-e2.md` §9) ficou maior, não menor, com o bot heurístico.**
   O espelho `[golem,vex]` dava 52,04% ±3,68 com `dummy` (não distinguível de 50%); com o
   `heuristic` dá **54,72% ±4,0**, cujo intervalo **exclui** 50%. Isso deixa de ser assunto só do
   arnês nesta fase: **no cliente, o humano é sempre o time 0** (`main.ts:28`), e o portão desta
   fase é o julgamento humano. Ver §5.3 e §14/R-06.

### 1.2 Os oito itens, medidos um a um

Protocolo A/B da §5.3 de `architecture-e2.md` (mesma composição dos dois lados, pacote aplicado a
**um** personagem de **um** lado, troca de lado no meio das seeds), com um **probe uniforme de
+0,20** em cada campo. O probe **não é proposta de preço nem de magnitude** — é o mesmo instrumento
que `packages.ts` já usa, com a magnitude neutra, para descobrir **quais itens têm efeito**.

Controle (pacote vazio): **50,60%** — o pipeline não injeta assimetria.

| Item (campo) | Δ no **golem** | Δ no **vex** |
|---|---|---|
| Chumbo (`mass` +0,20) | +0,34pp · ruído | −0,86pp · ruído |
| Turbina (`maxSpeed` +0,20) | −1,19pp · ruído | **+18,82pp** |
| Lixa (`drag` +0,20 — retenção, não atrito) | +0,77pp · ruído | **+11,86pp** |
| Borracha (`restBall`+`restWall` +0,20) | −2,74pp · ruído | +0,17pp · ruído |
| Lâmina (`dmg` +0,20) | **+11,96pp** | **+20,59pp** |
| Couraça (`maxHp` +0,20) | +7,41pp ⚠️ | −0,60pp ⚠️ |
| Luneta (`range` +0,20) | +5,94pp (na borda) | +2,99pp · ruído |
| Relicário (`cdSpeed` +0,20) | +3,68pp · ruído | +0,69pp · ruído |

⚠️ **As duas linhas da Couraça estão contaminadas por REL-001** e não devem ser lidas como valor do
item — ver §1.3.

O que isto já permite dizer, e o que não permite:

- **A trilha física não nasce morta — ela nasce concentrada.** Turbina e Lixa valem, juntas, mais
  para o Vex do que a Lâmina vale para o Golem; e as duas são físicas. Isso reforça o achado
  R-04 de `architecture-e2.md` (o gatilho do Risco #1b é **por personagem**, não global) com um
  segundo conjunto de dados e um instrumento diferente.
- **A Borracha é o item mais fraco do catálogo nas duas leituras** (−2,74pp e +0,17pp, ambos ruído).
  Ela é, pelo `docs/prd.md` §4, "o item mais distintivo da trilha física" — e é o único cuja
  existência custou uma story inteira de dívida (`debt.5`). Registrado como sinal precoce do
  Risco #1, **não** como conclusão: o bot não empurra ninguém de propósito, e "elasticidade"
  é justamente a propriedade cujo valor depende de usar a colisão como jogada.
- **Nada disto é taxa de compra.** P3.3 mede o que **o humano compra**, não o que rende winrate
  contra o bot. Os dois números podem divergir, e a divergência seria informação, não erro.

### 1.3 REL-001 medido: o bug não enfraquece a Couraça — ele inverte o sinal dela

`b.hp = def.maxHp` (`world.ts:116`) e `stat.maxHp = base.maxHp × (1 + Σ)`. Com um item de vida, a
bola nasce com `hp` de linha-base e `maxHp` inflado. O gate de `e2.1` registrou o fato e listou os
**cinco leitores** que usam a *fração* `hp / stat.maxHp` como gatilho (`world.ts:216`, `vex.ts:41`,
`vex.ts:98`, `vex.ts:108`, `golem.ts:111`). Faltava saber **o tamanho** do estrago. Medido
(n=400 por célula, IC da diferença ±7,0pp):

> **Errata do censo (gate de `e3.0`, ARCH-E30-001 — pendência fechada aqui):** "cinco" é o censo de
> `sim/`+`chars/`, isto é, **do escopo onde o golden hash é juiz**, e não o censo de `src/`. A
> varredura completa devolve **nove** sítios: os cinco acima + **duas decisões de bot**
> (`bot/heuristic.ts:350` `peso()` e `:483` política de fuga) + dois cosméticos
> (`client/render.ts:195` e `:302`). O que importa para quem medir a Couraça em `e3.6` é que
> `heuristic.ts:350` é o **único sem degrau** — `peso = 1 + PESO_FERIDO × (1 − frac)`, contínuo, logo
> sem faixa segura — e tem a maior magnitude fora de `sim/`+`chars/`. Se a medição da Couraça
> apresentar resíduo de sinal, é o primeiro suspeito.

| Alvo | Bônus | Δ winrate **hoje (com o bug)** | Δ winrate **com `hp = stat.maxHp`** | Distância |
|---|---|---|---|---|
| golem | +20% maxHp | +5,42pp | **+15,47pp** | 10,1pp |
| golem | +50% maxHp | +22,05pp | **+30,55pp** | 8,5pp |
| golem | +100% maxHp | +37,05pp | +36,05pp | ~0 |
| vex | +20% maxHp | **−1,80pp** | **+13,72pp** | 15,5pp |
| vex | +50% maxHp | **−18,86pp** | **+31,97pp** | **50,8pp** |
| vex | +100% maxHp | **−29,39pp** | **+41,04pp** | **70,4pp** |

**Um item de vida comprado num Vex faz o jogador perder mais rodadas do que se não tivesse
comprado nada** — e quanto mais caro o item, pior. Não é "a bola nasce ferida" no sentido de perder
um pouco de HP: é o item **mudando de sinal**. O mecanismo é o que o gate de `e2.1` já apontava e
que agora tem tamanho: a fração de vida é gatilho de cinco comportamentos, e uma bola que nasce
"em 50%" liga a passiva Predador do inimigo, entra no critério de mergulho do Vex inimigo e sobe de
peso no alvo do bot. A anomalia do Golem a +100% (bug ≈ correção) é o mesmo fenômeno se cancelando
por outro caminho — e a lição é justamente essa: **o sinal e a magnitude dependem de qual dos cinco
leitores domina, o que não é derivável, só medível.**

Consequência direta e não negociável: **REL-001 é pré-requisito bloqueante da Couraça**, e a
correção precisa vir **antes** de qualquer item de `maxHp` existir. Se a loja entrar primeiro, o
teste do portão mediria "trilha de combate mata a trilha física" com metade da trilha de combate
invertida.

E há uma boa notícia medida: **a correção é hash-neutra hoje.** Rodei as 5 seeds do golden hash de
`debt.0` com `hp = stat.maxHp` aplicado no nascimento:

| seed | baseline | com a correção | |
|---|---|---|---|
| 1 | `96de1201` | `96de1201` | ✓ |
| 2 | `f66a7416` | `f66a7416` | ✓ |
| 3 | `a8db9c28` | `a8db9c28` | ✓ |
| 7 | `cb77dbe0` | `cb77dbe0` | ✓ |
| 11 | `6aede2d9` | `6aede2d9` | ✓ |

Motivo, escrito para ninguém se assustar depois: nenhum personagem do roster declara bônus de
`maxHp` e nenhuma passiva escreve nesse campo, então `stat.maxHp === base.maxHp === def.maxHp` para
todo o roster — a correção é a identidade até o dia em que um item de vida existir. É exatamente
por isso que ela é o **passo 0** desta fase (§12), e não um remendo dentro da story da loja.

### 1.4 A alavanca de D-05 existe, é quase linear — e a morte súbita continua morta

D-05 pede uma mediana entre 25s e 35s, fixada por medição **nesta fase**. Não é meu papel escolher o
número; é meu papel garantir que existe uma alavanca com resposta conhecida. Medi duas
(n=300 cada, escala global aplicada à base de todas as bolas):

| Configuração | Mediana | p90 | ≥60s | Empate |
|---|---|---|---|---|
| linha-base | 14,3s | 24,1s | 0,0% | 3,0% |
| `maxHp` ×1,5 | 20,9s | 27,5s | 0,0% | 1,7% |
| `maxHp` ×2,0 | **27,1s** | 31,5s | 0,0% | 1,0% |
| `maxHp` ×3,0 | 37,4s | 42,7s | 0,0% | 0,7% |
| `dmg` ×0,60 | 24,2s | 32,1s | 0,0% | 0,7% |
| `dmg` ×0,40 | 35,2s | 41,0s | 0,0% | 2,0% |

Três coisas que isto decide, e uma que ele devolve:

1. **A faixa de D-05 é alcançável com um único número**, e a resposta é monótona e suave — não há
   platô nem descontinuidade entre ×1 e ×3. Uma medição com humano no controle vai chegar ao alvo
   por bissecção, em duas ou três tentativas.
2. **Escalar HP e escalar dano não são a mesma coisa**, apesar de a duração responder parecido:
   escalar HP mantém a velocidade das bolas e **aumenta o número de ciclos de habilidade por
   rodada**; reduzir dano faz o mesmo, mas achata o valor de todo item de `dmg` (a Lâmina rende
   menos quando o dano-base é menor). Como o Risco #5 é exatamente "o item precisa ser sentido
   dentro da rodada", **recomendo HP como alavanca primária** e dano como ajuste fino. É
   recomendação de arquitetura sobre *qual* alavanca usar — o *valor* continua sendo D-05.
3. **A distribuição não alarga junto com a mediana.** A ×3,0 a mediana é 37,4s e o p90 é 42,7s: a
   cauda encolhe em termos relativos. **Nenhuma das 1 800 rodadas medidas atingiu 60s**, nem no
   cenário mais lento. Ou seja: no alvo de D-05, com o bot, a morte súbita **continua sendo código
   morto** — o gatilho do Risco #6 dispara. Isso é decisão de produto e vai para §14/R-05.

### 1.5 Quantas rodadas tem uma partida — e quantas visitas à loja a economia realmente tem

O `DESIGN.md` §7 registra o Risco #5 como "Bo5 dá só 4 compras". Com D-02 (empate nulo, teto de 7
rodadas) o número deixa de ser óbvio. Monte Carlo de 200 000 partidas, com p(vitória)=50% e a taxa
de empate medida em §1.1:

| p(empate) | Média de rodadas | Visitas à loja *entre* rodadas | Distribuição |
|---|---|---|---|
| 2,8% (medido) | **4,31** | **3,31** | 3r 20,6% · 4r 34,9% · 5r 38,5% · 6r 5,6% · 7r 0,5% |
| 0,0% | 4,18 | 3,18 | 3r 22,2% · 4r 38,0% · 5r 39,8% |

Duas consequências de desenho:

- **A curva econômica é mais curta do que o design supõe**: 3,3 aberturas de loja em média, e em
  **1 partida a cada 5** o jogador compra apenas **duas vezes**. Isso aperta o Risco #5, não afrouxa.
  Se a loja também abrir **antes da rodada 1**, o número vai para 4,31 — e essa é uma decisão que
  ninguém tomou (§14/R-03).
- **O teto de 7 rodadas de D-02 quase nunca é atingido** (0,5% das partidas). Ele é barato e
  correto; só não é o caso que precisa de desenho cuidadoso. O caso que precisa é a tabela de renda,
  que tem 5 entradas e precisa responder por até 7 rodadas (§6.3).

### 1.6 A ordem de agregação dos itens muda o último bit — medido, não temido

`architecture.md` §7.2 lista, como **vetor de não-determinismo de gravidade alta**, a soma dos
bônus de item em ordem variável. Medi com magnitudes do tamanho das que um catálogo de itens usa:

```
0.07 + 0.11 + 0.13 + 0.17  (crescente)   = 0.47999999999999998224
0.17 + 0.13 + 0.11 + 0.07  (decrescente) = 0.48000000000000003775   → diferentes
0.10 + 0.20 + 0.30         (crescente)   = 0.60000000000000008882
0.30 + 0.20 + 0.10         (decrescente) = 0.59999999999999997780   → diferentes
```

Não é hipótese: com quatro itens de valores banais, **a ordem de compra muda o resultado no último
bit**. Hoje isso custaria um hash divergente entre duas execuções do arnês; na Fase 4 custa cliente
e servidor discordando de quem morreu. Daí o mandato da §7.3 e o teste A-10 que a dívida deixou
escrito e não pago.

### 1.7 O que estes números não são

Todos foram medidos com o bot `heuristic-1`, que não compra, não drafta e não sabe que existe loja.
Eles calibram o desenho e dimensionam três riscos; **nenhum deles é leitura de portão**. As
evidências P3.1 a P3.3 são medidas **com humano no controle**, com a telemetria da §10, depois que
esta arquitetura estiver construída. Em particular: §1.2 mede *rendimento de item contra o bot*, e
P3.3 mede *escolha de compra do humano* — são perguntas diferentes.

---

## 2. Onde a partida mora — a camada `match/`

### 2.1 O problema em uma frase

`RoundSetup` é uma **rodada isolada**: `{ seed, arena, teams }` (`world.ts:56`), e `createWorld`
devolve um `World` que nasce no tick 0 e morre no `checkEnd`. Não existe, em lugar nenhum do
projeto, nada que saiba que uma rodada é a terceira de cinco, que o placar está 2-0 ou que o
jogador tem 14 de ouro. O cliente roda **uma** rodada contra o `dummy` e o botão `R` recria o mundo
do zero (`main.ts:40-53`). Toda a Fase 3 é, estruturalmente, **a camada que falta acima da rodada**.

### 2.2 A linha: o que é simulação e o que é partida

RF-19 diz que `sim/` não importa de `chars/`, `bot/` nem `client/`. Ele não diz onde mora o placar —
e é tentador colocá-lo em `World`, porque "é estado do jogo". **Não vai lá**, por três razões em
ordem de peso:

1. **`World` é o que a Fase 4 serializa e envia 60 vezes por segundo.** Placar, ouro e itens
   comprados não mudam durante a rodada (o `bonusItem` é congelado por invariante, `architecture.md`
   §1.6); colocá-los no snapshot é pagar banda por dado imutável e, pior, abrir a porta para alguém
   escrever neles durante o tick.
2. **O golden hash mede `World`.** Todo campo novo em `World` é um campo a mais que pode mover o
   hash por acidente. A rede de regressão desta fase é justamente a que menos pode ser diluída (§9.3).
3. **A economia não é física.** O critério de `sim/` sempre foi "é preciso disto para resolver o
   tick?". Ouro não é.

Fica assim, e a direção das setas é a regra:

```
sim/     tick, física, combate, stats            ← não importa nada de ninguém
chars/   roster                     → sim/
shop/    catálogo de itens, agregação → sim/ (só o TIPO BonusBlock)
match/   draft, builds, Bo5, placar, economia, loja  → sim/, shop/
bot/     comandos de combate (e2), política de partida (§8)  → sim/, shop/, match/ (só tipos)
tools/   arnês, CLI, sim:check      → sim/, chars/, bot/, match/, shop/
client/  render, input, telas       → todos
```

`match/` é **puro**: sem DOM, sem `Date.now`, sem `Math.random`, sem I/O. A mesma disciplina de
`sim/`, pelo mesmo motivo que `bot/` já tem (`architecture-e2.md` §8.4): na Fase 4 este código roda
no servidor. É o que permite testar uma partida inteira headless dentro do `sim:check` (§12, passo 2).

### 2.3 Estado da partida

```ts
// src/match/types.ts — puro. Não conhece render, relógio, rede.

export type Jogador = 0 | 1

/** Escolha de um personagem: quem é, com que build, com que itens. Uma por bola. */
export interface EscolhaPersonagem {
  charId: string
  abilityIndex: 0 | 1
  passiveIndex: 0 | 1
  /** ids de item, na ordem de COMPRA. A agregação impõe a ordem canônica (§7.3) */
  itens: string[]
  /** RF-05 — a build do oponente só é legível depois da largada */
  revelado: boolean
}

export interface EstadoJogador {
  ouro: number
  vitorias: number
  personagens: [EscolhaPersonagem, EscolhaPersonagem]
}

export type FaseDaPartida = 'draft' | 'builds' | 'rodada' | 'loja' | 'fim'

export interface EstadoPartida {
  /** seed-mãe da partida. Toda aleatoriedade da partida deriva daqui (§2.5) */
  seed: number
  fase: FaseDaPartida
  /** índice da rodada corrente, base 0 */
  rodada: number
  regras: RegrasPartida
  economia: ParametrosEconomia
  jogadores: [EstadoJogador, EstadoJogador]
  draft: EstadoDraft
  historico: ResultadoRodada[]
}

export interface ResultadoRodada {
  indice: number
  seedDaRodada: number
  /** qual TIME cada JOGADOR ocupou nesta rodada — ver §5.3 */
  ladoDoJogador: [0 | 1, 0 | 1]
  vencedor: Jogador | -1
  ticks: number
  /** hash FNV-1a do estado final, reusando tools/harness.hash — a rodada é auditável */
  hash: string
}
```

E as transições, como **redutor puro** — nada de método que muta escondido:

```ts
export type Decisao =
  | { t: 'draft';        jogador: Jogador; charId: string }
  | { t: 'build';        jogador: Jogador; slot: 0 | 1; abilityIndex: 0 | 1; passiveIndex: 0 | 1 }
  | { t: 'buildPadrao';  jogador: Jogador }                       // D-06, §4.2
  | { t: 'compra';       jogador: Jogador; slot: 0 | 1; itemId: string }
  | { t: 'trocaDeBuild'; jogador: Jogador; slot: 0 | 1; abilityIndex: 0 | 1; passiveIndex: 0 | 1 }
  | { t: 'pronto';       jogador: Jogador }

export interface Transicao {
  estado: EstadoPartida
  eventos: EventoPartida[]      // §10 — telemetria nasce aqui, não no cliente
  erro?: string                 // decisão ilegal: rejeitada com motivo, nunca aplicada pela metade
}

export function aplicar(e: EstadoPartida, d: Decisao): Transicao
/** A ponte para sim/: monta o RoundSetup da rodada corrente a partir do estado da partida */
export function setupDaRodada(e: EstadoPartida, chars: Record<string, CharDef>): RoundSetup
export function registrarRodada(e: EstadoPartida, r: ResultadoRodada): Transicao
```

**Por que redutor e não objeto com métodos.** Porque `(estado, decisão) → estado` é o formato que a
Fase 4 precisa: o servidor recebe decisões pela rede e as aplica; o replay reaplica a mesma lista.
Um objeto com métodos que mutam funciona igual **até** o dia em que precisa ser reproduzido, e aí é
reescrito. Custa a mesma quantidade de código escrever certo agora.

**A linha do tempo de decisões é o replay da partida.** `RF-41` diz "replay = seed + linha do tempo
de inputs". Na rodada, "input" é `Command[]`; na partida, é `Decisao[]`. A extensão é literal:

```
replay de partida = matchSeed + Decisao[] + (por rodada) Command[]
```

### 2.4 Segredo por projeção, não por convenção de UI

RF-04 exige que a seleção de build seja **simultânea e secreta**. O jogo é local e single-process: o
estado dos dois lados vive na mesma memória, e "secreto" não pode ser garantido — só respeitado.
Respeitar por disciplina de render ("não desenhe isso ainda") é exatamente o tipo de regra que
sobrevive até o primeiro refactor.

**Decisão: uma função de projeção, no mesmo espírito de `WorldView = Omit<World,'rng'>`.**

```ts
/** O que o jogador `j` pode ver. A build não revelada do oponente NÃO ESTÁ no objeto. */
export type VisaoPartida = Omit<EstadoPartida, 'jogadores'> & {
  eu: EstadoJogador
  oponente: OponenteVisivel
}
export interface OponenteVisivel {
  ouro: number
  vitorias: number
  personagens: [PersonagemVisivel, PersonagemVisivel]
}
/** build ausente enquanto `revelado === false` — o tipo obriga o render a tratar o caso */
export type PersonagemVisivel =
  | { charId: string; revelado: false; itens: string[] }
  | { charId: string; revelado: true;  itens: string[]; abilityIndex: 0 | 1; passiveIndex: 0 | 1 }

export function visaoPara(e: EstadoPartida, j: Jogador): VisaoPartida
```

Três coisas que isto compra pelo preço de ~30 linhas:

1. **O render não pode vazar o que não recebeu.** É a mesma lição de `WorldView`: erro de compilação
   em vez de violação descoberta em code review.
2. **É literalmente o pacote que o servidor da Fase 4 vai enviar.** Autoridade sobre informação é
   metade do que "servidor autoritativo" significa (decisão #4); a outra metade é autoridade sobre
   dano, que a Fase 4 resolve.
3. **O bot passa a ver o mesmo que o humano vê** (§8.2) — sem isso, uma política de compra que lesse
   a build secreta do jogador seria trapaça invisível, e ninguém notaria porque ela ganharia "só um
   pouco mais".

**Registro honesto:** num processo só, `visaoPara` é convenção reforçada pelo tipo, não garantia
criptográfica. Quem abrir o devtools vê tudo. Isso é aceitável porque o adversário desta fase é o
bot, e está escrito aqui para ninguém apresentar isto como anti-cheat.

### 2.5 Determinismo da partida

Três regras, e a segunda foi medida porque a implementação ingênua parece certa.

**Regra 1 — a seed de cada rodada deriva da seed da partida.**
A tabela de streams reservados de `sim/rng.ts` (`debt.7`) ganha uma faixa; ela é *por seed*, então
não há conflito com o que já existe:

| id | Dono | Estado |
|---|---|---|
| 0 | `world.rng` — a simulação | existente |
| 1, 2 | bot de combate do time 0 / time 1 | existente (`e2.3`) |
| 3 | cliente — efeitos visuais | reservado |
| 4 | arnês, telemetria | reservado |
| **5, 6** | **política de partida do bot (draft, build, compra) — jogador 0 / 1** | **novo, §8.2** |
| 7 | livre | — |
| **8 + i** | **seed da rodada `i` de uma partida** | **novo** |

```
seedDaRodada(i) = deriveSeed(matchSeed, 8 + i)
```

Verificado nesta sessão que as seeds saem descorrelacionadas para `matchSeed` 1, 2 e 12345 nas 7
rodadas possíveis. **Por que não `matchSeed + i`:** seeds consecutivas em `mulberry32` produzem
sequências correlacionadas nos primeiros saques, e os primeiros saques de `createWorld` são o ruído
de largada — as rodadas de uma partida nasceriam parecidas.

**Regra 2 — um `BotState` novo por rodada. Medido, não deduzido.**
`BotState.porBola` é indexado por `ball.id`, e `world.nextId` recomeça em 1 a cada `createWorld`;
`proximaDecisaoTick` e `prontoDesdeUlt` são **relógios absolutos** que também recomeçam. Reusar o
mesmo `BotState` entre rodadas de uma partida — que é o que uma orquestração ingênua faz, porque
"o bot é o mesmo" — contamina a rodada com o passado. Medido (mesma seed de rodada, mesma
composição):

| | ids das bolas | comandos emitidos | duração |
|---|---|---|---|
| rodada 1 (`BotState` novo) | 1,2,3,4 | 7 | 827 ticks |
| rodada 2 com `BotState` **reusado** | 1,2,3,4 | **6** | **920 ticks** |
| rodada 2 com `BotState` **novo** | 1,2,3,4 | **9** | **1 159 ticks** |

A mesma rodada, com a mesma seed, dá **outro resultado** dependendo do que aconteceu antes dela.
Isso quebra a propriedade que sustenta o arnês inteiro — "uma luta é função pura de
`(seed, setup, BOT_VERSION)`" (`architecture-e2.md` §8.2) — e quebraria o replay de partida.

> **Invariante M-1:** o `BotState` nasce e morre com a rodada.
> `createBot(seedDaRodada(i), time)`, nunca `createBot(matchSeed, time)` reusado.

**Regra 3 — o teste de replay de partida.** É a Regra 3 de `architecture.md` §5.2 subida um nível:

```
(i)   rodar uma partida completa bot × bot com matchSeed S, gravando Decisao[] e Command[] por rodada
(ii)  reproduzir: mesma matchSeed, mesmas decisões, mesmos comandos, sem bot nenhum
(iii) placar, sequência de vencedores e os hashes de TODAS as rodadas têm que bater
```

Este teste é o que substitui o golden hash como rede da camada nova (§9.3), e ele **não depende de
número absoluto nenhum** — portanto sobrevive ao ajuste de D-05.

### 2.6 O relógio de parede fica fora de `match/`

RF-04 pede um timer de 30 segundos. Trinta segundos de **relógio de parede**, não de ticks — o
jogador está numa tela, não numa rodada. Se `match/` medisse tempo real, ele deixaria de ser
reproduzível e o teste da Regra 3 morreria.

**Decisão:** `match/` só conhece decisões explícitas. O cliente é dono do relógio e, quando ele
estoura, **emite uma decisão** (`{ t: 'buildPadrao' }`). O log de decisões, portanto, registra
*o que foi escolhido*, nunca *quando* — e o replay reproduz a partida independentemente de quanto
tempo o humano levou. Mesma disciplina de `sim/`, que não sabe que existe `requestAnimationFrame`.

---

## 3. Draft (RF-01, RF-02, RF-03)

### 3.1 Estrutura

```ts
export interface EstadoDraft {
  /** ids disponíveis, na ordem de exibição (RF-01: aberto, visível aos dois) */
  pool: string[]
  /** ordem snake das escolhas: [0,1,1,0] para 2 jogadores × 2 personagens (RF-01) */
  ordem: Jogador[]
  /** índice da próxima escolha em `ordem` */
  passo: number
  escolhas: { jogador: Jogador; charId: string }[]
  /** RF-02 — sem bans. Campo NÃO existe, e a ausência é a decisão */
}
```

`ordem` é dado, não código: `[0,1,1,0]` é o snake de RF-01 e vira `[0,1,1,0,0,1,...]` sem tocar em
lógica se um dia o formato mudar. Cada `{ t:'draft' }` consome `pool` e avança `passo`; ao fim, os
dois `EscolhaPersonagem` de cada jogador nascem com `abilityIndex/passiveIndex` **indefinidos até a
fase de builds** — modelados como `0/0` com `revelado: false` e um `escolhido: boolean`, para não
inventar um estado intermediário que a UI teria de tratar.

### 3.2 Com roster de 2, o draft degenera — e isso precisa de decisão

Aritmética simples: 2 jogadores × 2 personagens = **4 escolhas** de um pool de **2**. Num draft de
verdade (personagem escolhido sai do pool, que é o que "snake" significa), o pool acaba na segunda
escolha e os jogadores 3 e 4 não têm o que pegar.

As saídas possíveis, com o que já está medido sobre cada uma:

| | Saída | Consequência |
|---|---|---|
| A | **Pool com repetição** enquanto `|roster| < 4` | Produz `[golem,golem]` vs `[vex,vex]`, que o arnês da Fase 2 mediu em **7,6% de winrate** (`architecture-e2.md` §4.1): composição degenerada, que o draft real nunca produziria |
| B | **Draft construído, exercitado com composição fixa** `[golem,vex]` dos dois lados | A tela existe, a estrutura de dados existe e é testada; a *escolha* só passa a ter conteúdo na Fase 5. É a composição sobre a qual todo o projeto já foi medido |
| C | **Adiar o draft para a Fase 5** | Contraria o escopo declarado de E3 (RF-01 a RF-03) e joga a tela para a fase que já é a maior do projeto |

**Minha recomendação é B**, com a estrutura de dados de §3.1 completa e genérica: o `pool` e a
`ordem` são dados, então mudar de B para A na Fase 5 é trocar um parâmetro. Mas **isto é escopo de
produto, não de arquitetura** — devolvo em §14/R-01. O que garanto é que as três saídas custam a
mesma coisa em código, e nenhuma delas bloqueia as outras.

---

## 4. Builds secretas (RF-03 a RF-06)

### 4.1 Simultaneidade e segredo

RF-03: 1 ativa de 2 + 1 passiva de 2, para cada um dos 2 personagens. **Confirmado no roster:**
Golem tem `[sismico, tremor]` e `[ancora, casca]`; Vex tem `[lamina, deslize]` e
`[predador, fantasma]` — 4 builds por personagem, como o design promete, e `AbilityDef`/`PassiveDef`
são tuplas de 2 no tipo (`types.ts:308-309`), então a aritmética é garantida pelo compilador.

A fase `builds` acaba quando os dois jogadores emitiram `{ t:'pronto' }`. "Simultâneo" é isto:
**a ordem em que as decisões chegam não muda o resultado**, e nenhum dos dois vê o outro antes do
fim. O segredo é a projeção da §2.4 — `revelado` só vira `true` na transição `builds → rodada`,
que é o que RF-05 pede ("reveladas na largada").

Nota registrada, porque o texto aprovado não fala disso: **as compras não são secretas.** RF-04
declara segredo para a *seleção de build* e mais nada; esconder também a loja seria regra que
ninguém escreveu (Artigo IV). `PersonagemVisivel.itens` é visível nas duas variantes do tipo.

### 4.2 Estouro do timer (RF-06 / D-06)

D-06 já decidiu: **seleção default determinística, sem penalidade** — primeira ativa e primeira
passiva. A parte de arquitetura é fazer o timeout **produzir uma decisão explícita** (`buildPadrao`)
em vez de deixar o estado sem escolha:

- o log de decisões — que é o replay — registra "o jogador não escolheu e a default entrou", que é
  informação diferente de "o jogador escolheu a primeira opção";
- a telemetria pode contar quantas vezes a default entrou, que é exatamente o sinal que D-06 diz que
  dispararia a mitigação ("se a default virar meta, randomizar a ordem de exibição");
- `match/` continua sem relógio (§2.6).

A randomização da ordem de exibição fica **nomeada e não implementada**, como D-06 manda: se ela
existir um dia, ela consome o stream 5/6 da tabela de §2.5, não o `world.rng`.

### 4.3 Troca de build entre rodadas (RF-07 / D-01)

D-01: a build **muda** entre rodadas, com custo em ouro. Arquiteturalmente isso é uma decisão de
loja, não uma fase nova: `{ t:'trocaDeBuild' }` só é legal na fase `loja`, debita
`economia.precoTrocaDeBuild` e reabre `revelado: false` para aquele personagem — porque uma build
trocada é informação nova, e o oponente só deve vê-la na largada seguinte (RF-05 de novo, agora
aplicado a um caso que o design não previu explicitamente; é a leitura conservadora).

O preço é **D-09, provisório e marcado** (§6.2). O risco de produto já está registrado no PRD
("se o preço ficar baixo, canibaliza a loja; alto, é feature morta"), e a telemetria da §10 conta
quantas trocas aconteceram por partida — que é o número que resolve o debate por medição.

---

## 5. Bo5, placar e empate (RF-20, RF-21 / D-02)

### 5.1 As regras, como dado

```ts
export interface RegrasPartida {
  vitoriasParaVencer: number   // 3 — RF-20
  tetoDeRodadas: number        // 7 — D-02
  alternarLadoPorRodada: boolean  // §5.3 / R-06 — default a decidir pelo @pm
}
```

Regra de fim, literal de D-02: a partida acaba quando um jogador chega a `vitoriasParaVencer`
**ou** quando `rodada + 1 === tetoDeRodadas`; nesse caso vence quem tiver mais vitórias, e
igualdade de vitórias é **empate de partida**. Rodada empatada (`winner === -1`) é **nula**:
ninguém pontua, e **a economia avança normalmente** — renda e juros são creditados como em qualquer
rodada, porque D-02 diz isso com todas as letras e porque o contrário premiaria o duplo-KO.

`checkEnd` de `sim/` já produz `winner === -1` no duplo-KO e no teto de `MAX_ROUND_MS` (150s, o
conflito documental C4 do PRD §4). Do ponto de vista de `match/` os dois casos são o mesmo evento —
e é bom que sejam: a fase não precisa reabrir C4 para funcionar.

### 5.2 O que persiste entre rodadas, e o que não

| Estado | Persiste? | Onde |
|---|---|---|
| Placar, ouro, itens comprados, builds | **sim** | `EstadoPartida` |
| Posição, HP, cooldowns, efeitos, `bonusPassive` | **não** | morre com o `World` |
| `bonusItem` | recomputado a cada rodada a partir dos itens | `setupDaRodada` → `PickSetup.itemBonus` |
| `BotState` | **não** — invariante M-1 (§2.5) | recriado por rodada |

`setupDaRodada` é a única ponte, e ela é fina de propósito:

```
setupDaRodada(e):
  seed  = deriveSeed(e.seed, 8 + e.rodada)
  teams = [0,1].map(time => jogadoresDoTime(e, time).personagens.map(p => ({
            charId: p.charId,
            abilityIndex: p.abilityIndex,
            passiveIndex: p.passiveIndex,
            itemBonus: agregarItens(p.itens),        // §7.3, ordem canônica
          })))
```

`sim/` não ganha um campo, um conceito nem um import. Isto é o passo 8 da migração da dívida
(`architecture.md` §6.1) chegando pelo caminho previsto: *"a agregação acontece em `src/shop/` e a
simulação recebe um bloco de números"*.

### 5.3 Jogador ≠ lado — a decisão estrutural desta seção

O cliente de hoje amarra "eu" ao time 0 (`main.ts:28,55`). §1.1 mediu que o time 0 vence **54,72%**
no espelho, com intervalo que exclui 50% — o mesmo viés estrutural que `architecture-e2.md` §9/R-01
achou e devolveu **para decidir nesta fase**. Se o humano é sempre o time 0, ele carrega essa
vantagem para dentro do julgamento "dá vontade de jogar outra partida?".

**Decisão de arquitetura (independente de como R-06 for resolvida):** `EstadoPartida` modela
**jogadores**, e o lado (`Team` 0/1 do `RoundSetup`) é atribuído **por rodada**, registrado em
`ResultadoRodada.ladoDoJogador`. Itens, ouro e placar pertencem ao *jogador*, nunca ao lado.

Com isso, as três respostas possíveis para R-06 custam uma linha cada:

| Resposta | Implementação | Custo |
|---|---|---|
| não fazer nada | `ladoDoJogador = [0,1]` sempre | zero |
| **alternar lado a cada rodada** | `alternarLadoPorRodada: true` | o cliente precisa saber renderizar e comandar o time 1 — o layout já é simétrico (`layout.ts`), e `minhasBolas` vira `balls.filter(b => b.team === meuLado)` |
| corrigir a simulação (resolução simultânea de dano, ou ordem derivada da seed) | fora de `match/` | **move o golden hash** e muda quem ganha; é a story de D-05 ou nenhuma |

A alternância é a mesma técnica que o arnês usa (`architecture-e2.md` §4.2, troca de lado
obrigatória) aplicada ao jogo em vez do instrumento: ela **não corrige** o viés, cancela-o em
expectativa ao longo do Bo5. Recomendo-a como mitigação barata, e registro o efeito colateral
honesto: num Bo5 de 5 rodadas o jogador joga 3 de um lado e 2 do outro, então o cancelamento é
imperfeito em partidas de número ímpar de rodadas. Decisão em §14/R-06.

---

## 6. Economia (RF-22, RF-23, RF-29 / D-09)

### 6.1 Ouro é inteiro

**Decisão:** `ouro: number` é sempre inteiro, e toda operação sobre ele usa aritmética inteira
(`Math.floor` explícito nos juros). Motivo, medido em §1.6: soma de `float64` não é associativa. Um
saldo em ponto flutuante daria "13,999999999999998 de ouro" para um item de 14, e o modo de falha é
**um botão de compra desabilitado sem motivo visível** — o pior tipo de bug de economia, porque
parece regra.

### 6.2 Parâmetros, todos provisórios e marcados como tal

D-09 permite valores provisórios "desde que explicitamente marcados". A marcação é estrutural: eles
moram num único arquivo, com o aviso no topo, e **nada os lê senão através de `ParametrosEconomia`**.

```ts
// src/match/economia.ts
/**
 * ⚠️ PROVISÓRIO — D-09. Nenhum destes números foi decidido: eles existem para que a Fase 3
 * possa ser JOGADA e MEDIDA. O valor definitivo sai da telemetria da §10 com humano no
 * controle, e a alteração é decisão de produto (@pm), não de arquitetura.
 */
export const ECONOMIA_PROVISORIA: ParametrosEconomia = {
  ouroInicial: 0,
  rendaPorRodada: [4, 5, 6, 7, 8],   // o exemplo literal do DESIGN.md §4 — exemplo, não decisão
  rendaAposATabela: 8,               // §6.3
  jurosPorDezOuro: 1,                // RF-23 — "juros sobre o ouro guardado"
  tetoDeJuros: 3,
  precoTrocaDeBuild: 5,              // D-01
}
```

Regras que **não** são provisórias, porque vêm de decisão aprovada:

- **Renda igual para os dois, por rodada** (RF-22, decisão #7): a mesma linha da tabela para os dois
  jogadores, sempre.
- **Vencer a rodada não dá ouro** (RF-23): não existe caminho de código que credite por vitória. É
  invariante testável: "para toda partida, `ouro_recebido(jogador)` é função apenas do índice da
  rodada e do saldo guardado" — um teste de duas linhas que impede o snowball de voltar por
  conveniência de balanceamento.
- **Juros sobre o guardado, com teto**: `floor(min(tetoDeJuros, ouro / 10))`, creditado junto com a
  renda. O teto existe para que "guardar" não domine "gastar" numa curva de 3,3 compras (§1.5); o
  valor do teto é D-09.

### 6.3 A tabela tem 5 entradas e a partida pode ter 7 rodadas

D-02 permite até 7 rodadas; o `DESIGN.md` §4 dá "ex.: 4, 5, 6, 7, 8" — cinco números. A partida
chega à sexta rodada em **5,6%** dos casos e à sétima em **0,5%** (§1.5): é raro, e é exatamente por
isso que ninguém notaria um `undefined` ali até acontecer numa sessão de teste com o usuário.

**Decisão:** `rendaDaRodada(i) = rendaPorRodada[i] ?? rendaAposATabela`, com o valor de continuação
explícito no objeto de parâmetros. Repetir o último valor é a leitura conservadora (a renda não
decresce, não explode) e está marcada como provisória com o resto.

---

## 7. A loja e a camada de itens (RF-24 a RF-28)

### 7.1 O catálogo

```ts
// src/shop/catalogo.ts — dado. Sem lógica, sem estado, sem import de sim/ além do TIPO.
export type Trilha = 'fisica' | 'combate'

export interface ItemDef {
  id: string
  nome: string
  trilha: Trilha
  /** o que ele faz, na única linguagem que o motor entende (D-04) */
  bonus: Readonly<Partial<BonusBlock>>
  /** ⚠️ PROVISÓRIO — D-09 */
  preco: number
  /** texto para a UI. O que o jogador lê, que NÃO é o que o motor faz — ver §7.2 */
  desc: string
}
```

O precedente é `src/tools/packages.ts` (`e2.6`), e ele foi criado exatamente por este motivo: **o
nome do item, o campo e o sinal precisam morar na mesma linha**, ou alguém "corrige" o sinal e
reprojeta uma fase inteira. A loja é a versão de produção daquele arquivo.

### 7.2 Os oito itens, com as duas armadilhas

| Item | Trilha | `bonus` | Armadilha |
|---|---|---|---|
| Chumbo | física | `{ mass: +x }` | — |
| Turbina | física | `{ maxSpeed: +x }` | teto **`ΣMAX.maxSpeed = +0,60`** — satura em 400 no Vex (250 × 1,60). `ABS_MAX.maxSpeed = 420` é **inalcançável por item** (ver a errata abaixo) |
| **Lixa** | física | `{ drag: +x }` | **o item chama-se "−atrito" e o bônus é POSITIVO**: `drag` é a fração de velocidade *retida* por segundo (`physics.ts`, `architecture.md` §1.6). E é aqui que o clamp ABSOLUTO morde antes do Σ: `ABS_MAX.drag = 0,60` sobre a base 0,30 do Golem |
| Borracha | física | `{ restBall: +x, restWall: +x }` | os **dois** campos, com o mesmo bônus (`architecture.md` §2.3). Clamp em 0,92 morde cedo em `restWall` |
| Lâmina | combate | `{ dmg: +x }` | — |
| **Couraça** | combate | `{ maxHp: +x }` | **bloqueada por REL-001** até o passo 0 da §12 |
| Luneta | combate | `{ range: +x }` | só o **ataque básico** (D-03). Quase inerte em quem vive da ativa — previsto pelo PM, medido em §1.2 (+2,99pp no Vex, ruído) |
| **Relicário** | combate | `{ cdSpeed: +x }` | **o item chama-se "−cooldown" e o bônus é POSITIVO**: dois Relicários dão −33%, não −40% (`architecture.md` §1.7 / R-01) |

`desc` é o texto do jogador ("−20% de recarga"); `bonus` é o que o motor executa (`cdSpeed: +0.25`).
São coisas diferentes de propósito, e o catálogo é o único lugar onde as duas se encostam.

**Preços e magnitudes (`x`) são D-09** — provisórios, marcados, medidos nesta fase. §1.2 dá a única
base objetiva que existe hoje: com magnitude uniforme, o mesmo item vale de −2,7pp a +20,6pp
dependendo do personagem. Isso é insumo para o preço, não preço.

#### Errata — qual teto morde primeiro (corrigida no gate de `e3.1`, 2026-07-30)

A redação original da linha da Turbina dizia que "`ABS_MAX.maxSpeed = 420` morde **antes** de `ΣMAX`
para o Vex a partir de +68%". **Isso estava errado, e a inversão era minha.** O achado é do @dev na
`e3.1`, reconferido por medição própria no gate; o "+68%" era `420/250` lido **sem o `ΣMAX` no
caminho**. `recomputeStats` (`sim/stats.ts:192-206`) clampa o **somatório** primeiro e só depois
multiplica pela base:

```
sigma = clamp(bonusPassive + bonusItem, SIGMA_MIN[k], SIGMA_MAX[k])
stat  = clamp(base × (1 + sigma),       ABS_MIN[k],   ABS_MAX[k])
```

Logo o `ABS_MAX` de um campo só é alcançável se `base × (1 + ΣMAX[k])` já o exceder. Medido no motor
(`createWorld` real, roster real):

| campo | base | `ΣMAX` | máximo por item | `ABS_MAX` | quem morde primeiro |
|---|---|---|---|---|---|
| `maxSpeed` (Turbina) | 250 (Vex) | +0,60 | **400** | 420 | **`ΣMAX`** — `ABS_MAX` exigiria base > **262,5**; o roster tem 250 e 105 |
| `drag` (Lixa) | 0,30 (Golem) | +1,20 | 0,66 | **0,60** | **`ABS_MAX`**, com 6 Lixas |
| `restWall` (Borracha) | 0,72 | +0,45 | 1,044 | **0,92** | **`ABS_MAX`**, já com 2 Borrachas |
| `restBall` (Borracha) | 0,65 | +0,45 | 0,9425 | **0,92** | **`ABS_MAX`**, com 3 Borrachas |
| `maxHp` (Couraça) | 190 / 100 | +1,00 | 380 / 200 | — | **`ΣMAX`** (não há clamp absoluto de teto para `maxHp`) |

Duas consequências, e a segunda importa mais que a primeira:

1. **Para a definição do item, nenhuma.** A Turbina segue `{ maxSpeed: +x }`. Muda só qual teto a UI
   de `e3.4` precisa explicar: é o `ΣMAX`, e a **4ª Turbina é 100% desperdiçada** (bruto +0,80 →
   efetivo +0,60, `stat` continua 400). O `ABS_MAX` continua sendo o teto certo a explicar na
   Borracha e na Lixa.
2. **O achado de `e2.8` ("nenhum clamp morde no roster atual") não se estende à Fase 3.** Ele foi
   medido *sem itens*. Com itens, `ABS_MAX.restWall` morde na **segunda** Borracha e
   `ABS_MAX.drag` na sexta Lixa. O clamp absoluto não é rede morta — ele é a primeira coisa que o
   jogador encontra na trilha física.

**Nota de leitura dos contadores de clamp, para `e3.6` (medida no gate de `e3.1`):** com a magnitude
provisória uniforme de +0,20, três Turbinas somam `0.6000000000000001` — um resíduo de float **acima**
de `ΣMAX.maxSpeed = 0.6`. O contador de `e2.8` registra **mordida de `ΣMAX`** ali, mas o `stat`
resultante é `400` dos dois lados (`250 × 1.6000000000000001` arredonda para `400` em float64): a
mordida tem magnitude **zero** no número que o jogador vê. Ler esse contador pela tricotomia da §7.3
("morde sempre ⇒ virou regra de jogo por acidente") daria conclusão errada. O mesmo vale para
`range`/Luneta (`ΣMAX.range` também é 0,60). `drag` (6 Lixas ⇒ `1.2` exato) e `maxHp` (5 Couraças ⇒
`1` exato) **não** têm resíduo. **`e3.6` deve reportar mordida com a magnitude do corte ao lado, não
só a contagem** — ou a instrumentação que existe para falsear os tetos vai acusar um teto que não
mordeu nada.

### 7.3 Agregação em ordem canônica

```ts
// src/shop/agregar.ts
/** Soma os bônus dos itens comprados. ORDEM CANÔNICA: id crescente no catálogo, sempre. */
export function agregarItens(itens: readonly string[]): Partial<BonusBlock>
```

Três invariantes, e a primeira é a que §1.6 mediu:

1. **A ordem de compra não pode influenciar o resultado.** A soma percorre o catálogo na ordem de
   `id`, não a lista de compra. Teste (é o item **A-10** do Anexo B de `architecture.md`, escrito na
   dívida e nunca pago): embaralhar a ordem de compra e exigir `bonusItem` **byte-idêntico**.

   > **Errata do teste, escrita no gate de `e3.1` (2026-07-30) — o enunciado acima, sozinho, não
   > prova nada.** Medido: com a magnitude provisória UNIFORME de +0,20, nenhum campo recebe dois
   > valores *diferentes*, e a soma na ordem de compra (a implementação ERRADA) devolve os mesmos
   > valores que a canônica em todas as 120 permutações de uma compra de 5 itens. Um `agregarItens`
   > errado **passa** nesse teste. O que discrimina é **duas magnitudes diferentes no mesmo campo**:
   > com as quatro de §1.6 (0,07 / 0,11 / 0,13 / 0,17) todas em `mass`, a soma na ordem de compra dá
   > **duas** saídas em 24 permutações (`0.47999999999999998224` e `0.48000000000000003775`) e a
   > canônica dá **uma**. Quem reescrever este teste — e `e3.6`/`e3.7` vão, quando D-09 diferenciar
   > magnitudes — precisa manter o cenário discriminante, não só o embaralhamento. Corolário: enquanto
   > a magnitude for uniforme, o teste tem de perturbar o catálogo **em memória** para ter poder.
   > Segundo corolário, também medido: a ordem das **chaves** do objeto devolvido tem de ser fixa
   > (`STAT_KEYS`), senão "byte-idêntico" vale para os valores e não para `JSON.stringify` — a soma
   > naive produz 24 objetos distintos em ordem de chave com os mesmos valores.
2. **Itens repetidos somam** (D-04, aditivo). A lista de compra é `string[]`, não `Set`.
3. **A agregação não clampa.** Quem clampa é `recomputeStats` (`stats.ts:183`), com `SIGMA_MIN/MAX` e
   os clamps absolutos. Um caminho de exceção aqui produziria um item que o jogo real nunca entrega
   — o mesmo argumento que `e2.1` já cravou no comentário de `makeBall`.

**Consequência de UI que precisa estar escrita:** se um jogador comprar dois itens do mesmo campo e
o teto morder, ele **paga por um bônus que não recebe**. A tela da loja precisa mostrar o valor
**efetivo**, e o único jeito honesto de calculá-lo é chamar `recomputeStats` sobre uma bola
sintética — **nunca** reimplementar a fórmula no cliente. Reimplementar é criar a terceira fonte de
verdade, depois de o projeto já ter pago caro por duas (C3 e a ressalva de `AimSpec`). O helper de
bola sintética já existe em `balance.ts` e deve ser extraído junto (§12, passo 1).

### 7.4 REL-001 é pré-requisito bloqueante da Couraça

§1.3 tem os números. A correção:

```
antes:  hp: def.maxHp,        // world.ts:116 — lido antes de recomputeStats existir
depois: (em makeBall, DEPOIS de recomputeStats)  b.hp = b.stat.maxHp
```

E as duas regras que precisam vir junto, porque a metade fácil é o nascimento:

- **`maxHp` é stat estrutural** (`architecture.md` §1.6): quando `stat.maxHp` cresce por item, `hp`
  ganha o **delta absoluto**; quando encolhe, `hp` é clampado. Como `bonusItem` é congelado na
  rodada e a bola é recriada a cada rodada, o único caso vivo hoje é o nascimento — mas a regra fica
  escrita no mesmo lugar que a executa.
- **Os leitores de fração continuam como estão** — os cinco de `sim/`+`chars/` e os quatro de fora
  dele (ver a errata do censo em §1.3: são **nove** em `src/`). A correção não toca nenhum: com `hp`
  nascendo cheio, `hp/stat.maxHp === 1` na largada, que é o que eles sempre viram. É por isso que o
  hash não se move (§1.3) e é por isso que a correção **não** é "mexer no comportamento das passivas".
  Eles não "continuam sem efeito": eles **voltam a ver a fração 1**, que é coisa diferente e é o que
  o gate de `e3.0` mediu.

Verificação da story: além do golden hash intacto, um teste dirigido com
`itemBonus: { maxHp: +0.5 }` exigindo `hp === stat.maxHp` no tick 0 — o caso que hoje falha e que
nenhuma das 50 seeds do `sim:check` alcança.

### 7.5 D-04 não reabre, e o que a loja não decide

Confirmado por leitura de `sim/stats.ts:183-216`: `recomputeStats` implementa literalmente
`stat = clamp(base × (1 + clamp(Σpassiva + Σitem)))`, com `SIGMA_MIN/MAX` e `ABS_MIN/MAX` como
constantes nomeadas. **A loja só popula `itemBonus`.** Não há fórmula nova, não há ponto de
aplicação novo, não há exceção. Os 8 itens têm ponto de aplicação nomeado no `StatBlock` — o item
A-5 do Anexo B da dívida está pago desde `debt.5`.

Fora do escopo desta fase, registrado para não ser reinventado: venda de item, item único por
personagem, item que remove item, item com efeito ativo. Nenhum tem RF.

### 7.6 Item por personagem ou por time?

RF-24 a RF-28 não dizem, e `DESIGN.md` §4 também não. A estrutura da §2.3 assume **por personagem**
(`EscolhaPersonagem.itens`), porque é o que `PickSetup.itemBonus` já é — por bola — e porque §1.2
mediu que o **mesmo item vale coisas radicalmente diferentes em personagens diferentes** (Turbina:
+18,8pp no Vex, ruído no Golem). Se o item fosse do time, essa diferença viraria média e a decisão
do jogador perderia a parte interessante.

Mas é decisão de produto e vai para §14/R-02. A estrutura suporta as duas: "por time" é
`compra` sem o campo `slot`, aplicando a `itens` dos dois personagens.

---

## 8. O bot como adversário de partida (RF-43)

### 8.1 O que já serve, sem tocar

`heuristic.ts` (`e2.3`) emite `Command[]` a partir de um `WorldView` e nada mais — não drafta, não
compra, não escolhe build, por invariante declarada (`architecture-e2.md` §2.1, §2.8). **Ele roda
uma rodada dentro de um Bo5 sem uma linha de modificação**, desde que respeitada a invariante M-1
(§2.5): um `BotState` por rodada.

Duas coisas mudam **em volta** dele:

1. **O cliente troca `dummy` por `heuristic`.** Hoje `main.ts:116` usa `dummyCommands(world, 1)` —
   o placeholder da Fase 0, que não erra de propósito e não estima nada. RF-43 diz que o bot do
   arnês é também o oponente solo. `dummy.ts` continua **intocado**: ele é o fixture congelado do
   golden hash (`architecture-e2.md` §2.7), e trocá-lo destruiria a rede de regressão.
2. **Preset próprio.** `PRESET_ARNES` é congelado por `BOT_VERSION` e não pode ser ajustado para o
   oponente ficar mais divertido (`architecture-e2.md` §8.4, "deriva de preset"). O modo solo usa
   `PRESET_SOLO`, nomeado, no mesmo arquivo, e a telemetria registra qual preset jogou a partida.

### 8.2 `bot/partida.ts` — a camada que falta

```ts
// src/bot/partida.ts — política de PARTIDA. Não decide combate (isso é heuristic.ts).
export const POLITICA_VERSION = 'partida-1'

export interface PoliticaPartida {
  escolherDraft: (v: VisaoPartida, r: () => number) => string
  escolherBuild:  (v: VisaoPartida, slot: 0 | 1, r: () => number) => { abilityIndex: 0|1; passiveIndex: 0|1 }
  comprar:        (v: VisaoPartida, r: () => number) => Decisao[]
}
export function criarPolitica(matchSeed: number, jogador: Jogador): { politica: PoliticaPartida; rand: () => number }
//   rand = mulberry32(deriveSeed(matchSeed, 5 + jogador))     ← streams 5 e 6, §2.5
```

Quatro decisões de fronteira:

1. **Ela recebe `VisaoPartida`, não `EstadoPartida`.** O bot vê o que o humano veria — inclusive não
   vendo a build secreta dele. Sem isto, uma política que espiasse a build alheia jogaria melhor por
   um motivo que o jogador não pode reproduzir, e o julgamento do portão ("dá vontade de jogar
   outra?") mediria frustração, não diversão. É a mesma lógica que fez `WorldView` esconder `rng`.
2. **Stream de PRNG próprio** (5 e 6), pelos motivos de D-08: mudar a política de compra não pode
   mudar a sequência que a simulação saca, senão o replay de rodada deixa de valer entre versões.
3. **Ela mora em `bot/`, não em `match/`.** `match/` são as regras; `bot/` é quem joga. Misturar as
   duas é como o arnês perderia a capacidade de rodar partidas com políticas diferentes.
4. **Simplicidade é requisito, não concessão.** A política v1 é declarada e boba de propósito:
   compra o item mais caro que couber no ouro, alternando trilha, com preferência por personagem
   declarada numa tabela em `bot/` (não em `chars/` — preferência é política, personagem é dado, a
   mesma linha que `AimSpec` traçou). Não é o foco desta fase e não deve consumir tempo dela.

**Risco que isso carrega, e que não dá para eliminar:** o bot que compra mal deixa a partida fácil, e
"dá vontade de jogar outra?" com um adversário fraco é uma pergunta diferente. Mitigação em §10: a
telemetria registra o placar das partidas do humano; se o humano vencer sistematicamente 3-0, o
julgamento do portão precisa saber disso antes de ser dado.

---

## 9. D-05, a alavanca de ajuste, e o que substitui o golden hash

### 9.1 Onde a alavanca mora

O ajuste de HP/dano **não toca `sim/`**. Os números-base são do `CharDef` (`golem.ts:17-22`,
`vex.ts:19-24`), e o registro de personagens é injetado em `createWorld` — então a alavanca é uma
transformação aplicada ao montar `CHARS`:

```ts
// src/chars/tuning.ts
/** ⚠️ D-05 — o valor sai de MEDIÇÃO com humano no controle (§10), não de raciocínio. */
export const ESCALA_HP = 1.0     // 1.0 = o jogo medido até aqui
export const ESCALA_DMG = 1.0
```

aplicada em `chars/index.ts` ao construir o registro. Consequências:

- **Um único ponto** move a duração, e ele é visível: `sim:check`, arnês, cliente e (na Fase 4) o
  servidor importam o mesmo `CHARS` e não podem divergir.
- **`sim/` permanece intocado por toda a fase** — só o passo 0 (REL-001) encosta em `world.ts`.
- **A escala global preserva as razões entre personagens** e, portanto, não invalida o que o arnês
  da Fase 2 mediu sobre assimetria; o que ela muda é o número de ciclos de habilidade por rodada
  (§1.4, leitura 2), que é justamente o efeito de produto que o portão quer julgar.

Se a medição mostrar que a escala global não basta (por exemplo: o Vex fica frágil demais em termos
relativos), o ajuste passa a ser por personagem, editando o `CharDef` — e aí é balanceamento, que
é medição pelo arnês, não tuning cego. A ordem certa é global primeiro, por personagem depois.

### 9.2 A story do ajuste é a única autorizada a mover o hash

Todos os outros passos da §12 declaram hash **idêntico**, e isso é verificável a cada um. A story de
D-05 **precisa** mover o hash: é o objetivo dela. O procedimento já existe e está escrito no próprio
`determinism.ts` ("mudança de baseline exige justificativa registrada no commit") e no Anexo B da
dívida (A-2: "igual ao baseline — ou diferente **com justificativa registrada**").

Critério de aceite dessa story, então, não é "o hash não mudou", e sim:

| # | Critério |
|---|---|
| T-1 | `BASELINE` (5 seeds) e `BUILD_BASELINE` (5 variantes) **re-gravados no mesmo commit**, com o valor de `ESCALA_*` que os produziu escrito na justificativa |
| T-2 | A mediana medida **com humano no controle** cai dentro de 25-35s (D-05) — evidência P3.1, não `sim:check` |
| T-3 | O portão de E2 **volta a passar depois do ajuste**: `npm run balance -- --mutacao=vex:dmg:+0.30 --n=3000` continua reportando o mutante fora de 45-55% e o controle dentro |
| T-4 | `--risco-1b` re-executado: os deltas por personagem não **invertem de sinal** (se inverterem, o ajuste mudou o jogo mais do que se pretendia, e isso precisa ser visto) |

T-3 e T-4 são o que impede a fase de "ajustar até ficar divertido" e descobrir na Fase 5 que o
instrumento de balanceamento deixou de funcionar no caminho. Custam ~5 minutos de CPU.

### 9.3 As três redes que substituem "o hash não muda"

O golden hash respondia "o jogo é o mesmo de ontem?". A partir da story de D-05 essa pergunta muda
de resposta de propósito, e as redes que sobram são as que **não dependem de número absoluto**:

| Rede | O que ela prova | Sobrevive ao ajuste? |
|---|---|---|
| **Autoconsistência** (dupla execução, 40 seeds) | a simulação é reprodutível | sim — não usa valor de referência |
| **Replay sem bot** (rodada) e **replay de partida** (§2.5, Regra 3) | o resultado é função de (seed, decisões, comandos) | sim |
| **Auditoria do Pilar 3** (fase em `dealDamage`, camadas 1 e 3) | dano por contato só em janela declarada | sim |
| **Controles do arnês** (P2.3 A/B com pacote vazio ≈ 50%; mutante detectado) | o instrumento de balanceamento continua funcionando | sim — é diferencial, não absoluto |
| **Invariantes de economia** (§6.2: vitória não credita ouro) e **A-10** (ordem de compra) | as regras novas não regridem | sim |
| Golden hash | o jogo é bit-a-bit o de ontem | **não** — vira "o jogo é bit-a-bit o de depois do ajuste" |

Em uma frase: **o golden hash deixa de ser o juiz da fase e passa a ser o juiz de cada passo dentro
dela**, com exatamente uma exceção declarada. O juiz da fase passa a ser o par
*(replay determinístico, controles do arnês)* — que continua sendo verificação por comando, não
julgamento.

---

## 10. Telemetria local (P3.1 a P3.3, Riscos #1, #5, #6)

### 10.1 De onde os dados saem

`match/` já produz `EventoPartida[]` em cada transição (§2.3), porque um redutor puro que não conta
o que fez é um redutor que obriga o cliente a reconstruir a história. Os eventos são exatamente o
que o portão precisa:

```ts
export type EventoPartida =
  | { t: 'rodadaFim'; rodada: number; duracaoMs: number; vencedor: Jogador | -1; atingiu60s: boolean; controle: ['humano'|'bot', 'humano'|'bot'] }
  | { t: 'compra';    rodada: number; jogador: Jogador; itemId: string; trilha: Trilha; preco: number; ouroDepois: number }
  | { t: 'trocaDeBuild'; rodada: number; jogador: Jogador; preco: number }
  | { t: 'buildPadrao';  rodada: number; jogador: Jogador }          // D-06 virou meta?
  | { t: 'partidaFim';   rodadas: number; placar: [number, number] }
```

| Portão | Métrica | Origem |
|---|---|---|
| **P3.1** | mediana da rodada **com humano no controle** | `rodadaFim.duracaoMs`, filtrando `controle` — o campo existe porque partidas bot×bot (§12, passo 2) entram no mesmo fluxo e **não** podem contaminar a mediana |
| **P3.2** | % de rodadas que atingem 60s | `rodadaFim.atingiu60s` (`ticks × TICK_MS ≥ SUDDEN_DEATH_MS`, a mesma conta do arnês) |
| **P3.3** | distribuição física × combate | `compra.trilha` |
| — | trocas de build por partida (D-01) | `trocaDeBuild` |
| — | quantas vezes a default de D-06 entrou | `buildPadrao` |

### 10.2 Onde eles são guardados

`src/client/telemetria.ts`: assina os eventos, acumula em memória e persiste em `localStorage` sob
chave versionada (`bb.telemetria.v1`), com um botão/atalho de **exportar JSON**. Três razões para
não ser mais sofisticado que isso: não há servidor até a Fase 4; o volume é de dezenas de eventos
por partida; e telemetria de jogadores reais é RF-49, **Fase 5**.

**Pureza preservada:** `sim/` não ganha um contador. `match/` produz eventos, que é dado, não I/O.
Só `client/telemetria.ts` toca `localStorage`, e ele é a única coisa desta seção que conhece DOM.

### 10.3 Dívida herdada que este substrato paga de carona

O indicador do **Risco #4** (P1.3: % de rodadas com uma só mão, taxa de cast desperdiçado) foi
aprovado no PRD §6 com a instrução "instrumentar **junto com** a Fase 1". Verifiquei: **não existe
telemetria nenhuma em `src/client/`** — nenhum `localStorage`, nenhum contador, nenhum log
estruturado. A Fase 1 passou por julgamento humano sem essa evidência.

Não é escopo desta fase reabrir o portão de E1, e não estou propondo isso. Mas o substrato da §10.2
serve aos dois indicadores pelo mesmo preço: um evento `cast` com `{ ballIndex, ponteiro, anguloErro }`
alimentado por `input.ts` fecha RF-36 de carona. Registro como **recomendação não bloqueante**, para
o @pm decidir se entra na fase (§14/R-07).

---

## 11. Cliente: telas, estados e fluxo

Arquitetura de dados e de fluxo. Pixel, cor e ergonomia são @ux-design-expert e não estão aqui.

### 11.1 A máquina de estados da UI espelha a da partida

```
draft ──▶ builds ──▶ rodada ──▶ [placar] ──▶ loja ──▶ builds? ──▶ rodada ... ──▶ fim
  │         │           │                      │
  DOM       DOM       canvas                  DOM
```

`FaseDaPartida` (§2.3) é a fonte; a UI não tem estado de fase próprio, só desenha o que a fase diz.
Isso mata a classe inteira de bug "a tela acha que está na loja e a partida acha que está na rodada".

| Tela | Superfície | Lê | Escreve |
|---|---|---|---|
| Draft | DOM (overlay) | `visaoPara(e, humano).draft` | `{t:'draft'}` |
| Builds | DOM — **reaproveita os cards de `montarSeletor` que já existem** (`main.ts:153-181`) | `visaoPara(...).eu.personagens` | `{t:'build'}`, `{t:'pronto'}`, timeout → `{t:'buildPadrao'}` |
| Rodada | canvas — o laço de hoje, sem mudança estrutural | `World` | `Command[]` |
| Placar / loja | DOM (overlay) | `visaoPara(...)`, catálogo, preços efetivos (§7.3) | `{t:'compra'}`, `{t:'trocaDeBuild'}`, `{t:'pronto'}` |

**Por que DOM para as telas e canvas para a rodada:** o overlay, os cards e o CSS já existem e já
foram validados em celular real na Fase 1 (P1.1/P1.2). Recriar isso em canvas seria trabalho novo
para um resultado pior em acessibilidade e em rolagem — e a rodada continua sendo canvas porque é
onde há 60Hz.

### 11.2 O que muda em `main.ts`

Hoje ele é um laço de rodada única com um seletor de build de bancada. Depois:

- `world` deixa de ser variável global de módulo e passa a ser criado por
  `setupDaRodada(estadoPartida)`;
- `meuTime` (`main.ts:28`) some: a composição vem do draft, e o lado vem de
  `ladoDoJogador` (§5.3);
- `minhasBolas()` passa a filtrar por `meuLado`, não por `team === 0`;
- `dummyCommands` → `botCommands` + `createBot(seedDaRodada, ladoDoBot)`, recriado por rodada (M-1);
- o fim da rodada deixa de ser um estado morto (`world.over` e nada acontece) e emite
  `registrarRodada(...)`;
- `INPUT_DELAY_TICKS = 0` continua 0 — é desvio consciente registrado, e P4.1 é da Fase 4.

Nada disso muda `render.ts` estruturalmente, exceto o HUD do placar (`desenharHud` já existe) e o
fato de que o time do humano pode ser 1.

---

## 12. Plano de construção — passos verificáveis

Mesmo princípio dos dois documentos irmãos: um passo por vez, `npm run sim:check` verde ao fim de
cada um, e **o golden hash como juiz** de que o jogo não se mexeu antes da hora. A diferença desta
fase está no passo 6, que é o único autorizado a movê-lo (§9.2).

| # | Passo | Golden hash | O que prova o passo | Risco |
|---|---|---|---|---|
| **0** | **REL-001:** `b.hp` nasce de `stat.maxHp` em `makeBall`, com a regra de delta para `maxHp` estrutural | **idêntico** — medido nesta sessão nas 5 seeds (§1.3) | Desbloqueia a Couraça. Teste dirigido: `itemBonus:{maxHp:+0.5}` ⇒ `hp === stat.maxHp` no tick 0 | baixo — 1 linha, e a prova de neutralidade já existe |
| **1** | `src/shop/`: `catalogo.ts` (8 itens, preços provisórios), `agregar.ts` (ordem canônica), extração do helper de **bola sintética** de `balance.ts` para preview de stat | **idêntico** (nada em `sim/`) | **A-10 da dívida**: embaralhar a ordem de compra ⇒ `bonusItem` byte-idêntico (§1.6 mostra o que acontece sem isso) | baixo |
| **2** | `src/match/`: tipos, redutor `aplicar`, `setupDaRodada`, Bo5 + D-02, economia provisória, `visaoPara` | **idêntico** | Partida headless em `sim:check`: bot × bot com `matchSeed` fixo ⇒ **placar e hashes de todas as rodadas reproduzíveis** (Regra 3, §2.5). Invariante M-1 coberta | **médio** — é o passo grande; §2 e §5 e §6 inteiras estão aqui |
| **3** | `bot/partida.ts`: política de draft/build/compra, streams 5/6, `PRESET_SOLO` | **idêntico** | Duas partidas com a mesma `matchSeed` dão o mesmo placar; trocar `POLITICA_VERSION` **não** muda o hash de uma rodada cujos comandos foram gravados | baixo |
| **4** | Cliente: fluxo `draft → builds → rodada → loja → placar`, `dummy` → `heuristic`, `minhasBolas` por lado. **Mais as quatro dívidas abertas abaixo** | **idêntico** | **Smoke visual (P3.4)**: uma partida completa no celular, sem erro de console. `sim:check` não vê o cliente — esta é a prova que ele não dá (lição de P1.2) | médio |
| **5** | Telemetria: eventos de `match/` + coletor em `client/telemetria.ts` + exportação JSON | **idêntico** | Uma partida jogada gera **P3.1, P3.2 e P3.3** a partir do arquivo exportado, sem cálculo manual | baixo |
| **6** | **Ajuste de D-05** (`chars/tuning.ts`), com re-baseline registrado | **MUDA — o único passo autorizado** | T-1 a T-4 da §9.2. A mediana com humano no controle entra na faixa; o arnês de E2 continua detectando o mutante | **alto** — é o passo que muda o jogo, e por isso vem depois de a telemetria existir |
| **7** | *(não bloqueia o portão)* revisão dos números de D-09 com os dados da §10; randomização da ordem de builds se a default de D-06 virou meta | idêntico ou re-baseline conforme o caso | Fecha os provisórios com medição em vez de raciocínio | baixo |

### 12.1 Dívidas que o passo 4 herda dos gates de `e3.2` e `e3.3` — entradas obrigatórias da story

> **Por que isto está no documento de arquitetura e não só nos YAMLs de gate.** O gate de `e3.2`
> registrou ARCH-E32-001 como "entrada bloqueante do gate de `e3.3`" e ele **não foi pago**: a story
> `e3.3` foi redigida a partir de §8 deste documento, não do gate anterior, e o AC 15 dela fixou os
> arquivos tocados em dois — nenhum deles é `src/tools/partida.ts`, onde a correção mora. A obrigação
> era real, o @dev cumpriu a story corretamente, e mesmo assim a dívida atravessou a story inteira sem
> ninguém a ver. **Uma obrigação que só existe num gate é invisível para quem escreve a story
> seguinte.** As quatro abaixo ficam aqui, onde o @sm lê, e é daqui que elas viram AC.

| # | Dívida | Onde | Custo | Origem |
|---|---|---|---|---|
| **D-a** | `medirM1` compara `createBot(s1)` novo contra `createBot(s0)` sujo — muda a **seed** e a **sujeira** juntas, e credita a divergência à errada. Medido: um bot limpo com `s0` já diverge de um limpo com `s1` em 8/8 seeds, logo o ramo de falha da guarda é inalcançável e a linha "contamina em 3/3" não mede o que afirma. **Conserto:** dois pares de bots com a **mesma** seed, sujar só um (diverge em 8/8 — a guarda ganha dentes) | `src/tools/partida.ts` | ~4 linhas | ARCH-E32-001 |
| **D-b** | Literais `3` e `7` soltos na guarda de D-02, onde `REGRAS_PADRAO` (ou `e.regras` da partida gravada) já é importável. Se `e3.7` mexer em `vitoriasParaVencer`, a guarda vira **falso FAIL** num bloco que derruba o `sim:check` inteiro | `src/tools/partida.ts` | 2 linhas | ARCH-E32-004 |
| **D-c** | **`bot/partida.ts` não tem um único consumidor em `src/` e nenhuma cobertura no `sim:check`** — o arquivo inteiro pode ser apagado hoje sem uma linha vermelha. O passo 4 é justamente quem passa a consumi-lo. **Somar** um bloco de política ao lado do `ROTEIRO_*` fixo, sem substituí-lo (o roteiro exercita `buildPadrao`, `trocaDeBuild` e o caminho de rejeição por saldo, que a política v1 nunca produz) | `src/tools/partida.ts` | bloco novo | ARCH-E33-001 |
| **D-d** | Duas invariantes de chamador **declaradas em comentário e sem guarda**: (1) **um `BotState` por rodada** (M-1, §2.5) e (2) **uma política por PARTIDA**, não por rodada — recriar a política a cada visita à loja muda as compras em 8/8 seeds (medido no gate de `e3.3`). O cliente do passo 4 é o primeiro chamador de produção das duas, e é onde elas podem ser quebradas em silêncio | `src/client/`, guarda em `src/tools/partida.ts` | guarda | ARCH-E33-004 |

**Ordem defendida nos três pontos em que ela poderia ser outra:**

- **O passo 0 vem primeiro, não junto da loja.** É a única correção da fase que é hash-neutra hoje
  (§1.3) — daqui a três passos ela deixaria de ser trivialmente verificável, porque estaria
  misturada com a story que introduz itens. E se ela vier *depois* da loja, existe uma janela em que
  a Couraça está no catálogo com o sinal invertido, e qualquer medição feita nessa janela é lixo.
- **A telemetria (5) vem antes do ajuste (6).** D-05 é "fixada por medição com humano no controle";
  ajustar antes de saber medir é exatamente o que o PRD chama de "tuning técnico feito antes", e a
  nota de método da E3 manda respeitar isso.
- **O bot de partida (3) vem antes do cliente (4).** Porque o teste headless do passo 2 precisa de
  alguém decidindo pelos dois lados para provar reprodutibilidade, e porque descobrir um bug de
  política de compra dentro do laço de render é várias vezes mais caro.

---

## 13. Riscos da própria proposta

### 13.1 A camada `match/` é a primeira coisa do projeto que o golden hash não protege

Todo o rigor acumulado até aqui protege `sim/`. Placar, ouro e loja ficam fora dele por decisão
(§2.2) — e um bug de economia (juros creditados duas vezes, ouro debitado sem item) passaria por
todos os testes existentes.

**Mitigação, e ela é o motivo de o passo 2 ter um teste próprio:** a partida headless bot × bot com
`matchSeed` fixo entra no `sim:check` e trava **placar, sequência de vencedores e hashes de rodada**.
É golden hash de partida, com a mesma disciplina: não se "atualiza" para o teste passar. E as duas
invariantes de economia da §6.2 são testes de duas linhas cada.

### 13.2 O bot de compra vira o sujeito da medição

O portão desta fase é julgamento humano contra um adversário que esta fase inventa. Se a política de
compra do bot for burra, o humano vence 3-0 e o portão mede facilidade; se for boa demais por
acidente (ela vê `VisaoPartida`, não o estado inteiro, mas não erra e não hesita), mede frustração.

**Mitigação:** `POLITICA_VERSION` e o preset são impressos junto da telemetria de toda partida, como
`BOT_VERSION` já é junto de toda matriz (`architecture-e2.md` §6.3); e o placar das partidas do
humano é uma das evidências que acompanham o julgamento. Não é possível eliminar o risco — é
possível não ser surpreendido por ele.

### 13.3 O preview de stat da loja é uma quase-terceira fonte de verdade

§7.3 exige que a tela mostre o valor efetivo, e o único jeito honesto é chamar `recomputeStats` numa
bola sintética. Isso significa que a UI da loja depende da forma de `Ball` — que é justamente o
detalhe que a camada de stats esconde de todo mundo.

**Mitigação:** o helper de bola sintética é **um só**, extraído de `balance.ts` no passo 1, e mora em
`sim/` ou `shop/` — nunca duas cópias. Registrado como o ponto do desenho de que menos gosto: seria
mais limpo se `recomputeStats` tivesse uma forma pura `(base, bonus) → StatBlock`, mas ela foi
recusada em `debt.1` por alocação no caminho quente, e reabrir isso agora é mexer no coração do
motor por causa de uma tela.

### 13.4 O ajuste global de HP não é neutro, e ninguém deve fingir que é

§1.4: dobrar HP quase dobra a mediana **sem** mudar a velocidade das bolas. O jogo resultante tem
mais ciclos de habilidade por rodada, mais ults por rodada e menos empates (3,0% → 1,0%). Isso pode
ser exatamente o que o Risco #5 pede ("o item precisa ser sentido dentro da rodada") ou pode diluir
a tensão que a Fase 0 aprovou. **É julgamento humano, e é por isso que D-05 é decisão de produto
medida nesta fase.** A arquitetura entrega a alavanca com resposta conhecida e o instrumento de
leitura; a escolha não é minha.

### 13.5 A morte súbita continua morta no alvo de D-05

Medido: nem a ×3,0 (mediana 37,4s, p90 42,7s) qualquer rodada atingiu 60s. O gatilho do Risco #6
("seguir em 0% após o ajuste de HP/dano") dispara. Como as rodadas com humano no controle podem ter
cauda mais longa que as do bot, a leitura definitiva é P3.2 — mas a expectativa honesta, hoje, é que
`SUDDEN_DEATH_MS` seja código morto. Devolvido em §14/R-05.

### 13.6 Segredo sem servidor é convenção reforçada por tipo

§2.4 já registra. Repetido aqui porque é o tipo de coisa que vira alegação de marketing: o cliente
local tem os dois lados na memória, e nenhum tipo do TypeScript sobrevive ao devtools. A garantia
real chega na Fase 4, com autoridade de servidor.

### 13.7 Custo de CPU: não é problema, e é bom escrever isso

Uma partida completa são ~4,3 rodadas × 14 a 37 segundos de tempo de jogo. Headless, ao custo medido
em `architecture-e2.md` §1.1 (~180 000 ticks/s), uma partida inteira sai em **dezenas de
milissegundos**. O teste de partida do passo 2 é grátis; rodar mil partidas para validar a economia
custa segundos. Nada nesta fase precisa de paralelização, cache ou dirty flag.

---

## 14. Ressalvas e o que este documento devolve ao @pm / usuário

Nada aqui contraria decisão aprovada. Sete pontos precisam de dono fora da arquitetura. Os quatro
primeiros bloqueiam stories específicas; os três últimos podem ser decididos com a fase em curso.

> **Resolução do usuário (2026-07-29):**
> - **R-01 — aprovada opção B.** Estrutura de draft completa (RF-01) mesmo com roster de 2;
>   composição fixa `[golem,vex]` para os dois jogadores até a Fase 5 trazer mais personagens.
> - **R-02 — aprovado "por personagem".** Cada item comprado se aplica a um personagem
>   específico do jogador, não ao time inteiro.
> - **R-03 — aprovado "só entre rodadas".** A loja não abre antes da rodada 1; `fase` inicial
>   é `builds`, não `loja`. Curva econômica fica em 3,31 aberturas/partida (não 4,31).
> - **R-06 — aprovada saída (b).** Alternar o lado do jogador a cada rodada, hash intacto. A
>   correção de simulação (c/d) fica para decidir separadamente, quando a Fase 4 exigir.
> - **R-04, R-05, R-07 seguem como registrados**: R-04 (renda das rodadas 6/7) como
>   provisório, marcado explicitamente; R-05 (Risco #6) decide depois de medir com humano
>   (P3.2), na própria Fase 3; R-07 (telemetria RF-36) entra de carona no substrato de §10.

### R-01 — O draft degenera com roster de 2 (bloqueia a story do draft)

§3.2 tem as três saídas. Recomendo **B** (estrutura completa, composição fixa `[golem,vex]`,
escolha com conteúdo só na Fase 5), porque **A** produz `[golem,golem]` vs `[vex,vex]`, medido em
7,6% de winrate — uma composição que o draft de 8 personagens nunca geraria, e sobre a qual toda
medição desta fase ficaria enviesada. **Não é decisão minha:** ela muda o que o jogador vê na
primeira tela do jogo.

### R-02 — Item por personagem ou por time? (bloqueia a story da loja)

RF-24 a RF-28 e `DESIGN.md` §4 não dizem. Recomendo **por personagem**, com dois argumentos: a
estrutura já é por bola (`PickSetup.itemBonus`), e §1.2 mediu que o mesmo item vale +18,8pp num
personagem e nada no outro — a diferença só vira decisão se o jogador escolher **quem** recebe.
Custo de mudar depois: baixo, mas os preços de D-09 mudam de escala (um item "de time" vale ~2×).

### R-03 — A loja abre antes da rodada 1? (bloqueia os números de D-09)

O `DESIGN.md` desenha `Bo5 ── entre rodadas: LOJA`, e a tabela de renda tem um valor para a
primeira rodada. Se o jogador entra na rodada 1 com ouro e sem ter comprado, ele guarda ouro à
força; se a loja abre antes, são **4,31 aberturas** em vez de **3,31** (§1.5) — 30% a mais de curva
econômica, sobre um Risco #5 que já está apertado. Arquitetura suporta as duas (`fase` inicial é
`loja` ou `builds`); o número muda D-09.

### R-04 — Renda das rodadas 6 e 7 (bloqueia a economia provisória)

A tabela do design tem 5 entradas; D-02 permite 7 rodadas (5,6% e 0,5% das partidas, §1.5). Adotei
"repete o último valor", marcado como provisório. Precisa de confirmação, ou de dois números.

### R-05 — Risco #6: morte súbita segue em 0% mesmo no alvo de D-05

Medido em §1.4: nem a mediana de 37,4s produz uma rodada de 60s. O PRD diz que a decisão
"código morto vs números errados" cabe a esta fase. As saídas: (a) aceitar como código morto e
deixar `SUDDEN_DEATH_MS` como rede de segurança; (b) baixar o limiar para a faixa em que a cauda o
alcança; (c) esperar P3.2 com humano no controle antes de decidir. **Recomendo (c) e depois (a) ou
(b)** — mas o número é do @pm.

### R-06 — Viés de lado, agora dentro do jogo (herdada de `architecture-e2.md` §9/R-01)

Aquele documento adiou explicitamente a decisão para "a Fase 3, junto de D-05". Re-medido aqui com
o bot heurístico: o time 0 vence **54,72% ±4,0** no espelho `[golem,vex]` — intervalo que exclui 50%.
No cliente, **o humano é sempre o time 0**. As saídas, com o custo de cada uma:

| | Saída | Custo | Hash |
|---|---|---|---|
| a | não fazer nada | zero — mas o portão desta fase é julgado com o humano em vantagem estrutural | intacto |
| b | **alternar o lado do jogador a cada rodada** (§5.3) | um booleano em `RegrasPartida` + o cliente saber jogar do lado 1 | **intacto** |
| c | resolução simultânea de dano | muda quem ganha; é a correção de verdade | **move** — teria de entrar junto do passo 6 |
| d | ordem de resolução derivada da seed | mais barato que (c); converte viés em ruído | **move** — idem |

**Recomendo (b) agora e (c)/(d) como decisão separada**, porque (b) é reversível, não move o hash e
não muda a simulação — e porque a Fase 4 vai precisar de (c) ou (d) de qualquer forma, quando o
servidor atribuir os lados.

### R-07 — RF-36 nunca foi instrumentado (não bloqueia)

Verifiquei: não há telemetria alguma em `src/client/`. O indicador do Risco #4 (P1.3), aprovado no
PRD §6 com a instrução "instrumentar junto com a Fase 1", não existe. Não proponho reabrir o portão
de E1 — proponho que o substrato da §10 colete também `{ ballIndex, ponteiro, erro de mira }`,
fechando RF-36 pelo custo de um evento a mais. Decisão de escopo do @pm.

---

## Anexo A — Mapa de arquivos

| Arquivo | Natureza | Passos |
|---|---|---|
| `src/sim/world.ts` | `b.hp` nasce de `stat.maxHp` em `makeBall` — **a única linha de `sim/` tocada na fase** | 0 |
| `src/shop/catalogo.ts` | **novo** — 8 itens: id, nome, trilha, `Partial<BonusBlock>`, preço provisório, texto | 1 |
| `src/shop/agregar.ts` | **novo** — `agregarItens` em ordem canônica + preview de stat efetivo | 1 |
| `src/match/types.ts` | **novo** — `EstadoPartida`, `Decisao`, `VisaoPartida`, `EventoPartida` | 2 |
| `src/match/partida.ts` | **novo** — redutor `aplicar`, `setupDaRodada`, `registrarRodada`, `visaoPara` | 2 |
| `src/match/economia.ts` | **novo** — `ECONOMIA_PROVISORIA` (D-09), renda, juros, teto | 2 |
| `src/bot/partida.ts` | **novo** — política de draft/build/compra, streams 5/6 | 3 |
| `src/bot/heuristic.ts` | **adição aditiva** — `PRESET_SOLO` ao lado de `PRESET_ARNES` (§8.1). Lógica de combate, `PRESET_ARNES` e `BOT_VERSION` **inalterados**: serve à partida sem modificação (invariante M-1 é do chamador) | 3 |
| `src/bot/dummy.ts` | **inalterado** — fixture congelado do golden hash | — |
| `src/sim/rng.ts` | tabela de streams reservados estendida (5, 6, 8+i) — comentário, não código | 2 |
| `src/chars/tuning.ts` | **novo** — `ESCALA_HP` / `ESCALA_DMG` (D-05), aplicadas ao montar `CHARS` | 6 |
| `src/chars/index.ts` | aplica o tuning ao registro | 6 |
| `src/client/main.ts` | fluxo de partida, `heuristic` no lugar do `dummy`, lado do jogador | 4 |
| `src/client/telas.ts` | **novo** — draft, builds com timer, loja, placar (DOM, reusando o overlay) | 4 |
| `src/client/telemetria.ts` | **novo** — coletor + `localStorage` + exportação JSON | 5 |
| `src/client/render.ts` | HUD de placar; `minhasBolas` por lado | 4 |
| `src/tools/determinism.ts` | bloco novo: partida headless bot × bot reprodutível; re-baseline no passo 6 | 2, 6 |
| `src/tools/balance.ts` | inalterado; re-executado como critério T-3/T-4 do passo 6 | 6 |

## Anexo B — Checklist do portão da Fase 3

| # | Critério (PRD §2, E3) | Como se verifica | Onde este documento o resolve |
|---|---|---|---|
| **P3.1** | Mediana da rodada **com humano no controle** · alerta se < 25s | telemetria exportada, filtrando `controle` = humano | §10.1 · alavanca em §9.1 · resposta medida em §1.4 |
| **P3.2** | % de rodadas que atingem 60s · alerta se 0% | `rodadaFim.atingiu60s` | §10.1 · expectativa medida (0,0% até ×3,0) e devolvida em §14/R-05 |
| **P3.3** | Distribuição de compra: física × combate · alerta se física < 35% | `compra.trilha` | §10.1 · sinal precoce por item em §1.2 |
| **P3.4** | Smoke visual no dispositivo, como em P1.2 | manual, no celular, partida completa | §12 passo 4 — `sim:check` **não** cobre o cliente |
| — | Julgamento humano: *"dá vontade de jogar outra partida?"* | usuário jogando | Nada aqui substitui isso. §13.2 registra o que pode contaminá-lo |
| — | `npm run sim:check` verde, golden hash intacto nos passos 0-5 e re-gravado no 6 | comando | §9.2, §9.3 |
| — | `npm run check` (`tsc --noEmit`) verde | comando | — |
| — | `sim/` segue sem importar de `chars/`, `bot/`, `client/`, `match/`, `shop/` | grep + revisão | §2.2 |
| — | Portão de E2 continua passando depois do ajuste de D-05 | `npm run balance -- --mutacao=vex:dmg:+0.30 --n=3000` | §9.2, T-3/T-4 |

## Anexo C — Rastreabilidade

| Requisito / risco / decisão | Origem | Seção |
|---|---|---|
| RF-01, RF-02 — draft snake aberto, sem bans | DESIGN §4 / decisão #6 | §3.1, §3.2, §14/R-01 |
| RF-03 — 1 ativa de 2 + 1 passiva de 2, por personagem | DESIGN §2, §4 | §4.1 (confirmado no roster) |
| RF-04, RF-05 — build simultânea, secreta, timer 30s, revelação na largada | decisão #6 / DESIGN §4 | §2.4, §4.1, §2.6 |
| RF-06 / D-06 — timeout → default determinística | PRD §5 | §4.2 |
| RF-07 / D-01 — troca de build entre rodadas, com custo | PRD §5 | §4.3 |
| RF-19 — `sim/` não importa de `bot/`, `chars/`, `client/` | decisão #5 | §2.2, §5.2, §10.2 |
| RF-20 — Bo5, primeiro a 3 | DESIGN §4 | §5.1 |
| RF-21 / D-02 — empate nulo, teto de 7 rodadas | PRD §5 | §5.1, §1.5, §6.3 |
| RF-22, RF-23 — renda igual, juros, vencer não dá ouro | decisão #7 | §6.2 |
| RF-24 — loja, duas trilhas de 4 itens | decisão #8 | §7.1, §7.2 |
| RF-25 — Borracha e Relicário com ponto de aplicação | resolvido em `debt.4`/`debt.5` | §7.2 (consumido, não reaberto) |
| RF-26 / D-03 — Luneta só no ataque básico | PRD §5 | §7.2 · medido em §1.2 |
| RF-27 / D-04 — ordem de aplicação de mods | PRD §5 | §7.5 — nada a reabrir |
| RF-28 — passiva e item compõem | resolvido em `debt.1`/`debt.3` | §7.5 |
| RF-29 / D-09 — números da economia | PRD §5 | §6.2, §7.2, §14/R-03, R-04 |
| RF-41 / P4.3 — replay = seed + linha do tempo | DESIGN §5 | §2.3, §2.5 (estendido à partida) |
| RF-43 — um bot para três usos | decisão #14 | §8.1, §8.2 |
| RF-46 / D-08 — stream de PRNG próprio | PRD §5 | §2.5 (tabela estendida: 5, 6, 8+i) |
| D-05 — mediana-alvo 25-35s, fixada por medição nesta fase | PRD §5 | §9.1, §1.4, §12 passo 6 |
| REL-001 — `b.hp` de `def.maxHp` bloqueia item de +HP | gate de `e2.1`, PRD §2 (E2) | §1.3, §7.4, §12 passo 0 |
| Risco #1 — trilha física × trilha de combate | DESIGN §7 | §1.2, §10.1 (P3.3) |
| Risco #5 — curva econômica curta | DESIGN §7 | §1.5, §6.2, §14/R-03 |
| Risco #6 — morte súbita é código morto | PRD §6 (aprovado) | §1.4, §13.5, §14/R-05 |
| `architecture.md` §1.3 / §6.1 passo 8 — camada de itens | documento irmão | §5.2, §7 (é literalmente esta fase) |
| `architecture.md` §7.2 vetor 1 — ordem de agregação de itens | documento irmão | §1.6, §7.3 (A-10) |
| `architecture.md` Anexo B / A-10 — teste de ordem de compra | documento irmão | §12 passo 1 |
| `architecture-e2.md` §9/R-01 — viés de lado, decidir na Fase 3 | documento irmão | §1.1, §5.3, §14/R-06 |
| `architecture-e2.md` §8.4 — deriva de preset do bot | documento irmão | §8.1 |
