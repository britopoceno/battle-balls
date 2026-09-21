import type { CharDef } from '../sim/types.ts'
import type { EstaticoDaRodada, Snapshot } from './protocolo.ts'

/**
 * PROJEÇÃO — `Snapshot + EstaticoDaRodada + CHARS → a forma que client/render.ts desenha`
 * (`docs/architecture-e4.md` §5.1 e §5.4, story `e4.2`).
 *
 * É o que permite ao cliente conectado desenhar uma rodada SEM SIMULAR — a propriedade da qual
 * dependem P4.2, o fechamento de §13.6 de E3 e a imunidade do modelo ao resultado de §1.5 (Node e
 * Chrome divergem em bits na mesma simulação). Nada aqui chama `step()`, e nada aqui reconstrói o que
 * o cliente precisaria para chamá-lo.
 *
 * Puro: sem socket, DOM, relógio de parede, aleatoriedade ou I/O (AC 3). Importa só TIPOS de `sim/`;
 * o roster entra como DADO injetado (`Record<string, CharDef>`), pela mesma porta que `createWorld`
 * usa — nunca por import de `chars/` (AC 10, §2.2).
 */

/**
 * Uma bola como o render a lê: o estático da rodada (`id`, `charId`, `team`, `ultThreshold`,
 * `abilityIndex`, `stat.maxHp`, `stat.radius`) somado ao dinâmico do snapshot (`x`, `y`, `facing`, `hp`,
 * `alive`, `ultCharge`, `abilityReadyAt`, `effects[].kind`).
 *
 * Derivada dos tipos do PROTOCOLO, não escrita à mão: se `e4.0` mudar a forma do fio, isto muda junto,
 * e o `tsc` acusa em `render.ts` o campo que o render lê e o fio deixou de trazer.
 *
 * `Ball` do motor satisfaz este tipo ESTRUTURALMENTE — é por isso que o modo local continua passando
 * as suas bolas a `desenhar` sem cast nem adaptação (AC 6).
 */
export type BolaVisivel = EstaticoDaRodada['balls'][number] & Snapshot['balls'][number]

/**
 * AC 6 — o mundo como o render o lê: exatamente os campos da lista fechada do Dev Notes de `e4.2`
 * (`arena`, `balls`, `projectiles`, `zones`, `chars`, `time`, `over`, `winner`), e nenhum outro.
 *
 * Mesmo precedente de `WorldView = Omit<World,'rng'>` (`debt.7`): estreitar o tipo que o consumidor
 * aceita sem tocar em ponto de chamada nenhum, porque `World` continua satisfazendo `VisaoDoMundo`
 * estruturalmente. Se um dia o modo local precisar de cast para passar `World` aqui, o tipo foi mal
 * desenhado. `events` não entra: quem os consome é `client/main.ts`, não o render.
 */
export type VisaoDoMundo = Pick<Snapshot, 'time' | 'over' | 'winner' | 'arena' | 'projectiles' | 'zones'> & {
  balls: BolaVisivel[]
  chars: Record<string, CharDef>
}

/**
 * Junta snapshot, estático da rodada e roster local numa `VisaoDoMundo`.
 *
 * As bolas saem na ordem do SNAPSHOT (que é a ordem do `World`) e são objetos novos; `arena`,
 * `projectiles`, `zones` e os `effects` de cada bola são repassados do snapshot sem cópia — trate o
 * resultado como somente-leitura, como o render já trata. A cor da bola não vem do fio: o render a lê
 * de `chars[charId].color`, e `chars` é o roster injetado.
 *
 * Lança exceção em vez de desenhar errado quando as três fontes não fecham entre si — bola do snapshot
 * sem estático (ou o contrário), ou `charId` fora do roster. As duas situações são defeito de protocolo
 * ou de bundle, e o render com `def` indefinido quebraria mais adiante, longe da causa.
 */
export function projetar(
  snap: Snapshot,
  estatico: EstaticoDaRodada,
  chars: Record<string, CharDef>,
): VisaoDoMundo {
  if (snap.balls.length !== estatico.balls.length) {
    throw new Error(
      `projetar: snapshot com ${snap.balls.length} bola(s), estático da rodada com ${estatico.balls.length}`,
    )
  }
  const balls = snap.balls.map((d): BolaVisivel => {
    const s = estatico.balls.find((e) => e.id === d.id)
    if (!s) throw new Error(`projetar: bola ${d.id} do snapshot não está no estático da rodada`)
    if (!chars[s.charId]) throw new Error(`projetar: charId '${s.charId}' (bola ${d.id}) fora do roster injetado`)
    return {
      id: d.id,
      charId: s.charId,
      team: s.team,
      ultThreshold: s.ultThreshold,
      abilityIndex: s.abilityIndex,
      stat: s.stat,
      x: d.x,
      y: d.y,
      facing: d.facing,
      hp: d.hp,
      alive: d.alive,
      ultCharge: d.ultCharge,
      abilityReadyAt: d.abilityReadyAt,
      effects: d.effects,
    }
  })
  return {
    time: snap.time,
    over: snap.over,
    winner: snap.winner,
    arena: snap.arena,
    balls,
    projectiles: snap.projectiles,
    zones: snap.zones,
    chars,
  }
}
