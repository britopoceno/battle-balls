import { deriveSeed } from '../sim/rng.ts'
import type { CharDef, Team } from '../sim/types.ts'
import type { PickSetup, RoundSetup } from '../sim/world.ts'
import { agregarItens, validarCompra } from '../shop/agregar.ts'
import { jogadorDoLado, ladosDaRodada } from './regras.ts'
import type { EstadoPartida, Jogador } from './types.ts'

/**
 * A PONTE PARA `sim/` (`docs/architecture-e3.md` §5.2). É a única, e é fina de propósito:
 * `sim/` **não ganha um campo, um conceito nem um import**. Isto é o passo 8 da migração da dívida
 * (`architecture.md` §6.1) chegando pelo caminho previsto — *"a agregação acontece em `src/shop/` e a
 * simulação recebe um bloco de números"*.
 */

/**
 * §2.5, Regra 1 — a seed de cada rodada deriva da seed da partida, no stream `8 + i`.
 *
 * **Por que não `matchSeed + i`:** seeds consecutivas em `mulberry32` produzem sequências
 * correlacionadas nos primeiros saques, e os primeiros saques de `createWorld` são justamente o ruído
 * de largada (`world.ts:93-96`) — as rodadas de uma partida nasceriam parecidas. `deriveSeed` mistura
 * por splitmix32 keyed por stream, e a §2.5 verificou que as seeds saem descorrelacionadas para
 * `matchSeed` 1, 2 e 12345 nas 7 rodadas possíveis.
 */
export const STREAM_DA_RODADA = 8

export function seedDaRodada(matchSeed: number, indice: number): number {
  return deriveSeed(matchSeed, STREAM_DA_RODADA + indice)
}

/**
 * Monta o `RoundSetup` da rodada corrente a partir do estado da partida.
 *
 * `chars` entra por INJEÇÃO (a mesma de `createWorld`) porque `match/` não importa `chars/` (§2.2), e
 * é usado para recusar `charId` desconhecido AQUI, na borda, em vez de deixar `makeBall`
 * (`world.ts:105`) lançar de dentro do motor — inclusive o `charId` vazio de um estado cujo draft não
 * fechou.
 *
 * **`validarCompra` roda antes de `agregarItens`, sempre.** É a segunda metade da aresta que fecha
 * ARCH-E31-003 (a primeira está em `aplicar`, no caminho da decisão de compra) e ela não é
 * redundante: este é o ponto onde a lista de itens vira `PickSetup.itemBonus`, e ARCH-E30-002 atribui
 * a barragem de `NaN`/`Infinity` em `itemBonus` a quem POPULA o campo — que é esta função. O motivo
 * está medido no gate de `e2.5`: `{dmg: NaN}` em `itemBonus` faz "% sem ativa" saltar para 50% porque
 * todo cast decidido por valor esperado é suprimido (`NaN >= limiar` é `false`), e `{maxHp: NaN}` não
 * aparece em detector nenhum — a rodada continua rodando e a saída sai plausível e errada.
 *
 * Aqui ela **lança**, e a diferença de política em relação a `aplicar` (que rejeita com `erro`) é
 * deliberada: uma decisão ilegal é um evento normal de jogo (o jogador clicou no que não podia); um
 * estado inválido chegando ao motor é corrupção de estado, e o caminho de compra já a barrou. Este
 * `throw` é inalcançável por jogo legítimo — a mesma natureza do `personagem desconhecido` de
 * `makeBall`.
 *
 * CUSTO: `agregarItens` aloca um `Partial<BonusBlock>` por chamada. Correto para loja/UI e
 * **proibido no caminho quente** (`architecture.md` §7.1): esta função roda UMA vez por rodada, no
 * setup, nunca por tick. É a proibição que a recomendação de `e3.1` para esta story manda fazer valer.
 */
export function setupDaRodada(e: EstadoPartida, chars: Record<string, CharDef>): RoundSetup {
  const lados = ladosDaRodada(e)
  return {
    seed: seedDaRodada(e.seed, e.rodada),
    teams: [picksDoTime(e, chars, lados, 0), picksDoTime(e, chars, lados, 1)],
  }
}

function picksDoTime(
  e: EstadoPartida,
  chars: Record<string, CharDef>,
  lados: readonly [0 | 1, 0 | 1],
  time: Team,
): PickSetup[] {
  // §5.3 — JOGADOR ≠ LADO: quem ocupa este time nesta rodada sai de `ladoDoJogador`, e os itens/ouro
  // que ele leva são do JOGADOR, nunca do lado.
  const jogador: Jogador = jogadorDoLado(lados, time)
  return e.jogadores[jogador].personagens.map((p) => {
    if (!chars[p.charId]) {
      throw new Error(
        `setupDaRodada: personagem '${p.charId}' do jogador ${jogador} não está no roster ` +
          `(disponíveis: ${Object.keys(chars).join(', ')})`,
      )
    }
    const problemas = validarCompra(p.itens)
    if (problemas.length > 0) {
      throw new Error(
        `setupDaRodada: lista de itens inválida no jogador ${jogador} ('${p.charId}') — ` +
          `${problemas.length} problema(s): ${problemas.join(' | ')}`,
      )
    }
    return {
      charId: p.charId,
      abilityIndex: p.abilityIndex,
      passiveIndex: p.passiveIndex,
      // §7.3, ordem canônica: a ordem de COMPRA não influencia o resultado (A-10 da dívida)
      itemBonus: agregarItens(p.itens),
    }
  })
}
