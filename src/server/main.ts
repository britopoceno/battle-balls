import { randomBytes } from 'node:crypto'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import { CHARS } from '../chars/index.ts'
import { codificarDoServidor, parseDoCliente } from '../net/codec.ts'
import type { DoCliente, DoServidor } from '../net/protocolo.ts'
import { criarSala, passo, type EntradaDaSala, type Envio, type Sala } from '../net/sala.ts'
import { hash } from '../tools/harness.ts'

/**
 * SERVIDOR AUTORITATIVO — a entrada Node da Fase 4 (`docs/architecture-e4.md` §3, passo 4 de §10, story
 * `e4.4`). Roda com `npm run server`.
 *
 * **Fino de propósito (§2.3, AC 4): nenhuma regra de jogo mora aqui.** Toda mudança de estado de partida
 * passa por `passo()` de `net/sala.ts`. Este arquivo faz exatamente quatro coisas:
 *  1. fala WebSocket (a biblioteca ratificada em R-05, `architecture-e4.md` §12);
 *  2. mantém o mapa de conexões → sala → chave de assento;
 *  3. roda o relógio (acumulador de passo fixo, AC 5) e injeta `agora` na sala;
 *  4. escreve no socket os `envios` que a sala devolveu, na ordem devolvida (AC 15, AC 16).
 *
 * Da sala, este arquivo lê só `Sala.fase` (a fase DA SALA: `aguardando | jogando | encerrada`) e
 * `Sala.assentos`, para o ciclo de vida das salas (AC 6, §6.1 item 4) e para a regra L-1 (AC 7). Nunca lê
 * `Sala.partida`.
 *
 * Criação de sala (§6.1, O-2, opção D): o servidor é o único que cria sala, e cria sem pedido de ninguém.
 * Existe sempre ao menos uma sala livre, e cada sala criada gera UMA linha de log de operação com o id e o
 * caminho `/#/sala/{id}` — e nada mais. ⚠️ O segredo de assento e a seed da partida nunca vão ao log, em
 * linha nenhuma: o segredo reassenta e derruba a conexão dona (AC 7), e a seed determina a partida (§7).
 * Por isso os logs de conexão usam um número local (`#n`), nunca a chave de assento.
 */

// --------------------------------------------------------------------------- levers de operação

/**
 * Porta de escuta (AC 6, nota de L-3 da §6.1). O cliente de navegador (`e4.5`) vai precisar do mesmo
 * número para abrir o socket; a forma de dizer isso a ele é L-3, em aberto na `e4.5`. Se o desenho
 * confirmar duas cópias da constante, a do cliente cita esta, e esta passa a citar a do cliente.
 */
const PORTA_DO_SERVIDOR = 5179

/**
 * `permessage-deflate` (AC 17, `architecture-e4.md` §5.5): **desligado**, passado EXPLICITAMENTE à
 * biblioteca em vez de herdar o padrão dela — o padrão pode mudar entre versões, e a negociação é por
 * conexão. O orçamento do fio não depende de compressão (§5.5: a tupla do `snap` já cabe sem deflate).
 * É lever de operação de `e4.7` (AC 4 de lá), que mede com e sem. A extensão efetivamente negociada é
 * registrada por conexão, no log de abertura, para a `e4.7` saber o que de fato mediu.
 */
const PERMESSAGE_DEFLATE = false

/**
 * Teto de tamanho de um quadro recebido, em bytes (AC 15, L-2 da §6.1). Passado EXPLICITAMENTE: o padrão
 * da versão instalada (`ws` 8.21.3) é 104857600 (100 MiB), conferido na Task 1. O maior `DoCliente`
 * legítimo — um `{t:'cast'}` ou uma `{t:'decisao'}` de compra — tem dezenas de bytes, e o parser aceita um
 * `sala` de qualquer tamanho (o parser confere forma, não tamanho). 4 KiB fica duas ordens acima do maior
 * quadro legítimo e cinco abaixo do padrão. Um quadro acima dele fecha SÓ aquela conexão (código 1009), e
 * a biblioteca sinaliza isso como evento `'error'` no socket: por isso todo socket tem ouvinte de `'error'`
 * (ver `aoConectar`) — sem ele, o `EventEmitter` lança e derruba o processo, e com ele a partida de todos.
 */
