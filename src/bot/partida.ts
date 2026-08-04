// src/bot/partida.ts — política de PARTIDA. Não decide combate (isso é heuristic.ts).
import type { Decisao, Jogador, VisaoPartida } from '../match/types.ts'
import { deriveSeed, mulberry32 } from '../sim/rng.ts'
import { validarCompra } from '../shop/agregar.ts'
import { CATALOGO, type ItemDef, type Trilha } from '../shop/catalogo.ts'

/**
 * A POLÍTICA DE PARTIDA DO BOT — `docs/architecture-e3.md` §8.2, literal.
 *
 * `heuristic.ts` (`e2.3`) emite `Command[]` dentro de uma rodada e nada mais: não drafta, não
 * compra, não escolhe build, por invariante declarada (`architecture-e2.md` §2.1, §2.8). Este
 * arquivo é a camada que faltava ACIMA dele — quem exerce as três alavancas que o humano exerce
 * fora do combate. Os dois juntos formam um adversário de partida completo; nenhum dos dois sabe o
 * que o outro faz, e é assim que a fronteira se mantém.
 *
 * QUATRO DECISÕES DE FRONTEIRA (§8.2), todas executáveis aqui e não só escritas:
 *
 *  1. **Recebe `VisaoPartida`, nunca `EstadoPartida`.** O bot vê exatamente o que o humano veria —
 *     inclusive NÃO vendo a build fechada do oponente, que `visaoPara` (`match/visao.ts`) removeu do
 *     objeto. Não é disciplina: `VisaoPartida.oponente` é `OponenteVisivel`, e o ramo
 *     `revelado: false` de `PersonagemVisivel` não tem as chaves `abilityIndex`/`passiveIndex` —
 *     lê-las aqui é erro de compilação. Sem isto, uma política que espiasse a build alheia jogaria
 *     melhor por um motivo que o jogador não pode reproduzir, e o julgamento do portão ("dá vontade
 *     de jogar outra?") mediria frustração em vez de diversão (§13.2).
 *  2. **Stream de PRNG próprio (5 e 6)**, pelos motivos de D-08: mudar a política de compra não pode
 *     mudar a sequência que a SIMULAÇÃO saca, senão o replay de rodada deixaria de valer entre
 *     versões de política. Ver `criarPolitica` e o CONTRATO DE SAQUE abaixo.
 *  3. **Mora em `bot/`, não em `match/`.** `match/` são as regras; `bot/` é quem joga. É o que
 *     preserva a capacidade do arnês de rodar a mesma partida com políticas diferentes.
 *  4. **Simplicidade é requisito, não concessão** (§8.2, ponto 4). A política v1 é declarada e boba
 *     de propósito. Nada aqui tenta jogar bem; tudo aqui tenta ser auditável.
 *
 * FRONTEIRAS HERDADAS de `architecture-e2.md` §2.8, com uma diferença registrada:
 *   - não lê `world.rng` nem qualquer stream de 0 a 4 (a única derivação deste arquivo é
 *     `deriveSeed(matchSeed, 5 + jogador)`);
 *   - não conhece `chars/` — os `charId` que aparecem nas tabelas abaixo são STRINGS de política,
 *     e o roster de verdade entra por `VisaoPartida.draft.pool`, injetado;
 *   - não usa `Date.now`, `performance.now` nem DOM, mesma disciplina de `sim/` e `match/`;
 *   - **conhece `shop/`, e isso é diferença deliberada em relação ao bot de COMBATE.** §2.8 de
 *     `architecture-e2.md` escreve "não conhece item, preço nem loja" a respeito do bot de combate,
 *     que de fato não pode conhecer (item vira `PickSetup.itemBonus` antes da rodada e some). A
 *     tabela de setas de `architecture-e3.md` §2.2 concede explicitamente `bot/ → sim/, shop/,
 *     match/ (só tipos)` justamente por causa desta camada: comprar sem ver o catálogo é impossível.
 *     Note que o import de `match/` aqui é `import type` — nenhum valor de `match/` é executado.
 *
 * CONTRATO DE SAQUE (§3.2 de `architecture-e2.md`, subido para a partida). A ordem e a QUANTIDADE de
 * saques do stream 5/6 fazem parte de `POLITICA_VERSION`, não são detalhe de implementação:
 *
 *   escolherDraft   1 saque por chamada, SEMPRE (usado só no ramo degenerado — ver a função)
 *   escolherBuild   1 saque por chamada, SEMPRE (usado só quando o personagem não está na tabela)
 *   comprar         1 saque por ITERAÇÃO do laço de compra, no topo, SEMPRE — inclusive na iteração
 *                   que não compra nada. Fora da fase `loja`, zero saques (não é ponto de decisão).
 *
 * "Sacar sempre, mesmo sem decidir" é o mesmo desenho do saque (1) de `botCommands`: torna o consumo
 * do stream função apenas do ESTADO, e não da decisão tomada — o que é muito mais fácil de auditar
 * quando dois replays divergirem. Mudar qualquer linha desta tabela obriga a mudar
 * `POLITICA_VERSION` junto; o que ela NÃO pode fazer, por construção, é mover um hash de rodada
 * (streams disjuntos, D-08).
 */

