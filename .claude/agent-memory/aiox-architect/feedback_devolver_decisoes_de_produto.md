---
name: devolver-decisoes-de-produto
description: No Battle Balls, decisão de produto vira item "R-NN" devolvido ao @pm/usuário no fim do doc de arquitetura — nunca é decidida pelo @architect
metadata:
  type: feedback
---

Quando um desenho esbarra em algo que é escolha de produto (número de economia, regra de
jogo, escopo de tela), **não decida**: registre como `R-01`, `R-02`, ... numa seção própria
no fim do documento de arquitetura, com as saídas possíveis, o custo de cada uma, a minha
recomendação e a frase explícita de que a decisão não é minha.

**Why:** o projeto opera sob o Artigo IV (No Invention) e sob a decisão #13 do `DESIGN.md`
("balanceamento é medição, não raciocínio"). O usuário aprovou esse formato em
`architecture-e2.md` §9 — respondeu R-01 a R-04 um a um, aprovando duas leituras, adiando
uma e mandando uma para a Fase 5. O formato numerado é o que torna isso possível: cada
pendência tem um id citável nas stories e nos gates.

**How to apply:** vale para números (D-05, D-09), para regras de jogo (empate, lado do
jogador) e para ambiguidade de portão. Não vale para escolha técnica com argumento numérico
(teto de motor, ordem de agregação) — essas eu decido e defendo. Ver também
[[medir-antes-de-propor]].
