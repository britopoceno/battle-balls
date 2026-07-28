# Battle Balls (nome provisório) — Documento de Design

PvP 2v2 em tempo real com física de bolas, draft de personagens, economia entre rodadas
e habilidades miradas pelo jogador. Mobile-first, paisagem, web.

---

## 1. Pilares

1. **Cada personagem tem gameplay única.** Não só números diferentes: movimento
   diferente, ataque diferente, regra de carga de ult diferente. Você reconhece o
   personagem pelo jeito que a bola anda.
2. **A decisão vem antes E durante.** Draft e loja decidem o potencial; mira e timing
   decidem a execução.
3. **Física é a camada de controle.** Colisão não machuca — ela desloca. Deslocar o
   inimigo para fora do alcance dele nega o dano dele.

---

## 2. Combate

### Arena
- Arena 2D fechada, paredes sólidas, ricochete. **Sem ring-out.**
- Limite de 60s por rodada → **morte súbita: a arena encolhe** forçando o confronto.
- Vitória da rodada: eliminar as 2 bolas inimigas (HP zerado).

### Propulsão
Cada personagem tem **IA de movimento autoral**. O jogador não dirige a bola.

```
golem.move = seek(nearest, accel 0.3)          // avança reto e lento
vex.move   = orbit(nearest, r 180) + dive(hp<40%)
orbis.move = hold(center), flee(wall)
```

### Dano
- **Ataque básico automático**, com cooldown e **alcance**, disparado pela IA.
  Cada personagem tem o seu (golpe de contato, projétil, satélite orbital…).
- **Colisão causa 0 dano** — só empurrão. Física = posicionamento e negação de DPS.

```
vex.atk = { cd: 800ms, dmg: 7, range: 90 }
```

### Habilidades (por personagem)
| Slot | Qtd | Escolhe? | Dispara |
|---|---|---|---|
| Ataque básico | 1 | fixo | IA, automático |
| Ativa | 2 → escolhe 1 | sim, no draft | **jogador**: toque + arrasto p/ mirar |
| Passiva | 2 → escolhe 1 | sim, no draft | automática |
| Ult | 1 | fixa | **jogador**, quando a barra enche |

→ **4 builds por personagem.**

### Ult
Regra de carga **variável por personagem** (parte da identidade). A barra exibe um
**ícone da condição** para o jogador entender por que ela não enche:

`💥` dano causado · `🩸` dano recebido · `⏱` tempo · `☠` abate · `⚡` casts

---

## 3. Controles (mobile, paisagem)

```
┌──────────────────────────────────────────────┐
│ ♥♥♥♥♥♥♥♥ Golem·Venom      Ignis·Vex ♥♥♥♥♥♥   │
│                                              │
│         ●          ○                         │
│              ●        ○                      │
│                                              │
│  ◍ativa                          ativa◍      │
│    ◍ult                            ult◍      │
└──────────────────────────────────────────────┘
   polegar E                        polegar D
```

- Botões **semitransparentes**, arena ocupa a maior parte da tela.
- **Esquerda = personagem 1, direita = personagem 2.** Cada mão pilota uma bola —
  os dois podem mirar ao mesmo tempo, sem seleção prévia.
- Arrastar do botão → mostra a mira na bola correspondente → soltar casta.

---

## 4. Estrutura da partida

```
DRAFT  ──  snake ABERTO (personagens visíveis)
           P1 → P2, P2 → P1
           sem bans (roster 8 é pequeno demais para banir)
   ↓
BUILDS ──  simultâneas e SECRETAS, timer 30s
           1 ativa + 1 passiva por personagem
           revela na largada da rodada
   ↓
Bo5    ──  primeiro a 3 vitórias de rodada
           entre rodadas: LOJA
```

### Economia
- **Renda igual para os dois** por rodada (ex: 4, 5, 6, 7, 8) + **juros sobre o ouro
  guardado**. Vencer a rodada **não** dá ouro.
- A decisão é de **tempo**: comprar barato cedo, ou apanhar poupando para o pico na R3-R4.
- Sem snowball: a primeira vitória não compra a segunda.

### Loja — duas trilhas
| Físicos | Combate |
|---|---|
| Chumbo (+massa) | Lâmina (+dano) |
| Turbina (+velocidade) | Couraça (+HP) |
| Lixa (−atrito) | Luneta (+alcance) |
| Borracha (+elasticidade) | Relicário (−cooldown) |

---

## 5. Arquitetura

```
packages/
  sim/      TypeScript puro · 0 dependências · sem DOM, sem I/O
            tick fixo 60Hz · PRNG com seed · sem Math.random
  chars/    1 arquivo por personagem
  server/   Node + WebSocket · autoritativo · importa sim
  client/   Vite + Pixi · importa sim (predição visual e replay)
  bot/      IA heurística de jogador
  balance/  CLI: 10k lutas × 28 confrontos → matriz de winrate
```

### Personagem = módulo que assina eventos
O motor emite `tick`, `collide`, `damage`, `kill`, `cast`, `death`. Efeitos
(DoT, escudo, slow, knockback, cura, invocação) são peças reutilizáveis (`fx.*`).
Liberdade total vive na **composição**, não em gambiarra dentro do loop.

