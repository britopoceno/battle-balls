import { createWorld, step, TICK_HZ } from '../sim/world.ts'
import type { CharDef, Command, World, WorldView } from '../sim/types.ts'
import {
  aplicar,
  criarPartida,
  ladosDaRodada,
  registrarRodada,
  setupDaRodada,
  vencedorDaRodada,
  visaoPara,
  type Controle,
  type Decisao,
  type EstadoPartida,
  type EventoPartida,
  type Jogador,
  type ResultadoRodada,
} from '../match/index.ts'
import { ATRASO_ALVO_TICKS, SNAPSHOT_HZ, VERSAO_DO_FIO, type DoCliente, type DoServidor } from './protocolo.ts'
import { criarProdutorDeSnapshot, estaticoDaRodada, type ProdutorDeSnapshot } from './snapshot.ts'

/**
 * A SALA — a máquina de estados de uma partida 1v1 em rede (`docs/architecture-e4.md` §3.2, passo 3
 * de §10, story `e4.3`): assentos, fases da sala, a partida de `match/`, a rodada em curso, o carimbo
 * de input, a cadência de snapshot e o relógio de RF-04.
 *
 * **PURA, com o relógio injetado.** `passo(sala, agora, entrada)` recebe o tempo como parâmetro e
 * devolve o que enviar a quem como DADO (`envios`), nunca como efeito. Nada aqui conhece socket,
 * DOM, relógio de parede, aleatoriedade ou I/O. Quem escreve no socket é `server/` (`e4.4`); no
 * `sim:check`, é a guarda da Bo5 em `tools/determinism.ts`. É isso que deixa a partida 1v1 inteira
 * testável sem rede — o mesmo dividendo de `sim/`, `bot/` e `match/`, um nível acima.
 *
 * **A SALA NÃO ACRESCENTA REGRA DE JOGO.** Ela só troca QUEM chama `match/` (§3.3): `criarPartida`,
 * `aplicar`, `visaoPara` (uma vez por assento), `setupDaRodada` + `createWorld` + `step`, e
 * `registrarRodada`. Toda decisão ilegal é recusada por `aplicar()`, e a sala só a devolve como
 * `{t:'erro'}` a quem a mandou. A prova de que a tabela de §3.3 foi seguida é a guarda do AC 11: uma
 * Bo5 conduzida só por `passo()` dá o mesmo placar, os mesmos vencedores e os mesmos hashes de
 * rodada que o caminho headless de `tools/partida.ts`.
 *
 * O que a sala acrescenta é TRANSPORTE, e só isto:
 *  - **assento → jogador → lado** (§8.1, a única linha de anti-cheat da fase): `ballIndex` vira
 *    `ballId` pelo lado que `ladosDaRodada` deu ao jogador NESTA rodada (jogador ≠ lado), e
 *    `{t:'decisao'}` com `d.jogador` alheio é recusada antes de chegar a `aplicar()`;
 *  - **o carimbo** (§4.1): `tick = tickAtual + ATRASO_ALVO_TICKS`, onde `tickAtual` é o tick que o
 *    próximo `step` vai simular. Nenhum caminho aceita tick vindo do cliente — `{t:'cast'}` nem tem
 *    o campo;
 *  - **o relógio de RF-04** (§3.4): o prazo da fase `builds` corre aqui, e o estouro vira a decisão
 *    `{t:'buildPadrao'}`, passada a `aplicar()` como qualquer outra;
 *  - **a cadência** (§5.2, §5.6): um `ProdutorDeSnapshot` por rodada, `observar` depois de CADA
 *    `step`, `{t:'snap'}` a cada `60 / snapshotHz` ticks e um `snap` final no tick de término, antes
 *    do `{t:'rodadaFim'}`;
 *  - **o mecanismo de R-02** (desconexão), parametrizado — ver `POLITICA_DE_DESCONEXAO_PROVISORIA`.
 *
 * DIREÇÃO DAS SETAS (§2.2): `net/sala.ts → sim/, match/, net/protocolo.ts, net/snapshot.ts`. Nunca
 * `client/`, `tools/`, `chars/`, `bot/`, nem o parser/serializador do fio (`e4.8`): a sala recebe
 * `DoCliente` já parseado e devolve `DoServidor` como objeto; quem parseia e serializa é a fronteira.
 * O que mora em `tools/` e a sala precisa — o `hash` da rodada — entra INJETADO (`OpcoesDaSala`), pela
 * mesma porta do roster (`Record<string, CharDef>`), que é a de `createWorld` e de `criarPartida`.
 *
 * ESTADO: `passo()` devolve uma `Sala` nova no nível de cima (assentos, fase, partida, logs), mas a
 * rodada em curso é MUTÁVEL por natureza — `step()` muta o `World` no lugar, e copiar o mundo a cada
 * tick seria o caminho quente que `architecture.md` §7.1 proíbe. Trate a `Sala` de entrada como
 * consumida: depois de `passo(s, …)`, use só a `sala` devolvida.
 */

