/** Lado NODE do zoom. Corpo idêntico ao de `probe-e4.html`. */
const RAIZ = '../../../src/'
const { createWorld, step } = await import(RAIZ + 'sim/world.ts')
const { CHARS } = await import(RAIZ + 'chars/index.ts')
const { createBot, botCommands } = await import(RAIZ + 'bot/heuristic.ts')

const MOTOR = 'NODE'
const pick = (charId) => ({ charId, abilityIndex: 0, passiveIndex: 0 })
const setup = (seed) => ({
  seed,
  teams: [[pick('golem'), pick('vex')], [pick('golem'), pick('vex')]],
})

const L = []
const world = createWorld(CHARS, setup(1))
const b0 = createBot(1, 0), b1 = createBot(1, 1)
while (!world.over && world.tick < 756) {
  const cmds = [...botCommands(world, b0), ...botCommands(world, b1)]
  if (world.tick >= 720 && world.tick <= 755) {
    for (const c of cmds) L.push(`${MOTOR} CMD t${world.tick} ball${c.ballId} ${c.slot} dx=${c.dx} dy=${c.dy} mag=${c.mag}`)
  }
  step(world, cmds)
  if (world.tick >= 720 && world.tick <= 755) {
    for (const b of world.balls) {
      L.push(`${MOTOR} S t${world.tick} b${b.id} x=${b.x} y=${b.y} vx=${b.vx} vy=${b.vy} hp=${b.hp} ax=${b.ax} ay=${b.ay}`)
    }
    L.push(`${MOTOR} P t${world.tick} ${world.projectiles.map((p) => `${p.id}@${p.x},${p.y},${p.vx},${p.vy}`).join(' ') || '-'}`)
    L.push(`${MOTOR} Z t${world.tick} ${world.zones.map((z) => `${z.id}:${z.kind}@${z.x},${z.y},${z.angle},${z.radius},${z.pull}`).join(' ') || '-'}`)
  }
}
console.log(L.join('\n'))
