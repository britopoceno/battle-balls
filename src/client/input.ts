import { botoes, paraArena, transform, type BotaoLayout } from './layout.ts'

export interface Mira {
  botao: BotaoLayout
  dx: number
  dy: number
  mag: number
}

export interface Disparo {
  ballIndex: 0 | 1
  slot: 'ability' | 'ult'
  dx: number
  dy: number
  mag: number
}

/** distância de arrasto (px de tela) que corresponde a mag = 1 */
const ARRASTO_MAX = 130

export interface Entrada {
  /** mira em andamento por ponteiro — o render desenha a partir daqui */
  miras: Map<number, Mira>
  cursorArena: [number, number]
}

/**
 * Mira por arrasto, com Pointer Events: multitoque sai de graça, então os dois
 * polegares miram ao mesmo tempo sem disputar seleção. Mouse e toque usam o mesmo caminho.
 */
export function criarEntrada(
  canvas: HTMLCanvasElement,
  aoDisparar: (d: Disparo) => void,
  teclas: (k: string) => void,
): Entrada {
  const entrada: Entrada = { miras: new Map(), cursorArena: [0, 0] }
  const inicio = new Map<number, { x: number; y: number }>()

  const acharBotao = (x: number, y: number): BotaoLayout | null => {
    for (const b of botoes(canvas.clientWidth, canvas.clientHeight)) {
      // área de toque um pouco maior que o desenho: dedo não é preciso
      if (Math.hypot(x - b.x, y - b.y) <= b.r * 1.35) return b
    }
    return null
  }

  const pos = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  canvas.addEventListener('pointerdown', (e) => {
    const [x, y] = pos(e)
    const b = acharBotao(x, y)
    if (!b) return
    canvas.setPointerCapture(e.pointerId)
    inicio.set(e.pointerId, { x, y })
    entrada.miras.set(e.pointerId, { botao: b, dx: 1, dy: 0, mag: 0 })
    e.preventDefault()
  })

  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = pos(e)
    const t = transform(canvas.clientWidth, canvas.clientHeight)
    entrada.cursorArena = paraArena(t, x, y)

    const ini = inicio.get(e.pointerId)
    const mira = entrada.miras.get(e.pointerId)
    if (!ini || !mira) return
    const dx = x - ini.x
    const dy = y - ini.y
    const d = Math.hypot(dx, dy)
    if (d > 6) {
      mira.dx = dx / d
      mira.dy = dy / d
    }
    mira.mag = Math.max(0, Math.min(1, d / ARRASTO_MAX))
    e.preventDefault()
  })

  const soltar = (e: PointerEvent) => {
    const mira = entrada.miras.get(e.pointerId)
    entrada.miras.delete(e.pointerId)
    inicio.delete(e.pointerId)
    if (!mira) return
    aoDisparar({
      ballIndex: mira.botao.ballIndex,
      slot: mira.botao.slot,
      dx: mira.dx,
      dy: mira.dy,
      mag: mira.mag,
    })
  }
  canvas.addEventListener('pointerup', soltar)
  canvas.addEventListener('pointercancel', (e) => {
    entrada.miras.delete(e.pointerId)
    inicio.delete(e.pointerId)
  })

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return
    teclas(e.key.toLowerCase())
  })

  return entrada
}
