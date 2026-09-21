import type { Decisao, Jogador, ResultadoRodada, VisaoPartida } from '../match/types.ts'
import type { Ball, Command, Effect, Projectile, SimEvent, World, Zone } from '../sim/types.ts'

/**
 * PROTOCOLO DO FIO — o vocabulário completo do que atravessa a rede na Fase 4
 * (`docs/architecture-e4.md` §2.2, passo 0 de §10).
 *
 * ⚠️ INVARIANTE — no modo conectado o cliente **não** chama `step()`. É isso, e só isso, que faz o
 * modelo sobreviver ao resultado de `architecture-e4.md` §1.5: Node e Chrome divergem em bits na mesma
 * simulação (`Math.atan2`/`sin`/`cos` diferem entre engines). Qualquer "otimização" futura que faça o
 * cliente simular reabre esse problema, e reabre em silêncio — predição funciona 99% do tempo e falha
 * exatamente quando o `atan2` de uma Muralha cai do lado errado. Nada neste arquivo carrega o que o
 * cliente precisaria para simular, e é de propósito: o cliente recebe o que DESENHAR, não o que decidir.
 *
 * Puro: não conhece socket, DOM, relógio de parede, aleatoriedade nem I/O. É a mesma disciplina de
 * `sim/`, `match/` e `bot/`, e pelo mesmo motivo (§2.2, §2.3): `net/sala.ts` roda nos dois lados da
 * fronteira, e a biblioteca de socket do servidor não roda no navegador. Quem tem socket é `server/`;
 * quem tem o socket do navegador é `client/rede.ts`. Só assim uma sala inteira cabe no `sim:check`, sem
 * subir servidor nenhum. (Sem nomear a biblioteca de propósito: o gate de pureza é um grep, e um
 * comentário que casa com ele é ruído no gate.)
 *
 * DIREÇÃO DAS SETAS (§2.2) — `net/ → sim/, match/`, **só tipos**. Nunca de `tools/`, `client/`, `bot/`
 * nem `chars/`. `Decisao`, `VisaoPartida`, `ResultadoRodada` e `Jogador` vêm de `match/types.ts`;
 * `Command` e as entidades do mundo vêm de `sim/types.ts`. Nada é redeclarado aqui — uma segunda
 * definição de qualquer um deles é a lição de C3 se repetindo.
 */

/**
 * RF-38 / P4.1 — o atraso de input, em ticks (~100ms a 60 Hz).
 *
 * **Definição ÚNICA do projeto.** O modo local (`e4.1`) e o servidor (`e4.4`) leem daqui, e é isso que
 * faz o modo solo ser treino honesto para o 1v1: o jogador sente o mesmo atraso contra o bot e contra
 * uma pessoa. Uma segunda constante "só para o local" reabre a diferença que esta existe para fechar.
 *
 * No modo conectado quem soma este número é o SERVIDOR (`tickAtual + ATRASO_ALVO_TICKS`), nunca o
 * cliente — ver `{ t: 'cast' }` em `DoCliente` e §4.1.
 */
export const ATRASO_ALVO_TICKS = 6

/**
 * RF-39 — quantos snapshots por segundo o servidor manda a cada cliente (§5.2).
 *
 * ⚠️ R-03 — o valor sai de MEDIÇÃO em dois aparelhos (smoke de P4.4, `e4.7`), não de raciocínio.
 * `30` aqui é o PONTO DE PARTIDA, não decisão: paga metade do atraso de interpolação de 20 Hz por
 * ~2,7 kbit/s, e 60 Hz gastaria o dobro de rádio sem que a §1.1 sugira que alguém veja diferença. Mas
 * ninguém viu o jogo rodando em dois celulares ainda — a story de P4.4 termina com o valor que a
 * medição encontrar, e é este o único lugar que muda.
 */
export const SNAPSHOT_HZ = 30

/**
 * §11.6.1, Decisão 2 (`e4.9`) — a VERSÃO DO FIO, levada no `{ t: 'sala' }` e conferida em runtime por
 * `decodificarDoServidor` (`net/codec.ts`) antes de qualquer `{ t: 'snap' }` ser decodificado.
 *
 * **Sobe quando:** muda o layout ou a quantização de `codec.ts`; muda a forma de qualquer variante de
 * `DoCliente`/`DoServidor`; ou muda o significado ou a unidade de um campo.
 *
 * **NÃO sobe** com `SNAPSHOT_HZ` nem com o `permessage-deflate`: são levers de operação, sobrescritos na
 * subida do servidor sem rebuild (`e4.7`/AC 4), e amarrá-los à versão faria o override derrubar os
 * clientes. (Por isso `snapshotHz` viaja como CAMPO do `{ t: 'sala' }`, conferido pela forma.)
 *
 * Começa em `1`, não em `0`: um servidor sem o campo manda `undefined`, e esse caso falha pelo mesmo
 * caminho de um número errado.
 */
