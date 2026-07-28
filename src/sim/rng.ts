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
