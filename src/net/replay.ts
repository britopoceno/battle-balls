import type { Command } from '../sim/types.ts'
import {
  aplicar,
  criarPartida,
  placarDe,
  vencedorDaPartida,
  type Decisao,
  type EstadoPartida,
  type Jogador,
  type ResultadoRodada,
} from '../match/index.ts'
import type { RodadaEmCurso, Sala } from './sala.ts'

/**
 * O REPLAY DE PARTIDA: o tipo e a MONTAGEM a partir do que a sala vê (`docs/architecture-e4.md` §7, passo 6
 * de §10, story `e4.6`, P4.3 / RF-41).
 *
 * **PURO, como o resto de `net/`.** Aqui não há disco, relógio, rede nem `tools/`. Quem escreve o arquivo é
 * `server/main.ts` (AC 10, AC 11). Quem reproduz e verifica é `tools/replay-check.ts` (AC 5, AC 11). A
 * reprodução NÃO mora aqui: ela delega a `tools/partida.ts`, e `net/ → tools/` fecharia o ciclo
 * `tools/ → net/ → tools/` que a §2.2 proíbe (AC 11, correção do @po na validação).
 *
 * **O que é gravado (AC 4), e nada além:** `matchSeed`, as `Decisao` na ordem em que a sala as aceitou, e os
 * `Command[]` de cada rodada **já carimbados** (com o `tick` que a sala atribuiu). O carimbo não é refeito
 * no replay: se fosse, uma mudança futura de `ATRASO_ALVO_TICKS` mudaria replays antigos sem aviso. Para a
 * comparação do AC 5 vão junto os resultados AO VIVO, lidos de `EstadoPartida.historico`: o
 * `ResultadoRodada` de cada rodada, com o `hash` que o `hashDoMundo` injetado pelo servidor calculou, o
 * placar e o vencedor. É receita, não estado: nenhum `World`, nenhum snapshot (AC 9).
 *
 * **`bb.replay.v2` (story `e4.12`, §7.3): os fatos que a receita não tinha.** O relógio de parede fecha
 * rodada e partida por fora da receita: a pausa de R-02 estoura e `estourarPausa` chama `encerrarRodada` com o
 * mundo NAQUELE tick (W.O.), ou encerra a sala antes da fase `fim` (`'anular'`, dois ausentes). A v2 grava a
 * causa, e não a política: `encerramento` por rodada (`'natural' | 'wo'`) e por partida (`'fim' |
 * 'interrompida'`), o `pool` do draft e o carimbo `codigo` de quem gravou. O carimbo chega por
 * `criarGravacao`, e não pela sala: este arquivo não lê git nem roda processo.
 *
 * **Como a gravação acompanha a sala sem mudar a sala.** `net/sala.ts` não guarda os comandos depois de
 * consumidos, e o log `Sala.decisoes` traz também as decisões que `aplicar()` recusou. Por isso a gravação
 * observa CADA `passo()`, com duas funções em volta dele:
 *
 *  - `marcarAntesDoPasso(s)` guarda a rodada em curso, o array `pendentes` dela e o seu tamanho, o log de
 *    decisões e a `partida` de antes. A sala só ACRESCENTA a esse array (`castar` faz `push`) e, quando
 *    avança ticks, troca `pendentes` por um array NOVO (`filter`). Então, depois do passo, o array marcado
 *    ainda tem, a partir do tamanho marcado, exatamente os comandos carimbados neste passo, inclusive os
 *    que o próprio passo já consumiu (um passo que avança vários ticks) e os do passo em que a rodada acaba;
 *  - `gravarPasso(g, marca, depois)` anexa esses comandos à rodada deles, e classifica as decisões novas do
 *    log, aplicando `aplicar()` à `partida` de antes do passo, na ordem do log. É a MESMA função pura, sobre
 *    o mesmo estado, na mesma ordem em que a sala a chamou, e por isso dá o mesmo veredito. Só as aceitas
 *    entram. Não é reprodução: nenhuma rodada roda aqui, e o resultado de rodada vem da sala.
 *
 * Por que filtrar as recusadas, e não gravar `Sala.decisoes` inteiro: `reproduzirPartida` (`tools/partida.ts`)
 * só consome decisão fora da fase `rodada`. Um `{t:'pronto'}` que um cliente mande no meio da rodada é
 * recusado ao vivo, mas no replay seria consumido na loja seguinte, e lá seria ACEITO. A partida reproduzida
 * seria outra.
 *
 * DIREÇÃO DAS SETAS (§2.2): `net/replay.ts → sim/` (só o tipo `Command`), `match/`, `net/sala.ts` (só tipos).
 */

