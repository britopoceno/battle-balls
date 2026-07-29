import { deriveSeed, mulberry32 } from '../sim/rng.ts'
import type { AimSpec, Ball, Command, Team, WorldView } from '../sim/types.ts'

/**
 * BOT HEURÍSTICO — RF-43/44/45/46. Implementa `docs/architecture-e2.md` §2 inteira.
 *
 * Invariante de projeto (§2.1), da qual tudo o mais depende: o bot emite `Command[]` e nada
 * mais. Não move a bola (RF-12: a IA de movimento é autoral, do personagem), não dispara o
 * ataque básico (RF-13: automático), não escolhe build, não compra item, não drafta. É isso
 * que faz dele um proxy VÁLIDO de jogador: exerce exatamente as alavancas que os dois polegares
 * exercem (RF-32, RF-33). Se algum dia precisar de uma alavanca que o jogador não tem, a matriz
 * de winrate deixa de medir o jogo e passa a medir o bot.
 *
 * `dummy.ts` NÃO é substituído por este arquivo: continua sendo o driver de `determinism.ts` e,
 * portanto, o que sustenta os 10 hashes de referência. Ele passa a ser oficialmente um fixture
 * de teste congelado; `heuristic.ts` é o bot do arnês, do modo treino e do oponente solo (§2.7).
 *
 * Invariantes de determinismo (§3.3) que este arquivo respeita e que quem editar precisa manter:
 *   N-1  sem `Date.now`, `performance.now`, `process.hrtime`. O único relógio é `view.time`.
 *   N-2  `BotState.porBola` é container de CONSULTA: nunca se itera sobre ele. Toda iteração
 *        parte de `view.balls`, cuja ordem é a única ordem estável do sistema.
 *   N-3  o bot não escreve em `view`. `Omit` é raso e não protege; quem protege é o teste de
 *        replay de `e2.4`. Nenhuma atribuição a `view.*` deve existir abaixo desta linha.
 *   N-4  `Math.sqrt(a*a+b*b)` em vez de `Math.hypot`; nada de `atan2`. `cos`/`sin` aparecem uma
 *        vez só (a rotação de jitter, que não tem alternativa algébrica) e `log`/`pow` uma vez
 *        (a velocidade efetiva do dash) — §8.5 aceita explicitamente, e o motivo está lá: o
 *        arnês roda só em Node, e o replay que importa reproduz COMANDOS, não o bot.
 */

/** Congelado junto de `PRESET_ARNES`: nenhuma matriz de winrate é reportável sem esta string. */
export const BOT_VERSION = 'heuristic-1'

/**
 * Política do bot — NÃO é balanceamento. Trocar qualquer um destes números muda a matriz
 * inteira sem mudar uma linha do jogo, e é por isso que `BOT_VERSION` existe (§2.6).
 * Os nomes são os da arquitetura, em maiúsculas, de propósito: a auditoria é feita comparando
 * este bloco com §2.6 termo a termo, e renomear para o estilo do resto do código tornaria essa
 * conferência uma tradução em vez de uma leitura.
 */
export interface BotConfig {
  /** limiar base de `VE` por slot, antes do decaimento de §2.5 */
  readonly LIMIAR: { readonly ability: number; readonly ult: number }
  /** piso do fator de decaimento — impede que o limiar caia a zero e o cast vire sorteio */
  readonly PISO_LIMIAR: number
  /** em quanto tempo de espera o fator de decaimento percorreria 1 → 0 (antes do piso) */
  readonly DECAIMENTO_MS: number
  /** peso extra por inimigo ferido: `peso ∈ [1, 1 + PESO_FERIDO]` */
  readonly PESO_FERIDO: number
  /** fração de vida abaixo da qual `reposicao` vira fuga */
  readonly FUGA: number
  /** atraso humano suposto entre mirar e o alvo mudar de ideia, em segundos */
  readonly LAG_S: number
  /** meia-amplitude do jitter de ângulo, em radianos */
  readonly JITTER_RAD: number
  /** meia-amplitude do jitter de `mag` (0..1) */
  readonly JITTER_MAG: number
  /** ticks mínimos entre duas decisões da mesma bola */
  readonly REACAO_TICKS: number
  /** ticks extras sorteados por cima de `REACAO_TICKS` */
  readonly REACAO_JITTER_TICKS: number
}