// --------------------------------------------------------------------------- R-02 (provisório)

/**
 * ⚠️ PROVISÓRIO — R-02 (`architecture-e4.md` §12). **Nenhuma política de desconexão foi decidida.** A
 * decisão é do @pm, entre quatro opções com custos diferentes (W.O., pausa com prazo, bot assume,
 * anula a partida). Esta story entrega o MECANISMO — detecção de assento vago, prazo e transições —
 * e o default abaixo é a RECOMENDAÇÃO de §12/R-02, não uma escolha: *pausa com prazo curto, W.O. no
 * estouro*. O `prazoMs` também não foi medido; é um ponto de partida para existir o que medir.
 *
 * A marcação é ESTRUTURAL, no padrão de `chars/tuning.ts` e `match/economia.ts`: a política mora
 * AQUI, num lugar só, e nada a lê senão através de `ConfigDaSala.desconexao`. Trocá-la é trocar este
 * objeto (ou passar outro na configuração da sala, vindo de `server/main.ts`), nunca editar o fluxo.
 *
 * Semântica, por fase da partida, quando o prazo estoura com um assento ainda vago:
 *  - `'wo'` — o ausente perde **o passo em curso** e nada além dele: na fase `rodada`, perde a
 *    rodada (registrada por `registrarRodada` com o presente como vencedor, e com o hash e os ticks do
 *    mundo no instante do estouro); na `builds`, recebe `{t:'buildPadrao'}` (a decisão que o próprio
 *    RF-04 já produz no estouro do relógio); na `loja`, recebe `{t:'pronto'}`. Se continuar ausente,
 *    um novo prazo começa, e o próximo estouro vale para o próximo passo. Assim a partida sempre
 *    termina, e termina pelas regras de `match/` (Bo5, D-02), não por uma regra nova da sala.
 *  - `'anular'` — a sala encerra sem registrar mais nada. **É a opção que §12/R-02 marca como
 *    incentivo perverso** (quem está perdendo ganha motivo para derrubar a própria rede); existe como
 *    valor possível do campo, não como recomendação.
 *  - Os dois assentos vagos no estouro: não há a quem dar o W.O., e a sala encerra.
 *  - "Bot assume" **não é representável aqui**: exigiria importar `bot/`, que o AC 14 proíbe. Se o
 *    @pm escolher essa opção, a política do bot entra injetada, como o `hash`, e isso é story própria.
 *
 * Durante a pausa o que congela é só a SIMULAÇÃO da rodada (o mundo não avança). O relógio de RF-04
 * da fase `builds` continua correndo: ele já resolve sozinho o jogador que não responde, que é o
 * motivo de existir (§3.4).
 *
 * Fora do escopo desta política, e decidido por §6: desconexão ANTES DO INÍCIO (sala `aguardando`, ou
 * `jogando` ainda no draft) libera o assento e devolve a sala a `aguardando`, com a partida recriada.
 */
export const POLITICA_DE_DESCONEXAO_PROVISORIA: PoliticaDeDesconexao = {
  prazoMs: 20_000,
  noEstouro: 'wo',
}

export interface PoliticaDeDesconexao {
  /** quanto a sala espera o assento vago voltar antes de aplicar `noEstouro`. `0` = W.O. imediato */
  prazoMs: number
  noEstouro: 'wo' | 'anular'
}

// --------------------------------------------------------------------------- configuração

/**
 * A configuração de uma sala: os levers de operação, num lugar só. `server/main.ts` (`e4.4`/`e4.7`)
 * sobrescreve o que precisar na criação, sem editar este arquivo.
 */
