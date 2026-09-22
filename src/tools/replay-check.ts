import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { RoundSetup } from '../sim/world.ts'
import { CODIGO_DESCONHECIDO, FORMATO_DO_REPLAY, FORMATO_DO_REPLAY_V1, type Replay } from '../net/replay.ts'
import { reproduzirPartida, type CorteDaRodada, type PartidaGravada } from './partida.ts'

/**
 * VERIFICADOR DE REPLAY (`docs/architecture-e4.md` §7.2, story `e4.6`, P4.3). Roda com
 * `npm run replay:check -- <arquivo.json | pasta> [...]`.
 *
 * Lê o arquivo que `server/main.ts` gravou, reproduz a partida a partir de `matchSeed + Decisao[] + Command[]`
 * e compara, com IGUALDADE EXATA, o hash, a duração, o vencedor, a seed e os lados de cada rodada, o placar e o
 * vencedor da partida com os que a sala do servidor gravou ao vivo (AC 5). Os hashes "ao vivo" são os
 * `ResultadoRodada.hash` do arquivo, calculados pelo `hashDoMundo` que o servidor injetou na sala. Se ele não
 * for o `hash()` de `tools/harness.ts` (um stub, uma lambda sobre outra função), nenhum hash bate aqui
 * (E43-ARC-001).
 *
 * **A reprodução não é reimplementada (AC 3).** Ela é `reproduzirPartida` de `tools/partida.ts`, a mesma que o
 * `sim:check` usa desde `e3.2`, e que já roda sem bot nenhum. Este arquivo só traduz o formato do replay para a
 * `PartidaGravada` que ela recebe e compara o resultado.
 *
 * **`bb.replay.v2` (`e4.12`, §7.3).** O arquivo diz por que cada rodada e a partida acabaram. Uma rodada `'wo'`
 * (a pausa de R-02 estourou) é reproduzida ATÉ o tick do corte, com o hash e os ticks comparados nesse tick, e
 * sai numa linha de W.O., nunca como divergência. Uma partida `'interrompida'` é conferida até a última rodada
 * fechada, sem placar nem vencedor de partida. O pool do arquivo vai à reprodução. O carimbo `codigo` só avisa:
 * um commit diferente do de quem verifica nunca reprova sozinho. A `v1` continua lida (AC 5).
 *
 * **POR QUE ESTA VERIFICAÇÃO RODA EM NODE, E NÃO NO NAVEGADOR (AC 6).** A igualdade exata só vale na MESMA
 * engine que simulou. A §1.5 mediu: Node e Chrome divergem em bits na mesma simulação, porque
 * `Math.atan2`/`sin`/`cos` não são iguais entre engines, e a divergência entra pelo ângulo da Muralha em
 * `chars/golem.ts:140`. O `hash()` quantizado bateu em 5/5 seeds mesmo assim, e isso NÃO é robustez: a §11.1
 * mostra que quantizar é arredondar, não dar tolerância. Dois valores a 1e-9 de distância caem em lados
 * opostos de uma fronteira de arredondamento com probabilidade pequena, mas não nula. Os 5/5 são o resultado
 * esperado de uma loteria com boas chances. O servidor é Node, então o instrumento do portão é o Node, onde a
 * igualdade é exata por construção. Um visualizador de replay no navegador fica fora de escopo. Se um dia
 * entrar, a comparação dele tem de deixar de ser `hash(a) === hash(b)` e passar a `|a − b| < ε`, com ε
 * declarado, sobre o estado e não sobre o hash.
 *
 * DIREÇÃO DAS SETAS (§2.2): `tools/replay-check.ts → net/replay.ts` (tipo e versão do formato),
 * `tools/partida.ts`. Nada importa este arquivo além de `tools/determinism.ts` (a guarda do AC 7).
 */

/**
 * AC 8 de `e4.6`, AC 5 de `e4.12` — lê o texto de um arquivo de replay. Aceita `FORMATO_DO_REPLAY` (v2) e
 * `FORMATO_DO_REPLAY_V1`. Qualquer outro formato, ou nenhum, LANÇA: um replay de versão desconhecida não é
 * reinterpretado em silêncio. A v1 sai com os padrões que ela supunha sem dizer: toda rodada `'natural'`, partida
 * `'fim'`, pool `['golem','vex']` e código desconhecido. Também confere a forma mínima que a reprodução lê.
 */