/** §2.6 — valores exatos do preset do arnês. Idêntico para os dois times (RF-45). */
export const PRESET_ARNES: Readonly<BotConfig> = {
  LIMIAR: { ability: 0.55, ult: 0.8 },
  PISO_LIMIAR: 0.35,
  DECAIMENTO_MS: 8000,
  PESO_FERIDO: 1.0,
  FUGA: 0.35,
  LAG_S: 0.08,
  JITTER_RAD: 0.12,
  JITTER_MAG: 0.1,
  REACAO_TICKS: 9,
  REACAO_JITTER_TICKS: 7,
}

/**
 * Estado por bola. SÓ CONSULTA por id (N-2) — este objeto nunca é iterado.
 *
 * Decisão registrada (Should-Fix do @po no gate de e2.1): §2.7 desenha um único `prontoDesde`,
 * mas §2.5 mede `esperaMs` "desde que O SLOT ficou disponível", e ativa e ult ficam prontas em
 * instantes diferentes. Um campo só não serve aos dois. A saída aqui NÃO é duplicar o campo:
 * o instante em que a ATIVA ficou pronta já é observável e EXATO no `WorldView`
 * (`self.abilityReadyAt` é o fim do cooldown), então guardá-lo seria copiar um dado que já
 * existe — e copiar um dado que já existe é a fonte de divergência que este projeto já pagou
 * duas vezes (C3, `AimSpec` × `cast`). A ULT não tem campo equivalente: `ultCharge` cruza
 * `ultThreshold` num tick que o bot só percebe no seu próximo ponto de decisão. Esse — e só
 * esse — instante precisa de memória.
 */
export interface EstadoBola {
  /** tick a partir do qual esta bola volta a decidir (jitter de reação, §2.6) */
  proximaDecisaoTick: number
  /** `view.time` da primeira decisão em que a ult foi vista pronta · -1 = não estava pronta */
  prontoDesdeUlt: number
}

export interface BotState {
  readonly team: Team
  readonly cfg: Readonly<BotConfig>
  rand: () => number
  porBola: Record<number, EstadoBola>
}

/**
 * §3.1 / D-08 / RF-46 — o gerador do bot vive no OBJETO DO BOT, nunca em `World`. Stream 1 para
 * o time 0, stream 2 para o time 1, conforme a tabela de streams reservados de `sim/rng.ts`
 * (`debt.7`). Este é o primeiro consumidor real de stream ≠ 0 do projeto.
 *
 * `mulberry32` e `deriveSeed` são REUSADOS de `sim/rng.ts` — a direção `bot → sim` é a permitida
 * (RF-19) e reimplementar qualquer um dos dois aqui criaria dois geradores com o mesmo nome e
 * comportamentos que só divergiriam sob carga.
 */
export function createBot(
  matchSeed: number,
  team: Team,
  cfg: Readonly<BotConfig> = PRESET_ARNES,
): BotState {
  return {
    team,
    cfg,
    rand: mulberry32(deriveSeed(matchSeed, team + 1)),
    porBola: {},
  }
}

/** Mira já resolvida de um candidato: direção unitária, `mag` (0..1) e o ponto que o motor vai calcular. */
interface Candidato {
  dx: number
  dy: number
  mag: number
  /** ponto de impacto que `aimFrom` (world.ts) produzirá a partir de `dx,dy,mag` */
  px: number
  py: number
}

/** As três formas que o estimador de §2.3 sabe avaliar. `reposicao` e `utilidade` têm política própria. */
type AimAvaliavel = Extract<AimSpec, { kind: 'burst' | 'raio' | 'dash' }>

