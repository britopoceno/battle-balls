---
name: ac-diff-size-claims-need-tsc-proof
description: ACs que prometem "exatamente N linhas" num arquivo tipado podem ser impossíveis — prove com tsc (experimento revertido) antes de implementar
metadata:
  type: project
---

Stories do Battle Balls às vezes fixam o tamanho de um diff ("render.ts muda exatamente 1 linha").
Essas promessas são escritas por leitura da assinatura pública, não por compilação, e podem ignorar
os callees internos que herdam o tipo.

**Why:** em `e4.2` v1.3.0 o AC 6 exigia estreitar só `desenhar(world: World)` para `VisaoDoMundo`.
Mas `desenhar` repassa `world` a 6 helpers internos tipados `world: World` (e `desenharBola` tem
`b: Ball`) — o `tsc` deu 6 erros TS2345. O mínimo que compila foi 9 linhas só de tipo (import + 7
anotações de `world` + `b: BolaVisivel`), corpo intacto. AC 1 (check verde) e AC 6 (1 linha) eram
mutuamente exclusivos; o lead mandou parar e reportar nesse caso, e foi o que se fez.

**How to apply:** antes de implementar, quando um AC promete tamanho de diff em código tipado, faça
o experimento mínimo no próprio repo (arquivo temporário + `sed` + `npx tsc --noEmit`), capture a
saída, e reverta com `git checkout -- <arquivo>` + `rm`. Leve ao @po o número VERIFICADO do mínimo
que compila, não uma estimativa. Relacionado: [[golden-hash-nao-prova-correcao]] (provar, não supor).
