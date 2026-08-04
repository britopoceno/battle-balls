import { SUDDEN_DEATH_MS, TICK_MS } from '../sim/world.ts'
import { validarCompra } from '../shop/agregar.ts'
import { CATALOGO, type ItemDef } from '../shop/catalogo.ts'
import { ECONOMIA_PROVISORIA, creditar } from './economia.ts'
import { ORDEM_SNAKE_2x2, REGRAS_PADRAO, partidaAcabou, placarDe } from './regras.ts'
import type {
  Controle,
  Decisao,
  EscolhaPersonagem,
  EstadoJogador,
  EstadoPartida,
  EventoPartida,
  Jogador,
  ParametrosEconomia,
  RegrasPartida,
  ResultadoRodada,
  Transicao,
} from './types.ts'

/**
 * O REDUTOR DA PARTIDA — `(estado, decisão) → estado` (`docs/architecture-e3.md` §2.3).
 *
 * **Por que redutor e não objeto com métodos:** porque é o formato que a Fase 4 precisa — o servidor
 * recebe decisões pela rede e as aplica; o replay reaplica a mesma lista. Um objeto com métodos que
 * mutam funciona igual **até** o dia em que precisa ser reproduzido, e aí é reescrito. Custa a mesma
 * quantidade de código escrever certo agora.
 *
 * **A linha do tempo de decisões É o replay da partida** (RF-41, subido um nível):
 * `replay de partida = matchSeed + Decisao[] + (por rodada) Command[]`.
 *
 * PUREZA (§2.2, §2.6): nada aqui lê `Date.now`, `Math.random`, DOM ou disco. A única aritmética
 * "aleatória" da camada é `deriveSeed` (em `setup.ts`), que é função pura da seed da partida. O
 * estouro do timer de 30s de RF-04 entra como a decisão `{t:'buildPadrao'}`, produzida por quem é
 * dono do relógio (o cliente, `e3.4`) — se `match/` medisse tempo real, deixaria de ser reproduzível
 * e o teste da Regra 3 morreria.
 *
 * TODA decisão ilegal é **rejeitada com motivo** e devolve o estado ORIGINAL, por referência: não
 * existe caminho em que meia decisão seja aplicada. É o mesmo padrão de `validarCompra` e de
 * `analisarMutacao` (devolver o problema em vez de abortar), com a diferença de que aqui a rejeição
 * também é dado do replay: reproduzir a partida reproduz as rejeições.
 */

/**
 * Índice `id → ItemDef` para preço e trilha. É um índice LOCAL sobre o mesmo dado — o preço e a
 * trilha continuam morando só em `shop/catalogo.ts`, e nenhum número de item é copiado para cá.
 * `agregar.ts` mantém um índice privado equivalente; exportá-lo de `shop/` seria mais limpo e fica
 * registrado como candidato de `e3.4`, porque tocar `src/shop/` (story `e3.1`, `Done`) não é escopo
 * desta story.
 */
const ITEM_POR_ID: ReadonlyMap<string, ItemDef> = new Map(CATALOGO.map((d) => [d.id, d]))

const IDS_DO_CATALOGO = CATALOGO.map((d) => d.id).join(', ')

// --------------------------------------------------------------------------- clonagem

/**
 * Clone manual e completo. `structuredClone` não é usado de propósito: ele copiaria QUALQUER coisa
 * que alguém acrescentasse ao estado, inclusive uma função ou um `Map`, e a lista literal abaixo é a
 * checagem de que `EstadoPartida` continua sendo dado puro serializável — que é o requisito da Fase
 * 4 (este objeto vai atravessar a rede). Um campo novo sem linha aqui é bug visível em teste, não
 * silêncio.
 *
 * Custo: roda entre rodadas e por decisão de tela, nunca por tick. `architecture.md` §7.1 proíbe
 * alocação no caminho quente; este caminho é frio por construção.
 */
function clonarPersonagem(p: EscolhaPersonagem): EscolhaPersonagem {
  return {
    charId: p.charId,
    abilityIndex: p.abilityIndex,
    passiveIndex: p.passiveIndex,
    itens: [...p.itens],
    revelado: p.revelado,
  }
}

