import { CHARS } from '../chars/index.ts'
import { botCommands, createBot, type BotState } from '../bot/heuristic.ts'
import { criarPolitica, POLITICA_VERSION, type PoliticaPartida } from '../bot/partida.ts'
import type { Command } from '../sim/types.ts'
import type { PickSetup, RoundSetup } from '../sim/world.ts'
import {
  aplicar,
  criarPartida,
  ladosDaRodada,
  placarDe,
  registrarRodada,
  seedDaRodada,
  setupDaRodada,
  REGRAS_PADRAO,
  vencedorDaPartida,
  vencedorDaRodada,
  visaoPara,
  type Decisao,
  type EstadoPartida,
  type EventoPartida,
  type Jogador,
  type ResultadoRodada,
} from '../match/index.ts'
import { validarCatalogo } from '../shop/agregar.ts'
import { CATALOGO } from '../shop/catalogo.ts'
import { runRound, type RoundDriver, type RoundResult } from './harness.ts'

/**
 * REPLAY DE PARTIDA — Regra 3 de `docs/architecture-e3.md` §2.5, e o teste dirigido da story `e3.2`.
 *
 * Este arquivo é `tools/`, e a direção da seta é o motivo: §2.2 põe `tools/` ACIMA de `match/`
 * (`tools/ → sim/, chars/, bot/, match/, shop/`). Tudo que `match/` não pode conhecer mora aqui —
 * o `hash` (`harness.ts:75`), o roster concreto (`chars/`), o bot de combate (`bot/heuristic.ts`) e
 * o próprio laço de rodada. `match/` recebe o hash PRONTO em `registrarRodada`; se um dia aparecer
 * `import ... from '../tools/...'` dentro de `src/match/`, é regressão de fronteira (AC 28).
 *
 * O que ele prova, nesta ordem:
 *
 *  1. **Regra 3 (AC 8)** — uma partida Bo5 inteira é reproduzível a partir de
 *     `matchSeed + Decisao[] + (por rodada) Command[]`, sem bot nenhum na reprodução. Placar,
 *     sequência de vencedores e os hashes de TODAS as rodadas têm que bater.
 *  2. **Invariante M-1 (AC 7)** — reusar `BotState` entre rodadas CONTAMINA o resultado. Aqui a
 *     contaminação é medida, não afirmada: a mesma seed de rodada dá duração diferente conforme o
 *     que aconteceu antes.
 *  3. **RF-23 (AC 24)** — vencer a rodada não credita ouro. Provado comparando o ouro depois de
 *     registrar a MESMA rodada com vencedor 0, 1 e empate.
 *
 * **De onde vêm as decisões, e por que não de uma política** (esclarecimento do @po no AC 8): a
 * política de partida do bot (quem decide draft/build/compra) é `bot/partida.ts`, story `e3.3`.
 * Escrever uma mini-política aqui — ou pior, dentro de `match/` — violaria a fronteira 3 de §8.2
 * ("ela mora em `bot/`, não em `match/`") e criaria a política em dois lugares. O roteiro abaixo é
 * uma LISTA FIXA, deliberadamente burra: ela não olha o ouro, não avalia o estado e não tenta jogar
 * bem. É suficiente porque a Regra 3 mede reprodutibilidade, não qualidade de jogo. A mesma bateria
 * com a política real dos dois lados é critério de `e3.3`.
 */

/** RF-01 / R-01(B): roster de 2, os dois jogadores acabam com `[golem, vex]` (§3.2). */
const POOL = ['golem', 'vex']

/**
 * O roteiro do DRAFT. A ordem snake é `[0,1,1,0]` (`ORDEM_SNAKE_2x2`), então estas quatro decisões
 * são as únicas legais nesta sequência — qualquer troca de ordem seria rejeitada pelo redutor, o que
 * torna a lista autoverificável.
 */
const ROTEIRO_DRAFT: readonly Decisao[] = [
  { t: 'draft', jogador: 0, charId: 'golem' },
  { t: 'draft', jogador: 1, charId: 'golem' },
  { t: 'draft', jogador: 1, charId: 'vex' },
  { t: 'draft', jogador: 0, charId: 'vex' },
]

/**
 * O roteiro da fase `builds`. Escolhas assimétricas de propósito: o jogador 0 escolhe (e pega a
 * passiva Fantasma do Vex, `passiveIndex: 1`), o jogador 1 **não escolhe** e cai no
 * `{t:'buildPadrao'}` — que é a decisão que o estouro do timer de 30s produziria (§2.6, AC 11) e o
 * único jeito de exercitar esse caminho sem relógio nenhum dentro de `match/`.
 *
 * `buildPadrao` já marca o jogador 1 como pronto, então o `{t:'pronto'}` do jogador 0 vem por
 * último e é ele quem abre a rodada. A ordem importa só para a lista não conter decisões
 * natimortas — o resultado é o mesmo em qualquer ordem, que é justamente o que RF-04 exige.
 */
const ROTEIRO_BUILDS: readonly Decisao[] = [
  { t: 'build', jogador: 0, slot: 0, abilityIndex: 0, passiveIndex: 0 },
  { t: 'build', jogador: 0, slot: 1, abilityIndex: 0, passiveIndex: 1 },
  { t: 'buildPadrao', jogador: 1 },
  { t: 'pronto', jogador: 0 },
]

/**
 * O roteiro da LOJA, por índice de rodada. Tabela literal, sem nenhuma leitura de ouro — e isso é o
 * que faz dela fixture em vez de política.
 *
 * A consequência é deliberada: a rodada 1 abre a loja com **4 de ouro** (`ouroInicial 0` + renda
 * `[0] = 4`) e todo item custa 6, então as duas compras da rodada 1 são REJEITADAS por saldo. Isso
 * não é um defeito do roteiro, é cobertura: o caminho de rejeição do AC 3 entra no replay, e uma
 * rejeição reproduzida é tão vinculante quanto uma compra reproduzida — se o redutor aplicasse meia
 * decisão, o ouro do passo (ii) divergiria do passo (i) e o placar seguinte iria junto.
 *
 * A rodada 3 troca a build do Golem do jogador 0 (D-01, §4.3): custa 5 de ouro e reabre
 * `revelado: false` — o único caminho do teste que exercita a troca paga.
 */
