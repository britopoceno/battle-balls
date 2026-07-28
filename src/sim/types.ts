// Tipos do simulador. Puro: nada aqui conhece DOM, rede ou renderizador.

import type { EffectSpec } from './effects.ts'
import type { StatBlock, BonusBlock } from './stats.ts'

export type Team = 0 | 1

export type EffectKind = 'slow' | 'dot' | 'amp' | 'vuln'

export interface Effect {
  kind: EffectKind
  /** slow: 0..1 (fração removida) · dot: dano por segundo · amp/vuln: 0..1 (fração somada) */
  value: number
  endsAt: number
  sourceId: number
}

/** Multiplicadores acumulados de passivas e (futuramente) itens. */
export interface Mods {
  dmg: number
  atkSpeed: number
  range: number
  speed: number
  /** 0..1 · fração do knockback recebido que é ignorada */
  knockbackResist: number
}

export interface Ball {
  id: number
  charId: string
  team: Team
  x: number
  y: number
  vx: number
  vy: number
  /** aceleração acumulada no tick, zerada na integração */
  ax: number
  ay: number
  radius: number
  mass: number
  /** velocidade que a IA de movimento tenta manter (já com mods aplicados) */
  maxSpeed: number
  /** convergência para a velocidade desejada */
  steer: number
  /** fração da velocidade retida por segundo (0..1) */
  drag: number
  hp: number
  maxHp: number
  alive: boolean
  /** radianos · só para render */
  facing: number
  atkReadyAt: number
  abilityReadyAt: number
  ultCharge: number
  ultThreshold: number
  effects: Effect[]
  abilityIndex: 0 | 1
  passiveIndex: 0 | 1
  mods: Mods
  /** rascunho livre por personagem (contadores, cooldowns internos) */
  memory: Record<string, number>

  // --- camada de stats (debt.1). Desde debt.2, stat.* é lido por effectiveSpeed,
  // dealDamage, autoAttack, integrate e collideBalls; knockback e os demais pontos que
  // ainda leem os campos diretos acima fecham em debt.3. Ver sim/stats.ts e architecture.md §1.
  /** valores do CharDef, congelados na criação da bola */
  base: StatBlock
  /** bônus de passiva — aditivo, zerado e reescrito por tick */
  bonusPassive: BonusBlock
  /** bônus de item — aditivo, congelado durante a rodada */
  bonusItem: BonusBlock
  /** derivado: recomputeStats(base, bonusPassive, bonusItem). Não escrever direto. */
  stat: Readonly<StatBlock>
}

export interface Projectile {
  id: number
  ownerId: number
  team: Team
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  dmg: number
  pierce: boolean
  hitIds: number[]
  expiresAt: number
  color: string
  onHit?: (ctx: SimCtx, owner: Ball, target: Ball) => void
}

export interface Zone {
  id: number
  kind: 'wall' | 'vortex'
  team: Team
  ownerId: number
  x: number
  y: number
  /** wall: orientação do segmento */
  angle: number
  /** wall: metade do comprimento */
  halfLen: number
  /** wall: espessura · vortex: raio */
  radius: number
  /** vortex: força de atração */
  pull: number
  /** vortex: dano no fim */
  burstDmg: number
  expiresAt: number
  ownerColor: string
}

export type SimEvent =
  | { t: 'hit'; x: number; y: number; amount: number; targetId: number; crit: boolean }
  | { t: 'cast'; ballId: number; name: string }
  | { t: 'ult'; ballId: number; name: string }
  | { t: 'death'; ballId: number }
  | { t: 'suddenDeath' }
  | { t: 'roundEnd'; winner: Team | -1 }

export interface Arena {
  w: number
  h: number
  /** margem que cresce na morte súbita */
  pad: number
}

export interface World {
  tick: number
  /** ms decorridos */
  time: number
  /** segundos por tick */
  dt: number
  arena: Arena
  balls: Ball[]
  projectiles: Projectile[]
  zones: Zone[]
  /** eventos do tick corrente · consumidos pelo render, zerados a cada step */
  events: SimEvent[]
  rng: () => number
  nextId: number
  over: boolean
  winner: Team | -1
  chars: Record<string, CharDef>
}