export function lerReplay(texto: string): Replay {
  let bruto: unknown
  try {
    bruto = JSON.parse(texto)
  } catch (err) {
    throw new Error(`replay: o arquivo não é JSON (${err instanceof Error ? err.message : String(err)})`)
  }
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) throw new Error('replay: o arquivo não é um objeto')
  const r = bruto as Record<string, unknown>
  if (r.formato !== FORMATO_DO_REPLAY && r.formato !== FORMATO_DO_REPLAY_V1) {
    throw new Error(
      `replay: formato ${JSON.stringify(r.formato)} não é '${FORMATO_DO_REPLAY}' nem '${FORMATO_DO_REPLAY_V1}'. Este verificador lê só estas ` +
        'versões; um replay de outra versão precisa do verificador da versão dele, e não é convertido aqui',
    )
  }
  const v1 = r.formato === FORMATO_DO_REPLAY_V1
  if (typeof r.matchSeed !== 'number' || !Number.isInteger(r.matchSeed)) throw new Error('replay: matchSeed ausente ou não inteiro')
  if (!Array.isArray(r.decisoes)) throw new Error('replay: decisoes não é lista')
  if (!Array.isArray(r.rodadas)) throw new Error('replay: rodadas não é lista')
  for (const [i, x] of (r.rodadas as unknown[]).entries()) {
    const rod = x as Record<string, unknown> | null
    if (typeof rod !== 'object' || rod === null || !Array.isArray(rod.comandos) || typeof rod.aoVivo !== 'object' || rod.aoVivo === null) {
      throw new Error(`replay: a rodada ${i} não tem comandos (lista) e aoVivo (objeto)`)
    }
    if (!v1 && rod.encerramento !== 'natural' && rod.encerramento !== 'wo') {
      throw new Error(`replay: a rodada ${i} tem encerramento ${JSON.stringify(rod.encerramento)}, fora de 'natural' | 'wo'`)
    }
  }
  if (!Array.isArray(r.placar) || r.placar.length !== 2) throw new Error('replay: placar não é um par')
  if (r.vencedor !== 0 && r.vencedor !== 1 && r.vencedor !== -1) throw new Error('replay: vencedor fora de 0 | 1 | -1')
  if (v1) {
    // AC 5 — exatamente o que a v1 supunha, sem dizer
    const rodadas = (r.rodadas as Record<string, unknown>[]).map((x) => ({ ...x, encerramento: 'natural' }))
    return { ...r, rodadas, pool: ['golem', 'vex'], codigo: { ...CODIGO_DESCONHECIDO }, encerramento: 'fim' } as unknown as Replay
  }
  if (!Array.isArray(r.pool) || r.pool.length === 0 || !r.pool.every((x) => typeof x === 'string')) throw new Error('replay: pool não é uma lista de strings não vazia')
  const c = r.codigo as Record<string, unknown> | null
  if (typeof c !== 'object' || c === null || (c.commit !== null && typeof c.commit !== 'string') || (c.sujo !== null && typeof c.sujo !== 'boolean')) {
    throw new Error('replay: codigo não é { commit: string | null; sujo: boolean | null }')
  }
  if (r.encerramento !== 'fim' && r.encerramento !== 'interrompida') throw new Error(`replay: encerramento ${JSON.stringify(r.encerramento)} fora de 'fim' | 'interrompida'`)
  return bruto as Replay
}

/**
 * A `PartidaGravada` que `reproduzirPartida` recebe. Ela lê `matchSeed`, `decisoes` e o `comandos` de cada
 * rodada, e nada mais. O `setup` de cada rodada NÃO está no replay (a reprodução o recalcula do estado,
 * `partida.ts` em `fecharRodada`), e aqui ele é um getter que lança: se um dia a reprodução passar a lê-lo, o
 * verificador falha alto em vez de reproduzir contra um setup inventado.
 */
function comoPartidaGravada(r: Replay): PartidaGravada {
  return {
    matchSeed: r.matchSeed,
    decisoes: r.decisoes,
    rodadas: r.rodadas.map((x, i) => ({
      get setup(): RoundSetup {
        throw new Error(`replay-check: a reprodução leu o setup da rodada ${i}, que o replay não grava (tools/partida.ts mudou?)`)
      },
      comandos: x.comandos,
      resultado: x.aoVivo,
    })),
    placar: r.placar,
    vencedor: r.vencedor,
    eventos: [],
    rejeicoes: [],
  }
}

