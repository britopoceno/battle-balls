import { CHAVE, criarTelemetria, type ArquivoTelemetria, type EventoRegistrado, type EventoTelemetria } from '../client/telemetria.ts'
import { agregar } from './telemetria.ts'

/**
 * GUARDA DA TELEMETRIA — story `debt.11`, achado `DEBT10-TST-001` do gate de `debt.10`.
 *
 * Roda dentro do `sim:check` (`docs/architecture-e4.md` §2.2, opção D) e protege as duas coisas que
 * `debt.10` entregou e que nenhum outro comando exercitava: o **carimbo por evento** no `registrar()`
 * do coletor (`client/telemetria.ts`) e a **partição por população** em `agregar()`
 * (`tools/telemetria.ts`). As 4 mutações que o gate de `debt.10` mostrou invisíveis para
 * `check`/`sim:check`/`build` (M1, M1b, M2, M3) reprovam esta guarda — e, por ela, o `sim:check`.
 *
 * Mesmo molde de `verificarPartida` (`tools/partida.ts`): devolve linhas e problemas, **nunca lança
 * e nunca chama `process.exit`**. Quem decide se o `sim:check` falha é o bloco `throw` de
 * `determinism.ts` (R1).
 *
 * **Coletor real, não réplica (R3).** O cenário é o do gate de `debt.10`: um `localStorage` falso que
 * já contém um evento antigo sem carimbo; `criarTelemetria()` o lê, `registrar()` grava eventos novos
 * e `exportar()` entrega o arquivo, capturado no `Blob`. As duas direções são afirmadas sobre o
 * arquivo exportado: evento novo com carimbo finito (pega a M1) e evento antigo ainda sem carimbo
 * (pega a M1b). Uma só delas deixaria passar a outra mutação.
 *
 * **Uma só definição de "sem carimbo" (R6):** `!Number.isFinite`, a mesma de `populacaoDe()` no
 * agregador. `DEBT10-COD-003` (alinhar `ler()`) não entra nesta story, então a guarda NÃO afirma nada
 * sobre a contagem do aviso de `ler()` — só que ele avisou.
 */

/** A definição única de R6 — igual à de `populacaoDe()` em `tools/telemetria.ts`. */
function semCarimbo(e: { atrasoTicks?: unknown; escalaHp?: unknown }): boolean {
  return !Number.isFinite(e.atrasoTicks) || !Number.isFinite(e.escalaHp)
}

// --------------------------------------------------------------------------- fixture misto (R4)

/**
 * Carimbo explícito de um evento do fixture. `unknown` porque o fixture precisa de valores que o tipo
 * do coletor não admite (`null`, o que sobra de um arquivo editado à mão) — e é exatamente o que o
 * agregador tem de ler como DESCONHECIDO.
 */
type Carimbo = { atrasoTicks?: unknown; escalaHp?: unknown }

function rodadaFim(partida: number, rodada: number, duracaoMs: number, carimbo: Carimbo): EventoRegistrado {
  const e: EventoTelemetria = {
    t: 'rodadaFim',
    rodada,
    duracaoMs,
    vencedor: 0,
    atingiu60s: false,
    controle: ['humano', 'bot'],
  }
  return { ...e, partida, ...carimbo } as EventoRegistrado
}

/**
 * O fixture misto, em código e não em `docs/` (R4): duas populações conhecidas com rodadas de humano
 * — (6, 6) com n=3 e (0, 6) com n=2 — mais 2 eventos sem carimbo (um sem os campos, um com `null`).
 * O `n` combinado é 7 e **nenhuma população tem 7**: é a propriedade que discrimina um agregador que
 * particiona de um que soma tudo (M3), e a mesma que o @qa usou no gate de `debt.10`.
 */
const FIXTURE: readonly EventoRegistrado[] = [
  rodadaFim(11, 1, 21000, { atrasoTicks: 6, escalaHp: 6 }),
  rodadaFim(11, 2, 23000, { atrasoTicks: 6, escalaHp: 6 }),
  rodadaFim(11, 3, 25000, { atrasoTicks: 6, escalaHp: 6 }),
  rodadaFim(22, 1, 19000, { atrasoTicks: 0, escalaHp: 6 }),
  rodadaFim(22, 2, 20000, { atrasoTicks: 0, escalaHp: 6 }),
  rodadaFim(33, 1, 14000, {}),
  rodadaFim(33, 2, 15000, { atrasoTicks: null, escalaHp: null }),
]
const POPULACOES_FIXTURE = 3
const N_COMBINADO_FIXTURE = FIXTURE.filter((e) => e.t === 'rodadaFim').length
const SEM_CARIMBO_FIXTURE = FIXTURE.filter(semCarimbo).length

