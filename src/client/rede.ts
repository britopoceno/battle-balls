import type { EventoPartida, ResultadoRodada, VisaoPartida } from '../match/index.ts'
import { decodificarDoServidor, DescompassoDeVersao } from '../net/codec.ts'
import type { DoCliente, DoServidor, EstaticoDaRodada, Snapshot } from '../net/protocolo.ts'

/**
 * A REDE DO CLIENTE — o `WebSocket` do navegador no modo conectado (`docs/architecture-e4.md` §5.3, §6,
 * §6.2 e §9; story `e4.5`).
 *
 * Quatro coisas, e só estas:
 *  1. **a conexão**: endereço montado só a partir da página (§6.2), `{t:'entrar'}` como primeira
 *     mensagem, fila de saída até o assento chegar, e resposta aos `{t:'ping'}` do servidor;
 *  2. **a entrada**: todo texto recebido passa por `decodificarDoServidor` (`net/codec.ts`, §5.5), dentro
 *     de `try`. Quem falha na decodificação fecha a conexão, e o cliente não reconecta por isso (AC 3);
 *  3. **o buffer de snapshots** e a interpolação que lê dele (§5.3, AC 7 e AC 8);
 *  4. **a reconexão** por segredo de assento, para o jogador que já estava sentado e perdeu a rede
 *     (AC 11). Nenhuma reconciliação: o cliente não tem estado próprio a conciliar (§6).
 *
 * O que este arquivo NÃO faz, e é o que sustenta P4.2 por subtração (§8.1): não simula, não monta mundo,
 * não aplica decisão. Ele recebe o que DESENHAR e manda o que o jogador PEDIU. Não conhece DOM nem
 * canvas: quem pinta e quem escreve na tela é `client/main.ts`, pelo `Receptor`.
 */

// --------------------------------------------------------------------------- endereço (L-3, §6.2)

/**
 * A porta do servidor WebSocket (L-3, `architecture-e4.md` §6.2).
 *
 * ⚠️ CÓPIA, de propósito: é o MESMO literal de `PORTA_DO_SERVIDOR` em `src/server/main.ts`, a porta de
 * escuta do servidor. As duas cópias têm o mesmo nome para que um grep ache as duas; a tabela de cinco
 * lugares da §6.2 explica por que não existe cópia única no escopo da Fase 4. Mudou uma, mude a outra.
 * Se divergirem, o cliente não conecta, e a tela diz o endereço tentado (caso vi do AC 3 de `e4.5`).
 *
 * Sem override: nem variável do bundler, nem parâmetro no link. Um parâmetro de servidor na URL deixaria
 * um link apontar este cliente para o servidor de qualquer um (§6.2, Segurança).
 */
const PORTA_DO_SERVIDOR = 5179

/**
 * §6.2, item 1 — o endereço sai da página, e só dela: `wss:` quando a página veio por `https:`, `ws:`
 * fora disso; o host é `location.hostname`, que NÃO traz a porta do Vite (a propriedade irmã, sem o
 * sufixo "name", traria); a porta é a constante acima. IPv6 já sai com colchetes do `hostname`.
 */
function enderecoDoServidor(): string {
  const esquema = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${esquema}//${location.hostname}:${PORTA_DO_SERVIDOR}`
}

// --------------------------------------------------------------------------- interpolação (§5.3)

/**
 * A margem de jitter do buffer, em ms: quanto o quadro pode atrasar além do intervalo entre snapshots
 * sem que o buffer esvazie e a tela trave no último quadro.
 *
 * Ponto de partida, não medição — o mesmo estatuto de `SNAPSHOT_HZ` (R-03): quem mede é `e4.7`/P4.4, em
 * dois aparelhos. Ver `atrasoDeBuffer`, logo abaixo, antes de mexer.
 */
const MARGEM_DE_JITTER_MS = 50