/**
 * Congelada junto do conteúdo das três políticas E do contrato de saque acima. A telemetria de
 * `e3.5` registra esta string ao lado do preset de combate (`BOT_VERSION`/`PRESET_*` de
 * `heuristic.ts`): sem as duas, nenhum placar de partida bot × bot é interpretável — §13.2 diz que o
 * portão da fase precisa saber contra QUEM o humano jogou antes de ser dado.
 */
export const POLITICA_VERSION = 'partida-1'

/**
 * As três alavancas que o humano exerce fora do combate. A assinatura é a de §8.2, palavra por
 * palavra, e as três recebem `VisaoPartida` — a decisão de fronteira 1 está no TIPO.
 *
 * O `jogador` não aparece em nenhuma assinatura de propósito: `VisaoPartida` é a visão DE alguém e
 * não diz de quem (`eu`/`oponente` são posições, não índices). Quem sou eu vem de `criarPolitica`,
 * por fechamento — é o que permite `comprar` devolver `Decisao[]` já preenchido e o que impede uma
 * política de emitir decisão em nome do outro lado.
 */
export interface PoliticaPartida {
  escolherDraft: (v: VisaoPartida, r: () => number) => string
  escolherBuild: (v: VisaoPartida, slot: 0 | 1, r: () => number) => { abilityIndex: 0 | 1; passiveIndex: 0 | 1 }
  comprar: (v: VisaoPartida, r: () => number) => Decisao[]
}

/**
 * Streams 5 e 6 da tabela de `sim/rng.ts` — a faixa que `e3.2` RESERVOU sem consumidor e que esta
 * story passa a consumir. Jogador 0 → 5, jogador 1 → 6.
 *
 * Não é exportado, e isso é escolha: AC 3 da story fixa a superfície pública deste arquivo em três
 * nomes, e a tabela de streams já é escrita e auditável em `sim/rng.ts`, que é onde ela mora. Quem
 * quiser conferir de fora compara `criarPolitica(s, j).rand()` com
 * `mulberry32(deriveSeed(s, 5 + j))()` — que é exatamente o teste dirigido desta story.
 */
const STREAM_DA_POLITICA = 5

/**
 * ⚠️ PROVISÓRIO. Preferência de DRAFT, na ordem em que a política quer os personagens.
 *
 * Preferência é POLÍTICA, personagem é DADO — a mesma linha que `AimSpec` traçou em `e2.2` e que
 * §8.2 manda repetir aqui ("uma tabela em `bot/`, não em `chars/`"). Um `charId` que não esteja
 * nesta tabela continua draftável: o laço de `escolherDraft` cai para a ordem do `pool` injetado.
 *
 * Com o roster de 2 e a ordem snake `[0,1,1,0]` (R-01 opção B, §3.2), esta tabela produz
 * `[golem, vex]` para os DOIS jogadores — que é a composição fixa que `e3.2` decidiu e a mesma
 * sequência do roteiro de `tools/partida.ts`. A "escolha" é mecânica porque o roster é de 2, e
 * inventar heurística de draft sobre um pool que não permite draft seria código sem cliente.
 */
const ORDEM_DE_PREFERENCIA_DE_DRAFT: readonly string[] = ['golem', 'vex']