export interface ConfigDaSala {
  /**
   * AC 10 (v1.6.0, decisão O-1) — a taxa EFETIVA de snapshots. A cadência é `TICK_HZ / snapshotHz`
   * ticks, e todo `{t:'sala'}` leva este mesmo valor, para o cliente dimensionar o buffer (`e4.5`/AC 7).
   * É a porta do override de operação de `e4.7`/AC 4. Precisa ser inteiro positivo divisor de 60.
   */
  snapshotHz: number
  /** RF-04 — o prazo da fase `builds`, em ms do relógio injetado (30 s, o mesmo do modo local) */
  prazoDeBuildsMs: number
  /**
   * Teto de ticks de uma rodada (AC 10: a rodada termina em `world.over` ou no teto). **Tem de ser o
   * `MAX_ROUND_TICKS` de `tools/harness.ts`**, senão a sala e o arnês jogariam rodadas de comprimento
   * máximo diferente. A sala não pode importar `tools/` (§2.2), então o valor é repetido aqui, e a
   * guarda do `sim:check` confere a igualdade — é tripwire, não confiança.
   */
  tetoDeTicks: number
  /** AC 13 — R-02, ver `POLITICA_DE_DESCONEXAO_PROVISORIA` */
  desconexao: PoliticaDeDesconexao
}

export const CONFIG_PADRAO_DA_SALA: ConfigDaSala = {
  snapshotHz: SNAPSHOT_HZ,
  prazoDeBuildsMs: 30_000,
  tetoDeTicks: 180 * TICK_HZ,
  desconexao: POLITICA_DE_DESCONEXAO_PROVISORIA,
}

/** O que a sala recebe na criação. As três últimas entradas são INJEÇÕES (§2.2), não configuração. */
export interface OpcoesDaSala {
  id: string
  /** seed-mãe da partida — vem do servidor, de stream próprio (§3.3), nunca do cliente */
  seed: number
  /** o roster do draft, como em `criarPartida` */
  pool: string[]
  /** o roster, injetado pela mesma porta de `createWorld` — `net/` não importa `chars/` */
  chars: Record<string, CharDef>
  /**
   * O hash da rodada, que `registrarRodada` guarda como `string`. A definição única é `hash()` de
   * `tools/harness.ts` (`match/types.ts` explica por que ele não mora em `match/`), e a sala não pode
   * importar `tools/`. Injetado, com a mesma assinatura: o AC 11 compara os hashes da sala com os do
   * arnês, e só bate se for a MESMA função.
   */
  hashDoMundo: (w: WorldView) => string
  config?: Partial<ConfigDaSala>
}

// --------------------------------------------------------------------------- forma

/** fase da SALA (§6), que não é a fase da partida: `aguardando ──▶ jogando ──▶ encerrada` */
export type FaseDaSala = Extract<DoServidor, { t: 'sala' }>['estado']

/** A rodada em curso. Existe só enquanto `partida.fase === 'rodada'`. */
export interface RodadaEmCurso {
  /** a ÚNICA instância de `World` desta rodada (§3.1) — mutada por `step` */
  world: World
  /** AC 10 — um por rodada, criado junto com o mundo; nunca reusado entre rodadas (M-1 de `e4.2`) */
  produtor: ProdutorDeSnapshot
  /** comandos já carimbados, esperando o tick deles, na ordem de chegada */
  pendentes: Command[]
  /** `seq` do próximo `{t:'snap'}` desta rodada, a partir de 0 */
  seq: number
  /** `agora` em que o tick 0 começou, deslocado pela duração de cada pausa */
  inicioMs: number
  /** `ladosDaRodada` desta rodada: índice = jogador, valor = time (§5.3 de E3) */
  lados: [0 | 1, 0 | 1]
  seedDaRodada: number
}

export interface Sala {
  readonly id: string
  fase: FaseDaSala
  readonly config: ConfigDaSala
  partida: EstadoPartida
  /**
   * chave de cada assento, índice = jogador. A chave é a mesma string que endereça os `envios` e que
   * vai no campo `assento` do `{t:'sala'}` — o `e4.4` usa o segredo de assento como chave (§11.6.1).
   * `match/` nunca vê isto (§2.2: nem um campo novo em `EstadoPartida`).
   */
  assentos: [string | null, string | null]
  /** assento ocupado com conexão viva. Ocupado e desconectado é o assento vago de R-02 */
  conectados: [boolean, boolean]
  rodada: RodadaEmCurso | null
  /** `agora` em que o prazo de RF-04 estoura; `null` fora da fase `builds` */
  prazoDeBuilds: number | null
  /** R-02: desde quando há assento vago com a sala `jogando`; `null` sem pausa */
  pausa: { desde: number } | null
  /** toda `Decisao` passada a `aplicar()`, aceita ou recusada, na ordem — inclusive as que a sala produz */
  decisoes: Decisao[]
  /** a telemetria que `match/` emite (§10.1 de E3) — `rodadaFim` sai com o `controle` real (AC 12) */
  eventos: EventoPartida[]
  readonly injetado: Readonly<Pick<OpcoesDaSala, 'seed' | 'pool' | 'chars' | 'hashDoMundo'>>
}

