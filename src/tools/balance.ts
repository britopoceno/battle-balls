import { CHARS, ROSTER } from '../chars/index.ts'
import { BOT_VERSION, PRESET_ARNES, botCommands, createBot } from '../bot/heuristic.ts'
import { SUDDEN_DEATH_MS, TICK_MS, type PickSetup, type RoundSetup } from '../sim/world.ts'
import {
  CLAMP_COUNTERS,
  SIGMA_MAX,
  SIGMA_MIN,
  STAT_KEYS,
  makeStatBlock,
  recomputeStats,
  resetClampCounters,
  type StatBlock,
  type StatKey,
} from '../sim/stats.ts'
import { TUNNELING_COUNTER, integrate, resetTunnelingCounter } from '../sim/physics.ts'
import type { AimSpec, Ball, CharDef, World, WorldView } from '../sim/types.ts'
import { runRound, type RoundDriver } from './harness.ts'
import { NOMES_PACOTE, PACOTES, type NomePacote, type Pacote } from './packages.ts'

/**
 * ARNÊS DE BALANCEAMENTO — o CLI (`npm run balance`). Implementa `docs/architecture-e2.md`
 * §4 (confronto, matriz, troca de lado, IC), §5 (mutação de stats e protocolo A/B), §5.4 (bateria
 * do Risco #1b), §6.2 (flags) e §6.3 (saída). Stories `e2.5` (§4), `e2.6` (§5) e `e2.7` (§5.4).
 *
 * FRONTEIRA (§6.1): este arquivo **orquestra** e não contém regra de simulação. Toda partida
 * passa por `harness.runRound`; não existe aqui um segundo laço de partida, e nem pode existir —
 * é o motivo pelo qual `e2.0` extraiu `runRound`. Se este arquivo tivesse a própria cópia do
 * laço, o golden hash estaria protegendo um jogo e a matriz medindo outro, sem nenhum aviso.
 *
 * O mesmo vale para a mutação de `e2.6`: ela entra por `PickSetup.itemBonus` (§5.1), o campo que
 * a loja da Fase 3 vai usar, e não por um "modo mutante" próprio. Um caminho de código exclusivo
 * de teste é um caminho que a produção nunca exercita — e um mutante que escapasse de
 * `SIGMA_MIN`/`SIGMA_MAX` provaria a detecção de uma configuração que o jogo real não produz.
 *
 * O que este arquivo NÃO faz, por decisão de escopo registrada (§6.4 e a própria story):
 *   - draft, loja, economia, Bo5, telemetria de jogadores reais → Fases 3 e 5
 *   - a regra de AGREGAÇÃO do gatilho do Risco #1b entre personagens → Fase 5 (§9/R-04)
 * Flags de §6.2 que ainda não existissem seriam REJEITADAS com mensagem própria em vez de
 * ignoradas em silêncio (`FUTURAS`): quem as digitasse estaria pedindo uma medição que este
 * binário não sabe fazer, e receber uma tabela sem mutação nenhuma seria pior do que um erro.
 */

// ---------------------------------------------------------------- constantes de decisão

/** §4.4 — a faixa de RF-47. O alerta é sobre o estimador pontual; o IC decide o 3º estado. */
const ALVO_MIN = 0.45
const ALVO_MAX = 0.55
/** z de 95% bilateral. Literal de §4.4: `IC = ±1,96·√(0,25/n)`. */
const Z_95 = 1.96

/**
 * Nome do preset, ao lado do objeto que ele nomeia — §6.3 exige que a saída diga QUAL preset
 * produziu a matriz, e um rótulo longe do valor é um rótulo que mente na primeira edição.
 */
const PRESET_NOME = 'arnes'
const PRESET = PRESET_ARNES

/** Build fixo dos dois slots. Draft/loja é Fase 3 (§6.4) — o CLI mede rodadas isoladas. */
const ABILITY_INDEX = 0 as const
const PASSIVE_INDEX = 0 as const

/**
 * Teto de seeds por fase, em múltiplos das decididas pedidas (§4.3: "com um teto de seeds para
 * não girar para sempre"). Com a taxa de empate medida em §1.3 (11,1% no pior caso conhecido)
 * bastariam ~1,13 seeds por decidida; 20× só é atingido se mais de 95% das rodadas empatarem,
 * que é configuração quebrada e não amostra ruim — daí ser teto de segurança, não de orçamento.
 */
const TETO_SEEDS_POR_DECIDIDA = 20

// ---------------------------------------------------------------- flags (§6.2)

/** Uma mutação por campo, já validada: `--mutacao=vex:dmg:+0.30` (§5.2, para P2.2). */
interface Mutacao {
  charId: string
  key: StatKey
  valor: number
}

interface Flags {
  n: number
  seed: number
  plano: string
  repetePersonagem: boolean
  comp: string[]
  json: boolean
  pacote: NomePacote | null
  alvo: string | null
  mutacoes: Mutacao[]
  risco1b: boolean
}

const USO = `
npm run balance -- [flags]

  --n=800                 rodadas DECIDIDAS por confronto (RF-48; piso, não alvo)
  --seed=1                seed base; as seeds são consumidas em ordem crescente
  --plano=espelho-ab      espelho-ab | pares-de-composicao
  --repete-personagem     no plano de pares, permite o mesmo personagem nos dois times
  --comp=golem,vex        composição do plano espelho-ab
  --pacote=nenhum         ${NOMES_PACOTE.join(' | ')}                  (§5.2 — protocolo A/B)
  --alvo=vex              a qual personagem do lado modificado o pacote se aplica
  --mutacao=vex:dmg:+0.30 mutação por campo, para P2.2 (repetível; mesmo personagem)
  --risco-1b              bateria completa de §5.4: controle + físico + dano, para CADA personagem
                          da composição; reporta o PAR DE DELTAS por personagem (§9/R-04)
  --json                  saída legível por máquina, além da tabela

  --pacote e --mutacao disparam o protocolo A/B de §5.3: a MESMA composição dos dois lados, o
  pacote em UM personagem de UM lado, metade das seeds com o pacote no time 0 e metade no time 1.
  O winrate reportado é o do LADO MODIFICADO sobre as rodadas decididas.

  --risco-1b roda esse mesmo protocolo em bateria (um controle e dois pacotes por personagem) e
  imprime, por personagem, delta_fisico e delta_dano contra o controle DAQUELE personagem.
`.trim()

/**
 * Flags de `docs/architecture-e2.md` §6.2 que existem no desenho e NÃO neste binário. Vazio desde
 * `e2.7`, que trouxe a última (`--risco-1b`) — §6.2 não lista mais nenhuma pendente, e o passo 8
 * do plano (§7) são contadores no rodapé, não flags. O mecanismo fica: rejeitar com mensagem é a
 * diferença entre "esta medição não existe ainda" e uma tabela sem mutação nenhuma que parece boa.
 */
const FUTURAS: Record<string, string> = {}

function lerFlags(argv: readonly string[]): Flags {
  const f: Flags = {
    n: 800,
    seed: 1,
    plano: 'espelho-ab',
    repetePersonagem: false,
    comp: ['golem', 'vex'],
    json: false,
    pacote: null,
    alvo: null,
    mutacoes: [],
    risco1b: false,
  }

  for (const arg of argv) {
    const eq = arg.indexOf('=')
    const nome = eq === -1 ? arg : arg.slice(0, eq)
    const valor = eq === -1 ? '' : arg.slice(eq + 1)

    const futura = FUTURAS[nome]
    if (futura) {
      falhar(`a flag ${nome} não existe nesta versão do CLI: ${futura}.`)
    }

    switch (nome) {
      case '--n':
        f.n = inteiroPositivo(nome, valor)
        if (f.n < 2) falhar('--n precisa ser >= 2 (a troca de lado divide as decididas em duas metades).')
        break
      case '--seed':
        f.seed = inteiroPositivo(nome, valor)
        break
      case '--plano':
        if (valor !== 'espelho-ab' && valor !== 'pares-de-composicao') {
          falhar(`--plano desconhecido: '${valor}'. Geradores da v1: espelho-ab | pares-de-composicao.`)
        }
        f.plano = valor
        break
      case '--repete-personagem':
        f.repetePersonagem = true
        break
      case '--comp':
        f.comp = valor.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
        if (f.comp.length === 0) falhar('--comp vazio.')
        for (const id of f.comp) {
          if (!CHARS[id]) falhar(`--comp: personagem desconhecido '${id}'. Roster: ${ROSTER.map((c) => c.id).join(', ')}.`)
        }
        break
      case '--pacote': {
        // AC 2 / §5.2: NUNCA campo cru aqui. Só nomes definidos em `packages.ts` — é a decisão
        // de arquitetura que impede a armadilha do sinal (`drag: −0.20` mede o oposto do que o
        // Risco #1b quer saber, com 10pp e troca de sinal de diferença).
        if (!(NOMES_PACOTE as readonly string[]).includes(valor)) {
          falhar(
            `--pacote desconhecido: '${valor}'. Pacotes de §5.2: ${NOMES_PACOTE.join(', ')}. ` +
              'O CLI não aceita campo cru em --pacote de propósito (a armadilha do sinal de §5.2); ' +
              'para mutar um campo nomeado, use --mutacao=personagem:campo:valor.',
          )
        }
        f.pacote = valor as NomePacote
        break
      }
      case '--alvo':
        if (!CHARS[valor]) {
          falhar(`--alvo: personagem desconhecido '${valor}'. Roster: ${ROSTER.map((c) => c.id).join(', ')}.`)
        }
        f.alvo = valor
        break
      case '--mutacao': {
        const m = analisarMutacao(valor)
        if (typeof m === 'string') falhar(`--mutacao: ${m}`)
        f.mutacoes.push(m)
        break
      }
      case '--risco-1b':
        f.risco1b = true
        break
      case '--json':
        f.json = true
        break
      case '--help':
      case '-h':
        console.log(USO)
        sair(0)
        break
      default:
        falhar(`flag desconhecida: ${nome}`)
    }
  }

  // --------- coerência entre as flags de mutação (§5.3: UM pacote, UM personagem, UM lado)

  /*
   * `--risco-1b` monta a própria bateria (§5.4): um controle e dois pacotes POR PERSONAGEM, todos
   * partindo da mesma seed base. Somar a isso um `--pacote`/`--mutacao` avulso colocaria na mesma
   * tabela A/B duas medições com LINHAS-BASE diferentes, e a coluna `delta` deixaria de dizer
   * contra o quê cada número foi medido. Rejeitar é a única leitura honesta.
   */
  if (f.risco1b && (f.pacote !== null || f.mutacoes.length > 0)) {
    falhar(
      '--risco-1b já roda o controle e os dois pacotes de §5.4 por personagem; somar --pacote/--mutacao ' +
        'misturaria na mesma tabela A/B linhas com controles diferentes e a coluna delta ficaria ambígua. ' +
        'Rode um por vez.',
    )
  }
  if (f.risco1b && f.alvo !== null) {
    falhar(
      `--risco-1b percorre TODOS os personagens da composição como alvo (§5.4 é uma tabela por personagem); ` +
        `--alvo='${f.alvo}' restringiria a bateria a um só e o resultado não seria a bateria que o ` +
        'indicador #1b pede. Para medir um personagem isolado use --pacote=... --alvo=...',
    )
  }

  if (f.pacote !== null && f.mutacoes.length > 0) {
    falhar(
      '--pacote e --mutacao juntos: são os dois mecanismos de §5.2 e medir os dois de uma vez ' +
        'produziria uma linha da tabela A/B que não sabe dizer de quem é o delta. Rode um por vez.',
    )
  }

  const charsMutados = [...new Set(f.mutacoes.map((m) => m.charId))]
  if (charsMutados.length > 1) {
    falhar(
      `--mutacao aponta para ${charsMutados.length} personagens (${charsMutados.join(', ')}). ` +
        'O protocolo A/B de §5.3 aplica a mutação a UM personagem de UM lado — mutar dois de uma ' +
        'vez mede a soma dos dois efeitos e o delta deixa de ser atribuível.',
    )
  }
  if (charsMutados.length === 1) {
    const alvoDaMutacao = charsMutados[0]!
    if (f.alvo !== null && f.alvo !== alvoDaMutacao) {
      falhar(`--alvo='${f.alvo}' contradiz o personagem nomeado em --mutacao ('${alvoDaMutacao}').`)
    }
    f.alvo = alvoDaMutacao
  }

  if (f.alvo !== null && f.pacote === null && f.mutacoes.length === 0) {
    falhar('--alvo sozinho não mede nada: ele diz A QUEM aplicar, e nenhum --pacote/--mutacao foi pedido.')
  }
  // Sem --alvo explícito o pacote vai no primeiro personagem da composição. É escolha arbitrária
  // e por isso o alvo aparece em COLUNA PRÓPRIA na tabela A/B — nunca implícito na saída.
  if (f.alvo === null && f.pacote !== null) f.alvo = f.comp[0] ?? null

  if (f.alvo !== null && !f.comp.includes(f.alvo)) {
    falhar(
      `--alvo='${f.alvo}' não está na composição ${`[${f.comp.join(',')}]`}. O pacote seria aplicado ` +
        'a ninguém e o protocolo A/B mediria duas composições idênticas, reportando ~50% como se ' +
        'fosse controle negativo — falha silenciosa, e é o modo de falha que §5.3 existe para evitar.',
    )
  }

  return f
}

/**
 * Parser de `personagem:campo:valor` — a BORDA onde entrada de usuário vira número que entra na
 * simulação. Devolve a `Mutacao` ou a MENSAGEM de erro (string), em vez de abortar: assim o
 * autoteste permanente exercita o caminho de recusa sem derrubar o processo.
 *
 * REL-002 (`e2.1`) / BOT-006 e BOT-007 (`e2.4`/`e2.5`), entrada obrigatória desta story: é AQUI
 * que `NaN`/`Infinity` têm de morrer. O gate de `e2.5` mediu o que acontece quando não morrem —
 * `{dmg: NaN}` em `PickSetup.itemBonus` faz "% sem ativa" saltar para 50,0% porque todo cast
 * decidido por valor esperado é suprimido (`NaN >= limiar` é `false`), e `{dmg: Infinity}` produz
 * um sinal só PARCIAL. Ou seja: o detector de kit morto não é justificativa suficiente para a
 * validação, porque ele não pega tudo (`{maxHp: NaN}` não aparece nele de forma alguma). A
 * validação tem de estar na raiz, e a raiz é esta função.
 *
 * As duas checagens são complementares, não redundantes: o formato decimal barra `abc`, `0x10` e
 * a string vazia com mensagem específica; `Number.isFinite` barra `1e400`, que PASSA no formato
 * decimal e vale `Infinity`. Remover qualquer uma das duas abre um buraco diferente.
 */
const FORMATO_VALOR = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

function analisarMutacao(bruto: string): Mutacao | string {
  const partes = bruto.split(':')
  if (partes.length !== 3) {
    return `'${bruto}' não tem a forma personagem:campo:valor (ex.: vex:dmg:+0.30).`
  }
  const charId = partes[0]!.trim()
  const campo = partes[1]!.trim()
  const valorBruto = partes[2]!.trim()

  if (!CHARS[charId]) {
    return `personagem desconhecido '${charId}'. Roster: ${ROSTER.map((c) => c.id).join(', ')}.`
  }
  if (!(STAT_KEYS as readonly string[]).includes(campo)) {
    return `campo desconhecido '${campo}'. Campos de stats.ts: ${STAT_KEYS.join(', ')}.`
  }
  if (valorBruto.length === 0 || !FORMATO_VALOR.test(valorBruto)) {
    return (
      `valor '${partes[2]}' não é um número decimal (ex.: +0.30, -0.2, 0.5). ` +
      'Um valor não numérico viraria NaN dentro de itemBonus e o bot pararia de castar em silêncio ' +
      '(BOT-006): a rodada continua rodando e a tabela sai plausível e errada.'
    )
  }
  const valor = Number(valorBruto)
  if (!Number.isFinite(valor)) {
    return (
      `valor '${partes[2]}' não é finito (Number → ${valor}). ` +
      'Bônus não finito em itemBonus propaga para stat e contamina a partida inteira sem erro.'
    )
  }
  return { charId, key: campo as StatKey, valor }
}

function inteiroPositivo(nome: string, valor: string): number {
  const n = Number(valor)
  if (!Number.isInteger(n) || n <= 0) falhar(`${nome} precisa de um inteiro positivo (recebi '${valor}').`)
  return n
}

function falhar(msg: string): never {
  console.error(`erro: ${msg}\n\n${USO}`)
  sair(1)
  throw new Error(msg)
}

function sair(codigo: number): void {
  const p = (globalThis as { process?: { exit?: (c: number) => void } }).process
  p?.exit?.(codigo)
}

// ---------------------------------------------------------------- plano de confrontos (§4.1)

interface Composicao {
  readonly rotulo: string
  readonly picks: readonly PickSetup[]
}

interface Confronto {
  readonly rotulo: string
  readonly a: Composicao
  readonly b: Composicao
  /**
   * §4.2 — espelho não é célula da matriz. Imune à troca de lado (trocar não muda nada) e mede
   * VIÉS DE LADO, não balanceamento. Vai para a seção de diagnóstico, nunca para a matriz.
   */
  readonly espelho: boolean
}

interface Plano {
  readonly gerador: string
  readonly nota: string | null
  readonly confrontos: readonly Confronto[]
}

function composicao(ids: readonly string[]): Composicao {
  return {
    rotulo: `[${ids.join(',')}]`,
    picks: ids.map((charId) => ({ charId, abilityIndex: ABILITY_INDEX, passiveIndex: PASSIVE_INDEX })),
  }
}

function confronto(a: Composicao, b: Composicao): Confronto {
  const espelho = a.rotulo === b.rotulo
  return { rotulo: `${a.rotulo} vs ${b.rotulo}`, a, b, espelho }
}

/** Gerador `espelho-ab` — o que o portão da Fase 2 precisa (§4.1/§5.3). */
function planoEspelhoAb(comp: readonly string[]): Plano {
  const c = composicao(comp)
  return { gerador: 'espelho-ab', nota: null, confrontos: [confronto(c, c)] }
}

