import type { EventoPartida } from '../match/index.ts'

/**
 * TELEMETRIA LOCAL (`docs/architecture-e3.md` §10, story `e3.5`).
 *
 * **Este é o único arquivo do projeto que toca `localStorage`, e o único da §10 que conhece DOM**
 * (AC 6). `sim/` não ganha um contador; `match/` já produz `EventoPartida[]` em cada transição desde
 * `e3.2`, porque um redutor puro que não conta o que fez obriga o cliente a reconstruir a história.
 * Aqui só se ACUMULA e se EXPORTA.
 *
 * Três razões para não ser mais sofisticado que isto (§10.2): não há servidor até a Fase 4; o volume
 * é de dezenas de eventos por partida; e telemetria de jogadores reais é RF-49, Fase 5.
 *
 * **O que este arquivo deliberadamente NÃO faz:** calcular P3.1, P3.2 ou P3.3. A arquitetura exige
 * que eles sejam **deriváveis do arquivo exportado**, não que exista um dashboard in-app — e um
 * número agregado dentro do cliente seria um número que ninguém pode auditar contra os eventos que o
 * produziram. Quem agrega é `src/tools/telemetria.ts`, fora do caminho de jogo.
 */

/**
 * Chave VERSIONADA (AC 4). O sufixo não é decoração: o dia em que o formato do evento mudar, os
 * dados antigos ficam sob `v1` e o coletor novo escreve em `v2` — em vez de os dois formatos se
 * misturarem no mesmo array e a agregação somar maçãs com laranjas sem nada acusar.
 */
export const CHAVE = 'bb.telemetria.v1'

/**
 * RF-36 / §10.3 — o indicador do Risco #4, que o PRD §6 mandou instrumentar "junto com a Fase 1" e
 * que atravessou a Fase 1 e a Fase 2 sem existir. R-07 foi resolvida pelo usuário em §14 ("entra de
 * carona no substrato de §10"), então ele nasce aqui.
 *
 * As duas métricas que RF-36 pede saem destes campos, e a story exige que saiam **as duas**:
 *
 *  - **% de rodadas com uma só mão** — agrupar por `(partida, rodada)` e olhar `ladoDaTela` dos
 *    casts de toque (`ponteiro >= 0`). Uma só região ⇒ a rodada foi jogada com uma mão.
 *    **Correção de premissa (gate FAIL, TEL-E35-006): esta métrica NÃO usa `ponteiro`.**
 *    `pointerId` identifica um CONTATO, não um dedo — num touchscreen cada toque novo recebe um id
 *    novo, então contar `pointerId` distintos por rodada mede "quantos toques", não "quantas mãos",
 *    e reporta ~100% de "duas mãos" em qualquer sessão real. Medido sobre uma sessão de toque real
 *    deste build: 23 casts, 23 `pointerId` distintos. `ladoDaTela` persiste através de vários
 *    toques do mesmo dedo porque é uma REGIÃO da tela, não um identificador de evento.
 *  - **taxa de cast desperdiçado** — a fração de casts com `anguloErro` alto, **excluindo os que
 *    saíram sem mira real** (`mag` abaixo do limiar de arrasto — TEL-E35-001, ver campo `mag`
 *    abaixo). O limiar de ângulo é decisão de ANÁLISE e mora no agregador, não aqui: gravar
 *    "desperdiçado: true" congelaria um limiar que ninguém mediu ainda dentro do dado bruto.
 */
export interface EventoCast {
  t: 'cast'
  /** índice da rodada em que o cast aconteceu — sem ele, "% de RODADAS com uma só mão" é inderivável */
  rodada: number
  ballIndex: 0 | 1
  /**
   * `pointerId` do CONTATO, ou `TECLADO` (-1) — ver `Disparo.ponteiro`. Identifica um contato
   * (útil para multitoque simultâneo e para separar teclado de toque), **não** um dedo através de
   * toques separados — ver a correção de premissa em `Disparo.ponteiro`.
   */
  ponteiro: number
  /**
   * Região da tela onde o toque começou (`'esq' | 'dir'`), ou `null` para casts de teclado —
   * TEL-E35-006. É o proxy honesto de "uma só mão": ao contrário de `ponteiro`, persiste através
   * de vários toques do mesmo dedo. Ver `Disparo.ladoDaTela`.
   */
  ladoDaTela: 'esq' | 'dir' | null
  /**
   * Fração de arrasto (0..1, ver `input.ts:ARRASTO_MAX`) no instante do disparo — TEL-E35-001. Um
   * toque sem arrasto (`mag` abaixo de `LIMIAR_ARRASTO_PX / ARRASTO_MAX`) dispara com a mira ainda
   * no placeholder `{dx:1, dy:0}` de `pointerdown`, e `anguloErro` desse cast mede a direção
   * inventada, não a intenção do jogador. Fica no arquivo para a exclusão ser decisão de análise
   * (do agregador), não perda de dado bruto.
   */
  mag: number
  /**
   * Ângulo em GRAUS (0..180) entre a direção mirada e a direção do inimigo vivo mais próximo, no
   * instante do disparo. `-1` quando não havia inimigo vivo para comparar.
   *
   * É um PROXY de desperdício, e está escrito aqui para ninguém o ler como "errou": um Tremor mirado
   * no chão à frente do alvo tem ângulo pequeno e pode desperdiçar, e uma Lâmina mirada a 30° pode
   * acertar de raspão. O que ele mede honestamente é *quão longe da mira ideal o jogador soltou o
   * dedo*, que é a pergunta de ergonomia do Risco #4 — não a de dano.
   */
  anguloErro: number
}

