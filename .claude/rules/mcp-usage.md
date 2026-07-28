---
paths: **/*
---

# Regras de uso de MCP — projeto Battle Balls

> **Este arquivo foi reescrito para refletir a máquina real.** A versão que veio com o
> instalador do AIOX descrevia Docker MCP Toolkit, desktop-commander, Playwright, EXA,
> Context7 e Apify. Nenhum deles está configurado aqui — verificado em `.mcp.json`,
> `.claude/settings.json`, `.claude/settings.local.json` e `~/.claude.json`: **zero
> servidores MCP registrados**. Um agente que seguisse aquelas regras chamaria
> ferramenta inexistente e falharia.

## Inventário real

### Servidores MCP registrados
**Nenhum.** Não existe `mcpServers` configurado em nenhum escopo.

### Capacidades disponíveis que NÃO são MCP registrado

| Capacidade | Ferramentas | Observação |
|---|---|---|
| Automação de navegador | `mcp__claude-in-chrome__*` | Extensão Claude in Chrome. Requer o Chrome aberto e a extensão conectada — pode cair entre sessões. |
| Busca na web | `WebSearch` | Nativa do Claude Code. |
| Leitura de página | `WebFetch` | Nativa. Falha em URL autenticada. |

## Prioridade de ferramentas

Prefira sempre a ferramenta nativa. Ela executa no sistema local (Windows), é mais
rápida e não depende de nada externo estar de pé.

| Tarefa | Use | Não use |
|---|---|---|
| Ler arquivo | `Read` | `Bash(cat)` |
| Escrever/editar | `Write` / `Edit` | `Bash(echo >)` |
| Buscar arquivo por nome | `Glob` | `Bash(find)` |
| Buscar conteúdo | `Grep` | `Bash(grep)` / `Bash(rg)` |
| Rodar comando | `Bash` ou `PowerShell` | — |
| Pesquisar na web | `WebSearch` | — |
| Ler uma URL | `WebFetch` | `Bash(curl)` para conteúdo |

`Bash(curl)` continua válido para **verificar** um endpoint (status HTTP, headers),
não para ler conteúdo destinado a leitura humana.

## Automação de navegador

Use `mcp__claude-in-chrome__*` quando precisar ver o jogo rodando de verdade:
validar render no canvas, testar mira por arrasto, ler erro de console.

Regras:
1. Chame `tabs_context_mcp` **antes** de qualquer outra ferramenta de browser.
2. Crie aba nova (`tabs_create_mcp`) em vez de reaproveitar aba do usuário.
3. Carregue os schemas em **uma única** chamada de `ToolSearch` — uma por ferramenta
   desperdiça ida e volta.
4. Se a extensão não responder após 2-3 tentativas, **pare e avise**. Não insista.
5. Nunca dispare `alert()`, `confirm()` ou `prompt()` na página: dialog modal trava a
   extensão inteira e exige intervenção manual do usuário.

Para este projeto especificamente, o alvo de verificação é
`http://localhost:5177` (dev) ou `http://localhost:5178` (build de produção).

## Se quiser adicionar um MCP

Não adicione por conta própria. Um servidor MCP é dependência externa nova, com
credenciais e superfície de falha próprias. Traga a proposta ao usuário antes,
justificando qual limitação concreta ele resolve.

Se aprovado, a operação é do agente **@devops** (`*add-mcp`), conforme a matriz de
autoridade do AIOX em `.claude/rules/agent-authority.md`.

## Governança (mantida do AIOX)

Gestão de infraestrutura MCP é exclusiva do agente **DevOps (@devops / Gage)**.
Os demais agentes são **consumidores**, não administradores.

| Operação | Agente | Comando |
|---|---|---|
| Buscar no catálogo | DevOps | `*search-mcp` |
| Adicionar servidor | DevOps | `*add-mcp` |
| Listar habilitados | DevOps | `*list-mcps` |
| Remover servidor | DevOps | `*remove-mcp` |