/** Comando de jogador, agendado para um tick específico (input delay). */
export interface Command {
  tick: number
  ballId: number
  slot: 'ability' | 'ult'
  /** direção normalizada */
  dx: number
  dy: number
  /** 0..1 · quanto o jogador puxou o arrasto, interpolando entre minRange e maxRange */
  mag: number
}

export interface Aim {
  /** direção normalizada a partir da bola */
  dx: number
  dy: number
  /** ponto alvo, já limitado por minRange/maxRange */
  x: number
  y: number
}

export interface AtkDef {
  cd: number
  dmg: number
  range: number
  kind: 'melee' | 'projectile'
  /** projectile: px/s */
  speed?: number
  knockback?: number
  onHit?: (ctx: SimCtx, self: Ball, target: Ball) => void
}

export interface AbilityDef {
  id: string
  name: string
  desc: string
  cd: number
  minRange: number
  maxRange: number
  cast: (ctx: SimCtx, self: Ball, aim: Aim) => void
}

export type ChargeRule = 'damageDealt' | 'damageTaken' | 'time' | 'kills' | 'casts'

export interface UltDef {
  id: string
  name: string
  desc: string
  /** regra de carga · varia por personagem, é parte da identidade dele */
  charge: ChargeRule
  threshold: number
  /** ícone da condição de carga, exibido na barra */
  icon: string
  minRange: number
  maxRange: number
  cast: (ctx: SimCtx, self: Ball, aim: Aim) => void
}

export interface PassiveDef {
  id: string
  name: string
  desc: string
  /** aplica modificadores estáticos na criação da bola */
  init?: (self: Ball) => void
  onTick?: (ctx: SimCtx, self: Ball) => void
  /** retorna multiplicador do dano causado */
  onDamageDealt?: (ctx: SimCtx, self: Ball, target: Ball) => number
  /** retorna multiplicador do dano recebido */
  onDamageTaken?: (ctx: SimCtx, self: Ball, source: Ball | null) => number
}

export interface CharDef {
  id: string
  name: string
  color: string
  maxHp: number
  radius: number
  mass: number
  /** velocidade que a IA de movimento tenta manter */
  maxSpeed: number
  /** o quão rápido converge para a velocidade desejada */
  steer: number
  /** fração da velocidade retida por segundo (0..1) · governa como o knockback decai */
  drag: number
  atk: AtkDef
  /** IA de movimento autoral · é aqui que mora a identidade do personagem */
  move: (ctx: SimCtx, self: Ball) => void
  abilities: [AbilityDef, AbilityDef]
  passives: [PassiveDef, PassiveDef]
  ult: UltDef
  on?: {
    tick?: (ctx: SimCtx, self: Ball) => void
    collide?: (ctx: SimCtx, self: Ball, other: Ball) => void
    kill?: (ctx: SimCtx, self: Ball, victim: Ball) => void
    death?: (ctx: SimCtx, self: Ball) => void
  }
}

/** Superfície que os personagens usam. Personagens nunca tocam o World direto. */
export interface SimCtx {
  world: World
  now: number
  dt: number

  // consultas
  enemies: (self: Ball) => Ball[]
  allies: (self: Ball) => Ball[]
  nearestEnemy: (self: Ball) => Ball | null
  weakestEnemy: (self: Ball) => Ball | null
  dist: (a: Ball, b: Ball) => number

  // direção (aceleração desejada)
  seek: (self: Ball, tx: number, ty: number, mult?: number) => void
  orbit: (self: Ball, target: Ball, radius: number, mult?: number) => void
  flee: (self: Ball, tx: number, ty: number, mult?: number) => void
  hold: (self: Ball, tx: number, ty: number, mult?: number) => void

  // combate
  damage: (target: Ball, amount: number, source: Ball | null) => void
  heal: (target: Ball, amount: number) => void
  knockback: (target: Ball, dx: number, dy: number, force: number) => void
  apply: (target: Ball, spec: EffectSpec, source?: Ball | null) => void
  spawnProjectile: (spec: Omit<Projectile, 'id' | 'hitIds'>) => void
  spawnZone: (spec: Omit<Zone, 'id'>) => void

  rand: () => number
}