const TETO_DO_QUADRO_BYTES = 4 * 1024

/**
 * Cadência do laço de relógio (AC 5): 60 passos por segundo, a taxa do tick de `sim/` (`TICK_HZ`). O
 * valor é do LAÇO, não uma segunda definição do tick: quantos ticks cada `passo()` avança é a sala que
 * calcula, a partir do `agora` que recebe, e por isso um laço fora de fase com o tick não muda o jogo —
 * só a granularidade com que o tempo chega à sala. `server/` não importa `sim/` (AC 12).
 */
const PASSOS_POR_SEGUNDO = 60
const PASSO_MS = 1000 / PASSOS_POR_SEGUNDO

/**
 * O teto de passos por quadro (AC 5, §3.2). No cliente é 5 (`client/main.ts:398`), e o que passa dele é
 * descartado: vira câmera lenta, aceitável num jogo local. No servidor isso seria câmera lenta para os DOIS
 * jogadores, então o teto sobe para 1 s de atraso por quadro, e o que passar dele NÃO é descartado: fica
 * no acumulador para o quadro seguinte, e o atraso vai ao log de operação (entrada e saída do atraso).
 */
const TETO_DE_PASSOS_POR_QUADRO = 60

/** Com que frequência o servidor mede o RTT de cada conexão assentada (AC 9). */
const INTERVALO_DE_PING_MS = 2000

// --------------------------------------------------------------------------- log de operação

/**
 * O canal ÚNICO do log de operação (AC 5, AC 6 item 2): stdout, uma linha por fato. ⚠️ Nenhuma chamada
 * recebe chave de assento nem seed — o teste de vazamento do Dev Agent Record procura as duas na saída.
 */
function logOperacao(linha: string): void {
  console.log(`[op ${new Date().toISOString()}] ${linha}`)
}

// --------------------------------------------------------------------------- estado do servidor

interface Conexao {
  /** número local, só para o log — nunca a chave de assento */
  readonly n: number
  readonly ws: WebSocket
  /** a sala desta conexão, desde o `{t:'entrar'}` aceito até a queda, a recusa ou o encerramento */
  sala: SalaNoServidor | null
  /** a chave de assento (o segredo) com que esta conexão fala com a sala */
  chave: string | null
  /** já recebeu o próprio `{t:'sala'}` (AC 8): só então recebe `{t:'ping'}` */
  recebeuSala: boolean
  /** AC 9 — o último `{t:'ping'}` sem resposta */
  pingEmVoo: { id: number; enviadoEm: number } | null
  proximoPing: number
  /** AC 9 — o RTT medido mais recente, em ms; `null` antes da primeira medida */
  rttMs: number | null
}

interface SalaNoServidor {
  sala: Sala
  /** entradas desde o último passo, na ordem de chegada, com a conexão de origem */
  fila: { de: Conexao; entrada: EntradaDaSala }[]
  /** chave de assento → conexão. Inclui a conexão que entrou e ainda não foi confirmada pela sala */
  conexoes: Map<string, Conexao>
}

const salas = new Map<string, SalaNoServidor>()
/** toda conexão aberta, com sala ou sem */
const conexoes = new Set<Conexao>()
/** id da sala criada por último — a "sala livre mais nova" do ciclo de vida (§6.1 item 1) */
let idDaMaisNova: string | null = null
let proximaConexao = 1

// --------------------------------------------------------------------------- entropia (AC 6, AC 7)

/**
 * Id de sala e segredo de assento: 128 bits da fonte de entropia do sistema operacional, em base64url
 * (22 caracteres, cabem no link sem escape). Nenhum PRNG semeado, nada derivado de relógio, contador, id
 * ou seed (AC 6, v1.9.0; §6.1 item 5).
 */
