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
> **Revisões:** 2026-09-21 (`e4.1` — §4.1) · 2026-09-21 (`e4.2` — §1.2, §2.2, §5.1, §5.2, **§5.5
> codificação do fio, decidida**, §5.6, §9, §11.6, §12/R-05, Anexos A e B). Evidência da revisão de
> `e4.2` em `docs/evidence/e4-codificacao-fio/`. · 2026-09-21 (`debt.10` → `debt.11` — §2.2: **seta
> `tools/ → client/` declarada** e casa da guarda de telemetria decidida; Anexos A e B). · 2026-09-21
> (E48-ARC-003, gate de `e4.8` — **§11.6.1: versão do fio e fixture congelada decididas**; §0, §5.5,
> §6, §10, Anexos A e B).

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
| Onde a rede mora, sem tocar em `sim/` | §2 | Camada `net/` + entrada `server/`. `sim/`, `match/` e `shop/` **intactos**; `render.ts` muda **só em anotações de tipo** (emenda de 2026-09-21, §5.1) |
| Versão do fio e fixture congelada | §11.6.1 | **Decididas em 2026-09-21** (E48-ARC-003): `VERSAO_DO_FIO` no `{t:'sala'}`, conferida pelo decodificador, em story nova antes da `e4.3`; texto de um `snap` congelado no `sim:check` (`debt.12`) |
| Codificação do fio | §5.5 | **Decidida em 2026-09-21** (`e4.2`): o `{t:'snap'}` vai como tupla posicional em JSON, com quantização que preserva prontidão; o resto do protocolo fica JSON com nomes; deflate é lever, não premissa |
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

> **Atualização (2026-09-21, `e4.2`) — o que estes números mediram, e o que não mediram.** A linha
> "snapshot de render" foi medida sobre uma forma **compacta que eu escrevi no script de evidência**
> (`snapshotRender`, `docs/evidence/e4-determinismo-engines/01-banda-cpu-duracao.mjs:81`): chaves de uma
> letra, tuplas posicionais, só os eventos `hit` do tick, e arredondamento agressivo —
> `Math.round(time)`, `Math.round(abilityReadyAt)`, `ultCharge` a 0,1. Três consequências, todas
> tratadas na §5.5:
>
> 1. **O limiar de ~600 B do AC 9 de `e4.2` foi calibrado nessa codificação.** O snapshot real, em JSON
>    com nomes de campo, custa **904 B/quadro** a 30 Hz (879 B sem o envelope `{t,s,seq}`), e **nada da
>    classe 3 vazou** — o detector de chaves de `e4.2` confirma. O custo é nome repetido e dígito de
>    float, não campo indevido. `e4.2` seguiu o AC ao pé da letra: investigou, não ajustou o orçamento, e
>    devolveu a decisão. Ela está na §5.5.
> 2. **Aquele arredondamento de `abilityReadyAt` e `ultCharge` é justamente o que pode acender PRONTO
>    antes da hora.** Foi atalho de medição, nunca especificação; a §5.5 o substitui por regras que
>    preservam a prontidão por construção.
> 3. **A coluna "comprimido" subestimou por ~2×.** Os 34 B/tick com contexto valem para a forma
>    reduzida a 60 Hz. Com a forma real, medido: **69 B/tick a 60 Hz e 75 B/quadro a 30 Hz** — e a
>    conta de 30 Hz da tabela (8,2 kbit/s) multiplicava a compressibilidade de 60 Hz, ignorando que
>    quadros a dois ticks de distância se repetem menos. O número de 30 Hz é **~18 kbit/s**, não 8,2.
>
> A **leitura** acima sobrevive para a codificação compacta (78 kbit/s a 30 Hz, sem compressão) e **não
> sobrevive** para JSON com nomes sem compressão (217 kbit/s; ~11 MB numa Bo5 de cinco rodadas, em plano
> de dados móvel). A tabela vigente está na §5.5.

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
tools/   arnês, CLI, sim:check           → sim/, chars/, bot/, match/, shop/, net/   ← net/ desde e4.2
                                           + client/ SÓ telemetria (lista fechada)  ← declarada 2026-09-21
