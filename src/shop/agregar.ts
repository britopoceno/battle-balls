import { STAT_KEYS, makeStatBlock, type BonusBlock, type StatKey } from '../sim/stats.ts'
import { CATALOGO, type ItemDef } from './catalogo.ts'

/**
 * AGREGAÇÃO DE BÔNUS DE ITEM — a borda de composição da loja (`docs/architecture-e3.md` §7.3).
 *
 * Aqui a lista de compra do jogador vira o `Partial<BonusBlock>` que `PickSetup.itemBonus`
 * recebe (`sim/world.ts:53`) — a MESMA porta que o CLI de balanceamento já usa desde `e2.6`.
 * Nenhuma fórmula nova, nenhum ponto de aplicação novo (§7.5, D-04 não reabre).
 *
 * Três invariantes, e a primeira é a única razão deste arquivo existir separado do catálogo:
 *
 *  1. **A ordem de compra não pode influenciar o resultado.** A soma percorre o CATÁLOGO em ordem
 *     de `id` crescente, nunca a ordem da lista recebida. Medido em §1.6, não temido:
 *       0.07 + 0.11 + 0.13 + 0.17  (crescente)   = 0.47999999999999998224
 *       0.17 + 0.13 + 0.11 + 0.07  (decrescente) = 0.48000000000000003775   → diferentes
 *     Com quatro itens de valores banais a ordem muda o último bit. Hoje isso custaria hash
 *     divergente entre duas execuções do arnês; na Fase 4 custa cliente e servidor discordando de
 *     quem morreu. É o item **A-10** do Anexo B de `architecture.md` — escrito na dívida e nunca
 *     pago até esta story.
 *  2. **Itens repetidos somam** (D-04, aditivo). A lista de compra é `string[]`, não `Set`.
 *  3. **A agregação NÃO clampa.** Quem clampa é `recomputeStats` (`sim/stats.ts:183`), com
 *     `SIGMA_MIN`/`SIGMA_MAX` e os clamps absolutos. Um caminho de exceção aqui produziria um item
 *     que o jogo real nunca entrega — o mesmo argumento que `e2.1` já cravou em `makeBall`.
 *
 * `agregarItens` não lança, não clampa e não valida: validação é `validarCompra`/`validarCatalogo`
 * abaixo, que DEVOLVEM os problemas em vez de abortar — o padrão de `analisarMutacao`
 * (`tools/balance.ts:296`), pelo mesmo motivo que ele foi escrito assim.
 */

/**
 * Comparação de `id` por unidade de código. **Nunca `localeCompare`**: ele depende de ICU e de
 * locale, e a Fase 4 roda Node e Chrome ao mesmo tempo — uma ordenação por locale seria a ordem
 * canônica divergindo entre as duas pontas, isto é, exatamente o vetor de não-determinismo que
 * esta função existe para fechar. Os `id`s do catálogo são ASCII minúsculo sem acento para que
 * esta comparação seja suficiente.
 */
function porId(a: ItemDef, b: ItemDef): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * A ordem canônica, resolvida UMA vez na carga do módulo — não a cada agregação, e não à mão no
 * `catalogo.ts` (que está deliberadamente em ordem de apresentação: se ele já viesse ordenado,
 * um bug aqui acertaria por coincidência).
 *
 * `sort` sobre uma CÓPIA, nunca sobre `CATALOGO`. E a estabilidade do `sort` não é usada como
 * garantia: `porId` só devolve 0 para `id`s IGUAIS, e `id` duplicado é problema que
 * `validarCatalogo` acusa — a mesma disciplina da invariante de `World.balls` (debt.7:
 * `Array.prototype.sort` só é estável dentro do mesmo engine).
 */
const CATALOGO_CANONICO: readonly ItemDef[] = [...CATALOGO].sort(porId)

/** Índice `id → def`, também resolvido na carga. Só leitura. */
const POR_ID: ReadonlyMap<string, ItemDef> = new Map(CATALOGO.map((d) => [d.id, d]))

/**
 * Soma os bônus dos itens comprados. **ORDEM CANÔNICA: `id` crescente no catálogo, sempre** —
 * a ordem de `itens` é irrelevante por construção, e é isso que o teste A-10 exige (byte-idêntico
 * entre permutações da lista de compra).
 *
 * `id` desconhecido é IGNORADO aqui, por construção (o laço externo é o catálogo, não a lista): é
 * o preço de a invariante 1 ser estrutural em vez de defensiva. Quem acusa é `validarCompra`, e
 * chamá-la na borda antes de escrever em `PickSetup.itemBonus` é obrigação do consumidor (`e3.2`).
 *
 * As chaves do objeto devolvido saem em ordem de `STAT_KEYS`, não na ordem em que os itens as
 * escreveram: duas listas de compra com o mesmo conteúdo devolvem objetos idênticos inclusive na
 * ordem de chaves, o que é o que faz a comparação "byte-idêntica" de A-10 valer para
 * `JSON.stringify` e não só para os valores.
 */
