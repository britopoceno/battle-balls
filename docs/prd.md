# Battle Balls — PRD

> Escrito **a partir** de `DESIGN.md` v1 (decisões travadas) e `docs/brief.md` (medições e
> contradições verificadas). Não reabre decisão. Onde o brief e o `DESIGN.md` divergem, o
> conflito está **sinalizado**, não resolvido.
> Data: 2026-07-28 · Fase corrente: **2 CONCLUÍDA — Fase 3 autorizada** (2026-07-29).
> Todas as decisões de §5 e todos os indicadores de §6 foram aprovados em 2026-07-28.
> Fase 1 (E1 — Sensação): **✅ aprovada pelo usuário** (julgamento humano, portão sem métrica
> substituta). Fase 2 (E2 — Arnês): **✅ concluída** — portão verificável, P2.1-P2.5 passaram
> (ver §2, E2).

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

Indicador de escopo aplicável a todos (Risco #3, **aprovado** §6): dias de calendário da fase
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

**Estado: ✅ APROVADO pelo usuário em 2026-07-28.** Veredito: *é divertido.* A pergunta que
validava ou invalidava as outras 60 decisões foi respondida — o núcleo do jogo se sustenta.

> ✅ **Fase 1 autorizada.** O portão foi dado em desktop; a verificação em **celular real**
> permanece pendente e migra para a pré-condição **P1.1 da Fase 1**, onde ela é obrigatória.
> O acesso pela rede local falha por interferência entre roteador e aparelho (não é defeito
> de código; brief §3) — contornar por hotspot do computador ou outra rede é a primeira
> tarefa da E1.

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
| P1.3 | % de rodadas em que o jogador usou **só uma** das duas mãos; taxa de cast desperdiçado (mira >45° do alvo ou em bola morta) | Evidência — indicador **aprovado** (§6) — instrumentar JUNTO com a E1 |

**P1.2 não é redundante com `npm run sim:check`.** O bug de TDZ do brief §3 derrubava o
módulo inteiro do cliente e o arnês headless não o veria: arnês prova a simulação, não prova
o cliente. Toda fase com entrega de cliente precisa de verificação visual própria.

**Plano B registrado (se o portão reprovar):** 1 bola pilotada + 1 automática. Isso
invalidaria a decisão travada #3 (2v2) e exigiria nova sessão de design — não é ajuste.

> **Estado: ✅ APROVADO pelo usuário.** Julgamento humano — os dois polegares funcionam sem
> atrapalhar um ao outro. Portão sem métrica substituta, como a seção acima declara; a
> aprovação é do usuário jogando, não deste documento.

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
e a Fase 3 precisa ser reprojetada antes de a loja existir. Indicador **aprovado** (§6).

**Também nesta fase:** % de rodadas que atingem 60s (Risco #6). Hoje é 0 de 40, com max de
19,5s. Se seguir 0% após o ajuste de HP/dano, ou a morte súbita é código morto ou os números
de combate estão errados por um fator ~4.

> ✅ **CONCLUÍDA (2026-07-29).** 9 stories (`e2.0`-`e2.8`, `docs/architecture-e2.md`), todas
> `Done`. Portão executado com o comando oficial `npm run balance -- --mutacao=vex:dmg:+0.30
> --n=3000`:
> - **P2.1** — `sim:check` verde, golden hash idêntico ao baseline de `debt.0` nas 9 stories.
> - **P2.2** — mutante Vex +30% dmg: **79,00% ±1,79, fora** de 45–55%. Detectado com folga.
> - **P2.3** — controle 0% de mutação: **50,10% ±1,79, dentro.** Nota operacional: no piso de
>   `n=800` (RF-48) o veredito pode sair inconclusivo por amostragem — a execução do portão
>   usa `n≥2000` (ver Anexo B de `docs/architecture-e2.md`), não o piso.
> - **P2.4** — n=3000 por confronto (acima do piso de 800).
> - **P2.5** — determinismo com bot no loop, autoconsistência + replay sem bot, 5 seeds.
>
> **Medição adicional de #1b:** deltas por personagem (golem/vex), sem agregação global —
> R-04 (`architecture-e2.md` §9) devolveu a regra de agregação para a Fase 5, quando o gatilho
> for cobrado com o roster de 8. Achado a carregar: o veredito do gatilho pode inverter
> trocando a base de seed a n=800 (registrado no gate de `e2.7`); qualquer leitura de #1b deve
> usar n bem acima do piso de RF-48.
>
> **Re-medição de D-02 (empate, com roster heterogêneo):** **2,8%** com o bot heurístico
> (`[golem,vex]` espelho), contra 17,5% do `dummy` na Fase 0 e 11,1% medido preliminarmente
> com `dummy` em `architecture-e2.md` §1.3 — confirma a hipótese do `README.md`: empate é
> artefato de simetria de time, não regra de peso. D-02 segue como salvaguarda barata.
>
> **Risco #6 (morte súbita):** 0,0% em milhares de rodadas com o bot heurístico — segue sem
> se materializar; decisão sobre "código morto vs números errados" cabe à Fase 3, depois do
> ajuste de HP/dano de D-05.
>
> **Dívida rastreada para fases seguintes** (nenhuma bloqueou o portão de E2): REL-001
> (**bloqueia** qualquer item de +HP na loja da Fase 3 — `b.hp` nasce de `def.maxHp`, não de
> `stat.maxHp`; um item de vida faria a bola nascer ferida) e QA-E27-004 (Fase 5, acima).

---

### E3 — Loop *(estimativa: 2-3 semanas)*

**Objetivo.** A partida inteira, local, contra o bot: draft → builds secretas → Bo5 com loja.
É a primeira vez que a decisão econômica existe.

**Escopo.** **RF-01 a RF-07** (draft e builds), **RF-20 a RF-29** (Bo5, economia e loja),
telemetria local para os Riscos #1, #5 e #6.

> ✅ **DESBLOQUEADA** *(2026-07-28)*. Todos os itens abaixo foram fechados:
> - **C2 e C3 resolvidos.** Épico de dívida de arquitetura (`debt.0`-`debt.7`, todas `Done`)
>   implementou o desenho do @architect por completo: `stat.*` como única fonte de verdade,
>   `restBall`/`restWall`/`cdSpeed` com ponto de aplicação real, `mods` substituído por bônus
>   aditivo (`bonusPassive`/`bonusItem`) que compõe em vez de sobrescrever. Verificado: golden
>   hash idêntico ao baseline em todos os 8 passos, apesar de reestruturações profundas.
> - **D-02, D-03, D-04 fechadas** — decisões de produto aprovadas (§5) e já refletidas na
>   arquitetura implementada (D-04 é literalmente a fórmula de `recomputeStats`).

**Portão — JULGAMENTO HUMANO:** *dá vontade de jogar outra partida?* Acompanhado de evidência
instrumentada (todos **aprovado**, §6), que informa o julgamento sem substituí-lo:

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
| RF-21 | **Regra de empate no Bo5** | ✅ **RESOLVIDO** (D-02: rodada nula, teto de 7) — re-medido na Fase 2 com bot heurístico: 2,8% (ver §2/E2) |
| RF-22 | **Renda igual** para os dois jogadores por rodada (ex.: 4, 5, 6, 7, 8) | decisão #7 |
| RF-23 | **Juros sobre o ouro guardado**. Vencer a rodada **não** dá ouro — sem snowball: a 1ª vitória não compra a 2ª | decisão #7 |
| RF-24 | Loja entre rodadas, com **duas trilhas de 4 itens**: física (Chumbo +massa, Turbina +velocidade, Lixa −atrito, Borracha +elasticidade) e combate (Lâmina +dano, Couraça +HP, Luneta +alcance, Relicário −cooldown) | decisão #8 |
| RF-25 | **Borracha (+elasticidade)** e **Relicário (−cooldown)** precisam de ponto de aplicação no simulador | ✅ **RESOLVIDO** (`debt.4`, `debt.5`) — ver §4 |
| RF-26 | **Luneta (+alcance)**: escopo do modificador | ✅ **RESOLVIDO** (D-03: só ataque básico na v1, por decisão — não limitação técnica) |
| RF-27 | **Ordem de aplicação de mods de item** (aditivo / multiplicativo / composto) | ✅ **RESOLVIDO** (D-04: `base×(1+Σbônus)`, teto por campo — implementado em `debt.1`-`debt.3`) |
| RF-28 | Mods de passiva e de item devem **compor**, não se sobrescrever | ✅ **RESOLVIDO** (`debt.1`, `debt.3`) — ver §4 |
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
| RF-36 | Instrumentação do Risco #4: % de rodadas com uma só mão; taxa de cast desperdiçado | ****aprovado**, ver §6** — instrumentar **junto com** a Fase 1, não depois |

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
| RF-48 | n por confronto **≥ 800** (poder 80% para distinguir 55% de 50%); o design pede 10k → ±1pp. **40 seeds dão ±15pp e não servem para balancear** | brief §4, Risco #2b **aprovado** |
| RF-49 | Telemetria de jogadores reais (peneira fina): winrate por personagem, por build e por item; taxa de pick; duração média da rodada | DESIGN §6 — Fase 5 |
| RF-50 | **Regra do 9º personagem:** nenhum personagem novo entra enquanto os 8 não estiverem em 45–55% | decisão #12 |

---

## 4. ✅ Dívida de arquitetura — RESOLVIDA (2026-07-28)

**Não eram requisitos de produto — eram pré-requisito de épico.** A solução era do
**@architect**, não do PM. Registro original: **a Fase 3 não podia começar antes.**

> **Épico de dívida de arquitetura fechado.** `docs/architecture.md` (desenho do @architect)
> implementado em 8 stories (`docs/stories/debt.0` a `debt.7`, todas `Done`), migração
> incremental com golden hash idêntico em cada passo — a simulação nunca mudou de
> comportamento até o momento certo. C2 e C3 abaixo estão resolvidas; C1 fechada por D-07;
> C4 segue como nota histórica (não bloqueava).

Origem: brief §5c, quatro contradições **lidas no código, com arquivo e linha** (confiança
alta). Duas bloqueavam a Fase 3 — texto original preservado abaixo, com a resolução anotada.

### C2 — Metade da loja não tinha onde encaixar no simulador *(✅ RESOLVIDA — `debt.4`, `debt.5`)*

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

**Impacto de produto (histórico):** 2 dos 8 itens eram inimplementáveis e 1 era parcial. A
assimetria importava: a trilha física perdia o item mais distintivo (elasticidade), empurrando
na direção do Risco #1 antes mesmo de a loja existir.

**Resolução:** `restBall`/`restWall` viraram stat por corpo (`debt.5`), combinados por regra
**máximo** — decisão que preserva a lógica "item não pode depender da build do inimigo" que
D-04 já aplicava ao combate. `cdSpeed` ganhou ponto de aplicação real em `castCommand`, com
piso absoluto `MIN_ABILITY_CD_MS` (`debt.4`, corrigido de 400ms para 500ms após o gate achar
que o valor original não entregava a proteção que alegava). Luneta (+alcance) permanece
parcial **por decisão** (D-03: só ataque básico na v1), não por limitação técnica.

### C3 — `mods` era escrito por atribuição absoluta, não por acumulação *(✅ RESOLVIDA — `debt.1`, `debt.3`)*

**Era:** `vex.ts:97` fazia `self.mods.speed = self.hp/self.maxHp < 0.4 ? 1.25 : 1` a cada tick;
`golem.ts:95` fazia `self.mods.knockbackResist = 0.6` no `init`. Uma Turbina (+velocidade)
comprada num Vex com a passiva Fantasma seria sobrescrita 60 vezes por segundo — o jogador
pagaria ouro por nada.

**Resolução:** `Ball.mods` removido por completo. `stat.*` (`base × (1 + Σbônus_passiva +
Σbônus_item)`, a fórmula literal de D-04) é a única fonte de verdade agora. Passivas somam em
`bonusPassive` via `ctx.addBonus` — nunca sobrescrevem. Verificado com 125.464 amostras
instrumentadas pelo QA no gate de `debt.3`: `stat.knockbackTaken` do Golem e `stat.maxSpeed`
do Vex idênticos, bit a bit, ao comportamento antigo, provando que a migração preservou o
jogo e ao mesmo tempo já corrige o bug de composição para quando o primeiro item existir.

### C1 — O Pilar 3 não era auditável *(✅ RESOLVIDA — `debt.6`, decisão D-07)*

**Era:** `DESIGN.md` §2 e Pilar 3 afirmavam "colisão causa 0 dano" em absoluto, mas
`src/chars/golem.ts:134-144` (`on.collide`) causava 14 de dano direto — já falso com 2
personagens de 8, e nada impedia que o 3º, 4º e 5º "excepcionassem" também, tirando o pilar
de servir de trava.

**Resolução (D-07, implementada em `debt.6`):** Pilar 3 reformulado — colisão *passiva* causa
0 dano; dano por contato só existe dentro de janela declarada. `CharDef.contactWindows` faz a
janela ser campo tipado, não código solto; `World.phase` + checagem em `dealDamage` recusam
qualquer dano causado durante `phase === 'collide'`, sempre ativo (inclusive em produção). O
`on.collide` do Golem foi deletado por completo — o motor resolve genericamente para todo o
roster. Três camadas de auditoria (estática, dinâmica, de roster) tornam a regra verificável
para qualquer personagem futuro. Limitação conhecida, registrada e não bloqueante: dano
aplicado via `Effect` de 1 tick (em vez de `ctx.damage` direto) ainda atravessa a checagem —
fechar isso é auditoria de roster em escala, Fase 2/6.

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

## 5. Decisões de produto — ✅ TODAS APROVADAS (2026-07-28)

> **O usuário aprovou as recomendações do @pm em bloco.** Cada decisão abaixo passa a valer
> como escrito na respectiva "Recomendação". Com a dívida de arquitetura também resolvida
> (§4, 2026-07-28), **a Fase 3 está desbloqueada** — restam só os parâmetros de tuning
> (D-09) a medir com humano no controle, o que é trabalho da própria Fase 3, não pré-requisito
> dela.

| # | Decisão aprovada | Observação |
|---|---|---|
| D-01 | Build **muda** entre rodadas, com custo em ouro | Preço é parâmetro medido na Fase 3, junto de D-09 |
| D-02 | Rodada empatada é **nula**; teto de **7 rodadas**; ao fim vence quem tiver mais vitórias | Aprovada **com as duas partes**: a regra vale já, e a incidência de empate é **re-medida na Fase 2** com roster heterogêneo antes de se fixar o peso dela |
| D-03 | +alcance afeta **só o ataque básico** na v1 | Revisão na Fase 5 com telemetria de winrate-por-item (RF-49) |
| D-04 | `valor = base × (1 + Σbônus_passiva + Σbônus_item)`, **teto explícito por campo** | Tetos precisam ser números escritos. Entrada direta para o @architect em C3 |
| D-05 | Mediana-alvo da rodada entre **25s e 35s**, fixada por medição na Fase 3 | Não ajustar antes da Fase 2 existir |
| D-06 | Estouro do timer de build → **seleção default determinística**, sem penalidade | Randomizar ordem de exibição se a default virar meta |
| D-07 | Pilar 3 reformulado: *"colisão **passiva** causa 0 dano; dano por contato existe apenas dentro de janela explícita de habilidade, declarada no personagem"* | Golem mantido. A janela vira **campo do personagem**, não código solto em `on.collide` — trabalho do @architect |
| D-08 | Bot recebe **stream de PRNG próprio**, semeado a partir da seed da partida | Owner: @architect, no desenho do bot |
| D-09 | Números da economia **não se decidem agora** | Valores provisórios permitidos desde que marcados como provisórios |

**Consequência de D-07:** o Pilar 3 do `DESIGN.md` precisa ser reescrito com essa redação, e
C1 deixa de ser contradição — vira exceção declarada e auditável.

---

### Registro original das recomendações

Mantido abaixo por rastreabilidade: cada decisão com o raciocínio e o risco que o @pm
declarou no momento da recomendação. **D-02, D-03 e D-04 bloqueavam a Fase 3.**

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
Os demais vieram do brief §4.

> ### ✅ TODOS OS **aprovado** FORAM APROVADOS (2026-07-28)
>
> O usuário aprovou os indicadores em bloco. Eles deixam de ser proposta do @analyst e passam
> a ser **critério de portão vinculante**. Consequências imediatas:
>
> - **O portão da Fase 2 está fechado e é objetivo**: o teste de mutante (#2) vale como P2.2,
>   com o controle negativo (P2.3) que o @pm acrescentou. A Fase 2 não passa por julgamento.
> - **n ≥ 800 lutas por confronto** (#2b) é obrigatório. As 40 seeds atuais dão ±15pp e
>   **não servem para balancear** — servem só como teste de fumaça de determinismo.
> - **O indicador do Risco #4 precisa ser instrumentado JUNTO com a Fase 1**, não depois:
>   medir % de rodadas com uma só mão exige telemetria de input no cliente.
> - **Risco #7 vira D-08** (aprovada): bot com stream de PRNG próprio.

| # | Risco | Indicador | Gatilho | Fase | Status |
|---|---|---|---|---|---|
| 1 | Trilha de combate mata a trilha física | Taxa de compra de itens físicos | **< 35%** | 5 | ✅ **Decidido** (`DESIGN.md` §7) |
| 1b | ↳ detecção precoce | No arnês: delta de winrate de pacote físico (+20% massa, −20% drag) vs pacote de dano (+20% dmg), contra a mesma linha-base | físico < +2pp **e** dano > +5pp → a trilha física nasce morta | **2** | ✅ **Aprovado** |
| 2 | Liberdade total sem moeda comum de dano | **Teste de mutante:** Vex com +30% de dano é reportado fora de 45–55% | arnês não detecta → o arnês não serve e a Fase 2 não passou | 2 | ✅ **Aprovado** — **usado como P2.2 acima; se reprovado, o portão da Fase 2 volta a ser subjetivo** |
| 2b | ↳ poder estatístico | n de lutas por confronto | < **800** não distingue 55% de 50% com 80% de poder. 40 seeds = ±15pp | 2 | ✅ **Aprovado** |
| 3 | Escopo somado (~12 meses) | Dias de calendário ÷ estimativa (F1: 1sem · F2: 1-2 · F3: 2-3 · F4: 2-3 · F5: 6-8) | **> 2x** → reabrir corte de escopo (corte natural: roster 8 → 4-5) | fim de cada fase | ✅ **Aprovado** |
| 4 | Mirar 2 personagens ao vivo | % de rodadas com **uma só** mão; taxa de cast desperdiçado (mira >45° do alvo ou em bola morta) | uma mão em **> 70%** → o input de duas bolas falhou; plano B é 1 bola pilotada + 1 automática | 1 | ✅ **Aprovado** |
| 5 | Curva econômica curta (4 compras) | Mediana da rodada com humano no controle | **< 25s** → o item não é sentido e a loja perde função | 3 | ✅ **Aprovado** |
| 6 | **`[NOVO]`** Morte súbita é código morto | % de rodadas que atingem 60s | Hoje **0 de 40** (max 19,5s). Seguir em 0% após ajuste de HP/dano → ou a mecânica é desnecessária, ou os números de combate estão errados por fator ~4 | 2 e 3 | ✅ **Aprovado** — risco não listado no `DESIGN.md` |
| 7 | **`[NOVO]`** Fluxo de RNG compartilhado bot↔sim | Bot da Fase 2 consumindo `world.rng` | Se consumir, "replay = seed + inputs" deixa de valer entre versões do bot | 2, no desenho do bot | ✅ **Aprovado** — vira decisão **D-08** |

> ✅ **Todos os indicadores acima foram aprovados em bloco em 2026-07-28** (ver a nota no topo
> desta seção). O item #2 era o mais urgente — portão da Fase 2 — e passou: `npm run balance
> -- --mutacao=vex:dmg:+0.30 --n=3000` detecta o mutante fora de 45–55% e o controle fica
> dentro (ver §2/E2). Indicador #6 (morte súbita) também medido na Fase 2: **0,0% em milhares
> de rodadas** com o bot heurístico — segue sem se materializar; decisão "código morto vs
> números errados" cabe à Fase 3 (D-05), após o ajuste de HP/dano com humano no controle.

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
- **Este PRD não decidiu** nada listado em §5, nem resolveu nada listado em §4, **até que o
  usuário aprovasse** — o que aconteceu em bloco em 2026-07-28 (§5, §6). A partir daí, cada
  decisão passou a valer como escrita. As Fases 0, 1 e 2 têm portão passado e registrado em
  §2; a Fase 3 está em andamento. Ver `docs/GDD.md` e `docs/DEVELOPMENT-BIBLE.md` para a
  leitura consolidada do estado atual do projeto.
