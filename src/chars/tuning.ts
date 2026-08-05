/**
 * A ALAVANCA DE D-05 (`docs/architecture-e3.md` §9.1, story `e3.6`) — o único ponto de toda a Fase
 * 3 autorizado a mover o golden hash.
 *
 * ⚠️ D-05 — o valor sai de MEDIÇÃO com humano no controle (§10, evidência P3.1 da telemetria de
 * `e3.5`), não de raciocínio. `1.0`/`1.0` aqui é o PONTO DE PARTIDA (o jogo medido até agora), não
 * o estado de entrega — a story que resolve D-05 termina com o valor que a bissecção encontrar,
 * baseline re-gravado e o novo hash justificado no commit.
 */
export const ESCALA_HP = 6.0
export const ESCALA_DMG = 1.0
