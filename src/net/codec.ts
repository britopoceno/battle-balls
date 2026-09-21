import type { Decisao } from '../match/types.ts'
import type { Command, EffectKind, SimEvent } from '../sim/types.ts'
import { VERSAO_DO_FIO, type DoCliente, type DoServidor, type Snapshot } from './protocolo.ts'

/**
 * CODEC DO FIO — as duas pontas do texto que atravessa a rede (`docs/architecture-e4.md` §5.5, story
 * `e4.8`). Duas metades independentes, no mesmo arquivo porque nenhuma depende da sala:
 *
 * 1. `parseDoCliente` — ENTRADA. Fecha em RUNTIME o vocabulário que `DoCliente` fecha só em
 *    compilação: a checagem de propriedade extra do `tsc` vale para literal, não para o que o
 *    `JSON.parse` de um socket devolve. Sem isto, um `dx: 1e999` vira `NaN` na posição de projétil do
 *    `World` autoritativo dos DOIS jogadores (`aimFrom`, `sim/world.ts`), e um `jogador: 2` vira
 *    `TypeError` no processo do servidor (`aplicar`, `match/redutor.ts`).
 * 2. `codificarDoServidor` / `decodificarDoServidor` — SAÍDA. Toda variante vai como JSON com nomes,
 *    exceto o `s` do `{t:'snap'}`, que vai como tupla posicional quantizada (LAYOUT abaixo). O motivo é
 *    banda sem depender de compressão: ~904 B/quadro com nomes contra ~326 B em tupla (§5.5, linha D).
 *
 * Quem chama (nenhum dos dois é chamado por ninguém ainda): `server/` (`e4.4`) aplica `parseDoCliente`
 * entre o `JSON.parse` do socket e a montagem da `EntradaDaSala`, e escreve `codificarDoServidor(msg)`
 * no socket; `client/rede.ts` (`e4.5`) lê toda mensagem por `decodificarDoServidor`. A sala (`e4.3`)
 * recebe `DoCliente` já parseado e não revalida forma.
 *
 * Puro: sem socket, DOM, relógio de parede, aleatoriedade ou I/O. Importa só TIPOS, de
 * `net/protocolo.ts`, `sim/types.ts` e `match/types.ts` (§2.2), mais um único VALOR, `VERSAO_DO_FIO` de
 * `net/protocolo.ts` (`e4.9`, §11.6.1) — a seta continua `net/ → net/`. Nenhum tipo paralelo ao
 * `Snapshot`: a tupla é codificação de fio, e fora do fio só existe o objeto com nomes.
 */

// ================================================================== ENTRADA — parseDoCliente

/**
 * Listas FECHADAS, escritas por extenso e não derivadas do tipo (E40-INF-004). O `satisfies` é o que
 * impede a lista de envelhecer em silêncio: uma variante nova de `DoCliente['t']`, um slot novo em
 * `Command['slot']` (`sim/types.ts`) ou uma decisão nova em `Decisao['t']` vira erro de compilação
 * AQUI — que é o "ato deliberado" do AC 10 de `e4.0`. E uma entrada a mais, que o tipo não tem, também.
 */
const T_DO_CLIENTE = { entrar: true, decisao: true, cast: true, pong: true } as const satisfies Record<
  DoCliente['t'],
  true
>
const SLOTS = { ability: true, ult: true } as const satisfies Record<Command['slot'], true>
const T_DECISAO = {
  draft: true,
  build: true,
  buildPadrao: true,
  compra: true,
  trocaDeBuild: true,
  pronto: true,
} as const satisfies Record<Decisao['t'], true>

type Objeto = Record<string, unknown>