/** Cabeçalho do bloco P3.1 de cada população, verbatim de `agregarPopulacao()`. */
const CABECALHO_P31 = 'P3.1  mediana da rodada com humano no controle'
const ROTULO_POPULACAO = 'população: '

// --------------------------------------------------------------------------- globais (R3, P1–P3)

type Par = readonly [alvo: object, chave: string]

/** Campos de um descritor, comparados um a um (P3): `value`/`get`/`set` por `Object.is`, atributos por igualdade. */
const CAMPOS_DESCRITOR = ['value', 'get', 'set', 'writable', 'enumerable', 'configurable'] as const

/** Igualdade campo a campo, inclusive a presença de cada campo, e "ausente" conta como estado (P3). Nunca `JSON.stringify`. */
function mesmoDescritor(a: PropertyDescriptor | undefined, b: PropertyDescriptor | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  return CAMPOS_DESCRITOR.every((c) => c in a === c in b && Object.is(a[c], b[c]))
}

/**
 * Troca `alvo[chave]` por `valor`. Se a propriedade tinha descritor próprio, o atributo `enumerable`
 * dele é mantido; se não tinha, ela é CRIADA com `configurable: true`, senão o `delete` da restauração
 * lançaria (P3).
 */
function instalar(alvo: object, chave: string, valor: unknown, original: PropertyDescriptor | undefined): void {
  Object.defineProperty(alvo, chave, {
    value: valor,
    writable: true,
    enumerable: original?.enumerable ?? true,
    configurable: true,
  })
}

/**
 * Volta `alvo[chave]` ao estado de antes (ratificação de R3). **Tinha descritor:** `defineProperty`
 * com ele, nunca `delete` — é o caso que protege um `localStorage` nativo de um Node futuro. **Não
 * tinha:** a propriedade é a que a guarda criou, e apagá-la é o único jeito de voltar a "ausente";
 * atribuir `undefined` deixaria uma propriedade que não existia (MR2).
 */
function restaurar(alvo: object, chave: string, original: PropertyDescriptor | undefined): boolean {
  if (original) {
    Object.defineProperty(alvo, chave, original)
    return true
  }
  return Reflect.deleteProperty(alvo, chave)
}

// --------------------------------------------------------------------------- a guarda