/**
 * ⚠️ PROVISÓRIO — revisável em `e3.6`/`e3.7` com a telemetria de §10. Build preferida por
 * personagem.
 *
 * **Os índices 0/0 NÃO são afirmação de balanceamento, e é importante que ninguém os leia como
 * tal.** Nenhuma medição deste projeto ordena as quatro builds de um personagem entre si: a matriz
 * de winrate de `e2.5` rodou com `0/0` fixo dos dois lados, e o `BUILD_BASELINE` de
 * `determinism.ts` cobre as variantes para REGRESSÃO (que um ramo não fique sem teste), não para
 * comparação. Escolher `1` aqui hoje seria decidir balanceamento por palpite — o oposto de
 * "declarada e boba" (§8.2, ponto 4).
 *
 * O que muda em relação a simplesmente deixar o timer estourar e cair em `{t:'buildPadrao'}` não é
 * o VALOR, é o REGISTRO: o log de decisões passa a dizer "escolheu a primeira" em vez de "não
 * escolheu e a default entrou" — informação diferente, e exatamente o sinal que D-06 usa como
 * gatilho da sua mitigação (ver `aplicarBuildPadrao`, `match/redutor.ts`). A tabela existe para que
 * `e3.6` mude uma linha quando a telemetria disser algo; hoje ela é o lugar onde a ignorância está
 * declarada em vez de espalhada.
 */
const BUILD_PREFERIDA: Readonly<Record<string, { abilityIndex: 0 | 1; passiveIndex: 0 | 1 } | undefined>> = {
  golem: { abilityIndex: 0, passiveIndex: 0 },
  vex: { abilityIndex: 0, passiveIndex: 0 },
}

/**
 * ⚠️ PROVISÓRIO — mesma revisão de `e3.6`/`e3.7`. Em que trilha cada personagem COMEÇA; a partir
 * daí a trilha alterna a cada compra daquele personagem (§8.2: "alternando trilha, com preferência
 * por personagem declarada numa tabela em `bot/`").
 *
 * **O que estes dois valores afirmam, e o que não afirmam.** Eles NÃO afirmam que a trilha física
 * rende mais no Golem: a única medição por personagem que o projeto registra está nos comentários
 * de `shop/catalogo.ts` (§1.2) e ela não sustenta uma ordenação limpa — a Luneta é de COMBATE e
 * rende mais no Golem (+5,94pp) do que no Vex (+2,99pp), enquanto a Lâmina, também de combate,
 * rende +20,6pp no Vex. O que a tabela afirma é uma propriedade de POLÍTICA, verificável sem
 * nenhuma medição: começando em trilhas opostas e alternando, a dupla cobre as duas trilhas em vez
 * de empilhar uma só. O formato "por personagem" é o que §1.2 sustenta explicitamente ("a variação
 * por PERSONAGEM é maior que qualquer diferenciação por item que eu pudesse inventar hoje"); os
 * valores dentro dele são placeholders honestos.
 */
const TRILHA_INICIAL: Readonly<Record<string, Trilha | undefined>> = {
  golem: 'fisica',
  vex: 'combate',
}

/**
 * Teto do laço de compra de UMA visita à loja. Guarda de terminação, no espírito de `MAX_PASSOS`
 * (`tools/partida.ts`): cada iteração gasta `preco` de ouro, e o catálogo hoje não tem item de preço
 * 0 (`validarCatalogo` aceitaria um, porque `preco >= 0` é a regra de §6.1) — sem o teto, um item
 * gratuito faria o laço girar para sempre. Com a economia provisória (renda `[4,5,6,7,8]`, juros
 * ≤ 3, itens a 6) o saldo máximo alcançável numa loja não paga 8 itens nem de longe.
 */
const MAX_COMPRAS_POR_LOJA = 8

/**
 * O catálogo em ORDEM CANÔNICA (`id` crescente), resolvido uma vez na carga do módulo — a mesma
 * técnica e o mesmo motivo de `CATALOGO_CANONICO` em `shop/agregar.ts`.
 *
 * Não é preciosismo: `catalogo.ts` declara que a sua ordem é a de APRESENTAÇÃO e que ela é
 * "deliberadamente diferente da ordem canônica". Percorrer a ordem de apresentação aqui acoplaria a
 * escolha de compra do bot à ordem de exibição da loja — reordenar a UI de `e3.4` mudaria o que o
 * bot compra, em silêncio. A cópia é local porque `CATALOGO_CANONICO` é privado de `agregar.ts` e
 * exportá-lo seria tocar `src/shop/` (story `e3.1`, `Done`), fora do escopo desta story; fica
 * registrado como candidato de limpeza para quem for mexer em `shop/` de novo.
 */
const CATALOGO_CANONICO: readonly ItemDef[] = [...CATALOGO].sort((a, b) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
)