/** A parte de `AbilityDef`/`UltDef` que o bot lê. Os dois a satisfazem estruturalmente. */
interface SlotDef {
  readonly minRange: number
  readonly maxRange: number
  readonly aim: AimSpec
}

/**
 * §3.2 — A ORDEM DE SAQUE DO PRNG É CONTRATO, não detalhe de implementação. Mudá-la muda a
 * matriz inteira sem mudar uma linha de política:
 *
 *   para cada bola viva minha, NA ORDEM DE view.balls:
 *       se view.tick < st.proximaDecisaoTick: continua
 *       (1) r() → agenda a próxima decisão            ← SEMPRE, mesmo sem castar
 *       avalia ult;   se casta: (2) r() ângulo  (3) r() mag
 *       avalia ativa; se casta: (4) r() ângulo  (5) r() mag
 *
 * O saque (1) acontecer sempre é o que torna o consumo do stream função apenas do estado do
 * mundo, e não da decisão — o que é muito mais fácil de auditar quando um hash divergir.
 */
export function botCommands(view: WorldView, bot: BotState): Command[] {
  const cmds: Command[] = []
  const cfg = bot.cfg

  for (const self of view.balls) {
    // ponto 1 de 2 em que `team` entra no algoritmo (RF-45): quais bolas são minhas
    if (!self.alive || self.team !== bot.team) continue

    const st = estadoDe(bot, self.id)
    if (view.tick < st.proximaDecisaoTick) continue

    // (1) — sempre, castando ou não
    st.proximaDecisaoTick =
      view.tick + cfg.REACAO_TICKS + Math.floor(bot.rand() * cfg.REACAO_JITTER_TICKS)

    const def = view.chars[self.charId]
    if (!def) continue

    // --- ult
    const ultPronta = self.ultCharge >= self.ultThreshold
    if (!ultPronta) {
      st.prontoDesdeUlt = -1
    } else {
      if (st.prontoDesdeUlt < 0) st.prontoDesdeUlt = view.time
      const espera = view.time - st.prontoDesdeUlt
      const mira = decidir(view, self, def.ult, limiarEf(cfg, 'ult', espera), cfg)
      if (mira) emitir(cmds, view, self, 'ult', mira, bot)
    }

    // --- ativa
    const ab = def.abilities[self.abilityIndex]
    if (view.time >= self.abilityReadyAt) {
      // `abilityReadyAt` É o instante em que o slot ficou disponível — exato, sem memória
      const espera = view.time - self.abilityReadyAt
      const mira = decidir(view, self, ab, limiarEf(cfg, 'ability', espera), cfg)
      if (mira) emitir(cmds, view, self, 'ability', mira, bot)
    }
  }

  return cmds
}

// ---------------------------------------------------------------- decisão

/** Consulta (nunca iteração — N-2). Cria a entrada da bola na primeira vez que ela decide. */
function estadoDe(bot: BotState, ballId: number): EstadoBola {
  const st = bot.porBola[ballId]
  if (st) return st
  const novo: EstadoBola = { proximaDecisaoTick: 0, prontoDesdeUlt: -1 }
  bot.porBola[ballId] = novo
  return novo
}

/**
 * §2.5 — limiar com decaimento. Sem o decaimento, um personagem cujo `VE` raramente cruza o
 * limiar NUNCA casta a ult, e a matriz reporta como fraqueza de personagem o que é timidez de
 * bot: o modo de falha mais insidioso de um instrumento de balanceamento, porque é silencioso e
 * parece resultado. `PISO_LIMIAR` impede que o outro extremo (cast aleatório) aconteça.
 */
function limiarEf(cfg: Readonly<BotConfig>, slot: 'ability' | 'ult', esperaMs: number): number {
  const espera = esperaMs > 0 ? esperaMs : 0
  // guarda de divisão por zero: preset degenerado com DECAIMENTO_MS 0 cairia direto no piso,
  // nunca em NaN/-Infinity (Should-Fix REL-002 do gate de e2.1)
  const decai = cfg.DECAIMENTO_MS > 0 ? 1 - espera / cfg.DECAIMENTO_MS : 0
  return cfg.LIMIAR[slot] * Math.max(cfg.PISO_LIMIAR, decai)
}