/**
 * O que chega à sala, sempre casado com o ASSENTO de origem (a chave). Duas portas:
 *  - `msg` — uma `DoCliente` já passada por `parseDoCliente` na fronteira (`e4.4`/AC 15);
 *  - `conexao` — o assentamento e a queda (`e4.4`/AC 7 e AC 14). Chegam pela MESMA porta, de
 *    propósito (AC 11 e): quem decide que uma conexão virou assento é a fronteira, que conhece o
 *    segredo; a sala só registra e responde.
 */
export type EntradaDaSala =
  | { assento: string; msg: DoCliente }
  | { assento: string; conexao: 'assentou' | 'caiu' }

export interface Envio {
  /** a chave do assento de destino. Toda mensagem é endereçada a UM assento; não existe broadcast */
  assento: string
  msg: DoServidor
}

export interface ResultadoDoPasso {
  sala: Sala
  /** na ordem em que `server/` deve escrevê-los (`e4.4`/AC 15 e 16) */
  envios: Envio[]
}

/**
 * AC 12 — quem está no controle de cada JOGADOR numa sala 1v1: um humano por assento. Passado
 * EXPLICITAMENTE a `registrarRodada`, cujo default `['bot','bot']` excluiria a rodada da mediana de
 * P3.1 (§10.1 de E3).
 */
const CONTROLE_1V1: [Controle, Controle] = ['humano', 'humano']

const JOGADORES: readonly Jogador[] = [0, 1]

// --------------------------------------------------------------------------- construção

export function criarSala(o: OpcoesDaSala): Sala {
  const config: ConfigDaSala = { ...CONFIG_PADRAO_DA_SALA, ...o.config }
  const hz = config.snapshotHz
  if (!Number.isInteger(hz) || hz <= 0 || TICK_HZ % hz !== 0) {
    throw new Error(
      `criarSala: snapshotHz ${hz} inválido — precisa ser inteiro positivo divisor de ${TICK_HZ}, porque a ` +
        `cadência é ${TICK_HZ} / snapshotHz ticks (AC 10)`,
    )
  }
  if (!Number.isInteger(config.tetoDeTicks) || config.tetoDeTicks <= 0) {
    throw new Error(`criarSala: tetoDeTicks ${config.tetoDeTicks} precisa ser inteiro positivo`)
  }
  if (!(config.prazoDeBuildsMs >= 0) || !Number.isFinite(config.prazoDeBuildsMs)) {
    throw new Error(`criarSala: prazoDeBuildsMs ${config.prazoDeBuildsMs} precisa ser finito e >= 0`)
  }
  if (!(config.desconexao.prazoMs >= 0) || !Number.isFinite(config.desconexao.prazoMs)) {
    throw new Error(`criarSala: desconexao.prazoMs ${config.desconexao.prazoMs} precisa ser finito e >= 0`)
  }
  return {
    id: o.id,
    fase: 'aguardando',
    config,
    partida: criarPartida({ seed: o.seed, pool: o.pool }),
    assentos: [null, null],
    conectados: [false, false],
    rodada: null,
    prazoDeBuilds: null,
    pausa: null,
    decisoes: [],
    eventos: [],
    injetado: { seed: o.seed, pool: [...o.pool], chars: o.chars, hashDoMundo: o.hashDoMundo },
  }
}

// --------------------------------------------------------------------------- o passo

/**
 * Um passo de sala (§3.2). `agora` ENTRA — a sala não o busca. Primeiro as entradas, na ordem
 * recebida (é nessa ordem que os casts são carimbados, todos com o tick corrente); depois o tempo:
 * estouro de pausa, estouro do prazo de RF-04 e os ticks da rodada devidos até `agora`, quantos
 * forem — um `passo()` pode avançar vários ticks, e cada um é observado pelo produtor.
 */
