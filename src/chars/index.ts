import type { CharDef } from '../sim/types.ts'
import { golem } from './golem.ts'
import { ESCALA_DMG, ESCALA_HP } from './tuning.ts'
import { vex } from './vex.ts'

/**
 * Aplica a alavanca de D-05 (`tuning.ts`) ao montar o registro — AC 3/4/5. Escala só os campos
 * DECLARATIVOS de `CharDef` (`maxHp`, `atk.dmg`, `contactWindows[].dmg`); dano embutido em `cast()`
 * de habilidade/ult (ex.: `ctx.damage(e, 18, self)` do Tremor) fica fora, porque alterá-lo exigiria
 * tocar `golem.ts`/`vex.ts`, e o AC 19 desta story restringe as mudanças a `tuning.ts` e este
 * arquivo. `ESCALA_DMG` é "ajuste fino" (AC 6) sobre ataque básico e janela de contato, não sobre o
 * kit de habilidades — a alavanca primária de D-05 é `ESCALA_HP`.
 */
function aplicarEscala(def: CharDef): CharDef {
  return {
    ...def,
    maxHp: def.maxHp * ESCALA_HP,
    atk: { ...def.atk, dmg: def.atk.dmg * ESCALA_DMG },
    contactWindows: def.contactWindows?.map((w) => ({ ...w, dmg: w.dmg * ESCALA_DMG })),
  }
}

/** Registro injetado na simulação. `sim` nunca importa daqui — a dependência é só nesta direção. */
export const CHARS: Record<string, CharDef> = {
  golem: aplicarEscala(golem),
  vex: aplicarEscala(vex),
}
export const ROSTER = Object.values(CHARS)