function segredo128(): string {
  return randomBytes(16).toString('base64url')
}

/** A seed da partida: sorteio À PARTE, da mesma fonte, com os 32 bits que o gerador de `sim/` usa. */
function seed32(): number {
  return randomBytes(4).readUInt32BE(0)
}

// --------------------------------------------------------------------------- ciclo de vida das salas

function criarSalaLivre(): void {
  const id = segredo128()
  const sala = criarSala({ id, seed: seed32(), pool: Object.keys(CHARS), chars: CHARS, hashDoMundo: hash })
  salas.set(id, { sala, fila: [], conexoes: new Map() })
  idDaMaisNova = id
  logOperacao(`sala criada: id=${id} caminho=/#/sala/${id}`)
}

/** Livre = fase da sala `aguardando` e os dois assentos vazios (§6.1 item 1). */
function livre(e: SalaNoServidor | undefined): boolean {
  return e !== undefined && e.sala.fase === 'aguardando' && e.sala.assentos[0] === null && e.sala.assentos[1] === null
}

/** A sala livre mais nova recebeu o primeiro assento (ou saiu do mapa): cria a próxima. */
function garantirSalaLivre(): void {
  if (idDaMaisNova === null || !livre(salas.get(idDaMaisNova))) criarSalaLivre()
}

/** Solta a conexão da sala, sem fechar o socket e sem avisar a sala. */
function desligar(c: Conexao): void {
  const e = c.sala
  if (e !== null && c.chave !== null && e.conexoes.get(c.chave) === c) e.conexoes.delete(c.chave)
  c.sala = null
  c.chave = null
}

// --------------------------------------------------------------------------- saída (AC 15, AC 16)

function escrever(c: Conexao, msg: DoServidor): void {
  if (c.ws.readyState !== WebSocket.OPEN) return
  c.ws.send(codificarDoServidor(msg))
  if (msg.t === 'sala') c.recebeuSala = true
}

/** `{t:'erro'}` montado pelo SERVIDOR, só para esta conexão (AC 7, AC 15). Nada chega à sala. */
function recusar(c: Conexao, motivo: string): void {
  escrever(c, { t: 'erro', motivo })
}

/**
 * Um passo de uma sala: a fila inteira entra, os envios saem NA ORDEM devolvida, e só depois o ciclo de
 * vida olha a sala (AC 16: o `snap` final e o `rodadaFim` do passo em que a partida acaba já foram
 * escritos quando a sala `encerrada` sai do mapa).
 */
function rodarPasso(id: string, e: SalaNoServidor, agora: number): void {
  const fila = e.fila
  e.fila = []
  let envios: Envio[]
  try {
    const r = passo(e.sala, agora, fila.map((x) => x.entrada))
    e.sala = r.sala
    envios = r.envios
  } catch (err) {
    // Uma sala que lança está inconsistente: descartá-la derruba só a partida dela, não o processo.
    logOperacao(`sala ${id} falhou no passo e foi descartada: ${err instanceof Error ? err.message : String(err)}`)
    for (const c of [...e.conexoes.values()]) {
      desligar(c)
      c.ws.close(1011, 'falha interna da sala')
    }
    salas.delete(id)
    return
  }

  for (const envio of envios) {
    const c = e.conexoes.get(envio.assento)
    if (c !== undefined) escrever(c, envio.msg)
  }

  // Conexão cuja chave não ocupa assento depois do passo foi recusada pela sala (cheia ou já jogando):
  // já recebeu o `{t:'erro'}` acima, e sai do mapa para poder tentar outro `{t:'entrar'}`.
  for (const [chave, c] of [...e.conexoes]) {
    if (e.sala.assentos[0] !== chave && e.sala.assentos[1] !== chave) desligar(c)
  }

  if (e.sala.fase === 'encerrada') {
    for (const c of [...e.conexoes.values()]) desligar(c)
    salas.delete(id)
    logOperacao(`sala encerrada e descartada: id=${id}`)
  }
}

