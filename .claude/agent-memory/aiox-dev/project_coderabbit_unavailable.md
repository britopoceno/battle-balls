---
name: coderabbit-unavailable-on-this-machine
description: CodeRabbit pre-commit gate cannot run here — WSL is not installed, despite the AIOX rules assuming it
metadata:
  type: project
---

O gate de CodeRabbit que `.claude/rules/coderabbit-integration.md` e as stories descrevem
(`wsl bash -c '~/.local/bin/coderabbit ...'`) **não é executável nesta máquina**: `wsl` responde
"O Subsistema do Windows para Linux não está instalado". Verificado em 2026-07-29.

**Why:** as regras do AIOX vieram do instalador e assumem uma máquina com WSL + CodeRabbit CLI; a
máquina real do projeto Battle Balls não tem nenhum dos dois. É o mesmo tipo de descompasso já
documentado em `.claude/rules/mcp-usage.md`, que foi reescrito porque descrevia servidores MCP que
não existem aqui.

**How to apply:** não tente rodar CodeRabbit nem instalar WSL por conta própria. Marque a Quality
Gate Task de pre-commit como não executável, registre o motivo na story, e cubra o gate com o que
existe de verdade no projeto: `npm run check` (tsc) + `npm run sim:check` (determinismo, golden
hash, cobertura de build, replay, Pilar 3) + self-critique registrado no Dev Agent Record.
Reconfirme antes de afirmar isso numa story nova — se alguém instalar WSL, esta memória fica velha.
