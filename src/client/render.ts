import type { Ball, World } from '../sim/types.ts'
import { SUDDEN_DEATH_MS } from '../sim/world.ts'
import { ARENA_H, ARENA_W, botoes, paraTela, transform } from './layout.ts'
import type { Entrada } from './input.ts'

export interface Flutuante {
  x: number
  y: number
  valor: number
  nascidoEm: number
  crit: boolean
}

const COR_TIME = ['#4dd6ff', '#ff7a6b']
const FUNDO = '#0a0c11'
const CHAO = '#151a24'

export interface OpcoesRender {
  entrada: Entrada
  flutuantes: Flutuante[]
  minhasBolas: Ball[]
  agora: number
  pausado: boolean
}

export function desenhar(
  g: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  world: World,
  o: OpcoesRender,
): void {
  const t = transform(cw, ch)
  g.clearRect(0, 0, cw, ch)
  g.fillStyle = FUNDO
  g.fillRect(0, 0, cw, ch)

  desenharArena(g, t, world)
  desenharZonas(g, t, world)
  desenharProjeteis(g, t, world)
  for (const b of world.balls) desenharBola(g, t, world, b, o.agora)
  desenharFlutuantes(g, t, o)
  desenharMiras(g, t, world, o)
  desenharHud(g, cw, ch, world, o)
}

// ------------------------------------------------------------------ arena

function desenharArena(g: CanvasRenderingContext2D, t: ReturnType<typeof transform>, world: World) {
  const pad = world.arena.pad
  const [x0, y0] = paraTela(t, 0, 0)
  g.save()
  g.globalAlpha = 0.35
  g.fillStyle = CHAO
  g.fillRect(x0, y0, ARENA_W * t.scale, ARENA_H * t.scale)
  g.restore()

  // área ainda válida (encolhe na morte súbita)
  const [ix, iy] = paraTela(t, pad, pad)
  const iw = (ARENA_W - pad * 2) * t.scale
  const ih = (ARENA_H - pad * 2) * t.scale
  g.fillStyle = CHAO
  g.fillRect(ix, iy, iw, ih)

  g.strokeStyle = pad > 0 ? 'rgba(255,120,90,0.55)' : 'rgba(255,255,255,0.14)'
  g.lineWidth = 2
  g.strokeRect(ix, iy, iw, ih)

  g.save()
  g.globalAlpha = 0.05
  g.strokeStyle = '#ffffff'
  g.lineWidth = 1
  for (let x = 120; x < ARENA_W; x += 120) {
    const [sx] = paraTela(t, x, 0)
    g.beginPath()
    g.moveTo(sx, iy)
    g.lineTo(sx, iy + ih)
    g.stroke()
  }
  g.restore()
}

function desenharZonas(g: CanvasRenderingContext2D, t: ReturnType<typeof transform>, world: World) {
  for (const z of world.zones) {
    const [sx, sy] = paraTela(t, z.x, z.y)
    if (z.kind === 'wall') {
      g.save()
      g.translate(sx, sy)
      g.rotate(z.angle)
      g.fillStyle = z.ownerColor
      g.globalAlpha = 0.85
      const w = z.halfLen * 2 * t.scale
      const h = z.radius * 2 * t.scale
      g.fillRect(-w / 2, -h / 2, w, h)
      g.globalAlpha = 0.25
      g.fillRect(-w / 2, -h / 2 - 4, w, 4)
      g.restore()
    } else {
      const r = z.radius * t.scale
      g.save()
      g.globalAlpha = z.pull > 0 ? 0.5 : 0.35
      g.strokeStyle = z.ownerColor
      g.lineWidth = z.pull > 0 ? 3 : 6
      g.beginPath()
      g.arc(sx, sy, r, 0, Math.PI * 2)
      g.stroke()
      if (z.pull > 0) {
        g.globalAlpha = 0.18
        g.fillStyle = z.ownerColor
        g.fill()
      }
      g.restore()
    }
  }
}

function desenharProjeteis(g: CanvasRenderingContext2D, t: ReturnType<typeof transform>, world: World) {
  for (const p of world.projectiles) {
    const [sx, sy] = paraTela(t, p.x, p.y)
    const [tx, ty] = paraTela(t, p.x - p.vx * 0.035, p.y - p.vy * 0.035)
    g.strokeStyle = p.color
    g.globalAlpha = 0.35
    g.lineWidth = p.radius * t.scale
    g.beginPath()
    g.moveTo(tx, ty)
    g.lineTo(sx, sy)
    g.stroke()
    g.globalAlpha = 1
    g.fillStyle = p.color
    g.beginPath()
    g.arc(sx, sy, p.radius * t.scale, 0, Math.PI * 2)
    g.fill()
  }
}

// ------------------------------------------------------------------ bolas

