---
name: e4-criacao-de-sala
description: O-2 do @po (canal de criação de sala) decidida em 2026-09-22, §6.1 de architecture-e4.md — servidor cria sozinho, id no log, fio intacto; L-1..L-3 e R-07
metadata:
  type: project
---

Decidido em 2026-09-22 (§6.1 de `docs/architecture-e4.md`, opção D): o servidor cria as salas sozinho
(ao menos uma livre), escreve o id numa linha de log de operação (sem segredo, sem seed), `entrar` com id
desconhecido é recusado, nunca cria. `DoCliente`/`VERSAO_DO_FIO = 2` intactos; `e4.4`/AC 13 e `e4.5`/AC 14
não reabrem. Autosserviço (rota HTTP, opção A) virou R-07 para o @pm.

**Why:** B/C mudam o fio (C em silêncio: medido que `parseDoCliente` aceita `sala:''` e o decodificador
deixa passar `id` extra no `{t:'sala'}`); A exigia tela não desenhada + endpoint que aloca memória + CORS.
Todas as stories da fase têm operador presente.

**How to apply:** no gate de `e4.4`, conferir L-1 (segredo do cliente que não bate vira chave nova —
`sala.ts:391-398` assenta chave desconhecida) e que o log não tem segredo/seed. L-3 (endereço do servidor
no cliente, `wss:` no Pages) ficou como recomendação ao @po, trava `e4.5`. Colisão de nome: há outra
"O-2 (seed no fio)" na §11.6.2. Ver [[e4-versao-do-fio]].