server/  entrada Node: WebSocket, roteamento, relógio → net/, match/, chars/, bot/  ← NOVO
client/  render, input, telas, rede      → todos
```

> **Atualização (2026-09-21, `e4.2`) — seta nova `tools/ → net/`.** `tools/determinism.ts` passou a
> importar `net/protocolo.ts`, `net/snapshot.ts` e `net/projecao.ts` para hospedar a guarda de
> ida-e-volta do fio (`e4.2`/AC 7 e AC 11). A seta é deliberada e coerente com a tabela: `tools/` já
> ficava acima de todo módulo puro, e é o `sim:check` que prova `net/` sem subir servidor — o dividendo
> que a própria §2.2 promete. `e4.8` a usou de novo para as guardas do codec (`910add8`), e `e4.3` a usa
> para a guarda da sala.
>
> **Sem ciclo — conferido no grafo de imports de arquivo, não só por leitura** (40 arquivos de `src/`,
> busca em profundidade sobre `import`/`export ... from`). `net/` importa só `sim/types.ts`,
> `match/types.ts` e a si mesmo; nenhum arquivo de `sim/`, `match/`, `shop/`, `chars/` ou `bot/`
> importa `net/` ou `tools/`. Logo não existe caminho `net/ → … → tools/`, e a seta nova não fecha laço.
> Os únicos ciclos de arquivo do projeto são internos a `sim/` e só de tipo (`types.ts ↔ effects.ts`,
> `types.ts ↔ stats.ts`, ambos `import type`, apagados em runtime), anteriores a esta fase.
>
> **Achado da mesma auditoria, anterior a E4 e fora do escopo desta revisão:** existe uma seta
> `tools/ → client/` que a tabela nunca declarou — `tools/telemetria.ts` (`e3.5`) importa
> `client/input.ts` e `client/telemetria.ts`. Com `client/ → tools/` (`client/main.ts` importa `hash` de
> `tools/harness.ts`), as duas **pastas** se apontam mutuamente, embora nenhum **arquivo** feche ciclo.
> Não quebra nada hoje; registro para que ninguém cite esta tabela como prova de que `tools/` não
> conhece `client/`. Se virar item, é dívida da Fase 3, não de E4. *(Virou item no mesmo dia: a seta
> está declarada no bloco abaixo, com lista fechada de arquivos.)*

> **Decisão (2026-09-21, `debt.10` → `debt.11`) — a seta `tools/ → client/` fica declarada, e a guarda
> da telemetria roda no `sim:check` a partir de um arquivo próprio.** Pedido: o achado `DEBT10-TST-001`
> (gate de `debt.10`, medium) e o roteamento do @po no Change Log v1.4 de `debt.10`, que recomenda a guarda
> dentro do `sim:check` e deixa a seta para esta seção.
>
> **O que foi medido nesta sessão, antes de decidir** (código em `1564ae4`, sem alterá-lo; scripts no
> scratchpad da sessão):
>
> | Medida | Resultado |
> |---|---|
> | Grafo de imports de arquivo de `src/` (40 arquivos; `import`/`export ... from` relativos, regex estática, sem imports dinâmicos, que não existem) | Setas `tools/ ↔ client/` hoje: `client/main.ts → tools/harness.ts` (**execução**), `tools/telemetria.ts → client/input.ts` (**execução**, valores `ARRASTO_MAX`/`LIMIAR_ARRASTO_PX`, desde `24b85ff`/`e3.5`), `tools/telemetria.ts → client/telemetria.ts` (**só tipo**). A nota acima tratava a seta existente como uma coisa só. Ela já é de execução em uma das duas pernas |
> | Ciclos de arquivo, com e sem as arestas hipotéticas de `debt.11` (`determinism.ts → guarda-telemetria.ts → {client/telemetria.ts, tools/telemetria.ts}`) | Só os dois ciclos de tipo internos a `sim/`, já registrados acima. **Zero ciclos de execução**, antes e depois |
> | Fecho de execução do `sim:check` (módulos carregados por `node src/tools/determinism.ts`) | **27 → 32.** Entram `client/input.ts`, `client/layout.ts`, `client/telemetria.ts`, `tools/telemetria.ts` e o arquivo da guarda. **É a primeira vez que o `sim:check` carrega código de `client/`.** `chars/tuning.ts` e `net/protocolo.ts`, que o coletor importa, já estavam no fecho |
> | Importar `tools/telemetria.ts` de outro módulo, sem argumento | O processo sai com código 1 e imprime `uso: ...`. **Com um argumento qualquer** (`--x`), `main()` tenta `readFileSync('--x')` e morre com `ENOENT`. São dois modos de falha, não um |
> | Importar `client/telemetria.ts` em Node 24.13.1 com um `localStorage` falso em `globalThis` | Funciona. `criarTelemetria()` → `ler()` avisa 1 evento sem carimbo, e `registrar()` grava `atrasoTicks: 6, escalaHp: 6` só no evento novo. **O aviso de `ler()` sai em `console.warn`**, então entraria na saída do `sim:check` se não for capturado |
> | Globais web em Node 24.13.1 | `localStorage` e `document` indefinidos; `Blob` e `URL.createObjectURL` nativos |
> | `import.meta.main` em Node 24.13.1 | `true` quando o arquivo é a entrada do processo, `false` quando é importado. Declarado em `@types/node` instalado (`web-globals/importmeta.d.ts`), então passa em `npm run check` |
> | `npm run sim:check` hoje | exit 0, 50 linhas com o cabeçalho do npm, cerca de 8 s de parede |
>
> **1. Onde a guarda mora — opções e trade-offs.**
>
> | Opção | A favor | Contra | Veredito |
> |---|---|---|---|
> | **A.** Corpo da guarda dentro de `determinism.ts`, que importa `client/telemetria.ts` e `tools/telemetria.ts` | Sem arquivo novo; roda em todo gate | `determinism.ts` (985 linhas) passa a importar `client/` direto, e o arquivo de que todo gate depende entra na lista de quem cruza a fronteira. Contraria o precedente de `tools/partida.ts`, que tirou a bateria de partida de lá pelo mesmo motivo | Rejeitada |
> | **B.** Script irmão `npm run telemetria:check` | `sim:check` não carrega `client/`; fronteira mais limpa | Só protege se cada `quality_gate_tools` futuro lembrar de listá-lo. O histórico do projeto é exatamente esse esquecimento: "o caminho que importa nunca é testado" (`E41-TST-003`, `DEBT10-TST-001`). Mexe em `package.json` | Rejeitada |
> | **C.** Extrair o carimbo e a partição para um módulo puro fora de `client/`, e testar esse módulo | Nenhuma seta nova de execução | **Não pega a mutação que importa.** Um teste de `carimbar()` puro continua verde se `registrar()` parar de chamá-lo, ou se o carimbo for para `exportar()` (M1 e M1b do gate). O cenário discriminante exige exercitar o `registrar()` **real**. Além disso, mexe em código `Done` de `client/` só para acomodar o teste | Rejeitada |
> | **D.** Arquivo próprio `src/tools/guarda-telemetria.ts`, chamado pelo `sim:check` (`determinism.ts` ganha import, chamada e bloco de falha) | Roda em todo gate, que é o argumento do @po. O import de execução de `client/` fica isolado num arquivo cujo único papel é a guarda. `determinism.ts` não importa `client/`. Segue o precedente de `tools/partida.ts` e o de `e4.6` (CLI sobre arquivo + guarda headless no `sim:check`) | `sim:check` passa a carregar 3 arquivos de `client/` (27 → 32 módulos) e passa a depender de eles serem importáveis em Node. A saída do `sim:check` ganha linhas, o que afeta o "antes × depois" das stories que disputam `determinism.ts` | **Escolhida** |
>
> **Por que o custo da D é aceitável.** A dependência de "importável em Node" já existe: o CLI
> `node src/tools/telemetria.ts` carrega `client/input.ts` e `client/layout.ts` desde `e3.5`. A D só a
> estende a `client/telemetria.ts`, que hoje cumpre a condição (medido acima). E o modo de falha é
> barulhento: um acesso a DOM no topo de um desses arquivos derruba o `sim:check` com `ReferenceError`, não
> passa calado. O argumento "manter o `sim:check` focado em determinismo" não descreve o comando de hoje. Ele
> já hospeda a auditoria estática do Pilar 3, a guarda de BOT-001, a economia da partida (RF-23) e a
> ida-e-volta do fio. Na prática é **o gate headless do projeto**, e o nome ficou.
>
> **2. A seta, declarada.** Fica na tabela acima, com estas regras:
>
> - **Lista fechada de arquivos de `tools/` que podem importar `client/`:**
>
>   | Arquivo de `tools/` | Importa de `client/` | Tipo |
>   |---|---|---|
>   | `tools/telemetria.ts` (CLI agregador, `e3.5`) | `client/input.ts` (`ARRASTO_MAX`, `LIMIAR_ARRASTO_PX`) | execução |
>   | `tools/telemetria.ts` | `client/telemetria.ts` (`ArquivoTelemetria`, `EventoRegistrado`) | só tipo |
>   | `tools/guarda-telemetria.ts` (`debt.11`) | `client/telemetria.ts` (`criarTelemetria`, `CHAVE` e os tipos) | execução |
>
>   Qualquer outro arquivo de `tools/`, incluindo `determinism.ts`, `harness.ts`, `partida.ts` e os de
>   `e4.3`/`e4.6`/`e4.8`, **não** importa `client/`. Um arquivo novo nesta lista é emenda desta seção, não
>   decisão de story. A conferência é `grep -rn "from '\.\./client/" src/tools/`, que deve devolver só os
>   dois arquivos acima.
> - **Invariante de importabilidade.** Todo arquivo de `client/` alcançado por `tools/` (hoje
>   `client/input.ts`, `client/layout.ts` e `client/telemetria.ts`) não acessa `window`, `document`,
>   `localStorage` nem `canvas` no topo do módulo. Esses acessos ficam dentro de funções, como já estão. Se
>   um desses arquivos precisar de efeito no topo, a mudança dele é que abre handoff, não a guarda.
> - **A outra direção fica como está.** `client/ → tools/` continua sendo só `client/main.ts →
>   tools/harness.ts` (`hash`). **Nenhum arquivo de `client/` importa `tools/telemetria.ts` nem
>   `tools/guarda-telemetria.ts`**: o primeiro importa `node:fs`, e qualquer um dos dois arrastaria código
>   de Node para o bundle do Vite.
> - **Sem ciclo de arquivo** é condição da seta. Pastas que se apontam mutuamente são toleradas, desde que
>   com a lista fechada acima. Um ciclo de arquivo de execução entre `tools/` e `client/` é regressão.
> - **Por que declarar, e não resolver.** Resolver exigiria mover `ARRASTO_MAX`/`LIMIAR_ARRASTO_PX` para
>   fora de `client/input.ts` e o coletor para fora de `client/`. Os dois são semântica de entrada e de
>   instrumentação do cliente, e estão no lugar certo. O agregador os lê porque mede o que o cliente
>   gravou. Mover mexeria em arquivos `Done` e em `input.ts`, que a Fase 4 mantém intacto (Anexo A), para
>   trocar uma seta declarada e fechada por uma pasta nova. Não compensa.
>
> **3. Restrições que `debt.11` herda desta seção** (o texto da story é do @sm; isto é o contrato de forma):
>
> - **(R1) Casa.** A guarda mora em `src/tools/guarda-telemetria.ts`, que exporta uma função no molde de
>   `verificarPartida` (devolve linhas e problemas, sem lançar e sem `process.exit`). `determinism.ts` recebe
>   **só** o import dessa função, a chamada, uma linha de seção na saída e um bloco `throw` no padrão dos
>   que já existem. Não recebe import de `client/` nem de `tools/telemetria.ts`.
> - **(R2) Guarda de ponto de entrada no agregador.** Em `tools/telemetria.ts`, `main()` roda só quando o
>   arquivo é a entrada do processo. Preferência: `if (import.meta.main) main()`, medido acima. Se o @dev
>   usar comparação de `process.argv[1]` com `import.meta.url`, que registre o cuidado com a caixa da letra
>   de unidade no Windows. **Essa é a única mudança de corpo em `tools/telemetria.ts`**, fora o texto
>   opcional de `DEBT10-COD-003`. Nenhum import novo fora de `node:` (a forma preferida não precisa de
>   nenhum), nenhum `export` novo. A guarda lê `agregar()`, que já
>   é exportado. **Prova discriminante das duas direções:** (a) importar o módulo não encerra o processo (a
>   própria guarda no `sim:check` prova); (b) `node src/tools/telemetria.ts` sem argumento continua
>   imprimindo `uso:` e saindo com 1; (c) sobre os 5 exports reais de `docs/evidence/telemetria/`, a saída do
>   CLI é byte a byte igual à de antes. Sem (b) e (c), uma guarda de entrada que nunca é verdadeira passa
>   despercebida, porque o CLI ficaria mudo e o `sim:check` verde. Registrar a versão do Node usada:
>   `import.meta.main` não existe em Node antigo, e ali o CLI ficaria mudo.
> - **(R3) Coletor real, não réplica.** A guarda exercita `criarTelemetria()`/`registrar()` do
>   `client/telemetria.ts` real, com `localStorage` falso, e observa o que `exportar()` entregaria. Pode
>   capturar o conteúdo do `Blob` e usar um `document` mínimo. Todo global instalado é **restaurado pelo
>   descritor original** (`Object.getOwnPropertyDescriptor`/`defineProperty`, não `delete`) num
>   `finally`. Ao sair da guarda, `localStorage` e `document` voltam a ser o que eram. Motivo: uma versão
>   futura do Node pode trazer `localStorage` nativo, e a guarda não pode apagá-lo nem gravar num arquivo
>   real. `console.warn` é capturado durante a guarda, e a saída do `sim:check` não ganha linhas
>   `[telemetria]` soltas. A guarda pode afirmar sobre os avisos capturados.
> - **(R4) Fixture em código, não em `docs/`.** A decisão desta seção é montar o fixture misto **dentro de
>   `guarda-telemetria.ts`**, sintético e mínimo, em vez do `docs/evidence/telemetria/fixture-misto.json`
>   sugerido no gate. Motivos: o `sim:check` hoje só lê disco em `src/chars/`; `docs/evidence/` é pasta de
>   evidência que humanos substituem e reeditam, e trocar um JSON de lá mudaria o teste sem diff em `src/`;
>   e o fixture em código deixa visível a propriedade que discrimina. O realismo sobre exports reais já foi
>   provado uma vez, no gate. O que falta é a guarda contra regressão. Composição mínima: pelo menos duas
>   populações conhecidas com rodadas de humano (por exemplo (6, 6) e (0, 6)) mais eventos sem carimbo, de
>   modo que **nenhuma população tenha o `n` combinado**.
> - **(R5) As 4 mutações do gate reprovam o `sim:check`.** Cada uma aplicada à mão, `npm run sim:check`
>   rodado e revertido, com resultado no Dev Agent Record: **M1**, sem carimbo em `registrar()`; **M1b**,
>   carimbo movido para `exportar()`; **M2**, `?? 0` / `?? 1` em `populacaoDe()`; **M3**, `agregar()`
>   devolvendo `agregarPopulacao(eventos)` sem partição. As 4 precisam sair com código diferente de 0. As
>   asserções sobre `agregar()` leem **rótulo e cabeçalho** (quantos blocos `P3.1`, presença de população
>   "desconhecida"), não números formatados. Uma asserção que só confere "o carimbo existe" não pega a M2.
>   Uma que só confere "há aviso" não pega a M3.
> - **(R6) Uma só definição de "sem carimbo".** A guarda fixa a do agregador (`!Number.isFinite`, já
>   validada no gate). Se `DEBT10-COD-003` entrar, `ler()` passa a usar a mesma definição e a guarda pode
>   afirmar que a contagem do aviso de `ler()` bate com a população desconhecida. Se não entrar, a guarda
>   **não** afirma sobre a contagem de `ler()` para `null`/string. Fixar a divergência num teste seria pior
>   do que deixá-la registrada no gate.
> - **(R7) Arquivos permitidos:** `src/tools/guarda-telemetria.ts` (novo); `src/tools/determinism.ts`
>   (só R1); `src/tools/telemetria.ts` (só R2 e, opcionalmente, o texto de `DEBT10-COD-003`);
>   `src/client/telemetria.ts` (só se `DEBT10-COD-003` entrar, e só o predicado de `ler()`);
>   `docs/evidence/telemetria/README.md` (`DEBT10-DOC-002`). **Proibidos:** `package.json` (nenhum script
>   novo), `src/sim/`, `src/match/`, `src/shop/`, `src/bot/`, `src/chars/`, `src/net/`, `client/main.ts`,
>   `client/input.ts`, `client/layout.ts`, `client/render.ts` e qualquer outro arquivo de `tools/`.
> - **(R8) Golden hash imóvel, saída do `sim:check` só com inserção.** `npm run sim:check` sai com 0, e a
>   linha do golden hash não muda. O `diff` da saída completa antes × depois é **só inserção**: as linhas
>   da seção nova, num ponto fixo depois das seções que já existem. Nenhuma linha existente muda ou troca de
>   lugar. O argumento de neutralidade é de construção: a guarda não chama nada de `sim/` nem de `match/`, e
>   os módulos novos no fecho não têm estado de topo que `sim/` leia. A prova continua sendo o `diff`.
> - **(R9) Sequência.** `determinism.ts` é disputado por `e4.3` (Draft), `e4.6` (Ready) e pela story do
>   codec que o @sm está escrevendo *(hoje `e4.8`, implementada em `910add8`; ordem registrada pelo @po:
>   `e4.8` → `debt.11` → `e4.3`)*. `debt.11` começa depois do commit de implementação da que estiver em
>   curso, e o escopo é conferido por `git show --stat <commit próprio>`, nunca pela árvore. As stories
>   seguintes que fazem "`sim:check` antes × depois" passam a ver a seção da telemetria na saída. Como é
>   inserção fixa, o `diff` delas continua vazio desde que o "antes" seja tirado depois de `debt.11`.
> - **(R10) Prazo.** É o do AC 11 de `debt.10`: antes da primeira coleta humana usada como evidência de
>   `debt.9` (pré-condição b) ou como baseline de P4.4 (`e4.7`, hoje Ready). Se `e4.7` deve listar
>   `debt.11` como pré-condição é roteamento do @po.
>
> **Segurança.** Nenhuma superfície nova no produto. A guarda roda só em Node e não entra no bundle, porque
> nenhum arquivo de `client/` a importa (regra 2). O `localStorage` falso vive só no processo do
> `sim:check`, e a restauração pelo descritor (R3) impede que a guarda escreva em armazenamento real numa
> versão futura do Node. Nenhum dado de jogador é lido: o fixture é sintético (R4).

> **Ratificação (2026-09-21, validação de `debt.11` v1.1, `3c6ab23`, AC 5) — a leitura de R3 pelo @po
> fica, com três precisões.** O @po apontou uma contradição real no texto de R3: "restaurar pelo descritor,
> nunca `delete`" e "voltar a ser o que eram" não cabem juntos para um global que a própria guarda cria.
> A regra dele segue o motivo que R3 declara, e fica: **se a propriedade tinha descritor próprio antes,
> restaura-se com `defineProperty` desse descritor, nunca `delete`; se não tinha, apaga-se a propriedade
> que a guarda criou. Critério: o descritor próprio depois é igual ao de antes, e "ausente" conta como
> estado.** O "não `delete`" de R3 vale para o primeiro caso, que é o que ela protege.
>
> **Medido nesta sessão (Node 24.13.1):** `localStorage` e `document` sem descritor próprio em `globalThis`
> (e fora de `in`); `URL.createObjectURL` e `URL.revokeObjectURL` com descritor **próprio do objeto `URL`**,
> `writable`/`configurable`/`enumerable`; `baixar()` (`client/telemetria.ts`) chama os dois;
> `JSON.stringify` de um descritor com `value` função **omite o `value`**; e uma propriedade criada por
> `defineProperty` sem `configurable: true` faz o `delete` lançar `TypeError` em módulo ES.
>
> - **(P1) O critério é por par (objeto, chave), não só por chave de `globalThis`.** O AC 5 já lista
>   `URL.createObjectURL` entre os globais trocados, mas o critério diz "descritor próprio de
>   `globalThis`", que não o alcança. Uma guarda que deixasse o `createObjectURL` falso no lugar passaria.
> - **(P2) O ramo "tinha descritor" precisa rodar no Node do projeto, senão é código morto.** No 24.13.1,
>   `localStorage` e `document` caem no ramo "ausente". Se a guarda não trocar nenhuma propriedade nativa,
>   uma restauração que sempre faz `delete` passa verde hoje e apaga o `localStorage` nativo de um Node
>   futuro, que é exatamente o caso de R3. Trocar `URL.createObjectURL` para capturar o `Blob` é o caminho
>   natural e já exercita o ramo. Se o @dev capturar o conteúdo de outro jeito, a guarda exercita a
>   restauração sobre um objeto de sonda com propriedade pré-existente. Duas mutações têm de reprovar o
>   `sim:check`: **MR1**, a restauração sempre com `delete`; **MR2**, o caso ausente restaurado por
>   atribuição (`= undefined` ou `defineProperty` com `value: undefined`) em vez de `delete`.
> - **(P3) Comparação campo a campo.** `value`, `get` e `set` por `Object.is`, e `writable`, `enumerable`
>   e `configurable` por igualdade, incluindo a presença de cada campo. Não por `JSON.stringify`, que omite
>   `value` função e faria um `createObjectURL` falso comparar igual ao nativo. Os descritores são todos
>   capturados **antes** da primeira instalação, e a propriedade criada no caso ausente é instalada com
>   `configurable: true`. Sem isso, o `delete` do `finally` lança (é barulhento, mas derruba o `sim:check`
>   pelo motivo errado).
>
> **Delta de AC para o @po (`debt.11`, AC 5)**. O @architect não edita story. Trocar o período
> "**Critério verificável:** para cada chave instalada, o descritor próprio de `globalThis` depois da
> guarda é igual ao de antes, inclusive quando ausente." por:
> *"**Critério verificável:** para cada par (objeto, chave) trocado pela guarda (`globalThis.localStorage`,
> `globalThis.document`, `URL.createObjectURL` e qualquer outro), o descritor próprio depois da guarda é
> igual ao de antes, inclusive quando ausente. A comparação é campo a campo (`value`/`get`/`set` por
> `Object.is`, os três atributos por igualdade), não por `JSON.stringify`. Todos os descritores são
> capturados antes da primeira instalação, e a propriedade criada no caso ausente leva `configurable:
> true`. A guarda confere o critério ela mesma, depois do `finally`, e a divergência vira problema. O ramo
> 'tinha descritor' roda pelo menos uma vez no Node do projeto: pela troca de `URL.createObjectURL` ou por
> um objeto de sonda com propriedade pré-existente."* E no AC 7 (bateria de mutações), acrescentar **MR1**
> e **MR2**, como descritas em (P2), às M1/M1b/M2/M3, com o mesmo registro no Dev Agent Record. Nenhum
> outro AC muda. Não bloqueia o início de `debt.11`, porque o texto atual já aponta a direção certa e o
> delta só fecha as brechas.

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

> **Atualização (2026-09-21, `e4.1`):** o trecho acima é o código de quando este documento foi
> escrito. O passo 1 da §10 foi executado: `INPUT_DELAY_TICKS` saiu de `src/client/main.ts`, e o
> ponto de uso (agora `main.ts:309`) soma `ATRASO_ALVO_TICKS`, importado de `net/protocolo.ts`, com
> valor 6. O argumento desta seção não muda. No modo local o cliente continua carimbando o próprio
> tick; é no modo conectado que o campo sai do fio. A previsão da §4.2 se confirmou: o `sim:check`
> rodado antes e depois da troca deu saída idêntica (Dev Agent Record de `e4.1`).

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

> **Emenda (2026-09-21, `e4.2`) — o parágrafo acima estava errado por dez linhas, e o erro é de tipo, não
> de comportamento.** `desenhar` e seus seis auxiliares anotavam `world: World`, e `World` completo inclui
> `rng`, `phase`, `nextId` e os campos da classe 3 de cada bola — exatamente o que a tabela acima proíbe de
> sair. Nenhuma projeção satisfaz esse tipo. O que entrou (`e4.2`/AC 6, `git diff --numstat` = `10 10`):
> o import (`Ball, World` de `sim/types.ts` → `BolaVisivel, VisaoDoMundo` de `net/projecao.ts`),
> `OpcoesRender.minhasBolas`, o `world` de `desenhar` e dos seis auxiliares, e o `b` de `desenharBola`.
> **Só anotações de tipo; nenhuma linha de corpo.** O que o renderizador faz não mudou; o que ele
> declara aceitar ficou mais estreito — o precedente é `WorldView = Omit<World,'rng'>` (`debt.7`), e o
> modo local continua passando `World` sem cast, por satisfação estrutural.
>
> A frase certa, portanto: **o comportamento do renderizador não muda nesta fase; a assinatura estreita.**
> E a prova do corte da §2.2 fica mais forte do que era, não mais fraca: com `VisaoDoMundo` no cabeçalho,
> o `tsc` confere em toda chamada que o render não lê nada que o fio não traga.

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

> **Atualização (2026-09-21, `e4.2`):** a linha "banda comprimida" da tabela acima herdou o erro da
> §1.2 (forma reduzida, compressibilidade de 60 Hz escalada) e fica substituída pela tabela da §5.5.
> Com a codificação decidida, a carga útil a 20 / 30 / 60 Hz é **53 / 78 / 153 kbit/s sem
> compressão** e **13 / 18 / 33 kbit/s com deflate de contexto**, mais ~11 / 17 / 34 kbit/s de
> transporte por mensagem (estimativa). A recomendação de 30 Hz **não muda**. O que muda é o eixo de
> 60 Hz: sem compressão ele custa ~187 kbit/s no fio, deixa de ser "irrelevante em banda" e passa dos
> ~125 kbit/s que a própria §1.2 tomou como teto de 3G; o deflate vira o lever que o torna barato. Por isso `e4.7` decide `SNAPSHOT_HZ` **e** o deflate juntos
> (§5.5).

### 5.3 Interpolação, e o que não se interpola

O cliente mantém um buffer dos últimos snapshots e desenha o instante `agora − ATRASO_DE_BUFFER`,
com `ATRASO_DE_BUFFER ≥ 1 intervalo de snapshot` + margem de jitter. Posição, velocidade e ângulo
interpolam.

**O que não interpola, e precisa estar escrito:**

- **`world.events`.** São de um tick só e o cliente os consome para os números flutuantes
  (`main.ts:405`). Com snapshot a 30 Hz, os eventos dos ticks intermediários **precisam ser
  acumulados no snapshot**, não descartados — senão metade dos acertos deixa de aparecer na tela.
  ~~A medição da §1.2 já os incluiu acumulados.~~ *(Correção de 2026-09-21, apontada pelo gate de
  `e4.2`, E42-ARC-001: **não incluiu**. O script da §1.2 serializa só os `hit` do tick corrente, sem
  acúmulo (`01-banda-cpu-duracao.mjs:97`). A primeira medição com eventos acumulados, de todos os tipos,
  é a de `e4.2`, e é a que está na §5.5. O acúmulo e o flush de fim de rodada estão na §5.6.)*
- **`alive` e `hp`.** Booleano não interpola; morte não é meio-caminho.
- **Início e fim de zona.** Uma Muralha existe ou não existe. Interpolar `expiresAt` produziria
  parede fantasma.

### 5.4 O cliente sem simulação ainda precisa de `sim/`?

Sim, mas só do **tipo** e do roster: `render.ts` lê `world.chars[b.charId]` para nome, ícone, cor e
alcance. `CHARS` continua no bundle do cliente porque é conteúdo, não autoridade. O que sai do
bundle conectado é a *chamada* a `step()`, não o módulo.

### 5.5 Codificação do fio *(decisão, 2026-09-21, `e4.2`)*

> **Decisão (2026-09-21, `e4.2`):** o `{t:'snap'}` atravessa o fio como **tupla posicional dentro de
> JSON**, com a quantização da tabela abaixo, que **preserva a prontidão por construção**. Todas as
> outras mensagens — `DoCliente` inteiro e as demais variantes de `DoServidor` — continuam **JSON com
> nomes de campo**. O `permessage-deflate` é **lever**, desligado por padrão e decidido em `e4.7`; o
> orçamento **não depende dele**. O tipo `Snapshot` de `net/protocolo.ts` **não muda**: a tupla é
> codificação de fio, e fora do fio — sala, guardas, buffer do cliente, `projetar()` — só existe o
> objeto com nomes.
>
> Das três saídas que `e4.2` devolveu: **(a) e (b) juntas, não (c).** O limiar de ~600 B do AC 9 de
> `e4.2` **se refere à codificação compacta** — é fato sobre como a §1.2 mediu, não afrouxamento — e
> `e4.8` adota essa codificação para o `snap` *(era `e4.3` até o corte do @po; ver a nota no início dos
> deltas abaixo)*. Esta é escolha técnica com argumento numérico, e por isso
> é minha, não item `R-NN`.

**O que foi medido** (`docs/evidence/e4-codificacao-fio/`, código em `b1c0668`, as 5 rodadas da §1,
11 585 quadros a 30 Hz com o flush do último tick, envelope `{t,s,seq}` incluído):

| codificação do `{t:'snap'}` | cru, média · pico | deflate isolado | deflate com contexto |
|---|---|---|---|
| A — JSON com nomes, como `e4.2` produz | **904,0** · 1 579 B | 406,3 B | 82,0 B |
| B — JSON com nomes, quantização segura | 849,0 · 1 438 B | 390,2 B | 82,0 B |
| C — tupla, valores crus | 408,4 · 785 B | 220,8 B | 85,3 B |
| **D — tupla, quantização segura, `events` literais (a decidida)** | **325,8** · 687 B | 198,3 B | **74,7 B** |
| E — como D, com `events` também em tupla | 316,0 · 600 B | 191,3 B | 71,5 B |

Parcela de `events` (JSON literal, em A, B e D): 17,1 B de média, 381 B de pico — o pico é morte
súbita, não vazamento. A 60 Hz a linha D dá 318,8 B e 69,2 B com contexto; a 20 Hz, 331,7 B e 79,3 B.

> **Errata de medição (2026-09-21, `e4.8`, `910add8`).** Com o `codificarDoServidor` real, a linha D dá
> **329,2 B de média e 700 B de pico** (conferido nesta sessão no `sim:check`), não 325,8 · 687. A diferença
> de 3,4 B vem de dois atalhos do meu script (`01-codificacoes.ts`) que a própria tabela de quantização
> abaixo não prevê: `seq: 0` fixo, quando o `seq` real cresce, e `effects[].kind` como índice numérico,
> quando a tabela manda `kind` literal. Com esses dois atalhos, o codec de `e4.8` reproduz 325,8 B exatos
> nos mesmos 11 585 quadros (Dev Agent Record de `e4.8`). **O número de referência passa a ser 329,2 B**,
> que é o da forma especificada. Nada muda: o limiar continua 450 B (folga de 121 B), a decisão D contra C
> e E não depende de 3 B, e a banda da linha D a 30 Hz vai de 78 para 79 kbit/s. As outras linhas e as
> colunas de deflate foram medidas com os mesmos atalhos e não foram refeitas, por isso valem como
> comparação entre si, não como valor absoluto. Os deltas já aplicados que citam 325,8 B ou 78 kbit/s
> (nota do @po no AC 5 de `e4.8`, AC 4 de `e4.7`) não precisam de reemissão.

Banda por cliente, **carga útil**, e custo de uma rodada de 77,2 s (§1.1) a 30 Hz:

| | 20 Hz | 30 Hz | 60 Hz | uma rodada a 30 Hz, com transporte |
|---|---|---|---|---|
| A — JSON com nomes, sem compressão | 145 kbit/s | **217 kbit/s** | 431 kbit/s | ~2,3 MB |
| **D — tupla, sem compressão** | 53 kbit/s | **78 kbit/s** | 153 kbit/s | **~0,9 MB** |
| A com deflate de contexto | 14 kbit/s | 20 kbit/s | 36 kbit/s | ~0,35 MB |
| D com deflate de contexto | 13 kbit/s | 18 kbit/s | 33 kbit/s | ~0,34 MB |
| transporte por mensagem (**estimado**, ~70 B: WS 2-4 + TLS ~22 + TCP/IPv4 40) | 11 kbit/s | 17 kbit/s | 34 kbit/s | — |

**Por que não (c) — JSON com nomes mais `permessage-deflate`.** A linha "A com deflate" é a melhor da
tabela em depuração e quase empata em bytes: o compressor apaga os nomes repetidos. O problema não é o
número; é **de quem o número depende**:

1. **Faz do orçamento uma propriedade da configuração de uma biblioteca que ainda não foi ratificada**
   (R-05). No `ws`, o `permessage-deflate` vem **desligado por padrão no servidor**; com outra biblioteca
   a pergunta recomeça. E a negociação é por conexão: se ela terminar sem a extensão — servidor com a
   opção desligada, biblioteca trocada, proxy corporativo que intercepta TLS —, o fio cai para **217
   kbit/s em silêncio**, sem erro e sem log, 2,8× o da tupla.
2. **Tira o orçamento do `sim:check`.** O tamanho da tupla é função pura de `net/`, e a guarda o mede
   deterministicamente a cada execução. O tamanho comprimido depende do zlib da plataforma e da
   negociação, e só aparece com socket de pé — a parte que esta fase não consegue testar headless.
3. **Custa memória por conexão, que é o limite real do servidor** (§1.4). Com *context takeover*, cada
   conexão retém o estado do deflate — pela fórmula documentada do zlib, ~256 KB com `windowBits 15`,
   `memLevel 8`, mais ~40 KB de inflate. Irrelevante para duas conexões por sala; não é de graça.

**Por que não só (a).** Ratificar que o limiar se refere à forma compacta sem adotar a forma compacta
deixaria o fio real em 904 B/quadro — ~11 MB por Bo5 de cinco rodadas em plano móvel — e a §1.2 com um
número que o código não entrega. (a) é a correção do instrumento; a decisão de fio é (b).

**O custo de (b), e como fica contido:**

- **Depuração.** Uma tupla é ilegível no devtools. Contenção: **só o `snap`** é posicional — `visao`,
  `prazo`, `rodadaInicio`, `rodadaFim`, `erro`, `sala`, `ping` e todo `DoCliente` seguem com nomes; o
  envelope do próprio `snap` continua `{"t":"snap","seq":n,"s":[…]}`, identificável por `t` e `seq`; os
  `events` dentro dele seguem literais; e o decodificador é função pura exportada de `net/`, chamável do
  console. O parser de entrada (`parseDoCliente`, `e4.8`/AC 4) **não muda** — `DoCliente` não é
  posicional, e o `parseDoCliente(JSON.parse(JSON.stringify(msg)))` do caminho feliz da Bo5 (`e4.3`/AC
  16) segue valendo.
- **Continua JSON.** Texto, `JSON.parse` dos dois lados, nenhuma dependência nova, nenhum formato
  binário. O ganho de E (eventos em tupla) sobre D é ~10 B/quadro e não paga a legibilidade perdida.
- **Um arquivo a mais de responsabilidade**: `net/codec.ts`, criado por `e4.8` (`910add8`) com o
  parser e o codec de saída. Serializador e parser do fio moram juntos, puros, sob `sim:check`.
- **Descompasso de versão** entre cliente e servidor — §11.6; mitigação decidida na §11.6.1 (versão no
  `{t:'sala'}` e fixture congelada).

**Tabela de quantização do fio.** É **precisão de exibição**, na mesma linha de `EPS_POSICAO_PX` de
`e4.2`, e não tem relação nenhuma com o `toFixed(4)` do `hash()` (§11.1). Passo `q = 0,01`:

| campo | regra no fio | por quê |
|---|---|---|
| `x`, `y` (bolas, projéteis, zonas), `facing`, `angle` | repassados — `net/snapshot.ts` já os quantiza (0,01 px / 0,001 rad) | quantizar de novo é idempotente, mas é trabalho à toa |
| `time`, `hp`, `arena.pad`, `vx`, `vy`, `radius`, `halfLen`, `pull` | arredondados a `q` | nenhum predicado de exibição depende deles no limiar; `hp` muda no máximo a cor do arco por um quadro em `frac = 0,5`/`0,25` exatos |
| **`ultCharge`** | **piso** a `q` | nunca arredonda para cima; com `ultThreshold` múltiplo de `q`, `u' ≥ thr ⇔ u ≥ thr` |
| **`abilityReadyAt`** | **não vai absoluto**: vai `max(0, teto_q(abilityReadyAt − time))`, e o decodificador devolve `time' + restante` | `time' ≥ time' + r' ⇔ r' ≤ 0 ⇔ time ≥ abilityReadyAt`, **para qualquer `time'`** — a prontidão não depende de `time` ser exato |
| `over`, `alive` | `0`/`1` | — |
| `id`, `winner`, `kind`, `color`, `ownerColor`, `effects[].kind` | literais | — |
| `events` | `SimEvent` literais, sem arredondar | é o que mais se depura, e `amount` vira número flutuante na tela |

