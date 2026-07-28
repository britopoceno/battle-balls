export const ARENA_W = 960
export const ARENA_H = 540

export interface BotaoLayout {
  id: string
  x: number
  y: number
  r: number
  /** índice da bola do jogador: 0 = mão esquerda, 1 = mão direita */
  ballIndex: 0 | 1
  slot: 'ability' | 'ult'
}

export interface Transform {
  scale: number
  ox: number
  oy: number
}

export function transform(cw: number, ch: number): Transform {
  const scale = Math.min(cw / ARENA_W, ch / ARENA_H)
  return { scale, ox: (cw - ARENA_W * scale) / 2, oy: (ch - ARENA_H * scale) / 2 }
}

export const paraTela = (t: Transform, x: number, y: number): [number, number] => [
  t.ox + x * t.scale,
  t.oy + y * t.scale,
]

export const paraArena = (t: Transform, x: number, y: number): [number, number] => [
  (x - t.ox) / t.scale,
  (y - t.oy) / t.scale,
]

/**
 * Polegar esquerdo comanda o personagem 1, direito comanda o 2.
 * Botões nos cantos inferiores, semitransparentes, mapa livre no centro.
 */
export function botoes(cw: number, ch: number): BotaoLayout[] {
  const k = Math.min(1, cw / 900)
  const rA = 46 * k
  const rU = 34 * k
  const m = 96 * k
  return [
    { id: 'L-ability', x: m, y: ch - m, r: rA, ballIndex: 0, slot: 'ability' },
    { id: 'L-ult', x: m + 94 * k, y: ch - 60 * k, r: rU, ballIndex: 0, slot: 'ult' },
    { id: 'R-ability', x: cw - m, y: ch - m, r: rA, ballIndex: 1, slot: 'ability' },
    { id: 'R-ult', x: cw - m - 94 * k, y: ch - 60 * k, r: rU, ballIndex: 1, slot: 'ult' },
  ]
}
