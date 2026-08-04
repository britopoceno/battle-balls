import { ROSTER } from '../chars/index.ts'
import { agregarItens } from '../shop/agregar.ts'
import { CATALOGO, type ItemDef } from '../shop/catalogo.ts'
import { previewStat } from '../shop/preview.ts'
import type { StatBlock } from '../sim/stats.ts'
import type { Jogador, PersonagemVisivel, VisaoPartida } from '../match/index.ts'

/**
 * AS TELAS DE DOM DA PARTIDA (`docs/architecture-e3.md` §11.1, story `e3.4`).
 *
 * **`FaseDaPartida` é a FONTE — este módulo não tem estado de fase próprio.** `desenharTela` é uma
 * função de `VisaoPartida` para DOM: ela olha `v.fase` e desenha o que a fase diz, e não existe aqui
 * uma variável "tela atual" que possa discordar da partida. É a decisão de §11.1, e o que ela mata é
 * uma classe inteira de bug — "a tela acha que está na loja e a partida acha que está na rodada".
 *
 * **Por que DOM e não canvas** (§11.1): o overlay, os cards e o CSS já existem e já foram validados
 * em celular real na Fase 1 (P1.1/P1.2). Recriar isso em canvas seria trabalho novo para um resultado
 * pior em acessibilidade e em rolagem. A rodada continua em canvas porque é onde há 60Hz.
 *
 * **O que este módulo NÃO faz:** não decide nada. Todo clique vira uma `Decisao` entregue ao
 * chamador, que a passa ao redutor de `match/`. A tela não escreve em `VisaoPartida` (que é projeção
 * de leitura), não calcula placar e não sabe se o oponente é bot ou humano.
 *
 * Pixel, cor e ergonomia são de @ux-design-expert e não estão aqui (§11, preâmbulo): esta story
 * entrega a estrutura funcional reaproveitando os componentes de P1.1/P1.2.
 */

/**
 * O que a tela pode pedir à partida. Um método por `Decisao` que a tabela de §11.1 autoriza cada
 * tela a escrever, mais `reiniciar`, que não é decisão de partida e sim de sessão.
 *
 * `jogador` não aparece em nenhuma assinatura: quem é o humano é fechamento do chamador, pelo mesmo
 * motivo que `PoliticaPartida` não recebe `jogador` (`bot/partida.ts`) — assim a tela não consegue
 * emitir decisão em nome do oponente nem por engano.
 */
export interface AcoesDaTela {
  draft: (charId: string) => void
  build: (slot: 0 | 1, abilityIndex: 0 | 1, passiveIndex: 0 | 1) => void
  prontoBuilds: () => void
  compra: (slot: 0 | 1, itemId: string) => void
  trocaDeBuild: (slot: 0 | 1, abilityIndex: 0 | 1, passiveIndex: 0 | 1) => void
  prontoLoja: () => void
  reiniciar: () => void
}

export interface ContextoDaTela {
  /**
   * Segundos restantes do timer de RF-04, ou `null` fora da fase `builds`.
   *
   * O relógio de parede vive no CLIENTE (§2.6) e o número chega aqui já contado: `match/` não tem
   * relógio, e o estouro só existe para ele como a decisão `{t:'buildPadrao'}` que o cliente emite.
   */
  segundosRestantes: number | null
  /**
   * `StatBlock` base por `charId`, colhido do último `World` montado.
   *
   * É o contorno do limite que `shop/preview.ts` registra explicitamente para esta story: o único
   * lugar do projeto que deriva um `StatBlock` de um `CharDef` é o literal dentro de `makeBall`
   * (`sim/world.ts:141`), e extraí-lo seria mudança em `sim/`. Enquanto não for extraído, o chamador
   * passa o `ball.base` de uma bola existente — e a fase `loja` só é alcançável depois de uma rodada
   * (`registrarRodada` é o único caminho para ela), então uma bola sempre existiu.
   */
  basePorChar: Record<string, Readonly<StatBlock>>
  /** quem está no controle desta tela. Só para rotular; a projeção já veio filtrada por `visaoPara` */
  humano: Jogador
}

export function desenharTela(host: HTMLElement, v: VisaoPartida, ctx: ContextoDaTela, acoes: AcoesDaTela): void {
  host.innerHTML = ''
  switch (v.fase) {
    case 'draft':
      telaDraft(host, v, acoes)
      return
    case 'builds':
      telaBuilds(host, v, ctx, acoes)
      return
    case 'loja':
      telaLoja(host, v, ctx, acoes)
      return
    case 'fim':
      telaFim(host, v, acoes)
      return
    case 'rodada':
      // a rodada é canvas: a tela de DOM sai da frente. O chamador esconde o overlay.
      return
  }
}

