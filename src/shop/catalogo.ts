import type { BonusBlock } from '../sim/stats.ts'

/**
 * CATÁLOGO DE ITENS — dado. Sem lógica, sem estado, sem import de `sim/` além do TIPO
 * `BonusBlock` (`docs/architecture-e3.md` §7.1, literal).
 *
 * O precedente é `src/tools/packages.ts` (`e2.6`), e ele foi criado exatamente por este motivo:
 * **o nome do item, o campo e o sinal precisam morar na mesma linha**, ou alguém "corrige" o sinal
 * e reprojeta uma fase inteira (§7.1: "a loja é a versão de produção daquele arquivo"). Duas
 * linhas deste arquivo — Lixa e Relicário — têm o nome brigando com o sinal, e é para elas que os
 * comentários existem. Eles fazem parte do dado.
 *
 * FRONTEIRA: nada aqui valida, soma ou clampa. Quem soma é `agregar.ts` (ordem canônica, §7.3);
 * quem valida é `agregar.ts` na borda de composição; quem clampa é `recomputeStats`
 * (`sim/stats.ts:183`) com `SIGMA_MIN`/`SIGMA_MAX` e os clamps absolutos — e é o ÚNICO lugar que
 * clampa (§7.5, D-04 não reabre).
 *
 * `desc` × `bonus` são coisas diferentes DE PROPÓSITO (§7.2): `desc` é o texto que o jogador lê
 * ("−20% de recarga"), `bonus` é o que o motor executa (`cdSpeed: +0.25`). Este arquivo é o único
 * lugar do projeto onde as duas se encostam — e por isso o único lugar onde a tradução pode ser
 * auditada.
 */

/** As duas trilhas de `DESIGN.md` §4 / RF-24..RF-28. Vocabulário FECHADO. */
export type Trilha = 'fisica' | 'combate'

export interface ItemDef {
  /**
   * Identidade estável e ORDEM CANÔNICA de agregação (§7.3). ASCII minúsculo e SEM ACENTO de
   * propósito: a ordenação de `agregar.ts` compara unidades de código (`<`), nunca
   * `localeCompare` — comparação por locale depende de ICU e a Fase 4 roda Node e Chrome ao
   * mesmo tempo. Acento aqui reintroduziria a divergência que a ordem canônica existe para matar.
   */
  id: string
  /** nome de exibição (com acento, este é para o humano) */
  nome: string
  trilha: Trilha
  /** o que ele faz, na única linguagem que o motor entende (D-04) */
  bonus: Readonly<Partial<BonusBlock>>
  /** ⚠️ PROVISÓRIO — D-09 */
  preco: number
  /** texto para a UI. O que o jogador lê, que NÃO é o que o motor faz — ver §7.2 */
  desc: string
}

/**
 * ⚠️ PROVISÓRIO — D-09. Nenhum destes números foi decidido: eles existem para que a Fase 3 possa
 * ser JOGADA e MEDIDA. O valor definitivo sai da telemetria da §10 com humano no controle
 * (`e3.6`/`e3.7`), e a alteração é decisão de produto (@pm), não de arquitetura. Mesma marcação
 * estrutural que `ECONOMIA_PROVISORIA` (`match/economia.ts`, `e3.2`) usa: os números moram num
 * lugar só, com o aviso em cima, e nada os lê senão através destas constantes.
 *
 * A magnitude é UNIFORME e é o probe de +0,20 da §1.2 — o mesmo instrumento com que os oito itens
 * foram medidos um a um. §1.2 é explícita sobre o que ela é: "isso é insumo para o preço, não
 * preço". Diferenciar magnitude por item aqui seria decidir D-09 no lugar da medição, e o mesmo
 * probe medido dá de −2,7pp (Borracha no Golem) a +20,6pp (Lâmina no Vex): a variação por
 * PERSONAGEM é maior que qualquer diferenciação por item que eu pudesse inventar hoje.
 *
 * Exceção deliberada e única: o Relicário (ver a linha dele). A conversão de `desc` para `bonus`
 * não é linear nele, e §7.2 dá o par literal.
 */
export const MAGNITUDE_PROVISORIA = 0.2

/**
 * ⚠️ PROVISÓRIO — D-09. Preço ÚNICO para os oito itens, e isso é a marcação, não um descuido:
 * uma tabela de preços diferenciados seria uma ordenação de valor entre os itens, e nenhuma
 * medição existente sustenta uma (§1.2 mede rendimento contra o bot, não escolha de humano —
 * §1.7). Dimensionado apenas para caber na economia provisória: renda `[4,5,6,7,8]` por rodada e
 * ~3,3 visitas à loja numa partida mediana (§1.5) ⇒ ~6 de ouro compra algo em quase toda rodada
 * sem tornar o "guardar" de RF-23 inútil. É um número para poder jogar, não um número decidido.
 */
