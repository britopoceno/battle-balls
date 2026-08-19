/**
 * Medições para `docs/architecture-e4.md` (Fase 4 / E4).
 *
 * Roda FORA do projeto e não altera nenhuma linha de `src/` — importa o código atual por URL
 * absoluta e mede. Mesmo método de `architecture-e3.md` §1.
 */
import zlib from 'node:zlib'

const RAIZ = '../../../src/'

const { createWorld, step, TICK_MS, TICK_HZ } = await import(RAIZ + 'sim/world.ts')
const { CHARS } = await import(RAIZ + 'chars/index.ts')
const { createBot, botCommands } = await import(RAIZ + 'bot/heuristic.ts')
const { runRound, hash, MAX_ROUND_TICKS } = await import(RAIZ + 'tools/harness.ts')

// convenção de `architecture-e3.md` §1: [golem, vex] dos dois lados, ability 0 / passive 0
const pick = (charId) => ({ charId, abilityIndex: 0, passiveIndex: 0 })
const setup = (seed) => ({
  seed,
  teams: [
    [pick('golem'), pick('vex')],
    [pick('golem'), pick('vex')],
  ],
})

const heuristicDriver = (s) => {
  const b0 = createBot(s.seed, 0)
  const b1 = createBot(s.seed, 1)
  return (view) => [...botCommands(view, b0), ...botCommands(view, b1)]
}
const mudoDriver = () => () => []

const q = (v, d = 1) => {
  const f = 10 ** d
  return Math.round(v * f) / f
}
const bytes = (o) => Buffer.byteLength(JSON.stringify(o), 'utf8')
const deflate = (s) => zlib.deflateRawSync(Buffer.from(s, 'utf8'), { level: 6 }).length

// ---------------------------------------------------------------- snapshots

/** Tudo o que `World` carrega e é serializável. Sem `rng`, sem `chars`, sem closures. */
function snapshotCompleto(w) {
  return {
    tick: w.tick,
    time: w.time,
    over: w.over,
    winner: w.winner,
    arena: w.arena,
    phase: w.phase,
    nextId: w.nextId,
    balls: w.balls.map((b) => ({
      id: b.id, charId: b.charId, team: b.team,
      x: b.x, y: b.y, vx: b.vx, vy: b.vy, ax: b.ax, ay: b.ay,
      hp: b.hp, alive: b.alive, facing: b.facing,
      atkReadyAt: b.atkReadyAt, abilityReadyAt: b.abilityReadyAt,
      ultCharge: b.ultCharge, ultThreshold: b.ultThreshold,
      abilityIndex: b.abilityIndex, passiveIndex: b.passiveIndex,
      effects: b.effects.map((e) => ({ kind: e.kind, value: e.value, endsAt: e.endsAt, sourceId: e.sourceId })),
      contact: b.contact, memory: b.memory,
      base: b.base, bonusPassive: b.bonusPassive, bonusItem: b.bonusItem, stat: b.stat,
    })),
    projectiles: w.projectiles.map((p) => ({
      id: p.id, ownerId: p.ownerId, team: p.team, x: p.x, y: p.y, vx: p.vx, vy: p.vy,
      radius: p.radius, dmg: p.dmg, pierce: p.pierce, hitIds: p.hitIds,
      expiresAt: p.expiresAt, color: p.color,
    })),
    zones: w.zones.map((z) => ({
      id: z.id, kind: z.kind, team: z.team, ownerId: z.ownerId, x: z.x, y: z.y,
      angle: z.angle, halfLen: z.halfLen, radius: z.radius, pull: z.pull,
      burstDmg: z.burstDmg, expiresAt: z.expiresAt, ownerColor: z.ownerColor,
    })),
    events: w.events,
  }
}

/**
 * Só o que `client/render.ts` LÊ, quantizado. O estático (charId, time, maxHp, radius,
 * ultThreshold, cor) sai UMA vez no início da rodada e não entra aqui.
 */
