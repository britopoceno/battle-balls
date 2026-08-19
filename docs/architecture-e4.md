# Battle Balls — Arquitetura de rede: servidor autoritativo, input delay, sala e replay (Fase 4 / E4)

> Projeta a **Fase 4 — Rede** (`docs/prd.md` §2, E4): servidor Node autoritativo importando a mesma
> `sim/` (RF-37), input delay de ~100ms (RF-38), interpolação entre snapshots no cliente (RF-39),
> sala por link (RF-40), replay = seed + linha do tempo de inputs (RF-41) e anti-cheat como
> consequência do modelo (RF-42). Informa o portão **P4.1 a P4.4**.
> Não reabre decisão de produto. Onde falta decisão, isso está isolado na §12 — o usuário e o @pm
> decidem.
> **Este documento projeta. Não implementa.** Nenhuma linha de `src/` foi alterada ao escrevê-lo.
> Data: 2026-08-19 · Autor: @architect (Aria) · Documentos irmãos: `docs/architecture.md` (dívida),
> `docs/architecture-e2.md` (arnês) e `docs/architecture-e3.md` (partida).
> Todos os números da §1 foram medidos nesta sessão, com o código atual, sem modificá-lo.
> Scripts, saídas brutas e instruções de reprodução em `docs/evidence/e4-determinismo-engines/`.

---

## 0. O que este documento fecha

| Item | Onde | Estado |
|---|---|---|
| RF-37 — servidor Node autoritativo importando `sim/` | §3 | Fechado. A sala é **pura**, com relógio injetado — mesma disciplina de `match/` (§2.6 de E3) |
| RF-38 / P4.1 — input delay de 6 ticks | §4 | Fechado. O atraso é agendado **no servidor**, e o cliente perde o direito de escolher o tick |
| RF-39 — interpolação entre snapshots | §5 | Fechado em forma. **Taxa é lever medido no aparelho** (P4.4), não número decidido aqui |
| RF-40 — sala por link | §6 | Fechado. Reconexão sai **de graça** do modelo autoritativo |
| RF-41 / P4.3 / D-08 — replay = seed + linha do tempo | §7 | Fechado, **com uma ressalva medida**: bit-exato só vale dentro da mesma engine (§1.5) |
| RF-42 / P4.2 — anti-cheat | §8 | Fechado pela via mais barata: em rede o cliente **não simula**. Não há o que validar |
| Segredo da build (§13.6 de E3 — "convenção reforçada por tipo") | §8.2 | **Fecha aqui.** `visaoPara` deixa de ser convenção e vira fato de fio |
| Onde a rede mora, sem tocar em `sim/` | §2 | Camada `net/` + entrada `server/`. `sim/`, `match/`, `shop/` e `render.ts` **intactos** |
| O relógio de parede de RF-04, que hoje é do cliente | §3.4 | **Muda de dono**: vai para o servidor. Sem isso, um jogador estagna a partida de graça |
| Determinismo entre Node e Chrome | §1.5 | **Medido pela primeira vez no projeto.** Diverge em bits, converge no hash quantizado — e o porquê disso não ser garantia está na §11.1 |
| Custo real de banda e CPU | §1.2 a §1.4 | Medido. Banda e CPU **não são o problema desta fase** por três ordens de grandeza |
| Ordem de construção verificável | §10 | 7 passos, os 6 primeiros com golden hash **idêntico** |
| Riscos da proposta | §11 | Quantização não é tolerância; divergência em rodada longa; desconexão |

**O que NÃO está aqui, deliberadamente:** matchmaking (o PRD pede sala por link, e nada mais);
contas, persistência de perfil e ranking (não existem em requisito nenhum — Artigo IV);
autoridade sobre a loja da Fase 5; pixel e layout das telas de sala (é @ux-design-expert);
o número final da taxa de snapshot (§5.2 explica por que ele sai de medição em aparelho).

---

## 1. Medições feitas para escrever este documento

Os documentos irmãos abriram medindo: a dívida gravou um baseline, o arnês calibrou o instrumento,
a partida mediu o jogo antes de mexer nele. Aqui o motivo é o quarto: **esta é a primeira fase em
que o jogo roda em duas máquinas ao mesmo tempo**, e a pergunta que decide a arquitetura inteira —
*a mesma simulação, no Node e no Chrome, dá o mesmo resultado?* — nunca tinha sido feita ao código.

Convenção, a mesma de `architecture-e3.md` §1: composição `[golem, vex]` dos dois lados,
`abilityIndex 0` / `passiveIndex 0`, bot heurístico dos dois lados, seeds 1 / 1001 / 2001 / 3001 /
379. Node v24.13.1 (V8 13.6.233.17) e Chrome 151 (mesma máquina, Windows 11).

### 1.1 O jogo que a Fase 4 vai transportar não é o que a Fase 3 projetou

Antes de medir bytes, é preciso saber quantos ticks existem para transportar. Com o roster e o
tuning **atuais** (`ESCALA_HP = 6.0`, a decisão de produto de `e3.6`):

| seed | ticks | duração | vencedor |
|---|---|---|---|
| 1 | 4 773 | 79,55s | 0 |
| 1001 | 4 699 | 78,32s | 0 |
| 2001 | 4 363 | 72,72s | 0 |
| 3001 | 4 082 | 68,03s | 0 |
| 379 | 5 249 | 87,48s | 0 |
| **média** | **4 633** | **77,22s** | — |

Três leituras que importam para esta fase:

1. **A rodada tem ~4 600 ticks, não ~870.** A linha-base de `architecture-e3.md` §1.1 media 14,5s
   (≈870 ticks) antes de D-05. A decisão de ×6.0 multiplicou por **5,3** o volume de estado que a
   rede vai carregar por rodada. Não é problema (§1.2 mostra a folga), mas todo número por-rodada
   deste documento parte daqui.
2. **A morte súbita deixou de ser hipótese.** `SUDDEN_DEATH_MS = 60_000`, e **5 de 5** rodadas
   passam de 60s. O Risco #6 / R-05 de E3 ("morte súbita segue em 0%") está morto na prática com o
   bot; a arena encolhendo é agora caminho comum, e é código que a rede vai exercitar toda partida.
3. **O teto importa.** `MAX_ROUND_TICKS = 60 * 180` = **10 800 ticks**. A rodada medida mais longa
   usa 49% do teto. Isso vira um risco concreto na §11.1, não um detalhe.

### 1.2 Quanto custa mandar o mundo

Dois payloads medidos, por tick, média entre as 5 seeds:

