import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHARS } from '../chars/index.ts'
import { dummyCommands } from '../bot/dummy.ts'
import { botCommands, createBot } from '../bot/heuristic.ts'
import {
  createWorld,
  step,
  TICK_HZ,
  TICK_MS,
  MIN_ABILITY_CD_MS,
  type RoundSetup,
  type PickSetup,
} from '../sim/world.ts'
import { SIGMA_MAX } from '../sim/stats.ts'
import type { Command, SimEvent, World } from '../sim/types.ts'
// e4.2 — seta `tools/ → net/`, declarada no AC 11 da story (pedido de emenda do Anexo A de
// `architecture-e4.md` registrado no Dev Agent Record, para o @architect). É a guarda de
// ida-e-volta abaixo: provar a serialização inteira sem servidor e sem navegador.
import { SNAPSHOT_HZ, type EstaticoDaRodada, type Snapshot } from '../net/protocolo.ts'
import {
  criarProdutorDeSnapshot,
  estaticoDaRodada,
  EPS_ANGULO_RAD,
  EPS_POSICAO_PX,
} from '../net/snapshot.ts'
import { projetar, type VisaoDoMundo } from '../net/projecao.ts'
// `hash` também mora em `./harness.ts` (AC 4), mas este arquivo o consome apenas através de
// `RoundResult.hash` — importá-lo aqui só para "cumprir a lista" seria import não usado, e
// `noUnusedLocals` reprova o `npm run check`. Ver Dev Agent Record da story e2.0.
// `e4.2`: a guarda de ida-e-volta do fio passou a usá-lo direto (hash da rodada observada tick a
// tick contra o hash do arnês), junto com `MAX_ROUND_TICKS` — daí o import agora.
import { hash, MAX_ROUND_TICKS, runRound, type RoundDriver, type RoundResult } from './harness.ts'
// Regra 3 de `architecture-e3.md` §2.5 (story `e3.2`): partida Bo5 inteira, invariante M-1 e
// invariante de economia RF-23. Mora em arquivo próprio porque é uma bateria sobre `match/`, não
// sobre `sim/` — e porque este arquivo já é o mais longo de `tools/`.
import { verificarPartida } from './partida.ts'

const CHARS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'chars')

/**
 * Verificação do invariante que sustenta todo o projeto:
 * mesma seed + mesmos comandos = mesma partida, sempre.
 * Se isto quebrar, o servidor autoritativo e o arnês de balanceamento quebram junto.
 *
 * De quebra imprime a matriz de winrate espelhada — que deve ficar perto de 50/50,
 * porque os dois times são idênticos e o bot é o mesmo dos dois lados.
 */

const TIME = [
  { charId: 'golem', abilityIndex: 0 as const, passiveIndex: 0 as const },
  { charId: 'vex', abilityIndex: 0 as const, passiveIndex: 0 as const },
]

function setup(seed: number, team: PickSetup[] = TIME): RoundSetup {
  return { seed, teams: [team, team] }
}

/**
 * O laço e o `hash` vivem em `./harness.ts` desde `e2.0` — aqui ficam só os drivers e as
 * tabelas de baseline. `determinism.ts` não tem mais laço próprio: se alguém mexer no teto
 * de ticks ou na ordem de concatenação dos comandos lá, o golden hash abaixo acusa.
 *
 * Driver congelado do golden hash: `dummyCommands` dos dois times, na mesma ordem de sempre
 * (time 0 e depois time 1). É sem estado, então ignora o `setup` da fábrica. `dummy.ts` é
 * fixture: a Fase 2 acrescenta `heuristic` como driver NOVO, não substitui este.
 */
const dummyDriver: RoundDriver = () => (view) => [
  ...dummyCommands(view, 0),
  ...dummyCommands(view, 1),
]

function rodar(seed: number, team: PickSetup[] = TIME): RoundResult {
  return runRound(CHARS, setup(seed, team), dummyDriver)
}

/**
 * GOLDEN HASH — baseline de referência.
 *
 * O bloco de autoconsistência abaixo prova que a simulação é REPRODUTÍVEL (rodar a
 * mesma seed duas vezes dá o mesmo resultado). Ele não prova que ela é A MESMA DE
 * ONTEM: uma refatoração que mudasse o comportamento do jogo passaria verde.
 *
 * Estes 5 valores travam o comportamento atual. A migração de 8 passos de
 * `docs/architecture.md` §6 declara hash IDÊNTICO nos passos 1 a 7 — se algum deles
 * mexer nestes números, a refatoração mudou o jogo e a story falhou.
 *
 * A seed 11 ERA deliberada para exercitar o caminho de empate (winner === -1, D-02,
 * `docs/prd.md` §5) — o re-baseline de `e3.6` a tirou desse papel (hoje `winner: 1`).
 * Quem cobre o empate agora é a seed 379, re-fixada por `debt.8` (ver a última linha
 * da tabela e o bloco de achado abaixo).
 *
 * NÃO "atualize" esta tabela para fazer o teste passar. Se a execução não bate, o bug
 * está na execução. Mudança de baseline exige justificativa registrada no commit.
 *
 * Fonte: `docs/architecture.md` §6.0 · Anexo B item A-2 · story `debt.0`
 *
 * **RE-BASELINE — `e3.6`, T-1 (a exceção declarada de §9.2: esta é a ÚNICA story da Fase 3
 * autorizada a mover este hash).** `ESCALA_HP = 6.0` (`src/chars/tuning.ts`) — valor de decisão
 * de PRODUTO do usuário, não da bissecção original de D-05 (25-35s): duas sessões humanas reais
 * em ×2.0 e ×3.0 mediram medianas de ~23s (achatadas, dentro do ruído de 4-5 rodadas); uma sessão
 * em ×6.0 rendeu uma partida de ~26s e outra de ~67s (3 das 4 rodadas bateram o teto de 60s). O
 * usuário, direto: *"Não tem problema algum o sudden-death, gostei da escala HPx6.0"* — decisão
 * de produto explícita que fica FORA da faixa numérica do AC 8, e que resolve de carona R-05
 * (Risco #6): sudden death deixa de ser "código morto a decidir depois" e passa a ser aceito como
 * parte do jogo. Ver Dev Agent Record de `e3.6` para a íntegra da bissecção e o veredito do @qa
 * sobre o desvio do AC 8.
 *
 * **Achado registrado em `e3.6`, RESOLVIDO por `debt.8` (TEST-102 do gate de `e3.6`):** a seed 11
 * era deliberada para exercitar o caminho de EMPATE (`winner === -1`) e deixou de empatar neste
 * re-baseline (`winner: 1`), o que zerou a cobertura do ramo. A seed 379 abaixo re-fixa o caminho
 * pelo motor real (`runRound` → `step` → `checkEnd`), achada por BUSCA, não escolhida (Artigo IV).
 */