**O que "não virar a prontidão" exige do teste — e por que a rodada real não basta.** Medido: em 46 340
amostras bola×quadro das 5 rodadas, **o arredondamento ingênuo também vira 0 vezes** — nenhuma amostra
caiu a menos de 0,005 do limiar. Um teste que só conferisse a rodada real passaria com a implementação
errada. Em 2 × 10⁶ casos sintéticos na fronteira, a regra da tabela vira 0 vezes; o arredondamento
ingênuo vira 654 971 vezes na habilidade e 2 171 710 na ult; e o piso vira em **100%** dos casos quando
o limiar não é múltiplo de `q` (`110.005`). Hoje os limiares são 110 e 130. Por isso a guarda do codec
(`e4.8`/AC 5, delta abaixo) tem três partes: a rodada real, os casos sintéticos com um codec ingênuo que **tem de
falhar**, e uma tripwire no roster.

**Orçamento, e o que ele passa a significar.** Na codificação posicional um campo da classe 3 **não tem
como vazar pelo codec**: ele copia por posição, de campos tipados. O detector de vazamento continua
sendo o de chaves, sobre o `Snapshot` com nomes (guarda de `e4.2`), e o limiar de bytes deixa de ser
detector de vazamento para virar **alarme de regressão do codec**: **média ≤ 450 B/quadro** do
`{t:'snap'}` codificado, na cadência de `SNAPSHOT_HZ` com o flush final. O número não é arbitrário: a
30 Hz, 450 B dão 108 kbit/s de carga útil, que com ~17 kbit/s de transporte ficam em ~125 kbit/s — os
126 kbit/s que a §1.2 declarou "cabe em qualquer 3G". Referência medida: 329,2 B de média, 700 B de
pico, com o codec de `e4.8` (errata acima; era 325,8 · 687). Pico não tem teto: ele é `events` na morte súbita, legítimo. O limite é **por quadro**, de
propósito: é o que o codec controla, e não muda quando `SNAPSHOT_HZ` muda. Banda por taxa é outra
pergunta — de `e4.7`, com a tabela acima.

