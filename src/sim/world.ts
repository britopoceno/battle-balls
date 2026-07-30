import { mulberry32 } from './rng.ts'
import { sumEffects, type EffectSpec } from './effects.ts'
import { integrate, collideBalls, collideWalls, collideZoneWalls } from './physics.ts'
import {
  DEFAULT_STATS,
  addPartialBonus,
  makeStatBlock,
  recomputeStats,
  zeroBonus,
  type BonusBlock,
} from './stats.ts'
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
/**
 * debt.4 — piso absoluto de motor para o cooldown efetivo de habilidade. Não é redundante
 * com o teto de balanceamento de cdSpeed (ΣMAX +1.00 ⇒ cdSpeed ≤ 2.0): a maior janela de
 * dano por contato do roster é 450ms (dash do Golem, golem.ts). Se o cooldown pudesse
 * descer abaixo da janela que ele abre, o jogador recastaria antes dela fechar e o dano
 * por contato viraria permanente, quebrando o Pilar 3 (D-07) por dentro.
 *
 * Corrigido para 500ms (QA-001, gate de debt.4): o valor original de 400ms herdado de
 * architecture.md §3.3 ficava ABAIXO dos 450ms que alegava proteger — o piso sozinho não
 * entregava a garantia; quem protegia era o teto de cdSpeed. 500ms dá folga real acima da
 * maior janela conhecida, não apenas encosta nela. Código ainda inalcançável hoje (o teto
 * de cdSpeed mantém todo cooldown do roster bem acima disso) — mudança não altera hash.
 */
export const MIN_ABILITY_CD_MS = 500

export interface PickSetup {
  charId: string
  abilityIndex: 0 | 1
  passiveIndex: 0 | 1
  /** bônus JÁ AGREGADOS, aditivos, congelados na rodada — a mesma porta que a loja usará */
  itemBonus?: Partial<BonusBlock>
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
    phase: 'tick',
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
    // e3.0 (REL-001): placeholder deliberado. O `hp` de verdade é atribuído no fim desta
    // função, DEPOIS de `recomputeStats`, a partir de `stat.maxHp` — não de `def.maxHp`,
    // que é a base SEM bônus. Mesma convenção de `stat` logo abaixo: populado neste mesmo
    // escopo, nunca lido antes disso (nada entre aqui e a atribuição lê `b.hp`).
    hp: 0,
    alive: true,
    facing: team === 0 ? 0 : Math.PI,
    atkReadyAt: 0,
    abilityReadyAt: 0,
    ultCharge: 0,
    ultThreshold: def.ult.threshold,
    effects: [],
    abilityIndex: pick.abilityIndex,
    passiveIndex: pick.passiveIndex,
    memory: {},
    contact: null,

