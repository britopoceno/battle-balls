import type { Ball, World } from './types.ts'

/** Restituição bola-bola e bola-parede. Colisão NÃO causa dano — só desloca. */
const REST_BALL = 0.65
const REST_WALL = 0.72

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
        const imp = (-(1 + REST_BALL) * vn) / invSum
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
    const r = b.radius
    if (b.x - r < pad) {
      b.x = pad + r
      if (b.vx < 0) b.vx = -b.vx * REST_WALL
    } else if (b.x + r > w - pad) {
      b.x = w - pad - r
      if (b.vx > 0) b.vx = -b.vx * REST_WALL
    }
    if (b.y - r < pad) {
      b.y = pad + r
      if (b.vy < 0) b.vy = -b.vy * REST_WALL
    } else if (b.y + r > h - pad) {
      b.y = h - pad - r
      if (b.vy > 0) b.vy = -b.vy * REST_WALL
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
      const r = b.radius + z.radius
      const d2 = dx * dx + dy * dy
      if (d2 >= r * r) continue
      const d = Math.sqrt(d2) || 0.0001
      const nx = dx / d
      const ny = dy / d
      b.x = px + nx * r
      b.y = py + ny * r
      const vn = b.vx * nx + b.vy * ny
      if (vn < 0) {
        b.vx -= (1 + REST_WALL) * vn * nx
        b.vy -= (1 + REST_WALL) * vn * ny
      }
    }
  }
}
