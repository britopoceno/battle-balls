/**
 * PRNG com semente. A simulação NUNCA usa Math.random — é a regra que garante
 * que a mesma seed + os mesmos comandos produzam a mesma partida, no servidor,
 * no cliente e no arnês de balanceamento.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SPLITMIX32_WEYL = 0x9e3779b9

/**
 * Mistura splitmix32 de referência (constantes de Chris Wellons, "lowbias32" —
 * `0x21f0aaad`/`0x735a2d97`). Não é a simulação: usada só por `deriveSeed` abaixo.
 */
function splitmix32Mix(x: number): number {
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad)
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97)
  return (x ^ (x >>> 15)) >>> 0
}

/**
 * debt.7/D-08 — deriva seeds descorrelacionadas de uma seed-mãe, uma por stream.
 * `sim/` não pode importar de `bot/` (RF-19); a direção permitida é bot → sim, então a
 * derivação mora aqui e o bot a consome.
 *
 * Tabela de streams reservados — escrita, não implícita (architecture.md §5.1;
 * architecture-e3.md §2.5 acrescentou as três últimas faixas):
 *   0      world.rng — a simulação (createWorld: ruído de largada; ctx.rand dentro de personagens)
 *   1      bot do time 0 — jitter de mira, limiar de decisão
 *   2      bot do time 1 — idem
 *   3      cliente — efeitos visuais. NUNCA pode afetar a simulação
 *   4      arnês, telemetria, geração de cenário
 *   5, 6   política de PARTIDA do bot (draft, build, compra) — jogador 0 / jogador 1.
 *          RESERVADO, sem consumidor ainda: quem saca daqui é `bot/partida.ts` (`e3.3`), via
 *          `mulberry32(deriveSeed(matchSeed, 5 + jogador))`. A story `e3.2` só reserva a faixa.
 *          O motivo de ser stream próprio é D-08: mudar a política de compra não pode mudar a
 *          sequência que a simulação saca, senão o replay de rodada deixa de valer entre versões.
 *   7      livre
 *   8 + i  seed da rodada `i` de uma PARTIDA (base 0, até `i = 6` pelo teto de 7 rodadas de D-02).
 *          Consumido por `match/setup.ts` (`seedDaRodada`, `e3.2`). É por seed-mãe, então não há
 *          conflito com as faixas acima: `deriveSeed(matchSeed, 8+i)` só colide com o stream 8+i
 *          da MESMA partida. Por que não `matchSeed + i`: seeds consecutivas em `mulberry32` dão
 *          sequências correlacionadas nos primeiros saques, e os primeiros saques de `createWorld`
 *          são o ruído de largada — as rodadas nasceriam parecidas.
 *
 * Esta atualização de tabela é COMENTÁRIO, não código (AC 6 de `e3.2`): nenhuma linha executável de
 * `src/sim/` mudou nesta story, e o golden hash é a prova.
 *
 * Nada consome um stream != 0 ainda (nenhum personagem chama ctx.rand, o bot placeholder
 * da Fase 0 não usa RNG) — infraestrutura entrando antes de precisar, mesmo padrão dos
 * passos 1-7 deste épico. Colisão avançando por Weyl sequence keyed por streamId, depois
 * mixada: verificado sem colisão para as 5 seeds do baseline × streamId 0-15 (ver
 * Completion Notes de debt.7).
 */
export function deriveSeed(seed: number, streamId: number): number {
  const state = ((seed >>> 0) + Math.imul(streamId >>> 0, SPLITMIX32_WEYL)) >>> 0
  return splitmix32Mix(state)
}