| Payload | cru | deflate isolado | deflate com contexto |
|---|---|---|---|
| `World` serializável inteiro | **5 049 B** | 1 063 B | — |
| **snapshot de render** (só o que `client/render.ts` lê, quantizado) | **263 B** | 160 B | **34 B** |

O pico do snapshot de render numa rodada inteira foi **433 B**. "Deflate com contexto" é o que o
`permessage-deflate` do WebSocket entrega com *context takeover* ligado — o fluxo aproveita a
redundância entre quadros consecutivos, que aqui é enorme porque quatro bolas se movem devagar.

Banda **por cliente**, downstream:

| taxa | cru | comprimido |
|---|---|---|
| 60 Hz | 126,3 kbit/s | **16,4 kbit/s** |
| 30 Hz | 63,1 kbit/s | **8,2 kbit/s** |
| 20 Hz | 42,1 kbit/s | **5,5 kbit/s** |
| 15 Hz | 31,6 kbit/s | **4,1 kbit/s** |

Para comparação, mandar `World` inteiro a 60 Hz custaria **2 423,7 kbit/s** — 2,4 Mbit/s por
cliente, por causa de campos que não mudam durante a rodada (`base`, `bonusItem`, `stat`) ou que
render nenhum consome (`memory`, `ax/ay`, `nextId`, `phase`). Daí a §5.1: **o snapshot não é o
mundo**, e a diferença entre as duas linhas é fator **19×**.

**Leitura:** banda não é restrição desta fase. Mesmo a 60 Hz sem compressão, 126 kbit/s cabe em
qualquer 3G. A escolha de taxa (§5.2) é sobre *latência de interpolação* e *bateria*, não sobre bytes.

### 1.3 Quanto custa mandar o input

| medida | valor |
|---|---|
| comandos por rodada (2 bolas × 2 lados) | **54,6** |
| por lado, por segundo | **0,35 cmd/s** |
| bytes por comando (tupla quantizada) | **26,3 B** |
| upstream de um jogador | **0,07 kbit/s** |

**Leitura:** o upstream é ~2 300× menor que o downstream comprimido a 30 Hz. Isto é o Pilar *"você
não pilota a bola"* aparecendo como número: o jogador emite **um terço de comando por segundo**.
Um jogo em que se dirige a bola emitiria 60 amostras de eixo por segundo por bola. É a mesma
propriedade que dispensa rollback (§4), medida.

### 1.4 Quantas salas cabem num núcleo

| medida | valor |
|---|---|
| custo do tick, com bot dos dois lados | **0,0057 ms** |
| custo do tick, sem bot (só o motor) | **0,0053 ms** |
| orçamento de um tick a 60 Hz | 16,667 ms |
| mediana · p95 · p99 · máximo do tick (seed 379, com bot) | 0,0056 · 0,0061 · 0,0088 · **0,1815 ms** |
| salas 1v1 por núcleo, a 100% de ocupação | **3 168** |
| salas 1v1 por núcleo, a 25% (margem de GC e I/O) | **792** |

Medido sobre 200 rodadas por configuração (839 818 e 885 990 ticks), com aquecimento de JIT
descartado. Diferente do resto da §1, **estes números não são reprodutíveis ao dígito**: duas
execuções da mesma bateria variaram ~1% na mediana e ~3% no pico. A tabela é a da evidência
commitada (`01-banda-cpu-duracao.out`); a conclusão é insensível a essa variação.

**Leitura:** CPU não é restrição desta fase, com três ordens de grandeza de folga. O pico de
0,1815 ms — 32× a mediana, e ainda 92× abaixo do orçamento — é GC, não regra de jogo. O que vai
limitar o servidor é socket e memória por conexão, não simulação; e isso só se mede com carga real,
que esta fase não tem.

### 1.5 A medição que decide a arquitetura: Node × Chrome

O comentário de `sim/types.ts` (invariante de ordenação, `debt.7`) diz, sobre não reordenar
`world.balls`: *"a Fase 4 roda Node e Chrome simultaneamente"*. A afirmação nunca tinha sido
testada. Testei: mesma seed, mesmo roster, mesmo bot, rodada inteira, comparando o estado
**em precisão total** (`String(number)`, que é round-trip exato) além do hash do arnês.

**Resultado 1 — o hash do arnês bate em 5 de 5 seeds, e o resultado da rodada também.**

| seed | `hash()` (quantizado, `toFixed(4)`) | estado bit-a-bit | ticks | vencedor |
|---|---|---|---|---|
| 1 | **igual** | **diverge** | igual (4 773) | igual (0) |
| 1001 | **igual** | **diverge** | igual (4 699) | igual (0) |
| 2001 | **igual** | idêntico | igual (4 363) | igual (0) |
| 3001 | **igual** | idêntico | igual (4 082) | igual (0) |
| 379 | **igual** | **diverge** | igual (5 249) | igual (0) |

**Resultado 2 — quando diverge, diverge pouco.** Máximo |Δ| entre as duas engines, sobre os 20
campos hasheados (x, y, vx, vy, hp de 4 bolas):

| seed | tick 1000 | tick 2000 | tick 3000 | tick 4000 | fim |
|---|---|---|---|---|---|
| 1 | 2,3e-13 | 2,1e-10 | 7,0e-11 | 1,3e-10 | **1,3e-10** |
| 1001 | 0 | 0 | 0 | 5,7e-14 | **5,7e-14** |
| 2001 | 0 | 0 | 0 | 0 | **0** |
| 3001 | 0 | 0 | 0 | 0 | **0** |
| 379 | 0 | 2,3e-13 | 1,1e-11 | 9,8e-10 | **1,6e-9** |

A maior divergência observada no projeto inteiro é **1,6e-9 px**, depois de 5 249 ticks.

**Resultado 3 — a causa tem nome, tick e linha.** Bissectando a seed 1, a primeira divergência
nasce no **tick 742**, em duas grandezas ao mesmo tempo:

```
NODE   Z t742 47:wall@781.380643200274,286.46037664166715,-0.4739416036326336 ,9,0
CHROME Z t742 47:wall@781.380643200274,286.46037664166715,-0.47394160363263316,9,0
```

O ângulo é o da Muralha, criada no tick anterior pela ult do Golem:

```ts
// src/chars/golem.ts:140
angle: Math.atan2(aim.dy, aim.dx) + Math.PI / 2,
```

Com os argumentos **idênticos** que o bot emitiu (`dx=-0.45639696701269405`,
`dy=-0.889776268789865`):

| | Node | Chrome |
|---|---|---|
| `Math.atan2(dy, dx)` | `-2.04473793042753` | `-2.0447379304275297` |

**1 ULP de diferença.** O ângulo divergente entra em `sim/physics.ts:181-182`
(`Math.cos(z.angle)` / `Math.sin(z.angle)`), que resolve a colisão com a parede, e a partir daí a
divergência caminha pelo estado.

