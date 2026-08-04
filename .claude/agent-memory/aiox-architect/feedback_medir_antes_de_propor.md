---
name: medir-antes-de-propor
description: Documento de arquitetura do Battle Balls começa por uma seção de medições feitas na sessão, com o código atual, sem modificá-lo
metadata:
  type: feedback
---

Todo documento de arquitetura deste projeto abre com uma §1 de **medições feitas para
escrever o documento** — rodando o simulador atual num script descartável (scratchpad,
`node` lê `.ts` direto), nunca alterando `src/`. Só depois vem a proposta.

**Why:** os três documentos que existem foram escritos assim e cada um encontrou algo que
teria reprojetado a fase se não tivesse sido medido: o baseline de golden hash
(`architecture.md` §6.0), o viés de lado de +23pp que obrigou a troca de lado no arnês
(`architecture-e2.md` §1.2) e a inversão de sinal da Couraça por REL-001
(`architecture-e3.md` §1.3, 50pp de diferença). Proposta sem medição, neste projeto, é
justamente o que a decisão #13 do `DESIGN.md` proíbe.

**How to apply:** medir com n grande o bastante para reportar IC (n=600 → ±4,0pp; a
diferença entre duas células → ±5,7pp) e marcar explicitamente o que é ruído. Sempre fechar
com "o que estes números NÃO são" — os deltas medidos com bot não são leitura de portão,
que é sempre humano ou o CLI oficial. Ver também [[devolver-decisoes-de-produto]].

**Corolário aprendido no gate de `e3.1` (2026-07-30) — vale para teste que EU especifico num
documento, não só para medição:** um enunciado de teste tem de vir com o **cenário
discriminante**, não só com a propriedade. Escrevi em §7.3 "embaralhar a ordem de compra e exigir
byte-idêntico" e o teste, como enunciado, é satisfeito por uma implementação ERRADA enquanto as
magnitudes forem uniformes — medido, 120 permutações, mesmos valores. A prática que funciona, e que
apliquei nos dois gates: **reimplementar a versão errada como contrafactual no mesmo processo** e
exigir que ela FALHE. Se o teste não distingue as duas, ele não mede o que promete. Corolário do
corolário, do gate de `e3.0`: quando um número que eu escrevi vem de uma divisão (`420/250`),
conferir se todos os clamps do caminho estão na conta antes de publicá-lo.