export const VERSAO_DO_FIO = 1

/**
 * §5.1, classe 1 — o ESTÁTICO DA RODADA: o que não muda de um tick para o outro, mandado uma vez em
 * `{ t: 'rodadaInicio' }`.
 *
 * O protocolo é o dono do VOCABULÁRIO; `net/snapshot.ts` (`e4.2`) é o dono da PRODUÇÃO. A forma é
 * recortada por `Pick` das entidades de `sim/`, no espírito de `WorldView = Omit<World,'rng'>`: nenhum
 * campo é redeclarado, então se `sim/` renomear um deles isto quebra na compilação em vez de divergir.
 * Os campos são exatamente os que `client/render.ts` lê (lista fechada no Dev Notes de `e4.2`).
 *
 * A cor NÃO está aqui: `render.ts` a lê de `chars[charId].color`, e o roster é conteúdo local do
 * bundle (§5.4), não autoridade. `stat.maxHp` e `stat.radius` são estáticos por VERIFICAÇÃO, não por
 * natureza (`sim/stats.ts`: "estruturais") — a tripwire que confere isso é da guarda de `e4.2`.
 */
export interface EstaticoDaRodada {
  balls: (Pick<Ball, 'id' | 'charId' | 'team' | 'ultThreshold' | 'abilityIndex'> & {
    stat: Pick<Ball['stat'], 'maxHp' | 'radius'>
  })[]
}

/**
 * §5.1, classe 2 — o SNAPSHOT: o dinâmico que o render lê, a cada `{ t: 'snap' }`. **O snapshot não é
 * o mundo.** A classe 3 (`memory`, `ax/ay`, `contact`, `base`, `bonusPassive`, `bonusItem`, `nextId`,
 * `phase`, `rng`, `chars`) não tem campo aqui, e não ganha: um campo interno que vaze é um campo que o
 * cliente pode exibir, e daí a dois passos de alguém achar que o cliente pode decidi-lo.
 *
 * Mesma divisão de dono de `EstaticoDaRodada`: a forma é daqui, a produção (e a quantização, com o ε
 * declarado) é de `net/snapshot.ts` (`e4.2`). Tudo continua `number` no tipo — o ε de exibição é
 * decisão de quem produz, não do vocabulário.
 *
 * - `arena` inteira vai a cada quadro porque `pad` cresce na morte súbita; não é estática.
 * - `id` em projéteis e zonas não é lido pelo render, mas é o que permite conferir PRESENÇA (mesmos
 *   objetos, não só a mesma contagem) na guarda de ida-e-volta de `e4.2`.
 * - `events` são os ACUMULADOS desde o snapshot anterior, não os do último tick: com `SNAPSHOT_HZ < 60`,
 *   descartar os intermediários faria metade dos acertos sumir da tela (§5.3).
 */
export type Snapshot = Pick<World, 'time' | 'over' | 'winner' | 'arena'> & {
  balls: (Pick<Ball, 'id' | 'x' | 'y' | 'facing' | 'hp' | 'alive' | 'ultCharge' | 'abilityReadyAt'> & {
    effects: Pick<Effect, 'kind'>[]
  })[]
  projectiles: Pick<Projectile, 'id' | 'x' | 'y' | 'vx' | 'vy' | 'radius' | 'color'>[]
  zones: Pick<Zone, 'id' | 'kind' | 'x' | 'y' | 'angle' | 'halfLen' | 'radius' | 'pull' | 'ownerColor'>[]
  events: SimEvent[]
}

/**
 * CLIENTE → SERVIDOR.
 *
 * Vocabulário FECHADO, no precedente explícito de `AimSpec` (`e2.2`). Estender é ato deliberado,
 * revisado, não acidente: cada variante nova é uma porta nova que o servidor precisa validar, e o
 * cliente é justamente a ponta em que o servidor não confia.
 */