/**
 * Gerador `pares-de-composicao` (§4.1).
 *
 * Composição legal = par de personagens DISTINTOS (o jogo é 2v2 e dupla homogênea não é
 * composição de draft — §4.1 mediu `[golem,golem]` vs `[vex,vex]` em 7,6%, degenerado).
 *   - sem `--repete-personagem`: pares de composições com personagens disjuntos → C(R,2)·C(R−2,2)/2
 *     (R=8 ⇒ **210**, o número de "todos os confrontos legais de 2v2")
 *   - com `--repete-personagem`: todos os pares de composições DISTINTAS → C(C(R,2),2)
 *     (R=8 ⇒ **378**, superconjunto do anterior)
 *
 * AC 6 da story, e a única leitura que não trava com o roster atual: as duas aritméticas dão
 * **zero** pares para R=2, enquanto §4.1 afirma que a matriz tem "uma célula, que é um espelho".
 * Emitir plano vazio seria obedecer a fórmula e desobedecer a frase. Portanto: quando existe
 * exatamente uma composição legal e nenhum par, o gerador emite a célula única de ESPELHO —
 * que a saída já rotula como diagnóstico, e não como célula de matriz.
 */
function planoParesDeComposicao(repetePersonagem: boolean): Plano {
  const ids = ROSTER.map((c) => c.id)
  const composicoes = composicoesLegais(ids)
  const pares = paresDeComposicao(ids, repetePersonagem)

  const problema = conferirAritmetica(ids.length, repetePersonagem, pares.length)
  if (problema) falhar(`pares-de-composicao: ${problema}`)

  if (pares.length === 0 && composicoes.length === 1) {
    const unica = composicao(composicoes[0]!)
    return {
      gerador: 'pares-de-composicao',
      nota:
        `roster de ${ids.length} personagens ⇒ 1 composição legal e 0 pares (a forma fechada dá 0, ` +
        'nas duas leituras). Emitida a célula única de espelho, como diagnóstico — §4.1 / AC 6. ' +
        'A matriz de winrate de RF-47 é vazia de conteúdo até o roster crescer; isso é esperado, não é bug.',
      confrontos: [confronto(unica, unica)],
    }
  }

  return {
    gerador: 'pares-de-composicao',
    nota: null,
    confrontos: pares.map(([a, b]) => confronto(composicao(a), composicao(b))),
  }
}

/** Composição legal = par de personagens DISTINTOS, na ordem canônica do roster. C(R,2) delas. */
function composicoesLegais(ids: readonly string[]): string[][] {
  const out: string[][] = []
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) out.push([ids[i]!, ids[j]!])
  }
  return out
}

/**
 * Puro sobre uma lista de ids, e não sobre `ROSTER`, de propósito: os números 210 e 378 de §4.1
 * são INVERIFICÁVEIS com o roster de hoje (2 personagens dão zero pares nas duas leituras), e
 * um gerador que só é exercitado no caso degenerado é um gerador que ninguém testou. Assim o
 * autoteste roda a enumeração real sobre um roster sintético de 8 e confere os dois números.
 */
function paresDeComposicao(ids: readonly string[], repetePersonagem: boolean): [string[], string[]][] {
  const cs = composicoesLegais(ids)
  const pares: [string[], string[]][] = []
  for (let i = 0; i < cs.length; i++) {
    for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i]!
      const b = cs[j]!
      if (!repetePersonagem && a.some((x) => b.includes(x))) continue
      pares.push([a, b])
    }
  }
  return pares
}

/**
 * Conferência da aritmética publicada em §4.1 contra o que a enumeração de fato produziu.
 * Barata, e é o que impede a tabela de 210/378 de virar folclore: no dia em que alguém mexer no
 * laço acima, a forma fechada acusa antes de a matriz sair errada.
 *   sem repetição: C(R,2)·C(R−2,2)/2   (R=8 ⇒ 210)
 *   com repetição: C(C(R,2),2)         (R=8 ⇒ 378)
 */
function conferirAritmetica(R: number, repetePersonagem: boolean, obtido: number): string | null {
  const esperado = repetePersonagem ? comb(comb(R, 2), 2) : (comb(R, 2) * comb(R - 2, 2)) / 2
  if (obtido === esperado) return null
  return (
    `enumerei ${obtido} células, a forma fechada de §4.1 diz ${esperado} para roster de ${R} ` +
    `(repete-personagem: ${repetePersonagem ? 'sim' : 'não'}).`
  )
}

/**
 * AUTOTESTE dos dois números que §4.1 publica e que o portão da Fase 5 (R-03) vai escolher entre
 * eles. Roda em toda execução pelo mesmo motivo do autoteste de veredito: custa microssegundos e
 * o erro é invisível na saída de hoje, porque com roster 2 as duas leituras dão zero.
 */
function autotestePares(): string[] {
  const problemas: string[] = []
  const oito = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']
  const semRep = paresDeComposicao(oito, false)
  const comRep = paresDeComposicao(oito, true)

  if (semRep.length !== 210) problemas.push(`  ✗ pares sem repetição, roster 8: esperado 210, obtido ${semRep.length}`)
  if (comRep.length !== 378) problemas.push(`  ✗ pares com repetição, roster 8: esperado 378, obtido ${comRep.length}`)
  for (const [R, repete] of [
    [8, false],
    [8, true],
    [2, false],
    [2, true],
  ] as const) {
    const p = conferirAritmetica(R, repete, paresDeComposicao(oito.slice(0, R), repete).length)
    if (p) problemas.push(`  ✗ ${p}`)
  }

  // §4.1: "378 · superconjunto do anterior". Se deixar de ser, uma das duas leituras mudou.
  const chave = ([a, b]: [string[], string[]]) => `${a.join(',')}|${b.join(',')}`
  const doComRep = new Set(comRep.map(chave))
  for (const p of semRep) {
    if (!doComRep.has(chave(p))) {
      problemas.push(`  ✗ pares: ${chave(p)} sai em 210 e não em 378 — 378 deixou de ser superconjunto`)
      break
    }
  }
  return problemas
}

function comb(n: number, k: number): number {
  if (k < 0 || n < k) return 0
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return Math.round(r)
}

// ---------------------------------------------------------------- instrumentação (§4.5)

interface ContadorPersonagem {
  /** pares (rodada × bola) daquele personagem — o denominador de "por rodada" */
  bolasRodada: number
  ativas: number
  ults: number
  semUlt: number
  semAtiva: number
  /** tick do 1º cast, uma entrada por bola que castou (BOT-003: kit ADIADO ≠ kit morto) */
  primeiraAtiva: number[]
  primeiraUlt: number[]
}

interface Instrumentacao {
  rodadas: number
  empates: number
  morteSubita: number
  ticks: number[]
  porChar: Map<string, ContadorPersonagem>
}

function novaInstrumentacao(): Instrumentacao {
  return { rodadas: 0, empates: 0, morteSubita: 0, ticks: [], porChar: new Map() }
}

function contador(inst: Instrumentacao, charId: string): ContadorPersonagem {
  const c = inst.porChar.get(charId)
  if (c) return c
  const novo: ContadorPersonagem = {
    bolasRodada: 0,
    ativas: 0,
    ults: 0,
    semUlt: 0,
    semAtiva: 0,
    primeiraAtiva: [],
    primeiraUlt: [],
  }
  inst.porChar.set(charId, novo)
  return novo
}

interface RegistroBola {
  charId: string
  ativas: number
  ults: number
  primeiraAtivaTick: number
  primeiraUltTick: number
}

/**
 * Contagem por rodada. É observação PURA: o driver instrumentado devolve exatamente os mesmos
 * comandos que `heuristicDriver` de `determinism.ts` devolveria, na mesma ordem — a mesma forma
 * do driver-gravador que o teste de replay já usa. Se anotar mudasse a partida, a matriz estaria
 * medindo uma rodada que não é a que roda no jogo.
 */
interface RegistroRodada {
  bolas: Map<number, RegistroBola>
}

/**
 * §4.5 + BOT-003 (gate de `e2.3`). "Casts por rodada" e "% de rodadas sem ult" respondem
 * "o kit saiu?"; não respondem "o kit saiu TARDE?". A Lâmina Fantasma do Vex é o caso concreto
 * que o gate levantou — kit adiado, não kit morto — e um contador binário o esconderia atrás de
 * uma média perfeitamente saudável. Por isso a mediana do tick do PRIMEIRO cast entra junto.
 *
 * BOT-006 (gate de `e2.4`) cai no mesmo instrumento e foi conferido: um `hp = NaN` num inimigo
 * suprime todo cast decidido por VE daquela bola (a correção de BOT-001 fecha o limiar no
 * sentido positivo, então `NaN >= limiar` é `false` e o slot nunca casta). Os slots afetados são
 * exatamente os de `kind` burst/raio/dash — `sismico`, `tremor`, `lamina`, `convergencia` — e
 * ficam com 0 casts, enquanto `muralha` (utilidade) e `deslize` (reposicao) continuam saindo.
 * "% sem ativa" existe ao lado de "% sem ult" justamente por isso: o Golem tem ult de utilidade,
 * então só a coluna de ativa denunciaria o caso dele. A tabela é o detector; nenhuma correção
 * extra é necessária aqui.
 */
function anotar(reg: RegistroRodada, view: WorldView, ballId: number, slot: 'ability' | 'ult'): void {
  const r = reg.bolas.get(ballId)
  if (!r) return
  if (slot === 'ult') {
    if (r.ults === 0) r.primeiraUltTick = view.tick
    r.ults++
  } else {
    if (r.ativas === 0) r.primeiraAtivaTick = view.tick
    r.ativas++
  }
}

function fechar(inst: Instrumentacao, reg: RegistroRodada, ticks: number, empate: boolean): void {
  inst.rodadas++
  inst.ticks.push(ticks)
  if (empate) inst.empates++
  if (ticks * TICK_MS >= SUDDEN_DEATH_MS) inst.morteSubita++

  for (const r of reg.bolas.values()) {
    const c = contador(inst, r.charId)
    c.bolasRodada++
    c.ativas += r.ativas
    c.ults += r.ults
    if (r.ults === 0) c.semUlt++
    else c.primeiraUlt.push(r.primeiraUltTick)
    if (r.ativas === 0) c.semAtiva++
    else c.primeiraAtiva.push(r.primeiraAtivaTick)
  }
}

// ------------------------- contadores de clamp (§7.3) e de margem de tunelamento (§7.4) · e2.8

/**
 * CONTADORES DE OBSERVAÇÃO — `docs/architecture.md` §7.3 e §7.4, passo 8 de
 * `docs/architecture-e2.md` §7.
 *
 * São **recomendação de arquitetura registrada, não requisito de RF**: não bloqueiam nenhum
 * critério P2.1-P2.5 do portão da Fase 2. O que eles resolvem é outra coisa, e §7.3 é explícita —
 * os tetos de `sim/stats.ts` são números que o arquiteto argumentou e não mediu, enquanto a decisão
 * #13 diz que balanceamento é medição. Um contador por campo transforma o teto em hipótese
 * falseável: nunca morde = rede de segurança barata; morde às vezes = funcionando; morde sempre =
 * virou regra de jogo por acidente, e volta ao usuário como decisão de produto.
 *
 * A contagem mora em `sim/` (é lá que o clamp corta e que o `integrate` roda) e é DESLIGADA por
 * padrão. Este arquivo é o único que liga — por CONTEXTO DE MEDIÇÃO, que é o que o AC 6 pede: um
 * contador cumulativo somaria confrontos diferentes num único número, que não descreve nenhum
 * deles. Contexto aqui é uma célula do plano ou uma linha do protocolo A/B.
 *
 * Nada disto entra em decisão de simulação: o golden hash de `sim:check` é a prova (AC 1 / AC 5).
 */
const TABELAS_CLAMP = ['ΣMIN', 'ΣMAX', 'ABS_MIN', 'ABS_MAX'] as const
type TabelaClamp = (typeof TABELAS_CLAMP)[number]

function mapaDaTabela(t: TabelaClamp): Partial<Record<StatKey, number>> {
  switch (t) {
    case 'ΣMIN':
      return CLAMP_COUNTERS.sigmaMin
    case 'ΣMAX':
      return CLAMP_COUNTERS.sigmaMax
    case 'ABS_MIN':
      return CLAMP_COUNTERS.absMin
    case 'ABS_MAX':
      return CLAMP_COUNTERS.absMax
  }
}

interface Mordida {
  tabela: TabelaClamp
  campo: StatKey
  vezes: number
}

interface ContagemContexto {
  rotulo: string
  /** chamadas de `recomputeStats` no contexto — o denominador da leitura de §7.3 */
  chamadas: number
  /** só os contadores que registraram mordida — o que a tabela do console destaca */
  mordidas: Mordida[]
  /** TODOS os contadores declarados, inclusive os zerados — o `--json` não resume nada */
  porCampo: Mordida[]
  tunelamento: { registros: number; amostras: number }
}

const contagens: ContagemContexto[] = []

/**
 * Liga os contadores, roda o contexto, guarda o retrato e desliga.
 *
 * Desligar no fim não é zelo decorativo: se um caminho futuro rodar simulação fora de `medir`
 * (um autoteste novo, um diagnóstico), essas rodadas não entram na contagem de NINGUÉM — que é o
 * comportamento correto — em vez de entrarem na contagem do último contexto medido, que seria
 * exatamente a contaminação entre confrontos que o AC 6 proíbe.
 */
function medir<T>(rotulo: string, f: () => T): T {
  resetClampCounters(true)
  resetTunnelingCounter(true)

  const r = f()

  const porCampo: Mordida[] = []
  for (const tabela of TABELAS_CLAMP) {
    const mapa = mapaDaTabela(tabela)
    for (const campo of STAT_KEYS) {
      const vezes = mapa[campo]
      // ausente = campo SEM aquele teto declarado (`dmg` não tem clamp absoluto; `atkSpeed`,
      // `cdSpeed` e `range` têm teto no ponto de consumo). Imprimir 0 ali leria como "nunca
      // mordeu" quando a verdade é "não existe teto para morder" — as duas coisas são diferentes.
      if (vezes === undefined) continue
      porCampo.push({ tabela, campo, vezes })
    }
  }
  contagens.push({
    rotulo,
    chamadas: CLAMP_COUNTERS.calls,
    mordidas: porCampo.filter((m) => m.vezes > 0),
    porCampo,
    tunelamento: { registros: TUNNELING_COUNTER.hits, amostras: TUNNELING_COUNTER.samples },
  })

  resetClampCounters(false)
  resetTunnelingCounter(false)
  return r
}

/** Base folgada dentro de TODOS os `ABS_MIN`/`ABS_MAX` — assim só o campo sob teste pode morder. */
function baseFolgada(): StatBlock {
  const s = makeStatBlock(1)
  s.maxHp = 100
  s.radius = 20
  s.mass = 1
  s.maxSpeed = 200
  s.steer = 3
  s.drag = 0.3
  s.restBall = 0.5
  s.restWall = 0.5
  return s
}

/** `recomputeStats` lê `base`/`bonusPassive`/`bonusItem` e escreve `stat`; o resto da `Ball` não. */
function bolaSintetica(campo: StatKey, base: number, bonusItem: number): Ball {
  const b = {
    base: baseFolgada(),
    bonusPassive: makeStatBlock(0),
    bonusItem: makeStatBlock(0),
    stat: makeStatBlock(0),
  }
  b.base[campo] = base
  b.bonusItem[campo] = bonusItem
  return b as unknown as Ball
}

function totalMordidas(): number {
  let t = 0
  for (const tabela of TABELAS_CLAMP) {
    const mapa = mapaDaTabela(tabela)
    for (const campo of STAT_KEYS) t += mapa[campo] ?? 0
  }
  return t
}

function mordidasDe(tabela: TabelaClamp, campo: StatKey): number {
  return mapaDaTabela(tabela)[campo] ?? 0
}

/**
 * AUTOTESTE dos contadores de §7.3/§7.4. Roda em toda execução pelo mesmo motivo dos outros: com o
 * roster e os pacotes de hoje **nenhum clamp morde e nenhum tick passa da margem de tunelamento**,
 * então a saída verdadeira é uma fila de zeros — e um contador quebrado, morto ou nunca ligado
 * produz exatamente a mesma fila de zeros. É o modo de falha da morte súbita de §4.5, de novo.
 *
 * O que cada bloco pega, e por que é justamente isso:
 *   - "mordida" é o valor bruto ter sido CORTADO, não o campo ter sido calculado — trocar a
 *     condição pelo contador de chamadas dá um número enorme e plausível;
 *   - a borda é ESTRITA nos dois sentidos: um bônus exatamente em `ΣMAX` não é cortado e não conta;
 *   - `ΣMIN`/`ΣMAX` e `ABS_MIN`/`ABS_MAX` são contadores SEPARADOS, sobre valores diferentes (a
 *     soma dos bônus e o stat derivado) — os dois casos abaixo mordem um sem o outro;
 *   - contador existe só para campo com AQUELE teto declarado (os quatro mapas não são simétricos);
 *   - desligado não conta nada, que é a metade verificável do golden hash idêntico;
 *   - o limite de §7.4 é a menor SOMA de raios do mundo, não o dobro do menor raio, e bola morta
 *     não entra nem no limite nem no denominador.
 */
