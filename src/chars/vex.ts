import { fx } from '../sim/effects.ts'
import type { CharDef } from '../sim/types.ts'

const COR = '#b98cff'

/**
 * VEX — orbitador.
 * Nunca vai direto: circula o inimigo mais próximo a ~165px, que é exatamente
 * a distância em que ele acerta e o Golem não. Quando o alvo cai abaixo de 40%,
 * ele abandona a órbita e mergulha. Massa baixa: qualquer empurrão o tira de posição
 * — e fora de posição ele não causa dano nenhum.
 * Ult carrega com dano causado: agressão vira recurso.
 */
export const vex: CharDef = {
  id: 'vex',
  name: 'Vex',
  color: COR,

  maxHp: 100,
  radius: 15,
  mass: 0.9,
  maxSpeed: 250,
  steer: 3.2,
  drag: 0.22,

  atk: {
    kind: 'projectile',
    cd: 520,
    dmg: 6,
    range: 200,
    speed: 470,
  },

  move: (ctx, self) => {
    const alvo = ctx.nearestEnemy(self)
    if (!alvo) {
      ctx.hold(self, ctx.world.arena.w / 2, ctx.world.arena.h / 2)
      return
    }
    // mergulha em presa ferida, orbita o resto do tempo
    if (alvo.hp / alvo.maxHp < 0.4) ctx.seek(self, alvo.x, alvo.y, 1.1)
    else ctx.orbit(self, alvo, 165)
  },

  abilities: [
    {
      id: 'lamina',
      name: 'Lâmina Fantasma',
      desc: 'Lâmina que atravessa tudo na direção mirada: dano e lentidão forte.',
      cd: 6000,
      minRange: 200,
      maxRange: 200,
      cast: (ctx, self, aim) => {
        ctx.spawnProjectile({
          ownerId: self.id,
          team: self.team,
          x: self.x + aim.dx * self.radius,
          y: self.y + aim.dy * self.radius,
          vx: aim.dx * 620,
          vy: aim.dy * 620,
          radius: 9,
          dmg: 14,
          pierce: true,
          expiresAt: ctx.now + 950,
          color: COR,
          onHit: (c, owner, alvo) => c.apply(alvo, fx.slow(0.4, 1500), owner),
        })
      },
    },
    {
      id: 'deslize',
      name: 'Deslize',
      desc: 'Reposiciona instantaneamente e sai com 30% de dano extra por 2,5s.',
      cd: 5000,
      minRange: 190,
      maxRange: 320,
      cast: (ctx, self, aim) => {
        self.vx = aim.dx * 1000
        self.vy = aim.dy * 1000
        ctx.apply(self, fx.amp(0.3, 2500), self)
      },
    },
  ],

  passives: [
    {
      id: 'predador',
      name: 'Predador',
      desc: 'Causa 28% mais dano em alvos abaixo de metade da vida.',
      onDamageDealt: (_ctx, _self, alvo) => (alvo.hp / alvo.maxHp < 0.5 ? 1.28 : 1),
    },
    {
      id: 'fantasma',
      name: 'Fantasma',
      desc: 'Ganha 25% de velocidade enquanto estiver abaixo de 40% da vida.',
      onTick: (_ctx, self) => {
        self.mods.speed = self.hp / self.maxHp < 0.4 ? 1.25 : 1
      },
    },
  ],

  ult: {
    id: 'convergencia',
    name: 'Convergência',
    desc: 'Vórtice que puxa os inimigos para o ponto mirado e detona depois de 1,3s.',
    charge: 'damageDealt',
    threshold: 130,
    icon: '💥',
    minRange: 80,
    maxRange: 300,
    cast: (ctx, self, aim) => {
      ctx.spawnZone({
        kind: 'vortex',
        team: self.team,
        ownerId: self.id,
        x: aim.x,
        y: aim.y,
        angle: 0,
        halfLen: 0,
        radius: 190,
        // a atração divide pela massa, então o Golem resiste naturalmente
        pull: 2600,
        burstDmg: 24,
        expiresAt: ctx.now + 1300,
        ownerColor: COR,
      })
    },
  },
}