/**
 * `ATRASO_DE_BUFFER` (AC 7, §5.3): o cliente desenha o instante `agora − ATRASO_DE_BUFFER`, sempre entre
 * dois snapshots já recebidos.
 *
 * ⚠️ ESTE NÚMERO SOMA À LATÊNCIA SENTIDA (§4.4, R-01):
 *   latência sentida = ida (RTT/2) + ATRASO_ALVO_TICKS (~100 ms) + ATRASO_DE_BUFFER
 * Aumentá-lo para suavizar movimento tremido é pagar com responsividade, e responsividade é o que P4.4
 * julga. Antes de aumentar, confira se o tremor não é outra coisa (taxa, rede, jitter do aparelho).
 *
 * O intervalo vem do `snapshotHz` do último `{t:'sala'}` recebido, e NÃO do `SNAPSHOT_HZ` compilado no
 * bundle (AC 7, decisão O-1): a taxa é lever de operação, sobrescrita no servidor sem rebuild
 * (`e4.7`/AC 4). Com a constante compilada, um servidor a 20 Hz esvaziaria um buffer dimensionado para 30.
 */
function atrasoDeBuffer(snapshotHz: number): number {
  return 1000 / snapshotHz + MARGEM_DE_JITTER_MS
}

/**
 * Se um snapshot chega com a distância chegada−`time` maior que a menor já vista por mais que isto, o
 * relógio de exibição é realinhado a ele. É o caso da pausa de R-02 (o `time` da rodada congela e o
 * relógio de parede não) e o de uma rede que ficou lenta de vez; sem o realinhamento, o instante
 * desenhado correria à frente de todo snapshot e a tela ficaria parada no último.
 */
const LIMITE_DE_REALINHAMENTO_MS = 500

/** Teto do buffer: bem mais que o que a interpolação consome, só para ele não crescer sem limite. */
const TETO_DO_BUFFER = 64

// --------------------------------------------------------------------------- reconexão (AC 11)

/** Espera entre uma queda de rede e a nova tentativa, para o jogador já assentado. */
const ESPERA_DE_RECONEXAO_MS = 1000

/**
 * Tentativas seguidas antes de desistir e dizer na tela que o servidor não foi alcançado. O contador
 * zera a cada `{t:'sala'}`: é teto de tentativas SEGUIDAS, e é o que impede a reconexão de virar laço.
 */
const MAX_TENTATIVAS_DE_RECONEXAO = 5

/** Código de fechamento com que `src/server/main.ts` derruba a conexão cujo assento outra conexão retomou. */
const FECHADA_POR_REASSENTAMENTO = 4000

// --------------------------------------------------------------------------- o que sobe para main.ts

export type MsgSala = Extract<DoServidor, { t: 'sala' }>

/**
 * O que a tela precisa dizer ao jogador quando a conexão não serve mais. **Só dado estruturado**: o
 * texto é fixo do cliente e mora em `client/main.ts`. Nada aqui carrega o `message` de um erro, nem o
 * `motivo` do servidor — os dois vão só para o console (AC 3, casos iv e v).
 */
export type Aviso =
  /** caso iv — descompasso de versão, com as duas versões; `servidor: null` é "sem versão" */
  | { t: 'versao'; remedio: 'recarregue' | 'aguarde'; servidor: number | null; cliente: number }
  /** caso v — `{t:'erro'}` antes do primeiro `{t:'sala'}`: sala inexistente, acabada ou cheia */
  | { t: 'linkInvalido' }
  /** caso vi — a conexão fechou sem `{t:'sala'}` (servidor desligado, porta errada, rede) */
  | { t: 'semServidor'; endereco: string }
  /** o servidor derrubou esta conexão porque o mesmo assento foi retomado em outra (`e4.4`/AC 7) */
  | { t: 'assentoEmOutraAba' }

/** Quem consome as mensagens decodificadas. Uma função por variante que interessa à tela. */
export interface Receptor {
  sala(m: MsgSala): void
  visao(v: VisaoPartida): void
  /** o RESTANTE do prazo de RF-04, em ms (o relógio é do servidor, §3.4) */
  prazo(terminaEmMs: number): void
  rodadaInicio(estatico: EstaticoDaRodada): void
  /**
   * Cada snapshot, NA CHEGADA, para os `events` dele (AC 8): eventos são de um tick só e não se
   * interpolam. O mesmo snapshot já está no buffer quando isto é chamado.
   */
  snap(s: Snapshot): void
  rodadaFim(resultado: ResultadoRodada): void
  evento(e: EventoPartida): void
  aviso(a: Aviso): void
}