function autotesteContadores(): string[] {
  const problemas: string[] = []
  const conferir = (rotulo: string, ok: boolean, detalhe: string): void => {
    if (!ok) problemas.push(`  ✗ contadores (§7.3/§7.4) — ${rotulo}: ${detalhe}`)
  }

  // (1) desligado não conta — é o que garante que em jogo/`sim:check` o caminho é o de antes
  resetClampCounters(false)
  recomputeStats(bolaSintetica('dmg', 1, 1.5))
  conferir(
    '(1) desligado não conta',
    CLAMP_COUNTERS.calls === 0 && totalMordidas() === 0,
    `calls ${CLAMP_COUNTERS.calls} · mordidas ${totalMordidas()}`,
  )

  // (2) MORDIDA, não CHAMADA: três recálculos com bônus folgado não são três mordidas
  resetClampCounters(true)
  for (let i = 0; i < 3; i++) recomputeStats(bolaSintetica('dmg', 1, 0.5))
  conferir(
    '(2) mordida != chamada',
    CLAMP_COUNTERS.calls === 3 && totalMordidas() === 0,
    `calls ${CLAMP_COUNTERS.calls} · mordidas ${totalMordidas()} — +0.50 está dentro de ΣMAX.dmg ${SIGMA_MAX.dmg}`,
  )

  // (3) ΣMAX morde, e só ele — §5.1: "um +150% seria silenciosamente reduzido para +100%"
  resetClampCounters(true)
  recomputeStats(bolaSintetica('dmg', 1, 1.5))
  conferir(
    '(3) ΣMAX dmg',
    mordidasDe('ΣMAX', 'dmg') === 1 && totalMordidas() === 1,
    `ΣMAX.dmg ${mordidasDe('ΣMAX', 'dmg')} · total ${totalMordidas()}`,
  )

  // (4) ΣMIN morde no outro sentido
  resetClampCounters(true)
  recomputeStats(bolaSintetica('dmg', 1, -0.9))
  conferir(
    '(4) ΣMIN dmg',
    mordidasDe('ΣMIN', 'dmg') === 1 && totalMordidas() === 1,
    `ΣMIN.dmg ${mordidasDe('ΣMIN', 'dmg')} · total ${totalMordidas()}`,
  )

  // (5) borda estrita: exatamente NO teto não é corte, e contar ali inflaria todo campo cujo
  // bônus encoste no limite sem ser reduzido
  resetClampCounters(true)
  recomputeStats(bolaSintetica('dmg', 1, SIGMA_MAX.dmg))
  recomputeStats(bolaSintetica('dmg', 1, SIGMA_MIN.dmg))
  conferir(
    '(5) borda não morde',
    CLAMP_COUNTERS.calls === 2 && totalMordidas() === 0,
    `calls ${CLAMP_COUNTERS.calls} · mordidas ${totalMordidas()} — ΣMAX ${SIGMA_MAX.dmg} / ΣMIN ${SIGMA_MIN.dmg} exatos`,
  )

  // (6) ABS_MAX é outro contador: maxSpeed 400 × (1 + 0.50) = 600 > 420, com o Σ folgado (+0.50
  // cabe em ΣMAX.maxSpeed +0.60). Se os dois compartilhassem contador, o Σ apareceria mordendo.
  resetClampCounters(true)
  recomputeStats(bolaSintetica('maxSpeed', 400, 0.5))
  conferir(
    '(6) ABS_MAX maxSpeed',
    mordidasDe('ABS_MAX', 'maxSpeed') === 1 && mordidasDe('ΣMAX', 'maxSpeed') === 0 && totalMordidas() === 1,
    `ABS_MAX ${mordidasDe('ABS_MAX', 'maxSpeed')} · ΣMAX ${mordidasDe('ΣMAX', 'maxSpeed')} · total ${totalMordidas()}`,
  )

  // (7) ABS_MIN, com o Σ EXATAMENTE na borda: maxHp 30 × (1 − 0.50) = 15 < ABS_MIN.maxHp 20
  resetClampCounters(true)
  recomputeStats(bolaSintetica('maxHp', 30, SIGMA_MIN.maxHp))
  conferir(
    '(7) ABS_MIN maxHp',
    mordidasDe('ABS_MIN', 'maxHp') === 1 && mordidasDe('ΣMIN', 'maxHp') === 0 && totalMordidas() === 1,
    `ABS_MIN ${mordidasDe('ABS_MIN', 'maxHp')} · ΣMIN ${mordidasDe('ΣMIN', 'maxHp')} · total ${totalMordidas()}`,
  )

  // (8) um contador por campo QUE TEM AQUELE TETO — os quatro mapas não são simétricos
  resetClampCounters(true)
  const nSigma = Object.keys(CLAMP_COUNTERS.sigmaMin).length
  const nSigmaMax = Object.keys(CLAMP_COUNTERS.sigmaMax).length
  const nAbsMin = Object.keys(CLAMP_COUNTERS.absMin).length
  const nAbsMax = Object.keys(CLAMP_COUNTERS.absMax).length
  conferir(
    '(8) ΣMIN/ΣMAX cobrem STAT_KEYS',
    nSigma === STAT_KEYS.length && nSigmaMax === STAT_KEYS.length,
    `ΣMIN ${nSigma} · ΣMAX ${nSigmaMax} != ${STAT_KEYS.length}`,
  )
  conferir(
    '(8) ABS_* é subconjunto',
    nAbsMin < STAT_KEYS.length && nAbsMax < STAT_KEYS.length && nAbsMax <= nAbsMin,
    `ABS_MIN ${nAbsMin} · ABS_MAX ${nAbsMax} · STAT_KEYS ${STAT_KEYS.length}`,
  )
  conferir(
    '(8) dmg não tem clamp absoluto',
    CLAMP_COUNTERS.absMin.dmg === undefined && CLAMP_COUNTERS.absMax.dmg === undefined,
    'existe contador ABS para dmg — um 0 ali leria como "nunca mordeu", e o teto não existe',
  )

  // (9) reset zera de verdade (AC 6)
  resetClampCounters(true)
  recomputeStats(bolaSintetica('dmg', 1, 1.5))
  resetClampCounters(true)
  conferir(
    '(9) reset zera',
    CLAMP_COUNTERS.calls === 0 && totalMordidas() === 0,
    `calls ${CLAMP_COUNTERS.calls} · mordidas ${totalMordidas()} — sem reset a contagem de um confronto vaza para o próximo`,
  )

  // ---------------- §7.4 · margem de tunelamento
  //
  // `dt = 0.5` e `drag = 1` de propósito: `pow(1, dt) = 1`, então `sp` sai exatamente igual a `v` e
  // a borda do limite vira verificável em binário (com dt = 1/60 o produto tem erro de float e o
  // ensaio de borda passaria ou falharia por arredondamento, não pelo comparador).
  const mundo = (bolas: readonly { r: number; viva: boolean }[], v: number): World =>
    ({
      dt: 0.5,
      balls: bolas.map((b, i) => {
        const stat = baseFolgada()
        stat.radius = b.r
        stat.drag = 1
        return { id: i, alive: b.viva, x: 0, y: 0, vx: v, vy: 0, ax: 0, ay: 0, facing: 0, stat }
      }),
    }) as unknown as World

  const rodarTunel = (bolas: readonly { r: number; viva: boolean }[], v: number): { hits: number; samples: number } => {
    resetTunnelingCounter(true)
    integrate(mundo(bolas, v))
    return { hits: TUNNELING_COUNTER.hits, samples: TUNNELING_COUNTER.samples }
  }

  // duas de raio 10 ⇒ limite = 0.5 × (2 × (10 + 10)) = 20 px por tick
  const duas = [{ r: 10, viva: true }, { r: 10, viva: true }] as const

  const naBorda = rodarTunel(duas, 40) // 40 × 0.5 = 20, e `20 > 20` é falso
  conferir(
    '(10) borda não registra',
    naBorda.hits === 0 && naBorda.samples === 2,
    `hits ${naBorda.hits} · samples ${naBorda.samples} — o comparador de §7.4 é estrito (maior que, não maior ou igual)`,
  )

  const acima = rodarTunel(duas, 41) // 20.5 > 20, nas duas bolas
  conferir(
    '(11) acima registra',
    acima.hits === 2 && acima.samples === 2,
    `hits ${acima.hits} · samples ${acima.samples}`,
  )

  // (12) menor SOMA de raios, não o dobro do menor raio: [10,30,30] ⇒ 10+30 = 40, limite 40.
  // Um `2 × menor` daria 20 e este ensaio (30 px por tick) registraria três vezes.
  const mistos = [{ r: 10, viva: true }, { r: 30, viva: true }, { r: 30, viva: true }] as const
  const soma = rodarTunel(mistos, 60)
  conferir(
    '(12) menor SOMA de raios',
    soma.hits === 0 && soma.samples === 3,
    `hits ${soma.hits} · samples ${soma.samples} — 60 × 0.5 = 30 passa de 2×10 mas não de 10+30`,
  )

  // (13) bola morta não entra nem no limite nem no denominador: com a de raio 1 contando, o limite
  // cairia para 0.5 × (2 × (1 + 10)) = 11 e os 15 px deste ensaio registrariam
  const comMorta = rodarTunel([{ r: 10, viva: true }, { r: 10, viva: true }, { r: 1, viva: false }], 30)
  conferir(
    '(13) bola morta fora',
    comMorta.hits === 0 && comMorta.samples === 2,
    `hits ${comMorta.hits} · samples ${comMorta.samples}`,
  )

  // (14) uma viva só: não existe par, não existe tunelamento possível, não existe observação
  const sozinha = rodarTunel([{ r: 10, viva: true }, { r: 10, viva: false }], 100000)
  conferir(
    '(14) sem par não observa',
    sozinha.hits === 0 && sozinha.samples === 0,
    `hits ${sozinha.hits} · samples ${sozinha.samples} — amostra sem par diluiria o denominador`,
  )

  // (15) desligado não observa — a outra metade da garantia de custo zero em jogo
  resetTunnelingCounter(false)
  integrate(mundo(duas, 100000))
  conferir(
    '(15) desligado não observa',
    TUNNELING_COUNTER.hits === 0 && TUNNELING_COUNTER.samples === 0,
    `hits ${TUNNELING_COUNTER.hits} · samples ${TUNNELING_COUNTER.samples}`,
  )

  // o autoteste não pode deixar o interruptor ligado: a primeira medição de verdade recomeça do
  // zero por `medir`, mas até lá ninguém deve estar contando.
  resetClampCounters(false)
  resetTunnelingCounter(false)
  return problemas
}

// ---------------------------------------------------------------- execução (§4.2, §4.3)

interface ResultadoRodada {
  vencedor: number
  ticks: number
}

/**
 * Uma partida com o bot heurístico dos dois lados (RF-45: o MESMO bot, o MESMO preset).
 * A fábrica cria o estado por time uma vez por partida, com a seed da partida — é para isto que
 * `RoundDriver` é fábrica (`harness.ts`). A ordem de concatenação (time 0 e depois time 1) é a
 * mesma de `determinism.ts` e é CONTRATO (§3.2): trocá-la muda o hash de toda partida.
 */
function rodarUma(setup: RoundSetup, inst: Instrumentacao): ResultadoRodada {
  const reg: RegistroRodada = { bolas: new Map() }
  const driver: RoundDriver = (s) => {
    const b0 = createBot(s.seed, 0, PRESET)
    const b1 = createBot(s.seed, 1, PRESET)
    return (view) => {
      if (reg.bolas.size === 0) {
        for (const b of view.balls) {
          reg.bolas.set(b.id, {
            charId: b.charId,
            ativas: 0,
            ults: 0,
            primeiraAtivaTick: -1,
            primeiraUltTick: -1,
          })
        }
      }
      const cmds = [...botCommands(view, b0), ...botCommands(view, b1)]
      for (const c of cmds) anotar(reg, view, c.ballId, c.slot)
      return cmds
    }
  }

  const r = runRound(CHARS, setup, driver)
  fechar(inst, reg, r.ticks, r.winner === -1)
  return { vencedor: r.winner, ticks: r.ticks }
}

interface Fase {
  vitorias: number
  decididas: number
  seedsGastas: number
  proximaSeed: number
  truncada: boolean
}

/**
 * O executor de uma rodada, injetável. O padrão é `rodarUma` (a partida de verdade); o autoteste
 * de troca de lado passa um substituto com vencedor roteirizado.
 *
 * Não é indireção decorativa: com o roster atual (2 personagens) NÃO EXISTE confronto que não
 * seja espelho, então o ramo de troca de lado — que é o AC 7 inteiro e a consequência direta do
 * viés de 73pp medido em §1.2 — não roda uma única vez em nenhuma invocação real do CLI. Um
 * caminho crítico que só será exercitado quando o roster crescer na Fase 5 é um caminho que
 * ninguém testou, e o modo de falha (contar a vitória do lado errado numa das metades) produz
 * uma matriz plausível e errada.
 */
type Rodada = (setup: RoundSetup, inst: Instrumentacao) => ResultadoRodada

/**
 * Uma metade da troca de lado: roda seeds em ORDEM CRESCENTE até juntar `alvoDec` rodadas
 * DECIDIDAS (§4.3 — empate é rodada nula por D-02 e não entra no denominador), com teto de
 * seeds. `ladoDeA` diz em que time a composição de interesse entra nesta metade.
 */
function rodarFase(
  conf: Confronto,
  ladoDeA: 0 | 1,
  alvoDec: number,
  seedInicial: number,
  inst: Instrumentacao,
  rodada: Rodada = rodarUma,
): Fase {
  const teams: [readonly PickSetup[], readonly PickSetup[]] =
    ladoDeA === 0 ? [conf.a.picks, conf.b.picks] : [conf.b.picks, conf.a.picks]

  const teto = alvoDec * TETO_SEEDS_POR_DECIDIDA
  let vitorias = 0
  let decididas = 0
  let gastas = 0
  let seed = seedInicial

  while (decididas < alvoDec && gastas < teto) {
    const setup: RoundSetup = { seed, teams: [[...teams[0]], [...teams[1]]] }
    const r = rodada(setup, inst)
    gastas++
    seed++
    if (r.vencedor === -1) continue
    decididas++
    if (r.vencedor === ladoDeA) vitorias++
  }

  return { vitorias, decididas, seedsGastas: gastas, proximaSeed: seed, truncada: decididas < alvoDec }
}

type Veredito = 'dentro' | 'fora' | 'inconclusivo'

interface ResultadoConfronto {
  confronto: Confronto
  nDec: number
  nSeeds: number
  vitorias: number
  winrate: number
  /** meia-largura do IC 95%, em pontos percentuais */
  icPp: number
  veredito: Veredito
  truncado: boolean
}

/**
 * §4.2, literal:
 *
 *     seeds  1 .. n/2   → teams: [C0, C1]
 *     seeds n/2+1 .. n  → teams: [C1, C0]
 *     winrate(C0) = (vitórias de C0 como time 0 + vitórias de C0 como time 1) / decididas
 *
 * A adaptação obrigatória — e é adaptação de FORMA, não de conteúdo — é que "n/2" aqui conta
 * DECIDIDAS, não seeds (§4.3): não dá para saber de antemão quantas seeds produzem n/2
 * decididas. As duas metades param cada uma em `ceil(n/2)` decididas, e as seeds continuam
 * sendo consumidas em ordem crescente, a segunda metade retomando onde a primeira parou. Isso
 * dá metades EXATAMENTE iguais em n, que é a condição para o viés de lado cancelar em primeira
 * ordem, e mantém `n_dec` ≥ `n` (RF-48 pede piso).
 *
 * ESPELHO (§4.2): uma composição contra ela mesma é imune à troca de lado — trocar não muda
 * nada — então roda numa metade só, e o número reportado é a vitória do TIME 0, que é a medida
 * corrente do viés de lado. Não é célula de matriz e não se espera 50%.
 */
function rodarConfronto(
  conf: Confronto,
  n: number,
  seedBase: number,
  inst: Instrumentacao,
  rodada: Rodada = rodarUma,
): ResultadoConfronto {
  let vitorias = 0
  let nDec = 0
  let nSeeds = 0
  let truncado = false

  if (conf.espelho) {
    const f = rodarFase(conf, 0, n, seedBase, inst, rodada)
    vitorias = f.vitorias
    nDec = f.decididas
    nSeeds = f.seedsGastas
    truncado = f.truncada
  } else {
    const metade = Math.ceil(n / 2)
    const f0 = rodarFase(conf, 0, metade, seedBase, inst, rodada)
    const f1 = rodarFase(conf, 1, metade, f0.proximaSeed, inst, rodada)
    vitorias = f0.vitorias + f1.vitorias
    nDec = f0.decididas + f1.decididas
    nSeeds = f0.seedsGastas + f1.seedsGastas
    truncado = f0.truncada || f1.truncada
  }

  const winrate = nDec > 0 ? vitorias / nDec : 0
  return {
    confronto: conf,
    nDec,
    nSeeds,
    vitorias,
    winrate,
    icPp: icPp(nDec),
    veredito: vereditoDe(winrate, nDec),
    truncado,
  }
}

/**
 * AUTOTESTE da troca de lado (AC 7) e do n efetivo (AC 9), com a partida substituída por um
 * vencedor roteirizado. O que se prova aqui é contabilidade, não física — e é a contabilidade
 * que §4.2 e §4.3 especificam:
 *
 *   (1) um viés de lado PURO (time 0 sempre vence) sai 50,00% depois da troca — é a frase
 *       "o viés de lado cancela em primeira ordem" virada em teste;
 *   (2) uma vantagem de COMPOSIÇÃO pura (um personagem sempre vence) sai 100%, dos dois lados —
 *       prova que a vitória é atribuída à composição e não ao índice do time;
 *   (3) empate não entra no denominador mas CONSOME seed (D-02 / §4.3): n_dec e n_seeds diferem
 *       pelo número exato de empates;
 *   (4) espelho roda numa metade só e NÃO cancela — se ele passasse pela troca, o viés de lado
 *       de 73pp medido em §1.2 sairia como 50% e o diagnóstico morreria em silêncio;
 *   (5) seeds consumidas em ordem crescente e contígua a partir da base, a segunda metade
 *       retomando onde a primeira parou (§4.3: "determinístico e reprodutível").
 */
