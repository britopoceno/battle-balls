# Battle Balls — Project Brief

> Entrada para o PRD. Consolida `DESIGN.md` (decisões) + `README.md` (medições) +
> o código da Fase 0 (realidade). **Não reabre decisão nenhuma.**
> Data: 2026-07-28 · Fonte de verdade: `DESIGN.md` v1, Fase 0 construída.

---

## 1. Resumo executivo

PvP 2v2 síncrono em arena fechada de física de bolas, mobile-first, paisagem, web.
O jogador **não dirige** as bolas — cada personagem tem IA de movimento autoral e ataque
básico automático; o jogador decide no draft (1 de 2 ativas + 1 de 2 passivas = 4 builds
por personagem) e executa mirando ativa e ult com dois polegares, um por bola.
Colisão não causa dano: empurrar o inimigo para fora do alcance dele é a forma de negar
o DPS dele. Partida em Bo5 com loja e renda igual entre rodadas — a decisão econômica é
*quando* gastar, não *quanto* ganhou. Roster alvo: 8 personagens.

---

## 2. Decisões travadas

Registro. Cada linha já passou por trade-off explícito no `DESIGN.md`.

| # | Eixo | Decisão | Por quê (curto) |
|---|---|---|---|
| 1 | Substrato de combate | Física de bolas 2D, arena fechada, ricochete, **sem ring-out**; colisão = 0 dano, só deslocamento | Física vira camada de *controle*, não de dano — deslocar nega alcance |
| 2 | Controle da unidade | Jogador **não** pilota; IA de movimento autoral por personagem | Libera os dois polegares para mira; identidade lida pelo jeito que a bola anda |
| 3 | Modelo de PvP | 2v2 síncrono em tempo real, sala por link | Duas bolas por jogador é o que justifica o input de dois polegares |
| 4 | Netcode | **Servidor autoritativo + input delay (~100ms)**, sem rollback, sem resimulação | Input é discreto (só casts), não contínuo — delay é invisível; anti-cheat de graça |
| 4b | Netcode — modelo morto | Servidor pré-computar a batalha e enviar replay: **DESCARTADO** | O servidor não pode conhecer o futuro quando há input ao vivo. Registrado para não voltar por engano |
| 5 | Stack / arquitetura | `sim/` TypeScript puro, 0 deps, sem DOM, tick fixo 60Hz, PRNG com seed, sem `Math.random`; `chars/` 1 arquivo por personagem; personagem = módulo que assina eventos e compõe `fx.*` | Mesma simulação roda no cliente, no servidor e no arnês de 10k lutas |
| 6 | Estrutura de partida | Draft snake **aberto** sem bans → builds **simultâneas e secretas** (30s) → Bo5, loja entre rodadas | Roster de 8 é pequeno demais para banir; segredo da build move a leitura para dentro da rodada |
| 7 | Economia | Renda **igual** para os dois + juros sobre ouro guardado; **vencer não dá ouro** | Elimina snowball: a 1ª vitória não compra a 2ª. A decisão vira *tempo*, não vantagem |
| 8 | Loja | Duas trilhas de 4: física (massa, velocidade, atrito, elasticidade) e combate (dano, HP, alcance, cooldown) | Dá poder de compra à camada física, que não tem dano próprio |
| 9 | Input | Mobile paisagem, 4 botões semitransparentes; esquerda = bola 1, direita = bola 2; arrastar mira (direção **e** distância) | Sem seleção prévia: as duas mãos miram simultaneamente |
| 10 | Ult | Barra com regra de carga **variável por personagem** + ícone da condição na barra | Regra de carga é parte da identidade; o ícone explica por que a barra não enche |
| 11 | Plataforma | Web, mobile-first, paisagem | — |
| 12 | Roster | 8 personagens. **O 9º só existe quando os 8 estiverem em 45–55%** | Trava de escopo autoexecutável |
| 13 | Balanceamento | **Medição, não raciocínio.** Peneira grossa: bot heurístico simétrico, 10k lutas × 28 confrontos, alerta fora de 45–55%. Peneira fina: telemetria de jogadores reais | Liberdade total de design = não existe moeda comum de dano; nenhuma fórmula responde "está forte?" |
| 14 | Bot | Um só bot serve a três usos: balanceamento, modo treino, oponente solo | Amortiza o custo do arnês |
| 15 | Método | Fases com **portão**; não avança sem passar | Fase 0 custa 2 semanas e valida ou invalida as outras 60 decisões |

Os números dentro dos blocos de código do `DESIGN.md` (`vex.atk = {cd: 800, dmg: 7,
range: 90}`, `orbit r 180`, `accel 0.3`) são **ilustrativos**, não normativos — o código
usa outros e isso não é desvio.

---

## 3. Estado atual medido

