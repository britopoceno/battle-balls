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

/**
 * Teto do somatório de bônus (passiva + item), por campo. `architecture.md` §1.4.
 * Exportado (debt.6) — a auditoria A2 do roster precisa de `SIGMA_MAX.cdSpeed` para
 * calcular `cdSpeedMax = 1 + ΣMAX[cdSpeed]`, fechando a invariante deixada em `debt.4`.
 */
export const SIGMA_MIN: StatBlock = {
  maxHp: -0.5, radius: -0.2, mass: -0.5, maxSpeed: -0.85, steer: -0.4, drag: -0.6,
  restBall: -0.6, restWall: -0.6, dmg: -0.75, dmgTaken: -0.6, atkSpeed: -0.6,
  cdSpeed: -0.5, range: -0.5, knockbackTaken: -0.75,
}
export const SIGMA_MAX: StatBlock = {
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

/**
 * CONTADORES DE CLAMP — `docs/architecture.md` §7.3, story `e2.8`.
 *
 * Literal da fonte: "todos os tetos moram em `sim/stats.ts` como constantes nomeadas, e o arnês da
 * Fase 2 instrumenta **quantas vezes cada clamp mordeu**. Um contador por campo". A leitura que a
 * §7.3 pede é a trichotomia: clamp que nunca morde = rede de segurança barata; que morde às vezes =
 * funcionando como projetado; que morde SEMPRE = virou regra de jogo por acidente e volta ao usuário
 * como decisão de produto. É o que transforma os tetos de §1.4 em hipótese falseável (decisão #13).
 *
 * "Mordeu" é o valor BRUTO ter excedido o teto e sido cortado — não "o campo foi calculado". Por
 * isso a contagem é feita sobre a condição do corte (`raw < MIN` / `raw > MAX`), e não sobre a
 * chamada. `calls` existe ao lado porque a trichotomia acima exige um denominador: sem ele não há
 * como separar "morde às vezes" de "morde sempre". É o denominador comum a todos os campos, não uma
 * métrica nova.
 *
 * **Um contador por campo QUE TEM AQUELE TETO DECLARADO**, e os quatro mapas não são simétricos:
 * `SIGMA_MIN`/`SIGMA_MAX` cobrem as 14 chaves de `STAT_KEYS`; `ABS_MIN` tem 10 e `ABS_MAX` tem 8
 * (`dmg` não tem clamp absoluto; `atkSpeed`/`cdSpeed`/`range` têm teto no ponto de consumo). Campo
 * sem teto declarado não ganha contador — um zero ali leria como "nunca mordeu" quando a verdade é
 * "não existe teto para morder".
 *
 * `observing` é `false` por padrão: em jogo (browser, `sim:check`) nada é contado e o caminho é o
 * mesmo de antes desta story. Só o arnês liga, por contexto de medição. Isso é observação pura —
 * nenhum caminho de decisão de `sim/` lê estes números, e o golden hash é a prova (AC 1/AC 5).
 */
export interface ClampCounters {
  /** vezes que `bonusPassive+bonusItem` ficou ABAIXO de `SIGMA_MIN[k]` e foi cortado */
  sigmaMin: Partial<Record<StatKey, number>>
  /** vezes que `bonusPassive+bonusItem` ficou ACIMA de `SIGMA_MAX[k]` e foi cortado */
  sigmaMax: Partial<Record<StatKey, number>>
  /** vezes que `base×(1+Σ)` ficou abaixo de `ABS_MIN[k]` e foi cortado */
  absMin: Partial<Record<StatKey, number>>
  /** vezes que `base×(1+Σ)` ficou acima de `ABS_MAX[k]` e foi cortado */
  absMax: Partial<Record<StatKey, number>>
  /** chamadas de `recomputeStats` observadas desde o reset — o denominador da leitura de §7.3 */
  calls: number
  /** ligado só pelo arnês; em jogo é `false` e nada é contado */
  observing: boolean
}

export const CLAMP_COUNTERS: ClampCounters = {
  sigmaMin: {},
  sigmaMax: {},
  absMin: {},
  absMax: {},
  calls: 0,
  observing: false,
}

/**
 * Zera os contadores e (des)liga a observação — AC 6 da `e2.8`.
 *
 * O arnês roda vários confrontos no MESMO processo, e um contador cumulativo somaria confrontos
 * diferentes num único número, que não descreve nenhum deles. Por isso o reset é por contexto de
 * medição (confronto / linha do protocolo A/B), não por processo.
 *
 * Os mapas são reconstruídos a partir das próprias tabelas de teto, e não de uma lista escrita à
 * mão: um campo novo em `ABS_MAX` ganha contador sozinho, e um removido perde o dele. Uma lista
 * paralela seria a segunda fonte de verdade que este projeto já pagou caro três vezes.
 */
export function resetClampCounters(observing = true): void {
  const c = CLAMP_COUNTERS
  c.sigmaMin = {}
  c.sigmaMax = {}
  c.absMin = {}
  c.absMax = {}
  for (const k of STAT_KEYS) {
    c.sigmaMin[k] = 0
    c.sigmaMax[k] = 0
    if (ABS_MIN[k] !== undefined) c.absMin[k] = 0
    if (ABS_MAX[k] !== undefined) c.absMax[k] = 0
  }
  c.calls = 0
  c.observing = observing
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

/** Soma um bônus declarativo parcial (`PassiveDef.bonus`) num BonusBlock existente — nunca sobrescreve. */
export function addPartialBonus(target: BonusBlock, partial: Partial<BonusBlock>): void {
  for (const k of STAT_KEYS) {
    const v = partial[k]
    if (v !== undefined) target[k] += v
  }
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
  // e2.8 / §7.3: leitura ÚNICA do interruptor por chamada. O corpo do laço é o mesmo de antes —
  // `raw` só dá nome à soma que já era o argumento de `clamp`, e as contagens moram dentro de
  // `if (obs)`. Nenhum valor escrito em `stat` depende de `obs` (AC 5).
  const cc = CLAMP_COUNTERS
  const obs = cc.observing
  for (const k of STAT_KEYS) {
    const raw = b.bonusPassive[k] + b.bonusItem[k]
    const sigma = clamp(raw, SIGMA_MIN[k], SIGMA_MAX[k])
    if (obs) {
      // a condição do CORTE, não a da chamada: é isso que separa "o clamp mordeu" de "o campo
      // foi calculado". `NaN` não satisfaz nenhuma das duas comparações e não é contado como
      // mordida — coerente com `clamp`, que devolve `NaN` sem cortar.
      if (raw < SIGMA_MIN[k]) cc.sigmaMin[k] = (cc.sigmaMin[k] ?? 0) + 1
      else if (raw > SIGMA_MAX[k]) cc.sigmaMax[k] = (cc.sigmaMax[k] ?? 0) + 1
    }
    let v = b.base[k] * (1 + sigma)
    const lo = ABS_MIN[k]
    const hi = ABS_MAX[k]
    if (lo !== undefined && v < lo) {
      v = lo
      if (obs) cc.absMin[k] = (cc.absMin[k] ?? 0) + 1
    }
    if (hi !== undefined && v > hi) {
      v = hi
      if (obs) cc.absMax[k] = (cc.absMax[k] ?? 0) + 1
    }
    stat[k] = v
  }
  if (obs) cc.calls++
}
