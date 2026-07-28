import type { Ball } from './types.ts'

/**
 * Camada de stats em 3 níveis: base (do personagem) → bônus (passiva + item, aditivos,
 * congelados/zerados conforme a camada) → stat efetivo (derivado, recomputado).
 * Resolve C2/C3 (`docs/prd.md` §4) e executa D-04 (`docs/prd.md` §5). Ver `architecture.md` §1.
 *
 * Nota de discrepância documental (registrada, não resolvida aqui — @po confirmou 14 como
 * o número correto; `architecture.md` cita "15" em 4 pontos de prosa não enumerada, mas as
 * duas listas enumeráveis do documento, §1.3 e §1.4, têm 14 chaves cada. Pendência de
 * reconciliação é do @architect, não bloqueia esta story — ver Change Log de `debt.1`).
 */
export const STAT_KEYS = [
  // estruturais — recomputados só em evento explícito (§1.5)
  'maxHp', 'radius',
  // contínuos — recomputados uma vez por bola por tick
  'mass', 'maxSpeed', 'steer', 'drag', 'restBall', 'restWall',
  'dmg', 'dmgTaken', 'atkSpeed', 'cdSpeed', 'range', 'knockbackTaken',
] as const

export type StatKey = (typeof STAT_KEYS)[number]
export type StatBlock = Record<StatKey, number>
export type BonusBlock = Record<StatKey, number>

/** Valores default para os 8 campos que não têm fonte no `CharDef` hoje — todos base neutra. */
export const DEFAULT_STATS: Pick<
  StatBlock,
  'restBall' | 'restWall' | 'dmg' | 'dmgTaken' | 'atkSpeed' | 'cdSpeed' | 'range' | 'knockbackTaken'
> = {
  restBall: 0.65,
  restWall: 0.72,
  dmg: 1.0,
  dmgTaken: 1.0,
  atkSpeed: 1.0,
  cdSpeed: 1.0,
  range: 1.0,
  knockbackTaken: 1.0,
}

/** Teto do somatório de bônus (passiva + item), por campo. `architecture.md` §1.4. */
const SIGMA_MIN: StatBlock = {
  maxHp: -0.5, radius: -0.2, mass: -0.5, maxSpeed: -0.85, steer: -0.4, drag: -0.6,
  restBall: -0.6, restWall: -0.6, dmg: -0.75, dmgTaken: -0.6, atkSpeed: -0.6,
  cdSpeed: -0.5, range: -0.5, knockbackTaken: -0.75,
}
const SIGMA_MAX: StatBlock = {
  maxHp: 1.0, radius: 0.3, mass: 1.5, maxSpeed: 0.6, steer: 0.6, drag: 1.2,
  restBall: 0.45, restWall: 0.45, dmg: 1.0, dmgTaken: 1.0, atkSpeed: 1.0,
  cdSpeed: 1.0, range: 0.6, knockbackTaken: 1.0,
}

/**
 * Clamp absoluto aplicado direto sobre `stat[k]`. Só para os campos cujo teto de motor NÃO é
 * derivado no ponto de consumo. `dmg` não tem clamp absoluto; `atkSpeed`/`cdSpeed`/`range` têm
 * teto expresso sobre o valor DERIVADO (cd efetivo, alcance efetivo), aplicado no ponto de uso —
 * migrado em `debt.2`/`debt.4`/`debt.5`, não aqui. Ausência de entrada = sem clamp nesta função.
 */
const ABS_MIN: Partial<StatBlock> = {
  maxHp: 20, radius: 8, mass: 0.2, maxSpeed: 20, steer: 0.2, drag: 0.05,
  restBall: 0.05, restWall: 0.05, dmgTaken: 0.3, knockbackTaken: 0.25,
}
const ABS_MAX: Partial<StatBlock> = {
  radius: 40, maxSpeed: 420, steer: 6.0, drag: 0.6,
  restBall: 0.92, restWall: 0.92, dmgTaken: 2.5, knockbackTaken: 2.0,
}

function clamp(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x
}

/** Cria um StatBlock/BonusBlock com as 14 chaves em forma fixa — mesma hidden class no V8. */
export function makeStatBlock(fill = 0): StatBlock {
  const s = {} as StatBlock
  for (const k of STAT_KEYS) s[k] = fill
  return s
}

/** Zera um BonusBlock existente reusando o objeto — nunca `{...spread}` no caminho quente. */
export function zeroBonus(b: BonusBlock): void {
  for (const k of STAT_KEYS) b[k] = 0
}

/**
 * Recalcula `b.stat` a partir de `b.base`/`b.bonusPassive`/`b.bonusItem`, MUTANDO `b.stat`
 * no lugar — nunca aloca um `StatBlock` novo.
 *
 * Assinatura resolvida por @dev (ver Change Log de `debt.1`, nota do @po): a story descrevia
 * duas formas incompatíveis — `recomputeStats(base, bonusPassive, bonusItem): StatBlock`
 * (função pura, devolve bloco novo) e `recomputeStats(b)` (recebe a bola). A forma pura aloca
 * um objeto por chamada, o que contraria a proibição explícita de alocar no caminho quente
 * (`architecture.md` §7.1: 4 objetos/tick × 40M ticks no arnês da Fase 2 = 160 milhões de
 * objetos para o GC). Escolhida a forma que recebe `Ball` e escreve em `b.stat` — zero
 * alocação por chamada, coerente com Task 4 da story e com o próprio §7.1 que ela cita.
 */
export function recomputeStats(b: Ball): void {
  // `Ball.stat` é `Readonly<StatBlock>` para o resto do código — só recomputeStats escreve
  // nele, e só aqui. O cast é o ponto único e deliberado de exceção a essa proteção.
  const stat = b.stat as StatBlock
  for (const k of STAT_KEYS) {
    const sigma = clamp(b.bonusPassive[k] + b.bonusItem[k], SIGMA_MIN[k], SIGMA_MAX[k])
    let v = b.base[k] * (1 + sigma)
    const lo = ABS_MIN[k]
    const hi = ABS_MAX[k]
    if (lo !== undefined && v < lo) v = lo
    if (hi !== undefined && v > hi) v = hi
    stat[k] = v
  }
}
