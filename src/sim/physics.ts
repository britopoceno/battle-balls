import type { Ball, World } from './types.ts'

// debt.5: as antigas constantes de restituição de módulo deixaram de existir — agora são
// stat.restBall/stat.restWall por corpo (resolve C2, item Borracha). Colisão NÃO causa
// dano — só desloca.

export function integrate(world: World): void {
  const dt = world.dt
  for (const b of world.balls) {
    if (!b.alive) continue
    b.vx += b.ax * dt
    b.vy += b.ay * dt
    b.ax = 0
    b.ay = 0
    // arrasto exponencial: `drag` é a fração de velocidade retida por segundo.
    // É isso que faz o knockback decair de forma legível em ~1-2s.
    // debt.2 Task 4: drag migrado para stat.*
    const k = Math.pow(b.stat.drag, dt)
    b.vx *= k
    b.vy *= k
    b.x += b.vx * dt
    b.y += b.vy * dt
    const sp = Math.hypot(b.vx, b.vy)
    if (sp > 1) b.facing = Math.atan2(b.vy, b.vx)
  }
}

export function collideBalls(
  world: World,
  onCollide: (a: Ball, b: Ball) => void,
): void {
  const balls = world.balls
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i]
    if (!a.alive) continue
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j]
      if (!b.alive) continue
      // debt.2 Task 5: radius e mass migrados para stat.*
      const dx = b.x - a.x
      const dy = b.y - a.y
      const r = a.stat.radius + b.stat.radius
      const d2 = dx * dx + dy * dy
      if (d2 >= r * r || d2 === 0) continue

      const d = Math.sqrt(d2)
      const nx = dx / d
      const ny = dy / d
      const overlap = r - d
      const invA = 1 / a.stat.mass
      const invB = 1 / b.stat.mass
      const invSum = invA + invB

      a.x -= nx * overlap * (invA / invSum)
      a.y -= ny * overlap * (invA / invSum)
      b.x += nx * overlap * (invB / invSum)
      b.y += ny * overlap * (invB / invSum)

      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
      if (vn < 0) {
        // debt.5: regra de combinação é MÁXIMO, não média/produto — item não pode
        // depender da build do inimigo (architecture.md §2.2). max(0.65,0.65)===0.65,
        // hash não muda enquanto ninguém declarar restBall próprio.
        const e = Math.max(a.stat.restBall, b.stat.restBall)
        const imp = (-(1 + e) * vn) / invSum
        a.vx -= imp * nx * invA
        a.vy -= imp * ny * invA
        b.vx += imp * nx * invB
        b.vy += imp * ny * invB
      }
      onCollide(a, b)
      onCollide(b, a)
    }
  }
}

export function collideWalls(world: World): void {
  const { pad, w, h } = world.arena
  for (const b of world.balls) {
    if (!b.alive) continue
    // debt.5: parede não é corpo, não tem stat — sem mixing, sempre b.stat.restWall
    const r = b.stat.radius
    if (b.x - r < pad) {
      b.x = pad + r
      if (b.vx < 0) b.vx = -b.vx * b.stat.restWall
    } else if (b.x + r > w - pad) {
      b.x = w - pad - r
      if (b.vx > 0) b.vx = -b.vx * b.stat.restWall
    }
    if (b.y - r < pad) {
      b.y = pad + r
      if (b.vy < 0) b.vy = -b.vy * b.stat.restWall
    } else if (b.y + r > h - pad) {
      b.y = h - pad - r
      if (b.vy > 0) b.vy = -b.vy * b.stat.restWall
    }
  }
}

/** Colisão contra os segmentos-parede criados por habilidades. */
export function collideZoneWalls(world: World): void {
  for (const z of world.zones) {
    if (z.kind !== 'wall') continue
    const ca = Math.cos(z.angle)
    const sa = Math.sin(z.angle)
    for (const b of world.balls) {
      if (!b.alive) continue
      // projeta o centro da bola no segmento
      const rx = b.x - z.x
      const ry = b.y - z.y
      let t = rx * ca + ry * sa
      t = Math.max(-z.halfLen, Math.min(z.halfLen, t))
      const px = z.x + ca * t
      const py = z.y + sa * t
      const dx = b.x - px
      const dy = b.y - py
      const r = b.stat.radius + z.radius
      const d2 = dx * dx + dy * dy
      if (d2 >= r * r) continue
      const d = Math.sqrt(d2) || 0.0001
      const nx = dx / d
      const ny = dy / d
      b.x = px + nx * r
      b.y = py + ny * r
      const vn = b.vx * nx + b.vy * ny
      if (vn < 0) {
        // debt.5: zone-wall (Muralha) não tem stat próprio ainda (v1) — sem mixing
        b.vx -= (1 + b.stat.restWall) * vn * nx
        b.vy -= (1 + b.stat.restWall) * vn * ny
      }
    }
  }
}
