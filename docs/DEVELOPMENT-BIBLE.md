# Battle Balls — Bíblia de Desenvolvimento

> **Síntese técnica de leitura única.** Se você é uma sessão nova de agente ou um desenvolvedor
> humano entrando no projeto, este é o documento que você lê antes de tocar em `src/`. Ele reúne
> o que hoje está espalhado por `docs/architecture.md`, `docs/architecture-e2.md`,
> `docs/architecture-e3.md` e ~25 stories: **convenções, invariantes, padrões e o processo de
> qualidade que emergiu.**
>
> **Documento irmão:** `docs/GDD.md` cobre o **jogo** (visão, mecânicas, personagens, economia
> como *design*). Este cobre a **engenharia** — como o código implementa essas coisas e que
> regras não podem ser quebradas. Onde há sobreposição, o GDD é a autoridade sobre *o que o jogo
> é* e esta Bíblia é a autoridade sobre *como o código se comporta*.
>
> **Este documento não decide nada.** Nenhuma decisão de produto é reaberta, nenhuma convenção é
> inventada. Onde algo é prática observada e nunca foi escrito, está marcado como
> **[convenção observada, não formalizada]**. Onde os documentos de arquitetura divergem do
> código, está **registrado na §13**, não corrigido.
>
> Data: 2026-07-29 · Autor: @architect (Aria) · Estado verificado nesta sessão: `npm run check`
> e `npm run sim:check` verdes, golden hash das 5 seeds idêntico ao baseline, Pilar 3 sem
> violação (saída reproduzida na §7.1).

---

## Índice

| § | Assunto |
|---|---|
| 1 | Mapa do repositório e regra de dependência entre camadas |
| 2 | Invariantes inegociáveis — a lista completa |
| 3 | A camada de stats |
| 4 | Pilar 3 e janelas de contato |
| 5 | O bot |
| 6 | O arnês de balanceamento |
| 7 | O golden hash como disciplina de engenharia |
| 8 | O processo de qualidade que emergiu |
| 9 | Convenções de nomenclatura e organização |
| 10 | Ciclo de vida de uma story neste projeto |
| 11 | Glossário técnico |
| 12 | Dívida técnica conhecida e rastreada |
| 13 | Inconsistências registradas entre documentos e código |

---

## 1. Mapa do repositório e regra de dependência entre camadas

### 1.1 O que mora em cada pasta

O projeto é **pacote único** — não é monorepo. `DESIGN.md` §5 descreve `balance/` como pacote
próprio, e o desvio para pacote único está registrado em `docs/prd.md` §7; o split real é Fase 5
(`architecture-e2.md` §6.1).

| Pasta | Papel | Estado |
|---|---|---|
| `src/sim/` | O motor. Tick, física, combate, stats, PRNG. **Puro** | 6 arquivos, ~1 500 linhas |
| `src/chars/` | Roster: `golem.ts`, `vex.ts`, e o registro `CHARS`/`ROSTER` (`chars/index.ts:6-7`) | 2 personagens |
| `src/bot/` | `dummy.ts` (fixture congelado) e `heuristic.ts` (o bot de RF-43/44/45/46) | — |
| `src/tools/` | `harness.ts` (o laço), `determinism.ts` (`sim:check`), `balance.ts` (CLI), `packages.ts`, `inspect.ts` | — |
| `src/client/` | `main.ts`, `render.ts`, `input.ts`, `layout.ts` — canvas + DOM overlay | — |
| `src/shop/` | Catálogo de itens e agregação. **Não existe ainda** — Fase 3, story `e3.1` | projetado |
| `src/match/` | Partida: draft, builds, Bo5, placar, economia. **Não existe ainda** — Fase 3, story `e3.2` | projetado |

### 1.2 A regra de dependência — RF-19 e as extensões da Fase 3