Fase 0 construída: `sim/` pura + Golem e Vex + render Canvas 2D + mira por arrasto +
arnês de determinismo. Reproduzi `npm run sim:check` nesta sessão — **os três números
batem exatamente com o `README.md`, sem divergência**:

| Métrica | Valor medido | Leitura |
|---|---|---|
| Determinismo | ✓ ok — 40/40 seeds, hash FNV-1a idêntico em execução dupla | O invariante que sustenta servidor autoritativo e arnês está de pé |
| Espelho 2v2 | time0 **19** · time1 **14** · empate **7** (40 seeds) | **Dentro do ruído.** 33 rodadas decisivas, 19-14 dá p≈0,38 bicaudal. n=40 tem margem de ±15pp — não prova simetria, só não a contradiz |
| Duração da rodada | mediana **13,8s** · min 12,3s · max 19,5s | **4,3x abaixo** do teto de 60s do design |
| Tipagem / build | `tsc --noEmit` e build de produção passam | — |
| Render e mira por arrasto | **NÃO VERIFICADOS** rodando | Bloqueia o portão da Fase 0 (ver §6) |

### Os três bugs que só o arnês achou

Evidência de que medir cedo funciona — nenhum dos três é visível lendo o código:

1. **Golem não conseguia atacar Golem.** Alcance media distância-menos-raio-do-alvo. Dois
   corpos de raio 24 nunca chegam a menos de 48px e o alcance corpo a corpo era 42px:
   matematicamente inatingível. Travava **20% das rodadas**. Corrigido para medição
   superfície-a-superfície (`src/sim/world.ts:352`).
2. **Projéteis nunca acertavam alvos em órbita.** Vex a 250px/s, 165px de distância →
   0,35s de voo, alvo anda 88px. Vex vs Vex era empate eterno. Corrigido com intercepção
   de 1ª ordem, duas iterações (`src/sim/world.ts:374-379`) — e a correção **preserva a
   intenção do design**: empurrar o alvo continua fazendo o tiro errar.
3. **A seed não fazia nada.** Nada consumia RNG; as 40 seeds rodavam a mesma partida.
   Corrigido com ruído de largada em posição e velocidade (`src/sim/world.ts:68-71`).

### Desvios conscientes já registrados

Pacote único em vez de monorepo (fronteiras de pasta mantidas); mira por arrasto
antecipada da Fase 1; `INPUT_DELAY_TICKS = 0`; Canvas 2D em vez de Pixi. Todos
documentados no `README.md`. Não reabrir.

---

## 4. Riscos com indicador mensurável

| # | Risco | Indicador | Gatilho | Quando medir |
|---|---|---|---|---|
| 1 | **Trilha de combate mata a trilha física** | Taxa de compra de itens físicos (DESIGN.md) | **< 35%** → a física virou enfeite | Fase 5 (telemetria) |
| 1b | ↳ *detecção precoce* | **[PROPOSTO]** No arnês, delta de winrate de um pacote físico (+20% massa, −20% drag) vs um pacote de dano (+20% dmg), contra a mesma linha-base | Físico **< +2pp** e dano **> +5pp** → a trilha física nasce morta, antes de existir loja | **Fase 2** — não espere a Fase 5 |
| 2 | **Liberdade total sem moeda comum de dano** | **[PROPOSTO]** Teste de mutante: injetar um Vex com +30% de dano e verificar que o arnês o reporta fora de 45–55% | Arnês não detecta o mutante → o arnês não serve e a Fase 2 não passou | Fase 2, como critério do próprio portão |
| 2b | ↳ *poder estatístico* | **[PROPOSTO]** n de lutas por confronto | Distinguir 55% de 50% com 80% de poder exige **≈800 lutas/confronto**. As 10k do design dão ±1pp — folgado. **40 seeds dão ±15pp e não servem para balancear** | Fase 2 |
| 3 | **Escopo somado (~12 meses)** | **[PROPOSTO]** Dias de calendário por fase ÷ estimativa do DESIGN.md (F1: 1sem · F2: 1-2 · F3: 2-3 · F4: 2-3 · F5: 6-8) | Qualquer fase **> 2x** a estimativa → reabrir corte de escopo. Corte natural: roster 8 → 4-5, já que a "regra do 9º" prova que o roster é elástico por design | Ao fim de cada fase |
| 4 | **Mirar 2 personagens ao vivo** | **[PROPOSTO]** % de rodadas em que o jogador usou **só uma** das duas mãos; e taxa de cast desperdiçado (mira >45° do alvo pretendido ou em bola morta) | Uma mão só em **> 70%** das rodadas → o input de duas bolas falhou; plano B é 1 bola pilotada + 1 automática | Fase 1 (celular real) |
| 5 | **Curva econômica curta (só 4 compras)** | **[PROPOSTO]** Mediana da rodada com humano no controle | Mediana **< 25s** → não há tempo para o item ser sentido dentro da rodada e a loja perde função | Fase 3 |
| 6 | **[NOVO] Morte súbita é código morto** | % de rodadas que atingem 60s | Hoje: **0 de 40** (max 19,5s). Se seguir 0% após o ajuste de HP/dano, ou a mecânica é desnecessária ou os números de combate estão errados por um fator ~4 | Fase 2 e Fase 3 |
| 7 | **[NOVO] Fluxo de RNG compartilhado bot↔sim** | Bot da Fase 2 consumindo `world.rng` | Se o jitter do bot sacar do PRNG da simulação, "replay = seed + linha do tempo de inputs" (DESIGN §5) deixa de valer entre versões do bot. **Decisão a tomar antes da Fase 2: o bot recebe stream de PRNG próprio** | Fase 2, no desenho do bot |