function desenharBola(
  g: CanvasRenderingContext2D,
  t: ReturnType<typeof transform>,
  world: World,
  b: Ball,
  agora: number,
) {
  const def = world.chars[b.charId]
  const [sx, sy] = paraTela(t, b.x, b.y)
  const r = b.radius * t.scale

  if (!b.alive) {
    g.save()
    g.globalAlpha = 0.16
    g.fillStyle = def.color
    g.beginPath()
    g.arc(sx, sy, r, 0, Math.PI * 2)
    g.fill()
    g.restore()
    return
  }

  const pronta = b.ultCharge >= b.ultThreshold
  if (pronta) {
    const pulso = 0.5 + 0.5 * Math.sin(agora / 180)
    g.save()
    g.globalAlpha = 0.25 + pulso * 0.3
    g.fillStyle = '#ffe27a'
    g.beginPath()
    g.arc(sx, sy, r * (1.45 + pulso * 0.12), 0, Math.PI * 2)
    g.fill()
    g.restore()
  }

  g.fillStyle = def.color
  g.beginPath()
  g.arc(sx, sy, r, 0, Math.PI * 2)
  g.fill()

  // faixa de direção: dá para ler para onde a bola está indo
  g.save()
  g.globalAlpha = 0.35
  g.strokeStyle = '#000'
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(sx, sy)
  g.lineTo(sx + Math.cos(b.facing) * r, sy + Math.sin(b.facing) * r)
  g.stroke()
  g.restore()

  g.strokeStyle = COR_TIME[b.team]
  g.lineWidth = 3
  g.beginPath()
  g.arc(sx, sy, r + 3, 0, Math.PI * 2)
  g.stroke()

  // arco de vida
  const frac = Math.max(0, b.hp / b.maxHp)
  g.strokeStyle = 'rgba(0,0,0,0.5)'
  g.lineWidth = 5
  g.beginPath()
  g.arc(sx, sy, r + 9, -Math.PI / 2, Math.PI * 1.5)
  g.stroke()
  g.strokeStyle = frac > 0.5 ? '#7ee08a' : frac > 0.25 ? '#ffd166' : '#ff6b6b'
  g.beginPath()
  g.arc(sx, sy, r + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac)
  g.stroke()

  const lento = b.effects.some((e) => e.kind === 'slow')
  const dot = b.effects.some((e) => e.kind === 'dot')
  const amp = b.effects.some((e) => e.kind === 'amp')
  let i = 0
  for (const [ativo, cor] of [
    [lento, '#7ec8ff'],
    [dot, '#8ce87a'],
    [amp, '#ffb36b'],
  ] as [boolean, string][]) {
    if (!ativo) continue
    g.fillStyle = cor
    g.beginPath()
    g.arc(sx - 12 + i * 12, sy - r - 16, 3.5, 0, Math.PI * 2)
    g.fill()
    i++
  }
}

function desenharFlutuantes(
  g: CanvasRenderingContext2D,
  t: ReturnType<typeof transform>,
  o: OpcoesRender,
) {
  g.textAlign = 'center'
  for (const f of o.flutuantes) {
    const idade = (o.agora - f.nascidoEm) / 900
    if (idade > 1) continue
    const [sx, sy] = paraTela(t, f.x, f.y - idade * 34)
    g.globalAlpha = 1 - idade
    g.fillStyle = f.crit ? '#ffd166' : '#ffffff'
    g.font = `${f.crit ? 700 : 500} ${(f.crit ? 20 : 15) * t.scale}px system-ui, sans-serif`
    g.fillText(String(Math.round(f.valor)), sx, sy)
  }
  g.globalAlpha = 1
}

// ------------------------------------------------------------------ mira

function desenharMiras(
  g: CanvasRenderingContext2D,
  t: ReturnType<typeof transform>,
  world: World,
  o: OpcoesRender,
) {
  for (const mira of o.entrada.miras.values()) {
    const bola = o.minhasBolas[mira.botao.ballIndex]
    if (!bola || !bola.alive) continue
    const def = world.chars[bola.charId]
    const hab = mira.botao.slot === 'ability' ? def.abilities[bola.abilityIndex] : def.ult
    const alcance = hab.minRange + (hab.maxRange - hab.minRange) * mira.mag
    const [sx, sy] = paraTela(t, bola.x, bola.y)
    const [ex, ey] = paraTela(t, bola.x + mira.dx * alcance, bola.y + mira.dy * alcance)

    g.save()
    g.strokeStyle = def.color
    g.globalAlpha = 0.55
    g.lineWidth = 3
    g.setLineDash([10, 8])
    g.beginPath()
    g.moveTo(sx, sy)
    g.lineTo(ex, ey)
    g.stroke()
    g.setLineDash([])
    g.globalAlpha = 0.9
    g.beginPath()
    g.arc(ex, ey, 12 * t.scale, 0, Math.PI * 2)
    g.stroke()
    g.beginPath()
    g.arc(ex, ey, 3 * t.scale, 0, Math.PI * 2)
    g.fillStyle = def.color
    g.fill()
    g.restore()
  }
}

// ------------------------------------------------------------------ hud

