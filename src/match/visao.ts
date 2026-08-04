import type {
  EscolhaPersonagem,
  EstadoPartida,
  Jogador,
  OponenteVisivel,
  PersonagemVisivel,
  VisaoPartida,
} from './types.ts'

/**
 * SEGREDO POR PROJEÇÃO (`docs/architecture-e3.md` §2.4), no mesmo espírito de
 * `WorldView = Omit<World,'rng'>` (`sim/types.ts:178`).
 *
 * RF-04 exige que a seleção de build seja simultânea e SECRETA. O jogo é local e single-process: o
 * estado dos dois lados vive na mesma memória, e "secreto" não pode ser garantido — só respeitado.
 * Respeitar por disciplina de render ("não desenhe isso ainda") é exatamente o tipo de regra que
 * sobrevive até o primeiro refactor. Aqui a build não revelada **não está no objeto**: vazá-la é erro
 * de compilação, não violação descoberta em code review.
 *
 * Três coisas que isto compra por ~30 linhas:
 *  1. o render não pode vazar o que não recebeu;
 *  2. é literalmente o pacote que o servidor da Fase 4 vai enviar (autoridade sobre informação é
 *     metade do que "servidor autoritativo" significa);
 *  3. o bot de partida (`e3.3`) passa a ver o mesmo que o humano — sem isso, uma política de compra
 *     que lesse a build secreta jogaria melhor por um motivo que o jogador não pode reproduzir, e o
 *     julgamento do portão mediria frustração em vez de diversão.
 *
 * **Registro honesto (§2.4):** num processo só isto é convenção reforçada pelo tipo, não garantia
 * criptográfica. Quem abrir o devtools vê tudo. É aceitável porque o adversário desta fase é o bot, e
 * está escrito para ninguém apresentar isto como anti-cheat.
 */
export function visaoPara(e: EstadoPartida, j: Jogador): VisaoPartida {
  const oponente: Jogador = j === 0 ? 1 : 0
  const outro = e.jogadores[oponente]
  return {
    seed: e.seed,
    fase: e.fase,
    rodada: e.rodada,
    regras: e.regras,
    economia: e.economia,
    draft: e.draft,
    historico: e.historico,
    prontos: e.prontos,
    eu: e.jogadores[j],
    oponente: {
      ouro: outro.ouro,
      vitorias: outro.vitorias,
      personagens: [visivel(outro.personagens[0]), visivel(outro.personagens[1])],
    } satisfies OponenteVisivel,
  }
}

/**
 * A projeção de UM personagem do oponente.
 *
 * `itens` sai nas DUAS variantes de propósito: **as compras não são secretas.** RF-04 declara segredo
 * para a *seleção de build* e mais nada; esconder também a loja seria regra que ninguém escreveu
 * (Artigo IV — No Invention). Nota explícita de §4.1.
 *
 * `abilityIndex`/`passiveIndex` só existem no ramo `revelado: true`. Não é filtro por valor — é o
 * OBJETO que não tem as chaves, então nem `JSON.stringify` da visão vaza a build fechada. A cópia de
 * `itens` é rasa e deliberada: `VisaoPartida` é projeção de leitura, e a mesma ressalva registrada em
 * `WorldView` vale aqui (`Omit` é raso; endurecer para `DeepReadonly` só se aparecer caso real de
 * escrita acidental).
 */
function visivel(p: EscolhaPersonagem): PersonagemVisivel {
  if (!p.revelado) return { charId: p.charId, revelado: false, itens: [...p.itens] }
  return {
    charId: p.charId,
    revelado: true,
    itens: [...p.itens],
    abilityIndex: p.abilityIndex,
    passiveIndex: p.passiveIndex,
  }
}