---

## 5. Perguntas em aberto

### 5a. Herdadas do DESIGN.md §8

- **Build muda entre rodadas?** Não decidido. Recomendação do documento: sim, com custo
  em ouro. Impacto no PRD: se sim, a UI de draft é reaproveitada na loja.
- Quantidade e preço dos itens; renda exata por rodada; taxa de juros.
- Duração-alvo (mediana) da rodada. 60s é o teto, não a meta. **Hoje mede 13,8s.**
- Meta-progressão fora da partida: ranked, desbloqueio, monetização.
- Direção de arte, som, nome do jogo.

### 5b. Levantadas ao cruzar documento e código

- **Empate não tem regra no Bo5.** O código produz `winner = -1` e isso aconteceu em
  **7 de 40 rodadas (17,5%)** — todos duplo-KO simultâneo, artefato de times espelhados.
  O `DESIGN.md` só define "primeiro a 3 vitórias". Empate conta para quem? Repete a
  rodada? Precisa de regra antes da Fase 3.
- **Unidade do `threshold` de ult é implícita.** O mesmo campo numérico significa dano
  acumulado (`damageDealt`/`damageTaken`), milissegundos (`time`), contagem (`kills`,
  `casts`). Funciona com 2 personagens; com 8 é fonte garantida de erro de balanceamento.
- **`mods.range` só afeta o ataque básico.** O alcance de habilidades (`minRange`/
  `maxRange`) não recebe modificador. Luneta (+alcance) precisa de escopo definido:
  só básico, ou básico + habilidades?
- **Ordem de aplicação de mods de item.** Aditivo, multiplicativo ou multiplicativo
  composto? Sem essa regra, dois itens de dano são um problema de balanceamento
  indeterminado.

### 5c. ⚠ CONTRADIÇÕES entre DESIGN.md e código

Achado mais importante deste brief. Quatro itens; os dois primeiros afetam pilares.

**C1 — "Colisão causa 0 dano" já é falso com 2 personagens de 8.**
`DESIGN.md` §2 e Pilar 3 afirmam a regra em absoluto. Mas `src/chars/golem.ts:134-144`
(`on.collide`) causa **14 de dano** e knockback 520 durante a janela de 450ms do dash
Impacto Sísmico, com trava de 250ms entre acertos. É defensável como exceção mediada por
habilidade — mas escrito como está, o pilar não é auditável e nada impede que o 3º, 4º e
5º personagem "excepcionem" também. **Ação: reformular o pilar como "colisão *passiva*
causa 0 dano; dano por contato só existe dentro de janela de habilidade" — ou remover a
exceção do Golem.** Uma das duas, não as duas.

**C2 — Metade da loja não tem onde encaixar no simulador.**
`Mods` é `{dmg, atkSpeed, range, speed, knockbackResist}` (`src/sim/types.ts:18-25`).
Cruzando com os 8 itens do `DESIGN.md` §4:

| Item | Ponto de aplicação | Status |
|---|---|---|
| Chumbo (+massa) | `Ball.mass` | ✓ existe |
| Turbina (+velocidade) | `mods.speed` | ✓ existe (mas ver C3) |
| Lixa (−atrito) | `Ball.drag` | ✓ existe |
| **Borracha (+elasticidade)** | — | ✗ **não existe.** Restituição é constante de módulo: `REST_BALL = 0.65` / `REST_WALL = 0.72` em `src/sim/physics.ts:4-5`, global, não por bola |
| Lâmina (+dano) | `mods.dmg` | ✓ existe |
| Couraça (+HP) | `Ball.maxHp` | ✓ existe |
| Luneta (+alcance) | `mods.range` | ◐ parcial — só ataque básico (`world.ts:344`) |
| **Relicário (−cooldown)** | — | ✗ **não existe** para habilidades: `self.abilityReadyAt = world.time + ab.cd` (`world.ts:316`) sem multiplicador. `mods.atkSpeed` cobre só o ataque básico (`world.ts:360`) |

