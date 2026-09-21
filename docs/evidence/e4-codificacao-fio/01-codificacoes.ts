// Medições para docs/architecture-e4.md §5.5 (codificação do fio, 2026-09-21, e4.2). Roda FORA do projeto,
// não altera src/: importa o código atual e mede codificações do {t:'snap'} sobre os snapshots REAIS de
// net/snapshot.ts (e4.2). Uso: node 01-codificacoes.ts  (INT=1 → 60 Hz, INT=3 → 20 Hz; padrão = SNAPSHOT_HZ)
import zlib from 'node:zlib'
const R = '../../../src/'
const { createWorld, step } = await import(R + 'sim/world.ts')
const { CHARS } = await import(R + 'chars/index.ts')
const { createBot, botCommands } = await import(R + 'bot/heuristic.ts')
const { MAX_ROUND_TICKS } = await import(R + 'tools/harness.ts')
const { criarProdutorDeSnapshot, estaticoDaRodada } = await import(R + 'net/snapshot.ts')
const { SNAPSHOT_HZ } = await import(R + 'net/protocolo.ts')

const TIME = [
  { charId: 'golem', abilityIndex: 0, passiveIndex: 0 },
  { charId: 'vex', abilityIndex: 0, passiveIndex: 0 },
]
const SEEDS = [1, 1001, 2001, 3001, 379]
const INT = Number(process.env.INT ?? 60 / SNAPSHOT_HZ)

type Verdade = { time: number; balls: { r: number; u: number; thr: number }[] }
const quadros: { snap: any; v: Verdade }[] = []
const porSeed: number[] = []
for (const seed of SEEDS) {
  const s = { seed, teams: [TIME, TIME] }
  const w = createWorld(CHARS, s)
  const b0 = createBot(seed, 0), b1 = createBot(seed, 1)
  const p = criarProdutorDeSnapshot(w)
  let n = 0
  while (!w.over && w.tick < MAX_ROUND_TICKS) {
    step(w, [...botCommands(w, b0), ...botCommands(w, b1)])
    p.observar(w)
    const fim = w.over || w.tick >= MAX_ROUND_TICKS
    if (w.tick % INT === 0 || fim) {
      quadros.push({
        snap: p.snapshot(w),
        v: { time: w.time, balls: w.balls.map((b: any) => ({ r: b.abilityReadyAt, u: b.ultCharge, thr: b.ultThreshold })) },
      })
      n++
    }
  }
  porSeed.push(n)
}
const thrPorId = new Map<number, number>()
{
  const w = createWorld(CHARS, { seed: 1, teams: [TIME, TIME] })
  for (const b of estaticoDaRodada(w).balls) thrPorId.set(b.id, b.ultThreshold)
}

const q = (v: number, k = 100) => Math.round(v * k) / k
const fl = (v: number, k = 100) => Math.floor(v * k) / k
const ce = (v: number, k = 100) => Math.ceil(v * k) / k

// ---- codificações ----
const keyed = (s: any) => s
function keyedQ(s: any) {
  return {
    time: q(s.time), over: s.over, winner: s.winner,
    arena: { w: s.arena.w, h: s.arena.h, pad: q(s.arena.pad) },
    balls: s.balls.map((b: any) => ({ id: b.id, x: b.x, y: b.y, facing: b.facing, hp: q(b.hp), alive: b.alive,
      ultCharge: fl(b.ultCharge), abilityReadyAt: q(s.time) + ce(b.abilityReadyAt - s.time), effects: b.effects })),
    projectiles: s.projectiles.map((p: any) => ({ ...p, vx: q(p.vx), vy: q(p.vy), radius: q(p.radius) })),
    zones: s.zones.map((z: any) => ({ ...z, halfLen: q(z.halfLen), radius: q(z.radius), pull: q(z.pull) })),
    events: s.events,
  }
}
const EFF: Record<string, number> = {}
function effIdx(k: string) { if (!(k in EFF)) EFF[k] = Object.keys(EFF).length; return EFF[k] }
function tupla(s: any, modo: 'cru' | 'seguro' | 'ingenuo', evTupla = false) {
  const Q = modo === 'cru' ? (v: number) => v : q
  const U = modo === 'cru' ? (v: number) => v : modo === 'seguro' ? fl : q
  const RDY = modo === 'cru' ? (r: number) => r - s.time : modo === 'seguro' ? (r: number) => Math.max(0, ce(r - s.time)) : (r: number) => q(r - s.time)
  return [
    Q(s.time), s.over ? 1 : 0, s.winner, s.arena.w, s.arena.h, Q(s.arena.pad),
    s.balls.map((b: any) => [b.id, b.x, b.y, b.facing, Q(b.hp), b.alive ? 1 : 0, U(b.ultCharge), RDY(b.abilityReadyAt), b.effects.map((e: any) => effIdx(e.kind))]),
    s.projectiles.map((p: any) => [p.id, p.x, p.y, Q(p.vx), Q(p.vy), Q(p.radius), p.color]),
    s.zones.map((z: any) => [z.id, z.kind, z.x, z.y, z.angle, Q(z.halfLen), Q(z.radius), Q(z.pull), z.ownerColor]),
    evTupla ? s.events.map((e: any) => Object.values(e).map((x: any) => (typeof x === 'number' ? q(x) : x))) : s.events,
  ]
}
function decodePronto(t: any) {
  const time = t[0]
  return t[6].map((b: any) => ({ id: b[0], rdy: time >= time + b[7], ult: b[6] >= thrPorId.get(b[0])! }))
}

