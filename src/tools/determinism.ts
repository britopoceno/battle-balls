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

/**
 * GOLDEN HASH — baseline de referência.
 *
 * O bloco de autoconsistência abaixo prova que a simulação é REPRODUTÍVEL (rodar a
 * mesma seed duas vezes dá o mesmo resultado). Ele não prova que ela é A MESMA DE
 * ONTEM: uma refatoração que mudasse o comportamento do jogo passaria verde.
 *
 * Estes 5 valores travam o comportamento atual. A migração de 8 passos de
 * `docs/architecture.md` §6 declara hash IDÊNTICO nos passos 1 a 7 — se algum deles
 * mexer nestes números, a refatoração mudou o jogo e a story falhou.
 *
 * A seed 11 é deliberada: exercita o caminho de empate (winner === -1), que é o que
 * a decisão D-02 (`docs/prd.md` §5) regulamenta.
 *
 * NÃO "atualize" esta tabela para fazer o teste passar. Se a execução não bate, o bug
 * está na execução. Mudança de baseline exige justificativa registrada no commit.
 *
 * Fonte: `docs/architecture.md` §6.0 · Anexo B item A-2 · story `debt.0`
 */
const BASELINE: { seed: number; hash: string; ticks: number; winner: number }[] = [
  { seed: 1, hash: '96de1201', ticks: 753, winner: 1 },
  { seed: 2, hash: 'f66a7416', ticks: 961, winner: 0 },
  { seed: 3, hash: 'a8db9c28', ticks: 830, winner: 0 },
  { seed: 7, hash: 'cb77dbe0', ticks: 831, winner: 0 },
  { seed: 11, hash: '6aede2d9', ticks: 1168, winner: -1 },
]

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

// --------------------------------------------------------- baseline (golden hash)

const desvios: string[] = []
for (const esperado of BASELINE) {
  const obtido = rodar(esperado.seed)
  const campos: [string, string | number, string | number][] = [
    ['hash', esperado.hash, obtido.hash],
    ['ticks', esperado.ticks, obtido.ticks],
    ['vencedor', esperado.winner, obtido.winner],
  ]
  for (const [campo, esp, obt] of campos) {
    if (esp !== obt) {
      desvios.push(`  ✗ baseline seed ${esperado.seed}: ${campo} esperado ${esp}, obtido ${obt}`)
    }
  }
}

duracoes.sort((x, y) => x - y)
const mediana = duracoes[Math.floor(duracoes.length / 2)]

console.log('')
console.log(`determinismo   ${divergentes === 0 ? '✓ ok' : `✗ ${divergentes}/${SEEDS} divergiram`}`)
if (desvios.length) for (const d of desvios) console.log(d)
console.log(
  `golden hash    ${desvios.length === 0 ? `✓ ok — ${BASELINE.length} seeds batem o baseline` : `✗ ${desvios.length} desvio(s)`}`,
)
console.log(`espelho 2v2    time0 ${v0} · time1 ${v1} · empate ${empates}   (esperado ~50/50)`)
console.log(`duração        mediana ${mediana.toFixed(1)}s · min ${duracoes[0].toFixed(1)}s · max ${duracoes[duracoes.length - 1].toFixed(1)}s`)
console.log('')

if (divergentes > 0) throw new Error('simulação não é determinística')
if (desvios.length > 0) {
  throw new Error(
    `comportamento divergiu do baseline em ${desvios.length} campo(s). ` +
      'Os passos 1 a 7 da migração (docs/architecture.md §6.1) exigem hash IDÊNTICO. ' +
      'Se a mudança foi intencional, o novo baseline precisa de justificativa no commit.',
  )
}