// --------------------------------------------------------------------------- entrada (AC 7, AC 15)

function entrar(c: Conexao, msg: Extract<DoCliente, { t: 'entrar' }>): void {
  const e = salas.get(msg.sala)
  if (e === undefined) {
    // §6.1 item 3: id desconhecido nunca vira criação — é isso que impede o cliente de escolher o id.
    recusar(c, 'sala desconhecida: o id não é de nenhuma sala aberta neste servidor')
    return
  }
  // L-1 (§6.1): só um segredo IGUAL a um assento DAQUELA sala reassenta. Qualquer outro — inventado, de
  // outra sala, de um assento já liberado — é tratado como ausente, e a chave nova é do servidor.
  const pedido = msg.assento
  const valido = pedido !== undefined && (pedido === e.sala.assentos[0] || pedido === e.sala.assentos[1])
  const chave = valido ? pedido : segredo128()

  const antiga = e.conexoes.get(chave)
  if (antiga !== undefined && antiga !== c) {
    // AC 7: segredo válido reassenta, e a conexão antiga é derrubada. O que ela deixou na fila sai junto,
    // para nenhum envio endereçado à chave chegar à conexão nova antes do `{t:'sala'}` dela (AC 8).
    e.fila = e.fila.filter((x) => x.de !== antiga)
    desligar(antiga)
    antiga.ws.close(4000, 'assento reassentado em outra conexão')
    logOperacao(`conexão #${antiga.n} derrubada: assento reassentado pela conexão #${c.n}`)
  }
  e.conexoes.set(chave, c)
  c.sala = e
  c.chave = chave
  e.fila.push({ de: c, entrada: { assento: chave, conexao: 'assentou' } })
}

function texto(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  return data.toString('utf8')
}

/**
 * O caminho de entrada, sem atalho (AC 15): texto → `JSON.parse` em `try` → `parseDoCliente` → só então
 * `{t:'entrar'}` (tratado aqui) ou a `EntradaDaSala`. Nenhum campo de mensagem crua é lido aqui.
 */
function aoReceber(c: Conexao, data: RawData): void {
  let bruto: unknown
  try {
    bruto = JSON.parse(texto(data))
  } catch {
    recusar(c, 'JSON malformado')
    return
  }
  const msg = parseDoCliente(bruto)
  if (msg === null) {
    recusar(c, 'mensagem fora do vocabulário do cliente (DoCliente)')
    return
  }
  if (msg.t === 'pong') {
    medirRtt(c, msg.id)
    return
  }
  const e = c.sala
  if (e === null || c.chave === null) {
    if (msg.t === 'entrar') entrar(c, msg)
    else recusar(c, "conexão sem sala: mande {t:'entrar'} primeiro")
    return
  }
  // Já tem sala: tudo vai à sala, inclusive um segundo `{t:'entrar'}`, que ela recusa.
  e.fila.push({ de: c, entrada: { assento: c.chave, msg } })
}

function aoFechar(c: Conexao, codigo: number): void {
  const e = c.sala
  if (e !== null && c.chave !== null) e.fila.push({ de: c, entrada: { assento: c.chave, conexao: 'caiu' } })
  desligar(c)
  logOperacao(`conexão #${c.n} fechada (código ${codigo}, rtt ${c.rttMs === null ? 'não medido' : `${c.rttMs.toFixed(1)} ms`})`)
}

// --------------------------------------------------------------------------- RTT (AC 9)

/** Só mede. A compensação de latência de §4.4 NÃO é ligada aqui: é decisão de R-01, depois do smoke de P4.4. */
function medirRtt(c: Conexao, id: number): void {
  const p = c.pingEmVoo
  if (p === null || p.id !== id) return
  c.rttMs = performance.now() - p.enviadoEm
  c.pingEmVoo = null
}

let proximoIdDePing = 1