/**
 * `e4.6`/AC 8 — a versão do formato, no espírito da chave `bb.telemetria.v1` de `e3.5`. Todo arquivo a carrega,
 * e o leitor (`lerReplay` em `tools/replay-check.ts`) recusa com erro qualquer versão que não conheça: mudar o
 * formato é trocar esta string, e um replay de versão desconhecida falha alto em vez de ser reinterpretado.
 * O servidor grava só a v2 (`e4.12`). O leitor aceita também a v1 (AC 5), com os padrões que ela supunha.
 */
export const FORMATO_DO_REPLAY = 'bb.replay.v2'

/** `e4.12`, AC 5 — a versão anterior, que o leitor continua aceitando. Nada grava mais nela. */
export const FORMATO_DO_REPLAY_V1 = 'bb.replay.v1'

export type FormatoDoReplay = typeof FORMATO_DO_REPLAY | typeof FORMATO_DO_REPLAY_V1

/**
 * `e4.12`, AC 1 — por que a rodada fechou. `'natural'`: pela condição de fim de `avancarUmTick`
 * (`w.over || w.tick >= tetoDeTicks`). `'wo'`: sem ela, e isso só `estourarPausa` faz (R-02). Numa `'wo'`,
 * `aoVivo.ticks` é o tick do corte e `aoVivo.vencedor` é o presente, um fato de relógio gravado como dado.
 */
export type EncerramentoDaRodada = 'natural' | 'wo'

/** `e4.12`, AC 2 — `'fim'`: a partida chegou à fase `fim`. `'interrompida'`: a sala encerrou antes (`'anular'`, dois ausentes). */
export type EncerramentoDaPartida = 'fim' | 'interrompida'

/**
 * `e4.12`, AC 4 — o código que gravou: `git rev-parse HEAD`, e se `git status --porcelain` saiu não vazio, lidos
 * UMA vez pelo servidor na subida. `null` nos dois quando o git não está lá. É aviso para quem verifica, nunca
 * reprovação. ⚠️ `sujo` conta qualquer arquivo da árvore, e não só `src/`: nesta árvore ele sai `true` quase
 * sempre (nota do AC 4, registrada para o @architect).
 */
export interface CodigoDoReplay {
  commit: string | null
  sujo: boolean | null
}

/** O carimbo de quem não sabe de que código veio: a v1 lida (AC 5) e a guarda do `sim:check`, que não lê git. */
export const CODIGO_DESCONHECIDO: Readonly<CodigoDoReplay> = { commit: null, sujo: null }

export interface RodadaDoReplay {
  /** os comandos que a sala carimbou nesta rodada, na ordem de carimbo (a ordem em que `step` os consome no tick) */
  comandos: Command[]
  /** o `ResultadoRodada` que a sala registrou AO VIVO (`EstadoPartida.historico`), com o `hash` injetado */
  aoVivo: ResultadoRodada
  /** `e4.12`, AC 1 — classificado em `gravarPasso`, com o mundo da rodada que fechou no passo */
  encerramento: EncerramentoDaRodada
}

export interface Replay {
  /** o servidor grava sempre `FORMATO_DO_REPLAY`; `FORMATO_DO_REPLAY_V1` só sai de `lerReplay` (AC 5) */
  formato: FormatoDoReplay
  /** a seed-mãe da partida, a de `criarSala` (`OpcoesDaSala.seed`) */
  matchSeed: number
  /** `e4.12`, AC 3 — o `injetado.pool` da sala, o roster do draft. A reprodução usa este, e não um fixo */
  pool: string[]
  /** `e4.12`, AC 4 — o carimbo que o servidor passou a `criarGravacao` */
  codigo: CodigoDoReplay
  /** `e4.12`, AC 2 — lido de `partida.fase` na montagem */
  encerramento: EncerramentoDaPartida
  /** só as aceitas por `aplicar()`, na ordem em que a sala as aplicou, inclusive as que ela produziu (RF-04, R-02) */
  decisoes: Decisao[]
  /** só as rodadas FECHADAS (as que estão em `historico`), na ordem */
  rodadas: RodadaDoReplay[]
  /** ao vivo: `placarDe` e `vencedorDaPartida` da `partida` final da sala (numa `'interrompida'`, não há resultado de partida) */
  placar: [number, number]
  vencedor: Jogador | -1
}