const BASELINE: { seed: number; hash: string; ticks: number; winner: number }[] = [
  { seed: 1, hash: '327b60f3', ticks: 4110, winner: 1 },
  { seed: 2, hash: '6c9ec9a8', ticks: 4177, winner: 0 },
  { seed: 3, hash: 'adfceac2', ticks: 4099, winner: 0 },
  { seed: 7, hash: 'cdd32326', ticks: 3972, winner: 1 },
  { seed: 11, hash: '5904fbe4', ticks: 4279, winner: 1 },
  // debt.8 — cobertura de empate re-fixada. Origem (AC 6): varredura de 180 seeds (200-379,
  // scanner descartável da Task 1, primeira que empatou) sob ESCALA_HP = 6.0, TIME padrão e
  // dummyDriver congelado; dupla execução reproduziu hash/ticks/winner idênticos. É empate por
  // DUPLO-KO em 3831 ticks (~63,9s) — os dois times morrem no mesmo tick após o encolhimento de
  // morte súbita —, não pelo teto de 150s: cobre o mesmo `winner === -1` de `checkEnd` por um
  // caminho mais barato de rodar. Se este valor divergir, o ramo de empate do motor mudou.
  { seed: 379, hash: 'a2bb5327', ticks: 3831, winner: -1 },
]

/**
 * COBERTURA DE BUILD — complemento ao BASELINE acima.
 *
 * Achado do gate de `debt.3` (@qa, ARCH-001): o BASELINE fixa `passiveIndex: 0` /
 * `abilityIndex: 0` para os dois personagens. Isso significa que a passiva Fantasma do
 * Vex (`passiveIndex: 1`) NUNCA roda nas 5 seeds acima — uma regressão nela passaria
 * verde. A remoção da multiplicação por `mods.speed` em `debt.3` só foi verificada por
 * uma matriz avulsa de 125k amostras que o @qa montou e descartou; esta tabela é a
 * versão permanente e barata dessa proteção.
 *
 * Cobre a 2ª ativa e a 2ª passiva de cada personagem, isolada e em combinação — não é
 * cobertura exaustiva (isso é o arnês de 10k lutas da Fase 2), é a rede mínima para que
 * nenhum ramo de código fique inteiramente sem teste de regressão.
 *
 * **RE-BASELINE — `e3.6`, T-1.** Mesma alavanca `ESCALA_HP = 6.0`, ver justificativa completa
 * no comentário do `BASELINE` acima.
 */
const BUILD_BASELINE: {
  label: string
  seed: number
  golemAbility: 0 | 1
  golemPassive: 0 | 1
  vexAbility: 0 | 1
  vexPassive: 0 | 1
  hash: string
  ticks: number
  winner: number
}[] = [
  { label: 'golem Tremor (ability1)', seed: 101, golemAbility: 1, golemPassive: 0, vexAbility: 0, vexPassive: 0, hash: 'dbb0d9cb', ticks: 3197, winner: 1 },
  { label: 'golem Casca (passive1)', seed: 102, golemAbility: 0, golemPassive: 1, vexAbility: 0, vexPassive: 0, hash: '3fec7f2c', ticks: 4247, winner: 0 },
  { label: 'vex Deslize (ability1)', seed: 103, golemAbility: 0, golemPassive: 0, vexAbility: 1, vexPassive: 0, hash: 'acbd87c3', ticks: 3882, winner: 0 },
  { label: 'vex Fantasma (passive1)', seed: 104, golemAbility: 0, golemPassive: 0, vexAbility: 0, vexPassive: 1, hash: '9c156606', ticks: 4347, winner: 0 },
  { label: 'golem Casca + vex Fantasma', seed: 105, golemAbility: 0, golemPassive: 1, vexAbility: 0, vexPassive: 1, hash: '9636d92d', ticks: 4576, winner: 0 },
]

const SEEDS = 40
let divergentes = 0
let v0 = 0
let v1 = 0
let empates = 0
const duracoes: number[] = []

for (let seed = 1; seed <= SEEDS; seed++) {
  const a = rodar(seed)
  const b = rodar(seed)
  if (a.hash !== b.hash || a.ticks !== b.ticks) {
    divergentes++
    console.log(`  ✗ seed ${seed}: ${a.hash}@${a.ticks} != ${b.hash}@${b.ticks}`)
  }
  if (a.winner === 0) v0++
  else if (a.winner === 1) v1++
  else empates++
  duracoes.push((a.ticks * TICK_MS) / 1000)
}

// --------------------------------------------------------- baseline (golden hash)

const desvios: string[] = []
for (const esperado of BASELINE) {
  const obtido = rodar(esperado.seed)
  const campos: [string, string | number, string | number][] = [
    ['hash', esperado.hash, obtido.hash],
    ['ticks', esperado.ticks, obtido.ticks],
    ['vencedor', esperado.winner, obtido.winner],
  ]
  for (const [campo, esp, obt] of campos) {
    if (esp !== obt) {
      desvios.push(`  ✗ baseline seed ${esperado.seed}: ${campo} esperado ${esp}, obtido ${obt}`)
    }
  }
}

// ------------------------------------------------------ cobertura de build

const desviosBuild: string[] = []
for (const esperado of BUILD_BASELINE) {
  const team: PickSetup[] = [
    { charId: 'golem', abilityIndex: esperado.golemAbility, passiveIndex: esperado.golemPassive },
    { charId: 'vex', abilityIndex: esperado.vexAbility, passiveIndex: esperado.vexPassive },
  ]
  const obtido = rodar(esperado.seed, team)
  const campos: [string, string | number, string | number][] = [
    ['hash', esperado.hash, obtido.hash],
    ['ticks', esperado.ticks, obtido.ticks],
    ['vencedor', esperado.winner, obtido.winner],
  ]
  for (const [campo, esp, obt] of campos) {
    if (esp !== obt) {
      desviosBuild.push(
        `  ✗ build "${esperado.label}" seed ${esperado.seed}: ${campo} esperado ${esp}, obtido ${obt}`,
      )
    }
  }
}

// ------------------------------------------- Replay (debt.7) — Regra 3, isolamento de RNG

/**
 * Prova que o bot não consome `world.rng` — critério P4.3 do PRD ("replay reconstrói a
 * partida a partir de seed + linha do tempo de inputs, com hash idêntico").
 *   (i)   roda a partida com o bot, gravando Command[] por tick
 *   (ii)  recria o mundo com a MESMA seed e reproduz só os comandos gravados, sem bot algum
 *   (iii) hash(i) === hash(ii)
 * Se o bot sacasse de world.rng, a simulação teria consumido números diferentes no passo
 * (ii) (nenhum comando novo é gerado ali, mas o desvio apareceria se algo dependesse de
 * ordem de consumo) e o hash divergiria. `dummyCommands` recebe `WorldView` desde debt.7 —
 * este teste é a segunda linha de defesa, em runtime, do que o tipo já impede em compilação.
 */