/**
 * A política de UM jogador, com o gerador dela.
 *
 * `rand` é devolvido para o CHAMADOR e passado de volta como `r` em cada método: as três políticas
 * são funções puras do par (visão, número sorteado), e quem guarda o gerador é quem conduz a
 * partida. É o mesmo desenho de `botCommands(view, bot)` — o estado aleatório vive no objeto do
 * bot, nunca dentro da regra —, e é o que permite ao arnês rodar duas políticas diferentes sobre a
 * mesma sequência de saques, ou repetir uma decisão sem avançar o stream.
 *
 * **Streams 5 e 6, jamais 0-4.** Stream 0 é `world.rng` (a simulação), 1 e 2 são o bot de combate,
 * 3 é o cliente e 4 é o arnês. É D-08 no ponto em que ele executa: a política de compra pode ser
 * reescrita inteira sem mover um único hash de rodada, porque nunca tocou a sequência que a
 * simulação saca.
 *
 * **CHAMAR UMA VEZ POR PARTIDA, e não uma por rodada — o oposto da invariante M-1 do bot de
 * COMBATE, e vale a pena escrever por que os dois não se contradizem.** M-1 (§2.5) manda criar um
 * `BotState` NOVO a cada rodada porque `BotState.porBola` guarda relógios ABSOLUTOS
 * (`proximaDecisaoTick`, `prontoDesdeUlt`), e um relógio da rodada anterior carregado para uma
 * rodada que recomeça no tick 0 deixa o bot mudo até um instante que já passou. Aqui não existe
 * relógio: o único estado é o gerador, e a partida inteira é o escopo dele. Recriar a política a
 * cada visita à loja reiniciaria o stream, todo desempate voltaria ao mesmo sorteio e o bot
 * compraria sempre o mesmo item — degradação silenciosa, do tipo que passa verde em teste de
 * reprodutibilidade (as duas execuções degradariam igual). Tudo o mais que a política precisa saber
 * ela lê da `VisaoPartida` a cada chamada, e é por isso que ela não guarda mais nada.
 */
export function criarPolitica(
  matchSeed: number,
  jogador: Jogador,
): { politica: PoliticaPartida; rand: () => number } {
  const rand = mulberry32(deriveSeed(matchSeed, STREAM_DA_POLITICA + jogador))
  const politica: PoliticaPartida = {
    escolherDraft: (v, r) => escolherDraft(v, r, jogador),
    escolherBuild: (v, slot, r) => escolherBuild(v, slot, r),
    comprar: (v, r) => comprar(v, r, jogador),
  }
  return { politica, rand }
}

// ---------------------------------------------------------------------------------- draft

/**
 * §3.2 / R-01(B) — com roster de 2 a escolha é mecânica, e o código diz isso em vez de fingir uma
 * heurística. A ordem é: primeiro o que a tabela de preferência pede e eu ainda não tenho; depois o
 * primeiro do `pool` que eu ainda não tenho (o caminho de um roster futuro que a tabela não cubra);
 * e só então o ramo degenerado.
 *
 * "Que eu ainda não tenho" é o que garante `[golem, vex]` em vez de `[golem, golem]`: `aplicarDraft`
 * NÃO consome o `pool` (§3.2 — com 4 escolhas sobre um pool de 2 ele acabaria na segunda), então
 * nada no redutor impede escolher o mesmo personagem duas vezes. A restrição é da política, e é aqui
 * que ela precisa morar.
 *
 * O ramo degenerado (pool inteiro já é meu) sorteia em vez de devolver `pool[0]`: devolver o
 * primeiro seria escolher um viés silencioso para um caso que só existe em roster mal formado, e o
 * saque já aconteceu de qualquer jeito (contrato de saque). `pool` nunca é vazio — `criarPartida`
 * recusa na construção.
 */
function escolherDraft(v: VisaoPartida, r: () => number, jogador: Jogador): string {
  const sorteio = r()
  const meus = v.draft.escolhas.filter((x) => x.jogador === jogador).map((x) => x.charId)

  for (const id of ORDEM_DE_PREFERENCIA_DE_DRAFT) {
    if (v.draft.pool.includes(id) && !meus.includes(id)) return id
  }
  for (const id of v.draft.pool) {
    if (!meus.includes(id)) return id
  }
  // `?? ''` não é defesa contra o pool vazio (`criarPartida` o recusa na construção) — é o tipo de
  // retorno dizendo a verdade. Um `undefined` escapando daqui viraria a mensagem "personagem
  // 'undefined' não está no pool" vinda do redutor, três camadas depois da causa.
  return v.draft.pool[indiceSorteado(sorteio, v.draft.pool.length)] ?? ''
}

