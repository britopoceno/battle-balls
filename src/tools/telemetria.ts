import { readFileSync } from 'node:fs'
import { ARRASTO_MAX, LIMIAR_ARRASTO_PX } from '../client/input.ts'
import type { ArquivoTelemetria, EventoRegistrado } from '../client/telemetria.ts'

/**
 * AGREGADOR DA TELEMETRIA — as evidências do portão da Fase 3 a partir do arquivo exportado
 * (`docs/architecture-e3.md` §10.1, story `e3.5` AC 12).
 *
 * Uso: `node src/tools/telemetria.ts <arquivo.json>`
 *
 * **Por que ele existe, e por que não vive em `client/`.** O AC 12 exige que P3.1, P3.2 e P3.3 saiam
 * do arquivo exportado *"sem cálculo manual"*, e nomeia o instrumento: *"um script simples de
 * agregação"*. Este é ele. Mantê-lo fora do cliente é o mesmo princípio de §10.2 que manda o coletor
 * não calcular métrica: um número agregado dentro do jogo é um número que ninguém pode auditar
 * contra os eventos que o produziram. Aqui a entrada é o arquivo que o jogador exportou, e qualquer
 * um pode reconferir a conta.
 *
 * **Desvio de escopo registrado (AC 13).** O AC 13 lista os arquivos que `e3.5` pode tocar e este
 * não está nela. Ele também não está na lista do que continua proibido (`sim/`, `match/`, `shop/`,
 * `bot/`, `chars/`) — a proibição, que é o que o AC protege, está intacta. A alternativa era deixar
 * o AC 12 provado só por leitura, que é exatamente o que a errata da Bíblia (§7) diz para não
 * aceitar. Fica anotado para o @qa julgar, não escondido.
 */

/**
 * ⚠️ PROVISÓRIO. Acima de quantos graus de erro de mira um cast conta como "desperdiçado" (RF-36).
 *
 * Nenhuma medição deste projeto ordena esse limiar — ele existe para que a taxa seja CALCULÁVEL, que
 * é o que o AC 12 pede, e o dado bruto (`anguloErro` em graus) fica no arquivo justamente para que
 * mudá-lo seja reanálise e não recoleta. Mesma marcação estrutural de `ECONOMIA_PROVISORIA`.
 */
const LIMIAR_DESPERDICIO_GRAUS = 30

/**
 * Fração de arrasto (`EventoCast.mag`) abaixo da qual `input.ts` nunca reescreveu a mira, e o cast
 * saiu com o placeholder `{dx:1, dy:0}` de `pointerdown` — TEL-E35-001. Mesmo limiar de `input.ts`
 * (`d > LIMIAR_ARRASTO_PX`), só que expresso em fração de `ARRASTO_MAX` porque é isso que o arquivo
 * exportado guarda. Casts abaixo deste limiar não têm mira real: incluí-los na taxa de desperdício
 * mediria a direção inventada, não a intenção do jogador.
 */
const LIMIAR_MAG_MIRA_REAL = LIMIAR_ARRASTO_PX / ARRASTO_MAX