export interface Rede {
  /**
   * Manda uma mensagem ao servidor. Decisões esperam na fila de saída até o assento chegar; um
   * `{t:'cast'}` sem assento é descartado, porque mira é do instante e não vale depois. Devolve `false`
   * só quando descartou.
   */
  enviar(m: DoCliente): boolean
  /**
   * O snapshot a desenhar em `agora` (relógio de `performance.now()`), interpolado entre os dois que
   * cercam `agora − ATRASO_DE_BUFFER`. `null` antes do primeiro snapshot da rodada.
   */
  amostrar(agora: number): Snapshot | null
  /** o instante desenhado já alcançou o último snapshot recebido (o final da rodada, depois do `rodadaFim`) */
  exibiuOUltimo(): boolean
}

// --------------------------------------------------------------------------- a conexão

interface Soquete {
  ws: WebSocket
  /** este soquete já recebeu o próprio `{t:'sala'}` */
  assentado: boolean
  /** fechado por este cliente: o `close` que vier depois não é queda de rede */
  fechadoPorNos: boolean
  /** o primeiro `{t:'entrar'}` deste soquete foi SEM segredo: só então cabe a volta pelo do navegador */
  entrouSemSegredo: boolean
}

/**
 * Abre a conexão da sala `salaId` e a mantém. Chamado uma vez, na carga da página, pelo modo
 * conectado de `client/main.ts` (AC 4).
 */