function clonarJogador(j: EstadoJogador): EstadoJogador {
  return {
    ouro: j.ouro,
    vitorias: j.vitorias,
    personagens: [clonarPersonagem(j.personagens[0]), clonarPersonagem(j.personagens[1])],
  }
}

function clonar(e: EstadoPartida): EstadoPartida {
  return {
    seed: e.seed,
    fase: e.fase,
    rodada: e.rodada,
    regras: { ...e.regras },
    economia: { ...e.economia, rendaPorRodada: [...e.economia.rendaPorRodada] },
    jogadores: [clonarJogador(e.jogadores[0]), clonarJogador(e.jogadores[1])],
    draft: {
      pool: [...e.draft.pool],
      ordem: [...e.draft.ordem],
      passo: e.draft.passo,
      escolhas: e.draft.escolhas.map((x) => ({ jogador: x.jogador, charId: x.charId })),
    },
    historico: e.historico.map(clonarResultado),
    prontos: [e.prontos[0], e.prontos[1]],
  }
}

function clonarResultado(r: ResultadoRodada): ResultadoRodada {
  return {
    indice: r.indice,
    seedDaRodada: r.seedDaRodada,
    ladoDoJogador: [r.ladoDoJogador[0], r.ladoDoJogador[1]],
    vencedor: r.vencedor,
    ticks: r.ticks,
    hash: r.hash,
  }
}

/** Rejeição: estado ORIGINAL por referência, zero eventos, motivo preenchido. */
function rejeitar(e: EstadoPartida, erro: string): Transicao {
  return { estado: e, eventos: [], erro }
}

// --------------------------------------------------------------------------- construção

export interface OpcoesDePartida {
  seed: number
  /**
   * O roster disponível no draft, como DADO. `match/` **não importa `chars/`** (§2.2): quem conhece
   * o roster injeta, do mesmo jeito que `createWorld` recebe `Record<string, CharDef>`.
   */
  pool: string[]
  /** default: `ORDEM_SNAKE_2x2` (`[0,1,1,0]`, RF-01) */
  ordem?: Jogador[]
  /** default: `REGRAS_PADRAO` (Bo5, teto 7, alternância de lado ligada — R-06(b)) */
  regras?: RegrasPartida
  /** default: `ECONOMIA_PROVISORIA` (⚠️ D-09) */
  economia?: ParametrosEconomia
}

/**
 * Estado inicial da partida, na fase `draft`.
 *
 * **Sobre a fase inicial e R-03 (AC 19):** a resolução do usuário é "a loja **não abre** antes da
 * rodada 1" — o contraste é `builds` × `loja`, e ele é honrado ESTRUTURALMENTE: o único caminho para
 * a fase `loja` é `registrarRodada`, isto é, uma rodada já jogada. Não existe construtor, decisão ou
 * transição que produza `loja` antes da rodada 1, e é isso que mantém a curva econômica em 3,31
 * aberturas por partida (não 4,31). A fase `draft` precede `builds` porque a máquina de estados de
 * §11.1 e os ACs 12/13 exigem o draft exercitado; ela não é uma abertura de loja.
 *
 * Os `personagens` nascem com `charId` vazio e são preenchidos quando o draft fecha. Isso NÃO é um
 * estado intermediário que a UI precise tratar (§3.1 alerta contra inventar um): antes do fim do
 * draft a fase é `draft`, e a tela do draft desenha `draft.escolhas`, não `personagens`. E um estado
 * meio-draftado não alcança o motor: `setupDaRodada` recusa `charId` fora de `chars` antes de montar
 * qualquer `RoundSetup`.
 */
export function criarPartida(o: OpcoesDePartida): EstadoPartida {
  const ordem = o.ordem ?? ORDEM_SNAKE_2x2
  if (o.pool.length === 0) throw new Error('criarPartida: pool de draft vazio')
  for (const j of [0, 1] as Jogador[]) {
    const escolhasDoJogador = ordem.filter((x) => x === j).length
    if (escolhasDoJogador !== 2) {
      throw new Error(
        `criarPartida: a ordem de draft dá ${escolhasDoJogador} escolha(s) ao jogador ${j}, e ` +
          '`EstadoJogador.personagens` é uma tupla de 2. A ordem é dado (RF-01), mas dado incoerente ' +
          'com o tipo é erro de construção, não decisão ilegal em tempo de partida.',
      )
    }
  }
  return {
    seed: o.seed,
    fase: 'draft',
    rodada: 0,
    regras: o.regras ?? REGRAS_PADRAO,
    economia: o.economia ?? ECONOMIA_PROVISORIA,
    jogadores: [jogadorInicial(o.economia ?? ECONOMIA_PROVISORIA), jogadorInicial(o.economia ?? ECONOMIA_PROVISORIA)],
    draft: { pool: [...o.pool], ordem: [...ordem], passo: 0, escolhas: [] },
    historico: [],
    prontos: [false, false],
  }
}