function desenharHud(
  g: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  world: World,
  o: OpcoesRender,
) {
  g.textAlign = 'left'
  for (const time of [0, 1] as const) {
    const bolas = world.balls.filter((b) => b.team === time)
    bolas.forEach((b, i) => {
      const def = world.chars[b.charId]
      const larg = 150
      const x = time === 0 ? 20 : cw - 20 - larg
      const y = 20 + i * 30
      g.fillStyle = 'rgba(255,255,255,0.08)'
      g.fillRect(x, y, larg, 18)
      g.fillStyle = def.color
      g.globalAlpha = b.alive ? 1 : 0.25
      g.fillRect(x, y, larg * Math.max(0, b.hp / b.maxHp), 18)
      g.globalAlpha = 1
      g.strokeStyle = COR_TIME[time]
      g.lineWidth = 1.5
      g.strokeRect(x, y, larg, 18)
      g.fillStyle = '#0a0c11'
      g.font = '600 12px system-ui, sans-serif'
      g.fillText(def.name.toUpperCase(), x + 7, y + 13)
    })
  }

  // relógio da rodada
  g.textAlign = 'center'
  const seg = world.time / 1000
  g.fillStyle = world.arena.pad > 0 ? '#ff7a6b' : 'rgba(255,255,255,0.6)'
  g.font = '600 18px system-ui, sans-serif'
  g.fillText(seg.toFixed(1) + 's', cw / 2, 34)
  if (world.arena.pad > 0) {
    g.font = '700 13px system-ui, sans-serif'
    g.fillText('MORTE SÚBITA', cw / 2, 54)
  } else {
    g.fillStyle = 'rgba(255,255,255,0.28)'
    g.font = '500 11px system-ui, sans-serif'
    g.fillText(`morte súbita em ${Math.max(0, SUDDEN_DEATH_MS / 1000 - seg).toFixed(0)}s`, cw / 2, 52)
  }

  for (const bt of botoes(cw, ch)) {
    const bola = o.minhasBolas[bt.ballIndex]
    if (!bola) continue
    const def = world.chars[bola.charId]
    const ehUlt = bt.slot === 'ult'
    const hab = ehUlt ? def.ult : def.abilities[bola.abilityIndex]
    const pronto = ehUlt
      ? bola.ultCharge >= bola.ultThreshold
      : world.time >= bola.abilityReadyAt
    const frac = ehUlt
      ? bola.ultCharge / bola.ultThreshold
      : 1 -
        Math.max(0, (bola.abilityReadyAt - world.time) / def.abilities[bola.abilityIndex].cd)

    g.save()
    g.globalAlpha = bola.alive ? 1 : 0.3
    // preenchimento de carga, de baixo para cima
    g.beginPath()
    g.arc(bt.x, bt.y, bt.r, 0, Math.PI * 2)
    g.clip()
    g.fillStyle = 'rgba(255,255,255,0.07)'
    g.fillRect(bt.x - bt.r, bt.y - bt.r, bt.r * 2, bt.r * 2)
    g.fillStyle = pronto ? hexA(def.color, 0.55) : hexA(def.color, 0.25)
    g.fillRect(bt.x - bt.r, bt.y + bt.r - bt.r * 2 * frac, bt.r * 2, bt.r * 2 * frac)
    g.restore()

    g.save()
    g.globalAlpha = bola.alive ? 1 : 0.3
    g.strokeStyle = pronto ? def.color : 'rgba(255,255,255,0.28)'
    g.lineWidth = pronto ? 3 : 2
    g.beginPath()
    g.arc(bt.x, bt.y, bt.r, 0, Math.PI * 2)
    g.stroke()

    g.textAlign = 'center'
    g.fillStyle = '#fff'
    if (ehUlt) {
      g.font = `${bt.r * 0.7}px system-ui, sans-serif`
      g.fillText(def.ult.icon, bt.x, bt.y + bt.r * 0.25)
    } else {
      g.font = `600 ${Math.round(bt.r * 0.3)}px system-ui, sans-serif`
      const palavras = hab.name.split(' ')
      palavras.forEach((p, i) => {
        g.fillText(p, bt.x, bt.y + 4 + (i - (palavras.length - 1) / 2) * bt.r * 0.36)
      })
    }
    g.restore()
  }

  if (world.over) {
    g.fillStyle = 'rgba(10,12,17,0.72)'
    g.fillRect(0, ch / 2 - 70, cw, 140)
    g.textAlign = 'center'
    g.fillStyle = world.winner === 0 ? '#7ee08a' : world.winner === 1 ? '#ff7a6b' : '#ffd166'
    g.font = '700 42px system-ui, sans-serif'
    g.fillText(
      world.winner === 0 ? 'VOCÊ VENCEU' : world.winner === 1 ? 'VOCÊ PERDEU' : 'EMPATE',
      cw / 2,
      ch / 2 + 6,
    )
    g.fillStyle = 'rgba(255,255,255,0.55)'
    g.font = '500 15px system-ui, sans-serif'
    g.fillText('R para jogar de novo', cw / 2, ch / 2 + 40)
  } else if (o.pausado) {
    g.textAlign = 'center'
    g.fillStyle = 'rgba(255,255,255,0.75)'
    g.font = '700 30px system-ui, sans-serif'
    g.fillText('PAUSADO', cw / 2, ch / 2)
  }
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
