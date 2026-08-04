import type { Trilha } from '../shop/catalogo.ts'

/**
 * TIPOS DA PARTIDA — a camada que faltava acima de `RoundSetup` (`docs/architecture-e3.md` §2.1).
 *
 * Puro: não conhece render, relógio de parede, rede nem I/O. É a mesma disciplina de `sim/` e de
 * `bot/`, e pelo mesmo motivo (§2.2): na Fase 4 este código roda no servidor, e é o que permite
 * testar uma partida inteira headless dentro do `sim:check`.
 *
 * DIREÇÃO DAS SETAS (§2.2) — `match/ → sim/, shop/`, e nada mais:
 *   - `sim/` NÃO ganha um campo, um conceito nem um import por causa desta camada. Placar, ouro e
 *     itens ficam FORA de `World` por três razões em ordem de peso: `World` é o que a Fase 4
 *     serializa 60×/s; o golden hash mede `World` e todo campo novo é um campo que pode movê-lo por
 *     acidente; e economia não é física ("é preciso disto para resolver o tick?" — ouro não é).
 *   - `match/` NÃO importa de `tools/`. `ResultadoRodada.hash` é `string` e nada mais: quem CALCULA
 *     é o chamador (o arnês em `tools/harness.ts:75`, ou o cliente), que entrega o valor pronto a
 *     `registrarRodada`. O comentário de §2.3 ("reusando `tools/harness.hash`") descreve **quem
 *     produz** o valor, não um import — a tabela de §2.2 põe `tools/` ACIMA de `match/`, e um
 *     `import ... from '../tools/...'` aqui inverteria a seta e criaria ciclo.
 *   - `match/` NÃO importa `chars/`. O roster entra como DADO (`pool` do draft, `chars` de
 *     `setupDaRodada`), pela mesma injeção que `createWorld` já usa para `Record<string, CharDef>`.
 */

/** O jogador, que NÃO é o lado. Ver `EstadoPartida.jogadores` e §5.3. */
export type Jogador = 0 | 1

/**
 * Quem estava no controle de cada JOGADOR numa rodada. Existe por causa de P3.1 (§10.1): a mediana
 * de duração que D-05 exige é medida **com humano no controle**, e as partidas bot × bot do
 * `sim:check` entram no mesmo fluxo de eventos — sem este campo elas contaminariam a mediana.
 */
export type Controle = 'humano' | 'bot'

/** Escolha de um personagem: quem é, com que build, com que itens. Uma por bola. */
export interface EscolhaPersonagem {
  charId: string
  abilityIndex: 0 | 1
  passiveIndex: 0 | 1
  /** ids de item, na ordem de COMPRA — a agregação impõe a ordem canônica (§7.3) */
  itens: string[]
  /** RF-05 — a build do oponente só é legível depois da largada */
  revelado: boolean
}

export interface EstadoJogador {
  ouro: number
  vitorias: number
  personagens: [EscolhaPersonagem, EscolhaPersonagem]
}

export type FaseDaPartida = 'draft' | 'builds' | 'rodada' | 'loja' | 'fim'

/** §5.1 — as regras como DADO. Nenhuma delas é constante no código. */
export interface RegrasPartida {
  /** 3 — RF-20 */
  vitoriasParaVencer: number
  /** 7 — D-02 */
  tetoDeRodadas: number
  /** §5.3 / R-06(b) aprovada — o lado do jogador alterna a cada rodada */
  alternarLadoPorRodada: boolean
}

/**
 * §6.2 — parâmetros da economia. Todos ⚠️ PROVISÓRIOS (D-09) e a marcação é ESTRUTURAL: os números
 * moram num arquivo só (`economia.ts`), com o aviso no topo, e nada os lê senão através deste tipo.
 */
export interface ParametrosEconomia {
  ouroInicial: number
  /** renda por índice de rodada (base 0). A tabela tem 5 entradas e a partida pode ter 7 (§6.3) */
  rendaPorRodada: number[]
  /** §6.3 — continuação explícita para as rodadas 6ª (5,6% dos casos) e 7ª (0,5%) */
  rendaAposATabela: number
  /** RF-23 — juros sobre o ouro guardado, por cada 10 de ouro */
  jurosPorDezOuro: number
  tetoDeJuros: number
  /** D-01 — preço da troca de build entre rodadas */
  precoTrocaDeBuild: number
}

/**
 * §3.1 — estrutura de draft completa e genérica (`pool` e `ordem` suportam qualquer roster), mesmo
 * que o roster de 2 não permita draft de verdade (R-01 opção B aprovada, §3.2).
 *
 * **RF-02 — sem bans. O campo NÃO existe, e a ausência é a decisão.**
 */
export interface EstadoDraft {
  /** ids disponíveis, na ordem de exibição (RF-01: aberto, visível aos dois) */
  pool: string[]
  /** ordem snake das escolhas: `[0,1,1,0]` para 2 jogadores × 2 personagens (RF-01) */
  ordem: Jogador[]
  /** índice da próxima escolha em `ordem` */
  passo: number
  escolhas: { jogador: Jogador; charId: string }[]
}