export function passo(s: Sala, agora: number, entrada: EntradaDaSala[]): ResultadoDoPasso {
  if (!Number.isFinite(agora)) throw new Error(`passo: agora ${agora} não é finito`)
  const n: Sala = {
    ...s,
    assentos: [s.assentos[0], s.assentos[1]],
    conectados: [s.conectados[0], s.conectados[1]],
    decisoes: [...s.decisoes],
    eventos: [...s.eventos],
  }
  const envios: Envio[] = []
  for (const e of entrada) {
    if ('conexao' in e) {
      if (e.conexao === 'assentou') assentar(n, e.assento, agora, envios)
      else cair(n, e.assento, agora, envios)
    } else {
      receber(n, e.assento, e.msg, agora, envios)
    }
  }
  avancar(n, agora, envios)
  return { sala: n, envios }
}

// --------------------------------------------------------------------------- envios

function jogadorDoAssento(n: Sala, chave: string): Jogador | null {
  if (n.assentos[0] === chave) return 0
  if (n.assentos[1] === chave) return 1
  return null
}

/** Os assentos ocupados COM conexão — assento vago não recebe nada; o reassentamento o ressincroniza. */
function paraCadaAssento(n: Sala, f: (j: Jogador, chave: string) => void): void {
  for (const j of JOGADORES) {
    const chave = n.assentos[j]
    if (chave !== null && n.conectados[j]) f(j, chave)
  }
}

/**
 * AC 11 (e) — um `{t:'sala'}` NOVO por assento, com o segredo do PRÓPRIO destinatário, a versão do
 * fio e a taxa efetiva. Nunca o mesmo objeto para os dois: um broadcast entregaria o segredo de um
 * jogador ao outro, e com ele o outro reassentaria no lugar dele (`e4.4`/AC 7).
 */
function msgSala(n: Sala, j: Jogador, chave: string): DoServidor {
  return { t: 'sala', versao: VERSAO_DO_FIO, jogador: j, estado: n.fase, assento: chave, snapshotHz: n.config.snapshotHz }
}

function enviarSala(n: Sala, envios: Envio[]): void {
  paraCadaAssento(n, (j, chave) => envios.push({ assento: chave, msg: msgSala(n, j, chave) }))
}

/** AC 8 — a projeção é POR ASSENTO: `visaoPara(estado, jogador)` de cada um, nunca uma visão só. */
function enviarVisao(n: Sala, envios: Envio[]): void {
  paraCadaAssento(n, (j, chave) => envios.push({ assento: chave, msg: { t: 'visao', v: visaoPara(n.partida, j) } }))
}

/** Mensagens sem segredo (o mundo é o mesmo para os dois), ainda assim endereçadas assento a assento. */
function enviarAosDois(n: Sala, envios: Envio[], msg: DoServidor): void {
  paraCadaAssento(n, (_, chave) => envios.push({ assento: chave, msg }))
}

function msgPrazo(n: Sala, agora: number): DoServidor {
  // `terminaEmMs` é o RESTANTE, não um instante: o relógio do cliente não é o do servidor, e um
  // instante absoluto obrigaria o cliente a sincronizar relógio para desenhar uma contagem (§3.4).
  return { t: 'prazo', terminaEmMs: Math.max(0, (n.prazoDeBuilds ?? agora) - agora) }
}

function erro(envios: Envio[], chave: string, motivo: string): void {
  envios.push({ assento: chave, msg: { t: 'erro', motivo } })
}

// --------------------------------------------------------------------------- assentos (AC 11 e, AC 13)

function assentar(n: Sala, chave: string, agora: number, envios: Envio[]): void {
  const ja = jogadorDoAssento(n, chave)
  if (ja !== null) {
    // Reassentamento (§6): o cliente não guarda autoridade, então voltar é só ressincronizar. O
    // `{t:'sala'}` vai PRIMEIRO, para a versão do fio ser conferida antes de qualquer outra coisa.
    n.conectados[ja] = true
    envios.push({ assento: chave, msg: msgSala(n, ja, chave) })
    if (n.fase === 'aguardando') return
    envios.push({ assento: chave, msg: { t: 'visao', v: visaoPara(n.partida, ja) } })
    if (n.partida.fase === 'builds' && n.prazoDeBuilds !== null) envios.push({ assento: chave, msg: msgPrazo(n, agora) })
    if (n.rodada !== null) {
      envios.push({ assento: chave, msg: { t: 'rodadaInicio', estatico: estaticoDaRodada(n.rodada.world) } })
    }
    if (n.pausa !== null && n.conectados[0] && n.conectados[1]) retomar(n, agora)
    return
  }

  const livre: Jogador | null = n.assentos[0] === null ? 0 : n.assentos[1] === null ? 1 : null
  if (n.fase !== 'aguardando' || livre === null) {
    erro(envios, chave, `sala ${n.fase === 'aguardando' ? 'cheia' : n.fase} — sem assento livre para esta conexão`)
    return
  }
  n.assentos[livre] = chave
  n.conectados[livre] = true
  if (n.assentos[0] !== null && n.assentos[1] !== null) n.fase = 'jogando'
  // o recém-assentado recebe o `{t:'sala'}` antes de qualquer outra mensagem, já com o estado novo
  envios.push({ assento: chave, msg: msgSala(n, livre, chave) })
  if (n.fase === 'jogando') {
    const outro: Jogador = livre === 0 ? 1 : 0
    const chaveOutro = n.assentos[outro]
    if (chaveOutro !== null && n.conectados[outro]) envios.push({ assento: chaveOutro, msg: msgSala(n, outro, chaveOutro) })
    enviarVisao(n, envios)
  }
}

