import type { EffectKind } from './types.ts'

/** Receita de efeito. Vira um Effect concreto quando aplicada (ctx.apply). */
export interface EffectSpec {
  kind: EffectKind
  value: number
  ms: number
}

/**
 * Biblioteca compartilhada de efeitos. Personagens compõem a partir daqui em vez
 * de reimplementar comportamento — é o que mantém "liberdade total" sustentável.
 */
export const fx = {
  /** reduz a velocidade-alvo em `pct` (0..1) */
  slow: (pct: number, ms: number): EffectSpec => ({ kind: 'slow', value: pct, ms }),
  /** dano por segundo durante `ms` */
  dot: (dps: number, ms: number): EffectSpec => ({ kind: 'dot', value: dps, ms }),
  /** aumenta o dano causado em `pct` */
  amp: (pct: number, ms: number): EffectSpec => ({ kind: 'amp', value: pct, ms }),
  /** aumenta o dano recebido em `pct` */
  vuln: (pct: number, ms: number): EffectSpec => ({ kind: 'vuln', value: pct, ms }),
}

/** Soma os valores de todos os efeitos ativos de um tipo. */
export function sumEffects(effects: { kind: EffectKind; value: number }[], kind: EffectKind): number {
  let total = 0
  for (const e of effects) if (e.kind === kind) total += e.value
  return total
}