function autotesteTrocaDeLado(): string[] {
  const problemas: string[] = []
  const A = composicao(['golem'])
  const B = composicao(['vex'])
  const duelo = confronto(A, B)
  const espelho = confronto(A, A)

  function ensaio(
    conf: Confronto,
    n: number,
    seedBase: number,
    regra: (setup: RoundSetup, i: number) => number,
  ): { res: ResultadoConfronto; seeds: number[] } {
    const seeds: number[] = []
    let i = 0
    const stub: Rodada = (setup) => {
      seeds.push(setup.seed)
      return { vencedor: regra(setup, i++), ticks: 600 }
    }
    return { res: rodarConfronto(conf, n, seedBase, novaInstrumentacao(), stub), seeds }
  }

  const conferir = (rotulo: string, ok: boolean, detalhe: string): void => {
    if (!ok) problemas.push(`  ✗ troca de lado — ${rotulo}: ${detalhe}`)
  }
  const contiguas = (seeds: readonly number[], base: number): boolean => seeds.every((s, k) => s === base + k)

  // (1) viés de lado puro
  const t1 = ensaio(duelo, 10, 1, () => 0)
  conferir('(1) viés puro', t1.res.winrate === 0.5, `winrate ${t1.res.winrate} != 0.5 — o viés de lado não cancelou`)
  conferir('(1) n_dec', t1.res.nDec === 10, `n_dec ${t1.res.nDec} != 10`)
  conferir('(1) seeds', contiguas(t1.seeds, 1) && t1.seeds.length === 10, `seeds ${t1.seeds.join(',')}`)

  // (2) vantagem de composição pura: o golem vence esteja ele em que time estiver
  const golemVence = (s: RoundSetup): number => (s.teams[0][0]?.charId === 'golem' ? 0 : 1)
  const t2 = ensaio(duelo, 10, 1, golemVence)
  conferir('(2) composição vence', t2.res.winrate === 1, `winrate ${t2.res.winrate} != 1 — metade das vitórias foi para o lado errado`)

  // (3) empate é nulo no denominador e gasto no numerador de seeds
  const t3 = ensaio(duelo, 10, 1, (_s, i) => (i % 3 === 0 ? -1 : 0))
  conferir('(3) n_dec com empate', t3.res.nDec === 10, `n_dec ${t3.res.nDec} != 10 — empate entrou no denominador`)
  conferir('(3) n_seeds com empate', t3.res.nSeeds === 15, `n_seeds ${t3.res.nSeeds} != 15`)
  conferir('(3) seeds', contiguas(t3.seeds, 1), `seeds não contíguas: ${t3.seeds.join(',')}`)

  /*
   * (3b) QA-E25-001 (gate de `e2.5`, entrada obrigatória desta story). O IC que vai para a tabela
   * tem de ser calculado sobre as DECIDIDAS, nunca sobre as seeds. O gate perturbou `icPp(nDec)`
   * para `icPp(nSeeds)` em `rodarConfronto` e as 14 asserções de então passaram — porque o
   * autoteste de veredito chama `vereditoDe(w, n)` direto e nunca através de `rodarConfronto`, de
   * forma que o par (winrate, n) que de fato é impresso nunca era conferido.
   *
   * O erro subestima o IC, que é a direção que transforma `? inconclusivo` em `✓ dentro`: a
   * aprovação falsa que o 3º estado existe para impedir. E §8.7 diz que a força da mutação muda a
   * taxa de empate — que é exatamente a variável que separa `n_dec` de `n_seeds`. Esta story
   * introduz a mutação, então a fiação passa a ser exercitada de verdade.
   *
   * O ensaio (3) já produz o estado discriminante (n_dec 10, n_seeds 15): a segunda metade da
   * asserção é o que impede a guarda de passar por coincidência quando não houver empate nenhum.
   */
  conferir(
    '(3b) IC sobre decididas',
    t3.res.icPp === icPp(t3.res.nDec) && icPp(t3.res.nDec) !== icPp(t3.res.nSeeds),
    `icPp ${t3.res.icPp} · icPp(n_dec ${t3.res.nDec}) ${icPp(t3.res.nDec)} · icPp(n_seeds ${t3.res.nSeeds}) ${icPp(t3.res.nSeeds)} — ` +
      'RF-48 e §4.3 são sobre decididas; o IC calculado sobre seeds é otimista e aprova o que não deveria',
  )
  conferir(
    '(3b) veredito sobre decididas',
    t3.res.veredito === vereditoDe(t3.res.winrate, t3.res.nDec),
    `veredito '${t3.res.veredito}' != vereditoDe(${t3.res.winrate}, ${t3.res.nDec})`,
  )

  // (4) espelho é imune à troca — reporta o viés bruto
  const t4 = ensaio(espelho, 7, 40, () => 0)
  conferir('(4) espelho', t4.res.winrate === 1, `winrate ${t4.res.winrate} != 1 — o espelho passou pela troca de lado e cancelou o viés`)
  conferir('(4) espelho n_dec', t4.res.nDec === 7 && t4.res.nSeeds === 7, `n_dec ${t4.res.nDec} · n_seeds ${t4.res.nSeeds}`)
  conferir('(4) espelho seeds', contiguas(t4.seeds, 40), `seeds ${t4.seeds.join(',')}`)

  // (5) n ímpar: as metades ficam iguais e n_dec vira piso, nunca teto (RF-48)
  const t5 = ensaio(duelo, 7, 1, () => 0)
  conferir('(5) n ímpar', t5.res.nDec === 8, `n_dec ${t5.res.nDec} != 8 — metades desiguais quebram o cancelamento`)
  conferir('(5) n ímpar winrate', t5.res.winrate === 0.5, `winrate ${t5.res.winrate} != 0.5`)

  /*
   * (6) QA-E25-002 (gate de `e2.5`, entrada obrigatória desta story): o TETO de seeds. O gate
   * removeu `gastas < teto` da condição de `rodarFase` e tudo passou, porque com o roster e o bot
   * de hoje o teto nunca é alcançado. Esta story é a que muda isso: §8.7 registra que a força da
   * mutação interage com a taxa de empate, e uma mutação que empurre a rodada para o empate é
   * exatamente o cenário em que o teto começa a valer. Um CLI que gira para sempre sem diagnóstico
   * é o mesmo modo de falha que o gate de `e2.0` registrou para `runRound` sem `!world.over`.
   */
  const t6 = ensaio(duelo, 10, 1, () => -1)
  const seedsEsperadas = 2 * Math.ceil(10 / 2) * TETO_SEEDS_POR_DECIDIDA
  conferir('(6) teto: truncado', t6.res.truncado, 'todas as rodadas empataram e o CLI não marcou truncado')
  conferir('(6) teto: n_dec', t6.res.nDec === 0, `n_dec ${t6.res.nDec} != 0`)
  conferir(
    '(6) teto: n_seeds',
    t6.res.nSeeds === seedsEsperadas,
    `n_seeds ${t6.res.nSeeds} != ${seedsEsperadas} (2 metades × ceil(n/2) × ${TETO_SEEDS_POR_DECIDIDA}) — ` +
      'sem o teto, este ensaio não terminaria',
  )
  conferir('(6) teto: veredito', t6.res.veredito === 'inconclusivo', `veredito '${t6.res.veredito}' com n_dec 0`)

  return problemas
}

/**
 * AUTOTESTE da instrumentação de §4.5 — QA-E25-006 (gate de `e2.5`, entrada obrigatória desta
 * story). Quatro contadores que passavam sem nenhuma guarda permanente, e o gate os fechou por
 * fora (reimplementação independente + canário de limiar) sem que nada disso ficasse no
 * repositório. São os números que alimentam D-02, o Risco #6 e o detector de viés de competência
 * de §8.3 — e o mais insidioso é a morte súbita, porque o valor verdadeiro HOJE é 0,0% e um
 * contador morto também reporta 0,0%.
 *
 * Três rodadas sintéticas, com valores escritos à mão. O que cada asserção pega:
 *   - denominador de "por rodada" é (rodada × bola) e não rodada: o golem entra com DUAS bolas
 *     por rodada, então trocar o denominador dobra o número;
 *   - "1º cast" é o PRIMEIRO e não o último: `anotar` é chamado duas vezes, ticks 60 e 200;
 *   - morte súbita compara contra `SUDDEN_DEATH_MS` e é `>=`: uma rodada exatamente no limiar
 *     conta, uma tick abaixo não conta — pega tanto o contador zerado quanto o `>` no lugar do `>=`;
 *   - empate não entra no denominador de decididas mas entra em `rodadas`;
 *   - mediana é mediana e não média (`mediana([1,2,3,4])` = 3, a média seria 2,5).
 */
function autotesteFechar(): string[] {
  const problemas: string[] = []
  const conferir = (rotulo: string, ok: boolean, detalhe: string): void => {
    if (!ok) problemas.push(`  ✗ instrumentação (§4.5) — ${rotulo}: ${detalhe}`)
  }

  const noLimiar = Math.ceil(SUDDEN_DEATH_MS / TICK_MS)
  const inst = novaInstrumentacao()

  // Duas bolas de golem e uma de vex por rodada — o que discrimina o denominador.
  const rodada = (ticks: number, empate: boolean, casts: { id: number; charId: string; ativas: number[]; ults: number[] }[]): void => {
    const reg: RegistroRodada = { bolas: new Map() }
    for (const b of casts) {
      reg.bolas.set(b.id, { charId: b.charId, ativas: 0, ults: 0, primeiraAtivaTick: -1, primeiraUltTick: -1 })
    }
    for (const b of casts) {
      // `anotar` lê exclusivamente `view.tick`; o resto do `WorldView` não é tocado.
      for (const t of b.ativas) anotar(reg, { tick: t } as unknown as WorldView, b.id, 'ability')
      for (const t of b.ults) anotar(reg, { tick: t } as unknown as WorldView, b.id, 'ult')
    }
    fechar(inst, reg, ticks, empate)
  }

  rodada(600, false, [
    { id: 1, charId: 'golem', ativas: [60, 200], ults: [300] },
    { id: 2, charId: 'golem', ativas: [], ults: [] },
    { id: 3, charId: 'vex', ativas: [90], ults: [] },
  ])
  rodada(noLimiar, false, [
    { id: 1, charId: 'golem', ativas: [120], ults: [] },
    { id: 2, charId: 'golem', ativas: [], ults: [] },
    { id: 3, charId: 'vex', ativas: [], ults: [400] },
  ])
  rodada(noLimiar - 1, true, [
    { id: 1, charId: 'golem', ativas: [], ults: [] },
    { id: 2, charId: 'golem', ativas: [], ults: [] },
    { id: 3, charId: 'vex', ativas: [], ults: [] },
  ])

  conferir('rodadas', inst.rodadas === 3, `${inst.rodadas} != 3`)
  conferir('empates', inst.empates === 1, `${inst.empates} != 1 — D-02`)
  conferir(
    'morte súbita',
    inst.morteSubita === 1,
    `${inst.morteSubita} != 1 — uma rodada em ${noLimiar} ticks (= ${SUDDEN_DEATH_MS}ms) conta e uma em ${noLimiar - 1} não`,
  )

  const g = inst.porChar.get('golem')
  const v = inst.porChar.get('vex')
  if (!g || !v) {
    problemas.push('  ✗ instrumentação (§4.5): contador por personagem não foi criado')
    return problemas
  }
  conferir('denominador (rodada × bola)', g.bolasRodada === 6 && v.bolasRodada === 3, `golem ${g.bolasRodada} != 6 · vex ${v.bolasRodada} != 3`)
  conferir('ativas', g.ativas === 3 && v.ativas === 1, `golem ${g.ativas} != 3 · vex ${v.ativas} != 1`)
  conferir('ults', g.ults === 1 && v.ults === 1, `golem ${g.ults} != 1 · vex ${v.ults} != 1`)
  conferir('sem ativa', g.semAtiva === 4 && v.semAtiva === 2, `golem ${g.semAtiva} != 4 · vex ${v.semAtiva} != 2`)
  conferir('sem ult', g.semUlt === 5 && v.semUlt === 2, `golem ${g.semUlt} != 5 · vex ${v.semUlt} != 2`)
  conferir(
    '1º cast é o primeiro',
    g.primeiraAtiva.join(',') === '60,120',
    `${g.primeiraAtiva.join(',')} != 60,120 — a bola 1 castou nos ticks 60 e 200; registrar 200 é gravar o ÚLTIMO`,
  )
  conferir('mediana != média', mediana([1, 2, 3, 4]) === 3 && mediana([3, 1, 2]) === 2, `${mediana([1, 2, 3, 4])} · ${mediana([3, 1, 2])}`)
  // durações [600, noLimiar, noLimiar−1] → ordenadas, a do meio é `noLimiar − 1`
  conferir('duração', mediana(inst.ticks) === noLimiar - 1, `mediana ${mediana(inst.ticks)} != ${noLimiar - 1}`)

  return problemas
}

// ---------------------------------------------------------------- IC e veredito (§4.4)

/** `±1,96·√(0,25/n)`, em pontos percentuais. Literal de §4.4 — sem aproximação. */
function icPp(nDec: number): number {
  if (nDec <= 0) return 100
  return Z_95 * Math.sqrt(0.25 / nDec) * 100
}

/**
 * Três estados, não dois (§4.4). O alerta de RF-47 é sobre o estimador PONTUAL, e é assim que
 * fica; o terceiro estado existe porque duas categorias escondem o problema de amostragem —
 * "dentro de 45–55%" com IC de ±3,46pp não é aprovação, é falta de n.
 */
function vereditoDe(winrate: number, nDec: number): Veredito {
  if (nDec <= 0) return 'inconclusivo'
  if (winrate < ALVO_MIN || winrate > ALVO_MAX) return 'fora'
  const ic = icPp(nDec) / 100
  if (winrate - ic < ALVO_MIN || winrate + ic > ALVO_MAX) return 'inconclusivo'
  return 'dentro'
}

const ROTULO_VEREDITO: Record<Veredito, string> = {
  dentro: '✓ dentro',
  fora: '✗ fora',
  inconclusivo: '? inconclusivo',
}

/**
 * AUTOTESTE do 3º estado. Roda em toda execução porque custa microssegundos e porque a
 * classificação de §4.4 é a única parte do CLI cujo erro é INVISÍVEL na saída: uma célula
 * classificada "✓ dentro" quando deveria ser "? inconclusivo" parece exatamente igual, e é a
 * diferença entre "o jogo está equilibrado" e "não medi o suficiente para saber".
 *
 * O par (2)/(5) é o caso que discrimina: MESMO ponto (52,04%), veredito diferente conforme o n.
 */
const CASOS_VEREDITO: { n: number; w: number; esperado: Veredito; porque: string }[] = [
  { n: 800, w: 0.5, esperado: 'dentro', porque: 'ponto no centro; IC ±3.46 cabe inteiro em 45–55' },
  { n: 800, w: 0.5204, esperado: 'inconclusivo', porque: 'ponto dentro, mas 52.04+3.46 = 55.50 > 55' },
  { n: 800, w: 0.6, esperado: 'fora', porque: 'ponto fora da faixa' },
  { n: 800, w: 0.42, esperado: 'fora', porque: 'ponto fora da faixa, borda de baixo' },
  { n: 10000, w: 0.5204, esperado: 'dentro', porque: 'MESMO ponto do caso 2; IC ±0.98 já cabe' },
  { n: 800, w: 0.45, esperado: 'inconclusivo', porque: 'ponto exatamente na borda: dentro, IC cruza' },
  { n: 100, w: 0.5, esperado: 'inconclusivo', porque: 'centro perfeito, n insuficiente (±9.80)' },
]

function autotesteVeredito(): string[] {
  const problemas: string[] = []
  for (const c of CASOS_VEREDITO) {
    const obtido = vereditoDe(c.w, c.n)
    if (obtido !== c.esperado) {
      problemas.push(
        `  ✗ veredito n=${c.n} w=${(c.w * 100).toFixed(2)}%: esperado '${c.esperado}', obtido '${obtido}' (${c.porque})`,
      )
    }
  }
  // os dois números que §4.4 publica em tabela — se a fórmula for "simplificada", quebram aqui
  if (icPp(800).toFixed(2) !== '3.46') problemas.push(`  ✗ IC a n=800: esperado ±3.46, obtido ±${icPp(800).toFixed(2)}`)
  if (icPp(10000).toFixed(2) !== '0.98') problemas.push(`  ✗ IC a n=10000: esperado ±0.98, obtido ±${icPp(10000).toFixed(2)}`)
  return problemas
}

// ---------------------------------------------------------------- protocolo A/B (§5.1, §5.2, §5.3)

/**
 * A composição do LADO MODIFICADO: a mesma composição do outro lado, com o bônus de item aplicado
 * a **um** personagem — o primeiro que casar com o alvo.
 *
 * "O primeiro" e não "todos" é a diferença entre medir o efeito de um item e medir o efeito de
 * dois: com `--comp=golem,golem --alvo=golem`, aplicar aos dois duplicaria a mutação e o delta
 * deixaria de ser o delta de um pacote. §5.3 é literal — "pacote P aplicado a UM personagem de UM
 * lado".
 *
 * `itemBonus` é sempre ATRIBUÍDO, inclusive quando o pacote é vazio (`nenhum`). É o que faz P2.3
 * ser um controle negativo de verdade: o lado "modificado" percorre exatamente o mesmo caminho de
 * código — `addPartialBonus` + `recomputeStats` no `makeBall` — com um pacote de zero campos. Se
 * o caminho injetasse assimetria por conta própria, o controle acusaria.
 */
function composicaoModificada(
  ids: readonly string[],
  alvo: string,
  bonus: Pacote,
  rotuloBonus: string,
): Composicao {
  let aplicado = false
  const picks: PickSetup[] = ids.map((charId) => {
    if (!aplicado && charId === alvo) {
      aplicado = true
      return { charId, abilityIndex: ABILITY_INDEX, passiveIndex: PASSIVE_INDEX, itemBonus: { ...bonus } }
    }
    return { charId, abilityIndex: ABILITY_INDEX, passiveIndex: PASSIVE_INDEX }
  })
  if (!aplicado) falhar(`alvo '${alvo}' não está na composição [${ids.join(',')}]`)
  return { rotulo: `[${ids.join(',')}]{${rotuloBonus}→${alvo}}`, picks }
}