export function conectar(salaId: string, receptor: Receptor): Rede {
  const endereco = enderecoDoServidor()
  /**
   * O segredo de assento fica em DUAS memórias, com a mesma chave por sala e papéis diferentes
   * (`architecture-e4.md` §6.3, decisão E, story `e4.11`):
   *  - `sessionStorage` é *o assento desta aba*: sobrevive a recarregar, a navegar e ao Ctrl+Shift+T,
   *    e NÃO é visto por outra aba. É o único que vai no PRIMEIRO `{t:'entrar'}`;
   *  - `localStorage` é *o último assento deste navegador nesta sala*: sobrevive a fechar a aba. Só é
   *    apresentado DEPOIS de uma recusa, num segundo `{t:'entrar'}` na mesma conexão, uma vez por carga.
   * A ordem é o que mantém duas abas do mesmo navegador no mesmo link (AC 13 de `e4.5`) como dois
   * jogadores: lido primeiro, o `localStorage` faria a segunda aba reapresentar o segredo da primeira e
   * derrubá-la com 4000. Tentar primeiro sem segredo nunca ocupa o assento de outro: com um assento
   * reservado, a sala recusa toda entrada sem segredo conhecido (§6.3, M-7/M-8).
   */
  const chaveDoSegredo = `battle-balls:assento:${salaId}`

  let atual: Soquete | null = null
  /** algum soquete desta página já recebeu `{t:'sala'}`: só então existe assento para reconectar */
  let jaAssentou = false
  /** o último `{t:'sala'}` disse `encerrada`: a partida acabou, e uma queda depois disso não é reconectada */
  let encerrada = false
  /** este cliente parou de vez (fechou por erro, ou mostrou um aviso que encerra a conexão) */
  let desistiu = false
  /**
   * Esta carga de página já mandou o segundo `{t:'entrar'}`, com o segredo do `localStorage` (§6.3,
   * item 3). É o teto de UMA volta pelo segredo do navegador: sem ele, um segredo que a sala não conhece
   * (inventado, ou de uma partida velha) daria recusa → nova tentativa → recusa, em laço.
   */
  let tentouSegredoDoNavegador = false
  let tentativas = 0
  let snapshotHz: number | null = null
  const fila: DoCliente[] = []

  // buffer (§5.3): os snapshots da rodada corrente, em ordem de chegada, que é a ordem de `time`
  const buffer: Snapshot[] = []
  /** a menor distância chegada − `time` já vista nesta rodada: é o que liga o relógio local ao da rodada */
  let desvio: number | null = null
  /** o último instante desenhado, em `time` da rodada. Só anda para a frente */
  let ultimoAlvo = -Infinity

  /** O assento desta aba (`sessionStorage`): o único que vai no primeiro `{t:'entrar'}`. */
  function lerSegredoDaAba(): string | null {
    try {
      return sessionStorage.getItem(chaveDoSegredo)
    } catch {
      return null
    }
  }

  /** O último assento deste navegador nesta sala (`localStorage`): só depois de uma recusa. */
  function lerSegredoDoNavegador(): string | null {
    try {
      return localStorage.getItem(chaveDoSegredo)
    } catch {
      return null
    }
  }

  /**
   * Grava o segredo nas duas memórias. Com a partida `encerrada`, a cópia do navegador é APAGADA em vez
   * de gravada (§6.3, item 4): não é segurança — o segredo morre com a sala —, é para não acumular uma
   * chave por partida no `localStorage`.
   */
  function guardarSegredo(s: string, partidaEncerrada: boolean): void {
    try {
      sessionStorage.setItem(chaveDoSegredo, s)
    } catch (err) {
      // sem armazenamento, o jogador ainda joga; só perde a volta ao assento se recarregar
      console.warn('[rede] não foi possível guardar o segredo de assento na aba:', err)
    }
    try {
      if (partidaEncerrada) localStorage.removeItem(chaveDoSegredo)
      else localStorage.setItem(chaveDoSegredo, s)
    } catch (err) {
      // sem esta cópia, só se perde a volta ao assento depois de FECHAR a aba
      console.warn('[rede] não foi possível guardar o segredo de assento no navegador:', err)
    }
  }

  function escrever(s: Soquete, m: DoCliente): void {
    s.ws.send(JSON.stringify(m))
  }

  /** Fecha por decisão deste cliente e para de vez: sem reconexão, e sem o aviso do caso vi por cima. */
  function fecharPorNos(s: Soquete): void {
    s.fechadoPorNos = true
    desistiu = true
    s.ws.close(1000)
  }

  function limparBuffer(): void {
    buffer.length = 0
    desvio = null
    ultimoAlvo = -Infinity
  }

  function guardarSnap(s: Snapshot): void {
    const d = performance.now() - s.time
    if (desvio === null || d < desvio || d - desvio > LIMITE_DE_REALINHAMENTO_MS) desvio = d
    buffer.push(s)
    if (buffer.length > TETO_DO_BUFFER) buffer.splice(0, buffer.length - TETO_DO_BUFFER)
  }

  function abrir(): void {
    const s: Soquete = { ws: new WebSocket(endereco), assentado: false, fechadoPorNos: false, entrouSemSegredo: false }
    atual = s

    s.ws.addEventListener('open', () => {
      if (atual !== s) return
      // AC 4 — a primeira mensagem da conexão, com o segredo DESTA ABA quando houver um (AC 11). O do
      // navegador nunca vai aqui (§6.3, item 2): é o que mantém duas abas como dois jogadores.
      const assento = lerSegredoDaAba()
      s.entrouSemSegredo = assento === null
      escrever(s, assento === null ? { t: 'entrar', sala: salaId } : { t: 'entrar', sala: salaId, assento })
    })

    s.ws.addEventListener('message', (ev: MessageEvent) => {
      if (atual !== s || s.fechadoPorNos) return
      let m: DoServidor
      try {
        // AC 3 — a ÚNICA porta de entrada. Um quadro binário vira texto vazio e cai no caso i.
        m = decodificarDoServidor(typeof ev.data === 'string' ? ev.data : '')
      } catch (e) {
        // Casos i a iv: log, fechamento, nenhuma reconexão. Descartar o quadro congelaria a tela
        // calado (num descompasso TODO snap falha), e reconectar repetiria o erro em laço.
        console.error(
          `[rede] mensagem do servidor não decodificada; conexão fechada, sem reconexão: ${e instanceof Error ? e.message : String(e)}`,
        )
        // Caso iv: reconhecido SÓ pela classe, e o ramo sai SÓ dos campos — nunca do texto do erro.
        if (e instanceof DescompassoDeVersao) receptor.aviso(avisoDeVersao(e))
        fecharPorNos(s)
        return
      }
      receber(s, m)
    })

    s.ws.addEventListener('error', () => {
      // o navegador não diz o motivo; o `close` que vem logo depois decide o que fazer
      if (atual === s) console.warn(`[rede] erro no socket de ${endereco}`)
    })

    s.ws.addEventListener('close', (ev: CloseEvent) => {
      if (atual !== s || s.fechadoPorNos || desistiu) return
      if (ev.code === FECHADA_POR_REASSENTAMENTO) {
        // Outra conexão retomou este assento. Reconectar aqui a derrubaria de volta, e as duas se
        // derrubariam em laço.
        console.error(`[rede] o servidor fechou esta conexão: o assento foi retomado em outra (código ${ev.code})`)
        desistiu = true
        receptor.aviso({ t: 'assentoEmOutraAba' })
        return
      }
      if (encerrada) {
        console.info(`[rede] conexão fechada com a partida já encerrada (código ${ev.code}); nada a retomar`)
        return
      }
      if (jaAssentou && tentativas < MAX_TENTATIVAS_DE_RECONEXAO) {
        // AC 11 — queda de rede de quem já estava sentado: volta com o segredo, sem reconciliar nada
        tentativas++
        console.warn(
          `[rede] conexão caiu (código ${ev.code}); tentativa ${tentativas} de ${MAX_TENTATIVAS_DE_RECONEXAO} em ${ESPERA_DE_RECONEXAO_MS} ms`,
        )
        setTimeout(() => {
          if (!desistiu && atual === s) abrir()
        }, ESPERA_DE_RECONEXAO_MS)
        return
      }
      // Caso vi: a conexão fechou antes de um `{t:'sala'}`, sem este cliente fechar. Quem nunca sentou
      // não reconecta sozinho; recarrega a página.
      console.error(`[rede] sem conexão com o servidor em ${endereco} (código ${ev.code}); sem reconexão automática`)
      desistiu = true
      receptor.aviso({ t: 'semServidor', endereco })
    })
  }

  function receber(s: Soquete, m: DoServidor): void {
    switch (m.t) {
      case 'sala':
        s.assentado = true
        jaAssentou = true
        tentativas = 0
        snapshotHz = m.snapshotHz
        encerrada = m.estado === 'encerrada'
        guardarSegredo(m.assento, encerrada)
        receptor.sala(m)
        for (const x of fila.splice(0)) escrever(s, x)
        return
      case 'erro':
        if (!s.assentado) {
          // §6.3, item 3 — a volta pelo segredo do navegador: o primeiro `{t:'entrar'}` foi sem segredo,
          // veio recusa antes de qualquer `{t:'sala'}`, e o `localStorage` tem segredo para esta sala.
          // Um segundo `{t:'entrar'}` com ele, NA MESMA CONEXÃO (o servidor não fecha a conexão recusada,
          // `server/main.ts`), sem aviso, e no máximo uma vez por carga de página.
          if (s.entrouSemSegredo && !tentouSegredoDoNavegador) {
            const doNavegador = lerSegredoDoNavegador()
            if (doNavegador !== null) {
              tentouSegredoDoNavegador = true
              console.info(`[rede] entrada sem segredo recusada (${m.motivo}); tentando o último assento deste navegador`)
              escrever(s, { t: 'entrar', sala: salaId, assento: doNavegador })
              return
            }
          }
          // Caso v: o `motivo` é texto de desenvolvedor e vai só ao console; a tela tem texto fixo.
          console.error(`[rede] o servidor recusou a entrada na sala: ${m.motivo}`)
          receptor.aviso({ t: 'linkInvalido' })
          fecharPorNos(s)
          return
        }
        // já sentado: é uma decisão recusada (um clique fora de hora). A partida continua.
        console.error(`[rede] o servidor recusou uma mensagem: ${m.motivo}`)
        return
      case 'ping':
        escrever(s, { t: 'pong', id: m.id })
        return
      case 'visao':
        receptor.visao(m.v)
        return
      case 'prazo':
        receptor.prazo(m.terminaEmMs)
        return
      case 'rodadaInicio':
        limparBuffer()
        receptor.rodadaInicio(m.estatico)
        return
      case 'snap':
        guardarSnap(m.s)
        receptor.snap(m.s)
        return
      case 'rodadaFim':
        receptor.rodadaFim(m.resultado)
        return
      case 'evento':
        receptor.evento(m.e)
        return
      default: {
        const nenhuma: never = m
        return nenhuma
      }
    }
  }

  abrir()

  return {
    enviar(m) {
      const s = atual
      if (s !== null && s.assentado && s.ws.readyState === WebSocket.OPEN) {
        escrever(s, m)
        return true
      }
      if (m.t === 'cast') {
        console.warn('[rede] cast descartado: a conexão está sem assento neste instante')
        return false
      }
      fila.push(m)
      return true
    },

    amostrar(agora) {
      if (buffer.length === 0 || desvio === null || snapshotHz === null) return null
      const alvo = Math.max(agora - desvio - atrasoDeBuffer(snapshotHz), ultimoAlvo)
      ultimoAlvo = alvo
      // o primeiro do buffer é o último snapshot com `time` ≤ alvo; os anteriores já não servem
      while (buffer.length >= 2 && buffer[1].time <= alvo) buffer.shift()
      const a = buffer[0]
      if (buffer.length === 1 || alvo <= a.time) return congelado(a)
      const b = buffer[1]
      return interpolar(a, b, (alvo - a.time) / (b.time - a.time))
    },

    exibiuOUltimo() {
      return buffer.length === 0 || ultimoAlvo >= buffer[buffer.length - 1].time
    },
  }
}