// ---- deflate com contexto (permessage-deflate, context takeover, sem os 4 B de cauda) ----
async function comContexto(msgs: string[]): Promise<number[]> {
  const d = zlib.createDeflateRaw({ windowBits: 15, memLevel: 8 })
  let acc = 0
  d.on('data', (c: Buffer) => { acc += c.length })
  const out: number[] = []
  for (const m of msgs) {
    acc = 0
    d.write(Buffer.from(m))
    await new Promise<void>((res) => d.flush(zlib.constants.Z_SYNC_FLUSH, () => res()))
    out.push(acc - 4)
  }
  return out
}
const isolado = (m: string) => zlib.deflateRawSync(Buffer.from(m)).length

const stats = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return `média ${m.toFixed(1).padStart(7)} · pico ${String(Math.max(...xs)).padStart(5)}`
}
const B = (s: string) => Buffer.byteLength(s, 'utf8')

const variantes: [string, (s: any) => unknown][] = [
  ['A keyed JSON como produzido (e4.2)', keyed],
  ['B keyed JSON, quantização segura', keyedQ],
  ['C tupla, valores crus', (s) => tupla(s, 'cru')],
  ['D tupla, quantização segura, events literais', (s) => tupla(s, 'seguro')],
  ['E tupla, quantização segura, events em tupla', (s) => tupla(s, 'seguro', true)],
]
console.log(`cadência ${60 / INT} Hz (SNAPSHOT_HZ do protocolo = ${SNAPSHOT_HZ}) · quadros: ${quadros.length} (por seed ${porSeed.join('/')}), ticks/quadro ${INT}`)
for (const [nome, f] of variantes) {
  // intercalar como no fio real: cada cliente tem o SEU contexto; aqui 1 cliente, rodadas em sequência
  const msgs = quadros.map((x) => JSON.stringify({ t: 'snap', s: f(x.snap), seq: 0 }))
  const cru = msgs.map(B)
  const iso = msgs.map(isolado)
  const ctx = await comContexto(msgs)
  console.log(`${nome.padEnd(48)} cru ${stats(cru)} | deflate isolado ${stats(iso)} | deflate c/ contexto ${stats(ctx)}`)
}
// só events, keyed
const ev = quadros.map((x) => B(JSON.stringify(x.snap.events)))
console.log(`events (keyed, parte de A/B/D): ${stats(ev)}`)

// ---- prontidão: seguro vs ingênuo ----
let tot = 0, flipSeg = 0, flipIng = 0, flipIngRdy = 0, flipIngUlt = 0, iguais = 0
for (const x of quadros) {
  const vs = x.v.balls.map((b) => ({ rdy: x.v.time >= b.r, ult: b.u >= b.thr }))
  const seg = decodePronto(tupla(x.snap, 'seguro'))
  const ing = decodePronto(tupla(x.snap, 'ingenuo'))
  vs.forEach((v, i) => {
    tot++
    if (v.rdy !== seg[i].rdy || v.ult !== seg[i].ult) flipSeg++
    if (v.rdy !== ing[i].rdy) flipIngRdy++
    if (v.ult !== ing[i].ult) flipIngUlt++
    if (v.rdy !== ing[i].rdy || v.ult !== ing[i].ult) flipIng++
    else iguais++
  })
}
console.log(`prontidão (bola×quadro = ${tot}): seguro vira ${flipSeg} · ingênuo (round 0,01) vira ${flipIng} (habilidade ${flipIngRdy}, ult ${flipIngUlt})`)

// quantos quadros têm ult "quase cheia" — onde o ingênuo erraria se caísse no limiar
let perto = 0
for (const x of quadros) for (const b of x.v.balls) if (b.u < b.thr && b.thr - b.u < 0.005) perto++
console.log(`ult a menos de 0,005 do limiar sem estar cheia: ${perto} bola×quadro`)
let pertoR = 0
for (const x of quadros) for (const b of x.v.balls) { const r = b.r - x.v.time; if (r > 0 && r < 0.005) pertoR++ }
console.log(`habilidade a menos de 0,005 ms de pronta: ${pertoR}`)
// casas decimais típicas
const amostra = quadros[400].snap
console.log('amostra keyed bola:', JSON.stringify(amostra.balls[0]))
console.log('amostra tupla D:', JSON.stringify(tupla(amostra, 'seguro')).slice(0, 400))
console.log('amostra keyed B (1 bola):', JSON.stringify(keyedQ(amostra).balls[0]))
console.log('EFF', EFF)
