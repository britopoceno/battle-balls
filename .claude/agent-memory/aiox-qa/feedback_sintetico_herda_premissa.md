---
name: sintetico-herda-premissa
description: Fixture sintético escrito por mim herda a premissa errada do implementador quando o dado vem de uma borda do navegador/SO — só dado de aparelho real responde
metadata:
  type: feedback
---

Quando o dado sob teste nasce numa **borda de plataforma** (Pointer Events, sensores,
timers do SO, APIs de arquivo), um fixture sintético que eu escrevo **não** é verificação
independente: eu leio a mesma documentação que o implementador leu e reproduzo a mesma
premissa errada. O teste passa e o gate fecha com o bug dentro.

**Why:** aconteceu no gate de `e3.5` (telemetria). Meu arquivo sintético plantou
`ponteiro: 3, 7, -1` porque reproduzi a *intenção declarada* do campo, e a métrica RF-36
imprimiu `50,0% — 1 de 2`. Eu teria fechado o AC 11 como PASS. O que expôs o defeito foi
rodar o agregador contra um export de **toque real** que eu não escrevi: 23 casts, 23
`pointerId` distintos. `pointerId` identifica um *contato*, não um dedo — cada toque novo
recebe id novo —, então "% de rodadas com uma só mão" só podia responder "uma mão" numa
rodada com exatamente 1 cast. A sessão de mouse do @dev imprimiu `100%` e pareceu perfeita
porque o mouse mantém id estável: a métrica acertava por acidente no aparelho que não
interessa e era incapaz de acertar no que interessa.

**How to apply:** antes de dar PASS num AC cujo dado atravessa uma borda de plataforma,
exigir **um artefato produzido pelo aparelho-alvo**, não só o sintético. Se não existir,
o veredito máximo é CONCERNS com o AC marcado como não verificado — nunca PASS. E quando
recomendar fixture permanente (ver [[feedback-verificacao-independente]]), exigir que ele
inclua um caso capturado do aparelho real, senão a suíte nasce com o mesmo ponto cego.

Sinal barato de fraude de premissa: se um campo é descrito como identidade estável de algo
físico ("o dedo", "o dispositivo", "a sessão"), conferir num dump real quantos valores
distintos ele assume. Identidade real → poucos valores; contador de eventos → um por evento.