interface AvisoClamp {
  charId: string
  key: StatKey
  pedido: number
  passiva: number
  efetivo: number
}

/**
 * AVISO DE CLAMP — AC 7, §5.1 ("corolário", e é uma falha silenciosa que vale prevenir).
 *
 * `+30%` de `dmg` está confortável dentro de `ΣMAX.dmg = +1.00`; um `+150%` seria silenciosamente
 * reduzido a `+100%` e o teste de mutante que voltasse negativo seria lido como falha do arnês,
 * quando foi o clamp funcionando. O aviso existe para que essa leitura errada não seja possível.
 *
 * O que é conferido, exatamente: a soma `bonusItem + bonusPassive` contra `SIGMA_MIN/SIGMA_MAX` —
 * que é a mesma expressão de `recomputeStats` (`stats.ts`, `clamp(b.bonusPassive[k] +
 * b.bonusItem[k], …)`). A parcela da passiva entra porque o teto é sobre a SOMA, não sobre o item:
 * um item de `−0.20` em `knockbackTaken` no Golem (passiva Âncora, `−0.60`) soma `−0.80` e é
 * cortado em `−0.75`, mesmo sendo o item, sozinho, folgado.
 *
 * Dois limites conhecidos, escritos porque o silêncio sobre eles seria o mesmo defeito que este
 * aviso combate:
 *   (a) os clamps ABSOLUTOS de `recomputeStats` (`ABS_MIN`/`ABS_MAX`, sobre o stat DERIVADO) não
 *       são visíveis daqui — as tabelas são privadas em `stats.ts` e esta story não altera `sim/`.
 *       Conferido à mão para os pacotes de §5.2 e o roster de hoje: `drag` 0.30→0.36 (golem) e
 *       0.22→0.264 (vex) contra `ABS_MAX.drag = 0.6`; `mass` 3.2→3.84 e 0.9→1.08 sem teto
 *       absoluto; `dmg` não tem clamp absoluto. Nenhum pacote de §5.2 encosta neles.
 *   (b) bônus de passiva somados em `onTick` (`ctx.addBonus`) são condicionais em runtime e não
 *       declarativos — o único do roster é `fantasma` (Vex, `maxSpeed +0.25` abaixo de 40% de HP)
 *       e ele é `passiveIndex 1`, enquanto o CLI fixa `passiveIndex 0`. Fora do alcance hoje.
 */
function conferirClamp(charId: string, bonus: Pacote): AvisoClamp[] {
  const passiva = CHARS[charId]?.passives[PASSIVE_INDEX]?.bonus ?? {}
  const avisos: AvisoClamp[] = []
  for (const k of STAT_KEYS) {
    const item = bonus[k]
    if (item === undefined) continue
    const p = passiva[k] ?? 0
    const soma = item + p
    const cortado = soma < SIGMA_MIN[k] ? SIGMA_MIN[k] : soma > SIGMA_MAX[k] ? SIGMA_MAX[k] : soma
    if (cortado !== soma) avisos.push({ charId, key: k, pedido: soma, passiva: p, efetivo: cortado })
  }
  return avisos
}

interface LinhaAb {
  /** o que foi aplicado, como aparece na coluna `pacote` */
  rotulo: string
  alvo: string
  /** true na linha da linha-base (pacote vazio) — a referência do delta */
  controle: boolean
  res: ResultadoConfronto
  /** em pontos percentuais, contra o controle; `null` na própria linha de controle */
  deltaPp: number | null
  avisos: readonly AvisoClamp[]
  nota: string
}

/**
 * Uma linha do protocolo A/B: composição `C` dos dois lados, pacote em um personagem de um lado,
 * troca de lado obrigatória. É `rodarConfronto` de `e2.5` sem uma linha nova de contabilidade —
 * de propósito. A troca de metades, o denominador de decididas, o teto de seeds e o IC já estão
 * lá, verificados por cinco ensaios roteirizados; duplicá-los aqui criaria a segunda contabilidade
 * que §6.1 existe para impedir.
 */
function rodarAb(
  comp: readonly string[],
  alvo: string,
  bonus: Pacote,
  rotuloBonus: string,
  n: number,
  seedBase: number,
  inst: Instrumentacao,
): { res: ResultadoConfronto; avisos: AvisoClamp[] } {
  const modificada = composicaoModificada(comp, alvo, bonus, rotuloBonus)
  const base = composicao(comp)
  const conf = confronto(modificada, base)
  if (conf.espelho) {
    falhar(
      'protocolo A/B: o lado modificado ficou indistinguível da linha-base, então a troca de lado ' +
        'não rodaria e o winrate reportado seria o viés de lado bruto disfarçado de efeito do pacote.',
    )
  }
  // `medir` liga os contadores de §7.3/§7.4 por LINHA A/B: cada pacote é um contexto próprio, e é
  // o que permite ler "o clamp mordeu no tratamento e não no controle" em vez de um total que
  // mistura os dois (AC 6 de `e2.8`).
  return {
    res: medir(`A/B ${rotuloBonus} → ${alvo}`, () => rodarConfronto(conf, n, seedBase, inst)),
    avisos: conferirClamp(alvo, bonus),
  }
}

/** `dmg +0.30 · mass -0.20` — a forma curta que vai para a coluna `pacote` e para o rótulo. */
function descreverBonus(bonus: Pacote): string {
  const partes: string[] = []
  for (const k of STAT_KEYS) {
    const v = bonus[k]
    if (v === undefined) continue
    partes.push(`${k} ${v >= 0 ? '+' : ''}${v.toFixed(2)}`)
  }
  return partes.length > 0 ? partes.join(' · ') : 'vazio'
}

/**
 * AUTOTESTE dos pacotes de §5.2. Roda em toda execução, e a asserção que importa é a do SINAL do
 * `drag`: `fisico.drag` tem de ser POSITIVO. `drag` é a fração de velocidade RETIDA por segundo,
 * então "Lixa = menos atrito" é `drag` maior, e a leitura literal do PRD (`−0.20`) mediria o
 * oposto — §5.2 mediu a diferença: +4,32pp contra −5,90pp, dez pontos e troca de sinal, o
 * suficiente para disparar o gatilho do Risco #1b que a leitura correta não dispara.
 *
 * Um comentário sozinho não segura isso: quem "corrigir" o arquivo pelo texto do PRD apaga o
 * comentário junto. O autoteste não some com a edição.
 */
function autotestePacotes(): string[] {
  const problemas: string[] = []
  const chaves = Object.keys(PACOTES).sort()
  const nomes = [...NOMES_PACOTE].sort()
  if (chaves.join(',') !== nomes.join(',')) {
    problemas.push(`  ✗ pacotes: NOMES_PACOTE [${nomes.join(',')}] != chaves de PACOTES [${chaves.join(',')}]`)
  }

  if (!(PACOTES.fisico.drag > 0)) {
    problemas.push(
      `  ✗ pacotes: fisico.drag = ${PACOTES.fisico.drag} — drag é a fração RETIDA (Lixa = −atrito = ` +
        '+drag). Sinal negativo mede o oposto do Risco #1b (§5.2: +4,32pp vira −5,90pp).',
    )
  }
  if (PACOTES.fisico.mass !== 0.2 || PACOTES.fisico.drag !== 0.2) {
    problemas.push(`  ✗ pacotes: fisico != { mass: +0.20, drag: +0.20 } (§5.2, literal)`)
  }
  if (PACOTES.dano.dmg !== 0.2) problemas.push(`  ✗ pacotes: dano != { dmg: +0.20 } (§5.2, literal)`)
  if (Object.keys(PACOTES.nenhum).length !== 0) {
    problemas.push('  ✗ pacotes: nenhum precisa ser vazio — é o controle negativo de P2.3')
  }

  // REL-002 na fonte do dado: um pacote com campo inválido ou valor não finito seria uma segunda
  // porta para o mesmo defeito que `analisarMutacao` fecha na entrada do usuário.
  for (const nome of NOMES_PACOTE) {
    for (const [k, v] of Object.entries(PACOTES[nome])) {
      if (!(STAT_KEYS as readonly string[]).includes(k)) problemas.push(`  ✗ pacotes: ${nome}.${k} não é campo de stats.ts`)
      if (!Number.isFinite(v)) problemas.push(`  ✗ pacotes: ${nome}.${k} = ${v} não é finito`)
    }
  }
  return problemas
}

/**
 * AUTOTESTE do parser de `--mutacao` — a borda de REL-002/BOT-006/BOT-007. Cada caso de recusa
 * aqui é uma forma de `NaN`/`Infinity`/lixo entrar em `itemBonus` e contaminar a simulação sem
 * erro: a rodada roda até o fim, a tabela sai plausível, e o número está errado.
 */
const CASOS_MUTACAO: { entrada: string; aceita: boolean; porque: string }[] = [
  { entrada: 'vex:dmg:+0.30', aceita: true, porque: 'a forma de P2.2, literal de §5.2' },
  { entrada: 'vex:dmg:-0.25', aceita: true, porque: 'sinal negativo é legítimo (mutante para baixo)' },
  { entrada: 'golem:mass:0.2', aceita: true, porque: 'sinal explícito é opcional' },
  { entrada: 'vex:dmg:abc', aceita: false, porque: 'Number("abc") = NaN — o caso que a missão nomeia' },
  { entrada: 'vex:dmg:', aceita: false, porque: 'Number("") = 0: aceitaria em silêncio uma mutação nula' },
  { entrada: 'vex:dmg:NaN', aceita: false, porque: 'NaN escrito por extenso' },
  { entrada: 'vex:dmg:Infinity', aceita: false, porque: 'Infinity escrito por extenso' },
  { entrada: 'vex:dmg:1e400', aceita: false, porque: 'passa no formato decimal e vale Infinity — só isFinite pega' },
  { entrada: 'vex:dmg:0x10', aceita: false, porque: 'Number("0x10") = 16, finito e nada a ver com o pedido' },
  { entrada: 'vex:zzz:+0.3', aceita: false, porque: 'campo fora de STAT_KEYS' },
  { entrada: 'zzz:dmg:+0.3', aceita: false, porque: 'personagem fora do roster' },
  { entrada: 'vex:dmg', aceita: false, porque: 'forma incompleta' },
  { entrada: 'vex:dmg:0.1:0.2', aceita: false, porque: 'campos demais' },
]

function autotesteMutacao(): string[] {
  const problemas: string[] = []
  for (const c of CASOS_MUTACAO) {
    const r = analisarMutacao(c.entrada)
    const aceitou = typeof r !== 'string'
    if (aceitou !== c.aceita) {
      problemas.push(
        `  ✗ --mutacao '${c.entrada}': esperado ${c.aceita ? 'ACEITAR' : 'RECUSAR'}, ` +
          `obtido ${aceitou ? 'ACEITOU' : `RECUSOU (${r as string})`} — ${c.porque}`,
      )
    }
    if (aceitou && !Number.isFinite((r as Mutacao).valor)) {
      problemas.push(`  ✗ --mutacao '${c.entrada}': aceitou com valor não finito`)
    }
  }
  const ok = analisarMutacao('vex:dmg:+0.30')
  if (typeof ok === 'string' || ok.charId !== 'vex' || ok.key !== 'dmg' || ok.valor !== 0.3) {
    problemas.push(`  ✗ --mutacao: 'vex:dmg:+0.30' não foi lido como { vex, dmg, 0.3 }`)
  }
  return problemas
}

/**
 * AUTOTESTE da montagem do protocolo A/B — "pacote P aplicado a UM personagem de UM lado" (§5.3).
 *
 * As três formas de errar isto produzem uma tabela de aparência normal e um número errado:
 * aplicar aos dois personagens do lado modificado (mede o dobro da mutação), aplicar aos dois
 * lados (mede zero e "confirma" qualquer controle negativo), e deixar os dois rótulos iguais (o
 * confronto vira espelho, a troca de lado não roda e o viés de lado bruto sai disfarçado de efeito
 * do pacote). Nenhuma das três é visível na saída.
 */
function autotesteAb(): string[] {
  const problemas: string[] = []
  const conferir = (rotulo: string, ok: boolean, detalhe: string): void => {
    if (!ok) problemas.push(`  ✗ protocolo A/B — ${rotulo}: ${detalhe}`)
  }
  const comBonus = (c: Composicao): number => c.picks.filter((p) => p.itemBonus !== undefined).length

  // composição homogênea: é o caso em que "o primeiro que casar" e "todos que casarem" divergem
  const dupla = composicaoModificada(['golem', 'golem'], 'golem', { dmg: 0.2 }, 'dano')
  conferir('(1) um personagem só', comBonus(dupla) === 1, `${comBonus(dupla)} de ${dupla.picks.length} picks receberam itemBonus`)
  conferir('(1) o primeiro', dupla.picks[0]?.itemBonus?.dmg === 0.2, JSON.stringify(dupla.picks[0]))

  const base = composicao(['golem', 'golem'])
  conferir('(2) o outro lado é intocado', comBonus(base) === 0, `${comBonus(base)} picks da linha-base receberam itemBonus`)

  const conf = confronto(dupla, base)
  conferir('(3) não é espelho', !conf.espelho, 'os rótulos coincidiram e a troca de lado (§4.2) não rodaria')

  // o controle negativo percorre o MESMO caminho de código, com pacote vazio (P2.3)
  const vazio = composicaoModificada(['golem', 'vex'], 'vex', PACOTES.nenhum, 'nenhum')
  conferir('(4) controle atribui itemBonus vazio', comBonus(vazio) === 1, `${comBonus(vazio)} picks com itemBonus`)
  conferir(
    '(4) controle no alvo certo',
    vazio.picks[1]?.charId === 'vex' && vazio.picks[1]?.itemBonus !== undefined && vazio.picks[0]?.itemBonus === undefined,
    JSON.stringify(vazio.picks),
  )
  conferir('(4) controle é vazio', Object.keys(vazio.picks[1]?.itemBonus ?? { x: 1 }).length === 0, JSON.stringify(vazio.picks[1]?.itemBonus))

  return problemas
}

/**
 * AUTOTESTE do aviso de clamp (AC 7). Os dois sentidos, e o caso que só existe porque o teto é
 * sobre a SOMA com a passiva.
 */
function autotesteClamp(): string[] {
  const problemas: string[] = []
  const conferir = (rotulo: string, ok: boolean, detalhe: string): void => {
    if (!ok) problemas.push(`  ✗ clamp — ${rotulo}: ${detalhe}`)
  }

  const dentro = conferirClamp('vex', { dmg: 0.3 })
  conferir('(1) +30% dmg não é cortado', dentro.length === 0, `avisou ${dentro.length} vez(es) (ΣMAX.dmg = ${SIGMA_MAX.dmg})`)

  // §5.1, literal: "um +150% seria silenciosamente reduzido para +100%".
  const acima = conferirClamp('vex', { dmg: 1.5 })
  conferir('(2) +150% dmg é cortado', acima.length === 1 && acima[0]!.efetivo === SIGMA_MAX.dmg, JSON.stringify(acima))

  const abaixo = conferirClamp('vex', { dmg: -0.9 })
  conferir('(3) −90% dmg é cortado embaixo', abaixo.length === 1 && abaixo[0]!.efetivo === SIGMA_MIN.dmg, JSON.stringify(abaixo))

  // Golem, passiva Âncora: knockbackTaken −0.60 declarado. Item de −0.20 soma −0.80 < ΣMIN −0.75.
  const comPassiva = conferirClamp('golem', { knockbackTaken: -0.2 })
  conferir(
    '(4) soma com a passiva',
    comPassiva.length === 1 && comPassiva[0]!.pedido === -0.8 && comPassiva[0]!.efetivo === SIGMA_MIN.knockbackTaken,
    `${JSON.stringify(comPassiva)} — o teto é sobre bonusItem + bonusPassive, não sobre o item`,
  )
  const semPassiva = conferirClamp('vex', { knockbackTaken: -0.2 })
  conferir('(5) mesmo item sem a passiva não corta', semPassiva.length === 0, JSON.stringify(semPassiva))

  // Os três pacotes de §5.2 aplicados ao roster de hoje: nenhum pode encostar no teto, senão os
  // números de §5.4 estariam medindo um pacote diferente do que o nome diz.
  for (const nome of NOMES_PACOTE) {
    for (const c of ROSTER) {
      const a = conferirClamp(c.id, PACOTES[nome])
      conferir(`(6) pacote ${nome} em ${c.id}`, a.length === 0, `cortado: ${JSON.stringify(a)}`)
    }
  }
  return problemas
}

// ---------------------------------------------------------------- bateria do Risco #1b (§5.4)

/**
 * BATERIA DO RISCO #1b — `--risco-1b` (`docs/architecture-e2.md` §5.4, §6.3; story `e2.7`).
 *
 * Para cada personagem da composição: controle (pacote vazio) + pacote físico + pacote de dano,
 * com AQUELE personagem como alvo, e o par de deltas contra o controle DELE. Nada além disso —
 * e o "nada além disso" é o ponto da story, não uma omissão:
 *
 * §9/R-04, resolução do usuário de 2026-07-28: **"agregação adiada"**. O indicador aprovado está
 * escrito de forma global ("físico < +2pp **e** dano > +5pp → a trilha física nasce morta"), mas a
 * medição preliminar de §5.4 mostra os deltas INVERTENDO entre personagens — físico rende mais no
 * Golem, dano rende muito mais no Vex. Agregar dois efeitos de sinais opostos numa média produz um
 * número que não descreve nenhum dos dois. A regra de agregação é decisão do @pm, na Fase 5, com o
 * roster maior. Este arquivo, portanto, avalia o gatilho **por personagem** (que é o que §6.3
 * imprime, literalmente) e **não calcula nem imprime** média, maioria ou qualquer combinação entre
 * personagens. Inventar essa regra aqui seria decidir por quem não delegou.
 */

/** O pacote de CONTROLE: é contra ele que todo delta de §5.4 é medido. Tem de vir primeiro. */
const CONTROLE_1B: NomePacote = 'nenhum'
/** Os dois pacotes que o gatilho do indicador #1b nomeia (`docs/prd.md` §6, aprovado). */
const FISICO_1B: NomePacote = 'fisico'
const DANO_1B: NomePacote = 'dano'

