---
name: feedback-decisoes-travadas
description: No projeto Battle Balls, decisões de design são travadas e não se reabrem; portões de fase que são julgamento humano não recebem métrica inventada
metadata:
  type: feedback
---

Ao produzir qualquer documento para o Battle Balls (PRD, épico, story, arquitetura):
escrever **a partir** das decisões do `DESIGN.md`, nunca propor stack, arquitetura ou
modelo de PvP alternativo, nem re-derivar decisão já tomada. Quando um portão de fase é
explicitamente julgamento humano (Fase 0 "é divertido?", Fase 1 "os dois polegares
funcionam?"), dizer isso — não inventar métrica automática para preencher a lacuna.
Nada de boilerplate de template: documento denso, em português.

**Why:** as 15 decisões do `DESIGN.md` saíram de uma sessão longa de stress-test com
trade-off explícito em cada uma; a seção "Decisões travadas" do brief é registro, não
pauta. E a decisão #13 do projeto é "medição, não raciocínio" — inventar uma métrica onde
o design escolheu julgamento humano inverte exatamente esse princípio.

**How to apply:** ao receber missão de documento neste projeto, ler `DESIGN.md` +
`docs/brief.md` antes de escrever; marcar proposta de agente como `[PROPOSTO]` /
pendente de aprovação em vez de tratar como fato; sinalizar conflito entre fontes em vez
de escolher sozinho. Ver [[projeto-battle-balls-estado]].