function snapshotRender(w) {
  return {
    t: Math.round(w.time),
    o: w.over ? 1 : 0,
    w: w.winner,
    d: q(w.arena.pad, 0),
    b: w.balls.map((b) => [
      b.id, q(b.x), q(b.y), q(b.facing, 2), q(b.hp, 1), b.alive ? 1 : 0,
      q(b.ultCharge, 1), Math.round(b.abilityReadyAt),
      b.effects.length ? b.effects.map((e) => e.kind[0]).join('') : 0,
    ]),
    p: w.projectiles.map((p) => [p.id, q(p.x), q(p.y), q(p.vx), q(p.vy)]),
    z: w.zones.map((z) => [
      z.id, z.kind === 'wall' ? 0 : 1, q(z.x), q(z.y), q(z.angle, 2),
      q(z.halfLen, 0), q(z.radius, 0), q(z.pull, 0),
    ]),
    e: w.events.filter((ev) => ev.t === 'hit').map((ev) => [q(ev.x, 0), q(ev.y, 0), q(ev.amount, 1), ev.crit ? 1 : 0]),
  }
}

// ---------------------------------------------------------------- M1 + M2 + M5

const SEEDS = [1, 1001, 2001, 3001, 379]
const amostras = []

for (const seed of SEEDS) {
  const world = createWorld(CHARS, setup(seed))
  const tick = heuristicDriver(setup(seed))
  let bytesCompleto = 0, bytesRender = 0, bytesRenderDeflate = 0, bytesCompletoDeflate = 0
  let bytesComandos = 0, nComandos = 0, ticks = 0
  let picoRender = 0
  const fluxoRender = zlib.createDeflateRaw({ level: 6 })
  const pedacos = []
  fluxoRender.on('data', (c) => pedacos.push(c))

  while (!world.over && world.tick < MAX_ROUND_TICKS) {
    const cmds = tick(world)
    nComandos += cmds.length
    for (const c of cmds) bytesComandos += bytes([c.tick, c.ballId, c.slot === 'ult' ? 1 : 0, q(c.dx, 3), q(c.dy, 3), q(c.mag, 2)])
    step(world, cmds)
    ticks++
    const sc = JSON.stringify(snapshotCompleto(world))
    const sr = JSON.stringify(snapshotRender(world))
    bytesCompleto += Buffer.byteLength(sc, 'utf8')
    bytesCompletoDeflate += deflate(sc)
    const brr = Buffer.byteLength(sr, 'utf8')
    bytesRender += brr
    if (brr > picoRender) picoRender = brr
    bytesRenderDeflate += deflate(sr)
    fluxoRender.write(sr)
  }
  await new Promise((r) => fluxoRender.end(r))
  const fluxo = pedacos.reduce((a, c) => a + c.length, 0)

  amostras.push({
    seed, ticks, segundos: ticks / TICK_HZ, vencedor: world.winner, hash: hash(world),
    nComandos, bytesComandos,
    mediaCompleto: bytesCompleto / ticks,
    mediaCompletoDeflate: bytesCompletoDeflate / ticks,
    mediaRender: bytesRender / ticks,
    picoRender,
    mediaRenderDeflate: bytesRenderDeflate / ticks,
    mediaRenderFluxo: fluxo / ticks,
  })
}

const med = (f) => amostras.map(f).reduce((a, b) => a + b, 0) / amostras.length

console.log('=== M5 — duração da rodada (bot heurístico, roster atual) ===')
for (const a of amostras) console.log(`  seed ${String(a.seed).padStart(4)} · ${a.ticks} ticks · ${a.segundos.toFixed(2)}s · vencedor ${a.vencedor} · hash ${a.hash}`)
console.log(`  média: ${med((a) => a.ticks).toFixed(0)} ticks (${med((a) => a.segundos).toFixed(2)}s)`)

console.log('\n=== M1 — tamanho do snapshot (bytes por tick, média entre seeds) ===')
console.log(`  World serializável inteiro : ${med((a) => a.mediaCompleto).toFixed(0)} B  · deflate ${med((a) => a.mediaCompletoDeflate).toFixed(0)} B`)
console.log(`  snapshot de render         : ${med((a) => a.mediaRender).toFixed(0)} B  · deflate isolado ${med((a) => a.mediaRenderDeflate).toFixed(0)} B · deflate com contexto ${med((a) => a.mediaRenderFluxo).toFixed(0)} B`)
console.log(`  pico do snapshot de render : ${Math.max(...amostras.map((a) => a.picoRender))} B`)

