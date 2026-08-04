---
name: story-scope-beats-framework-artifacts
description: Quando um AC limita quais arquivos podem mudar, artefatos de processo do AIOX vão inline na story, não em arquivos novos
metadata:
  type: feedback
---

Quando uma story do Battle Balls tem um AC do tipo "nenhuma linha fora de `X` é alterada", esse AC
vence os artefatos de processo do framework. Registre self-critique, decisões IDS e logs de
verificação **inline no Dev Agent Record da story**, em vez de criar `plan/self-critique-*.json`,
relatórios em `docs/qa/` ou qualquer arquivo novo. Scripts de verificação ad hoc vão para o
scratchpad da sessão, fora do repo.

**Why:** as stories deste projeto usam o escopo de arquivos como critério verificável por
`git diff --stat` — um JSON de checklist criado "porque o checklist manda" transforma um AC verde
em desvio, e o gate (@architect/@qa) tem que julgar um desvio que não precisava existir. Aplicado em
`e2.1` e aceito.

**How to apply:** antes de criar qualquer arquivo que não seja código da story, confira se algum AC
enumera os arquivos permitidos. Se enumera, escreva o conteúdo dentro da story e registre a decisão
como `[AUTO-DECISION]` com a justificativa. Ver [[coderabbit-unavailable-on-this-machine]] para o
outro artefato de processo que costuma cair no mesmo lugar.
