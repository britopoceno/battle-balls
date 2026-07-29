# Battle Balls — Arquitetura do arnês de balanceamento (Fase 2 / E2)

> Projeta a **Fase 2 — Arnês** (`docs/prd.md` §2, E2): bot heurístico simétrico (RF-43 a RF-46),
> CLI de matriz de winrate (RF-47, RF-48), e os mecanismos que tornam o portão **P2.1 a P2.5**
> verificável. Executa a parte de arquitetura de **D-08** que `debt.7` deixou pronta e não usada,
> e produz as medições que **D-02** (incidência de empate), **Risco #1b** e **Risco #6** pedem
> nesta fase.
> Não reabre decisão de produto. Onde discordo ou onde o texto aprovado é ambíguo, isso está
> isolado na §9 — o usuário e o @pm decidem.
> **Este documento projeta. Não implementa.** Nenhuma linha de `src/` foi alterada ao escrevê-lo.
> Data: 2026-07-28 · Autor: @architect (Aria) · Documento irmão: `docs/architecture.md` (dívida C2/C3/D-07/D-08).
> Todos os números de §1 e §5.4 foram medidos nesta sessão, com o código atual, sem modificá-lo.

---

## 0. O que este documento fecha

| Item | Onde | Estado |
|---|---|---|
| RF-44/RF-45 — algoritmo do bot: chance de acerto, valor esperado, jitter, simetria | §2 | Pseudocódigo e assinatura fechados; vocabulário de mira declarado no personagem |
| RF-46 / D-08 — stream de PRNG próprio do bot | §3 | `deriveSeed(seed, team+1)` de `debt.7` vira gerador stateful no objeto do bot |
| RF-47 — CLI N lutas × confrontos → matriz de winrate com alerta 45–55% | §4, §6 | Fechado, **com troca de lado obrigatória** — ver §1.2 |
| RF-48 — n ≥ 800 por confronto | §4.4 | Confirmado por cálculo (n≈781) e traduzido em IC impresso |
| P2.2 teste de mutante · P2.3 controle negativo · Risco #1b | §5 | **Um único mecanismo** (`PickSetup.itemBonus` + protocolo A/B espelhado) serve aos três |
| P2.5 determinismo com o bot no loop | §3.3 | Invariantes herdadas de `debt.7` + 4 novas, e o teste que as prova |
| Risco #6 — % de rodadas que atingem 60s | §4.5 | Instrumentação trivial; já medido: **0,0% em 4 800 lutas** |
| D-02 — re-medir incidência de empate com roster heterogêneo | §4.3, §1.3 | Medido: 11,1% em espelho, 0% em confronto assimétrico |
| Ordem de construção verificável | §7 | 9 passos, 5 deles com golden hash **idêntico** |
| Riscos da proposta | §8 | Custo de CPU medido, viés de lado medido, viés de competência do bot |

**O que NÃO está aqui, deliberadamente:** ajuste de HP/dano para a mediana-alvo (D-05, medição da
Fase 3); números da economia (D-09); catálogo e preço de itens (Fase 3); qualquer correção do
comportamento da simulação — **P2.1 exige o golden hash intacto**, então esta fase não pode mudar
o jogo, só medi-lo.

---

## 1. Medições feitas para escrever este documento

O documento irmão começou gravando um baseline (§6.0 de `architecture.md`) porque uma migração de
8 passos feita sem baseline é feita no escuro. Aqui o motivo é outro e mais forte: **um arnês é um
instrumento de medição, e instrumento se calibra contra o que já se sabe.** Rodei o simulador atual,
com o bot placeholder (`dummy.ts`), para saber o que o instrumento vai encontrar antes de desenhá-lo.

Todos os números abaixo: `n = 800` seeds por linha, roster atual, `abilityIndex 0` / `passiveIndex 0`,
bot `dummy`. Intervalo de confiança de 95% para n=800 é ±3,46pp.

### 1.1 Custo de CPU — o orçamento da fase

| Medida | Valor |
|---|---|
| Throughput de simulação, 1 thread, Node 24 | **~180 000 ticks/s** (medido: 0,17–0,19 M) |
| Duração mediana da rodada hoje | 828 ticks ≈ 13,8 s |
| Custo de **uma luta** | **≈ 4,6 ms** |

Projeções, na mediana de hoje e na mediana-alvo de D-05 (30 s = 1 800 ticks, fator 2,17×):

| Cenário | Lutas | Hoje | Na mediana-alvo |
|---|---|---|---|
| Fase 2, roster 2: protocolo A/B, 6 configurações × 800 | 4 800 | **22 s** | 48 s |
| Fase 2 com n = 10 000 (o que o design pede) | 60 000 | **4,6 min** | 10 min |
| Fase 5, leitura "28 confrontos" × 10 000 | 280 000 | **21 min** | 46 min |
| Fase 5, leitura "confrontos legais de 2v2" (210) × 10 000 | 2 100 000 | **2,7 h** | 5,9 h |
| Fase 5, leitura "pares de composição" (378) × 10 000 | 3 780 000 | **4,8 h** | 10,4 h |

**Conclusão para o desenho:** paralelização é desnecessária na Fase 2 e provavelmente necessária na
Fase 5, dependendo de uma definição que não é minha (§4.1, §9/R-03). Isso vira gatilho escrito em
§8.2, não código agora.

### 1.2 Viés de lado — a descoberta que muda o desenho do arnês

Rodei espelhos perfeitos: a **mesma composição dos dois lados**. Se a simulação fosse simétrica, o
time 0 venceria 50% das vezes. Não é o que acontece.

| Configuração | Bot | n decididas | Winrate do **time 0** |
|---|---|---|---|
| `[golem, golem]` vs `[golem, golem]` | dummy | 786 | **73,03%** ±3,50 |
| `[golem, golem]` vs `[golem, golem]` | dummy, **ordem de comandos invertida** | 786 | **73,03%** — idêntico |
| `[golem, golem]` vs `[golem, golem]` | **nenhum** (só IA de movimento e ataque básico) | 800 | **66,50%** ±3,46 |
| `[vex, vex]` vs `[vex, vex]` | dummy | 792 | 49,75% ±3,48 |
| `[golem, vex]` vs `[golem, vex]` | dummy | 711 | 52,04% ±3,68 |
| **`[golem]` vs `[golem]` (1v1)** | dummy | 649 | **100,00%** |
| **`[golem]` vs `[golem]` (1v1)** | **nenhum** | 800 | **100,00%** |
| `[vex]` vs `[vex]` (1v1) | dummy | 0 | — (**800 empates de 800**) |

O 1v1 de Golem contra Golem é vencido pelo time 0 em **100% das 1 449 rodadas** medidas, com e sem
bot. Não é ruído: é estrutural.

**Causa.** Não é ordem de processamento de comandos — inverter `[...bot(0), ...bot(1)]` para
`[...bot(1), ...bot(0)]` dá resultado idêntico ao último bit. O que sobra, e explica tudo: o combate
é resolvido **na ordem de `world.balls`**, que é `[t0b1, t0b2, t1b1, t1b2]`. `autoAttack` percorre
essa ordem (`world.ts:610`) e `dealDamage` mata na hora (`world.ts:358-360`); uma bola morta não
contra-ataca no mesmo tick. Num duelo perfeitamente simétrico, com mesmo HP, mesmo dano e mesmo
cooldown, o golpe letal do time 0 **sempre** chega primeiro. O Vex empata 800/800 pelo mesmo
mecanismo pelo avesso: o dano dele vem de projéteis já em voo, que acertam depois da morte do dono.

**Consequência para o instrumento — e é a decisão mais importante deste documento.** O viés de lado
medido (até **+23pp** no espelho 2v2, +50pp no 1v1) é **maior que a faixa inteira de 45–55%** que o
arnês existe para vigiar. Um confronto medido em uma só atribuição de lado mede
`assimetria_de_personagem + viés_de_lado`, e o segundo termo domina. Daí §4.2: **troca de lado é
obrigatória, não higiene.** Metade das seeds com A no time 0, metade com A no time 1.

**O que eu NÃO faço aqui:** corrigir a simulação. Três razões, em ordem de peso:

1. **P2.1 proíbe.** O portão desta fase exige `sim:check` verde com o golden hash idêntico. Resolver
   dano em duas fases (coletar intenções, depois aplicar) muda o hash das 5 seeds do baseline e das
   5 de cobertura de build. A Fase 2 seria reprovada pelo seu próprio primeiro critério.
2. O instrumento **funciona sem a correção**, desde que a troca de lado exista — está medido em §5.4:
   com troca de lado, o controle negativo dá 49,23%.
3. A correção é decisão de produto, não de arquitetura: ela muda quem ganha as rodadas.

**O que eu faço:** devolvo isto ao usuário e ao @pm como achado, na §9/R-01, com as duas correções
possíveis e seus custos. **Não é só problema de instrumento** — num PvP onde o servidor atribui os
lados (Fase 4), uma vantagem estrutural de primeiro golpe é problema de justiça.

### 1.3 Empates (D-02) e morte súbita (Risco #6)