**Resultado 4 — quais funções divergem, e quais não.** Varredura de 20 000 pares
pseudoaleatórios determinísticos por função, comparando o hash FNV-1a de todos os resultados em
precisão total:

| função | Node | Chrome | |
|---|---|---|---|
| `Math.atan2` | `c5dc135f` | `ddcb5d45` | **DIVERGE** |
| `Math.sin` | `4062bf98` | `d6d4fd16` | **DIVERGE** |
| `Math.cos` | `5fd7d130` | `2060ef81` | **DIVERGE** |
| `Math.hypot` | `2cb6a982` | `2cb6a982` | igual |
| `Math.pow` | `fdbd0953` | `fdbd0953` | igual |
| `Math.sqrt` | `30247522` | `30247522` | igual |

Isto é comportamento **conforme a especificação**, não bug: a ECMA-262 exige precisão exata só de
`Math.sqrt` (que é IEEE-754) e das operações aritméticas; `sin`, `cos`, `atan2`, `pow` e `hypot`
são *implementation-defined*. Node 24 e Chrome 151 embarcam **versões diferentes do V8**, e as
versões diferem na `fdlibm` que usam. Que `hypot` e `pow` batam hoje é coincidência de versão, **não
garantia** — e `hypot` tem 17 pontos de chamada em `sim/`.

**Onde isto toca o jogo, e onde não toca:**

| ponto de chamada | entra no estado simulado? |
|---|---|
| `chars/golem.ts:140` — `atan2` do ângulo da Muralha | **SIM** — é a divergência medida |
| `sim/physics.ts:181-182` — `cos`/`sin` da colisão com parede | **SIM** — amplifica a de cima |
| `sim/physics.ts:95` — `b.facing = atan2(vy, vx)` | **NÃO** — `facing` só é lido por `render.ts:198`; não está no hash nem alimenta física |
| `bot/heuristic.ts:492,575-576` — `log`, `cos`, `sin` da mira | **SIM**, mas só no modo solo: em 1v1 não há bot |
| `client/telemetria.ts:212` — `acos` do erro de mira | **NÃO** — métrica, fora da simulação |

**Leitura, e é a que decide a §2 e a §8:** o modelo aprovado (servidor autoritativo, sem predição,
sem rollback) é o **único** dos modelos possíveis que sobrevive a este resultado sem trabalho extra.
Qualquer desenho em que o cliente simule autoritativamente e o servidor confira — lockstep,
predição com reconciliação, cliente-verifica-servidor — teria que resolver 1 ULP de `atan2` entre
duas engines que o projeto não controla. O modelo escolhido não precisa: **só uma máquina simula.**

### 1.6 O que estes números não são

- **Não são medição de rede.** Tudo aqui roda numa máquina só. Latência, perda de pacote, jitter e
  comportamento de rádio de celular não foram medidos e não podem ser medidos sem o servidor existir.
  É por isso que o portão desta fase é julgamento humano em **dois aparelhos** (P4.4).
- **n = 5 seeds.** Suficiente para provar que a divergência entre engines **existe** (basta um caso);
  insuficiente para caracterizar com que frequência ela cruza qualquer limiar. Ver §11.1.
- **Uma máquina, um par de versões.** Node 24 / Chrome 151, Windows, x64. Um celular Android com
  outra versão do V8, ou um iPhone com JavaScriptCore, é **outra engine** e não foi medido.
- **O bot é o sujeito.** As rodadas medidas são bot × bot. Com humano no controle a duração cai
  (58,4s medidos em `e3.6`), e o volume de comandos sobe. A ressalva de `architecture-e3.md` §13.2
  continua valendo aqui.

---

## 2. Onde a rede mora

### 2.1 O problema em uma frase

Hoje `client/main.ts` é dono de tudo: cria o `EstadoPartida`, aplica as decisões, roda o laço de
`step()`, e desenha. Na Fase 4 **o dono do estado passa a ser outra máquina**, e a pergunta é onde
cortar sem que `sim/`, `match/` e `render.ts` percebam.

### 2.2 A linha: transporte não é partida

A mesma régua das fases anteriores. `sim/` respondeu "é preciso disto para resolver o tick?".
`match/` respondeu "isto é física?". A régua desta fase é: **"o jogo mudaria se ninguém estivesse
conectado?"** Se não muda, é transporte, e transporte não entra nem em `sim/` nem em `match/`.

Consequências diretas:

- **Nem um campo novo em `World`.** O motivo é o de `architecture-e3.md` §2.2, agora cobrado:
  `World` é o que se serializa, e o golden hash o mede. Número de sequência de snapshot, id de
  conexão, RTT — nada disso encosta em `World`.
- **Nem um campo novo em `EstadoPartida`.** O servidor sabe quem é a conexão do jogador 0; o
  `EstadoPartida` continua sabendo só que existe um jogador 0.
- **`match/` continua sem relógio** (§2.6 de E3). O relógio muda de dono (§3.4), não de natureza:
  continua produzindo `{ t: 'buildPadrao' }` como **decisão**, só que agora quem o segura é o
  servidor.

Fica assim, estendendo a tabela de `architecture-e3.md` §2.2 — **as três primeiras linhas não mudam
uma letra**:

```
sim/     tick, física, combate, stats                 ← não importa nada de ninguém
chars/   roster                          → sim/
shop/    catálogo de itens, agregação    → sim/ (só o TIPO BonusBlock)
match/   draft, builds, Bo5, placar, economia, loja   → sim/, shop/
bot/     comandos de combate, política de partida     → sim/, shop/, match/ (só tipos)
net/     protocolo, snapshot, máquina da sala         → sim/, match/, shop/   ← NOVO
tools/   arnês, CLI, sim:check           → sim/, chars/, bot/, match/, shop/
server/  entrada Node: WebSocket, roteamento, relógio → net/, match/, chars/, bot/  ← NOVO
client/  render, input, telas, rede      → todos
```

`net/` é **puro**: sem `ws`, sem DOM, sem `Date.now`, sem `Math.random`, sem I/O. Quem tem socket é
`server/`; quem tem `WebSocket` do navegador é `client/rede.ts`. O motivo é o mesmo de sempre e
paga o mesmo dividendo: **uma sala inteira pode ser testada headless dentro do `sim:check`**, sem
subir servidor nenhum (§10, passo 3).

### 2.3 Por que `net/` e `server/` são pastas diferentes