**`permessage-deflate`: lever, desligado por padrão.** `e4.4` configura a opção **explicitamente** —
nunca pelo padrão da biblioteca, que pode mudar entre versões ou entre bibliotecas — com o valor
inicial desligado numa constante nomeada de `server/`, e registra por conexão a extensão negociada.
`e4.7` decide o valor junto com `SNAPSHOT_HZ`: a 30 Hz o deflate economiza ~60 kbit/s por cliente; a
60 Hz, ~120 kbit/s, e é ele que traz 60 Hz de ~187 para ~67 kbit/s no fio, abaixo dos ~125 da §1.2. Seja qual for a biblioteca de R-05, a
codificação desta seção não muda.

**Deltas de AC para o @po aplicar** (o @architect não edita story; `e4.2` está em gate e **não muda**):

> **Nota (2026-09-21) — o codec saiu de `e4.3`.** O @po cortou `e4.3` (v1.3.0, `1564ae4`), como a v1.2.0
> previa, e o parser e o codec de saída foram **juntos** para `e4.8`, implementada em `910add8`. Mapa dos
> deltas abaixo: o AC 16 antigo de `e4.3` (parser) é o **AC 4 de `e4.8`**; o AC 17 (codec de saída) é o
> **AC 5 de `e4.8`**, com o texto abaixo sem alteração; o alcance da guarda do fio é o **AC 6 de
> `e4.8`**. **`e4.3` continua dona da sala, do `snap` final (AC 10) e da guarda da Bo5 (AC 11)**, e o AC 16
> dela (v1.4.0) ficou com a checagem `assento → jogador` e o caminho feliz da Bo5 pelo parser. Os rótulos
> abaixo seguem esse mapa.