D-02 foi aprovada "com as duas partes": a regra vale já, e **a incidência de empate é re-medida na
Fase 2 com roster heterogêneo**. Parte da medição já dá para entregar:

| Configuração | Empates |
|---|---|
| `[golem, vex]` vs `[golem, vex]` (espelho, n=800) | **11,1%** |
| `[golem, golem]` vs `[vex, vex]` (assimétrico, n=800) | **0,0%** |
| `[golem, vex]` espelho **sem bot** (n=800) | 34,5% |
| `[vex]` vs `[vex]` 1v1 (n=800) | 100% |
| Espelho com um lado mutado (+30% dmg, n=800) | **0,8%** |

O `README.md` avaliou que os 7 empates em 40 rodadas (17,5%) eram artefato de times perfeitamente
espelhados e sumiriam com personagens diferentes. **Confirmado, e com margem:** quanto mais
assimétrico o confronto, menos empate. A regra de D-02 é salvaguarda barata, não regra de jogo com
peso. Número definitivo sai do CLI na execução do portão, com o bot heurístico.

**Morte súbita: 0,0% em todas as configurações medidas** — 4 800 lutas, nenhuma chegou aos 60 s.
O Risco #6 está confirmado a n=800, não mais a n=40. Isso não é conclusão sobre a mecânica: o
gatilho do risco é "seguir em 0% **após o ajuste de HP/dano**", e esse ajuste é D-05, Fase 3. O que
a Fase 2 entrega é o instrumento e o número de referência.

### 1.4 O que estes números não são

Todos foram medidos com o **`dummy.ts`**, que não estima valor esperado, não erra de propósito e só
casta se o alvo estiver no alcance. Eles calibram o instrumento e revelam o viés de lado — que é
propriedade da simulação, não do bot (a linha "sem bot" prova). **Nenhum deles é resultado de
balanceamento**, e nenhum deles vale como leitura de portão. A execução do portão usa o bot da §2.

---

## 2. O bot heurístico

### 2.1 O espaço de ação do bot é idêntico ao do jogador

Invariante de projeto, escrita primeiro porque tudo o mais depende dela:

> O bot emite **`Command[]` e nada mais** — `{tick, ballId, slot: 'ability'|'ult', dx, dy, mag}`.
> Ele não move a bola (RF-12: a IA de movimento é autoral, do personagem), não dispara o ataque
> básico (RF-13: automático), não escolhe build, não compra item, não drafta.

É isso que faz do bot um proxy válido de jogador: ele exerce exatamente as alavancas que os dois
polegares exercem (RF-32, RF-33). Se algum dia o bot precisar de uma alavanca que o jogador não tem,
a matriz de winrate deixa de medir o jogo e passa a medir o bot.

### 2.2 O que o bot precisa saber, e por que ele não pode descobrir sozinho

RF-44 pede "mira onde a chance de acerto é maior, casta quando o valor esperado passa um limiar".
Para calcular chance de acerto o bot precisa saber **que forma a habilidade entrega** — área no ponto
mirado, raio que atravessa, investida do próprio corpo. Essa informação hoje existe apenas **dentro
do closure `cast`** (`golem.ts:49-56`, `vex.ts:53-70`), que é código, não dado.

Três saídas, e a escolha importa mais do que parece:

| | Opção | Consequência |
|---|---|---|
| A | **Declarar a geometria como campo do personagem** e o bot lê o campo | Um estimador só, igual para todos. Personagem novo declara ou não compila |
| B | Bot ignora a geometria: mira no alvo e casta no cooldown | É o `dummy` de hoje. **Não é neutro** — ver abaixo |
| C | Bot com um ramo por personagem (`if charId === 'vex'`) | Rejeitada. É o confundidor puro: o bot joga melhor de A do que de B, A ganha, e o arnês reporta como desequilíbrio de personagem o que é desequilíbrio de bot |

**Por que B não é a opção conservadora, apesar de parecer.** Ignorância uniforme **em código** produz
viés **em efeito**: um estimador genérico trata o Deslize do Vex (reposicionamento sem dano nenhum)
como se fosse uma habilidade de dano mirável, e o bot mergulha o Vex em cima do inimigo — que é o
oposto do uso correto. A mesma linha de código prejudica o Vex e não prejudica o Golem. RF-45 exige
que o bot jogue **igual nos dois lados**; igualdade é do *procedimento*, não da ignorância.

**Recomendação: A.** E há precedente direto no projeto: `contactWindows` (`debt.6`, D-07) resolveu
exatamente este problema — tirou de dentro do closure um fato que outra camada precisava ler, e o
transformou em campo tipado e auditável. Aqui o "outra camada" é o bot em vez do motor.

```ts
// sim/types.ts — vocabulário FECHADO. Estender é ato deliberado, revisado, não acidente.
export type AimSpec =
  /** área no ponto mirado, com atraso opcional (Tremor; Convergência) */
  | { kind: 'burst';     radius: number; delayMs: number }
  /** projétil na direção mirada (Lâmina Fantasma) */
  | { kind: 'raio';      radius: number; speed: number; ms: number }
  /** investida do PRÓPRIO corpo que causa dano por contato (Impacto Sísmico) */
  | { kind: 'dash';      speed: number; ms: number }
  /** reposicionamento sem dano (Deslize) */
  | { kind: 'reposicao'; speed: number }
  /** o bot não sabe avaliar isto (Muralha). Declarar é obrigatório; omitir, não */
  | { kind: 'utilidade' }

export interface AbilityDef { /* ...como hoje... */ aim: AimSpec }
export interface UltDef     { /* ...como hoje... */ aim: AimSpec }
```

Três decisões dentro desta:

1. **O campo é obrigatório, não opcional.** Com 6 personagens novos entrando na Fase 5, esquecer é
   provável e o modo de falha é silencioso (a habilidade nunca é castada, o personagem perde parte
   do kit, e a matriz reporta isso como fraqueza do personagem). `aim: { kind: 'utilidade' }` é o
   escape hatch — mas tem que ser **digitado**, isto é, declarado. Mesma lição de `debt.6`.
2. **O campo mora em `sim/types.ts` e `sim/` nunca o lê.** Não é anomalia: `desc`, `name`, `icon` e
   `color` já são exatamente isso — dado que vive no tipo do personagem e é consumido por outra
   camada (a UI). A direção permitida continua sendo `bot → sim` (RF-19); o inverso não existe aqui.
3. **`AimSpec` descreve a habilidade, não a política do bot.** Geometria é fato do personagem e mora
   em `chars/`; limiar, jitter e pesos são política e moram inteiros em `bot/`. Essa linha é o que
   permite trocar a política do bot sem tocar no roster, e vice-versa.

**Risco assumido e registrado:** `AimSpec` é uma **segunda declaração** do que o `cast` faz, e pode
divergir dele (foi exatamente o pecado de C3: duas fontes de verdade). A mitigação é que `AimSpec`
declara apenas *forma grosseira* (raio, velocidade, duração) — o que muda pouco — e nunca **dano**,
que é o número volátil. O valor esperado é montado de estado observável (§2.4), não de dano
declarado. Uma auditoria de roster imprime a tabela de `aim` junto da tabela de janelas de contato
(§6.3), e a divergência fica visível a olho.

O roster atual mapeia inteiro, sem forçar:

| Personagem | Slot | `aim` |
|---|---|---|
| golem | `sismico` | `{ dash, speed: 900, ms: 450 }` (a janela de contato declarada em `contactWindows`) |
| golem | `tremor` | `{ burst, radius: 110, delayMs: 0 }` |
| golem | `muralha` (ult) | `{ utilidade }` — parede, dano zero |
| vex | `lamina` | `{ raio, radius: 9, speed: 620, ms: 950 }` |
| vex | `deslize` | `{ reposicao, speed: 1000 }` |
| vex | `convergencia` (ult) | `{ burst, radius: 190, delayMs: 1300 }` |

### 2.3 Chance de acerto

Um estimador, cinco formas, zero ramos por personagem. Para uma bola `self`, um inimigo `e` vivo e a
forma `S` do slot avaliado:

```
d          = dist(self, e)                        // superfície a superfície não; centro a centro
tImpacto   = S.kind === 'burst' ? S.delayMs/1000
           : S.kind === 'raio'  ? d / S.speed
           : S.kind === 'dash'  ? d / S.speed
           : 0
alvoPrev   = { x: e.x + e.vx*tImpacto, y: e.y + e.vy*tImpacto }   // liderança de 1ª ordem
dPrev      = dist(self, alvoPrev)
alcanceEf  = clamp(dPrev, slot.minRange, slot.maxRange)
erroAlcance= |dPrev − alcanceEf|                  // o que a habilidade não alcança vira erro, não corte

raioEf     = S.kind === 'burst' ? S.radius
           : S.kind === 'raio'  ? S.radius + e.stat.radius
           : /* dash */           self.stat.radius + e.stat.radius

sigma      = |v_e| * (tImpacto + LAG_S)           // o alvo muda de ideia depois que eu miro
           + JITTER_RAD * dPrev                    // o bot sabe que ele mesmo treme (§2.6)
           + erroAlcance

pAcerto    = raioEf² / (raioEf² + sigma²)          // ∈ (0,1], 1 quando sigma → 0
```