export interface EstadoPartida {
  /** seed-mãe da partida. Toda aleatoriedade da partida deriva daqui (§2.5) */
  seed: number
  fase: FaseDaPartida
  /** índice da rodada corrente, base 0 */
  rodada: number
  regras: RegrasPartida
  economia: ParametrosEconomia
  jogadores: [EstadoJogador, EstadoJogador]
  draft: EstadoDraft
  historico: ResultadoRodada[]
  /**
   * DESVIO REGISTRADO em relação à lista literal de §2.3 / AC 1 — um campo a mais, e o único.
   *
   * §4.1 exige que a fase `builds` acabe "quando os dois jogadores emitiram `{t:'pronto'}`" e que
   * "a ordem em que as decisões chegam não muda o resultado". Nenhum dos campos de §2.3 registra
   * que um jogador já declarou pronto, e `historico`/`draft` não servem: sem este campo a decisão
   * `{t:'pronto'}` do AC 2 não teria efeito algum e a fase `builds` nunca fecharia — a
   * simultaneidade de RF-04 seria intestável.
   *
   * Escolhido como campo de `EstadoPartida` (e não `EstadoJogador.pronto`) por dois motivos: a
   * prontidão é do PASSO da partida, não do jogador (ela zera a cada mudança de fase, enquanto ouro
   * e vitórias atravessam a partida inteira), e mantém `EstadoJogador` idêntico ao literal do AC 1.
   *
   * Não é segredo: a `VisaoPartida` a carrega inteira, porque "esperando o oponente" é justamente o
   * que a tela de `e3.4` precisa desenhar, e saber que o oponente clicou não revela O QUE ele
   * escolheu (RF-04 declara segredo para a *seleção de build*, e nada mais).
   */
  prontos: [boolean, boolean]
}

export interface ResultadoRodada {
  indice: number
  seedDaRodada: number
  /** qual TIME cada JOGADOR ocupou nesta rodada — §5.3. Índice = jogador, valor = time */
  ladoDoJogador: [0 | 1, 0 | 1]
  /** já traduzido de time para JOGADOR pelo chamador — use `vencedorDaRodada` (`regras.ts`) */
  vencedor: Jogador | -1
  ticks: number
  /**
   * hash FNV-1a do estado final da rodada — a rodada é auditável. **`string` e nada mais:** quem
   * calcula é o chamador (`tools/harness.ts:75`), porque `match/` não pode importar de `tools/`.
   */
  hash: string
}

/**
 * §2.3 — as transições, como decisões explícitas. **`match/` não tem relógio** (§2.6): o estouro do
 * timer de 30s de RF-04 chega como `{ t: 'buildPadrao' }` produzido por quem é dono do relógio (o
 * cliente, `e3.4`). O log de decisões registra *o que foi escolhido*, nunca *quando* — e é por isso
 * que o replay reproduz a partida independentemente de quanto tempo o humano levou.
 */
export type Decisao =
  | { t: 'draft'; jogador: Jogador; charId: string }
  | { t: 'build'; jogador: Jogador; slot: 0 | 1; abilityIndex: 0 | 1; passiveIndex: 0 | 1 }
  | { t: 'buildPadrao'; jogador: Jogador }
  | { t: 'compra'; jogador: Jogador; slot: 0 | 1; itemId: string }
  | { t: 'trocaDeBuild'; jogador: Jogador; slot: 0 | 1; abilityIndex: 0 | 1; passiveIndex: 0 | 1 }
  | { t: 'pronto'; jogador: Jogador }

/**
 * §10.1 — a telemetria NASCE aqui, não no cliente: um redutor puro que não conta o que fez obriga o
 * cliente a reconstruir a história. Esta camada só **emite**; o coletor que persiste
 * (`client/telemetria.ts`, `localStorage`) é `e3.5` e é a única coisa da §10 que conhece DOM.
 */
export type EventoPartida =
  | {
      t: 'rodadaFim'
      rodada: number
      duracaoMs: number
      vencedor: Jogador | -1
      atingiu60s: boolean
      controle: [Controle, Controle]
    }
  | {
      t: 'compra'
      rodada: number
      jogador: Jogador
      itemId: string
      trilha: Trilha
      preco: number
      ouroDepois: number
    }
  | { t: 'trocaDeBuild'; rodada: number; jogador: Jogador; preco: number }
  | { t: 'buildPadrao'; rodada: number; jogador: Jogador }
  | { t: 'partidaFim'; rodadas: number; placar: [number, number] }

export interface Transicao {
  estado: EstadoPartida
  eventos: EventoPartida[]
  /** decisão ilegal: rejeitada com motivo, **nunca aplicada pela metade** (§2.3) */
  erro?: string
}

/**
 * §2.4 — SEGREDO POR PROJEÇÃO, no mesmo espírito de `WorldView = Omit<World,'rng'>`: a build não
 * revelada do oponente **não está no objeto**, então vazá-la é erro de compilação em vez de
 * violação descoberta em code review.
 *
 * Registro honesto, copiado de §2.4 para o lugar que executa: num processo só isto é convenção
 * reforçada pelo tipo, **não** garantia criptográfica. Quem abrir o devtools vê tudo. É aceitável
 * porque o adversário desta fase é o bot — e está escrito aqui para ninguém apresentar isto como
 * anti-cheat.
 */
export type VisaoPartida = Omit<EstadoPartida, 'jogadores'> & {
  eu: EstadoJogador
  oponente: OponenteVisivel
}

export interface OponenteVisivel {
  ouro: number
  vitorias: number
  personagens: [PersonagemVisivel, PersonagemVisivel]
}

/**
 * Build ausente enquanto `revelado === false` — o tipo OBRIGA o render a tratar o caso.
 *
 * **`itens` é visível nas duas variantes, de propósito:** as compras NÃO são secretas. RF-04
 * declara segredo para a *seleção de build* e mais nada; esconder também a loja seria regra que
 * ninguém escreveu (Artigo IV — No Invention). Nota explícita de §4.1.
 */
export type PersonagemVisivel =
  | { charId: string; revelado: false; itens: string[] }
  | { charId: string; revelado: true; itens: string[]; abilityIndex: 0 | 1; passiveIndex: 0 | 1 }