/**
 * Escolhe a mira do slot, ou `null` se não vale castar. Cinco formas, ZERO ramos por personagem:
 * o único `switch` do bot é sobre `AimSpec.kind`, que é dado declarado em `chars/` (§2.2).
 */
function decidir(
  view: WorldView,
  self: Ball,
  slot: SlotDef,
  limiar: number,
  cfg: Readonly<BotConfig>,
): Candidato | null {
  switch (slot.aim.kind) {
    case 'burst':
    case 'raio':
    case 'dash':
      return porValorEsperado(view, self, slot, slot.aim, limiar, cfg)
    case 'reposicao':
      return politicaReposicao(view, self, slot, cfg)
    case 'utilidade':
      return politicaUtilidade(view, self, slot)
  }
}

/**
 * §2.4 — candidatos de mira: um por inimigo vivo (mirar na posição PREVISTA daquele inimigo);
 * no máximo 2 no 2v2. Vence o de maior `VE`, com comparação estrita e desempate explícito por
 * `id` (§3.3) — nunca `<=`, nunca `sort`.
 */
function porValorEsperado(
  view: WorldView,
  self: Ball,
  slot: SlotDef,
  S: AimAvaliavel,
  limiar: number,
  cfg: Readonly<BotConfig>,
): Candidato | null {
  let melhor: Candidato | null = null
  let melhorVE = 0
  let melhorId = 0

  for (const alvo of view.balls) {
    if (!alvo.alive || alvo.team === self.team) continue
    const cand = miraEm(self, slot, S, alvo)
    const ve = valorEsperado(view, self, S, cand, cfg)
    if (melhor === null || ve > melhorVE || (ve === melhorVE && alvo.id < melhorId)) {
      melhor = cand
      melhorVE = ve
      melhorId = alvo.id
    }
  }

  if (melhor === null) return null
  // BOT-001 (gate de e2.3, MEDIUM — entrada obrigatória desta story). Era
  // `if (melhorVE < limiar) return null`, e essa forma tem o defeito exato que as quatro guardas
  // `!(x > 0)` deste arquivo existem para evitar, só que virado ao contrário: `NaN < limiar` é
  // `false`, então um `VE` corrompido NÃO era barrado — ele passava, e o bot castava justamente
  // onde a política manda não castar. A geometria continua sã nesse caminho (o NaN entra por
  // `peso`, não pela mira), então a rede de finitude de `emitir` também não pegava.
  // Escrever a condição no sentido POSITIVO ("casta se cruzou o limiar") inverte o ônus: `NaN >=
  // limiar` é `false`, e o `!` transforma isso em "não casta". Para todo `VE` finito as duas
  // formas são idênticas — nenhum comportamento de jogo muda.
  // Isto fecha o ponto de DECISÃO, e portanto qualquer NaN, venha ele de `peso`, de `pAcerto` ou
  // de um produtor futuro; guardar só o produtor conhecido (`peso`) deixaria os outros abertos.
  if (!(melhorVE >= limiar)) return null
  return melhor
}

/**
 * Mira no inimigo `alvo`: liderança de 1ª ordem, e `mag` derivado do MESMO jeito que
 * `aimFrom` (world.ts:417) o consome — `reach = min + (max-min)*mag`. Derivar o ponto de
 * impacto de `mag`, e não o contrário, garante que o ponto que o bot avalia é exatamente o
 * ponto que o motor vai calcular; a alternativa (clampar a distância direto) diverge quando
 * `maxRange < minRange`, que nenhum personagem declara hoje e é justamente por isso que
 * ninguém notaria.
 */