function rodarComGravacao(seed: number): { hash: string; gravados: Command[] } {
  // driver-gravador: delega ao driver congelado e anota o que ele produziu. Envolver o
  // driver, em vez de reescrever o laço, mantém a gravação sobre EXATAMENTE os comandos
  // que a partida consumiu — não sobre uma segunda derivação deles.
  const gravados: Command[] = []
  const gravador: RoundDriver = (s) => {
    const driver = dummyDriver(s)
    return (view) => {
      const cmds = driver(view)
      gravados.push(...cmds)
      return cmds
    }
  }
  return { hash: runRound(CHARS, setup(seed), gravador).hash, gravados }
}

function rodarReplay(seed: number, gravados: Command[]): string {
  // sem bot algum: a cada tick entrega a linha do tempo gravada inteira, e o motor
  // executa só os comandos cujo `tick` é o corrente. Idêntico ao `step(world, gravados)`
  // do laço original.
  return runRound(CHARS, setup(seed), () => () => gravados).hash
}

const desviosReplay: string[] = []
for (const esperado of BASELINE) {
  const { hash: hashComBot, gravados } = rodarComGravacao(esperado.seed)
  const hashReplay = rodarReplay(esperado.seed, gravados)
  if (hashComBot !== hashReplay) {
    desviosReplay.push(
      `  ✗ replay seed ${esperado.seed}: hash com bot ${hashComBot} != hash replay ${hashReplay}`,
    )
  }
}

// -------------------------------------- P2.5 (e2.4) — determinismo do bot heurístico

/**
 * P2.5 — "mesma seed + mesma versão de bot → mesmo hash" — provado por DOIS testes, não um
 * (`docs/architecture-e2.md` §3.3). Os blocos acima cobrem o `dummy`, que é fixture congelado;
 * estes cobrem o `heuristic`, que é o bot que a matriz de winrate de `e2.5` vai usar.
 *
 *   (1) autoconsistência com o bot NO LAÇO — pega N-1 (relógio de parede), N-2 (ordem de
 *       iteração de container) e qualquer não-determinismo interno da política;
 *   (2) replay SEM bot — pega N-3 (escrita acidental em `view`, que `Omit` não impede porque é
 *       raso) e prova o isolamento de stream que é o coração de D-08: se o bot sacasse de
 *       `world.rng`, a simulação teria consumido números diferentes na execução sem bot.
 *
 * **Sem valores de referência fixos, e isso é decisão, não omissão** (§3.3): a política do bot
 * ainda vai mudar em `e2.5`/`e2.6`, e um hash congelado aqui reprovaria toda mudança legítima de
 * `PRESET_ARNES` — churn de baseline sem informação nenhuma. O que se exige é IGUALDADE ENTRE
 * EXECUÇÕES, que é invariante sob qualquer política. Os hashes do `dummy` (BASELINE /
 * BUILD_BASELINE) continuam sendo os únicos números congelados do arquivo, e este bloco não
 * encosta neles.
 */
const heuristicDriver: RoundDriver = (s) => {
  // o estado por time nasce UMA vez por partida, com a seed da partida — é exatamente para isto
  // que `RoundDriver` é fábrica (`harness.ts`, e2.0) e não uma função de tick direta.
  // Ordem time 0 → time 1, a mesma do `dummyDriver`: a concatenação é contrato (§3.2).
  const b0 = createBot(s.seed, 0)
  const b1 = createBot(s.seed, 1)
  return (view) => [...botCommands(view, b0), ...botCommands(view, b1)]
}

function rodarHeuristic(seed: number): RoundResult {
  return runRound(CHARS, setup(seed), heuristicDriver)
}

/** Mesma forma de `rodarComGravacao` acima, com o driver do `heuristic` no lugar do `dummy`. */
function rodarHeuristicComGravacao(seed: number): { hash: string; gravados: Command[] } {
  const gravados: Command[] = []
  const gravador: RoundDriver = (s) => {
    const driver = heuristicDriver(s)
    return (view) => {
      const cmds = driver(view)
      gravados.push(...cmds)
      return cmds
    }
  }
  return { hash: runRound(CHARS, setup(seed), gravador).hash, gravados }
}

const desviosBotAuto: string[] = []
const desviosBotReplay: string[] = []
for (const { seed } of BASELINE) {
  const a = rodarHeuristic(seed)
  const b = rodarHeuristic(seed)
  if (a.hash !== b.hash || a.ticks !== b.ticks) {
    desviosBotAuto.push(
      `  ✗ bot autoconsistência seed ${seed}: ${a.hash}@${a.ticks} != ${b.hash}@${b.ticks}`,
    )
  }

  const { hash: hashComBot, gravados } = rodarHeuristicComGravacao(seed)
  // a gravação é observação pura; se ela mudar o resultado, o replay abaixo estaria comparando
  // contra uma partida que não é a que rodou, e passaria verde pelo motivo errado
  if (hashComBot !== a.hash) {
    desviosBotAuto.push(
      `  ✗ bot gravação seed ${seed}: gravar alterou a partida (${hashComBot} != ${a.hash})`,
    )
  }

  // `rodarReplay` é reusado tal e qual: ele não conhece bot nenhum — recebe seed e linha do
  // tempo de comandos. Que ele sirva aos dois drivers sem uma linha de mudança é a evidência de
  // que o replay de RF-41 depende só de (seed, comandos), como P4.3 exige.
  const hashReplay = rodarReplay(seed, gravados)
  if (hashComBot !== hashReplay) {
    desviosBotReplay.push(
      `  ✗ bot replay seed ${seed}: hash com bot ${hashComBot} != hash replay ${hashReplay}`,
    )
  }
}

// ------------------------------------------ guarda de BOT-001 (gate de e2.3, MEDIUM)

/**
 * Prova em runtime a correção de BOT-001 (`heuristic.ts`, `porValorEsperado`): um `VE` corrompido
 * (`NaN`) tem que resultar em NÃO CASTAR. Antes da correção o limiar fechava com
 * `melhorVE < limiar`, e `NaN < limiar` é `false` — o candidato era ACEITO, e o bot castava
 * exatamente onde a política manda não castar. A geometria continua sã nesse caminho (o `NaN`
 * entra por `peso`, a partir de `hp`), então o comando saía finito e a rede de finitude de
 * `emitir` não o pegava.
 *
 * O cenário é o mínimo que discrimina: mundo recém-criado (as duas bolas do time 0 decidem no
 * tick 0, nenhuma ult carregada) com os inimigos a ~575px — longe demais para qualquer slot
 * cruzar o limiar. Medido nesta story: com `hp` são, 0 comandos; com `hp = NaN` nos inimigos,
 * 2 comandos ANTES da correção e 0 DEPOIS.
 *
 * A checagem do caso são é canário, não redundância: se um dia o roster ou as posições de largada
 * mudarem a ponto de o bot castar no tick 0 com `hp` normal, o caso corrompido passaria verde sem
 * provar nada, e este teste teria morrido em silêncio — o modo de falha mais caro de um teste.
 */
const SEED_GUARDA = 9001

