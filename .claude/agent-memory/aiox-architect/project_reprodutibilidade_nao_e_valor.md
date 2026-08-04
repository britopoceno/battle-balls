---
name: reprodutibilidade-nao-e-valor
description: Achado medido no gate de e3.2 — teste de replay/determinismo é estruturalmente cego a erro sistemático; toda camada nova precisa também de rede de VALOR
metadata:
  type: project
---

Um teste de reprodutibilidade prova que o sistema é **função** de suas entradas. Ele **não** prova
que a função é a certa. Erro sistemático aparece igual nos dois lados da comparação e passa verde.

**Medido no gate de `e3.2` (2026-07-30), na árvore real:** um `aplicar` que aceita compra **sem
debitar ouro** — literalmente o exemplo que a Bíblia §7.5 dava — produz hashes de partida
**byte-idênticos** aos da implementação correta (`d4c28105 e1dde398 15c4854d`). Golden hash ✓,
determinismo ✓, replay de partida ✓. Idem para zerar `itemBonus` em `setupDaRodada`: as três redes
verdes.

As duas guardas que fazem o serviço, ambas escritas fora da letra dos ACs e ambas obrigatórias:
- **rede de valor** (`invarianteCompra`): débito == preço, `evento.ouroDepois` == estado, e rejeição
  devolve o estado original **por identidade referencial** (`===`) — comparação campo a campo mal
  escrita seria satisfeita por um clone alterado.
- **rede de poder discriminante** (`ponte itemBonus`): a MESMA rodada com e sem o bônus, exigindo
  hashes **diferentes**. Existe porque nenhuma seed do baseline exercita `itemBonus`.

**Why:** o projeto já pagou duas vezes por "golden hash verde = funciona", e `match/` é a primeira
camada que o golden hash não cobre. A Bíblia §7.5 apresentava o *golden hash de partida* como a
mitigação — e ele é cego justamente à classe de bug que o parágrafo cita. Errata escrita por mim lá.

**How to apply:** ao especificar ou aprovar teste de camada nova, exigir as duas redes e nomear qual
pega o quê. Na bateria negativa, não aceitar "a mutação foi detectada" — exigir **qual guarda**
detectou; foi assim que este achado apareceu (5 mutações pegas, 4 por guardas de valor, 0 pelo
replay). Corolário do meu hábito de [[medir-antes-de-propor]]: teste que especifico precisa do
cenário discriminante, e "comparar o sistema consigo mesmo" nunca é um. Ver [[fase3-loop-pendencias]]
(ARCH-E32-001 é a mesma doença em outro lugar: contrafactual que varia duas coisas de uma vez).