function jogadorInicial(eco: ParametrosEconomia): EstadoJogador {
  return {
    ouro: eco.ouroInicial,
    vitorias: 0,
    personagens: [personagemVazio(), personagemVazio()],
  }
}

function personagemVazio(): EscolhaPersonagem {
  return { charId: '', abilityIndex: 0, passiveIndex: 0, itens: [], revelado: false }
}

// --------------------------------------------------------------------------- o redutor

export function aplicar(e: EstadoPartida, d: Decisao): Transicao {
  switch (d.t) {
    case 'draft':
      return aplicarDraft(e, d)
    case 'build':
      return aplicarBuild(e, d)
    case 'buildPadrao':
      return aplicarBuildPadrao(e, d)
    case 'compra':
      return aplicarCompra(e, d)
    case 'trocaDeBuild':
      return aplicarTrocaDeBuild(e, d)
    case 'pronto':
      return aplicarPronto(e, d)
  }
}

/**
 * §3.1 / §3.2 / R-01 opção B.
 *
 * **O `pool` NÃO é consumido, e isso é a decisão registrada, não um esquecimento.** Um snake de
 * verdade remove o escolhido do pool — e com 2 jogadores × 2 personagens são **4 escolhas de um pool
 * de 2**: na segunda escolha o pool acabaria e as escolhas 3 e 4 não teriam o que pegar (§3.2, a
 * aritmética que motivou R-01). A resolução do usuário (opção B) é "estrutura completa e genérica,
 * exercitada com composição fixa `[golem,vex]`, sem escolha real com efeito no resultado nesta
 * fase". `pool` e `ordem` são dados: quando o roster tiver 4+ personagens, a remoção é o parâmetro
 * que a story da Fase 5 liga — não uma reescrita desta função.
 */
function aplicarDraft(e: EstadoPartida, d: Extract<Decisao, { t: 'draft' }>): Transicao {
  if (e.fase !== 'draft') return rejeitar(e, `{t:'draft'} só é legal na fase draft (fase: ${e.fase})`)
  const vez = e.draft.ordem[e.draft.passo]
  if (vez === undefined) return rejeitar(e, 'draft já consumiu toda a ordem de escolhas')
  if (vez !== d.jogador) {
    return rejeitar(e, `não é a vez do jogador ${d.jogador} — a ordem snake dá o passo ${e.draft.passo} ao jogador ${vez}`)
  }
  if (!e.draft.pool.includes(d.charId)) {
    return rejeitar(e, `personagem '${d.charId}' não está no pool do draft (pool: ${e.draft.pool.join(', ')})`)
  }

  const n = clonar(e)
  n.draft.escolhas.push({ jogador: d.jogador, charId: d.charId })
  n.draft.passo++
  if (n.draft.passo === n.draft.ordem.length) fecharDraft(n)
  return { estado: n, eventos: [] }
}

/**
 * Fim do draft: cada jogador recebe seus dois `EscolhaPersonagem` na ORDEM EM QUE ESCOLHEU, com
 * `abilityIndex/passiveIndex` em 0/0 e `revelado: false` — as builds de verdade vêm na fase
 * `builds`, e o segredo de RF-05 começa fechado.
 */
function fecharDraft(n: EstadoPartida): void {
  for (const j of [0, 1] as Jogador[]) {
    const meus = n.draft.escolhas.filter((x) => x.jogador === j).map((x) => x.charId)
    n.jogadores[j].personagens = [
      { charId: meus[0], abilityIndex: 0, passiveIndex: 0, itens: [], revelado: false },
      { charId: meus[1], abilityIndex: 0, passiveIndex: 0, itens: [], revelado: false },
    ]
  }
  n.fase = 'builds'
}