function comandosNoTick0(corromperHpInimigo: boolean): number {
  const world = createWorld(CHARS, setup(SEED_GUARDA))
  if (corromperHpInimigo) {
    for (const b of world.balls) if (b.team === 1) b.hp = NaN
  }
  return botCommands(world, createBot(SEED_GUARDA, 0)).length
}

function guardaBot001(): string[] {
  const problemas: string[] = []
  const sao = comandosNoTick0(false)
  const corrompido = comandosNoTick0(true)
  if (sao !== 0) {
    problemas.push(
      `  ✗ BOT-001: o cenário perdeu poder discriminante — com hp são o bot já emite ${sao} comando(s) no tick 0`,
    )
  }
  if (corrompido !== 0) {
    problemas.push(
      `  ✗ BOT-001: com hp = NaN o bot emitiu ${corrompido} comando(s) — o limiar voltou a aceitar VE = NaN`,
    )
  }
  return problemas
}

const problemasBot001 = guardaBot001()

// --------------------------------- QA-D8-01 (herdado de debt.8, pago em e4.2) — empate coberto

/**
 * Asserção ESTRUTURAL, não de valor: o `BASELINE` tem que conter ao menos uma seed de empate. A
 * cobertura do ramo `winner === -1` já se perdeu uma vez em silêncio (re-baseline de `e3.6`), porque
 * um baseline sem empate bate consigo mesmo perfeitamente. Com isto, "temos uma seed de empate" deixa
 * de ser fato histórico e vira invariante conferida a cada `sim:check`.
 */
const seedsDeEmpate = BASELINE.filter((b) => b.winner === -1).map((b) => b.seed)

// ----------------------------------- ida-e-volta do fio (e4.2) — World → Snapshot → projeção

/**
 * Guarda de `e4.2` (AC 4, 5, 7, 9): prova, sem servidor e sem navegador, que o cliente conectado
 * consegue desenhar a rodada a partir do fio — `projetar(snapshot, estatico, CHARS)` reproduz o `World`
 * em TODO campo que `client/render.ts` lê (lista fechada do Dev Notes da story), a cada tick.
 *
 * Composição e seeds de `architecture-e4.md` §1 (`[golem, vex]` idx 0 dos dois lados, bot heurístico,
 * seeds 1/1001/2001/3001/379), para que o orçamento de bytes seja comparável ao de §1.2. As ults dessa
 * composição exercitam Muralha e vórtice, a Lâmina do Vex exercita projétil, e as 5 rodadas passam de
 * 60s, então a arena encolhe (`pad > 0`) — o canário de cobertura abaixo confere que tudo isso de fato
 * apareceu, senão a guarda estaria comparando listas vazias e passaria sem provar nada.
 *
 * O laço é uma SEGUNDA cópia do de `harness.ts`, porque `runRound` não expõe o mundo a cada tick. A
 * cópia não pode divergir em silêncio: o hash final da rodada observada tem que ser IGUAL ao do arnês
 * para a mesma seed e o mesmo driver — o que prova ao mesmo tempo que o laço é o mesmo e que
 * produzir snapshot não escreve no `World` (AC 2).
 *
 * Dois produtores por rodada: um a 60 Hz (fidelidade campo a campo em todo tick, e o orçamento
 * comparável ao "B/tick" de §1.2) e um na cadência de `SNAPSHOT_HZ` (acumulação de eventos, AC 5, e o
 * orçamento "como produzido", AC 9). O de cadência emite também no tick final — é o flush de fim de
 * rodada que o servidor de `e4.4` precisa fazer.
 */
const SEEDS_FIO = [1, 1001, 2001, 3001, 379]
const INTERVALO_SNAPSHOT = TICK_HZ / SNAPSHOT_HZ
/** §5.1, classe 3 — nomes que NUNCA podem aparecer no JSON do fio (AC 4). */
const CLASSE_3 = ['memory', 'ax', 'ay', 'contact', 'base', 'bonusPassive', 'bonusItem', 'nextId', 'phase', 'rng', 'chars']
/** folga de ponto flutuante sobre o meio-passo de quantização; não é banda de tolerância */
const FOLGA_FP = 1e-9
const MAX_MENSAGENS_FIO = 12

function chavesDoJson(valor: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(valor)) {
    for (const v of valor) chavesDoJson(v, acc)
  } else if (valor !== null && typeof valor === 'object') {
    for (const [k, v] of Object.entries(valor)) {
      acc.add(k)
      chavesDoJson(v, acc)
    }
  }
  return acc
}

/** Nomes da classe 3 presentes como CHAVE em qualquer nível do JSON serializado. */
function vazamentosClasse3(serializado: string): string[] {
  const chaves = chavesDoJson(JSON.parse(serializado))
  return CLASSE_3.filter((n) => chaves.has(n))
}

function bytes(valor: unknown): number {
  return Buffer.byteLength(JSON.stringify(valor), 'utf8')
}

interface Achados {
  fidelidade: string[]
  tripwire: string[]
  presenca: string[]
  totalFidelidade: number
  totalTripwire: number
  totalPresenca: number
}

function anotar(lista: string[], msg: string): void {
  if (lista.length < MAX_MENSAGENS_FIO) lista.push(msg)
}

function mesmosIds(rotulo: string, a: { id: number }[], b: { id: number }[]): string | null {
  const ia = a.map((x) => x.id).join(',')
  const ib = b.map((x) => x.id).join(',')
  return ia === ib ? null : `${rotulo}: projeção [${ia}] ≠ World [${ib}]`
}