function cair(n: Sala, chave: string, agora: number, envios: Envio[]): void {
  const j = jogadorDoAssento(n, chave)
  if (j === null || !n.conectados[j]) return
  n.conectados[j] = false
  if (n.fase === 'aguardando') {
    n.assentos[j] = null
    return
  }
  if (n.fase !== 'jogando') return
  if (n.partida.fase === 'draft') {
    // §6: "desconexão antes do início" devolve a sala a `aguardando`. O assento é liberado e a
    // partida recomeça do zero para quem sentar — um draft pela metade não pertence a outra pessoa.
    n.assentos[j] = null
    n.fase = 'aguardando'
    n.partida = criarPartida({ seed: n.injetado.seed, pool: n.injetado.pool })
    n.decisoes = []
    n.eventos = []
    n.pausa = null
    enviarSala(n, envios)
    return
  }
  if (n.pausa === null) n.pausa = { desde: agora }
}

/** Fim da pausa: a rodada retoma do tick em que parou, com o relógio dela deslocado pela duração da pausa. */
function retomar(n: Sala, agora: number): void {
  const p = n.pausa
  n.pausa = null
  if (p === null || n.rodada === null) return
  n.rodada.inicioMs += agora - Math.max(p.desde, n.rodada.inicioMs)
}

// --------------------------------------------------------------------------- mensagens (AC 5, 6, 7, 16)

function receber(n: Sala, chave: string, msg: DoCliente, agora: number, envios: Envio[]): void {
  switch (msg.t) {
    case 'pong':
      // RTT é do servidor (`e4.4`/AC 9); não é estado de sala
      return
    case 'entrar':
      erro(envios, chave, "{t:'entrar'} é tratado pela fronteira (e4.4/AC 7); a sala recebe o assentamento como conexão")
      return
    case 'decisao':
    case 'cast': {
      const j = jogadorDoAssento(n, chave)
      if (j === null) {
        erro(envios, chave, 'assento vazio: esta conexão não ocupa assento nesta sala')
        return
      }
      if (n.fase !== 'jogando') {
        erro(envios, chave, `a sala está ${n.fase}: {t:'${msg.t}'} só vale com a partida em curso`)
        return
      }
      if (msg.t === 'decisao') {
        // AC 16 — o AC 5 aplicado a decisões: `aplicar()` só confere se é a VEZ de `d.jogador`, e
        // confiaria numa decisão de forma perfeita em nome do outro jogador.
        if (msg.d.jogador !== j) {
          erro(envios, chave, `decisão em nome do jogador ${msg.d.jogador} vinda do assento do jogador ${j} — recusada`)
          return
        }
        decidir(n, msg.d, agora, envios, chave)
        return
      }
      castar(n, j, chave, msg, envios)
      return
    }
    default: {
      const nenhuma: never = msg
      return nenhuma
    }
  }
}

/**
 * AC 5 + AC 6. A bola sai do lado que `ladosDaRodada` deu a ESTE jogador nesta rodada — nunca de
 * `team === jogador` (ou `team === 0`), que acerta na rodada 0 e move a bola do outro na rodada 1. O
 * tick é carimbado aqui, e só aqui. Bola morta, fase errada e assento vazio são descartados com
 * `{t:'erro'}`; nada é aplicado pela metade.
 */