/** O estado da gravação de UMA sala. Nasce com a sala (`criarGravacao(codigo)` logo depois de `criarSala`). */
export interface GravacaoDeReplay {
  decisoes: Decisao[]
  /**
   * uma entrada por rodada iniciada, na ordem; a identidade da `RodadaEmCurso` diz a que rodada o comando pertence.
   * `encerramento` fica `null` até a rodada fechar (e para sempre, se a sala encerrar com ela em curso)
   */
  rodadas: { rodada: RodadaEmCurso; comandos: Command[]; encerramento: EncerramentoDaRodada | null }[]
  /** `e4.12`, AC 4 — o carimbo recebido de quem criou a gravação */
  readonly codigo: CodigoDoReplay
}

/** O que `marcarAntesDoPasso` guarda. Opaco para quem chama: é só levado de uma função à outra. */
export interface MarcaDoPasso {
  readonly rodada: RodadaEmCurso | null
  readonly pendentes: readonly Command[] | null
  readonly jaPendentes: number
  readonly decisoes: readonly Decisao[]
  readonly partida: EstadoPartida
}

/**
 * `e4.12`, AC 4 — o carimbo `codigo` entra por aqui, e não por `criarSala`/`OpcoesDaSala`. O servidor passa o
 * que leu do git na subida. Quem não leu passa `CODIGO_DESCONHECIDO`.
 */
export function criarGravacao(codigo: Readonly<CodigoDoReplay>): GravacaoDeReplay {
  return { decisoes: [], rodadas: [], codigo: { commit: codigo.commit, sujo: codigo.sujo } }
}

/** Chamar com a sala que VAI entrar em `passo()`, antes da chamada. */
export function marcarAntesDoPasso(s: Sala): MarcaDoPasso {
  const pendentes = s.rodada?.pendentes ?? null
  return {
    rodada: s.rodada,
    pendentes,
    jaPendentes: pendentes?.length ?? 0,
    decisoes: s.decisoes,
    partida: s.partida,
  }
}

/**
 * Chamar com a sala que `passo()` devolveu. Lança se a sala fizer algo que esta gravação não sabe acompanhar:
 * uma gravação que perde comando ou decisão em silêncio produz um replay que "reproduz" outra partida.
 */
export function gravarPasso(g: GravacaoDeReplay, m: MarcaDoPasso, depois: Sala): void {
  if (m.rodada !== null && m.pendentes !== null) {
    if (m.pendentes.length < m.jaPendentes) {
      throw new Error('replay: o array de comandos pendentes encolheu dentro do passo; a gravação supõe que a sala só acrescenta a ele')
    }
    comandosDa(g, m.rodada).push(...m.pendentes.slice(m.jaPendentes))
  }
  classificarEncerramento(g, m, depois)
  const nova = depois.rodada
  if (nova !== null && nova !== m.rodada) {
    // A rodada começou neste passo (`iniciarRodada`, com `inicioMs = agora`): nenhum tick rodou, e os casts
    // que chegaram depois do início, no mesmo passo, estão todos no `pendentes` inicial dela.
    if (nova.world.tick !== 0) throw new Error(`replay: a rodada nova já está no tick ${nova.world.tick} no passo em que começou`)
    if (g.rodadas.some((x) => x.rodada === nova)) throw new Error('replay: a mesma rodada começou duas vezes')
    g.rodadas.push({ rodada: nova, comandos: [...nova.pendentes], encerramento: null })
  }
  gravarDecisoes(g, m, depois)
}

function entradaDa(g: GravacaoDeReplay, r: RodadaEmCurso): GravacaoDeReplay['rodadas'][number] {
  const e = g.rodadas.find((x) => x.rodada === r)
  if (e === undefined) throw new Error('replay: comando de uma rodada que a gravação não viu começar (a gravação tem de nascer com a sala)')
  return e
}

function comandosDa(g: GravacaoDeReplay, r: RodadaEmCurso): Command[] {
  return entradaDa(g, r).comandos
}

/**
 * `e4.12`, AC 1 — a regra medida em W-2 (§7.3). A rodada que estava em curso antes do passo fechou nele quando o
 * `historico` da partida cresceu. O mundo dela é o mesmo objeto que a sala mutou (`step` muda o `World` no
 * lugar), e está no tick em que a rodada fechou. Com a condição de fim de `avancarUmTick` (`sala.ts`), a rodada
 * é `'natural'`. Sem ela, só pode ter fechado por `estourarPausa`: é `'wo'`. Sem relógio de parede, e sem mudar
 * a sala.
 *
 * A rodada que some SEM o `historico` crescer (sala encerrada com ela em curso) fica sem classificação, e não
 * entra no replay: `montarReplay` monta só as rodadas do `historico`.
 */