Porque `net/sala.ts` precisa rodar nos dois lados da fronteira e `ws` não roda no navegador. Se a
máquina de estados da sala importasse `ws`, o teste dela exigiria socket, e o `sim:check` — que é
processo único e sem rede — não poderia cobri-la. Mesmo precedente de `tools/harness.ts`, extraído
em `e2.0` justamente para que houvesse **uma** definição do laço com **dois** consumidores.

---

## 3. O servidor autoritativo (RF-37)

### 3.1 Uma máquina define a verdade — e é a única que simula

```
                     ┌─────────────────────────────────────────┐
   cliente A ──cast──▶│  server/  ── laço de relógio 60 Hz      │
             ◀─snap── │    net/sala.ts  (pura, relógio injetado)│
                     │      ├── match/ aplicar(), visaoPara()   │
   cliente B ──cast──▶│      └── sim/ createWorld(), step()     │
             ◀─snap── │  a ÚNICA instância de World que existe  │
                     └─────────────────────────────────────────┘
```

Nenhum cliente chama `step()` no modo conectado. Essa frase é a arquitetura inteira desta fase, e é
dela que caem RF-42 (§8.1), a resposta ao resultado da §1.5, e o fechamento de §13.6 de E3 (§8.2).

### 3.2 A sala é pura; o relógio é injetado

```ts
// src/net/sala.ts — puro. Sem ws, sem DOM, sem relógio próprio.

export interface Sala {
  id: string
  fase: 'aguardando' | 'jogando' | 'encerrada'
  partida: EstadoPartida
  /** conexão → jogador. O servidor preenche; `match/` nunca vê isto. */
  assentos: [string | null, string | null]
  /** a rodada em curso, ou null fora da fase `rodada` */
  rodada: { world: World; pendentes: Command[]; ultimoSnapshot: number } | null
}

/** Um passo de sala. `agora` ENTRA — a sala não o busca. */
export function passo(s: Sala, agora: number, entrada: MensagemDoCliente[]): ResultadoDoPasso
```

`ResultadoDoPasso` devolve o novo estado e **o que precisa ser enviado a quem** — como dado, não
como efeito. Quem escreve no socket é `server/`. É a mesma forma de `Transicao` em `match/`
(estado + eventos), pelo mesmo motivo: uma função que devolve o que fazer é testável; uma que faz
não é.

O laço de parede vive em `server/main.ts` e é o acumulador de passo fixo que `client/main.ts` já
tem hoje (`main.ts:400`), com uma diferença: **o teto de passos por quadro sobe de 5 para o
necessário**, porque no servidor um atraso de agendamento não pode virar câmera lenta para os dois
jogadores. Se o servidor ficar para trás além de um limiar, isso é telemetria de operação, não
degradação silenciosa.

### 3.3 O servidor é dono de `EstadoPartida` — e `match/` já estava pronto para isso

Nada em `match/` muda. O que muda é **quem chama**:

| hoje (`client/main.ts`) | Fase 4 |
|---|---|
| `criarPartida({seed, pool})` | idem, no servidor. A seed passa a vir do servidor, não de `Math.random()` do cliente |
| `aplicar(partida, decisao)` | idem, no servidor, com a decisão **recebida pelo fio**; `Transicao.erro` vira mensagem `{t:'erro'}` de volta |
| `visaoPara(partida, HUMANO)` | idem, **duas vezes** — uma projeção por jogador, e cada uma vai só para o seu socket |
| `setupDaRodada` + `createWorld` + laço | idem, no servidor |
| `registrarRodada(...)` | idem, no servidor |

A rigor, `visaoPara` foi projetado em `e3.4` para uma tela local e acabou sendo a peça de rede mais
importante da Fase 4 — porque a projeção que escondia a build do bot é exatamente a projeção que
impede a build do oponente humano de **existir no socket** (§8.2).

### 3.4 O relógio de RF-04 muda de dono

`architecture-e3.md` §2.6 pôs o relógio de parede fora de `match/` e o deu ao cliente: o timer de
30s da fase `builds` corre em `client/main.ts:390`, e o estouro vira `{ t: 'buildPadrao' }`.

**Em rede isso não pode continuar assim**, e o motivo não é elegância: se o relógio é do cliente, um
jogador que simplesmente não deixa o timer estourar **estagna a partida do outro para sempre**. Não
é nem cheat sofisticado — é fechar o notebook.

O timer passa a correr no servidor, e o cliente passa a **exibir** um prazo que recebe pronto
(`{t:'prazo', terminaEmMs}`). A regra em `match/` não muda: continua sendo uma decisão explícita no
log, e o replay continua reproduzindo a partida sem saber quanto tempo o humano levou.

---

## 4. Input delay (RF-38, P4.1)

### 4.1 Os 6 ticks são agendados pelo servidor, não pelo cliente

Hoje o cliente decide o tick do próprio comando (`main.ts:311`):

```ts
pendentes.push({ tick: world.tick + INPUT_DELAY_TICKS, ballId: bola.id, ... })
```

No modo conectado, **o campo `tick` sai do fio**. O cliente envia intenção; o servidor carimba:

```
cliente → { t:'cast', ballIndex: 0|1, slot:'ability'|'ult', dx, dy, mag }     ← sem tick
servidor:  agendarEm = tickAtual + ATRASO_ALVO_TICKS                          ← 6 ticks, ~100ms
```

Duas razões, em ordem de peso:

1. **Um tick escolhido pelo cliente é um tick que o cliente pode escolher no passado.** Castar "no
   tick 300" quando o servidor já está no 340 é retroceder a simulação — o servidor não pode
   conhecer o futuro (o modelo morto do GDD §8) nem revisitar o passado.
2. **`Command.tick` continua existindo e continua igual.** O tipo de `sim/` não muda; muda quem o
   preenche. `sim/step()` segue consumindo `commands.filter(c => c.tick === world.tick)` sem saber
   se o número veio de um humano local ou de um socket.

### 4.2 P4.1 é hash-neutro — e isso é verificável antes de escrever a story

P4.1 pede `INPUT_DELAY_TICKS = 6` ativo. Vale registrar, porque a fase inteira do projeto gira em
torno de não mover o golden hash por acidente: **mudar essa constante não move o hash.**

O motivo é que o arnês nunca a usa. Os dois bots carimbam o tick corrente
(`bot/heuristic.ts:583` e `bot/dummy.ts:30,43`: `tick: view.tick`), e `sim:check` roda só com bots.
A constante só afeta input **humano**, que não existe em teste automatizado. Consequência prática:
o passo que ativa P4.1 (§10, passo 1) sai com `sim:check` verde e hash idêntico, e se **não** sair,
há um acoplamento que ninguém sabia que existia — o que também é informação.

### 4.3 Por que não há rollback, e por que isso não é preguiça