```ts
export const venom = {
  id: 'venom', hp: 90, radius: 14, mass: 1.0,
  move: (s, self) => s.orbit(self, s.nearestEnemy(self), 160),
  atk:  { cd: 900, dmg: 6, range: 110, onHit: fx.poison(3, 3000) },
  ult:  { charge: 'damageDealt', threshold: 400, cast: /* … */ },
  on: {
    tick:    (s, e) => s.aura(e.self, 60, fx.dot(4, 3000)),
    collide: (s, e) => s.apply(e.other, fx.slow(0.3, 2000)),
  },
}
```

### Netcode — servidor autoritativo + input delay
```
cliente: cast(Muralha, 42°) @tick 300
   ↓ (~40ms)
servidor: agenda @tick 306, simula 60Hz, broadcast do estado
   ↓
clientes interpolam entre snapshots
```
- Feedback local **imediato** (a mira aparece na hora), efeito sai em ~100ms.
- Sem rollback, sem ponto fixo, sem resimulação — uma máquina define a verdade.
- Funciona porque o input é **discreto**: você não dirige a bola, só emite casts.
- Anti-cheat de graça. Replay = seed + linha do tempo de inputs.

> ⚠️ **Decisão revista.** O plano original era o servidor pré-computar a batalha inteira
> e enviar um replay. Isso morreu no instante em que entrou input ao vivo — o servidor
> não pode conhecer o futuro. Registrado para não voltar por engano.

---

## 6. Balanceamento

Sem moeda comum de dano (consequência da liberdade total), balanceamento é **medição**,
não raciocínio. Duas peneiras:

**Grossa — automática, no CI.** Bot heurístico joga os dois lados: mira onde a chance de
acerto é maior, casta quando o valor esperado passa um limiar, com jitter para imitar erro
humano. 10k lutas × 28 confrontos → matriz de winrate. Alerta fora da faixa 45–55%.
O bot não precisa jogar *bem*, precisa jogar **igual nos dois lados** — assimetria é o
que está sendo medido.

**Fina — jogadores reais.** Telemetria: winrate por personagem, por build e por item;
taxa de pick; duração média da rodada.

O bot rende três usos: balanceamento, modo treino e oponente solo.

**Regra:** o 9º personagem só existe quando os 8 estiverem dentro da faixa.

---

## 7. Riscos conhecidos

| # | Risco | Gravidade |
|---|---|---|
| 1 | **Trilha de combate mata a trilha física.** Colisão não dá dano e não há ring-out, então massa/atrito/elasticidade só valem *indiretamente* (negar alcance). Em Bo5 curto, dano direto tende a ganhar de controle indireto. Se os itens físicos ficarem com <35% de taxa de compra, a física vira enfeite. | **Alta** |
| 2 | **Liberdade total sem moeda comum.** Nenhuma fórmula te diz se um personagem está forte — só medição. O arnês de balanceamento precisa existir na Fase 2, não no fim. | Alta |
| 3 | **Escopo somado.** Física + liberdade total + PvP síncrono + economia + mira + 8 personagens ≈ 12 meses de trabalho. Cada escolha isolada é defensável; a soma é um jogo grande. | Alta |
| 4 | **Mirar 2 personagens ao mesmo tempo, ao vivo.** Nenhum documento resolve isso — só protótipo na mão. É o primeiro teste a fazer. | Média |
| 5 | **Curva econômica curta.** Bo5 dá só 4 compras. Itens precisam ser sentidos de imediato, o que empurra o poder deles para cima e aperta o balanceamento. | Média |

---

## 8. Em aberto

- **Build muda entre rodadas?** Não foi decidido. *Recomendação:* sim, com custo em ouro
  — vira uma decisão econômica a mais e reaproveita a UI de draft que já existirá.
- Quantidade e preço dos itens; renda exata por rodada; taxa de juros.
- Duração-alvo da rodada (60s é o teto — qual é a mediana desejada?).
- Meta-progressão fora da partida: ranked, desbloqueio de personagens, monetização.
- Direção de arte, som, nome do jogo.

---

## 9. Ordem de construção

Cada fase tem um **portão**: não avance sem passar.

| Fase | Entrega | Portão |
|---|---|---|
| **0** — Núcleo ✅ *construída* | `sim` pura + Golem e Vex + render Canvas + mira por arrasto + arnês de determinismo. Ver `README.md`. | *Mirar habilidades em bolas que andam sozinhas é divertido?* — **em aberto, depende de você jogar** |
| **1** — Sensação *(1 sem)* | Layout mobile paisagem, 4 botões semitransparentes, mira por arrasto. Teste no celular de verdade. | *Os dois polegares funcionam sem atrapalhar um ao outro?* |
| **2** — Arnês *(1-2 sem)* | Bot heurístico + CLI de 10k lutas + matriz de winrate. | *Consigo detectar um personagem quebrado sem jogar?* |
| **3** — Loop *(2-3 sem)* | Draft snake + builds cegas + Bo5 + loja + economia. Tudo local, contra o bot. | *Dá vontade de jogar outra partida?* |
| **4** — Rede *(2-3 sem)* | Servidor autoritativo + input delay + sala por link. | *1v1 entre dois celulares é fluido?* |
| **5** — Conteúdo *(6-8 sem)* | 8 personagens, itens, telemetria, ajuste por medição. | *A matriz de winrate fecha em 45-55%?* |
| **6** — Meta | Ranked, progressão, polimento, som, arte. | — |

**A Fase 0 é a única que importa agora.** Ela custa duas semanas e responde a pergunta
que invalida ou valida todas as outras 60 decisões deste documento.