const kbit = (bytesPorTick, hz) => (bytesPorTick * hz * 8) / 1000
console.log('\n  banda por CLIENTE (downstream), snapshot de render cru / deflate com contexto:')
for (const hz of [60, 30, 20, 15]) {
  console.log(`    ${String(hz).padStart(2)} Hz : ${kbit(med((a) => a.mediaRender), hz).toFixed(1)} kbit/s  /  ${kbit(med((a) => a.mediaRenderFluxo), hz).toFixed(1)} kbit/s`)
}
console.log(`  World inteiro a 60 Hz (o que NÃO se faz): ${kbit(med((a) => a.mediaCompleto), 60).toFixed(1)} kbit/s cru`)

console.log('\n=== M2 — comandos (upstream) ===')
console.log(`  comandos por rodada (2 bolas × 2 lados): ${med((a) => a.nComandos).toFixed(1)}`)
console.log(`  por lado, por segundo: ${(med((a) => a.nComandos) / 2 / med((a) => a.segundos)).toFixed(2)} cmd/s`)
console.log(`  bytes por comando (tupla quantizada): ${(med((a) => a.bytesComandos) / med((a) => a.nComandos)).toFixed(1)} B`)
console.log(`  upstream de um jogador: ${((med((a) => a.bytesComandos) / 2 / med((a) => a.segundos)) * 8 / 1000).toFixed(2)} kbit/s`)

// ---------------------------------------------------------------- M3 — CPU

function cronometrar(driver, n) {
  const t0 = process.hrtime.bigint()
  let ticks = 0
  for (let i = 0; i < n; i++) {
    const r = runRound(CHARS, setup(1000 + i), driver)
    ticks += r.ticks
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  return { ms, ticks, msPorTick: ms / ticks, rodadas: n }
}

// aquecimento do JIT
cronometrar(heuristicDriver, 20)
cronometrar(mudoDriver, 20)

const comBot = cronometrar(heuristicDriver, 200)
const semBot = cronometrar(mudoDriver, 200)

console.log('\n=== M3 — CPU (Node ' + process.version + ') ===')
console.log(`  com bot dos dois lados: ${comBot.msPorTick.toFixed(4)} ms/tick (${comBot.rodadas} rodadas, ${comBot.ticks} ticks)`)
console.log(`  sem bot (só motor)    : ${semBot.msPorTick.toFixed(4)} ms/tick (${semBot.rodadas} rodadas, ${semBot.ticks} ticks)`)
console.log(`  orçamento de um tick a 60 Hz: ${TICK_MS.toFixed(3)} ms`)
console.log(`  salas 1v1 (humano×humano, sem bot) por núcleo, a 100% : ${Math.floor(TICK_MS / semBot.msPorTick)}`)
console.log(`  salas com bot (modo solo) por núcleo, a 100%          : ${Math.floor(TICK_MS / comBot.msPorTick)}`)
console.log(`  a 25% de ocupação (margem de GC/IO): ${Math.floor(TICK_MS / semBot.msPorTick / 4)} salas sem bot`)

// pico por tick, numa rodada só
{
  const world = createWorld(CHARS, setup(379))
  const tick = heuristicDriver(setup(379))
  const amostrasTick = []
  while (!world.over && world.tick < MAX_ROUND_TICKS) {
    const cmds = tick(world)
    const t0 = process.hrtime.bigint()
    step(world, cmds)
    amostrasTick.push(Number(process.hrtime.bigint() - t0) / 1e6)
  }
  amostrasTick.sort((a, b) => a - b)
  const p = (x) => amostrasTick[Math.min(amostrasTick.length - 1, Math.floor(amostrasTick.length * x))]
  console.log(`  distribuição do tick (seed 379, com bot): mediana ${p(0.5).toFixed(4)} ms · p95 ${p(0.95).toFixed(4)} ms · p99 ${p(0.99).toFixed(4)} ms · máx ${amostrasTick[amostrasTick.length - 1].toFixed(4)} ms`)
}

// ---------------------------------------------------------------- M4 — hash de referência p/ o navegador

console.log('\n=== M4 — hashes de referência do Node (para comparar com o Chrome) ===')
for (const seed of [1, 1001, 2001, 3001, 379]) {
  const r = runRound(CHARS, setup(seed), heuristicDriver)
  console.log(`  seed ${String(seed).padStart(4)} : hash ${r.hash} · ticks ${r.ticks} · winner ${r.winner}`)
}