const ROTEIRO_LOJA: Readonly<Record<number, readonly Decisao[]>> = {
  1: [
    { t: 'compra', jogador: 0, slot: 0, itemId: 'chumbo' },
    { t: 'compra', jogador: 1, slot: 0, itemId: 'lamina' },
  ],
  2: [
    { t: 'compra', jogador: 0, slot: 0, itemId: 'chumbo' },
    { t: 'compra', jogador: 1, slot: 1, itemId: 'lamina' },
  ],
  3: [
    { t: 'trocaDeBuild', jogador: 0, slot: 0, abilityIndex: 1, passiveIndex: 0 },
    { t: 'compra', jogador: 1, slot: 0, itemId: 'couraca' },
  ],
  4: [
    { t: 'compra', jogador: 0, slot: 1, itemId: 'turbina' },
    { t: 'compra', jogador: 1, slot: 0, itemId: 'luneta' },
  ],
  5: [
    { t: 'compra', jogador: 0, slot: 0, itemId: 'lixa' },
    { t: 'compra', jogador: 1, slot: 1, itemId: 'relicario' },
  ],
  6: [
    { t: 'compra', jogador: 0, slot: 1, itemId: 'borracha' },
    { t: 'compra', jogador: 1, slot: 0, itemId: 'chumbo' },
  ],
}

/** Guarda de laço: 7 rodadas × (loja + rodada) cabe folgado. Um roteiro que não avança trava aqui. */
const MAX_PASSOS = 64

function roteiroDaFase(e: EstadoPartida): readonly Decisao[] {
  switch (e.fase) {
    case 'draft':
      return ROTEIRO_DRAFT
    case 'builds':
      return ROTEIRO_BUILDS
    case 'loja':
      return [
        ...(ROTEIRO_LOJA[e.rodada] ?? []),
        { t: 'pronto', jogador: 0 },
        { t: 'pronto', jogador: 1 },
      ]
    default:
      return []
  }
}

// --------------------------------------------------------------------------- drivers de rodada

/**
 * **INVARIANTE M-1, por construção.** `RoundDriver` é uma FÁBRICA: `runRound` a invoca uma vez por
 * rodada, então os dois `BotState` nascem aqui dentro, com a seed DAQUELA rodada, e morrem com ela.
 * Não existe variável de `BotState` fora desta função em todo o caminho de partida — reusar exigiria
 * mover a criação para fora, que é exatamente o erro que `medirM1` abaixo mede.
 */
function driverNovo(): RoundDriver {
  return (s) => {
    const b0 = createBot(s.seed, 0)
    const b1 = createBot(s.seed, 1)
    return (view) => [...botCommands(view, b0), ...botCommands(view, b1)]
  }
}

/** O driver ERRADO, que só existe para `medirM1`: `BotState` vindo de fora, sobrevivendo à rodada. */
function driverComBots(b0: BotState, b1: BotState): RoundDriver {
  return () => (view) => [...botCommands(view, b0), ...botCommands(view, b1)]
}

/**
 * Passo (i): roda a rodada com o bot e grava o `Command[]` que ela consumiu. Envolver o driver, em
 * vez de reescrever o laço, mantém a gravação sobre EXATAMENTE os comandos que a partida consumiu —
 * mesmo padrão de `rodarComGravacao` em `determinism.ts`.
 */
function rodarRodada(setup: RoundSetup): { resultado: RoundResult; comandos: Command[] } {
  const comandos: Command[] = []
  const gravador: RoundDriver = (s) => {
    const tick = driverNovo()(s)
    return (view) => {
      const cmds = tick(view)
      comandos.push(...cmds)
      return cmds
    }
  }
  return { resultado: runRound(CHARS, setup, gravador), comandos }
}

/** Passo (ii): a mesma rodada, **sem bot algum** — só a linha do tempo de comandos gravada. */
function reproduzirRodada(setup: RoundSetup, comandos: readonly Command[]): RoundResult {
  return runRound(CHARS, setup, () => () => [...comandos])
}

// --------------------------------------------------------------------------- partida gravada

export interface RodadaGravada {
  /** o `RoundSetup` que `setupDaRodada` montou — guardado para o teste de poder discriminante */
  setup: RoundSetup
  comandos: Command[]
  resultado: ResultadoRodada
}

export interface PartidaGravada {
  matchSeed: number
  /** a linha do tempo de decisões — metade do replay de partida (RF-41 subido um nível, §2.3) */
  decisoes: Decisao[]
  rodadas: RodadaGravada[]
  placar: [number, number]
  vencedor: Jogador | -1
  eventos: EventoPartida[]
  /** decisões que o redutor REJEITOU, com o motivo. Elas também são dado do replay. */
  rejeicoes: string[]
}

export interface PartidaReproduzida {
  placar: [number, number]
  vencedor: Jogador | -1
  rodadas: ResultadoRodada[]
}

/**
 * Fecha uma rodada: monta o `RoundSetup` a partir do estado, roda, traduz TIME → JOGADOR e registra.
 *
 * O `hash` é calculado aqui, em `tools/`, e entregue pronto a `registrarRodada` (AC 28): `runRound`
 * devolve `hash(world)` de `harness.ts:75`, e `match/` só o guarda como `string`.
 */
function fecharRodada(
  e: EstadoPartida,
  comandos?: readonly Command[],
): {
  estado: EstadoPartida
  resultado: ResultadoRodada
  setup: RoundSetup
  comandos: Command[]
  eventos: EventoPartida[]
} {
  // o setup é RECALCULADO do estado, inclusive no replay: copiá-lo da gravação faria o teste passar
  // mesmo se `setupDaRodada` divergisse — e é ele que carrega a seed da rodada (Regra 1), o lado do
  // jogador (§5.3) e o `itemBonus` agregado das compras (§5.2).
  const setup = setupDaRodada(e, CHARS)
  const bruto = comandos
    ? { resultado: reproduzirRodada(setup, comandos), comandos: [...comandos] }
    : rodarRodada(setup)
  const resultadoBruto = bruto.resultado
  const usados = bruto.comandos

  const lados = ladosDaRodada(e)
  const r: ResultadoRodada = {
    indice: e.rodada,
    seedDaRodada: setup.seed,
    ladoDoJogador: lados,
    vencedor: vencedorDaRodada(lados, resultadoBruto.winner),
    ticks: resultadoBruto.ticks,
    hash: resultadoBruto.hash,
  }
  const t = registrarRodada(e, r, ['bot', 'bot'])
  if (t.erro) throw new Error(`registrarRodada recusou a rodada ${r.indice}: ${t.erro}`)
  return { estado: t.estado, resultado: r, setup, comandos: usados, eventos: t.eventos }
}

/** Passo (i) da Regra 3: a partida completa, com o bot no laço, gravando decisões e comandos. */
export function jogarPartida(matchSeed: number): PartidaGravada {
  let e = criarPartida({ seed: matchSeed, pool: POOL })
  const decisoes: Decisao[] = []
  const rejeicoes: string[] = []
  const eventos: EventoPartida[] = []
  const rodadas: RodadaGravada[] = []

  for (let passo = 0; e.fase !== 'fim'; passo++) {
    if (passo > MAX_PASSOS) {
      throw new Error(`partida ${matchSeed} não terminou em ${MAX_PASSOS} passos (fase ${e.fase})`)
    }
    if (e.fase === 'rodada') {
      const f = fecharRodada(e)
      rodadas.push({ setup: f.setup, comandos: f.comandos, resultado: f.resultado })
      eventos.push(...f.eventos)
      e = f.estado
      continue
    }
    for (const d of roteiroDaFase(e)) {
      decisoes.push(d)
      const t = aplicar(e, d)
      if (t.erro) rejeicoes.push(`r${e.rodada} ${e.fase} ${d.t}/j${d.jogador}: ${t.erro}`)
      eventos.push(...t.eventos)
      e = t.estado
    }
  }
  return {
    matchSeed,
    decisoes,
    rodadas,
    placar: placarDe(e),
    vencedor: vencedorDaPartida(e),
    eventos,
    rejeicoes,
  }
}

