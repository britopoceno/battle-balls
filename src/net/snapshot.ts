import type { SimEvent, World } from '../sim/types.ts'
import type { EstaticoDaRodada, Snapshot } from './protocolo.ts'

/**
 * PRODUÇÃO DO FIO — `World → EstaticoDaRodada` (uma vez por rodada) e `World → Snapshot` (a cada
 * quadro), `docs/architecture-e4.md` §5.1, passo 2 de §10 (story `e4.2`).
 *
 * A FORMA é de `net/protocolo.ts` (`e4.0`); aqui mora só a PRODUÇÃO: o que ler do `World`, a
 * quantização de exibição e a acumulação de eventos. Nenhum tipo paralelo é declarado.
 *
 * Três regras que este arquivo cumpre por construção, e que a guarda de ida-e-volta do `sim:check`
 * (`tools/determinism.ts`) confere em runtime:
 *
 * 1. **Lê `World`, nunca escreve.** A guarda prova isso pelo hash: a rodada observada tick a tick
 *    termina com o mesmo hash do arnês.
 * 2. **Cada campo é copiado por nome, nunca por espalhamento** (`{ ...b }`). Espalhar uma entidade do
 *    motor é exatamente como a classe 3 (`memory`, `base`, `bonusItem`...) vazaria em silêncio: o `tsc`
 *    não reclama de campo a mais vindo de variável. A única exceção são os `SimEvent`, que são planos e
 *    já são vocabulário do fio.
 * 3. **Nada do snapshot aponta para dentro do `World`.** `arena`, `effects`, projéteis, zonas e eventos
 *    são objetos novos. Um snapshot guardado num buffer (`e4.5`) que compartilhasse `world.arena` teria
 *    o `pad` reescrito retroativamente pelo tick seguinte.
 *
 * Puro: sem socket, DOM, relógio de parede, aleatoriedade ou I/O (AC 3). Importa só TIPOS de `sim/`.
 */

/**
 * ⚠️ PRECISÃO DE EXIBIÇÃO, em px — o passo de quantização de posições (`x`, `y` de bolas, projéteis e
 * zonas). Erro máximo introduzido: metade do passo (0,005 px), num canvas de ~1000 px.
 *
 * **Não tem relação nenhuma com o quantum do `hash()` do arnês** (`toFixed(4)`, `tools/harness.ts`).
 * Aquele arredondamento é de VERIFICAÇÃO de determinismo, e `architecture-e4.md` §11.1 mostra que ele
 * não é banda de tolerância; este é de EXIBIÇÃO, e errar o último bit de uma posição aqui não tem
 * consequência nenhuma. Os dois números são independentes: mudar um não autoriza mudar o outro, e
 * nenhum deles deve ser derivado do outro.
 *
 * Precisa ser `1 / inteiro` (ver `quantizar`), para que o valor quantizado seja o double mais próximo
 * de um decimal curto e o JSON saia curto.
 */
export const EPS_POSICAO_PX = 0.01

/**
 * ⚠️ PRECISÃO DE EXIBIÇÃO, em radianos — o passo de quantização de ângulos (`facing` das bolas,
 * `angle` das Muralhas). Erro máximo: 0,0005 rad, ou ~0,05 px na ponta de uma Muralha de 100 px.
 * `facing` é dado de exibição puro (só `render.ts` o lê; não está no hash nem alimenta física).
 *
 * Mesma ressalva de `EPS_POSICAO_PX`: não é o quantum do `hash()`, e não tem relação com ele.
 */
export const EPS_ANGULO_RAD = 0.001

/**
 * Arredonda `v` ao múltiplo mais próximo de `passo`, com `passo = 1/k`. Multiplica e divide por `k`
 * (inteiro) em vez de fazer `round(v / passo) * passo`, que devolve `0.30000000000000004` e engorda o
 * JSON. Erro máximo `passo / 2` (mais o arredondamento do próprio double, desprezível).
 */
function quantizar(v: number, passo: number): number {
  const k = Math.round(1 / passo)
  return Math.round(v * k) / k
}

/**
 * §5.1, classe 1 — o estático da rodada, mandado uma vez em `{ t: 'rodadaInicio' }`.
 *
 * Sem quantização: são constantes, e `stat.maxHp`/`stat.radius` precisam bater EXATAMENTE com o
 * `World` a cada tick — é o que a tripwire da guarda confere (eles são estáticos por verificação, não
 * por natureza: `sim/stats.ts` os chama de "estruturais"). Sem cor: ela vem do `CHARS` local (§5.4).
 */
export function estaticoDaRodada(world: World): EstaticoDaRodada {
  return {
    balls: world.balls.map((b) => ({
      id: b.id,
      charId: b.charId,
      team: b.team,
      ultThreshold: b.ultThreshold,
      abilityIndex: b.abilityIndex,
      stat: { maxHp: b.stat.maxHp, radius: b.stat.radius },
    })),
  }
}

