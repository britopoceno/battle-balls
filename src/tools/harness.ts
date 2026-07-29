import { createWorld, step, type RoundSetup } from '../sim/world.ts'
import type { CharDef, Command, World, WorldView } from '../sim/types.ts'

/**
 * ARNÊS — a única definição do laço de partida.
 *
 * Extraído de `determinism.ts` na story `e2.0` (passo 0 de `docs/architecture-e2.md` §7).
 * O motivo é o de §6.1: uma segunda cópia do laço em `balance.ts` diverge com o tempo —
 * teto de ticks diferente, ordem de concatenação de comandos diferente — e o dia em que
 * divergir, o golden hash estará protegendo um jogo e a matriz de winrate medindo outro,
 * sem nenhum aviso. Uma definição, dois consumidores.
 *
 * Consequência prática: qualquer mudança aqui mexe no golden hash de `determinism.ts`.
 * Isso é a proteção, não um efeito colateral.
 *
 * Este arquivo é `tools/`, não `sim/`: ele orquestra o motor, não contém regra de jogo.
 */

/** Teto de duração de uma partida: 180s a 60Hz. Era literal `60 * 180` dentro do laço. */
export const MAX_ROUND_TICKS = 60 * 180

/** Retorno de uma partida. Mesmos campos e mesmos tipos que o `rodar` original devolvia. */
export interface RoundResult {
  winner: World['winner']
  ticks: number
  hash: string
}

/**
 * Comandos de UM tick, dos DOIS times, já na ordem em que o motor vai consumi-los.
 * Recebe `WorldView` (nunca `World`): chamar `.rng()` daqui é erro de compilação — a
 * invariante de `debt.7` / `architecture-e2.md` §3.3 vale para todo driver, não só para o bot.
 */
export type TickDriver = (view: WorldView) => Command[]

/**
 * Fábrica de driver: recebe o `RoundSetup` da partida e devolve o driver de tick.
 *
 * É fábrica, e não uma função de tick direta, porque o bot heurístico da Fase 2 tem estado
 * POR TIME (`createBot(matchSeed, team)` → `rand = mulberry32(deriveSeed(matchSeed, team+1))`,
 * `porBola`) e esse estado precisa nascer uma vez por partida, com a seed da partida, não a
 * cada tick. `dummyCommands` é sem estado e ignora o `setup`; `heuristic` (e2.3/e2.4) fecha
 * sobre os dois `BotState` aqui, sem que `runRound` mude uma linha:
 *
 * ```ts
 * const heuristico: RoundDriver = (setup) => {
 *   const b0 = createBot(setup.seed, 0)
 *   const b1 = createBot(setup.seed, 1)
 *   return (view) => [...botCommands(view, b0), ...botCommands(view, b1)]
 * }
 * ```
 */
export type RoundDriver = (setup: RoundSetup) => TickDriver

/**
 * Roda uma partida inteira e devolve vencedor, duração e hash do estado final.
 *
 * Byte-a-byte o mesmo laço que vivia em `determinism.ts`: mesma condição de parada, mesma
 * ordem (comandos do tick corrente calculados ANTES do `step`), mesmo hash no fim.
 */
export function runRound(
  chars: Record<string, CharDef>,
  setup: RoundSetup,
  driver: RoundDriver,
): RoundResult {
  const world = createWorld(chars, setup)
  const tick = driver(setup)
  while (!world.over && world.tick < MAX_ROUND_TICKS) {
    step(world, tick(world))
  }
  return { winner: world.winner, ticks: world.tick, hash: hash(world) }
}

/** FNV-1a sobre o estado quantizado. Quantizar evita ruído de ponto flutuante irrelevante. */
export function hash(w: WorldView): string {
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