/**
 * `e4.12`, AC 1 — o corte de cada rodada `'wo'`: o tick e o vencedor gravados ao vivo. A `'natural'` não tem corte,
 * e o vencedor dela é o que a reprodução calcula. Um vencedor `-1` num W.O. não vira corte: vira problema.
 */
function cortesDe(r: Replay): (CorteDaRodada | null)[] {
  return r.rodadas.map((x) => (x.encerramento === 'wo' && (x.aoVivo.vencedor === 0 || x.aoVivo.vencedor === 1) ? { tick: x.aoVivo.ticks, vencedor: x.aoVivo.vencedor } : null))
}

export interface VerificacaoDeReplay {
  /** vazio = a partida reproduzida é, campo a campo, a gravada ao vivo */
  problemas: string[]
  /**
   * `e4.12` — linhas que NÃO reprovam: a de cada W.O. conferido, a da partida interrompida e o aviso de commit
   * diferente (AC 1, AC 2, AC 4)
   */
  avisos: string[]
  rodadas: number
  placar: string
  vencedores: string
  hashes: string[]
}

/**
 * AC 5 de `e4.6` — reproduz e compara com igualdade exata. Nunca lança: falha de reprodução vira problema.
 *
 * `e4.12` — `commitDoVerificador` é o `git rev-parse HEAD` de quem verifica (o CLI o lê; a guarda passa o que
 * quiser). Diferente do `codigo.commit` gravado, vira aviso, e nunca problema (AC 4).
 */
export function verificarReplay(r: Replay, commitDoVerificador: string | null = null): VerificacaoDeReplay {
  const problemas: string[] = []
  const avisos: string[] = []
  const v: VerificacaoDeReplay = {
    problemas,
    avisos,
    rodadas: r.rodadas.length,
    placar: r.placar.join('-'),
    vencedores: r.rodadas.map((x) => x.aoVivo.vencedor).join(' '),
    hashes: r.rodadas.map((x) => x.aoVivo.hash),
  }
  const interrompida = r.encerramento === 'interrompida'
  const commitDiferente = r.codigo.commit !== null && commitDoVerificador !== null && r.codigo.commit !== commitDoVerificador
  if (commitDiferente) avisos.push(`replay gravado em ${r.codigo.commit}, verificado em ${commitDoVerificador}`)
  const fechar = (): VerificacaoDeReplay => {
    if (commitDiferente && problemas.length > 0) avisos.push('pode ser mudança de código, não de determinismo')
    return v
  }
  for (const [i, x] of r.rodadas.entries()) {
    if (x.encerramento === 'wo' && x.aoVivo.vencedor !== 0 && x.aoVivo.vencedor !== 1) {
      problemas.push(`rodada ${i}: W.O. com vencedor ${x.aoVivo.vencedor} ao vivo; o W.O. sempre tem um presente (AC 1)`)
    }
  }
  let rep: ReturnType<typeof reproduzirPartida>
  try {
    rep = reproduzirPartida(comoPartidaGravada(r), {
      pool: r.pool,
      cortes: cortesDe(r),
      pararDepoisDeRodadas: interrompida ? r.rodadas.length : undefined,
    })
  } catch (err) {
    problemas.push(`a reprodução não chegou ao fim da partida: ${err instanceof Error ? err.message : String(err)}`)
    return fechar()
  }
  for (const x of rep.recusadas) problemas.push(`a reprodução recusou uma decisão que a sala aceitou ao vivo: ${x}`)
  if (interrompida) {
    // AC 2 — não há placar nem vencedor de partida para comparar; as decisões gravadas vão até a última rodada fechada
    if (rep.chegouAoFim) problemas.push('o arquivo diz partida interrompida, e a reprodução chegou à fase fim')
    if (rep.decisoesConsumidas !== r.decisoes.length) {
      problemas.push(`partida interrompida: a reprodução consumiu ${rep.decisoesConsumidas} de ${r.decisoes.length} decisão(ões) gravada(s)`)
    }
  } else {
    if (rep.placar[0] !== r.placar[0] || rep.placar[1] !== r.placar[1]) problemas.push(`placar reproduzido ${rep.placar.join('-')} != ${r.placar.join('-')} ao vivo`)
    if (rep.vencedor !== r.vencedor) problemas.push(`vencedor da partida reproduzido ${rep.vencedor} != ${r.vencedor} ao vivo`)
  }
  if (rep.rodadas.length !== r.rodadas.length) {
    problemas.push(`${rep.rodadas.length} rodada(s) reproduzida(s) != ${r.rodadas.length} gravada(s) ao vivo`)
  }
  for (let i = 0; i < Math.min(rep.rodadas.length, r.rodadas.length); i++) {
    const a = r.rodadas[i].aoVivo
    const b = rep.rodadas[i]
    const wo = r.rodadas[i].encerramento === 'wo'
    const campos: [string, string | number, string | number][] = [
      ['indice', a.indice, b.indice],
      ['hash', a.hash, b.hash],
      ['ticks', a.ticks, b.ticks],
      ['seedDaRodada', a.seedDaRodada, b.seedDaRodada],
      ['ladoDoJogador', a.ladoDoJogador.join(','), b.ladoDoJogador.join(',')],
    ]
    // AC 1 — o vencedor de um W.O. é dado gravado (o corte o leva à reprodução); o de uma natural é conferido
    if (!wo) campos.push(['vencedor', a.vencedor, b.vencedor])
    let iguais = true
    for (const [campo, aoVivo, reproduzido] of campos) {
      if (aoVivo !== reproduzido) {
        iguais = false
        problemas.push(`rodada ${i}${wo ? ' (W.O.)' : ''}: ${campo} reproduzido ${reproduzido} != ${aoVivo} ao vivo`)
      }
    }
    if (wo && iguais) avisos.push(`rodada ${i}: W.O. no tick ${a.ticks}, hash ✓ (vencedor ${a.vencedor}, dado gravado)`)
  }
  if (interrompida) avisos.push(`partida interrompida antes do fim: ${Math.min(rep.rodadas.length, r.rodadas.length)} rodada(s) verificada(s)`)
  return fechar()
}

