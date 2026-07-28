import type { CharDef } from '../sim/types.ts'
import { golem } from './golem.ts'
import { vex } from './vex.ts'

/** Registro injetado na simulação. `sim` nunca importa daqui — a dependência é só nesta direção. */
export const CHARS: Record<string, CharDef> = { golem, vex }
export const ROSTER = [golem, vex]
