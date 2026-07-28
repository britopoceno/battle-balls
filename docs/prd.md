# Battle Balls — PRD

> Escrito **a partir** de `DESIGN.md` v1 (decisões travadas) e `docs/brief.md` (medições e
> contradições verificadas). Não reabre decisão. Onde o brief e o `DESIGN.md` divergem, o
> conflito está **sinalizado**, não resolvido.
> Data: 2026-07-28 · Fase corrente: 0 (construída, **portão pendente**).

---

## 1. Visão e escopo

PvP 2v2 síncrono, web, mobile-first, paisagem. Arena fechada de física de bolas. O jogador
**não pilota** as bolas: cada personagem tem IA de movimento autoral e ataque básico
automático. A decisão do jogador está no draft (1 ativa de 2 + 1 passiva de 2 = 4 builds
por personagem), na loja entre rodadas, e na execução — mirar ativa e ult com dois
polegares, um por bola. Colisão desloca, não machuca: empurrar o inimigo para fora do
alcance dele é a forma de negar o DPS dele. Partida em Bo5 com renda igual entre rodadas.

**Dentro do escopo (Fases 0 a 5):** simulação determinística, roster de 8 personagens,
draft snake aberto + builds secretas, Bo5 com loja e economia, input de dois polegares em
celular, servidor autoritativo com sala por link, bot heurístico com arnês de 10k lutas,
telemetria e ajuste por medição.

**Fora do escopo até a Fase 6 — não escrever requisito, não estimar, não prototipar:**
meta-progressão fora da partida, ranked, desbloqueio de personagens, monetização, direção
de arte, som, nome definitivo do jogo, e o 9º personagem (travado por regra: só existe
quando os 8 estiverem em 45–55%).

**Fora do escopo permanentemente (registrado para não voltar por engano):** servidor
pré-computar a batalha e enviar replay (`DESIGN.md` §5 — morreu quando entrou input ao
vivo); rollback/resimulação no netcode; ring-out; dano por colisão passiva.

---

## 2. Épicos por fase