function miraEm(self: Ball, slot: SlotDef, S: AimAvaliavel, alvo: Ball): Candidato {
  const t = tImpacto(S, distancia(self.x, self.y, alvo.x, alvo.y), self)
  const ax = alvo.x + alvo.vx * t
  const ay = alvo.y + alvo.vy * t
  let dx = ax - self.x
  let dy = ay - self.y
  const dPrev = Math.sqrt(dx * dx + dy * dy)
  if (dPrev > 0) {
    dx /= dPrev
    dy /= dPrev
  } else {
    // bolas sobrepostas: direção degenerada, mas determinística e finita (REL-002)
    dx = 1
    dy = 0
  }
  return direcionado(self, slot, dx, dy, faixa(dPrev, slot.minRange, slot.maxRange))
}

/**
 * §2.4 — `VE(mira) = Σ pAcerto(e|mira) * peso(e)` sobre TODOS os inimigos vivos, não só o alvo
 * pretendido. É o que faz um Tremor que pega dois valer o dobro sem nenhuma regra especial de
 * "habilidade de área", e o que faz FOCO DE FOGO EMERGIR — as duas bolas convergem no ferido
 * porque ele vale mais para as duas, sem canal de coordenação entre elas (§2.8).
 *
 * O dano da habilidade deliberadamente NÃO entra: o bot não sabe quanto o Tremor machuca e não
 * deve saber (§2.2 — dano é o número volátil, a segunda fonte de verdade que divergiria).
 * Consequência aceita: o bot escolhe QUANDO e ONDE, não QUAL habilidade (cada bola só tem uma
 * ativa, RF-03).
 */
function valorEsperado(
  view: WorldView,
  self: Ball,
  S: AimAvaliavel,
  cand: Candidato,
  cfg: Readonly<BotConfig>,
): number {
  let ve = 0
  for (const e of view.balls) {
    if (!e.alive || e.team === self.team) continue
    ve += pAcerto(self, S, cand, e, cfg) * peso(e, cfg)
  }
  return ve
}

/** §2.4 — `peso(e) = 1 + PESO_FERIDO * (1 − hp/maxHp)` ∈ [1, 1+PESO_FERIDO]. */
function peso(e: Ball, cfg: Readonly<BotConfig>): number {
  // maxHp tem piso absoluto de 20 em stats.ts, mas a guarda fica: um denominador não conferido
  // é como um NaN entra num somatório e sai do outro lado como comando (REL-002)
  if (!(e.stat.maxHp > 0)) return 1
  const frac = e.hp / e.stat.maxHp
  return 1 + cfg.PESO_FERIDO * (1 - (frac > 1 ? 1 : frac < 0 ? 0 : frac))
}

/**
 * §2.3 — chance de acerto. Um estimador, cinco formas, zero ramos por personagem.
 *
 *   sigma = |v_e| * (tImpacto + LAG_S)   // o alvo muda de ideia depois que eu miro
 *         + JITTER_RAD * dPrev           // o bot sabe que ele mesmo treme (§2.6)
 *         + erroMira                     // o que a habilidade não alcança vira erro, não corte
 *   pAcerto = raioEf² / (raioEf² + sigma²)
 *
 * Uma generalização registrada: §2.3 escreve o último termo como `erroAlcance = |dPrev −
 * alcanceEf|`, que só está definido para o inimigo em quem se está mirando. Mas §2.4 soma
 * `pAcerto` sobre TODOS os inimigos vivos, inclusive os que não são o alvo. `erroMira =
 * dist(pontoDeImpacto, posiçãoPrevista(e))` é a mesma quantidade escrita de forma geral: para o
 * inimigo mirado ela se REDUZ a `|dPrev − alcanceEf|` exatamente (o ponto de impacto está sobre
 * o raio até ele), e para os demais mede o quanto a mira passou longe. Sem isso, o somatório de
 * §2.4 não estaria definido; com isso, §2.3 continua valendo palavra por palavra no seu caso.
 *
 * `raioEf²/(raioEf²+sigma²)` em vez de corte duro (`sigma < raioEf ? 1 : 0`) porque é contínuo:
 * "qual alvo tem mais chance" ganha gradiente e não vira sorteio entre dois zeros. `|v_e|` em
 * vez da componente perpendicular porque perpendicular custaria um `atan2` (N-4) e porque o bot
 * não precisa jogar bem, precisa jogar IGUAL dos dois lados (RF-45).
 */
