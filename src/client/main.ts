import { CHARS } from '../chars/index.ts'
import { botCommands, createBot, type BotState } from '../bot/heuristic.ts'
import { criarPolitica, type PoliticaPartida } from '../bot/partida.ts'
import { createWorld, step, TICK_MS } from '../sim/world.ts'
import type { Ball, Command, World } from '../sim/types.ts'
import type { StatBlock } from '../sim/stats.ts'
import { hash } from '../tools/harness.ts'
import {
  aplicar,
  criarPartida,
  ladosDaRodada,
  registrarRodada,
  seedDaRodada,
  setupDaRodada,
  vencedorDaRodada,
  visaoPara,
  type Decisao,
  type EstadoPartida,
  type Jogador,
  type ResultadoRodada,
} from '../match/index.ts'
import { criarEntrada, TECLADO, type Disparo } from './input.ts'
import { ARENA_H, ARENA_W } from './layout.ts'
import { desenhar, type Flutuante } from './render.ts'
import { desenharTela, type AcoesDaTela, type ContextoDaTela } from './telas.ts'
import { anguloErroGraus, criarTelemetria } from './telemetria.ts'

/**
 * Fase 3 — a partida completa, local, contra o bot real (`docs/architecture-e3.md` §11, story
 * `e3.4`).
 *
 * Era um laço de rodada única com um seletor de build de bancada. Agora é o CONDUTOR de uma partida
 * Bo5: `EstadoPartida` de `match/` manda, `FaseDaPartida` decide que tela desenhar, e este arquivo
 * só faz três coisas — traduzir clique em `Decisao`, rodar a rodada no canvas e devolver o resultado
 * a `registrarRodada`.
 *
 * As duas invariantes de CHAMADOR que este arquivo é o primeiro código de produção a carregar
 * (ARCH-E33-004, §12.1 — antes de `e3.4` elas só existiam como comentário):
 *
 *  - **M-1: um `BotState` por RODADA.** `bot` nasce dentro de `abrirRodada` e morre com ela.
 *    `BotState.porBola` guarda relógios ABSOLUTOS (`proximaDecisaoTick`), e carregá-los para uma
 *    rodada que recomeça no tick 0 deixa o bot mudo até um instante que já passou — meia rodada sem
 *    política. Medido em 3/3 seeds pela guarda `invariante M-1` do `sim:check`.
 *  - **Uma `PoliticaPartida` por PARTIDA.** `politica` nasce em `novaPartida` e atravessa a partida
 *    inteira. O único estado dela é o gerador; recriá-la a cada visita à loja reiniciaria o stream e
 *    o bot compraria sempre o mesmo item — degradação silenciosa que passa verde em qualquer teste de
 *    reprodutibilidade. Medido em 3/3 seeds pela guarda `política bot` do `sim:check`.
 *
 * As duas puxam em direções opostas de propósito, e o motivo está em `bot/partida.ts`: o bot de
 * COMBATE tem relógio, a política de PARTIDA não tem.
 */

/**
 * Atraso de input em ticks. Na Fase 4 o servidor agenda os casts ~6 ticks à frente (~100ms). Aqui
 * fica 0 para o teste de diversão ser honesto — desvio consciente já registrado na arquitetura, e
 * P4.1 é da Fase 4. Não mexer nisto nesta story (AC 12).
 */
const INPUT_DELAY_TICKS = 0

/** RF-04 — 30 segundos para escolher a build. O relógio de parede mora no CLIENTE (§2.6). */
const SEGUNDOS_DE_BUILD = 30

/** RF-01 / R-01(B) — roster de 2; os dois jogadores acabam com `[golem, vex]` (§3.2). */
const POOL = ['golem', 'vex']

/** O humano é sempre o jogador 0. **Jogador ≠ lado** — o lado alterna por rodada (§5.3, R-06). */
const HUMANO: Jogador = 0
const BOT: Jogador = 1

const canvas = document.getElementById('c') as HTMLCanvasElement
const g = canvas.getContext('2d')!
const overlay = document.getElementById('overlay') as HTMLDivElement
const btnExportar = document.getElementById('exportar') as HTMLButtonElement