// ---------------------------------------------------------------------------------- draft

/**
 * §3.1 / §3.2 / R-01(B) — a estrutura é genérica (lê `pool` e `ordem`), o conteúdo é fixo.
 *
 * Com roster de 2 e ordem snake `[0,1,1,0]`, as quatro escolhas produzem `[golem, vex]` para os dois
 * jogadores independentemente do que se clique: `aplicarDraft` NÃO consome o `pool` (§3.2 — com 4
 * escolhas sobre um pool de 2 ele acabaria na segunda). A tela diz isso ao jogador em vez de fingir
 * um draft com consequência, que é a diferença entre uma tela honesta e uma que promete escolha.
 */
function telaDraft(host: HTMLElement, v: VisaoPartida, acoes: AcoesDaTela): void {
  const daVez = v.draft.ordem[v.draft.passo]
  cabecalho(host, 'Draft', `escolha ${v.draft.passo + 1} de ${v.draft.ordem.length}`)
  sub(host, daVez === 0 ? 'Sua vez de escolher.' : 'O oponente está escolhendo…')

  const grade = div(host, 'picks')
  for (const id of v.draft.pool) {
    const def = ROSTER.find((c) => c.id === id)
    if (!def) continue
    const jaMeus = v.draft.escolhas.filter((x) => x.jogador === daVez).map((x) => x.charId)
    const card = document.createElement('button')
    card.className = 'card op' + (jaMeus.includes(id) ? ' sel' : '')
    card.style.setProperty('--cor', def.color)
    card.innerHTML = `<b style="color:${def.color}">${def.name}</b><i>${def.ult.name} · ${def.abilities.map((h) => h.name).join(' / ')}</i>`
    card.disabled = daVez !== 0
    card.onclick = () => acoes.draft(id)
    grade.appendChild(card)
  }

  const feitas = v.draft.escolhas.map((e) => `j${e.jogador}: ${e.charId}`).join(' · ')
  dica(host, feitas ? `já escolhido — ${feitas}` : 'roster de 2 (R-01): a composição sai `[golem, vex]` para os dois')
}

// ---------------------------------------------------------------------------------- builds

/**
 * RF-03 + RF-04 — 1 ativa de 2 e 1 passiva de 2 por personagem, simultâneo e secreto, com 30s.
 *
 * Reaproveita os cards que `montarSeletor` desenhava em `main.ts`, com uma diferença de fundo: cada
 * clique emite `{t:'build'}` ao redutor em vez de escrever num `meuTime` local. Não existe seleção
 * pendente no cliente — o estado da build É `v.eu.personagens`, então a tela não pode divergir do que
 * a partida acha que foi escolhido.
 *
 * A build do oponente não é desenhada porque ela **não está no objeto** (`visaoPara`, §2.4): o
 * segredo de RF-04 é estrutural, não disciplina de render.
 */
function telaBuilds(host: HTMLElement, v: VisaoPartida, ctx: ContextoDaTela, acoes: AcoesDaTela): void {
  const rot = v.rodada === 0 ? 'Builds' : `Builds — rodada ${v.rodada + 1}`
  cabecalho(host, rot, ctx.segundosRestantes !== null ? `${ctx.segundosRestantes}s` : '')
  sub(
    host,
    v.prontos[ctx.humano]
      ? 'Pronto. Esperando o oponente…'
      : 'Escolha uma ativa e uma passiva por personagem. No fim do tempo, a build padrão entra.',
  )

  const grade = div(host, 'picks')
  v.eu.personagens.forEach((p, idx) => {
    const def = ROSTER.find((c) => c.id === p.charId)
    if (!def) return
    const card = div(grade, 'card')
    card.style.setProperty('--cor', def.color)
    card.innerHTML = `<h3>${def.name}<span>${idx === 0 ? 'polegar esquerdo' : 'polegar direito'}</span></h3>`

    for (const grupo of ['abilities', 'passives'] as const) {
      const linha = div(card, 'grupo')
      linha.innerHTML = `<label>${grupo === 'abilities' ? 'ativa' : 'passiva'}</label>`
      def[grupo].forEach((op, i) => {
        const atual = grupo === 'abilities' ? p.abilityIndex : p.passiveIndex
        const b = document.createElement('button')
        b.className = 'op' + (atual === i ? ' sel' : '')
        b.innerHTML = `<b>${op.name}</b><i>${op.desc}</i>`
        b.disabled = v.prontos[ctx.humano]
        b.onclick = () =>
          acoes.build(
            idx as 0 | 1,
            grupo === 'abilities' ? (i as 0 | 1) : p.abilityIndex,
            grupo === 'passives' ? (i as 0 | 1) : p.passiveIndex,
          )
        linha.appendChild(b)
      })
    }
  })

  if (!v.prontos[ctx.humano]) botao(host, 'Pronto', acoes.prontoBuilds)
  dica(host, `oponente ${v.prontos[ctx.humano === 0 ? 1 : 0] ? 'pronto' : 'escolhendo'} · a rodada abre quando os dois estiverem prontos`)
}