function pAcerto(
  self: Ball,
  S: AimAvaliavel,
  cand: Candidato,
  e: Ball,
  cfg: Readonly<BotConfig>,
): number {
  const t = tImpacto(S, distancia(self.x, self.y, e.x, e.y), self)
  const ex = e.x + e.vx * t
  const ey = e.y + e.vy * t
  const dPrev = distancia(self.x, self.y, ex, ey)
  const erroMira = distancia(cand.px, cand.py, ex, ey)
  const vAlvo = Math.sqrt(e.vx * e.vx + e.vy * e.vy)

  const raioEf =
    S.kind === 'burst'
      ? S.radius
      : S.kind === 'raio'
        ? S.radius + e.stat.radius
        : /* dash: o corpo do próprio caster é a arma */ self.stat.radius + e.stat.radius

  const sigma = vAlvo * (t + cfg.LAG_S) + cfg.JITTER_RAD * dPrev + erroMira
  const r2 = raioEf * raioEf
  const den = r2 + sigma * sigma
  // guarda de divisão por zero E de propagação de NaN (Should-Fix REL-002, gate de e2.1):
  // `raioEf` 0 com alvo parado, encostado e dentro de alcance daria 0/0 = NaN, e um NaN aqui
  // atravessaria `VE`, o limiar (toda comparação com NaN é falsa) e sairia em `dx/dy/mag`.
  // `!(den > 0)` — e não `den === 0` — é o que também barra NaN vindo de estado corrompido.
  if (!(den > 0)) return 0
  return r2 / den
}

/**
 * Tempo até o impacto, derivado do `kind` — nenhum `if (charId === ...)`.
 *
 * ARCH-001 (gate de e2.2, severidade MEDIUM, tratamento OBRIGATÓRIO nesta story). §2.3 escreve
 * `tImpacto = d / S.speed` com a MESMA linha para `raio` e para `dash`, mas os dois números não
 * significam a mesma coisa:
 *
 *   - `raio` é projétil, e projétil não sofre arrasto. Medido no gate de e2.2: 609px/s reais
 *     contra 620 declarados = **98,2% de fidelidade**.
 *   - `dash` é o CORPO DO CASTER, e corpo sofre `drag` a cada tick (`physics.ts:18`:
 *     `v *= drag^dt`). Medido: o Golem percorre 247,4px em 450ms = 550px/s médios contra 900
 *     declarados = **61% de fidelidade**.
 *
 * Usar `S.speed` cru nos dois casos faria o bot subestimar `tImpacto` do dash em ~45%, e como
 * `sigma` cresce com `tImpacto`, ele castaria o dash com mais confiança do que a geometria
 * sustenta. O problema não é o erro: é a ASSIMETRIA. Um número — não um ramo de código —
 * reintroduziria por baixo o confundidor pelo qual a opção C foi rejeitada em §2.2, e a matriz
 * de winrate reportaria "o bot joga pior de Golem" como "o Golem é fraco".
 *
 * CORREÇÃO ADOTADA: para `dash`, a velocidade usada é a MÉDIA da lei que o motor de fato roda,
 * integrada sobre a janela declarada — `v(t) = v0·drag^t` ⇒
 * `v̄ = v0 · (1 − drag^T) / (T · −ln drag)`, com `T = S.ms/1000` e `drag = self.stat.drag`.
 * Nada de constante calibrada: uma constante ajustada ao Golem SERIA um número por personagem
 * disfarçado, exatamente o que se quer evitar. `stat.drag` já está no `WorldView` e `S.ms` já
 * está declarado — o bot não passa a ler nada novo, e `sim/` não muda uma linha.
 *
 * Viés residual, medido e REGISTRADO (não corrigido): a fórmula dá 77% para o Golem contra os
 * 61% medidos. A diferença é a IA de MOVIMENTO puxando a velocidade de volta para `maxSpeed`
 * (105 contra os 900 do dash) durante a janela — e modelar a IA de movimento é justamente o que
 * o bot não pode fazer (RF-12: movimento é autoral, mora no closure `move` do personagem; lê-lo
 * seria voltar ao problema código-versus-dado que `AimSpec` existe para resolver). O saldo é
 * medível: o erro de `tImpacto` do dash cai de +64% para +26%, e a assimetria de fidelidade
 * entre Golem e Vex cai de 37pp para 21pp. Melhora sem inventar desenho; o resto é medição de
 * `e2.4`/`e2.5` (§6.3 imprime utilização de kit por personagem, que é o detector deste viés).
 */