export function agregarItens(itens: readonly string[]): Partial<BonusBlock> {
  // acumulador de forma FIXA (as 14 chaves de STAT_KEYS) — mesma hidden class de todo
  // StatBlock/BonusBlock do projeto. `tocado` é o que separa "campo somou 0" de "campo não foi
  // tocado por nenhum item": sem ele, um bônus que somasse exatamente 0 desapareceria do
  // resultado, e um dia haverá item de bônus negativo.
  const soma = makeStatBlock(0)
  const tocado = new Set<StatKey>()

  for (const def of CATALOGO_CANONICO) {
    let copias = 0
    for (const id of itens) if (id === def.id) copias++
    if (copias === 0) continue
    for (const k of STAT_KEYS) {
      const v = def.bonus[k]
      if (v === undefined) continue
      tocado.add(k)
      // SOMAR `copias` vezes, e não `v * copias`: D-04 define o efeito de itens repetidos como
      // ADITIVO, e em float64 `v+v+v` e `v*3` não são a mesma expressão. Multiplicar seria trocar
      // a definição por uma aproximação dela — e a diferença é justamente no último bit, que é o
      // que esta story existe para tornar determinístico.
      for (let i = 0; i < copias; i++) soma[k] += v
    }
  }

  const bonus: Partial<BonusBlock> = {}
  for (const k of STAT_KEYS) if (tocado.has(k)) bonus[k] = soma[k]
  return bonus
}

/**
 * Problemas de UM item do catálogo. Devolve as mensagens; não lança.
 *
 * A validação de finitude é entrada obrigatória do gate de `e3.0` (ARCH-E30-002): **a
 * responsabilidade de barrar `NaN`/`Infinity` em `itemBonus` é de quem POPULA o campo** — isto é,
 * da loja, aqui. Padrão reusado de `analisarMutacao` (`tools/balance.ts:296`), com o motivo
 * medido no gate de `e2.5`: `{dmg: NaN}` em `PickSetup.itemBonus` faz "% sem ativa" saltar para
 * 50% porque todo cast decidido por valor esperado é suprimido (`NaN >= limiar` é `false`), e
 * `{maxHp: NaN}` não aparece em detector nenhum. A rodada continua rodando e a saída sai plausível
 * e errada. `sim/` NÃO valida isto (nem deve: é caminho quente) — a borda é esta.
 *
 * As duas checagens não são redundantes: a de CHAVE pega um campo que não existe em `STAT_KEYS`
 * (só alcançável por `as`/JSON externo, já que o literal do catálogo é checado por `tsc`), e a de
 * VALOR pega o número que existe mas contamina.
 */
function problemasDoItem(def: ItemDef): string[] {
  const p: string[] = []
  for (const chave of Object.keys(def.bonus)) {
    if (!(STAT_KEYS as readonly string[]).includes(chave)) {
      p.push(
        `item '${def.id}': campo de bônus desconhecido '${chave}'. ` +
          `Campos de sim/stats.ts: ${STAT_KEYS.join(', ')}.`,
      )
      continue
    }
    const v = def.bonus[chave as StatKey]
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      p.push(
        `item '${def.id}': bônus '${chave}' não é finito (${String(v)}). ` +
          'Bônus não finito em itemBonus propaga para stat e contamina a rodada inteira sem erro ' +
          '(gate de e2.5 / BOT-006).',
      )
    }
  }
  // §6.1: ouro é INTEIRO e toda operação sobre ele é aritmética inteira. Um preço fracionário ou
  // não finito produziria "13,999999999999998 de ouro" e o modo de falha é um botão de compra
  // desabilitado sem motivo visível — o pior tipo de bug de economia, porque parece regra.
  if (!Number.isInteger(def.preco) || def.preco < 0) {
    p.push(`item '${def.id}': preço '${def.preco}' não é inteiro >= 0 (§6.1 — ouro é inteiro).`)
  }
  return p
}

/**
 * Confere o catálogo inteiro: `id` único e cada item íntegro. Vazia = catálogo sadio.
 *
 * `id` duplicado é acusado aqui porque ele quebra a ordem canônica por dentro (dois itens
 * empatados em `porId` dependeriam da estabilidade do `sort`, que só vale dentro do mesmo engine)
 * e porque `POR_ID` guardaria só o último — o item perdido sumiria da loja em silêncio.
 */
export function validarCatalogo(): string[] {
  const problemas: string[] = []
  const vistos = new Set<string>()
  for (const def of CATALOGO) {
    if (vistos.has(def.id)) problemas.push(`id duplicado no catálogo: '${def.id}'.`)
    vistos.add(def.id)
    problemas.push(...problemasDoItem(def))
  }
  return problemas
}

/**
 * A BORDA: confere uma lista de compra antes de ela virar `itemBonus`. Vazia = pode agregar.
 * Nunca lança — o consumidor (`e3.2`, `setupDaRodada`) decide o que fazer com as mensagens, do
 * mesmo jeito que `balance.ts` decide o que fazer com o retorno de `analisarMutacao`.
 */
export function validarCompra(itens: readonly string[]): string[] {
  const problemas: string[] = []
  for (const id of itens) {
    const def = POR_ID.get(id)
    if (!def) {
      problemas.push(
        `item desconhecido '${id}'. Catálogo: ${CATALOGO.map((d) => d.id).join(', ')}. ` +
          'agregarItens IGNORA id desconhecido (percorre o catálogo, não a lista de compra): sem ' +
          'esta checagem o jogador pagaria por um item que não entra em bônus nenhum, em silêncio.',
      )
      continue
    }
    problemas.push(...problemasDoItem(def))
  }
  return problemas
}
