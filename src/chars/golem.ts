import { fx } from '../sim/effects.ts'
import type { CharDef } from '../sim/types.ts'

const COR = '#e8a33d'

/**
 * GOLEM — âncora.
 * Anda reto e devagar na ameaça mais próxima. Massa alta: quase não é empurrado
 * e empurra muito. Só machuca no contato, então todo o jogo dele é CHEGAR.
 * Ult carrega com dano recebido — quanto mais apanha, mais perto do troco.
 */
export const golem: CharDef = {
  id: 'golem',
  name: 'Golem',
  color: COR,

  maxHp: 190,
  radius: 24,
  mass: 3.2,
  maxSpeed: 105,
  steer: 1.3,
  drag: 0.3,

  atk: {
    kind: 'melee',
    cd: 1100,
    dmg: 16,
    range: 18, // além do raio: precisa estar praticamente encostado
    knockback: 320,
  },

  move: (ctx, self) => {
    const alvo = ctx.nearestEnemy(self)
    if (!alvo) {
      ctx.hold(self, ctx.world.arena.w / 2, ctx.world.arena.h / 2)
      return
    }
    ctx.seek(self, alvo.x, alvo.y)
  },

  abilities: [
    {
      id: 'sismico',
      name: 'Impacto Sísmico',
      desc: 'Investe na direção mirada. Quem encostar durante a investida leva dano e voa.',
      cd: 7000,
      minRange: 140,
      maxRange: 280,
      // e2.2 — investida do próprio corpo. speed 900 = o multiplicador aplicado a aim abaixo;
      // ms 450 = a duração da janela declarada em contactWindows (debt.6).
      aim: { kind: 'dash', speed: 900, ms: 450 },
      cast: (ctx, self, aim) => {
        self.vx = aim.dx * 900
        self.vy = aim.dy * 900
        // debt.6: era self.memory.dashAte = ctx.now + 450 + o.collide do Golem tratando o
        // resto (10 linhas ilegíveis de fora deste arquivo). Agora a janela é declarada em
        // contactWindows abaixo, e o motor resolve genericamente dentro de collideBalls.
        ctx.openContactWindow(self, 'sismico')
      },
    },
    {
      id: 'tremor',
      name: 'Tremor',
      desc: 'Racha o chão no ponto mirado: dano em área, lentidão e afastamento.',
      cd: 8000,
      minRange: 70,
      maxRange: 230,
      // e2.2 — área no ponto mirado. radius 110 = `raio` abaixo; delayMs 0 porque o efeito é
      // resolvido no mesmo tick do cast (a zona de 280ms é só marca visual, sem dano).
      aim: { kind: 'burst', radius: 110, delayMs: 0 },
      cast: (ctx, self, aim) => {
        const raio = 110
        for (const e of ctx.enemies(self)) {
          if (Math.hypot(e.x - aim.x, e.y - aim.y) > raio) continue
          ctx.damage(e, 18, self)
          ctx.apply(e, fx.slow(0.45, 1800), self)
          ctx.knockback(e, e.x - aim.x, e.y - aim.y, 300)
        }
        // zona sem força nem dano: existe só como marca visual do estouro
        ctx.spawnZone({
          kind: 'vortex',
          team: self.team,
          ownerId: self.id,
          x: aim.x,
          y: aim.y,
          angle: 0,
          halfLen: 0,
          radius: raio,
          pull: 0,
          burstDmg: 0,
          expiresAt: ctx.now + 280,
          ownerColor: COR,
        })
      },
    },
  ],

  passives: [
    {
      id: 'ancora',
      name: 'Âncora',
      desc: 'Ignora 60% de todo knockback recebido.',
      // debt.3: era init com atribuição absoluta ao antigo campo de resistência (0.6).
      // bonus é declarativo e soma em bonusPassive todo tick — 1 - 0.6 === 0.4, exato.
      bonus: { knockbackTaken: -0.6 },
    },
    {
      id: 'casca',
      name: 'Casca',
      desc: 'Recebe 18% menos dano enquanto estiver acima de metade da vida.',
      onDamageTaken: (_ctx, self) => (self.hp / self.stat.maxHp > 0.5 ? 0.82 : 1),
    },
  ],

  // debt.6 — janela de dano por contato do dash, declarada e auditável (Pilar 3/D-07).
  // Valores idênticos ao antigo on.collide: dmg 14, knockback 520, re-hit a cada 250ms,
  // dentro dos 450ms de duração do dash.
  contactWindows: [{ source: 'sismico', ms: 450, dmg: 14, knockback: 520, reHitMs: 250 }],

  ult: {
    id: 'muralha',
    name: 'Muralha',
    desc: 'Ergue uma parede sólida no ponto mirado por 5s. Corta a arena em duas.',
    charge: 'damageTaken',
    threshold: 110,
    icon: '🩸',
    minRange: 70,
    maxRange: 240,
    // e2.2 — parede: burstDmg 0, nenhum dano em lugar nenhum. O bot não sabe avaliar controle
    // de espaço, e declarar isso é obrigatório justamente para que a omissão não passe calada.
    aim: { kind: 'utilidade' },
    cast: (ctx, self, aim) => {
      ctx.spawnZone({
        kind: 'wall',
        team: self.team,
        ownerId: self.id,
        x: aim.x,
        y: aim.y,
        // perpendicular à mira: você aponta ATRAVÉS da parede
        angle: Math.atan2(aim.dy, aim.dx) + Math.PI / 2,
        halfLen: 95,
        radius: 9,
        pull: 0,
        burstDmg: 0,
        expiresAt: ctx.now + 5000,
        ownerColor: COR,
      })
    },
  },
}
