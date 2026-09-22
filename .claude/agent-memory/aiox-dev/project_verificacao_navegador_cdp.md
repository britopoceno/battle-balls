---
name: verificacao-navegador-cdp
description: Sem claude-in-chrome, verificação de navegador do Battle Balls roda em Chrome headless por CDP; armadilhas de porta 5179 ocupada e de telemetria entre abas
metadata:
  type: project
---

Quando as ferramentas `claude-in-chrome` não aparecem na sessão, dá para dirigir o jogo de verdade com o Chrome
instalado (`C:/Program Files/Google/Chrome/Application/chrome.exe --headless=new --remote-debugging-port=N
--user-data-dir=<scratch>`) e um script Node 24 com o `WebSocket` nativo falando CDP. Os pontos que funcionam são
`Target.createTarget {newWindow:true}` + `attachToTarget {flatten:true}` por aba, `Emulation.setFocusEmulationEnabled`,
`Network.webSocketFrameSent/Received` para ler o fio, `Browser.setDownloadBehavior` para capturar o export de
telemetria e `Page.captureScreenshot`. Foi usado em `e4.5` (2026-09-22) para duas Bo5 em duas abas. Os scripts
ficaram no scratchpad daquela sessão (`cdp.mjs`, `e2e.mjs`, `neg.mjs`).

**Why:** a story pedia "duas abas jogam uma Bo5" e a extensão não estava conectada. O CDP deu evidência real, com
frames, console, screenshots e exports, em vez de só um teste simulado.

**How to apply:**
- Suba servidor e Vite com `cmd /c npm run ...` e mate com `taskkill /PID <pid> /T /F`. Confira as portas depois.
- **Outro @dev em paralelo pode estar com `npm run server` na 5179.** Não mate o processo dele. Troque as DUAS
  cópias de `PORTA_DO_SERVIDOR` para outro número numa cópia descartável (ver [[git-archive-copia-descartavel]]).
- **Duas abas do mesmo navegador dividem o `localStorage` da telemetria, e cada escrita grava o array inteiro.**
  Uma aba que recarrega importa o acúmulo da outra. Para conferir exports por assento, rode sem recarga ou com
  perfis separados.
- Os frames de HMR do Vite aparecem como sockets e mensagens sem `t`. Filtre pela porta do servidor do jogo.
- **e4.11 (2026-09-22):** a mesma receita cobre sala real + mutações por cópia (`e411/` do scratchpad: `mkcopy.mjs`
  com junction via `execFileSync('powershell', …)`, `parte-a.mjs`/`parte-b.mjs`). Escreva scripts longos com o
  Write tool: heredoc no Bash quebrou num script com crases e perdeu barras invertidas de caminho Windows.
  "Duas abas = dois jogadores" pede UM perfil; "localStorage vazio" pede um segundo Chrome com perfil novo.
