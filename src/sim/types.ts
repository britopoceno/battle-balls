// Tipos do simulador. Puro: nada aqui conhece DOM, rede ou renderizador.

import type { EffectSpec } from './effects.ts'
import type { StatBlock, BonusBlock, StatKey } from './stats.ts'

export type Team = 0 | 1

export type EffectKind = 'slow' | 'dot' | 'amp' | 'vuln'

export interface Effect {
  kind: EffectKind
  /** slow: 0..1 (fração removida) · dot: dano por segundo · amp/vuln: 0..1 (fração somada) */
  value: number
  endsAt: number
  sourceId: number
}

/**
 * debt.6 — janela de dano por contato declarada. Resolve D-07/C1: o Pilar 3 reformulado
 * ("colisão passiva causa 0 dano; dano por contato só dentro de janela explícita de
 * habilidade, declarada no personagem") deixa de depender de ler `on.collide` linha a
 * linha e vira campo tipado, auditável pelo motor.
 */
export interface ContactWindowDef {
  /** id da ability ou da ult que abre esta janela — auditado contra CharDef (A1) */
  source: string
  ms: number
  dmg: number
  knockback: number
  /** trava de re-hit — global por atacante, não por par atacante-alvo (ver Dev Notes de debt.6) */
  reHitMs: number
  onHit?: (ctx: SimCtx, self: Ball, other: Ball) => void
}

/** Estado runtime de uma janela aberta numa bola — `lastHitAt` único, não por alvo. */
export interface ContactState {
  source: string
  endsAt: number
  lastHitAt: number
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
  hp: number
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
  /** rascunho livre por personagem (contadores, cooldowns internos) — o motor NUNCA lê daqui */
  memory: Record<string, number>
  /** debt.6 — janela de contato aberta, ou null. Campo tipado que o motor lê; memory não é */
  contact: ContactState | null

  // --- camada de stats (debt.1, completada em debt.3 — mods e os campos diretos foram
  // removidos; esta é a única fonte de verdade agora). Ver sim/stats.ts e architecture.md §1.
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
  /**
   * debt.7 — INVARIANTE: nunca reordenar por valor (sem `sort` por HP, distância ou
   * dano). Se alguma lógica precisar de outra ordem, ordena uma CÓPIA, sempre com
   * desempate por `id`. `Array.prototype.sort` só é estável dentro do mesmo engine, e a
   * Fase 4 roda Node e Chrome simultaneamente — reordenar o array original faria a ordem
   * de consumo de `ctx.rand` (quando personagens passarem a usá-lo) divergir entre eles.
   */
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
  /**
   * debt.6 — fase corrente do pipeline do tick. Camada 2 de auditoria do Pilar 3:
   * `dealDamage` recusa dano quando `phase === 'collide'`, porque colisão passiva não
   * pode causar dano — só contato mediado por janela declarada (fase 'contact') pode.
   * Restaurado por atribuição direta em cada ponto do pipeline, nunca por try/finally —
   * há reentrância real (dano da janela → morte → on.kill → mais dano).
   */
  phase: 'cast' | 'tick' | 'effect' | 'attack' | 'zone' | 'projectile' | 'contact' | 'collide'
}

/**
 * debt.7 — o bot recebe isto, nunca `World`. Oculta `rng` POR TIPO, não por convenção:
 * tentar chamar `.rng()` a partir de um `WorldView` é erro de compilação. `World` satisfaz
 * `WorldView` estruturalmente, então nenhum ponto de chamada precisa converter.
 *
 * Ressalva registrada, não corrigida aqui: `Omit` é raso — `view.balls[0].hp` continua
 * mutável. Começa com `Omit` + o teste de replay (que pega a violação em runtime,
 * indiretamente, via divergência de hash); endurecer para `DeepReadonly` só se aparecer
 * um caso real de escrita acidental.
 */
export type WorldView = Omit<World, 'rng'>

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