// --------------------------------------------------------------------------- descompasso (AC 3 iv)

/**
 * Os três ramos do caso iv, pelos CAMPOS de `DescompassoDeVersao` (v1.6.0):
 *  1. servidor numérico e maior → a aba é velha: "recarregue";
 *  2. servidor numérico e menor → a página está na frente do servidor: "aguarde o servidor";
 *  3. servidor não numérico (ausente, que é o servidor de antes de `e4.9`, ou de outro tipo) →
 *     "aguarde o servidor", com o servidor mostrado como "sem versão".
 */
function avisoDeVersao(e: DescompassoDeVersao): Aviso {
  if (typeof e.servidor === 'number' && e.servidor > e.cliente) {
    return { t: 'versao', remedio: 'recarregue', servidor: e.servidor, cliente: e.cliente }
  }
  if (typeof e.servidor === 'number' && e.servidor < e.cliente) {
    return { t: 'versao', remedio: 'aguarde', servidor: e.servidor, cliente: e.cliente }
  }
  return { t: 'versao', remedio: 'aguarde', servidor: null, cliente: e.cliente }
}

// --------------------------------------------------------------------------- interpolação (AC 7, AC 8)

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f
}

/** Ângulo pelo caminho curto: de 3,1 a −3,1 rad são 0,08 rad, não uma volta inteira ao contrário. */
function lerpAngulo(a: number, b: number, f: number): number {
  const volta = 2 * Math.PI
  const d = ((((b - a + Math.PI) % volta) + volta) % volta) - Math.PI
  return a + d * f
}

