import { CHARS } from '../chars/index.ts'
import { dummyCommands } from '../bot/dummy.ts'
import { createWorld, step, TICK_MS } from '../sim/world.ts'

/** Roda uma seed e imprime o estado final. Serve para investigar rodadas que travam. */
const argv = (globalThis as { process?: { argv?: string[] } }).process?.argv
const seed = Number(argv?.[2] ?? 1)

const TIME = [
  { charId: 'golem', abilityIndex: 0 as const, passiveIndex: 0 as const },
  { charId: 'vex', abilityIndex: 0 as const, passiveIndex: 0 as const },
]

const world = createWorld(CHARS, { seed, teams: [TIME, TIME] })
const marcos: string[] = []
let ultimoDano = 0

while (!world.over && world.tick < 60 * 180) {
  step(world, [...dummyCommands(world, 0), ...dummyCommands(world, 1)])
  for (const ev of world.events) {
    if (ev.t === 'hit') ultimoDano = world.time
    if (ev.t === 'death') marcos.push(`${(world.time / 1000).toFixed(1)}s morreu #${ev.ballId}`)
    if (ev.t === 'suddenDeath') marcos.push(`${(world.time / 1000).toFixed(1)}s morte súbita`)
  }
}

console.log(`seed ${seed} · ${(world.tick * TICK_MS / 1000).toFixed(1)}s · vencedor ${world.winner}`)
console.log(`último dano aos ${(ultimoDano / 1000).toFixed(1)}s · pad final ${world.arena.pad.toFixed(0)}px`)
for (const m of marcos) console.log('  ' + m)
for (const b of world.balls) {
  console.log(
    `  #${b.id} ${b.charId} t${b.team} hp ${b.hp.toFixed(0)}/${b.stat.maxHp}` +
      ` pos ${b.x.toFixed(0)},${b.y.toFixed(0)} vel ${Math.hypot(b.vx, b.vy).toFixed(0)}` +
      ` ${b.alive ? '' : '(morto)'}`,
  )
}