/**
 * e2.2 — geometria grosseira da habilidade, declarada como DADO em vez de viver dentro do
 * closure `cast`. Precedente direto: `contactWindows` (debt.6) tirou do closure um fato que
 * outra camada precisava ler. Aqui a "outra camada" é o bot heurístico, não o motor.
 *
 * Vocabulário FECHADO. Estender é ato deliberado, revisado, não acidente.
 *
 * Duas invariantes que fazem este tipo valer a pena:
 * - descreve apenas FORMA (raio, velocidade, duração) e NUNCA dano — dano é o número volátil,
 *   e é onde uma segunda fonte de verdade divergiria da primeira (a lição de C3);
 * - `sim/` nunca lê este campo. A direção permitida continua sendo `bot → sim` (RF-19).
 *   `desc`, `name`, `icon` e `color` já são exatamente isto: dado no tipo do personagem,
 *   consumido por outra camada.
 *
 * Não confundir com `Aim` acima: `Aim` é a mira resolvida de um cast (runtime); `AimSpec` é a
 * descrição estática do que o slot entrega.
 */
export type AimSpec =
  /** área no ponto mirado, com atraso opcional (Tremor; Convergência) */
  | { kind: 'burst';     radius: number; delayMs: number }
  /** projétil na direção mirada (Lâmina Fantasma) */
  | { kind: 'raio';      radius: number; speed: number; ms: number }
  /** investida do PRÓPRIO corpo que causa dano por contato (Impacto Sísmico) */
  | { kind: 'dash';      speed: number; ms: number }
  /** reposicionamento sem dano (Deslize) */
  | { kind: 'reposicao'; speed: number }
  /** o bot não sabe avaliar isto (Muralha). Declarar é obrigatório; omitir, não */
  | { kind: 'utilidade' }

export interface AbilityDef {
  id: string
  name: string
  desc: string
  cd: number
  minRange: number
  maxRange: number
  /**
   * e2.2 — OBRIGATÓRIO, não opcional. Esquecer é provável (6 personagens novos na Fase 5) e o
   * modo de falha é silencioso: o bot nunca casta a habilidade, o personagem perde parte do kit,
   * e a matriz de balanceamento reporta isso como fraqueza do personagem. `{ kind: 'utilidade' }`
   * é o escape hatch — mas tem que ser digitado. Mesma lição de `debt.6`.
   */
  aim: AimSpec
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
  /** e2.2 — OBRIGATÓRIO, mesma regra de `AbilityDef.aim`. Ver AimSpec. */
  aim: AimSpec
  cast: (ctx: SimCtx, self: Ball, aim: Aim) => void
}

export interface PassiveDef {
  id: string
  name: string
  desc: string
  /** bônus estático somado em bonusPassive todo tick (debt.3 — resolve C3: declarativo, auditável sem executar código) */
  bonus?: Partial<BonusBlock>
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
  /** debt.5 — restituição própria. Ausente = DEFAULT_STATS.restBall/restWall (0.65/0.72) */
  restBall?: number
  restWall?: number
  atk: AtkDef
  /** IA de movimento autoral · é aqui que mora a identidade do personagem */
  move: (ctx: SimCtx, self: Ball) => void
  abilities: [AbilityDef, AbilityDef]
  passives: [PassiveDef, PassiveDef]
  ult: UltDef
  /** debt.6 — janelas de dano por contato declaradas. Ausência = nunca causa dano por contato */
  contactWindows?: ContactWindowDef[]
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

  /** soma em self.bonusPassive[key] — nunca sobrescreve. Resolve C3 pela raiz (debt.3). */
  addBonus: (self: Ball, key: StatKey, amount: number) => void

  /**
   * debt.6 — abre a janela de dano por contato declarada em `source` (id de ability/ult
   * do próprio personagem). O motor resolve o contato dentro de `collideBalls`; nenhum
   * `on.collide` de personagem deve chamar `damage` diretamente (Pilar 3/D-07).
   */
  openContactWindow: (self: Ball, source: string) => void

  rand: () => number
}