/** AC 7 — todo campo da lista fechada do Dev Notes de `e4.2`, e a presença; AC 4 — a tripwire. */
function compararComMundo(world: World, v: VisaoDoMundo, est: EstaticoDaRodada, seed: number, a: Achados): void {
  const onde = `seed ${seed} tick ${world.tick}`
  const falha = (campo: string, proj: unknown, real: unknown) => {
    a.totalFidelidade++
    anotar(a.fidelidade, `  ✗ fio ${onde}: ${campo} projeção ${String(proj)} ≠ World ${String(real)}`)
  }
  const exato = (campo: string, proj: unknown, real: unknown) => {
    if (proj !== real) falha(campo, proj, real)
  }
  const perto = (campo: string, proj: number, real: number, passo: number) => {
    if (!(Math.abs(proj - real) <= passo / 2 + FOLGA_FP)) falha(campo, proj, real)
  }

  exato('time', v.time, world.time)
  exato('over', v.over, world.over)
  exato('winner', v.winner, world.winner)
  exato('arena.w', v.arena.w, world.arena.w)
  exato('arena.h', v.arena.h, world.arena.h)
  exato('arena.pad', v.arena.pad, world.arena.pad)
  if (v.chars !== CHARS) falha('chars', 'outro objeto', 'o CHARS injetado')

  // presença: mesmo número e mesmos `id`, na mesma ordem. Sem ela, o campo a campo abaixo compararia
  // entidades diferentes, então este tick para aqui.
  let presencaOk = true
  for (const erro of [
    mesmosIds('bolas', v.balls, world.balls),
    mesmosIds('projéteis', v.projectiles, world.projectiles),
    mesmosIds('zonas', v.zones, world.zones),
  ]) {
    if (erro) {
      presencaOk = false
      a.totalPresenca++
      anotar(a.presenca, `  ✗ fio ${onde}: ${erro}`)
    }
  }
  if (!presencaOk) return

  world.balls.forEach((b, i) => {
    const p = v.balls[i]
    const r = `bola ${b.id}`
    exato(`${r}.charId`, p.charId, b.charId)
    exato(`${r}.team`, p.team, b.team)
    perto(`${r}.x`, p.x, b.x, EPS_POSICAO_PX)
    perto(`${r}.y`, p.y, b.y, EPS_POSICAO_PX)
    perto(`${r}.facing`, p.facing, b.facing, EPS_ANGULO_RAD)
    exato(`${r}.hp`, p.hp, b.hp)
    exato(`${r}.alive`, p.alive, b.alive)
    exato(`${r}.ultCharge`, p.ultCharge, b.ultCharge)
    exato(`${r}.ultThreshold`, p.ultThreshold, b.ultThreshold)
    exato(`${r}.effects[].kind`, p.effects.map((e) => e.kind).join(','), b.effects.map((e) => e.kind).join(','))
    exato(`${r}.stat.radius`, p.stat.radius, b.stat.radius)
    exato(`${r}.stat.maxHp`, p.stat.maxHp, b.stat.maxHp)
    exato(`${r}.abilityReadyAt`, p.abilityReadyAt, b.abilityReadyAt)
    exato(`${r}.abilityIndex`, p.abilityIndex, b.abilityIndex)
    if (!CHARS[p.charId]) falha(`${r}: chars[charId]`, 'ausente', p.charId)

    // tripwire (AC 4): estáticos por VERIFICAÇÃO. No dia em que uma passiva mudar raio ou vida máxima
    // no meio da rodada, isto apita aqui, e não no HP bar do adversário em produção.
    const s = est.balls.find((e) => e.id === b.id)
    if (!s || s.stat.maxHp !== b.stat.maxHp || s.stat.radius !== b.stat.radius) {
      a.totalTripwire++
      anotar(
        a.tripwire,
        `  ✗ tripwire ${onde} bola ${b.id}: World stat.maxHp/radius ${b.stat.maxHp}/${b.stat.radius} ≠ estático ${s?.stat.maxHp}/${s?.stat.radius}`,
      )
    }
  })

  world.projectiles.forEach((q, i) => {
    const p = v.projectiles[i]
    const r = `projétil ${q.id}`
    perto(`${r}.x`, p.x, q.x, EPS_POSICAO_PX)
    perto(`${r}.y`, p.y, q.y, EPS_POSICAO_PX)
    exato(`${r}.vx`, p.vx, q.vx)
    exato(`${r}.vy`, p.vy, q.vy)
    exato(`${r}.radius`, p.radius, q.radius)
    exato(`${r}.color`, p.color, q.color)
  })

  world.zones.forEach((z, i) => {
    const p = v.zones[i]
    const r = `zona ${z.id}`
    exato(`${r}.kind`, p.kind, z.kind)
    perto(`${r}.x`, p.x, z.x, EPS_POSICAO_PX)
    perto(`${r}.y`, p.y, z.y, EPS_POSICAO_PX)
    perto(`${r}.angle`, p.angle, z.angle, EPS_ANGULO_RAD)
    exato(`${r}.halfLen`, p.halfLen, z.halfLen)
    exato(`${r}.radius`, p.radius, z.radius)
    exato(`${r}.pull`, p.pull, z.pull)
    exato(`${r}.ownerColor`, p.ownerColor, z.ownerColor)
  })
}

interface Orcamento {
  quadro: number[]
  eventosQuadro: number[]
  tick60: number[]
  estatico: number[]
}