// --------------------------------------------------------------------------- CLI

function arquivosDe(caminho: string): string[] {
  if (!statSync(caminho).isDirectory()) return [caminho]
  return readdirSync(caminho)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => join(caminho, f))
}

/** `e4.12`, AC 4 — o commit de quem verifica, para o aviso de commit diferente. Sem git, `null` (e nenhum aviso). */
function commitDoVerificador(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null
  } catch {
    return null
  }
}

function main(): void {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('uso: npm run replay:check -- <arquivo.json | pasta> [...]  (a pasta é a de BB_REPLAYS do servidor)')
    process.exit(2)
  }
  let arquivos: string[]
  try {
    arquivos = args.flatMap(arquivosDe)
  } catch (err) {
    console.error(`replay:check: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(2)
  }
  if (arquivos.length === 0) {
    console.error(`replay:check: nenhum .json em ${args.join(', ')}`)
    process.exit(2)
  }
  const commit = commitDoVerificador()
  let falhas = 0
  for (const arq of arquivos) {
    let problemas: string[]
    let avisos: string[] = []
    let resumo = ''
    try {
      const texto = readFileSync(arq, 'utf8')
      const replay = lerReplay(texto)
      const v = verificarReplay(replay, commit)
      problemas = v.problemas
      avisos = v.avisos
      resumo =
        `${replay.formato} · ${v.rodadas} rodada(s) · ${replay.encerramento === 'interrompida' ? 'interrompida' : `placar ${v.placar}`} · ` +
        `venc/rodada [${v.vencedores}] · hashes [${v.hashes.join(' ')}] · ${Buffer.byteLength(texto, 'utf8')} B`
    } catch (err) {
      problemas = [err instanceof Error ? err.message : String(err)]
    }
    if (problemas.length === 0) {
      console.log(`✓ ${arq}: reproduzido com hashes, ticks e vencedores idênticos — ${resumo}`)
    } else {
      falhas++
      console.log(`✗ ${arq}${resumo ? `: ${resumo}` : ''}`)
      for (const p of problemas) console.log(`    ${p}`)
    }
    for (const a of avisos) console.log(`    · ${a}`)
  }
  console.log(
    `\nreplay:check: ${arquivos.length - falhas}/${arquivos.length} replay(s) com os mesmos hashes de rodada, placar e vencedores, ` +
      `na mesma engine (Node ${process.version}; W.O. conferido no tick do corte, interrompida até a última rodada fechada). ` +
      'O hash() é quantizado: ele prova igualdade de hash, não de cada bit do estado (§11.1)',
  )
  process.exit(falhas === 0 ? 0 : 1)
}

if (import.meta.main) main()