// ---------------------------------------------------------------------------------- loja / placar

/**
 * A loja e o placar, na mesma tela (§11.1: `[placar] ──▶ loja`).
 *
 * **O preview de valor efetivo (AC 6, §7.3) é o ponto desta tela.** O número que o item promete no
 * `desc` não é o que o jogador recebe: dois itens no mesmo campo podem estourar o teto, e aí ele
 * **paga por um bônus que não existe**. O que se mostra aqui é a diferença entre `previewStat` do
 * estado atual e `previewStat` do estado com o item — calculada pelo helper de `e3.1`, que chama o
 * próprio `recomputeStats`. A fórmula de stats **nunca** é reimplementada aqui; fazer isso criaria a
 * terceira fonte de verdade que o projeto já pagou caro para não ter (§13.3).
 *
 * **As compras do oponente aparecem** (§4.1): `PersonagemVisivel.itens` é visível nas duas variantes
 * do tipo, de propósito. RF-04 declara segredo para a *seleção de build* e mais nada — esconder a
 * loja também seria regra que ninguém escreveu (Artigo IV).
 */
function telaLoja(host: HTMLElement, v: VisaoPartida, ctx: ContextoDaTela, acoes: AcoesDaTela): void {
  const [a, b] = [v.eu.vitorias, v.oponente.vitorias]
  cabecalho(host, `${a} — ${b}`, `rodada ${v.rodada + 1} · melhor de ${v.regras.vitoriasParaVencer * 2 - 1}`)
  sub(host, `Ouro: ${v.eu.ouro} · oponente: ${v.oponente.ouro}`)

  const grade = div(host, 'picks')
  v.eu.personagens.forEach((p, idx) => {
    const def = ROSTER.find((c) => c.id === p.charId)
    if (!def) return
    const card = div(grade, 'card')
    card.style.setProperty('--cor', def.color)
    card.innerHTML =
      `<h3>${def.name}<span>${p.itens.length} item(ns)</span></h3>` +
      `<p class="hint" style="text-align:left;margin:0 0 10px">${p.itens.length ? p.itens.join(' · ') : 'sem itens'}</p>`

    const base = ctx.basePorChar[p.charId]
    const linha = div(card, 'grupo')
    linha.innerHTML = '<label>loja</label>'
    for (const item of CATALOGO) {
      const bt = document.createElement('button')
      const cabe = v.eu.ouro >= item.preco
      bt.className = 'op'
      bt.disabled = !cabe || v.prontos[ctx.humano]
      bt.innerHTML =
        `<b>${item.nome} <span style="float:right;color:${cabe ? '#4dd6ff' : '#6f7c93'}">${item.preco}g</span></b>` +
        `<i>${item.desc}<br>${efeitoEfetivo(base, p.itens, item)}</i>`
      bt.onclick = () => acoes.compra(idx as 0 | 1, item.id)
      linha.appendChild(bt)
    }

    // D-01 — trocar a build entre rodadas custa `precoTrocaDeBuild`
    const troca = div(card, 'grupo')
    troca.innerHTML = `<label>trocar build (${v.economia.precoTrocaDeBuild}g)</label>`
    for (const i of [0, 1] as const) {
      const bt = document.createElement('button')
      bt.className = 'op' + (p.abilityIndex === i ? ' sel' : '')
      bt.disabled = v.eu.ouro < v.economia.precoTrocaDeBuild || v.prontos[ctx.humano]
      bt.innerHTML = `<b>ativa: ${def.abilities[i].name}</b>`
      bt.onclick = () => acoes.trocaDeBuild(idx as 0 | 1, i, p.passiveIndex)
      troca.appendChild(bt)
    }
  })

  const op = div(host, 'card')
  op.style.setProperty('--cor', '#ff7a6b')
  op.innerHTML =
    `<h3>Oponente<span>${v.oponente.ouro}g</span></h3>` +
    v.oponente.personagens.map(linhaDoOponente).join('')

  if (!v.prontos[ctx.humano]) botao(host, 'Próxima rodada', acoes.prontoLoja)
  dica(host, 'as compras não são secretas (RF-04 fecha só a seleção de build)')
}