Três escolhas com motivo:

- **`raioEf²/(raioEf²+sigma²)` em vez de um corte duro** (`sigma < raioEf ? 1 : 0`). É contínuo, então
  a decisão "qual alvo tem mais chance" tem gradiente e não vira sorteio entre dois zeros; e é a
  intuição de área em 2D. Custa uma divisão.
- **O bot modela o próprio jitter dentro de `sigma`.** `JITTER_RAD * dPrev` faz alvo distante valer
  menos, sem nenhuma regra ad hoc de distância. Cai de graça da mesma constante que produz o erro.
- **Fora de alcance vira erro, não veto.** `erroAlcance` derruba `pAcerto` continuamente; um alvo
  30px além do `maxRange` ainda é castável se estiver parado e a área for grande, o que é o
  comportamento humano correto.

`|v_e|` em vez da componente perpendicular: perpendicular seria mais exato e custa um `atan2` (que
tem o mesmo problema de portabilidade entre engines que `Math.hypot`, §3.3). `|v_e|` é conservador —
superestima o erro — e o bot não precisa jogar bem, precisa jogar igual (RF-45).

### 2.4 Valor esperado

```
peso(e)    = 1 + PESO_FERIDO * (1 − e.hp / e.stat.maxHp)        // ∈ [1, 1+PESO_FERIDO]
VE(mira)   = Σ  pAcerto(e | mira) * peso(e)     sobre TODOS os inimigos vivos
```

O somatório é sobre todos os inimigos, não só o alvo pretendido: é o que faz um Tremor que pega dois
valer o dobro, sem nenhuma regra especial de "habilidade de área". E `peso` faz **foco de fogo
emergir** — as duas bolas do time convergem no inimigo ferido porque ele vale mais para as duas, sem
camada de coordenação entre elas, que seria mais uma coisa a manter simétrica.

**O que deliberadamente NÃO entra em `VE`:** o dano da habilidade. O bot não sabe quanto o Tremor
machuca e não deve saber — dano declarado é a segunda fonte de verdade que diverge (§2.2). A
consequência honesta: o bot **não escolhe entre habilidades**, porque cada bola só tem uma ativa
(RF-03). Ele escolhe *quando* e *onde*, que é a decisão que o jogador toma.

Conjunto de candidatos de mira: **um por inimigo vivo** (mirar na posição prevista daquele inimigo).
São no máximo 2 no 2v2. O bot escolhe o de maior `VE` — que é literalmente "mira onde a chance de
acerto é maior" (RF-44), com o peso de alvo por cima.

`reposicao` e `utilidade` não têm `VE` e têm política própria, declarada:

| `kind` | Política — a mesma para todo personagem |
|---|---|
| `reposicao` | Se `hp/maxHp < FUGA` → mira **na direção oposta** ao inimigo mais próximo. Senão, se o inimigo mais próximo está além do alcance do ataque básico → mira **nele**. Senão, não casta |
| `utilidade` | Casta se disponível e o inimigo mais próximo está dentro de `[minRange, maxRange]`, mirando nele. É a regra do `dummy`, agora declarada como o que é: "o bot não sabe avaliar isto" |

**Ponto cego registrado:** o bot não vê efeitos (o `+30% de dano por 2,5s` do Deslize, a lentidão da
Lâmina, o puxão da Convergência antes do estouro). Um personagem cujo poder está em efeito é
sub-jogado pelo bot. Isso é viés de competência, tratado em §8.3, e é o motivo de §6.3 imprimir
utilização de kit junto da matriz.

### 2.5 Limiar, e a válvula que impede kit morto

```
casta se  VE_melhor ≥ limiarEf(slot)

limiarEf(slot) = LIMIAR[slot] * max(PISO_LIMIAR, 1 − esperaMs / DECAIMENTO_MS)
   onde esperaMs = tempo desde que o slot ficou disponível
```

O decaimento não é enfeite. Sem ele, um personagem cujo `VE` raramente cruza o limiar **nunca casta a
ult**, e a matriz reporta como fraqueza de personagem o que é timidez de bot — o modo de falha mais
insidioso possível num instrumento de balanceamento, porque ele é silencioso e parece resultado. Com
o decaimento, um recurso parado o suficiente acaba sendo usado numa oportunidade medíocre, que é o
que um jogador humano faz. `PISO_LIMIAR` impede que ele vire cast aleatório.

### 2.6 Jitter (RF-44) — três fontes, todas do stream do bot

| # | Jitter | Onde entra | Imita |
|---|---|---|---|
| 1 | **Ângulo** | rotaciona `(dx,dy)` por `(r()*2−1) * JITTER_RAD` | mira imprecisa |
| 2 | **Distância** | `mag += (r()*2−1) * JITTER_MAG`, clampado em [0,1] | arrasto curto/longo demais |
| 3 | **Reação** | o próximo instante de decisão da bola é `tick + REACAO_TICKS + floor(r() * REACAO_JITTER_TICKS)` | tempo de reação humano |

`PRESET_ARNES` — política, congelada, **idêntica para os dois times** (RF-45):

```
LIMIAR.ability = 0.55   LIMIAR.ult = 0.80   PISO_LIMIAR = 0.35   DECAIMENTO_MS = 8000
PESO_FERIDO = 1.0       FUGA = 0.35         LAG_S = 0.08
JITTER_RAD = 0.12 rad (≈6,9°)   JITTER_MAG = 0.10
REACAO_TICKS = 9   REACAO_JITTER_TICKS = 7      → decide a cada 150–250 ms
```

Esses números são **política de bot, não balanceamento**. Trocá-los muda a matriz inteira, e é por
isso que §6.3 exige que nenhuma matriz seja reportada sem a versão do bot que a produziu.

### 2.7 Assinatura, estado e simetria

```ts
// bot/heuristic.ts
export const BOT_VERSION = 'heuristic-1'

export interface BotConfig { /* os campos de PRESET_ARNES */ }
export const PRESET_ARNES: Readonly<BotConfig>

export interface BotState {
  readonly team: Team
  readonly cfg: Readonly<BotConfig>
  rand: () => number                    // mulberry32(deriveSeed(matchSeed, team + 1))
  porBola: Record<number, EstadoBola>   // { proximaDecisaoTick, prontoDesde } — SÓ CONSULTA (§3.3)
}

export function createBot(matchSeed: number, team: Team, cfg?: Readonly<BotConfig>): BotState
export function botCommands(view: WorldView, bot: BotState): Command[]
```

**O bot joga os dois lados com o mesmo código, parametrizado só por `team`** (RF-45). Não existe
ramo por `team` em lugar nenhum do algoritmo: `team` entra em exatamente dois pontos — quais bolas são
"minhas" e qual stream de PRNG é meu. Isso é verificável por leitura, e a §6.3 tem a checagem
empírica (o espelho com troca de lado).

**`dummy.ts` não é substituído.** Ele continua sendo o driver de `determinism.ts` e, portanto, o que
sustenta o golden hash e a cobertura de build. Trocá-lo pelo bot heurístico invalidaria os 10 hashes
de referência e destruiria a rede de regressão no exato momento em que ela é mais necessária.
`dummy.ts` passa a ser oficialmente um **fixture de teste congelado**; `heuristic.ts` é o bot do
RF-43 (arnês, modo treino, oponente solo).

### 2.8 O que o bot não faz — fronteira escrita

Não drafta, não compra, não escolhe build, não usa ataque básico (a IA dispara), não move a bola, não
coordena as duas bolas por canal explícito, não lê `world.rng`, não conhece `chars/` (recebe
`view.chars`, que é dado injetado), não conhece item, preço nem loja. Nenhuma dessas fronteiras é
gratuita: cada uma delas é uma via pela qual o bot poderia virar o sujeito da medição em vez do
instrumento dela.

---

## 3. O PRNG do bot (executa D-08 / RF-46)

### 3.1 Onde nasce — infraestrutura já pronta

`debt.7` entregou `deriveSeed(seed, streamId)` em `sim/rng.ts` e a tabela de streams reservados, e
registrou honestamente que nada consumia stream ≠ 0 ainda. A Fase 2 é o consumidor.

```ts
createBot(matchSeed, team) → rand = mulberry32(deriveSeed(matchSeed, team + 1))
//                                                              team 0 → stream 1
//                                                              team 1 → stream 2
```

O estado do gerador vive **no objeto do bot**, nunca em `World`. Consequências, que são exatamente o
que D-08 comprou:

- O `World` serializado (snapshot da Fase 4) não carrega estado de bot.
- Trocar a versão do bot muda os comandos, mas **não muda a sequência que a simulação saca** do
  stream 0 — "replay = seed + linha do tempo de inputs" (RF-41, P4.3) continua valendo entre versões
  de bot, que é o que o Risco #7 dizia estar em jogo.
- Um mesmo processo pode rodar dois bots sem entrelaçar streams, que é o caso do arnês.

### 3.2 A ordem de saque é contrato

O bot saca do stream em ordem fixa, e essa ordem é parte da versão dele:

```
para cada bola viva minha, NA ORDEM DE view.balls:
    se view.tick < st.proximaDecisaoTick: continua
    (1) r() → agenda a próxima decisão                        ← sempre, mesmo sem castar
    avalia ult; se casta:  (2) r() → ângulo   (3) r() → mag
    avalia ativa; se casta: (4) r() → ângulo  (5) r() → mag
```

O saque (1) acontece **sempre** que a bola chega a um ponto de decisão, castando ou não — isso torna o
consumo do stream função apenas do estado do mundo, e não da decisão, o que é mais fácil de auditar.
Mudar essa ordem muda a matriz sem mudar uma linha de política: por isso ela é contrato, e por isso
`BOT_VERSION` existe.

### 3.3 Determinismo — invariantes herdadas e as novas

Herdadas de `architecture.md` §5.2 / `debt.7`, sem alteração:

- **`WorldView = Omit<World,'rng'>`** — chamar `view.rng()` é erro de compilação. `botCommands` recebe
  `WorldView`, nunca `World`, nunca `SimCtx`.
- **`world.balls` nunca é reordenado por valor.** Vale para o bot também: ele **nunca ordena**
  `view.balls`; percorre na ordem dada e, quando precisa do melhor de um conjunto, usa comparação
  estrita (`<`, nunca `<=`) com desempate explícito por `id`.
- **Nada de `Math.random` fora do stream próprio.**

Novas, específicas do bot, e cada uma com o modo de falha que ela fecha:

| # | Invariante | O que ela impede |
|---|---|---|
| N-1 | Sem `Date.now`, `performance.now`, `process.hrtime` em `bot/`. O único relógio é `view.time` | Bot que decide por tempo de parede: o replay do arnês nunca reproduz |
| N-2 | `BotState.porBola` é **container de consulta**: nunca se itera sobre ele. Toda iteração parte de `view.balls` | Ordem de iteração de container virando entrada da simulação |
| N-3 | O bot **não escreve** em `view`. `Omit` é raso e não protege — quem protege é o teste de replay (§7, passo 4), que roda a partida sem bot e exige hash idêntico | Escrita acidental em `view.balls[i].hp`, que o tipo não pega |
| N-4 | Preferir `Math.sqrt(a*a+b*b)` a `Math.hypot`; evitar `atan2`/`cos`/`sin` onde houver alternativa algébrica | Divergência entre engines (V8 × JSC). Ver §8.5 — é atenuante, não crítico, pelo motivo que está lá |

**P2.5 ("mesma seed + mesma versão de bot → mesmo hash") é provado por dois testes, não um:**

1. **Autoconsistência com bot no loop:** rodar 5 seeds com `heuristic` duas vezes, exigir hash igual.
   Pega N-1, N-2 e qualquer não-determinismo interno do bot.
2. **Replay sem bot:** gravar `Command[]` da execução com `heuristic`, recriar o mundo com a mesma
   seed e reproduzir só os comandos. Hash tem que bater. Pega N-3 e prova o isolamento de stream que
   é o coração de D-08 — se o bot tivesse sacado de `world.rng`, a simulação teria consumido números
   diferentes na segunda execução.

O segundo já existe em `determinism.ts` (`debt.7`) para o `dummy`. A Fase 2 acrescenta o mesmo bloco
para o `heuristic`, **sem valores de referência fixos** — só igualdade entre execuções. Assim o
baseline não sofre churn cada vez que a política do bot muda.

---

## 4. Confronto, matriz e o número 28

### 4.1 O que "confronto" significa — e por que 28 não fecha

RF-47, o `DESIGN.md` §6 e P5.1 falam em "**28 confrontos**". A única origem aritmética possível é
**C(8,2) = 28**, o número de pares não ordenados de 8 personagens: é a matriz de matchup clássica de
jogo de luta, que é um formato **1v1**. O jogo é 2v2 com times de personagens distintos, e aí o número
não sobrevive à tradução:

| Leitura de "confronto" | Células | Custo a n=10 000 (§1.1) | Problema |
|---|---|---|---|
| Par de personagens `{A,B}`, realizado como `[A,A]` vs `[B,B]` | **28** | 21 min | **Medido e degenerado:** `[golem,golem]` vs `[vex,vex]` dá 7,6% de winrate. Dupla homogênea não é composição legal de draft e não sabe jogar |
| Par `{A,B}` com parceiro neutro fixo `X`: `[A,X]` vs `[B,X]` | 28 | 21 min | Legal, mas a identidade de `X` enviesa tudo. Com roster 2 não existe `X` |
| Todos os confrontos legais de 2v2 (4 personagens distintos) | **210** | 2,7 h | É o que o draft produz. Não é 28 |
| Par de composições, permitindo repetição entre times | **378** | 4,8 h | Superconjunto do anterior |

Isso é ambiguidade de **portão da Fase 5** (P5.1), não da Fase 2 — e não cabe a mim resolver
(Artigo IV). O que cabe a mim é não deixar a Fase 2 construir um instrumento que só serve para uma
das leituras. Portanto:

> **O CLI recebe um `PlanoDeConfrontos`, produzido por um gerador nomeado.** A `v1` traz dois
> geradores: `espelho-ab` (§5.3, o que o portão da Fase 2 precisa) e `pares-de-composicao`
> (parametrizado por "permite repetir personagem entre os times: sim/não" → 378 ou 210).
> Escolher o gerador do portão da Fase 5 é decisão do @pm, registrada em §9/R-03 com os custos acima.

Com o roster atual (2 personagens) existe **uma única composição legal** — `{golem, vex}` — e portanto
a matriz de composições tem **uma célula, que é um espelho**. Dito sem rodeio: **a matriz de winrate
de RF-47 é vazia de conteúdo até o roster crescer.** Ela precisa ser construída agora (para a Fase 5
só acrescentar personagens, não redesenhar), mas o valor real da Fase 2 vem do protocolo A/B da §5 —
que é exatamente o que P2.2, P2.3 e o Risco #1b pedem, e que funciona com qualquer tamanho de roster.

### 4.2 Troca de lado é obrigatória

Consequência direta de §1.2. Para um confronto entre composições `C0` e `C1` com `n` lutas:

```
seeds  1 .. n/2   → teams: [C0, C1]
seeds n/2+1 .. n  → teams: [C1, C0]
winrate(C0) = (vitórias de C0 como time 0 + vitórias de C0 como time 1) / decididas
```

O viés de lado cancela em primeira ordem porque as duas metades são amostras da mesma distribuição
com o mesmo `n`. Medido em §5.4: com troca de lado, o controle sem mutação nenhuma dá **49,23%**,
contra os 73% que o mesmo espelho dá sem trocar.

**Espelho não é célula da matriz — é diagnóstico.** Um confronto de uma composição contra ela mesma é
imune à troca de lado (trocar não muda nada) e mede **o viés de lado, não balanceamento**. O CLI
reporta os espelhos numa seção própria, com a expectativa explícita de que eles **não** são 50%, e
com o valor servindo de medida corrente daquele viés. Confundir as duas coisas é como o Fase 0
concluiu "espelho 19-14-7, perto de 50/50": verdadeiro para `[golem,vex]`, e falso por 23pp para
`[golem,golem]`.

### 4.3 Winrate, empates e n efetivo

Empate (`winner === -1`) é rodada **nula** por D-02: ninguém pontua. Coerente com isso, o denominador
do winrate são as **rodadas decididas**, e a taxa de empate é reportada como número próprio — que é
o que D-02 pediu para re-medir nesta fase.

Consequência que precisa estar escrita, porque é armadilha estatística real: **a taxa de empate varia
com a configuração** (medido: 11,1% no espelho, 0,8% com mutante forte, §1.3). Excluir empates do
denominador é correto pela regra, mas significa que `n` **efetivo** varia entre células. Portanto:

> O CLI roda seeds **em ordem, até atingir `n` rodadas decididas** (com um teto de seeds para não
> girar para sempre), e imprime `n_decididas` e `n_seeds` lado a lado. O critério de RF-48 é sobre
> `n_decididas`, não sobre seeds gastas. Determinístico e reprodutível: as seeds são consumidas em
> ordem crescente a partir da seed base.

### 4.4 Alerta, intervalo de confiança e poder estatístico

RF-48 pede n ≥ 800 "poder 80% para distinguir 55% de 50%". **Confere:** o cálculo padrão de duas
proporções dá `n ≈ 781` para α = 0,05 bilateral e potência 0,80. O 800 do PRD é esse número
arredondado, e o 10 000 do design dá o "±1pp" que ele promete:

| n decididas | IC 95% (±1,96·√(0,25/n)) |
|---|---|
| 800 | **±3,46pp** |
| 10 000 | **±0,98pp** |

O alerta de RF-47 é sobre o **estimador pontual** ("alerta fora de 45–55%") — é assim que está escrito
e é assim que fica. Mas o CLI classifica em três estados, não dois, porque duas categorias escondem o
problema de amostragem:

| Veredito | Regra |
|---|---|
| ✓ dentro | ponto **e** IC inteiramente dentro de 45–55% |
| ✗ fora | ponto fora de 45–55% |
| ? inconclusivo | ponto dentro, mas o IC cruza uma das bordas → **n insuficiente para afirmar**, não é aprovação |