/** Limiares do indicador #1b, em pontos percentuais: `físico < +2pp` **e** `dano > +5pp`. */
const LIMIAR_FISICO_PP = 2
const LIMIAR_DANO_PP = 5

/** `fisico` é chave de dado; `físico` é o rótulo de §6.3. Só a saída leva acento. */
const ROTULO_PACOTE: Record<string, string> = { fisico: 'físico' }
function rotularPacote(nome: string): string {
  return ROTULO_PACOTE[nome] ?? nome
}

/**
 * A ORDEM da bateria — controle primeiro, sempre.
 *
 * QA-E26-003 (gate de `e2.6`, entrada obrigatória desta story): o TSDoc de `packages.ts` promete
 * que `NOMES_PACOTE` está na ordem em que `e2.7` percorre os pacotes ("o controle primeiro"), mas
 * `autotestePacotes` compara CONJUNTOS (`sort().join()`), não ordem — nada no repositório garante
 * hoje que `NOMES_PACOTE[0]` seja o controle. Esta função é a resposta: a ordem é fixada AQUI, por
 * construção, e não herdada da declaração em `packages.ts`; se alguém reordenar aquela lista, a
 * bateria continua medindo o delta contra o controle.
 *
 * O que continua vindo de `packages.ts` é a COMPOSIÇÃO do conjunto — um pacote novo declarado lá
 * entra na bateria automaticamente, que é o contrato que o TSDoc de lá anuncia. Só a posição do
 * controle é imposta daqui.
 *
 * Pura sobre a lista recebida, e não sobre `NOMES_PACOTE` direto, para que o autoteste possa
 * passar a lista na ordem ERRADA e provar que a saída sai certa mesmo assim.
 */
function ordemDaBateria(nomes: readonly NomePacote[]): NomePacote[] {
  return [CONTROLE_1B, ...nomes.filter((n) => n !== CONTROLE_1B)]
}

interface DeltaPacote {
  nome: NomePacote
  /** `winrate(pacote) − winrate(controle)` em pp; `null` se alguma das duas não teve decididas */
  deltaPp: number | null
  res: ResultadoConfronto
}

interface Bateria1b {
  charId: string
  controle: ResultadoConfronto
  tratamentos: DeltaPacote[]
  /** `true`/`false` do gatilho DESTE personagem; `null` quando não é avaliável (sem decididas) */
  gatilho: boolean | null
  /** por que não foi avaliável, quando `gatilho` é `null` */
  motivo: string | null
}

/**
 * `winrate(tratamento) − winrate(controle)`, em pp, **arredondado às 2 casas que §6.3 imprime**.
 * `null` sem decididas — 0/0 não é delta, e imprimir 0 seria fabricar uma medição.
 *
 * O arredondamento não é cosmético, é o que mantém a saída legível de si mesma. Os limiares do
 * indicador são pp exatos (+2 e +5) e um delta pode cair exatamente neles: com `n_dec = 800`, uma
 * diferença de 16 vitórias É +2,00pp. Em ponto flutuante, `(0.5 − 0.45)·100` vale
 * `4.999999999999999`, e `(0.5 − 0.48)·100` vale `2.0000000000000018` — o mesmo fato numérico cai
 * dos dois lados da borda conforme a sorte do binário. Sem arredondar, o CLI imprimiria
 * `+2.00pp   → gatilho: SIM` e ninguém conseguiria explicar a linha.
 *
 * Arredondando aqui, e não na formatação, todo consumidor (tabela, gatilho, `--json`) enxerga o
 * MESMO número. Quem precisar de precisão cheia tem `winrate` dos dois lados no `--json`.
 */
function deltaPp(tratamento: ResultadoConfronto, controle: ResultadoConfronto): number | null {
  if (tratamento.nDec <= 0 || controle.nDec <= 0) return null
  return Math.round((tratamento.winrate - controle.winrate) * 100 * 100) / 100
}

/**
 * O gatilho do indicador #1b, avaliado sobre UM personagem — a assinatura recebe os tratamentos de
 * um personagem só, e é de propósito: não existe caminho neste arquivo por onde os deltas de dois
 * personagens cheguem juntos a uma decisão (AC 4 / §9/R-04).
 *
 * Os dois comparadores são ESTRITOS, como o indicador está escrito: `< +2pp` e `> +5pp`. Um delta
 * exatamente em +2,00pp não dispara a primeira condição, e um exatamente em +5,00pp não dispara a
 * segunda — é a leitura literal, e as duas bordas estão no autoteste.
 */
function avaliarGatilho1b(tratamentos: readonly DeltaPacote[]): { gatilho: boolean | null; motivo: string | null } {
  const fis = tratamentos.find((t) => t.nome === FISICO_1B)
  const dano = tratamentos.find((t) => t.nome === DANO_1B)
  if (!fis || !dano) {
    return { gatilho: null, motivo: `bateria sem o pacote '${!fis ? FISICO_1B : DANO_1B}' — o gatilho nomeia os dois` }
  }
  if (fis.deltaPp === null || dano.deltaPp === null) {
    return { gatilho: null, motivo: 'alguma linha ficou sem rodadas decididas — o delta não existe' }
  }
  return { gatilho: fis.deltaPp < LIMIAR_FISICO_PP && dano.deltaPp > LIMIAR_DANO_PP, motivo: null }
}

/**
 * Roda a bateria e ALIMENTA a tabela A/B de §5.3 (`linhas`) com as mesmas linhas — não uma segunda
 * tabela. Cada medição aqui é uma chamada de `rodarAb`, que é o protocolo A/B de `e2.6` intocado:
 * troca de lado, denominador de decididas, teto de seeds, IC e aviso de clamp já estão lá. Esta
 * função só decide QUEM roda contra QUEM e QUAL número é subtraído de qual.
 *
 * Todas as linhas partem da MESMA seed base, inclusive entre personagens: o delta é a diferença
 * entre duas medições sobre a mesma sequência de partidas (§5.3), e é isso que cancela a variância
 * comum. Corolário útil: com pacote vazio o alvo não muda a partida, então os controles de todos
 * os personagens têm de sair NUMERICAMENTE IDÊNTICOS — conferido na impressão.
 */
function rodarBateria1b(
  comp: readonly string[],
  n: number,
  seedBase: number,
  inst: Instrumentacao,
  linhas: LinhaAb[],
): Bateria1b[] {
  const ordem = ordemDaBateria(NOMES_PACOTE)
  // `--comp=golem,golem` é composição legal para o CLI; personagem repetido é o MESMO personagem
  // e mediria a mesma bateria duas vezes.
  const personagens = [...new Set(comp)]
  const out: Bateria1b[] = []

  for (const charId of personagens) {
    let controle: ResultadoConfronto | null = null
    const tratamentos: DeltaPacote[] = []

    for (const nome of ordem) {
      console.error(`  … risco #1b: ${charId} · pacote ${nome}`)
      const linha = rodarAb(comp, charId, PACOTES[nome], nome, n, seedBase, inst)
      const ehControle = nome === CONTROLE_1B

      if (!ehControle && controle === null) {
        // Inalcançável por `ordemDaBateria`, e é justamente por isso que a guarda existe: sem ela,
        // uma reordenação futura mediria o delta contra o pacote errado sem nada aparecer na saída.
        falhar(
          `bateria #1b: o pacote '${nome}' foi medido antes do controle '${CONTROLE_1B}' — todo delta de ` +
            '§5.4 é medido CONTRA o controle e não existe delta sem ele.',
        )
      }

      const delta = ehControle ? null : deltaPp(linha.res, controle!)
      linhas.push({
        rotulo: nome,
        alvo: charId,
        controle: ehControle,
        res: linha.res,
        deltaPp: delta,
        avisos: linha.avisos,
        nota: ehControle ? `#1b — controle de ${charId} (§5.4)` : `#1b — ${rotularPacote(nome)} em ${charId} (§5.4)`,
      })

      if (ehControle) controle = linha.res
      else tratamentos.push({ nome, deltaPp: delta, res: linha.res })
    }

    const { gatilho, motivo } = avaliarGatilho1b(tratamentos)
    out.push({ charId, controle: controle!, tratamentos, gatilho, motivo })
  }

  return out
}

/** `+4.32pp` / `-5.90pp` / `n/d` — a célula de delta de §6.3. */
function celulaDelta(pp: number | null): string {
  return pp === null ? 'n/d' : `${pp >= 0 ? '+' : ''}${pp.toFixed(2)}pp`
}

/**
 * A seção "risco #1b (delta por personagem)" de §6.3, literal:
 *
 *     risco #1b (delta por personagem)
 *       vex     físico +4.32pp · dano +23.78pp   → gatilho (fis<+2 e dano>+5): NÃO
 *       golem   físico +8.77pp · dano  +4.24pp   → gatilho: NÃO
 *
 * A legenda dos limiares sai na PRIMEIRA linha e as demais só dizem `gatilho:` — é o formato do
 * exemplo, e a legenda por extenso em toda linha empurraria o dado para a direita. O alinhamento
 * é por COLUNA (cada pacote com a própria largura), que é o que produz o `dano  +4.24pp` do
 * exemplo alinhado com `dano +23.78pp`.
 *
 * O que NÃO existe aqui, e a ausência é o requisito: nenhuma linha de total, média, maioria ou
 * veredito único da bateria. Cada linha fala de um personagem e de mais ninguém (§9/R-04).
 */
function imprimirRisco1b(bateria: readonly Bateria1b[]): void {
  console.log('risco #1b (delta por personagem)')

  const larguraChar = Math.max(6, ...bateria.map((b) => b.charId.length))
  const larguraDelta = new Map<string, number>()
  for (const b of bateria) {
    for (const t of b.tratamentos) {
      const w = celulaDelta(t.deltaPp).length
      larguraDelta.set(t.nome, Math.max(larguraDelta.get(t.nome) ?? 0, w))
    }
  }

  let primeira = true
  for (const b of bateria) {
    const pares = b.tratamentos
      .map((t) => `${rotularPacote(t.nome)} ${celulaDelta(t.deltaPp).padStart(larguraDelta.get(t.nome) ?? 0)}`)
      .join(' · ')
    const legenda = primeira ? ` (fis<+${LIMIAR_FISICO_PP} e dano>+${LIMIAR_DANO_PP})` : ''
    const veredito = b.gatilho === null ? `n/d — ${b.motivo}` : b.gatilho ? 'SIM' : 'NÃO'
    console.log(`  ${b.charId.padEnd(larguraChar)}  ${pares}   → gatilho${legenda}: ${veredito}`)
    primeira = false
  }

  /*
   * O controle de cada personagem mede a MESMA coisa: `itemBonus` vazio não muda a partida e todas
   * as linhas partem da mesma seed base. Se dois controles divergirem, ou o alvo vazou para dentro
   * da simulação ou o determinismo quebrou — e nos dois casos TODO delta acima é lixo, porque cada
   * um foi medido contra um controle diferente. É barato conferir e invisível se não se conferir.
   */
  const controles = bateria.map((b) => `${b.controle.vitorias}/${b.controle.nDec}`)
  if (new Set(controles).size > 1) {
    console.log(
      `  ⚠ os controles dos personagens DIVERGIRAM (${bateria.map((b, i) => `${b.charId} ${controles[i]}`).join(' · ')}). ` +
        'Com pacote vazio e a mesma seed base eles têm de ser idênticos: o alvo não muda a partida. ' +
        'Enquanto isso não fechar, os deltas acima estão medidos contra controles diferentes e não são comparáveis.',
    )
  }

  console.log(
    `                 delta = winrate(pacote) − winrate(controle) do MESMO personagem, mesma seed base (§5.4)`,
  )
  console.log(
    '                 o gatilho é avaliado POR PERSONAGEM. Nenhuma agregação entre personagens é ' +
      'calculada aqui —\n                 §9/R-04 (resolução do usuário, 2026-07-28): a regra de ' +
      'agregação global é decisão da Fase 5,\n                 com o bot heurístico e roster maior. ' +
      'Os deltas invertem entre personagens, e uma média dos dois\n                 não descreveria nenhum deles.',
  )
  console.log(
    `                 ⚠ os limiares (+${LIMIAR_FISICO_PP}pp / +${LIMIAR_DANO_PP}pp) são finos perto do IC de cada winrate ` +
      `(±${icPp(800).toFixed(2)}pp a n=800, §4.4):\n                   um gatilho lido no piso de RF-48 é leitura de ruído. Suba --n antes de decidir por ele.`,
  )
  console.log('')
}

/**
 * AUTOTESTE da bateria (§5.4) e do gatilho do indicador #1b. Roda em toda execução, inclusive
 * quando `--risco-1b` não foi pedido, porque os dois erros que ele pega são invisíveis na saída:
 *
 *   (a) ORDEM — QA-E26-003. Se o controle deixar de vir primeiro, o delta passa a ser medido
 *       contra um pacote, e a tabela sai com a mesma cara. O ensaio passa `NOMES_PACOTE` na ordem
 *       invertida de propósito: é o que prova que a ordem é imposta aqui e não herdada.
 *   (b) COMPARADOR — o gatilho é `< +2` e `> +5`, ESTRITOS. Trocar por `<=`/`>=` muda o veredito
 *       exatamente na borda, que é onde ele importa. As duas bordas estão na tabela.
 *
 * Os quatro números de §5.4 entram como caso porque §6.3 publica o veredito deles ("NÃO" nos dois
 * personagens): se a implementação do gatilho divergir do que a arquitetura imprimiu, quebra aqui.
 * São números de `dummy` e não valem como leitura de risco — valem como caso de teste da REGRA.
 */
const CASOS_GATILHO_1B: { fis: number; dano: number; esperado: boolean; porque: string }[] = [
  { fis: 4.32, dano: 23.78, esperado: false, porque: '§5.4/§6.3 — vex: físico acima de +2pp, não dispara' },
  { fis: 8.77, dano: 4.24, esperado: false, porque: '§5.4/§6.3 — golem: nenhuma das duas condições' },
  { fis: 1.0, dano: 6.0, esperado: true, porque: 'as duas condições — é o caso que a trilha física nasce morta' },
  { fis: 1.0, dano: 4.0, esperado: false, porque: 'físico dispara, dano não: o indicador exige as DUAS' },
  { fis: 3.0, dano: 6.0, esperado: false, porque: 'dano dispara, físico não' },
  { fis: 2.0, dano: 6.0, esperado: false, porque: 'borda: +2.00 não é < +2 (comparador estrito)' },
  { fis: 1.0, dano: 5.0, esperado: false, porque: 'borda: +5.00 não é > +5 (comparador estrito)' },
  { fis: -5.9, dano: 6.0, esperado: true, porque: 'físico negativo (a leitura literal do PRD, §5.2) dispara' },
]

function autotesteRisco1b(): string[] {
  const problemas: string[] = []
  const conferir = (rotulo: string, ok: boolean, detalhe: string): void => {
    if (!ok) problemas.push(`  ✗ risco #1b — ${rotulo}: ${detalhe}`)
  }

  // (a) ordem: imposta aqui, não herdada de `packages.ts` — QA-E26-003
  const invertida = [...NOMES_PACOTE].reverse()
  const ordemInvertida = ordemDaBateria(invertida)
  const ordemNormal = ordemDaBateria(NOMES_PACOTE)
  conferir(
    '(a) controle primeiro com a lista na ordem certa',
    ordemNormal[0] === CONTROLE_1B,
    `${ordemNormal.join(',')} — o delta de §5.4 é medido CONTRA o controle`,
  )
  conferir(
    '(a) controle primeiro com a lista INVERTIDA',
    ordemInvertida[0] === CONTROLE_1B,
    `${ordemInvertida.join(',')} a partir de [${invertida.join(',')}] — a ordem tem de ser imposta aqui`,
  )
  conferir(
    '(a) nenhum pacote some nem duplica',
    [...ordemNormal].sort().join(',') === [...NOMES_PACOTE].sort().join(',') && ordemNormal.length === NOMES_PACOTE.length,
    `[${ordemNormal.join(',')}] != conjunto de [${NOMES_PACOTE.join(',')}]`,
  )
  conferir(
    '(a) os dois pacotes do gatilho existem',
    ordemNormal.includes(FISICO_1B) && ordemNormal.includes(DANO_1B),
    `o indicador nomeia '${FISICO_1B}' e '${DANO_1B}'; a bateria tem [${ordemNormal.join(',')}]`,
  )
  conferir(
    '(a) o controle é o pacote VAZIO',
    Object.keys(PACOTES[CONTROLE_1B]).length === 0,
    `PACOTES.${CONTROLE_1B} = ${JSON.stringify(PACOTES[CONTROLE_1B])} — um controle com campo mede um tratamento`,
  )

  // (b) o comparador do gatilho, com as duas bordas
  const res = (fis: number, dano: number): ReturnType<typeof avaliarGatilho1b> => {
    const stub = (nome: NomePacote, pp: number): DeltaPacote => ({
      nome,
      deltaPp: pp,
      res: { confronto: confronto(composicao(['golem']), composicao(['vex'])), nDec: 800, nSeeds: 800, vitorias: 400, winrate: 0.5, icPp: icPp(800), veredito: 'dentro', truncado: false },
    })
    return avaliarGatilho1b([stub(FISICO_1B, fis), stub(DANO_1B, dano)])
  }
  for (const c of CASOS_GATILHO_1B) {
    const obtido = res(c.fis, c.dano).gatilho
    if (obtido !== c.esperado) {
      problemas.push(
        `  ✗ risco #1b — gatilho(físico ${c.fis}pp, dano ${c.dano}pp): esperado ${c.esperado ? 'SIM' : 'NÃO'}, ` +
          `obtido ${obtido === null ? 'n/d' : obtido ? 'SIM' : 'NÃO'} (${c.porque})`,
      )
    }
  }

  // (c) delta sem decididas não é 0: é ausência de medição, e imprimir 0 seria fabricar um dado
  const vazio: ResultadoConfronto = {
    confronto: confronto(composicao(['golem']), composicao(['vex'])),
    nDec: 0,
    nSeeds: 100,
    vitorias: 0,
    winrate: 0,
    icPp: icPp(0),
    veredito: 'inconclusivo',
    truncado: true,
  }
  const cheio: ResultadoConfronto = { ...vazio, nDec: 800, nSeeds: 800, vitorias: 400, winrate: 0.5, truncado: false }
  conferir('(c) delta com controle sem decididas', deltaPp(cheio, vazio) === null, `${deltaPp(cheio, vazio)} != null`)
  conferir('(c) delta com tratamento sem decididas', deltaPp(vazio, cheio) === null, `${deltaPp(vazio, cheio)} != null`)

  /*
   * (c) as duas bordas em PONTO FLUTUANTE, que é o modo de falha real do gatilho: `(0.5−0.45)·100`
   * vale `4.999999999999999` e `(0.5−0.48)·100` vale `2.0000000000000018`. Sem o arredondamento de
   * `deltaPp`, a tabela imprimiria `+2.00pp` e o gatilho decidiria por `1.999…` — ou o contrário,
   * conforme o binário. As duas linhas abaixo são exatamente os dois limiares do indicador.
   */
  const de = (w: number): ResultadoConfronto => ({ ...cheio, winrate: w })
  conferir('(c) borda +5.00pp sobrevive ao float', deltaPp(de(0.5), de(0.45)) === 5, `${deltaPp(de(0.5), de(0.45))} != 5`)
  conferir('(c) borda +2.00pp sobrevive ao float', deltaPp(de(0.5), de(0.48)) === 2, `${deltaPp(de(0.5), de(0.48))} != 2`)
  conferir('(c) delta negativo', deltaPp(de(0.45), de(0.5)) === -5, `${deltaPp(de(0.45), de(0.5))} != -5`)
  conferir('(c) 2 casas, como §6.3 imprime', deltaPp(de(0.535512), de(0.49232)) === 4.32, `${deltaPp(de(0.535512), de(0.49232))} != 4.32`)

  // (d) gatilho não avaliável não vira `false` — "não deu para medir" != "não disparou"
  const semDano = avaliarGatilho1b([{ nome: FISICO_1B, deltaPp: 1, res: cheio }])
  conferir('(d) bateria incompleta', semDano.gatilho === null && semDano.motivo !== null, JSON.stringify(semDano))
  const semDelta = avaliarGatilho1b([
    { nome: FISICO_1B, deltaPp: null, res: vazio },
    { nome: DANO_1B, deltaPp: 6, res: cheio },
  ])
  conferir('(d) delta ausente', semDelta.gatilho === null && semDelta.motivo !== null, JSON.stringify(semDelta))

  return problemas
}