/**
 * O coletor de `e3.5`. Este arquivo só o ALIMENTA: entrega os eventos que `match/` já produziu e
 * liga o gatilho de exportação. Nenhum cálculo de métrica mora aqui (AC 13).
 */
const telemetria = criarTelemetria()

let partida: EstadoPartida
let politica: { politica: PoliticaPartida; rand: () => number }

let world: World | null = null
let bot: BotState | null = null
/** o lado (`Team`) que o humano ocupa NESTA rodada — sai de `ladosDaRodada`, nunca é fixo */
let meuLado: 0 | 1 = 0
let ladoDoBot: 0 | 1 = 1

let acc = 0
let ultimo = performance.now()
let pausado = false
let pendentes: Command[] = []
let flutuantes: Flutuante[] = []

/** fim do timer de builds, em `performance.now()`. `null` fora da fase `builds`. */
let fimDoTimer: number | null = null
/**
 * O último segundo já desenhado na tela de builds.
 *
 * Existe para que a contagem regressiva **não** redesenhe o overlay a 60Hz: `desenharTela` recria o
 * DOM inteiro, e fazê-lo por frame descartaria o botão sob o dedo do jogador no meio do toque — o
 * modo de falha que só aparece no celular, que é onde P3.4 roda.
 */
let segundoDesenhado = -1

/** `ball.base` por `charId`, colhido de cada `World` — ver `ContextoDaTela.basePorChar`. */
const basePorChar: Record<string, Readonly<StatBlock>> = {}

// ---------------------------------------------------------------- partida

function novaPartida(): void {
  partida = criarPartida({ seed: (Math.random() * 1e9) | 0, pool: POOL })
  // UMA por partida — ver o cabeçalho. Recriar isto por rodada é o bug que a guarda `política bot` mede.
  politica = criarPolitica(partida.seed, BOT)
  world = null
  bot = null
  fimDoTimer = null
  avancarBot()
  render()
}

/**
 * Aplica uma decisão ao estado. **Não desenha e não chama o bot** — separar isto de `decidir` não é
 * gosto: aplicar e redesenhar no mesmo passo faz o bot reentrar no meio da própria jogada, e emitir
 * `{t:'build'}` não marca `prontos`, então a reentrada não tem condição de parada. Foi exatamente
 * assim que a primeira versão desta tela travou o renderizador.
 */
function aplicarDecisao(d: Decisao): boolean {
  const t = aplicar(partida, d)
  if (t.erro) {
    // decisão ilegal é evento normal de jogo (o jogador clicou no que não podia): o estado volta
    // intacto e a tela apenas não muda. Fica no console para o smoke visual de P3.4.
    console.warn(`[match] decisão rejeitada: ${t.erro}`)
    return false
  }
  partida = t.estado
  // `e3.5` — os eventos já existem desde `e3.2`; a story só os entrega ao coletor. Registrar DEPOIS
  // de aceitar é o que garante que uma decisão rejeitada não vire evidência de portão.
  telemetria.registrar(partida.seed, t.eventos)
  return true
}

/** Uma decisão do HUMANO: aplica, deixa o bot responder e redesenha UMA vez, no fim. */
function decidir(d: Decisao): void {
  aplicarDecisao(d)
  avancarBot()
  render()
}

/**
 * Teto de jogadas do bot entre dois desenhos. Guarda de terminação, no mesmo espírito de
 * `MAX_PASSOS` (`tools/partida.ts`): o laço abaixo já termina por construção — cada volta ou avança
 * `draft.passo` ou marca `prontos[BOT]` —, e o teto existe para que uma regressão futura vire um
 * erro no console em vez de uma aba congelada no celular.
 */
const MAX_JOGADAS_DO_BOT = 32

/**
 * As decisões do BOT até ele não ter mais o que fazer na fase corrente.
 *
 * Espelha o condutor do arnês (`decisoesPorPolitica`, `tools/partida.ts`), e é de propósito: se os
 * dois divergirem, a partida que o humano joga deixa de ser a que o `sim:check` prova.
 *
 * A política é `politica` — a MESMA da partida inteira, nunca recriada aqui. Ver o cabeçalho:
 * recriá-la por rodada reiniciaria o stream e o bot compraria sempre o mesmo item.
 */