/**
 * Monta o snapshot do estado corrente com os eventos dados. Interno: quem produz snapshot de fora é o
 * `ProdutorDeSnapshot`, que é quem sabe quais eventos foram acumulados.
 *
 * Quantizados (AC 8): posições e ângulos. Exatos, de propósito:
 * - `time`, `abilityReadyAt` e `ultCharge` — o render compara `time >= abilityReadyAt` e
 *   `ultCharge >= ultThreshold` para acender o botão; arredondar poderia mostrar PRONTO o que não está;
 * - `hp`, `vx`/`vy`, raios, `halfLen`, `pull`, `arena` — fora do que o AC 8 manda quantizar. Medido em
 *   `e4.2`: quantizar TODO número a 0,01 tiraria só ~8% dos bytes; o grosso do custo em JSON são os
 *   nomes de campo, e a codificação do fio é decisão de `e4.3` (ver Dev Agent Record de `e4.2`, AC 9);
 * - `events` — cópias literais dos `SimEvent` do motor.
 */
function montarSnapshot(world: World, events: SimEvent[]): Snapshot {
  return {
    time: world.time,
    over: world.over,
    winner: world.winner,
    arena: { w: world.arena.w, h: world.arena.h, pad: world.arena.pad },
    balls: world.balls.map((b) => ({
      id: b.id,
      x: quantizar(b.x, EPS_POSICAO_PX),
      y: quantizar(b.y, EPS_POSICAO_PX),
      facing: quantizar(b.facing, EPS_ANGULO_RAD),
      hp: b.hp,
      alive: b.alive,
      ultCharge: b.ultCharge,
      abilityReadyAt: b.abilityReadyAt,
      effects: b.effects.map((e) => ({ kind: e.kind })),
    })),
    projectiles: world.projectiles.map((p) => ({
      id: p.id,
      x: quantizar(p.x, EPS_POSICAO_PX),
      y: quantizar(p.y, EPS_POSICAO_PX),
      vx: p.vx,
      vy: p.vy,
      radius: p.radius,
      color: p.color,
    })),
    zones: world.zones.map((z) => ({
      id: z.id,
      kind: z.kind,
      x: quantizar(z.x, EPS_POSICAO_PX),
      y: quantizar(z.y, EPS_POSICAO_PX),
      angle: quantizar(z.angle, EPS_ANGULO_RAD),
      halfLen: z.halfLen,
      radius: z.radius,
      pull: z.pull,
      ownerColor: z.ownerColor,
    })),
    events,
  }
}

/**
 * AC 5 — o acumulador de eventos. `world.events` guarda só os eventos do ÚLTIMO tick (`step` o zera no
 * começo), e com `SNAPSHOT_HZ < 60` há ticks sem snapshot: os eventos deles precisam entrar no próximo,
 * senão metade dos acertos some da tela (`client/main.ts` desenha os números flutuantes a partir de
 * `hit`).
 *
 * Contrato de uso (o servidor de `e4.4` é o consumidor):
 * - `observar(world)` **depois de CADA `step`**, sem pular nenhum — inclusive o do tick em que vai sair
 *   snapshot;
 * - `snapshot(world)` quando a cadência pedir; devolve o estado corrente com TODOS os eventos observados
 *   desde o snapshot anterior, e esvazia o acúmulo;
 * - **no fim da rodada, um último `snapshot`**, senão os eventos do tick final (o golpe que matou, o
 *   `roundEnd`) ficam no acúmulo e nunca saem.
 *
 * Quebrar o contrato é erro de programa, e falha alto em vez de perder eventos em silêncio: pular um
 * tick, observar o mesmo tick duas vezes, ou pedir snapshot de um tick não observado lançam exceção.
 */
export interface ProdutorDeSnapshot {
  observar(world: World): void
  snapshot(world: World): Snapshot
}

/**
 * Cria o acumulador de UMA rodada, a partir do mundo recém-criado (ou de onde a observação começa). O
 * estado — os eventos acumulados e o último tick visto — é explícito e por instância, preso a esta
 * fábrica; não há estado de módulo. Um produtor por rodada: reusar entre rodadas é o mesmo erro de M-1.
 */
export function criarProdutorDeSnapshot(world: World): ProdutorDeSnapshot {
  let ultimoTick = world.tick
  let acumulados: SimEvent[] = []

  return {
    observar(w: World): void {
      if (w.tick !== ultimoTick + 1) {
        throw new Error(
          `ProdutorDeSnapshot: observar() no tick ${w.tick}, mas o último observado foi ${ultimoTick} ` +
            '— todo tick precisa ser observado exatamente uma vez, senão eventos se perdem ou duplicam (AC 5)',
        )
      }
      ultimoTick = w.tick
      for (const ev of w.events) acumulados.push({ ...ev })
    },

    snapshot(w: World): Snapshot {
      if (w.tick !== ultimoTick) {
        throw new Error(
          `ProdutorDeSnapshot: snapshot() no tick ${w.tick}, mas o último observado foi ${ultimoTick} ` +
            '— observe o tick antes de fotografá-lo, senão os eventos dele ficam de fora (AC 5)',
        )
      }
      const events = acumulados
      acumulados = []
      return montarSnapshot(w, events)
    },
  }
}