function guardaFio(): { linhas: string[]; problemas: string[] } {
  const achados: Achados = {
    fidelidade: [],
    tripwire: [],
    presenca: [],
    totalFidelidade: 0,
    totalTripwire: 0,
    totalPresenca: 0,
  }
  const problemas: string[] = []
  const orc: Orcamento = { quadro: [], eventosQuadro: [], tick60: [], estatico: [] }
  const vazados = new Set<string>()
  const cobertura = { projeteis: 0, muralhas: 0, vortices: 0, efeitos: 0, mortes: 0, arenaEncolhida: 0 }
  let ticksTotais = 0
  let hitsProduzidos = 0
  let hitsEntregues = 0
  let eventosProduzidos = 0
  const tiposDeEvento = new Set<string>()
  let hashesIguais = 0

  if (!Number.isInteger(INTERVALO_SNAPSHOT)) {
    problemas.push(`  ✗ fio: TICK_HZ/SNAPSHOT_HZ = ${INTERVALO_SNAPSHOT} não é inteiro — a cadência da guarda não se aplica`)
    return { linhas: [], problemas }
  }

  const contarHits = (evs: SimEvent[]) => evs.filter((e) => e.t === 'hit').length

  for (const seed of SEEDS_FIO) {
    const s = setup(seed)
    const world = createWorld(CHARS, s)
    const driver = heuristicDriver(s)
    const estatico = estaticoDaRodada(world)
    const jsonEstatico = JSON.stringify(estatico)
    orc.estatico.push(Buffer.byteLength(jsonEstatico, 'utf8'))
    for (const n of vazamentosClasse3(jsonEstatico)) vazados.add(`estático:${n}`)
    if (chavesDoJson(estatico).has('color')) vazados.add('estático:color')

    const porTick = criarProdutorDeSnapshot(world)
    const naCadencia = criarProdutorDeSnapshot(world)
    const produzidos: SimEvent[] = []
    const entregues: SimEvent[] = []

    const conferir = (snap: Snapshot) => {
      compararComMundo(world, projetar(snap, estatico, CHARS), estatico, seed, achados)
    }
    conferir(porTick.snapshot(world)) // tick 0, antes do primeiro step

    while (!world.over && world.tick < MAX_ROUND_TICKS) {
      step(world, driver(world))
      produzidos.push(...world.events)

      porTick.observar(world)
      const snap60 = porTick.snapshot(world)
      const json60 = JSON.stringify(snap60)
      orc.tick60.push(Buffer.byteLength(json60, 'utf8'))
      for (const n of vazamentosClasse3(json60)) vazados.add(`snapshot:${n}`)
      conferir(snap60)

      naCadencia.observar(world)
      const fimDaRodada = world.over || world.tick >= MAX_ROUND_TICKS
      if (world.tick % INTERVALO_SNAPSHOT === 0 || fimDaRodada) {
        const snap = naCadencia.snapshot(world)
        const json = JSON.stringify(snap)
        orc.quadro.push(Buffer.byteLength(json, 'utf8'))
        orc.eventosQuadro.push(bytes(snap.events))
        for (const n of vazamentosClasse3(json)) vazados.add(`snapshot:${n}`)
        entregues.push(...snap.events)
      }

      if (world.projectiles.length > 0) cobertura.projeteis++
      if (world.zones.some((z) => z.kind === 'wall')) cobertura.muralhas++
      if (world.zones.some((z) => z.kind === 'vortex')) cobertura.vortices++
      if (world.balls.some((b) => b.effects.length > 0)) cobertura.efeitos++
      if (world.balls.some((b) => !b.alive)) cobertura.mortes++
      if (world.arena.pad > 0) cobertura.arenaEncolhida++
    }

    ticksTotais += world.tick
    hitsProduzidos += contarHits(produzidos)
    hitsEntregues += contarHits(entregues)
    eventosProduzidos += produzidos.length
    for (const e of produzidos) tiposDeEvento.add(e.t)
    // AC 5 — mais forte que a soma de `hit`: a sequência inteira de eventos, de todos os tipos, na ordem
    if (JSON.stringify(produzidos) !== JSON.stringify(entregues)) {
      problemas.push(
        `  ✗ eventos seed ${seed}: ${produzidos.length} produzido(s) pela rodada, ${entregues.length} nos snapshots a ${SNAPSHOT_HZ} Hz (ou sequência diferente)`,
      )
    }

    const hashArnes = runRound(CHARS, s, heuristicDriver).hash
    if (hash(world) === hashArnes) hashesIguais++
    else {
      problemas.push(
        `  ✗ fio seed ${seed}: hash da rodada observada ${hash(world)} ≠ arnês ${hashArnes} — o laço da guarda divergiu de harness.ts, ou produzir snapshot escreveu no World`,
      )
    }

    // o contrato do acumulador falha alto: observar o mesmo tick de novo tem que lançar
    let lancou = false
    try {
      naCadencia.observar(world)
    } catch {
      lancou = true
    }
    if (!lancou) problemas.push(`  ✗ fio seed ${seed}: observar() duas vezes no mesmo tick não lançou — eventos duplicariam`)
  }

  // canário do detector de classe 3: no `World` do motor ele TEM que acusar os nomes (menos `rng`,
  // que é função e não serializa). Se não acusar, a checagem de vazamento acima morreu em silêncio.
  const mundoCru = createWorld(CHARS, setup(SEEDS_FIO[0]))
  const acusados = vazamentosClasse3(JSON.stringify(mundoCru))
  const esperadosNoCanario = CLASSE_3.filter((n) => n !== 'rng')
  const faltandoNoCanario = esperadosNoCanario.filter((n) => !acusados.includes(n))
  if (faltandoNoCanario.length) {
    problemas.push(`  ✗ classe 3: o detector não acusa [${faltandoNoCanario.join(', ')}] nem no World do motor — perdeu poder discriminante`)
  }
  if (vazados.size) problemas.push(`  ✗ classe 3 vazou no fio: ${[...vazados].join(', ')}`)

  const semCobertura = Object.entries(cobertura).filter(([, n]) => n === 0).map(([k]) => k)
  if (semCobertura.length) {
    problemas.push(`  ✗ fio: canário de cobertura — nenhum tick com [${semCobertura.join(', ')}]; a guarda compararia listas vazias`)
  }
  if (hitsProduzidos === 0) problemas.push('  ✗ fio: canário — nenhum evento hit nas rodadas; o teste do AC 5 não mede nada')

  problemas.push(...achados.presenca, ...achados.fidelidade, ...achados.tripwire)
  if (achados.totalPresenca + achados.totalFidelidade + achados.totalTripwire > 0) {
    problemas.push(
      `  ✗ fio: ${achados.totalPresenca} divergência(s) de presença, ${achados.totalFidelidade} de campo, ${achados.totalTripwire} de tripwire (mostradas até ${MAX_MENSAGENS_FIO} de cada)`,
    )
  }

  const media = (xs: number[]) => xs.reduce((t, x) => t + x, 0) / xs.length
  const pico = (xs: number[]) => Math.max(...xs)
  const f1 = (x: number) => x.toFixed(1)
  const linhas = [
    `fio snapshot   ${problemas.length === 0 ? '✓ ok' : '✗ falhou'} — ${SEEDS_FIO.length} rodadas (heuristic), ${ticksTotais} ticks: projetar(snapshot) bate o World em todo campo que render.ts lê, com presença e ids iguais (ε ${EPS_POSICAO_PX} px · ${EPS_ANGULO_RAD} rad)`,
    `  tripwire estático ${achados.totalTripwire === 0 ? '✓' : '✗'} stat.maxHp/stat.radius do World = EstaticoDaRodada em todo tick`,
    `  eventos      ${hitsProduzidos === hitsEntregues ? '✓' : '✗'} ${hitsProduzidos} hit produzidos ${hitsProduzidos === hitsEntregues ? '=' : '≠'} ${hitsEntregues} nos snapshots a ${SNAPSHOT_HZ} Hz · ${eventosProduzidos} eventos de ${tiposDeEvento.size} tipos [${[...tiposDeEvento].sort().join(',')}], sequência idêntica`,
    `  classe 3     ${vazados.size === 0 && faltandoNoCanario.length === 0 ? '✓' : '✗'} nenhum nome no JSON do fio · o detector acusa ${acusados.length}/${esperadosNoCanario.length} no World do motor (rng não serializa)`,
    `  hash         ${hashesIguais === SEEDS_FIO.length ? '✓' : '✗'} observar a rodada não a altera (${hashesIguais}/${SEEDS_FIO.length} hashes = arnês)`,
    `  orçamento    ${SNAPSHOT_HZ} Hz: média ${f1(media(orc.quadro))} B/quadro (${f1(media(orc.quadro) / INTERVALO_SNAPSHOT)} B/tick) · pico ${pico(orc.quadro)} B · dos quais events: média ${f1(media(orc.eventosQuadro))} B, pico ${pico(orc.eventosQuadro)} B`,
    `               60 Hz, 1 snapshot/tick: média ${f1(media(orc.tick60))} B/tick · pico ${pico(orc.tick60)} B · estático ${pico(orc.estatico)} B uma vez por rodada (JSON com nomes de campo; §1.2 mediu 263/433 B sem eles)`,
  ]
  return { linhas, problemas }
}

const { linhas: linhasFio, problemas: problemasFio } = guardaFio()

// ---------------------------------------------- Pilar 3 (debt.6) — Camada 1: estática

/**
 * Remove comentários `//` e `/* *\/` antes de varrer código — sem isto, um comentário em
 * prosa que mencione "collide:" ou "openContactWindow(" confunde a busca textual (achado
 * real: o próprio comentário de `golem.ts` sobre a migração continha "on.collide:" e
 * desviava a busca para o bloco errado). Não lida com strings contendo `//`/`/*`, que não
 * ocorrem nos arquivos de personagem hoje — limitação aceita, coerente com "barata,
 * incompleta" (Camada 1 nunca pretendeu ser um parser).
 */