function castar(n: Sala, j: Jogador, chave: string, msg: Extract<DoCliente, { t: 'cast' }>, envios: Envio[]): void {
  const r = n.rodada
  if (n.partida.fase !== 'rodada' || r === null) {
    erro(envios, chave, `{t:'cast'} fora da fase rodada (fase: ${n.partida.fase})`)
    return
  }
  // O tipo já diz 0 | 1, e o parser já recusa o resto; a checagem fica porque um índice fora da faixa
  // é exatamente a tentativa de alcançar a bola alheia na lista do mundo.
  if (msg.ballIndex !== 0 && msg.ballIndex !== 1) {
    erro(envios, chave, `ballIndex ${String(msg.ballIndex)} fora de 0|1 — só as duas bolas do próprio jogador`)
    return
  }
  const lado = r.lados[j]
  const bola = r.world.balls.filter((b) => b.team === lado)[msg.ballIndex]
  if (bola === undefined) {
    erro(envios, chave, `o jogador ${j} não tem bola de índice ${msg.ballIndex} nesta rodada`)
    return
  }
  if (!bola.alive) {
    erro(envios, chave, `bola ${msg.ballIndex} do jogador ${j} está morta — cast descartado`)
    return
  }
  r.pendentes.push({
    tick: r.world.tick + ATRASO_ALVO_TICKS,
    ballId: bola.id,
    slot: msg.slot,
    dx: msg.dx,
    dy: msg.dy,
    mag: msg.mag,
  })
}

/**
 * AC 7 — a decisão vai a `aplicar()`, e só. Recusa → `{t:'erro'}` a quem mandou, estado intacto
 * (o redutor devolve o original por referência). Aceita → visão por assento e as transições que a
 * fase nova pede. `remetente === null` é decisão produzida pela própria sala (RF-04, R-02).
 */
function decidir(n: Sala, d: Decisao, agora: number, envios: Envio[], remetente: string | null): void {
  const t = aplicar(n.partida, d)
  n.decisoes.push(d)
  if (t.erro !== undefined) {
    if (remetente === null) {
      throw new Error(`sala: decisão produzida pela própria sala foi recusada por aplicar() — ${t.erro}`)
    }
    erro(envios, remetente, t.erro)
    return
  }
  n.partida = t.estado
  n.eventos.push(...t.eventos)
  enviarVisao(n, envios)
  sincronizar(n, agora, envios)
}

/** Depois de toda mudança de `EstadoPartida`: prazo de RF-04, rodada nova, fim de partida. */
function sincronizar(n: Sala, agora: number, envios: Envio[]): void {
  if (n.partida.fase === 'builds') {
    if (n.prazoDeBuilds === null) {
      n.prazoDeBuilds = agora + n.config.prazoDeBuildsMs
      enviarAosDois(n, envios, msgPrazo(n, agora))
    }
  } else {
    n.prazoDeBuilds = null
  }
  if (n.partida.fase === 'rodada' && n.rodada === null) iniciarRodada(n, agora, envios)
  if (n.partida.fase === 'fim' && n.fase === 'jogando') encerrarSala(n, envios)
}

function encerrarSala(n: Sala, envios: Envio[]): void {
  n.fase = 'encerrada'
  n.rodada = null
  n.pausa = null
  n.prazoDeBuilds = null
  enviarSala(n, envios)
}

// --------------------------------------------------------------------------- rodada e cadência (AC 10)

function iniciarRodada(n: Sala, agora: number, envios: Envio[]): void {
  const setup = setupDaRodada(n.partida, n.injetado.chars)
  const world = createWorld(n.injetado.chars, setup)
  n.rodada = {
    world,
    produtor: criarProdutorDeSnapshot(world),
    pendentes: [],
    seq: 0,
    inicioMs: agora,
    lados: ladosDaRodada(n.partida),
    seedDaRodada: setup.seed,
  }
  enviarAosDois(n, envios, { t: 'rodadaInicio', estatico: estaticoDaRodada(world) })
}

function enviarSnap(n: Sala, r: RodadaEmCurso, envios: Envio[]): void {
  enviarAosDois(n, envios, { t: 'snap', s: r.produtor.snapshot(r.world), seq: r.seq })
  r.seq++
}

/**
 * Um tick: os comandos carimbados para ele, `step`, `observar` — SEMPRE, inclusive no tick que vai
 * sair na cadência e no último. No tick de término sai o `snap` final, na cadência ou fora dela, e só
 * depois o `rodadaFim` (§5.6): sem ele, o golpe que matou, o `death` e o `roundEnd` ficariam no
 * acúmulo do produtor e nunca chegariam ao fio — e o produtor não lança nesse caso.
 */