/**
 * §4.1 — RF-03: 1 ativa de 2 + 1 passiva de 2, por personagem. A tupla de 2 em `AbilityDef`/
 * `PassiveDef` (`sim/types.ts`) garante a aritmética no compilador; aqui só se escolhe o índice.
 *
 * Rejeitada depois de `{t:'pronto'}`: "simultâneo" (RF-04) significa que a ORDEM das decisões não
 * muda o resultado, e reescrever a build depois de declarar pronto é exatamente o que quebraria
 * isso — o jogador que declarasse por último jogaria com informação a mais (o oponente já fechou).
 */
function aplicarBuild(e: EstadoPartida, d: Extract<Decisao, { t: 'build' }>): Transicao {
  if (e.fase !== 'builds') {
    return rejeitar(
      e,
      `{t:'build'} só é legal na fase builds (fase: ${e.fase}). Entre rodadas, trocar build é ` +
        "{t:'trocaDeBuild'} na loja, com custo em ouro (D-01, §4.3)",
    )
  }
  if (e.prontos[d.jogador]) return rejeitar(e, `jogador ${d.jogador} já declarou pronto — a build está fechada`)

  const n = clonar(e)
  const p = n.jogadores[d.jogador].personagens[d.slot]
  p.abilityIndex = d.abilityIndex
  p.passiveIndex = d.passiveIndex
  return { estado: n, eventos: [] }
}

/**
 * §4.2 / RF-06 / D-06 — **seleção default determinística, sem penalidade**: primeira ativa e
 * primeira passiva, para os dois personagens.
 *
 * A decisão existe para que o log de decisões (que é o replay) registre "o jogador não escolheu e a
 * default entrou", que é informação DIFERENTE de "o jogador escolheu a primeira opção" — e é
 * exatamente o sinal que D-06 diz que dispararia a mitigação ("se a default virar meta, randomizar a
 * ordem de exibição", nomeada e não implementada; se existir um dia, consome o stream 5/6 de §2.5).
 *
 * Ela também marca o jogador como PRONTO, e isso é a semântica do estouro de timer: a fase precisa
 * poder avançar sem mais nenhuma entrada daquele lado, senão o timeout não resolveria nada e a tela
 * ficaria travada esperando um `{t:'pronto'}` de quem já não estava respondendo.
 */
function aplicarBuildPadrao(e: EstadoPartida, d: Extract<Decisao, { t: 'buildPadrao' }>): Transicao {
  if (e.fase !== 'builds') return rejeitar(e, `{t:'buildPadrao'} só é legal na fase builds (fase: ${e.fase})`)
  if (e.prontos[d.jogador]) return rejeitar(e, `jogador ${d.jogador} já declarou pronto — a default não se aplica`)

  const n = clonar(e)
  for (const p of n.jogadores[d.jogador].personagens) {
    p.abilityIndex = 0
    p.passiveIndex = 0
  }
  n.prontos[d.jogador] = true
  const eventos: EventoPartida[] = [{ t: 'buildPadrao', rodada: n.rodada, jogador: d.jogador }]
  talvezAbrirARodada(n)
  return { estado: n, eventos }
}

/**
 * §7 / R-02 aprovada "por personagem": cada item comprado se aplica a **um personagem específico**
 * do jogador (`slot`), não ao time inteiro.
 *
 * **`validarCompra` roda AQUI, antes de a compra ser aceita** — não é opcional: é a aresta que fecha
 * ARCH-E31-003 (entrada bloqueante do gate de `e3.1`) e, por trás dela, ARCH-E30-002 do gate de
 * `e3.0` ("a responsabilidade de barrar `NaN`/`Infinity` em `itemBonus` é de quem POPULA o campo").
 * Duas razões pelas quais a checagem não é redundante com o `ITEM_POR_ID.get` acima:
 *
 *  1. `agregarItens` **ignora `id` desconhecido em silêncio**, por construção (o laço externo é o
 *     catálogo, não a lista de compra). Sem esta borda, o jogador pagaria por um item que não entra
 *     em bônus nenhum e nada acusaria.
 *  2. A lista validada é a lista FUTURA (`[...itens, itemId]`), não só o item novo. Uma compra nunca
 *     é aceita se ela deixar a lista do personagem inválida — o que cobre o caso de um estado vindo
 *     de fora (a persistência de build que `e3.4`/`e3.5` podem abrir), onde os itens anteriores não
 *     passaram por esta função.
 *
 * O ouro é debitado com aritmética inteira (§6.1): `preco` é inteiro validado por `validarCompra`
 * (`problemasDoItem` recusa preço não inteiro ou negativo), e `ouro` nasce inteiro.
 */