function avancarBot(): void {
  const p = politica
  for (let jogada = 0; jogada < MAX_JOGADAS_DO_BOT; jogada++) {
    if (partida.fase === 'draft' && partida.draft.ordem[partida.draft.passo] === BOT) {
      aplicarDecisao({ t: 'draft', jogador: BOT, charId: p.politica.escolherDraft(visaoPara(partida, BOT), p.rand) })
      continue
    }
    if (partida.fase === 'builds' && !partida.prontos[BOT]) {
      for (const slot of [0, 1] as (0 | 1)[]) {
        const b = p.politica.escolherBuild(visaoPara(partida, BOT), slot, p.rand)
        aplicarDecisao({ t: 'build', jogador: BOT, slot, abilityIndex: b.abilityIndex, passiveIndex: b.passiveIndex })
      }
      aplicarDecisao({ t: 'pronto', jogador: BOT })
      continue
    }
    if (partida.fase === 'loja' && !partida.prontos[BOT]) {
      for (const d of p.politica.comprar(visaoPara(partida, BOT), p.rand)) aplicarDecisao(d)
      aplicarDecisao({ t: 'pronto', jogador: BOT })
      continue
    }
    return
  }
  console.error(`[match] o bot não convergiu em ${MAX_JOGADAS_DO_BOT} jogadas (fase ${partida.fase})`)
}

/**
 * Monta o `World` da rodada corrente. `world` deixou de ser variável global montada por mão: ele sai
 * de `setupDaRodada(partida)`, que é quem carrega a seed da rodada (Regra 1), o lado do jogador
 * (§5.3) e o `itemBonus` agregado das compras (§5.2).
 */
function abrirRodada(): void {
  const setup = setupDaRodada(partida, CHARS)
  const lados = ladosDaRodada(partida)
  meuLado = lados[HUMANO]
  ladoDoBot = lados[BOT]

  pendentes = []
  flutuantes = []
  acc = 0
  world = createWorld(CHARS, { ...setup, arena: { w: ARENA_W, h: ARENA_H } })
  // M-1: NOVO a cada rodada, com a seed DAQUELA rodada. Nunca reaproveitar entre rodadas.
  bot = createBot(setup.seed, ladoDoBot)

  for (const b of world.balls) basePorChar[b.charId] = b.base
}

/**
 * A rodada acabou: traduz TIME → JOGADOR e entrega o resultado a `match/`.
 *
 * O `hash` é calculado AQUI e entregue pronto — `match/` não importa de `tools/` e
 * `ResultadoRodada.hash` é `string` e nada mais (§2.2). É a mesma função do arnês
 * (`tools/harness.ts:75`), não uma cópia: um segundo FNV-1a no cliente seria a segunda fonte de
 * verdade do hash da rodada.
 *
 * `controle` é `['humano','bot']` porque é o que de fato aconteceu, e o campo existe por P3.1
 * (§10.1): sem ele a mediana de duração misturaria estas rodadas com as bot × bot do `sim:check`.
 */
function fecharRodada(w: World): void {
  const lados = ladosDaRodada(partida)
  const r: ResultadoRodada = {
    indice: partida.rodada,
    seedDaRodada: seedDaRodada(partida.seed, partida.rodada),
    ladoDoJogador: lados,
    vencedor: vencedorDaRodada(lados, w.winner),
    ticks: w.tick,
    hash: hash(w),
  }
  const t = registrarRodada(partida, r, ['humano', 'bot'])
  if (t.erro) {
    console.error(`[match] registrarRodada recusou a rodada ${r.indice}: ${t.erro}`)
    return
  }
  partida = t.estado
  // `rodadaFim` (P3.1 e P3.2) e `partidaFim` nascem aqui, não em `aplicar` — `registrarRodada` é a
  // outra porta de saída de eventos de `match/`, e esquecê-la deixaria o portão sem a métrica
  // principal
  telemetria.registrar(partida.seed, t.eventos)
  world = null
  bot = null
  // a rodada abriu a loja (ou o fim): o bot compra antes de a tela aparecer, para que o placar e as
  // compras dele já estejam na projeção que o humano lê — as compras não são secretas (§4.1)
  avancarBot()
  render()
}

