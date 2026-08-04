import type { Team } from '../sim/types.ts'
import type { EstadoPartida, Jogador, RegrasPartida } from './types.ts'

/**
 * BO5, PLACAR, EMPATE E LADO (`docs/architecture-e3.md` §5).
 *
 * As regras são DADO (`RegrasPartida`), não constante enterrada no código: as três respostas
 * possíveis para R-06 custam uma linha cada porque `alternarLadoPorRodada` é um campo.
 */

/**
 * §5.1 + resolução do usuário de 2026-07-29 (R-06 opção (b) aprovada).
 *
 * `alternarLadoPorRodada: true` é mitigação BARATA do viés de lado medido — o time 0 vence **54,72%
 * ±4,0** no espelho `[golem,vex]` (§1.1), com intervalo que exclui 50%. Ela **não corrige** o viés:
 * cancela-o em expectativa ao longo do Bo5. Efeito colateral honesto, registrado em §5.3: num Bo5 de
 * 5 rodadas o jogador joga 3 de um lado e 2 do outro, então o cancelamento é imperfeito em partidas
 * de número ímpar de rodadas. Corrigir a simulação (resolução simultânea de dano) **move o golden
 * hash** e é a story de D-05 ou nenhuma.
 */
export const REGRAS_PADRAO: RegrasPartida = {
  vitoriasParaVencer: 3,
  tetoDeRodadas: 7,
  alternarLadoPorRodada: true,
}

/**
 * A ordem snake de RF-01 para 2 jogadores × 2 personagens. É DADO: virar `[0,1,1,0,0,1,...]` na
 * Fase 5 não toca uma linha de lógica (§3.1).
 */
export const ORDEM_SNAKE_2x2: Jogador[] = [0, 1, 1, 0]

/**
 * §5.3 — **JOGADOR ≠ LADO**, a decisão estrutural desta seção. `EstadoPartida` modela *jogadores*;
 * o lado (`Team` 0/1 do `RoundSetup`) é atribuído **por rodada** e registrado em
 * `ResultadoRodada.ladoDoJogador`. Itens, ouro e placar pertencem ao *jogador*, nunca ao lado.
 *
 * Índice = jogador, valor = time que ele ocupa nesta rodada. Rodadas de índice par: `[0,1]`; ímpar:
 * `[1,0]` quando a alternância está ligada. É a mesma técnica que o arnês usa (troca de lado
 * obrigatória, `architecture-e2.md` §4.2) aplicada ao jogo em vez do instrumento.
 */
export function ladosDaRodada(e: EstadoPartida): [0 | 1, 0 | 1] {
  const trocar = e.regras.alternarLadoPorRodada && e.rodada % 2 === 1
  return trocar ? [1, 0] : [0, 1]
}

/** Qual JOGADOR ocupa o time `time` nesta rodada — a inversa de `ladosDaRodada`. */
export function jogadorDoLado(lados: readonly [0 | 1, 0 | 1], time: Team): Jogador {
  return lados[0] === time ? 0 : 1
}

/**
 * Traduz o vencedor da rodada de TIME para JOGADOR. Existe para que nenhum chamador refaça essa
 * conversão à mão: `World.winner` é `Team | -1` e `ResultadoRodada.vencedor` é `Jogador | -1`, e
 * confundir os dois com a alternância ligada credita a vitória ao jogador errado em metade das
 * rodadas — um bug que o placar esconde bem, porque continua somando 1.
 */
export function vencedorDaRodada(
  lados: readonly [0 | 1, 0 | 1],
  vencedorTime: Team | -1,
): Jogador | -1 {
  return vencedorTime === -1 ? -1 : jogadorDoLado(lados, vencedorTime)
}

export function placarDe(e: EstadoPartida): [number, number] {
  return [e.jogadores[0].vitorias, e.jogadores[1].vitorias]
}

/**
 * Regra de fim, LITERAL de D-02 (§5.1): a partida acaba quando um jogador chega a
 * `vitoriasParaVencer` **ou** quando `rodada + 1 === tetoDeRodadas`.
 *
 * `rodada` aqui é o índice (base 0) da rodada que ACABOU de ser registrada — com o teto de 7, a
 * partida fecha depois da rodada de índice 6, isto é, depois da sétima rodada jogada.
 */
export function partidaAcabou(e: EstadoPartida, indiceDaRodada: number): boolean {
  const [v0, v1] = placarDe(e)
  const alguemVenceu = v0 >= e.regras.vitoriasParaVencer || v1 >= e.regras.vitoriasParaVencer
  return alguemVenceu || indiceDaRodada + 1 === e.regras.tetoDeRodadas
}

/**
 * Quem venceu a PARTIDA: quem tiver mais vitórias. **Igualdade de vitórias é empate de partida**
 * (`-1`), literal de D-02 — no teto de rodadas isso é um desfecho legítimo, não um estado de erro.
 */
export function vencedorDaPartida(e: EstadoPartida): Jogador | -1 {
  const [v0, v1] = placarDe(e)
  if (v0 === v1) return -1
  return v0 > v1 ? 0 : 1
}