// ---------------------------------------------------------------------------------- build

/**
 * RF-03 — 1 ativa de 2 + 1 passiva de 2, por personagem. A tupla de 2 em `sim/types.ts` já garante a
 * aritmética no compilador; aqui só se escolhe o índice.
 *
 * Personagem NA tabela: a preferência declarada, sem sorteio (o valor sacado é descartado, e o saque
 * acontece assim mesmo — contrato de saque). Personagem FORA da tabela: a política não tem opinião
 * sobre ele, e o sorteio uniforme entre as 4 builds é o jeito de dizer isso sem enviesar em silêncio
 * para `0/0`. Um roster novo entrando sem linha aqui produz variação visível na telemetria em vez de
 * uma default invisível — que é o modo de falha que D-06 nomeia.
 */
function escolherBuild(
  v: VisaoPartida,
  slot: 0 | 1,
  r: () => number,
): { abilityIndex: 0 | 1; passiveIndex: 0 | 1 } {
  const sorteio = r()
  const pref = BUILD_PREFERIDA[v.eu.personagens[slot].charId]
  if (pref) return { abilityIndex: pref.abilityIndex, passiveIndex: pref.passiveIndex }
  const n = indiceSorteado(sorteio, 4)
  return { abilityIndex: (n % 2) as 0 | 1, passiveIndex: n < 2 ? 0 : 1 }
}

// ---------------------------------------------------------------------------------- compra

/**
 * §8.2, ponto 4, literal: **o item mais caro que couber no ouro, alternando trilha, com preferência
 * por personagem declarada numa tabela em `bot/`**.
 *
 * A visita inteira à loja sai de UMA chamada — o tipo de retorno é `Decisao[]`, plural, e é o que
 * torna a função terminante e testável: ela desconta o ouro e acrescenta o item a uma cópia LOCAL da
 * lista a cada passo, exatamente como `aplicarCompra` faria, e para quando nada mais couber. Um
 * desenho de "uma compra por chamada" empurraria o laço (e a possibilidade de laço infinito por
 * decisão rejeitada) para todo chamador.
 *
 * **A ordem dos critérios importa e o primeiro deles hoje é degenerado.** Todos os oito itens custam
 * `PRECO_PROVISORIO = 6` (⚠️ D-09), então "o mais caro que couber" não discrimina nada enquanto o
 * preço for único — quem decide de fato é a trilha da vez, e o sorteio entre os empatados. Isso está
 * escrito aqui porque é a diferença entre ler o código e acreditar no comentário: no dia em que
 * `e3.7` diferenciar preços, o critério passa a morder sozinho, sem uma linha de mudança.
 *
 * O `slot` é o personagem com MENOS itens (empate → slot 0): junto com a alternância de trilha, é o
 * que espalha as compras entre as duas bolas em vez de empilhar tudo numa. Nenhum dos dois é
 * afirmação de balanceamento — são propriedades de cobertura, verificáveis sem medição.
 *
 * `validarCompra` roda sobre a lista FUTURA de cada candidato, antes de a decisão ser emitida. Não é
 * redundante com a checagem do redutor: aqui ela evita EMITIR uma decisão que seria rejeitada, o que
 * manteria o replay correto mas encheria o log de rejeições do bot. Custo: oito validações por
 * compra, num caminho que roda entre rodadas e nunca por tick (`architecture.md` §7.1 proíbe
 * alocação no caminho quente; este caminho é frio por construção, mesmo argumento de
 * `setupDaRodada`).
 *
 * **`{t:'pronto'}` não sai daqui**, e `{t:'trocaDeBuild'}` também não: a interface de §8.2 tem três
 * métodos, e fechar a janela de decisão é do condutor da partida (o cliente em `e3.4`, o arnês no
 * teste). Trocar build (D-01) é decisão que a política v1 não toma — não por esquecimento, mas
 * porque não existe critério declarado para ela sem inventar balanceamento.
 */
