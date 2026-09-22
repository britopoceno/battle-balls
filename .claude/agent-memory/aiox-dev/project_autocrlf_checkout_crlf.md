---
name: autocrlf-checkout-crlf
description: Neste repo (core.autocrlf=true) `git checkout -- arquivo` regrava o arquivo em CRLF, e aí padrões com \n dos scripts de mutação deixam de casar
metadata:
  type: project
---

`core.autocrlf=true` aqui, e a árvore de trabalho fica normalmente em LF. Mas `git checkout -- <arquivo>`
(usado para reverter uma edição quebrada) regrava o arquivo em **CRLF**. O Edit tool preserva o CRLF depois
disso. O diff commitado continua normalizado, mas script de mutação/substituição com padrão contendo `\n`
passa a casar 0 vezes. Visto na debt.13 (2026-09-21): MR1 abortou com "padrão casa 0 vez(es)".

**Why:** a bateria de mutações exige match exato de 1 vez. CRLF silencioso quebra a bateria, ou pior,
faz um script sem essa checagem "aplicar" nada e dar falso verde. Ver [[bateria-negativa-toolchain]].

**How to apply:** depois de qualquer `git checkout --`, confira com `file <arq>` e normalize para LF
(`s.replace(/\r\n/g,'\n')` via Node) antes de rodar mutações. Para editar trechos com crases, prefira o
Edit tool a `node -e` inline: crase dentro de aspas duplas no bash vira substituição de comando.