    // camada de stats (debt.1, completada em debt.3 — única fonte de verdade agora).
    // debt.5: restBall/restWall ganham fonte própria opcional no CharDef; ausência usa
    // DEFAULT_STATS (0.65/0.72), igual a nenhum personagem do roster hoje.
    // ordem das chaves importa: precisa bater com STAT_KEYS (maxHp..knockbackTaken) para
    // preservar a forma fixa de objeto de stats.ts (QA-001, gate de debt.5) — os 6 campos
    // do CharDef primeiro, spread do DEFAULT_STATS (que já nasce na ordem certa: restBall,
    // restWall, dmg...), e só então os overrides de restBall/restWall, que apenas
    // atualizam o valor de uma chave já inserida pelo spread, sem reordenar.
    base: {
      maxHp: def.maxHp,
      radius: def.radius,
      mass: def.mass,
      maxSpeed: def.maxSpeed,
      steer: def.steer,
      drag: def.drag,
      ...DEFAULT_STATS,
      restBall: def.restBall ?? DEFAULT_STATS.restBall,
      restWall: def.restWall ?? DEFAULT_STATS.restWall,
    },
    bonusPassive: makeStatBlock(0),
    bonusItem: makeStatBlock(0),
    stat: makeStatBlock(0), // populado abaixo, nunca lido não-inicializado
  }

  // e2.1 — metade `sim/` do passo 8 da migração da dívida (`architecture.md` §1.3,
  // `architecture-e2.md` §5.1): bônus de item entram AQUI, uma vez, na criação da bola, e
  // não são zerados por `step()` (que só zera `bonusPassive`) — é o que "congelado na
  // rodada" significa. Mesma mecânica aditiva de `bonusPassive` (`addPartialBonus`), e o
  // valor cai no MESMO `recomputeStats` abaixo: passa por `SIGMA_MIN`/`SIGMA_MAX` e pelos
  // clamps absolutos como qualquer outro bônus. Não há — e não pode haver — caminho de
  // exceção para este campo: um mutante do arnês da Fase 2 que escapasse dos tetos estaria
  // medindo uma configuração que o jogo real nunca produz. Sem consumidor de produção ainda
  // (a loja da Fase 3 e o CLI de `e2.6` são os consumidores previstos).
  if (pick.itemBonus) addPartialBonus(b.bonusItem, pick.itemBonus)

  recomputeStats(b)

  // e3.0 (REL-001) — `hp` nasce CHEIO, do teto que já inclui os bônus: `stat.maxHp`, e não
  // `def.maxHp`. Até esta story a linha era `hp: def.maxHp` no literal acima, isto é, LIDA
  // ANTES de `recomputeStats` ter rodado: com um item de `+maxHp` a bola nascia ferida, e a
  // fração `hp / stat.maxHp` largava abaixo de 1. Essa fração é gatilho de CINCO
  // comportamentos de combate (`world.ts` weakestEnemy — peso de alvo do bot; `vex.ts`
  // mergulho e Predador e Fantasma; `golem.ts` Casca), e o efeito medido não era "o item
  // rende um pouco menos": era o item MUDANDO DE SINAL — Couraça de +50% `maxHp` num Vex
  // media −18,86pp de winrate com o bug e +31,97pp corrigida (`docs/architecture-e3.md`
  // §1.3). A ORDEM é o contrato desta correção: atribuir antes de `recomputeStats`
  // reintroduziria o mesmo bug com outra cara. Nenhum dos cinco leitores é tocado — com `hp`
  // nascendo cheio eles voltam a ver `hp / stat.maxHp === 1` na largada, que é o que sempre
  // viram enquanto ninguém tinha item; é por isso que o golden hash não se move (§7.4).
  //
  // REGRA DE DELTA PARA `maxHp` ESTRUTURAL (`architecture.md` §1.6, `architecture-e3.md`
  // §7.4) — escrita aqui, no lugar que a executa, em vez de ficar implícita: `maxHp` é stat
  // ESTRUTURAL, recomputado só em evento explícito e nunca por tick. Se algum dia
  // `stat.maxHp` mudar com a bola JÁ VIVA, o `hp` corrente NÃO é recalculado do zero — o
  // teto que cresce dá ao `hp` o DELTA ABSOLUTO (`hp += tetoNovo - tetoAnterior`) e o teto
  // que encolhe apenas CLAMPA (`hp = min(hp, tetoNovo)`). Recalcular do zero curaria a bola
  // de graça a cada mudança de teto. Hoje o único caso vivo é o NASCIMENTO, que é este:
  // `bonusItem` é congelado na rodada (logo acima) e a bola é recriada a cada rodada, então
  // ainda não existe consumidor do delta — a regra fica registrada para a story que criar um.
  b.hp = b.stat.maxHp
  return b
}

const charOf = (w: World, b: Ball): CharDef => w.chars[b.charId]

// ---------------------------------------------------------------- contexto

function effectiveSpeed(b: Ball): number {
  const slow = Math.min(MAX_SLOW, sumEffects(b.effects, 'slow'))
  // debt.3: mods.speed removido. O bônus da passiva Fantasma agora entra direto em
  // stat.maxSpeed via addBonus (ver vex.ts) — manter a multiplicação aqui aplicaria o
  // mesmo bônus duas vezes. 250 × 1.25 (mods antigo) === 312.5 === stat.maxSpeed novo,
  // já com o bônus incorporado; sem segunda multiplicação, o resultado bate.
  return b.stat.maxSpeed * (1 - slow)
}