/**
 * Passo (ii) da Regra 3: **sem bot nenhum**. Só `matchSeed`, a lista de decisões gravada e o
 * `Command[]` por rodada. O roteiro não é consultado aqui — se a reprodução dependesse dele, o teste
 * estaria provando que a mesma função dá o mesmo resultado, que é trivialmente verdade.
 */
export function reproduzirPartida(g: PartidaGravada): PartidaReproduzida {
  let e = criarPartida({ seed: g.matchSeed, pool: POOL })
  const rodadas: ResultadoRodada[] = []
  let iDecisao = 0
  let iRodada = 0

  for (let passo = 0; e.fase !== 'fim'; passo++) {
    if (passo > MAX_PASSOS) throw new Error(`replay de ${g.matchSeed} não terminou (fase ${e.fase})`)
    if (e.fase === 'rodada') {
      const gravada = g.rodadas[iRodada++]
      if (!gravada) throw new Error(`replay de ${g.matchSeed} pediu a rodada ${iRodada} sem gravação`)
      const f = fecharRodada(e, gravada.comandos)
      rodadas.push(f.resultado)
      e = f.estado
      continue
    }
    const d = g.decisoes[iDecisao++]
    if (!d) throw new Error(`replay de ${g.matchSeed} ficou sem decisões antes do fim da partida`)
    e = aplicar(e, d).estado
  }
  return { placar: placarDe(e), vencedor: vencedorDaPartida(e), rodadas }
}

/** Passo (iii): placar, sequência de vencedores e os hashes de TODAS as rodadas. */
function compararPartida(g: PartidaGravada, r: PartidaReproduzida): string[] {
  const p: string[] = []
  const s = `matchSeed ${g.matchSeed}`
  if (g.placar[0] !== r.placar[0] || g.placar[1] !== r.placar[1]) {
    p.push(`  ✗ ${s}: placar ${g.placar.join('-')} != ${r.placar.join('-')}`)
  }
  if (g.vencedor !== r.vencedor) {
    p.push(`  ✗ ${s}: vencedor da partida ${g.vencedor} != ${r.vencedor}`)
  }
  if (g.rodadas.length !== r.rodadas.length) {
    p.push(`  ✗ ${s}: ${g.rodadas.length} rodada(s) gravada(s) != ${r.rodadas.length} reproduzida(s)`)
    return p
  }
  for (let i = 0; i < g.rodadas.length; i++) {
    const a = g.rodadas[i].resultado
    const b = r.rodadas[i]
    const campos: [string, string | number, string | number][] = [
      ['hash', a.hash, b.hash],
      ['ticks', a.ticks, b.ticks],
      ['vencedor', a.vencedor, b.vencedor],
      ['seedDaRodada', a.seedDaRodada, b.seedDaRodada],
      ['ladoDoJogador', a.ladoDoJogador.join(','), b.ladoDoJogador.join(',')],
    ]
    for (const [campo, esp, obt] of campos) {
      if (esp !== obt) p.push(`  ✗ ${s} rodada ${i}: ${campo} ${esp} != ${obt}`)
    }
  }
  return p
}

// --------------------------------------------------------------------------- partida por política

/**
 * D-c / ARCH-E33-001 (dívida de §12.1, paga em `e3.4`) — **`bot/partida.ts` não tinha um único
 * consumidor em `src/` nem uma linha de cobertura.** O arquivo inteiro (397 linhas, três políticas,
 * três tabelas provisórias) podia ser apagado sem que nada ficasse vermelho: `e3.3` entregou a
 * política e o `sim:check` continuou provando o replay do ROTEIRO FIXO, que não a chama.
 *
 * **Este bloco é SOMADO ao `ROTEIRO_*`, e não o substitui** — a instrução de §12.1 é literal, e o
 * motivo é medido: o roteiro fixo exercita `buildPadrao`, `trocaDeBuild` e o caminho de rejeição por
 * saldo, e a política v1 **não produz nenhum dos três** (`comprar` não emite `trocaDeBuild`, e ela
 * valida a lista futura antes de emitir, justamente para não gerar rejeição). Trocar um pelo outro
 * perderia cobertura em vez de ganhar.
 *
 * O condutor é o mesmo `jogarPartida`, com a lista de decisões vindo da política em vez da tabela.
 * `reproduzirPartida` funciona sobre o resultado sem uma linha de mudança, e isso não é sorte: ela
 * consome `decisoes` + `comandos` e **nunca consulta o roteiro** (é o ponto registrado na sua
 * própria doc), então uma partida conduzida por política é replayável pelo mesmo caminho.
 */
interface PoliticaDoJogador {
  politica: PoliticaPartida
  rand: () => number
}

function criarPoliticas(matchSeed: number): [PoliticaDoJogador, PoliticaDoJogador] {
  return [criarPolitica(matchSeed, 0), criarPolitica(matchSeed, 1)]
}

/**
 * As decisões que as duas políticas tomam na fase corrente.
 *
 * O draft devolve UMA decisão por passo (e não as quatro de uma vez) porque `draft.passo` avança a
 * cada aplicação e a política precisa ver o estado atualizado para não escolher o mesmo personagem
 * duas vezes — `escolherDraft` filtra por `v.draft.escolhas`, que só existe depois de aplicada a
 * anterior. O laço externo de `jogarPartida` reentra na fase, e `MAX_PASSOS` (64) cobre com folga as
 * 4 escolhas + 7 rodadas.
 *
 * `{t:'pronto'}` sai daqui, do CONDUTOR, e não da política: a interface de §8.2 tem três métodos e
 * fechar a janela de decisão não é um deles (registrado na doc de `comprar`).
 */
function decisoesPorPolitica(e: EstadoPartida, pol: readonly [PoliticaDoJogador, PoliticaDoJogador]): Decisao[] {
  switch (e.fase) {
    case 'draft': {
      const j = e.draft.ordem[e.draft.passo]
      const p = pol[j]
      return [{ t: 'draft', jogador: j, charId: p.politica.escolherDraft(visaoPara(e, j), p.rand) }]
    }
    case 'builds': {
      const ds: Decisao[] = []
      for (const j of [0, 1] as Jogador[]) {
        const p = pol[j]
        for (const slot of [0, 1] as (0 | 1)[]) {
          const b = p.politica.escolherBuild(visaoPara(e, j), slot, p.rand)
          ds.push({ t: 'build', jogador: j, slot, abilityIndex: b.abilityIndex, passiveIndex: b.passiveIndex })
        }
        ds.push({ t: 'pronto', jogador: j })
      }
      return ds
    }
    case 'loja': {
      const ds: Decisao[] = []
      for (const j of [0, 1] as Jogador[]) {
        const p = pol[j]
        ds.push(...p.politica.comprar(visaoPara(e, j), p.rand))
        ds.push({ t: 'pronto', jogador: j })
      }
      return ds
    }
    default:
      return []
  }
}

