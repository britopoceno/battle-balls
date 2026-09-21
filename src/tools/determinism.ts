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
import { SNAPSHOT_HZ, type DoServidor, type EstaticoDaRodada, type Snapshot } from '../net/protocolo.ts'
// e4.9 — a versão do fio (AC 10), pela mesma seta `tools/ → net/`: a amostra `sala` e a guarda do descompasso.
import { VERSAO_DO_FIO } from '../net/protocolo.ts'
// e4.8 — o codec do fio (AC 4, 5, 6). Mesma seta `tools/ → net/` de `e4.2`; `match/` entra para produzir
// uma `VisaoPartida` real para a ida-e-volta das variantes não-`snap` (AC 5 (d)).
import { codificarDoServidor, decodificarDoServidor, parseDoCliente } from '../net/codec.ts'
import { DescompassoDeVersao } from '../net/codec.ts'
import { aplicar, criarPartida, visaoPara } from '../match/index.ts'
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
import { verificarTelemetria } from './guarda-telemetria.ts'
// e4.3 — a sala pura (AC 11 e 16), pela mesma seta `tools/ → net/`. A Bo5 de referência é a de
// `jogarPartida` (`tools/partida.ts`), e o hash injetado na sala é o `hash` do arnês, importado acima.
import { ATRASO_ALVO_TICKS } from '../net/protocolo.ts'
import {
  CONFIG_PADRAO_DA_SALA,
  criarSala,
  passo,
  type ConfigDaSala,
  type EntradaDaSala,
  type Envio,
  type RodadaEmCurso,
  type Sala,
} from '../net/sala.ts'
import { jogadorDoLado, placarDe, type Decisao, type Jogador, type VisaoPartida } from '../match/index.ts'
import { jogarPartida, type PartidaGravada } from './partida.ts'

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

/** O time de uma variante de `BUILD_BASELINE` — usado aqui e na guarda do fio (`e4.8`, AC 6 (a)). */
function timeDaVariante(v: (typeof BUILD_BASELINE)[number]): PickSetup[] {
  return [
    { charId: 'golem', abilityIndex: v.golemAbility, passiveIndex: v.golemPassive },
    { charId: 'vex', abilityIndex: v.vexAbility, passiveIndex: v.vexPassive },
  ]
}

