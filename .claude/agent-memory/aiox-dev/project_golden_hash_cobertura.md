---
name: golden-hash-nao-prova-correcao
description: O golden hash do sim:check prova ausência de regressão, não que uma correção funciona — nenhuma seed usa itemBonus
metadata:
  type: project
---

`npm run sim:check` (50 seeds + `BASELINE` + `BUILD_BASELINE`) é o gate principal do projeto, mas
**nenhum `PickSetup` dele passa `itemBonus`**. Logo, "golden hash idêntico" prova que o caminho
medido não mudou — **nunca** prova que uma correção ligada a item/bônus funciona. Toda story que
mexe em `itemBonus`/`stat.*` precisa de DUAS evidências independentes: o hash (ausência de
regressão) e um teste dirigido (a correção de fato acontece). Nenhuma substitui a outra.

**Why:** em `e3.0` (REL-001) a correção de `b.hp` era hash-neutra por construção — as 10 seeds
batiam byte a byte, e ainda assim o bug corrigido invertia o sinal de um item de vida em até
70,4pp de winrate. Declarar a story pronta só com o hash verde teria sido verdade e irrelevante ao
mesmo tempo. Vale para toda a Fase 3, onde o plano de `docs/architecture-e3.md` §12 marca "hash
idêntico" em 6 dos 8 passos: nesses passos o hash é o juiz de que **nada** se mexeu, e a prova de
que **algo funciona** tem que vir de outro lugar.

**How to apply:** antes de fechar uma story de E3, escreva o teste dirigido e **rode-o ANTES da
correção** — ele tem que falhar. Se passa antes e depois, ele não mede a mudança e a story está sem
prova. Mesmo princípio da bateria negativa em [[bateria-negativa-toolchain]]; o script fica no
scratchpad, fora do repo, quando o AC restringir arquivos ([[story-scope-beats-framework-artifacts]]).

**Corolário medido em `e3.2` — teste de REPLAY é cego a erro consistente.** A "Regra 3" de
`architecture-e3.md` §2.5 (partida gravada × reproduzida sem bot) mede *reprodutibilidade*, não
correção. Bateria negativa de 5 mutações em `src/match/`: pegou 4 (itemBonus zerado, lado que não
alterna, `visaoPara` vazando build, ouro por vitória) e **deixou passar** um `aplicar` que aceita
compra sem debitar ouro — porque errar igual nos passos (i) e (ii) reproduz perfeitamente. Regra:
todo teste de replay/determinismo precisa de um companheiro que confira **valores** (débito ==
preço, evento == estado) e não igualdade entre execuções. Para "não aplicou pela metade", comparar
o estado por **identidade referencial** (`===`) é mais forte que campo a campo.

**A lacuna do `itemBonus` foi fechada em `e3.2`**: `sim:check` agora tem a guarda `ponte itemBonus`,
que roda a mesma rodada com os mesmos comandos com e sem o bônus e exige hashes diferentes. Não
assuma mais que nenhuma seed exercita item — confira `src/tools/partida.ts` antes.

**Corolário medido em `e3.1` — dado provisório também anestesia o teste.** O teste de A-10
(agregação de itens invariante à ordem de compra) passava com o catálogo real E com uma soma naive
na ordem de compra: com `MAGNITUDE_PROVISORIA` uniforme (+0,20 em tudo) nenhum campo recebe dois
valores DIFERENTES, e float64 não tem como divergir. O teste só passou a distinguir as duas
implementações depois de **perturbar o catálogo em memória** (no script, nunca no repo) com as
quatro magnitudes de `architecture-e3.md` §1.6 (0.07/0.11/0.13/0.17) no mesmo campo — aí a naive deu
duas saídas e a canônica uma. Regra: quando o dado de produção é placeholder uniforme, o teste que
depende da variedade do dado precisa injetar a variedade; senão ele mede o placeholder, não o
código. Vale para `e3.6`/`e3.7`, que vão trocar exatamente esses números.