Duas ausências e uma cobertura parcial. Note a assimetria: **a trilha física é a que
perde o item mais distintivo** (elasticidade é a única propriedade puramente física da
lista) — o que empurra na direção do Risco #1 antes mesmo da loja existir.

**C3 — Passivas escrevem em `mods` por atribuição absoluta, não por acumulação.**
`vex.ts:97` faz `self.mods.speed = self.hp/self.maxHp < 0.4 ? 1.25 : 1` **a cada tick**;
`golem.ts:95` faz `self.mods.knockbackResist = 0.6` no `init`. Hoje é inofensivo porque
não há itens. Na Fase 3, Turbina (+velocidade) comprada num Vex com a passiva Fantasma
será **sobrescrita 60 vezes por segundo**. É bloqueio de arquitetura, não bug: `mods`
precisa virar acumulador (base × passiva × item) antes de o primeiro item existir.

**C4 — `MAX_ROUND_MS = 150_000` não está no DESIGN.md.**
O design define morte súbita a 60s e só. O código tem um teto duro de 150s que declara
empate (`world.ts:23,463`). Provavelmente correto como rede de segurança — mas é uma
regra de partida não documentada, e alimenta a lacuna "empate no Bo5" de §5b.

**Verificações que NÃO revelaram divergência** (registrado para não refazer): a arena do
cliente (`layout.ts` 960×540) é idêntica à do arnês; `sim/` não importa de `chars/`,
`bot/` nem `client/`; `Math.random` não aparece em `sim/` (só no cliente, para sortear
seed); `SUDDEN_DEATH_MS = 60_000` bate com o design; os ícones de carga de ult existem
no tipo e são renderizados (`render.ts:366`).

---

## 6. Próximo portão

**O portão da Fase 0 NÃO foi passado. A Fase 1 não pode começar.**

| | |
|---|---|
| **Fase** | 0 — Núcleo (construída) |
| **Pergunta do portão** | *Mirar habilidades em bolas que andam sozinhas é divertido?* |
| **Critério para passar** | Julgamento humano. Não há métrica automática e não deve haver: o `DESIGN.md` posiciona esta como a pergunta que valida ou invalida as outras 60 decisões. Só o usuário jogando responde |
| **Bloqueio ativo** | O `README.md` registra que o canvas e a mira por arrasto **nunca foram vistos rodando** — a extensão do Chrome não conectou. Verificados: tipagem, build, módulos servidos pelo Vite, simulação inteira via arnês headless. Não verificado: o desenho e o arrasto de fato |
| **Ação imediata** | `npm run dev` → `http://localhost:5177`, em paisagem, **no celular** (`npx vite --host`). Jogar. Reportar o que quebra |

**Se o portão passar, a Fase 1 é:** layout mobile paisagem + 4 botões semitransparentes +
mira por arrasto, testado em celular real. Portão da Fase 1: *os dois polegares funcionam
sem atrapalhar um ao outro?* — que é exatamente o Risco #4, e por isso o indicador
proposto em §4 (uso de uma só mão em >70% das rodadas) deve ser instrumentado **junto
com** a Fase 1, não depois.

### Recomendações para o @pm ao escrever o PRD

1. **Não escrever requisito de loja/economia antes de resolver C2 e C3.** Dois itens do
   design não têm ponto de aplicação e o sistema de mods não compõe. É trabalho de
   arquitetura (@architect), não de produto.
2. **Fechar a regra de empate antes da Fase 3.** 17,5% das rodadas medidas caíram nela.
3. **Tratar o ajuste de HP/dano (13,8s → alvo) como decisão de produto medida na Fase 3**,
   não como tuning técnico. O `README.md` deliberadamente não ajustou: os números certos
   só aparecem com humano no controle. Respeitar essa decisão.
4. **A Fase 2 (arnês) deve ter seu próprio critério de aceitação verificável** — o teste
   de mutante de §4 risco 2. "O arnês existe" não é portão; "o arnês detecta um
   personagem que eu quebrei de propósito" é.

---

### Confiança das afirmações deste brief

| Afirmação | Confiança |
|---|---|
| Números da §3 | **Alta** — reproduzidos por execução direta nesta sessão |
| Contradições C1-C4 | **Alta** — lidas no código, com arquivo e linha |
| Leitura estatística do espelho 19/14/7 e do n necessário | **Alta** — aritmética binomial padrão |
| Indicadores marcados **[PROPOSTO]** | **Média** — proposta do Analyst, não decisão do usuário. Precisam de aprovação antes de virar critério de portão |
| Impacto futuro de C3 (Turbina × Fantasma) | **Alta** na mecânica, **Média** na gravidade — depende de decisões de loja ainda em aberto |