/** Um snapshot do buffer, sem os eventos: eles já foram aplicados na chegada (AC 8). */
function congelado(s: Snapshot): Snapshot {
  return { ...s, events: [] }
}

/**
 * O instante entre `a` e `b` (AC 7 e AC 8). **Interpola**: posição e ângulo das bolas, posição e
 * velocidade dos projéteis, posição e ângulo das zonas, e o `time`.
 *
 * **NÃO interpola**, e cada item tem modo de falha próprio:
 *  - `events`: saem vazios. Foram aplicados na chegada; interpolá-los faria números de dano flutuarem
 *    em posições que nunca existiram;
 *  - `alive` e `hp` (e o resto do estado discreto da bola): vêm de `a`, inteiros. Morte não é meio-caminho;
 *  - início e fim de zona e de projétil: a LISTA vem de `a`. Uma Muralha existe ou não existe, e o que
 *    só está em `b` aparece quando `b` virar o `a`. Interpolar presença produziria parede fantasma;
 *  - `over`, `winner` e `arena` vêm de `a`.
 */
function interpolar(a: Snapshot, b: Snapshot, f: number): Snapshot {
  const bolas = new Map(b.balls.map((x) => [x.id, x]))
  const projeteis = new Map(b.projectiles.map((x) => [x.id, x]))
  const zonas = new Map(b.zones.map((x) => [x.id, x]))
  return {
    time: lerp(a.time, b.time, f),
    over: a.over,
    winner: a.winner,
    arena: a.arena,
    balls: a.balls.map((x) => {
      const y = bolas.get(x.id)
      return y ? { ...x, x: lerp(x.x, y.x, f), y: lerp(x.y, y.y, f), facing: lerpAngulo(x.facing, y.facing, f) } : x
    }),
    projectiles: a.projectiles.map((p) => {
      const q = projeteis.get(p.id)
      return q
        ? { ...p, x: lerp(p.x, q.x, f), y: lerp(p.y, q.y, f), vx: lerp(p.vx, q.vx, f), vy: lerp(p.vy, q.vy, f) }
        : p
    }),
    zones: a.zones.map((z) => {
      const w = zonas.get(z.id)
      return w ? { ...z, x: lerp(z.x, w.x, f), y: lerp(z.y, w.y, f), angle: lerpAngulo(z.angle, w.angle, f) } : z
    }),
    events: [],
  }
}