// ---------------------------------------------------------------- auditoria de roster (§6.3)

interface SlotAuditado {
  charId: string
  slotId: string
  papel: string
  aim: AimSpec
  minRange: number
  maxRange: number
}

function slotsDe(char: CharDef): SlotAuditado[] {
  const base = (papel: string, s: { id: string; minRange: number; maxRange: number; aim: AimSpec }): SlotAuditado => ({
    charId: char.id,
    slotId: s.id,
    papel,
    aim: s.aim,
    minRange: s.minRange,
    maxRange: s.maxRange,
  })
  return [base('ativa 0', char.abilities[0]), base('ativa 1', char.abilities[1]), base('ult', char.ult)]
}

function descreverAim(a: AimSpec): string {
  switch (a.kind) {
    case 'burst':
      return `burst radius ${a.radius} delayMs ${a.delayMs}`
    case 'raio':
      return `raio radius ${a.radius} speed ${a.speed} ms ${a.ms}`
    case 'dash':
      return `dash speed ${a.speed} ms ${a.ms}`
    case 'reposicao':
      return `reposicao speed ${a.speed}`
    case 'utilidade':
      return 'utilidade'
  }
}

/**
 * AUDITORIA DE ROSTER — MNT-001 (gate de `e2.2`, entrada obrigatória desta story).
 *
 * Os doze números dos seis `aim` do roster são todos CÓPIAS de literais que vivem dentro do
 * `cast` do mesmo arquivo (`radius: 110` × `const raio = 110`, `speed: 620` × `vx: aim.dx*620`,
 * …). O gate de `e2.2` recusou, com razão, resolver isso com comentário cruzado — "um comentário
 * apodrece igual ao número que ele guarda" — e apontou o único mecanismo desenhado que detecta a
 * divergência: esta tabela, impressa ao lado de `contactWindows`, com FALHA e não aviso.
 *
 * O que é verificável por máquina hoje é o par `dash.ms` × `contactWindows[source].ms`, porque é
 * a única duplicação em que os dois lados são DADO DECLARADO. Os outros dez números duplicam
 * literais que vivem dentro de um closure e não são legíveis sem executar o `cast` — a tabela os
 * imprime para a auditoria humana de §6.3, que é exatamente o papel que ela tem lá.
 *
 * As duas mãos da checagem, porque o par pode romper dos dois lados:
 *   B1 — todo slot `dash` tem janela de contato com o mesmo `source` e `ms` IDÊNTICO
 *   B2 — toda janela de contato pertence a um slot declarado `dash` (o `aim` anuncia ao bot que
 *        o corpo do caster é a arma; janela sem `dash` é dano que o estimador não enxerga)
 *
 * ARCH-002 (mesmo gate) pede imprimir o alcance EFETIVO do dash ao lado de `maxRange`. Não é
 * feito aqui de propósito: o cálculo é a integral de `v(t) = v0·drag^t` que `bot/heuristic.ts`
 * já implementa em `velEfetivaDash`, e essa função é privada. Copiá-la para `tools/` criaria a
 * segunda fonte de verdade que este projeto já pagou três vezes (C3, `AimSpec`, e a própria
 * MNT-001); exportá-la exigiria editar `bot/`, que esta story proíbe (o CLI é consumidor novo).
 * Registrado no gate desta story para `e2.6`, que já vai tocar o assunto.
 */
function auditarRoster(): { tabela: string[]; violacoes: string[]; slots: number } {
  const violacoes: string[] = []
  const tabela: string[] = []
  let slots = 0

  for (const char of ROSTER) {
    const janelas = char.contactWindows ?? []
    for (const s of slotsDe(char)) {
      slots++
      const janela = janelas.find((w) => w.source === s.slotId)
      let ok = true

      if (s.aim.kind === 'dash') {
        if (!janela) {
          ok = false
          violacoes.push(
            `  ✗ B1: ${char.id}.${s.slotId} declara aim dash mas não tem contactWindows[source='${s.slotId}'] — ` +
              'o bot trata o corpo do caster como arma (heuristic.ts, raioEf do dash) e nada causaria dano por contato',
          )
        } else if (janela.ms !== s.aim.ms) {
          ok = false
          violacoes.push(
            `  ✗ B1: ${char.id}.${s.slotId} aim.ms ${s.aim.ms} != contactWindows.ms ${janela.ms} — ` +
              'os dois números são o mesmo fato declarado duas vezes (MNT-001) e divergiram',
          )
        }
      } else if (janela) {
        ok = false
        violacoes.push(
          `  ✗ B2: ${char.id}.${s.slotId} tem janela de dano por contato mas declara aim '${s.aim.kind}' — ` +
            'o estimador do bot não enxerga dano de contato fora de dash',
        )
      }

      const contato = janela
        ? `${janela.ms}ms dmg ${janela.dmg} kb ${janela.knockback} re-hit ${janela.reHitMs}ms`
        : '—'
      tabela.push(
        `  ${char.id.padEnd(6)} ${s.slotId.padEnd(13)} ${s.papel.padEnd(8)} ${descreverAim(s.aim).padEnd(34)} ` +
          `${`${s.minRange}–${s.maxRange}`.padStart(9)}  ${contato.padEnd(42)}${ok ? '✓' : '✗'}`,
      )
    }
  }

  return { tabela, violacoes, slots }
}

// ---------------------------------------------------------------- formatação

function pct(x: number, casas = 2): string {
  return `${(x * 100).toFixed(casas)}%`
}

/** `+1.00` / `-0.75` — o sinal explícito importa quando o número é um bônus (§5.2). */
function sinal(x: number): string {
  return `${x >= 0 ? '+' : ''}${x.toFixed(2)}`
}

function seg(ticks: number): string {
  return `${((ticks * TICK_MS) / 1000).toFixed(1)}s`
}

function mediana(xs: readonly number[]): number {
  if (xs.length === 0) return 0
  const o = [...xs].sort((a, b) => a - b)
  return o[Math.floor(o.length / 2)]!
}

function linhaConfronto(r: ResultadoConfronto, larguraRotulo: number, coluna: string): string {
  return (
    `${r.confronto.rotulo.padEnd(larguraRotulo)} ${String(r.nDec).padStart(7)} ${String(r.nSeeds).padStart(8)}` +
    `  ${pct(r.winrate).padStart(7)}  ±${r.icPp.toFixed(2).padStart(5)}   ${coluna}` +
    (r.truncado ? '  ⚠ teto de seeds atingido — n_dec abaixo do pedido' : '')
  )
}

function cabecalhoTabela(larguraRotulo: number, ultimaColuna: string): string {
  return `${'confronto'.padEnd(larguraRotulo)} ${'n_dec'.padStart(7)} ${'n_seeds'.padStart(8)}  ${'winrate'.padStart(7)}      IC   ${ultimaColuna}`
}

// ---------------------------------------------------------------- main

const argv = (globalThis as { process?: { argv?: string[] } }).process?.argv ?? []
const flags = lerFlags(argv.slice(2))

const problemasAutoteste = [
  ...autotesteVeredito(),
  ...autotestePares(),
  ...autotesteTrocaDeLado(),
  ...autotesteFechar(),
  ...autotestePacotes(),
  ...autotesteMutacao(),
  ...autotesteAb(),
  ...autotesteClamp(),
  ...autotesteRisco1b(),
  ...autotesteContadores(),
]
if (problemasAutoteste.length > 0) {
  for (const p of problemasAutoteste) console.error(p)
  console.error(
    'erro: os invariantes de §4.1/§4.4/§4.5/§5.1/§5.2 não fecham — nenhuma matriz é reportável ' +
      'assim, porque todos esses erros (veredito, contagem de células, contadores, sinal do pacote, ' +
      'entrada não finita) são invisíveis na tabela impressa.',
  )
  sair(1)
  throw new Error('autotestes reprovaram')
}

const auditoria = auditarRoster()

const plano =
  flags.plano === 'espelho-ab' ? planoEspelhoAb(flags.comp) : planoParesDeComposicao(flags.repetePersonagem)

console.log('')
console.log(
  `arnês de balanceamento · bot ${BOT_VERSION} · preset ${PRESET_NOME} · plano ${plano.gerador} · ` +
    `seed base ${flags.seed} · n alvo ${flags.n} (piso)`,
)
console.log('')
console.log(`auditoria de roster — aim × contactWindows (§6.3 · MNT-001)`)
for (const l of auditoria.tabela) console.log(l)
if (auditoria.violacoes.length > 0) {
  for (const v of auditoria.violacoes) console.log(v)
  console.log('')
  console.error(
    `erro: auditoria de roster reprovou em ${auditoria.violacoes.length} ponto(s). ` +
      'Nenhum confronto foi rodado: a geometria que o bot lê divergiu do que o motor executa, ' +
      'e uma matriz medida sobre isso reportaria viés de instrumento como desequilíbrio de personagem.',
  )
  sair(1)
}
console.log(`  ✓ ok — ${auditoria.slots} slots declarados, aim e contactWindows pareados`)
console.log('')

if (plano.nota) {
  console.log(`nota do gerador  ${plano.nota}`)
  console.log('')
}

const inst = novaInstrumentacao()
const resultados: ResultadoConfronto[] = []
for (let i = 0; i < plano.confrontos.length; i++) {
  const c = plano.confrontos[i]!
  if (plano.confrontos.length > 1) {
    console.error(`  … confronto ${i + 1}/${plano.confrontos.length}: ${c.rotulo}`)
  }
  resultados.push(
    medir(`${c.rotulo}${c.espelho ? ' espelho' : ''}`, () => rodarConfronto(c, flags.n, flags.seed, inst)),
  )
}

const matriz = resultados.filter((r) => !r.confronto.espelho)
const espelhos = resultados.filter((r) => r.confronto.espelho)
const largura = Math.max(28, ...resultados.map((r) => r.confronto.rotulo.length))

console.log('matriz de composições (§4.1) — troca de lado obrigatória (§4.2)')
if (matriz.length === 0) {
  console.log('  (vazia — nenhuma célula de matriz neste plano; ver a nota do gerador e §4.1)')
} else {
  console.log(cabecalhoTabela(largura, 'veredito'))
  for (const r of matriz) console.log(linhaConfronto(r, largura, ROTULO_VEREDITO[r.veredito]))
}
console.log('')

console.log('espelhos — diagnóstico de viés de lado (§4.2) · NÃO se espera 50%')
if (espelhos.length === 0) {
  console.log('  (nenhum espelho neste plano)')
} else {
  console.log(cabecalhoTabela(largura, 'leitura'))
  for (const r of espelhos) console.log(linhaConfronto(r, largura, 'diagnóstico de lado (winrate = time 0)'))
}
console.log('')

// --------------------------------------------------- protocolo A/B (§5.3) — P2.2 e P2.3

/**
 * O protocolo só roda quando alguém o pede (`--pacote` ou `--mutacao`). Duas linhas no máximo:
 *
 *   1. LINHA-BASE — a mesma composição dos dois lados, `itemBonus: {}` no lado "modificado". É o
 *      controle negativo de P2.3 e é a referência do delta. §5.4 mede 49,23% com `dummy`, e o que
 *      ela prova é que o pipeline não injeta assimetria por conta própria.
 *   2. TRATAMENTO — o pacote/mutação pedido. Só existe se o pacote não for vazio; pedir
 *      `--pacote=nenhum` é pedir a linha 1 e mais nada, e imprimir a mesma medição duas vezes com
 *      dois rótulos diferentes seria fabricar um delta de ruído puro.
 *
 * As duas linhas usam a MESMA seed base, de propósito: o delta é a diferença entre duas medições
 * sobre a mesma sequência de partidas, o que cancela boa parte da variância comum. (As metades de
 * cada linha continuam consumindo seeds distintas entre si, como §4.2/§4.3 especificam — o
 * pareamento é entre LINHAS, não dentro de uma.)
 */
const linhasAb: LinhaAb[] = []

if (flags.pacote !== null || flags.mutacoes.length > 0) {
  const alvo = flags.alvo!
  const bonusPedido: Partial<Record<StatKey, number>> = {}
  let rotuloPedido: string
  let notaTratamento: string

  if (flags.pacote !== null) {
    Object.assign(bonusPedido, PACOTES[flags.pacote])
    rotuloPedido = flags.pacote
    notaTratamento = `#1b — pacote '${flags.pacote}' (§5.2); bateria completa por personagem: --risco-1b`
  } else {
    for (const m of flags.mutacoes) bonusPedido[m.key] = (bonusPedido[m.key] ?? 0) + m.valor
    rotuloPedido = descreverBonus(bonusPedido)
    notaTratamento = 'P2.2 — teste de mutante'
  }

  const vazio = Object.keys(bonusPedido).length === 0
  const nControle = flags.n

  console.error(`  … protocolo A/B: linha-base (pacote vazio) — controle negativo P2.3`)
  const ctrl = rodarAb(flags.comp, alvo, {}, 'nenhum', nControle, flags.seed, inst)
  linhasAb.push({
    rotulo: 'nenhum',
    alvo,
    controle: true,
    res: ctrl.res,
    deltaPp: null,
    avisos: ctrl.avisos,
    nota: vazio ? 'P2.3 — controle negativo (pacote vazio)' : 'linha-base (§5.3)',
  })

  if (!vazio) {
    console.error(`  … protocolo A/B: ${rotuloPedido} → ${alvo}`)
    const trat = rodarAb(flags.comp, alvo, bonusPedido, rotuloPedido, flags.n, flags.seed, inst)
    linhasAb.push({
      rotulo: rotuloPedido,
      alvo,
      controle: false,
      res: trat.res,
      deltaPp: (trat.res.winrate - ctrl.res.winrate) * 100,
      avisos: trat.avisos,
      nota: notaTratamento,
    })
  }
}

/**
 * §5.4 — a bateria. Ela ALIMENTA `linhasAb` (a tabela A/B acima), em vez de montar uma tabela
 * própria: `n_dec`, `n_seeds`, IC, veredito de 3 estados, aviso de clamp e aviso de truncamento
 * são os mesmos de qualquer linha A/B e já estão formatados lá. A seção `risco #1b` que vem depois
 * é só a leitura de §6.3 por cima desses mesmos números — não uma segunda medição.
 */
const bateria1b: Bateria1b[] = flags.risco1b
  ? rodarBateria1b(flags.comp, flags.n, flags.seed, inst, linhasAb)
  : []