RF-19 (`docs/prd.md:283`, decisão #5) é a forma canônica: *simulação determinística; tick fixo
60Hz; PRNG com seed; sem `Math.random` em `sim/`; `sim/` não importa de `chars/`, `bot/` nem
`client/`* — o registro de personagens é **injetado** em `createWorld` (`sim/world.ts:62`).

O grafo completo, incluindo o que a Fase 3 acrescenta (`architecture-e3.md` §2.2):

```
sim/     tick, física, combate, stats            ← não importa NADA de ninguém
chars/   roster                                  → sim/
shop/    catálogo de itens, agregação            → sim/ (só o TIPO BonusBlock)
match/   draft, builds, Bo5, placar, economia    → sim/, shop/
bot/     comandos de combate + política de partida → sim/, shop/, match/ (só tipos)
tools/   arnês, CLI, sim:check                   → sim/, chars/, bot/, match/, shop/
client/  render, input, telas                    → todos
```

**Verificado nesta sessão.** Todos os imports de `src/sim/*.ts` são relativos ao próprio
diretório (`./types.ts`, `./effects.ts`, `./stats.ts`, `./physics.ts`, `./rng.ts`, `./world.ts`)
— nenhum aponta para fora. `src/bot/*.ts` importa apenas `../sim/rng.ts` e `../sim/types.ts`.
`src/chars/*.ts` importa apenas `../sim/effects.ts` e `../sim/types.ts`.

**A regra de pureza não é só sobre imports.** `match/` e `bot/` herdam a mesma disciplina de
`sim/`, por um motivo novo: **na Fase 4 esse código roda no servidor**, e o cliente já importa
`bot/` (`architecture-e2.md` §8.4; `architecture-e3.md` §2.2). Portanto:

| Camada | Sem DOM | Sem `Math.random` | Sem relógio de parede | Sem I/O |
|---|---|---|---|---|
| `sim/` | sim | sim | sim | sim |
| `chars/` | sim | sim | sim | sim |
| `shop/` | sim | sim | sim | sim |
| `match/` | sim | sim | **sim** — o cliente é dono do relógio (§2.6 de `architecture-e3.md`) | sim |
| `bot/` | sim | sim | sim (invariante N-1) | sim |
| `tools/` | sim | — | — | `node:fs` permitido (`determinism.ts:1`) |
| `client/` | é a camada de DOM | **permitido** — escolhe a seed da rodada (`client/main.ts:49`) | permitido | `localStorage` (Fase 3) |

A assimetria de `Math.random` é deliberada e não é frouxidão: escolher **qual** partida jogar é
entrada do sistema; resolver a partida é a simulação. O cliente sorteia a seed e a passa para
`createWorld`; dali em diante tudo é determinístico.

### 1.3 Uma anomalia a conhecer: `sim/index.ts` é barril morto e incompleto

`src/sim/index.ts` (4 linhas) re-exporta `types`, `effects`, `world` e apenas `mulberry32` de
`rng.ts` — **omite `stats.ts` inteiro** (onde vivem `StatBlock`, `BonusBlock`, `StatKey`,
`recomputeStats`, `SIGMA_*`), `physics.ts` e `deriveSeed`. Verificado nesta sessão: **nenhum
arquivo do projeto o importa**; todo consumidor importa o módulo direto
(`bot/heuristic.ts:1`, `tools/balance.ts:4-15`, `tools/determinism.ts:14`).

Consequência prática: **não use `sim/index.ts` como referência da superfície pública de `sim/`.**
Ele está desatualizado desde `debt.1`. Nenhum documento de arquitetura o menciona.

---

## 2. Invariantes inegociáveis — a lista completa

Cada linha tem a **consequência de quebrar**, porque é isso que faz a regra ser respeitada em vez
de decorada.

### I-1 · `sim/` é puro

Sem DOM, sem `Math.random`, sem I/O, sem importar de `chars/`, `bot/`, `client/`, `match/`,
`shop/`.

**Consequência de quebrar:** o servidor autoritativo da Fase 4 e o arnês de balanceamento param
de funcionar juntos. O arnês roda headless em Node; o cliente roda no Chrome; a Fase 4 roda os
dois **ao mesmo tempo** sobre o mesmo código. Uma dependência de DOM em `sim/` mata o arnês; um
`Math.random` mata o replay.

**Como se verifica:** `grep -rnE "Math\.random|document\.|window\.|localStorage|node:" src/sim/`
deve retornar apenas o comentário de `rng.ts:2` que diz que nunca é usado. É item A-4 do Anexo B
de `architecture.md` e critério de todo gate do épico.

### I-2 · Determinismo: tick fixo, PRNG com seed

`TICK_HZ = 60`, `TICK_MS = 1000/60` (`sim/world.ts:25-26`), `dt = 1/60` fixo em
`createWorld` (`world.ts:67`). Nunca `dt` variável de frame. O cliente acumula tempo real e roda
`step` em passos fixos, com teto de 5 passos por frame (`client/main.ts:111`).

`world.rng = mulberry32(setup.seed)` (`world.ts:73`). O único consumo hoje é o ruído de largada:
**exatamente 4 saques por bola**, em `createWorld` (`world.ts:93-96`).

**Consequência de quebrar:** "mesma seed + mesmos comandos = mesma partida" cai, e com ela caem
replay (RF-41/P4.3), servidor autoritativo e o arnês inteiro.

### I-3 · `world.balls` nunca é reordenado por valor

Registrada como comentário imediatamente acima da declaração (`sim/types.ts:141-148`). Nada de
`sort` por HP, distância ou dano. Se alguma lógica precisar de outra ordem, ela ordena uma
**cópia**, sempre com desempate por `id`.

**Por quê:** `Array.prototype.sort` só é estável dentro de um mesmo engine, e a Fase 4 roda Node
e Chrome simultaneamente. Hoje ninguém consome `ctx.rand`, então a ordem de `world.balls` não
alimenta o PRNG — **mas ela já decide o resultado do combate**: `autoAttack` percorre
`world.balls` na ordem (`world.ts:631`) e `dealDamage` mata na hora (`world.ts:379-388`), e é
exatamente essa ordem que produz o viés de lado de §6.5.

**Verificado nesta sessão:** `grep -rn "\.sort(" src/` retorna 7 ocorrências, **todas** em
`tools/` e todas sobre cópias de arrays de números ou de chaves (`balance.ts:1548-1549`, `:2001`,
`:2201`, `:2454`, `:2481`; `determinism.ts:476`). Zero em `sim/`, `bot/`, `chars/`.

### I-4 · `WorldView` oculta `rng` **por tipo**

`export type WorldView = Omit<World, 'rng'>` (`sim/types.ts:178`). O bot e todo `TickDriver`
recebem `WorldView`, nunca `World` (`bot/dummy.ts:13`, `bot/heuristic.ts:159`,
`tools/harness.ts:34`). `World` satisfaz `WorldView` estruturalmente, então nenhum ponto de
chamada precisa converter.

**Consequência de quebrar:** o bot passa a sacar do stream da simulação, e trocar a versão do bot
passa a mudar a sequência que a simulação consome — "replay = seed + linha do tempo de inputs"
deixa de valer entre versões de bot (Risco #7 → D-08).

Chamar `view.rng()` é **erro de compilação**, não uma violação descoberta em code review.
O gate de `debt.7` verificou as três formas de acesso: `view.rng()` e `view.rng` dão TS2339,
`view['rng']` dá TS7053. Só um `as any` explícito passa.

**Ressalva registrada, não corrigida:** `Omit` é raso — `view.balls[0].hp` continua mutável
(`sim/types.ts:172-176`). A decisão é começar com `Omit` + o teste de replay (que pega a violação
em runtime, por divergência de hash) e endurecer para `DeepReadonly` só sob caso real.

### I-5 · Streams de PRNG são reservados por tabela escrita

`deriveSeed(seed, streamId)` (`sim/rng.ts:46-49`) deriva seeds descorrelacionadas de uma
seed-mãe. A tabela vive como comentário colado na função (`sim/rng.ts:33-38`) e é estendida por
`architecture-e3.md` §2.5:

| id | Dono | Estado hoje |
|---|---|---|
| 0 | `world.rng` — a simulação (ruído de largada; `ctx.rand` dentro de personagens) | **ativo** (4 saques/bola) |
| 1 | Bot de combate do time 0 — jitter de mira, jitter de reação | **ativo** (`heuristic.ts:121`) |
| 2 | Bot de combate do time 1 | **ativo** |
| 3 | Cliente — efeitos visuais. **Nunca** pode afetar a simulação | reservado, sem consumidor |
| 4 | Arnês, telemetria, geração de cenário | reservado, sem consumidor |
| 5, 6 | Política de **partida** do bot (draft, build, compra) — jogador 0 / 1 | projetado (Fase 3) |
| 7 | livre | — |
| 8 + i | Seed da rodada `i` de uma partida: `deriveSeed(matchSeed, 8 + i)` | projetado (Fase 3) |

**Colisão entre streams é estruturalmente impossível, não apenas rara.**
`state = (seed + streamId × 0x9e3779b9) mod 2³²` é injetora em `streamId` porque `0x9e3779b9` é
ímpar, logo invertível mod 2³²; o finalizador `lowbias32` é composição de xorshift e
multiplicações por ímpar, todas bijeções. O gate de `debt.7` provou isso estruturalmente **e**
mediu 10,7 bilhões de pares sem colisão. Quem consumir `deriveSeed(seed, N)` não precisa
reverificar.

**Por que não `matchSeed + i`:** seeds consecutivas em `mulberry32` produzem sequências
correlacionadas nos primeiros saques, e os primeiros saques de `createWorld` são exatamente o
ruído de largada — as rodadas de uma partida nasceriam parecidas.

### I-6 · `stat` é derivado; só `recomputeStats` escreve nele

`Ball.stat: Readonly<StatBlock>` (`sim/types.ts:78`). O único ponto de escrita é o cast
deliberado em `stats.ts:186`. Ler sempre de `b.stat.*`, nunca de `b.base.*`.

**Consequência de quebrar:** quem escreve em `stat` direto tem a escrita apagada silenciosamente
no tick seguinte, porque `recomputeStats` roda uma vez por bola por tick (`world.ts:625`).

### I-7 · O motor nunca lê de `Ball.memory`

`memory: Record<string, number>` é rascunho livre do personagem (`sim/types.ts:64-65`).
**Qualquer estado que o motor precise interpretar tem que ser campo tipado.**

Esta regra nasceu de um caso concreto: `memory.dashAte` era o estado da janela de dano do dash do
Golem, e era por isso que o Pilar 3 não era auditável (`architecture.md` §4.1). `debt.6`
substituiu por `Ball.contact: ContactState | null` (`sim/types.ts:66-67`).

**Verificado nesta sessão:** `grep -rn "\.memory\b" src/` retorna **uma única ocorrência, e é um
comentário** (`chars/golem.ts:55`). Nenhum personagem usa `memory` hoje. O campo continua
existindo como espaço declarado para o roster de 8.

### I-8 · Zero alocação no caminho quente dos stats

`recomputeStats` muta `b.stat` no lugar; nunca devolve bloco novo (`stats.ts:171-182` registra a
decisão e o motivo). `zeroBonus` reusa o objeto (`stats.ts:159-161`); jamais `{...spread}`.
`makeStatBlock` cria as 14 chaves de uma vez, na mesma ordem, para uma única hidden class no V8
(`stats.ts:151-156`). Iterar `STAT_KEYS` (array const), nunca `Object.keys()`.

**Consequência de quebrar:** 4 objetos por tick × 40 M ticks no arnês da Fase 5 = **160 milhões de
objetos** para o GC, e o custo dominante passa a ser pausa de coleta (`architecture.md` §7.1).

A ordem das chaves em `makeBall` é conferida contra `STAT_KEYS` de propósito
(`world.ts:132-136`, QA-001 do gate de `debt.5`): os 6 campos do `CharDef` primeiro, spread de
`DEFAULT_STATS`, e só então os overrides de `restBall`/`restWall`, que atualizam chaves já
inseridas sem reordenar.

### I-9 · Nenhum caminho de código exclusivo de teste

Mutação do arnês entra por `PickSetup.itemBonus` (`world.ts:48-54`) — o **mesmo campo que a loja
da Fase 3 vai usar** — e não por um "modo mutante". Um caminho que a produção nunca exercita é um
caminho que testa código que o jogo não roda; e um mutante que escapasse de `SIGMA_MIN/MAX`
provaria a detecção de uma configuração inalcançável no jogo real (`world.ts:153-161`,
`balance.ts:30-33`).

Mesmo raciocínio na Camada 2 de auditoria do Pilar 3: a checagem de fase roda **sempre, inclusive
em produção** (`world.ts:340-347`). Modo de teste diferente do modo de produção é fonte de
divergência de determinismo.

### I-10 · Instrumentação é observação pura

Os contadores de clamp (`stats.ts:100-122`) e de margem de tunelamento (`physics.ts:33-49`)
nascem com `observing: false`. **Nenhum caminho de decisão de `sim/` lê esses números.** Em jogo,
nem o pré-passo dos raios de `integrate` roda (`physics.ts:59-78`). Só o arnês liga, por contexto
de medição, via `medir()` (`balance.ts:685-714`).

**Consequência de quebrar:** o arnês passa a medir um jogo diferente do que o jogo entrega — e o
golden hash **não pega**, porque ele roda com os contadores desligados. Esse é o achado
QA-E28-001 (§12.1).

### I-11 · Uma única definição do laço de partida

`runRound` (`tools/harness.ts:61-72`) é o único laço. `determinism.ts` e `balance.ts` são
consumidores; nenhum tem cópia própria.

**Consequência de quebrar:** o dia em que as duas cópias divergirem — teto de ticks diferente,
ordem de concatenação de comandos diferente — o golden hash estará protegendo um jogo e a matriz
de winrate medindo outro, **sem nenhum aviso** (`harness.ts:4-17`).

### I-12 · Agregação de bônus de item em ordem canônica

Soma em ponto flutuante **não é associativa**. `architecture-e3.md` §1.6 mediu, com magnitudes de
catálogo real:

```
0.07 + 0.11 + 0.13 + 0.17  (crescente)   = 0.47999999999999998224
0.17 + 0.13 + 0.11 + 0.07  (decrescente) = 0.48000000000000003775   → diferentes
```

A agregação percorre o **catálogo na ordem de `id`**, não a lista de compra
(`architecture-e3.md` §7.3). Item repetido soma (a lista é `string[]`, não `Set`), e a agregação
**não clampa** — quem clampa é `recomputeStats`.

**Consequência de quebrar:** hoje, hash divergente entre duas execuções do arnês. Na Fase 4,
cliente e servidor discordando de quem morreu.

O teste que fecha isso é **A-10** do Anexo B de `architecture.md` — escrito na dívida, ainda não
pago; entra na story `e3.1`: embaralhar a ordem de compra e exigir `bonusItem` byte-idêntico.

### I-13 · `bonusItem` é congelado durante a rodada

A loja é entre rodadas, e a bola é recriada a cada rodada. `step()` zera apenas `bonusPassive`
(`world.ts:619`); `bonusItem` é somado uma vez em `makeBall` (`world.ts:162`) e nunca mais
tocado.

É esse invariante que sustenta a classe **estrutural** de stat (§3.4) e que permite pré-somar
`bonusItem` fora do caminho quente.

### I-14 · Ordem de pares em `collideBalls`

`onCollide(a, b)` e depois `onCollide(b, a)` (`physics.ts:148-149`). Preservar essa ordem é o que
manteve o hash idêntico no passo 6 da migração — o único passo cuja paridade dependia de ordem de
execução, não só de aritmética (`architecture.md` §6.1).

### I-15 · `world.phase` é salva e restaurada por atribuição direta, nunca `try/finally`

Há reentrância real: dano da janela → morte → `on.kill` → mais dano. Cada ponto do pipeline
atribui a própria fase (`world.ts:605`, `:612`, `:622`, `:630`, `:633`, `:635`, `:645`, `:647`,
`:654`).

O `world.phase = 'tick'` de `world.ts:654`, depois de `collideBalls`, é correção do gate de
`debt.6` (QA-004): sem ele a fase ficava em `'collide'` até o `'cast'` do tick seguinte, e
qualquer dano causado depois dali seria recusado por falso positivo do Pilar 3.

---

## 3. A camada de stats

Resolve C2 e C3 (`docs/prd.md` §4) e executa D-04 (§5). Detalhe completo:
`architecture.md` §1. Aqui está o que você precisa saber para não quebrá-la.

### 3.1 As cinco camadas

```
1. base            valor do CharDef, congelado na criação da bola     → StatBlock (absoluto)
2. bonusPassive    aditivo, adimensional, ZERADO e reescrito por tick → BonusBlock (fração)
3. bonusItem       aditivo, adimensional, CONGELADO durante a rodada  → BonusBlock (fração)
   ── D-04 opera aqui: stat = clamp( base × (1 + clamp(Σ2 + Σ3)) ) ──
4. efeito temporário  multiplicativo, aplicado NO PONTO DE USO        → slow / amp / vuln
5. hook de evento     multiplicativo, só em dealDamage                → onDamageDealt/Taken
```

**As camadas 4 e 5 ficam FORA da soma de D-04, deliberadamente.** É a decisão não óbvia da seção,
e o motivo é de design, não de conveniência: se `slow` somasse no mesmo orçamento de `maxSpeed`,
uma Turbina comprada **cancelaria** parcialmente o Tremor do inimigo — item de mobilidade virando
item de resistência a controle, mudança de design que ninguém decidiu
(`architecture.md` §1.2). A alternativa fica registrada como mudança de duas linhas, se a medição
pedir.

Onde cada uma entra no código:

| Camada | Ponto de aplicação |
|---|---|
| 1-3 | `recomputeStats` (`stats.ts:183-216`), chamado em `world.ts:625` e `world.ts:164` |
| 4 — `slow` | `effectiveSpeed`: `stat.maxSpeed × (1 − min(MAX_SLOW, Σslow))` (`world.ts:172-179`) |
| 4 — `amp` | `dealDamage`, no atacante: `× (1 + Σamp)` (`world.ts:357`) |
| 4 — `vuln` | `dealDamage`, no alvo: `× (1 + Σvuln)` (`world.ts:363`) |
| 5 | `passives[i].onDamageDealt` / `onDamageTaken` (`world.ts:359`, `:364`) |

### 3.2 As 14 chaves e a fórmula

`STAT_KEYS` (`stats.ts:13-19`) tem **14** chaves, em duas classes:

```
estruturais: maxHp, radius
contínuos:   mass, maxSpeed, steer, drag, restBall, restWall,
             dmg, dmgTaken, atkSpeed, cdSpeed, range, knockbackTaken
```

> **Atenção documental:** `architecture.md` cita "15 campos" em quatro pontos de prosa. As duas
> listas enumeráveis do próprio documento (§1.3 e §1.4) têm 14, e o código tem 14. A discrepância
> está registrada em `stats.ts:8-11` como pendência de reconciliação do @architect. Ver §13.1.

`recomputeStats` implementa a fórmula literalmente (`stats.ts:192-214`):

```ts
raw   = b.bonusPassive[k] + b.bonusItem[k]
sigma = clamp(raw, SIGMA_MIN[k], SIGMA_MAX[k])     // teto de BALANCEAMENTO
v     = b.base[k] * (1 + sigma)
v     = clamp(v, ABS_MIN[k], ABS_MAX[k])           // clamp de MOTOR (se declarado)
stat[k] = v
```

### 3.3 Por que existem dois tipos de clamp

Confundi-los é o erro mais provável nesta camada.

| | Nome no código | Papel | Quem pode mexer |
|---|---|---|---|
| **ΣMIN / ΣMAX** | `SIGMA_MIN`/`SIGMA_MAX`, exportados (`stats.ts:45-54`) | Teto de **balanceamento**. Limita quanto a soma de bônus pode valer. É regra de jogo (D-04) | **Decisão de produto** |
| **ABS_MIN / ABS_MAX** | privados do módulo (`stats.ts:62-69`) | Clamp de **motor**. Rede de segurança contra valores que quebram a simulação: tunelamento, knockback que não decai, imunidade a empurrão | Decisão de arquitetura, **com argumento numérico** |

Os quatro mapas **não são simétricos**, e isso é deliberado: `SIGMA_MIN`/`SIGMA_MAX` cobrem as 14
chaves; `ABS_MIN` tem 10 entradas e `ABS_MAX` tem 8. `dmg` não tem clamp absoluto;
`atkSpeed`, `cdSpeed` e `range` têm teto expresso sobre o valor **derivado** (cd efetivo, alcance
efetivo), aplicado no ponto de consumo:

| Teto derivado | Valor | Onde é aplicado |
|---|---|---|
| cd efetivo de habilidade ≥ 500 ms | `MIN_ABILITY_CD_MS` (`world.ts:46`) | `castCommand` (`world.ts:436`) |
| Σ de lentidão ≤ 0.85 | `MAX_SLOW` (`world.ts:32`) | `effectiveSpeed` (`world.ts:173`) |
| alcance efetivo ≤ 324 px | — | **não implementado como constante**; hoje só o Σ o limita (`world.ts:465` é multiplicação pura) |
| cd de ataque básico ≥ 120 ms | — | **não implementado**; `world.ts:482` é divisão pura |

Os dois últimos são tetos que `architecture.md` §1.4 declara e que o código **não tem** como
constante nomeada. Não é buraco desguarnecido — o Σ cobre a faixa inteira hoje, e o gate de
`e2.8` (QA-E28-004) verificou isso — mas o item A-9 do Anexo B ("todos os tetos existem como
constante nomeada em `sim/stats.ts`") não é literalmente verdadeiro. Ver §13.

**Campo sem aquele teto declarado não ganha contador de clamp.** Um `0` ali leria como "nunca
mordeu" quando a verdade é "não existe teto para morder", e as duas coisas levam a decisões de
produto opostas (`stats.ts:90-94`).

### 3.4 Estrutural vs contínuo

| Classe | Recomputado | Campos | Regra especial |
|---|---|---|---|
| **contínuo** | todo tick, em `world.ts:625` | os 12 | nenhuma |
| **estrutural** | só em `makeBall` e em mudança explícita de `bonusItem` | `maxHp`, `radius` | ver abaixo |

**`maxHp` é estrutural porque contínuo daria cura grátis.** Se uma passiva oscilasse `maxHp` por
tick, a regra do delta produziria vida líquida cada vez que ela ligasse e desligasse (sobe +50, o
HP sobe 50; desce −50, o HP é clampado no topo). Congelando, essa passiva é **impossível por
construção** e não é preciso escrever regra defensiva. Custo aceito: uma passiva "+30% de HP
enquanto a ult estiver carregada" fica proibida; a alavanca alternativa é `dmgTaken`
(`architecture.md` §1.6).

**`radius` é estrutural porque crescer o raio dentro de um tick cria interpenetração
instantânea** — duas bolas sobrepostas, e o resolvedor de posição as separa com um impulso que
não veio de lugar nenhum. Congelar remove a classe inteira de bug.

A regra de delta para `maxHp` (cresce → `hp` ganha o delta absoluto; encolhe → `hp` é clampado)
está especificada em `architecture.md` §1.6 e **ainda não implementada** — é a story `e3.0`
(REL-001, §12.2).

### 3.5 As duas armadilhas de sinal

São a causa mais provável de um bug silencioso de catálogo, e estão escritas em três lugares
justamente por isso (`architecture.md` §1.7/R-01, `tools/packages.ts:3-31`,
`architecture-e3.md` §7.2):

| Item | O jogador lê | O motor executa | Por quê |
|---|---|---|---|
| **Lixa** (−atrito) | "menos atrito" | `drag: +0.20` — **positivo** | `drag` é a fração de velocidade **retida** por segundo: `k = pow(drag, dt)` (`physics.ts:89`). Mais `drag` = menos atrito |
| **Relicário** (−cooldown) | "−20% de recarga" | `cdSpeed: +0.25` — **positivo** | `cd_ef = cd / cdSpeed` (`world.ts:436`). Dois Relicários dão −33%, não −40% — retorno decrescente natural, que é o que D-04 quer |

O erro de sinal foi **medido**: o pacote físico com a intenção correta
(`{mass:+0.20, drag:+0.20}`) rende +4,32pp e a letra do PRD (`drag:−0.20`) rende −5,90pp. Dez
pontos percentuais com troca de sinal, e o gatilho do Risco #1b dispara na leitura errada
(`architecture-e2.md` §5.2). Foi por isso que `tools/packages.ts` existe: **o nome do item, o
campo e o sinal moram na mesma linha** (`packages.ts:40-44`), e o CLI nunca aceita campo cru para
pacotes de risco.

### 3.6 A reescrita dos campos de redução

D-04 é indefinido para campos com base neutra zero (`0 × (1 + Σ)` é sempre 0). Em vez de abrir
exceção na fórmula, os campos foram **remodelados** para base neutra 1.0, com conversão exata em
binário64:

| Antes | Depois | Identidade verificada |
|---|---|---|
| `mods.knockbackResist = 0.6` | `stat.knockbackTaken = 0.4` via `bonus: { knockbackTaken: -0.6 }` (`chars/golem.ts:105`) | `1 − 0.6 === 0.4` |
| `mods.speed = 1.25` | bônus `+0.25` em `maxSpeed` via `ctx.addBonus` (`chars/vex.ts:107-109`) | `250 × 1.25 === 250 × (1 + 0.25)` |
| (não existia) "−cooldown" | `stat.cdSpeed`, `cd_ef = cd / cdSpeed` | `7000 / 1.0 === 7000` |

**Exceção em fórmula de balanceamento é onde bug de balanceamento se esconde.** Foram só dois
campos, e a fórmula de D-04 vale literalmente para todos.

### 3.7 O ponto de recálculo e a defasagem de um tick

Um único ponto por bola por tick, **depois das passivas e antes do movimento**
(`world.ts:610-628`):

```
phase='cast'    → castCommand   ← lê o stat do tick ANTERIOR (defasagem declarada)
para cada bola viva:
  phase='effect' → tickEffects
  zeroBonus(bonusPassive)
  soma passives[i].bonus (declarativo)
  phase='tick'  → passives[i].onTick (ctx.addBonus) · char.on.tick
  recomputeStats(b)              ◄── ÚNICO PONTO DE RECÁLCULO
  char.move(ctx, b)              ← já lê o stat novo
  carga de ult por tempo
phase='attack'  → autoAttack
phase='zone' · phase='projectile'
integrate · collideZoneWalls
collideBalls( phase='contact' → resolveContactWindow ; phase='collide' → on.collide )
phase='tick' · collideWalls
morte súbita · checkEnd · tick++ · time
```

**`castCommand` lê o `stat` do tick anterior — 16,7 ms de atraso, e é intencional.** A alternativa
(recomputar duas vezes por tick, ou mover o processamento de comandos para depois do laço) custa
o dobro de CPU ou reordena o `step`, mudando o comportamento medido sem ganho. Está escrito aqui
e em `architecture.md` §1.5 para ninguém "consertar" isso depois sem saber que era deliberado.

`makeBall` chama `recomputeStats` uma vez antes de devolver a bola (`world.ts:164`) — `stat`
nunca é lido não inicializado, nem no tick 0.

### 3.8 A restituição é propriedade de corpo, e a regra de combinação é MÁXIMO

`restBall`/`restWall` são stats por bola, com base opcional no `CharDef`
(`sim/types.ts:302-304`) e default em `DEFAULT_STATS` (0.65 / 0.72, `stats.ts:30-31`).
Nenhum personagem do roster declara os próprios hoje.

Colisão bola-bola usa `Math.max(a.stat.restBall, b.stat.restBall)` (`physics.ts:141`).
**Máximo, não média nem produto**, por três razões em ordem de peso (`architecture.md` §2.2):

1. É a única regra em que **o item não depende da build do inimigo**. Com média ou produto, o
   valor entregue pela Borracha é função do que o oponente comprou — o que impede o arnês de
   **atribuir causa**, que é a justificativa declarada de D-04 para preferir aditivo.
2. É o único caminho que preserva o baseline bit a bit: `Math.max(0.65, 0.65) === 0.65`.
3. Elasticidade é a única propriedade puramente física da loja, e diluir o item mais distintivo
   da trilha física pela metade empurra o Risco #1 na direção errada.

Parede da arena e zone-wall (Muralha) **não têm mixing**: sempre `b.stat.restWall`
(`physics.ts:158-172`, `:204-207`). Parede não é corpo, não tem stat.

Trocar `max` por `√(ea·eb)` é **uma linha** em `physics.ts`, registrada como parâmetro
reversível se a medição mostrar a trilha física forte demais.

---

## 4. Pilar 3 / janelas de contato

**O Pilar 3, na formulação de D-07:** colisão passiva causa **0 dano**; dano por contato só dentro
de **janela explícita de habilidade, declarada no personagem**. O detalhe de design está no
GDD §2; aqui está como o código o torna auditável.

### 4.1 O campo que substituiu o estado solto

```ts
// sim/types.ts:24-33
interface ContactWindowDef {
  source: string    // id da ability/ult que abre esta janela — auditado contra CharDef (A1)
  ms: number        // invariante: ≤ cd_efetivo_mínimo da fonte
  dmg: number
  knockback: number
  reHitMs: number   // trava GLOBAL por atacante, não por par atacante-alvo
  onHit?: (ctx, self, other) => void
}

// sim/types.ts:36-40 — estado runtime em Ball.contact
interface ContactState { source: string; endsAt: number; lastHitAt: number }
```

O Golem declara (`chars/golem.ts:118`):

```ts
contactWindows: [{ source: 'sismico', ms: 450, dmg: 14, knockback: 520, reHitMs: 250 }]
```

e o `cast` do Sísmico chama `ctx.openContactWindow(self, 'sismico')` (`golem.ts:58`). O bloco
`on.collide` do Golem **foi deletado inteiro** — o motor faz o trabalho, uma vez, para todo o
roster, em `resolveContactWindow` (`world.ts:398-413`).

**`lastHitAt` é um número único, não um mapa por alvo, e isso é fidelidade deliberada.** A trava
de re-hit original era global por atacante: numa janela de 450 ms com `reHitMs` 250, o dash
acerta no máximo 2 vezes **no total**, não 2 por inimigo. A semântica ficou escrita no campo em
vez de implícita numa variável (`architecture.md` §4.1).

### 4.2 As três camadas de auditoria

Nenhuma sozinha é suficiente, e vale saber por quê.

**Camada 1 — estática (barata, incompleta de propósito).** `auditarCamada1`
(`determinism.ts:373-402`) varre `src/chars/*.ts` e confirma que nenhum bloco `on.collide` contém
a substring `damage(`. Remove comentários antes de varrer (`semComentarios`,
`determinism.ts:361-363`) — sem isso, um comentário em prosa que mencione `collide:` desvia a
busca, achado real durante `debt.6`. Não pega chamada indireta, helper compartilhado, nem dano via
efeito. **`ctx.apply(fx.slow(...))` em `on.collide` continua permitido** — o pilar fala de *dano*.

**Camada 2 — dinâmica por fase (é a que vale).** `World.phase`
(`sim/types.ts:158-165`) marca cada bloco do pipeline, e `dealDamage` verifica na primeira linha
(`world.ts:348-351`):

```ts
if (world.phase === 'collide') {
  const charId = source ? charOf(world, source).id : '(sem source)'
  throw new Error(`Pilar 3: dano por contato fora de janela declarada · ${charId}`)
}
```

`charId` identifica o **infrator** (quem chamou de dentro de `on.collide`), não a vítima. Roda
sempre, inclusive em produção (I-9). Custo: uma comparação de string por chamada de `dealDamage`
— que roda dezenas de vezes por rodada, não por tick.

Isso é exato para chamada **síncrona** a `dealDamage` durante `phase === 'collide'`, direta ou
indireta, porque verifica o **fato** e não a sintaxe.

**Camada 3 — auditoria de roster (o artefato que D-07 pede).** `auditarCamada3`
(`determinism.ts:417-470`) roda três verificações e imprime a tabela:

| # | Verificação | Onde |
|---|---|---|
| A1 | Todo `contactWindows[i].source` corresponde a um `abilities[].id` ou a `ult.id` | `determinism.ts:429-435` |
| A2 | `contactWindows[i].ms ≤ cd_efetivo_mínimo(source)`, com `cdSpeedMax = 1 + SIGMA_MAX.cdSpeed` | `determinism.ts:420`, `:441-448` |
| A4 | Nenhum personagem sem `contactWindows` chama `openContactWindow` (estático) | `determinism.ts:456-467` |
| A5 | Rodar as 40 seeds + baseline + cobertura de build com a Camada 2 ligada → zero violações | implícito: se violasse, o script já teria lançado |

Saída de hoje, reproduzida nesta sessão:

```
janelas de dano por contato (Pilar 3)
  golem  sismico    450ms  dmg 14  kb 520  re-hit 250ms   cd_min 3500ms  ✓
  vex    —         (nenhuma)                                            ✓
```

Com 8 personagens isso será uma tabela de 8 linhas que cabe na tela e que ninguém consegue burlar
sem aparecer ali. **É o artefato de auditoria humana**, e é a diferença entre um pilar declarado e
um pilar verificável.

### 4.3 A invariante que liga o piso de cooldown à janela

```
para todo personagem C, para toda janela W em C.contactWindows:
    max(MIN_ABILITY_CD_MS, cd(fonte de W) / cdSpeedMax)  ≥  W.ms
```

**Por que o piso de motor existe além do teto de balanceamento.** Se o cooldown efetivo de uma
habilidade descesse abaixo da janela que ela abre, o jogador recastaria antes de a janela fechar,
ela seria reaberta indefinidamente, e **o dano por contato viraria permanente** — quebrando D-07
por dentro sem que nenhum personagem tivesse feito nada de errado (`world.ts:33-45`).

`MIN_ABILITY_CD_MS = 500`. **O valor original era 400, e 400 < 450 não entregava a garantia que o
próprio texto alegava** — quem protegia era o teto de `cdSpeed`, não o piso. O gate de `debt.4`
(QA-001) achou a inconsistência **antes** de ela virar teste automatizado em `debt.6`, o que a
teria validado pelo motivo errado. Corrigido no commit `4c2e458`.

Estado atual: Golem `sismico` → `max(500, 7000/2) = 3500 ms ≥ 450 ms`, fator 7,8 de folga. O teste
falha alto no dia em que alguém desenhar uma habilidade de cd 800 ms com janela de 500 ms.

### 4.4 As duas lacunas conhecidas, e por que elas não são regressão

Ambas registradas nos gates, ambas ainda abertas:

**Dano por `Effect` de 1 tick atravessa a Camada 2.** Um `on.collide` que aplique
`ctx.apply(fx.dot(...))` em vez de chamar `ctx.damage` direto **passa**: o dano só materializa no
tick seguinte, sob `phase === 'effect'`, não `'collide'`. Provado com teste dirigido no gate de
`debt.6` (QA-001) e registrado em `world.ts:342-345`. Não é regressão — nenhum personagem do
roster faz isso hoje — mas é lacuna real de cobertura, não coberta por nenhuma das 3 camadas.

**`openContactWindow` com `source` inválido falha em silêncio.** A auditoria A1 confere só o
sentido inverso — que todo `contactWindows[i].source` bate com uma ability/ult — não que todo
**call site** de `openContactWindow(self, source)` tenha um `contactWindows` correspondente. Um
personagem que digitasse o source errado não seria pego por nenhuma camada
(`world.ts:309-313`, QA-002 do gate de `debt.6`).

Fechar as duas é auditoria de roster em escala — trabalho de Fase 2/5/6, e a decisão de quando
pagá-las não é minha.

---

## 5. O bot

### 5.1 `AimSpec` — por que existe e qual é o vocabulário

RF-44 pede que o bot mire "onde a chance de acerto é maior". Para calcular chance de acerto, o bot
precisa saber **que forma a habilidade entrega**. Essa informação vivia **dentro do closure
`cast`**, que é código, não dado.

Três saídas eram possíveis, e a escolha importa mais do que parece
(`architecture-e2.md` §2.2):

| | Opção | Consequência |
|---|---|---|
| **A** | **Declarar a geometria como campo do personagem** | **Escolhida.** Um estimador só, igual para todos. Personagem novo declara ou não compila |
| B | Bot ignora a geometria (é o `dummy`) | **Não é neutro.** Um estimador genérico trata o Deslize do Vex (reposicionamento sem dano) como habilidade de dano mirável e mergulha o Vex no inimigo — o oposto do uso correto. A mesma linha de código prejudica o Vex e não prejudica o Golem |
| C | Um ramo por personagem (`if charId === 'vex'`) | **Confundidor puro.** O bot joga melhor de A que de B, A ganha, e o arnês reporta como desequilíbrio de personagem o que é desequilíbrio de bot |

O precedente direto é `contactWindows` (`debt.6`): tirar de dentro do closure um fato que outra
camada precisava ler. Aqui a "outra camada" é o bot em vez do motor.

```ts
// sim/types.ts:229-239 — vocabulário FECHADO. Estender é ato deliberado, revisado.
type AimSpec =
  | { kind: 'burst';     radius: number; delayMs: number }  // área no ponto mirado
  | { kind: 'raio';      radius: number; speed: number; ms: number }  // projétil
  | { kind: 'dash';      speed: number; ms: number }        // investida do PRÓPRIO corpo
  | { kind: 'reposicao'; speed: number }                    // sem dano
  | { kind: 'utilidade' }                                   // o bot não sabe avaliar isto
```

Três decisões dentro desta:

1. **O campo é obrigatório**, não opcional (`sim/types.ts:254`, `:272`). Com 6 personagens novos
   na Fase 5, esquecer é provável e o modo de falha é silencioso: a habilidade nunca é castada, o
   personagem perde parte do kit, e a matriz reporta isso como fraqueza dele.
   `{ kind: 'utilidade' }` é o escape hatch — mas **tem que ser digitado**.
2. **O campo mora em `sim/types.ts` e `sim/` nunca o lê.** Não é anomalia: `desc`, `name` e
   `color` já são exatamente isso — dado no tipo do personagem, consumido por outra camada.
3. **`AimSpec` descreve a habilidade; a política mora em `bot/`.** Geometria é fato do personagem;
   limiar, jitter e pesos são política. Essa linha é o que permite trocar a política sem tocar no
   roster, e vice-versa.

**Risco assumido e registrado:** `AimSpec` é uma **segunda declaração** do que o `cast` faz, e
pode divergir dele — foi exatamente o pecado de C3. A mitigação é declarar apenas *forma grosseira*
(raio, velocidade, duração) e **nunca dano**, que é o número volátil. `balance.ts` imprime a
tabela de `aim` do roster na auditoria (`auditarRoster`, `balance.ts:2137`).

### 5.2 `dummy.ts` vs `heuristic.ts`

| | `bot/dummy.ts` | `bot/heuristic.ts` |
|---|---|---|
| Papel | **Fixture de teste congelado** | O bot de RF-43/44/45/46 |
| Consumidores | `determinism.ts` (golden hash), `inspect.ts`, `client/main.ts:116` | `determinism.ts` (bloco P2.5), `balance.ts` |
| Consome PRNG? | **não** — depende só do estado do mundo | streams 1 e 2 |
| Política | se o alvo está no alcance, solta | valor esperado, jitter, limiar com decaimento |
| Pode ser modificado? | **NÃO.** Ver abaixo | sim, com `BOT_VERSION` novo |

**`dummy.ts` não foi substituído por `heuristic.ts`, e trocá-lo destruiria a rede de regressão.**
Ele é o driver de `determinism.ts` e, portanto, o que sustenta os **10 hashes de referência**
(5 do `BASELINE` + 5 do `BUILD_BASELINE`). Substituí-lo invalidaria todos eles no momento em que
são mais necessários (`architecture-e2.md` §2.7, `heuristic.ts:14-16`).

Na Fase 3 o **cliente** troca `dummy` por `heuristic` (`architecture-e3.md` §8.1) — `dummy.ts`
continua intocado, servindo o `sim:check`.

### 5.3 O espaço de ação do bot é idêntico ao do jogador

> O bot emite **`Command[]` e nada mais** — `{tick, ballId, slot, dx, dy, mag}`.
> Não move a bola (RF-12: a IA de movimento é autoral, do personagem), não dispara o ataque
> básico (RF-13: automático), não escolhe build, não compra item, não drafta, não coordena as duas
> bolas por canal explícito, não lê `world.rng`, não conhece `chars/` (recebe `view.chars`, que é
> dado injetado), não conhece item, preço nem loja.

É isso que faz do bot um **proxy válido de jogador**: ele exerce exatamente as alavancas que os
dois polegares exercem. **Se algum dia o bot precisar de uma alavanca que o jogador não tem, a
matriz de winrate deixa de medir o jogo e passa a medir o bot** (`heuristic.ts:6-12`).

Nenhuma dessas fronteiras é gratuita: cada uma é uma via pela qual o bot poderia virar o sujeito
da medição em vez do instrumento dela.

`team` entra no algoritmo em **exatamente dois pontos** (RF-45): quais bolas são minhas
(`heuristic.ts:165`) e qual stream de PRNG é meu (`heuristic.ts:121`). Não existe ramo por `team`
em lugar nenhum, o que é verificável por leitura.

### 5.4 A ordem de saque é contrato de versão

```
para cada bola viva minha, NA ORDEM DE view.balls:
    se view.tick < st.proximaDecisaoTick: continua
    (1) r() → agenda a próxima decisão            ← SEMPRE, mesmo sem castar
    avalia ult;   se casta: (2) r() ângulo  (3) r() mag
    avalia ativa; se casta: (4) r() ângulo  (5) r() mag
```

`heuristic.ts:147-158`, implementado em `botCommands` (`:159-199`) e `emitir` (`:528-546`).

**O saque (1) acontece sempre, castando ou não** — isso torna o consumo do stream função apenas
do estado do mundo, e não da decisão, o que é muito mais fácil de auditar quando um hash divergir.

**Mudar essa ordem muda a matriz de winrate inteira sem mudar uma linha de política.** Por isso
`BOT_VERSION` existe (`heuristic.ts:31`, hoje `'heuristic-1'`), e por isso **nenhuma matriz é
reportável sem a versão e o preset que a produziram** — comparar duas matrizes de versões
diferentes é comparar dois instrumentos (`balance.ts:51-56`).

`PRESET_ARNES` é `Readonly` e congelado por `BOT_VERSION` (`heuristic.ts:64-75`). Ajustá-lo para
o oponente solo ficar mais divertido é o modo de falha "deriva de preset"
(`architecture-e2.md` §8.4): o modo treino usa presets próprios e nomeados.

### 5.5 Os quatro invariantes N-1 a N-4

Declarados em `heuristic.ts:18-27`, cada um com o modo de falha que fecha:

| # | Invariante | O que impede |
|---|---|---|
| **N-1** | Sem `Date.now`, `performance.now`, `process.hrtime` em `bot/`. O único relógio é `view.time` | Bot que decide por tempo de parede: o replay do arnês nunca reproduz |
| **N-2** | `BotState.porBola` é **container de consulta**: nunca se itera sobre ele. Toda iteração parte de `view.balls` | Ordem de iteração de container virando entrada da simulação |
| **N-3** | O bot **não escreve** em `view`. `Omit` é raso e não protege — quem protege é o teste de replay | Escrita acidental em `view.balls[i].hp`, que o tipo não pega |
| **N-4** | `Math.sqrt(a*a+b*b)` em vez de `Math.hypot`; nada de `atan2` | Divergência entre engines (V8 × JSC). Atenuante, não crítico — o arnês roda só em Node e o replay reproduz **comandos**, não o bot |

N-4 é respeitado com duas exceções declaradas: `cos`/`sin` na rotação de jitter
(`heuristic.ts:537-538`, sem alternativa algébrica) e `log`/`pow` na velocidade efetiva do dash
(`heuristic.ts:454`). `architecture-e2.md` §8.5 aceita explicitamente.

**P2.5 é provado por dois testes, não um** (`determinism.ts:225-301`):

1. **Autoconsistência com bot no loop** — 5 seeds com `heuristic`, duas vezes, hash igual. Pega
   N-1, N-2 e qualquer não-determinismo interno da política.
2. **Replay sem bot** — grava `Command[]`, recria o mundo com a mesma seed e reproduz só os
   comandos. Pega N-3 e prova o isolamento de stream que é o coração de D-08.

**Sem valores de referência fixos, e isso é decisão, não omissão** (`determinism.ts:238-243`): a
política do bot ainda vai mudar, e um hash congelado ali reprovaria toda mudança legítima de
`PRESET_ARNES` — churn de baseline sem informação. O que se exige é **igualdade entre execuções**,
que é invariante sob qualquer política. Os hashes do `dummy` continuam sendo os únicos números
congelados do arquivo.

Há ainda uma guarda em runtime específica, `guardaBot001` (`determinism.ts:322-349`): um `VE`
corrompido (`NaN`) tem que resultar em **não castar**. O limiar está escrito no sentido positivo,
`!(melhorVE >= limiar)` (`heuristic.ts:289`), porque `NaN < limiar` é `false` e a forma negativa
**aceitava** o candidato. A guarda tem um canário embutido: se o cenário perder poder
discriminante (o bot passar a castar no tick 0 com `hp` são), o teste acusa em vez de morrer em
silêncio.

### 5.6 O que o bot não sabe, e por que isso é medido em vez de escondido

`VE` deliberadamente **não** inclui o dano da habilidade (`heuristic.ts:326-328`): dano é o número
volátil, a segunda fonte de verdade que divergiria. Consequência honesta: o bot **não escolhe entre
habilidades** — escolhe *quando* e *onde*, que é a decisão que o jogador toma.

**Ponto cego registrado:** o bot não vê efeitos (o `+30% de dano` do Deslize, a lentidão da Lâmina,
o puxão da Convergência). Um personagem cujo poder está em efeito é **sub-jogado**, e a matriz
reportaria isso como fraqueza de design. É o risco de maior consequência do arnês
(`architecture-e2.md` §8.3).

O que salva a Fase 2: os três critérios do portão são **diferenciais** — comparam duas
configurações contra a mesma linha-base, com o mesmo bot dos dois lados, e o viés de competência
cancela. O que **não** salva a Fase 5: P5.1 é critério **absoluto**, e ali um personagem
sub-jogado é indistinguível de um personagem fraco.

A mitigação que cabe hoje é a métrica de **utilização de kit** (casts de ativa e de ult por
rodada, e % de rodadas em que a ult nunca saiu, por personagem) — o detector precoce de "o bot não
sabe jogar de X". Custa uma contagem, e detectá-lo com 2 personagens é de graça.

Há ainda um viés de fidelidade **medido e corrigido parcialmente** (ARCH-001, gate de `e2.2`):
`tImpacto` para `dash` não pode usar `S.speed` cru, porque o corpo do caster sofre `drag` a cada
tick — o Golem entrega 61% da velocidade declarada, o projétil do Vex entrega 98,2%. Usar o
número cru nos dois casos reintroduziria **por baixo** o confundidor pelo qual a opção C foi
rejeitada. A correção usa a média da lei que o motor de fato roda,
`v̄ = v0·(1 − drag^T)/(T·−ln drag)` (`heuristic.ts:449-456`), sem constante calibrada — uma
constante ajustada ao Golem seria um número por personagem disfarçado. Viés residual registrado:
77% contra os 61% medidos, porque a IA de movimento puxa a velocidade de volta, e modelar a IA de
movimento é justamente o que o bot não pode fazer.

---

## 6. O arnês de balanceamento

### 6.1 As três peças

| Arquivo | Papel | Fronteira |
|---|---|---|
| `tools/harness.ts` | `runRound`, `RoundResult`, `hash`, `MAX_ROUND_TICKS` | A **única** definição do laço (I-11) |
| `tools/packages.ts` | Pacotes nomeados por item, com o sinal escrito | **Dado, sem lógica.** Sem validação — quem valida entrada de usuário é o CLI |
| `tools/balance.ts` | O CLI (`npm run balance`) | **Orquestra**; não contém regra de simulação |

`runRound` é o laço inteiro (`harness.ts:61-72`):

```ts
const world = createWorld(chars, setup)
const tick = driver(setup)
while (!world.over && world.tick < MAX_ROUND_TICKS) step(world, tick(world))
return { winner: world.winner, ticks: world.tick, hash: hash(world) }
```

**`RoundDriver` é fábrica, não função de tick** (`harness.ts:36-53`), e o motivo é concreto: o bot
heurístico tem estado **por time** (`createBot(matchSeed, team)`, `porBola`), e esse estado precisa
nascer **uma vez por partida**, com a seed da partida, não a cada tick. `dummyCommands` é sem
estado e ignora o `setup`; `heuristic` fecha sobre os dois `BotState` sem que `runRound` mude uma
linha.

`hash` é FNV-1a sobre o estado quantizado a 4 casas decimais (`harness.ts:75-89`): tick, winner e,
por bola, `id:x:y:vx:vy:hp:alive`. Quantizar evita ruído de ponto flutuante irrelevante.

### 6.2 Troca de lado é obrigatória, não higiene

É a decisão mais importante do desenho do arnês, e vem de uma medição, não de teoria.

`rodarConfronto` (`balance.ts:1088-1127`) implementa `architecture-e2.md` §4.2:

```
seeds  1 .. n/2   → teams: [C0, C1]
seeds n/2+1 .. n  → teams: [C1, C0]
winrate(C0) = (vitórias como time 0 + vitórias como time 1) / decididas
```

Com uma adaptação de forma obrigatória: **"n/2" conta decididas, não seeds** — não dá para saber
de antemão quantas seeds produzem n/2 decididas. As duas metades param cada uma em `ceil(n/2)`
decididas, e as seeds continuam sendo consumidas em ordem crescente, a segunda metade retomando
onde a primeira parou (`rodarFase`, `balance.ts:1026-1054`). Metades exatamente iguais em `n` é a
condição para o viés cancelar em primeira ordem.

**Espelho não é célula de matriz — é diagnóstico.** Uma composição contra ela mesma é imune à troca
de lado (trocar não muda nada), então roda numa metade só, e o número reportado é a vitória do
time 0, que é a **medida corrente do viés de lado** (`balance.ts:1100-1105`). Confundir as duas
coisas é como a Fase 0 concluiu "espelho perto de 50/50": verdadeiro para `[golem,vex]`, e falso
por 23pp para `[golem,golem]`.

### 6.3 O veredito de 3 estados

`icPp` e `vereditoDe` (`balance.ts:1340-1356`), com `ALVO_MIN = 0.45`, `ALVO_MAX = 0.55`,
`Z_95 = 1.96` (`balance.ts:46-49`):

| Veredito | Regra |
|---|---|
| ✓ dentro | ponto **e** IC inteiramente dentro de 45–55% |
| ✗ fora | ponto fora de 45–55% |
| ? inconclusivo | ponto dentro, mas o IC cruza uma borda → **n insuficiente para afirmar**, não é aprovação |

O alerta de RF-47 é sobre o **estimador pontual**, e é assim que fica. O terceiro estado existe
porque duas categorias escondem o problema de amostragem: para uma célula verdadeiramente 50/50, a
chance de o estimador pontual sair de 45–55% é ≈0,47% a n=800 — numa matriz de 378 células, ~1,8
alarmes falsos por execução.

### 6.4 Piso de `n` (RF-48) vs `n` de portão — a distinção que custou um gate

**São coisas diferentes, e confundi-las reprova o portão pelo motivo errado.**

`n ≥ 800` é o **piso estatístico** de RF-48: o cálculo de duas proporções dá `n ≈ 781` para
α = 0,05 bilateral e potência 0,80. O 800 do PRD é esse número arredondado.

Mas a n=800 o IC é ±3,46pp, o que deixa uma janela conclusiva de apenas **±1,54pp** em torno de
50% — 30,8% da faixa de 10pp. Um pipeline **perfeitamente justo** sai `? inconclusivo` em ~38,5%
das execuções, **não por defeito**, mas porque o IC cruza a borda. Medido no gate de `e2.6`
(QA-E26-001): na seed base 1 (o default) o controle dá 52,25% ±3,46 → inconclusivo; nas seeds
1001–5001 dá 49,13/49,50/50,13/50,50/48,63, todas ✓ dentro, média 50,02%.

Probabilidade de veredito conclusivo, medida: n=800 → 61,5%; n=1000 → 77,1%; n=1500 → 94,4%;
n=2000 → 98,8%; n=3000 → ~100%.

> **A execução oficial do portão usa `n ≥ 2000`, não o piso de 800.** O comando registrado é
> `npm run balance -- --mutacao=vex:dmg:+0.30 --n=3000`, que entrega P2.2, P2.3 e P2.4 num único
> comando (~2,5 min). Ver a nota de execução no Anexo B de `architecture-e2.md` e a §2 do PRD.

`n=800` é o mínimo estatístico de RF-48. **Não é configuração defensável para um portão.**

### 6.5 O viés de lado estrutural — o achado que mudou o instrumento

**O fato.** O time 0 vence **100%** dos duelos 1v1 espelhados de Golem (1 449 rodadas, com e sem
bot) e **73%** dos 2v2 espelhados de Golem. Com `[golem,vex]` e o bot heurístico, **54,72% ±4,0** —
intervalo que **exclui** 50%.

**A causa, e não é ordem de comandos** (inverter `[...bot(0), ...bot(1)]` dá resultado idêntico ao
último bit): o combate é resolvido **na ordem de `world.balls`**, que é `[t0b1, t0b2, t1b1, t1b2]`.
`autoAttack` percorre essa ordem (`world.ts:631`) e `dealDamage` mata na hora
(`world.ts:379-388`); uma bola morta não contra-ataca no mesmo tick. Num duelo perfeitamente
simétrico, o golpe letal do time 0 **sempre** chega primeiro. O Vex empata 800/800 pelo mesmo
mecanismo pelo avesso: o dano dele vem de projéteis já em voo, que acertam depois da morte do dono.

**Por que não foi corrigido.** P2.1 exige o golden hash intacto, e as duas correções possíveis
(resolução simultânea de dano; ordem de resolução derivada da seed) **movem o hash e mudam quem
ganha as rodadas** — decisão de produto, não de arquitetura. O instrumento funciona sem a correção
desde que a troca de lado exista: o controle negativo dá 49,23% com troca, contra 73% sem.

**O que segue aberto.** Isto não é só problema de instrumento: na Fase 4 o servidor atribui os
lados, e uma vantagem estrutural de primeiro golpe é problema de **justiça de PvP**. No cliente de
hoje, **o humano é sempre o time 0** (`client/main.ts:28`, `:55`). A resolução do usuário de
2026-07-29 aprovou a saída (b) — **alternar o lado do jogador a cada rodada**, hash intacto — e
deixou a correção real da simulação para decidir separadamente, quando a Fase 4 exigir
(`architecture-e3.md` §14/R-06).

### 6.6 Empates saem do denominador, e isso interage com a força da mutação

Empate (`winner === -1`) é rodada **nula** por D-02: ninguém pontua. Coerente com isso, o
denominador do winrate são as **rodadas decididas**, e a taxa de empate é reportada como número
próprio (`balance.ts:1043-1051`).

Consequência que é armadilha estatística real: **a taxa de empate varia com a configuração** — 11,1%
no espelho com `dummy`, 2,8% com `heuristic`, 0,8% com mutante forte. Portanto `n` **efetivo** varia
entre células, e células diferentes amostram populações levemente diferentes de rodadas. A
alternativa (empate como meia vitória) contraria D-02.

**Decisão: excluir e reportar os dois números, sempre juntos.** O CLI imprime `n_dec` e `n_seeds`
lado a lado. Se a taxa de empate de alguma célula passar de ~25%, o veredito daquela célula deve
ser lido como suspeito (`architecture-e2.md` §8.7).

Há teto de seeds para não girar para sempre: `TETO_SEEDS_POR_DECIDIDA = 20`
(`balance.ts:62-68`) — só é atingido se mais de 95% das rodadas empatarem, que é configuração
quebrada e não amostra ruim.

### 6.7 Um mecanismo para três critérios

P2.2 (mutante), P2.3 (controle negativo) e Risco #1b **parecem três coisas e são o mesmo
mecanismo**: `PickSetup.itemBonus` + protocolo A/B espelhado.

```
composição C (a mesma dos dois lados)  ·  pacote P aplicado a UM personagem de UM lado
seeds  1 .. n/2   → pacote no time 0
seeds n/2+1 .. n  → pacote no time 1
winrate medido = vitórias do LADO MODIFICADO / rodadas decididas
```

Três propriedades, e as três são necessárias (`architecture-e2.md` §5.3):

1. **Isola a mutação.** Tudo o mais é idêntico dos dois lados.
2. **Cancela o viés de lado**, o que é o que faz o controle cair em 50% em vez de 73%.
3. **Não depende de o roster estar balanceado.** É o ponto decisivo: a leitura alternativa de P2.3
   ("a matriz de composições permanece dentro de 45–55% sem mutação") é **insatisfazível por
   construção** — isso *é* o portão da Fase 5. Com o protocolo A/B, o controle negativo testa o que
   um controle negativo deve testar: **que o pipeline não injeta assimetria por conta própria.**

A leitura 2 foi aprovada pelo usuário em 2026-07-28 e é o critério oficial do portão de E2.

**O CLI avisa quando o teto morde.** Um `+150%` pedido em `dmg` seria silenciosamente reduzido para
`+100%` (ΣMAX), e um teste de mutante negativo seria interpretado como falha do arnês quando foi o
clamp funcionando (`conferirClamp`, `balance.ts:1464`).

### 6.8 Paralelização: as regras, e o gatilho para ligá-la

Uma luta é **função pura de `(seed, setup, BOT_VERSION)`**, então paralelizar por luta é seguro. O
que **não** é seguro é a agregação (`architecture-e2.md` §8.2):

| Regra | Motivo |
|---|---|
| Workers devolvem **contagens inteiras**, nunca somas de ponto flutuante | Soma em `float64` não é associativa; a ordem de chegada mudaria o último bit e, na borda de 45,00%, o veredito |
| Durações voltam como **arrays por bloco**, concatenados na ordem do **índice do bloco**, nunca na de conclusão | Mediana e quantis dependem da ordem de concatenação em caso de empate de valores |
| Particionamento de seeds fixo, derivado do índice do bloco, nunca distribuído dinamicamente | Mesmo comando → mesmo resultado, independentemente de quantos núcleos a máquina tem |

**Não implementar antes do gatilho:** se uma execução de portão passar de 20 minutos, ligar.
Paralelismo é a categoria de código onde bug de determinismo se esconde melhor. Mesmo espírito do
dirty flag de `recomputeStats` (gatilho: arnês de 800 lutas passando de 10 minutos,
`architecture.md` §7.1).

Custo medido hoje: ~180 000 ticks/s em 1 thread (Node 24), ~4,6 ms por luta. A Fase 2 inteira leva
segundos a minutos. A Fase 5 vai de **21 min a 10,4 h** dependendo apenas de qual leitura de "28
confrontos" for adotada — 30× de diferença, e é por isso que R-03 é decisão de portão e não detalhe
de implementação.

---

## 7. O golden hash como disciplina de engenharia

### 7.1 O que é

`determinism.ts` verificava **autoconsistência**: rodar cada seed duas vezes e comparar. Isso prova
que a simulação é **reprodutível**, não que ela é **a mesma de ontem** — uma refatoração que
mudasse silenciosamente o comportamento do jogo passaria verde. Uma migração de 8 passos feita sob
esse critério é feita no escuro.

O golden hash são **duas tabelas de valores congelados** (`determinism.ts:59-116`):

| Tabela | Conteúdo | Por que existe |
|---|---|---|
| `BASELINE` | 5 seeds (1, 2, 3, 7, 11) com hash, ticks e vencedor | Trava o comportamento atual. A seed 11 é deliberada: exercita o caminho de **empate**, que é o que D-02 regulamenta |
| `BUILD_BASELINE` | 5 variantes de build, com labels | O `BASELINE` fixa `abilityIndex: 0` / `passiveIndex: 0`, então a passiva Fantasma do Vex **nunca roda** nas 5 seeds — uma regressão nela passaria verde |

O `BUILD_BASELINE` é resultado direto de um achado de gate (ARCH-001, `debt.3`): a remoção da
multiplicação por `mods.speed` só havia sido verificada por uma matriz avulsa de 125k amostras que
o @qa montou e descartou. Esta tabela é a versão **permanente e barata** dessa proteção.

Saída de `npm run sim:check`, reproduzida nesta sessão:

```
determinismo   ✓ ok
golden hash    ✓ ok — 5 seeds batem o baseline
build coverage ✓ ok — 5 variantes batem
espelho 2v2    time0 19 · time1 14 · empate 7   (esperado ~50/50)
duração        mediana 13.8s · min 12.3s · max 19.5s
replay         ✓ ok — 5 seeds reproduzidas sem bot
bot dupla exec ✓ ok — 5 seeds com heuristic dão hash igual entre execuções
bot replay     ✓ ok — 5 seeds do heuristic reproduzidas sem bot
guarda BOT-001 ✓ ok — VE = NaN não casta (limiar no sentido positivo)
pilar 3        ✓ ok — camadas 1 e 3 sem violação
```

### 7.2 A regra, escrita no próprio arquivo

> **NÃO "atualize" esta tabela para fazer o teste passar. Se a execução não bate, o bug está na
> execução. Mudança de baseline exige justificativa registrada no commit.**
> — `determinism.ts:73-74`

Quando o hash **pode** mudar legitimamente:

1. **Quando o jogo muda de propósito**, com re-baseline justificado no commit. Na Fase 3, é
   exatamente **uma story** — o ajuste de D-05 (`chars/tuning.ts`, story `e3.6`) — e ela é a única
   autorizada (`architecture-e3.md` §9.2). Os outros 7 passos declaram hash idêntico.
2. **Quando um clamp entra em ação pela primeira vez.** Clamps introduzem descontinuidade, não
   não-determinismo, mas mudam o hash quando mordem. É por isso que o re-baseline tem de ser
   deliberado: **hash que muda sem explicação = bug** (`architecture.md` §7.2, vetor 6).

Critério de aceite da story que move o hash **não é "o hash não mudou"**, e sim
(`architecture-e3.md` §9.2):

| # | Critério |
|---|---|
| T-1 | `BASELINE` e `BUILD_BASELINE` re-gravados **no mesmo commit**, com o valor que os produziu na justificativa |
| T-2 | A evidência de produto que motivou a mudança (P3.1, medida com humano no controle) |
| T-3 | **O portão de E2 volta a passar depois do ajuste** — o mutante continua sendo detectado, o controle continua dentro |
| T-4 | `--risco-1b` re-executado: os deltas por personagem **não invertem de sinal** |

T-3 e T-4 são o que impede a fase de "ajustar até ficar divertido" e descobrir na Fase 5 que o
instrumento de balanceamento deixou de funcionar no caminho. Custam ~5 minutos de CPU.

### 7.3 Duas regressões reais que ele pegou

**Caso 1 — a cobertura que faltava (ARCH-001, gate de `debt.3`, commit `06a927e`).** O `BASELINE`
das 5 seeds não exercitava a 2ª ativa nem a 2ª passiva de nenhum personagem. A remoção de
`mods.speed` em `debt.3` mexia exatamente na passiva Fantasma do Vex (`passiveIndex: 1`), que
nenhuma das 5 seeds rodava. O gate achou o buraco, e o `BUILD_BASELINE` nasceu como
consequência — 5 variantes que cobrem a 2ª ativa e a 2ª passiva de cada personagem, isoladas e em
combinação.

**Caso 2 — o piso que não protegia o que dizia proteger (QA-001, gate de `debt.4`, commit
`4c2e458`).** `MIN_ABILITY_CD_MS` estava em 400 ms, e a maior janela de contato do roster é 450 ms.
O piso **sozinho** não entregava a garantia que a arquitetura alegava; quem protegia era o teto de
`cdSpeed`. Se `debt.6` tivesse escrito o teste automatizado da invariante A2 antes da correção, ele
**passaria** — validando a garantia pelo motivo errado. Corrigido para 500 ms, com folga real.

**Caso 3 — a propriedade que o épico prometeu e cumpriu.** O golden hash das 5 seeds
(`96de1201`/`f66a7416`/`a8db9c28`/`cb77dbe0`/`6aede2d9`) atravessou **sete refatorações
estruturais** (`debt.1` a `debt.7`) e **nove stories de arnês** (`e2.0` a `e2.8`) sem mover um
dígito, e continua batendo `architecture.md` §6.0 nesta sessão. Isso é o que diferencia a migração
de uma reescrita: cada passo foi **verificável**, não plausível.

### 7.4 O que substitui o golden hash quando ele muda de propósito

A partir da story de D-05, "o jogo é o mesmo de ontem?" muda de resposta de propósito. As redes que
sobram são as que **não dependem de número absoluto** (`architecture-e3.md` §9.3):

| Rede | O que prova | Sobrevive ao ajuste? |
|---|---|---|
| Autoconsistência (dupla execução, 40 seeds) | a simulação é reprodutível | **sim** |
| Replay sem bot (rodada) e replay de partida | o resultado é função de (seed, decisões, comandos) | **sim** |
| Auditoria do Pilar 3 (fase em `dealDamage`, camadas 1 e 3) | dano por contato só em janela declarada | **sim** |
| Controles do arnês (A/B com pacote vazio ≈ 50%; mutante detectado) | o instrumento continua funcionando | **sim** — é diferencial, não absoluto |
| Invariantes de economia e A-10 (ordem de compra) | as regras novas não regridem | **sim** |
| Golden hash | o jogo é bit-a-bit o de ontem | **não** — vira "o de depois do ajuste" |

Em uma frase: **o golden hash deixa de ser o juiz da fase e passa a ser o juiz de cada passo dentro
dela**, com exatamente uma exceção declarada.

### 7.5 A camada `match/` é a primeira coisa do projeto que o golden hash não protege

Todo o rigor acumulado protege `sim/`. Placar, ouro e loja ficam fora dele por decisão
(`architecture-e3.md` §2.2), e **um bug de economia — juros creditados duas vezes, ouro debitado
sem item — passaria por todos os testes existentes.**

A mitigação projetada é golden hash **de partida**: a partida headless bot × bot com `matchSeed`
fixo entra no `sim:check` e trava **placar, sequência de vencedores e hashes de todas as rodadas**,
com a mesma disciplina — não se "atualiza" para o teste passar.

#### Errata medida (gate de `e3.2`, 2026-07-30) — essa mitigação NÃO cobre o exemplo que o próprio parágrafo dá

O parágrafo acima está certo no diagnóstico e **errado na conclusão**. O replay de partida foi
implementado em `e3.2` e mede exatamente o que promete — mas o que ele promete é
**reprodutibilidade**, e reprodutibilidade é **cega a erro consistente**.

Medido, com a perturbação aplicada na árvore real e o patch confirmado no disco: um `aplicar` que
aceita compra **sem debitar o ouro** — literalmente "ouro debitado sem item", o exemplo do
parágrafo — erra igual na gravação e no replay. As três partidas se reproduzem perfeitamente e os
hashes saem **byte-idênticos aos da implementação correta**:

| | hashes das rodadas (`matchSeed` 1) | veredito |
|---|---|---|
| implementação correta | `d4c28105 e1dde398 15c4854d` | replay ✓ |
| **sem debitar ouro** | `d4c28105 e1dde398 15c4854d` | replay ✓ **— não acusa** |

O mesmo vale para a ponte `shop → match → sim`: zerar `itemBonus` em `setupDaRodada` mantém o
golden hash ✓, o determinismo ✓ **e** o replay de partida ✓.

**A regra que sai disto, e que vale para toda camada que o golden hash não cobre:**

> Um teste de reprodutibilidade prova que o sistema é **função** de suas entradas. Ele **não** prova
> que a função é a certa. Toda camada nova precisa das duas redes:
>
> | Rede | Forma | Pega | Não pega |
> |---|---|---|---|
> | **Reprodutibilidade** | comparar duas execuções entre si | não-determinismo, estado vazando entre rodadas, leitura de relógio/RNG errado | **qualquer erro sistemático** — ele aparece igual nas duas pontas |
> | **Valor** | comparar contra um número/identidade **esperado** | débito ≠ preço, evento que não bate o estado, rejeição que altera o estado | não-determinismo (dois erros consistentes diferentes passam) |
>
> Um erro sistemático só é detectável por quem **conhece a resposta certa**, não por quem compara o
> sistema consigo mesmo.

As duas guardas que fazem o serviço em `e3.2`, ambas escritas FORA da letra dos ACs e ambas
obrigatórias — sem elas os ACs que elas cercam estariam provados só por leitura de código:

- **`invarianteCompra`** (`tools/partida.ts`) — confere VALORES: `ouro_antes − ouro_depois == preço`,
  `evento.ouroDepois == estado.ouro`, e a rejeição devolve o estado original **por identidade
  referencial** (`===`, não comparação campo a campo, que uma implementação errada satisfaria com um
  clone). Pegou 5/5 mutações de `match/`; sem ela, 1/5 passava.
- **`ponte itemBonus`** — confere **poder discriminante**: roda a MESMA rodada com os MESMOS comandos,
  com e sem o bônus agregado, e exige hashes **diferentes**. Existe porque nenhuma seed do baseline
  exercita `itemBonus`, então "o teste passou" não distinguia "a ponte funciona" de "a ponte é oca".

Corolário para o processo (§8.2): a bateria negativa não pode se contentar com "a mutação foi
detectada". Ela precisa registrar **qual** guarda detectou. Foi assim que este achado apareceu: as
cinco mutações de `e3.2` foram pegas, mas quatro por guardas de valor e nenhuma pelo replay — e
uma delas, na primeira rodada da bateria (antes de `invarianteCompra` existir), **passou verde**.

---

## 8. O processo de qualidade que emergiu nas ~25 stories

**Nada disto está escrito em `.claude/rules/`.** É como todo gate de QA deste projeto funciona de
fato, reconstruído lendo os 14 arquivos de `docs/qa/gates/`. Marcado como
**[convenção observada, não formalizada]** porque é exatamente isso — e é a parte deste documento
que mais vale a leitura, porque é a que uma sessão nova reinventaria pior.

### 8.1 Nunca aceitar o Dev Agent Record por fé

Toda evidência é **reexecutada do zero** pelo @qa. A frase aparece literalmente nos gates: *"Nada
abaixo foi aceito com base na Debug Log"*, *"Testado por mim, não aceito da story"*, *"o terceiro
caminho é meu, não da story"*.

Reexecução significa rodar o comando, não ler a saída colada. E significa **conferir a tabela de
referência contra a fonte**, linha a linha: o gate de `e2.8` confirma que o `BASELINE` de
`determinism.ts:78-84` é literalmente a tabela de `architecture.md` §6.0 linhas 711-715 — *"isto é,
o baseline não foi reescrito para caber no resultado."*

O @qa também **corrige o próprio achado anterior** quando mede melhor: no gate de `e2.6` o IC do
delta foi registrado como ±4,90pp por derivação não pareada; no de `e2.7` foi medido em desenho
pareado e a correção está escrita como correção.

### 8.2 Teste negativo obrigatório: perturbar e confirmar que o teste ACUSA

**Um teste que passa não prova nada até você mostrar que ele sabe falhar.** A prática:

1. Aplicar uma perturbação deliberada na árvore real, com backup.
2. Rodar tudo.
3. Registrar se foi **detectada**, **passou despercebida** ou é **inofensiva por design**.
4. Reverter e conferir por sha256.

Do gate de `e2.8`, literalmente:

```
perturbacoes:
  total: 4
  detectadas: 1
  passaram_despercebidas: 2
  inofensivas_por_design: 1
```

E do de `e2.6`: *"Bateria negativa de 18 perturbações: 17 detectadas, 1 provada no-op."*

**Perturbação que passa despercebida vira issue, não é ignorada.** Foi assim que nasceram
QA-E28-001 (comportamento que só muda com `observing: true` atravessa golden hash, build coverage,
os 15 ensaios e a paridade nas 5 seeds) e QA-E28-002 (`medir` acumulando o denominador
monotonicamente — 34495 → 68990 → 102209 → ... — sem nada acusar).

**Perturbação inofensiva também é registrada, e é achado em favor da implementação.** A perturbação
E do gate de `e2.8` mostrou que `medir` reseta na entrada **e** na saída — defesa dupla, o que só
ficou visível porque a perturbação foi tentada.

**O canário é parte do teste.** A guarda de BOT-001 confere o caso são junto com o corrompido, e
falha se o cenário perder poder discriminante (`determinism.ts:318-320`): *"o modo de falha mais
caro de um teste"* é morrer em silêncio.

**O contador morto e o valor verdadeiro zero.** Quando a saída correta de hoje é uma fila de zeros
— contadores de clamp, margem de tunelamento, morte súbita em 0,0% — **um contador quebrado produz
a mesma fila.** É por isso que `balance.ts` tem 15+ autotestes permanentes que rodam em **toda**
execução e **abortam a matriz**, não apenas avisam (`autotesteContadores`, `autotesteTrocaDeLado`,
`autotesteVeredito`, `autotestePacotes`, `autotesteAb`, `autotesteRisco1b`, `autotesteFechar`).

### 8.3 sha256 como prova de escopo entre gates consecutivos

Cada gate registra o **sha256 de todos os arquivos de código** e o compara com o gate anterior. Do
`e2.8`:

```
reviewed_revision:
  ALTERADOS por esta story (exatamente os 3 do File List):
    src/sim/stats.ts   sha256:b69b7a91…  (era 7493f054… no gate de e2.7)
    src/sim/physics.ts sha256:a9d12e7f…  (era 32e5832d… no gate de e2.7)
    src/tools/balance.ts sha256:031f9075… (era 1f41891c… no gate de e2.7)
  IDÊNTICOS ao gate de e2.7, dígito a dígito: [14 arquivos + package.json]
```

O veredito é escrito como **`'PROVADO POR SHA256, não por declaração'`**. Reforçado por duas vias
independentes: mtime dos arquivos, e grep do marcador da story (`e2\.8|§7\.3|§7\.4`) em `src/`
retornando exatamente os mesmos 3 arquivos.

Isso serve a três coisas de uma vez:

- **Prova que o File List está completo** — nenhum arquivo mudou fora dele.
- **Prova que artefatos `Done` não foram reabertos** — `heuristic.ts` é ancorado por sha256 desde
  `e2.3`, e reabri-lo numa story de CLI custa mais do que rende.
- **Prova que a árvore entregue ao @devops é bit-idêntica à que o @dev deixou**, depois de todas as
  perturbações do gate serem revertidas.

`package.json` idêntico é usado como prova negativa: *"confirma 'nenhuma flag nova': os contadores
são rodapé, não comando."*

### 8.4 Portão verificável vs portão de julgamento humano

A distinção é do GDD §10 e do PRD §2, e ela governa **o que um gate de story pode e não pode
concluir**.

| | Portão **verificável** (E2, E5) | Portão de **julgamento humano** (E0, E1, E3) |
|---|---|---|
| Como passa | por comando, com critérios `P-x.y` | pelo usuário jogando |
| Exemplo | P2.2: o mutante é reportado fora de 45–55%. Falso negativo = **portão reprovado** | *"Dá vontade de jogar outra partida?"* |
| O que o gate de story entrega | a execução do comando, reproduzida | **pré-condições verificáveis** e **evidência instrumentada** que informa o julgamento sem decidi-lo |
| O que **não** pode acontecer | — | inventar uma métrica substituta — isso inverteria a decisão #13 |

Consequência prática, e é a que mais importa para uma sessão nova: **numa fase de julgamento humano,
uma story nunca "passa o portão".** Ela entrega a pré-condição (ex.: "uma partida completa no celular,
sem erro de console") ou a evidência (ex.: a mediana de duração com humano no controle). Confundir os
dois é como o portão de E1 passou sem a instrumentação de RF-36 que o PRD mandava fazer junto.

**E há um aprendizado de método que vale para toda fase com entrega de cliente:** o arnês headless
**prova a simulação, não prova o cliente**. Um bug de TDZ derrubava o módulo inteiro do cliente na
inicialização e passou invisível por todos os testes automatizados; só apareceu abrindo o navegador.
Por isso toda fase com entrega de cliente tem **verificação visual própria** como pré-condição de
portão, não herdada do arnês.

### 8.5 Interpretação declarada não é invenção (Artigo IV)

Onde a arquitetura não fecha um ponto, o @dev **declara a interpretação no Dev Agent Record** com
rastreabilidade ao texto de origem, em vez de embuti-la em silêncio. O gate julga se é interpretação
razoável ou invenção de escopo, e escreve o veredito.

Exemplo canônico, gate de `e2.8`, sobre os denominadores `calls` e `samples` que não estão na letra
de §7.3/§7.4:

> **Veredito: INTERPRETAÇÃO RAZOÁVEL — dentro de escopo.** §7.3 não pede um contador: pede uma
> **leitura de três estados**. O terceiro estado é uma afirmação de fração, indecidível a partir de
> uma contagem crua — `6392` não se distingue de `6392 em 6392`. O denominador é **condição
> necessária para executar a letra**, não acréscimo a ela. […] O @dev declarou a interpretação em
> vez de embuti-la em silêncio. É exatamente a disciplina que o Artigo IV cobra — **a violação seria
> inventar sem declarar, não interpretar e registrar.**

Outro exemplo: `recomputeStats(b)` vs a forma pura `(base, bonus) → StatBlock`. A story descrevia as
duas formas, que são incompatíveis; o @dev escolheu a que não aloca e **registrou por quê**, citando
o §7.1 que a própria story invocava (`stats.ts:171-182`).

### 8.6 Achado fora de escopo é registrado, não corrigido

Um achado que não cabe na story vira issue com `scope_verdict` explícito e **dono nomeado**. REL-001
é o caso exemplar (gate de `e2.1`):

> **`scope_verdict`:** Fora de escopo desta story, corretamente. AC 7 proíbe tocar qualquer linha
> além do campo e da soma […]
> **`suggested_action`:** @architect/@po: registrar como **pré-requisito bloqueante** de QUALQUER
> story que introduza item, pacote ou mutação de `maxHp`. […] precisa de story própria, não de
> remendo.

E o achado foi **medido antes de ser dimensionado**: `architecture-e3.md` §1.3 mediu que o bug não
enfraquece a Couraça — **inverte o sinal dela** (−29,39pp num Vex a +100% de HP, contra +41,04pp com
a correção). Foi a medição que transformou "bug de inicialização" em "pré-requisito bloqueante".

### 8.7 A classe de achado que reapareceu quatro vezes

Vale conhecer porque é a única que o processo **não** conseguiu eliminar, e conhecê-la é a melhor
defesa:

> **A fiação entre partes testadas não é testada.**

| Gate | Forma que ela tomou |
|---|---|
| `e2.5` / QA-E25-001 | `nDec → icPp`: `icPp(nSeeds)` no lugar de `icPp(nDec)` passa todos os autotestes, porque o autoteste de veredito chama `vereditoDe(w, n)` direto e nunca através de `rodarConfronto` |
| `e2.6` / QA-E26-003 | A **ordem** de `NOMES_PACOTE` é contrato documentado; o autoteste compara **conjuntos**, não sequências |
| `e2.7` / QA-E27-001 | O **sinal** do delta é decidido na ordem dos argumentos de `deltaPp(...)`, e `deltaPp` tem 4 asserções — nenhuma sobre o call site |
| `e2.8` / QA-E28-002 | Os 15 ensaios chamam `resetClampCounters` **direto**; quem o AC 6 governa é `medir`, e sobre `medir` não há asserção |

O padrão: a **unidade** é testada, a **constante** é testada, e o **ponto onde as duas se encontram**
não é. Todas as quatro perturbações produzem saída **plausível** e `EXIT=0`.

A regra que sai disso, e que uma story nova deve aplicar sem esperar o gate cobrar:
**asserir o valor onde ele é CONSUMIDO, não onde é calculado.**

---

## 9. Convenções de nomenclatura e organização

### 9.1 Português para o domínio, inglês para o motor

Não é regra escrita em lugar nenhum — é o padrão consistente do código
**[convenção observada, não formalizada]**:

| Em inglês | Em português |
|---|---|
| Tipos e API de `sim/`: `Ball`, `World`, `CharDef`, `SimCtx`, `Command`, `StatBlock`, `WorldView` | Funções internas e locais: `rodar`, `medir`, `falhar`, `sair`, `mediana`, `distancia`, `faixa`, `maisProximo` |
| Campos de stat: `maxHp`, `maxSpeed`, `knockbackTaken`, `cdSpeed` | Domínio de jogo: `bolaSintetica`, `rodarConfronto`, `rodarFase`, `politicaReposicao`, `porValorEsperado`, `janelas` |
| Funções de fronteira: `createWorld`, `step`, `recomputeStats`, `deriveSeed`, `botCommands` | Identificadores de personagem e habilidade: `golem`, `vex`, `sismico`, `tremor`, `muralha`, `lamina`, `deslize`, `convergencia`, `ancora`, `casca`, `predador`, `fantasma` |
| — | Tipos da Fase 3: `EstadoPartida`, `Decisao`, `VisaoPartida`, `EscolhaPersonagem`, `Jogador` |

**Todos os comentários, TSDoc, mensagens de erro e saída de console são em português.** Sem
exceção.

Nomes de constantes de política do bot são **maiúsculas em português**, e o motivo está escrito:
*"a auditoria é feita comparando este bloco com §2.6 termo a termo, e renomear para o estilo do resto
do código tornaria essa conferência uma tradução em vez de uma leitura"* (`heuristic.ts:33-38`).

### 9.2 Comentários carregam a decisão, não a descrição

É a convenção mais visível do projeto e a mais valiosa. Um comentário não diz **o que** o código
faz — diz **por que essa forma e não a outra**, com o número que sustenta a escolha e o modo de
falha que ela evita. Três exemplos representativos:

- `packages.ts:36-39`: *"Os comentários fazem parte do dado: eles são a única coisa que impede a
  próxima pessoa de 'corrigir' `drag: +0.20` para o que o PRD diz."*
- `physics.ts:74`: *"literal de §7.4: `0.5 × (2 × menorSomaDeRaios)`. Escrito sem simplificar de
  propósito."*
- `heuristic.ts:278-288`: 11 linhas explicando por que o limiar está no sentido positivo, incluindo
  o que a forma anterior fazia de errado e por que as duas são idênticas para todo `VE` finito.

Cada comentário substantivo cita a **fonte** (`architecture.md` §X, `architecture-e2.md` §Y) e o
**achado** que o motivou (`QA-001, gate de debt.6`; `ARCH-001, gate de e2.2`; `BOT-001`; `REL-002`).
Isso é o que torna o código auditável sem abrir os 25 arquivos de story.

### 9.3 Mensagens de commit

Formato observado nos 30 commits:

```
{tipo}: {descrição em português, minúscula} [{story-id}]

{parágrafo explicando o passo do plano, com a §fonte}

{parágrafo sobre o que NÃO mudou, ou a consequência de escopo}

QA Gate: {VERDICT} (docs/qa/gates/{story-id}-{slug}.yml)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

Convenções concretas:

- **Story id em colchetes ao fim do assunto:** `[e2.8]`, `[debt.6]`, `[E2]` para a story de
  documento de fase.
- Tipos usados: `feat:`, `fix:`, `docs:`, `refactor:`, `build:`, `qa:`.
- Fix originado de gate cita o achado: `fix: piso de cooldown de habilidade sobe de 400 para 500ms
  (QA-001)`.
- **O corpo diz explicitamente o que o commit não muda** — "Golden hash intocado", "packages.ts
  intocado", "nenhuma agregação entre personagens é calculada".
- **Linha de gate obrigatória** apontando o arquivo YAML.
- Push é operação **exclusiva de @devops** (`.claude/rules/agent-authority.md`).

### 9.4 Caminhos e nomes de artefato

| Artefato | Caminho | Formato do nome |
|---|---|---|
| Story | `docs/stories/` | `{epic}.{N}.{slug}.story.md` — ex. `e3.2.match-tipos-reducer-bo5-economia.story.md` |
| Gate de QA | `docs/qa/gates/` | `{epic}.{N}-{slug}.yml` — ex. `e2.8-contadores-clamp-tunneling.yml` |
| Arquitetura de fase | `docs/` | `architecture.md` (dívida), `architecture-e2.md`, `architecture-e3.md` |
| Devlog | `docs/devlog/` | numerado |

Épicos observados: `debt.*` (dívida de arquitetura, 8 stories, todas `Done`), `e2.*` (arnês, 9
stories, todas `Done`), `e3.*` (Fase 3, 8 stories, todas `Ready`, zero implementadas).

### 9.5 Comandos que existem

```bash
npm run dev         # vite (o README aponta http://localhost:5177 — sem `server.port`
                    # em vite.config.ts, confira a porta que o vite imprimir)
npm run build       # vite build (base = /battle-balls/ — GitHub Pages serve em subcaminho)
npm run check       # tsc --noEmit          ← o typecheck
npm run sim:check   # node src/tools/determinism.ts
npm run balance     # node src/tools/balance.ts [-- flags]

node src/tools/inspect.ts 6   # autópsia de UMA rodada — não é script de npm
```

> **Atenção:** `CLAUDE.md` menciona `npm run lint` e `npm run typecheck`. **Nenhum dos dois
> existe** neste projeto. Não há linter configurado; `npm run check` é o typecheck. Não invente
> comando — os cinco scripts acima são todos os que `package.json` define.

Configuração de TypeScript relevante (`tsconfig.json`): `strict: true`, `noUnusedLocals: true`,
`verbatimModuleSyntax: true`, `allowImportingTsExtensions: true`. Daí duas consequências práticas:

- **Imports carregam a extensão `.ts`** (`from './types.ts'`), sempre relativos.
- **`noUnusedLocals` reprova import não usado**, o que já forçou uma decisão registrada:
  `determinism.ts` consome `hash` apenas através de `RoundResult.hash` e **não** o importa, porque
  importá-lo "para cumprir a lista" reprovaria o `npm run check` (`determinism.ts:16-18`).

Não há framework de teste. **Os testes são scripts executáveis** (`determinism.ts`) e **autotestes
que rodam dentro do CLI em toda invocação** (`balance.ts`). Falha é `throw new Error` com mensagem
que diz **onde procurar** e **quais são os suspeitos, em ordem** (`determinism.ts:516-563`).

---

## 10. O ciclo de vida de uma story neste projeto

### 10.1 A regra formal

`Draft → Ready → InProgress → InReview → Done`. Quem move cada transição, o que cada status
significa e as regras de edição de seção do arquivo de story estão em
**`.claude/rules/story-lifecycle.md`** — não duplico a tabela aqui.

O que vale reforçar: **@devops não muda status.** A autoridade de push começa depois de a story já
refletir o resultado do gate.

### 10.2 O padrão real observado

Reconstruído dos Change Logs das 25 stories. Cada seta é uma transição de agente com handoff:

```
@architect  escreve o documento de arquitetura da fase, com MEDIÇÕES feitas na sessão
            e as ressalvas (R-nn) devolvidas ao @pm/usuário
     ↓
@pm/usuário resolve as ressalvas. A resolução é anexada ao próprio documento de
            arquitetura, com data (ex. architecture-e3.md §14)
     ↓
@sm         fatia em stories numeradas, uma por passo do plano de construção,
            com Dev Notes citando a §fonte e ACs rastreáveis
     ↓
@po         valida com VERIFICAÇÃO DE FATOS NO CÓDIGO — não revisão de texto
     ↓
@dev        implementa, com bateria negativa própria e Dev Agent Record declarando
            toda interpretação que a arquitetura não fechou
     ↓
@qa         audita: reexecução independente, sha256 de escopo, perturbações,
            gate YAML com AC-por-AC e issues com dono nomeado
     ↓
@devops     commit + push (EXCLUSIVO)
```

**O que faz o @po deste projeto diferente:** a validação não é conferência de checklist. Do gate de
`debt.7`, v1.0.1:

> *Fatos conferidos: `dummy.ts:7` traz o comentário "Determinístico: não consome RNG" citado pela
> story; `dummyCommands(world: World, team: Team)` em `dummy.ts:9`; chamadas em `determinism.ts:27`
> e `inspect.ts:19`; `sim/rng.ts` tem 14 linhas e nenhum `deriveSeed`.*

E o @po **defende a recusa de inventar**: *"A recusa em fixar as constantes do splitmix32 (Dev
Notes) é a decisão correta sob Article IV — a arquitetura de fato não as especifica."*

**Os Should-Fix do @po viram entrada obrigatória da story seguinte.** O Should-Fix v1.0.1 de
`debt.7` ("o critério funcional não está quantificado; definir o que conta como colisão **antes** de
implementar") foi resolvido dentro da própria implementação, com o critério escrito.

**Cada gate declara as entradas obrigatórias do gate anterior.** É o mecanismo que impede dívida de
gate de virar dívida perpétua: `e2.6` fechou QA-E25-001/002/006; `e2.7` fechou QA-E26-003; `e2.8`
fechou QA-E25-006/QA-E26-003 e **declarou explicitamente** quais não pegou (§12.1).

### 10.3 A anatomia de um gate

Estrutura observada nos 14 YAMLs de `docs/qa/gates/`:

```yaml
schema: 1
story: 'e2.8'
gate: PASS | CONCERNS | FAIL | WAIVED
status_reason: >-  # parágrafo que explica o veredito, incluindo o que passou despercebido
reviewer: 'Quinn (@qa)'
reviewed_revision: >-  # sha256 dos ALTERADOS e dos IDÊNTICOS ao gate anterior
acceptance_criteria:   # um bloco por AC, com verdict e EVIDENCE reexecutada
top_issues:            # id, severity, category, finding MEDIDO, suggested_action com dono
verificacao_independente:
  reexecucao_do_zero:  # cada comando, com EXIT code
  escopo:              # 'PROVADO POR SHA256, não por declaração'
  perturbacoes:        # total / detectadas / passaram_despercebidas / inofensivas_por_design
pontos_fortes:         # o que a implementação fez bem, incluindo o que ela NÃO fez
waiver: { active: false }
recommended_status: 'Done — os 2 achados médios são dívida de guarda rastreada, não bloqueio'
next_agent: '@devops'
next_command: '*push'
```

Duas particularidades que valem imitar:

- **`pontos_fortes` registra o que a implementação NÃO fez.** Ex.: *"Era o lugar óbvio para uma
  lista paralela de campos — a segunda fonte de verdade que este projeto já pagou três vezes (C3,
  AimSpec, MNT-001) — e o @dev não a criou."*
- **`CONCERNS` é o veredito modal, e não é reprovação.** **12 dos 14 YAMLs são CONCERNS**; só `e2.0`
  e `e2.4` são PASS. A régua é explícita: achado de **guarda** (o teste que falta) é dívida
  rastreada e não bloqueia; achado de **defeito** (o comportamento errado) bloqueia. **Zero HIGH e
  zero CRITICAL em todo o histórico** — nenhum gate reprovou uma story.
- **Três gates existem só como seção `## QA Results` da story, sem YAML** (`debt.4`, `debt.6`,
  `debt.7` — este último com veredito PASS e fechamento de épico). O conteúdo é do mesmo padrão; o
  artefato separado é que falta. **[convenção observada, não formalizada]** — nada obriga o YAML, e
  `.claude/rules/story-lifecycle.md` descreve a estrutura do gate sem exigir arquivo próprio.

---

## 11. Glossário técnico

Só termos de **engenharia**. Termos de jogo (ativa, passiva, ult, draft, trilha, ring-out) estão no
glossário do GDD §13. Para o **conteúdo** de cada decisão `D-nn`, requisito `RF-nn` ou risco, a
autoridade é o PRD — aqui está só o que a sigla significa e onde procurar.

### 11.1 Tipos e artefatos de código

| Termo | O que é | Onde |
|---|---|---|
| **`AimSpec`** | Descrição **estática** da geometria que um slot entrega, como dado em vez de código. Vocabulário fechado de 5 formas. Descreve forma, **nunca dano** | `sim/types.ts:229-239` |
| **`Aim`** | A mira **resolvida** de um cast em runtime. Não confundir com `AimSpec` | `sim/types.ts:192-199` |
| **`BonusBlock`** | `Record<StatKey, number>` de **frações aditivas**; 0 é neutro, `+0.25` é "+25%". Duas instâncias por bola: `bonusPassive` (zerado por tick) e `bonusItem` (congelado na rodada) | `sim/stats.ts:23` |
| **`StatBlock`** | `Record<StatKey, number>` de **valores absolutos**, na unidade do campo. `base` e `stat` | `sim/stats.ts:22` |
| **`ClampCounters`** | Contadores de quantas vezes cada teto **mordeu**, por campo e por tabela. `observing: false` por padrão | `sim/stats.ts:100-122` |
| **`contactWindows`** | Campo do `CharDef` que declara as janelas de dano por contato. Ausência = o personagem nunca causa dano por contato | `sim/types.ts:312` |
| **`ContactState`** | Estado runtime de uma janela aberta numa bola. `lastHitAt` é único, não por alvo | `sim/types.ts:36-40` |
| **`deriveSeed(seed, streamId)`** | Deriva seeds descorrelacionadas de uma seed-mãe (Weyl + `lowbias32`). Mora em `sim/` porque a direção permitida é `bot → sim` | `sim/rng.ts:46` |
| **golden hash** | Tabelas de hash/ticks/vencedor congelados que travam o comportamento do jogo. Não é autoconsistência | `tools/determinism.ts:78-116` |
| **`PickSetup`** | O que entra numa bola: personagem, build e `itemBonus` já agregado. É a fronteira que preserva a pureza de `sim/` — a simulação recebe um bloco de números, nunca um conceito de "item" | `sim/world.ts:48-54` |
| **`RoundDriver`** | **Fábrica** que recebe o `RoundSetup` e devolve o `TickDriver`. É fábrica porque o bot tem estado por time que nasce uma vez por partida | `tools/harness.ts:53` |
| **`RoundSetup`** | `{ seed, arena?, teams }` — uma **rodada isolada**. Não sabe que é a terceira de cinco | `sim/world.ts:56-60` |
| **`SimCtx`** | Superfície que os personagens usam. Personagens **nunca** tocam o `World` direto | `sim/types.ts:322-359` |
| **`StatKey`** | Uma das 14 chaves de `STAT_KEYS` | `sim/stats.ts:13-21` |
| **`TickDriver`** | `(view: WorldView) => Command[]` — comandos de um tick, dos dois times, já na ordem de consumo | `tools/harness.ts:34` |
| **`WorldView`** | `Omit<World, 'rng'>`. Oculta o PRNG da simulação **por tipo**. `Omit` é raso — ressalva registrada | `sim/types.ts:178` |
| **`world.phase`** | Fase corrente do pipeline do tick. Camada 2 de auditoria do Pilar 3 | `sim/types.ts:165` |

### 11.2 Conceitos de processo e medição

| Termo | O que é |
|---|---|
| **protocolo A/B** | Mesma composição dos dois lados, pacote aplicado a **um** personagem de **um** lado, troca de lado no meio das seeds. Serve P2.2, P2.3 e Risco #1b com o mesmo mecanismo |
| **teste de replay** | Gravar `Command[]` da execução com bot, recriar o mundo com a mesma seed, reproduzir só os comandos, exigir hash idêntico. É P4.3 antecipado dois épicos |
| **teste negativo** | Perturbar deliberadamente e confirmar que o teste **acusa**. Sem isso, um teste verde não distingue "funciona" de "não olha" |
| **contador morto** | Instrumentação quebrada cuja saída é indistinguível da saída verdadeira quando esta é zero. Motivo de existirem 15+ autotestes permanentes |
| **veredito de 3 estados** | `✓ dentro` / `✗ fora` / `? inconclusivo`. O terceiro não é aprovação |
| **piso de `n` vs `n` de portão** | RF-48 pede `n ≥ 800` (piso estatístico). A execução de portão usa `n ≥ 2000`. Ver §6.4 |
| **viés de lado** | Vantagem estrutural do time 0, causada pela ordem de resolução do combate. Ver §6.5 |
| **utilização de kit** | Casts de ativa e ult por rodada, e % de rodadas sem ult, por personagem. Detector precoce de viés de competência do bot |
| **mordida de clamp** | O valor **bruto** ter excedido o teto e sido cortado — não "o campo foi calculado" |

### 11.3 As siglas que aparecem em toda parte

| Prefixo | Significado | Onde está o conteúdo |
|---|---|---|
| **`D-nn`** | **D**ecisão de produto (D-01 a D-09), tomada pelo @pm/usuário | `docs/prd.md` §5 |
| **`RF-nn`** | **R**equisito **F**uncional numerado (RF-01 a RF-50), com a origem de cada um | `docs/prd.md` §3 |
| **`C-n`** | **C**onflito ou lacuna de arquitetura que bloqueava a Fase 3 (C1-C4) | `docs/prd.md` §4 |
| **`P{fase}.{n}`** | Critério de **p**ortão de fase (P2.1-P2.5, P3.1-P3.4, P4.x, P5.x) | `docs/prd.md` §2 |
| **`R-nn`** | **R**essalva de arquitetura devolvida ao @pm/usuário para decidir | §8 de `architecture.md`, §9 de `-e2`, §14 de `-e3` |
| **`A-nn`** | Item do **A**nexo B (checklist de portão) de um documento de arquitetura | Anexo B de cada documento |
| **`N-n`** | Invariante de determinismo específica do bot (N-1 a N-4) | `architecture-e2.md` §3.3, `bot/heuristic.ts:18-27` |
| **`M-1`** | Invariante de partida: o `BotState` nasce e morre com a rodada | `architecture-e3.md` §2.5 |
| **`T-n`** | Critério de aceite da story que move o golden hash (T-1 a T-4) | `architecture-e3.md` §9.2 |
| **`#n`** | Indicador de risco aprovado (Risco #1, #1b, #2, #2b, #3, #4, #5, #6, #7) | `docs/prd.md` §6 |
| **`QA-nnn` / `QA-Ennn`** | Achado de gate de QA. Prefixos por categoria: `REL-` (reliability), `ARCH-` (architecture), `MNT-` (maintainability), `PERF-`, `BOT-` | `docs/qa/gates/*.yml` |
| **`debt.n` / `e2.n` / `e3.n`** | Story id. `debt.*` = épico de dívida de arquitetura; `e2.*` = arnês; `e3.*` = Fase 3 | `docs/stories/` |

---

## 12. Dívida técnica conhecida e rastreada

Consolidada por **tema**, não repetindo a lista dos gates. Tudo aqui atravessou pelo menos um gate
e **está aberto**. Nenhum item bloqueou o portão de E2; um bloqueia uma story específica da Fase 3.

### 12.1 Guardas que faltam — a classe que reapareceu quatro vezes

O padrão está descrito na §8.7: a unidade é testada, a constante é testada, o ponto onde as duas se
encontram não é. Os que seguem abertos, declarados como não-pegos no §434-435 da story `e2.8`:

| ID | O que passa despercebido | Ação sugerida pelo gate |
|---|---|---|
| **QA-E27-001** | O **sinal** do delta do Risco #1b é decidido na ordem dos argumentos de `deltaPp`; trocá-los roda limpo e imprime tabela plausível. O sinal é o conteúdo inteiro do indicador | Asserir `Math.sign(deltaPp) === Math.sign(w_trat − w_ctrl)` no ponto de **consumo** |
| **QA-E28-001** | Comportamento que só existe com `observing: true` atravessa golden hash, build coverage, os 15 ensaios e a paridade nas 5 seeds — **porque nas seeds do baseline nenhum clamp morde** | Um 16º ensaio: para uma bola em que o clamp **morde**, `recomputeStats` com `observing` on e off tem de dar `stat` idêntico campo a campo |
| **QA-E28-002** | Os 15 ensaios chamam `resetClampCounters` direto; quem o AC 6 governa é `medir`, e sobre `medir` não há asserção. Denominador acumulando entre contextos passa calado | Um ensaio que chame `medir` duas vezes com a mesma carga e assira que o segundo retrato é igual ao primeiro — **e não a soma** |
| **QA-E27-002** | A guarda de divergência dos controles é só de console; o `--json` não a expõe. Um consumidor de máquina lê `gatilho: true` como se a medição fosse válida | `controlesDivergiram: boolean` no `--json`, e `gatilho: null` com `gatilhoNaoAvaliavel` quando divergirem |

### 12.2 REL-001 — bloqueia o item de HP

**`b.hp = def.maxHp`** (`world.ts:116`) é lido antes de `recomputeStats` existir, então uma bola com
item de vida nasce com `hp` de linha-base e `maxHp` inflado.

**Não é "a bola nasce ferida": é o item mudando de sinal.** Cinco leitores usam a **fração**
`hp / stat.maxHp` como gatilho — `world.ts:216` (`weakestEnemy`), `vex.ts:41`, `vex.ts:98`,
`vex.ts:108`, `golem.ts:111`. Medido em `architecture-e3.md` §1.3:

| Alvo | Bônus | Δ winrate **com o bug** | Δ **com `hp = stat.maxHp`** |
|---|---|---|---|
| vex | +20% maxHp | **−1,80pp** | +13,72pp |
| vex | +50% maxHp | **−18,86pp** | +31,97pp |
| vex | +100% maxHp | **−29,39pp** | +41,04pp |

Um item de vida comprado num Vex faz o jogador **perder mais rodadas** do que se não tivesse
comprado nada, e quanto mais caro o item, pior.

**Estado:** story `e3.0` está `Ready`, é o **passo 0** da Fase 3, e a correção é **hash-neutra hoje**
— medido nas 5 seeds do baseline, porque nenhum personagem do roster declara bônus de `maxHp` e
`stat.maxHp === base.maxHp === def.maxHp` para todo o roster. **Pré-requisito bloqueante da Couraça**
e de qualquer item ou mutação de `maxHp`: se a loja entrar primeiro, existe uma janela em que a
Couraça está no catálogo com o sinal invertido, e qualquer medição feita nessa janela é lixo.

### 12.3 Cobertura de auditoria do Pilar 3 — duas lacunas

Descritas na §4.4. Resumo: **dano via `Effect` de 1 tick atravessa a Camada 2** (QA-001, gate de
`debt.6`) e **`openContactWindow` com `source` inválido falha em silêncio** (QA-002, mesmo gate).
Nenhuma é regressão — nenhum personagem do roster as alcança — mas nenhuma das 3 camadas as cobre.
Fechar é auditoria de roster em escala, Fase 5/6.

### 12.4 Portabilidade numérica — o vetor 2 segue integralmente sem pagar

`Math.hypot`, `Math.pow`, `Math.atan2`, `cos`, `sin` **não são bit-exatos entre engines** (V8 × JSC
× SpiderMonkey). `Math.sqrt` é IEEE-exato. `architecture.md` §7.2 recomenda trocar
`Math.hypot(a,b)` por `Math.sqrt(a*a+b*b)` em `sim/` **antes da Fase 4**, quando o mesmo código
passar a rodar em Node e Chrome simultaneamente.

**Medido nesta sessão: `sim/` tem 17 chamadas de `Math.hypot`** — 16 em `world.ts`, 1 em
`physics.ts:94` — mais `Math.pow` (`physics.ts:89`) e `Math.atan2` (`physics.ts:95`). Zero foram
migradas.

`bot/` respeita N-4 e usa `Math.sqrt` (`heuristic.ts:576-581`), com duas exceções declaradas
(`cos`/`sin` da rotação de jitter, `log`/`pow` da velocidade do dash). Ou seja: **a disciplina existe
em `bot/`, onde é atenuante, e não existe em `sim/`, onde é crítica.** Hoje é inofensivo porque só
uma engine roda por vez.

### 12.5 `Omit` é raso

`view.balls[0].hp` continua mutável (`sim/types.ts:172-176`). Decisão registrada: começar com `Omit`
+ o teste de replay (que pega a violação em runtime, por divergência de hash) e endurecer para
`DeepReadonly` só sob caso real. Nenhum caso real apareceu em 25 stories.

Nota de honestidade herdada do gate de `debt.7` (QA-002): **o teste de replay tem poder discriminante
prospectivo.** Provado com matriz 2×2 completa — vazamento de `world.rng` **sozinho não é detectado
hoje**, porque nada consome `world.rng` depois de `createWorld`. Ele passa a carregar peso sozinho
quando o primeiro personagem consumir `ctx.rand`. Não há nada a fazer antes disso, e um leitor futuro
pode superestimar a proteção.

### 12.6 Leitura de indicador — os limiares são finos perto da incerteza

| ID | O problema |
|---|---|
| **QA-E27-004** | O rodapé sobre limiares finos nomeia o IC de **cada winrate** (±3,46pp a n=800), mas o que é comparado contra o limiar é o **delta**, e o CLI nunca imprime o intervalo do delta |
| **QA-E27-003** | Arredondamento do delta a 2 casas resolve a borda de float, mas **desloca** o não-determinismo do limiar inteiro para o meio-centavo. A n=800 a granularidade é 0,125pp; a n=20000 um delta verdadeiro de +1,995pp arredonda para 2,00 e **inverte o gatilho**. Recomendação: decidir o gatilho no domínio inteiro (`100·(v_trat − v_ctrl) < 2·n`), exato em qualquer `n` |
| **QA-E28-003** | O terceiro estado de §7.3 ("clamp que morde SEMPRE") é praticamente inalcançável no denominador escolhido: `chamadas` conta **todas** as bolas, e no protocolo A/B só 1 de 4 carrega a mutação, então o teto observável é ~25-27% |
| **QA-E28-004** | "nenhum, de 46 contadores" lê como "nenhum teto do jogo mordeu", mas há tetos **fora** dos 46 — `MIN_ABILITY_CD_MS` e `MAX_SLOW`. Não é buraco: `MIN_ABILITY_CD_MS` é coberto pela auditoria A2 do roster. Falta a legenda dizer isso |
| **QA-E26-004** | O gatilho de +2pp do Risco #1b **não é decidível a n=800** — o IC do delta é maior que a distância ao limiar. Achado empírico do gate de `e2.7`: o gatilho do Golem **inverte de NÃO para SIM** na base de seed 3001 com o mesmo n=800 |

**A regra operacional que sai daí:** qualquer leitura de Risco #1b deve usar `n` **bem acima** do
piso de RF-48.

### 12.7 Validação de entrada do CLI

| ID | O problema |
|---|---|
| **QA-E26-002** | `--mutacao=vex:dmg:1e-400` é aceito: `Number('1e-400')` é `0`, finito, aprovado nas duas checagens. Um "mutante" que o operador acredita ter injetado e que não existe, lido como "mutante não detectado". Mitigado parcialmente pelo rótulo `dmg +0.00` |
| **QA-E25-005** | `--comp` não valida **tamanho**. `--comp=golem` (1v1) e `--comp=golem,vex,golem` (3v3) rodam e imprimem tabela para um modo de jogo que não existe. O próprio CLI enuncia o princípio contrário ao rejeitar `--pacote` |
| **QA-E25-004** | A guarda da auditoria de roster é **fail-open** se `process.exit` não existir, ao contrário de `falhar()`, que tem `throw` depois. Inalcançável sob `node`; é incoerência, não bug |
| **QA-E25-003** | Cobertura assimétrica das bordas de 45–55%: a borda inferior está pinada, a superior (`w = 0.55` exato) não — o comportamento real está correto, só não está fixado |

### 12.8 Documental e cosmético

| ID | O problema |
|---|---|
| **MNT-001** (recorrente desde `debt.0`) | Segunda fonte de verdade em documentação: o mesmo número escrito em dois lugares que podem divergir. Citado em 8 stories como o pecado a evitar |
| **QA-E25-007 / ARCH-002** | A tabela de auditoria imprime `140–280` para o dash do Golem, enquanto a janela de contato acaba por volta de 247 px — o auditor humano lê uma faixa ~12% mais larga que a que causa dano |
| — | `src/sim/index.ts` é barril morto e incompleto (§1.3). Não é citado por nenhum documento |
| — | 14 vs "15" campos de stat (§13.1) |

### 12.9 Dívida de fase anterior e ambiguidades de portão abertas

| Item | Estado |
|---|---|
| **RF-36 nunca foi instrumentado** | O indicador do Risco #4 (P1.3: % de rodadas com uma só mão, taxa de cast desperdiçado) foi aprovado com a instrução "instrumentar **junto com** a Fase 1". Verificado: **não existe telemetria nenhuma em `src/client/`**. A Fase 1 passou por julgamento humano sem essa evidência. Proposta não bloqueante: entra de carona no substrato de telemetria da Fase 3 (`architecture-e3.md` §14/R-07, resolução do usuário: entra) |
| **R-03 — o que "28 confrontos" significa** | Quatro leituras possíveis, com **30× de diferença** em tempo de execução (21 min a 10,4 h). Não bloqueia a Fase 2 — o CLI nasce com gerador de plano plugável. Precisa estar decidido **antes de P5.1 ser cobrado** |
| **R-04 — agregação do gatilho do Risco #1b** | Os deltas **invertem entre personagens** (físico rende mais no Golem, dano muito mais no Vex). Um gatilho global agregaria dois efeitos de sinais opostos numa média que não descreve nenhum. Resolução do usuário de 2026-07-28: **adiada para a Fase 5**, com dados do roster de 8 |
| **R-05 — morte súbita é código morto?** | 0,0% de rodadas atingiram 60 s em **todas** as configurações medidas, inclusive `maxHp × 3,0` (mediana 37,4 s, p90 42,7 s). O gatilho do Risco #6 dispara. Decisão adiada para depois de medir com humano no controle (P3.2) |
| **Correção real do viés de lado** | Saídas (c) resolução simultânea de dano e (d) ordem derivada da seed **movem o hash**. A saída (b) — alternar o lado do jogador por rodada — foi aprovada como mitigação. A correção de verdade fica para quando a Fase 4 exigir |
| **C4 — três tetos de duração de rodada** | `SUDDEN_DEATH_MS = 60_000` (arena encolhe), `MAX_ROUND_MS = 150_000` (empate duro, `world.ts:31`), `MAX_ROUND_TICKS = 60 × 180` = 180 s (rede do laço, `harness.ts:20`). Só o do meio dispara na prática; os outros dois são redes. Registrado no PRD §4 como conflito documental C4, não reaberto |

---

## 13. Inconsistências registradas entre documentos e código

**Registradas, não corrigidas.** Cada uma é verificável pela linha citada. A autoridade sobre
resolvê-las é do dono do documento — na maioria dos casos, o @architect.

### 13.1 "15 campos" vs 14 chaves em `STAT_KEYS`

`architecture.md` cita **15** em quatro pontos de prosa: §0 ("15 campos com número escrito"), §7.1
("15 stats × 4 bolas × 60 Hz = 3 600 recálculos por segundo"), §8/R-01 ("vale literalmente para os
15 campos") e Anexo B, item A-9 ("Todos os 15 tetos existem como constante nomeada").

As duas listas **enumeráveis** do próprio documento (§1.3 e §1.4) têm **14** cada, e o código tem 14
(`sim/stats.ts:13-19`). Já registrado em `stats.ts:8-11` como pendência de reconciliação do
@architect, confirmado pelo @po no gate de `debt.1`.

Consequência aritmética: §7.1 diz 3 600 recálculos de campo por segundo; o número real é
14 × 4 × 60 = **3 360**. Não muda nenhuma conclusão (a ordem de grandeza é a mesma), mas o número
está errado.

### 13.2 A-9 não é literalmente verdadeiro: dois tetos declarados não existem como constante

`architecture.md` §1.4 declara teto para `range` ("alcance efetivo ≤ 324 px") e para `atkSpeed`
("cd efetivo ≥ 120 ms"). **Nenhum dos dois existe no código:** `world.ts:465` é multiplicação pura
(`def.atk.range * b.stat.range`) e `world.ts:482` é divisão pura (`def.atk.cd / b.stat.atkSpeed`).

O gate de `e2.8` (QA-E28-004) verificou que isso **não** é buraco desguarnecido — o Σ os cobre por
inteiro hoje. Mas o item A-9 do Anexo B, como está escrito, não passa.

### 13.3 `ABS_MAX.maxSpeed` é inalcançável, e `architecture-e3.md` §7.2 afirma o contrário

`architecture-e3.md` §7.2 diz, sobre a Turbina: *"teto `ABS_MAX.maxSpeed = 420` morde antes de
`ΣMAX` para o Vex a partir de +68%"*.

**A ordem está invertida.** `SIGMA_MAX.maxSpeed = 0.6` (`stats.ts:51`), então o máximo alcançável
por bônus para o Vex é `250 × 1.6 = 400`, abaixo de `ABS_MAX = 420` (`stats.ts:67`). Para chegar a
+68% seria preciso **passar** por ΣMAX, que clampa antes. Portanto, com o roster de hoje,
`ABS_MAX.maxSpeed` **nunca morde por bônus de item** — e `architecture.md` §1.4 diz o correto na
mesma linha do teto ("Vex 250×1.6 = 400 ✓").

Consequência prática para quem escrever o catálogo: a armadilha de UI que §7.2 alerta (o jogador
paga por um bônus que não recebe) existe para a Turbina, mas o teto que morde é **ΣMAX**, não
`ABS_MAX`.

### 13.4 O bot: três pontos onde o código evoluiu além do documento

Todos os três são **melhorias documentadas no código** e não regressões — mas
`architecture-e2.md` §2.3 e §2.7 não foram atualizados, e uma sessão nova que os leia como
especificação vai divergir do que está implementado.

| # | O documento diz | O código faz | Por quê |
|---|---|---|---|
| a | `EstadoBola` = `{ proximaDecisaoTick, prontoDesde }` (§2.7) | `{ proximaDecisaoTick, prontoDesdeUlt }` (`heuristic.ts:90-95`) | Um campo só não serve a ativa e ult, que ficam prontas em instantes diferentes. O instante da ativa **já é observável e exato** no `WorldView` (`self.abilityReadyAt`), então copiá-lo criaria a divergência que o projeto já pagou duas vezes. Só a ult precisa de memória. Should-Fix do @po no gate de `e2.1` |
| b | `tImpacto = d / S.speed` para `raio` **e** `dash` (§2.3) | `dash` usa a média da lei que o motor roda: `v̄ = v0·(1 − drag^T)/(T·−ln drag)` (`heuristic.ts:442-456`) | ARCH-001, gate de `e2.2`: o corpo do caster sofre `drag`, o projétil não. Usar o número cru daria +64% de erro no dash e nenhum no `raio` — **assimetria** entre personagens, que é o confundidor pelo qual a opção C de §2.2 foi rejeitada |
| c | `erroAlcance = |dPrev − alcanceEf|` (§2.3) | `erroMira = dist(pontoDeImpacto, posiçãoPrevista(e))` (`heuristic.ts:386`) | §2.4 soma `pAcerto` sobre **todos** os inimigos, e `erroAlcance` só está definido para o mirado. `erroMira` **reduz-se** exatamente a `erroAlcance` para o inimigo mirado, e generaliza para os demais. Sem isso o somatório de §2.4 não estaria definido |

### 13.5 Dois números circulando para o resultado de P2.2

`architecture-e2.md` Anexo B, linha de P2.2: **79,63% ±3,46 a n=800**.
`docs/prd.md` §2 e GDD §9: **79,00% ±1,79** (que corresponde a n = 3000).

Não são contraditórios — são o mesmo teste em `n` diferente, e o segundo é a **execução oficial do
portão**, com o `n` que o próprio Anexo B passou a recomendar. Mas as duas cifras circulam sem que
o Anexo B diga qual é a de portão, e ele é o documento que um auditor consultaria primeiro.

Nota de forma no mesmo lugar: a nota de execução do portão foi inserida **entre duas linhas da
tabela** do Anexo B (linha 1011 de `architecture-e2.md`), o que quebra a renderização da tabela
markdown a partir dali.

### 13.6 Divergências cosméticas de pipeline

`architecture.md` §1.5 desenha `zeroBonus` e a soma do bônus declarativo da passiva **sob**
`phase = 'tick'`. O código atribui `world.phase = 'tick'` **depois** dessas duas operações
(`world.ts:619-622`). Behaviorally irrelevante hoje — nada lê `phase` naquele intervalo — e
registrado só para que ninguém "corrija" um dos dois lados achando que encontrou um bug.

### 13.7 O que os documentos de arquitetura **não** contradizem, e é bom dizer

Verificado item a item nesta sessão, para que a §13 não seja lida como lista de problemas maior do
que é:

- A fórmula de D-04 em `stats.ts:192-214` é literal contra `architecture.md` §1.2.
- Os 14 valores de `SIGMA_MIN`/`SIGMA_MAX` e os 18 de `ABS_MIN`/`ABS_MAX` batem a tabela de §1.4,
  campo por campo.
- `MIN_ABILITY_CD_MS = 500`, com a correção de 400 registrada nos dois lados.
- A regra de combinação de restituição é `Math.max`, como §2.2 recomenda, com o argumento nos dois
  lados.
- `PRESET_ARNES` bate os 11 valores de `architecture-e2.md` §2.6, um a um.
- A tabela de streams de `sim/rng.ts:33-38` bate §5.1 de `architecture.md`, e a extensão de
  `architecture-e3.md` §2.5 (5, 6, 8+i) não conflita — a derivação é *por seed*.
- O roster declara `aim` nos 6 slots com os valores exatos da tabela de `architecture-e2.md` §2.2.
- `architecture-e3.md` §7.5 afirma que a loja não reabre D-04, e a leitura de `stats.ts` confirma:
  a loja só popula `itemBonus`, e o clamp é o mesmo de qualquer bônus.
- `architecture.md` §1.3 admite `src/shop/` **ou** `chars/items.ts` para o catálogo;
  `architecture-e3.md` §7.1 fecha em `src/shop/`. O documento posterior é a autoridade — não é
  contradição, é decisão tomada depois.

---

## Anexo — Onde procurar o detalhe completo

| Você quer | Vá para |
|---|---|
| Visão, mecânicas, personagens, economia como **design** | `docs/GDD.md` |
| As 15 decisões travadas, com o trade-off de cada uma | `DESIGN.md` §1-§9 |
| Os 50 requisitos funcionais, com a origem de cada um | `docs/prd.md` §3 |
| As 9 decisões de produto D-01 a D-09 | `docs/prd.md` §5 |
| O critério **exato** de cada portão de fase | `docs/prd.md` §2 |
| Os 7 indicadores de risco, com gatilho e fase | `docs/prd.md` §6 |
| A camada de stats, os tetos com justificativa numérica, o Pilar 3, o plano de 8 passos | `docs/architecture.md` |
| O bot, o arnês, o protocolo A/B, o viés de lado | `docs/architecture-e2.md` |
| A partida: draft, builds, Bo5, economia, loja, telemetria | `docs/architecture-e3.md` |
| O estado e a evidência de cada AC de cada story | `docs/qa/gates/*.yml` |
| Como rodar o jogo, o arnês e o CLI | `README.md` |
| Ciclo de vida de story, matriz de autoridade de agente, workflows | `.claude/rules/` |

---

*Documento de engenharia. Reflete o estado de `src/` em 2026-07-29, com `npm run check` e
`npm run sim:check` verdes e o golden hash das 5 seeds idêntico ao baseline de `debt.0`. Quando o
código mudar, este documento fica errado — atualize-o na mesma story, ou registre a divergência na
§13.*
