import { mulberry32 } from './rng.ts'
import { sumEffects, type EffectSpec } from './effects.ts'
import { integrate, collideBalls, collideWalls, collideZoneWalls } from './physics.ts'
import type {
  Aim,
  Ball,
  CharDef,
  ChargeRule,
  Command,
  Projectile,
  SimCtx,
  Team,
  World,
  Zone,
} from './types.ts'

export const TICK_HZ = 60
export const TICK_MS = 1000 / TICK_HZ
/** a partir daqui a arena começa a encolher, forçando o confronto */
export const SUDDEN_DEATH_MS = 60_000
const SHRINK_PX_PER_S = 16
/** trava dura: se ninguém morreu até aqui, é empate */
const MAX_ROUND_MS = 150_000
const MAX_SLOW = 0.85

export interface PickSetup {
  charId: string
  abilityIndex: 0 | 1
  passiveIndex: 0 | 1
}

export interface RoundSetup {
  seed: number
  arena?: { w: number; h: number }
  teams: [PickSetup[], PickSetup[]]
}

export function createWorld(chars: Record<string, CharDef>, setup: RoundSetup): World {
  const arena = { w: setup.arena?.w ?? 960, h: setup.arena?.h ?? 540, pad: 0 }
  const world: World = {
    tick: 0,
    time: 0,
    dt: 1 / TICK_HZ,
    arena,
    balls: [],
    projectiles: [],
    zones: [],
    events: [],
    rng: mulberry32(setup.seed),
    nextId: 1,
    over: false,
    winner: -1,
    chars,
  }

  for (const team of [0, 1] as Team[]) {
    const picks = setup.teams[team]
    const x = team === 0 ? arena.w * 0.2 : arena.w * 0.8
    picks.forEach((pick, i) => {
      // reflexão PONTUAL (não espelhada): sob rotação de 180° o time 1 cai exatamente
      // sobre o time 0. Espelhar inverteria a mão da órbita do Vex e daria vantagem
      // sistemática a um dos lados.
      const lane = (i - (picks.length - 1) / 2) * 130
      const spread = team === 0 ? lane : -lane
      const b = makeBall(world, pick, team, x, arena.h / 2 + spread)
      // ruído de largada: é o que faz a seed significar alguma coisa e o que impede
      // que a mesma composição resolva sempre a mesma partida.
      b.x += (world.rng() - 0.5) * 70
      b.y += (world.rng() - 0.5) * 90
      b.vx = (world.rng() - 0.5) * 90
      b.vy = (world.rng() - 0.5) * 90
      world.balls.push(b)
    })
  }
  return world
}

function makeBall(world: World, pick: PickSetup, team: Team, x: number, y: number): Ball {
  const def = world.chars[pick.charId]
  if (!def) throw new Error(`personagem desconhecido: ${pick.charId}`)
  const b: Ball = {
    id: world.nextId++,
    charId: def.id,
    team,
    x,
    y,
    vx: 0,
    vy: 0,
    ax: 0,
    ay: 0,
    radius: def.radius,
    mass: def.mass,
    maxSpeed: def.maxSpeed,
    steer: def.steer,
    drag: def.drag,
    hp: def.maxHp,
    maxHp: def.maxHp,
    alive: true,
    facing: team === 0 ? 0 : Math.PI,
    atkReadyAt: 0,
    abilityReadyAt: 0,
    ultCharge: 0,
    ultThreshold: def.ult.threshold,
    effects: [],
    abilityIndex: pick.abilityIndex,
    passiveIndex: pick.passiveIndex,
    mods: { dmg: 1, atkSpeed: 1, range: 1, speed: 1, knockbackResist: 0 },
    memory: {},
  }
  def.passives[pick.passiveIndex].init?.(b)
  return b
}

const charOf = (w: World, b: Ball): CharDef => w.chars[b.charId]

// ---------------------------------------------------------------- contexto

function effectiveSpeed(b: Ball): number {
  const slow = Math.min(MAX_SLOW, sumEffects(b.effects, 'slow'))
  return b.maxSpeed * b.mods.speed * (1 - slow)
}

/** empurra a bola na direção de uma velocidade desejada (steering) */
function steerTo(b: Ball, dvx: number, dvy: number): void {
  b.ax += (dvx - b.vx) * b.steer
  b.ay += (dvy - b.vy) * b.steer
}