if (linhasAb.length > 0) {
  const larguraPacote = Math.max(16, ...linhasAb.map((l) => l.rotulo.length))
  console.log(`protocolo A/B — composição [${flags.comp.join(',')}] · linha-base espelhada (§5.3)`)
  console.log(
    `${'pacote'.padEnd(larguraPacote)} ${'alvo'.padEnd(7)} ${'n_dec'.padStart(6)} ${'n_seeds'.padStart(7)}  ` +
      `${'winrate'.padStart(7)}      IC     delta   veredito`,
  )
  for (const l of linhasAb) {
    const delta = l.deltaPp === null ? '—' : `${l.deltaPp >= 0 ? '+' : ''}${l.deltaPp.toFixed(2)}pp`
    console.log(
      `${l.rotulo.padEnd(larguraPacote)} ${l.alvo.padEnd(7)} ${String(l.res.nDec).padStart(6)} ` +
        `${String(l.res.nSeeds).padStart(7)}  ${pct(l.res.winrate).padStart(7)}  ±${l.res.icPp.toFixed(2).padStart(5)} ` +
        `${delta.padStart(9)}   ${ROTULO_VEREDITO[l.res.veredito].padEnd(14)} (${l.nota})` +
        (l.res.truncado ? '  ⚠ teto de seeds atingido' : '') +
        (l.avisos.length > 0 ? '  ⚠ CORTADO PELO TETO — ver abaixo' : ''),
    )
  }

  // AC 7 / §5.1 — o corolário. O aviso é loud e fica GRUDADO na tabela de propósito: um pacote
  // cortado em silêncio faz um teste de mutante negativo parecer falha do arnês, quando foi o
  // clamp funcionando. §5.1: "um +150% seria silenciosamente reduzido para +100%".
  for (const l of linhasAb) {
    for (const a of l.avisos) {
      console.log(
        `  ⚠ CLAMP em '${l.rotulo}': ${a.charId}.${a.key} pedido ${sinal(a.pedido)} (item + passiva) ` +
          `foi CORTADO para ${sinal(a.efetivo)} por Σ[${sinal(SIGMA_MIN[a.key])}, ${sinal(SIGMA_MAX[a.key])}] ` +
          'em recomputeStats' +
          (a.passiva !== 0 ? ` · a passiva ativa do personagem contribui ${sinal(a.passiva)}` : ''),
      )
      console.log(
        '    A linha acima mediu o valor CORTADO, não o pedido. Um veredito negativo aqui é o clamp ' +
          'funcionando, não falha do arnês (§5.1).',
      )
    }
  }

  console.log(
    '                 winrate = vitórias do LADO MODIFICADO / decididas · metade das seeds com o ' +
      'pacote no time 0, metade no time 1 (§5.3)',
  )

  /*
   * O 3º estado no CONTROLE merece uma linha própria, e a razão é a mesma de §4.4: "dentro de
   * 45–55% com IC de ±3,46pp não é aprovação, é falta de n". P2.3 é um portão de fase e alguém
   * que leia `? inconclusivo` como reprovação estaria lendo errado — o que falta é amostra, e
   * `--n` é piso por RF-48, não alvo. Medido nesta story: 52,25% ±3,46 a n=800 (inconclusivo),
   * 51,15% ±2,19 a n=2000 e 49,58% ±1,39 a n=5000 (os dois, dentro).
   */
  // A bateria de §5.4 traz um controle POR PERSONAGEM, então o aviso deixou de ser sobre "a"
  // linha-base. Com uma só (`--pacote`/`--mutacao`), o texto é o mesmo de `e2.6`, sem sufixo.
  const controles = linhasAb.filter((l) => l.controle)
  for (const ctrl of controles) {
    if (ctrl.res.veredito !== 'inconclusivo') continue
    const qual = controles.length > 1 ? ` (alvo ${ctrl.alvo})` : ''
    console.log(
      `                 ⚠ a LINHA-BASE${qual} saiu '? inconclusivo': o ponto (${pct(ctrl.res.winrate)}) está dentro de ` +
        `45–55% mas o IC de ±${ctrl.res.icPp.toFixed(2)}pp cruza a borda. Isso é falta de n, não desequilíbrio ` +
        `(§4.4) — --n é piso (RF-48). Suba --n para fechar o veredito.`,
    )
  }
  console.log('')
}

// --------------------------------------------------- risco #1b (§5.4 · §6.3) — delta por personagem

if (bateria1b.length > 0) imprimirRisco1b(bateria1b)

// --------------------------------------------------- instrumentação de graça (§4.5)

const ordenados = [...inst.ticks].sort((a, b) => a - b)
console.log(
  `rodadas          ${inst.rodadas} · mediana ${seg(mediana(ordenados))} · min ${seg(ordenados[0] ?? 0)} · max ${seg(ordenados[ordenados.length - 1] ?? 0)}`,
)
console.log(
  `morte súbita     ${pct(inst.rodadas > 0 ? inst.morteSubita / inst.rodadas : 0, 1)} das rodadas atingiram 60s   (risco #6)`,
)
// §6.3 imprime a taxa de empate POR CONFRONTO ("11.1% (espelho) · 0.8% (com mutante)") e §8.7
// explica por quê: a força da mutação interage com a taxa de empate, então o número agregado
// esconde justamente o efeito que o protocolo A/B está medindo. As linhas A/B entram aqui.
const contextos: { rotulo: string; nSeeds: number; nDec: number }[] = [
  ...resultados.map((r) => ({
    rotulo: `${r.confronto.rotulo}${r.confronto.espelho ? ' espelho' : ''}`,
    nSeeds: r.nSeeds,
    nDec: r.nDec,
  })),
  ...linhasAb.map((l) => ({ rotulo: `A/B ${l.rotulo}`, nSeeds: l.res.nSeeds, nDec: l.res.nDec })),
]
const porConfronto = contextos
  .map((c) => `${pct(c.nSeeds > 0 ? (c.nSeeds - c.nDec) / c.nSeeds : 0, 1)} (${c.rotulo})`)
  .slice(0, 4)
  .join(' · ')
console.log(
  `empates          ${pct(inst.rodadas > 0 ? inst.empates / inst.rodadas : 0, 1)} — ${inst.empates} de ${inst.rodadas} rodadas   (D-02)` +
    (contextos.length > 0 ? `\n                 por confronto: ${porConfronto}${contextos.length > 4 ? ' · …' : ''}` : ''),
)

const chars = [...inst.porChar.keys()].sort()
let primeira = true
for (const id of chars) {
  const c = inst.porChar.get(id)!
  const d = c.bolasRodada > 0 ? c.bolasRodada : 1
  console.log(
    `${primeira ? 'utilização      ' : '                '} ${id.padEnd(6)} ${(c.ativas / d).toFixed(2)} ativas/rodada · ` +
      `${(c.ults / d).toFixed(2)} ults/rodada · ${pct(c.semUlt / d, 1)} sem ult · ${pct(c.semAtiva / d, 1)} sem ativa`,
  )
  console.log(
    `                        1º cast (mediana): ativa ${c.primeiraAtiva.length > 0 ? seg(mediana(c.primeiraAtiva)) : '—'} · ` +
      `ult ${c.primeiraUlt.length > 0 ? seg(mediana(c.primeiraUlt)) : '—'}   (BOT-003: kit adiado ≠ kit morto)`,
  )
  primeira = false
}
if (linhasAb.length > 0) {
  console.log(
    '                 (a utilização agrega as rodadas do plano E do protocolo A/B, inclusive as ' +
      'mutadas — a taxa de empate por confronto acima separa as duas fontes)',
  )
}
// ------------------------- contadores de clamp (§7.3) e de margem de tunelamento (§7.4) · e2.8

/*
 * Impressos JUNTO da matriz de winrate, como §7.3 pede ("um contador por campo, imprimível junto da
 * matriz de winrate"), e rotulados pelo que são: recomendação de arquitetura registrada, NÃO
 * requisito de RF — não bloqueiam nenhum critério P2.1-P2.5 (`architecture-e2.md` §7, passo 8).
 *
 * Um bloco por CONTEXTO DE MEDIÇÃO, nunca um total agregado: um número que soma o confronto do
 * plano com as linhas do protocolo A/B não descreve nenhum dos dois, e é justamente a mistura que
 * o AC 6 proíbe. Os campos que não morderam ficam fora da tabela do console e continuam no
 * `--json`, um por um — resumir no console é legibilidade, esconder no dado seria outra coisa.
 */
if (contagens.length > 0) {
  const larguraCtx = Math.max(22, ...contagens.map((c) => c.rotulo.length))
  console.log(
    `contadores de observação — clamp (architecture.md §7.3) e margem de tunelamento (§7.4)\n` +
      `                 recomendação de arquitetura registrada · NÃO é requisito de RF e não bloqueia P2.1-P2.5`,
  )
  console.log(
    `  ${'contexto'.padEnd(larguraCtx)}  ${'recomputeStats'.padStart(14)}  ${'clamps que morderam'.padEnd(28)}  tunelamento (bola×tick)`,
  )
  for (const c of contagens) {
    const total = c.mordidas.reduce((s, m) => s + m.vezes, 0)
    const resumo =
      total === 0
        ? `nenhum, de ${c.porCampo.length} contadores`
        : `${total} corte(s) em ${c.mordidas.length} campo(s)`
    console.log(
      `  ${c.rotulo.padEnd(larguraCtx)}  ${String(c.chamadas).padStart(14)}  ${resumo.padEnd(28)}  ` +
        `${c.tunelamento.registros} de ${c.tunelamento.amostras}`,
    )
    for (const m of c.mordidas) {
      const frac = c.chamadas > 0 ? m.vezes / c.chamadas : 0
      console.log(
        `      ⚠ ${m.tabela} ${m.campo} mordeu ${m.vezes}× — ${pct(frac, 1)} das chamadas` +
          (frac >= 1
            ? ' · MORDE SEMPRE: o teto virou regra de jogo por acidente e §7.3 devolve isso ao usuário como decisão de produto'
            : ''),
      )
    }
    if (c.tunelamento.registros > 0) {
      console.log(
        `      ⚠ tunelamento: ${c.tunelamento.registros} observação(ões) passaram da margem — a colisão bola-bola é ` +
          'discreta (sem CCD) e um par nessa faixa pode se atravessar sem detecção (§7.4)',
      )
    }
  }
  console.log(
    '                 leitura (§7.3): clamp que nunca morde é rede de segurança barata e fica; que morde às vezes\n' +
      '                 está funcionando como projetado; que morde SEMPRE virou regra de jogo por acidente, e volta ao\n' +
      '                 usuário como decisão de produto em vez de constante escondida em sim/stats.ts.',
  )
  console.log(
    '                 leitura (§7.4): registro = hypot(vx,vy)·dt > 0.5×(2×menor soma de raios do mundo), por bola e por\n' +
      '                 tick. Zero é o esperado hoje (o pior caso do roster tem 45% de folga); o número existe para que o\n' +
      '                 vetor de crescimento — impulso de cast sem teto — apareça como medida, e não como suposição.',
  )
  console.log('')
}

console.log(
  `autotestes       veredito de 3 estados ✓ ${CASOS_VEREDITO.length}/${CASOS_VEREDITO.length} casos · ` +
    `IC n=800 ±${icPp(800).toFixed(2)}pp · IC n=10000 ±${icPp(10000).toFixed(2)}pp\n` +
    '                 pares ✓ 210/378 (roster sintético de 8) · troca de lado ✓ 7 ensaios ' +
    '(viés puro cancela, composição não, empate é nulo, espelho não cancela, IC sobre decididas, teto de seeds)\n' +
    `                 instrumentação §4.5 ✓ 3 rodadas sintéticas (4 contadores) · pacotes ✓ sinal de drag + ΣMIN/ΣMAX · ` +
    `--mutacao ✓ ${CASOS_MUTACAO.length} casos (NaN, Infinity, 1e400, 0x10, vazio)\n` +
    '                 protocolo A/B ✓ um personagem de um lado, outro lado intocado, não vira espelho · ' +
    `clamp ✓ 5 ensaios + ${NOMES_PACOTE.length * ROSTER.length} pacotes×roster\n` +
    `                 risco #1b ✓ controle primeiro mesmo com NOMES_PACOTE invertido (QA-E26-003) · ` +
    `gatilho ✓ ${CASOS_GATILHO_1B.length} casos (as duas bordas, +${LIMIAR_FISICO_PP}pp e +${LIMIAR_DANO_PP}pp)\n` +
    '                 contadores §7.3/§7.4 ✓ 15 ensaios (mordida != chamada, borda estrita, Σ e ABS separados, ' +
    'reset zera,\n                 desligado não conta, menor SOMA de raios, bola morta fora do denominador)',
)
console.log('')

// --------------------------------------------------- saída de máquina (§6.2 · --json)

if (flags.json) {
  console.log(
    JSON.stringify(
      {
        botVersion: BOT_VERSION,
        preset: PRESET_NOME,
        plano: plano.gerador,
        notaDoGerador: plano.nota,
        seedBase: flags.seed,
        nAlvo: flags.n,
        repetePersonagem: flags.repetePersonagem,
        auditoriaRoster: { slots: auditoria.slots, violacoes: auditoria.violacoes },
        matriz: matriz.map(serializar),
        // §4.2/AC 8: o espelho não carrega veredito de balanceamento nem no JSON. Um consumidor
        // de máquina que lesse `veredito: 'inconclusivo'` aqui cometeria exatamente o erro que a
        // seção separada existe para impedir — tratar viés de lado como célula de matriz.
        espelhos: espelhos.map((r) => ({
          ...serializar(r),
          veredito: 'diagnostico-de-lado',
          leitura: 'vies-de-lado-time-0',
        })),
        // §5.3 — o protocolo A/B é seção PRÓPRIA aqui também: `winrate` é do lado MODIFICADO, não
        // de uma composição, e um consumidor que o misturasse com `matriz` leria efeito de item
        // como célula de balanceamento de roster.
        protocoloAb: linhasAb.map((l) => ({
          pacote: l.rotulo,
          alvo: l.alvo,
          controle: l.controle,
          leitura: 'winrate-do-lado-modificado',
          nDec: l.res.nDec,
          nSeeds: l.res.nSeeds,
          vitorias: l.res.vitorias,
          winrate: l.res.winrate,
          icPp: l.res.icPp,
          deltaPp: l.deltaPp,
          veredito: l.res.veredito,
          truncado: l.res.truncado,
          nota: l.nota,
          clamp: l.avisos.map((a) => ({
            charId: a.charId,
            campo: a.key,
            pedido: a.pedido,
            passiva: a.passiva,
            efetivo: a.efetivo,
            sigmaMin: SIGMA_MIN[a.key],
            sigmaMax: SIGMA_MAX[a.key],
          })),
        })),
        /*
         * §5.4/§6.3 — a leitura do Risco #1b, por personagem. Só existe quando `--risco-1b` foi
         * pedido; `null` é "não medido", não "não disparou".
         *
         * `nota` está aqui e não só no console de propósito: um consumidor de máquina é
         * exatamente quem tentaria reduzir `personagens[]` a um booleano único. A regra que faria
         * essa redução não existe — §9/R-04 a devolveu ao @pm, para a Fase 5.
         */
        risco1b:
          bateria1b.length === 0
            ? null
            : {
                leitura: 'delta-por-personagem',
                limiaresDoGatilho: { fisicoMenorQuePp: LIMIAR_FISICO_PP, danoMaiorQuePp: LIMIAR_DANO_PP },
                nota:
                  'gatilho avaliado POR PERSONAGEM. Nenhuma agregação entre personagens é calculada — ' +
                  '§9/R-04 (resolução do usuário, 2026-07-28): a regra de agregação global é decisão da Fase 5.',
                personagens: bateria1b.map((b) => ({
                  charId: b.charId,
                  controle: { winrate: b.controle.winrate, nDec: b.controle.nDec, truncado: b.controle.truncado },
                  deltas: b.tratamentos.map((t) => ({
                    pacote: t.nome,
                    deltaPp: t.deltaPp,
                    winrate: t.res.winrate,
                    nDec: t.res.nDec,
                    icPp: t.res.icPp,
                    truncado: t.res.truncado,
                  })),
                  gatilho: b.gatilho,
                  gatilhoNaoAvaliavel: b.motivo,
                })),
              },
        /*
         * §7.3/§7.4 — os contadores por CONTEXTO de medição. Aqui vai a lista COMPLETA de
         * contadores declarados, inclusive os que ficaram em zero: no console eles são resumidos
         * para caber, e um consumidor de máquina que só recebesse os não-zerados não conseguiria
         * distinguir "este clamp nunca mordeu" (a primeira leitura de §7.3) de "este clamp não
         * tem contador". Campo sem aquele teto declarado continua ausente, que é o terceiro caso.
         */
        contadores: {
          fonte: 'architecture.md §7.3 (clamp) e §7.4 (margem de tunelamento)',
          natureza: 'recomendacao-de-arquitetura-nao-requisito-de-rf',
          contextos: contagens.map((c) => ({
            contexto: c.rotulo,
            recomputeStats: c.chamadas,
            clamp: c.porCampo.map((m) => ({ tabela: m.tabela, campo: m.campo, mordidas: m.vezes })),
            tunelamento: {
              registros: c.tunelamento.registros,
              amostras: c.tunelamento.amostras,
              condicao: 'hypot(vx,vy)*dt > 0.5*(2*menorSomaDeRaios)',
            },
          })),
        },
        instrumentacao: {
          rodadas: inst.rodadas,
          empates: inst.empates,
          taxaEmpate: inst.rodadas > 0 ? inst.empates / inst.rodadas : 0,
          morteSubita: inst.morteSubita,
          taxaMorteSubita: inst.rodadas > 0 ? inst.morteSubita / inst.rodadas : 0,
          duracaoTicks: {
            mediana: mediana(ordenados),
            min: ordenados[0] ?? 0,
            max: ordenados[ordenados.length - 1] ?? 0,
          },
          utilizacao: chars.map((id) => {
            const c = inst.porChar.get(id)!
            const d = c.bolasRodada > 0 ? c.bolasRodada : 1
            return {
              charId: id,
              bolasRodada: c.bolasRodada,
              ativasPorRodada: c.ativas / d,
              ultsPorRodada: c.ults / d,
              fracSemUlt: c.semUlt / d,
              fracSemAtiva: c.semAtiva / d,
              primeiraAtivaTickMediano: c.primeiraAtiva.length > 0 ? mediana(c.primeiraAtiva) : null,
              primeiraUltTickMediano: c.primeiraUlt.length > 0 ? mediana(c.primeiraUlt) : null,
            }
          }),
        },
      },
      null,
      2,
    ),
  )
}

function serializar(r: ResultadoConfronto) {
  return {
    confronto: r.confronto.rotulo,
    espelho: r.confronto.espelho,
    nDec: r.nDec,
    nSeeds: r.nSeeds,
    vitorias: r.vitorias,
    winrate: r.winrate,
    icPp: r.icPp,
    veredito: r.veredito,
    truncado: r.truncado,
  }
}
