import { CHARS, ROSTER } from '../chars/index.ts'
import { dummyCommands } from '../bot/dummy.ts'
import { createWorld, step, TICK_MS, type PickSetup } from '../sim/world.ts'
import type { Ball, Command, World } from '../sim/types.ts'
import { criarEntrada, type Disparo } from './input.ts'
import { ARENA_H, ARENA_W } from './layout.ts'
import { desenhar, type Flutuante } from './render.ts'

/**
 * Fase 0 — fatia vertical local. Sem rede, sem draft, sem loja.
 * A única pergunta que este build precisa responder:
 * mirar habilidades em bolas que andam sozinhas é divertido?
 */

/**
 * Atraso de input em ticks. Na Fase 4 o servidor agenda os casts ~6 ticks à frente
 * (~100ms). Aqui fica 0 para o teste de diversão ser honesto — mude para 6 quando
 * quiser sentir a latência do netcode real antes de construí-lo.
 */
const INPUT_DELAY_TICKS = 0

const canvas = document.getElementById('c') as HTMLCanvasElement
const g = canvas.getContext('2d')!
const overlay = document.getElementById('overlay') as HTMLDivElement
const picksEl = document.getElementById('picks') as HTMLDivElement
const btnStart = document.getElementById('start') as HTMLButtonElement

const meuTime: PickSetup[] = [
  { charId: 'golem', abilityIndex: 0, passiveIndex: 0 },
  { charId: 'vex', abilityIndex: 0, passiveIndex: 0 },
]

let acc = 0
let ultimo = performance.now()
let pausado = false
let pendentes: Command[] = []
let flutuantes: Flutuante[] = []
let world: World = novaRodada()

function novaRodada(): World {
  const inimigo: PickSetup[] = [
    { charId: 'golem', abilityIndex: 0, passiveIndex: 0 },
    { charId: 'vex', abilityIndex: 0, passiveIndex: 0 },
  ]
  pendentes = []
  flutuantes = []
  acc = 0
  return createWorld(CHARS, {
    seed: (Math.random() * 1e9) | 0,
    arena: { w: ARENA_W, h: ARENA_H },
    teams: [meuTime.map((p) => ({ ...p })), inimigo],
  })
}

const minhasBolas = (): Ball[] => world.balls.filter((b) => b.team === 0)

// ---------------------------------------------------------------- entrada

function disparar(d: Disparo): void {
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
}

const entrada = criarEntrada(canvas, disparar, (k) => {
  if (k === 'r') {
    world = novaRodada()
    return
  }
  if (k === ' ') {
    pausado = !pausado
    return
  }
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
  disparar({ ballIndex: alvo[0], slot: alvo[1], dx: dx / d, dy: dy / d, mag })
})

// ---------------------------------------------------------------- laço

function frame(agora: number): void {
  const dtReal = Math.min(120, agora - ultimo)
  ultimo = agora

  if (!pausado && !world.over) {
    acc += dtReal
    let passos = 0
    while (acc >= TICK_MS && passos < 5) {
      const doTick = pendentes.filter((c) => c.tick <= world.tick)
      pendentes = pendentes.filter((c) => c.tick > world.tick)
      step(world, [
        ...doTick.map((c) => ({ ...c, tick: world.tick })),
        ...dummyCommands(world, 1),
      ])
      for (const ev of world.events) {
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
  desenhar(g, canvas.clientWidth, canvas.clientHeight, world, {
    entrada,
    flutuantes,
    minhasBolas: minhasBolas(),
    agora,
    pausado,
  })
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

// ---------------------------------------------------------------- build

function montarSeletor(): void {
  picksEl.innerHTML = ''
  meuTime.forEach((pick, idx) => {
    const def = ROSTER.find((c) => c.id === pick.charId)!
    const card = document.createElement('div')
    card.className = 'card'
    card.style.setProperty('--cor', def.color)
    card.innerHTML = `<h3>${def.name}<span>${idx === 0 ? 'polegar esquerdo' : 'polegar direito'}</span></h3>`

    for (const grupo of ['abilities', 'passives'] as const) {
      const linha = document.createElement('div')
      linha.className = 'grupo'
      linha.innerHTML = `<label>${grupo === 'abilities' ? 'ativa' : 'passiva'}</label>`
      def[grupo].forEach((op, i) => {
        const b = document.createElement('button')
        const chave = grupo === 'abilities' ? 'abilityIndex' : 'passiveIndex'
        b.className = 'op' + (pick[chave] === i ? ' sel' : '')
        b.innerHTML = `<b>${op.name}</b><i>${op.desc}</i>`
        b.onclick = () => {
          pick[chave] = i as 0 | 1
          montarSeletor()
        }
        linha.appendChild(b)
      })
      card.appendChild(linha)
    }
    picksEl.appendChild(card)
  })
}

btnStart.onclick = () => {
  overlay.classList.remove('show')
  world = novaRodada()
}

montarSeletor()
requestAnimationFrame(frame)
