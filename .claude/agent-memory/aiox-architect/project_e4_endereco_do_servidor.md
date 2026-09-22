---
name: e4-endereco-do-servidor
description: L-3 decidido em architecture-e4.md §6.2 (commit 5495657) — cliente acha o servidor por location; Pages fora do portão P4.4; R-08 (rede do portão) aberta com o usuário
metadata:
  type: project
---

L-3 fechado em 2026-09-22 (§6.2): URL = (https: ? wss: : ws:) + location.hostname + porta em constante,
duas cópias (client/rede.ts e server/main.ts, que já usa `PORTA_DO_SERVIDOR = 5179`, sem `host`, sem override).
Pages saiu do portão P4.4: muda só a origem do HTML, não o caminho aparelho–servidor que o portão mede.

**Why:** a pergunta real nunca foi "Pages ou Vite", e sim "mesma Wi-Fi ou internet". Isso é R-08, do usuário;
qualquer caminho pela internet (túnel, port-forward, hospedagem) reabre o `wss:` comigo.

**How to apply:** não definir o caminho `wss:` antes da resposta de R-08. O Vite serve em **5173** por padrão;
o "5177" de README/docs é resíduo de sondas com `--port 5177` — não repetir como fato. Liga com
[[e4-criacao-de-sala]] e [[medir-antes-de-propor]].