/** empurra a bola na direção de uma velocidade desejada (steering) */
function steerTo(b: Ball, dvx: number, dvy: number): void {
  b.ax += (dvx - b.vx) * b.stat.steer
  b.ay += (dvy - b.vy) * b.stat.steer
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
        if (!best || b.hp / b.stat.maxHp < best.hp / best.stat.maxHp) best = b
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
      target.hp = Math.min(target.stat.maxHp, target.hp + amount)
    },

    knockback: (target, dx, dy, force) => {
      const d = Math.hypot(dx, dy) || 1
      // debt.3 Task 5: fecha a migração que debt.2 deixou pendente por decisão do @po.
      // stat.knockbackTaken (base 1.0 + bônus do Golem -0.6 = 0.4) reproduz exatamente
      // 1 - mods.knockbackResist (1 - 0.6 = 0.4) de antes.
      const eff = (force * target.stat.knockbackTaken) / target.stat.mass
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

    // debt.3 — soma, nunca sobrescreve. É isto que resolve C3.
    addBonus: (self, key, amount) => {
      self.bonusPassive[key] += amount
    },

    // debt.6 — abre a janela declarada; resolveContactWindow (dentro de collideBalls) faz
    // o resto. windowDef ausente falha em silêncio (não abre nada) em vez de lançar.
    // LIMITAÇÃO CONHECIDA (QA-002, gate de debt.6): A1 audita só o sentido inverso —
    // que todo contactWindows[i].source bate com uma ability/ult — não que todo CALL SITE
    // de openContactWindow(self, source) tenha um contactWindows correspondente. Um
    // personagem que digitasse o source errado aqui não seria pego por nenhuma camada
    // hoje. Fechar isso é auditoria de roster em escala — Fase 2/6, não escopo de debt.6.
    openContactWindow: (self, source) => {
      const windowDef = charOf(world, self).contactWindows?.find((w) => w.source === source)
      if (!windowDef) return
      self.contact = { source, endsAt: world.time + windowDef.ms, lastHitAt: -Infinity }
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
  // debt.6 — Camada 2 de auditoria do Pilar 3 (D-07). Pega qualquer chamada SÍNCRONA a
  // dealDamage durante phase === 'collide', direta ou indireta. NÃO pega dano aplicado via
  // Effect (ctx.apply(fx.dot(...))), que só materializa no tick seguinte sob phase ===
  // 'effect' — limitação conhecida (QA-001, gate de debt.6), sem regressão hoje porque
  // nenhum personagem do roster faz isso. Roda sempre, inclusive em produção — modo de
  // teste diferente de produção seria fonte de divergência de determinismo, o que não pode
  // existir na Fase 4. `charId` identifica o INFRATOR (quem chamou de dentro de on.collide),
  // não a vítima.
  if (world.phase === 'collide') {
    const charId = source ? charOf(world, source).id : '(sem source)'
    throw new Error(`Pilar 3: dano por contato fora de janela declarada · ${charId}`)
  }
  if (!target.alive || amount <= 0) return

  let amt = amount
  if (source) {
    // debt.2 Task 2: dmg migrado para stat.*
    amt *= source.stat.dmg
    amt *= 1 + sumEffects(source.effects, 'amp')
    amt *= charOf(world, source).passives[source.passiveIndex].onDamageDealt?.(ctx, source, target) ?? 1
  }
  // dmgTaken é campo novo (debt.1), sempre 1.0 hoje — multiplicação é no-op até debt.3
  amt *= target.stat.dmgTaken
  amt *= 1 + sumEffects(target.effects, 'vuln')
  amt *= charOf(world, target).passives[target.passiveIndex].onDamageTaken?.(ctx, target, source) ?? 1

  target.hp -= amt
  world.events.push({
    t: 'hit',
    x: target.x,
    y: target.y - target.stat.radius,
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

/**
 * debt.6 — resolve a janela de dano por contato de `self` contra `other`, dentro do
 * callback de `collideBalls`. Segue architecture.md §4.2 literalmente. `world.phase` já
 * foi ajustada para 'contact' pelo chamador (ver step()); reafirmada aqui porque esta
 * função é o único lugar que efetivamente chama dealDamage por contato — não depender só
 * do chamador lembrar de ajustar a fase primeiro.
 */
function resolveContactWindow(world: World, ctx: SimCtx, self: Ball, other: Ball): void {
  if (!self.contact) return
  if (world.time >= self.contact.endsAt) {
    self.contact = null
    return
  }
  if (other.team === self.team) return
  const w = charOf(world, self).contactWindows?.find((cw) => cw.source === self.contact!.source)
  if (!w) return
  if (world.time - self.contact.lastHitAt < w.reHitMs) return
  self.contact.lastHitAt = world.time
  world.phase = 'contact'
  dealDamage(world, ctx, other, w.dmg, self)
  ctx.knockback(other, other.x - self.x, other.y - self.y, w.knockback)
  w.onHit?.(ctx, self, other)
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
    // debt.4: cdSpeed aplicado, com piso absoluto — resolve C2 (Relicário). Com
    // cdSpeed=1.0 (default do roster hoje), ab.cd / 1.0 === ab.cd exato, hash não muda.
    self.abilityReadyAt = world.time + Math.max(MIN_ABILITY_CD_MS, ab.cd / self.stat.cdSpeed)
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
  // debt.2 Task 3: range migrado para stat.*
  const range = def.atk.range * b.stat.range

  let target: Ball | null = null
  let bestD = Infinity
  for (const e of world.balls) {
    if (!e.alive || e.team === b.team) continue
    // alcance é medido de SUPERFÍCIE a superfície, senão corpos grandes nunca se
    // alcançam: a colisão os mantém separados pela soma dos raios.
    const gap = Math.hypot(e.x - b.x, e.y - b.y) - e.stat.radius - b.stat.radius
    if (gap <= range && gap < bestD) {
      bestD = gap
      target = e
    }
  }
  if (!target) return

  // debt.2 Task 3: atkSpeed migrado para stat.*
  b.atkReadyAt = world.time + def.atk.cd / b.stat.atkSpeed
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
      x: b.x + (ix / id) * b.stat.radius,
      y: b.y + (iy / id) * b.stat.radius,
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
      if (Math.hypot(b.x - p.x, b.y - p.y) > b.stat.radius + p.radius) continue
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

  // debt.6 — world.phase marca cada bloco do pipeline (AC 8). Só 'collide' tem
  // consequência hoje (dealDamage recusa), mas todas as fases existem para auditabilidade
  // futura. Atribuição direta em cada ponto, nunca try/finally — ver Dev Notes de debt.6.
  world.phase = 'cast'
  for (const c of commands) {
    if (c.tick === world.tick) castCommand(world, ctx, c)
  }

  for (const b of world.balls) {
    if (!b.alive) continue
    world.phase = 'effect'
    tickEffects(world, ctx, b)
    if (!b.alive) continue
    const def = charOf(world, b)
    // pipeline de recálculo por tick (debt.3, architecture.md §1.5) — ordem exata:
    // zera bonusPassive, soma o bônus declarativo da passiva ativa, roda onTick (que pode
    // chamar ctx.addBonus), roda on.tick do personagem, só então recomputa stat.
    zeroBonus(b.bonusPassive)
    const passiveBonus = def.passives[b.passiveIndex].bonus
    if (passiveBonus) addPartialBonus(b.bonusPassive, passiveBonus)
    world.phase = 'tick'
    def.passives[b.passiveIndex].onTick?.(ctx, b)
    def.on?.tick?.(ctx, b)
    recomputeStats(b)
    def.move(ctx, b)
    if (def.ult.charge === 'time') addCharge(world, b, 'time', world.dt * 1000)
  }

  world.phase = 'attack'
  for (const b of world.balls) autoAttack(world, ctx, b)

  world.phase = 'zone'
  tickZones(world, ctx)
  world.phase = 'projectile'
  tickProjectiles(world, ctx)

  integrate(world)
  collideZoneWalls(world)
  collideBalls(world, (a, other) => {
    // debt.6 (AC 10): resolveContactWindow SEMPRE antes de on.collide, cada fase com sua
    // própria atribuição direta — nunca as duas juntas sob um único try/finally, senão o
    // dano legítimo de contato seria recusado por fase='collide' já ligada cedo demais.
    // Ordem de pares preservada: collideBalls chama onCollide(a,b) depois onCollide(b,a).
    world.phase = 'contact'
    resolveContactWindow(world, ctx, a, other)
    world.phase = 'collide'
    charOf(world, a).on?.collide?.(ctx, a, other)
  })
  // QA-004 (gate de debt.6): sem isto, world.phase ficava em 'collide' até o próximo
  // 'cast' do tick seguinte — qualquer dano causado depois daqui (ex.: código futuro após
  // collideBalls) seria recusado por um falso positivo do Pilar 3. Neutro: nada abaixo
  // deste ponto deveria estar processando contato.
  world.phase = 'tick'
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
