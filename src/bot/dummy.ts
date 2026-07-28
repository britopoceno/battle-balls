import type { Ball, Command, Team, World } from '../sim/types.ts'

/**
 * Bot PLACEHOLDER da Fase 0 — existe só para haver alguém do outro lado.
 * Não é o bot de balanceamento da Fase 2: não estima valor esperado, não erra de
 * propósito, não lidera alvo. Regra única: se o alvo está no alcance, solta.
 * Determinístico: não consome RNG e depende só do estado do mundo.
 */
export function dummyCommands(world: World, team: Team): Command[] {
  const cmds: Command[] = []
  // reage a cada 10 ticks (~166ms) para não parecer sobre-humano
  if (world.tick % 10 !== 0) return cmds

  for (const self of world.balls) {
    if (!self.alive || self.team !== team) continue
    const def = world.chars[self.charId]
    const alvo = maisProximo(world, self)
    if (!alvo) continue

    const dx = alvo.x - self.x
    const dy = alvo.y - self.y
    const d = Math.hypot(dx, dy) || 1

    if (self.ultCharge >= self.ultThreshold) {
      cmds.push({
        tick: world.tick,
        ballId: self.id,
        slot: 'ult',
        dx: dx / d,
        dy: dy / d,
        mag: faixa(d, def.ult.minRange, def.ult.maxRange),
      })
      continue
    }

    const ab = def.abilities[self.abilityIndex]
    if (world.time >= self.abilityReadyAt && d <= ab.maxRange) {
      cmds.push({
        tick: world.tick,
        ballId: self.id,
        slot: 'ability',
        dx: dx / d,
        dy: dy / d,
        mag: faixa(d, ab.minRange, ab.maxRange),
      })
    }
  }
  return cmds
}

function faixa(d: number, min: number, max: number): number {
  if (max <= min) return 1
  return Math.max(0, Math.min(1, (d - min) / (max - min)))
}

function maisProximo(world: World, self: Ball): Ball | null {
  let melhor: Ball | null = null
  let melhorD = Infinity
  for (const b of world.balls) {
    if (!b.alive || b.team === self.team) continue
    const d = Math.hypot(b.x - self.x, b.y - self.y)
    if (d < melhorD) {
      melhorD = d
      melhor = b
    }
  }
  return melhor
}