/** Tudo que o coletor guarda: os cinco eventos de `match/` (`e3.2`) mais o `cast` de RF-36. */
export type EventoTelemetria = EventoPartida | EventoCast

/**
 * Um evento com a partida a que ele pertence.
 *
 * `partida` (a seed-mãe) existe porque o acúmulo atravessa várias partidas no mesmo `localStorage`,
 * e o AC 10 pede "trocas de build **por partida**" — inderivável de uma lista plana onde a 2ª rodada
 * de uma partida é indistinguível da 2ª rodada da seguinte. É o mínimo para desempatar, e é dado que
 * o cliente já tem em mãos.
 */
export type EventoRegistrado = EventoTelemetria & { partida: number }

export interface ArquivoTelemetria {
  versao: string
  exportadoEm: string
  eventos: EventoRegistrado[]
}

export interface Telemetria {
  /** entrega ao coletor os eventos que uma `Transicao` de `match/` já produziu */
  registrar: (partida: number, eventos: readonly EventoTelemetria[]) => void
  exportar: () => void
  limpar: () => void
  contagem: () => number
}

/**
 * O coletor. Acumula em memória e espelha em `localStorage` a cada escrita.
 *
 * A escrita é síncrona e por evento porque o volume é de dezenas por partida (§10.2) e porque o modo
 * de falha que importa é a aba fechada no meio da sessão: um buffer esperto perderia exatamente a
 * partida que o portão precisa medir.
 */
export function criarTelemetria(): Telemetria {
  let eventos: EventoRegistrado[] = ler()

  function persistir(): void {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(eventos))
    } catch (err) {
      // localStorage cheio, ou modo privado que o recusa. A partida NÃO pode cair por causa da
      // instrumentação — telemetria é evidência de portão, não regra de jogo.
      console.warn(`[telemetria] não foi possível persistir em ${CHAVE}:`, err)
    }
  }

  return {
    registrar(partida, novos) {
      if (novos.length === 0) return
      for (const e of novos) eventos.push({ ...e, partida })
      persistir()
    },
    exportar() {
      const arquivo: ArquivoTelemetria = {
        versao: CHAVE,
        exportadoEm: new Date().toISOString(),
        eventos,
      }
      baixar(`battle-balls-telemetria-${Date.now()}.json`, JSON.stringify(arquivo, null, 2))
    },
    limpar() {
      eventos = []
      persistir()
    },
    contagem: () => eventos.length,
  }
}

/**
 * Lê o acúmulo anterior. Formato irreconhecível é DESCARTADO com aviso, nunca "consertado": um
 * array meio lido produziria métricas plausíveis e erradas, que é o modo de falha que a Bíblia
 * (§7, errata) nomeia como o mais caro — erro sistemático que nenhuma checagem de reprodutibilidade
 * enxerga.
 */
function ler(): EventoRegistrado[] {
  try {
    const bruto = localStorage.getItem(CHAVE)
    if (!bruto) return []
    const dados: unknown = JSON.parse(bruto)
    if (!Array.isArray(dados)) {
      console.warn(`[telemetria] ${CHAVE} não continha um array — acúmulo anterior descartado`)
      return []
    }
    return dados as EventoRegistrado[]
  } catch (err) {
    console.warn(`[telemetria] ${CHAVE} ilegível — acúmulo anterior descartado:`, err)
    return []
  }
}

/** Download do JSON. É o "botão/atalho de exportar" de §10.2 no ponto em que ele vira arquivo. */
function baixar(nome: string, conteudo: string): void {
  const blob = new Blob([conteudo], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * O ângulo de erro de um cast, em graus.
 *
 * Vive aqui, e não em `main.ts`, porque é a definição da métrica de RF-36 — e a definição pertence
 * ao arquivo que define o evento. `main.ts` só tem a ligação (AC 13).
 *
 * Recebe posições em vez de `World` de propósito: não importa `sim/`, não conhece bola e é
 * testável com dois pares de números.
 */
export function anguloErroGraus(
  origem: { x: number; y: number },
  mira: { dx: number; dy: number },
  alvos: readonly { x: number; y: number }[],
): number {
  if (alvos.length === 0) return -1

  let melhor = -1
  let menorDist = Infinity
  for (const alvo of alvos) {
    const vx = alvo.x - origem.x
    const vy = alvo.y - origem.y
    const d = Math.hypot(vx, vy)
    if (d >= menorDist || d === 0) continue
    menorDist = d
    // produto escalar de dois unitários = cosseno do ângulo entre eles
    const cos = (mira.dx * vx + mira.dy * vy) / d
    melhor = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
  }
  return melhor
}