/**
 * A partida inteira conduzida pelas duas políticas de `bot/partida.ts`.
 *
 * `recriarPorVisita` existe **só** para a guarda de D-d: quando `true`, as políticas são recriadas a
 * cada visita à loja, que é exatamente a quebra da invariante "uma política por PARTIDA" que
 * `criarPolitica` declara em comentário. Nenhum caminho de produção passa `true`.
 */
function jogarPartidaComPolitica(matchSeed: number, recriarPorVisita = false): PartidaGravada {
  let e = criarPartida({ seed: matchSeed, pool: POOL })
  let pol = criarPoliticas(matchSeed)
  const decisoes: Decisao[] = []
  const rejeicoes: string[] = []
  const eventos: EventoPartida[] = []
  const rodadas: RodadaGravada[] = []

  for (let passo = 0; e.fase !== 'fim'; passo++) {
    if (passo > MAX_PASSOS) {
      throw new Error(`partida por política ${matchSeed} não terminou em ${MAX_PASSOS} passos (fase ${e.fase})`)
    }
    if (e.fase === 'rodada') {
      const f = fecharRodada(e)
      rodadas.push({ setup: f.setup, comandos: f.comandos, resultado: f.resultado })
      eventos.push(...f.eventos)
      e = f.estado
      continue
    }
    if (e.fase === 'loja' && recriarPorVisita) pol = criarPoliticas(matchSeed)
    for (const d of decisoesPorPolitica(e, pol)) {
      decisoes.push(d)
      const t = aplicar(e, d)
      if (t.erro) rejeicoes.push(`r${e.rodada} ${e.fase} ${d.t}/j${d.jogador}: ${t.erro}`)
      eventos.push(...t.eventos)
      e = t.estado
    }
  }
  return {
    matchSeed,
    decisoes,
    rodadas,
    placar: placarDe(e),
    vencedor: vencedorDaPartida(e),
    eventos,
    rejeicoes,
  }
}

/**
 * D-c + D-d (segunda metade) — a política tem consumidor, é replayável, e recriá-la por visita à
 * loja é DETECTÁVEL.
 *
 * Três coisas medidas, nesta ordem:
 *
 *  1. **Cobertura (D-c):** a partida conduzida pelas políticas reais termina e se reproduz sem bot
 *     nenhum, pelo mesmo `reproduzirPartida`. Se `bot/partida.ts` for apagado ou quebrado, isto fica
 *     vermelho — que é precisamente o que não acontecia antes.
 *  2. **Poder discriminante da cobertura:** a partida por política precisa ter COMPRADO alguma
 *     coisa. Sem esta linha, uma política que devolvesse `[]` em `comprar` passaria verde e o item 1
 *     estaria provando o replay de uma política que não decide nada — a mesma armadilha que a
 *     `ponte itemBonus` cobre para a agregação de `shop/`.
 *  3. **Invariante "uma política por PARTIDA" (D-d):** a MESMA partida, com as políticas recriadas a
 *     cada visita à loja, tem que DIVERGIR. `criarPolitica` explica por quê — recriar reinicia o
 *     stream, todo desempate volta ao mesmo sorteio e o bot compra sempre o mesmo item. Era
 *     invariante declarada em comentário e sem guarda: quebrá-la degrada o bot em silêncio e passa
 *     verde em qualquer teste de reprodutibilidade, porque as duas execuções degradariam igual.
 */
function invariantePolitica(): { linhas: string[]; problemas: string[] } {
  const linhas: string[] = []
  const problemas: string[] = []
  let divergiram = 0
  let comprasTotais = 0

  for (const matchSeed of MATCH_SEEDS) {
    const gravada = jogarPartidaComPolitica(matchSeed)
    problemas.push(...compararPartida(gravada, reproduzirPartida(gravada)))

    const compras = gravada.decisoes.filter((d) => d.t === 'compra').length
    comprasTotais += compras

    const porVisita = jogarPartidaComPolitica(matchSeed, true)
    const mesmasDecisoes =
      JSON.stringify(porVisita.decisoes) === JSON.stringify(gravada.decisoes)
    if (!mesmasDecisoes) divergiram++

    linhas.push(
      `  matchSeed ${String(matchSeed).padStart(5)} · ${gravada.rodadas.length} rodada(s) · placar ` +
        `${gravada.placar.join('-')} · ${gravada.decisoes.length} decisões · ${compras} compra(s) · ` +
        `${gravada.rejeicoes.length} rejeitada(s) · recriar por visita ${mesmasDecisoes ? 'IGUAL ✗' : 'diverge ✓'}`,
    )
  }

  if (comprasTotais === 0) {
    problemas.push(
      '  ✗ política: NENHUMA compra em nenhuma das partidas conduzidas pela política — `comprar` ' +
        'devolveu vazio o tempo todo, e o replay acima está provando a reprodutibilidade de uma ' +
        'política que não decide nada (D-c, ARCH-E33-001).',
    )
  }
  if (divergiram === 0) {
    problemas.push(
      `  ✗ política: recriar a política a cada visita à loja NÃO mudou as decisões em ` +
        `${MATCH_SEEDS.length} seed(s) — a invariante "uma política por PARTIDA" perdeu poder ` +
        'discriminante, ou o estado da política deixou de viver no gerador (D-d, ARCH-E33-004). ' +
        'Ver a doc de `criarPolitica` em `bot/partida.ts`.',
    )
  }

  return { linhas, problemas }
}

// --------------------------------------------------------------------------- invariante M-1

const TIME_M1: PickSetup[] = [
  { charId: 'golem', abilityIndex: 0, passiveIndex: 0 },
  { charId: 'vex', abilityIndex: 0, passiveIndex: 0 },
]

interface MedidaM1 {
  matchSeed: number
  novo: RoundResult
  reusado: RoundResult
  divergiu: boolean
}