- **`e4.2` — nenhum delta.** Para o gate: o AC 9 foi cumprido como escrito — mediu, investigou, não
  ajustou, devolveu. O limiar se refere à codificação compacta (§1.2, atualização) e a decisão está
  aqui.
- **`e4.3`, AC 10 (acréscimo)** — *"A sala cria **um** `ProdutorDeSnapshot` por rodada, chama
  `observar(world)` depois de **cada** `step` (inclusive os de um `passo()` que avance vários ticks) e
  emite, além da cadência, **um `{t:'snap'}` no tick em que a rodada termina** (`world.over` ou o teto de
  ticks), mesmo fora da cadência. Na lista de `envios` desse passo, o `snap` final vem **antes** de
  `{t:'rodadaFim'}`. Ver `architecture-e4.md` §5.6."*
- **`e4.3`, AC 11 (acréscimo à guarda)** — *"Em toda rodada da Bo5: o último `{t:'snap'}` tem `over:
  true`, contém o evento `roundEnd` e precede `{t:'rodadaFim'}` nos envios; e a concatenação dos
  `events` de todos os `snap` da rodada é idêntica, em ordem, à sequência de `world.events` que a rodada
  produziu."* (Discrimina na rodada real: 4 das 5 rodadas da §1 terminam em tick ímpar — 4 773, 4 699,
  4 363 e 5 249 —, fora da cadência de 30 Hz. Sem o flush, o `roundEnd` some em 4 de 5.)
- **`e4.8`, AC 5 (era `e4.3`, AC 17) — o codec de saída.** *"`src/net/codec.ts` exporta também
  `codificarDoServidor(msg: DoServidor): string` e `decodificarDoServidor(texto: string): DoServidor`,
  puros e só com `import type`. Toda variante vai como JSON com nomes, **exceto** o `s` do `{t:'snap'}`,
  que vai como tupla posicional com a quantização da tabela de `architecture-e4.md` §5.5; o envelope
  `{t, seq}` continua com nomes e os `events` vão literais. O layout da tupla é declarado **num lugar
  só** do arquivo, comentado posição a posição. O decodificador reconstrói o `Snapshot` de
  `net/protocolo.ts` — nenhum tipo paralelo — e **lança** se a aridade de qualquer tupla divergir do
  layout. Guarda no `sim:check`: (a) as 5 rodadas da §1, a cada quadro na cadência com flush,
  `decodificar(codificar(m))` projetado bate o `World` com `x/y/facing/angle` idênticos ao snapshot,
  demais números a ±0,005, `ultCharge` em `[u − 0,01, u]`, `abilityReadyAt` a ±0,015 quando não pronto,
  e os dois predicados de prontidão (`time >= abilityReadyAt`, `ultCharge >= ultThreshold`)
  **idênticos** aos do `World`; (b) casos sintéticos na fronteira — restante de +0,004, 0 e −0,004 ms;
  `ultCharge` de `thr − 0,004` e `thr` — em que a regra da §5.5 preserva a prontidão e um **codec
  ingênuo** (arredondamento simples a 0,01), reimplementado na guarda como contrafactual, **tem de
  falhar**; (c) tripwire: todo `ult.threshold` do roster é múltiplo de 0,01; (d) toda variante que não é
  `snap` volta idêntica (`decodificar(codificar(m))` profundamente igual a `m`); (e) orçamento: média
  ≤ 450 B/quadro do `{t:'snap'}` codificado, com média, pico e parcela de `events` impressos."* —
  Aplicado em `e4.8` (AC 5, com a guarda em `quality_gate_tools`); o parser (`e4.8`/AC 4) não muda,
  porque `DoCliente` não é posicional. Parser e codec de saída foram **juntos** para `e4.8`: mesmo
  arquivo, nenhuma dependência da sala.
- **`e4.4`, AC 15 (acréscimo)** — *"...e, na saída, todo `envio` é escrito como
  `codificarDoServidor(envio.msg)`, na ordem em que `ResultadoDoPasso.envios` o devolveu. `server/` não
  chama `JSON.stringify` sobre `DoServidor`."*
- **`e4.4`, AC 16 (novo) — fim de rodada chega ao fio.** *"Os envios do `passo()` em que a rodada
  termina — o `snap` final e o `rodadaFim` (`e4.3`/AC 10) — são escritos antes de qualquer
  encerramento de sala, troca de fase ou parada do laço. Verificação no teste de duas abas: o número
  flutuante do golpe que mata aparece nas duas antes da tela de fim de rodada."*
- **`e4.4`, AC 17 (novo) — deflate como lever.** *"A opção de `permessage-deflate` da biblioteca é
  configurada **explicitamente**, com o valor inicial **desligado** numa constante nomeada de
  `server/main.ts`, com comentário apontando `architecture-e4.md` §5.5 e `e4.7`. A extensão negociada
  é registrada por conexão. Se R-05 vier com outra biblioteca, o lever é o equivalente dela; a
  codificação não muda."*
- **`e4.5`, AC 3 (acréscimo)** — *"Toda mensagem recebida passa por `decodificarDoServidor(texto)`
  (`net/codec.ts`); o cliente não faz `JSON.parse(...) as DoServidor`. O buffer guarda o `Snapshot`
  decodificado, e é dele que `projetar()` e o AC 10 leem."*
- **`e4.7`, AC 4 (acréscimo) e Dev Notes** — *"A varredura registra também, para cada taxa, o deflate
  ligado e desligado (a constante de `e4.4`/AC 17), com a banda observada; a decisão de deflate sai
  junto com a de `SNAPSHOT_HZ`."* No AC 4, "8,2 kbit/s comprimido a 30 Hz" passa a *"78 kbit/s sem
  compressão e ~18 kbit/s com deflate, a 30 Hz (§5.5)"*; na armadilha 2 do Dev Notes, "5,5 a 16,4
  kbit/s (§1.2)" passa a *"53 a 153 kbit/s sem compressão, 13 a 33 com deflate (§5.5)"* — e a frase
  "a banda é irrelevante nesta faixa" ganha a ressalva *"exceto 60 Hz sem deflate, ~187 kbit/s no fio,
  acima dos ~125 kbit/s de 3G da §1.2"*. AC 11 (escopo) ganha a constante de deflate em `src/server/main.ts`.
- **`e4.6` — nenhum delta.** O replay grava decisões e comandos, não snapshots.

### 5.6 O contrato do produtor: todo tick observado, e um snapshot no último *(2026-09-21, `e4.2`)*

> **Obrigação do lado servidor do fio, registrada a partir da implementação de `e4.2`.** O
> `ProdutorDeSnapshot` (`net/snapshot.ts`) acumula os `world.events` entre quadros e **lança exceção**
> se um tick for pulado, observado duas vezes, ou fotografado sem ter sido observado. Isso é
> deliberado — falha alto em vez de perder eventos em silêncio —, e tem uma consequência que o
> consumidor precisa cumprir: **no tick em que a rodada termina, sai um último snapshot, esteja ou não
> na cadência.** Sem ele, os eventos do tick final — o golpe que matou, o `death`, o `roundEnd` — ficam
> no acúmulo e nunca chegam ao fio. O jogador veria a tela de fim de rodada sem ver o golpe que a
> causou.

A obrigação é do **lado servidor**, e se divide pelo corte da §2.3:

| quem | o quê |
|---|---|
| `net/sala.ts` (`e4.3`) — dona da cadência (`e4.3`/AC 10) | um produtor por rodada; `observar` depois de **cada** `step`; o `snap` final no tick de término, **antes** do `rodadaFim` na lista de envios |
| `server/main.ts` (`e4.4`) — dono do socket | escreve os envios **na ordem devolvida** e **antes** de encerrar sala, trocar fase ou parar o laço; não descarta o último passo de uma rodada |
| `client/rede.ts` (`e4.5`) | aplica os `events` do `snap` final **na chegada** (§5.3), antes de trocar para a tela de fim de rodada |

A guarda de `e4.2` já emula o flush (`tools/determinism.ts`, laço da guarda `fio snapshot`), e é por
ela que o contrato está provado para o produtor. O que falta provar é que a **sala** o cumpre: é o
acréscimo ao AC 11 de `e4.3` na §5.5, que discrimina na rodada real porque 4 das 5 rodadas medidas
terminam fora da cadência.

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
  *(2026-09-21, §11.6.1: a reconexão é de graça para o ESTADO. A IDENTIDADE é o segredo de assento,
  que chega em `{t:'sala'}.assento`. Por isso o `{t:'sala'}` é mensagem por assento, nunca broadcast.)*
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
  *(Emenda de 2026-09-21: `render.ts` muda em `e4.2` **só em anotações de tipo**, 10 linhas, nenhuma de
  corpo — §5.1. Os outros três seguem intactos.)*
- *(2026-09-21)* `client/rede.ts` recebe texto e o entrega a `decodificarDoServidor` (`net/codec.ts`,
  §5.5); o resto do cliente só vê o `Snapshot` com nomes.

---

## 10. Plano de construção — passos verificáveis

| # | Passo | Verificação | Golden hash |
|---|---|---|---|
| 0 | `net/protocolo.ts`: tipos de mensagem, `ATRASO_ALVO_TICKS`, `SNAPSHOT_HZ`; `net/codec.ts` (`e4.8`); `VERSAO_DO_FIO` e `{t:'sala'}` com `versao`/`assento` (`e4.9`, §11.6.1) | `npm run check`; guarda de versão no `sim:check` | **idêntico** |
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

### 11.6 Formato posicional e descompasso de versão *(2026-09-21, `e4.2`)*

O preço estrutural da §5.5. JSON com nomes degrada com elegância quando cliente e servidor discordam:
um campo novo é ignorado, um campo ausente vira `undefined`. **Uma tupla não**: se a ordem das posições
mudar e a aridade continuar a mesma — trocar `hp` com `ultCharge`, por exemplo —, o cliente antigo
decodifica lixo com cara de dado, sem erro. O cenário concreto é uma aba aberta durante um deploy.

O que a §5.5 já cobre: o decodificador **lança** em aridade divergente, então acrescentar ou remover
campo falha alto; e o layout mora num lugar só, comentado posição a posição. O que **não** cobre:
reordenar campos de mesmo tipo. Hoje isso é teórico — não há deploy, e P4.4 é manual em duas abas ou
dois aparelhos do mesmo build. Mitigação quando houver deploy de verdade: número de versão do formato
no `{t:'sala'}` (é mudança de protocolo, portanto `net/protocolo.ts`, ato deliberado). **Não entra
agora**: seria abrir o vocabulário de `e4.0` por um risco que esta fase não tem como materializar.
Regra até lá: **mudar o layout da tupla é mudança de protocolo**, revisada como tal, nunca refatoração.

> **Superado em 2026-09-21 pela §11.6.1.** O "não entra agora" acima valia enquanto nenhum servidor
> saía do `localhost`. O gate de `e4.8` (E48-ARC-003) mostrou que o gatilho não tinha dono, e que a
> regra "mudança de protocolo" não tinha nada mecânico que a forçasse. O texto fica como registro.

#### 11.6.1 Versão do fio e fixture congelada — decididas *(2026-09-21, E48-ARC-003, gate de `e4.8`)*

Entrada: `docs/qa/gates/e4.8-codec-do-fio.yml` (E48-ARC-003, low), roteado pelo @po em `f8be842`
(`e4.8` v1.4.0; `e4.7` v1.4.0, AC 12). São duas decisões: a fixture dourada do fio em `debt.12`, e a
forma e a story da versão do formato no `{t:'sala'}`. Na mesma leitura apareceu um achado vizinho
(M-4), que abre a mesma variante e por isso entra junto.

**Medições desta sessão** (Node 24.13.1, `src/net/codec.ts` em `f8be842`, script descartável que importa
o codec real e não altera nada):

- **M-1. A amostra sugerida pelo gate não discrimina todas as trocas.** `codificarDoServidor` sobre
  `snapshotSintetico(1000, 1200, 50)` (`determinism.ts`) dá 231 B com **três colisões de valor** dentro
  da mesma tupla: `snap[1] = snap[5] = 0` (`over`, `arena.pad`), `bola[0] = bola[5] = 1` (`id`, `alive`) e
  `bola[2] = bola[7] = 200` (`y`, restante da habilidade). Trocar qualquer um desses pares nos dois lados
  deixa o texto **byte-idêntico**. Medido: as três trocas dão `texto === congelado`. Congelar essa amostra
  pega M9 (`hp` 500 ≠ `ultCharge` 50), mas deixa passar três outras mutações com a mesma forma de M9.
- **M-2. Uma amostra construída para isso tem zero colisões.** A amostra da decisão 1, abaixo, codifica
  em 287 B, sem nenhum valor repetido entre posições escalares da mesma tupla. Com ela M9 e `over ↔ pad`
  mudam os bytes. Ela também passa no **ponto fixo** `codificar(decodificar(t)) === t`. Isso foi medido
  nesta amostra e depende de ponto flutuante: o `abilityReadyAt` decodificado é
  `1417.9199999999998`, e o `tetoQ` o devolve a `183.35`. Não é propriedade geral do codec.
- **M-3. Hoje a versão não seria conferida por ninguém.** `decodificarDoServidor('{"t":"sala","versao":2,
  "jogador":0,"estado":"aguardando"}')` devolve a mensagem com o campo a mais, sem erro. Toda variante
  que não é `snap` sai por `m as DoServidor` (`codec.ts:426`). Um campo de versão só no tipo, sem
  checagem, seria decorativo.