Isto importa numericamente. Para uma célula verdadeiramente 50/50, a chance de o estimador pontual
sair de 45–55% é ≈0,47% a n=800. Numa matriz de 378 células isso são **~1,8 alarmes falsos por
execução**; a n=10 000 a mesma conta dá zero. É argumento de arquitetura para o portão da Fase 5
rodar com o n de 10 000 do design, e não com o piso de 800 — que é piso, não alvo.

### 4.5 Instrumentação que vem junto de graça

O CLI já roda N lutas; contar mais coisas custa uma soma por rodada:

| Métrica | Origem | Para quê |
|---|---|---|
| % de rodadas que atingem 60 s | `ticks × TICK_MS ≥ SUDDEN_DEATH_MS` | **Risco #6** (indicador aprovado, §6 do PRD) |
| % de empates | `winner === -1` | **D-02**, re-medição pedida para esta fase |
| Mediana / min / max de duração | quantis dos ticks | Referência para D-05 na Fase 3 |
| Casts de ativa e de ult por rodada, por personagem | contagem de `Command` emitido | **Utilização de kit** — o detector de viés de competência do bot (§8.3) |

Contadores de clamp (`architecture.md` §7.3) e de margem de tunneling (§7.4) foram pedidos pelo
documento irmão para esta fase. Estão no passo 8 de §7, marcados como **não bloqueantes do portão**:
são recomendação de arquitetura registrada, não requisito de RF.

---

## 5. Mutação de stats — um mecanismo para P2.2, P2.3 e Risco #1b

### 5.1 O mecanismo já foi desenhado; falta só puxá-lo para cá