function avancarUmTick(n: Sala, r: RodadaEmCurso, agora: number, envios: Envio[]): void {
  const w = r.world
  step(
    w,
    r.pendentes.filter((c) => c.tick === w.tick),
  )
  r.produtor.observar(w)
  r.pendentes = r.pendentes.filter((c) => c.tick >= w.tick)
  if (w.over || w.tick >= n.config.tetoDeTicks) {
    encerrarRodada(n, r, vencedorDaRodada(r.lados, w.winner), agora, envios)
    return
  }
  if (w.tick % (TICK_HZ / n.config.snapshotHz) === 0) enviarSnap(n, r, envios)
}

/**
 * Fecha a rodada: `snap` final, `registrarRodada` com o `controle` real (AC 12) e o hash injetado,
 * `rodadaFim` e a visão nova. Os mesmos campos, na mesma conta, que `fecharRodada` de
 * `tools/partida.ts` — é o que o AC 11 compara.
 */
function encerrarRodada(n: Sala, r: RodadaEmCurso, vencedor: Jogador | -1, agora: number, envios: Envio[]): void {
  enviarSnap(n, r, envios)
  const resultado: ResultadoRodada = {
    indice: n.partida.rodada,
    seedDaRodada: r.seedDaRodada,
    ladoDoJogador: [r.lados[0], r.lados[1]],
    vencedor,
    ticks: r.world.tick,
    hash: n.injetado.hashDoMundo(r.world),
  }
  const t = registrarRodada(n.partida, resultado, CONTROLE_1V1)
  if (t.erro !== undefined) throw new Error(`sala: registrarRodada recusou a rodada ${resultado.indice} — ${t.erro}`)
  n.rodada = null
  n.partida = t.estado
  n.eventos.push(...t.eventos)
  enviarAosDois(n, envios, { t: 'rodadaFim', resultado })
  enviarVisao(n, envios)
  sincronizar(n, agora, envios)
}

// --------------------------------------------------------------------------- o tempo (AC 9, 10, 13)

function avancar(n: Sala, agora: number, envios: Envio[]): void {
  if (n.fase !== 'jogando') return

  if (n.pausa !== null && agora >= n.pausa.desde + n.config.desconexao.prazoMs) estourarPausa(n, agora, envios)
  if (n.fase !== 'jogando') return

  // AC 9 — o relógio de RF-04. O estouro produz a DECISÃO de sempre, para quem ainda não declarou pronto.
  if (n.partida.fase === 'builds' && n.prazoDeBuilds !== null && agora >= n.prazoDeBuilds) {
    for (const j of JOGADORES) {
      if (n.partida.fase === 'builds' && !n.partida.prontos[j]) decidir(n, { t: 'buildPadrao', jogador: j }, agora, envios, null)
    }
  }

  const r = n.rodada
  if (r === null || n.pausa !== null) return
  const devidos = Math.floor(((agora - r.inicioMs) * TICK_HZ) / 1000)
  while (n.rodada === r && r.world.tick < devidos) avancarUmTick(n, r, agora, envios)
}

/** R-02, no estouro do prazo — a semântica está na doc de `POLITICA_DE_DESCONEXAO_PROVISORIA`. */
function estourarPausa(n: Sala, agora: number, envios: Envio[]): void {
  const ausentes = JOGADORES.filter((j) => !n.conectados[j])
  if (ausentes.length === 0) {
    n.pausa = null
    return
  }
  if (n.config.desconexao.noEstouro === 'anular' || ausentes.length === 2) {
    encerrarSala(n, envios)
    return
  }
  const ausente = ausentes[0]
  const presente: Jogador = ausente === 0 ? 1 : 0
  switch (n.partida.fase) {
    case 'rodada':
      if (n.rodada !== null) encerrarRodada(n, n.rodada, presente, agora, envios)
      break
    case 'builds':
      if (!n.partida.prontos[ausente]) decidir(n, { t: 'buildPadrao', jogador: ausente }, agora, envios, null)
      break
    case 'loja':
      if (!n.partida.prontos[ausente]) decidir(n, { t: 'pronto', jogador: ausente }, agora, envios, null)
      break
    default:
      // `draft` não chega aqui (§6 devolve a sala a `aguardando`); `fim` já encerrou a sala
      break
  }
  n.pausa = n.fase === 'jogando' ? { desde: agora } : null
}