/**
 * §2.5, Regra 2 — a medição que sustenta M-1, refeita aqui em vez de citada.
 *
 * A rodada 1 de uma partida é rodada DUAS vezes, com a mesma seed de rodada e a mesma composição:
 * uma com `BotState` limpo e uma com o `BotState` que já jogou a rodada 0. O documento de arquitetura
 * mediu 1 159 ticks (novo) contra 920 (reusado) — números daquele cenário, não deste; o que este
 * teste exige é a DIVERGÊNCIA, que é o fato invariante.
 *
 * A causa é estrutural e está em `heuristic.ts:90-102`: `BotState.porBola` guarda
 * `proximaDecisaoTick` e `prontoDesdeUlt`, que são relógios ABSOLUTOS. Carregados para uma rodada
 * que recomeça no tick 0, eles agendam a próxima decisão para um tick que já passou — o bot fica
 * mudo até lá. Não é um viés sutil: é meia rodada sem política.
 *
 * ---
 *
 * **D-a / ARCH-E32-001 (dívida de §12.1, paga em `e3.4`) — a versão anterior desta função mudava
 * DUAS coisas de uma vez e creditava a divergência à errada.** Ela comparava `driverNovo()` sobre
 * `setup1` (que semeia os bots com `s1`, porque `driverNovo` lê `setup.seed`) contra um par sujo
 * semeado com `s0`. Seed e sujeira variavam juntas, e o gate mediu que a seed sozinha já basta: dois
 * bots LIMPOS, um com `s0` e outro com `s1`, divergem em 8/8 seeds. O ramo de falha era portanto
 * inalcançável — a linha "contamina em N/N" saía verde mesmo que reusar `BotState` fosse inofensivo,
 * e a guarda media diferença de seed enquanto afirmava medir contaminação.
 *
 * A correção é isolar a variável: **os dois pares nascem com a MESMA seed (`s0`)** e a única
 * diferença passa a ser a rodada 0 rodada por cima de um deles. `novo` deixa de usar `driverNovo()`
 * de propósito — é justamente o acoplamento `seed do bot = seed do setup` daquela fábrica que
 * impedia a comparação limpa.
 */
function medirM1(matchSeed: number): MedidaM1 {
  const s0 = seedDaRodada(matchSeed, 0)
  const s1 = seedDaRodada(matchSeed, 1)
  const setup0: RoundSetup = { seed: s0, teams: [TIME_M1, TIME_M1] }
  const setup1: RoundSetup = { seed: s1, teams: [TIME_M1, TIME_M1] }

  // par de controle: limpo, semeado com `s0`, jogando a rodada 1 direto
  const limpo0 = createBot(s0, 0)
  const limpo1 = createBot(s0, 1)
  const novo = runRound(CHARS, setup1, driverComBots(limpo0, limpo1))

  // par de tratamento: MESMA seed, mas passa pela rodada 0 antes — a única diferença é a sujeira
  const sujo0 = createBot(s0, 0)
  const sujo1 = createBot(s0, 1)
  runRound(CHARS, setup0, driverComBots(sujo0, sujo1)) // a rodada 0 suja o estado
  const reusado = runRound(CHARS, setup1, driverComBots(sujo0, sujo1))

  return { matchSeed, novo, reusado, divergiu: novo.hash !== reusado.hash || novo.ticks !== reusado.ticks }
}

// --------------------------------------------------------------------------- invariante RF-23

/**
 * RF-23 / AC 24 — **vencer a rodada não dá ouro**, e o empate não pune.
 *
 * A mesma rodada (mesmo índice, mesmos ticks, mesmo hash) é registrada três vezes, mudando SÓ o
 * vencedor: jogador 0, jogador 1 e empate. Se qualquer caminho creditasse por vitória, os três
 * saldos divergiriam. O caso `-1` cobre a segunda metade de D-02 (AC 17): rodada empatada é nula
 * para o placar **e a economia avança normalmente** — o contrário premiaria o duplo-KO.
 *
 * De quebra confere RF-22 (renda IGUAL para os dois jogadores): os dois saldos de cada caso têm que
 * ser idênticos entre si, não só entre casos.
 */
function invarianteRF23(): { linha: string; problemas: string[] } {
  let e = criarPartida({ seed: 4242, pool: POOL })
  for (const d of [...ROTEIRO_DRAFT, ...ROTEIRO_BUILDS]) e = aplicar(e, d).estado
  if (e.fase !== 'rodada') {
    return { linha: '', problemas: [`  ✗ RF-23: o roteiro não chegou à fase rodada (fase ${e.fase})`] }
  }

  const base = {
    indice: 0,
    seedDaRodada: 12345,
    ladoDoJogador: [0, 1] as [0 | 1, 0 | 1],
    ticks: 800,
    hash: 'aaaaaaaa',
  }
  const casos: (Jogador | -1)[] = [0, 1, -1]
  const saldos = casos.map((vencedor) => {
    const t = registrarRodada(e, { ...base, vencedor })
    if (t.erro) throw new Error(`RF-23: registrarRodada recusou (vencedor ${vencedor}): ${t.erro}`)
    return t.estado.jogadores.map((j) => j.ouro) as [number, number]
  })

  const problemas: string[] = []
  const ref = saldos[0]
  for (let i = 0; i < casos.length; i++) {
    const s = saldos[i]
    if (s[0] !== s[1]) {
      problemas.push(
        `  ✗ RF-22 (vencedor ${casos[i]}): renda desigual entre jogadores — ${s[0]} vs ${s[1]}`,
      )
    }
    if (s[0] !== ref[0] || s[1] !== ref[1]) {
      problemas.push(
        `  ✗ RF-23 (vencedor ${casos[i]}): ouro ${s.join('/')} != ${ref.join('/')} do caso vencedor ${casos[0]} — ` +
          'há um caminho creditando por vitória',
      )
    }
  }
  const linha = `vencedor 0 → ${saldos[0].join('/')} · vencedor 1 → ${saldos[1].join('/')} · empate → ${saldos[2].join('/')}`
  return { linha, problemas }
}

// ------------------------------------------------ poder discriminante da ponte shop → match → sim

/**
 * **A ponte de §5.2 carrega peso? (AC 4)** — este é o teste que impede o resto do arquivo de passar
 * verde pelo motivo errado.
 *
 * O risco é concreto e já mordeu antes: o `sim:check` roda desde `e2.0` sem que NENHUMA seed
 * exercite `itemBonus`. Um `setupDaRodada` que esquecesse `agregarItens` — ou que passasse `{}` —
 * produziria um replay perfeitamente reproduzível e um golden hash intacto. "Reproduzível" e
 * "correto" são propriedades diferentes, e a Regra 3 só mede a primeira.
 *
 * A medição isola `itemBonus` e nada mais: a MESMA rodada, a MESMA seed e os MESMOS comandos
 * gravados, rodados duas vezes — uma com o `itemBonus` que as compras produziram, outra com ele
 * removido. Se os hashes forem iguais, ou as compras não chegaram ao motor, ou não fazem diferença
 * nenhuma; nos dois casos o teste de replay estaria protegendo uma ponte oca.
 */
interface MedidaItemBonus {
  matchSeed: number
  rodadasComItem: number
  divergiram: number
}

