// Barril da camada de partida, no mesmo formato de `sim/index.ts`. Consumidores previstos:
// `tools/` (o teste de replay de partida desta story), `bot/partida.ts` (`e3.3`, só tipos) e
// `client/` (`e3.4`). `match/` só importa de `sim/` e `shop/` — nunca de `tools/`, `chars/` ou
// `client/` (`docs/architecture-e3.md` §2.2).
export * from './types.ts'
export * from './economia.ts'
export * from './regras.ts'
export * from './redutor.ts'
export * from './setup.ts'
export * from './visao.ts'