function pingar(): void {
  const agora = performance.now()
  for (const c of conexoes) {
    // AC 8: nada sai para a conexão antes do `{t:'sala'}` dela. Um ping sem resposta é substituído pelo próximo.
    if (!c.recebeuSala || agora < c.proximoPing) continue
    const id = proximoIdDePing++
    c.pingEmVoo = { id, enviadoEm: agora }
    c.proximoPing = agora + INTERVALO_DE_PING_MS
    escrever(c, { t: 'ping', id })
  }
}

// --------------------------------------------------------------------------- relógio (AC 5)

const inicio = performance.now()
let ultimoQuadro = inicio
let acumulado = 0
let passosDados = 0
let atrasadoDesde: number | null = null

/**
 * Acumulador de passo fixo, na forma de `client/main.ts:398`. O `agora` que a sala recebe é o relógio do
 * LAÇO (`inicio + passos × PASSO_MS`), não a hora de parede: assim cada `passo()` vê o tempo andar de um
 * passo, e um atraso de agendamento é recuperado em vez de perdido.
 */
function quadro(): void {
  const agoraParede = performance.now()
  acumulado += agoraParede - ultimoQuadro
  ultimoQuadro = agoraParede
  let passos = 0
  while (acumulado >= PASSO_MS && passos < TETO_DE_PASSOS_POR_QUADRO) {
    passosDados++
    const agora = inicio + passosDados * PASSO_MS
    for (const [id, e] of [...salas]) rodarPasso(id, e, agora)
    garantirSalaLivre()
    acumulado -= PASSO_MS
    passos++
  }
  if (acumulado >= PASSO_MS) {
    if (atrasadoDesde === null) {
      atrasadoDesde = agoraParede
      logOperacao(
        `laço atrasado: teto de ${TETO_DE_PASSOS_POR_QUADRO} passos por quadro atingido, ` +
          `${acumulado.toFixed(0)} ms ainda no acumulador (recuperados nos quadros seguintes)`,
      )
    }
  } else if (atrasadoDesde !== null) {
    logOperacao(`laço recuperado após ${(agoraParede - atrasadoDesde).toFixed(0)} ms de atraso`)
    atrasadoDesde = null
  }
  pingar()
}

// --------------------------------------------------------------------------- subida

function aoConectar(ws: WebSocket, endereco: string | undefined): void {
  const c: Conexao = {
    n: proximaConexao++,
    ws,
    sala: null,
    chave: null,
    recebeuSala: false,
    pingEmVoo: null,
    proximoPing: 0,
    rttMs: null,
  }
  conexoes.add(c)
  logOperacao(
    `conexão #${c.n} aberta de ${endereco ?? '?'}; permessage-deflate negociado: ` +
      `${ws.extensions === '' ? 'nenhuma extensão' : ws.extensions}`,
  )
  // AC 15 / L-2: sem este ouvinte, um quadro acima de TETO_DO_QUADRO_BYTES derruba o PROCESSO (Task 1).
  ws.on('error', (err) => logOperacao(`conexão #${c.n}: erro no socket (${err.message}); a biblioteca a fecha`))
  ws.on('message', (data) => aoReceber(c, data))
  ws.on('close', (codigo) => {
    conexoes.delete(c)
    aoFechar(c, codigo)
  })
}

const servidor = new WebSocketServer({
  port: PORTA_DO_SERVIDOR,
  perMessageDeflate: PERMESSAGE_DEFLATE,
  maxPayload: TETO_DO_QUADRO_BYTES,
})
servidor.on('connection', (ws, req) => aoConectar(ws, req.socket.remoteAddress))
servidor.on('error', (err) => {
  logOperacao(`servidor não subiu: ${err.message}`)
  process.exit(1)
})
servidor.on('listening', () => {
  logOperacao(`servidor ouvindo na porta ${PORTA_DO_SERVIDOR}`)
  garantirSalaLivre()
  setInterval(quadro, PASSO_MS)
})