Ordem e portões seguem `DESIGN.md` §9. **Regra do método (decisão travada #15): não se
avança sem passar o portão.** Cada épico traz seu pré-requisito bloqueante quando existe.

Indicador de escopo aplicável a todos (Risco #3, `[PROPOSTO]`): dias de calendário da fase
÷ estimativa do `DESIGN.md`. Acima de **2x** → reabrir corte de escopo; o corte natural é
roster 8 → 4-5, já que a "regra do 9º" prova que o roster é elástico por design.

---

### E0 — Núcleo *(construído)*

**Objetivo.** Responder: *mirar habilidades em bolas que andam sozinhas é divertido?*

**Escopo entregue.** `sim/` pura (60Hz, PRNG com seed, sem DOM), Golem e Vex, render Canvas
2D, mira por arrasto, arnês de determinismo. Estado medido em `README.md` e reproduzido no
brief §3: determinismo 40/40 seeds; espelho 19-14-7; mediana de rodada 13,8s; `tsc` e build
de produção passam; render e mira verificados no Chrome desktop em paisagem.

**Portão — JULGAMENTO HUMANO. Não há métrica automática e não deve haver.** O `DESIGN.md`
posiciona esta como a pergunta que valida ou invalida as outras 60 decisões; só o usuário
jogando responde. Qualquer número que este PRD inventasse aqui seria métrica falsa.

**Estado: PENDENTE.** O jogo roda e responde. Falta o usuário jogar — de preferência em
**celular real**, porque a pergunta é sobre polegar, não sobre mouse. O acesso pela rede
local falha por interferência entre roteador e aparelho (não é defeito de código; brief §3);
contornar por hotspot do computador ou outra rede.

> ⛔ **Nenhum trabalho da Fase 1 em diante começa antes deste portão ser dado pelo usuário.**
> Este PRD planeja as fases seguintes; não as autoriza.

---

### E1 — Sensação *(estimativa DESIGN.md: 1 semana)*

**Objetivo.** Descobrir se o input de dois polegares — a decisão travada que justifica todo
o modelo 2v2 — funciona na mão, em aparelho real.

**Escopo.** Layout mobile paisagem definitivo; 4 botões semitransparentes (esquerda = bola 1,
direita = bola 2); mira por arrasto com direção e distância; ajuste de zona morta, tamanho
de alvo de toque e leitura simultânea de dois ponteiros; instrumentação do Risco #4.
**Cobre RF-30 a RF-36.**

**Portão — JULGAMENTO HUMANO:** *os dois polegares funcionam sem atrapalhar um ao outro?*
Não existe métrica que substitua isso. O que existe são **duas pré-condições verificáveis**
sem as quais o julgamento não pode ser dado, e **evidência instrumentada** que informa o
julgamento sem decidi-lo:

| | Item | Tipo |
|---|---|---|
| P1.1 | O jogo carregou e foi jogado em **celular real**, em paisagem, por pelo menos uma partida completa | Pré-condição binária |
| P1.2 | **Smoke visual próprio no dispositivo** — seleção de build, arena, física, HUD, cooldown, arrasto nas duas mãos, fim de rodada, sem erro de console | Pré-condição binária |
| P1.3 | % de rodadas em que o jogador usou **só uma** das duas mãos; taxa de cast desperdiçado (mira >45° do alvo ou em bola morta) | Evidência — indicador `[PROPOSTO]`, pendente de aprovação (§6) |

**P1.2 não é redundante com `npm run sim:check`.** O bug de TDZ do brief §3 derrubava o
módulo inteiro do cliente e o arnês headless não o veria: arnês prova a simulação, não prova
o cliente. Toda fase com entrega de cliente precisa de verificação visual própria.

**Plano B registrado (se o portão reprovar):** 1 bola pilotada + 1 automática. Isso
invalidaria a decisão travada #3 (2v2) e exigiria nova sessão de design — não é ajuste.

---

### E2 — Arnês *(estimativa: 1-2 semanas)*

**Objetivo.** Ter a capacidade de detectar um personagem quebrado **sem jogar**. É a
consequência direta da decisão #13: sem moeda comum de dano, balanceamento é medição.

**Escopo.** Bot heurístico simétrico (mira onde a chance de acerto é maior, casta acima de um
limiar de valor esperado, com jitter); CLI de N lutas × 28 confrontos → matriz de winrate com
alerta fora de 45–55%. **Cobre RF-43 a RF-48.**

**Pré-requisito de desenho (Risco #7, `[NOVO]`, decisão antes de escrever o bot):** o bot
deve receber **stream de PRNG próprio**, separado de `world.rng`. Se o jitter do bot sacar do
PRNG da simulação, "replay = seed + linha do tempo de inputs" (`DESIGN.md` §5) deixa de valer
entre versões do bot — e isso quebra a Fase 4 antes de ela existir. Ver D-08.

**Portão — VERIFICÁVEL. "O arnês existe" não é portão.**

| | Critério | Como se verifica |
|---|---|---|
| P2.1 | `npm run sim:check` verde: determinismo 40/40 seeds, hash FNV-1a idêntico em execução dupla | Comando |
| P2.2 | **Teste de mutante:** injetar um Vex com +30% de dano; o arnês reporta esse confronto **fora** de 45–55% | Execução do arnês. Falso negativo = **portão reprovado** |
| P2.3 | **Controle negativo:** com 0% de mutação, a mesma matriz permanece **dentro** de 45–55% | Evita aprovar um arnês que alerta sempre — *recomendação do PM, não do brief* |
| P2.4 | n por confronto **≥ 800** (poder 80% para distinguir 55% de 50%). O design pede 10k → ±1pp | Parâmetro do CLI |
| P2.5 | Determinismo preservado com o bot no loop: mesma seed + mesma versão de bot → mesmo hash | Comando |

**Medição adicional a fazer nesta fase (não é portão):** detecção precoce do Risco #1 —
delta de winrate de um pacote físico (+20% massa, −20% drag) vs um pacote de dano (+20% dmg)
contra a mesma linha-base. Gatilho: físico < +2pp e dano > +5pp → a trilha física nasce morta
e a Fase 3 precisa ser reprojetada antes de a loja existir. Indicador `[PROPOSTO]` (§6).

**Também nesta fase:** % de rodadas que atingem 60s (Risco #6). Hoje é 0 de 40, com max de
19,5s. Se seguir 0% após o ajuste de HP/dano, ou a morte súbita é código morto ou os números
de combate estão errados por um fator ~4.

---

### E3 — Loop *(estimativa: 2-3 semanas)*

**Objetivo.** A partida inteira, local, contra o bot: draft → builds secretas → Bo5 com loja.
É a primeira vez que a decisão econômica existe.

**Escopo.** **RF-01 a RF-07** (draft e builds), **RF-20 a RF-29** (Bo5, economia e loja),
telemetria local para os Riscos #1, #5 e #6.

> ⛔ **BLOQUEADO.** Esta fase **não pode começar** antes de:
> - **C2 e C3 resolvidos** pelo @architect (§4). Metade da loja não tem ponto de aplicação no
>   simulador e `mods` não compõe. Escrever a loja antes disso é escrever requisito
>   inimplementável.
> - **D-02 (regra de empate) fechada.** 17,5% das rodadas medidas caem nela e não há regra.
> - **D-03 (escopo do +alcance) e D-04 (ordem de aplicação de mods) fechadas.** Sem elas,
>   dois itens de dano são um problema de balanceamento indeterminado.

**Portão — JULGAMENTO HUMANO:** *dá vontade de jogar outra partida?* Acompanhado de evidência
instrumentada (todos `[PROPOSTO]`, §6), que informa o julgamento sem substituí-lo:

| | Evidência | Gatilho de alerta |
|---|---|---|
| P3.1 | Mediana da rodada **com humano no controle** | < 25s → o item não é sentido dentro da rodada e a loja perde função (Risco #5) |
| P3.2 | % de rodadas que atingem 60s (morte súbita) | 0% → morte súbita é código morto (Risco #6) |
| P3.3 | Distribuição de compra: trilha física vs trilha de combate | física < 35% → a física virou enfeite (Risco #1, indicador do próprio `DESIGN.md`) |
| P3.4 | Smoke visual no dispositivo, como em P1.2 | binário |

**Nota de método:** o ajuste de HP/dano para levar a mediana de 13,8s ao alvo é **decisão de
produto medida nesta fase**, não tuning técnico feito antes. O `README.md` deliberadamente
não ajustou — os números certos só aparecem com humano no controle. Respeitar isso.

---

### E4 — Rede *(estimativa: 2-3 semanas)*

**Objetivo.** Dois celulares jogando a mesma partida, com a simulação como fonte única de
verdade.

**Escopo.** **RF-37 a RF-42:** servidor Node autoritativo que importa `sim/`, input delay ~100ms,
sala por link, interpolação entre snapshots no cliente.

**Portão — JULGAMENTO HUMANO:** *1v1 entre dois celulares é fluido?* Com pré-condições
verificáveis:

| | Critério |
|---|---|
| P4.1 | `INPUT_DELAY_TICKS = 6` ativo (hoje é 0 — desvio consciente da Fase 0) |
| P4.2 | O cliente **não decide dano**: divergir o cliente artificialmente não altera o placar |
| P4.3 | Replay reconstrói a partida a partir de **seed + linha do tempo de inputs**, com hash idêntico ao da execução ao vivo (depende de D-08 ter sido decidido na Fase 2) |
| P4.4 | Smoke visual em **dois aparelhos**, como em P1.2 |

---

### E5 — Conteúdo *(estimativa: 6-8 semanas — a maior fatia do escopo somado)*

**Objetivo.** Roster de 8, loja completa, telemetria, e ajuste **por medição** até a matriz
fechar.

**Escopo.** 6 personagens novos (1 arquivo cada, compondo `fx.*`), os 8 itens, telemetria de
jogadores reais (winrate por personagem, por build e por item; taxa de pick; duração média).

**Portão — VERIFICÁVEL, e é o portão mais objetivo do projeto:**

| | Critério |
|---|---|
| P5.1 | **Matriz de winrate dos 28 confrontos fecha em 45–55%**, com n ≥ 800 por confronto (o design pede 10k → ±1pp) |
| P5.2 | Taxa de compra de itens da trilha física **≥ 35%** (Risco #1, indicador do `DESIGN.md`) |
| P5.3 | Trava do 9º personagem respeitada: nenhum personagem novo entra enquanto P5.1 não passar |

---

### E6 — Meta

Ranked, progressão, polimento, som, arte. **Fora do escopo deste PRD.** O `DESIGN.md` não
define portão para esta fase; ele será escrito quando E5 passar.

---

## 3. Requisitos funcionais

Numerados para referência em stories. Cada RF traz sua origem. Nenhum RF aqui é invenção do
PM — os que dependem de decisão pendente estão marcados com o ID da decisão (§5).

### 3.1 Draft e builds

| ID | Requisito | Origem |
|---|---|---|
| RF-01 | Draft **snake aberto**: personagens visíveis a ambos, ordem P1 → P2, P2 → P1 | DESIGN §4 / decisão #6 |
| RF-02 | **Sem bans.** Roster de 8 é pequeno demais para banir | decisão #6 |
| RF-03 | Após o draft, cada jogador escolhe **1 ativa de 2 + 1 passiva de 2** para cada um dos seus 2 personagens (4 builds por personagem) | DESIGN §2, §4 |
| RF-04 | A seleção de build é **simultânea e secreta**, com timer de 30s | decisão #6 |
| RF-05 | As builds são **reveladas na largada da rodada** | DESIGN §4 |
| RF-06 | Comportamento no estouro do timer de 30s | **pendente D-06** |
| RF-07 | Troca de build entre rodadas do Bo5 | **pendente D-01** |

### 3.2 Combate e simulação

| ID | Requisito | Origem |
|---|---|---|
| RF-08 | Arena 2D fechada, paredes sólidas com ricochete, **sem ring-out** | decisão #1 |
| RF-09 | Vitória da rodada = eliminar as 2 bolas inimigas (HP zerado) | DESIGN §2 |
| RF-10 | **Morte súbita aos 60s**: a arena encolhe, forçando o confronto | DESIGN §2 (`SUDDEN_DEATH_MS`, confere no código) |
| RF-11 | Teto duro de rodada declarando empate | código (`MAX_ROUND_MS = 150_000`) — **conflito C4, ver §4** |
| RF-12 | Cada personagem tem **IA de movimento autoral**; o jogador não dirige a bola | decisão #2 |
| RF-13 | **Ataque básico automático** por personagem, com cooldown, alcance e tipo (contato ou projétil), disparado pela IA | DESIGN §2 |
| RF-14 | Alcance é medido **superfície a superfície**, não centro-menos-raio-do-alvo | bug 1 do brief §3, corrigido |
| RF-15 | Projéteis usam **intercepção de 1ª ordem** (2 iterações). A correção preserva a intenção do design: empurrar o alvo continua fazendo o tiro errar | bug 2 do brief §3, corrigido |
| RF-16 | **Colisão passiva causa 0 dano** — só empurrão. Física é camada de controle | Pilar 3 / decisão #1 — **conflito C1, ver §4 e D-07** |
| RF-17 | Ult com **regra de carga variável por personagem** (`damageDealt`, `damageTaken`, `time`, `kills`, `casts`), exibindo o **ícone da condição** na barra | decisão #10 |
| RF-18 | A **unidade do `threshold` de ult** deve ser explícita no tipo, não implícita na regra de carga. Hoje o mesmo campo numérico significa dano acumulado, milissegundos ou contagem — funciona com 2 personagens, é fonte garantida de erro com 8 | brief §5b |
| RF-19 | Simulação **determinística**: tick fixo 60Hz, PRNG com seed, sem `Math.random` em `sim/`, `sim/` não importa de `chars/`, `bot/` nem `client/` (registro de personagens injetado em `createWorld`) | decisão #5 — invariante que sustenta servidor autoritativo, replay e arnês |

### 3.3 Economia e loja

| ID | Requisito | Origem |
|---|---|---|
| RF-20 | Partida em **Bo5**: primeiro a 3 vitórias de rodada | DESIGN §4 |
| RF-21 | **Regra de empate no Bo5** | **pendente D-02 — BLOQUEIA a Fase 3** |
| RF-22 | **Renda igual** para os dois jogadores por rodada (ex.: 4, 5, 6, 7, 8) | decisão #7 |
| RF-23 | **Juros sobre o ouro guardado**. Vencer a rodada **não** dá ouro — sem snowball: a 1ª vitória não compra a 2ª | decisão #7 |
| RF-24 | Loja entre rodadas, com **duas trilhas de 4 itens**: física (Chumbo +massa, Turbina +velocidade, Lixa −atrito, Borracha +elasticidade) e combate (Lâmina +dano, Couraça +HP, Luneta +alcance, Relicário −cooldown) | decisão #8 |
| RF-25 | **Borracha (+elasticidade)** e **Relicário (−cooldown)** precisam de ponto de aplicação no simulador | **BLOQUEADO por C2, ver §4** |
| RF-26 | **Luneta (+alcance)**: escopo do modificador | **pendente D-03** (hoje só ataque básico) |
| RF-27 | **Ordem de aplicação de mods de item** (aditivo / multiplicativo / composto) | **pendente D-04 — BLOQUEIA a Fase 3** |
| RF-28 | Mods de passiva e de item devem **compor**, não se sobrescrever | **BLOQUEADO por C3, ver §4** |
| RF-29 | Quantidade e preço dos itens; renda exata por rodada; taxa de juros | **pendente D-09** (não bloqueia antes da Fase 3) |

### 3.4 Input

| ID | Requisito | Origem |
|---|---|---|
| RF-30 | Mobile, **paisagem**, web | decisões #9, #11 |
| RF-31 | **4 botões semitransparentes**; a arena ocupa a maior parte da tela | DESIGN §3 |
| RF-32 | **Esquerda = bola 1, direita = bola 2.** Sem seleção prévia: as duas mãos miram simultaneamente | decisão #9 |
| RF-33 | Arrastar do botão define **direção E distância** (`mag` interpolando entre `minRange` e `maxRange`); soltar casta | decisão #9 |
| RF-34 | Mira aparece **imediatamente** na bola correspondente (feedback local), mesmo com o efeito saindo em ~100ms | DESIGN §5 |
| RF-35 | Atalhos de teclado (`Q W` / `O P`, `R`, espaço) são **ferramenta de desenvolvimento**, não requisito de produto | README |
| RF-36 | Instrumentação do Risco #4: % de rodadas com uma só mão; taxa de cast desperdiçado | **`[PROPOSTO]`, ver §6** — instrumentar **junto com** a Fase 1, não depois |

### 3.5 Netcode

| ID | Requisito | Origem |
|---|---|---|
| RF-37 | **Servidor autoritativo**: Node + WebSocket, importando `sim/`. Uma máquina define a verdade | decisão #4 |
| RF-38 | **Input delay ~100ms** (`INPUT_DELAY_TICKS = 6`). Sem rollback, sem ponto fixo, sem resimulação — funciona porque o input é discreto (só casts) | decisão #4 |
| RF-39 | Clientes **interpolam entre snapshots** do servidor | DESIGN §5 |
| RF-40 | **Sala por link** | decisão #3 |
| RF-41 | **Replay = seed + linha do tempo de inputs** | DESIGN §5 — depende de D-08 |
| RF-42 | Anti-cheat é consequência do modelo autoritativo, não subsistema próprio | decisão #4 |

### 3.6 Bot e arnês de balanceamento

| ID | Requisito | Origem |
|---|---|---|
| RF-43 | **Um único bot** serve a três usos: balanceamento, modo treino e oponente solo | decisão #14 |
| RF-44 | Bot heurístico: mira onde a chance de acerto é maior, casta quando o valor esperado passa um limiar, com **jitter** para imitar erro humano | DESIGN §6 |
| RF-45 | O bot joga **os dois lados**. Não precisa jogar *bem* — precisa jogar **igual nos dois lados**, porque assimetria é o que está sendo medido | DESIGN §6 |
| RF-46 | O bot consome **stream de PRNG próprio**, separado de `world.rng` | **pendente D-08 — decidir antes de escrever o bot** |
| RF-47 | CLI de balanceamento: N lutas × 28 confrontos → **matriz de winrate**, com alerta fora de **45–55%** | decisão #13 |
| RF-48 | n por confronto **≥ 800** (poder 80% para distinguir 55% de 50%); o design pede 10k → ±1pp. **40 seeds dão ±15pp e não servem para balancear** | brief §4, Risco #2b `[PROPOSTO]` |
| RF-49 | Telemetria de jogadores reais (peneira fina): winrate por personagem, por build e por item; taxa de pick; duração média da rodada | DESIGN §6 — Fase 5 |
| RF-50 | **Regra do 9º personagem:** nenhum personagem novo entra enquanto os 8 não estiverem em 45–55% | decisão #12 |

---

## 4. ⛔ Dívida de arquitetura que BLOQUEIA produto

**Isto não são requisitos de produto — é pré-requisito de épico.** A solução é do
**@architect**, não do PM. O que este PRD registra é: **a Fase 3 não pode começar antes.**

Origem: brief §5c, quatro contradições **lidas no código, com arquivo e linha** (confiança
alta). Duas bloqueiam a Fase 3.

### C2 — Metade da loja não tem onde encaixar no simulador *(BLOQUEIA E3)*

`Mods` é `{dmg, atkSpeed, range, speed, knockbackResist}` (`src/sim/types.ts:18-25`).
Cruzando com os 8 itens do `DESIGN.md` §4:

| Item | Ponto de aplicação | Status |
|---|---|---|
| Chumbo (+massa) | `Ball.mass` | ✓ |
| Turbina (+velocidade) | `mods.speed` | ✓ (mas ver C3) |
| Lixa (−atrito) | `Ball.drag` | ✓ |
| **Borracha (+elasticidade)** | — | ✗ **não existe.** Restituição é constante de módulo: `REST_BALL = 0.65` / `REST_WALL = 0.72` (`src/sim/physics.ts:4-5`), global, não por bola |
| Lâmina (+dano) | `mods.dmg` | ✓ |
| Couraça (+HP) | `Ball.maxHp` | ✓ |
| Luneta (+alcance) | `mods.range` | ◐ parcial — só ataque básico (`world.ts:344`) |
| **Relicário (−cooldown)** | — | ✗ **não existe** para habilidades: `self.abilityReadyAt = world.time + ab.cd` (`world.ts:316`), sem multiplicador. `mods.atkSpeed` cobre só o ataque básico (`world.ts:360`) |

**Impacto de produto:** 2 dos 8 itens são inimplementáveis e 1 é parcial. E a assimetria
importa: **a trilha física é a que perde o item mais distintivo** — elasticidade é a única
propriedade puramente física da lista. Isso empurra na direção do Risco #1 (a trilha de
combate matar a trilha física) **antes mesmo de a loja existir**.

### C3 — `mods` é escrito por atribuição absoluta, não por acumulação *(BLOQUEIA E3)*

`vex.ts:97` faz `self.mods.speed = self.hp/self.maxHp < 0.4 ? 1.25 : 1` **a cada tick**;
`golem.ts:95` faz `self.mods.knockbackResist = 0.6` no `init`. Hoje é inofensivo porque não
há itens.

**Na Fase 3, uma Turbina (+velocidade) comprada num Vex com a passiva Fantasma será
sobrescrita 60 vezes por segundo.** O jogador paga ouro por nada. É bloqueio de arquitetura,
não bug: `mods` precisa virar acumulador (base × passiva × item) **antes de o primeiro item
existir**. A resolução de C3 e a decisão D-04 (ordem de aplicação) são a mesma conversa.

### C1 — O Pilar 3 não é auditável *(não bloqueia; decisão de produto)*

`DESIGN.md` §2 e Pilar 3 afirmam "colisão causa 0 dano" em absoluto. Mas
`src/chars/golem.ts:134-144` (`on.collide`) causa **14 de dano** e knockback 520 durante a
janela de 450ms do dash Impacto Sísmico, com trava de 250ms entre acertos. **Já é falso com 2
personagens de 8.**

É defensável como exceção mediada por habilidade — mas escrito como está, nada impede que o
3º, 4º e 5º personagem "excepcionem" também, e o pilar deixa de servir de trava. **Decide-se
uma das duas, não as duas:** reformular o pilar, ou remover a exceção do Golem. Ver **D-07**.

### C4 — `MAX_ROUND_MS = 150_000` não está no `DESIGN.md` *(conflito documental)*

O design define morte súbita aos 60s e só. O código tem um teto duro de 150s que declara
empate (`world.ts:23,463`). Provavelmente correto como rede de segurança — mas é **regra de
partida não documentada**, e alimenta diretamente a lacuna de D-02 (empate no Bo5).
**Sinalizado, não resolvido:** conflito entre código e `DESIGN.md`, cabe ao usuário dizer se
o teto é regra de jogo ou salvaguarda de engenharia.

> **Verificações que NÃO revelaram divergência** (registrado para ninguém refazer): arena do
> cliente (`layout.ts` 960×540) idêntica à do arnês; `sim/` não importa de `chars/`, `bot/`
> nem `client/`; `Math.random` ausente de `sim/`; `SUDDEN_DEATH_MS = 60_000` bate com o
> design; ícones de carga de ult existem no tipo e são renderizados (`render.ts:366`).

---

## 5. Decisões de produto pendentes

Preciso que o usuário feche estas. Cada uma tem recomendação e risco declarado. **D-02, D-03
e D-04 bloqueiam a Fase 3.**

### D-01 — Build muda entre rodadas do Bo5? *(herdada de `DESIGN.md` §8)*

**Recomendação: SIM, com custo em ouro** — é a recomendação do próprio `DESIGN.md` e eu
concordo. Vira mais uma decisão econômica ("troco de ativa ou compro a Lâmina?") e reaproveita
a UI de draft que já existirá.
**Risco:** compete por ouro com a loja em um Bo5 que já tem só 4 compras (Risco #5). Se o
preço da troca ficar baixo, ela canibaliza a loja; se ficar alto, é feature morta. Mitigação:
tratar o preço da troca como parâmetro medido na Fase 3, junto com D-09.
**Impacto se SIM:** a UI de draft é reaproveitada na loja — economiza escopo na Fase 3.

### D-02 — Regra de empate no Bo5 ⛔ *bloqueia a Fase 3*

O código produz `winner = -1` e isso aconteceu em **7 de 40 rodadas (17,5%)** — todos duplo-KO
simultâneo. O `DESIGN.md` só define "primeiro a 3 vitórias". Empate conta para quem? Repete a
rodada? E o teto de 150s (C4) também declara empate, por caminho diferente.

**Recomendação, em duas partes:**
1. **Regra:** rodada empatada é **nula** — ninguém pontua, a economia avança normalmente
   (renda + juros), e a partida ganha um teto de **7 rodadas**. Se ao fim ninguém tiver 3
   vitórias, vence quem tiver mais; empatado em vitórias, a partida é empate.
   *Por quê:* preserva a decisão #7 (vencer não dá ouro, sem snowball) e não premia o
   duplo-KO como estratégia. Alternativa "ambos pontuam" quebra a aritmética do Bo5;
   alternativa "repete a rodada" pode não terminar.
2. **Antes de fixar o número, re-medir.** O `README.md` avalia que os 7 empates são artefato
   de times **perfeitamente espelhados** e devem sumir com personagens diferentes. Medir a
   incidência de empate na Fase 2, com roster heterogêneo. Se cair para ~0%, a regra é
   salvaguarda barata; se seguir alta, é regra de jogo com peso e merece desenho próprio.

**Risco de não decidir:** a Fase 3 constrói o placar do Bo5. Sem regra, o placar é
indefinido em 1 de cada 6 rodadas.

### D-03 — Escopo do +alcance (Luneta) ⛔ *bloqueia a Fase 3*

Hoje `mods.range` afeta **só o ataque básico** (`world.ts:344`); `minRange`/`maxRange` de
habilidade e ult não recebem modificador.

**Recomendação: só o ataque básico na v1.** Mantém um único ponto de aplicação, e mexer no
alcance de habilidade altera simultaneamente a **UX do arrasto** (a distância que o polegar
puxa muda de significado) e o balanceamento — duas variáveis num item só.
**Risco:** a Luneta fica fraca para personagens cujo dano principal vem da ativa, o que
distorce a taxa de pick de item. Mitigação: preço menor, e revisão na Fase 5 com a telemetria
de winrate-por-item (RF-49).

### D-04 — Ordem de aplicação de mods de item ⛔ *bloqueia a Fase 3*

Aditivo, multiplicativo ou multiplicativo composto? Sem essa regra, **dois itens de dano são
um problema de balanceamento indeterminado**. É a mesma conversa de C3.

**Recomendação: bônus somam entre si, e o total multiplica a base uma única vez**
— `valor = base × (1 + Σbônus_passiva + Σbônus_item)` — com **teto explícito por campo**.
*Por quê:* retorno linear é previsível, dois itens iguais não explodem, e o arnês da Fase 2
consegue atribuir causa quando a matriz sai da faixa. Multiplicativo composto cria
combinações que só a medição explica, e a Fase 5 já é a fase cara.
**Risco:** aditivo desincentiva empilhar o mesmo item, o que reduz profundidade de build.
Aceitável em um Bo5 de 4 compras. Os tetos precisam ser números escritos, não implícitos.

### D-05 — Duração-alvo (mediana) da rodada

60s é o **teto** (morte súbita), não a meta. Hoje mede **13,8s** — 4,3x abaixo. O `README.md`
deliberadamente não ajustou, porque os números certos só aparecem com humano no controle.

**Recomendação: alvo de mediana entre 25s e 35s, fixado por medição na Fase 3, não antes.**
*Por quê:* abaixo de 25s dispara o Risco #5 (item não é sentido dentro da rodada, loja perde
função). E uma mediana de ~30s faz a cauda longa cruzar os 60s de vez em quando, o que é o
único jeito de a morte súbita não ser código morto (Risco #6, hoje 0 de 40).
**Risco:** subir HP ou baixar dano muda todo o balanceamento medido até ali — por isso o
ajuste vem **antes** do roster de 8 (Fase 5) e **depois** do arnês existir (Fase 2).

### D-06 — Comportamento no estouro do timer de 30s de build

Não definido em lugar nenhum; é consequência mecânica de RF-04.
**Recomendação: seleção default determinística** (primeira ativa + primeira passiva), sem
penalidade. *Por quê:* é a única opção que não trava a partida nem pune desconexão momentânea.
**Risco:** baixo. Se a default virar meta ("é sempre boa o suficiente"), randomizar a ordem
de exibição das opções resolve.

### D-07 — Redação do Pilar 3 *(resolve C1)*

**Recomendação: reformular o pilar**, mantendo o Golem —
*"colisão **passiva** causa 0 dano; dano por contato existe apenas dentro de janela explícita
de habilidade, declarada no personagem."*
*Por quê:* a exceção do Golem é boa mecânica (o dash tem identidade) e remover custa design já
feito. Mas o pilar reformulado continua **auditável**: dá para verificar personagem a
personagem se o dano por contato está dentro de uma janela declarada.
**Risco:** abre precedente. Mitigação: a janela precisa ser um campo do personagem, não código
solto em `on.collide` — o que é trabalho do @architect junto com C2/C3.

### D-08 — Stream de PRNG do bot *(Risco #7, decidir antes da Fase 2)*

Se o jitter do bot sacar de `world.rng`, "replay = seed + linha do tempo de inputs" deixa de
valer entre versões do bot, e o replay da Fase 4 quebra.
**Recomendação: stream próprio para o bot**, semeado a partir da seed da partida.
**Owner:** @architect no desenho do bot. Registro aqui porque a consequência é de produto
(replay e anti-cheat, decisão #4).

### D-09 — Números da economia *(herdada de `DESIGN.md` §8)*

Quantidade e preço dos itens; renda exata por rodada; taxa de juros.
**Recomendação: não decidir agora.** São parâmetros de tuning, medidos na Fase 3 com humano no
controle, junto com D-05. Fixá-los antes seria raciocínio onde a decisão #13 manda medição.
**Não bloqueia** o início da Fase 3, desde que existam valores provisórios explicitamente
marcados como provisórios.

---

## 6. Indicadores de risco

`DESIGN.md` §7 lista 5 riscos, mas só o Risco #1 tem indicador definido pelo próprio design.
Os demais indicadores vieram do brief §4 e estão marcados **`[PROPOSTO]` — proposta do
@analyst, não decisão do usuário.** Este PRD os lista como **pendentes de aprovação**; eles só
viram critério de portão depois que o usuário aprovar.

| # | Risco | Indicador | Gatilho | Fase | Status |
|---|---|---|---|---|---|
| 1 | Trilha de combate mata a trilha física | Taxa de compra de itens físicos | **< 35%** | 5 | ✅ **Decidido** (`DESIGN.md` §7) |
| 1b | ↳ detecção precoce | No arnês: delta de winrate de pacote físico (+20% massa, −20% drag) vs pacote de dano (+20% dmg), contra a mesma linha-base | físico < +2pp **e** dano > +5pp → a trilha física nasce morta | **2** | ⏳ `[PROPOSTO]` |
| 2 | Liberdade total sem moeda comum de dano | **Teste de mutante:** Vex com +30% de dano é reportado fora de 45–55% | arnês não detecta → o arnês não serve e a Fase 2 não passou | 2 | ⏳ `[PROPOSTO]` — **usado como P2.2 acima; se reprovado, o portão da Fase 2 volta a ser subjetivo** |
| 2b | ↳ poder estatístico | n de lutas por confronto | < **800** não distingue 55% de 50% com 80% de poder. 40 seeds = ±15pp | 2 | ⏳ `[PROPOSTO]` |
| 3 | Escopo somado (~12 meses) | Dias de calendário ÷ estimativa (F1: 1sem · F2: 1-2 · F3: 2-3 · F4: 2-3 · F5: 6-8) | **> 2x** → reabrir corte de escopo (corte natural: roster 8 → 4-5) | fim de cada fase | ⏳ `[PROPOSTO]` |
| 4 | Mirar 2 personagens ao vivo | % de rodadas com **uma só** mão; taxa de cast desperdiçado (mira >45° do alvo ou em bola morta) | uma mão em **> 70%** → o input de duas bolas falhou; plano B é 1 bola pilotada + 1 automática | 1 | ⏳ `[PROPOSTO]` |
| 5 | Curva econômica curta (4 compras) | Mediana da rodada com humano no controle | **< 25s** → o item não é sentido e a loja perde função | 3 | ⏳ `[PROPOSTO]` |
| 6 | **`[NOVO]`** Morte súbita é código morto | % de rodadas que atingem 60s | Hoje **0 de 40** (max 19,5s). Seguir em 0% após ajuste de HP/dano → ou a mecânica é desnecessária, ou os números de combate estão errados por fator ~4 | 2 e 3 | ⏳ `[PROPOSTO]` — risco não listado no `DESIGN.md` |
| 7 | **`[NOVO]`** Fluxo de RNG compartilhado bot↔sim | Bot da Fase 2 consumindo `world.rng` | Se consumir, "replay = seed + inputs" deixa de valer entre versões do bot | 2, no desenho do bot | ⏳ `[PROPOSTO]` — vira decisão **D-08** |

**O que preciso do usuário nesta seção:** aprovar, ajustar ou recusar cada `[PROPOSTO]`.
O item #2 é o mais urgente — ele é o portão da Fase 2 neste PRD. Se o usuário não o aprovar,
a Fase 2 fica sem critério verificável e volta a depender de julgamento, o que contraria a
decisão #13 (medição, não raciocínio).

---

## 7. Rastreabilidade e limites deste documento

- **Fonte de verdade, nesta ordem:** `docs/brief.md` → `DESIGN.md` → `README.md`.
- **Os números dentro dos blocos de código do `DESIGN.md`** (`vex.atk = {cd: 800, dmg: 7,
  range: 90}`, `orbit r 180`, `accel 0.3`) são **ilustrativos, não normativos**. O código usa
  outros e isso não é desvio.
- **Desvios conscientes da Fase 0, já registrados no `README.md` e não reabertos:** pacote
  único em vez de monorepo (fronteiras de pasta mantidas); mira por arrasto antecipada da
  Fase 1; `INPUT_DELAY_TICKS = 0`; Canvas 2D em vez de Pixi. O `DESIGN.md` §5 descreve
  `packages/` e Pixi — divergência conhecida e aceita, split real na Fase 5.
- **Este PRD não decide** nada listado em §5, não resolve nada listado em §4, e não autoriza a
  Fase 1: o portão da Fase 0 é julgamento humano e ainda não foi dado.