const desviosBuild: string[] = []
for (const esperado of BUILD_BASELINE) {
  const obtido = rodar(esperado.seed, timeDaVariante(esperado))
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

/**
 * `e4.8`, AC 6 (a) — as rodadas que a guarda do fio observa. As 5 da §1 (`referencia`, bot heurístico)
 * são as de sempre, e só elas alimentam as linhas de contagem e de orçamento já impressas por `e4.2`,
 * que por isso não mudam. As 5 variantes de `BUILD_BASELINE` entram com a seed e o driver congelado da
 * própria variante — é a MESMA rodada que o bloco "cobertura de build" acima já roda, agora observada
 * tick a tick. Sem elas a guarda era cega à 2ª ativa e à 2ª passiva de cada personagem (E42-TST-003:
 * as mutações Q1 e Q3 do gate de `e4.2` passavam verdes). O hash de cada uma é comparado com o do arnês
 * NA MESMA EXECUÇÃO, nunca com o número congelado da tabela (AC 6 (d)).
 */
interface RodadaDoFio {
  rotulo: string
  seed: number
  team: PickSetup[]
  driver: RoundDriver
  referencia: boolean
}

function rodadasDoFio(): RodadaDoFio[] {
  return [
    ...SEEDS_FIO.map((seed) => ({ rotulo: `seed ${seed}`, seed, team: TIME, driver: heuristicDriver, referencia: true })),
    ...BUILD_BASELINE.map((v) => ({
      rotulo: `"${v.label}" seed ${v.seed}`,
      seed: v.seed,
      team: timeDaVariante(v),
      driver: dummyDriver,
      referencia: false,
    })),
  ]
}

/**
 * Igualdade profunda estrita: mesmos tipos, mesmas chaves próprias, primitivos por `===`. Não é
 * `Object.is` de propósito: JSON não carrega `-0` (sai `0`), e `net/snapshot.ts` produz `-0` legítimo ao
 * quantizar um `facing` negativo pequeno — nada que o render leia depende do sinal de um zero.
 */
function profundamenteIgual(a: unknown, b: unknown): boolean {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return a === b
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every(
    (k) => Object.hasOwn(b, k) && profundamenteIgual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  )
}

/** `e4.8`, AC 5 (a) — o que a ida-e-volta pelo codec acumula ao longo do laço do fio. */
interface AchadosCodec {
  fidelidade: string[]
  total: number
  quadros: number
  amostrasProntidao: number
  quadro: number[]
  eventosQuadro: number[]
}

/** Passo `q` da §5.5 — só para as tolerâncias abaixo; a regra de quantização é de `net/codec.ts`. */
const PASSO_FIO = 0.01

/**
 * `e4.8`, AC 5 (a) — `projetar(decodificar(codificar(m)))` contra o `World`, com as tolerâncias do
 * texto do @architect: `x/y/facing/angle` IDÊNTICOS ao snapshot (o codec os repassa), demais números a
 * ±0,005, `ultCharge` em `[u − 0,01, u]`, `abilityReadyAt` a ±0,015 quando não pronto, e os dois
 * predicados de prontidão idênticos aos do `World`.
 */
function compararCodecComMundo(
  world: World,
  v: VisaoDoMundo,
  original: Snapshot,
  decodificado: Snapshot,
  onde: string,
  a: AchadosCodec,
): void {
  const falha = (campo: string, obtido: unknown, esperado: unknown) => {
    a.total++
    anotar(a.fidelidade, `  ✗ codec ${onde} tick ${world.tick}: ${campo} decodificado ${String(obtido)} ≠ ${String(esperado)}`)
  }
  const exato = (campo: string, obtido: unknown, esperado: unknown) => {
    if (obtido !== esperado) falha(campo, obtido, esperado)
  }
  const meioPasso = (campo: string, obtido: number, real: number) => {
    if (!(Math.abs(obtido - real) <= PASSO_FIO / 2 + FOLGA_FP)) falha(`${campo} (±${PASSO_FIO / 2})`, obtido, real)
  }

  meioPasso('time', v.time, world.time)
  exato('over', v.over, world.over)
  exato('winner', v.winner, world.winner)
  exato('arena.w', v.arena.w, world.arena.w)
  exato('arena.h', v.arena.h, world.arena.h)
  meioPasso('arena.pad', v.arena.pad, world.arena.pad)
  if (!profundamenteIgual(decodificado.events, original.events)) falha('events', 'outra sequência', 'os do snapshot')

  for (const erro of [
    mesmosIds('bolas', v.balls, world.balls),
    mesmosIds('projéteis', v.projectiles, world.projectiles),
    mesmosIds('zonas', v.zones, world.zones),
  ]) {
    if (erro) {
      falha('presença', erro, 'mesmos ids')
      return
    }
  }

  world.balls.forEach((b, i) => {
    const p = v.balls[i]
    const s = original.balls[i]
    const r = `bola ${b.id}`
    exato(`${r}.x`, p.x, s.x)
    exato(`${r}.y`, p.y, s.y)
    exato(`${r}.facing`, p.facing, s.facing)
    meioPasso(`${r}.hp`, p.hp, b.hp)
    exato(`${r}.alive`, p.alive, b.alive)
    exato(`${r}.charId`, p.charId, b.charId)
    exato(`${r}.team`, p.team, b.team)
    exato(`${r}.abilityIndex`, p.abilityIndex, b.abilityIndex)
    exato(`${r}.ultThreshold`, p.ultThreshold, b.ultThreshold)
    exato(`${r}.effects[].kind`, p.effects.map((e) => e.kind).join(','), b.effects.map((e) => e.kind).join(','))
    if (!(p.ultCharge <= b.ultCharge && p.ultCharge >= b.ultCharge - PASSO_FIO - FOLGA_FP)) {
      falha(`${r}.ultCharge (em [u − ${PASSO_FIO}, u])`, p.ultCharge, b.ultCharge)
    }
    const prontaNoMundo = world.time >= b.abilityReadyAt
    if (!prontaNoMundo && !(Math.abs(p.abilityReadyAt - b.abilityReadyAt) <= 1.5 * PASSO_FIO + FOLGA_FP)) {
      falha(`${r}.abilityReadyAt (±${1.5 * PASSO_FIO}, não pronta)`, p.abilityReadyAt, b.abilityReadyAt)
    }
    a.amostrasProntidao++
    exato(`${r} prontidão da habilidade (time >= abilityReadyAt)`, v.time >= p.abilityReadyAt, prontaNoMundo)
    exato(`${r} prontidão da ult (ultCharge >= ultThreshold)`, p.ultCharge >= p.ultThreshold, b.ultCharge >= b.ultThreshold)
  })

  world.projectiles.forEach((pw, i) => {
    const p = v.projectiles[i]
    const s = original.projectiles[i]
    const r = `projétil ${pw.id}`
    exato(`${r}.x`, p.x, s.x)
    exato(`${r}.y`, p.y, s.y)
    meioPasso(`${r}.vx`, p.vx, pw.vx)
    meioPasso(`${r}.vy`, p.vy, pw.vy)
    meioPasso(`${r}.radius`, p.radius, pw.radius)
    exato(`${r}.color`, p.color, pw.color)
  })

  world.zones.forEach((z, i) => {
    const p = v.zones[i]
    const s = original.zones[i]
    const r = `zona ${z.id}`
    exato(`${r}.kind`, p.kind, z.kind)
    exato(`${r}.x`, p.x, s.x)
    exato(`${r}.y`, p.y, s.y)
    exato(`${r}.angle`, p.angle, s.angle)
    meioPasso(`${r}.halfLen`, p.halfLen, z.halfLen)
    meioPasso(`${r}.radius`, p.radius, z.radius)
    meioPasso(`${r}.pull`, p.pull, z.pull)
    exato(`${r}.ownerColor`, p.ownerColor, z.ownerColor)
  })
}

function guardaFio(): { linhas: string[]; problemas: string[]; codec: AchadosCodec } {
  const achados: Achados = {
    fidelidade: [],
    tripwire: [],
    presenca: [],
    totalFidelidade: 0,
    totalTripwire: 0,
    totalPresenca: 0,
  }
  const codec: AchadosCodec = { fidelidade: [], total: 0, quadros: 0, amostrasProntidao: 0, quadro: [], eventosQuadro: [] }
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
  // E42-TST-004 — o ✓ e o texto da linha `eventos` saem DAQUI, da comparação de sequência
  let sequenciasDivergentes = 0
  // AC 6 (a) — as variantes de BUILD_BASELINE, contadas à parte das 5 rodadas de referência
  let variantes = 0
  let ticksVariantes = 0
  let sequenciasDivergentesVariantes = 0
  let hashesIguaisVariantes = 0
  // AC 6 (b) — canário de composição
  let ticksComAbilityIndex1 = 0
  const passivasEquipadas = new Set<string>()

  if (!Number.isInteger(INTERVALO_SNAPSHOT)) {
    problemas.push(`  ✗ fio: TICK_HZ/SNAPSHOT_HZ = ${INTERVALO_SNAPSHOT} não é inteiro — a cadência da guarda não se aplica`)
    return { linhas: [], problemas, codec }
  }

  const contarHits = (evs: SimEvent[]) => evs.filter((e) => e.t === 'hit').length

  for (const rodada of rodadasDoFio()) {
    const { seed, referencia } = rodada
    const s = setup(seed, rodada.team)
    const world = createWorld(CHARS, s)
    const driver = rodada.driver(s)
    const estatico = estaticoDaRodada(world)
    const jsonEstatico = JSON.stringify(estatico)
    if (referencia) orc.estatico.push(Buffer.byteLength(jsonEstatico, 'utf8'))
    for (const n of vazamentosClasse3(jsonEstatico)) vazados.add(`estático:${n}`)
    if (chavesDoJson(estatico).has('color')) vazados.add('estático:color')
    for (const b of world.balls) passivasEquipadas.add(`${b.charId}:${b.passiveIndex}`)

    const porTick = criarProdutorDeSnapshot(world)
    const naCadencia = criarProdutorDeSnapshot(world)
    const produzidos: SimEvent[] = []
    const entregues: SimEvent[] = []
    let seq = 0

    const conferir = (snap: Snapshot) => {
      compararComMundo(world, projetar(snap, estatico, CHARS), estatico, seed, achados)
    }
    conferir(porTick.snapshot(world)) // tick 0, antes do primeiro step

    // AC 5 (a) — o mesmo quadro que sai na cadência, agora pelo fio de verdade: codificar → texto →
    // decodificar → projetar, contra o World do mesmo tick.
    const conferirCodec = (snap: Snapshot) => {
      const msg: DoServidor = { t: 'snap', s: snap, seq }
      const texto = codificarDoServidor(msg)
      codec.quadros++
      if (referencia) {
        codec.quadro.push(Buffer.byteLength(texto, 'utf8'))
        codec.eventosQuadro.push(bytes(snap.events))
      }
      if (seq === 0) {
        const envelope = Object.keys(JSON.parse(texto) as object).join(',')
        if (envelope !== 't,seq,s') {
          codec.total++
          anotar(codec.fidelidade, `  ✗ codec ${rodada.rotulo}: envelope do snap com chaves [${envelope}], esperado [t,seq,s]`)
        }
      }
      try {
        const volta = decodificarDoServidor(texto)
        if (volta.t !== 'snap' || volta.seq !== seq) {
          codec.total++
          anotar(codec.fidelidade, `  ✗ codec ${rodada.rotulo} tick ${world.tick}: voltou t=${volta.t}, seq ${volta.t === 'snap' ? volta.seq : '—'} (esperado snap, seq ${seq})`)
        } else {
          compararCodecComMundo(world, projetar(volta.s, estatico, CHARS), snap, volta.s, rodada.rotulo, codec)
        }
      } catch (e) {
        codec.total++
        anotar(codec.fidelidade, `  ✗ codec ${rodada.rotulo} tick ${world.tick}: decodificar lançou — ${(e as Error).message}`)
      }
      seq++
    }

    while (!world.over && world.tick < MAX_ROUND_TICKS) {
      step(world, driver(world))
      produzidos.push(...world.events)

      porTick.observar(world)
      const snap60 = porTick.snapshot(world)
      const json60 = JSON.stringify(snap60)
      if (referencia) orc.tick60.push(Buffer.byteLength(json60, 'utf8'))
      for (const n of vazamentosClasse3(json60)) vazados.add(`snapshot:${n}`)
      conferir(snap60)

      naCadencia.observar(world)
      const fimDaRodada = world.over || world.tick >= MAX_ROUND_TICKS
      if (world.tick % INTERVALO_SNAPSHOT === 0 || fimDaRodada) {
        const snap = naCadencia.snapshot(world)
        const json = JSON.stringify(snap)
        if (referencia) {
          orc.quadro.push(Buffer.byteLength(json, 'utf8'))
          orc.eventosQuadro.push(bytes(snap.events))
        }
        for (const n of vazamentosClasse3(json)) vazados.add(`snapshot:${n}`)
        entregues.push(...snap.events)
        conferirCodec(snap)
      }

      if (world.projectiles.length > 0) cobertura.projeteis++
      if (world.zones.some((z) => z.kind === 'wall')) cobertura.muralhas++
      if (world.zones.some((z) => z.kind === 'vortex')) cobertura.vortices++
      if (world.balls.some((b) => b.effects.length > 0)) cobertura.efeitos++
      if (world.balls.some((b) => !b.alive)) cobertura.mortes++
      if (world.arena.pad > 0) cobertura.arenaEncolhida++
      if (world.balls.some((b) => b.abilityIndex !== 0)) ticksComAbilityIndex1++
    }

    // AC 5 — mais forte que a soma de `hit`: a sequência inteira de eventos, de todos os tipos, na ordem
    const sequenciaIgual = JSON.stringify(produzidos) === JSON.stringify(entregues)
    if (!sequenciaIgual) {
      problemas.push(
        `  ✗ eventos ${rodada.rotulo}: ${produzidos.length} produzido(s) pela rodada, ${entregues.length} nos snapshots a ${SNAPSHOT_HZ} Hz (ou sequência diferente)`,
      )
    }

    const hashArnes = runRound(CHARS, s, rodada.driver).hash
    const hashIgual = hash(world) === hashArnes
    if (!hashIgual) {
      problemas.push(
        `  ✗ fio ${rodada.rotulo}: hash da rodada observada ${hash(world)} ≠ arnês ${hashArnes} — o laço da guarda divergiu de harness.ts, ou produzir snapshot escreveu no World`,
      )
    }

    if (referencia) {
      ticksTotais += world.tick
      hitsProduzidos += contarHits(produzidos)
      hitsEntregues += contarHits(entregues)
      eventosProduzidos += produzidos.length
      for (const e of produzidos) tiposDeEvento.add(e.t)
      if (!sequenciaIgual) sequenciasDivergentes++
      if (hashIgual) hashesIguais++
    } else {
      variantes++
      ticksVariantes += world.tick
      if (!sequenciaIgual) sequenciasDivergentesVariantes++
      if (hashIgual) hashesIguaisVariantes++
    }

    // o contrato do acumulador falha alto: observar o mesmo tick de novo tem que lançar
    let lancou = false
    try {
      naCadencia.observar(world)
    } catch {
      lancou = true
    }
    if (!lancou) problemas.push(`  ✗ fio ${rodada.rotulo}: observar() duas vezes no mesmo tick não lançou — eventos duplicariam`)
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

  // AC 6 (b) — as duas contagens de composição. A lista de passivas é DERIVADA do roster: um
  // personagem novo (Fase 5) que não entre numa rodada da guarda reprova aqui, em vez de passar a
  // tripwire em silêncio como a Fantasma passava (Q1).
  const passivasDoRoster = Object.values(CHARS).flatMap((c) => c.passives.map((p, i) => ({ chave: `${c.id}:${i}`, nome: `${c.id}:${p.id}` })))
  const passivasFora = passivasDoRoster.filter((p) => !passivasEquipadas.has(p.chave)).map((p) => p.nome)
  if (ticksComAbilityIndex1 === 0) {
    problemas.push('  ✗ fio: canário de composição — nenhum tick com bola de abilityIndex ≠ 0; a guarda não vê a 2ª ativa (E42-TST-003, Q3)')
  }
  if (passivasFora.length) {
    problemas.push(`  ✗ fio: canário de composição — passiva(s) do roster sem rodada na guarda: [${passivasFora.join(', ')}] (E42-TST-003, Q1)`)
  }

  problemas.push(...achados.presenca, ...achados.fidelidade, ...achados.tripwire)
  if (achados.totalPresenca + achados.totalFidelidade + achados.totalTripwire > 0) {
    problemas.push(
      `  ✗ fio: ${achados.totalPresenca} divergência(s) de presença, ${achados.totalFidelidade} de campo, ${achados.totalTripwire} de tripwire (mostradas até ${MAX_MENSAGENS_FIO} de cada)`,
    )
  }

  const media = (xs: number[]) => xs.reduce((t, x) => t + x, 0) / xs.length
  const pico = (xs: number[]) => Math.max(...xs)
  const f1 = (x: number) => x.toFixed(1)
  const variantesOk = sequenciasDivergentesVariantes === 0 && hashesIguaisVariantes === variantes
  const linhas = [
    `fio snapshot   ${problemas.length === 0 ? '✓ ok' : '✗ falhou'} — ${SEEDS_FIO.length} rodadas (heuristic), ${ticksTotais} ticks: projetar(snapshot) bate o World em todo campo que render.ts lê, com presença e ids iguais (ε ${EPS_POSICAO_PX} px · ${EPS_ANGULO_RAD} rad)`,
    `  tripwire estático ${achados.totalTripwire === 0 ? '✓' : '✗'} stat.maxHp/stat.radius do World = EstaticoDaRodada em todo tick`,
    `  eventos      ${sequenciasDivergentes === 0 ? '✓' : '✗'} ${hitsProduzidos} hit produzidos ${hitsProduzidos === hitsEntregues ? '=' : '≠'} ${hitsEntregues} nos snapshots a ${SNAPSHOT_HZ} Hz · ${eventosProduzidos} eventos de ${tiposDeEvento.size} tipos [${[...tiposDeEvento].sort().join(',')}], ${sequenciasDivergentes === 0 ? 'sequência idêntica' : `sequência DIVERGENTE em ${sequenciasDivergentes}/${SEEDS_FIO.length} rodada(s)`}`,
    `  classe 3     ${vazados.size === 0 && faltandoNoCanario.length === 0 ? '✓' : '✗'} nenhum nome no JSON do fio · o detector acusa ${acusados.length}/${esperadosNoCanario.length} no World do motor (rng não serializa)`,
    `  hash         ${hashesIguais === SEEDS_FIO.length ? '✓' : '✗'} observar a rodada não a altera (${hashesIguais}/${SEEDS_FIO.length} hashes = arnês)`,
    `  orçamento    ${SNAPSHOT_HZ} Hz: média ${f1(media(orc.quadro))} B/quadro (${f1(media(orc.quadro) / INTERVALO_SNAPSHOT)} B/tick) · pico ${pico(orc.quadro)} B · dos quais events: média ${f1(media(orc.eventosQuadro))} B, pico ${pico(orc.eventosQuadro)} B`,
    `               60 Hz, 1 snapshot/tick: média ${f1(media(orc.tick60))} B/tick · pico ${pico(orc.tick60)} B · estático ${pico(orc.estatico)} B uma vez por rodada (JSON com nomes de campo; §1.2 mediu 263/433 B sem eles)`,
    `  variantes    ${variantesOk ? '✓' : '✗'} ${variantes} de BUILD_BASELINE (driver congelado, seed da variante), ${ticksVariantes} ticks: entram na fidelidade, na tripwire e na classe 3 acima · eventos em sequência idêntica ${variantes - sequenciasDivergentesVariantes}/${variantes} · hash = arnês ${hashesIguaisVariantes}/${variantes}`,
    `  composição   ${ticksComAbilityIndex1 > 0 && passivasFora.length === 0 ? '✓' : '✗'} ${ticksComAbilityIndex1} ticks com bola de abilityIndex ≠ 0 · passivas do roster equipadas em alguma rodada ${passivasDoRoster.length - passivasFora.length}/${passivasDoRoster.length} [${passivasDoRoster.map((p) => p.nome).join(', ')}]`,
  ]
  return { linhas, problemas, codec }
}

const { linhas: linhasFio, problemas: problemasFio, codec: achadosCodec } = guardaFio()

// ------------------------------------------ parser de entrada (e4.8, AC 4) — parseDoCliente

/**
 * `e4.8`, AC 4 — o fio de ENTRADA fechado em runtime. Os casos "→ null" são a lista do AC, cada um
 * provado contra a fonte (`aimFrom`, `castCommand`, `aplicar`). O lado "→ parse OK" existe para o
 * parser não passar por rejeitar tudo: toda variante válida volta profundamente igual pela ida-e-volta
 * JSON, e `tick`/extra somem por construção (descarte, não recusa).
 */
function guardaParser(): { linha: string; problemas: string[] } {
  const problemas: string[] = []
  const cast = { t: 'cast', ballIndex: 0, slot: 'ability', dx: 0.6, dy: -0.8, mag: 0.5 }
  const herdado: object = Object.create({ t: 'pong', id: 1 })
  const nulos: [string, unknown][] = [
    ['raw null', null],
    ['raw array', [cast]],
    ['raw string', 'cast'],
    ['raw número', 42],
    ['t desconhecido', { t: 'voar' }],
    ['t só herdado do protótipo', herdado],
    ['dx NaN', { ...cast, dx: NaN }],
    ['dx de JSON.parse 1e999', JSON.parse('{"t":"cast","ballIndex":0,"slot":"ability","dx":1e999,"dy":0,"mag":1}')],
    ['mag -Infinity', { ...cast, mag: -Infinity }],
    ['dx "1"', { ...cast, dx: '1' }],
    ["slot 'passive'", { ...cast, slot: 'passive' }],
    ['ballIndex 2', { ...cast, ballIndex: 2 }],
    ['ballIndex 0.5', { ...cast, ballIndex: 0.5 }],
    ['d.jogador 2', { t: 'decisao', d: { t: 'pronto', jogador: 2 } }],
    ['d.t desconhecido', { t: 'decisao', d: { t: 'banir', jogador: 0 } }],
    ['cast sem mag', { t: 'cast', ballIndex: 0, slot: 'ability', dx: 1, dy: 0 }],
    ['entrar sem sala', { t: 'entrar' }],
    ['entrar com assento número', { t: 'entrar', sala: 'abc', assento: 7 }],
    ['pong sem id', { t: 'pong' }],
    ['pong id Infinity', { t: 'pong', id: Infinity }],
    ['decisao sem d', { t: 'decisao' }],
    ['build sem passiveIndex', { t: 'decisao', d: { t: 'build', jogador: 0, slot: 0, abilityIndex: 1 } }],
    ['compra com itemId número', { t: 'decisao', d: { t: 'compra', jogador: 1, slot: 0, itemId: 3 } }],
  ]
  for (const [rotulo, raw] of nulos) {
    const r = parseDoCliente(raw)
    if (r !== null) problemas.push(`  ✗ parser: "${rotulo}" devolveu ${JSON.stringify(r)} em vez de null`)
  }

  // → parse OK, com descarte (AC 4 (c))
  const comExtra = { t: 'cast', ballIndex: 1, slot: 'ult', dx: 0, dy: 1, mag: 1, tick: 5, extra: 1 }
  const limpo = parseDoCliente(comExtra)
  if (limpo === null || 'tick' in limpo || 'extra' in limpo || (limpo as unknown) === comExtra) {
    problemas.push(`  ✗ parser: {t:'cast', …, tick: 5, extra: 1} devolveu ${JSON.stringify(limpo)} — tick/extra têm de sumir num objeto novo`)
  } else if (!profundamenteIgual(limpo, { t: 'cast', ballIndex: 1, slot: 'ult', dx: 0, dy: 1, mag: 1 })) {
    problemas.push(`  ✗ parser: o cast com extra perdeu campos conhecidos — ${JSON.stringify(limpo)}`)
  }
  const semAssento = parseDoCliente({ t: 'entrar', sala: 'abc' })
  if (semAssento === null || 'assento' in semAssento) {
    problemas.push(`  ✗ parser: entrar sem assento devolveu ${JSON.stringify(semAssento)} — ausente tem de continuar ausente`)
  }

  const validos: unknown[] = [
    { t: 'entrar', sala: 'abc' },
    { t: 'entrar', sala: 'abc', assento: 'segredo' },
    { t: 'decisao', d: { t: 'draft', jogador: 0, charId: 'golem' } },
    { t: 'decisao', d: { t: 'build', jogador: 1, slot: 0, abilityIndex: 1, passiveIndex: 0 } },
    { t: 'decisao', d: { t: 'buildPadrao', jogador: 0 } },
    { t: 'decisao', d: { t: 'compra', jogador: 1, slot: 1, itemId: 'lamina' } },
    { t: 'decisao', d: { t: 'trocaDeBuild', jogador: 0, slot: 1, abilityIndex: 0, passiveIndex: 1 } },
    { t: 'decisao', d: { t: 'pronto', jogador: 1 } },
    cast,
    { ...cast, ballIndex: 1, slot: 'ult' },
    { t: 'pong', id: 3 },
  ]
  for (const msg of validos) {
    const r = parseDoCliente(JSON.parse(JSON.stringify(msg)))
    if (!profundamenteIgual(r, msg)) problemas.push(`  ✗ parser: ${JSON.stringify(msg)} válido voltou ${JSON.stringify(r)}`)
  }

  // debt.12 (AC 3, E48-TST-001) — a mesma prova, POR CAMPO e não por caso: cada campo que passa por
  // `finito()` ou `bit()` em `parseDoCliente`, isoladamente, com os quatro valores adversariais do gate; e o
  // descarte de `tick`/`extra` em toda variante, não só em `cast`. Complementa `nulos`/`validos` acima.
  const pong = { t: 'pong', id: 3 }
  const dValidos: Record<string, Record<string, unknown>> = {
    draft: { t: 'draft', jogador: 0, charId: 'golem' },
    build: { t: 'build', jogador: 1, slot: 0, abilityIndex: 1, passiveIndex: 0 },
    buildPadrao: { t: 'buildPadrao', jogador: 0 },
    compra: { t: 'compra', jogador: 1, slot: 1, itemId: 'lamina' },
    trocaDeBuild: { t: 'trocaDeBuild', jogador: 0, slot: 1, abilityIndex: 0, passiveIndex: 1 },
    pronto: { t: 'pronto', jogador: 1 },
  }
  const decisaoCom = (d: Record<string, unknown>) => ({ t: 'decisao', d })
  /** `1e999` como chega do socket: pelo `JSON.parse` (o literal no fonte já seria `Infinity`). */
  const comTexto1e999 = (msg: Record<string, unknown>, chave: string, emD: boolean): unknown => {
    const alvo = emD ? { ...msg, d: { ...(msg.d as object), [chave]: 0 } } : { ...msg, [chave]: 0 }
    const r = JSON.parse(JSON.stringify(alvo).replace(`"${chave}":0`, `"${chave}":1e999`)) as Record<string, unknown>
    const v = emD ? (r.d as Record<string, unknown>)[chave] : r[chave]
    if (v !== Infinity) problemas.push(`  ✗ parser: a tabela não montou 1e999 em ${chave} (${String(v)}) — o caso não testa nada`)
    return r
  }
  const numericos: [rotulo: string, msg: Record<string, unknown>, chave: string][] = [
    ['cast.dx', cast, 'dx'],
    ['cast.dy', cast, 'dy'],
    ['cast.mag', cast, 'mag'],
    ['pong.id', pong, 'id'],
  ]
  let casosNumericos = 0
  for (const [rotulo, msg, chave] of numericos) {
    const casos: [string, unknown][] = [
      ['NaN', { ...msg, [chave]: NaN }],
      ['1e999 de JSON.parse', comTexto1e999(msg, chave, false)],
      ['-Infinity', { ...msg, [chave]: -Infinity }],
      ['"1"', { ...msg, [chave]: '1' }],
    ]
    for (const [valor, raw] of casos) {
      casosNumericos++
      const r = parseDoCliente(raw)
      if (r !== null) problemas.push(`  ✗ parser: ${rotulo} ${valor} devolveu ${JSON.stringify(r)} em vez de null`)
    }
  }
  const bits: [rotulo: string, msg: Record<string, unknown>, chave: string, emD: boolean][] = [
    ['cast.ballIndex', cast, 'ballIndex', false],
    ...Object.entries(dValidos).map(([t, d]): [string, Record<string, unknown>, string, boolean] => [
      `${t}.jogador`,
      decisaoCom(d),
      'jogador',
      true,
    ]),
    ...(['build', 'trocaDeBuild'] as const).flatMap((t) =>
      (['slot', 'abilityIndex', 'passiveIndex'] as const).map((k): [string, Record<string, unknown>, string, boolean] => [
        `${t}.${k}`,
        decisaoCom(dValidos[t]),
        k,
        true,
      ]),
    ),
    ['compra.slot', decisaoCom(dValidos.compra), 'slot', true],
  ]
  let casosBits = 0
  for (const [rotulo, msg, chave, emD] of bits) {
    for (const valor of [2, 0.5, '0', true]) {
      casosBits++
      const raw = emD ? { ...msg, d: { ...(msg.d as object), [chave]: valor } } : { ...msg, [chave]: valor }
      const r = parseDoCliente(raw)
      if (r !== null) problemas.push(`  ✗ parser: ${rotulo} ${JSON.stringify(valor)} devolveu ${JSON.stringify(r)} em vez de null`)
    }
  }
  const descartes: [rotulo: string, valida: Record<string, unknown>, raw: Record<string, unknown>][] = [
    ['entrar sem assento', { t: 'entrar', sala: 'abc' }, { t: 'entrar', sala: 'abc', tick: 5, extra: 1 }],
    ['entrar com assento', { t: 'entrar', sala: 'abc', assento: 'segredo' }, { t: 'entrar', sala: 'abc', assento: 'segredo', tick: 5, extra: 1 }],
    ['cast', cast, { ...cast, tick: 5, extra: 1 }],
    ['pong', pong, { ...pong, tick: 5, extra: 1 }],
    ...Object.entries(dValidos).flatMap(([t, d]): [string, Record<string, unknown>, Record<string, unknown>][] => [
      [`decisao ${t}, extra fora`, decisaoCom(d), { ...decisaoCom(d), tick: 5, extra: 1 }],
      [`decisao ${t}, extra em d`, decisaoCom(d), decisaoCom({ ...d, tick: 5, extra: 1 })],
    ]),
  ]
  for (const [rotulo, valida, raw] of descartes) {
    const r = parseDoCliente(raw) as Record<string, unknown> | null
    const dNovo = raw.t !== 'decisao' || (r !== null && r.d !== raw.d)
    if (r === null || r === raw || !dNovo || !profundamenteIgual(r, valida)) {
      problemas.push(`  ✗ parser: ${rotulo} com tick/extra devolveu ${JSON.stringify(r)} — tem de voltar ${JSON.stringify(valida)}, num objeto novo (e d novo)`)
    }
  }

  const linha = `  parser       ${problemas.length === 0 ? '✓' : '✗'} parseDoCliente: ${nulos.length} casos → null (não-objeto, t/slot/d.t desconhecidos, não-finitos inclusive 1e999, número-como-string, faixas, campo ausente) · tick e extra descartados num objeto novo · ${validos.length} mensagens válidas reconstruídas iguais · por campo: ${numericos.length} numéricos × 4 = ${casosNumericos} e ${bits.length} campos 0|1 × 4 = ${casosBits} → null · tick/extra descartados em ${descartes.length} formas (4 variantes, entrar com e sem assento, 6 de decisao.d por fora e em d)`
  return { linha, problemas }
}

// ---------------------------------------- codec de saída (e4.8, AC 5) — fronteira, roster, fio

/**
 * Um snapshot com uma entidade de cada tipo, para os casos sintéticos: a fronteira de prontidão (AC 5
 * (b)) e a aridade divergente. Os valores de posição não importam; a bola é o sujeito.
 */
function snapshotSintetico(time: number, abilityReadyAt: number, ultCharge: number): Snapshot {
  return {
    time,
    over: false,
    winner: -1,
    arena: { w: 960, h: 540, pad: 0 },
    balls: [{ id: 1, x: 100, y: 200, facing: 0.5, hp: 500, alive: true, ultCharge, abilityReadyAt, effects: [{ kind: 'slow' }] }],
    projectiles: [{ id: 2, x: 10, y: 20, vx: 300.123, vy: -40.5, radius: 5, color: '#b98cff' }],
    zones: [{ id: 3, kind: 'wall', x: 30, y: 40, angle: 1.234, halfLen: 60, radius: 9, pull: 0, ownerColor: '#8a8' }],
    events: [{ t: 'hit', x: 1, y: 2, amount: 3.14159, targetId: 1, crit: false }],
  }
}

/**
 * O CONTRAFACTUAL do AC 5 (b): um codec ingênuo que arredonda tudo a 0,01 — `time`, `abilityReadyAt`
 * ABSOLUTO e `ultCharge` — e devolve os dois predicados que o cliente calcularia. Existe só para
 * falhar: a rodada real não toca a fronteira (0 viradas em 46 340 amostras, §5.5), então é este caso
 * que dá poder discriminante à guarda. Se ele passar a acertar tudo, a guarda perdeu o dente.
 */
function prontidaoIngenua(s: Snapshot, limiar: number): { habilidade: boolean; ult: boolean } {
  const r = (v: number) => Math.round(v * 100) / 100
  const b = s.balls[0]
  return { habilidade: r(s.time) >= r(b.abilityReadyAt), ult: r(b.ultCharge) >= limiar }
}

function guardaCodec(a: AchadosCodec): { linhas: string[]; problemas: string[]; variantesNaoSnap: string[] } {
  const problemas: string[] = [...a.fidelidade]
  if (a.total > 0) problemas.push(`  ✗ codec: ${a.total} divergência(s) na ida-e-volta das rodadas (mostradas até ${MAX_MENSAGENS_FIO})`)
  if (a.quadros === 0 || a.amostrasProntidao === 0) problemas.push('  ✗ codec: canário — nenhum quadro passou pelo codec; a guarda (a) não mede nada')

  // (c) tripwire do roster: o piso só preserva `u' ≥ thr ⇔ u ≥ thr` se o limiar for múltiplo de 0,01
  const limiares = Object.values(CHARS).map((c) => ({ id: c.id, thr: c.ult.threshold }))
  const foraDoPasso = limiares.filter((l) => Math.round(l.thr * 100) / 100 !== l.thr)
  for (const l of foraDoPasso) {
    problemas.push(`  ✗ codec: ult.threshold de ${l.id} = ${l.thr} não é múltiplo de 0,01 — o piso de ultCharge vira a prontidão da ult (§5.5)`)
  }

  // (b) fronteira: restante de +0,004, 0 e −0,004 ms; ultCharge em thr − 0,004 e thr
  const tempos = [1, 7, 600, 4773].map((t) => t * TICK_MS)
  let casos = 0
  let viradasCodec = 0
  let viradasIngenuoHabilidade = 0
  let viradasIngenuoUlt = 0
  for (const time of tempos) {
    for (const { thr } of limiares) {
      for (const restante of [0.004, 0, -0.004]) {
        for (const ultCharge of [thr - 0.004, thr]) {
          const snap = snapshotSintetico(time, time + restante, ultCharge)
          const verdade = { habilidade: time >= time + restante, ult: ultCharge >= thr }
          casos++
          const volta = decodificarDoServidor(codificarDoServidor({ t: 'snap', s: snap, seq: 0 }))
          if (volta.t !== 'snap') {
            viradasCodec++
            continue
          }
          const b = volta.s.balls[0]
          if ((volta.s.time >= b.abilityReadyAt) !== verdade.habilidade || (b.ultCharge >= thr) !== verdade.ult) viradasCodec++
          const ing = prontidaoIngenua(snap, thr)
          if (ing.habilidade !== verdade.habilidade) viradasIngenuoHabilidade++
          if (ing.ult !== verdade.ult) viradasIngenuoUlt++
        }
      }
    }
  }
  // debt.12 (AC 4, E48-TST-002) — limiares sintéticos NÃO inteiros, múltiplos de 0,01, na mesma varredura
  // (mesmos tempos, restantes e par thr − 0,004 / thr), além dos do roster, e não no lugar deles. O dente
  // contra `pisoQ` sem a correção para cima é o 0.29: `0.29 * 100 === 28.999…`. 110.07 e 87.04 dão
  // produto exato no Node e só ficam porque o gate os pediu; por isso o canário abaixo.
  const LIMIARES_SINTETICOS = [110.07, 0.29, 87.04]
  let casosSinteticos = 0
  let viradasSinteticas = 0
  for (const time of tempos) {
    for (const thr of LIMIARES_SINTETICOS) {
      for (const restante of [0.004, 0, -0.004]) {
        for (const ultCharge of [thr - 0.004, thr]) {
          casosSinteticos++
          const volta = decodificarDoServidor(codificarDoServidor({ t: 'snap', s: snapshotSintetico(time, time + restante, ultCharge), seq: 0 }))
          if (volta.t !== 'snap') {
            viradasSinteticas++
            continue
          }
          const b = volta.s.balls[0]
          if ((volta.s.time >= b.abilityReadyAt) !== (time >= time + restante) || (b.ultCharge >= thr) !== (ultCharge >= thr)) viradasSinteticas++
        }
      }
    }
  }
  const abaixoDoInteiro = LIMIARES_SINTETICOS.filter((thr) => thr * 100 < Math.round(thr * 100))
  if (viradasSinteticas > 0) {
    problemas.push(`  ✗ codec: a regra da §5.5 virou a prontidão em ${viradasSinteticas}/${casosSinteticos} casos com limiar sintético não inteiro [${LIMIARES_SINTETICOS.join(', ')}]`)
  }
  if (abaixoDoInteiro.length === 0) {
    problemas.push(
      `  ✗ codec: canário — nenhum limiar sintético [${LIMIARES_SINTETICOS.join(', ')}] tem thr × 100 abaixo do inteiro; os limiares sintéticos perderam poder discriminante (pisoQ sem a correção para cima passaria)`,
    )
  }
  if (viradasCodec > 0) problemas.push(`  ✗ codec: a regra da §5.5 virou a prontidão em ${viradasCodec}/${casos} casos na fronteira`)
  if (viradasIngenuoHabilidade === 0 || viradasIngenuoUlt === 0) {
    problemas.push(
      `  ✗ codec: o contrafactual ingênuo NÃO falhou (habilidade ${viradasIngenuoHabilidade}, ult ${viradasIngenuoUlt} viradas) — os casos sintéticos perderam poder discriminante`,
    )
  }

  // aridade divergente: acréscimo e remoção de campo, em cada nível da tupla, e `t` fora do vocabulário
  const base = codificarDoServidor({ t: 'snap', s: snapshotSintetico(1000, 1200, 50), seq: 4 })
  const mutacoes: [string, (s: unknown[]) => void][] = [
    ['snap.s + 1', (s) => s.push(0)],
    ['snap.s − 1', (s) => void s.pop()],
    ['bola + 1', (s) => (s[6] as unknown[][])[0].push(0)],
    ['bola − 1', (s) => void (s[6] as unknown[][])[0].pop()],
    ['projétil + 1', (s) => (s[7] as unknown[][])[0].push(0)],
    ['zona − 1', (s) => void (s[8] as unknown[][])[0].pop()],
  ]
  let lancou = 0
  const aridadeCasos = mutacoes.length + 1
  for (const [rotulo, mutar] of mutacoes) {
    const m = JSON.parse(base) as { s: unknown[] }
    mutar(m.s)
    try {
      decodificarDoServidor(JSON.stringify(m))
      problemas.push(`  ✗ codec: aridade divergente (${rotulo}) não lançou`)
    } catch {
      lancou++
    }
  }
  try {
    decodificarDoServidor('{"t":"teleporte","seq":1}')
    problemas.push("  ✗ codec: t fora do vocabulário de DoServidor não lançou")
  } catch {
    lancou++
  }

  // (d) toda variante que não é `snap` volta idêntica. O `satisfies` obriga uma amostra por variante:
  // uma variante nova de DoServidor sem amostra aqui é erro de compilação.
  const partida = criarPartida({ seed: 1, pool: Object.keys(CHARS) })
  const aposDraft = aplicar(partida, { t: 'draft', jogador: 0, charId: Object.keys(CHARS)[0] }).estado
  const amostras = {
    sala: { t: 'sala', versao: VERSAO_DO_FIO, jogador: 1, estado: 'jogando', assento: 'a3f9c2e1', snapshotHz: 30 },
    visao: { t: 'visao', v: visaoPara(partida, 0) },
    prazo: { t: 'prazo', terminaEmMs: 29999.5 },
    rodadaInicio: { t: 'rodadaInicio', estatico: estaticoDaRodada(createWorld(CHARS, setup(1))) },
    rodadaFim: {
      t: 'rodadaFim',
      resultado: { indice: 0, seedDaRodada: 123, ladoDoJogador: [0, 1], vencedor: 1, ticks: 4773, hash: '327b60f3' },
    },
    erro: { t: 'erro', motivo: 'não é a sua vez' },
    ping: { t: 'ping', id: 7 },
  } satisfies { [K in Exclude<DoServidor['t'], 'snap'>]: Extract<DoServidor, { t: K }> }
  const naoSnap: DoServidor[] = [...Object.values(amostras), { t: 'visao', v: visaoPara(aposDraft, 1) }]
  let naoSnapFalhas = 0
  for (const msg of naoSnap) {
    try {
      const volta = decodificarDoServidor(codificarDoServidor(msg))
      if (!profundamenteIgual(volta, msg)) {
        naoSnapFalhas++
        problemas.push(`  ✗ codec: {t:'${msg.t}'} não voltou idêntica pela ida-e-volta`)
      }
    } catch (e) {
      naoSnapFalhas++
      problemas.push(`  ✗ codec: {t:'${msg.t}'} — decodificar lançou: ${(e as Error).message}`)
    }
  }

  // e4.9 (AC 10) — o {t:'sala'} recusado em runtime (§11.6.1). A versão certa já volta idêntica acima
  // (amostra `sala`, linha `não-snap`); aqui só os negativos, numa linha própria, fora dos contadores
  // `lancou`/`aridadeCasos`/`naoSnap` (AC 11: a linha `não-snap` não muda de texto). Cada caso é a
  // amostra válida com UM campo alterado ou removido, para só poder lançar pela checagem que mira; a
  // exceção é a "forma de hoje", sem os três campos, que prende a ordem do AC 7 (d): versão PRIMEIRO.
  const salaCom = (k: string, v: unknown): Record<string, unknown> => ({ ...amostras.sala, [k]: v })
  const salaSem = (k: string): Record<string, unknown> => {
    const m: Record<string, unknown> = { ...amostras.sala }
    delete m[k]
    return m
  }
  const descompassos: [rotulo: string, msg: Record<string, unknown>, enviado: unknown][] = [
    ['versao ausente', salaSem('versao'), undefined],
    // debt.12 (AC 9, §11.6.2 M-9): a versão seguinte RELATIVA — com um literal 2, subir VERSAO_DO_FIO a 2
    // faria este caso parar de lançar e a linha ficar vermelha.
    [`versao ${VERSAO_DO_FIO + 1}`, salaCom('versao', VERSAO_DO_FIO + 1), VERSAO_DO_FIO + 1],
    ['versao "1"', salaCom('versao', '1'), '1'],
    ['forma de hoje', { t: 'sala', jogador: 1, estado: 'jogando' }, undefined],
  ]
  const mostrar = (v: unknown): string => (v === undefined ? 'undefined' : JSON.stringify(v))
  let descompassoOk = 0
  for (const [rotulo, msg, enviado] of descompassos) {
    try {
      decodificarDoServidor(JSON.stringify(msg))
      problemas.push(`  ✗ codec: {t:'sala'} com ${rotulo} não lançou`)
    } catch (e) {
      if (!(e instanceof DescompassoDeVersao)) {
        problemas.push(`  ✗ codec: {t:'sala'} com ${rotulo} lançou, mas não DescompassoDeVersao — ${(e as Error).message}`)
      } else if (!('servidor' in e)) {
        // debt.12 (AC 9 c, E49-TST-003): sem este ramo, o par abaixo sai "servidor undefined (esperado
        // undefined)" — igual ao de um erro de valor — quando só a propriedade falta.
        problemas.push(`  ✗ codec: {t:'sala'} com ${rotulo} — DescompassoDeVersao sem a propriedade servidor`)
      } else if (!Object.is(e.servidor, enviado) || e.cliente !== VERSAO_DO_FIO) {
        problemas.push(
          `  ✗ codec: {t:'sala'} com ${rotulo} — DescompassoDeVersao com servidor ${mostrar(e.servidor)} (esperado ${mostrar(enviado)}), cliente ${e.cliente} (esperado ${VERSAO_DO_FIO})`,
        )
      } else {
        descompassoOk++
      }
    }
  }
  const formaRuim: [rotulo: string, msg: Record<string, unknown>][] = [
    ['snapshotHz ausente', salaSem('snapshotHz')],
    ['snapshotHz 0', salaCom('snapshotHz', 0)],
    ['snapshotHz 7', salaCom('snapshotHz', 7)],
    ['snapshotHz "30"', salaCom('snapshotHz', '30')],
    ['assento ausente', salaSem('assento')],
    ["assento ''", salaCom('assento', '')],
    // debt.12 (AC 9 a/b, E49-TST-001/002): um termo do predicado de `conferirSala` por caso — -30 só
    // `hz > 0` recusa; 7.5 só `Number.isInteger` (60 % 7.5 === 0); 120 só o divisor; 123 só o typeof.
    ['snapshotHz -30', salaCom('snapshotHz', -30)],
    ['snapshotHz 7.5', salaCom('snapshotHz', 7.5)],
    ['snapshotHz 120', salaCom('snapshotHz', 120)],
    ['assento 123', salaCom('assento', 123)],
  ]
  let formaRuimOk = 0
  for (const [rotulo, msg] of formaRuim) {
    try {
      decodificarDoServidor(JSON.stringify(msg))
      problemas.push(`  ✗ codec: {t:'sala'} com ${rotulo} não lançou`)
    } catch (e) {
      if (e instanceof DescompassoDeVersao) {
        problemas.push(`  ✗ codec: {t:'sala'} com ${rotulo} lançou DescompassoDeVersao — com a versão certa, o problema não é de build`)
      } else {
        formaRuimOk++
      }
    }
  }

  // (e) orçamento: alarme de regressão do codec, não detector de vazamento (esse é o de chaves, acima)
  const media = a.quadro.length ? a.quadro.reduce((t, x) => t + x, 0) / a.quadro.length : NaN
  const mediaEventos = a.eventosQuadro.length ? a.eventosQuadro.reduce((t, x) => t + x, 0) / a.eventosQuadro.length : NaN
  if (!(media <= ORCAMENTO_SNAP_B)) {
    problemas.push(`  ✗ codec: orçamento — média ${media.toFixed(1)} B/quadro do {t:'snap'} codificado passa de ${ORCAMENTO_SNAP_B} B (§5.5)`)
  }

  const f1 = (x: number) => x.toFixed(1)
  const ok = (cond: boolean) => (cond ? '✓' : '✗')
  const linhas = [
    `  fidelidade   ${ok(a.total === 0 && a.quadros > 0)} ${a.quadros} quadros na cadência com flush (${rodadasDoFio().length} rodadas): projetar(decodificar(codificar(snap))) bate o World — x/y/facing/angle = snapshot, demais ±${PASSO_FIO / 2}, ultCharge em [u − ${PASSO_FIO}, u], abilityReadyAt ±${1.5 * PASSO_FIO} · prontidão idêntica em ${a.amostrasProntidao} amostras bola×quadro`,
    `  fronteira    ${ok(viradasCodec === 0 && viradasIngenuoHabilidade > 0 && viradasIngenuoUlt > 0 && viradasSinteticas === 0 && abaixoDoInteiro.length > 0)} regra da §5.5 vira ${viradasCodec}/${casos} casos sintéticos · o codec ingênuo (arredondar a 0,01) vira ${viradasIngenuoHabilidade + viradasIngenuoUlt} (habilidade ${viradasIngenuoHabilidade}, ult ${viradasIngenuoUlt}) — tem de falhar · limiares não inteiros [${LIMIARES_SINTETICOS.join(', ')}]: ${ok(viradasSinteticas === 0 && abaixoDoInteiro.length > 0)} vira ${viradasSinteticas}/${casosSinteticos}, com thr × 100 abaixo do inteiro em [${abaixoDoInteiro.join(', ')}]`,
    `  limiar ult   ${ok(foraDoPasso.length === 0)} todo ult.threshold do roster é múltiplo de 0,01 [${limiares.map((l) => `${l.id} ${l.thr}`).join(', ')}]`,
    `  não-snap     ${ok(naoSnapFalhas === 0 && lancou === aridadeCasos)} ${naoSnap.length} mensagens (${Object.keys(amostras).length} variantes) voltam idênticas · aridade divergente e t desconhecido lançam em ${lancou}/${aridadeCasos}`,
    `  versão fio   ${ok(descompassoOk === descompassos.length && formaRuimOk === formaRuim.length)} {t:'sala'} v${VERSAO_DO_FIO}: DescompassoDeVersao com servidor/cliente nos campos em ${descompassoOk}/${descompassos.length} (versao ausente, ${VERSAO_DO_FIO + 1}, "1", forma de hoje — versão conferida primeiro) · snapshotHz/assento fora de forma lançam erro que não é de versão em ${formaRuimOk}/${formaRuim.length}`,
    `  orçamento    ${ok(media <= ORCAMENTO_SNAP_B)} ${SNAPSHOT_HZ} Hz, tupla: média ${f1(media)} B/quadro (≤ ${ORCAMENTO_SNAP_B}) · pico ${Math.max(...a.quadro)} B · dos quais events: média ${f1(mediaEventos)} B, pico ${Math.max(...a.eventosQuadro)} B (${SEEDS_FIO.length} rodadas de referência)`,
  ]
  return { linhas, problemas, variantesNaoSnap: Object.keys(amostras) }
}

/**
 * §5.5 — média do `{t:'snap'}` codificado, por quadro, na cadência com flush. A 30 Hz, 450 B dão ~108
 * kbit/s de carga útil, ~125 kbit/s com transporte: o "cabe em qualquer 3G" da §1.2. Alarme de
 * regressão do CODEC, não detector de classe 3; o pico não tem teto (é `events` na morte súbita).
 */
const ORCAMENTO_SNAP_B = 450

/**
 * `debt.12` (AC 5), Decisão 1 da `architecture-e4.md` §11.6.1 — a amostra da fixture congelada do fio.
 * NÃO é o `snapshotSintetico`: aquele tem três colisões de valor entre posições escalares da mesma tupla
 * (`over`/`arena.pad`, `id`/`alive`, `y`/restante), e trocar qualquer par nos dois lados deixa o texto
 * idêntico (medição M-1). Aqui (a) nenhuma posição escalar repete valor na mesma tupla, então qualquer
 * permutação muda os bytes; (b) todo campo quantizado está fora da grade de 0,01, e `ultCharge` 55.559 e o
 * restante 183.341 separam as regras (piso ≠ arredondado, teto ≠ arredondado). Valores exatos da §11.6.1.
 */
function AMOSTRA_DO_FIO(): Snapshot {
  // 'shield' é o valor exato da §11.6.1 e NÃO está em `EffectKind` ('slow' | 'dot' | 'amp' | 'vuln'). A
  // posição é [lit] (o codec repassa o `kind` sem ler), então o texto congelado não depende do vocabulário;
  // trocá-lo por um kind válido mudaria os 287 B decididos. Daí a asserção, só aqui.
  const shield = 'shield' as Snapshot['balls'][number]['effects'][number]['kind']
  return {
    time: 1234.567,
    over: false,
    winner: 1,
    arena: { w: 960, h: 540, pad: 17.254 },
    balls: [
      {
        id: 7,
        x: 100.25,
        y: 200.5,
        facing: 0.75,
        hp: 432.126,
        alive: true,
        ultCharge: 55.559,
        abilityReadyAt: 1234.567 + 183.341,
        effects: [{ kind: 'slow' }, { kind: shield }],
      },
    ],
    projectiles: [{ id: 8, x: 10.5, y: 20.75, vx: 300.123, vy: -40.456, radius: 5.555, color: '#b98cff' }],
    zones: [{ id: 9, kind: 'wall', x: 30.25, y: 40.5, angle: 1.234, halfLen: 60.126, radius: 9.994, pull: 2.345, ownerColor: '#8a8' }],
    events: [{ t: 'hit', x: 1.5, y: 2.5, amount: 3.14159, targetId: 7, crit: true }],
  }
}

/**
 * ⚠️ FIXTURE CONGELADA DO FIO — `codificarDoServidor({ t: 'snap', s: AMOSTRA_DO_FIO(), seq: 4 })` e a lista
 * de `t` de `DoServidor` (`sort()` padrão, unida por vírgula), uma entrada por `VERSAO_DO_FIO` (§11.6.1,
 * Decisão 1, com a emenda da §11.6.2: sem `variantes`, uma variante nova sem subir a versão passava). **SÓ DE ACRÉSCIMO**: ao contrário do `BASELINE`, que é
 * substituído inteiro numa re-baseline autorizada, a entrada de uma versão publicada é fato histórico e
 * NUNCA se edita. Mudança deliberada de formato, num único commit: (1) muda o layout, a forma de uma
 * variante ou o significado de um campo; (2) incrementa `VERSAO_DO_FIO` em `net/protocolo.ts`; (3)
 * ACRESCENTA `{ versao: N + 1, snap: <texto novo> }` ao fim desta lista; (4) a mensagem de commit diz
 * "mudança de protocolo" e cita as posições que mudaram. Qualquer linha removida ou alterada aqui
 * dentro, num diff, é carimbo.
 */
const FIO_CONGELADO: readonly { versao: number; snap: string; variantes: string }[] = [
  {
    versao: 1,
    snap: '{"t":"snap","seq":4,"s":[1234.57,0,1,960,540,17.25,[[7,100.25,200.5,0.75,432.13,1,55.55,183.35,["slow","shield"]]],[[8,10.5,20.75,300.12,-40.46,5.56,"#b98cff"]],[[9,"wall",30.25,40.5,1.234,60.13,9.99,2.35,"#8a8"]],[{"t":"hit","x":1.5,"y":2.5,"amount":3.14159,"targetId":7,"crit":true}]]}',
    variantes: 'erro,ping,prazo,rodadaFim,rodadaInicio,sala,snap,visao',
  },
]

/** Caminho e valores da primeira posição em que dois JSON divergem (`s[6][0][4]`), para a mensagem. */
function primeiraDivergencia(a: unknown, b: unknown, caminho: string): string | null {
  const composto = (v: unknown) => typeof v === 'object' && v !== null
  if (!composto(a) || !composto(b) || Array.isArray(a) !== Array.isArray(b)) {
    return Object.is(a, b) ? null : `${caminho || '(raiz)'}: congelado ${JSON.stringify(a)}, atual ${JSON.stringify(b)}`
  }
  const oa = a as Record<string, unknown>
  const ob = b as Record<string, unknown>
  const chaves = Array.isArray(a)
    ? Array.from({ length: Math.max((a as unknown[]).length, (b as unknown[]).length) }, (_, i) => String(i))
    : [...new Set([...Object.keys(oa), ...Object.keys(ob)])]
  for (const k of chaves) {
    const sub = Array.isArray(a) ? `${caminho}[${k}]` : caminho ? `${caminho}.${k}` : k
    const d = primeiraDivergencia(oa[k], ob[k], sub)
    if (d !== null) return d
  }
  return null
}

/**
 * `debt.12` (AC 5) — os quatro itens da §11.6.1: (1) o codificador de hoje produz o texto congelado da
 * última versão; (2) a última versão é `VERSAO_DO_FIO`, e as versões são 1..N consecutivas; (3) ponto fixo
 * `codificar(decodificar(t)) === t`, que prende o decodificador ao mesmo texto; (4) canário — a amostra
 * continua discriminante (sem valor repetido entre posições escalares de uma tupla, e as regras de
 * quantização separadas pelo valor). Sem (4), "simplificar" a amostra tiraria o dente em silêncio. E (5),
 * emenda da §11.6.2: a lista de `t` de `DoServidor` — as chaves de `amostras` da guarda `não-snap`, cujo
 * `satisfies` obriga uma por variante que não é `snap`, mais `snap` — é a `variantes` da última versão.
 */
function guardaFioCongelado(variantesNaoSnap: readonly string[]): { linha: string; problemas: string[] } {
  const problemas: string[] = []
  const ultima = FIO_CONGELADO[FIO_CONGELADO.length - 1]
  const PROPOSITO =
    'se foi de propósito, incremente `VERSAO_DO_FIO` em `net/protocolo.ts` e ACRESCENTE uma entrada; nunca edite uma existente (§11.6.1)'

  // (1) o codificador
  const atual = codificarDoServidor({ t: 'snap', s: AMOSTRA_DO_FIO(), seq: 4 })
  const igual = atual === ultima.snap
  if (!igual) {
    const onde = primeiraDivergencia(JSON.parse(ultima.snap), JSON.parse(atual), '') ?? 'mesmo JSON, texto diferente'
    problemas.push(`  ✗ fio congelado: o {t:'snap'} de AMOSTRA_DO_FIO mudou em relação à v${ultima.versao} — ${onde} — ${PROPOSITO}`)
  }

  // (2) a versão
  const consecutivas = FIO_CONGELADO.every((e, i) => e.versao === i + 1)
  const versaoOk = ultima.versao === VERSAO_DO_FIO && FIO_CONGELADO.length === VERSAO_DO_FIO && consecutivas
  if (!versaoOk) {
    problemas.push(
      `  ✗ fio congelado: FIO_CONGELADO [${FIO_CONGELADO.map((e) => e.versao).join(', ')}] não termina em VERSAO_DO_FIO ${VERSAO_DO_FIO} com versões 1..N consecutivas — ${PROPOSITO}`,
    )
  }

  // (3) ponto fixo do decodificador
  let pontoFixo = false
  try {
    const volta = codificarDoServidor(decodificarDoServidor(ultima.snap))
    pontoFixo = volta === ultima.snap
    if (!pontoFixo) {
      const onde = primeiraDivergencia(JSON.parse(ultima.snap), JSON.parse(volta), '') ?? 'mesmo JSON, texto diferente'
      problemas.push(`  ✗ fio congelado: codificar(decodificar(congelado)) não é ponto fixo — ${onde}`)
    }
  } catch (e) {
    problemas.push(`  ✗ fio congelado: decodificar o texto congelado lançou — ${(e as Error).message}`)
  }

  // (4) canário da propriedade discriminante. As três regras aqui são REFERÊNCIA local (as do codec são
  // privadas); para estes valores, longe de meio-passo e de erro de ponto flutuante, bastam as ingênuas.
  const colisoes: string[] = []
  const conferirTupla = (t: unknown[], caminho: string) => {
    const vistos = new Map<string, number>()
    t.forEach((v, i) => {
      if (typeof v === 'object' && v !== null) return
      const chave = JSON.stringify(v)
      const antes = vistos.get(chave)
      if (antes !== undefined) colisoes.push(`${caminho}[${antes}] = ${caminho}[${i}] = ${chave}`)
      else vistos.set(chave, i)
    })
  }
  const s = (JSON.parse(ultima.snap) as { s: unknown[] }).s
  conferirTupla(s, 's')
  for (const n of [6, 7, 8]) (s[n] as unknown[][]).forEach((t, j) => conferirTupla(t, `s[${n}][${j}]`))
  const amostra = AMOSTRA_DO_FIO()
  const bola = amostra.balls[0]
  const restante = bola.abilityReadyAt - amostra.time
  const arred = (v: number) => Math.round(v * 100) / 100
  const piso = Math.floor(bola.ultCharge * 100) / 100
  const teto = Math.ceil(restante * 100) / 100
  const regrasSeparadas = piso !== arred(bola.ultCharge) && teto !== arred(restante)
  const entidades = [s[6], s[7], s[8]].every((l) => Array.isArray(l) && l.length > 0)
  if (colisoes.length > 0 || !regrasSeparadas || !entidades) {
    problemas.push(
      `  ✗ fio congelado: canário — a amostra perdeu poder discriminante: colisões [${colisoes.join('; ')}] · piso(ultCharge) ${piso} vs arredondado ${arred(bola.ultCharge)} · teto(restante) ${teto} vs arredondado ${arred(restante)} · bola/projétil/zona presentes ${entidades}`,
    )
  }

  // (5) a lista de variantes (§11.6.2)
  const variantes = [...variantesNaoSnap, 'snap'].sort().join(',')
  const variantesOk = variantes === ultima.variantes
  if (!variantesOk) {
    problemas.push(`  ✗ fio congelado: as variantes de DoServidor [${variantes}] não são as da v${ultima.versao} [${ultima.variantes}] — ${PROPOSITO}`)
  }

  const ok = (cond: boolean) => (cond ? '✓' : '✗')
  const linha = `  fio congelado ${ok(problemas.length === 0)} FIO_CONGELADO v${ultima.versao} (${ultima.snap.length} B, ${FIO_CONGELADO.length} entrada(s), só de acréscimo): codificar(AMOSTRA_DO_FIO) = congelado ${ok(igual)} · versão = VERSAO_DO_FIO ${VERSAO_DO_FIO} ${ok(versaoOk)} · ponto fixo codificar(decodificar) ${ok(pontoFixo)} · canário: ${colisoes.length} colisões entre posições escalares, piso ≠ arredondado (ultCharge) e teto ≠ arredondado (restante) ${ok(regrasSeparadas)} · variantes de DoServidor = congeladas (${variantes.split(',').length}) ${ok(variantesOk)} (architecture-e4.md §11.6.1, §11.6.2)`
  return { linha, problemas }
}

const { linha: linhaParser, problemas: problemasParser } = guardaParser()
const { linhas: linhasCodecSaida, problemas: problemasCodecSaida, variantesNaoSnap } = guardaCodec(achadosCodec)
const { linha: linhaFioCongelado, problemas: problemasFioCongelado } = guardaFioCongelado(variantesNaoSnap)
const problemasCodec = [...problemasParser, ...problemasCodecSaida, ...problemasFioCongelado]
const linhasCodec = [
  `codec do fio   ${problemasCodec.length === 0 ? '✓ ok' : '✗ falhou'} — net/codec.ts: DoCliente fechado em runtime; {t:'snap'} em tupla posicional quantizada (architecture-e4.md §5.5)`,
  linhaParser,
  ...linhasCodecSaida,
  linhaFioCongelado,
]

// ------------------------------------------- sala pura (e4.3, AC 11 e 16) — a Bo5 inteira por passo()

/**
 * `e4.3`, AC 11 — **a guarda que justifica a sala existir.** Uma Bo5 COMPLETA, conduzida só por `passo()`
 * de `net/sala.ts`, com `agora` sintético e mensagens sintéticas nos dois assentos, tem de dar o mesmo
 * placar, a mesma sequência de vencedores e os mesmos hashes de rodada que o caminho headless de
 * `tools/partida.ts` (`jogarPartida`). Se divergir, a sala acrescentou regra de jogo.
 *
 * As mensagens saem da gravação do arnês: as decisões de `PartidaGravada.decisoes`, cada uma pelo assento
 * do seu `d.jogador`, e os `Command[]` de cada rodada, convertidos de volta em `{t:'cast', ballIndex}` pelo
 * lado que o jogador ocupa naquela rodada. **Cada cast é submetido `ATRASO_ALVO_TICKS` ticks ANTES do tick
 * gravado** (correção do @po, v1.1.0): a sala o carimba em `tickAtual + ATRASO_ALVO_TICKS`, e ele cai
 * exatamente onde o arnês o executou. É isso que faz desta guarda o teste do AC 6 — carimbo errado por um
 * tick e o hash denuncia, e a guarda confere também o `Command` carimbado, campo a campo. Comando gravado
 * com `tick < ATRASO_ALVO_TICKS` não tem como ser submetido cedo o bastante: a seed que tiver algum é
 * PULADA, nunca clampada.
 *
 * AC 16, caminho feliz: TODA mensagem sintética passa por `parseDoCliente(JSON.parse(JSON.stringify(msg)))`
 * antes de virar `EntradaDaSala`. Um parser estrito demais quebra esta guarda, e isso é achado contra `e4.8`.
 *
 * O `buildPadrao` do jogador 1 que o roteiro traz NÃO é enviado: quem o produz aqui é o relógio de RF-04 da
 * sala (AC 9), no estouro do prazo. O resultado é o mesmo em qualquer ordem (RF-04), e o log de decisões da
 * sala é conferido contra o que a guarda enviou mais o que o prazo produziu.
 */
const POOL_SALA = ['golem', 'vex'] // o `POOL` de tools/partida.ts (não exportado): R-01(B), composição fixa
/** candidatas, na ordem das `MATCH_SEEDS` de `tools/partida.ts` — a primeira sem comando em `tick < 6` */
const SEEDS_SALA = [1, 2, 12345]
const CHAVES_SALA: readonly [string, string] = ['segredo-do-assento-0', 'segredo-do-assento-1']
const T0_SALA = 1_000_000

interface ConferenciaDeEnvios {
  salas: number
  assentamentos: number
  visoes: number
  pelaFronteira: number
  /** debt.14, AC 4 — passos em que a `partida` mudou de identidade com a sala `jogando` */
  transicoes: number
  /** debt.14, AC 4 — rodadas fechadas com `rodadaFim`/`rodadaInicio` conferidos por assento */
  rodadasFechadas: number
}

/** Toda chamada a `passo()` da guarda passa por aqui, e o AC 11 (e) e o AC 8 são conferidos em TODO passo. */
interface Condutor {
  sala: Sala
  hz: number
  rotulo: string
  problemas: string[]
  conf: ConferenciaDeEnvios
  /** debt.14, AC 4 — a rodada em curso já vista, e quantos `rodadaInicio` cada assento recebeu nela */
  rodadaVista: RodadaEmCurso | null
  inicios: Map<string, number>
}

function novoCondutor(sala: Sala, rotulo: string, problemas: string[]): Condutor {
  return {
    sala, hz: sala.config.snapshotHz, rotulo, problemas,
    conf: { salas: 0, assentamentos: 0, visoes: 0, pelaFronteira: 0, transicoes: 0, rodadasFechadas: 0 },
    rodadaVista: null, inicios: new Map(),
  }
}

/**
 * `debt.14`, AC 4 (`E43-TST-002`) — a COBERTURA da entrega, não só a projeção de quem recebeu. Conta os envios
 * do passo POR TIPO e por assento (nunca a lista completa: `e4.10` acrescenta `{t:'evento'}` depois das visões):
 *  - passo em que `partida` muda de identidade e a sala termina `jogando` → pelo menos um `{t:'visao'}` a cada
 *    assento conectado (a queda no draft devolve a sala a `aguardando`, §6, e fica fora pela condição);
 *  - passo que fecha rodada → exatamente um `rodadaFim` por rodada fechada a cada assento conectado, nenhum ao
 *    vago (R-02), e pelo menos um `rodadaInicio` na rodada a cada assento conectado (o reassentado recebe dois).
 */
function conferirCobertura(c: Condutor, antes: Sala, porTipo: Map<string, Map<string, number>>, falha: (m: string) => void): void {
  const s = c.sala
  const conta = (k: string, t: string) => porTipo.get(k)?.get(t) ?? 0
  if (s.partida !== antes.partida && s.fase === 'jogando') {
    c.conf.transicoes++
    for (const j of JOGADORES_SALA) {
      const k = s.assentos[j]
      if (k !== null && s.conectados[j] && conta(k, 'visao') === 0) {
        falha(`a partida mudou (fase ${s.partida.fase}) e o assento conectado do jogador ${j} não recebeu {t:'visao'} no passo (debt.14 AC 4)`)
      }
    }
  }
  if (s.rodada !== null && s.rodada !== c.rodadaVista) {
    c.rodadaVista = s.rodada
    c.inicios = new Map()
  }
  for (const [k, m] of porTipo) {
    const n = m.get('rodadaInicio') ?? 0
    if (n > 0) c.inicios.set(k, (c.inicios.get(k) ?? 0) + n)
  }
  const fechadas = Math.max(0, s.partida.historico.length - antes.partida.historico.length)
  for (const j of JOGADORES_SALA) {
    const k = s.assentos[j]
    if (k === null) continue
    const esperado = s.conectados[j] ? fechadas : 0
    if (conta(k, 'rodadaFim') !== esperado) {
      falha(`${conta(k, 'rodadaFim')} rodadaFim ao assento do jogador ${j} (${s.conectados[j] ? 'conectado' : 'vago'}) num passo que fechou ${fechadas} rodada(s), esperado ${esperado} (debt.14 AC 4)`)
    }
    if (fechadas > 0 && s.conectados[j] && (c.inicios.get(k) ?? 0) < 1) {
      falha(`rodada fechada sem nenhum rodadaInicio ao assento conectado do jogador ${j} (debt.14 AC 4)`)
    }
  }
  c.conf.rodadasFechadas += fechadas
}

function conduzir(c: Condutor, agora: number, entrada: EntradaDaSala[]): Envio[] {
  const antes = c.sala
  const r = passo(c.sala, agora, entrada)
  c.sala = r.sala
  const s = r.sala
  const falha = (m: string) => anotar(c.problemas, `  ✗ sala ${c.rotulo}: ${m}`)
  // AC 11 (e) — o PRIMEIRO envio a todo assento recém-assentado (primeira entrada ou reassentamento) é o {t:'sala'}
  const aguardando = new Set(
    entrada
      .filter((e) => 'conexao' in e && e.conexao === 'assentou' && s.assentos.includes(e.assento))
      .map((e) => e.assento),
  )
  c.conf.assentamentos += aguardando.size
  const salasVistas = new Set<DoServidor>()
  const ultimaVisao = new Map<string, VisaoPartida>()
  const porTipo = new Map<string, Map<string, number>>()
  for (const { assento, msg } of r.envios) {
    const m = porTipo.get(assento) ?? new Map<string, number>()
    m.set(msg.t, (m.get(msg.t) ?? 0) + 1)
    porTipo.set(assento, m)
    if (aguardando.has(assento)) {
      if (msg.t !== 'sala') falha(`primeiro envio ao assento recém-assentado '${assento}' foi {t:'${msg.t}'}, não {t:'sala'} (AC 11 e)`)
      aguardando.delete(assento)
    }
    if (msg.t === 'sala') {
      c.conf.salas++
      const j = s.assentos.indexOf(assento)
      if (salasVistas.has(msg)) falha("o MESMO objeto {t:'sala'} foi endereçado a mais de um assento — broadcast (AC 11 e)")
      salasVistas.add(msg)
      if (msg.assento !== assento) falha(`{t:'sala'} endereçado a '${assento}' carrega o segredo '${msg.assento}' (AC 11 e)`)
      // @architect, §11.6.1 (adendo 6c6b9a0): o jogador trocado entre os assentos é o bug do servidor que o decoder não vê
      if (msg.jogador !== j) falha(`{t:'sala'} endereçado ao assento do jogador ${j} diz jogador ${msg.jogador} (AC 11 e, §11.6.1)`)
      if (msg.versao !== VERSAO_DO_FIO) falha(`{t:'sala'} com versao ${String(msg.versao)}, esperado ${VERSAO_DO_FIO} (AC 11 e)`)
      if (msg.snapshotHz !== c.hz) falha(`{t:'sala'} com snapshotHz ${msg.snapshotHz}, a configuração da sala diz ${c.hz} (AC 10/11 e)`)
    }
    if (msg.t === 'visao') {
      c.conf.visoes++
      ultimaVisao.set(assento, msg.v)
    }
  }
  for (const k of aguardando) falha(`assento recém-assentado '${k}' não recebeu envio nenhum`)
  // AC 8 — a última visão de cada assento no passo é `visaoPara(estado final, jogador DAQUELE assento)`
  for (const [assento, v] of ultimaVisao) {
    const j = s.assentos.indexOf(assento)
    if (j < 0 || !profundamenteIgual(v, visaoPara(s.partida, j as Jogador))) {
      falha(`{t:'visao'} endereçado a '${assento}' não é visaoPara(estado, jogador ${j}) — broadcast ou projeção alheia (AC 8)`)
    }
  }
  conferirCobertura(c, antes, porTipo, falha)
  return r.envios
}

/** AC 16, caminho feliz — `parseDoCliente(JSON.parse(JSON.stringify(msg)))`, sempre. */
function pelaFronteira(c: Condutor, chave: string, raw: unknown): EntradaDaSala[] {
  c.conf.pelaFronteira++
  const msg = parseDoCliente(JSON.parse(JSON.stringify(raw)))
  if (msg === null) {
    anotar(c.problemas, `  ✗ sala ${c.rotulo}: parseDoCliente recusou ${JSON.stringify(raw)} — achado contra e4.8 (AC 15/16), não ajuste aqui`)
    return []
  }
  return [{ assento: chave, msg }]
}

function errosPara(envios: Envio[]): Envio[] {
  return envios.filter((e) => e.msg.t === 'erro')
}

function tickDoSnap(s: Snapshot): number {
  return Math.round(s.time / TICK_MS)
}

/** `agora` que deixa a rodada exatamente no tick `alvo` (`floor((agora − início) · 60 / 1000) = alvo`). */
function agoraDoTick(r: RodadaEmCurso, alvo: number): number {
  return r.inicioMs + Math.ceil((alvo * 1000) / TICK_HZ)
}

/** A sequência de `world.events` que a rodada gravada produz — o laço do arnês, observado tick a tick. */
function eventosDeReferencia(s: RoundSetup, comandos: readonly Command[]): SimEvent[] {
  const w = createWorld(CHARS, s)
  const eventos: SimEvent[] = []
  while (!w.over && w.tick < MAX_ROUND_TICKS) {
    step(w, [...comandos])
    eventos.push(...w.events)
  }
  return eventos
}

interface ResumoBo5 {
  seed: number
  puladas: string[]
  rodadas: number
  placar: string
  vencedores: string
  hashesIguais: number
  casts: number
  castsMortos: number
  snaps: number
  eventos: number
  foraDaCadencia: number
  rejeitadas: number
  prazo: boolean
  reassentou: boolean
  mortaRecusada: boolean
  alheiaRecusada: boolean
  conf: ConferenciaDeEnvios
}

function bo5PelaSala(g: PartidaGravada, problemas: string[]): ResumoBo5 {
  const falha = (m: string) => anotar(problemas, `  ✗ sala bo5: ${m}`)
  const c = novoCondutor(criarSala({ id: 'guarda-e4.3', seed: g.matchSeed, pool: POOL_SALA, chars: CHARS, hashDoMundo: hash }), 'bo5', problemas)
  const intervalo = TICK_HZ / c.hz
  const [K0, K1] = CHAVES_SALA
  const resumo: ResumoBo5 = {
    seed: g.matchSeed, puladas: [], rodadas: 0, placar: '', vencedores: '', hashesIguais: 0, casts: 0, castsMortos: 0,
    snaps: 0, eventos: 0, foraDaCadencia: 0, rejeitadas: 0, prazo: false, reassentou: false, mortaRecusada: false,
    alheiaRecusada: false, conf: c.conf,
  }
  let agora = T0_SALA
  conduzir(c, agora, [{ assento: K0, conexao: 'assentou' }])
  agora += 50
  conduzir(c, agora, [{ assento: K1, conexao: 'assentou' }])
  if (c.sala.fase !== 'jogando') falha(`dois assentos ocupados e a sala está '${c.sala.fase}', não 'jogando'`)

  const esperado: Decisao[] = [] // o log de decisões que a sala TEM de ter: o que foi enviado + o que o prazo produziu
  let iDec = 0
  let iRod = 0
  for (let volta = 0; c.sala.partida.fase !== 'fim'; volta++) {
    if (volta > 400) {
      falha(`a partida não terminou (fase ${c.sala.partida.fase}, sala ${c.sala.fase})`)
      break
    }
    const p = c.sala.partida
    if (p.fase === 'rodada') {
      const r = c.sala.rodada
      const gr = g.rodadas[iRod]
      if (r === null || gr === undefined) {
        falha(`fase rodada sem rodada em curso na sala (${r === null}) ou sem gravação (rodada ${iRod})`)
        break
      }
      agora = conduzirRodada(c, r, gr.comandos, gr.setup, iRod, agora, intervalo, resumo, falha)
      iRod++
      continue
    }
    const d = g.decisoes[iDec]
    if (p.fase === 'builds' && (d === undefined || (d.t !== 'build' && d.t !== 'pronto'))) {
      if (d?.t === 'buildPadrao') {
        iDec++ // quem produz esta decisão é o relógio de RF-04 da sala (AC 9)
        continue
      }
      // AC 9 / AC 11 (c) — o estouro do prazo: 1 ms antes nada acontece; no prazo, buildPadrao de quem não está pronto
      const prazo = c.sala.prazoDeBuilds
      if (prazo === null || prazo <= agora) {
        falha(`fase builds sem prazo futuro de RF-04 (prazoDeBuilds ${prazo}, agora ${agora})`)
        break
      }
      const antesP = c.sala.partida
      conduzir(c, prazo - 1, [])
      if (c.sala.partida !== antesP) falha('o prazo de RF-04 estourou 1 ms ANTES do fim (AC 9)')
      const nLog = c.sala.decisoes.length
      const naoProntos = JOGADORES_SALA.filter((j) => !c.sala.partida.prontos[j])
      conduzir(c, prazo, [])
      agora = prazo
      const produzidas = c.sala.decisoes.slice(nLog)
      const esperadas: Decisao[] = naoProntos.map((j) => ({ t: 'buildPadrao', jogador: j }))
      if (!profundamenteIgual(produzidas, esperadas)) {
        falha(`no estouro do prazo a sala produziu ${JSON.stringify(produzidas)}, esperado ${JSON.stringify(esperadas)} (AC 9)`)
      } else if (!c.sala.eventos.some((e) => e.t === 'buildPadrao')) {
        falha('buildPadrao aplicado sem EventoPartida buildPadrao no log da sala (AC 11 c)')
      } else {
        resumo.prazo = produzidas.length > 0
      }
      esperado.push(...produzidas)
      continue
    }
    if (d === undefined) {
      falha(`as decisões gravadas acabaram antes do fim da partida (fase ${p.fase})`)
      break
    }
    // AC 16, "→ sala": na vez do jogador 1, o assento 0 manda uma decisão PERFEITA em nome dele. `aplicar()`
    // a aceitaria (é a vez de d.jogador); quem recusa é a checagem de assento da sala.
    if (!resumo.alheiaRecusada && p.fase === 'draft' && p.draft.ordem[p.draft.passo] === 1 && d.t === 'draft' && d.jogador === 1) {
      const nLog = c.sala.decisoes.length
      const env = conduzir(c, agora, pelaFronteira(c, K0, { t: 'decisao', d }))
      const erros = errosPara(env)
      if (c.sala.partida !== p || c.sala.decisoes.length !== nLog) falha('decisão com d.jogador alheio chegou a aplicar() / mudou o estado (AC 16)')
      else if (env.length !== 1 || erros.length !== 1 || erros[0].assento !== K0) {
        falha(`decisão com d.jogador alheio: esperado 1 {t:'erro'} só ao remetente, veio ${JSON.stringify(env.map((e) => [e.assento, e.msg.t]))} (AC 16)`)
      } else resumo.alheiaRecusada = true
    }
    agora += 100
    const faseAntes = p.fase
    const env = conduzir(c, agora, pelaFronteira(c, CHAVES_SALA[d.jogador], { t: 'decisao', d }))
    esperado.push(d)
    iDec++
    const erros = errosPara(env)
    if (c.sala.partida === p) {
      // AC 7 / AC 11 (b) — recusada por aplicar(): erro só ao remetente, estado intacto por referência
      resumo.rejeitadas++
      if (env.length !== 1 || erros.length !== 1 || erros[0].assento !== CHAVES_SALA[d.jogador]) {
        falha(`decisão ilegal ${d.t}/j${d.jogador}: esperado 1 {t:'erro'} só ao remetente, veio ${JSON.stringify(env.map((e) => [e.assento, e.msg.t]))}`)
      }
    } else if (erros.length > 0) {
      falha(`decisão aceita ${d.t}/j${d.jogador} veio com {t:'erro'}`)
    }
    if (faseAntes === 'draft' && c.sala.partida.fase === 'builds') {
      // AC 9 — o prazo vai aos dois assentos, com o restante inteiro
      const prazos = env.filter((e) => e.msg.t === 'prazo')
      const ok = prazos.length === 2 && prazos.every((e) => e.msg.t === 'prazo' && e.msg.terminaEmMs === c.sala.config.prazoDeBuildsMs)
      if (!ok) falha(`entrada na fase builds sem {t:'prazo', terminaEmMs: ${c.sala.config.prazoDeBuildsMs}} para os dois assentos (AC 9)`)
    }
  }

  // AC 11 — placar, vencedores e hashes contra o arnês
  const h = c.sala.partida.historico
  const placarSala = placarDe(c.sala.partida)
  if (placarSala.join('-') !== g.placar.join('-')) falha(`placar ${placarSala.join('-')} != ${g.placar.join('-')} do arnês`)
  if (h.length !== g.rodadas.length) falha(`${h.length} rodada(s) na sala != ${g.rodadas.length} no arnês`)
  for (let i = 0; i < Math.min(h.length, g.rodadas.length); i++) {
    const a = g.rodadas[i].resultado
    const b = h[i]
    const campos: [string, string | number, string | number][] = [
      ['hash', a.hash, b.hash],
      ['ticks', a.ticks, b.ticks],
      ['vencedor', a.vencedor, b.vencedor],
      ['seedDaRodada', a.seedDaRodada, b.seedDaRodada],
      ['ladoDoJogador', a.ladoDoJogador.join(','), b.ladoDoJogador.join(',')],
    ]
    let iguais = true
    for (const [campo, esp, obt] of campos) {
      if (esp !== obt) {
        iguais = false
        falha(`rodada ${i}: ${campo} ${obt} na sala != ${esp} no arnês`)
      }
    }
    if (iguais) resumo.hashesIguais++
  }
  if (c.sala.fase !== 'encerrada') falha(`partida no fim e a sala está '${c.sala.fase}', não 'encerrada'`)
  if (!profundamenteIgual(c.sala.decisoes, esperado)) {
    falha(`o log de decisões da sala (${c.sala.decisoes.length}) != enviadas + produzidas pelo prazo (${esperado.length}) — a sala inventou ou perdeu decisão`)
  }
  if (resumo.rejeitadas !== g.rejeicoes.length) falha(`${resumo.rejeitadas} decisão(ões) recusada(s) pela sala != ${g.rejeicoes.length} rejeitada(s) no arnês`)
  // AC 12 — `controle` real, nunca o default ['bot','bot']
  const fins = c.sala.eventos.filter((e) => e.t === 'rodadaFim')
  if (fins.length !== h.length) falha(`${fins.length} evento(s) rodadaFim para ${h.length} rodada(s)`)
  for (const e of fins) {
    if (e.t === 'rodadaFim' && e.controle.join(',') !== 'humano,humano') falha(`rodadaFim da rodada ${e.rodada} com controle [${e.controle.join(',')}] (AC 12)`)
  }
  if (!resumo.prazo) falha('a Bo5 não exercitou o estouro do prazo de RF-04 (AC 11 c)')
  if (!resumo.reassentou) falha('a Bo5 não exercitou o reassentamento no meio de uma rodada (AC 11 e)')
  if (!resumo.mortaRecusada) falha('a Bo5 não exercitou o cast de bola morta (AC 6)')
  if (!resumo.alheiaRecusada) falha('a Bo5 não exercitou a decisão com d.jogador alheio (AC 16)')
  resumo.rodadas = h.length
  resumo.placar = placarSala.join('-')
  resumo.vencedores = h.map((x) => x.vencedor).join(' ')
  return resumo
}

const JOGADORES_SALA: readonly Jogador[] = [0, 1]

/**
 * Uma rodada da Bo5 pela sala. Três tipos de passo, todos por `conduzir`: SUBMISSÃO (com `agora` parado, os
 * casts do tick `N + ATRASO` quando a sala está no tick `N`, e o `Command` carimbado conferido), AVANÇO (um
 * salto até a próxima submissão — vários ticks num `passo()`, cada um observado) e os passos de TESTE
 * (reassentamento na rodada 1, bola morta na primeira rodada que tiver uma). Devolve o `agora` final.
 */
function conduzirRodada(
  c: Condutor,
  r: RodadaEmCurso,
  comandos: readonly Command[],
  setupGravado: RoundSetup,
  iRod: number,
  agoraInicial: number,
  intervalo: number,
  resumo: ResumoBo5,
  falha: (m: string) => void,
): number {
  let agora = agoraInicial
  const snapsK0: Snapshot[] = []
  let snapsK1 = 0
  let seqEsperado = 0
  const w = r.world
  const [K0, K1] = CHAVES_SALA
  let i = 0

  const colher = (env: Envio[]) => {
    for (const e of env) {
      if (e.msg.t !== 'snap') continue
      if (e.assento === K1) {
        snapsK1++
        continue
      }
      if (e.msg.seq !== seqEsperado) falha(`rodada ${iRod}: snap com seq ${e.msg.seq}, esperado ${seqEsperado} (AC 10)`)
      seqEsperado++
      snapsK0.push(e.msg.s)
    }
  }

  for (let volta = 0; c.sala.rodada === r; volta++) {
    if (volta > 20_000) {
      falha(`rodada ${iRod} não terminou pela sala`)
      break
    }
    const N = w.tick

    // ---- teste: reassentamento no meio da rodada (AC 11 e), com a pausa de R-02 congelando o mundo
    if (iRod === 1 && !resumo.reassentou && N >= 600) {
      conduzir(c, agora, [{ assento: K1, conexao: 'caiu' }])
      if (c.sala.pausa === null) falha('queda de assento no meio da rodada não abriu a pausa (AC 13)')
      agora += 5_000
      colher(conduzir(c, agora, []))
      if (w.tick !== N) falha(`o mundo andou ${w.tick - N} tick(s) durante a pausa (AC 13)`)
      agora += 1_000
      const env = conduzir(c, agora, [{ assento: K1, conexao: 'assentou' }])
      colher(env)
      const paraK1 = env.filter((e) => e.assento === K1).map((e) => e.msg.t).join(',')
      if (paraK1 !== 'sala,visao,rodadaInicio') falha(`reassentamento na rodada: envios ao assento foram [${paraK1}], esperado [sala,visao,rodadaInicio] (§6)`)
      if (c.sala.pausa !== null || w.tick !== N) falha(`reassentamento não retomou a rodada no tick ${N} (pausa ${c.sala.pausa !== null}, tick ${w.tick})`)
      resumo.reassentou = true
    }

    // ---- teste: cast de bola morta, descartado com erro só ao dono (AC 6)
    const morta = w.balls.find((b) => !b.alive)
    if (!resumo.mortaRecusada && morta !== undefined && !w.over) {
      const j = jogadorDoLado(r.lados, morta.team)
      const ballIndex = w.balls.filter((b) => b.team === morta.team).indexOf(morta)
      const nPend = r.pendentes.length
      const env = conduzir(c, agora, pelaFronteira(c, CHAVES_SALA[j], { t: 'cast', ballIndex, slot: 'ability', dx: 1, dy: 0, mag: 1 }))
      const erros = errosPara(env)
      if (env.length !== 1 || erros.length !== 1 || erros[0].assento !== CHAVES_SALA[j] || r.pendentes.length !== nPend) {
        falha(`cast de bola morta: esperado 1 {t:'erro'} só ao dono e nenhum comando, veio ${JSON.stringify(env.map((e) => [e.assento, e.msg.t]))} (AC 6)`)
      } else resumo.mortaRecusada = true
    }

    // ---- submissão: os casts gravados para o tick N + ATRASO, na ordem gravada
    const lote: Command[] = []
    while (i < comandos.length && comandos[i].tick === N + ATRASO_ALVO_TICKS) lote.push(comandos[i++])
    if (lote.length > 0) {
      const entrada: EntradaDaSala[] = []
      const esperados: Command[] = []
      let mortos = 0
      for (const cmd of lote) {
        const bola = w.balls.find((b) => b.id === cmd.ballId)
        if (bola === undefined) {
          falha(`rodada ${iRod}: comando gravado para a bola ${cmd.ballId}, que não existe no mundo da sala`)
          continue
        }
        const j = jogadorDoLado(r.lados, bola.team)
        const ballIndex = w.balls.filter((b) => b.team === bola.team).indexOf(bola)
        entrada.push(...pelaFronteira(c, CHAVES_SALA[j], { t: 'cast', ballIndex, slot: cmd.slot, dx: cmd.dx, dy: cmd.dy, mag: cmd.mag }))
        if (bola.alive) esperados.push(cmd)
        else mortos++
      }
      const nPend = r.pendentes.length
      const env = conduzir(c, agora, entrada)
      colher(env)
      if (w.tick !== N) falha(`rodada ${iRod}: o passo de submissão avançou o mundo de ${N} para ${w.tick}`)
      const carimbados = r.pendentes.slice(nPend)
      if (!profundamenteIgual(carimbados, esperados)) {
        falha(
          `rodada ${iRod} tick ${N}: a sala carimbou ${JSON.stringify(carimbados)}, o arnês executou ${JSON.stringify(esperados)} ` +
            '(AC 5: bola do lado do jogador nesta rodada; AC 6: tick = tickAtual + ATRASO_ALVO_TICKS)',
        )
      }
      if (errosPara(env).length !== mortos) falha(`rodada ${iRod} tick ${N}: ${errosPara(env).length} erro(s) para ${mortos} cast(s) de bola morta`)
      resumo.casts += esperados.length
      resumo.castsMortos += mortos
    }

    // ---- avanço: até a próxima submissão, ou até o fim da rodada
    const alvo = i < comandos.length ? comandos[i].tick - ATRASO_ALVO_TICKS : c.sala.config.tetoDeTicks
    if (alvo <= N) {
      falha(`rodada ${iRod}: próximo comando no tick ${comandos[i]?.tick} não pode ser submetido depois do tick ${N}`)
      break
    }
    agora = agoraDoTick(r, alvo)
    const env = conduzir(c, agora, [])
    colher(env)
    if (c.sala.rodada === r && w.tick !== alvo) falha(`rodada ${iRod}: agora do tick ${alvo} deixou o mundo no tick ${w.tick}`)
    if (c.sala.rodada !== r) {
      // AC 10 / AC 11 (d) — o snap final vem ANTES do rodadaFim nos envios do passo em que a rodada termina
      const iSnap = env.map((e) => e.assento === K0 && e.msg.t === 'snap').lastIndexOf(true)
      const iFim = env.findIndex((e) => e.assento === K0 && e.msg.t === 'rodadaFim')
      if (iSnap < 0 || iFim < 0 || iSnap > iFim) falha(`rodada ${iRod}: snap final (índice ${iSnap}) não precede rodadaFim (índice ${iFim}) nos envios (AC 10)`)
    }
  }
  if (i < comandos.length && comandos.slice(i).some((cmd) => cmd.tick < w.tick)) {
    falha(`rodada ${iRod}: ${comandos.length - i} comando(s) gravado(s) não submetido(s)`)
  }

  // AC 11 (d) — o último snap tem over:true e roundEnd; os events de todos os snaps = world.events da rodada
  const ultimo = snapsK0[snapsK0.length - 1]
  if (ultimo === undefined || !ultimo.over || !ultimo.events.some((e) => e.t === 'roundEnd')) {
    falha(`rodada ${iRod}: o último snap não tem over:true com roundEnd (flush de fim de rodada, AC 10/11 d)`)
  }
  const entregues = snapsK0.flatMap((s) => s.events)
  const referencia = eventosDeReferencia(setupGravado, comandos)
  if (JSON.stringify(entregues) !== JSON.stringify(referencia)) {
    falha(`rodada ${iRod}: ${entregues.length} evento(s) nos snaps != ${referencia.length} em world.events (ou outra ordem) (AC 11 d)`)
  }
  for (const s of snapsK0.slice(0, -1)) {
    if (tickDoSnap(s) % intervalo !== 0) {
      falha(`rodada ${iRod}: snap no tick ${tickDoSnap(s)}, fora da cadência de ${intervalo} ticks (AC 10)`)
      break
    }
  }
  if (snapsK1 !== snapsK0.length) falha(`rodada ${iRod}: ${snapsK0.length} snap(s) para o assento 0 e ${snapsK1} para o 1`)
  if (ultimo !== undefined && tickDoSnap(ultimo) % intervalo !== 0) resumo.foraDaCadencia++
  resumo.snaps += snapsK0.length
  resumo.eventos += entregues.length
  return agora
}

/**
 * `e4.3`, casos que a Bo5 não pode exercitar sem mudar a partida: numa sala descartável, a 20 Hz (a taxa da
 * CONFIGURAÇÃO, não a constante — AC 10), assento vazio, sala cheia, cast fora da fase `rodada`, bola alheia
 * (AC 5, pelo parser e por fora dele), a cadência de 20 Hz, e o mecanismo de R-02 (AC 13): W.O. na rodada e
 * na loja, `anular`, e a desconexão no draft (§6).
 */
function salaNegativos(problemas: string[]): { linha: string; conf: ConferenciaDeEnvios[] } {
  const falha = (m: string) => anotar(problemas, `  ✗ sala negativos: ${m}`)
  const [K0, K1] = CHAVES_SALA
  const cast = { t: 'cast', ballIndex: 0, slot: 'ability', dx: 1, dy: 0, mag: 1 }
  const umErroPara = (env: Envio[], chave: string) => env.length === 1 && env[0].msg.t === 'erro' && env[0].assento === chave
  const confs: ConferenciaDeEnvios[] = []
  const nova = (rotulo: string, config: Partial<ConfigDaSala>) => {
    const c = novoCondutor(criarSala({ id: `guarda-e4.3-${rotulo}`, seed: 777, pool: POOL_SALA, chars: CHARS, hashDoMundo: hash, config }), rotulo, problemas)
    confs.push(c.conf)
    return c
  }
  /** assenta os dois e leva a partida até a rodada 0, com decisões pelo parser; devolve o `agora` */
  const ateARodada = (c: Condutor, agora: number): number => {
    conduzir(c, agora, [{ assento: K0, conexao: 'assentou' }])
    conduzir(c, agora, [{ assento: K1, conexao: 'assentou' }])
    const roteiro: Decisao[] = [
      { t: 'draft', jogador: 0, charId: 'golem' },
      { t: 'draft', jogador: 1, charId: 'golem' },
      { t: 'draft', jogador: 1, charId: 'vex' },
      { t: 'draft', jogador: 0, charId: 'vex' },
      { t: 'pronto', jogador: 0 },
      { t: 'pronto', jogador: 1 },
    ]
    for (const d of roteiro) conduzir(c, agora, pelaFronteira(c, CHAVES_SALA[d.jogador], { t: 'decisao', d }))
    if (c.sala.rodada === null) falha(`o roteiro mínimo não abriu a rodada 0 em '${c.rotulo}'`)
    return agora
  }

  // ---- 20 Hz: assento vazio, sala cheia, fase errada, bola alheia, cadência, W.O.
  const c = nova('20hz', { snapshotHz: 20 })
  let agora = T0_SALA
  if (!umErroPara(conduzir(c, agora, pelaFronteira(c, 'intruso', cast)), 'intruso')) falha("cast de conexão sem assento não virou {t:'erro'} só a ela (AC 6)")
  conduzir(c, agora, [{ assento: K0, conexao: 'assentou' }])
  const cedo = pelaFronteira(c, K0, { t: 'decisao', d: { t: 'draft', jogador: 0, charId: 'golem' } })
  if (!umErroPara(conduzir(c, agora, cedo), K0)) falha("decisão com a sala 'aguardando' não virou {t:'erro'}")
  conduzir(c, agora, [{ assento: K1, conexao: 'assentou' }])
  const assentosAntes = c.sala.assentos.join(',')
  if (!umErroPara(conduzir(c, agora, [{ assento: 'terceiro', conexao: 'assentou' }]), 'terceiro') || c.sala.assentos.join(',') !== assentosAntes) {
    falha("terceira conexão numa sala cheia não foi recusada com {t:'erro'} (e4.4/AC 7)")
  }
  const partidaNoDraft = c.sala.partida
  if (!umErroPara(conduzir(c, agora, pelaFronteira(c, K0, cast)), K0) || c.sala.partida !== partidaNoDraft) falha("cast fora da fase rodada não virou {t:'erro'} com estado intacto (AC 6)")
  agora = ateARodada(c, agora)
  const r = c.sala.rodada
  let resumo20 = ''
  let resumoWo = ''
  if (r !== null) {
    const w = r.world
    // AC 5 — bola alheia: o assento 1 contrabandeia o ballId de uma bola do time 0 (e um tick); o parser os
    // descarta e a sala resolve ballIndex 0 pelo lado do JOGADOR 1 nesta rodada
    const alheia = w.balls.find((b) => b.team !== r.lados[1])
    const propria = w.balls.filter((b) => b.team === r.lados[1])[0]
    const nPend = r.pendentes.length
    conduzir(c, agora, pelaFronteira(c, K1, { ...cast, ballId: alheia?.id, tick: 1 }))
    const carimbado = r.pendentes[nPend]
    if (carimbado === undefined || carimbado.ballId !== propria.id || carimbado.tick !== w.tick + ATRASO_ALVO_TICKS) {
      falha(`cast do assento 1 com ballId alheio virou ${JSON.stringify(carimbado)} — esperado a bola ${propria.id} no tick ${w.tick + ATRASO_ALVO_TICKS} (AC 5/6)`)
    }
    // por fora do parser: um índice que alcançaria a lista inteira do mundo
    const nPend2 = r.pendentes.length
    const fora: EntradaDaSala = { assento: K1, msg: { t: 'cast', ballIndex: 2 as unknown as 0, slot: 'ability', dx: 1, dy: 0, mag: 1 } }
    if (!umErroPara(conduzir(c, agora, [fora]), K1) || r.pendentes.length !== nPend2) falha("ballIndex 2 (por fora do parser) não foi recusado com {t:'erro'} só ao remetente (AC 5)")
    // AC 10 — cadência da CONFIGURAÇÃO: 30 ticks a 20 Hz são 10 snaps, a cada 3 ticks, seq 0..9
    const env = conduzir(c, agoraDoTick(r, 30), [])
    const snaps = env.filter((e) => e.assento === K0 && e.msg.t === 'snap').map((e) => (e.msg.t === 'snap' ? e.msg : null))
    const ticks = snaps.map((m) => (m === null ? -1 : tickDoSnap(m.s)))
    const seqs = snaps.map((m) => (m === null ? -1 : m.seq))
    const ticksOk = ticks.join(',') === '3,6,9,12,15,18,21,24,27,30' && seqs.join(',') === '0,1,2,3,4,5,6,7,8,9'
    if (!ticksOk) falha(`a 20 Hz a sala emitiu snaps nos ticks [${ticks.join(',')}] com seq [${seqs.join(',')}], esperado a cada 3 ticks (AC 10)`)
    resumo20 = ticksOk ? '20 Hz: 10 snaps a cada 3 ticks' : '20 Hz ✗'

    // AC 13 — R-02 default: queda → pausa; 1 ms antes do prazo nada; no prazo, W.O. da rodada ao presente
    agora = agoraDoTick(r, 30)
    conduzir(c, agora, [{ assento: K1, conexao: 'caiu' }])
    const prazoMs = c.sala.config.desconexao.prazoMs
    const antesWo = conduzir(c, agora + prazoMs - 1, [])
    if (antesWo.length !== 0 || w.tick !== 30) falha(`antes do prazo de R-02 a sala emitiu ${antesWo.length} envio(s) / andou o mundo (tick ${w.tick})`)
    agora += prazoMs
    const wo = conduzir(c, agora, [])
    const tipos = wo.map((e) => `${e.assento === K0 ? 0 : 1}:${e.msg.t}`).join(',')
    const hist = c.sala.partida.historico[0]
    const woOk =
      tipos === '0:snap,0:rodadaFim,0:visao' && hist !== undefined && hist.vencedor === 0 && c.sala.partida.fase === 'loja' && c.sala.pausa?.desde === agora
    if (!woOk) {
      falha(`W.O. de R-02 na rodada: envios [${tipos}], vencedor ${hist?.vencedor}, fase ${c.sala.partida.fase}, nova pausa ${c.sala.pausa?.desde} (AC 13)`)
    }
    // na loja: o presente declara pronto; no estouro seguinte, o ausente recebe {t:'pronto'} e a rodada 1 abre, pausada
    conduzir(c, agora, pelaFronteira(c, K0, { t: 'decisao', d: { t: 'pronto', jogador: 0 } }))
    agora += prazoMs
    conduzir(c, agora, [])
    const ultimaDec = c.sala.decisoes[c.sala.decisoes.length - 1]
    const lojaOk = ultimaDec?.t === 'pronto' && ultimaDec.jogador === 1 && c.sala.rodada !== null && c.sala.rodada.world.tick === 0 && c.sala.pausa !== null
    if (!lojaOk) falha(`W.O. de R-02 na loja: última decisão ${JSON.stringify(ultimaDec)}, rodada ${c.sala.rodada !== null}, pausa ${c.sala.pausa !== null} (AC 13)`)
    resumoWo = woOk && lojaOk ? 'R-02 W.O.: rodada → vitória do presente, loja → pronto do ausente' : 'R-02 W.O. ✗'
  }

  // ---- R-02 'anular' (prazo 0): a sala encerra, e o presente recebe o {t:'sala'} encerrada
  const a = nova('anular', { desconexao: { prazoMs: 0, noEstouro: 'anular' } })
  let agoraA = ateARodada(a, T0_SALA)
  agoraA += 17
  const envA = conduzir(a, agoraA, [{ assento: K0, conexao: 'caiu' }])
  const anularOk = a.sala.fase === 'encerrada' && envA.length === 1 && envA[0].assento === K1 && envA[0].msg.t === 'sala' && envA[0].msg.estado === 'encerrada'
  if (!anularOk) falha(`R-02 'anular': sala '${a.sala.fase}', envios ${JSON.stringify(envA.map((e) => [e.assento, e.msg.t]))} (AC 13)`)

  // ---- §6: desconexão no draft devolve a sala a 'aguardando', libera o assento e recria a partida
  const d6 = nova('draft', {})
  conduzir(d6, T0_SALA, [{ assento: K0, conexao: 'assentou' }])
  conduzir(d6, T0_SALA, [{ assento: K1, conexao: 'assentou' }])
  conduzir(d6, T0_SALA, pelaFronteira(d6, K0, { t: 'decisao', d: { t: 'draft', jogador: 0, charId: 'golem' } }))
  conduzir(d6, T0_SALA, [{ assento: K1, conexao: 'caiu' }])
  const d6Ok = d6.sala.fase === 'aguardando' && d6.sala.assentos[1] === null && d6.sala.partida.draft.passo === 0
  conduzir(d6, T0_SALA, [{ assento: 'outra-pessoa', conexao: 'assentou' }])
  if (!d6Ok || d6.sala.fase !== 'jogando' || d6.sala.assentos[1] !== 'outra-pessoa') {
    falha(`desconexão no draft: sala '${d6.sala.fase}', assentos [${d6.sala.assentos.join(',')}] — esperado aguardando, assento livre e partida recriada (§6)`)
  }

  const linha =
    `  negativos    ${problemas.length === 0 ? '✓' : '✗'} assento vazio, sala cheia, decisão com a sala aguardando e cast fora da rodada → {t:'erro'} · bola alheia: ` +
    `ballId contrabandeado some no parser e a sala move a própria; ballIndex 2 recusado · ${resumo20} · ${resumoWo} · anular → encerrada · draft → aguardando (§6)`
  return { linha, conf: confs }
}

/**
 * `debt.14` — o que a Bo5 não pode exercitar sem mudar a partida comparada com o arnês, em salas descartáveis:
 *  - AC 3 (`E43-TST-001`): a recusa de `d.jogador` alheio para `build`, `buildPadrao` e `pronto` (na única janela
 *    de `builds`, a que o draft abre) e para `compra`, `trocaDeBuild` e `pronto` (na primeira `loja` em que
 *    `aplicar()` aceita a compra e a troca — escolhida pelo PREDICADO, não por índice, porque a economia é D-09,
 *    provisória). Cada caso só vale se `aplicar()` aceitaria a decisão naquele estado, e tem o controle positivo:
 *    a MESMA decisão, do assento dono, é aceita. Compra e troca vão em jogadores diferentes (uma consome o ouro
 *    que a outra precisaria);
 *  - AC 5 (`E43-TST-003`): (i) teto de ticks pequeno — snap final no tick do teto, com `over:false`, e
 *    `rodadaFim` com `ticks === tetoDeTicks`; (ii) reassentamento em `builds` → `{t:'prazo'}` com o restante;
 *    (iii) queda em `builds` (nos primeiros 10 s, antes de o prazo de R-02 alcançar o de RF-04) e na `loja`
 *    abrindo a pausa por conta própria, com o W.O. da fase no estouro.
 */
function salaVariantesEBordas(problemas: string[]): { variantes: string; bordas: string; conf: ConferenciaDeEnvios[] } {
  const falha = (m: string) => anotar(problemas, `  ✗ sala debt.14: ${m}`)
  const [K0, K1] = CHAVES_SALA
  const confs: ConferenciaDeEnvios[] = []
  const TETO = 30
  const nova = (rotulo: string, config: Partial<ConfigDaSala>) => {
    const c = novoCondutor(criarSala({ id: `guarda-debt.14-${rotulo}`, seed: 777, pool: POOL_SALA, chars: CHARS, hashDoMundo: hash, config }), rotulo, problemas)
    confs.push(c.conf)
    return c
  }
  const decidirPor = (c: Condutor, chave: string, d: Decisao, agora: number) => conduzir(c, agora, pelaFronteira(c, chave, { t: 'decisao', d }))
  /** assenta os dois e faz o draft pelas decisões de cada dono: a sala sai em `builds`, com o prazo de RF-04 correndo */
  const ateBuilds = (c: Condutor, agora: number) => {
    conduzir(c, agora, [{ assento: K0, conexao: 'assentou' }])
    conduzir(c, agora, [{ assento: K1, conexao: 'assentou' }])
    const draft: Decisao[] = [
      { t: 'draft', jogador: 0, charId: 'golem' },
      { t: 'draft', jogador: 1, charId: 'golem' },
      { t: 'draft', jogador: 1, charId: 'vex' },
      { t: 'draft', jogador: 0, charId: 'vex' },
    ]
    for (const d of draft) decidirPor(c, CHAVES_SALA[d.jogador], d, agora)
    if (c.sala.partida.fase !== 'builds' || c.sala.prazoDeBuilds === null) falha(`o draft não abriu a fase builds com prazo em '${c.rotulo}'`)
  }
  /** AC 3 — recusa pelo assento alheio (1 {t:'erro'} só a ele, estado intacto, log intacto) e controle positivo */
  const aceitas: string[] = []
  const recusaEControle = (c: Condutor, d: Decisao, agora: number): void => {
    const dono = CHAVES_SALA[d.jogador]
    const alheio = CHAVES_SALA[d.jogador === 0 ? 1 : 0]
    const p = c.sala.partida
    const nLog = c.sala.decisoes.length
    const oraculo = aplicar(p, d).erro
    if (oraculo !== undefined) {
      falha(`${d.t}/j${d.jogador} num momento em que aplicar() já recusaria (${oraculo}) — o caso não testaria a checagem da sala (AC 3)`)
      return
    }
    const env = decidirPor(c, alheio, d, agora)
    if (c.sala.partida !== p || c.sala.decisoes.length !== nLog) {
      falha(`${d.t} em nome do jogador ${d.jogador} vinda do assento do outro chegou a aplicar() / mudou o estado (AC 3)`)
      return
    }
    if (env.length !== 1 || env[0].msg.t !== 'erro' || env[0].assento !== alheio) {
      falha(`${d.t} com d.jogador alheio: esperado 1 {t:'erro'} só ao remetente, veio ${JSON.stringify(env.map((e) => [e.assento, e.msg.t]))} (AC 3)`)
      return
    }
    const env2 = decidirPor(c, dono, d, agora)
    if (c.sala.partida === p || errosPara(env2).length !== 0 || c.sala.decisoes.length !== nLog + 1) {
      falha(`controle positivo: ${d.t}/j${d.jogador} do assento DONO não foi aceita (partida ${c.sala.partida === p ? 'intacta' : 'mudou'}, ${errosPara(env2).length} erro(s)) (AC 3)`)
      return
    }
    aceitas.push(d.t)
  }

  // ---- AC 3, fase builds (a única janela): build e buildPadrao do jogador 1, depois pronto do 0 abre a rodada 0
  const v = nova('variantes', { tetoDeTicks: TETO })
  let agora = T0_SALA
  ateBuilds(v, agora)
  agora += 100
  recusaEControle(v, { t: 'build', jogador: 1, slot: 0, abilityIndex: 1, passiveIndex: 1 }, agora)
  recusaEControle(v, { t: 'buildPadrao', jogador: 1 }, agora)
  recusaEControle(v, { t: 'pronto', jogador: 0 }, agora)
  const prazoRf04 = v.sala.config.prazoDeBuildsMs
  if (agora - T0_SALA >= prazoRf04) falha('os casos de builds rodaram depois do prazo de RF-04 (AC 3)')

  // ---- AC 5 (i): a rodada 0 vai até o teto; snap final no tick do teto (over:false) e rodadaFim com ticks = teto
  let tetoTxt = 'teto ✗'
  const r0 = v.sala.rodada
  if (r0 === null) falha('builds encerrada e a rodada 0 não abriu na sala de variantes')
  else {
    agora = agoraDoTick(r0, TETO)
    const env = conduzir(v, agora, [])
    const iSnap = env.map((e) => e.assento === K0 && e.msg.t === 'snap').lastIndexOf(true)
    const iFim = env.findIndex((e) => e.assento === K0 && e.msg.t === 'rodadaFim')
    const snapFinal = iSnap >= 0 ? env[iSnap].msg : null
    const fins = env.filter((e) => e.msg.t === 'rodadaFim').map((e) => (e.msg.t === 'rodadaFim' ? e.msg.resultado.ticks : -1))
    const ok =
      v.sala.rodada === null && snapFinal !== null && snapFinal.t === 'snap' && tickDoSnap(snapFinal.s) === TETO && !snapFinal.s.over &&
      iSnap < iFim && fins.length === 2 && fins.every((t) => t === TETO) && v.sala.partida.historico[0]?.ticks === TETO
    if (!ok) {
      falha(
        `teto de ${TETO} ticks: rodada ${v.sala.rodada === null ? 'fechada' : `aberta no tick ${r0.world.tick}`}, snap final ` +
          `${snapFinal?.t === 'snap' ? `no tick ${tickDoSnap(snapFinal.s)} over:${snapFinal.s.over}` : 'ausente'} (índice ${iSnap}), ` +
          `rodadaFim ${JSON.stringify(fins)} (índice ${iFim}) (AC 5 i)`,
      )
    } else tetoTxt = `teto de ${TETO} ticks: snap final no tick ${TETO} (over:false) antes do rodadaFim com ticks ${TETO}, aos 2 assentos`
  }

  // ---- AC 3, fase loja: a primeira loja em que aplicar() aceita a compra do jogador 1 E a troca do jogador 0
  const compra: Decisao = { t: 'compra', jogador: 1, slot: 0, itemId: 'chumbo' }
  const troca: Decisao = { t: 'trocaDeBuild', jogador: 0, slot: 0, abilityIndex: 1, passiveIndex: 0 }
  const aceitaria = (d: Decisao) => aplicar(v.sala.partida, d).erro === undefined
  let lojas = 0
  for (let volta = 0; volta < 12; volta++) {
    const p = v.sala.partida
    if (p.fase === 'loja') {
      lojas++
      if (aceitaria(compra) && aceitaria(troca)) break
      agora += 100
      for (const j of JOGADORES_SALA) decidirPor(v, CHAVES_SALA[j], { t: 'pronto', jogador: j }, agora)
    } else if (p.fase === 'rodada' && v.sala.rodada !== null) {
      agora = agoraDoTick(v.sala.rodada, TETO)
      conduzir(v, agora, [])
    } else break
  }
  const ouro = v.sala.partida.jogadores.map((x) => x.ouro).join(',')
  if (v.sala.partida.fase !== 'loja' || !aceitaria(compra) || !aceitaria(troca)) {
    falha(`nenhuma loja alcançável em que aplicar() aceite compra e trocaDeBuild (fase ${v.sala.partida.fase}, ouro [${ouro}]) — escalar ao @po (AC 3)`)
  } else {
    agora += 100
    recusaEControle(v, compra, agora)
    recusaEControle(v, troca, agora)
    recusaEControle(v, { t: 'pronto', jogador: 1 }, agora)
  }

  // ---- AC 5 (iii), loja: sem pausa anterior, o jogador 0 (não pronto) cai; a queda abre a pausa sozinha, e no
  // estouro de R-02 o ausente recebe {t:'pronto'} (a rodada seguinte abre, com a pausa renovada)
  const prazoR02 = v.sala.config.desconexao.prazoMs
  let lojaTxt = 'loja ✗'
  const pronta = (c: Condutor) => c.sala.partida.fase === 'loja' && c.sala.pausa === null && !c.sala.partida.prontos[0] && c.sala.partida.prontos[1]
  if (pronta(v)) {
    agora += 100
    conduzir(v, agora, [{ assento: K0, conexao: 'caiu' }])
    const abriu = v.sala.pausa?.desde === agora
    const pLoja = v.sala.partida
    conduzir(v, agora + prazoR02 - 1, [])
    const antesDoPrazo = v.sala.partida === pLoja
    agora += prazoR02
    conduzir(v, agora, [])
    const ult = v.sala.decisoes[v.sala.decisoes.length - 1]
    const woOk = ult?.t === 'pronto' && ult.jogador === 0 && v.sala.partida.fase === 'rodada' && v.sala.pausa?.desde === agora
    if (!abriu || !antesDoPrazo || !woOk) {
      falha(`queda na loja: pausa aberta pela queda ${abriu}, estado intacto antes do prazo ${antesDoPrazo}, W.O. ${JSON.stringify(ult)} fase ${v.sala.partida.fase} pausa ${v.sala.pausa?.desde} (AC 5 iii)`)
    } else lojaTxt = 'loja → W.O. pronto do ausente'
  } else falha(`a sala de variantes não chegou à loja pronta para a queda (fase ${v.sala.partida.fase}, pausa ${v.sala.pausa !== null}) (AC 5 iii)`)

  // ---- AC 5 (iii) builds + (ii): queda 2 s depois de builds abrir (antes dos 10 s em que R-02 alcança RF-04),
  // W.O. buildPadrao do ausente no estouro da pausa, e o reassentamento ainda em builds recebe o prazo RESTANTE
  const b = nova('builds', {})
  const t0 = T0_SALA
  ateBuilds(b, t0)
  const prazoB = b.sala.prazoDeBuilds ?? t0
  let buildsTxt = 'builds ✗'
  let prazoTxt = 'prazo ✗'
  const tQueda = t0 + 2_000
  if (prazoB - tQueda <= prazoR02) falha(`a queda em builds a ${tQueda - t0} ms não deixa o prazo de R-02 estourar antes do de RF-04 (AC 5 iii)`)
  conduzir(b, tQueda, [{ assento: K1, conexao: 'caiu' }])
  const abriuB = b.sala.pausa?.desde === tQueda
  const pB = b.sala.partida
  conduzir(b, tQueda + prazoR02 - 1, [])
  const intactoB = b.sala.partida === pB
  const tWo = tQueda + prazoR02
  conduzir(b, tWo, [])
  const ultB = b.sala.decisoes[b.sala.decisoes.length - 1]
  const woB = ultB?.t === 'buildPadrao' && ultB.jogador === 1 && b.sala.partida.fase === 'builds' && b.sala.partida.prontos[1] && !b.sala.partida.prontos[0] && tWo < prazoB
  if (!abriuB || !intactoB || !woB) {
    falha(`queda em builds: pausa aberta pela queda ${abriuB}, estado intacto antes do prazo ${intactoB}, W.O. ${JSON.stringify(ultB)} fase ${b.sala.partida.fase} (AC 5 iii)`)
  } else buildsTxt = `builds (queda a ${tQueda - t0} ms) → W.O. buildPadrao do ausente a ${tWo - t0} ms, antes do RF-04`
  const tVolta = t0 + 25_000
  const envVolta = conduzir(b, tVolta, [{ assento: K1, conexao: 'assentou' }])
  const prazos = envVolta.filter((e) => e.assento === K1 && e.msg.t === 'prazo').map((e) => (e.msg.t === 'prazo' ? e.msg.terminaEmMs : -1))
  const restante = prazoB - tVolta
  if (b.sala.partida.fase !== 'builds' || prazos.length !== 1 || prazos[0] !== restante) {
    falha(`reassentamento em builds a ${tVolta - t0} ms: {t:'prazo'} ao reassentado [${prazos.join(',')}], esperado exatamente um com o restante ${restante} ms (AC 5 ii)`)
  } else prazoTxt = `reassentamento em builds a ${tVolta - t0} ms → 1 {t:'prazo'} com o restante (${restante} ms)`

  const variantes = `d.jogador alheio recusado com 1 {t:'erro'} só ao remetente, estado e log intactos, num estado em que aplicar() aceitaria, ` +
    `com controle positivo do assento dono: ${aceitas.join(', ')} (${aceitas.length}/6 casos; compra e trocaDeBuild na ${lojas}ª loja, ouro [${ouro}], sala descartável) · draft na Bo5`
  const bordas = `${tetoTxt} · ${prazoTxt} · queda sem pausa anterior abre a pausa sozinha: ${buildsTxt}; ${lojaTxt}`
  return { variantes, bordas, conf: confs }
}

function guardaSala(): { linhas: string[]; problemas: string[] } {
  const problemas: string[] = []
  const linhas: string[] = []
  // tripwires: o teto de ticks da sala é o do arnês, e a taxa padrão é a constante (AC 10)
  if (CONFIG_PADRAO_DA_SALA.tetoDeTicks !== MAX_ROUND_TICKS) {
    problemas.push(`  ✗ sala: tetoDeTicks padrão ${CONFIG_PADRAO_DA_SALA.tetoDeTicks} != MAX_ROUND_TICKS ${MAX_ROUND_TICKS} de tools/harness.ts`)
  }
  if (CONFIG_PADRAO_DA_SALA.snapshotHz !== SNAPSHOT_HZ) {
    problemas.push(`  ✗ sala: snapshotHz padrão ${CONFIG_PADRAO_DA_SALA.snapshotHz} != SNAPSHOT_HZ ${SNAPSHOT_HZ} (AC 10)`)
  }
  // a gravação usada não pode ter comando em tick < ATRASO_ALVO_TICKS: seed com algum é PULADA, nunca clampada
  let gravada: PartidaGravada | null = null
  const puladas: string[] = []
  for (const seed of SEEDS_SALA) {
    const g = jogarPartida(seed)
    const cedo = g.rodadas.flatMap((r) => r.comandos).filter((cmd) => cmd.tick < ATRASO_ALVO_TICKS).length
    if (cedo === 0) {
      gravada = g
      break
    }
    puladas.push(`${seed} (${cedo} comando(s) com tick < ${ATRASO_ALVO_TICKS})`)
  }
  if (gravada === null) {
    problemas.push(`  ✗ sala: nenhuma das seeds ${SEEDS_SALA.join(', ')} tem gravação sem comando em tick < ${ATRASO_ALVO_TICKS} — escolher outra seed, nunca clampar (AC 11)`)
    return { linhas: [`sala pura      ✗ sem gravação utilizável`], problemas }
  }
  const b = bo5PelaSala(gravada, problemas)
  const nProblemasBo5 = problemas.length
  const neg = salaNegativos(problemas)
  const vb = salaVariantesEBordas(problemas)
  const confs = [b.conf, ...neg.conf, ...vb.conf]
  const soma = (k: keyof ConferenciaDeEnvios) => confs.reduce((s, x) => s + x[k], 0)
  const ok = (n: number) => (problemas.length === 0 && n === 0 ? '✓' : '✗')
  linhas.push(
    `sala pura      ${problemas.length === 0 ? '✓ ok' : '✗ falhou'} — net/sala.ts: a Bo5 inteira por passo() reproduz tools/partida.ts; a sala não acrescenta regra de jogo (e4.3)`,
    `  bo5          ${ok(nProblemasBo5)} matchSeed ${b.seed}${puladas.length ? ` (puladas: ${puladas.join('; ')})` : ''} · ${b.rodadas} rodada(s) · placar ${b.placar} · venc/rodada [${b.vencedores}] · ` +
      `hash/ticks/lado iguais ao arnês em ${b.hashesIguais}/${b.rodadas} · ${b.casts} cast(s) submetidos em T−${ATRASO_ALVO_TICKS} e carimbados em T (0 com tick < ${ATRASO_ALVO_TICKS}) · ` +
      `${b.rejeitadas} decisão(ões) ilegal(is) → {t:'erro'} ao remetente, estado intacto · buildPadrao pelo prazo de RF-04 · controle [humano,humano]`,
    `  flush        ${ok(nProblemasBo5)} ${b.rodadas}/${b.rodadas} rodadas: último snap com over:true e roundEnd antes de rodadaFim · events de ${b.snaps} snaps = world.events (${b.eventos} eventos, em ordem) · ` +
      `${b.foraDaCadencia} rodada(s) terminam fora da cadência de ${TICK_HZ / SNAPSHOT_HZ} ticks`,
    `  assentos     ${ok(nProblemasBo5)} ${soma('salas')} {t:'sala'} por assento, cada um com o segredo e o jogador do próprio destinatário, v${VERSAO_DO_FIO} e o snapshotHz da configuração · ` +
      `primeiro envio em ${soma('assentamentos')} assentamento(s), com reassentamento no meio da rodada · ${soma('visoes')} {t:'visao'} = visaoPara(estado, jogador do assento)`,
    `  autoridade   ${ok(nProblemasBo5)} decisão com d.jogador alheio recusada só ao remetente, estado intacto (AC 16) · cast de bola morta descartado · ${soma('pelaFronteira')} mensagens pela fronteira ` +
      '(parseDoCliente(JSON.parse(JSON.stringify(msg))), AC 16)',
    neg.linha,
    `  por variante ${ok(0)} ${vb.variantes} (debt.14, E43-TST-001)`,
    `  cobertura    ${ok(0)} ${soma('transicoes')} transição(ões) de partida com a sala jogando → ≥1 {t:'visao'} a cada assento conectado · ${soma('rodadasFechadas')} rodada(s) fechada(s): ` +
      "1 rodadaFim a cada assento conectado e nenhum ao vago, ≥1 rodadaInicio na rodada (reassentado: o da largada + o da volta) · queda no draft → só {t:'sala'} (§6) · contagem por tipo e por assento (debt.14, E43-TST-002)",
    `  bordas       ${ok(0)} ${vb.bordas} (debt.14, E43-TST-003)`,
  )
  return { linhas, problemas }
}

const { linhas: linhasSala, problemas: problemasSala } = guardaSala()

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
const { linhas: linhasTelemetria, problemas: problemasTelemetria } = verificarTelemetria()

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
for (const linha of linhasCodec) console.log(linha)
if (problemasCodec.length) for (const p of problemasCodec) console.log(p)
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
for (const linha of linhasTelemetria) console.log(linha)
console.log('')
for (const linha of linhasSala) console.log(linha)
if (problemasSala.length) for (const p of problemasSala) console.log(p)

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
if (problemasCodec.length > 0) {
  throw new Error(
    `guarda do codec do fio (e4.8) falhou em ${problemasCodec.length} ponto(s) — ver acima. ` +
      'Suspeitos: parseDoCliente aceitando forma fora de DoCliente (número não finito, slot/t fora da lista, ' +
      'campo extra devolvido) (AC 4); quantização fora da tabela de architecture-e4.md §5.5 — ultCharge sem ' +
      'piso, abilityReadyAt absoluto ou arredondado —, aridade da tupla sem conferência, ou orçamento do snap ' +
      'estourado (AC 5). Mudar o layout da tupla é mudança de protocolo (§11.6), não ajuste de teste.',
  )
}
if (problemasBot001.length > 0) {
  throw new Error(
    `guarda de BOT-001 falhou em ${problemasBot001.length} ponto(s) — ver acima. O limiar de ` +
      '`porValorEsperado` precisa estar escrito no sentido positivo (`!(melhorVE >= limiar)`), ' +
      'senão um VE = NaN faz o bot castar onde a política manda não castar.',
  )
}
if (problemasTelemetria.length > 0) {
  for (const p of problemasTelemetria) console.log(p)
  throw new Error(
    `guarda da telemetria (debt.11) falhou em ${problemasTelemetria.length} ponto(s) — ver acima. ` +
      'Suspeitos: registrar() sem carimbo por evento (M1) ou carimbo aplicado em exportar() (M1b) em ' +
      'client/telemetria.ts; ausente lido como atraso 0 / escala 1.0 (M2) ou agregar() sem partição por ' +
      'população (M3) em tools/telemetria.ts; global da guarda não restaurado pelo descritor original (R3).',
  )
}
if (problemasSala.length > 0) {
  throw new Error(
    `guarda da sala pura (e4.3) falhou em ${problemasSala.length} ponto(s) — ver acima. A Bo5 conduzida por passo() tem de ` +
      'reproduzir tools/partida.ts. Suspeitos: carimbo fora de tickAtual + ATRASO_ALVO_TICKS (AC 6); ballIndex resolvido por ' +
      'team === jogador em vez de ladosDaRodada (AC 5); snap final ausente ou depois de rodadaFim (AC 10); cadência lendo a ' +
      "constante em vez de config.snapshotHz (AC 10); {t:'sala'} ou {t:'visao'} em broadcast, com segredo ou jogador de outro " +
      'assento (AC 8, AC 11 e); decisão com d.jogador alheio aceita (AC 16); registrarRodada com o controle default (AC 12).',
  )
}