function semItemBonus(setup: RoundSetup): RoundSetup {
  return {
    seed: setup.seed,
    teams: setup.teams.map((time) =>
      time.map((p) => ({ charId: p.charId, abilityIndex: p.abilityIndex, passiveIndex: p.passiveIndex })),
    ) as RoundSetup['teams'],
  }
}

function temItemBonus(setup: RoundSetup): boolean {
  return setup.teams.some((time) => time.some((p) => Object.keys(p.itemBonus ?? {}).length > 0))
}

function medirItemBonus(g: PartidaGravada): MedidaItemBonus {
  let rodadasComItem = 0
  let divergiram = 0
  for (const r of g.rodadas) {
    if (!temItemBonus(r.setup)) continue
    rodadasComItem++
    const com = reproduzirRodada(r.setup, r.comandos)
    const sem = reproduzirRodada(semItemBonus(r.setup), r.comandos)
    if (com.hash !== sem.hash) divergiram++
  }
  return { matchSeed: g.matchSeed, rodadasComItem, divergiram }
}

// --------------------------------------------------------------------------- segredo por projeção

/**
 * AC 9 / AC 10 — `visaoPara` esconde a build NÃO revelada do oponente, e **não** esconde as compras.
 *
 * A verificação é sobre as CHAVES do objeto, não sobre valores: o tipo `PersonagemVisivel` já torna
 * o vazamento erro de compilação, e este teste é a segunda linha de defesa em runtime — o que o
 * compilador não cobre é `JSON.stringify` da visão indo pela rede na Fase 4. Por isso a checagem
 * final é feita sobre o texto serializado, que é literalmente o que o servidor enviaria.
 */
function invarianteVisao(): { linha: string; problemas: string[] } {
  const problemas: string[] = []
  let e = criarPartida({ seed: 777, pool: POOL })
  for (const d of ROTEIRO_DRAFT) e = aplicar(e, d).estado

  // fase `builds`: o jogador 0 escolhe uma build NÃO default, e nada foi revelado ainda.
  e = aplicar(e, { t: 'build', jogador: 0, slot: 0, abilityIndex: 1, passiveIndex: 1 }).estado
  const fechada = visaoPara(e, 1)
  for (const [i, p] of fechada.oponente.personagens.entries()) {
    if (p.revelado) {
      problemas.push(`  ✗ visaoPara: personagem ${i} do oponente já vem revelado na fase builds`)
      continue
    }
    for (const chave of ['abilityIndex', 'passiveIndex']) {
      if (chave in p) problemas.push(`  ✗ visaoPara: '${chave}' presente no personagem ${i} com revelado=false`)
    }
    if (!('itens' in p)) {
      problemas.push(`  ✗ visaoPara: 'itens' AUSENTE no personagem ${i} — compras não são secretas (AC 10)`)
    }
  }
  // o serializado é o que a Fase 4 enviaria: a build escolhida (1/1) não pode aparecer em lugar
  // nenhum do ramo do oponente
  const texto = JSON.stringify(fechada.oponente)
  if (texto.includes('abilityIndex') || texto.includes('passiveIndex')) {
    problemas.push(`  ✗ visaoPara: a serialização do oponente contém a build fechada — ${texto}`)
  }

  // depois da largada (os dois prontos), RF-05 manda revelar
  e = aplicar(e, { t: 'buildPadrao', jogador: 1 }).estado
  e = aplicar(e, { t: 'pronto', jogador: 0 }).estado
  const aberta = visaoPara(e, 1)
  const p0 = aberta.oponente.personagens[0]
  if (!p0.revelado) {
    problemas.push('  ✗ visaoPara: a build do oponente continua fechada DEPOIS da largada (RF-05)')
  } else if (p0.abilityIndex !== 1 || p0.passiveIndex !== 1) {
    problemas.push(
      `  ✗ visaoPara: build revelada errada — ${p0.abilityIndex}/${p0.passiveIndex}, esperado 1/1`,
    )
  }
  // AC 9: `eu` é o estado completo do próprio jogador, sem projeção
  if (aberta.eu !== e.jogadores[1]) {
    problemas.push('  ✗ visaoPara: `eu` não é o EstadoJogador do jogador pedido')
  }

  return {
    linha: `builds → oponente sem build (chaves: ${Object.keys(fechada.oponente.personagens[0]).join(',')}) · largada → revelado`,
    problemas,
  }
}

// --------------------------------------------------------------- razão de ouro / meia decisão

/**
 * AC 3 + AC 21 + AC 22 — **o que o replay estruturalmente NÃO pega.**
 *
 * A Regra 3 mede reprodutibilidade, e reprodutibilidade é cega a erro CONSISTENTE: um `aplicar` que
 * nunca debitasse ouro erraria igual nos dois passos, o replay bateria e a bateria passaria verde.
 * Medido nesta story com bateria negativa — das cinco mutações injetadas em `match/`, esta foi a
 * única que o replay deixou passar. Daí este teste dirigido, que confere VALORES em vez de
 * igualdade entre execuções.
 *
 * O caso da rejeição é o mais importante dos três: ele compara o estado por **referência**
 * (`===`), não por conteúdo. `rejeitar` devolve o estado ORIGINAL sem clonar, então identidade
 * referencial é a prova mais forte disponível de que nada foi aplicado pela metade (§2.3) — um
 * clone com um campo alterado passaria numa comparação campo a campo mal escrita.
 */
