import { CHARS } from '../chars/index.ts'
import { dummyCommands } from '../bot/dummy.ts'
import { createWorld, step, TICK_MS, type RoundSetup } from '../sim/world.ts'
import type { World } from '../sim/types.ts'

/**
 * Verificação do invariante que sustenta todo o projeto:
 * mesma seed + mesmos comandos = mesma partida, sempre.
 * Se isto quebrar, o servidor autoritativo e o arnês de balanceamento quebram junto.
 *
 * De quebra imprime a matriz de winrate espelhada — que deve ficar perto de 50/50,
 * porque os dois times são idênticos e o bot é o mesmo dos dois lados.
 */

const TIME = [
  { charId: 'golem', abilityIndex: 0 as const, passiveIndex: 0 as const },
  { charId: 'vex', abilityIndex: 0 as const, passiveIndex: 0 as const },
]

function setup(seed: number): RoundSetup {
  return { seed, teams: [TIME, TIME] }
}

function rodar(seed: number) {
  const world = createWorld(CHARS, setup(seed))
  while (!world.over && world.tick < 60 * 180) {
    step(world, [...dummyCommands(world, 0), ...dummyCommands(world, 1)])
  }
  return { winner: world.winner, ticks: world.tick, hash: hash(world) }
}

/** FNV-1a sobre o estado quantizado. Quantizar evita ruído de ponto flutuante irrelevante. */
function hash(w: World): string {
  const partes: string[] = [String(w.tick), String(w.winner)]
  for (const b of w.balls) {
    partes.push(
      `${b.id}:${b.x.toFixed(4)}:${b.y.toFixed(4)}:${b.vx.toFixed(4)}:${b.vy.toFixed(4)}:${b.hp.toFixed(4)}:${b.alive}`,
    )
  }
  let h = 0x811c9dc5
  const s = partes.join('|')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

const SEEDS = 40
let divergentes = 0
let v0 = 0
let v1 = 0
let empates = 0
const duracoes: number[] = []

for (let seed = 1; seed <= SEEDS; seed++) {
  const a = rodar(seed)
  const b = rodar(seed)
  if (a.hash !== b.hash || a.ticks !== b.ticks) {
    divergentes++
    console.log(`  ✗ seed ${seed}: ${a.hash}@${a.ticks} != ${b.hash}@${b.ticks}`)
  }
  if (a.winner === 0) v0++
  else if (a.winner === 1) v1++
  else empates++
  duracoes.push((a.ticks * TICK_MS) / 1000)
}

duracoes.sort((x, y) => x - y)
const mediana = duracoes[Math.floor(duracoes.length / 2)]

console.log('')
console.log(`determinismo   ${divergentes === 0 ? '✓ ok' : `✗ ${divergentes}/${SEEDS} divergiram`}`)
console.log(`espelho 2v2    time0 ${v0} · time1 ${v1} · empate ${empates}   (esperado ~50/50)`)
console.log(`duração        mediana ${mediana.toFixed(1)}s · min ${duracoes[0].toFixed(1)}s · max ${duracoes[duracoes.length - 1].toFixed(1)}s`)
console.log('')

if (divergentes > 0) throw new Error('simulação não é determinística')