/** Objeto não-nulo e não-array — a forma de fora de toda mensagem e de `decisao.d`. */
function objeto(v: unknown): v is Objeto {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Lê só propriedade PRÓPRIA: nada herdado do protótipo entra como campo da mensagem. */
function campo(o: Objeto, k: string): unknown {
  return Object.hasOwn(o, k) ? o[k] : undefined
}

function naLista<K extends string>(lista: Record<K, true>, v: unknown): v is K {
  return typeof v === 'string' && Object.hasOwn(lista, v)
}

/** Número de verdade: `NaN`, `±Infinity` (que `JSON.parse('1e999')` produz) e `"1"` ficam de fora. */
function finito(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** Exatamente `0` ou `1` — recusa `2`, `0.5`, `"0"`, `true`. Devolve o literal, normalizando `-0`. */
function bit(v: unknown): 0 | 1 | null {
  return v === 0 ? 0 : v === 1 ? 1 : null
}

/**
 * `decisao.d`, reconstruído variante a variante de `Decisao` (`match/types.ts`). Confere FORMA; a
 * LEGALIDADE (vez, pool, ouro, prontos) é de `aplicar()` e não é reimplementada aqui.
 */
function parseDecisao(raw: unknown): Decisao | null {
  if (!objeto(raw)) return null
  const t = campo(raw, 't')
  if (!naLista(T_DECISAO, t)) return null
  const jogador = bit(campo(raw, 'jogador'))
  if (jogador === null) return null

  switch (t) {
    case 'draft': {
      const charId = campo(raw, 'charId')
      return typeof charId === 'string' ? { t, jogador, charId } : null
    }
    case 'build':
    case 'trocaDeBuild': {
      const slot = bit(campo(raw, 'slot'))
      const abilityIndex = bit(campo(raw, 'abilityIndex'))
      const passiveIndex = bit(campo(raw, 'passiveIndex'))
      if (slot === null || abilityIndex === null || passiveIndex === null) return null
      return { t, jogador, slot, abilityIndex, passiveIndex }
    }
    case 'compra': {
      const slot = bit(campo(raw, 'slot'))
      const itemId = campo(raw, 'itemId')
      if (slot === null || typeof itemId !== 'string') return null
      return { t, jogador, slot, itemId }
    }
    case 'buildPadrao':
    case 'pronto':
      return { t, jogador }
    default: {
      const nenhuma: never = t
      return nenhuma
    }
  }
}

/**
 * Fecha o fio de ENTRADA em runtime (AC 4 de `e4.8`, E40-SEC-001). Devolve `null` para qualquer coisa
 * que não seja exatamente uma variante de `DoCliente`.
 *
 * **Reconstrução, não aprovação:** o retorno é SEMPRE um objeto novo, montado só com os campos
 * conhecidos da variante — nunca `raw` devolvido, espalhado ou convertido por cast. Por isso `tick` e
 * qualquer campo extra somem por construção: é descarte, não recusa, e o carimbo do tick pelo servidor
 * (`tickAtual + ATRASO_ALVO_TICKS`, §4.1) continua sendo o único dono do tick.
 */
export function parseDoCliente(raw: unknown): DoCliente | null {
  if (!objeto(raw)) return null
  const t = campo(raw, 't')
  if (!naLista(T_DO_CLIENTE, t)) return null

  switch (t) {
    case 'entrar': {
      const sala = campo(raw, 'sala')
      if (typeof sala !== 'string') return null
      const assento = campo(raw, 'assento')
      if (assento === undefined) return { t, sala }
      return typeof assento === 'string' ? { t, sala, assento } : null
    }
    case 'decisao': {
      const d = parseDecisao(campo(raw, 'd'))
      return d === null ? null : { t, d }
    }
    case 'cast': {
      const ballIndex = bit(campo(raw, 'ballIndex'))
      const slot = campo(raw, 'slot')
      const dx = campo(raw, 'dx')
      const dy = campo(raw, 'dy')
      const mag = campo(raw, 'mag')
      if (ballIndex === null || !naLista(SLOTS, slot) || !finito(dx) || !finito(dy) || !finito(mag)) return null
      return { t, ballIndex, slot, dx, dy, mag }
    }
    case 'pong': {
      const id = campo(raw, 'id')
      return finito(id) ? { t, id } : null
    }
    default: {
      const nenhuma: never = t
      return nenhuma
    }
  }
}

// ============================================================= SAÍDA — o {t:'snap'} em tupla

/**
 * ⚠️ LAYOUT DA TUPLA DO `{t:'snap'}` — o ÚNICO lugar onde ele é declarado (`architecture-e4.md` §5.5).
 * Codificador e decodificador abaixo leem daqui, posição a posição; o `tsc` confere a aridade dos dois
 * lados contra estes tipos, e o decodificador LANÇA em runtime se a aridade recebida divergir.
 *
 * **Mudar este layout é mudança de PROTOCOLO (§11.6), revisada como tal — nunca refatoração** — e sobe
 * `VERSAO_DO_FIO` (`net/protocolo.ts`). Lançar em aridade divergente cobre acréscimo e remoção de campo;
 * NÃO cobre reordenar dois campos do mesmo tipo. Quem cobre é a §11.6.1: a versão é conferida no
 * `{t:'sala'}`, o primeiro envio de toda conexão assentada, antes de qualquer `{t:'snap'}` chegar
 * (`DescompassoDeVersao`, abaixo); e a fixture congelada do fio (`debt.12`) trava o layout desde a
 * versão 1.
 *
 * Regras de quantização (tabela da §5.5, passo `q = 0,01`), marcadas em cada posição:
 * - `[rep]` repassado: `net/snapshot.ts` já quantizou (0,01 px / 0,001 rad);
 * - `[q]` arredondado a `q` — nenhum predicado de exibição depende dele no limiar;
 * - `[piso]` piso a `q` — nunca arredonda para cima;
 * - `[rest]` restante, não absoluto: `max(0, teto_q(abilityReadyAt − time))`;
 * - `[0/1]` booleano; `[lit]` literal, sem transformação.
 */
type TuplaSnap = [
  /** 0 `time` [q] — ms da rodada */
  time: number,
  /** 1 `over` [0/1] */
  over: 0 | 1,
  /** 2 `winner` [lit] */
  winner: Snapshot['winner'],
  /** 3 `arena.w` [lit] */
  arenaW: number,
  /** 4 `arena.h` [lit] */
  arenaH: number,
  /** 5 `arena.pad` [q] — cresce na morte súbita */
  arenaPad: number,
  /** 6 bolas, uma `TuplaBola` cada, na ordem do snapshot */
  balls: TuplaBola[],
  /** 7 projéteis, uma `TuplaProjetil` cada */
  projectiles: TuplaProjetil[],
  /** 8 zonas, uma `TuplaZona` cada */
  zones: TuplaZona[],
  /** 9 `events` [lit] — `SimEvent` com nomes, sem arredondar: é o que mais se depura (§5.5) */
  events: SimEvent[],
]

type TuplaBola = [
  /** 0 `id` [lit] */
  id: number,
  /** 1 `x` [rep] */
  x: number,
  /** 2 `y` [rep] */
  y: number,
  /** 3 `facing` [rep] */
  facing: number,
  /** 4 `hp` [q] */
  hp: number,
  /** 5 `alive` [0/1] */
  alive: 0 | 1,
  /**
   * 6 `ultCharge` [piso]. Com `ultThreshold` múltiplo de `q` (tripwire do roster na guarda),
   * `u' ≥ thr ⇔ u ≥ thr`: arredondar para cima acenderia a ult antes da hora.
   */
  ultCharge: number,
  /**
   * 7 `abilityReadyAt` [rest]. O decodificador devolve `time' + restante`, e
   * `time' ≥ time' + r' ⇔ r' ≤ 0 ⇔ time ≥ abilityReadyAt` para QUALQUER `time'` — a prontidão não
   * depende de `time` chegar exato.
   */
  restanteHabilidade: number,
  /** 8 `effects[].kind` [lit] — só o `kind`, que é o que o render lê */
  effects: EffectKind[],
]

type TuplaProjetil = [
  /** 0 `id` [lit] */
  id: number,
  /** 1 `x` [rep] */
  x: number,
  /** 2 `y` [rep] */
  y: number,
  /** 3 `vx` [q] */
  vx: number,
  /** 4 `vy` [q] */
  vy: number,
  /** 5 `radius` [q] */
  radius: number,
  /** 6 `color` [lit] */
  color: string,
]

type TuplaZona = [
  /** 0 `id` [lit] */
  id: number,
  /** 1 `kind` [lit] */
  kind: Snapshot['zones'][number]['kind'],
  /** 2 `x` [rep] */
  x: number,
  /** 3 `y` [rep] */
  y: number,
  /** 4 `angle` [rep] */
  angle: number,
  /** 5 `halfLen` [q] */
  halfLen: number,
  /** 6 `radius` [q] */
  radius: number,
  /** 7 `pull` [q] */
  pull: number,
  /** 8 `ownerColor` [lit] */
  ownerColor: string,
]

/** Aridades em runtime, amarradas aos tipos acima: se um lado mudar sem o outro, o `tsc` reprova. */
const ARIDADE_SNAP: TuplaSnap['length'] = 10
const ARIDADE_BOLA: TuplaBola['length'] = 9
const ARIDADE_PROJETIL: TuplaProjetil['length'] = 7
const ARIDADE_ZONA: TuplaZona['length'] = 9

/** O passo `q` da §5.5, como inteiro `1/q`: multiplicar e dividir por inteiro dá o decimal curto. */
const K = 100

/** `[q]` — arredonda ao múltiplo de `q` mais próximo (mesma forma de `quantizar` em `snapshot.ts`). */
function q(v: number): number {
  return Math.round(v * K) / K
}

/**
 * `[piso]` — o maior `k / K` que não passa de `v`. Os dois ajustes cobrem o erro de ponto flutuante de
 * `v * K`: se ele arredonda para CIMA até um inteiro, `k / K` sairia acima de `v` e acenderia a ult um
 * ulp antes; se arredonda para BAIXO (`110.07 * 100 = 11006.999…`), a ult cheia exatamente no limiar
 * sairia um passo abaixo dele e apagaria. Com os dois, `pisoQ(thr) === thr` para todo `thr` múltiplo
 * de `q` — que é a condição que a tripwire do roster confere.
 */
function pisoQ(v: number): number {
  let k = Math.floor(v * K)
  if (k / K > v) k -= 1
  else if ((k + 1) / K <= v) k += 1
  return k / K
}

/** `teto_q` — o menor `k / K` que não fica abaixo de `v` (mesmos ajustes, no sentido oposto). */
function tetoQ(v: number): number {
  let k = Math.ceil(v * K)
  if (k / K < v) k += 1
  else if ((k - 1) / K >= v) k -= 1
  return k / K
}

function snapParaTupla(s: Snapshot): TuplaSnap {
  return [
    q(s.time),
    s.over ? 1 : 0,
    s.winner,
    s.arena.w,
    s.arena.h,
    q(s.arena.pad),
    s.balls.map((b): TuplaBola => [
      b.id,
      b.x,
      b.y,
      b.facing,
      q(b.hp),
      b.alive ? 1 : 0,
      pisoQ(b.ultCharge),
      Math.max(0, tetoQ(b.abilityReadyAt - s.time)),
      b.effects.map((e) => e.kind),
    ]),
    s.projectiles.map((p): TuplaProjetil => [p.id, p.x, p.y, q(p.vx), q(p.vy), q(p.radius), p.color]),
    s.zones.map((z): TuplaZona => [z.id, z.kind, z.x, z.y, z.angle, q(z.halfLen), q(z.radius), q(z.pull), z.ownerColor]),
    s.events,
  ]
}

/** Lança se `v` não for array com exatamente `aridade` posições — acréscimo ou remoção de campo. */
function tupla(v: unknown, aridade: number, oQue: string): unknown[] {
  if (!Array.isArray(v) || v.length !== aridade) {
    const obtido = Array.isArray(v) ? `aridade ${v.length}` : typeof v
    throw new Error(
      `decodificarDoServidor: ${oQue} com ${obtido}, o layout declara ${aridade} — descompasso de versão ` +
        'do protocolo entre servidor e cliente (architecture-e4.md §11.6)',
    )
  }
  return v
}

function lista(v: unknown, oQue: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`decodificarDoServidor: ${oQue} não é lista`)
  return v
}

function tuplaParaSnap(v: unknown): Snapshot {
  const t = tupla(v, ARIDADE_SNAP, 'snap.s') as TuplaSnap
  const time = t[0]
  return {
    time,
    over: t[1] === 1,
    winner: t[2],
    arena: { w: t[3], h: t[4], pad: t[5] },
    balls: lista(t[6], 'snap.s[6] (bolas)').map((x, i) => {
      const b = tupla(x, ARIDADE_BOLA, `bola ${i}`) as TuplaBola
      return {
        id: b[0],
        x: b[1],
        y: b[2],
        facing: b[3],
        hp: b[4],
        alive: b[5] === 1,
        ultCharge: b[6],
        abilityReadyAt: time + b[7],
        effects: lista(b[8], `bola ${i} effects`).map((kind) => ({ kind: kind as EffectKind })),
      }
    }),
    projectiles: lista(t[7], 'snap.s[7] (projéteis)').map((x, i) => {
      const p = tupla(x, ARIDADE_PROJETIL, `projétil ${i}`) as TuplaProjetil
      return { id: p[0], x: p[1], y: p[2], vx: p[3], vy: p[4], radius: p[5], color: p[6] }
    }),
    zones: lista(t[8], 'snap.s[8] (zonas)').map((x, i) => {
      const z = tupla(x, ARIDADE_ZONA, `zona ${i}`) as TuplaZona
      return {
        id: z[0],
        kind: z[1],
        x: z[2],
        y: z[3],
        angle: z[4],
        halfLen: z[5],
        radius: z[6],
        pull: z[7],
        ownerColor: z[8],
      }
    }),
    events: lista(t[9], 'snap.s[9] (events)') as SimEvent[],
  }
}

/** Lista fechada de `DoServidor['t']`, pelo mesmo mecanismo de `T_DO_CLIENTE`. */
const T_DO_SERVIDOR = {
  sala: true,
  visao: true,
  prazo: true,
  rodadaInicio: true,
  snap: true,
  rodadaFim: true,
  erro: true,
  ping: true,
  evento: true,
} as const satisfies Record<DoServidor['t'], true>

/**
 * §11.6.1 (`e4.9`, AC 7 a) — o `{t:'sala'}` chegou com `versao` diferente de `VERSAO_DO_FIO`. As duas
 * versões vão em CAMPOS, não só no texto, para o cliente escolher o remédio sem parsear a mensagem:
 * servidor mais novo é aba velha ("recarregue"); cliente mais novo é o Pages na frente do servidor
 * ("aguarde o servidor"), inclusive quando `servidor` é `undefined` (servidor de antes da versão).
 *
 * `servidor` é o valor do fio tal e qual (`2`, `"1"`, `undefined`), e a propriedade existe mesmo quando
 * vale `undefined`. Campos declarados no corpo e atribuídos no construtor, **sem** parameter
 * properties: o `node` do `sim:check` roda em modo strip-only e recusa essa sintaxe
 * (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`), e o `tsc` deste projeto não acusa.
 */
export class DescompassoDeVersao extends Error {
  readonly servidor: unknown
  readonly cliente: number

  constructor(servidor: unknown, cliente: number) {
    super(
      `decodificarDoServidor: versão do fio ${String(servidor)} no servidor, ${cliente} neste cliente — ` +
        'descompasso (architecture-e4.md §11.6.1)',
    )
    this.name = 'DescompassoDeVersao'
    this.servidor = servidor
    this.cliente = cliente
  }
}

/**
 * As três checagens do `{t:'sala'}` (`e4.9`, AC 7). **A versão vem PRIMEIRO** (AC 7 d): um servidor de
 * antes da versão manda `{t:'sala', jogador, estado}`, sem os três campos, e tem de cair em
 * `DescompassoDeVersao`, não num erro genérico; com versão diferente, os outros campos não têm
 * significado conhecido e não são lidos. Os erros de `snapshotHz` e `assento` NÃO são
 * `DescompassoDeVersao`: com a versão certa, o problema não é de build.
 */
function conferirSala(m: Objeto): void {
  const versao = campo(m, 'versao')
  if (versao !== VERSAO_DO_FIO) throw new DescompassoDeVersao(versao, VERSAO_DO_FIO)
  const hz = campo(m, 'snapshotHz')
  if (!(typeof hz === 'number' && Number.isInteger(hz) && hz > 0 && 60 % hz === 0)) {
    throw new Error(
      `decodificarDoServidor: {t:'sala'} com snapshotHz ${JSON.stringify(hz)} — tem de ser inteiro positivo divisor de 60`,
    )
  }
  const assento = campo(m, 'assento')
  if (typeof assento !== 'string' || assento === '') {
    throw new Error("decodificarDoServidor: {t:'sala'} sem assento (string não vazia)")
  }
}

/**
 * SERVIDOR → texto do fio (`architecture-e4.md` §5.5). O `{t:'snap'}` sai como
 * `{"t":"snap","seq":n,"s":[…tupla…]}` — envelope com nomes, identificável no devtools por `t` e `seq`;
 * toda outra variante sai como JSON com nomes, tal e qual.
 */
export function codificarDoServidor(msg: DoServidor): string {
  if (msg.t === 'snap') return JSON.stringify({ t: msg.t, seq: msg.seq, s: snapParaTupla(msg.s) })
  return JSON.stringify(msg)
}

/**
 * Texto do fio → SERVIDOR. Reconstrói o `Snapshot` de `net/protocolo.ts` a partir da tupla (com
 * `abilityReadyAt = time' + restante`) e devolve as demais variantes como vieram. **Lança** se a
 * aridade de qualquer tupla divergir do LAYOUT, e se a mensagem não tiver um `t` do vocabulário: um
 * cliente com versão diferente do servidor tem de falhar alto, não desenhar lixo. No `{t:'sala'}`,
 * lança `DescompassoDeVersao` se `versao` divergir de `VERSAO_DO_FIO`, e erro comum se `snapshotHz` ou
 * `assento` vierem fora de forma (`conferirSala`, §11.6.1).
 */
export function decodificarDoServidor(texto: string): DoServidor {
  const m: unknown = JSON.parse(texto)
  const t = objeto(m) ? campo(m, 't') : undefined
  if (!objeto(m) || !naLista(T_DO_SERVIDOR, t)) {
    throw new Error('decodificarDoServidor: mensagem sem `t` do vocabulário de DoServidor')
  }
  if (t === 'snap') return { t, seq: campo(m, 'seq') as number, s: tuplaParaSnap(campo(m, 's')) }
  if (t === 'sala') conferirSala(m)
  return m as DoServidor
}