// ---------------------------------------------------------------- telas

const acoes: AcoesDaTela = {
  draft: (charId) => decidir({ t: 'draft', jogador: HUMANO, charId }),
  build: (slot, abilityIndex, passiveIndex) =>
    decidir({ t: 'build', jogador: HUMANO, slot, abilityIndex, passiveIndex }),
  prontoBuilds: () => decidir({ t: 'pronto', jogador: HUMANO }),
  compra: (slot, itemId) => decidir({ t: 'compra', jogador: HUMANO, slot, itemId }),
  trocaDeBuild: (slot, abilityIndex, passiveIndex) =>
    decidir({ t: 'trocaDeBuild', jogador: HUMANO, slot, abilityIndex, passiveIndex }),
  prontoLoja: () => decidir({ t: 'pronto', jogador: HUMANO }),
  reiniciar: () => novaPartida(),
}

/**
 * Desenha a tela da fase corrente. **`FaseDaPartida` é a fonte** (§11.1): não existe variável de
 * "tela atual" neste arquivo, então a tela não pode discordar da partida.
 *
 * **Não decide nada e não chama o bot** — é função de estado para DOM, e só. A única escrita que ela
 * faz é abrir a rodada quando a fase pede, porque `world` é derivado da fase e não estado próprio.
 */
function render(): void {
  if (partida.fase === 'rodada') {
    overlay.classList.remove('show')
    if (!world) abrirRodada()
    fimDoTimer = null
    return
  }

  overlay.classList.add('show')

  // o relógio de parede de RF-04 só corre na fase builds, e só uma vez por entrada nela
  if (partida.fase === 'builds' && !partida.prontos[HUMANO]) {
    if (fimDoTimer === null) fimDoTimer = performance.now() + SEGUNDOS_DE_BUILD * 1000
  } else {
    fimDoTimer = null
  }

  const segundos = fimDoTimer === null ? null : segundosRestantes(performance.now())
  segundoDesenhado = segundos ?? -1
  const ctx: ContextoDaTela = { segundosRestantes: segundos, basePorChar, humano: HUMANO }
  desenharTela(overlay, visaoPara(partida, HUMANO), ctx, acoes)
}

function segundosRestantes(agora: number): number {
  return fimDoTimer === null ? 0 : Math.max(0, Math.ceil((fimDoTimer - agora) / 1000))
}

// ---------------------------------------------------------------- entrada

/** §5.3 / AC 9 — filtra por `meuLado`, **nunca** por `team === 0`: o lado alterna a cada rodada. */
const minhasBolas = (): Ball[] => (world ? world.balls.filter((b) => b.team === meuLado) : [])

function disparar(d: Disparo): void {
  if (!world) return
  const bola = minhasBolas()[d.ballIndex]
  if (!bola || !bola.alive || world.over) return
  pendentes.push({
    tick: world.tick + INPUT_DELAY_TICKS,
    ballId: bola.id,
    slot: d.slot,
    dx: d.dx,
    dy: d.dy,
    mag: d.mag,
  })
  // RF-36 / `e3.5` — o cast é registrado com o PONTEIRO que o produziu e o erro de mira contra o
  // inimigo vivo mais próximo. A definição da métrica está em `telemetria.ts`; aqui só se colhe o
  // que só o cliente sabe: quem é o inimigo e onde ele está neste instante.
  telemetria.registrar(partida.seed, [
    {
      t: 'cast',
      rodada: partida.rodada,
      ballIndex: d.ballIndex,
      ponteiro: d.ponteiro,
      anguloErro: anguloErroGraus(
        bola,
        { dx: d.dx, dy: d.dy },
        world.balls.filter((b) => b.team !== meuLado && b.alive),
      ),
    },
  ])
}