- **M-4. Achado: o `{t:'sala'}` não tem onde levar o segredo de assento.** `e4.0`/AC 12 (e o comentário
  em `protocolo.ts:104`) e `e4.4`/AC 7 dizem que o segredo é "devolvido no primeiro `{t:'sala'}`". Mas
  `DoServidor['sala']` é `{ t; jogador; estado }` (`protocolo.ts:136`), sem campo para isso. Como está,
  `e4.4`/AC 7 não é implementável dentro do escopo de `e4.4`/AC 13, que proíbe `src/net/`. O `e4.0` passou
  pelo gate com essa contradição, e nenhum gate posterior a pegou porque nada ainda produz um
  `{t:'sala'}`.

**Decisão 1 — fixture congelada do fio: CONFIRMADA em `debt.12`, com a amostra corrigida.**

- **O que congela:** o texto de **um** `{t:'snap'}`, produzido por `codificarDoServidor({ t: 'snap', s:
  AMOSTRA_DO_FIO, seq: 4 })`. Só o `snap`, porque é a única variante posicional. As outras vão como JSON
  com nomes (§5.5), degradam com elegância, e a forma delas já é presa pelo `satisfies` das `amostras`
  da guarda `não-snap`. Congelar o texto delas congelaria só a ordem de chaves do `JSON.stringify`.
- **Qual snapshot:** **não** é o `snapshotSintetico`, pelo M-1. É uma função própria, com estes valores
  exatos, escolhidos por duas propriedades: (a) nenhuma posição escalar repete valor dentro da mesma
  tupla, então **qualquer** permutação muda os bytes; (b) todo campo quantizado está fora da grade de
  0,01, e onde a regra importa o valor separa uma regra da outra (`ultCharge` 55.559: piso 55.55 ≠
  arredondado 55.56; restante 183.341: teto 183.35 ≠ arredondado 183.34). Assim, trocar a regra de
  quantização também muda os bytes.
  ```ts
  { time: 1234.567, over: false, winner: 1, arena: { w: 960, h: 540, pad: 17.254 },
    balls: [{ id: 7, x: 100.25, y: 200.5, facing: 0.75, hp: 432.126, alive: true, ultCharge: 55.559,
              abilityReadyAt: 1234.567 + 183.341, effects: [{ kind: 'slow' }, { kind: 'shield' }] }],
    projectiles: [{ id: 8, x: 10.5, y: 20.75, vx: 300.123, vy: -40.456, radius: 5.555, color: '#b98cff' }],
    zones: [{ id: 9, kind: 'wall', x: 30.25, y: 40.5, angle: 1.234, halfLen: 60.126, radius: 9.994,
              pull: 2.345, ownerColor: '#8a8' }],
    events: [{ t: 'hit', x: 1.5, y: 2.5, amount: 3.14159, targetId: 7, crit: true }] }
  ```
  Texto que ela produz em `f8be842` (287 B):
  `{"t":"snap","seq":4,"s":[1234.57,0,1,960,540,17.25,[[7,100.25,200.5,0.75,432.13,1,55.55,183.35,["slow","shield"]]],[[8,10.5,20.75,300.12,-40.46,5.56,"#b98cff"]],[[9,"wall",30.25,40.5,1.234,60.13,9.99,2.35,"#8a8"]],[{"t":"hit","x":1.5,"y":2.5,"amount":3.14159,"targetId":7,"crit":true}]]}`.
  **Este texto é conferência, não fonte.** `debt.12` gera a fixture a partir do codec no commit em que
  começa. Se o resultado divergir desta linha, o codec mudou desde `f8be842` sem mudança de protocolo
  registrada, e isso é achado, não ajuste.
- **Onde mora:** inline em `src/tools/determinism.ts`, no bloco do codec, ao lado da guarda que já
  existe. É o mesmo padrão do `BASELINE` do golden hash, e é o único arquivo que `debt.12` pode tocar.
  Um JSON à parte acrescentaria arquivo ao escopo sem ganhar nada: a revisão continua sendo um diff.
- **Forma:** uma lista **só de acréscimo**, com uma entrada por versão:
  `FIO_CONGELADO: readonly { versao: number; snap: string }[]`, que nasce com
  `[{ versao: 1, snap: '<texto acima>' }]`.
- **O que a guarda confere** (linha própria no `sim:check`, junto das do codec):
  1. `codificarDoServidor({ t: 'snap', s: AMOSTRA_DO_FIO, seq: 4 }) === última.snap`. Se falhar, a
     mensagem aponta a **primeira posição divergente** da tupla, com o caminho (`s[6][0][4]`), o valor
     congelado e o atual, e diz o que fazer: "se foi de propósito, incremente `VERSAO_DO_FIO` em
     `net/protocolo.ts` e ACRESCENTE uma entrada; nunca edite uma existente (§11.6.1)".
  2. `última.versao === VERSAO_DO_FIO`, importado de `net/protocolo.ts` pela seta `tools/ → net/` que já
     existe. As versões são consecutivas a partir de 1, e `FIO_CONGELADO.length === VERSAO_DO_FIO`.
  3. Ponto fixo: `codificarDoServidor(decodificarDoServidor(última.snap)) === última.snap`. Isso prende o
     decodificador ao mesmo texto, independente das rodadas. Não é redundante: (1) sozinho prende só o
     codificador. (1) e (3) juntos prendem os dois lados, e (3) mais a fidelidade das rodadas pega uma
     mudança só no decodificador.
  4. Canário da propriedade discriminante: no texto congelado, nenhuma posição escalar de uma mesma
     tupla repete valor, e `AMOSTRA_DO_FIO` mantém `pisoQ(ultCharge) ≠ q(ultCharge)` e
     `tetoQ(restante) ≠ q(restante)`. Se alguém "simplificar" a amostra, a guarda perde o dente e avisa,
     na mesma lógica do contrafactual ingênuo de `e4.8`.
