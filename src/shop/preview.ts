import {
  STAT_KEYS,
  addPartialBonus,
  makeStatBlock,
  recomputeStats,
  type BonusBlock,
  type StatBlock,
} from '../sim/stats.ts'
import type { Ball } from '../sim/types.ts'

/**
 * PREVIEW DE STAT — "com este item, seu `stat.X` vira Y", calculado pelo MOTOR
 * (`docs/architecture-e3.md` §7.3, §13.3).
 *
 * Por que existe: se o jogador comprar dois itens no mesmo campo e o teto morder, ele **paga por
 * um bônus que não recebe** (Turbina no Vex satura em `ABS_MAX.maxSpeed = 420`; a segunda Borracha
 * é cortada em `restWall` mas não em `restBall` — ver os comentários dos itens em `catalogo.ts`).
 * A tela da loja precisa mostrar o valor EFETIVO, e o único jeito honesto de obtê-lo é chamar
 * `recomputeStats` sobre uma bola sintética — **nunca** reimplementar `base × (1 + clamp(Σ))` no
 * cliente. Reimplementar é criar a terceira fonte de verdade depois de o projeto já ter pago caro
 * por duas (C3 e a ressalva de `AimSpec`).
 *
 * PROCEDÊNCIA (`e3.1`, AC 10 / Anexo A passo 1): este helper era `function bolaSintetica(campo,
 * base, bonusItem)` dentro de `tools/balance.ts` (autoteste de clamps de `e2.8`), não exportado e
 * de campo único. Foi movido para cá e generalizado — **existe uma cópia só**, e `balance.ts`
 * importa desta. §13.3 registra este arquivo como o ponto do desenho de que o @architect menos
 * gosta: seria mais limpo se `recomputeStats` tivesse forma pura `(base, bonus) → StatBlock`, mas
 * ela foi recusada em `debt.1` por alocação no caminho quente, e reabrir isso agora seria mexer no
 * coração do motor por causa de uma tela. A bola sintética é o preço dessa recusa, e é barato:
 * duas alocações por preview, num caminho de UI que roda entre rodadas.
 *
 * DIREÇÃO DA DEPENDÊNCIA: `shop/` consome `sim/`, nunca o contrário. Nada em `sim/` importa este
 * arquivo, e o golden hash é a prova de que nada em `sim/` mudou.
 *
 * ⚠️ Efeito colateral herdado, registrado: `recomputeStats` incrementa `CLAMP_COUNTERS` quando o
 * arnês liga `observing`. Chamar um preview DENTRO de uma janela de medição do arnês misturaria
 * mordidas de UI com mordidas de partida. Em jogo (`observing === false`) nada é contado, e o
 * autoteste de `balance.ts` faz isso de propósito — é o que ele mede.
 */

/**
 * Uma `Ball` de mentira com só o necessário para `recomputeStats`: ele lê
 * `base`/`bonusPassive`/`bonusItem` e escreve `stat`, e não toca em nada mais da bola
 * (`sim/stats.ts:183-216`). O cast é o ponto único e deliberado dessa aproximação.
 *
 * `base` é COPIADA (nunca mutada) para a forma fixa de `STAT_KEYS` — a mesma hidden class dos
 * blocos de `sim/stats.ts`. Passe aqui a base do PERSONAGEM REAL (`ball.base`, ou o bloco que
 * `makeBall` monta a partir do `CharDef`); a `baseFolgada()` do autoteste de `balance.ts`
 * continua sendo dele, e usá-la num preview mostraria um teto que o jogo não aplica.
 *
 * O bônus é MULTI-CAMPO (`Partial<BonusBlock>`) porque a Borracha escreve `restBall` **e**
 * `restWall`, e porque somar dois itens no mesmo campo é justamente o caso em que o teto morde e o
 * preview importa. Entra por `addPartialBonus` — a MESMA função que `makeBall` usa para
 * `PickSetup.itemBonus` (`world.ts:166`), e não uma cópia da regra de agregação.
 */
export function bolaSintetica(base: Readonly<StatBlock>, bonus: Readonly<Partial<BonusBlock>>): Ball {
  const b = {
    base: makeStatBlock(0),
    bonusPassive: makeStatBlock(0),
    bonusItem: makeStatBlock(0),
    stat: makeStatBlock(0),
  }
  for (const k of STAT_KEYS) b.base[k] = base[k]
  addPartialBonus(b.bonusItem, bonus)
  return b as unknown as Ball
}

/**
 * O `StatBlock` EFETIVO de `base` com `bonus` aplicado — já com `SIGMA_MIN`/`SIGMA_MAX` e os
 * clamps absolutos, porque é o próprio `recomputeStats` que calcula. Isto é o que a tela da loja
 * (`e3.4`) exibe, e a diferença entre `previewStat(base, {})` e `previewStat(base, bonus)` é o que
 * o jogador REALMENTE compra — não o número escrito no `desc` do item.
 *
 * Não simula partida, não cria mundo, não consome RNG: é aritmética de stats e nada mais.
 *
 * DE ONDE VEM `base` (limite conhecido, deixado explícito para `e3.4`): o único lugar do projeto
 * que deriva um `StatBlock` de um `CharDef` é o literal dentro de `makeBall` (`sim/world.ts:141`),
 * inline. Extraí-lo daria a este arquivo um `baseDeChar(def)` de uma linha — mas é mudança em
 * `sim/`, que o AC 12 desta story proíbe (`src/sim/` não ganha linha em `e3.1`), e duplicar o
 * literal aqui criaria a segunda fonte de verdade que o projeto acabou de pagar para não ter.
 * Enquanto isso não for extraído, o chamador passa `ball.base` de uma bola existente. Registrado
 * como entrada de `e3.4`/`e3.2`, não como pendência silenciosa.
 */
export function previewStat(
  base: Readonly<StatBlock>,
  bonus: Readonly<Partial<BonusBlock>>,
): Readonly<StatBlock> {
  const b = bolaSintetica(base, bonus)
  recomputeStats(b)
  return b.stat
}