function aplicarCompra(e: EstadoPartida, d: Extract<Decisao, { t: 'compra' }>): Transicao {
  if (e.fase !== 'loja') {
    return rejeitar(
      e,
      `{t:'compra'} só é legal na fase loja (fase: ${e.fase}) — R-03: a loja não abre antes da rodada 1`,
    )
  }
  if (e.prontos[d.jogador]) return rejeitar(e, `jogador ${d.jogador} já declarou pronto — a loja está fechada para ele`)

  const def = ITEM_POR_ID.get(d.itemId)
  if (!def) return rejeitar(e, `item desconhecido '${d.itemId}'. Catálogo: ${IDS_DO_CATALOGO}`)

  const listaFutura = [...e.jogadores[d.jogador].personagens[d.slot].itens, d.itemId]
  const problemas = validarCompra(listaFutura)
  if (problemas.length > 0) {
    return rejeitar(e, `compra recusada por validarCompra (${problemas.length}): ${problemas.join(' | ')}`)
  }

  const ouro = e.jogadores[d.jogador].ouro
  if (ouro < def.preco) {
    return rejeitar(e, `ouro insuficiente: jogador ${d.jogador} tem ${ouro}, '${def.id}' custa ${def.preco}`)
  }

  const n = clonar(e)
  n.jogadores[d.jogador].ouro = ouro - def.preco
  n.jogadores[d.jogador].personagens[d.slot].itens.push(d.itemId)
  const eventos: EventoPartida[] = [
    {
      t: 'compra',
      rodada: n.rodada,
      jogador: d.jogador,
      itemId: def.id,
      trilha: def.trilha,
      preco: def.preco,
      ouroDepois: n.jogadores[d.jogador].ouro,
    },
  ]
  return { estado: n, eventos }
}

/**
 * §4.3 / RF-07 / D-01 — a build muda entre rodadas, com custo em ouro. Arquiteturalmente é uma
 * decisão de LOJA, não uma fase nova.
 *
 * Reabre `revelado: false` para aquele personagem porque **uma build trocada é informação nova**, e
 * o oponente só deve vê-la na largada seguinte (RF-05 aplicado a um caso que o design não previu
 * explicitamente — é a leitura conservadora).
 */
function aplicarTrocaDeBuild(e: EstadoPartida, d: Extract<Decisao, { t: 'trocaDeBuild' }>): Transicao {
  if (e.fase !== 'loja') {
    return rejeitar(e, `{t:'trocaDeBuild'} só é legal na fase loja (fase: ${e.fase}) — §4.3/D-01`)
  }
  if (e.prontos[d.jogador]) return rejeitar(e, `jogador ${d.jogador} já declarou pronto — a loja está fechada para ele`)

  const preco = e.economia.precoTrocaDeBuild
  const ouro = e.jogadores[d.jogador].ouro
  if (ouro < preco) {
    return rejeitar(e, `ouro insuficiente para trocar build: jogador ${d.jogador} tem ${ouro}, a troca custa ${preco}`)
  }

  const n = clonar(e)
  n.jogadores[d.jogador].ouro = ouro - preco
  const p = n.jogadores[d.jogador].personagens[d.slot]
  p.abilityIndex = d.abilityIndex
  p.passiveIndex = d.passiveIndex
  p.revelado = false
  const eventos: EventoPartida[] = [{ t: 'trocaDeBuild', rodada: n.rodada, jogador: d.jogador, preco }]
  return { estado: n, eventos }
}

/**
 * §4.1 — a fase acaba quando os DOIS jogadores emitiram `{t:'pronto'}`. Vale para `builds` e para
 * `loja`: nos dois casos o que se fecha é uma janela de decisão simultânea.
 */
