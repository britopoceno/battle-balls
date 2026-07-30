# Battle Balls — Game Design Document

> **O que este documento é.** Uma síntese de leitura única do jogo inteiro: o que ele é, como se
> joga, o que já foi decidido e o que já foi medido. Existe para que qualquer pessoa (ou sessão de
> agente) entenda Battle Balls sem abrir `DESIGN.md` + `docs/prd.md` + `docs/brief.md` + três
> documentos de arquitetura + ~25 stories.
>
> **O que este documento NÃO é.** Não é design novo. Não reabre nenhuma decisão. Não decide nada
> pendente. Todo conteúdo aqui rastreia a uma fonte real, e onde a decisão está aberta o texto diz
> isso em vez de inventar um número provisório com cara de final.
>
> **Fonte de verdade, nesta ordem:** `docs/brief.md` (medições) → `DESIGN.md` (decisões travadas
> #1-#15) → `docs/prd.md` (RF-*, D-*, portões, riscos aprovados) → `README.md`. Quando você precisar
> do detalhe completo de algo, este documento aponta a seção — não a duplica.
>
> Data: 2026-07-29 · Autor: @pm (Morgan) · Fase corrente: **3 (Loop) autorizada, ainda não
> implementada**. Documentos irmãos: `docs/architecture.md` (stats/contato/RNG),
> `docs/architecture-e2.md` (arnês), `docs/architecture-e3.md` (a partida).

---

## 1. Visão e pitch

Battle Balls é um **PvP 2v2 síncrono, em tempo real, numa arena fechada de física de bolas**. Web,
mobile-first, paisagem. Cada jogador controla duas bolas — e "controlar" aqui quer dizer algo
diferente do usual.

Três escolhas definem o jogo, e as três são inseparáveis:

**Você não pilota a bola.** Cada personagem tem **IA de movimento autoral** e **ataque básico
automático**. O Golem anda reto e devagar na ameaça mais próxima; o Vex circula o inimigo a 165px e
mergulha quando o alvo fica ferido. Você reconhece o personagem pelo jeito que a bola anda. A
consequência é que seus polegares ficam livres — e é isso que permite a próxima escolha.

**Você mira habilidades com dois polegares, um por bola.** Esquerda pilota o personagem 1, direita
pilota o personagem 2. Não há seleção prévia: as duas mãos miram ao mesmo tempo. Arrastar do botão
define **direção e distância**; soltar casta. As duas bolas do time são dois canais de decisão
simultâneos, e o modelo 2v2 existe precisamente para justificar isso.

**Colisão empurra, não machuca.** Bater numa bola inimiga causa **zero dano** — desloca. E deslocar
o inimigo para fora do alcance dele **nega o dano dele**. A física não é uma camada de dano
alternativa; é a camada de *controle*. Não existe ring-out: a arena é fechada, com paredes que
ricocheteiam, e você não vence empurrando ninguém para fora. Vence eliminando as duas bolas
inimigas.

Em volta disso há uma partida com estrutura de jogo competitivo: **draft** de personagens, **builds
secretas**, **Bo5**, e **loja entre rodadas** com renda igual para os dois lados. A decisão econômica
é de *tempo* — comprar barato cedo ou apanhar poupando para o pico da rodada 3 — porque vencer uma
rodada **não** dá ouro. A primeira vitória não compra a segunda.

Roster alvo: **8 personagens**. Hoje existem dois.

*Fontes: `DESIGN.md` §1-§4; `docs/prd.md` §1; `docs/brief.md` §1-§2.*

---

## 2. Pilares de design

Três pilares. Eles não são slogans — são travas que qualquer decisão futura precisa respeitar.

### Pilar 1 — Cada personagem tem gameplay única

Não são só números diferentes: **movimento diferente, ataque diferente, regra de carga de ult
diferente**. Um personagem é um módulo que assina eventos do motor (`tick`, `collide`, `damage`,
`kill`, `cast`, `death`) e compõe efeitos reutilizáveis (`fx.*`). A liberdade vive na **composição**,
não em exceção dentro do loop de simulação.

O preço deste pilar está no Pilar do balanceamento (§9): liberdade total significa que **não existe
moeda comum de dano**, e portanto nenhuma fórmula responde "esse personagem está forte?". Só
medição responde.

### Pilar 2 — A decisão vem antes E durante

Draft e loja decidem o **potencial**; mira e timing decidem a **execução**. Um jogo em que só o draft
importa é um jogo de planilha; um em que só a execução importa não tem por que ter economia. Battle
Balls quer os dois eixos vivos na mesma partida.

### Pilar 3 — Física é a camada de controle

Redação vigente, **reformulada por D-07** (`docs/prd.md` §5) porque a redação original era absoluta e
já era falsa no código, o que a tornava não-auditável:

> **Colisão *passiva* causa 0 dano** — ela desloca. Deslocar o inimigo para fora do alcance dele nega
> o dano dele. **Dano por contato existe apenas dentro de janela explícita de habilidade, declarada
> no personagem** (ex.: o dash do Golem).

A palavra que carrega o pilar é **declarada**. A janela é um campo tipado do personagem
(`CharDef.contactWindows`), não código solto dentro de um handler de colisão. O motor recusa qualquer
dano causado durante a fase de colisão, e três camadas de auditoria (estática, dinâmica e de roster)
verificam a regra para qualquer personagem futuro. Assim o pilar continua sendo uma trava e não uma
frase de efeito com exceções acumuladas.

*Fontes: `DESIGN.md` §1, §5; `docs/prd.md` §4 (C1), §5 (D-07); `docs/architecture.md` §4.*

---

## 3. Como se joga — o fluxo de uma partida

```
DRAFT ─────▶ BUILDS ─────▶ RODADA ─────▶ [PLACAR] ─────▶ LOJA ─────▶ RODADA ... ─────▶ FIM
snake         secretas       Bo5                          entre           (alterna
aberto        e simultâneas  60Hz                         rodadas          o lado)
sem bans      timer 30s
```

> ⚠️ **Estado de implementação.** Só a **RODADA** existe em código hoje. Draft, builds, placar de
> Bo5, economia e loja são a **Fase 3 (E3)**, autorizada, arquitetada em `docs/architecture-e3.md` e
> quebrada em 8 stories (`docs/stories/e3.0` a `e3.7`, todas `Ready`) — **nenhuma implementada**. O
> fluxo abaixo é o design aprovado, não a build atual.

### Draft — snake aberto, sem bans

Personagens visíveis para os dois jogadores. Ordem **P1 → P2, P2 → P1** (cada jogador escolhe dois
personagens). **Sem bans**: um roster de 8 é pequeno demais para banir. A ordem do snake é *dado*
(`[0,1,1,0]`), não código, então mudar o formato não mexe em lógica.

Com o roster atual de 2 personagens o draft **degenera** — 4 escolhas de um pool de 2. Decisão do
usuário (2026-07-29): a estrutura de draft é construída completa, mas exercitada com **composição
fixa `[golem, vex]` para os dois jogadores** até a Fase 5 trazer mais personagens. A alternativa
(pool com repetição) produziria `[golem,golem]` vs `[vex,vex]`, uma composição que o arnês mediu em
7,6% de winrate e que um draft real nunca geraria.

### Builds — simultâneas e secretas

Para cada um dos seus dois personagens você escolhe **1 ativa de 2 + 1 passiva de 2**. São **4 builds
por personagem**. As escolhas são **simultâneas e secretas**, com timer de **30 segundos**, e são
**reveladas na largada da rodada** — o que move a leitura do adversário para dentro do combate em vez
de deixá-la toda no draft.

O segredo não é convenção de UI: é uma **projeção de estado** (`visaoPara`). A build não revelada do
oponente literalmente não está no objeto que a tela recebe. Registro honesto: num jogo local de
processo único isso é convenção reforçada pelo compilador, não garantia — quem abrir o devtools vê
tudo. A garantia real chega com o servidor autoritativo da Fase 4.

Se o timer estoura, entra uma **seleção default determinística** (primeira ativa + primeira passiva),
**sem penalidade** (D-06). O timeout produz uma *decisão explícita* no log, para que a telemetria
consiga contar quantas vezes a default entrou — que é exatamente o sinal que dispararia a mitigação
prevista ("se a default virar meta, randomizar a ordem de exibição das opções").

### Rodada

Simulação de 60Hz numa arena fechada. Vence quem eliminar as duas bolas inimigas. Detalhes em §5.

### Placar e loja — entre rodadas

**Bo5: primeiro a 3 vitórias de rodada.** Rodada empatada é **nula** — ninguém pontua, e a economia
avança normalmente (renda + juros creditados como em qualquer rodada). A partida tem **teto de 7
rodadas**; se ao fim ninguém tiver 3 vitórias, vence quem tiver mais, e igualdade de vitórias é
empate de partida. (D-02.)

A loja **só abre entre rodadas** — não antes da rodada 1 (decisão do usuário, 2026-07-29). Você entra
na primeira rodada com a renda dela guardada e sem ter comprado nada.

Também entre rodadas você pode **trocar de build, com custo em ouro** (D-01). É uma decisão econômica
que compete com a loja ("troco de ativa ou compro a Lâmina?"), e uma build trocada volta a ficar
oculta até a largada seguinte.

**O lado alterna a cada rodada.** O time 0 vence 54,72% ±4,0 no espelho medido, um intervalo que
exclui 50% — viés estrutural de ordem de resolução, e no cliente o humano é sempre o time 0. Alternar
o lado não corrige o viés, **cancela-o em expectativa** ao longo do Bo5, sem mover o comportamento da
simulação. É mitigação barata e reversível; a correção real (resolução simultânea de dano, ou ordem
derivada da seed) fica para quando a Fase 4 exigir.

### Quantas rodadas uma partida realmente tem

Medido por Monte Carlo de 200 000 partidas, com p(vitória)=50% e a taxa de empate medida de 2,8%:

| | Valor |
|---|---|
| Média de rodadas por partida | **4,31** |
| **Aberturas de loja por partida** | **3,31** |
| Distribuição | 3r 20,6% · 4r 34,9% · 5r 38,5% · 6r 5,6% · 7r 0,5% |

Duas leituras que importam para o design: a curva econômica é **mais curta do que o design supunha**
("Bo5 dá 4 compras" — na prática 3,3, e em 1 partida a cada 5 o jogador compra só **duas** vezes),
o que **aperta** o Risco #5; e o teto de 7 rodadas quase nunca é atingido (0,5%), confirmando que
D-02 é salvaguarda barata e não regra com peso.

*Fontes: `DESIGN.md` §4; `docs/prd.md` §3.1, §3.3, §5 (D-01, D-02, D-06); `docs/architecture-e3.md`
§1.1, §1.5, §2.4, §3, §4, §5, §14.*

---

## 4. Personagens

Dois existem. O alvo é oito. Os números abaixo vêm do **código** (`src/chars/golem.ts`,
`src/chars/vex.ts`), não das estimativas do `DESIGN.md` — os números dentro dos blocos de código do
`DESIGN.md` são **ilustrativos, não normativos** (`docs/prd.md` §7), e divergem dos reais. O
`DESIGN.md` também menciona de passagem personagens que não existem (`orbis`, `venom`, `ignis`): são
exemplos de escrita, não roster.

### Golem — a âncora

Massa alta, lento, quase não é empurrado e empurra muito. Só machuca praticamente encostado, então
**todo o jogo dele é chegar**. A ult carrega com dano *recebido*: quanto mais ele apanha, mais perto
fica do troco.

| | |
|---|---|
| HP / raio / massa | 190 · 24 · 3.2 |
| Velocidade máx. / esterço / drag | 105 · 1.3 · 0.30 |
| **Movimento** | `seek` na ameaça mais próxima, em linha reta. Sem inimigo vivo, segura o centro |
| **Ataque básico** | Corpo a corpo. cd 1100ms · dano 16 · alcance 18 (além do raio: precisa estar encostado) · knockback 320 |

**Ativas (escolhe 1):**
- **Impacto Sísmico** — cd 7000ms, alcance 140-280. Investe o próprio corpo na direção mirada. Abre
  uma **janela de dano por contato declarada** de 450ms: quem encostar leva **14 de dano e knockback
  520**, com trava de 250ms entre acertos no mesmo alvo. É a exceção do Pilar 3, e é declarada
  precisamente para ser auditável.
- **Tremor** — cd 8000ms, alcance 70-230. Racha o chão no ponto mirado, raio 110: **18 de dano**,
  **lentidão de 45% por 1,8s** e afastamento (knockback 300). A zona que aparece por 280ms é marca
  visual: não tem força nem dano.

**Passivas (escolhe 1):**
- **Âncora** — ignora **60% de todo knockback recebido**. Declarativa: um bônus de −0.60 em
  `knockbackTaken`, que soma com itens em vez de sobrescrevê-los.
- **Casca** — recebe **18% menos dano** enquanto estiver acima de metade da vida.

**Ult — Muralha.** Carga por **dano recebido** (`🩸`), limiar 110. Alcance 70-240. Ergue uma **parede
sólida** perpendicular à mira por 5 segundos, cortando a arena em duas. **Zero dano** — é controle de
espaço puro. (Nota do arnês: o bot não sabe avaliar controle de espaço, e essa omissão está declarada
em vez de silenciosa.)

### Vex — o orbitador

Nunca vai direto: circula o inimigo mais próximo a **165px**, que é exatamente a distância em que ele
acerta e o Golem não. Quando o alvo cai abaixo de 40% de vida, abandona a órbita e mergulha. Massa
baixa — qualquer empurrão o tira de posição, e fora de posição ele não causa dano nenhum. É a
demonstração viva do Pilar 3. A ult carrega com dano *causado*: agressão vira recurso.

| | |
|---|---|
| HP / raio / massa | 100 · 15 · 0.9 |
| Velocidade máx. / esterço / drag | 250 · 3.2 · 0.22 |
| **Movimento** | `orbit` a 165px do inimigo mais próximo; `seek` (mergulho) quando o alvo está abaixo de 40% de vida |
| **Ataque básico** | Projétil. cd 520ms · dano 6 · alcance 200 · velocidade 470 |

**Ativas (escolhe 1):**
- **Lâmina Fantasma** — cd 6000ms, alcance fixo 200. Projétil **perfurante** (atravessa tudo), raio 9,
  velocidade 620, vida 950ms: **14 de dano** e **lentidão de 40% por 1,5s**.
- **Deslize** — cd 5000ms, alcance 190-320. Reposicionamento puro a velocidade 1000, e sai com **+30%
  de dano por 2,5s**. Não causa dano nenhum no cast — é o slot que um estimador genérico erraria.

**Passivas (escolhe 1):**
- **Predador** — causa **28% mais dano** em alvos abaixo de metade da vida.
- **Fantasma** — ganha **25% de velocidade** enquanto estiver abaixo de 40% da vida.

**Ult — Convergência.** Carga por **dano causado** (`💥`), limiar 130. Alcance 80-300. Vórtice de raio
190 que **puxa** os inimigos (força 2600) e **detona 1,3s depois** por 24 de dano. A atração divide
pela massa, então o Golem resiste naturalmente — a mesma física que faz o Vex ser frágil o torna
vulnerável ao próprio vórtice de outro Vex.

### A regra do 9º personagem

**Nenhum personagem novo entra enquanto os 8 não estiverem dentro da faixa de 45-55% de winrate.**
(Decisão #12 / RF-50.) É uma trava de escopo autoexecutável: o roster é elástico por design, e essa
regra é o que permite cortar 8 → 4-5 personagens se o indicador de escopo (Risco #3) disparar sem que
o corte pareça improviso.

*Fontes: `src/chars/golem.ts`, `src/chars/vex.ts`; `DESIGN.md` §2, §6; `docs/prd.md` §3.2, §3.6
(RF-50), §7; `docs/architecture-e3.md` §4.1.*

---

## 5. Combate e física

### Arena e vitória

Arena 2D fechada de **960×540**, paredes sólidas com ricochete. **Sem ring-out** — a arena não tem
buraco, e a física não vence a rodada por você. **Vitória da rodada = eliminar as 2 bolas inimigas**
(HP zerado).

### Morte súbita

Aos **60 segundos** a arena começa a **encolher**, forçando o confronto. Existe também um teto duro
de 150s no código que declara empate — **regra de partida não documentada no `DESIGN.md`**, sinalizada
como conflito documental C4 (`docs/prd.md` §4) e não resolvida: cabe ao usuário dizer se é regra de
jogo ou salvaguarda de engenharia.

**Situação medida da morte súbita:** ela nunca dispara. Zero de 40 rodadas na Fase 0 (máximo 19,5s);
0,0% em milhares de rodadas com o bot heurístico na Fase 2; e **0,0% até mesmo com o HP triplicado**
(mediana 37,4s, p90 42,7s) nas medições feitas para desenhar a Fase 3. O gatilho do **Risco #6**
("morte súbita é código morto") portanto dispara. A decisão — aceitar como rede de segurança, baixar
o limiar, ou algo mais — **está aberta e é medida na Fase 3 com humano no controle** (P3.2). Este
documento não escolhe.

### Dano

**Ataque básico automático**, disparado pela IA, com **cooldown, alcance e tipo** (corpo a corpo ou
projétil) próprios de cada personagem. Duas regras que vieram de bugs achados pelo arnês e que hoje
são requisito:

- **Alcance é medido superfície a superfície**, não centro-menos-raio-do-alvo. Sem isso, dois Golems
  de raio 24 nunca chegavam a menos de 48px com alcance de 42px — matematicamente inatingível,
  travava 20% das rodadas.
- **Projéteis usam intercepção de 1ª ordem** (duas iterações). Sem isso, Vex contra Vex era empate
  eterno. E a correção **preserva a intenção do design**: empurrar o alvo continua fazendo o tiro
  errar.

### Colisão

**Colisão passiva causa 0 dano** — só empurrão. É o Pilar 3, e o motor o **impõe**: durante a fase de
colisão do tick, qualquer tentativa de causar dano é recusada. Dano por contato só existe dentro de
uma janela declarada no personagem (hoje: só o dash do Golem). Limitação conhecida, registrada e não
bloqueante: dano aplicado via efeito de 1 tick ainda atravessaria a checagem — fechar isso é auditoria
de roster em escala.

### Ult

Regra de **carga variável por personagem** — parte da identidade, não parâmetro de balanceamento. As
condições possíveis são dano causado (`💥`), dano recebido (`🩸`), tempo (`⏱`), abate (`☠`) e casts
(`⚡`). A barra exibe o **ícone da condição**, para o jogador entender *por que* ela não está enchendo.

Nota de dívida técnica com consequência de design (RF-18): a **unidade do limiar de ult é implícita** —
o mesmo campo numérico significa dano acumulado, milissegundos ou contagem, dependendo da regra de
carga. Funciona com 2 personagens; é fonte garantida de erro com 8.

### Como os stats são calculados

Uma única fórmula, aprovada em **D-04** e implementada literalmente:

```
valor = base × (1 + Σbônus_passiva + Σbônus_item)
```

Bônus **somam entre si** e o total multiplica a base **uma única vez**. Retorno linear e previsível;
dois itens iguais não explodem; e quando a matriz de winrate sai da faixa, o arnês consegue atribuir
causa. Multiplicativo composto criaria combinações que só a medição explicaria, e a fase caro do
projeto é a Fase 5.

Há **dois níveis de teto**, e confundi-los é erro:
- **ΣMIN / ΣMAX** — teto de **balanceamento**, por campo. É regra de jogo. Mexer é decisão de produto.
- **clamp absoluto** — rede de segurança de **motor** contra valores que quebram a simulação
  (tunelamento, knockback que não decai, imunidade a empurrão). Mexer é decisão de arquitetura e
  precisa de argumento numérico.

Os números de cada teto estão em `docs/architecture.md` §1.4, com a justificativa de cada um. O
próprio documento registra que os tetos de balanceamento (`dmg`, `maxHp`, `range`, `mass`) são
raciocínio, não medição — e que a decisão #13 manda medir. A Fase 2 instrumentou contadores de quantas
vezes cada clamp morde: **teto que nunca morde é rede barata; teto que morde toda hora virou regra de
jogo por acidente** e volta como decisão de produto.

### Determinismo

A simulação é **determinística**: tick fixo de 60Hz, PRNG com seed, sem `Math.random` em `sim/`, e
`sim/` não importa de `chars/`, `bot/` nem `client/` (o registro de personagens é injetado). Isso não
é preferência de engenharia — é o invariante que sustenta três coisas de produto: **servidor
autoritativo**, **replay** e **arnês de balanceamento**. É a única regra arquitetural que o projeto
declara inegociável.

### Duração da rodada

| Cenário | Mediana |
|---|---|
| Fase 0, bot placeholder, 40 seeds | **13,8s** (min 12,3s · max 19,5s) |
| Fase 2/3, bot heurístico, n=600 | **14,5s** (p10 13,2s · p90 24,3s · max 35,1s) |
| Alvo aprovado (**D-05**) | **mediana entre 25s e 35s** |

O jogo hoje é **1,7× a 2,4× mais rápido** que o alvo. O ajuste **não foi feito de propósito**: D-05
diz que a mediana-alvo é **fixada por medição na Fase 3, com humano no controle** — é decisão de
produto medida, não tuning técnico antecipado. O valor final **não está decidido** e este documento
não o chuta.

A alavanca existe e tem resposta conhecida e quase linear (medida: `maxHp` ×1,5 → 20,9s; ×2,0 →
27,1s; ×3,0 → 37,4s; `dmg` ×0,60 → 24,2s; ×0,40 → 35,2s). Escalar HP e reduzir dano **não são a mesma
coisa**: escalar HP mantém a velocidade das bolas e aumenta o número de ciclos de habilidade por
rodada, enquanto reduzir dano achata o valor de todo item de dano. Como o Risco #5 é exatamente "o
item precisa ser sentido dentro da rodada", a recomendação de arquitetura é **HP como alavanca
primária, dano como ajuste fino** — o *valor* segue sendo D-05.

*Fontes: `DESIGN.md` §2; `docs/prd.md` §3.2, §4, §5 (D-04, D-05, D-07), §6; `docs/brief.md` §3;
`docs/architecture.md` §1.4, §1.5, §4; `docs/architecture-e3.md` §1.1, §1.4, §9.1.*

---

## 6. Economia e loja

### As regras que não se discutem

Três, todas da decisão #7, e todas com um "por quê" que é o núcleo do design econômico:

1. **Renda igual para os dois jogadores**, por rodada.
2. **Juros sobre o ouro guardado**, com teto.
3. **Vencer a rodada não dá ouro.**

A terceira é a mais importante: ela **elimina o snowball**. A primeira vitória não compra a segunda.
A decisão econômica deixa de ser "quanto eu ganhei" e passa a ser **"quando eu gasto"** — comprar
barato cedo, ou apanhar poupando para o pico da rodada 3-4. Existe uma invariante testável escrita
para impedir que o snowball volte por conveniência de balanceamento: *para toda partida, o ouro
recebido por um jogador é função apenas do índice da rodada e do saldo guardado.*

Ouro é **sempre inteiro**, com aritmética inteira nos juros. Motivo concreto: soma de ponto flutuante
não é associativa, e um saldo fracionário produziria "13,999999999999998 de ouro" para um item de 14 —
um botão de compra desabilitado sem motivo visível, que é o pior tipo de bug de economia porque parece
regra.

### Os números — todos provisórios (D-09)

**D-09 decidiu não decidir.** Quantidade e preço dos itens, renda exata por rodada e taxa de juros são
**parâmetros de tuning, medidos na Fase 3 com humano no controle**, junto de D-05. Fixá-los antes
seria raciocínio onde a decisão #13 manda medição. Valores provisórios são permitidos **desde que
marcados como provisórios**, e a marcação é estrutural: eles moram num único arquivo, com aviso no
topo, e nada os lê senão através de um objeto de parâmetros.

Os provisórios de partida da Fase 3 — **nenhum deles é decisão**:

| Parâmetro | Provisório | Origem |
|---|---|---|
| Ouro inicial | 0 | — |
| Renda por rodada | `[4, 5, 6, 7, 8]` | o **exemplo literal** do `DESIGN.md` §4 — exemplo, não decisão |
| Renda depois da 5ª rodada | repete o último valor (8) | leitura conservadora; D-02 permite 7 rodadas e a tabela tem 5 entradas. Confirmação pendente |
| Juros | 1 por cada 10 de ouro guardado, teto 3 | o teto existe para que "guardar" não domine "gastar" numa curva de 3,3 compras |
| Preço da troca de build | 5 | D-01 — se ficar baixo canibaliza a loja; se ficar alto é feature morta |

### A loja — duas trilhas de quatro

| Trilha física | Trilha de combate |
|---|---|
| **Chumbo** — +massa | **Lâmina** — +dano |
| **Turbina** — +velocidade | **Couraça** — +HP |
| **Lixa** — −atrito | **Luneta** — +alcance |
| **Borracha** — +elasticidade | **Relicário** — −cooldown |

A trilha física existe porque a camada de física **não tem dano próprio** — sem poder de compra, ela
não teria como crescer. Cada item é dado: um id, um nome, uma trilha, um bloco de bônus, um preço e um
texto. O nome, o campo e o sinal moram na mesma linha do mesmo arquivo, deliberadamente, porque alguém
"corrigindo" um sinal reprojeta uma fase inteira sem saber.

**Item por personagem, não por time** (decisão do usuário, 2026-07-29). Motivo medido: o mesmo item
vale coisas radicalmente diferentes em personagens diferentes — a Turbina rende +18,8pp de winrate no
Vex e nada no Golem. Se o item fosse do time, essa diferença viraria média e a decisão do jogador
perderia a parte interessante: **quem** recebe.

### Duas armadilhas de leitura, escritas para não serem "corrigidas"

- **Lixa** é apresentada como "−atrito" ao jogador, e o bônus interno é **positivo**, porque o campo
  representa a fração de velocidade *retida* por segundo.
- **Relicário** é apresentado como "−cooldown", e o bônus interno também é **positivo** num campo de
  velocidade de recarga. Consequência que aparece na tela: **dois Relicários dão −33%, não −40%.**
  Retorno decrescente natural, que é exatamente o que D-04 quer, e sem exceção na fórmula.

O texto que o jogador lê e o que o motor executa **são coisas diferentes de propósito**, e o catálogo é
o único lugar onde as duas se encostam. Consequência de UI que precisa estar escrita: se o jogador
comprar dois itens do mesmo campo e o teto morder, ele **paga por um bônus que não recebe** — a tela
tem de mostrar o valor **efetivo**, calculado pela mesma função do motor, nunca por uma fórmula
reimplementada no cliente.

### Escopo do +alcance

**D-03: a Luneta afeta só o ataque básico na v1.** Motivo: mexer no alcance de habilidade altera
simultaneamente a **UX do arrasto** (a distância que o polegar puxa muda de significado) e o
balanceamento — duas variáveis num item só. Risco assumido e registrado: a Luneta fica fraca para
personagens cujo dano principal vem da ativa (o dano do Vex vem da Lâmina, 14, não do básico, 6). A
medição confirmou: +2,99pp no Vex, dentro do ruído. Mitigação: preço menor, e revisão na Fase 5 com
telemetria de winrate-por-item.

### O que a medição já diz sobre os itens

Com um probe uniforme de +0,20 em cada campo, contra a mesma linha-base (controle: 50,60%, ou seja o
instrumento não injeta assimetria). **Isto não é preço nem magnitude proposta** — é o teste de "quais
itens têm efeito":

- **A trilha física não nasce morta — ela nasce concentrada.** Turbina e Lixa juntas valem mais para o
  Vex do que a Lâmina vale para o Golem, e as duas são físicas.
- **A Borracha é o item mais fraco do catálogo** nas duas leituras (ambas dentro do ruído). Ela é, por
  design, "o item mais distintivo da trilha física", e foi o único cuja existência custou uma story
  inteira de dívida técnica. Registrado como **sinal precoce do Risco #1, não conclusão**: o bot não
  empurra ninguém de propósito, e elasticidade é justamente a propriedade cujo valor depende de usar a
  colisão como jogada.
- **A Couraça está bloqueada** por um bug medido (REL-001): a bola nasce com HP de linha-base e HP
  máximo inflado, e como cinco comportamentos do jogo usam a *fração* de vida como gatilho, o item de
  vida **inverte de sinal** — um Vex com +50% de HP perde 18,86pp mais rodadas do que sem o item. A
  correção é pré-requisito bloqueante e é o **primeiro** passo da Fase 3, antes de a loja existir.
- **Nada disso é taxa de compra.** O indicador do portão (P3.3) mede o que **o humano compra**, não o
  que rende winrate contra o bot. Os dois números podem divergir, e a divergência seria informação.

### Fora do escopo da loja (registrado para não ser reinventado)

Venda de item, item único por personagem, item que remove item, item com efeito ativo. Nenhum tem
requisito.

*Fontes: `DESIGN.md` §4, §7; `docs/prd.md` §3.3, §5 (D-01, D-03, D-04, D-09), §6; `docs/architecture.md`
§1.6, §1.7, §1.8, §2, §3; `docs/architecture-e3.md` §1.2, §1.3, §6, §7, §14.*

---

## 7. Input e plataforma

**Web, mobile-first, paisagem.** A arena ocupa a maior parte da tela; os controles são **4 botões
semitransparentes** nos cantos inferiores.

```
┌──────────────────────────────────────────────┐
│ ♥♥♥♥♥♥♥♥ Golem·Vex          Golem·Vex ♥♥♥♥♥♥ │
│                                              │
│         ●          ○                         │
│              ●        ○                      │
│                                              │
│  ◍ativa                          ativa◍      │
│    ◍ult                            ult◍      │
└──────────────────────────────────────────────┘
   polegar E                        polegar D
```

- **Esquerda = bola 1, direita = bola 2.** Cada mão pilota uma bola. **Sem seleção prévia** — os dois
  polegares podem mirar ao mesmo tempo. Esta é a decisão que justifica todo o modelo 2v2, e é a única
  do projeto que nenhum documento poderia validar: só protótipo na mão.
- **Arrastar do botão define direção E distância.** Quanto mais você puxa, mais longe o efeito cai
  (a distância interpola entre o alcance mínimo e máximo da habilidade).
- **A mira aparece imediatamente** na bola correspondente. Feedback local instantâneo, mesmo que na
  Fase 4 o efeito só saia ~100ms depois.
- Atalhos de teclado (`Q W` / `O P`, `R`, espaço) são **ferramenta de desenvolvimento**, não requisito
  de produto.

**Estado:** a Fase 1 (Sensação) foi **aprovada pelo usuário** por julgamento humano — os dois
polegares funcionam sem atrapalhar um ao outro. Portão sem métrica substituta, como o design manda.

**Dívida registrada:** o indicador instrumentado que acompanharia esse julgamento (RF-36: % de rodadas
em que o jogador usou só uma das duas mãos, taxa de cast desperdiçado) **nunca foi instrumentado** —
não existe telemetria alguma no cliente hoje. Isso não reabre o portão de E1, e a proposta em curso é
que ele entre de carona no substrato de telemetria da Fase 3.

*Fontes: `DESIGN.md` §3; `docs/prd.md` §2 (E1), §3.4, §6 (Risco #4); `docs/architecture-e3.md` §10.3,
§14/R-07.*

---

## 8. Multiplayer e rede

**Fase 4. Nada disto existe em código.** O que segue é o modelo aprovado (decisão #4).

**Servidor autoritativo.** Node + WebSocket, importando a **mesma** simulação que o cliente e o arnês
rodam. Uma máquina define a verdade.

**Input delay de ~100ms** (6 ticks). Sem rollback, sem ponto fixo, sem resimulação. O modelo funciona
por causa de uma propriedade do design: **o input é discreto**. Você não dirige a bola continuamente —
você emite casts. Um atraso de 100ms num cast é invisível; num movimento contínuo seria intolerável.
É o Pilar "você não pilota a bola" pagando dividendo no netcode.

```
cliente:   cast(Muralha, 42°) @tick 300
   ↓ (~40ms)
servidor:  agenda @tick 306, simula 60Hz, faz broadcast do estado
   ↓
clientes:  interpolam entre snapshots
```

O jogador vê a mira na hora (feedback local); o efeito sai em ~100ms.

**Consequências de graça:** anti-cheat não é subsistema próprio, é consequência do modelo — o cliente
não decide dano. E **replay = seed + linha do tempo de inputs**, o que se estende naturalmente à
partida inteira: `seed da partida + lista de decisões + comandos por rodada`.

**Sala por link.**

> ⚠️ **Modelo morto, registrado para não voltar por engano.** O plano original era o servidor
> pré-computar a batalha inteira e enviar um replay. Isso morreu no instante em que entrou input ao
> vivo: o servidor não pode conhecer o futuro.

Hoje o cliente roda com `INPUT_DELAY_TICKS = 0` — desvio consciente da Fase 0, registrado, e ativá-lo
em 6 é pré-condição do portão da Fase 4.

*Fontes: `DESIGN.md` §5; `docs/prd.md` §1, §2 (E4), §3.5; `docs/architecture-e3.md` §2.3, §2.5.*

---

## 9. Bot e balanceamento

### A filosofia: medição, não raciocínio

Esta é a **decisão #13**, e ela é consequência direta do Pilar 1. Liberdade total de design significa
que **não existe moeda comum de dano**: não há como converter "18 de dano em área com lentidão" e
"parede sólida por 5 segundos" na mesma unidade. Portanto **nenhuma fórmula responde "esse personagem
está forte?"**. Só medição responde.

Duas peneiras:

**Grossa — automática.** Um bot heurístico joga os dois lados: mira onde a chance de acerto é maior,
casta quando o valor esperado passa um limiar, com **jitter** para imitar erro humano. O bot **não
precisa jogar bem** — precisa jogar **igual nos dois lados**, porque **assimetria é o que está sendo
medido**. Alerta fora da faixa de **45-55%**.

**Fina — jogadores reais.** Telemetria: winrate por personagem, por build e por item; taxa de pick;
duração média da rodada. Fase 5.

E o bot rende **três usos pelo preço de um** (decisão #14): balanceamento, modo treino e oponente
solo. É o que amortiza o custo do arnês.

### O arnês existe e passou

`npm run balance` está construído (Fase 2, 9 stories, todas `Done`). O portão da Fase 2 **não foi
julgamento** — foi verificação por comando, e é o portão mais objetivo que o projeto teve até agora:

| Critério | Resultado |
|---|---|
| Determinismo (40/40 seeds, hash idêntico em execução dupla) | ✅ verde |
| **Teste de mutante:** Vex com +30% de dano é reportado fora de 45-55%? | ✅ **79,00% ±1,79** — detectado com folga |
| **Controle negativo:** com 0% de mutação a matriz fica dentro da faixa? | ✅ **50,10% ±1,79** |
| n por confronto ≥ 800 | ✅ executado com **n=3000** |
| Determinismo preservado com o bot no loop | ✅ 5 seeds, replay sem bot |

O teste de mutante é o coração do portão: *"o arnês existe"* não é critério; *"o arnês detecta um
personagem que eu quebrei de propósito"* é. E o controle negativo foi acrescentado para não aprovar
um instrumento que alerta sempre.

### Regras do instrumento

- **n ≥ 800 lutas por confronto** é o piso (poder de 80% para distinguir 55% de 50%). O design pede
  10k, que dá ±1pp. As 40 seeds da Fase 0 dão **±15pp e não servem para balancear** — servem como
  teste de fumaça de determinismo. Na prática, a execução do portão usa n ≥ 2000, porque no piso de
  800 o veredito pode sair inconclusivo por amostragem.
- **Troca de lado é obrigatória.** Metade das seeds com uma composição no time 0, metade invertida. Sem
  isso o viés de lado contamina tudo: o mesmo controle que dá 49,23% com troca de lado dá 73% sem.
- **Espelho não é célula da matriz — é diagnóstico.** Uma composição contra ela mesma é imune à troca
  de lado e mede o **viés de lado**, não balanceamento. O CLI reporta os espelhos numa seção própria,
  com a expectativa explícita de que eles **não** dão 50%.
- **O bot tem stream de PRNG próprio** (D-08), semeado a partir da seed da partida e separado do PRNG
  da simulação. Se o jitter do bot sacasse do PRNG da simulação, "replay = seed + linha do tempo de
  inputs" deixaria de valer entre versões do bot — e isso quebraria a Fase 4 antes de ela existir.
- **O preset do bot é congelado por versão.** Ele não pode ser ajustado "para o oponente ficar mais
  divertido": o modo solo usa um preset nomeado separado, e a telemetria registra qual preset jogou.

### Duas ambiguidades do instrumento que seguem abertas

- **"28 confrontos"** (RF-47, P5.1) só fecha aritmeticamente como C(8,2), que é um formato **1v1**. O
  jogo é 2v2 com times de personagens distintos, e aí a tradução não sobrevive: os confrontos legais
  de 2v2 são **210**, e pares de composição com repetição são **378**. O CLI nasceu genérico, com
  gerador de plano plugável, justamente para não travar numa leitura. **A decisão é do @pm e precisa
  estar tomada antes de P5.1 ser cobrado** — a consequência é 30× de tempo de execução.
- **O gatilho do Risco #1b parece ser por personagem, não global.** O indicador aprovado diz "físico
  < +2pp **e** dano > +5pp → a trilha física nasce morta", mas os deltas medidos **invertem entre
  personagens**: massa é recurso para quem precisa chegar (Golem), dano é recurso para quem já acerta
  (Vex). Um gatilho global agregaria dois efeitos de sinais opostos numa média que não descreve
  nenhum. A regra de agregação foi devolvida para a Fase 5, quando o gatilho for cobrado com o roster
  de 8.

### O achado do arnês que virou fato de design

A hipótese de que os **17,5% de empates** da Fase 0 eram artefato de times **perfeitamente
espelhados** foi confirmada: com roster heterogêneo e o bot heurístico a taxa cai para **2,8%**. D-02
(rodada empatada é nula, teto de 7 rodadas) segue valendo, agora como salvaguarda barata em vez de
regra com peso.

*Fontes: `DESIGN.md` §6; `docs/prd.md` §2 (E2), §3.6, §5 (D-08), §6; `docs/architecture-e2.md` §1.2,
§1.3, §2, §3, §4, §5, §9.*

---

## 10. Roadmap de fases

**O método é decisão travada (#15): cada fase tem um portão, e não se avança sem passar.** Os
critérios exatos de cada portão estão em `docs/prd.md` §2 — não os duplico aqui de propósito, porque
duplicar portão é o jeito mais rápido de criar duas versões dele.

| Fase | Entrega | Pergunta do portão | Estado |
|---|---|---|---|
| **E0 — Núcleo** | Simulação pura, Golem e Vex, render Canvas, mira por arrasto, arnês de determinismo | *Mirar habilidades em bolas que andam sozinhas é divertido?* | ✅ **APROVADA** (2026-07-28) — julgamento humano. É a pergunta que validava ou invalidava as outras 60 decisões |
| **E1 — Sensação** | Layout mobile paisagem, 4 botões, mira por arrasto em celular real | *Os dois polegares funcionam sem atrapalhar um ao outro?* | ✅ **APROVADA** — julgamento humano. Dívida: RF-36 nunca foi instrumentado |
| **E2 — Arnês** | Bot heurístico simétrico + CLI de winrate com alerta fora de 45-55% | *Consigo detectar um personagem quebrado sem jogar?* | ✅ **CONCLUÍDA** (2026-07-29) — portão **verificável**, 9 stories `Done`, mutante detectado a 79,00% |
| **E3 — Loop** | Draft + builds secretas + Bo5 + loja + economia, local contra o bot | *Dá vontade de jogar outra partida?* | 🔄 **EM ANDAMENTO** — desbloqueada, arquitetada (`docs/architecture-e3.md`), 8 stories `Ready` (`e3.0`-`e3.7`), **zero implementadas** |
| **E4 — Rede** | Servidor autoritativo + input delay + sala por link | *1v1 entre dois celulares é fluido?* | ⬜ não iniciada |
| **E5 — Conteúdo** | 8 personagens, itens, telemetria, ajuste por medição | *A matriz de winrate fecha em 45-55%?* | ⬜ não iniciada — é a maior fatia do escopo (6-8 semanas estimadas) |
| **E6 — Meta** | Ranked, progressão, polimento, som, arte | portão ainda não escrito | ⬜ não iniciada |

### Dois tipos de portão, e a diferença importa

**Portões de julgamento humano** (E0, E1, E3): não existe métrica que os substitua, e inventar uma
inverteria a decisão #13. O que existe são **pré-condições verificáveis** sem as quais o julgamento
não pode ser dado (ex.: "foi jogado em celular real, por uma partida completa, sem erro de console") e
**evidência instrumentada** que informa o julgamento sem decidi-lo.

**Portões verificáveis** (E2, E5): passam ou reprovam por comando. O de E5 é o mais objetivo do
projeto — a matriz de 45-55%.

### Um aprendizado de método que vale para toda fase futura

O arnês headless **prova a simulação, não prova o cliente**. Um bug que derrubava o módulo inteiro do
cliente na inicialização passou invisível por todos os testes automatizados e só apareceu abrindo o
navegador. Por isso **toda fase com entrega de cliente tem verificação visual própria** como
pré-condição de portão, não herdada do arnês.

### O indicador de escopo

O escopo somado (física + liberdade total + PvP síncrono + economia + mira + 8 personagens) é ~12
meses de trabalho, e o Risco #3 vigia isso: **dias de calendário da fase ÷ estimativa** do
`DESIGN.md`. Acima de **2×** → reabrir corte de escopo. O corte natural é **roster 8 → 4-5**, já que a
regra do 9º personagem prova que o roster é elástico por design.

### O que a Fase 3 vai construir, na ordem

Oito passos, cada um com verificação própria. Sete deles preservam o **hash de referência** da
simulação bit a bit; **um só** está autorizado a movê-lo, e é o do ajuste de D-05, com re-baseline
registrado no mesmo commit:

1. **Corrigir REL-001** — HP nasce do stat, desbloqueando a Couraça. Hash-neutro hoje (medido).
2. **Catálogo da loja** — 8 itens, agregação em ordem canônica.
3. **Camada de partida** — draft, builds, Bo5, empate, economia, projeção de segredo.
4. **Política de partida do bot** — draft, build e compra, com stream de PRNG próprio.
5. **Cliente** — o fluxo completo, e o bot heurístico substituindo o placeholder.
6. **Telemetria** — os eventos que produzem as evidências do portão.
7. **Ajuste de D-05** — o único passo que muda o jogo, e por isso vem *depois* de saber medir.
8. **Revisão dos provisórios de D-09** com os dados coletados.

A ordem é defendida em três pontos: a correção de REL-001 vem **antes** da loja (se vier depois,
existe uma janela em que a Couraça está no catálogo com o sinal invertido, e qualquer medição feita
nessa janela é lixo); a telemetria vem **antes** do ajuste (ajustar antes de saber medir é exatamente
o "tuning técnico feito antes" que o método proíbe); e o bot de partida vem **antes** do cliente
(descobrir um bug de política de compra dentro do laço de render é várias vezes mais caro).

*Fontes: `DESIGN.md` §9; `docs/prd.md` §2, §6; `docs/brief.md` §3; `docs/architecture-e3.md` §9.2,
§12.*

---

## 11. Fora de escopo

### Fora de escopo até a Fase 6 — não escrever requisito, não estimar, não prototipar

- Meta-progressão fora da partida
- Ranked
- Desbloqueio de personagens
- Monetização
- Direção de arte
- Som
- Nome definitivo do jogo ("Battle Balls" é provisório)
- **O 9º personagem** — travado por regra, não por prioridade: só existe quando os 8 estiverem em
  45-55%

### Fora de escopo permanentemente — registrado para não voltar por engano

- **Servidor pré-computar a batalha e enviar replay.** Morreu quando entrou input ao vivo: o servidor
  não pode conhecer o futuro.
- **Rollback / resimulação no netcode.** Desnecessário porque o input é discreto.
- **Ring-out.** A arena é fechada; a física é controle, não eliminação.
- **Dano por colisão passiva.** É o Pilar 3.

### Fora do escopo da loja na Fase 3

Venda de item, item único por personagem, item que remove item, item com efeito ativo. Nenhum tem
requisito escrito.

*Fontes: `DESIGN.md` §5, §8; `docs/prd.md` §1; `docs/architecture-e3.md` §7.5.*

---

## 12. Decisões e leituras que seguem abertas

Listadas aqui para que ninguém as confunda com decisão fechada. Nenhuma delas é decidida por este
documento.

| # | O que está aberto | Mecanismo já definido | Quando fecha |
|---|---|---|---|
| **D-05** | O **valor** da mediana-alvo da rodada. A *faixa* (25-35s) está aprovada; o número não | Escala global de HP como alavanca primária, dano como ajuste fino. Resposta medida e quase linear | **Por medição na Fase 3**, com humano no controle (evidência P3.1) |
| **D-09** | Preços e magnitudes dos itens, renda exata, taxa de juros, preço da troca de build | Todos os valores existem como provisórios explicitamente marcados, num único arquivo | Por medição na Fase 3, com os dados da telemetria |
| **R-05 / Risco #6** | A morte súbita é **código morto** ou os números de combate estão errados? | Medido: 0% de rodadas atingem 60s, mesmo com HP triplicado. O gatilho disparou | Decidido na Fase 3, **depois** de medir com humano no controle (P3.2). As saídas são aceitar como rede de segurança, baixar o limiar, ou reprojetar |
| **R-04 / Risco #1b** | A **regra de agregação** do gatilho da trilha física: global ou por personagem | Medido que os deltas invertem de sinal entre personagens. O CLI já reporta o par por personagem | Fase 5, quando o gatilho for cobrado com o roster de 8 |
| **R-03** | O que **"28 confrontos"** quer dizer no portão da Fase 5 (28 / 210 / 378) | CLI genérico, com gerador de plano de confrontos plugável | Antes de P5.1 ser cobrado |
| **C4** | O teto duro de 150s que declara empate é **regra de jogo** ou **salvaguarda de engenharia**? | Existe no código, não existe no `DESIGN.md`. Do ponto de vista da partida, é o mesmo evento que o duplo-KO | Aberto — cabe ao usuário |
| **RF-18** | A **unidade do limiar de ult** é implícita no tipo | Funciona com 2 personagens; é fonte garantida de erro com 8 | Antes do roster crescer (Fase 5) |
| **RF-36** | O indicador do Risco #4 nunca foi instrumentado | O substrato de telemetria da Fase 3 o fecha de carona | Decisão de escopo da Fase 3 |

---

## 13. Glossário de termos de design

Só termos de **jogo**. Termos de engenharia (determinismo, golden hash, camadas de stat, streams de
PRNG) ficam na Bíblia de Desenvolvimento, escrita separadamente.

| Termo | Significado neste projeto |
|---|---|
| **Ativa** | Habilidade que **o jogador** dispara e mira, por toque + arrasto. Cada personagem tem 2; você escolhe 1 no draft |
| **Ataque básico** | Golpe automático disparado pela IA, com cooldown, alcance e tipo próprios. **Fixo** por personagem — não se escolhe |
| **Bo5** | *Best of five* — primeiro a **3 vitórias de rodada** vence a partida. Com D-02, o teto é 7 rodadas |
| **Build** | A combinação de 1 ativa + 1 passiva de um personagem. São **4 builds por personagem**. Escolhida em segredo, revelada na largada |
| **Carga de ult** | A condição que enche a barra de ult, **variável por personagem** (dano causado, dano recebido, tempo, abate, casts). A barra mostra o ícone da condição |
| **Draft snake** | Ordem de escolha em ziguezague — P1 → P2, P2 → P1 — para que quem escolhe primeiro não leve as duas melhores opções |
| **Draft aberto** | Os personagens escolhidos são **visíveis** aos dois jogadores durante o draft. Só a *build* é secreta |
| **Ban** | Vetar um personagem antes do draft. **Não existe** neste jogo: um roster de 8 é pequeno demais para banir |
| **Faixa 45-55%** | A faixa de winrate dentro da qual um personagem é considerado balanceado. Fora dela, o arnês alerta |
| **Janela de contato** | O intervalo declarado, dentro de uma habilidade, em que encostar no inimigo causa dano. É a **única** exceção ao Pilar 3, e é campo do personagem |
| **Juros** | Bônus de ouro proporcional ao ouro **guardado**, com teto. É o que faz poupar ser uma jogada |
| **Knockback** | Empurrão. Causa deslocamento, e deslocamento nega alcance. Não é dano |
| **Morte súbita** | Aos 60s a arena **encolhe**, forçando o confronto. Hoje nunca dispara (ver §12) |
| **Negação de DPS** | Ganhar dano não causando dano: empurrar o inimigo para fora do alcance dele. É o Pilar 3 em uma frase |
| **Passiva** | Efeito automático, sem input. Cada personagem tem 2; você escolhe 1 no draft |
| **Renda** | Ouro creditado a cada rodada, **igual para os dois jogadores**. Vencer a rodada não adiciona nada |
| **Ring-out** | Vencer empurrando o inimigo para fora da arena. **Não existe** neste jogo: a arena é fechada |
| **Rodada nula** | Rodada que terminou em empate (duplo-KO, ou teto de tempo): **ninguém pontua**, e a economia avança normalmente |
| **Snowball** | Vantagem que se autoalimenta — vencer dá recurso que faz vencer de novo. **Eliminado por design**: vencer não dá ouro |
| **Trilha física / trilha de combate** | As duas metades da loja. Física (massa, velocidade, atrito, elasticidade) cresce a camada de controle; combate (dano, HP, alcance, cooldown) cresce a de dano |
| **Ult** | Habilidade definitiva, **fixa** por personagem, mirada pelo jogador quando a barra enche |

---

## Anexo — Onde procurar o detalhe completo

| Você quer | Vá para |
|---|---|
| As 15 decisões travadas, com o trade-off de cada uma | `DESIGN.md` §1-§9 e `docs/brief.md` §2 |
| Os 50 requisitos funcionais numerados, com a origem de cada um | `docs/prd.md` §3 |
| As 9 decisões de produto (D-01 a D-09), com o risco declarado de cada recomendação | `docs/prd.md` §5 |
| Os 7 indicadores de risco, com gatilho e fase | `docs/prd.md` §6 |
| O critério **exato** de cada portão de fase | `docs/prd.md` §2 |
| A dívida de arquitetura que travava a Fase 3, e como foi paga | `docs/prd.md` §4 e `docs/architecture.md` |
| Os tetos por campo que D-04 exige, com justificativa numérica | `docs/architecture.md` §1.4 |
| Como o bot decide, e como o arnês mede | `docs/architecture-e2.md` |
| Como a partida (draft/Bo5/loja) é estruturada, e o que foi medido para desenhá-la | `docs/architecture-e3.md` |
| As medições reproduzidas e os bugs que só o arnês achou | `docs/brief.md` §3 e `README.md` |
| Como rodar o jogo, o arnês e o CLI de balanceamento | `README.md` |
