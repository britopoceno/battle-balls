---
name: design-md-is-locked
description: DESIGN.md decisions are final — never propose alternative architecture, stack or PvP model for Battle Balls
metadata:
  type: feedback
---

`DESIGN.md` na raiz do projeto Battle Balls é **fonte de verdade travada**. Tratar cada
decisão dele como dada e trabalhar A PARTIR dela. Nunca propor arquitetura alternativa,
stack alternativa ou modelo de PvP alternativo, nem re-derivar decisões já tomadas, nem
gerar documento genérico que ignore o que já foi decidido.

**Why:** o documento é resultado de uma sessão longa de stress-test com o usuário — 15
decisões com trade-off explícito, riscos nomeados, e uma contradição de netcode já
identificada e enterrada (o modelo "servidor pré-computa a batalha e envia replay" morreu
quando entrou input ao vivo; está registrado no §5 justamente para não voltar por engano).
Reabrir debate desperdiça o trabalho já feito e arrisca ressuscitar decisões mortas.

**How to apply:** ao produzir qualquer artefato de análise/produto neste projeto, o valor
está em (a) registrar as decisões, (b) cruzá-las com medições reais e com o código para
achar **contradições e lacunas**, (c) propor **indicadores mensuráveis** para os riscos já
nomeados. Não em redesenhar. Achado de contradição DESIGN↔código é o entregável mais
valorizado. Ao propor algo que o DESIGN.md não define, marcar explicitamente como
`[PROPOSTO]` para não se confundir com decisão do usuário.

Ver também [[battle-balls-measurement-first]].