O portão pede três coisas que parecem três: injetar `+30% de dano` num Vex (P2.2), rodar com `0%` de
mutação (P2.3), e comparar um pacote físico contra um pacote de dano (Risco #1b). **São o mesmo
mecanismo**, e ele já está especificado em `architecture.md` §1.3 como o passo 8 da migração da
dívida:

```ts
// sim/world.ts
export interface PickSetup {
  charId: string
  abilityIndex: 0 | 1
  passiveIndex: 0 | 1
  /** bônus JÁ AGREGADOS, aditivos, congelados na rodada — a mesma porta que a loja usará */
  itemBonus?: Partial<BonusBlock>
}
```

`makeBall` soma `itemBonus` em `b.bonusItem` e chama `recomputeStats`. Nada mais muda. Isso é
adiantar a metade `sim/` do passo 8 — não é escopo novo: é o mesmo campo, na mesma assinatura, pelo
mesmo motivo, apenas necessário duas fases antes do previsto porque o teste de mutante precisa dele.

**Por que isto e não um "modo mutante" no CLI.** Um caminho de código exclusivo de teste é um
caminho que a produção nunca exercita — e o mutante passaria a testar código que o jogo não roda. Com
`itemBonus`, o mutante é literalmente **um personagem com um item**, sujeito aos mesmos `SIGMA_MIN/MAX`
e aos mesmos clamps absolutos que a loja da Fase 3 vai usar. Isso é obrigatório, não elegante: um
mutante que escapasse dos tetos provaria a detecção de uma configuração inalcançável no jogo real.

Corolário, e é uma falha silenciosa que vale prevenir: **se um pacote pedido for cortado pelo teto, o
CLI avisa.** `+30%` de `dmg` está confortável dentro de `ΣMAX.dmg = +1.00`, mas um `+150%` seria
silenciosamente reduzido para `+100%` e um teste de mutante negativo seria interpretado como falha do
arnês, quando foi o clamp funcionando.

### 5.2 Pacotes nomeados por item, não por campo — a armadilha do sinal

O Risco #1b está escrito no PRD como "pacote físico (**+20% massa, −20% drag**)". Traduzido
literalmente para campos, `drag: −0.20` significa **mais atrito**, porque `drag` é a fração de
velocidade *retida* por segundo (`architecture.md` §1.6, R-01). Os itens pretendidos são Chumbo
(+massa) e Lixa (−atrito), e Lixa é **`drag: +0.20`**.

Não é preciosismo. Medido (§5.4, n=800 cada):

| Pacote aplicado ao Vex | Δ winrate vs linha-base |
|---|---|
| `{ mass: +0.20, drag: +0.20 }` — a **intenção** (Chumbo + Lixa) | **+4,32pp** |
| `{ mass: +0.20, drag: −0.20 }` — a **letra** do PRD | **−5,90pp** |

Dez pontos percentuais de diferença, com troca de sinal. O gatilho do Risco #1b é "físico < +2pp e
dano > +5pp → a trilha física nasce morta": a leitura literal **dispara o gatilho**, a leitura correta
**não dispara**. Um erro de sinal de uma linha reprojetaria a Fase 3.

> **Decisão de arquitetura:** o CLI nunca aceita campo cru na linha de comando para os pacotes de
> risco. Ele aceita **nomes de pacote**, definidos uma única vez em `src/tools/packages.ts`, com o
> nome do item ao lado do campo e do sinal:
> ```ts
> export const PACOTES = {
>   fisico: { mass: +0.20, drag: +0.20 },  // Chumbo +massa · Lixa −atrito = +drag (retenção)
>   dano:   { dmg:  +0.20 },               // Lâmina +dano
>   nenhum: {},                            // controle negativo (P2.3)
> }
> ```
> Mutação arbitrária por campo (`--mutacao vex:dmg:+0.30`) continua existindo para P2.2, onde o campo
> é o que se quer nomear.

### 5.3 O protocolo A/B com linha-base espelhada

Este é o desenho que torna P2.2, P2.3 e o Risco #1b bem-postos **com o roster de hoje**:

```
composição C (a mesma dos dois lados)   ·   pacote P aplicado a UM personagem de UM lado
seeds  1 .. n/2   → pacote no time 0
seeds n/2+1 .. n  → pacote no time 1
winrate medido = vitórias do LADO MODIFICADO / rodadas decididas
```

Três propriedades, e as três são necessárias:

1. **Isola a mutação.** Tudo o mais é idêntico dos dois lados: mesmos personagens, mesma build, mesmo
   bot, mesma política. A diferença medida só pode vir do pacote.
2. **Cancela o viés de lado** pela troca (§4.2), o que é o que faz o controle negativo cair em 50% em
   vez de 73%.
3. **Não depende de o roster estar balanceado.** É o ponto decisivo: a leitura alternativa de P2.3
   ("a matriz de composições permanece dentro de 45–55% sem mutação") é **insatisfazível por
   construção** — a matriz estar dentro da faixa é justamente o portão da Fase 5, e se ela já
   estivesse, a Fase 5 não existiria. Com o protocolo A/B, o controle negativo testa o que um controle
   negativo deve testar: que o pipeline não injeta assimetria por conta própria.

Registro que a segunda leitura é uma **interpretação minha do texto de P2.3**, feita para tornar o
critério operacional, e a devolvo explicitamente ao @pm e ao @qa em §9/R-02 — o portão precisa ser
inequívoco antes de alguém tentar passá-lo.

### 5.4 Resultado preliminar — o protocolo já foi rodado

Executado nesta sessão emulando `PickSetup.itemBonus` (escrevendo em `b.bonusItem` logo após
`createWorld` e recomputando), composição `[golem, vex]` dos dois lados, n = 800 com troca de lado,
**bot `dummy`**:

| Configuração | winrate do lado modificado | Veredito 45–55% |
|---|---|---|
| **P2.3** — controle, pacote vazio | **49,23%** ±3,68 | ✓ dentro |
| **P2.2** — Vex `+30% dmg` | **90,05%** ±3,48 | ✗ **fora** — mutante detectado |
| P2.2 (variante) — Golem `+30% dmg` | 60,76% ±3,54 | ✗ fora |
| **#1b** — Vex, pacote físico | 53,55% (**+4,32pp**) | ✓ dentro |
| **#1b** — Vex, pacote de dano | 73,01% (**+23,78pp**) | ✗ fora |
| **#1b** — Golem, pacote físico | 58,00% (**+8,77pp**) | ✗ fora |
| **#1b** — Golem, pacote de dano | 53,46% (**+4,24pp**) | ✓ dentro |

O que isso já permite afirmar, e o que não permite:

- **O portão P2.2 é passável, e não depende da qualidade do bot.** Um mutante de +30% de dano é
  detectado com folga de 10 desvios-padrão até pelo `dummy`. Isso remove o maior risco de
  cronograma da fase: o portão não estava refém de o bot heurístico ficar bom.
- **P2.3 se comporta** — 49,23%, bem dentro, com o IC inteiramente dentro da faixa.
- **Sobre o Risco #1b, ainda não se pode concluir nada** — e a leitura preliminar contraria a
  expectativa: os deltas **invertem entre personagens** (dano vale 23,78pp no Vex e 4,24pp no Golem;
  físico vale 8,77pp no Golem e 4,32pp no Vex). O gatilho está escrito de forma global ("físico <
  +2pp e dano > +5pp") e o dado sugere que ele é **por personagem**. Recomendo que o CLI compute e
  reporte o par de deltas por personagem, e que a leitura do gatilho global seja questão para o @pm
  (§9/R-04). Números finais são os do bot heurístico, não estes.

---

## 6. O CLI

### 6.1 Arquivos e fronteiras

| Arquivo | Papel | Fronteira |
|---|---|---|
| `src/bot/heuristic.ts` | **novo** — o bot de RF-43/44/45 | importa de `sim/` apenas; recebe `WorldView` |
| `src/bot/dummy.ts` | inalterado — fixture congelado de `determinism.ts` | — |
| `src/tools/harness.ts` | **novo** — `runRound(chars, setup, driver) → RoundResult`, e o `hash` FNV-1a extraído de `determinism.ts` | uma única definição do laço de partida |
| `src/tools/packages.ts` | **novo** — pacotes nomeados (§5.2) | dado, sem lógica |
| `src/tools/balance.ts` | **novo** — o CLI. `npm run balance` | orquestra; não contém regra de simulação |
| `src/tools/determinism.ts` | passa a usar `harness.runRound` + ganha o bloco P2.5 | golden hash **idêntico** |

**Por que extrair o laço em vez de duplicá-lo em `balance.ts`.** Hoje `determinism.ts` tem o laço
(`while (!world.over && world.tick < 60*180)`) embutido. Uma segunda cópia em `balance.ts` diverge
com o tempo — teto de ticks diferente, ordem de concatenação de comandos diferente — e o dia em que
divergir, o golden hash estará protegendo um jogo e a matriz medindo outro, sem nenhum aviso. Uma
definição, dois consumidores. O custo é uma story de refatoração pura, cujo critério de aceite é
justamente o hash não se mexer.

**`src/tools/` e não `packages/balance/`:** o `DESIGN.md` §5 descreve `balance/` como pacote próprio,
mas o projeto é pacote único por desvio consciente já registrado (`docs/prd.md` §7). Mantenho a
convenção vigente; o split real é Fase 5.

### 6.2 Flags

```
npm run balance -- [flags]

  --n=800                 rodadas DECIDIDAS por confronto (RF-48; piso, não alvo)
  --seed=1                seed base; as seeds são consumidas em ordem crescente
  --plano=espelho-ab      espelho-ab | pares-de-composicao        (§4.1)
  --repete-personagem     no plano de pares, permite o mesmo personagem nos dois times (378 vs 210)
  --comp=golem,vex        composição do plano espelho-ab
  --pacote=nenhum         nenhum | fisico | dano                  (§5.2)
  --alvo=vex              a qual personagem do lado modificado o pacote se aplica
  --mutacao=vex:dmg:+0.30 mutação por campo, para P2.2
  --risco-1b              roda a bateria completa de §5.4 (controle + físico + dano, por personagem)
  --json                  saída legível por máquina, além da tabela
```

### 6.3 Saída

Tabela no console, no mesmo espírito de `determinism.ts` — que é o formato que o projeto já lê. O
cabeçalho não é decoração:

```
arnês de balanceamento · bot heuristic-1 · preset arnes · seed base 1 · n alvo 800

confronto                              n_dec  n_seeds  winrate      IC      veredito
[golem,vex] vs [golem,vex] (espelho)     711      800   52.04%   ±3.68   diagnóstico de lado
...

protocolo A/B — composição [golem,vex]
pacote          alvo    n_dec  winrate lado modificado   delta   veredito
nenhum          vex       711   49.23%  ±3.68             —      ✓ dentro   (P2.3)
dmg +0.30       vex       794   90.05%  ±3.48         +40.82pp   ✗ fora     (P2.2 — mutante detectado)
fisico          vex       719   53.55%  ±3.65          +4.32pp   ✓ dentro
dano            vex       778   73.01%  ±3.51         +23.78pp   ✗ fora

risco #1b (delta por personagem)
  vex     físico +4.32pp · dano +23.78pp   → gatilho (fis<+2 e dano>+5): NÃO
  golem   físico +8.77pp · dano  +4.24pp   → gatilho: NÃO

rodadas          mediana 13.8s · min 3.2s · max 41.1s
morte súbita     0.0% das rodadas atingiram 60s        (risco #6)
empates          11.1% (espelho) · 0.8% (com mutante)  (D-02)
utilização       golem: 1.9 ativas/rodada · 0.4 ults/rodada · 12% das rodadas sem ult
                 vex:   2.3 ativas/rodada · 0.7 ults/rodada ·  6% das rodadas sem ult
```

Três coisas no cabeçalho e no rodapé que não são estética:

- **`bot heuristic-1 · preset arnes`** — nenhuma matriz é reportada sem a versão e o preset que a
  produziram. Comparar duas matrizes de versões diferentes é comparar dois instrumentos.
- **`n_dec` e `n_seeds` separados** — RF-48 é sobre decididas (§4.3).
- **`utilização`** — o detector de kit morto (§2.5, §8.3). "x% das rodadas sem ult" é o número que
  denuncia um personagem que a matriz vai medir pela metade.

### 6.4 O que fica fora do CLI

Draft, loja, economia, Bo5 (Fase 3 · RF-20 a RF-29); telemetria de jogadores reais (RF-49, Fase 5);
qualquer ajuste de HP, dano ou preço (D-05, D-09). O CLI mede **rodadas isoladas**, que é a unidade
que o balanceamento de personagem precisa. Bo5 introduz economia acumulada, que é variável de outra
fase.

---

## 7. Plano de construção — passos verificáveis

Mesmo princípio do documento irmão: um passo por vez, `npm run sim:check` verde ao fim de cada um, e
o **golden hash como juiz** de que o comportamento do jogo não se mexeu. Aqui isso é ainda mais
literal: **P2.1 é o primeiro critério do portão da fase**, então qualquer passo que mexa no hash
reprova a fase que o contém.

| # | Passo | Golden hash | O que prova o passo | Risco |
|---|---|---|---|---|
| **0** | Extrair `runRound` + `hash` para `src/tools/harness.ts`; `determinism.ts` passa a consumi-los | **idêntico** | Refatoração pura. Se o hash se mexer, a extração mudou o laço | baixo — mas é pré-requisito de tudo |
| **1** | `PickSetup.itemBonus` somado em `bonusItem` no `makeBall` (§5.1) | **idêntico** (nenhum chamador passa o campo) | Habilita P2.2, P2.3 e #1b com o mesmo caminho de código da loja | baixo |
| **2** | `AimSpec` obrigatório em `AbilityDef`/`UltDef`; roster declara os 6 slots (§2.2) | **idêntico** (`sim/` não lê o campo) | O `tsc` enumera todos os slots; nenhum personagem futuro escapa | baixo |
| **3** | `bot/heuristic.ts`: `createBot`, `botCommands`, `PRESET_ARNES`, `BOT_VERSION` (§2) | **idêntico** (nada o consome ainda) | O bot existe e compila contra `WorldView` | **médio** — é o passo grande; toda a §2 está aqui |
| **4** | P2.5 no `sim:check`: dupla execução com `heuristic` + replay dos comandos gravados (§3.3) | **idêntico** | **Determinismo do bot antes de construir em cima dele.** Pega N-1, N-2, N-3 | baixo, e é a rede dos passos seguintes |
| **5** | `balance.ts`: plano de confrontos, troca de lado, winrate + IC + veredito de 3 estados, empates, morte súbita, mediana, utilização de kit (§4, §6) | **idêntico** | RF-47 e RF-48; instrumentação de D-02 e Risco #6 | médio |
| **6** | Protocolo A/B: `packages.ts`, `--pacote`, `--mutacao`; **P2.2 e P2.3 rodam pelo CLI** (§5.3) | **idêntico** | Os dois critérios centrais do portão viram comando | médio — é onde o portão passa ou falha |
| **7** | `--risco-1b`: bateria completa, delta por personagem (§5.4) | **idêntico** | Medição adicional exigida da fase (indicador #1b aprovado) | baixo |
| **8** | *(não bloqueia o portão)* contadores de clamp (`architecture.md` §7.3) e de margem de tunneling (§7.4) | **idêntico** | Transforma os tetos de §1.4 da dívida em hipótese falseável | baixo |

**Ordem defendida em dois pontos onde ela poderia ser outra:**

- **O passo 4 (determinismo) vem antes do passo 5 (CLI), não depois.** Um arnês construído sobre um
  bot não-determinístico produz números que mudam entre execuções, e a depuração disso começa
  suspeitando da estatística, não do bot — dias perdidos. O teste é barato e transforma o bot em
  fundação verificada.
- **Os passos 1 e 2 vêm antes do 3**, mesmo sendo pequenos, porque o bot depende de `AimSpec` para
  compilar e o CLI depende de `itemBonus` para existir. Sequenciar assim mantém cada passo com
  `tsc` verde, sem stubs temporários.

Todos os oito passos têm hash idêntico. **Não é coincidência, é a definição da fase:** a Fase 2
constrói um instrumento e não pode mexer no que ele mede. O primeiro passo que legitimamente muda o
hash é o ajuste de HP/dano de D-05, que é Fase 3.

---

## 8. Riscos da própria proposta

### 8.1 Custo de CPU — medido, não estimado

§1.1 tem os números. Na Fase 2 o custo é irrelevante (segundos a minutos). Na Fase 5, com n=10 000, o
custo vai de **21 min** a **10,4 h** dependendo apenas de uma definição que ainda não foi tomada
(§4.1). Esse é o número que deve entrar na decisão do @pm sobre o que "28 confrontos" quer dizer —
não é detalhe de implementação, é 30× de diferença em tempo de execução.

Mitigações na ordem em que devem ser tentadas: (1) reduzir n para o piso de 800 nas execuções de
desenvolvimento e reservar 10 000 para a execução do portão; (2) rodar só as células que mudaram
desde a última execução (o resultado de uma célula é função pura de `(seeds, setup, BOT_VERSION)` —
cacheável); (3) paralelizar (§8.2). Nada disso na v1.

### 8.2 Paralelização e determinismo

Uma luta é função pura de `(seed, setup, BOT_VERSION)`, então **paralelizar por luta é seguro** — não
há estado compartilhado, e o stream do bot nasce da seed da partida. O que **não** é seguro é a
agregação:

| Regra | Motivo |
|---|---|
| Workers devolvem **contagens inteiras** (vitórias, empates, casts), nunca somas de ponto flutuante | Soma em `float64` não é associativa; ordem de chegada dos workers mudaria o último bit e, ocasionalmente, o veredito na borda de 45,00% |
| Durações são devolvidas como **arrays por bloco**, concatenados na ordem do **índice do bloco**, nunca na ordem de conclusão | Mediana e quantis dependem da ordem de concatenação em caso de empate de valores |
| O particionamento de seeds é fixo e derivado do índice do bloco, não distribuído dinamicamente | Mesmo comando → mesmo resultado, independentemente de quantos núcleos a máquina tem |

**Não implementar na v1.** Gatilho escrito, no mesmo espírito do dirty flag de `architecture.md` §7.1:
**se uma execução de portão passar de 20 minutos, ligar.** Antes disso é otimização pré-medição, e
paralelismo é a categoria de código onde bug de determinismo se esconde melhor.

### 8.3 Viés de competência do bot — o risco de maior consequência

O arnês mede **o que o bot consegue expressar**. Um personagem cujo poder está em efeitos (§2.4,
ponto cego), em timing fino, ou em sinergia com o parceiro é sub-jogado, e a matriz reporta isso como
fraqueza de design.

O que salva a **Fase 2**: os três critérios do portão são **diferenciais**. P2.2, P2.3 e o Risco #1b
comparam duas configurações contra a mesma linha-base, com o mesmo bot dos dois lados. O viés de
competência aparece nas duas pontas e cancela. Está demonstrado em §5.4: até o `dummy`, que é
incompetente por construção, detecta o mutante com folga.

O que **não** salva a Fase 5: P5.1 é um critério **absoluto** ("a matriz fecha em 45–55%"). Ali a
competência do bot entra direto no número, e um personagem sub-jogado é indistinguível de um
personagem fraco.

**Mitigação que cabe na Fase 2, e por isso está aqui:** a métrica de **utilização de kit** (§6.3) —
casts de ativa e de ult por rodada e % de rodadas em que a ult nunca saiu, por personagem. É o
indicador precoce de "o bot não sabe jogar de X". Custa uma contagem. Detectar isso na Fase 5, com 8
personagens e uma matriz de horas, é caro; detectar na Fase 2, com 2 personagens, é de graça.

### 8.4 Acoplamento com o bot de modo treino / oponente solo (RF-43)

RF-43 diz que **um único bot** serve a balanceamento, modo treino e oponente solo. Meu desenho
respeita: um algoritmo, `BotConfig` parametrizando dificuldade (jitter maior e limiar mais alto =
adversário pior). Onde isso pode dar errado:

- **Deriva de preset.** Se alguém ajustar `PRESET_ARNES` para o oponente solo ficar mais divertido, a
  matriz muda sem que ninguém perceba. Mitigação: `PRESET_ARNES` é `Readonly` e **congelado por
  `BOT_VERSION`**; o modo treino usa presets próprios e nomeados; a matriz sempre imprime qual usou.
- **Deriva de plataforma.** O cliente vai importar `bot/heuristic.ts` na Fase 3 (`client → bot → sim`,
  direção permitida). Portanto `bot/` **não pode** ganhar dependência de DOM, de `Date.now`, nem de
  nada que não rode headless — é a mesma disciplina de `sim/`, por um motivo novo: o bot roda nos dois
  lugares.
- **Deriva de propósito.** O arnês quer um bot *consistente*; o modo treino quer um bot *agradável*.
  Se um dia essas duas coisas exigirem algoritmos diferentes, o certo é **dizer isso e separar**, não
  fazer o algoritmo do arnês render um pouco de consistência para ficar simpático. Registrado para o
  dia em que a pressão aparecer.

### 8.5 Portabilidade numérica entre engines

`Math.hypot`, `atan2`, `cos` e `sin` não são bit-exatos entre V8, JSC e SpiderMonkey
(`architecture.md` §7.2, vetor 2). O bot usa os quatro naturalmente (distância, rotação de jitter).

**Por que isto é atenuante, e não crítico, no bot:** o arnês roda só em Node, e o replay que importa
(RF-41, P4.3) reproduz **comandos gravados**, não o bot — então uma divergência de bot entre engines
não quebra replay nem servidor autoritativo. O que ela quebraria é reproduzir em Node uma partida de
modo solo jogada no Chrome. Custo de evitar: usar `Math.sqrt(a*a+b*b)` (invariante N-4). Barato,
recomendado, não bloqueante.

### 8.6 `AimSpec` como segunda fonte de verdade

Tratado em §2.2: mitigado por declarar só forma grosseira, nunca dano, e por imprimir a tabela junto
da auditoria de roster. Continua sendo o ponto do desenho onde eu menos gosto da minha própria
proposta, e o motivo de eu ter registrado as opções B e C em vez de apresentar A como óbvia.

### 8.7 Exclusão de empates interage com a força da mutação

Medido: 11,1% de empates no controle contra 0,8% com o mutante forte (§1.3). Como empates saem do
denominador, células diferentes têm `n` efetivo diferente e amostram populações levemente diferentes
de rodadas. É pequeno e a alternativa (contar empate como meia vitória) contraria D-02, que declara a
rodada nula. **Decisão: excluir e reportar os dois números**, sempre juntos. Se a taxa de empate de
alguma célula passar de ~25%, o veredito daquela célula deve ser lido como suspeito — anotação para o
@qa no portão.

---

## 9. Ressalvas e o que este documento devolve ao @pm

Nada aqui contraria decisão aprovada. Quatro pontos precisam de dono fora da arquitetura.

> **Resolução do usuário (2026-07-28):**
> - **R-02 — leitura 2 aprovada.** O portão P2.3 é o protocolo A/B com pacote vazio (§5.3), não a
>   matriz de composições inteira. Passa a valer como critério oficial do portão da Fase 2.
> - **R-04 — agregação adiada.** O CLI reporta o par de deltas do Risco #1b por personagem (já
>   previsto no desenho); a regra de agregação do gatilho global fica para decidir na Fase 5, com
>   dados do bot heurístico e roster maior.
> - **R-01 e R-03 seguem como registrados**: R-01 (viés de lado) decide na Fase 3 junto de D-05;
>   R-03 (o que "28 confrontos" significa) decide antes de P5.1 ser cobrado, na Fase 5.

### R-01 — Viés de lado estrutural (achado novo, gravidade alta)

**O fato:** o time 0 vence **100%** dos duelos 1v1 espelhados de Golem (1 449 rodadas, com e sem bot)
e **73%** dos 2v2 espelhados de Golem. A causa é a ordem de resolução do combate seguir a ordem de
`world.balls`; num duelo simétrico, o golpe letal do time 0 chega primeiro e o alvo não contra-ataca.

**O que fiz:** o arnês controla o viés por troca de lado (§4.2), e isso basta para o instrumento —
verificado: controle negativo em 49,23%.

**O que devolvo:** isto não é só problema de instrumento. Na Fase 4, o servidor atribui os lados; uma
vantagem estrutural de primeiro golpe é **problema de justiça de PvP**. Duas correções possíveis,
ambas fora do escopo desta fase porque **mudam o golden hash e P2.1 proíbe**:

| | Correção | Efeito | Custo |
|---|---|---|---|
| a | **Resolução simultânea de dano** — coletar as intenções de ataque do tick e aplicá-las todas antes de processar mortes | Elimina o viés. O duelo espelhado de Golem vira duplo-KO, como o de Vex já é | Muda o hash; muda o jogo; mexe no `step` que a dívida acabou de congelar |
| b | **Ordem de resolução derivada da seed** — permutar a ordem de iteração de combate por rodada, deterministicamente | Converte viés sistemático em ruído justo em expectativa | Muda o hash; mais barato; ainda decide espelho por sorteio |

**Recomendação:** decidir na Fase 3, junto do ajuste de HP/dano de D-05 — que é quando o hash vai se
mover de qualquer jeito e quando haverá humano no controle para julgar o resultado.

### R-02 — O que P2.3 quer dizer (ambiguidade de portão)

P2.3 diz: "com 0% de mutação, **a mesma matriz** permanece dentro de 45–55%". Duas leituras:

1. **A matriz de composições** sem mutação está dentro da faixa. **Insatisfazível por construção** —
   isso *é* o portão da Fase 5 (P5.1); se já valesse, a Fase 5 não teria razão de existir.
2. **O protocolo A/B com pacote vazio** cai dentro da faixa. Testa exatamente o que um controle
   negativo deve testar: que o pipeline não inventa assimetria. Medido: 49,23%.

**Adotei a leitura 2** e construí o portão em cima dela. Preciso que o @pm confirme, e que o @qa
verifique por ela — senão a fase será avaliada por um critério diferente do que ela construiu.

### R-03 — O que "28 confrontos" quer dizer (ambiguidade de portão da Fase 5)

§4.1 tem as quatro leituras e os custos (21 min a 10,4 h). **Não é decisão minha** e não bloqueia a
Fase 2: o CLI nasce genérico, com gerador de plano plugável. Precisa estar decidido **antes de P5.1
ser cobrado**, e a decisão tem consequência de tempo de execução de 30×.

Meu insumo técnico, se ajudar: `[A,A]` vs `[B,B]` está **medido e é ruim** (7,6% de winrate numa
composição que o draft nem produz). As leituras vivas são 210 (confrontos legais) e 378 (pares de
composição). E vale notar que RF-50 ("nenhum personagem novo enquanto os 8 não estiverem em 45–55%")
está escrito **por personagem**, enquanto P5.1 está escrito **por confronto** — são dois agregados
diferentes do mesmo dado, e o CLI pode reportar os dois.

### R-04 — O gatilho do Risco #1b parece ser por personagem, não global

O indicador aprovado diz "físico < +2pp **e** dano > +5pp → a trilha física nasce morta". A medição
preliminar (§5.4) mostra os deltas **invertendo entre personagens**: físico rende mais no Golem
(+8,77pp) e dano rende muito mais no Vex (+23,78pp). Faz sentido — massa é recurso para quem precisa
chegar, dano é recurso para quem já acerta.

Um gatilho global obrigaria a agregar dois efeitos de sinais opostos numa média que não descreve
nenhum dos dois. **Recomendo** que o CLI reporte o par de deltas por personagem (o que ele fará de
qualquer forma) e que o @pm decida a regra de agregação — por exemplo, "dispara se o físico ficar
abaixo de +2pp para **a maioria** do roster". Números definitivos são os do bot heurístico; os de
§5.4 são preliminares, com `dummy`, e não valem como leitura de risco.

---

## Anexo A — Mapa de arquivos

| Arquivo | Natureza | Passos |
|---|---|---|
| `src/tools/harness.ts` | **novo** — `runRound`, `RoundResult`, `hash` (extraído) | 0 |
| `src/sim/world.ts` | `PickSetup.itemBonus`; `makeBall` soma em `bonusItem` | 1 |
| `src/sim/types.ts` | `AimSpec`; `aim` obrigatório em `AbilityDef` e `UltDef` | 2 |
| `src/chars/golem.ts`, `src/chars/vex.ts` | declaram `aim` nos 6 slots. Nenhuma outra mudança | 2 |
| `src/bot/heuristic.ts` | **novo** — o bot de RF-43/44/45, `PRESET_ARNES`, `BOT_VERSION` | 3 |
| `src/bot/dummy.ts` | **inalterado** — fixture congelado do golden hash | — |
| `src/tools/determinism.ts` | consome `harness`; ganha o bloco P2.5 (dupla execução + replay com `heuristic`) | 0, 4 |
| `src/tools/packages.ts` | **novo** — pacotes nomeados por item, com o sinal do `drag` escrito | 6 |
| `src/tools/balance.ts` | **novo** — o CLI | 5, 6, 7 |
| `package.json` | script `balance` | 5 |

## Anexo B — Checklist do portão da Fase 2

| # | Critério (PRD §2, E2) | Como se verifica | Onde este documento o resolve |
|---|---|---|---|
| P2.1 | `sim:check` verde: 40/40 seeds, hash idêntico em execução dupla | `npm run sim:check` | §7 — os 8 passos declaram hash **idêntico**; o golden hash de `debt.0` é o juiz |
| P2.2 | Teste de mutante: Vex com +30% de dano reportado **fora** de 45–55% | `npm run balance -- --mutacao=vex:dmg:+0.30 --n=3000` | §5.1, §5.3 · com o bot heurístico (`e2.6`): 79,63% ±3,46 a n=800, ✗ fora com folga |
| P2.3 | Controle negativo: 0% de mutação permanece **dentro** de 45–55% | `npm run balance -- --mutacao=vex:dmg:+0.30 --n=3000` (mesma invocação; a linha "nenhum"/linha-base é o controle) | §5.3 · leitura declarada em §9/R-02 · **ver nota de execução do portão abaixo** |
| P2.4 | n por confronto ≥ 800 | flag `--n`; o CLI imprime `n_dec` | §4.3, §4.4 · n≈781 confirmado por cálculo |

> **Nota de execução do portão (gate de `e2.6`, QA):** a n=800 (piso de RF-48), o veredito de 3 estados de §4.4 tem só ±1,54pp de janela conclusiva em torno de 50% — um pipeline perfeitamente justo sai `? inconclusivo` em ~38,5% das execuções, não por defeito, mas porque o IC cruza a borda. Medido na seed base 1: 52,25% ±3,46, `? inconclusivo`; nas seeds 1001–5001: 49,13/49,50/50,13/50,50/48,63, todas `✓ dentro` (média 50,02%). **A execução oficial do portão P2.3 deve usar `n ≥ 2000` (98,8% de chance de veredito conclusivo), não o piso de 800** — `n=800` é o mínimo estatístico de RF-48, não o `n` de portão. `n=3000` cobre P2.2, P2.3 e P2.4 num único comando (~2,5min).
| P2.5 | Determinismo com o bot no loop: mesma seed + mesma versão de bot → mesmo hash | `npm run sim:check` (bloco novo) | §3.3 — dois testes: autoconsistência e replay sem bot |
| — | Medição adicional: Risco #1b | `npm run balance -- --risco-1b` | §5.4 · ressalva de agregação em §9/R-04 |
| — | Medição adicional: % de rodadas que atingem 60 s (Risco #6) | sai no rodapé do CLI | §4.5 · **medido: 0,0% em 4 800 lutas** |
| — | Re-medição de incidência de empate (D-02) | sai no rodapé do CLI | §1.3, §4.3 · **medido: 11,1% espelho / 0% assimétrico** |

## Anexo C — Rastreabilidade

| Requisito / risco / decisão | Origem | Seção |
|---|---|---|
| RF-43 — um bot para três usos | decisão #14 | §2.7, §8.4 |
| RF-44 — chance de acerto, valor esperado, jitter | DESIGN §6 | §2.3, §2.4, §2.5, §2.6 |
| RF-45 — joga os dois lados igual | DESIGN §6 | §2.7, §4.2, §5.3 |
| RF-46 / D-08 — stream de PRNG próprio | PRD §5, Risco #7 | §3 |
| RF-47 — CLI N lutas × confrontos → matriz com alerta 45–55% | decisão #13 | §4, §6 |
| RF-48 — n ≥ 800 por confronto | brief §4, Risco #2b | §4.3, §4.4 |
| RF-19 — `sim/` não importa de `bot/`, `chars/`, `client/` | decisão #5 | §2.2 (item 2), §3.1, §6.1 |
| RF-12/RF-13 — movimento e ataque básico são da IA do personagem | decisões #2, DESIGN §2 | §2.1 |
| RF-41 / P4.3 — replay = seed + linha do tempo de inputs | DESIGN §5 | §3.1, §3.3, §8.5 |
| P2.1 a P2.5 | PRD §2, E2 | Anexo B |
| Risco #1b — detecção precoce da trilha física | PRD §6 (aprovado) | §5.2, §5.4, §9/R-04 |
| Risco #2 — teste de mutante | PRD §6 (aprovado) | §5.1, §5.3, §5.4 |
| Risco #2b — poder estatístico | PRD §6 (aprovado) | §4.4 |
| Risco #6 — morte súbita é código morto | PRD §6 (aprovado) | §1.3, §4.5 |
| Risco #7 — fluxo de RNG compartilhado bot↔sim | PRD §6 (aprovado) → D-08 | §3 |
| D-02 — re-medir incidência de empate na Fase 2 | PRD §5 | §1.3, §4.3, §8.7 |
| D-04 — `base × (1 + Σbônus)` com teto por campo | PRD §5 | §5.1 (o mutante passa pelos mesmos tetos) |
| `architecture.md` §1.3 — `PickSetup.itemBonus` (passo 8 da dívida) | documento irmão | §5.1 |
| `architecture.md` §5 — `deriveSeed`, `WorldView`, tabela de streams | documento irmão / `debt.7` | §3.1, §3.3 |
| `architecture.md` §7.3 / §7.4 — contadores de clamp e de tunneling | documento irmão | §7, passo 8 (não bloqueante) |