Sem predição no cliente não há o que reconciliar; sem reconciliação não há rollback. O que sustenta
essa escolha é a §1.3 medida: **0,35 comando por segundo por lado**. Um atraso de 100ms num evento
que acontece a cada 3 segundos é invisível; o mesmo atraso num eixo analógico amostrado 60×/s seria
intolerável. É o Pilar *"você não pilota a bola"* pagando dividendo, e agora com número.

### 4.4 Latência sentida, honestamente

O diagrama do GDD §8 sugere que os 6 ticks **absorvem** a ida da rede. Com o carimbo no servidor
isso não é verdade, e é melhor escrever o número certo:

```
latência sentida = ida (RTT/2) + 100ms (6 ticks) + atraso de interpolação (§5.3)
```

Existe uma variante que equaliza o sentido entre jogadores com pings diferentes:

```
agendarEm = max(tickAtual + 1, tickAtual + ATRASO_ALVO_TICKS − ticksDeIda)
```

com `ticksDeIda` medido **pelo servidor** (ping próprio), nunca informado pelo cliente. Ela deixa os
dois jogadores com a mesma latência total enquanto o ping couber no orçamento.

**Recomendação: construir o simples (carimbo fixo) e deixar a variante atrás de um lever.** Ligar a
compensação sem ter medido dois aparelhos é decidir por raciocínio onde o projeto manda medir — a
mesma regra que produziu D-05 e D-09. O que P4.4 disser é que decide.

---

## 5. Snapshots e interpolação (RF-39)

### 5.1 O snapshot não é o mundo

`World` tem 5 049 B/tick de coisas serializáveis; o render lê 263 B disso (§1.2). A diferença são
três classes de campo, e a distinção não é otimização — é **contrato**:

| classe | exemplos | vai para o fio? |
|---|---|---|
| **estático da rodada** | `charId`, `team`, `stat.maxHp`, `stat.radius`, `ultThreshold`, cor | uma vez, em `{t:'rodadaInicio'}` |
| **dinâmico que o render lê** | `x`, `y`, `facing`, `hp`, `alive`, `ultCharge`, `abilityReadyAt`, efeitos, projéteis, zonas | a cada snapshot |
| **interno do motor** | `memory`, `ax/ay`, `contact`, `base`, `bonusPassive`, `bonusItem`, `nextId`, `phase` | **nunca** |

A terceira linha é a que importa em revisão: um campo interno que vaze para o snapshot é um campo
que o cliente pode passar a exibir, e daí a dois passos de alguém achar que o cliente pode decidi-lo.

**O renderizador não muda.** `client/render.ts` recebe hoje um objeto com `arena`, `balls`,
`projectiles`, `zones`, `chars`, `time`, `over`, `winner`. `net/projecao.ts` monta exatamente essa
forma a partir de (snapshot + estático da rodada + `CHARS` local). Nenhuma linha de `render.ts`
entra nesta fase — e essa é a prova de que o corte da §2.2 está no lugar certo.

### 5.2 A taxa é um lever, não um número deste documento

Pela §1.2, a 30 Hz o custo é **8,2 kbit/s** comprimido. A escolha não é de banda; é entre:

| | 60 Hz | 30 Hz | 20 Hz |
|---|---|---|---|
| banda comprimida | 16,4 kbit/s | 8,2 kbit/s | 5,5 kbit/s |
| atraso de interpolação (§5.3) | ~17-33ms | ~33-67ms | ~50-100ms |
| mensagens/s por cliente (rádio, bateria) | 60 | 30 | 20 |

**Recomendação: `SNAPSHOT_HZ = 30` como ponto de partida, exposto como constante única, e o valor
final decidido no smoke de P4.4 em dois aparelhos.** 30 Hz porque paga metade do atraso de 20 Hz
por 2,7 kbit/s — barato — e porque 60 Hz gasta o dobro de acordes de rádio num celular sem que a
§1.1 (bolas lentas, 0,35 cast/s) sugira que alguém veja diferença. Mas ninguém aqui viu o jogo
rodando em dois celulares, e este é exatamente o tipo de número que o projeto decide medindo.

### 5.3 Interpolação, e o que não se interpola

O cliente mantém um buffer dos últimos snapshots e desenha o instante `agora − ATRASO_DE_BUFFER`,
com `ATRASO_DE_BUFFER ≥ 1 intervalo de snapshot` + margem de jitter. Posição, velocidade e ângulo
interpolam.

**O que não interpola, e precisa estar escrito:**

- **`world.events`.** São de um tick só e o cliente os consome para os números flutuantes
  (`main.ts:405`). Com snapshot a 30 Hz, os eventos dos ticks intermediários **precisam ser
  acumulados no snapshot**, não descartados — senão metade dos acertos deixa de aparecer na tela.
  A medição da §1.2 já os incluiu acumulados.
- **`alive` e `hp`.** Booleano não interpola; morte não é meio-caminho.
- **Início e fim de zona.** Uma Muralha existe ou não existe. Interpolar `expiresAt` produziria
  parede fantasma.

### 5.4 O cliente sem simulação ainda precisa de `sim/`?

Sim, mas só do **tipo** e do roster: `render.ts` lê `world.chars[b.charId]` para nome, ícone, cor e
alcance. `CHARS` continua no bundle do cliente porque é conteúdo, não autoridade. O que sai do
bundle conectado é a *chamada* a `step()`, não o módulo.

---

## 6. Sala por link (RF-40)

```
fase:  aguardando ──(2 assentos ocupados)──▶ jogando ──(partidaFim)──▶ encerrada
                 ◀──(desconexão antes do início)──
```

- **O link é `/#/sala/{id}`**, com `id` gerado **pelo servidor**, de um stream próprio. Não deriva
  de `matchSeed`: se derivasse, o link vazaria a seed da partida, e a seed é o que determina tudo
  (§7). É a mesma disciplina de streams separados de `sim/rng.ts` (`debt.7`), aplicada a outra coisa.
- **Sem contas, sem matchmaking.** O PRD pede sala por link e nada mais (Artigo IV).
- **Reconexão sai de graça.** Como o cliente não guarda autoridade nenhuma, reconectar é
  reassinar: o servidor manda `{t:'visao'}` + `{t:'rodadaInicio'}` + o próximo snapshot, e o cliente
  volta ao ar sem estado próprio para reconciliar. Este é o segundo dividendo do modelo autoritativo
  depois do anti-cheat, e vale registrar que ninguém o projetou — ele cai.
- **Desconexão durante a rodada é decisão de produto**, não de arquitetura. Ver §12/R-02.

---

## 7. Replay (RF-41, P4.3)

### 7.1 D-08 já está resolvido, e o teste que o prova já roda

