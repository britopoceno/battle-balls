const RAIZ = '../../../src/'
const { createWorld, step } = await import(RAIZ + 'sim/world.ts')
const { CHARS } = await import(RAIZ + 'chars/index.ts')
const { createBot, botCommands } = await import(RAIZ + 'bot/heuristic.ts')
const { MAX_ROUND_TICKS } = await import(RAIZ + 'tools/harness.ts')
const pick = (charId) => ({ charId, abilityIndex: 0, passiveIndex: 0 })
const setup = (seed) => ({ seed, teams: [[pick('golem'), pick('vex')], [pick('golem'), pick('vex')]] })
const L = []
for (const seed of [1, 1001, 2001, 3001, 379]) {
  const w = createWorld(CHARS, setup(seed))
  const b0 = createBot(seed, 0), b1 = createBot(seed, 1)
  const marcos = new Set([1000, 2000, 3000, 4000])
  while (!w.over && w.tick < MAX_ROUND_TICKS) {
    step(w, [...botCommands(w, b0), ...botCommands(w, b1)])
    if (marcos.has(w.tick)) L.push(`${seed} ${w.tick} ` + w.balls.map((b) => `${b.x} ${b.y} ${b.vx} ${b.vy} ${b.hp}`).join(' '))
  }
  L.push(`${seed} FIM ` + w.balls.map((b) => `${b.x} ${b.y} ${b.vx} ${b.vy} ${b.hp}`).join(' ') + ` | ticks ${w.tick} winner ${w.winner}`)
}
console.log(L.join('\n'))
