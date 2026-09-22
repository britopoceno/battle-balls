import { CHARS } from '../chars/index.ts'
import { botCommands, createBot, type BotState } from '../bot/heuristic.ts'
import { criarPolitica, type PoliticaPartida } from '../bot/partida.ts'
import { createWorld, step, TICK_MS } from '../sim/world.ts'
import type { Ball, Command, World } from '../sim/types.ts'
import type { StatBlock } from '../sim/stats.ts'
import { hash } from '../tools/harness.ts'
import { ATRASO_ALVO_TICKS, type EstaticoDaRodada } from '../net/protocolo.ts'
import { projetar, type BolaVisivel, type VisaoDoMundo } from '../net/projecao.ts'
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
  type VisaoPartida,
} from '../match/index.ts'
import { criarEntrada, TECLADO, type Disparo } from './input.ts'
import { ARENA_H, ARENA_W } from './layout.ts'
import { desenhar, type Flutuante } from './render.ts'
import { desenharTela, type AcoesDaTela, type ContextoDaTela } from './telas.ts'
import { anguloErroGraus, criarTelemetria } from './telemetria.ts'
import { conectar, type Aviso, type Rede } from './rede.ts'

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
 *
 * **Fase 4 — dois modos (`docs/architecture-e4.md` §9, story `e4.5`).** O modo sai da URL, na carga
 * (`lerModo`): sem `#/sala/{id}`, este arquivo é o modo `local` descrito acima, sem mudança nenhuma — é
 * o treino (RF-43) e o único jogável sem servidor. Com o link, é o modo `conectado`, que mora inteiro na
 * seção MODO CONECTADO, no fim do arquivo: lá o estado é do servidor, e o cliente não monta mundo, não
 * simula, não aplica decisão e não tem bot (P4.2 por subtração, §8.1). Os dois modos dividem render,
 * input, telas e telemetria; divergem em quem tem o estado.
 */

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
  // `e4.5` — no modo conectado o cast vai ao servidor, sem tick (AC 6); o resto desta função é o local
  if (modo.t === 'conectado') {
    dispararConectado(d)
    return
  }
  if (!world) return
  const bola = minhasBolas()[d.ballIndex]
  if (!bola || !bola.alive || world.over) return
  pendentes.push({
    // P4.1 / `e4.1` — o cast humano é agendado ATRASO_ALVO_TICKS à frente (~100ms), o mesmo atraso
    // que o servidor soma no 1v1 (`architecture-e4.md` §4.1): o solo é treino honesto para a rede. Só
    // o EFEITO atrasa; a mira continua imediata em `input.ts` (RF-34). Os bots carimbam `view.tick`
    // e não passam por aqui — por isso o golden hash não se move (§4.2).
    tick: world.tick + ATRASO_ALVO_TICKS,
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
      ladoDaTela: d.ladoDaTela,
      mag: d.mag,
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
    // `e4.5` — pausar é parar a simulação local; no modo conectado quem simula é o servidor
    if (modo.t === 'conectado') return
    pausado = !pausado
    return
  }
  // `e3.5`, AC 5 — o ATALHO de exportar, ao lado do botão. Fora da fase rodada o overlay cobre a
  // tela e o botão é o caminho; durante a rodada o teclado é o único que não some.
  if (k === 't') {
    telemetria.exportar()
    return
  }
  if (modo.t === 'local' && !world) return
  const mapa: Record<string, [0 | 1, 'ability' | 'ult']> = {
    q: [0, 'ability'],
    w: [0, 'ult'],
    o: [1, 'ability'],
    p: [1, 'ult'],
  }
  const alvo = mapa[k]
  if (!alvo) return
  // `e4.5` — no modo conectado as bolas saem da projeção interpolada (AC 12, nota do @po)
  const bola = (modo.t === 'conectado' ? minhasBolasConectado() : minhasBolas())[alvo[0]]
  if (!bola || !bola.alive) return
  // no teclado a mira é o cursor
  const [cx, cy] = entrada.cursorArena
  const dx = cx - bola.x
  const dy = cy - bola.y
  const d = Math.hypot(dx, dy) || 1
  const def = CHARS[bola.charId]
  const hab = alvo[1] === 'ult' ? def.ult : def.abilities[bola.abilityIndex]
  const mag = hab.maxRange > hab.minRange ? (d - hab.minRange) / (hab.maxRange - hab.minRange) : 1
  disparar({
    ballIndex: alvo[0],
    slot: alvo[1],
    dx: dx / d,
    dy: dy / d,
    mag,
    ponteiro: TECLADO,
    ladoDaTela: null,
  })
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

// ================================================================ INÍCIO DO MODO CONECTADO (e4.5)
//
// Tudo o que o modo conectado executa está entre este marcador e o do fim, mais `rede.ts`. A verificação
// de P4.2 (AC 5) é um grep neste trecho: nenhuma chamada às três funções do motor e do redutor que dariam
// autoridade ao cliente. Das funções de cima, este trecho chama só `redimensionar` (que não decide nada);
// `disparar` e o atalho de teclado desviam para cá na primeira linha.

type Modo = { t: 'local' } | { t: 'conectado'; sala: string }

/**
 * AC 4 — o modo sai da URL, na carga da página, e só dela. `#/sala/{id}` com `id` não vazio (§6) abre
 * o modo conectado; qualquer outra coisa é o modo local de hoje, sem conexão nenhuma. O cliente não cria
 * sala e não tem tela de criação: o id vem do log de operação do servidor (§6.1), pelo link.
 */
function lerModo(hash: string): Modo {
  const m = /^#\/sala\/([^/?#]+)$/.exec(hash)
  return m ? { t: 'conectado', sala: m[1] } : { t: 'local' }
}

const modo = lerModo(location.hash)

let rede: Rede | null = null
/**
 * O JOGADOR desta conexão, do `{t:'sala'}` — pode ser o 1. Nada deste trecho assume o 0 (Dev Notes,
 * v1.7.0): as decisões, o lado, as bolas e a telemetria saem daqui.
 */
let eu: Jogador | null = null
/** a última `{t:'visao'}`: a projeção com segredo que o servidor manda, nunca `EstadoPartida` */
let visao: VisaoPartida | null = null
let estadoDaSala: 'aguardando' | 'jogando' | 'encerrada' | null = null
/** o estático da rodada em curso; `null` fora dela */
let estatico: EstaticoDaRodada | null = null
/** a última projeção desenhada — a fonte das bolas do jogador e do erro de mira (AC 10, AC 12) */
let vista: VisaoDoMundo | null = null
/** o lado que este jogador ocupa na rodada em curso, e o placar do HUD, fixados no `rodadaInicio` */
let ladoConectado: 0 | 1 = 0
let placarDaRodada: [number, number] = [0, 0]
let vitoriasParaVencerDaRodada = 0
/**
 * O `rodadaFim` chegou, mas o instante desenhado ainda não alcançou o snapshot final. A tela da fase
 * seguinte espera: é a metade cliente da §5.6 — os eventos do snap final (o golpe que mata) aparecem
 * antes da tela de fim de rodada (AC 8).
 */
let rodadaTerminando = false
/** fim do prazo de RF-04 em `performance.now()`, a partir do restante que o servidor mandou (§3.4) */
let prazoFim: number | null = null
/** um aviso que encerra a conexão está na tela, e nada o cobre */
let avisoNaTela = false

/**
 * `meuLado` no modo conectado: a MESMA `ladosDaRodada` de `match/`, alimentada com os dois campos que ela
 * lê (`regras.alternarLadoPorRodada` e `rodada`, `match/regras.ts`), que a visão traz. Reescrever a regra
 * aqui seria a segunda fonte de verdade de lado; o cast é o preço de a assinatura pedir o estado inteiro.
 */
function ladosDaVisao(v: VisaoPartida): [0 | 1, 0 | 1] {
  return ladosDaRodada({ regras: v.regras, rodada: v.rodada } as EstadoPartida)
}

/**
 * `telas.ts` desenha o DRAFT como se o humano fosse o jogador 0 (a vez e os botões habilitados comparam
 * com `0`), e o AC 12 o mantém intacto. No assento do jogador 1 a tela daria a vez ao oponente e travaria
 * o draft. A visão entregue à TELA (só a ela, e só no draft) põe este jogador no 0 e o oponente no 1; o
 * que vai ao servidor continua com o jogador verdadeiro. No assento 0 a visão passa sem cópia.
 */
function visaoParaATela(v: VisaoPartida, j: Jogador): VisaoPartida {
  if (j === 0 || v.fase !== 'draft') return v
  const rel = (x: Jogador): Jogador => (x === j ? 0 : 1)
  return {
    ...v,
    draft: {
      ...v.draft,
      ordem: v.draft.ordem.map(rel),
      escolhas: v.draft.escolhas.map((e) => ({ ...e, jogador: rel(e.jogador) })),
    },
  }
}

/** Uma decisão deste jogador, pelo fio. Quem a aplica, ou recusa, é a sala. */
function decidirConectado(montar: (j: Jogador) => Decisao): void {
  if (eu === null || rede === null) return
  rede.enviar({ t: 'decisao', d: montar(eu) })
}

const acoesConectado: AcoesDaTela = {
  draft: (charId) => decidirConectado((jogador) => ({ t: 'draft', jogador, charId })),
  build: (slot, abilityIndex, passiveIndex) =>
    decidirConectado((jogador) => ({ t: 'build', jogador, slot, abilityIndex, passiveIndex })),
  prontoBuilds: () => decidirConectado((jogador) => ({ t: 'pronto', jogador })),
  compra: (slot, itemId) => decidirConectado((jogador) => ({ t: 'compra', jogador, slot, itemId })),
  trocaDeBuild: (slot, abilityIndex, passiveIndex) =>
    decidirConectado((jogador) => ({ t: 'trocaDeBuild', jogador, slot, abilityIndex, passiveIndex })),
  prontoLoja: () => decidirConectado((jogador) => ({ t: 'pronto', jogador })),
  // A sala desta partida acabou e saiu do servidor. Recarregar apresenta o link de novo, e o servidor
  // responde que a sala não existe: é o aviso do caso v, que diz para pedir um link novo.
  reiniciar: () => location.reload(),
}

/** Um texto de status no overlay, com os estilos que as telas já usam. Não é aviso: a próxima tela o troca. */
function escreverNoOverlay(titulo: string, texto: string): void {
  overlay.innerHTML = ''
  const h = document.createElement('h1')
  h.textContent = titulo
  const p = document.createElement('p')
  p.className = 'sub'
  p.textContent = texto
  overlay.append(h, p)
  overlay.classList.add('show')
}

/**
 * AC 3, casos iv, v e vi — a mensagem na tela quando a conexão acabou. Texto FIXO do cliente, escrito a
 * partir dos campos do aviso: nem o `message` de um erro nem o `motivo` do servidor chegam aqui. O
 * primeiro aviso fica; nada o cobre depois.
 */
function mostrarAviso(a: Aviso): void {
  if (avisoNaTela) return
  avisoNaTela = true
  switch (a.t) {
    case 'versao': {
      const servidor = a.servidor === null ? 'sem versão' : `na versão ${a.servidor}`
      const versoes = `Esta página fala a versão ${a.cliente} do protocolo, e o servidor está ${servidor}.`
      if (a.remedio === 'recarregue') escreverNoOverlay('Página desatualizada', `${versoes} Recarregue a página.`)
      else escreverNoOverlay('Servidor desatualizado', `${versoes} Recarregar não resolve: espere o servidor ser atualizado.`)
      return
    }
    case 'linkInvalido':
      escreverNoOverlay(
        'Este link não abre uma sala',
        'A sala não existe, já acabou ou está cheia. Peça um link novo a quem subiu o servidor.',
      )
      return
    case 'semServidor':
      escreverNoOverlay(
        'Servidor não alcançado',
        `Não foi possível conectar a ${a.endereco}. Confira se o servidor está de pé e acessível desta rede, e recarregue a página.`,
      )
      return
    case 'assentoEmOutraAba':
      escreverNoOverlay(
        'Partida aberta em outro lugar',
        'Este assento foi retomado em outra aba ou aparelho. A partida continua por lá.',
      )
      return
    default: {
      const nenhum: never = a
      return nenhum
    }
  }
}

/**
 * A tela do modo conectado: a de `desenharTela`, pela fase da ÚLTIMA visão. Não decide nada — cada
 * clique vira uma decisão pelo fio (`acoesConectado`).
 */
function telaConectada(): void {
  if (avisoNaTela || rodadaTerminando) return
  if (visao === null || eu === null) {
    escreverNoOverlay(
      estadoDaSala === null ? 'Conectando…' : 'Aguardando o oponente…',
      estadoDaSala === null ? 'Abrindo a sala do link.' : 'A partida começa quando a segunda pessoa abrir o mesmo link.',
    )
    return
  }
  if (visao.fase === 'rodada') {
    overlay.classList.remove('show')
    return
  }
  overlay.classList.add('show')
  const segundos = segundosDoPrazo(performance.now())
  segundoDesenhado = segundos ?? -1
  const ctx: ContextoDaTela = { segundosRestantes: segundos, basePorChar, humano: eu }
  desenharTela(overlay, visaoParaATela(visao, eu), ctx, acoesConectado)
}

/**
 * Os segundos que a tela de builds mostra, ou `null` quando ela não conta. O relógio de RF-04 é do
 * servidor (§3.4): aqui só se exibe o restante recebido, e o estouro, com a build padrão, é da sala.
 */
function segundosDoPrazo(agora: number): number | null {
  if (visao === null || eu === null || prazoFim === null) return null
  if (visao.fase !== 'builds' || visao.prontos[eu]) return null
  return Math.max(0, Math.ceil((prazoFim - agora) / 1000))
}

/** As bolas deste jogador, da projeção interpolada, pelo lado DESTA rodada (AC 12, nota do @po). */
function minhasBolasConectado(): BolaVisivel[] {
  return vista ? vista.balls.filter((b) => b.team === ladoConectado) : []
}

/**
 * AC 6 — `{t:'cast'}` sem tick: quem carimba é o servidor (§4.1). A mira continua imediata porque é de
 * `input.ts` e não passa por aqui. O evento `cast` de RF-36 mede o erro contra as posições que o jogador
 * VIA, as da projeção interpolada (AC 10).
 */
function dispararConectado(d: Disparo): void {
  const v = vista
  const p = visao
  // `rodadaTerminando`: o servidor já fechou a rodada, e a tela só termina de mostrar o fim dela — o
  // equivalente do `world.over` do modo local. Um cast aqui seria recusado e viraria telemetria falsa.
  if (v === null || p === null || rede === null || v.over || rodadaTerminando) return
  const bola = minhasBolasConectado()[d.ballIndex]
  if (!bola || !bola.alive) return
  if (!rede.enviar({ t: 'cast', ballIndex: d.ballIndex, slot: d.slot, dx: d.dx, dy: d.dy, mag: d.mag })) return
  telemetria.registrar(p.seed, [
    {
      t: 'cast',
      rodada: p.rodada,
      ballIndex: d.ballIndex,
      ponteiro: d.ponteiro,
      ladoDaTela: d.ladoDaTela,
      mag: d.mag,
      anguloErro: anguloErroGraus(
        bola,
        { dx: d.dx, dy: d.dy },
        v.balls.filter((b) => b.team !== ladoConectado && b.alive),
      ),
    },
  ])
}

function iniciarConectado(sala: string): void {
  telaConectada()
  rede = conectar(sala, {
    sala(m) {
      eu = m.jogador
      estadoDaSala = m.estado
      // de volta a `aguardando` (o oponente caiu no draft, §6): a partida recomeça para quem sentar
      if (m.estado === 'aguardando') {
        visao = null
        estatico = null
        vista = null
      }
      telaConectada()
    },
    visao(v) {
      visao = v
      // o prazo vale só para a fase builds em que chegou; a próxima traz o seu
      if (v.fase !== 'builds') prazoFim = null
      telaConectada()
    },
    prazo(terminaEmMs) {
      prazoFim = performance.now() + terminaEmMs
      telaConectada()
    },
    rodadaInicio(e) {
      estatico = e
      vista = null
      flutuantes = []
      rodadaTerminando = false
      // a visão da rodada chegou antes (a sala manda a visão e só depois abre a rodada)
      if (visao !== null && eu !== null) {
        ladoConectado = ladosDaVisao(visao)[eu]
        placarDaRodada = [visao.eu.vitorias, visao.oponente.vitorias]
        vitoriasParaVencerDaRodada = visao.regras.vitoriasParaVencer
      }
      telaConectada()
    },
    snap(s) {
      // AC 8 — eventos NA CHEGADA, inclusive os do snap final, antes da tela de fim de rodada
      const agora = performance.now()
      for (const ev of s.events) {
        if (ev.t === 'hit') flutuantes.push({ x: ev.x, y: ev.y, valor: ev.amount, nascidoEm: agora, crit: ev.crit })
      }
      if (flutuantes.length > 60) flutuantes = flutuantes.slice(-60)
    },
    rodadaFim() {
      rodadaTerminando = true
    },
    evento(e) {
      // AC 10 — o evento do fio vai ao coletor como veio: o `controle` do `rodadaFim` é do servidor
      if (visao === null) {
        console.warn(`[telemetria] evento ${e.t} antes da primeira visão — sem seed para registrá-lo`)
        return
      }
      telemetria.registrar(visao.seed, [e])
    },
    aviso(a) {
      mostrarAviso(a)
    },
  })
}

function frameConectado(agora: number): void {
  requestAnimationFrame(frameConectado)
  redimensionar()
  const cw = canvas.clientWidth
  const ch = canvas.clientHeight
  const snap = rede !== null && estatico !== null ? rede.amostrar(agora) : null
  if (snap !== null && estatico !== null) {
    // AC 9 — a prova de tipo é esta chamada: a projeção vai a `desenhar` sem cast
    vista = projetar(snap, estatico, CHARS)
    desenhar(g, cw, ch, vista, {
      entrada,
      flutuantes,
      minhasBolas: minhasBolasConectado(),
      agora,
      pausado: false,
      placar: placarDaRodada,
      meuLado: ladoConectado,
      vitoriasParaVencer: vitoriasParaVencerDaRodada,
    })
  } else {
    g.clearRect(0, 0, cw, ch)
  }

  if (rodadaTerminando && (rede === null || rede.exibiuOUltimo())) {
    // o snapshot final já está na tela: agora sim a tela da fase seguinte
    rodadaTerminando = false
    estatico = null
    vista = null
    telaConectada()
  } else if (!rodadaTerminando && (segundosDoPrazo(agora) ?? -1) !== segundoDesenhado) {
    // mesma regra do modo local: a contagem só redesenha quando o SEGUNDO muda
    telaConectada()
  }
}

// ================================================================ FIM DO MODO CONECTADO (e4.5)

if (modo.t === 'conectado') {
  iniciarConectado(modo.sala)
  requestAnimationFrame(frameConectado)
} else {
  novaPartida()
  requestAnimationFrame(frame)
}