function invarianteCompra(): { linha: string; problemas: string[] } {
  const problemas: string[] = []
  let e = criarPartida({ seed: 31337, pool: POOL })
  for (const d of [...ROTEIRO_DRAFT, ...ROTEIRO_BUILDS]) e = aplicar(e, d).estado

  // duas rodadas fictícias para chegar à loja com saldo: 0 → renda[0]=4 → renda[1]=5 ⇒ 9 de ouro.
  // O hash/ticks aqui são irrelevantes (nenhuma rodada é simulada): o que se exercita é a economia.
  const fake = (indice: number): ResultadoRodada => ({
    indice,
    seedDaRodada: 1,
    ladoDoJogador: [0, 1],
    vencedor: -1,
    ticks: 600,
    hash: 'bbbbbbbb',
  })
  for (const i of [0, 1]) {
    e = registrarRodada(e, fake(i)).estado
    if (i === 0) {
      e = aplicar(e, { t: 'pronto', jogador: 0 }).estado
      e = aplicar(e, { t: 'pronto', jogador: 1 }).estado
    }
  }
  if (e.fase !== 'loja') {
    return { linha: '', problemas: [`  ✗ compra: esperava fase loja, veio ${e.fase}`] }
  }
  const antes = e.jogadores[0].ouro
  if (antes !== 9) problemas.push(`  ✗ economia: saldo na 2ª loja é ${antes}, esperado 9 (0 +4 +5, juros 0)`)

  // --- caso A: compra aceita
  const tA = aplicar(e, { t: 'compra', jogador: 0, slot: 0, itemId: 'chumbo' })
  if (tA.erro) problemas.push(`  ✗ compra: recusada com ${antes} de ouro — ${tA.erro}`)
  const evA = tA.eventos.find((x) => x.t === 'compra')
  const depoisA = tA.estado.jogadores[0].ouro
  if (evA?.t === 'compra') {
    if (antes - depoisA !== evA.preco) {
      problemas.push(
        `  ✗ compra: ouro caiu ${antes - depoisA}, mas o item custa ${evA.preco} — o débito não bate o preço (AC 22)`,
      )
    }
    if (evA.ouroDepois !== depoisA) {
      problemas.push(`  ✗ compra: evento diz ouroDepois ${evA.ouroDepois}, estado tem ${depoisA}`)
    }
  } else {
    problemas.push('  ✗ compra: nenhum EventoPartida `compra` emitido (AC 26)')
  }
  if (tA.estado.jogadores[0].personagens[0].itens.join() !== 'chumbo') {
    problemas.push(
      `  ✗ compra: itens do personagem 0 são [${tA.estado.jogadores[0].personagens[0].itens.join()}], esperado [chumbo]`,
    )
  }
  if (tA.estado.jogadores[0].personagens[1].itens.length !== 0) {
    problemas.push('  ✗ compra: o item vazou para o outro personagem — R-02 é "por personagem" (AC 20)')
  }

  // --- caso B: troca de build, do MESMO estado base
  const tB = aplicar(e, { t: 'trocaDeBuild', jogador: 0, slot: 0, abilityIndex: 1, passiveIndex: 1 })
  const evB = tB.eventos.find((x) => x.t === 'trocaDeBuild')
  if (evB?.t === 'trocaDeBuild') {
    const gasto = antes - tB.estado.jogadores[0].ouro
    if (gasto !== e.economia.precoTrocaDeBuild || evB.preco !== e.economia.precoTrocaDeBuild) {
      problemas.push(
        `  ✗ trocaDeBuild: gastou ${gasto} e o evento diz ${evB.preco}, esperado ${e.economia.precoTrocaDeBuild} (D-01)`,
      )
    }
  } else {
    problemas.push(`  ✗ trocaDeBuild: recusada ou sem evento — ${tB.erro ?? 'sem erro'}`)
  }
  if (tB.estado.jogadores[0].personagens[0].revelado) {
    problemas.push('  ✗ trocaDeBuild: não reabriu `revelado: false` — build trocada é informação nova (AC 21)')
  }

  // --- caso C: rejeição não aplica NADA (AC 3)
  const semSaldo = aplicar(tA.estado, { t: 'compra', jogador: 0, slot: 0, itemId: 'lamina' })
  if (!semSaldo.erro) {
    problemas.push(`  ✗ compra: aceita com ${depoisA} de ouro para um item de 6 — ouro pode ficar negativo`)
  }
  if (semSaldo.estado !== tA.estado) {
    problemas.push('  ✗ rejeição: devolveu um estado NOVO — `rejeitar` tem que devolver o original por referência')
  }
  if (semSaldo.eventos.length !== 0) {
    problemas.push(`  ✗ rejeição: emitiu ${semSaldo.eventos.length} evento(s) — decisão recusada não é telemetria`)
  }

  // --- fase errada: a loja NÃO abre antes da rodada 1 (R-03, AC 19)
  const recemCriada = criarPartida({ seed: 1, pool: POOL })
  const compraNoDraft = aplicar(recemCriada, { t: 'compra', jogador: 0, slot: 0, itemId: 'chumbo' })
  if (!compraNoDraft.erro) {
    problemas.push('  ✗ compra: aceita fora da fase loja — R-03 diz que a loja não abre antes da rodada 1 (AC 19)')
  }

  return {
    linha: `loja com ${antes} de ouro → compra de 6 deixa ${depoisA} · troca de build custa ${e.economia.precoTrocaDeBuild} e refecha o segredo · compra sem saldo devolve o estado original`,
    problemas,
  }
}

// --------------------------------------------------------------------------- bateria

/** As três seeds-mãe de §2.5 (as mesmas em que a descorrelação de `deriveSeed` foi verificada). */
const MATCH_SEEDS = [1, 2, 12345]