function tImpacto(S: AimAvaliavel, d: number, self: Ball): number {
  if (S.kind === 'burst') return S.delayMs / 1000
  const v = S.kind === 'dash' ? velEfetivaDash(S.speed, S.ms, self.stat.drag) : S.speed
  return v > 0 ? d / v : 0
}

/** Velocidade média de uma investida sob arrasto exponencial. Ver ARCH-001 em `tImpacto`. */
function velEfetivaDash(speed: number, ms: number, drag: number): number {
  const T = ms / 1000
  // fora deste domínio a integral não está definida (ou é a identidade): devolve o declarado,
  // que é o comportamento de §2.3 sem correção — degradar, nunca produzir NaN (REL-002)
  if (!(T > 0) || !(drag > 0) || drag >= 1) return speed
  const fator = (1 - Math.pow(drag, T)) / (T * -Math.log(drag))
  return speed * fator
}

// ---------------------------------------------------------------- políticas sem VE

/**
 * §2.4 — `reposicao` não tem `VE` (não causa dano; um estimador genérico mergulharia o Vex em
 * cima do inimigo, que é o oposto do uso correto — §2.2). Política declarada, a MESMA para todo
 * personagem: se `hp/maxHp < FUGA` foge na direção oposta ao inimigo mais próximo; senão, se o
 * inimigo mais próximo está além do alcance do ataque básico, aproxima; senão, não casta.
 *
 * [AUTO-DECISION] a política declara a DIREÇÃO, não `mag`, e a arquitetura não fecha o ponto.
 * Fuga usa `mag = 1` (a fuga quer distância máxima: o slot não alcança o que não pede) e
 * aproximação usa `faixa(d, ...)`, que é a mesma regra do `dummy` e das demais miras deste
 * arquivo — pedir o alcance que corresponde à distância do alvo.
 */
function politicaReposicao(
  view: WorldView,
  self: Ball,
  slot: SlotDef,
  cfg: Readonly<BotConfig>,
): Candidato | null {
  const alvo = maisProximo(view, self)
  if (!alvo) return null

  const dx = alvo.x - self.x
  const dy = alvo.y - self.y
  const d = Math.sqrt(dx * dx + dy * dy)
  const fracHp = self.stat.maxHp > 0 ? self.hp / self.stat.maxHp : 1

  if (fracHp < cfg.FUGA) return direcionado(self, slot, d > 0 ? -dx / d : 1, d > 0 ? -dy / d : 0, 1)

  const def = view.chars[self.charId]
  if (!def) return null
  // mesmo alcance que `autoAttack` (world.ts:465-474) mede: superfície a superfície, com o
  // multiplicador `stat.range`. Reimplementar "de cabeça" daria um número parecido e errado.
  const alcanceBasico = def.atk.range * self.stat.range
  const gap = d - self.stat.radius - alvo.stat.radius
  if (gap > alcanceBasico) {
    const mag = faixa(d, slot.minRange, slot.maxRange)
    return direcionado(self, slot, d > 0 ? dx / d : 1, d > 0 ? dy / d : 0, mag)
  }
  return null
}