- **Contrafactual (item (d) de `debt.12`):** M9 (`hp ↔ ultCharge` nos dois lados), `over ↔ pad` nos dois
  lados (a troca que o M-1 mostra passar com a amostra antiga) e `pisoQ → q` no `ultCharge` fazem o
  `sim:check` sair com rc=1, numa cópia descartável.
- **Como uma mudança deliberada de formato atualiza a fixture, sem carimbo automático.** Tudo num
  **único commit**:
  1. muda o layout (ou a forma de qualquer variante, ou o significado de algum campo);
  2. incrementa `VERSAO_DO_FIO` em `net/protocolo.ts`;
  3. **acrescenta** `{ versao: N+1, snap: <texto novo> }` ao fim de `FIO_CONGELADO`. A entrada de uma
     versão publicada é fato histórico, igual a uma linha do golden hash, e **não se edita**;
  4. a mensagem de commit diz "mudança de protocolo" e cita as posições que mudaram.

  O que é mecânico e o que não é, sem enfeitar: a guarda **obriga** o passo 2 quando há o passo 3 (item
  2), e obriga os dois quando o texto muda (item 1). Ela **não consegue** impedir o carimbo automático
  clássico, que é editar a última entrada no lugar sem subir a versão. Nada dentro de um arquivo
  editável impede isso. O que a lista só de acréscimo compra é uma **forma de diff** que denuncia o
  carimbo: o caminho legítimo mostra só linhas acrescentadas em `FIO_CONGELADO` e uma linha trocada em
  `protocolo.ts`. Qualquer linha **removida ou alterada** dentro de `FIO_CONGELADO` é carimbo, e o @qa
  reprova olhando o `git show`. Com uma entrada só, os dois caminhos teriam a mesma forma de diff, e a
  revisão não teria como separá-los.
  Depois de `e4.7`, há um quinto passo, que é de operação e fica com o @devops: publicar o servidor na
  mesma janela do push. O Pages republica o cliente a cada push em `master`, e um cliente de versão nova
  contra um servidor antigo fecha a conexão (decisão 2). Esse é o comportamento certo, mas ninguém joga
  até o servidor subir.
- **Se `debt.12` for sequenciada antes da versão existir** (fora da ordem recomendada abaixo), a
  fixture nasce com `versao: 1` literal e só com os itens 1, 3 e 4. O item 2 entra na story da versão,
  que já precisa tocar `determinism.ts`.

**Decisão 2 — versão do formato no `{t:'sala'}`: forma e story.**

- **Constante:** `export const VERSAO_DO_FIO = 1` em `net/protocolo.ts`, comentada com a regra de
  quando sobe: muda o layout ou a quantização de `codec.ts`; muda a forma de qualquer variante de
  `DoCliente`/`DoServidor`; ou muda o significado ou a unidade de um campo. **Não** sobe com `SNAPSHOT_HZ`
  nem com o deflate: são levers de operação, sobrescritos na subida do servidor sem rebuild
  (`e4.7`/AC 4). Amarrá-los à versão faria o override derrubar os clientes. Começa em 1, não em 0: um
  servidor sem o campo manda `undefined`, e esse caso tem de falhar pelo mesmo caminho de um número
  errado.
- **Campo:** `{ t: 'sala'; versao: typeof VERSAO_DO_FIO; jogador; estado; assento }`. O tipo é o
  **literal** da constante, então quem produz a mensagem não consegue pôr outro número (o `tsc`
  recusa), e subir a constante muda o tipo junto. O tipo não protege quem **recebe**: o decodificador
  devolve `m as DoServidor`, e o `versao` sairia tipado `1` mesmo com `2` no fio (M-3). Por isso a
  checagem é em runtime.
- **Onde se confere: no decodificador, não no cliente.** Em `decodificarDoServidor`, quando
  `t === 'sala'` e `campo(m, 'versao') !== VERSAO_DO_FIO` (inclusive ausente, `"1"` e `2`), ele
  **lança** com as duas versões na mensagem: "versão do fio N no servidor, M neste cliente —
  descompasso (architecture-e4.md §11.6.1)". Motivos: (i) o codec é puro e está sob o `sim:check`,
  e o `client/` não está; (ii) o tratamento já está decidido. O `e4.5` v1.4.0 fecha a conexão em
  qualquer lançamento do decode, loga e não reconecta sozinho. Num descompasso de versão, isso é
  exatamente o certo, porque reconectar repetiria o erro em laço. O `e4.5` não ganha linha de código
  por isso, só um quarto caso no texto do AC 3.
- **Ordem no fio:** o `{t:'sala'}` é o **primeiro** envio a toda conexão assentada, nova ou reassentada.
  O `e4.4`/AC 8 já lista essa ordem para a reconexão. Com isso, a versão é conferida antes do primeiro
  `snap` ser decodificado. Sem essa ordem, um descompasso de mesma aridade desenharia um quadro de
  lixo antes de a conexão fechar.
- **O que o cliente faz no descompasso:** o que o `e4.5`/AC 3 já decide (loga, fecha, não reconecta
  sozinho). Recomendo, e o @po decide se vira obrigatório: uma mensagem na tela que separe os dois
  sentidos, porque o remédio é oposto. Servidor mais novo que o cliente é uma aba velha, e
  **recarregar** resolve. Cliente mais novo que o servidor é o Pages na frente do servidor, e recarregar
  **não** resolve: é esperar o servidor subir. As duas versões já vêm na mensagem do erro.
- **Extensão do vocabulário fechado, dita explicitamente:** acrescentar `versao` e `assento` ao
  `{t:'sala'}` **estende `DoServidor`**, que `e4.0`/AC 10 declarou fechado. É o "ato deliberado e
  revisado" que aquele AC exige, e a revisão é este bloco. A lista `T_DO_SERVIDOR` de `codec.ts` não
  muda, porque nenhum `t` novo entra. As `amostras` da guarda `não-snap` de `determinism.ts` deixam de
  compilar até ganharem os dois campos, e isso é o `satisfies` fazendo o trabalho dele. `DoCliente` e
  `parseDoCliente` **não mudam**: o fio de subida é JSON com nomes, parseado estrito, e um cliente que
  recebeu o `{t:'sala'}` com versão errada para de falar.
- **`assento: string`, o achado M-4:** é o segredo que o cliente reapresenta em
  `{t:'entrar', assento}`. Usa o mesmo nome nas duas direções de propósito: o que chega em
  `sala.assento` volta em `entrar.assento`. Entra na mesma story porque abre a mesma variante, e abrir
  `{t:'sala'}` duas vezes seria dois atos de protocolo em vez de um. **Segurança:** esse campo transforma
  `{t:'sala'}` em mensagem **por assento**, na mesma regra do `{t:'visao'}` (`e4.3`/AC 8). Um broadcast
  de `{t:'sala'}` entregaria o segredo de um jogador ao outro, e com ele o outro reassenta no lugar dele
  (`e4.4`/AC 7: segredo válido derruba a conexão antiga). A sala é quem produz o `{t:'sala'}`
  (`e4.3`/AC 4: envios são dado), então o segredo tem de estar na mão dela. O caminho de menor
  movimento é o `e4.4` usar o segredo do stream próprio como a chave de `EntradaDaSala.assento`. Assim
  a sala endereça e preenche com a mesma string, e o servidor não reescreve `DoServidor` depois que a
  sala o produz.
- **Story que implementa: nova, sugestão `e4.9` (o número é do @sm), entre `debt.11` e `e4.3`.**
  Escopo: `src/net/protocolo.ts` (constante, os dois campos, e o comentário de `DoCliente.entrar`
  passando a ser verdade); `src/net/codec.ts` (só a metade de SAÍDA: a checagem no decodificador e o
  comentário do LAYOUT, que deixa de dizer "risco aceito até haver deploy"; `parseDoCliente` não muda,
  e o diff prova); `src/tools/determinism.ts` (a amostra `sala` com os campos novos, e a guarda: a versão
  certa volta idêntica; ausente, `2` e `"1"` lançam; contrafactual: sem a checagem, a guarda falha). O
  `codec.ts` passa a importar **um valor** de `protocolo.ts`: a regra "só `import type`" de `e4.8`/AC 7
  vira "só tipos, mais `VERSAO_DO_FIO`". A seta não muda: é `net/ → net/`, e `protocolo.ts` não tem
  import de runtime.
  **Por que antes da `e4.3`:** a `e4.3` cria `sala.ts`, que produz o `{t:'sala'}`. Com os campos já no
  tipo, a `e4.3` os preenche ao nascer, sem tocar `protocolo.ts` (que o AC 15 dela proíbe). Depois da
  `e4.3`, a story nova teria de editar `sala.ts` também. E a `debt.12`, que vem depois da `e4.3`, já
  encontra `VERSAO_DO_FIO` e amarra a fixture desde a primeira linha. O custo no caminho crítico é nulo
  enquanto R-05 bloquear a `e4.4`.
  Ordem de `determinism.ts`: `e4.8` → `debt.11` → **`e4.9`** → `e4.3` → `debt.12` → `e4.6`, com a
  regra de `e4.3` v1.5.0 (só começa com `git status --short src/tools/determinism.ts` vazio).

**Alternativas rejeitadas, com o custo de cada uma:**

| opção | por que não |
|---|---|
| `e4.4` recebe a versão | Reabre o AC 13 para **quatro** arquivos (`protocolo.ts`, `codec.ts`, `sala.ts`, `determinism.ts`). Mistura mudança de protocolo com socket numa story em Draft por R-05, e a versão chegaria depois da `e4.3`. |
| `e4.5` recebe a versão | Mesma reabertura (AC 14), e chega **depois** do servidor da `e4.4` existir sem versão. |
| `e4.7` recebe a versão (onde está o gatilho hoje) | O momento serve, mas é story de medição (AC 11 limita `src/`), e todo cliente publicado entre a `e4.5` e ela sairia sem a checagem. Com a versão antes da `e4.5`, **todo cliente com código de rede que já existiu confere a versão**, e essa invariante só se compra agora. |
| `debt.12` recebe a versão | A `debt.12` é só `determinism.ts` por um motivo: um caso novo que falha contra o código de hoje é achado, e não correção no próprio commit. Abrir `codec.ts` nela desmonta essa disciplina. |
| `e4.3` recebe a versão | É a maior story da fase, cortada justamente para não juntar gates, e o AC 15 proíbe `protocolo.ts` e `codec.ts`. |
| Subprotocolo do WebSocket (`Sec-WebSocket-Protocol: bb-fio-1`) | Padrão e elegante, mas no navegador a recusa aparece como fechamento 1006, indistinguível de queda de rede. O `e4.5` reconectaria em laço, que é o oposto do que o AC 3 decidiu. |
| O cliente manda a versão em `{t:'entrar'}` | Abre `DoCliente` e o parser de entrada, que é a superfície de segurança da fase, para ganhar só um log no servidor. Pode vir depois, se a telemetria de operação pedir. |

