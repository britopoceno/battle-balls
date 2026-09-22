import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { RoundSetup } from '../sim/world.ts'
import { FORMATO_DO_REPLAY, type Replay } from '../net/replay.ts'
import { reproduzirPartida, type PartidaGravada } from './partida.ts'

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
 * AC 8 — lê o texto de um arquivo de replay. Formato diferente de `FORMATO_DO_REPLAY`, ou ausente, LANÇA: um
 * replay de outra versão não é reinterpretado em silêncio. Também confere a forma mínima que a reprodução lê.
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
  if (r.formato !== FORMATO_DO_REPLAY) {
    throw new Error(
      `replay: formato ${JSON.stringify(r.formato)} não é '${FORMATO_DO_REPLAY}'. Este verificador lê só esta versão; ` +
        'um replay de outra versão precisa do verificador da versão dele, e não é convertido aqui',
    )
  }
  if (typeof r.matchSeed !== 'number' || !Number.isInteger(r.matchSeed)) throw new Error('replay: matchSeed ausente ou não inteiro')
  if (!Array.isArray(r.decisoes)) throw new Error('replay: decisoes não é lista')
  if (!Array.isArray(r.rodadas)) throw new Error('replay: rodadas não é lista')
  for (const [i, x] of (r.rodadas as unknown[]).entries()) {
    const rod = x as Record<string, unknown> | null
    if (typeof rod !== 'object' || rod === null || !Array.isArray(rod.comandos) || typeof rod.aoVivo !== 'object' || rod.aoVivo === null) {
      throw new Error(`replay: a rodada ${i} não tem comandos (lista) e aoVivo (objeto)`)
    }
  }
  if (!Array.isArray(r.placar) || r.placar.length !== 2) throw new Error('replay: placar não é um par')
  if (r.vencedor !== 0 && r.vencedor !== 1 && r.vencedor !== -1) throw new Error('replay: vencedor fora de 0 | 1 | -1')
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

export interface VerificacaoDeReplay {
  /** vazio = a partida reproduzida é, campo a campo, a gravada ao vivo */
  problemas: string[]
  rodadas: number
  placar: string
  vencedores: string
  hashes: string[]
}

/** AC 5 — reproduz e compara com igualdade exata. Nunca lança: falha de reprodução vira problema. */
export function verificarReplay(r: Replay): VerificacaoDeReplay {
  const problemas: string[] = []
  const v: VerificacaoDeReplay = {
    problemas,
    rodadas: r.rodadas.length,
    placar: r.placar.join('-'),
    vencedores: r.rodadas.map((x) => x.aoVivo.vencedor).join(' '),
    hashes: r.rodadas.map((x) => x.aoVivo.hash),
  }
  let rep: ReturnType<typeof reproduzirPartida>
  try {
    rep = reproduzirPartida(comoPartidaGravada(r))
  } catch (err) {
    problemas.push(`a reprodução não chegou ao fim da partida: ${err instanceof Error ? err.message : String(err)}`)
    return v
  }
  if (rep.placar[0] !== r.placar[0] || rep.placar[1] !== r.placar[1]) problemas.push(`placar reproduzido ${rep.placar.join('-')} != ${r.placar.join('-')} ao vivo`)
  if (rep.vencedor !== r.vencedor) problemas.push(`vencedor da partida reproduzido ${rep.vencedor} != ${r.vencedor} ao vivo`)
  if (rep.rodadas.length !== r.rodadas.length) {
    problemas.push(`${rep.rodadas.length} rodada(s) reproduzida(s) != ${r.rodadas.length} gravada(s) ao vivo`)
  }
  for (let i = 0; i < Math.min(rep.rodadas.length, r.rodadas.length); i++) {
    const a = r.rodadas[i].aoVivo
    const b = rep.rodadas[i]
    const campos: [string, string | number, string | number][] = [
      ['indice', a.indice, b.indice],
      ['hash', a.hash, b.hash],
      ['ticks', a.ticks, b.ticks],
      ['vencedor', a.vencedor, b.vencedor],
      ['seedDaRodada', a.seedDaRodada, b.seedDaRodada],
      ['ladoDoJogador', a.ladoDoJogador.join(','), b.ladoDoJogador.join(',')],
    ]
    for (const [campo, aoVivo, reproduzido] of campos) {
      if (aoVivo !== reproduzido) problemas.push(`rodada ${i}: ${campo} reproduzido ${reproduzido} != ${aoVivo} ao vivo`)
    }
  }
  return v
}

// --------------------------------------------------------------------------- CLI

function arquivosDe(caminho: string): string[] {
  if (!statSync(caminho).isDirectory()) return [caminho]
  return readdirSync(caminho)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => join(caminho, f))
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
  let falhas = 0
  for (const arq of arquivos) {
    let problemas: string[]
    let resumo = ''
    try {
      const texto = readFileSync(arq, 'utf8')
      const v = verificarReplay(lerReplay(texto))
      problemas = v.problemas
      resumo = `${v.rodadas} rodada(s) · placar ${v.placar} · venc/rodada [${v.vencedores}] · hashes [${v.hashes.join(' ')}] · ${Buffer.byteLength(texto, 'utf8')} B`
    } catch (err) {
      problemas = [err instanceof Error ? err.message : String(err)]
    }
    if (problemas.length === 0) {
      console.log(`✓ ${arq}: reproduzido com hashes, placar e vencedores idênticos — ${resumo}`)
    } else {
      falhas++
      console.log(`✗ ${arq}${resumo ? `: ${resumo}` : ''}`)
      for (const p of problemas) console.log(`    ${p}`)
    }
  }
  console.log(
    `\nreplay:check: ${arquivos.length - falhas}/${arquivos.length} replay(s) com os mesmos hashes de rodada, placar e vencedores, ` +
      `na mesma engine (Node ${process.version}). O hash() é quantizado: ele prova igualdade de hash, não de cada bit do estado (§11.1)`,
  )
  process.exit(falhas === 0 ? 0 : 1)
}

if (import.meta.main) main()