export type DoCliente =
  /**
   * `assento`: segredo devolvido no primeiro `{ t: 'sala' }` (campo `assento` de `DoServidor['sala']`,
   * com o mesmo nome nas duas direções — `e4.9`, §11.6.1), reapresentado ao reconectar. Sem ele o
   * servidor não distingue o jogador 0 voltando de um terceiro abrindo o link — os dois chegam
   * idênticos no fio. A "reconexão sai de graça" de §6 vale para o ESTADO (o cliente não guarda
   * autoridade); para a IDENTIDADE, é este campo. Quem gera (stream próprio, como o id da sala), guarda
   * e confere é `e4.4`; aqui ele só existe, para que a união não precise ser reaberta lá.
   */
  | { t: 'entrar'; sala: string; assento?: string }
  /** decisões da partida (draft, build, compra, pronto) — o mesmo `Decisao` do redutor, sem tradução */
  | { t: 'decisao'; d: Decisao }
  /**
   * **§4.1 — sem `tick`. O campo NÃO existe, e a ausência é a decisão.** Um tick escolhido pelo
   * cliente é um tick que o cliente pode escolher no passado: castar "no tick 300" com o servidor no
   * 340 é pedir para retroceder a simulação, e o servidor não conhece o futuro nem revisita o passado.
   * Quem carimba é o servidor, `tickAtual + ATRASO_ALVO_TICKS`. `Command.tick` continua existindo em
   * `sim/types.ts`, igual — muda quem o preenche, não o tipo.
   *
   * `ballIndex` (0 ou 1, a bola do PRÓPRIO jogador), nunca `ballId` do mundo (§8.1): o servidor resolve
   * `ballIndex → ballId` pelo assento da conexão e pelo lado que o jogador ocupa NESTA rodada (jogador
   * ≠ lado). Castar bola alheia fica impossível por construção, não por verificação.
   */
  | { t: 'cast'; ballIndex: 0 | 1; slot: Command['slot']; dx: number; dy: number; mag: number }
  /** resposta a `{ t: 'ping' }`, com o mesmo `id` */
  | { t: 'pong'; id: number }

/**
 * SERVIDOR → CLIENTE.
 *
 * Vocabulário FECHADO, mesmo precedente de `AimSpec` (`e2.2`) e mesma regra de `DoCliente`: estender
 * é ato deliberado, revisado, não acidente. Cobre as fases da sala (§6), a partida, o prazo e a rodada.
 */
export type DoServidor =
  /**
   * fase da sala (§6); `jogador` é o assento desta conexão — que NÃO é o lado da rodada.
   *
   * **Extensão deliberada do vocabulário fechado** (`e4.0`/AC 10): `versao`, `assento` e `snapshotHz`
   * entraram em `e4.9`, e a revisão que esse AC exige é a §11.6.1 de `architecture-e4.md` (Decisão 2 e
   * decisão O-1 do @po). Nenhum `t` novo: só campos numa variante existente.
   * - `versao`: o LITERAL de `VERSAO_DO_FIO` — quem produz não consegue pôr outro valor. O tipo não
   *   protege quem recebe; por isso `decodificarDoServidor` confere em runtime, e confere PRIMEIRO.
   * - `assento`: o segredo que o cliente reapresenta em `{ t: 'entrar', assento }` (achado M-4).
   * - `snapshotHz`: inteiro positivo divisor de 60 — a cadência da sala é `60 / snapshotHz` ticks
   *   (`e4.3`/AC 10) e o buffer do cliente divide por ele (`e4.5`/AC 7).
   *
   * ⚠️ SEGURANÇA — `{ t: 'sala' }` é mensagem **por assento, nunca broadcast**, na mesma regra do
   * `{ t: 'visao' }` (`e4.3`/AC 8). Um broadcast entregaria o segredo de um jogador ao outro, que o usaria
   * para reassentar no lugar dele (`e4.4`/AC 7: segredo válido derruba a conexão antiga). Contrato que
   * `net/sala.ts` (`e4.3`) enforca, provado pela guarda de `e4.3`/AC 11 (e).
   */
  | {
      t: 'sala'
      versao: typeof VERSAO_DO_FIO
      jogador: Jogador
      estado: 'aguardando' | 'jogando' | 'encerrada'
      assento: string
      snapshotHz: number
    }
  /** a projeção com segredo de `match/` — o servidor manda a visão, nunca `EstadoPartida` */
  | { t: 'visao'; v: VisaoPartida }
  /** §3.4 — o relógio de RF-04 é do servidor; o cliente só EXIBE o prazo que recebe pronto */
  | { t: 'prazo'; terminaEmMs: number }
  /** §5.1, classe 1 — uma vez por rodada */
  | { t: 'rodadaInicio'; estatico: EstaticoDaRodada }
  /** §5.1, classe 2 — a `SNAPSHOT_HZ`; `seq` monotônico por rodada (`e4.3`) */
  | { t: 'snap'; s: Snapshot; seq: number }
  | { t: 'rodadaFim'; resultado: ResultadoRodada }
  /** `Transicao.erro` pelo fio — decisão ilegal recusada, nunca aplicada pela metade */
  | { t: 'erro'; motivo: string }
  | { t: 'ping'; id: number }