export function makeCtx(world: World): SimCtx {
  const now = world.time

  const ctx: SimCtx = {
    world,
    now,
    dt: world.dt,

    enemies: (self) => world.balls.filter((b) => b.alive && b.team !== self.team),
    allies: (self) => world.balls.filter((b) => b.alive && b.team === self.team && b.id !== self.id),

    nearestEnemy: (self) => {
      let best: Ball | null = null
      let bestD = Infinity
      for (const b of world.balls) {
        if (!b.alive || b.team === self.team) continue
        const d = Math.hypot(b.x - self.x, b.y - self.y)
        if (d < bestD) {
          bestD = d
          best = b
        }
      }
      return best
    },

    weakestEnemy: (self) => {
      let best: Ball | null = null
      for (const b of world.balls) {
        if (!b.alive || b.team === self.team) continue
        if (!best || b.hp / b.maxHp < best.hp / best.maxHp) best = b
      }
      return best
    },

    dist: (a, b) => Math.hypot(b.x - a.x, b.y - a.y),

    seek: (self, tx, ty, mult = 1) => {
      const dx = tx - self.x
      const dy = ty - self.y
      const d = Math.hypot(dx, dy) || 1
      const s = effectiveSpeed(self) * mult
      steerTo(self, (dx / d) * s, (dy / d) * s)
    },

    flee: (self, tx, ty, mult = 1) => {
      const dx = self.x - tx
      const dy = self.y - ty
      const d = Math.hypot(dx, dy) || 1
      const s = effectiveSpeed(self) * mult
      steerTo(self, (dx / d) * s, (dy / d) * s)
    },

    hold: (self, tx, ty, mult = 1) => {
      const dx = tx - self.x
      const dy = ty - self.y
      const d = Math.hypot(dx, dy)
      const s = effectiveSpeed(self) * mult
      // chegada suave: desacelera nos últimos 60px
      const scale = Math.min(1, d / 60)
      if (d < 1) return steerTo(self, 0, 0)
      steerTo(self, (dx / d) * s * scale, (dy / d) * s * scale)
    },

    orbit: (self, target, radius, mult = 1) => {
      const dx = self.x - target.x
      const dy = self.y - target.y
      const d = Math.hypot(dx, dy) || 1
      const rx = dx / d
      const ry = dy / d
      // componente radial corrige a distância, tangencial mantém a órbita
      const err = Math.max(-1, Math.min(1, (d - radius) / radius))
      const tx = -ry
      const ty = rx
      let vx = tx - rx * err * 1.6
      let vy = ty - ry * err * 1.6
      const n = Math.hypot(vx, vy) || 1
      const s = effectiveSpeed(self) * mult
      steerTo(self, (vx / n) * s, (vy / n) * s)
    },

    damage: (target, amount, source) => dealDamage(world, ctx, target, amount, source),

    heal: (target, amount) => {
      if (!target.alive) return
      target.hp = Math.min(target.maxHp, target.hp + amount)
    },

    knockback: (target, dx, dy, force) => {
      const d = Math.hypot(dx, dy) || 1
      const eff = (force * (1 - target.mods.knockbackResist)) / target.mass
      target.vx += (dx / d) * eff
      target.vy += (dy / d) * eff
    },

    apply: (target, spec: EffectSpec, source) => {
      if (!target.alive) return
      target.effects.push({
        kind: spec.kind,
        value: spec.value,
        endsAt: world.time + spec.ms,
        sourceId: source?.id ?? 0,
      })
    },

    spawnProjectile: (spec) => {
      world.projectiles.push({ ...spec, id: world.nextId++, hitIds: [] } as Projectile)
    },

    spawnZone: (spec) => {
      world.zones.push({ ...spec, id: world.nextId++ } as Zone)
    },

    rand: world.rng,
  }
  return ctx
}

// ---------------------------------------------------------------- dano

function addCharge(world: World, b: Ball, rule: ChargeRule, amount: number): void {
  if (!b.alive) return
  if (charOf(world, b).ult.charge !== rule) return
  b.ultCharge = Math.min(b.ultThreshold, b.ultCharge + amount)
}

function dealDamage(
  world: World,
  ctx: SimCtx,
  target: Ball,
  amount: number,
  source: Ball | null,
): void {
  if (!target.alive || amount <= 0) return

  let amt = amount
  if (source) {
    amt *= source.mods.dmg
    amt *= 1 + sumEffects(source.effects, 'amp')
    amt *= charOf(world, source).passives[source.passiveIndex].onDamageDealt?.(ctx, source, target) ?? 1
  }
  amt *= 1 + sumEffects(target.effects, 'vuln')
  amt *= charOf(world, target).passives[target.passiveIndex].onDamageTaken?.(ctx, target, source) ?? 1

  target.hp -= amt
  world.events.push({
    t: 'hit',
    x: target.x,
    y: target.y - target.radius,
    amount: amt,
    targetId: target.id,
    crit: amt >= 20,
  })

  if (source) addCharge(world, source, 'damageDealt', amt)
  addCharge(world, target, 'damageTaken', amt)

  if (target.hp <= 0) {
    target.hp = 0
    target.alive = false
    world.events.push({ t: 'death', ballId: target.id })
    charOf(world, target).on?.death?.(ctx, target)
    if (source) {
      addCharge(world, source, 'kills', 1)
      charOf(world, source).on?.kill?.(ctx, source, target)
    }
  }
}

