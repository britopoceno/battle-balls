import type { BonusBlock } from '../sim/stats.ts'

/**
 * PACOTES NOMEADOS — dado, sem lógica (`docs/architecture-e2.md` §6.1, linha de `packages.ts`).
 *
 * Este arquivo existe por um motivo só, e o motivo está medido (§5.2): **a armadilha do sinal**.
 *
 * O Risco #1b está escrito no PRD como "pacote físico (+20% massa, −20% drag)". Traduzido
 * literalmente para campos, `drag: −0.20` significa MAIS atrito — porque `drag` é a fração de
 * velocidade **retida** por segundo (`sim/types.ts`, campo `drag`; `architecture.md` §1.6 / R-01),
 * e não o atrito. Os itens pretendidos são Chumbo (+massa) e Lixa (−atrito), e Lixa é `drag: +0.20`.
 *
 * Não é preciosismo — §5.2, n=800 cada:
 *
 *   { mass: +0.20, drag: +0.20 }  — a INTENÇÃO (Chumbo + Lixa)  →  Δ winrate  +4,32pp
 *   { mass: +0.20, drag: −0.20 }  — a LETRA do PRD              →  Δ winrate  −5,90pp
 *
 * Dez pontos percentuais, com troca de sinal. O gatilho do Risco #1b é "físico < +2pp e dano >
 * +5pp → a trilha física nasce morta": a leitura literal DISPARA o gatilho, a correta NÃO dispara.
 * Um erro de sinal de uma linha reprojetaria a Fase 3.
 *
 * Daí a decisão de arquitetura de §5.2, que o CLI executa: **o CLI nunca aceita campo cru na linha
 * de comando para os pacotes de risco.** Ele aceita NOMES, definidos uma única vez aqui, com o nome
 * do item ao lado do campo e do sinal. Mutação arbitrária por campo (`--mutacao=vex:dmg:+0.30`)
 * continua existindo, separadamente, para P2.2 — lá o campo É o que se quer nomear.
 *
 * Fronteira: sem lógica, sem import de `sim/` além do TIPO `BonusBlock`, sem validação. Quem valida
 * entrada de usuário é o CLI (`balance.ts`), que é onde a entrada de usuário chega. Consumidores
 * previstos: `balance.ts` (`--pacote`, esta story) e a bateria de Risco #1b de `e2.7`, que percorre
 * `NOMES_PACOTE` por personagem — é por isso que a lista de nomes mora aqui e não lá.
 */

/** Um pacote é um `itemBonus` pronto para `PickSetup.itemBonus` — aditivo, sujeito a ΣMIN/ΣMAX. */
export type Pacote = Readonly<Partial<BonusBlock>>

/**
 * Os três pacotes de §5.2, literais. Os comentários fazem parte do dado: eles são a única coisa
 * que impede a próxima pessoa de "corrigir" `drag: +0.20` para o que o PRD diz.
 */
export const PACOTES = {
  fisico: { mass: +0.2, drag: +0.2 }, // Chumbo +massa · Lixa −atrito = +drag (retenção)
  dano: { dmg: +0.2 }, // Lâmina +dano
  nenhum: {}, // controle negativo (P2.3)
} as const satisfies Record<string, Pacote>

export type NomePacote = keyof typeof PACOTES

/**
 * Ordem de apresentação: **o controle primeiro**. Não é estética — é a ordem em que a bateria de
 * §5.4 é lida (o delta de todo pacote é medido CONTRA o controle) e a ordem que `e2.7` vai
 * percorrer. `balance.ts` confere em toda execução que esta lista e as chaves de `PACOTES` são o
 * mesmo conjunto; um pacote novo que esqueça de entrar aqui é acusado, não some da bateria.
 */
export const NOMES_PACOTE: readonly NomePacote[] = ['nenhum', 'fisico', 'dano']