/** As compras do oponente são públicas; a build fechada nem chega aqui — não está no objeto. */
function linhaDoOponente(p: PersonagemVisivel): string {
  const build = p.revelado ? `ativa ${p.abilityIndex} · passiva ${p.passiveIndex}` : 'build fechada'
  return `<p class="hint" style="text-align:left;margin:2px 0">${p.charId} — ${build} · ${p.itens.length ? p.itens.join(', ') : 'sem itens'}</p>`
}

/**
 * O que o item REALMENTE acrescenta, já com clamps e teto — a diferença entre dois `previewStat`.
 *
 * Quando o teto morde, a diferença sai `0.00` e a linha diz isso em vez de repetir o `desc`. É
 * exatamente o caso que §7.3 nomeia como o motivo de a tela existir.
 */
function efeitoEfetivo(base: Readonly<StatBlock> | undefined, itensAtuais: readonly string[], item: ItemDef): string {
  if (!base) return 'efeito indisponível'
  const antes = previewStat(base, agregarItens(itensAtuais))
  const depois = previewStat(base, agregarItens([...itensAtuais, item.id]))

  const partes: string[] = []
  for (const k of Object.keys(item.bonus) as (keyof StatBlock)[]) {
    const d = depois[k] - antes[k]
    partes.push(`${k} ${d >= 0 ? '+' : ''}${d.toFixed(2)}${d === 0 ? ' (teto)' : ''}`)
  }
  return partes.length ? `efetivo: ${partes.join(' · ')}` : 'sem efeito medível'
}

// ---------------------------------------------------------------------------------- fim

function telaFim(host: HTMLElement, v: VisaoPartida, acoes: AcoesDaTela): void {
  const [a, b] = [v.eu.vitorias, v.oponente.vitorias]
  const r = a === b ? 'Empate' : a > b ? 'Você venceu' : 'Você perdeu'
  cabecalho(host, r, `${a} — ${b}`)
  sub(host, `${v.historico.length} rodada(s) · ${v.historico.filter((h) => h.vencedor === -1).length} empatada(s)`)

  const tabela = div(host, 'card')
  tabela.style.setProperty('--cor', '#4dd6ff')
  tabela.innerHTML =
    '<h3>Rodadas<span>duração · vencedor</span></h3>' +
    v.historico
      .map((h) => {
        const quem = h.vencedor === -1 ? 'empate' : h.vencedor === 0 ? 'jogador 0' : 'jogador 1'
        return `<p class="hint" style="text-align:left;margin:2px 0">${h.indice + 1}ª — ${(h.ticks / 60).toFixed(1)}s · ${quem} · lado ${h.ladoDoJogador.join('')} · ${h.hash}</p>`
      })
      .join('')

  botao(host, 'Nova partida', acoes.reiniciar)
}

// ---------------------------------------------------------------------------------- utilitários de DOM

function div(pai: HTMLElement, cls: string): HTMLDivElement {
  const d = document.createElement('div')
  d.className = cls
  if (cls === 'picks') d.id = 'picks'
  pai.appendChild(d)
  return d
}

function cabecalho(pai: HTMLElement, titulo: string, tag: string): void {
  const h = document.createElement('h1')
  h.innerHTML = tag ? `${titulo} <span>${tag}</span>` : titulo
  pai.appendChild(h)
}

function sub(pai: HTMLElement, texto: string): void {
  const p = document.createElement('p')
  p.className = 'sub'
  p.textContent = texto
  pai.appendChild(p)
}

function dica(pai: HTMLElement, texto: string): void {
  const p = document.createElement('p')
  p.className = 'hint'
  p.textContent = texto
  pai.appendChild(p)
}

function botao(pai: HTMLElement, rotulo: string, onclick: () => void): void {
  const b = document.createElement('button')
  b.id = 'start'
  b.textContent = rotulo
  b.onclick = onclick
  pai.appendChild(b)
}