function semComentarios(texto: string): string {
  return texto.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * Camada 1 de auditoria (architecture.md §4.3): barata, incompleta de propósito. Varre
 * `src/chars/*.ts` e confirma que nenhum bloco `on.collide` contém a substring `damage(`.
 * Não pega chamada indireta, helper compartilhado, nem dano via efeito de 1 tick — quem
 * pega isso é a Camada 2 (checagem de fase em dealDamage, sempre ativa). `ctx.apply(
 * fx.slow(...))` dentro de on.collide continua permitido: o Pilar 3 fala de dano, não de
 * efeito.
 */
function auditarCamada1(): string[] {
  const violacoes: string[] = []
  const arquivos = readdirSync(CHARS_DIR).filter((f) => f.endsWith('.ts') && f !== 'index.ts')
  for (const arquivo of arquivos) {
    const texto = semComentarios(readFileSync(join(CHARS_DIR, arquivo), 'utf8'))
    const idxCollide = texto.indexOf('collide:')
    if (idxCollide === -1) continue
    const idxSeta = texto.indexOf('=>', idxCollide)
    const idxAbre = texto.indexOf('{', idxSeta)
    if (idxAbre === -1) continue
    let profundidade = 0
    let idxFecha = -1
    for (let i = idxAbre; i < texto.length; i++) {
      if (texto[i] === '{') profundidade++
      else if (texto[i] === '}') {
        profundidade--
        if (profundidade === 0) {
          idxFecha = i
          break
        }
      }
    }
    if (idxFecha === -1) continue
    const corpo = texto.slice(idxAbre, idxFecha)
    if (corpo.includes('damage(')) {
      violacoes.push(`  ✗ camada 1: ${arquivo} tem on.collide chamando damage( diretamente`)
    }
  }
  return violacoes
}

// ------------------------------------------------- Pilar 3 (debt.6) — Camada 3: roster

/**
 * Camada 3 de auditoria (architecture.md §4.3) — o artefato que D-07 pede: tabela legível
 * das janelas de contato declaradas do roster, e 3 verificações automáticas.
 *   A1 — todo contactWindows[i].source corresponde a uma ability ou à ult do personagem
 *   A2 — contactWindows[i].ms ≤ cd_efetivo_mínimo(source) — fecha a invariante de debt.4
 *   A4 — nenhum personagem sem contactWindows chama ctx.openContactWindow (estático)
 * A5 (a story original pedia "o arnês", redefinido em v1.0.2 — arnês é Fase 2, não existe
 * ainda): as 40 seeds + BASELINE + BUILD_BASELINE acima já rodam com a checagem de fase
 * (Camada 2) sempre ativa — se qualquer uma tivesse violado o Pilar 3, o script já teria
 * lançado a exceção antes de chegar aqui. Não precisa de código adicional.
 */
function auditarCamada3(): { violacoes: string[]; tabela: string[] } {
  const violacoes: string[] = []
  const tabela: string[] = ['janelas de dano por contato (Pilar 3)']
  const cdSpeedMax = 1 + SIGMA_MAX.cdSpeed

  for (const char of Object.values(CHARS)) {
    const janelas = char.contactWindows ?? []
    if (janelas.length === 0) {
      tabela.push(`  ${char.id.padEnd(6)} —         (nenhuma)`.padEnd(72) + '✓')
      continue
    }
    for (const w of janelas) {
      const idsAbility = char.abilities.map((a) => a.id)
      const fonteValida = idsAbility.includes(w.source) || w.source === char.ult.id
      if (!fonteValida) {
        violacoes.push(
          `  ✗ A1: ${char.id}.contactWindows source '${w.source}' não corresponde a nenhuma ability/ult`,
        )
      }

      const ability = char.abilities.find((a) => a.id === w.source)
      let cdMinStr = '—'
      let ok = fonteValida
      if (ability) {
        const cdEfetivoMinimo = Math.max(MIN_ABILITY_CD_MS, ability.cd / cdSpeedMax)
        cdMinStr = `${cdEfetivoMinimo.toFixed(0)}ms`
        ok = ok && w.ms <= cdEfetivoMinimo
        if (w.ms > cdEfetivoMinimo) {
          violacoes.push(
            `  ✗ A2: ${char.id}.${w.source} janela ${w.ms}ms > cd_efetivo_mínimo ${cdEfetivoMinimo.toFixed(0)}ms`,
          )
        }
      }
      tabela.push(
        `  ${char.id.padEnd(6)} ${w.source.padEnd(9)} ${String(w.ms).padStart(4)}ms  dmg ${w.dmg}  kb ${w.knockback}  re-hit ${w.reHitMs}ms   cd_min ${cdMinStr}  ${ok ? '✓' : '✗'}`,
      )
    }
  }

  const arquivos = readdirSync(CHARS_DIR).filter((f) => f.endsWith('.ts') && f !== 'index.ts')
  for (const arquivo of arquivos) {
    const charId = arquivo.replace(/\.ts$/, '')
    const char = CHARS[charId]
    if (!char) continue
    const temJanelas = (char.contactWindows?.length ?? 0) > 0
    if (temJanelas) continue
    const texto = semComentarios(readFileSync(join(CHARS_DIR, arquivo), 'utf8'))
    if (texto.includes('openContactWindow(')) {
      violacoes.push(`  ✗ A4: ${arquivo} chama openContactWindow sem declarar contactWindows`)
    }
  }

  return { violacoes, tabela }
}

// -------------------------------------------- Camada de PARTIDA (e3.2) — Regra 3, M-1, RF-23

/**
 * O bloco de `match/`. Ele NÃO tem valores de referência congelados, e isso é decisão: o golden
 * hash acima trava o comportamento de `sim/`, e a Regra 3 mede REPRODUTIBILIDADE — placar,
 * sequência de vencedores e hashes de rodada iguais entre a partida gravada e o replay sem bot.
 * Um número absoluto aqui reprovaria toda mudança legítima de economia ou de roteiro, que é churn
 * de baseline sem informação (mesmo raciocínio do bloco P2.5 acima, `architecture-e2.md` §3.3).
 */
const { linhas: linhasPartida, problemas: problemasPartida } = verificarPartida()

const violacoesCamada1 = auditarCamada1()
const { violacoes: violacoesCamada3, tabela: tabelaJanelas } = auditarCamada3()
const violacoesPilar3 = [...violacoesCamada1, ...violacoesCamada3]

duracoes.sort((x, y) => x - y)
const mediana = duracoes[Math.floor(duracoes.length / 2)]

console.log('')
console.log(`determinismo   ${divergentes === 0 ? '✓ ok' : `✗ ${divergentes}/${SEEDS} divergiram`}`)
if (desvios.length) for (const d of desvios) console.log(d)
console.log(
  `golden hash    ${desvios.length === 0 ? `✓ ok — ${BASELINE.length} seeds batem o baseline` : `✗ ${desvios.length} desvio(s)`}`,
)
console.log(
  `empate coberto ${seedsDeEmpate.length > 0 ? `✓ ok — BASELINE contém winner === -1 (seed ${seedsDeEmpate.join(', ')}) · QA-D8-01` : '✗ BASELINE sem nenhuma seed de empate (QA-D8-01)'}`,
)
if (desviosBuild.length) for (const d of desviosBuild) console.log(d)
console.log(
  `build coverage ${desviosBuild.length === 0 ? `✓ ok — ${BUILD_BASELINE.length} variantes batem` : `✗ ${desviosBuild.length} desvio(s)`}`,
)
console.log(`espelho 2v2    time0 ${v0} · time1 ${v1} · empate ${empates}   (esperado ~50/50)`)
console.log(`duração        mediana ${mediana.toFixed(1)}s · min ${duracoes[0].toFixed(1)}s · max ${duracoes[duracoes.length - 1].toFixed(1)}s`)
if (desviosReplay.length) for (const d of desviosReplay) console.log(d)
console.log(
  `replay         ${desviosReplay.length === 0 ? `✓ ok — ${BASELINE.length} seeds reproduzidas sem bot` : `✗ ${desviosReplay.length} desvio(s)`}`,
)
if (desviosBotAuto.length) for (const d of desviosBotAuto) console.log(d)
console.log(
  `bot dupla exec ${desviosBotAuto.length === 0 ? `✓ ok — ${BASELINE.length} seeds com heuristic dão hash igual entre execuções` : `✗ ${desviosBotAuto.length} desvio(s)`}`,
)
if (desviosBotReplay.length) for (const d of desviosBotReplay) console.log(d)
console.log(
  `bot replay     ${desviosBotReplay.length === 0 ? `✓ ok — ${BASELINE.length} seeds do heuristic reproduzidas sem bot` : `✗ ${desviosBotReplay.length} desvio(s)`}`,
)
if (problemasBot001.length) for (const p of problemasBot001) console.log(p)
console.log(
  `guarda BOT-001 ${problemasBot001.length === 0 ? '✓ ok — VE = NaN não casta (limiar no sentido positivo)' : `✗ ${problemasBot001.length} problema(s)`}`,
)
for (const linha of linhasFio) console.log(linha)
if (problemasFio.length) for (const p of problemasFio) console.log(p)
console.log('')
for (const linha of linhasPartida) console.log(linha)
console.log('')
for (const linha of tabelaJanelas) console.log(linha)
console.log('')
console.log(
  `pilar 3        ${violacoesPilar3.length === 0 ? '✓ ok — camadas 1 e 3 sem violação' : `✗ ${violacoesPilar3.length} violação(ões)`}`,
)
if (violacoesPilar3.length) for (const v of violacoesPilar3) console.log(v)
console.log('')

if (divergentes > 0) throw new Error('simulação não é determinística')
if (desvios.length > 0) {
  throw new Error(
    `comportamento divergiu do baseline em ${desvios.length} campo(s). ` +
      'Os passos 1 a 7 da migração (docs/architecture.md §6.1) exigem hash IDÊNTICO. ' +
      'Se a mudança foi intencional, o novo baseline precisa de justificativa no commit.',
  )
}
if (seedsDeEmpate.length === 0) {
  throw new Error(
    'QA-D8-01: o BASELINE não contém nenhuma seed com winner === -1 — o ramo de empate de ' +
      '`checkEnd` ficou sem cobertura de regressão (mesmo defeito que `debt.8` corrigiu). ' +
      'Re-fixar uma seed de empate por BUSCA, como a 379 foi achada.',
  )
}
if (desviosBuild.length > 0) {
  throw new Error(
    `comportamento divergiu da cobertura de build em ${desviosBuild.length} campo(s). ` +
      'Isso pega regressão em ramos de código (2ª ativa/passiva) que o BASELINE principal ' +
      'não exercita — ver o comentário de ARCH-001 acima de BUILD_BASELINE.',
  )
}
if (violacoesPilar3.length > 0) {
  throw new Error(
    `Pilar 3 (D-07) violado em ${violacoesPilar3.length} ponto(s) — ver camadas 1/3 acima.`,
  )
}
if (desviosReplay.length > 0) {
  throw new Error(
    `replay divergiu em ${desviosReplay.length} seed(s) — o bot pode estar consumindo ` +
      'world.rng, quebrando o isolamento de stream (D-08). Ver regra 3 de architecture.md §5.2.',
  )
}
if (desviosBotAuto.length > 0) {
  throw new Error(
    `P2.5 (autoconsistência) falhou em ${desviosBotAuto.length} caso(s) — o bot heurístico não é ` +
      'determinístico entre execuções. Suspeitos, nesta ordem: relógio de parede em bot/ (N-1), ' +
      'iteração sobre BotState.porBola (N-2), ou Math.random fora do stream próprio. ' +
      'Ver architecture-e2.md §3.3 — NÃO construir o arnês de balanceamento sobre isto.',
  )
}
if (desviosBotReplay.length > 0) {
  throw new Error(
    `P2.5 (replay) falhou em ${desviosBotReplay.length} seed(s) — a partida do heuristic não se ` +
      'reproduz a partir de (seed, comandos). Suspeitos: o bot escreveu em view (N-3) ou sacou de ' +
      'world.rng, quebrando o isolamento de stream de D-08. Ver architecture-e2.md §3.3.',
  )
}
if (problemasPartida.length > 0) {
  for (const p of problemasPartida) console.log(p)
  throw new Error(
    `a camada de partida falhou em ${problemasPartida.length} ponto(s) — ver acima. A Regra 3 ` +
      '(`architecture-e3.md` §2.5) exige que matchSeed + Decisao[] + Command[] reproduzam placar, ' +
      'sequência de vencedores e os hashes de TODAS as rodadas. Suspeitos, nesta ordem: `aplicar` ' +
      'aplicando decisão pela metade em vez de rejeitar com `erro`; `setupDaRodada` lendo algo que ' +
      'não veio do estado; BotState reusado entre rodadas (M-1); ou crédito de ouro por vitória ' +
      '(RF-23).',
  )
}
if (problemasFio.length > 0) {
  throw new Error(
    `guarda de ida-e-volta do fio (e4.2) falhou em ${problemasFio.length} ponto(s) — ver acima. ` +
      'Suspeitos: campo que render.ts lê e net/snapshot.ts não produz (ou produz fora do ε declarado); ' +
      'evento descartado entre snapshots (AC 5); nome da classe 3 no JSON do fio (AC 4); passiva ' +
      'mudando stat.maxHp/stat.radius no meio da rodada (tripwire — reclassificar o campo, não silenciar).',
  )
}
if (problemasBot001.length > 0) {
  throw new Error(
    `guarda de BOT-001 falhou em ${problemasBot001.length} ponto(s) — ver acima. O limiar de ` +
      '`porValorEsperado` precisa estar escrito no sentido positivo (`!(melhorVE >= limiar)`), ' +
      'senão um VE = NaN faz o bot castar onde a política manda não castar.',
  )
}