const entrada = criarEntrada(canvas, disparar, (k) => {
  if (k === ' ') {
    pausado = !pausado
    return
  }
  // `e3.5`, AC 5 — o ATALHO de exportar, ao lado do botão. Fora da fase rodada o overlay cobre a
  // tela e o botão é o caminho; durante a rodada o teclado é o único que não some.
  if (k === 't') {
    telemetria.exportar()
    return
  }
  if (!world) return
  const mapa: Record<string, [0 | 1, 'ability' | 'ult']> = {
    q: [0, 'ability'],
    w: [0, 'ult'],
    o: [1, 'ability'],
    p: [1, 'ult'],
  }
  const alvo = mapa[k]
  if (!alvo) return
  const bola = minhasBolas()[alvo[0]]
  if (!bola || !bola.alive) return
  // no teclado a mira é o cursor
  const [cx, cy] = entrada.cursorArena
  const dx = cx - bola.x
  const dy = cy - bola.y
  const d = Math.hypot(dx, dy) || 1
  const def = CHARS[bola.charId]
  const hab = alvo[1] === 'ult' ? def.ult : def.abilities[bola.abilityIndex]
  const mag = hab.maxRange > hab.minRange ? (d - hab.minRange) / (hab.maxRange - hab.minRange) : 1
  disparar({ ballIndex: alvo[0], slot: alvo[1], dx: dx / d, dy: dy / d, mag, ponteiro: TECLADO })
})

// `e3.5`, AC 5 — o BOTÃO de exportar. Vive fora do `#overlay` de propósito: `desenharTela` recria o
// conteúdo do overlay a cada fase, e um botão lá dentro sumiria a cada transição — inclusive na
// única tela em que exportar é mais útil, a de fim de partida.
btnExportar.onclick = () => telemetria.exportar()

// ---------------------------------------------------------------- laço

function frame(agora: number): void {
  const dtReal = Math.min(120, agora - ultimo)
  ultimo = agora

  // o timer de builds é do cliente (§2.6) e o estouro vira uma DECISÃO — `match/` não tem relógio
  if (fimDoTimer !== null && agora >= fimDoTimer) {
    fimDoTimer = null
    decidir({ t: 'buildPadrao', jogador: HUMANO })
  }

  const w = world
  if (w && !pausado && !w.over) {
    acc += dtReal
    let passos = 0
    while (acc >= TICK_MS && passos < 5) {
      const doTick = pendentes.filter((c) => c.tick <= w.tick)
      pendentes = pendentes.filter((c) => c.tick > w.tick)
      // AC 10 — `dummyCommands` saiu; quem joga o outro lado é o `heuristic` real, com o `BotState`
      // desta rodada (M-1) e o lado que o bot ocupa NESTA rodada.
      step(w, [...doTick.map((c) => ({ ...c, tick: w.tick })), ...(bot ? botCommands(w, bot) : [])])
      for (const ev of w.events) {
        if (ev.t === 'hit') {
          flutuantes.push({ x: ev.x, y: ev.y, valor: ev.amount, nascidoEm: agora, crit: ev.crit })
        }
      }
      acc -= TICK_MS
      passos++
    }
    if (flutuantes.length > 60) flutuantes = flutuantes.slice(-60)
  }

  redimensionar()
  if (w) {
    desenhar(g, canvas.clientWidth, canvas.clientHeight, w, {
      entrada,
      flutuantes,
      minhasBolas: minhasBolas(),
      agora,
      pausado,
      // AC 15 — o HUD passa a mostrar o placar REAL da partida, e o lado do humano pode ser 1
      placar: [partida.jogadores[HUMANO].vitorias, partida.jogadores[BOT].vitorias],
      meuLado,
      vitoriasParaVencer: partida.regras.vitoriasParaVencer,
    })
    // AC 11 — o fim da rodada deixou de ser estado morto: ele registra o resultado na partida
    if (w.over) fecharRodada(w)
  } else if (fimDoTimer !== null && segundosRestantes(agora) !== segundoDesenhado) {
    // a contagem regressiva aparece na tela de builds, mas só quando o SEGUNDO muda — ver
    // `segundoDesenhado`. Redesenhar por frame arrancaria o botão de baixo do dedo no celular.
    render()
  }
  requestAnimationFrame(frame)
}

function redimensionar(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = Math.round(canvas.clientWidth * dpr)
  const h = Math.round(canvas.clientHeight * dpr)
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
}

novaPartida()
requestAnimationFrame(frame)