export function verificarPartida(): { linhas: string[]; problemas: string[] } {
  const linhas: string[] = []
  const problemas: string[] = []

  // ---- ARCH-E31-003 (gate de `e3.1`, MEDIUM, bloqueante): a outra metade.
  // `validarCompra` ganhou dois chamadores de produção nesta story (`aplicar` e `setupDaRodada`),
  // mas `validarCatalogo` continuava exportada sem ninguém a chamar — uma checagem que nunca roda
  // é documentação com custo de manutenção. O chamador certo é este: ela audita o CATÁLOGO, que é
  // dado estático, então o lugar dela é a bateria, não o caminho de jogo (rodá-la por compra seria
  // pagar a varredura dos oito itens em toda decisão de loja).
  const problemasCatalogo = validarCatalogo()
  for (const p of problemasCatalogo) problemas.push(`  ✗ catálogo: ${p}`)
  linhas.push(
    `catálogo       ${problemasCatalogo.length === 0 ? `✓ ok — ${CATALOGO.length} itens íntegros (validarCatalogo, ARCH-E31-003)` : `✗ ${problemasCatalogo.length} problema(s)`}`,
  )

  // ---- Regra 3: replay de partida
  const desviosReplay: string[] = []
  const medidasItem: MedidaItemBonus[] = []
  for (const matchSeed of MATCH_SEEDS) {
    const gravada = jogarPartida(matchSeed)
    const reproduzida = reproduzirPartida(gravada)
    desviosReplay.push(...compararPartida(gravada, reproduzida))
    medidasItem.push(medirItemBonus(gravada))

    const vencedores = gravada.rodadas.map((r) => r.resultado.vencedor).join(' ')
    const lados = gravada.rodadas.map((r) => r.resultado.ladoDoJogador.join('')).join(' ')
    linhas.push(
      `  matchSeed ${String(matchSeed).padStart(5)} · ${gravada.rodadas.length} rodada(s) · placar ` +
        `${gravada.placar.join('-')} · vencedor ${gravada.vencedor} · venc/rodada [${vencedores}] · ` +
        `lados [${lados}] · ${gravada.decisoes.length} decisões · ${gravada.rejeicoes.length} rejeitada(s)`,
    )

    // A partida tem que ter terminado por uma das duas portas de D-02 (AC 16), e não por acidente
    // do roteiro: ou alguém chegou a `vitoriasParaVencer`, ou o `tetoDeRodadas` fechou.
    //
    // D-b / ARCH-E32-004 (dívida de §12.1, paga em `e3.4`): estes dois números eram os literais `3`
    // e `7`. §5.1 é explícita em que as regras são DADO e não constante enterrada no código, e esta
    // guarda derruba o `sim:check` inteiro quando falha — com os literais, o dia em que `e3.7`
    // mexesse em `vitoriasParaVencer` produziria um FALSO FAIL num bloco vermelho de bateria, com a
    // mensagem apontando para D-02 em vez de para o ajuste que foi de fato feito. `jogarPartida` usa
    // `criarPartida({seed, pool})` sem sobrescrever `regras`, então `REGRAS_PADRAO` é literalmente o
    // objeto em vigor na partida gravada.
    const { vitoriasParaVencer, tetoDeRodadas } = REGRAS_PADRAO
    const [v0, v1] = gravada.placar
    const porVitorias = v0 >= vitoriasParaVencer || v1 >= vitoriasParaVencer
    const porTeto = gravada.rodadas.length === tetoDeRodadas
    if (!porVitorias && !porTeto) {
      problemas.push(
        `  ✗ matchSeed ${matchSeed}: partida acabou com placar ${v0}-${v1} em ${gravada.rodadas.length} ` +
          `rodada(s) — não bate nem ${vitoriasParaVencer} vitórias nem o teto de ${tetoDeRodadas} (D-02, AC 16)`,
      )
    }
    // AC 15 / §5.3 — a alternância de lado tem que estar de fato acontecendo, senão o replay estaria
    // provando reprodutibilidade de um mecanismo desligado.
    if (gravada.rodadas.length >= 2) {
      const l0 = gravada.rodadas[0].resultado.ladoDoJogador.join('')
      const l1 = gravada.rodadas[1].resultado.ladoDoJogador.join('')
      if (l0 === l1) {
        problemas.push(`  ✗ matchSeed ${matchSeed}: o lado não alternou entre as rodadas 0 e 1 (${l0})`)
      }
    }
  }
  problemas.push(...desviosReplay)
  linhas.push(
    `replay partida ${desviosReplay.length === 0 ? `✓ ok — ${MATCH_SEEDS.length} partidas Bo5 reproduzidas sem bot (placar, vencedores e hashes de todas as rodadas)` : `✗ ${desviosReplay.length} desvio(s)`}`,
  )

  // ---- Poder discriminante: as compras chegam ao motor e MOVEM a rodada?
  const rodadasComItem = medidasItem.reduce((s, m) => s + m.rodadasComItem, 0)
  const itemDivergiram = medidasItem.reduce((s, m) => s + m.divergiram, 0)
  if (rodadasComItem === 0) {
    problemas.push(
      '  ✗ itemBonus: NENHUMA rodada das partidas roteirizadas chegou ao motor com itemBonus não ' +
        'vazio — o roteiro deixou de comprar (saldo, preço ou fase mudaram) e o replay acima está ' +
        'provando reprodutibilidade de uma ponte que não carrega peso (AC 4, §5.2).',
    )
  } else if (itemDivergiram === 0) {
    problemas.push(
      `  ✗ itemBonus: as compras chegaram a ${rodadasComItem} rodada(s), mas remover o itemBonus não ` +
        'mudou nenhum hash — a agregação de `shop/` não está afetando a simulação. Suspeitos: ' +
        '`setupDaRodada` passando bloco vazio, ou `agregarItens` devolvendo `{}` para itens válidos.',
    )
  }
  linhas.push(
    `ponte itemBonus ${itemDivergiram > 0 ? `✓ ok — ${rodadasComItem} rodada(s) com item comprado; remover o bônus move o hash em ${itemDivergiram} delas` : '✗ sem poder discriminante'}`,
  )

  // ---- D-c / D-d: a política de partida tem consumidor, replay e guarda de escopo
  const politica = invariantePolitica()
  linhas.push(...politica.linhas)
  problemas.push(...politica.problemas)
  linhas.push(
    `política bot   ${politica.problemas.length === 0 ? `✓ ok — ${POLITICA_VERSION}: ${MATCH_SEEDS.length} partidas conduzidas por bot/partida.ts, reproduzidas sem bot; recriar por visita à loja diverge` : `✗ ${politica.problemas.length} problema(s)`}`,
  )

  // ---- Invariante M-1
  const medidas = MATCH_SEEDS.map(medirM1)
  for (const m of medidas) {
    linhas.push(
      `  matchSeed ${String(m.matchSeed).padStart(5)} · rodada 1 com BotState novo ${m.novo.ticks} ticks (${m.novo.hash}) · ` +
        `reusado ${m.reusado.ticks} ticks (${m.reusado.hash}) · ${m.divergiu ? 'divergiu ✓' : 'IGUAL ✗'}`,
    )
  }
  const divergiram = medidas.filter((m) => m.divergiu).length
  // O critério é "pelo menos uma diverge", não "todas divergem", e a diferença é honesta: M-1 afirma
  // que reusar CONTAMINA, e uma única contaminação observada já refuta "reusar é inofensivo". Exigir
  // divergência em todas as seeds seria afirmar algo mais forte do que a invariante — e reprovaria a
  // bateria no dia em que uma seed empatasse os dois caminhos por coincidência.
  if (divergiram === 0) {
    problemas.push(
      `  ✗ M-1: reusar BotState entre rodadas NÃO mudou nada em ${medidas.length} seed(s) — ou a ` +
        'invariante deixou de valer, ou o teste perdeu poder discriminante (o cenário deixou de ' +
        'carregar `porBola` entre rodadas). Ver architecture-e3.md §2.5, Regra 2.',
    )
  }
  linhas.push(
    `invariante M-1 ${divergiram > 0 ? `✓ ok — reusar BotState contamina em ${divergiram}/${medidas.length} seed(s); a partida cria um por rodada` : '✗ sem poder discriminante'}`,
  )

  // ---- Invariante RF-23
  const rf23 = invarianteRF23()
  if (rf23.linha) linhas.push(`  ${rf23.linha}`)
  problemas.push(...rf23.problemas)
  linhas.push(
    `economia RF-23 ${rf23.problemas.length === 0 ? '✓ ok — ouro depende só do índice da rodada e do saldo, nunca da vitória' : `✗ ${rf23.problemas.length} problema(s)`}`,
  )

  // ---- Razão de ouro e "nunca pela metade" (o que o replay não pega)
  const compra = invarianteCompra()
  if (compra.linha) linhas.push(`  ${compra.linha}`)
  problemas.push(...compra.problemas)
  linhas.push(
    `compra/débito  ${compra.problemas.length === 0 ? '✓ ok — débito bate o preço, item vai ao personagem certo, rejeição devolve o estado original' : `✗ ${compra.problemas.length} problema(s)`}`,
  )

  // ---- Segredo por projeção
  const visao = invarianteVisao()
  linhas.push(`  ${visao.linha}`)
  problemas.push(...visao.problemas)
  linhas.push(
    `segredo visão  ${visao.problemas.length === 0 ? '✓ ok — build fechada do oponente ausente do objeto e da serialização; itens visíveis' : `✗ ${visao.problemas.length} problema(s)`}`,
  )

  return { linhas, problemas }
}