export const PRECO_PROVISORIO = 6

/**
 * Os oito itens (§7.2). A ordem de declaração é a de APRESENTAÇÃO — trilha física primeiro,
 * exatamente a tabela da §7.2 — e é DELIBERADAMENTE diferente da ordem canônica de agregação
 * (`id` crescente, `agregar.ts`). Se este arquivo já estivesse ordenado por `id`, um bug na
 * ordenação de `agregarItens` produziria o resultado certo por coincidência e ficaria invisível
 * até alguém inserir um item novo no meio. O mesmo raciocínio de `NOMES_PACOTE` em
 * `packages.ts`: a ordem de leitura humana e a ordem de execução são fatos separados.
 */
export const CATALOGO: readonly ItemDef[] = [
  // ---------------------------------------------------------------- trilha física
  {
    id: 'chumbo',
    nome: 'Chumbo',
    trilha: 'fisica',
    bonus: { mass: +MAGNITUDE_PROVISORIA },
    preco: PRECO_PROVISORIO,
    desc: '+20% de massa',
  },
  {
    id: 'turbina',
    nome: 'Turbina',
    trilha: 'fisica',
    bonus: { maxSpeed: +MAGNITUDE_PROVISORIA },
    preco: PRECO_PROVISORIO,
    desc: '+20% de velocidade',
    // ARMADILHA DE TETO (não de sinal): a partir de certa quantidade de Turbinas o jogador paga
    // por velocidade que não recebe. É exatamente o caso que o preview de valor efetivo da loja
    // (`preview.ts`, tela em `e3.4`) existe para mostrar.
    //
    // ⚠️ CORREÇÃO FACTUAL, medida em `e3.1` — `architecture-e3.md` §7.2 (e o AC 4 que a copia)
    // dizem que "`ABS_MAX.maxSpeed = 420` morde ANTES de `ΣMAX` para o Vex a partir de +68%".
    // Isso não fecha na aritmética do motor: `ΣMAX.maxSpeed = +0.60` (`stats.ts`) limita o
    // somatório de bônus ANTES de o stat ser calculado, então o `maxSpeed` efetivo do Vex satura
    // em 250 × 1,60 = **400**, e 400 < 420. `ABS_MAX.maxSpeed` só morderia com base > 420/1,60 =
    // **262,5** — o roster de hoje tem 250 (Vex) e 105 (Golem), logo esse clamp é inalcançável por
    // item. O +68% de §7.2 é 420/250 lido SEM o ΣMAX no caminho.
    //
    // O teto que morde de verdade, medido: 3 Turbinas (+60%) já batem no ΣMAX (soma bruta
    // 0.6000000000000001 — o resíduo de float da terceira soma basta para o corte, embora o stat
    // dê 400 dos dois lados) e a 4ª Turbina é 100% desperdiçada (bruto +0,80 → efetivo +0,60,
    // stat continua 400). Nada disto muda a DEFINIÇÃO do item (`maxSpeed: +x`); muda só qual teto
    // a UI de `e3.4` precisa explicar. Registrado no Dev Agent Record da `e3.1` para @architect.
  },
  {
    id: 'lixa',
    nome: 'Lixa',
    trilha: 'fisica',
    // ⚠️ ARMADILHA DE SINAL — o item chama-se "−atrito" e o bônus é POSITIVO.
    //
    // `drag` é a fração de velocidade RETIDA por segundo (`sim/types.ts`, campo `drag`;
    // `architecture.md` §1.6 / R-01), e NÃO o atrito. Menos atrito = retém mais = `drag` MAIOR.
    // Traduzir "−20% de atrito" literalmente para `drag: −0.20` significa MAIS atrito: o oposto
    // do item.
    //
    // Não é preciosismo — está medido em `packages.ts` (§5.2 de `architecture-e2.md`, n=800):
    //   { mass: +0.20, drag: +0.20 }  — a INTENÇÃO (Chumbo + Lixa)  →  Δ winrate  +4,32pp
    //   { mass: +0.20, drag: −0.20 }  — a LETRA do PRD              →  Δ winrate  −5,90pp
    // Dez pontos percentuais e uma troca de sinal. O gatilho do Risco #1b ("físico < +2pp e dano
    // > +5pp ⇒ trilha física nasce morta") DISPARA na leitura literal e NÃO dispara na correta:
    // um erro de sinal de uma linha reprojetaria a Fase 3. `drag: +0.20` está certo.
    bonus: { drag: +MAGNITUDE_PROVISORIA },
    preco: PRECO_PROVISORIO,
    desc: '−20% de atrito',
  },
  {
    id: 'borracha',
    nome: 'Borracha',
    trilha: 'fisica',
    // Os DOIS campos de restituição, com o mesmo bônus (§7.2, `architecture.md` §2.3): elasticidade
    // é uma propriedade só para o jogador, e são dois campos para o motor (bola-bola e bola-parede).
    // Escrever um só entregaria metade do item em silêncio — e é o único item multi-campo do
    // catálogo, que é por que o preview de stat da loja precisa ser multi-campo (AC 10).
    //
    // TETO: `ABS_MAX.restWall = 0.92` sobre a base 0,72 (`DEFAULT_STATS`, nenhum personagem do
    // roster sobrescreve) ⇒ o bônus efetivo em `restWall` satura em ~+27,8% (0,92/0,72). A segunda
    // Borracha (+40%) já é cortada em `restWall` e ainda rende inteira em `restBall` (0,65 → teto
    // 0,92 = +41,5%): o mesmo item com dois tetos diferentes, na mesma compra.
    bonus: { restBall: +MAGNITUDE_PROVISORIA, restWall: +MAGNITUDE_PROVISORIA },
    preco: PRECO_PROVISORIO,
    desc: '+20% de elasticidade',
  },

  // ---------------------------------------------------------------- trilha de combate
  {
    id: 'lamina',
    nome: 'Lâmina',
    trilha: 'combate',
    bonus: { dmg: +MAGNITUDE_PROVISORIA },
    preco: PRECO_PROVISORIO,
    desc: '+20% de dano',
  },
  {
    id: 'couraca',
    nome: 'Couraça',
    trilha: 'combate',
    bonus: { maxHp: +MAGNITUDE_PROVISORIA },
    preco: PRECO_PROVISORIO,
    desc: '+20% de vida',
    // DESBLOQUEADA POR `e3.0` (REL-001). Até `e3.0`, `hp` nascia de `def.maxHp` (base SEM bônus)
    // enquanto `stat.maxHp` já incluía o item: a bola nascia FERIDA e a fração `hp / stat.maxHp`
    // — gatilho de cinco comportamentos de combate — largava abaixo de 1. O efeito medido não era
    // "o item rende menos", era o item MUDANDO DE SINAL: −18,86pp de winrate com o bug contra
    // +31,97pp corrigido, num Vex com +50% de `maxHp` (§1.3). Hoje `world.ts` atribui
    // `b.hp = b.stat.maxHp` DEPOIS de `recomputeStats`, e a Couraça é um item comum.
    // Não reintroduzir leitura de `def.maxHp` para vida em nenhum consumidor deste catálogo.
  },
  {
    id: 'luneta',
    nome: 'Luneta',
    trilha: 'combate',
    bonus: { range: +MAGNITUDE_PROVISORIA },
    preco: PRECO_PROVISORIO,
    desc: '+20% de alcance do ataque básico',
    // ESCOPO ESTREITO, e o `desc` diz isso na cara do jogador: `range` multiplica o alcance do
    // ATAQUE BÁSICO (D-03) e não o `minRange`/`maxRange` das habilidades. Quem vive da ativa
    // (Vex) sente quase nada — +2,99pp, ruído, contra +5,94pp no Golem (§1.2). Prometer "alcance"
    // sem o qualificador seria a `desc` mentindo sobre o `bonus`, que é o que este arquivo existe
    // para impedir.
  },
  {
    id: 'relicario',
    nome: 'Relicário',
    trilha: 'combate',
    // ⚠️ ARMADILHA DE SINAL — o item chama-se "−cooldown" e o bônus é POSITIVO.
    //
    // `cdSpeed` é VELOCIDADE de recarga: o cooldown efetivo é `cd / cdSpeed`. Menos recarga =
    // `cdSpeed` MAIOR. `cdSpeed: −0.20` daria recarga 25% MAIS LENTA — o oposto do item.
    //
    // E a conversão NÃO é linear, que é a segunda metade da armadilha (`architecture.md` §1.7 /
    // R-01): `cdSpeed: +0.25` ⇒ `cd × 1/1,25` = −20% de recarga, o `desc` abaixo. Mas DOIS
    // Relicários dão `cdSpeed 1.50` ⇒ `cd × 1/1,50` = −33%, e não os −40% que "20% + 20%" sugere.
    // Por isso este é o único item cuja magnitude não é `MAGNITUDE_PROVISORIA`: +0.25 é o par
    // literal de §7.2 (`desc` "−20% de recarga" ⇔ `bonus` `cdSpeed: +0.25`), e trocá-lo por 0.20
    // faria o `desc` prometer −20% e o motor entregar −16,7%. Ainda ⚠️ PROVISÓRIO — D-09.
    bonus: { cdSpeed: +0.25 },
    preco: PRECO_PROVISORIO,
    desc: '−20% de recarga',
  },
]