function mediana(xs: readonly number[]): number {
  if (xs.length === 0) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const pct = (n: number, total: number): string =>
  total === 0 ? '—' : `${((n / total) * 100).toFixed(1)}%`

/**
 * debt.10 / `E41-TEL-002` — a população de um evento: o (atraso de input, `ESCALA_HP`) GRAVADO nele
 * pelo coletor no instante do `registrar()`.
 *
 * O agregador lê o valor do ARQUIVO e nunca importa as constantes-fonte: `tools/ → net/` não existe
 * na tabela de camadas (`architecture-e4.md` §2.2), e o valor histórico certo é o que foi gravado, não
 * o que a constante vale hoje. Campo ausente ou não-numérico é DESCONHECIDO — nunca atraso 0 nem escala
 * 1.0 por omissão, mesmo molde do `mag` ausente (TEL-E35-001) mais abaixo.
 */
function populacaoDe(e: EventoRegistrado): { rotulo: string; conhecida: boolean } {
  const atrasoOk = Number.isFinite(e.atrasoTicks)
  const escalaOk = Number.isFinite(e.escalaHp)
  return {
    rotulo:
      (atrasoOk ? `atraso ${e.atrasoTicks} tick(s)` : 'atraso desconhecido') +
      ' · ' +
      (escalaOk ? `ESCALA_HP ×${e.escalaHp}` : 'ESCALA_HP desconhecida'),
    conhecida: atrasoOk && escalaOk,
  }
}

/**
 * Particiona os eventos por população (atraso, escala) ANTES de qualquer métrica, e calcula P3.1,
 * P3.2, P3.3, os extras e RF-36 separadamente em cada uma (debt.10, AC 6). Um único número
 * misturando rodadas com atraso 0 e com atraso 6, ou escalas de HP diferentes, é justamente a
 * contaminação que `debt.9` (pré-condição b) e o baseline de P4.4 não podem receber — então, com mais
 * de uma população no arquivo, não existe linha combinada: cada uma sai na sua seção, com aviso.
 *
 * Eventos sem carimbo (gravados antes de `debt.10`) formam a população desconhecida, reportada por
 * último e com aviso — nunca somada a uma população conhecida (AC 7).
 */
export function agregar(eventos: readonly EventoRegistrado[]): string[] {
  const grupos = new Map<string, { conhecida: boolean; eventos: EventoRegistrado[] }>()
  for (const e of eventos) {
    const { rotulo, conhecida } = populacaoDe(e)
    if (!grupos.has(rotulo)) grupos.set(rotulo, { conhecida, eventos: [] })
    grupos.get(rotulo)!.eventos.push(e)
  }
  // conhecidas primeiro, em ordem estável; desconhecidas por último
  const ordem = [...grupos.entries()].sort(
    ([ra, a], [rb, b]) => Number(!a.conhecida) - Number(!b.conhecida) || ra.localeCompare(rb),
  )

  const semCarimbo = ordem.filter(([, g]) => !g.conhecida).reduce((n, [, g]) => n + g.eventos.length, 0)
  if (semCarimbo > 0) {
    console.warn(
      `[telemetria] ${semCarimbo} evento(s) sem carimbo de atraso/escala (gravados antes de debt.10) — reportados à parte como população desconhecida, nunca somados a uma população conhecida`,
    )
  }
  const multiplas = ordem.length > 1
  if (multiplas) {
    console.warn(
      `[telemetria] o arquivo mistura ${ordem.length} populações (atraso, escala): ` +
        ordem.map(([r, g]) => `${r} (${g.eventos.length} evento(s))`).join('; ') +
        ' — métricas reportadas por população, sem número combinado',
    )
  }
  // Uma partida acontece inteira num carregamento de página, então cai inteira numa população. Se não
  // cair, o join de P3.3 (compra × rodadaFim da mesma partida) seria cortado em silêncio — avisa.
  const populacoesDaPartida = new Map<number, Set<string>>()
  for (const [r, g] of ordem) {
    for (const e of g.eventos) {
      if (!populacoesDaPartida.has(e.partida)) populacoesDaPartida.set(e.partida, new Set())
      populacoesDaPartida.get(e.partida)!.add(r)
    }
  }
  const partidasPartidas = [...populacoesDaPartida.entries()].filter(([, ps]) => ps.size > 1)
  if (partidasPartidas.length > 0) {
    console.warn(
      `[telemetria] ${partidasPartidas.length} partida(s) com eventos em mais de uma população (${partidasPartidas.map(([p]) => p).join(', ')}) — as métricas dessa(s) partida(s) ficam divididas entre as seções`,
    )
  }

  if (ordem.length === 0) return agregarPopulacao([])
  const linhas: string[] = []
  if (multiplas) {
    linhas.push(
      `⚠ ${ordem.length} populações (atraso, escala) neste arquivo — cada uma reportada à parte, nenhum número combinado`,
    )
    linhas.push('')
  }
  for (const [rotulo, g] of ordem) {
    linhas.push(
      `população: ${rotulo}` + (g.conhecida ? '' : ' (arquivo ou acúmulo anterior a debt.10)'),
    )
    linhas.push(...agregarPopulacao(g.eventos, multiplas ? rotulo : undefined))
    if (multiplas) linhas.push('')
  }
  if (multiplas) linhas.pop()
  return linhas
}

/** As métricas de UMA população — o corpo original de `agregar` (e3.5), sem mudança de cálculo. */
function agregarPopulacao(eventos: readonly EventoRegistrado[], rotulo?: string): string[] {
  const linhas: string[] = []
  // com mais de uma população, cada aviso diz de qual seção veio
  const deOnde = rotulo ? ` [${rotulo}]` : ''

  const rodadas = eventos.filter((e) => e.t === 'rodadaFim')
  const compras = eventos.filter((e) => e.t === 'compra')
  const casts = eventos.filter((e) => e.t === 'cast')
  const trocas = eventos.filter((e) => e.t === 'trocaDeBuild')
  const padroes = eventos.filter((e) => e.t === 'buildPadrao')
  const partidas = new Set(eventos.map((e) => e.partida))

  linhas.push(
    `eventos ${eventos.length} · partidas ${partidas.size} · rodadas ${rodadas.length} · ` +
      `compras ${compras.length} · casts ${casts.length}`,
  )
  linhas.push('')

  // ---- P3.1 — mediana da rodada COM HUMANO NO CONTROLE
  // O filtro por `controle` é o ponto todo do campo (§10.1): as partidas bot × bot do `sim:check`
  // entram no mesmo fluxo de eventos, e sem ele elas contaminariam a mediana que D-05 vai ajustar.
  const comHumano = rodadas.filter((r) => r.controle.includes('humano'))
  const soBot = rodadas.length - comHumano.length
  const medHumano = mediana(comHumano.map((r) => r.duracaoMs))
  linhas.push('P3.1  mediana da rodada com humano no controle')
  linhas.push(
    `      ${Number.isNaN(medHumano) ? 'sem rodada com humano' : `${(medHumano / 1000).toFixed(1)}s`} ` +
      `(n=${comHumano.length}${soBot ? `, ${soBot} rodada(s) bot×bot excluída(s)` : ''})`,
  )

  // ---- P3.2 — % de rodadas que atingem 60s (TEL-E35-004: rótulo agora declara o mesmo filtro por
  // `controle` que P3.1 e P3.3 já declaram — o cálculo sempre foi filtrado, só o texto não dizia)
  const em60 = comHumano.filter((r) => r.atingiu60s).length
  linhas.push('P3.2  rodadas que atingem 60s (morte súbita, só com humano no controle)')
  linhas.push(
    `      ${pct(em60, comHumano.length)} — ${em60} de ${comHumano.length}` +
      (soBot ? ` (${soBot} rodada(s) bot×bot excluída(s))` : ''),
  )

  // ---- P3.3 — distribuição física × combate, SÓ DAS COMPRAS DO HUMANO
  //
  // O filtro é o mesmo argumento de P3.1, e não tê-lo é o erro que a primeira versão deste agregador
  // cometeu: numa partida contra o bot, METADE das compras é do bot, e a política dele
  // (`bot/partida.ts`) alterna trilha por construção — ela empurra a distribuição para 50/50
  // independentemente do que o humano preferir. O portão pergunta o que o JOGADOR escolhe.
  //
  // `compra` não carrega `controle`, mas o dado exportado basta: `rodadaFim.controle` é indexado por
  // JOGADOR (§10.1), então quem era humano naquela partida sai do join abaixo. Nada de assumir
  // "humano é o jogador 0" — isso é convenção do cliente de hoje, não fato registrado no arquivo.
  const humanoNaPartida = new Map<number, Set<number>>()
  for (const r of rodadas) {
    if (!humanoNaPartida.has(r.partida)) humanoNaPartida.set(r.partida, new Set())
    r.controle.forEach((c, jogador) => {
      if (c === 'humano') humanoNaPartida.get(r.partida)!.add(jogador)
    })
  }
  const comprasHumano = compras.filter((c) => humanoNaPartida.get(c.partida)?.has(c.jogador))
  const fisica = comprasHumano.filter((c) => c.trilha === 'fisica').length
  const combate = comprasHumano.filter((c) => c.trilha === 'combate').length
  linhas.push('P3.3  distribuição de compra por trilha (só o humano)')
  linhas.push(
    `      física ${fisica} (${pct(fisica, comprasHumano.length)}) · combate ${combate} (${pct(combate, comprasHumano.length)})` +
      ` — ${compras.length - comprasHumano.length} compra(s) de bot excluída(s)`,
  )
  linhas.push('')

  // ---- AC 10 — métricas adicionais, não bloqueantes do portão
  linhas.push('extras')
  linhas.push(
    `      trocas de build (D-01): ${trocas.length}` +
      (partidas.size ? ` · ${(trocas.length / partidas.size).toFixed(2)} por partida` : ''),
  )
  linhas.push(
    `      default de D-06 entrou: ${padroes.length} vez(es)` +
      ' — se for alto, a randomização condicional de e3.7 tem gatilho',
  )
  linhas.push('')

  // ---- RF-36 (Risco #4) — as DUAS métricas que o PRD §6 pede
  //
  // TEL-E35-006 (correção de gate FAIL): "uma só mão" agrupa por REGIÃO da tela (`ladoDaTela`), não
  // por `ponteiro`. `pointerId` identifica um contato, não um dedo — num touchscreen cada toque
  // novo recebe um id novo, então contar `pointerId` distintos por rodada mede "quantos toques"
  // (quase sempre > 1), não "quantas mãos". `ladoDaTela` persiste através de vários toques do mesmo
  // dedo porque é uma região, não um identificador de evento.
  const ladosPorRodada = new Map<string, Set<'esq' | 'dir'>>()
  for (const c of casts) {
    // ponteiro negativo é teclado (ver `Disparo.ponteiro`): não conta como mão
    if (c.ponteiro < 0 || !c.ladoDaTela) continue
    const k = `${c.partida}#${c.rodada}`
    if (!ladosPorRodada.has(k)) ladosPorRodada.set(k, new Set())
    ladosPorRodada.get(k)!.add(c.ladoDaTela)
  }
  const comToque = [...ladosPorRodada.values()].filter((s) => s.size > 0)
  const umaMao = comToque.filter((s) => s.size === 1).length

  // TEL-E35-001: exclui da taxa de desperdício os casts sem mira real (mag abaixo do limiar de
  // arrasto de `input.ts`) — esses medem a direção placeholder de `pointerdown`, não a intenção do
  // jogador. TEL-E35-002: `anguloErro` precisa ser um número finito e não-negativo; `null`/`NaN`
  // (o que sobra de um coletor futuro ou de edição manual do arquivo) é DESCARTADO com aviso, nunca
  // tratado como "sem desperdício" — `null >= 0` é `true` em JS e mentiria silenciosamente.
  // `mag` ausente (arquivo exportado por um coletor anterior a esta correção) não é "sem mira
  // real" — é dado que nunca existiu, e as duas coisas não podem virar o mesmo "excluído" silencioso.
  const magAusente = casts.filter((c) => !Number.isFinite(c.mag)).length
  if (magAusente > 0) {
    console.warn(
      `[telemetria] ${magAusente} cast(s) sem campo 'mag' (arquivo exportado antes da correção TEL-E35-001/006) — taxa de desperdício não inclui esses casts${deOnde}`,
    )
  }
  const semMiraReal = casts.filter(
    (c) => Number.isFinite(c.mag) && c.mag < LIMIAR_MAG_MIRA_REAL,
  ).length
  const comMiraReal = casts.filter((c) => Number.isFinite(c.mag) && c.mag >= LIMIAR_MAG_MIRA_REAL)
  const naoFinito = comMiraReal.filter(
    (c) => !Number.isFinite(c.anguloErro) || c.anguloErro < -1,
  ).length
  if (naoFinito > 0) {
    console.warn(
      `[telemetria] ${naoFinito} cast(s) com anguloErro inválido (não-finito ou < -1) — descartado(s) da taxa de desperdício${deOnde}`,
    )
  }
  const medidos = comMiraReal.filter(
    (c) => Number.isFinite(c.anguloErro) && c.anguloErro >= 0,
  )
  const desperdicados = medidos.filter((c) => c.anguloErro > LIMIAR_DESPERDICIO_GRAUS).length

  linhas.push('RF-36 Risco #4 (indicador aprovado no PRD §6, instrumentado em e3.5)')
  linhas.push(
    `      rodadas com uma só mão: ${pct(umaMao, comToque.length)} — ${umaMao} de ${comToque.length}` +
      (comToque.length === 0 ? ' (nenhuma rodada com cast por toque)' : ''),
  )
  linhas.push(
    `      cast desperdiçado (erro > ${LIMIAR_DESPERDICIO_GRAUS}°): ` +
      `${pct(desperdicados, medidos.length)} — ${desperdicados} de ${medidos.length}` +
      (medidos.length ? ` · erro mediano ${mediana(medidos.map((c) => c.anguloErro)).toFixed(1)}°` : '') +
      (semMiraReal ? ` · ${semMiraReal} cast(s) sem mira real excluído(s)` : '') +
      (magAusente ? ` · ${magAusente} sem campo 'mag' (arquivo pré-correção) excluído(s)` : '') +
      (naoFinito ? ` · ${naoFinito} inválido(s) descartado(s)` : ''),
  )

  return linhas
}

function main(): void {
  const caminho = process.argv[2]
  if (!caminho) {
    console.error('uso: node src/tools/telemetria.ts <arquivo.json>')
    process.exit(1)
  }
  const bruto: unknown = JSON.parse(readFileSync(caminho, 'utf8'))
  // aceita o arquivo exportado ({versao, exportadoEm, eventos}) ou um array cru de eventos
  const eventos = Array.isArray(bruto) ? bruto : (bruto as ArquivoTelemetria).eventos
  if (!Array.isArray(eventos)) {
    console.error(`${caminho}: não contém um array de eventos`)
    process.exit(1)
  }
  console.log('')
  for (const l of agregar(eventos as EventoRegistrado[])) console.log(l)
  console.log('')
}

if (import.meta.main) main()