function comprar(v: VisaoPartida, r: () => number, jogador: Jogador): Decisao[] {
  // fora da loja não é ponto de decisão: nem decide, nem saca (contrato de saque)
  if (v.fase !== 'loja') return []

  const decisoes: Decisao[] = []
  let ouro = v.eu.ouro
  // cópias locais: a política NUNCA escreve na visão (a mesma invariante N-3 do bot de combate —
  // `Omit` é raso e não protege, quem protege é a disciplina de quem escreve)
  const itens: [string[], string[]] = [[...v.eu.personagens[0].itens], [...v.eu.personagens[1].itens]]

  for (let passo = 0; passo < MAX_COMPRAS_POR_LOJA; passo++) {
    const sorteio = r()
    const slot: 0 | 1 = itens[0].length <= itens[1].length ? 0 : 1
    const trilha = trilhaDaVez(v.eu.personagens[slot].charId, itens[slot].length)
    const escolha = melhorItem(trilha, ouro, itens[slot], sorteio)
    if (!escolha) break
    decisoes.push({ t: 'compra', jogador, slot, itemId: escolha.id })
    ouro -= escolha.preco
    itens[slot].push(escolha.id)
  }
  return decisoes
}

/** Alternância: começa na trilha declarada do personagem e troca a cada item que ele já tem. */
function trilhaDaVez(charId: string, jaComprados: number): Trilha {
  const inicial = TRILHA_INICIAL[charId] ?? 'fisica'
  const trocar = jaComprados % 2 === 1
  return trocar ? (inicial === 'fisica' ? 'combate' : 'fisica') : inicial
}

/**
 * O melhor candidato, ou `null` se nada couber. Percorre o catálogo em ordem CANÔNICA, com
 * comparação estrita e critérios em ordem declarada — nunca `sort` no caminho de decisão, mesma
 * disciplina de `porValorEsperado` (`heuristic.ts`).
 *
 * Critérios, nesta ordem: (1) maior preço que caiba no ouro; (2) trilha da vez; (3) sorteio uniforme
 * entre os empatados nos dois primeiros. O sorteio existe porque, com preço único no catálogo, (1)
 * não discrimina e (2) empata sempre em 4 itens: sem ele o bot compraria o MESMO item a partida
 * inteira, e §8.2 registra "o bot que compra mal deixa a partida fácil" como o risco que esta
 * camada carrega. Variedade sorteada não é jogar bem — é não ser trivialmente previsível.
 */
function melhorItem(
  trilha: Trilha,
  ouro: number,
  itensDoSlot: readonly string[],
  sorteio: number,
): ItemDef | null {
  let melhores: ItemDef[] = []
  let melhorPreco = -1
  let melhorTrilha = false

  for (const def of CATALOGO_CANONICO) {
    // `!(def.preco <= ouro)` no sentido positivo: um preço `NaN` vindo de catálogo corrompido é
    // BARRADO em vez de passar (toda comparação com NaN é falsa) — a mesma inversão de ônus que
    // BOT-001 forçou no limiar do bot de combate.
    if (!(def.preco <= ouro)) continue
    if (validarCompra([...itensDoSlot, def.id]).length > 0) continue

    const trilhaOk = def.trilha === trilha
    if (melhores.length === 0) {
      melhores = [def]
      melhorPreco = def.preco
      melhorTrilha = trilhaOk
      continue
    }
    if (def.preco > melhorPreco || (def.preco === melhorPreco && trilhaOk && !melhorTrilha)) {
      melhores = [def]
      melhorPreco = def.preco
      melhorTrilha = trilhaOk
      continue
    }
    if (def.preco === melhorPreco && trilhaOk === melhorTrilha) melhores.push(def)
  }

  if (melhores.length === 0) return null
  return melhores[indiceSorteado(sorteio, melhores.length)]
}

// ---------------------------------------------------------------------------------- utilitário

/**
 * Índice uniforme em `[0, n)` a partir de um saque em `[0, 1)`. As guardas são escritas no sentido
 * positivo (`!(x >= 0)`) e não por igualdade: é o que barra `NaN` vindo de um gerador corrompido em
 * vez de deixá-lo virar `Math.floor(NaN)` e, daí, `undefined` no índice — o modo de falha que
 * REL-002 e BOT-001 documentam.
 */
function indiceSorteado(sorteio: number, n: number): number {
  if (!(n > 0)) return 0
  if (!(sorteio >= 0) || !(sorteio < 1)) return 0
  const i = Math.floor(sorteio * n)
  return i < 0 ? 0 : i >= n ? n - 1 : i
}