function classificarEncerramento(g: GravacaoDeReplay, m: MarcaDoPasso, depois: Sala): void {
  if (m.rodada === null || depois.rodada === m.rodada) return
  const fechadas = depois.partida.historico.length - m.partida.historico.length
  if (fechadas <= 0) return
  if (fechadas > 1) throw new Error(`replay: ${fechadas} rodadas fecharam num passo só; a gravação supõe no máximo uma`)
  const e = entradaDa(g, m.rodada)
  if (e.encerramento !== null) throw new Error('replay: a mesma rodada fechou duas vezes')
  const w = m.rodada.world
  e.encerramento = w.over || w.tick >= depois.config.tetoDeTicks ? 'natural' : 'wo'
}

function gravarDecisoes(g: GravacaoDeReplay, m: MarcaDoPasso, depois: Sala): void {
  const antes = m.decisoes
  // `passo()` copia o log e só acrescenta. A exceção é a queda no draft (§6, `cair` em `sala.ts`), que recria
  // a partida e zera o log: aí a gravação recomeça junto, da mesma `criarPartida` que a sala chamou.
  const continua = depois.decisoes.length >= antes.length && (antes.length === 0 || depois.decisoes[antes.length - 1] === antes[antes.length - 1])
  let e: EstadoPartida
  let novas: readonly Decisao[]
  if (continua) {
    e = m.partida
    novas = depois.decisoes.slice(antes.length)
  } else {
    if (g.rodadas.length > 0) throw new Error('replay: o log de decisões da sala recomeçou depois de uma rodada; só a queda no draft faz isso (§6)')
    g.decisoes = []
    e = criarPartida({ seed: depois.injetado.seed, pool: depois.injetado.pool })
    novas = depois.decisoes
  }
  if (novas.length === 0) return
  for (const d of novas) {
    const t = aplicar(e, d)
    if (t.erro === undefined) {
      g.decisoes.push(d)
      e = t.estado
    }
  }
  // Tripwire da classificação: sem rodada fechada no passo, a sala termina exatamente no estado a que as
  // decisões aceitas levam. Com rodada fechada, as decisões vieram antes dela (`passo()` trata as entradas e
  // só depois avança o tempo), e o `registrarRodada` do fim não é refeito aqui.
  if (depois.partida.historico.length === e.historico.length && JSON.stringify(e) !== JSON.stringify(depois.partida)) {
    throw new Error('replay: as decisões aceitas por aplicar() não levam ao estado em que a sala terminou o passo; a classificação divergiu da sala')
  }
}

/**
 * A montagem (AC 4). Vale a qualquer momento, e grava só as rodadas fechadas. Com a sala `encerrada` antes
 * da fase `fim` (R-02 `'anular'`, ou os dois assentos vagos), o replay sai com as rodadas que houve e com
 * `encerramento: 'interrompida'` (`e4.12`, AC 2), e o verificador confere só o que houve.
 */
export function montarReplay(g: GravacaoDeReplay, s: Sala): Replay {
  const h = s.partida.historico
  if (g.rodadas.length < h.length) {
    throw new Error(`replay: a sala fechou ${h.length} rodada(s) e a gravação viu ${g.rodadas.length}`)
  }
  return {
    formato: FORMATO_DO_REPLAY,
    matchSeed: s.injetado.seed,
    pool: [...s.injetado.pool],
    codigo: { commit: g.codigo.commit, sujo: g.codigo.sujo },
    encerramento: s.partida.fase === 'fim' ? 'fim' : 'interrompida',
    decisoes: [...g.decisoes],
    rodadas: h.map((aoVivo, i) => {
      const encerramento = g.rodadas[i].encerramento
      if (encerramento === null) throw new Error(`replay: a rodada ${i} está no historico da sala e a gravação não a viu fechar`)
      return { comandos: [...g.rodadas[i].comandos], aoVivo, encerramento }
    }),
    placar: placarDe(s.partida),
    vencedor: vencedorDaPartida(s.partida),
  }
}

/**
 * A forma do arquivo: JSON do `Replay`, sem espaço. Uma função só, para o servidor gravar e a guarda do
 * `sim:check` medir os mesmos bytes (AC 9). Número em JSON volta idêntico (`JSON.parse(JSON.stringify(x)) ===
 * x` para todo double finito), e é isso que deixa o `dx`/`dy` do cliente sem arredondar.
 */
export function serializarReplay(r: Replay): string {
  return JSON.stringify(r)
}
