import type { ParametrosEconomia } from './types.ts'

/**
 * ECONOMIA DA PARTIDA (`docs/architecture-e3.md` §6).
 *
 * OURO É SEMPRE INTEIRO (§6.1), e toda operação aqui é aritmética inteira com `Math.floor`
 * explícito nos juros. O motivo é medido (§1.6): soma de `float64` não é associativa, e um saldo em
 * ponto flutuante daria "13,999999999999998 de ouro" para um item de 14 — o modo de falha é **um
 * botão de compra desabilitado sem motivo visível**, que é o pior tipo de bug de economia porque
 * parece regra.
 *
 * O que NÃO é provisório aqui, porque vem de decisão aprovada:
 *  - **renda igual para os dois jogadores, por rodada** (RF-22, decisão #7) — `rendaDaRodada` recebe
 *    só o ÍNDICE da rodada, então não existe assinatura pela qual o jogador entre na conta;
 *  - **vencer a rodada não dá ouro** (RF-23) — não existe caminho de código que credite por vitória,
 *    e `creditar` não recebe `vitorias`. Invariante testável: "para toda partida,
 *    `ouro_recebido(jogador)` é função apenas do índice da rodada e do saldo guardado";
 *  - **juros sobre o guardado, com teto**, creditados junto com a renda.
 */

/**
 * ⚠️ PROVISÓRIO — D-09. Nenhum destes números foi decidido: eles existem para que a Fase 3
 * possa ser JOGADA e MEDIDA. O valor definitivo sai da telemetria da §10 com humano no
 * controle, e a alteração é decisão de produto (@pm), não de arquitetura.
 *
 * A marcação é ESTRUTURAL, no mesmo padrão de `MAGNITUDE_PROVISORIA`/`PRECO_PROVISORIO`
 * (`shop/catalogo.ts`, `e3.1`): os números moram num lugar só, com o aviso em cima, e **nada os lê
 * senão através de `ParametrosEconomia`** — nenhum literal solto na linha do uso, nem com
 * comentário justificando (é o defeito de forma que ARCH-E31-002 registrou no Relicário, e a
 * recomendação de `e3.1` para esta story é explícita em não repeti-lo).
 *
 * `rendaPorRodada: [4,5,6,7,8]` é o exemplo LITERAL do `DESIGN.md` §4 — exemplo, não decisão. Não
 * inventar números diferentes: eles serão revisados com telemetria em `e3.7`.
 */
export const ECONOMIA_PROVISORIA: ParametrosEconomia = {
  ouroInicial: 0,
  rendaPorRodada: [4, 5, 6, 7, 8],
  rendaAposATabela: 8,
  jurosPorDezOuro: 1,
  tetoDeJuros: 3,
  precoTrocaDeBuild: 5,
}

/**
 * §6.3 — a tabela tem 5 entradas e a partida pode ter 7 rodadas (D-02). A 6ª acontece em **5,6%**
 * dos casos e a 7ª em **0,5%** (§1.5): é raro, e é exatamente por isso que ninguém notaria um
 * `undefined` ali até acontecer numa sessão de teste com o usuário.
 *
 * Repetir o último valor (`rendaAposATabela`) é a leitura conservadora — a renda não decresce e não
 * explode — e está marcada como provisória com o resto.
 */
export function rendaDaRodada(eco: ParametrosEconomia, indice: number): number {
  return eco.rendaPorRodada[indice] ?? eco.rendaAposATabela
}

/**
 * §6.2 — juros sobre o ouro GUARDADO, com teto: `min(tetoDeJuros, floor(ouro / 10) × jurosPorDezOuro)`.
 *
 * Duas notas sobre a forma, porque a §6.2 escreve a fórmula como `floor(min(tetoDeJuros, ouro / 10))`:
 *
 *  1. **`jurosPorDezOuro` entra na conta.** Se ele não entrasse, o parâmetro seria morto e a §6.2
 *     estaria contradizendo o próprio `ParametrosEconomia` que ela declara. Com o valor provisório
 *     `jurosPorDezOuro = 1` as duas expressões são idênticas para todo `ouro` inteiro — conferido:
 *     `floor(min(3, 35/10)) = 3` e `min(3, floor(3.5) × 1) = 3`; `floor(min(3, 25/10)) = 2` e
 *     `min(3, floor(2.5) × 1) = 2`. A diferença só apareceria com `jurosPorDezOuro ≠ 1`, que é
 *     exatamente o caso em que a fórmula da §6.2 deixaria de fazer sentido.
 *  2. **O `floor` vem ANTES da multiplicação e do teto**, e não depois: assim o resultado é inteiro
 *     por construção (§6.1), sem depender de `tetoDeJuros` ser inteiro. Aplicar o `floor` por
 *     último devolveria fração se um dia o teto fosse fracionário.
 *
 * O teto existe para que "guardar" não domine "gastar" numa curva de ~3,3 compras (§1.5); o valor
 * do teto é D-09, provisório.
 */
export function jurosDe(eco: ParametrosEconomia, ouroGuardado: number): number {
  const bruto = Math.floor(ouroGuardado / 10) * eco.jurosPorDezOuro
  return Math.min(eco.tetoDeJuros, bruto)
}

/**
 * O crédito de UMA passagem de rodada: renda da rodada `indice` + juros sobre o saldo guardado.
 *
 * **A assinatura é a invariante de RF-23.** Ela recebe o índice da rodada e o saldo, e mais nada:
 * não há como creditar por vitória, por placar ou por lado sem mudar a assinatura — o que faz do
 * snowball uma mudança visível em vez de um efeito colateral de "conveniência de balanceamento".
 */
export function creditar(
  eco: ParametrosEconomia,
  indiceDaRodada: number,
  ouroGuardado: number,
): number {
  return ouroGuardado + rendaDaRodada(eco, indiceDaRodada) + jurosDe(eco, ouroGuardado)
}