**Deltas para o @po / @sm** (este documento não edita story):

- **`debt.12` (a criar):** o item (c) fica **confirmado**, com a amostra e os quatro itens da guarda
  descritos acima, no lugar de "string de `codificarDoServidor` sobre `snapshotSintetico`". No item (d),
  as mutações passam a incluir M9, `over ↔ pad` e `pisoQ → q`. Continua só `determinism.ts`.
- **`e4.9` (nova):** escopo, sequência e guarda como acima. Depende de `debt.11`. É pré-condição de
  `e4.3`.
- **`e4.3`:** o "Depende de" ganha `e4.9`, e a "Sequência" ganha `e4.9` antes dela. A sala preenche
  `versao: VERSAO_DO_FIO` e `assento` (a chave do assento de destino) em todo `{t:'sala'}`, e a guarda do
  AC 11 confere três coisas na Bo5: todo `{t:'sala'}` sai **por assento** e carrega o segredo do
  **próprio** destinatário, nunca o do outro; todo `{t:'sala'}` tem `versao === VERSAO_DO_FIO`; e o
  primeiro envio a um assento recém-assentado é o `{t:'sala'}`. Escopo de arquivos: nenhuma mudança.
- **`e4.4`:** o AC 7 ganha a frase "o segredo é a chave de assento passada à sala em
  `EntradaDaSala`; o servidor não reescreve `DoServidor`". O AC 8 já põe o `{t:'sala'}` primeiro na
  reconexão, e o texto passa a dizer que isso vale também na primeira entrada. **O AC 13 não muda**:
  com a `e4.9` antes, a `e4.4` não precisa de `src/net/`. A linha (2) da v1.5.0 ("se o @architect decidir
  que a versão entra nesta story") se resolve por "não entra".
- **`e4.5`:** o AC 3 ganha o caso (iv): `{t:'sala'}` com `versao` diferente de `VERSAO_DO_FIO` (ou
  ausente). O tratamento é o mesmo dos outros três. No Testing, uma verificação manual: um servidor
  local com `VERSAO_DO_FIO + 1` faz o cliente logar, fechar e **não** reconectar. A mensagem na tela
  que separa os dois sentidos é recomendação, e o @po decide se vira obrigatória. **O AC 14 não muda.**
- **`e4.7`:** com a `e4.9` antes da `e4.4`, a condição "enquanto `{t:'sala'}` não carregar número de
  versão" do AC 12 já estará falsa quando a `e4.7` rodar. O AC 12 passa a pedir: o README registra, por
  partida, o commit do servidor, o do cliente (ou "Pages @ sha") e o `VERSAO_DO_FIO`. O cliente do
  Pages fica permitido, porque um descompasso nem chega a jogar. Mas veja O-1 antes de soltar a regra
  do mesmo commit nas partidas da varredura.
- **`e4.8`, `e4.0`:** Done, nada muda. A extensão do vocabulário de `e4.0` está registrada aqui.

**O-1 (observação para o @po, não decidida aqui):** a varredura de `SNAPSHOT_HZ` do `e4.7`/AC 4
sobrescreve a taxa **só no servidor**. O `ATRASO_DE_BUFFER` do cliente (`e4.5`/AC 7, "≥ 1 intervalo de
snapshot") é dimensionado por um intervalo, e a única taxa que o cliente conhece é o `SNAPSHOT_HZ`
compilado no bundle. A 20 Hz com buffer dimensionado para 30, o cliente
esvazia o buffer e treme, e o tremor seria atribuído à taxa, não ao buffer. A varredura sairia enviesada
contra a taxa baixa, que é a que a bateria favorece. Há duas saídas baratas: a taxa efetiva vai no
`{t:'sala'}` e o cliente dimensiona o buffer por ela (seria um terceiro campo, e se entrar deve entrar
na `e4.9`, para não abrir a variante duas vezes); ou o `e4.7` fixa o buffer pela **menor** taxa da
varredura. Qual delas é decisão de escopo do @po. Registro porque, depois que a `e4.9` fechar, o custo
de um campo a mais é uma versão nova.

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

> **Nota (2026-09-21, `e4.2`):** a decisão de codificação da §5.5 tira do R-05 um peso que ele não
> precisava carregar. O orçamento de banda **não depende** da biblioteca escolhida nem da configuração
> de compressão dela: sem deflate, o fio já cabe (78 kbit/s a 30 Hz). Ratificar, vetar ou trocar de
> biblioteca muda o lever de deflate de `e4.4`/`e4.7`, não o formato.

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
| `src/net/protocolo.ts` | **novo** (`e4.0`); **muda** (`e4.9`) | Tipos de mensagem, `ATRASO_ALVO_TICKS = 6`, `SNAPSHOT_HZ`. Puro. *(O "codec" que esta linha citava foi para `codec.ts`.)* `e4.9`: `VERSAO_DO_FIO`, e `{t:'sala'}` ganha `versao` e `assento` (§11.6.1) |
| `src/net/codec.ts` | **novo** (`e4.8`, `910add8`); **muda** (`e4.9`, só a saída) | `parseDoCliente` (entrada, `e4.8`/AC 4) e `codificarDoServidor`/`decodificarDoServidor` (saída, com o `snap` em tupla, §5.5). Puro; só tipos, mais o valor `VERSAO_DO_FIO` de `protocolo.ts` desde `e4.9`, que faz o decodificador lançar em versão divergente (§11.6.1) |
| `src/net/snapshot.ts` | **novo** (`e4.2`) | `World → EstaticoDaRodada`, `ProdutorDeSnapshot` (acumula eventos; contrato da §5.6). Puro. Só campos da §5.1 |
| `src/net/projecao.ts` | **novo** (`e4.2`) | `Snapshot + estático + CHARS → VisaoDoMundo`, a forma que `render.ts` passou a declarar. Puro |
| `src/net/sala.ts` | **novo** (`e4.3`) | Máquina de estados da sala. Pura, relógio injetado (§3.2). Produz o `{t:'sala'}` por assento, com `versao` e o segredo do destinatário (§11.6.1) |
| `src/server/main.ts` | **novo** | Entrada Node: `ws`, assentos, laço de relógio, roteamento |
| `src/client/rede.ts` | **novo** | WebSocket do navegador, buffer de snapshots, interpolação |
| `src/client/main.ts` | **muda** | Ganha os modos `local` e `conectado` (§9) |
| `package.json` | **muda** | Dependência `ws`; script `server` |
| `src/sim/**` | **intacto** | Nem um campo, nem um import (§2.2) |
| `src/match/**` | **intacto** | Muda quem chama, não o que é (§3.3) |
| `src/shop/**`, `src/chars/**` | **intactos** | — |
| `src/client/render.ts` | **muda só em anotações de tipo** (`e4.2`) | 10 linhas, nenhuma de corpo: `World`/`Ball` → `VisaoDoMundo`/`BolaVisivel` (§5.1, emenda) |
| `src/client/telas.ts`, `input.ts`, `layout.ts` | **intactos** | §5.1 |
| `src/tools/determinism.ts` | **muda** | Ganha guardas no `sim:check`: ida-e-volta do fio (`e4.2`), codec (`e4.8`), versão do fio (`e4.9`), sala (`e4.3`), fio congelado e parser por tabela (`debt.12`, §11.6.1), e a chamada da guarda de telemetria (`debt.11`: import, chamada, linha de seção e `throw`). **Importa `net/`** — seta `tools/ → net/` declarada na §2.2 em 2026-09-21, sem ciclo. **Não importa `client/`** (§2.2, decisão `debt.10` → `debt.11`) |
| `src/tools/guarda-telemetria.ts` | **novo** (`debt.11`) | Guarda headless do carimbo e da partição de telemetria, chamada pelo `sim:check`. Um dos dois únicos arquivos de `tools/` que importam `client/` (§2.2, lista fechada) |
| `src/tools/telemetria.ts` | **muda só no ponto de entrada** (`debt.11`) | `main()` roda só como entrada do processo. Mantém a seta `tools/ → client/` de `e3.5`, agora declarada (§2.2) |
| `src/tools/**` (resto) | **intacto** | Não importa `client/` |

*Atualização (2026-09-21, `e4.2`): o Anexo acima foi escrito antes de haver código. As linhas de
`codec.ts`, `render.ts` e `tools/` foram corrigidas pelo que `e4.2` entregou e pelo que `e4.3` já tem no
escopo; a coluna "Estado" passou a citar a story dona. Atualização (2026-09-21, corte de `e4.3`): o
codec foi para `e4.8` (§5.5, nota no início dos deltas), e as linhas de `codec.ts` e `determinism.ts`
citam a story nova.*

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
| — | Codec do fio: prontidão preservada, contrafactual ingênuo reprovado, média ≤ 450 B/quadro *(2026-09-21)* | guarda do `sim:check` (`e4.8`/AC 5) | §5.5 |
| — | Versão do fio conferida e layout congelado: `{t:'sala'}` com `versao` divergente faz o decodificador lançar; o texto de `AMOSTRA_DO_FIO` bate com a última entrada de `FIO_CONGELADO`, cuja versão é `VERSAO_DO_FIO` *(2026-09-21)* | guardas do `sim:check` (`e4.9`, `debt.12`) + revisão: `FIO_CONGELADO` só cresce | §11.6.1 |
| — | O `snap` final de cada rodada chega ao fio antes do `rodadaFim` *(2026-09-21)* | guarda do `sim:check` (`e4.3`/AC 11) + duas abas (`e4.4`/AC 16) | §5.6 |
| — | Telemetria que vira baseline de P4.4 separa (atraso, `ESCALA_HP`) e não mistura populações *(2026-09-21)* | guarda do `sim:check` (`debt.11`), pronta antes da coleta de `e4.7` | §2.2 (decisão `debt.10` → `debt.11`) |
| — | Só `tools/telemetria.ts` e `tools/guarda-telemetria.ts` importam `client/`; nenhum arquivo de `client/` importa um dos dois *(2026-09-21)* | `grep -rn "from '\.\./client/" src/tools/` + revisão | §2.2 |

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
