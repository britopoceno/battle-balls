import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHARS } from '../chars/index.ts'
import { dummyCommands } from '../bot/dummy.ts'
import { botCommands, createBot } from '../bot/heuristic.ts'
import {
  createWorld,
  TICK_MS,
  MIN_ABILITY_CD_MS,
  type RoundSetup,
  type PickSetup,
} from '../sim/world.ts'
import { SIGMA_MAX } from '../sim/stats.ts'
import type { Command } from '../sim/types.ts'
// `hash` também mora em `./harness.ts` (AC 4), mas este arquivo o consome apenas através de
// `RoundResult.hash` — importá-lo aqui só para "cumprir a lista" seria import não usado, e
// `noUnusedLocals` reprova o `npm run check`. Ver Dev Agent Record da story e2.0.
import { runRound, type RoundDriver, type RoundResult } from './harness.ts'
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
 * A seed 11 é deliberada: exercita o caminho de empate (winner === -1), que é o que
 * a decisão D-02 (`docs/prd.md` §5) regulamenta.
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
 * **Achado registrado, não corrigido aqui:** a seed 11 era deliberada para exercitar o caminho de
 * EMPATE (`winner === -1`, ver comentário acima). Neste re-baseline ela não empata mais
 * (`winner: 1`) — a cobertura do caminho de empate perdeu a seed que a garantia. Não é escopo
 * desta story achar uma seed substituta (T-1 pede re-gravar com justificativa, não re-desenhar a
 * tabela); fica para quem tocar `BASELINE` a seguir confirmar se algum caminho ainda exercita
 * `winner === -1`, ou se a Fase 3 perdeu essa rede sem perceber.
 */
const BASELINE: { seed: number; hash: string; ticks: number; winner: number }[] = [
  { seed: 1, hash: '327b60f3', ticks: 4110, winner: 1 },
  { seed: 2, hash: '6c9ec9a8', ticks: 4177, winner: 0 },
  { seed: 3, hash: 'adfceac2', ticks: 4099, winner: 0 },
  { seed: 7, hash: 'cdd32326', ticks: 3972, winner: 1 },
  { seed: 11, hash: '5904fbe4', ticks: 4279, winner: 1 },
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
if (problemasBot001.length > 0) {
  throw new Error(
    `guarda de BOT-001 falhou em ${problemasBot001.length} ponto(s) — ver acima. O limiar de ` +
      '`porValorEsperado` precisa estar escrito no sentido positivo (`!(melhorVE >= limiar)`), ' +
      'senão um VE = NaN faz o bot castar onde a política manda não castar.',
  )
}