// ---------------------------------------------------------------- casts

function aimFrom(self: Ball, cmd: Command, minRange: number, maxRange: number): Aim {
  const d = Math.hypot(cmd.dx, cmd.dy) || 1
  const dx = cmd.dx / d
  const dy = cmd.dy / d
  const mag = Math.max(0, Math.min(1, cmd.mag))
  const reach = minRange + (maxRange - minRange) * mag
  return { dx, dy, x: self.x + dx * reach, y: self.y + dy * reach }
}

function castCommand(world: World, ctx: SimCtx, cmd: Command): void {
  const self = world.balls.find((b) => b.id === cmd.ballId)
  if (!self || !self.alive) return
  const def = charOf(world, self)

  if (cmd.slot === 'ability') {
    const ab = def.abilities[self.abilityIndex]
    if (world.time < self.abilityReadyAt) return
    self.abilityReadyAt = world.time + ab.cd
    ab.cast(ctx, self, aimFrom(self, cmd, ab.minRange, ab.maxRange))
    world.events.push({ t: 'cast', ballId: self.id, name: ab.name })
    addCharge(world, self, 'casts', 1)
  } else {
    const ult = def.ult
    if (self.ultCharge < self.ultThreshold) return
    self.ultCharge = 0
    ult.cast(ctx, self, aimFrom(self, cmd, ult.minRange, ult.maxRange))
    world.events.push({ t: 'ult', ballId: self.id, name: ult.name })
  }
}

// ---------------------------------------------------------------- subsistemas

function tickEffects(world: World, ctx: SimCtx, b: Ball): void {
  for (const e of b.effects) {
    if (e.kind !== 'dot') continue
    const src = world.balls.find((x) => x.id === e.sourceId) ?? null
    dealDamage(world, ctx, b, e.value * world.dt, src)
    if (!b.alive) return
  }
  if (b.effects.length) b.effects = b.effects.filter((e) => e.endsAt > world.time)
}

function autoAttack(world: World, ctx: SimCtx, b: Ball): void {
  if (!b.alive || world.time < b.atkReadyAt) return
  const def = charOf(world, b)
  const range = def.atk.range * b.mods.range

  let target: Ball | null = null
  let bestD = Infinity
  for (const e of world.balls) {
    if (!e.alive || e.team === b.team) continue
    // alcance é medido de SUPERFÍCIE a superfície, senão corpos grandes nunca se
    // alcançam: a colisão os mantém separados pela soma dos raios.
    const gap = Math.hypot(e.x - b.x, e.y - b.y) - e.radius - b.radius
    if (gap <= range && gap < bestD) {
      bestD = gap
      target = e
    }
  }
  if (!target) return

  b.atkReadyAt = world.time + def.atk.cd / b.mods.atkSpeed
  const dx = target.x - b.x
  const dy = target.y - b.y
  const d = Math.hypot(dx, dy) || 1

  if (def.atk.kind === 'melee') {
    dealDamage(world, ctx, target, def.atk.dmg, b)
    if (def.atk.knockback) ctx.knockback(target, dx, dy, def.atk.knockback)
    def.atk.onHit?.(ctx, b, target)
  } else {
    const sp = def.atk.speed ?? 400
    // antecipação de alvo. Sem isto, um alvo cruzando a 250px/s é matematicamente
    // inatingível a 165px de distância — dois orbitadores nunca se acertariam.
    // Duas iterações bastam para convergir o ponto de intercepção.
    let t = d / sp
    for (let i = 0; i < 2; i++) {
      const px = target.x + target.vx * t - b.x
      const py = target.y + target.vy * t - b.y
      t = Math.hypot(px, py) / sp
    }
    const ix = target.x + target.vx * t - b.x
    const iy = target.y + target.vy * t - b.y
    const id = Math.hypot(ix, iy) || 1
    ctx.spawnProjectile({
      ownerId: b.id,
      team: b.team,
      x: b.x + (ix / id) * b.radius,
      y: b.y + (iy / id) * b.radius,
      vx: (ix / id) * sp,
      vy: (iy / id) * sp,
      radius: 5,
      dmg: def.atk.dmg,
      pierce: false,
      expiresAt: world.time + (range / sp) * 1000 + 250,
      color: def.color,
      onHit: def.atk.onHit,
    })
  }
}