D-08 (*"stream de PRNG do bot"*, Risco #7) foi decidido e implementado na Fase 2: o bot saca de
stream próprio, semeado a partir da seed da partida, e `sim:check` prova o isolamento rodando a
partida com o bot, gravando `Command[]`, e reproduzindo **sem bot nenhum** — se o bot consumisse
`world.rng`, o hash divergiria (`tools/determinism.ts:215-256`). `tools/partida.ts` sobe isso ao
nível da partida inteira: `matchSeed + Decisao[] + Command[]` reproduz placar, vencedores e hashes.

**O que a Fase 4 acrescenta não é o mecanismo — é o gravador.** O servidor já tem, por construção,
tudo o que o replay precisa: ele é quem recebe as decisões e quem carimba os comandos. Gravar é
anexar duas listas que já passam pelas mãos dele.

Custo de armazenamento, pela §1.3: **54,6 comandos × 26,3 B ≈ 1,4 kB por rodada**, mais as decisões.
Uma partida Bo5 inteira cabe em poucos kB. Um replay não é um vídeo; é uma receita.

### 7.2 P4.3, com a ressalva que a §1.5 obriga

P4.3 pede *"hash idêntico ao da execução ao vivo"*. Medido:

| onde o replay roda | veredito |
|---|---|
| **mesma engine que gravou** (servidor Node reproduz o que o servidor Node simulou) | **bit-exato.** P4.3 sem asterisco |
| **engine diferente** (cliente Chrome reproduz o que o servidor Node simulou) | `hash()` bateu em 5/5 seeds, mas o estado diverge em bits em 3/5 (§1.5) |

**Recomendação: a verificação de P4.3 roda no servidor, na mesma engine.** Um visualizador de
replay no navegador é possível e desejável, mas ele não é o instrumento do portão — e se um dia
for, a comparação tem que deixar de ser `hash(a) === hash(b)` e virar `|a − b| < ε` com ε declarado
(§11.1 explica por que a diferença entre as duas coisas não é cosmética).

---

## 8. Anti-cheat e segredo (RF-42, P4.2)

### 8.1 P4.2 passa por subtração

P4.2: *"o cliente não decide dano: divergir o cliente artificialmente não altera o placar"*.

A forma cara de passar nisso é validar o que o cliente manda. A forma barata é **não haver o que
validar**: no modo conectado o cliente não chama `step()`, não instancia `World`, e não tem
autoridade sobre nada além de qual pixel pintar. Divergir o cliente artificialmente altera **o que
aquele jogador vê**, e nada mais — o outro jogador e o placar não percebem.

A superfície de entrada do servidor fica sendo exatamente duas mensagens — `{t:'cast'}` e
`{t:'decisao'}` — e as duas já passam por validação que **existe hoje**:

| mensagem | quem valida | o que acontece se for ilegal |
|---|---|---|
| `{t:'decisao'}` | `match/aplicar()` | `Transicao.erro` — "rejeitada com motivo, **nunca aplicada pela metade**" (§2.3 de E3) |
| `{t:'cast'}` | `sim/world.ts:castCommand` + o servidor mapeando `ballIndex → ballId` | cooldown, alcance e vida já são checados pelo motor; o mapeamento impede castar bola alheia |

O único cheque genuinamente novo é o do assento: **a conexão A só pode mover as bolas do jogador A,
nesta rodada, com o lado que `ladosDaRodada` deu a ela** (§5.3 de E3 — jogador ≠ lado). É uma linha,
e é a única linha de anti-cheat que esta fase escreve. RF-42 estava certo: não é subsistema.

### 8.2 O segredo deixa de ser convenção — fecha §13.6 de E3

`architecture-e3.md` §13.6 registrou, com todas as letras, que o segredo da build era *"convenção
reforçada por tipo"* e que *"quem abrir o devtools vê tudo"*, aceitável porque o adversário era o bot.

Com o servidor projetando `visaoPara(estado, jogador)` por socket, a build não revelada do oponente
**não é enviada**. Não está no devtools porque não está na máquina. A ressalva de §13.6 fecha aqui,
e fecha sem uma linha de código novo em `match/` — o tipo `VisaoPartida` já tinha a forma certa,
por ter sido desenhado como projeção em vez de como filtro de UI.

---

## 9. O que muda no cliente

Na mesma forma da §11.2 de E3:

- `client/main.ts` ganha **dois modos**: `local` (o de hoje, contra o bot, inteiro) e `conectado`.
  Os dois compartilham render, input e telas; divergem em quem tem o estado.
- No modo conectado somem do cliente: `criarPartida`, `aplicar`, `setupDaRodada`, `createWorld`,
  `step`, `registrarRodada`, `criarPolitica`, `botCommands` — e o acumulador de tick.
- `disparar()` deixa de empilhar em `pendentes` e passa a mandar `{t:'cast'}` sem tick (§4.1).
  A mira local (RF-34) continua desenhando na hora: é `client/input.ts`, e não passa por rede.
- `INPUT_DELAY_TICKS` vira `ATRASO_ALVO_TICKS = 6` em `net/protocolo.ts`, **uma definição** usada
  pelo modo local e pelo servidor. É o que faz o modo solo continuar sendo treino honesto para o 1v1.
- A telemetria de `e3.5` continua local e continua do cliente: ela mede **o jogador**, não a partida.
  `EventoPartida` passa a chegar pelo fio em vez de sair do redutor local, e o coletor não sabe a
  diferença.
- `render.ts`, `telas.ts`, `input.ts`, `layout.ts`: **intactos**.

---

## 10. Plano de construção — passos verificáveis

| # | Passo | Verificação | Golden hash |
|---|---|---|---|
| 0 | `net/protocolo.ts`: tipos de mensagem, codec, `ATRASO_ALVO_TICKS`, `SNAPSHOT_HZ` | `npm run check` | **idêntico** |
| 1 | Ativar o atraso no modo local (`INPUT_DELAY_TICKS` 0 → 6, via a constante única) — **P4.1** | `sim:check` verde; jogar e sentir | **idêntico** (§4.2) |
| 2 | `net/snapshot.ts` + `net/projecao.ts`: `World → Snapshot → forma de render`, ida e volta | teste de ida-e-volta: projetar o snapshot e desenhar dá a mesma tela | **idêntico** |
| 3 | `net/sala.ts` pura + cobertura no `sim:check`: partida inteira em sala, sem socket | nova guarda no `sim:check`: sala headless reproduz o mesmo placar de `tools/partida.ts` | **idêntico** |
| 4 | `server/main.ts`: `ws`, assentos, laço de relógio, roteamento de sala | dois clientes na mesma máquina, partida completa | **idêntico** |
| 5 | `client/rede.ts` + modo conectado em `main.ts`: buffer, interpolação, `{t:'cast'}` | partida 1v1 em duas abas | **idêntico** |
| 6 | Gravador de replay no servidor + verificação em Node — **P4.3** | replay do servidor bate bit-a-bit com a execução ao vivo | **idêntico** |
| 7 | **P4.4** — smoke em dois aparelhos; decidir `SNAPSHOT_HZ` e se a compensação de §4.4 entra | julgamento humano: *1v1 entre dois celulares é fluido?* | **idêntico** |

**Nenhum passo desta fase move o golden hash**, e isso não é sorte: nada aqui toca `sim/`,
`chars/` ou `match/`. Se algum passo mover, a mudança escapou da linha da §2.2 e a story para.

Dependência nova no `package.json`: `ws` (servidor). É a primeira dependência de runtime do
projeto — hoje `devDependencies` só tem `typescript`, `vite` e `@types/node`. Vale a nota: uma
dependência de runtime num projeto que não tinha nenhuma é decisão que o @pm merece ver escrita, não
descobrir no `package.json`.

---

## 11. Riscos da própria proposta

### 11.1 Quantização não é tolerância — é uma loteria com boas probabilidades

Este é o risco central desta fase, e ele é sutil o bastante para merecer o espaço.

A §1.5 mostra o hash batendo em 5/5 mesmo com o estado divergindo em bits. É tentador ler isso como
*"o hash tolera divergências abaixo de 1e-4"*. **Ele não tolera.** `hash()` faz `toFixed(4)`, que é
**arredondamento**, não banda de tolerância: dois valores que diferem em 1e-9 produzem strings
diferentes sempre que caem em lados opostos de uma fronteira de arredondamento. A chance disso, para
um Δ de 1e-9, é da ordem de 1e-5 por valor — pequena, mas não zero, e ela cresce **linearmente com
o Δ e com a quantidade de valores comparados**.

Ou seja: os 5/5 da §1.5 são o resultado **esperado**, não uma prova de robustez. Com Δ = 1,6e-9, 20
campos e 5 seeds, a probabilidade de ao menos um desencontro era da ordem de 1e-3. Rodar mais seeds
não muda a natureza do instrumento — muda só o tamanho da amostra em que ele vai, um dia, dar
falso vermelho.

Três consequências práticas:

1. **Verificação de replay entre engines não deve usar `hash()`.** Deve usar `|a − b| < ε` com ε
   declarado. `hash()` continua perfeito para o que ele foi feito: comparar execuções **na mesma
   engine**, onde a igualdade é exata.
2. **O `sim:check` está seguro, e por um motivo específico:** ele roda só no Node, e ali a
   comparação é bit-a-bit por construção. O risco não é dele.
3. **O crescimento do Δ não foi caracterizado.** Na seed 379 ele foi 2,3e-13 → 1,1e-11 → 9,8e-10 →
   1,6e-9 (ticks 2000, 3000, 4000, 5249): irregular, sem lei estabelecida por n=5. E a rodada pode
   ir a **10 800 ticks** (§1.1), o dobro da mais longa medida. Não afirmo que o Δ cruzaria o
   quantum lá; afirmo que **nada aqui prova que não**.

**Mitigação barata, e é uma story pequena:** uma guarda de determinismo entre engines rodando a
mesma bateria da §1.5 em Chrome headless, comparando com o Node por ε declarado. Custa uma
dependência de CI e fecha o buraco de medição para sempre. Fora do escopo desta fase; devolvida na
§12/R-04.

### 11.2 O modelo só é imune porque ninguém prediz — e essa imunidade é frágil a "melhorias"

A §1.5 diz que só uma máquina simular é o que salva o desenho. A consequência é que **qualquer
otimização futura que faça o cliente simular reabre o problema inteiro**, e reabre de forma
silenciosa: predição funciona 99% do tempo e falha exatamente quando o `atan2` de uma Muralha cai
do lado errado. Vale um aviso no topo de `net/`, na mesma forma dos avisos de `debt.6` e `debt.7`
em `sim/types.ts` — os que já provaram que comentário no lugar certo evita reincidência.

### 11.3 Ninguém mediu rede

Toda a §1 roda numa máquina só. Não há número neste documento sobre perda de pacote, jitter, ou o
que acontece quando o rádio do celular dorme entre snapshots a 20 Hz. O portão da fase é julgamento
humano em dois aparelhos justamente porque a parte que falta medir é a que não dá para simular.

### 11.4 O bot é o sujeito da medição, de novo

Igual a `architecture-e3.md` §13.2: as 5 rodadas da §1 são bot × bot. O volume de comandos da §1.3
(0,35/s) é o do bot; um humano nervoso emite mais. Como o upstream tem margem de 2 300×, isso não
muda conclusão nenhuma — mas o número não é o do humano, e está escrito para ninguém citá-lo como se
fosse.

### 11.5 Uma dependência de runtime

`ws` entra num projeto que hoje não tem dependência de runtime nenhuma. É a escolha óbvia e madura,
e ainda assim é superfície nova (segurança, atualização, tamanho). Registrado para ser decisão
consciente, não consequência.

---

## 12. Ressalvas e o que este documento devolve ao @pm / usuário

Nenhuma delas bloqueia começar a fase; R-01 e R-02 bloqueiam **terminá-la**.

### R-01 — A latência sentida é maior que a do diagrama do GDD *(decisão de produto)*

O GDD §8 desenha o cast saindo em ~100ms. Com o carimbo no servidor (§4.1, e é o desenho seguro), o
número real é `RTT/2 + 100ms + atraso de interpolação` — plausivelmente 150-250ms num celular em
4G. **Pergunta ao @pm:** o alvo de sensação é "100ms desde o toque" (e então a compensação de §4.4
entra desde o começo, com o custo de complexidade), ou é "atraso uniforme e previsível" (e então o
carimbo fixo basta)? *Recomendação: o segundo, decidido depois de P4.4 — mas o número do GDD merece
emenda de qualquer forma, porque hoje ele promete o que o desenho não entrega.*

### R-02 — Desconexão no meio da rodada *(bloqueia terminar a fase)*

Não existe requisito. As opções, com o que cada uma custa:

| opção | custo | efeito no produto |
|---|---|---|
| **W.O.** — quem cai perde a rodada | trivial | pune queda de rede como se fosse desistência |
| **Pausa com prazo** — servidor congela N segundos e espera reconexão | pequeno (a reconexão já é de graça, §6) | o outro jogador espera sem saber se volta |
| **Bot assume** — a política de `bot/partida.ts` joga pelo ausente | médio | muda o resultado de uma partida competitiva por um bot |
| **Anula a partida** | trivial | quem estava perdendo tem incentivo a derrubar a própria rede |

*Recomendação: pausa com prazo curto e W.O. no estouro.* Mas é decisão de produto, não de
arquitetura, e a quarta linha mostra que a escolha errada cria incentivo perverso.

### R-03 — `SNAPSHOT_HZ` sai de medição em aparelho, não daqui *(informativa)*

§5.2 recomenda 30 Hz como ponto de partida e explica por quê. O valor final é evidência de P4.4.
Registrado para que ninguém trate 30 como decidido.

### R-04 — A guarda de determinismo entre engines é uma story, e não é desta fase *(devolvida ao backlog)*

§11.1 mostra que o buraco de medição é real e a mitigação é barata (bateria da §1.5 em Chrome
headless no CI, comparando por ε declarado). Não cabe no escopo de E4 — RF-37 a RF-42 não a pedem —
mas cabe no backlog **antes** da Fase 5, porque a Fase 5 traz 6 personagens novos e cada `atan2`
novo é uma fonte a mais.

### R-05 — Uma dependência de runtime entra no projeto *(ratificação)*

`ws` (§10). Óbvia, madura, e ainda assim a primeira. Registrada para ser ratificada, não assumida.

### R-06 — A morte súbita virou caminho comum, e ninguém decidiu isso *(informativa, herda R-05 de E3)*

`architecture-e3.md` §14/R-05 registrou o Risco #6 como *"morte súbita segue em 0% mesmo no alvo de
D-05"*. Com `ESCALA_HP = 6.0` a leitura inverteu: **5 de 5** rodadas bot × bot passam de 60s (§1.1),
e a evidência humana de `e3.6` registrou `atingiu60s` em 3 de 4 partidas. Não é problema desta fase
— é observação de que uma decisão de produto mudou um indicador de produto, e o @pm pode querer
reler R-05 com o número novo. **Não reabre D-05.**

---

## Anexo A — Mapa de arquivos

| Arquivo | Estado | Papel |
|---|---|---|
| `src/net/protocolo.ts` | **novo** | Tipos de mensagem, codec, `ATRASO_ALVO_TICKS = 6`, `SNAPSHOT_HZ`. Puro |
| `src/net/snapshot.ts` | **novo** | `World → Snapshot`. Puro. Só campos da §5.1 |
| `src/net/projecao.ts` | **novo** | `Snapshot + estático → a forma que `render.ts` já aceita`. Puro |
| `src/net/sala.ts` | **novo** | Máquina de estados da sala. Pura, relógio injetado (§3.2) |
| `src/server/main.ts` | **novo** | Entrada Node: `ws`, assentos, laço de relógio, roteamento |
| `src/client/rede.ts` | **novo** | WebSocket do navegador, buffer de snapshots, interpolação |
| `src/client/main.ts` | **muda** | Ganha os modos `local` e `conectado` (§9) |
| `package.json` | **muda** | Dependência `ws`; script `server` |
| `src/sim/**` | **intacto** | Nem um campo, nem um import (§2.2) |
| `src/match/**` | **intacto** | Muda quem chama, não o que é (§3.3) |
| `src/shop/**`, `src/chars/**` | **intactos** | — |
| `src/client/render.ts`, `telas.ts`, `input.ts`, `layout.ts` | **intactos** | §5.1 |
| `src/tools/**` | **intacto** | Ganha uma guarda no `sim:check` (§10, passo 3) |

---

## Anexo B — Checklist do portão da Fase 4

| # | Critério (PRD §2, E4) | Como se verifica | Onde este documento o resolve |
|---|---|---|---|
| **P4.1** | `INPUT_DELAY_TICKS = 6` ativo | constante única em `net/protocolo.ts`, usada pelos dois modos | §4.1 · hash-neutralidade provada em §4.2 · §10 passo 1 |
| **P4.2** | O cliente não decide dano | divergir o cliente artificialmente e conferir o placar do outro | §8.1 — passa por subtração: o cliente não simula |
| **P4.3** | Replay reconstrói a partida com hash idêntico | replay no servidor, **mesma engine** | §7.2 · **ressalva medida** em §1.5 e §11.1 |
| **P4.4** | Smoke visual em dois aparelhos | manual, dois celulares, partida completa | §10 passo 7 · decide `SNAPSHOT_HZ` (§5.2) e §4.4 |
| — | Julgamento humano: *1v1 entre dois celulares é fluido?* | usuário jogando, com outra pessoa | Nada aqui substitui isso. §11.3 registra o que não foi medido |
| — | `npm run sim:check` verde, golden hash **idêntico** nos 7 passos | comando | §10 |
| — | `npm run check` (`tsc --noEmit`) verde | comando | — |
| — | `sim/` segue sem importar de `chars/`, `bot/`, `client/`, `match/`, `shop/`, `net/` | grep + revisão | §2.2 |
| — | `net/` não importa `ws` nem toca DOM | grep + revisão | §2.3 |

---

## Anexo C — Rastreabilidade

| Requisito / decisão | Onde |
|---|---|
| RF-37 — servidor autoritativo Node + WebSocket importando `sim/` | §3 |
| RF-38 — input delay ~100ms, sem rollback | §4 |
| RF-39 — clientes interpolam entre snapshots | §5 |
| RF-40 — sala por link | §6 |
| RF-41 — replay = seed + linha do tempo de inputs | §7 |
| RF-42 — anti-cheat é consequência do modelo | §8.1 |
| RF-34 — mira imediata (feedback local) apesar do atraso | §9 |
| RF-04 / D-06 — timer de build de 30s | §3.4 (muda de dono) |
| D-08 — stream de PRNG do bot (Risco #7) | §7.1 — resolvido na Fase 2, verificado aqui |
| P4.1 · P4.2 · P4.3 · P4.4 | §4.1-4.2 · §8.1 · §7.2 · §10 passo 7 |
| Decisão #3 (sala por link) · #4 (servidor autoritativo, input delay) | §6 · §3, §4 |
| `architecture-e3.md` §2.2 (setas) · §2.4 (segredo por projeção) · §2.6 (relógio fora de `match/`) · §13.6 (segredo é convenção) | §2.2 · §8.2 · §3.4 · §8.2 (fecha) |
| `architecture-e3.md` §14/R-05 (morte súbita) | §12/R-06 (leitura nova, não reabre D-05) |
| `architecture-e2.md` §3.3 · `debt.7` (isolamento de stream, invariante de ordenação) | §7.1 · §1.5 |
| GDD §8 (modelo de rede aprovado; modelo morto) | §3.1 · §4.4 (emenda proposta ao número) |