/**
 * §2.4 — `utilidade` é o "o bot não sabe avaliar isto" declarado (Muralha). Casta se disponível
 * e o inimigo mais próximo está dentro de `[minRange, maxRange]`, mirando nele. É a regra do
 * `dummy`, agora declarada como o que ela é — e não uma omissão que passaria calada.
 */
function politicaUtilidade(view: WorldView, self: Ball, slot: SlotDef): Candidato | null {
  const alvo = maisProximo(view, self)
  if (!alvo) return null
  const dx = alvo.x - self.x
  const dy = alvo.y - self.y
  const d = Math.sqrt(dx * dx + dy * dy)
  if (d < slot.minRange || d > slot.maxRange) return null
  const mag = faixa(d, slot.minRange, slot.maxRange)
  return direcionado(self, slot, d > 0 ? dx / d : 1, d > 0 ? dy / d : 0, mag)
}

// ---------------------------------------------------------------- emissão e utilitários

/**
 * §2.6 — jitter de ângulo (saque 2/4) e de distância (saque 3/5), NESSA ORDEM. O `cos`/`sin`
 * aqui é a única rotação do arquivo e não tem alternativa algébrica: §8.5 aceita explicitamente
 * (o arnês roda só em Node, e o replay de RF-41 reproduz comandos gravados, não o bot).
 *
 * A guarda final de finitude fecha REL-002 no ponto de saída: um comando com `NaN` em `dx` seria
 * normalizado por `aimFrom` para `NaN/1` e viraria uma posição `NaN` dentro da simulação, que é
 * onde o dano é irreversível. Os saques já aconteceram quando ela dispara — descartar o comando
 * não desalinha o stream (§3.2: o consumo é função do estado, não da decisão).
 */
function emitir(
  cmds: Command[],
  view: WorldView,
  self: Ball,
  slot: 'ability' | 'ult',
  mira: Candidato,
  bot: BotState,
): void {
  const ang = (bot.rand() * 2 - 1) * bot.cfg.JITTER_RAD
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  const dx = mira.dx * c - mira.dy * s
  const dy = mira.dx * s + mira.dy * c

  const mag = clamp01(mira.mag + (bot.rand() * 2 - 1) * bot.cfg.JITTER_MAG)

  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(mag)) return
  cmds.push({ tick: view.tick, ballId: self.id, slot, dx, dy, mag })
}

/** Candidato com direção já unitária — usado pelas políticas que não passam por `VE`. */
function direcionado(self: Ball, slot: SlotDef, dx: number, dy: number, mag: number): Candidato {
  const alcance = slot.minRange + (slot.maxRange - slot.minRange) * mag
  return { dx, dy, mag, px: self.x + dx * alcance, py: self.y + dy * alcance }
}

/**
 * Inimigo mais próximo. Percorre `view.balls` NA ORDEM DADA — nunca ordena (§3.3) — com
 * comparação estrita e desempate por `id`, que aqui é redundante com a ordem do array e escrito
 * assim mesmo: a invariante de `world.balls` proíbe reordenar, e uma redundância barata é o que
 * sobra de proteção no dia em que alguém a violar.
 */
function maisProximo(view: WorldView, self: Ball): Ball | null {
  let melhor: Ball | null = null
  let melhorD2 = 0
  for (const b of view.balls) {
    if (!b.alive || b.team === self.team) continue
    const dx = b.x - self.x
    const dy = b.y - self.y
    const d2 = dx * dx + dy * dy
    if (melhor === null || d2 < melhorD2 || (d2 === melhorD2 && b.id < melhor.id)) {
      melhor = b
      melhorD2 = d2
    }
  }
  return melhor
}

/** N-4: `Math.sqrt(a*a+b*b)`, nunca `Math.hypot` — não é bit-exato entre engines (§8.5). */
function distancia(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  return Math.sqrt(dx * dx + dy * dy)
}

/** Fração de arrasto que o jogador puxaria para pedir alcance `d`. Mesma regra do `dummy`. */
function faixa(d: number, min: number, max: number): number {
  if (max <= min) return 1
  return clamp01((d - min) / (max - min))
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}
