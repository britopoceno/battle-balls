/** Lado NODE. Corpo idêntico ao de `probe-e4.html`. */
const RAIZ = '../../../src/'
const { createWorld, step } = await import(RAIZ + 'sim/world.ts')
const { CHARS } = await import(RAIZ + 'chars/index.ts')
const { createBot, botCommands } = await import(RAIZ + 'bot/heuristic.ts')
const { hash, MAX_ROUND_TICKS } = await import(RAIZ + 'tools/harness.ts')

const MOTOR = 'NODE'
const pick = (charId) => ({ charId, abilityIndex: 0, passiveIndex: 0 })
const setup = (seed) => ({
  seed,
  teams: [[pick('golem'), pick('vex')], [pick('golem'), pick('vex')]],
})

function hashBruto(w) {
  const partes = [String(w.tick), String(w.winner)]
  for (const b of w.balls) partes.push(`${b.id}:${b.x}:${b.y}:${b.vx}:${b.vy}:${b.hp}:${b.alive}`)
  let h = 0x811c9dc5
  const s = partes.join('|')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

const L = []
{
  const world = createWorld(CHARS, setup(1))
  const b0 = createBot(1, 0), b1 = createBot(1, 1)
  const trilha = []
  while (!world.over && world.tick < MAX_ROUND_TICKS) {
    step(world, [...botCommands(world, b0), ...botCommands(world, b1)])
    if (world.tick % 25 === 0) trilha.push(`${world.tick}:${hashBruto(world)}`)
  }
  L.push(`${MOTOR} TRILHA seed1 ${trilha.join(' ')}`)
}
{
  const dt = 1 / 60
  for (const id of Object.keys(CHARS).sort()) {
    L.push(`${MOTOR} MATH pow(${CHARS[id].drag},1/60) = ${Math.pow(CHARS[id].drag, dt)}`)
  }
  for (const d of [0.02, 0.1, 0.5, 0.9, 0.98]) L.push(`${MOTOR} MATH pow(${d},1/60) = ${Math.pow(d, dt)}`)
  const pares = [[3, 4], [24.030454555350282, 921.2125499626026], [0.1, 0.2], [-137.4499, 88.90123], [1e-8, 1], [900.5, 450.25]]
  for (const [a, b] of pares) L.push(`${MOTOR} MATH hypot(${a},${b}) = ${Math.hypot(a, b)}`)
  for (const [a, b] of pares) L.push(`${MOTOR} MATH sqrt(a2+b2)(${a},${b}) = ${Math.sqrt(a * a + b * b)}`)
  L.push(`${MOTOR} MATH sin(0.1) = ${Math.sin(0.1)}`)
  L.push(`${MOTOR} MATH cos(1.3) = ${Math.cos(1.3)}`)
  L.push(`${MOTOR} MATH atan2(0.7,-0.3) = ${Math.atan2(0.7, -0.3)}`)
  L.push(`${MOTOR} MATH sqrt(2) = ${Math.sqrt(2)}`)
  L.push(`${MOTOR} V8 ${process.versions.v8}`)
}
console.log(L.join('\n'))