function tickProjectiles(world: World, ctx: SimCtx): void {
  const dt = world.dt
  const keep: Projectile[] = []
  for (const p of world.projectiles) {
    p.x += p.vx * dt
    p.y += p.vy * dt

    if (world.time >= p.expiresAt) continue
    const { pad, w, h } = world.arena
    if (p.x < pad || p.x > w - pad || p.y < pad || p.y > h - pad) continue

    let consumed = false
    for (const b of world.balls) {
      if (!b.alive || b.team === p.team || p.hitIds.includes(b.id)) continue
      if (Math.hypot(b.x - p.x, b.y - p.y) > b.radius + p.radius) continue
      p.hitIds.push(b.id)
      const owner = world.balls.find((x) => x.id === p.ownerId) ?? null
      dealDamage(world, ctx, b, p.dmg, owner)
      if (owner) p.onHit?.(ctx, owner, b)
      if (!p.pierce) {
        consumed = true
        break
      }
    }
    if (!consumed) keep.push(p)
  }
  world.projectiles = keep
}

function tickZones(world: World, ctx: SimCtx): void {
  const keep: Zone[] = []
  for (const z of world.zones) {
    if (world.time >= z.expiresAt) {
      if (z.kind === 'vortex' && z.burstDmg > 0) {
        const owner = world.balls.find((b) => b.id === z.ownerId) ?? null
        for (const b of world.balls) {
          if (!b.alive || b.team === z.team) continue
          if (Math.hypot(b.x - z.x, b.y - z.y) <= z.radius) {
            dealDamage(world, ctx, b, z.burstDmg, owner)
          }
        }
      }
      continue
    }
    if (z.kind === 'vortex') {
      for (const b of world.balls) {
        if (!b.alive || b.team === z.team) continue
        const dx = z.x - b.x
        const dy = z.y - b.y
        const d = Math.hypot(dx, dy)
        if (d > z.radius || d < 1) continue
        const falloff = 1 - d / z.radius
        ctx.knockback(b, dx, dy, z.pull * falloff * world.dt)
      }
    }
    keep.push(z)
  }
  world.zones = keep
}

function checkEnd(world: World): void {
  const alive0 = world.balls.some((b) => b.alive && b.team === 0)
  const alive1 = world.balls.some((b) => b.alive && b.team === 1)
  if (alive0 && alive1 && world.time < MAX_ROUND_MS) return
  world.over = true
  world.winner = alive0 === alive1 ? -1 : alive0 ? 0 : 1
  world.events.push({ t: 'roundEnd', winner: world.winner })
}

// ---------------------------------------------------------------- step

/**
 * Avança um tick. Determinística: mesma seed + mesmos comandos = mesma partida.
 * `commands` são os comandos AGENDADOS para o tick corrente.
 */
export function step(world: World, commands: Command[] = []): void {
  if (world.over) return
  world.events = []
  const ctx = makeCtx(world)

  for (const c of commands) {
    if (c.tick === world.tick) castCommand(world, ctx, c)
  }

  for (const b of world.balls) {
    if (!b.alive) continue
    tickEffects(world, ctx, b)
    if (!b.alive) continue
    const def = charOf(world, b)
    def.passives[b.passiveIndex].onTick?.(ctx, b)
    def.on?.tick?.(ctx, b)
    def.move(ctx, b)
    if (def.ult.charge === 'time') addCharge(world, b, 'time', world.dt * 1000)
  }

  for (const b of world.balls) autoAttack(world, ctx, b)

  tickZones(world, ctx)
  tickProjectiles(world, ctx)

  integrate(world)
  collideZoneWalls(world)
  collideBalls(world, (a, other) => charOf(world, a).on?.collide?.(ctx, a, other))
  collideWalls(world)

  if (world.time >= SUDDEN_DEATH_MS) {
    if (world.arena.pad === 0) world.events.push({ t: 'suddenDeath' })
    const maxPad = Math.min(world.arena.w, world.arena.h) * 0.32
    world.arena.pad = Math.min(maxPad, world.arena.pad + SHRINK_PX_PER_S * world.dt)
  }

  checkEnd(world)
  world.tick++
  world.time = world.tick * TICK_MS
}
