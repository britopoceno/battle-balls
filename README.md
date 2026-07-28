# Battle Balls — Fase 0 ✅ portão passado

Fatia vertical local. Sem rede, sem draft, sem loja. Existe para responder **uma** pergunta:

> Mirar habilidades em bolas que andam sozinhas é divertido?

**Resposta do usuário em 2026-07-28: sim.** O núcleo se sustenta e a Fase 1 está
autorizada. Documentos do fluxo: `DESIGN.md` (decisões) → `docs/brief.md` (medições e
contradições) → `docs/prd.md` (épicos, requisitos e decisões aprovadas).

**Pendência que migrou para a Fase 1:** o portão foi dado em desktop. O teste em celular
real continua obrigatório e virou a pré-condição P1.1 da Fase 1.

## Rodar

```bash
npm install
npm run dev          # http://localhost:5177  → abra também no celular, em paisagem
npm run sim:check    # determinismo + winrate espelhada + duração das rodadas
npm run check        # tsc --noEmit
node src/tools/inspect.ts 6   # autópsia de uma rodada específica
```

Para testar no celular na mesma rede: `npx vite --host` e abra o IP que ele imprimir.

## Controles

| | |
|---|---|
| Polegar **esquerdo** | Golem — arraste do botão grande (ativa) ou pequeno (ult) |
| Polegar **direito** | Vex — mesma coisa |
| Arrasto | direção **e** distância: quanto mais puxa, mais longe cai |
| `Q` `W` / `O` `P` | ativa/ult no teclado — a mira segue o cursor |
| `R` reinicia · `espaço` pausa | |

## O que existe

```
src/
  sim/      simulação pura · 60Hz · determinística · não importa nada do resto
  chars/    golem.ts, vex.ts — um arquivo por personagem
  bot/      dummy.ts — adversário placeholder (NÃO é o bot da Fase 2)
  client/   canvas 2D + mira por arrasto + seletor de build
  tools/    determinism.ts (arnês embrionário) · inspect.ts (autópsia)
```

`sim/` não importa de `chars/`, `bot/` ou `client/` — o registro de personagens é
**injetado** em `createWorld`. Essa é a única regra arquitetural que não pode ser quebrada:
ela é o que vai permitir a mesma simulação rodar no servidor e no arnês de 10k lutas.

## Desvios conscientes do DESIGN.md

- **Um único pacote em vez de monorepo npm.** As fronteiras de pasta e a regra de
  dependência estão mantidas; workspaces exigiriam loader extra para rodar o arnês
  headless sem build. Split real fica para a Fase 5.
- **Mira por arrasto veio junto (era Fase 1).** Sem ela o teste do portão não é honesto.
- **Sem input delay.** `INPUT_DELAY_TICKS = 0` em `client/main.ts`. Mude para `6` para
  sentir os ~100ms do netcode da Fase 4 antes de construí-lo.
- **Canvas 2D, não Pixi.** Quatro círculos não justificam a dependência ainda.

## O que a medição já mostrou

40 seeds, times espelhados (Golem+Vex dos dois lados), bot placeholder nos dois lados:

```
determinismo   ✓ ok
espelho 2v2    time0 19 · time1 14 · empate 7
duração        mediana 13.8s · min 12.3s · max 19.5s
```

Três bugs que só apareceram porque o arnês existe:

1. **Golem não conseguia atacar Golem.** O alcance era medido subtraindo só o raio do
   alvo. Dois corpos de raio 24 nunca ficam a menos de 48px, e o alcance corpo a corpo
   era 42px — matematicamente inatingível. Travava 20% das rodadas. Agora o alcance é
   medido de superfície a superfície.
2. **Projéteis nunca acertavam alvos em órbita.** Vex orbita a 250px/s; a 165px de
   distância o tempo de voo é 0,35s e o alvo anda 88px. Sem antecipação de alvo, Vex
   contra Vex era um empate eterno. Agora há intercepção de primeira ordem — e ela
   preserva a intenção do design: empurrar o alvo continua fazendo o tiro errar.
3. **A seed não fazia nada.** Nada na simulação consumia RNG, então as 40 seeds rodavam
   a mesma partida idêntica. Adicionado ruído de largada (posição e velocidade).

## Verificação no navegador

Verificado ao vivo no Chrome (desktop, janela 844×390 simulando paisagem de celular):

- tela de seleção monta os cards de Golem e Vex, escolha de ativa/passiva funciona
- "Iniciar rodada" transiciona para a arena
- física roda: bolas colidem, HUD de vida por bola, anel de cooldown nos botões
- relógio da rodada e contagem regressiva de morte súbita aparecem
- mira por arrasto nos botões das duas mãos, sem erro de console
- `R` reinicia, tela de fim de rodada aparece na hora certa

**Um quarto bug apareceu aqui, e o arnês não pegaria:** `let world = novaRodada()` era
executado antes das declarações `let pendentes` e `let flutuantes`. A função é hoisted,
as variáveis `let` não — TDZ. Isso derrubava o módulo inteiro na inicialização: o
overlay aparecia (é HTML estático) mas nada de JS rodava. Corrigido reordenando as
declarações. Lição: arnês headless prova a simulação, não prova o cliente.

### Ainda não verificado: celular real

O acesso pela rede local **não funcionou** ("resposta inválida" no navegador do celular).
Descartados: firewall (o log do servidor mostra o celular conectando), HTTPS forçado,
navegador embutido de app, e antivírus de terceiros. A resposta HTTP é válida — headers
corretos e bytes conferem com o `Content-Length` em todos os arquivos. A interferência
está entre o roteador e o aparelho. Testar via hotspot do próprio computador ou em
outra rede é o próximo passo.

**Consequência para o portão:** a sensação do arrasto com o polegar de verdade continua
não medida. O que já dá para afirmar é que o jogo roda e responde a arrasto.

## Pontos de atenção para o teste

- **Rodada mediana de 13,8s** contra os 60s que o design assume até a morte súbita.
  Rápido demais. Alavancas óbvias: subir HP dos dois ou baixar dano. Não ajustei —
  os números certos só aparecem com humano no controle.
- **Os 7 empates são duplo-KO simultâneo**, artefato de times perfeitamente espelhados.
  Deve sumir com personagens diferentes.
- **Golem provavelmente é impotente contra Vex.** 105px/s contra 250px/s, alcance 18
  contra 200. Se for esse o caso, é dado para o design — não necessariamente um bug.