export function verificarTelemetria(): { linhas: string[]; problemas: string[] } {
  const linhas: string[] = []
  const problemas: string[] = []

  // ---- estado capturado durante a guarda
  const avisos: string[] = []
  const armazenamento = new Map<string, string>()
  let conteudoExportado: string | undefined
  let urlCriada: string | undefined
  let urlRevogada: string | undefined
  let cliques = 0

  class BlobFalso {
    readonly partes: string[]
    constructor(partes: readonly unknown[]) {
      this.partes = partes.map(String)
    }
  }
  const localStorageFalso = {
    getItem: (k: string): string | null => armazenamento.get(k) ?? null,
    setItem: (k: string, v: string): void => void armazenamento.set(k, String(v)),
    removeItem: (k: string): void => void armazenamento.delete(k),
  }
  const documentFalso = {
    createElement: () => ({
      href: '',
      download: '',
      click: () => {
        cliques++
      },
    }),
  }
  const createObjectURLFalso = (b: unknown): string => {
    conteudoExportado = b instanceof BlobFalso ? b.partes.join('') : undefined
    urlCriada = 'blob:guarda-telemetria'
    return urlCriada
  }
  const revokeObjectURLFalso = (u: string): void => {
    urlRevogada = u
  }
  const warnFalso = (...args: unknown[]): void => {
    avisos.push(args.map(String).join(' '))
  }

  // ---- P1: cada par (objeto, chave) trocado, inclusive propriedades de global nativo
  const trocas: readonly [Par, unknown][] = [
    [[console, 'warn'], warnFalso],
    [[globalThis, 'localStorage'], localStorageFalso],
    [[globalThis, 'document'], documentFalso],
    [[globalThis, 'Blob'], BlobFalso],
    [[URL, 'createObjectURL'], createObjectURLFalso],
    [[URL, 'revokeObjectURL'], revokeObjectURLFalso],
  ]
  // P3: TODOS os descritores capturados antes da primeira instalação
  const originais = trocas.map(([[alvo, chave]]) => Object.getOwnPropertyDescriptor(alvo, chave))

  let instalados = 0
  let exportados = 0
  let novosCarimbados = 0
  let antigosSemCarimbo = 0
  let blocosP31 = 0
  let populacoes = 0
  try {
    for (const [[alvo, chave], valor] of trocas) {
      instalar(alvo, chave, valor, originais[instalados])
      instalados++
    }

    // ---- cenário do coletor (gate de debt.10): acúmulo antigo SEM carimbo já gravado sob CHAVE
    const PARTIDA_ANTIGA = 900
    const PARTIDA_NOVA = 901
    const antigo = rodadaFim(PARTIDA_ANTIGA, 1, 18000, {})
    armazenamento.set(CHAVE, JSON.stringify([antigo]))

    const avisosAntesDoColetor = avisos.length
    const telemetria = criarTelemetria()
    const avisosDeLer = avisos.length - avisosAntesDoColetor
    const novos: EventoTelemetria[] = [
      { t: 'rodadaFim', rodada: 1, duracaoMs: 22000, vencedor: 1, atingiu60s: false, controle: ['humano', 'bot'] },
      { t: 'cast', rodada: 1, ballIndex: 0, ponteiro: 1, ladoDaTela: 'dir', mag: 0.8, anguloErro: 12 },
    ]
    telemetria.registrar(PARTIDA_NOVA, novos)
    telemetria.exportar()

    if (avisosDeLer === 0) {
      problemas.push('  ✗ telemetria: ler() não avisou sobre o acúmulo sem carimbo — o cenário do gate de debt.10 não foi montado')
    }
    if (avisos.some((a) => a.includes('não foi possível persistir'))) {
      problemas.push('  ✗ telemetria: persistir() falhou no localStorage falso — o cenário não mede o coletor')
    }
    if (cliques !== 1 || urlCriada === undefined || urlRevogada !== urlCriada) {
      problemas.push(`  ✗ telemetria: exportar() não seguiu Blob → createObjectURL → click → revokeObjectURL (cliques ${cliques})`)
    }
    if (conteudoExportado === undefined) {
      problemas.push('  ✗ telemetria: exportar() não entregou conteúdo capturável no Blob')
    } else {
      const arquivo = JSON.parse(conteudoExportado) as ArquivoTelemetria
      const eventos = Array.isArray(arquivo.eventos) ? arquivo.eventos : []
      exportados = eventos.length
      const doExportAntigo = eventos.filter((e) => e.partida === PARTIDA_ANTIGA)
      const doExportNovo = eventos.filter((e) => e.partida === PARTIDA_NOVA)
      novosCarimbados = doExportNovo.filter((e) => !semCarimbo(e)).length
      antigosSemCarimbo = doExportAntigo.filter(semCarimbo).length
      if (arquivo.versao !== CHAVE) {
        problemas.push(`  ✗ telemetria: export com versao ${JSON.stringify(arquivo.versao)} em vez de ${CHAVE}`)
      }
      if (doExportAntigo.length !== 1 || doExportNovo.length !== novos.length) {
        problemas.push(
          `  ✗ telemetria: export com ${doExportAntigo.length} evento(s) antigo(s) e ${doExportNovo.length} novo(s) — esperado 1 e ${novos.length}`,
        )
      }
      // M1: registrar() deixou de carimbar
      if (novosCarimbados !== doExportNovo.length) {
        problemas.push(
          `  ✗ telemetria: ${doExportNovo.length - novosCarimbados} evento(s) novo(s) sem atrasoTicks/escalaHp finitos no export — registrar() deixou de carimbar (M1)`,
        )
      }
      // M1b: o carimbo foi para exportar() e reescreveu o acúmulo antigo com o valor de hoje
      if (antigosSemCarimbo !== doExportAntigo.length) {
        problemas.push(
          `  ✗ telemetria: o evento antigo saiu carimbado no export — o carimbo está sendo aplicado fora de registrar() e inventa o valor histórico (M1b)`,
        )
      }
    }

    // ---- agregar() sobre o fixture misto: leitura por rótulo e cabeçalho, não por número formatado (R5)
    const avisosAntesDoAgregador = avisos.length
    const saida = agregar(FIXTURE)
    const avisosDoAgregador = avisos.slice(avisosAntesDoAgregador)
    blocosP31 = saida.filter((l) => l === CABECALHO_P31).length
    const indicesPopulacao = saida.flatMap((l, i) => (l.startsWith(ROTULO_POPULACAO) ? [i] : []))
    populacoes = indicesPopulacao.length
    const desconhecidas = indicesPopulacao.filter((i) => saida[i].includes('desconhecid'))

    // M3: sem partição, sai um bloco só
    if (blocosP31 !== POPULACOES_FIXTURE || populacoes !== POPULACOES_FIXTURE) {
      problemas.push(
        `  ✗ telemetria: agregar() do fixture deu ${blocosP31} bloco(s) P3.1 e ${populacoes} rótulo(s) de população — esperado ${POPULACOES_FIXTURE} de cada (M3: sem partição)`,
      )
    }
    if (!saida[0]?.startsWith('⚠')) {
      problemas.push('  ✗ telemetria: agregar() do fixture misto não abriu com o aviso de populações separadas')
    }
    // M2: ausente virou atraso 0 / escala 1.0 e a população desconhecida sumiu
    if (desconhecidas.length !== 1 || desconhecidas[0] !== indicesPopulacao[indicesPopulacao.length - 1]) {
      problemas.push(
        `  ✗ telemetria: ${desconhecidas.length} população(ões) "desconhecida" no agregado — esperada 1, a última (M2: ausente lido como atraso 0 / escala 1.0)`,
      )
    } else {
      // R6: a população desconhecida tem exatamente os eventos que a definição única chama de sem carimbo
      const cabecalho = saida[desconhecidas[0] + 1] ?? ''
      if (!cabecalho.startsWith(`eventos ${SEM_CARIMBO_FIXTURE} ·`)) {
        problemas.push(
          `  ✗ telemetria: a população desconhecida abre com "${cabecalho}" — esperado ${SEM_CARIMBO_FIXTURE} evento(s), os que !Number.isFinite chama de sem carimbo (R6)`,
        )
      }
    }
    if (saida.some((l) => l.includes(`(n=${N_COMBINADO_FIXTURE}`))) {
      problemas.push(`  ✗ telemetria: agregar() reportou um bloco com o n combinado (${N_COMBINADO_FIXTURE}) — populações somadas`)
    }
    if (!avisosDoAgregador.some((a) => a.includes('sem carimbo'))) {
      problemas.push('  ✗ telemetria: agregar() não avisou sobre os eventos sem carimbo do fixture')
    }
  } catch (err) {
    problemas.push(`  ✗ telemetria: a guarda lançou — ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    // na ordem inversa da instalação, e só o que chegou a ser instalado
    for (let i = instalados - 1; i >= 0; i--) {
      const [[alvo, chave]] = trocas[i]
      try {
        if (!restaurar(alvo, chave, originais[i])) problemas.push(`  ✗ globais: não foi possível remover ${chave}`)
      } catch (err) {
        problemas.push(`  ✗ globais: restaurar ${chave} lançou — ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  // ---- critério verificável do AC 5, conferido pela própria guarda depois do finally
  let divergentes = 0
  trocas.forEach(([[alvo, chave]], i) => {
    if (mesmoDescritor(Object.getOwnPropertyDescriptor(alvo, chave), originais[i])) return
    divergentes++
    const dono = alvo === globalThis ? 'globalThis' : alvo === URL ? 'URL' : 'console'
    problemas.push(
      `  ✗ globais: ${dono}.${chave} não voltou ao descritor de antes (${originais[i] ? 'tinha descritor próprio' : 'estava ausente'})`,
    )
  })
  const comDescritor = originais.filter((d) => d !== undefined).length
  // P2: sem este ramo, uma restauração que sempre faz delete passaria verde no Node do projeto
  if (comDescritor === 0) {
    problemas.push('  ✗ globais: nenhum par trocado tinha descritor próprio — o ramo defineProperty da restauração não roda (P2)')
  }

  const ok = problemas.length === 0
  linhas.push(
    `telemetria     ${ok ? '✓ ok' : `✗ ${problemas.length} problema(s)`} — coletor real: ${novosCarimbados} evento(s) novo(s) carimbado(s), ${antigosSemCarimbo} antigo(s) sem carimbo no export (${exportados}) · agregar() do fixture: ${blocosP31} bloco(s) P3.1, ${populacoes} população(ões)${ok ? ', a desconhecida à parte, nenhum n combinado' : ''}`,
  )
  linhas.push(
    `globais        ${divergentes === 0 ? '✓ ok' : `✗ ${divergentes} divergente(s)`} — ${trocas.length} pares (objeto, chave) trocados: ${comDescritor} com descritor próprio, ${trocas.length - comDescritor} ausentes${divergentes === 0 ? ', todos de volta ao descritor de antes' : ''} · ${avisos.length} console.warn capturado(s)`,
  )
  linhas.push('')
  return { linhas, problemas }
}