function aplicarPronto(e: EstadoPartida, d: Extract<Decisao, { t: 'pronto' }>): Transicao {
  if (e.fase !== 'builds' && e.fase !== 'loja') {
    return rejeitar(e, `{t:'pronto'} só é legal nas fases builds e loja (fase: ${e.fase})`)
  }
  if (e.prontos[d.jogador]) return rejeitar(e, `jogador ${d.jogador} já declarou pronto`)

  const n = clonar(e)
  n.prontos[d.jogador] = true
  talvezAbrirARodada(n)
  return { estado: n, eventos: [] }
}

/**
 * A largada: com os dois prontos, a fase vira `rodada` e **todas as builds são reveladas** — é o que
 * RF-05 pede ("reveladas na largada") e o que fecha o segredo da troca de build da rodada anterior.
 */
function talvezAbrirARodada(n: EstadoPartida): void {
  if (!n.prontos[0] || !n.prontos[1]) return
  for (const j of n.jogadores) for (const p of j.personagens) p.revelado = true
  n.prontos = [false, false]
  n.fase = 'rodada'
}

// --------------------------------------------------------------------------- fim de rodada

/**
 * Registra o resultado de uma rodada JÁ SIMULADA e resolve Bo5 + D-02 + economia.
 *
 * `r.hash` chega **pronto** do chamador (`tools/harness.ts:75` no arnês, o cliente em `e3.4`):
 * `match/` não importa de `tools/`, e inverter essa seta criaria ciclo (§2.2).
 *
 * `controle` é o par de quem estava jogando cada JOGADOR, e ele existe por P3.1 (§10.1): a mediana
 * de duração que D-05 exige é medida com humano no controle, e as partidas bot × bot do `sim:check`
 * entram no mesmo fluxo de eventos. O default `['bot','bot']` é o conservador — esquecer o argumento
 * EXCLUI a rodada da mediana do humano em vez de contaminá-la, que é a direção de falha certa.
 */
export function registrarRodada(
  e: EstadoPartida,
  r: ResultadoRodada,
  controle: [Controle, Controle] = ['bot', 'bot'],
): Transicao {
  if (e.fase !== 'rodada') {
    return rejeitar(e, `registrarRodada só é legal na fase rodada (fase: ${e.fase})`)
  }
  if (r.indice !== e.rodada) {
    return rejeitar(e, `resultado é da rodada ${r.indice}, mas a partida está na rodada ${e.rodada}`)
  }

  const n = clonar(e)
  n.historico.push(clonarResultado(r))

  // RF-23: a vitória credita PLACAR, nunca ouro. Não existe `+= ouro` neste bloco, e a assinatura de
  // `creditar` (economia.ts) não recebe vitórias — o snowball voltaria só como mudança visível.
  if (r.vencedor !== -1) n.jogadores[r.vencedor].vitorias++

  const duracaoMs = r.ticks * TICK_MS
  const eventos: EventoPartida[] = [
    {
      t: 'rodadaFim',
      rodada: r.indice,
      duracaoMs,
      vencedor: r.vencedor,
      // a MESMA conta do arnês (§10.1): `ticks × TICK_MS >= SUDDEN_DEATH_MS`, os 60s de P3.2
      atingiu60s: duracaoMs >= SUDDEN_DEATH_MS,
      controle: [controle[0], controle[1]],
    },
  ]

  if (partidaAcabou(n, r.indice)) {
    n.fase = 'fim'
    eventos.push({ t: 'partidaFim', rodadas: n.historico.length, placar: placarDe(n) })
    return { estado: n, eventos }
  }

  n.rodada = r.indice + 1
  // D-02, literal: rodada empatada é NULA — ninguém pontua, **e a economia avança normalmente**.
  // Renda e juros são creditados como em qualquer rodada; o contrário premiaria o duplo-KO. Este
  // bloco é o único ponto de crédito da camada, e ele não olha `r.vencedor`.
  for (const j of [0, 1] as Jogador[]) {
    n.jogadores[j].ouro = creditar(n.economia, r.indice, n.jogadores[j].ouro)
  }
  n.fase = 'loja'
  n.prontos = [false, false]
  return { estado: n, eventos }
}
