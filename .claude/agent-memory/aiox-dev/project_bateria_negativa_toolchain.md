---
name: bateria-negativa-toolchain
description: Como rodar bateria negativa (perturbar código para provar que uma guarda falha) nesta máquina — python NÃO existe, use Node
metadata:
  type: project
---

Bateria negativa = copiar `src/` para o scratchpad, perturbar a cópia, confirmar que a guarda
FALHA, reverter, e provar com `diff -r` que o `src/` real não foi tocado. É o substituto do gate
de CodeRabbit neste projeto (ver [[coderabbit-unavailable-on-this-machine]]) e o @qa já a usou no
gate de `e2.2`.

**Why:** `python` não está instalado nesta máquina — o alias do Windows responde "Python não foi
encontrado; executar sem argumentos para instalar do Microsoft Store" e **devolve exit 0**. Um
heredoc `python - <<EOF` para editar arquivos falha em silêncio: a perturbação nunca é aplicada, o
teste passa, e a conclusão errada é "as guardas não pegam nada". Aconteceu de verdade na story
`e2.5` (5 perturbações "não detectadas" que nunca existiram). O gate de `e2.2` registrou a mesma
armadilha com outra causa (`./node_modules/.bin/tsc` via `execSync` caindo no `cmd.exe`).

**How to apply:** aplique perturbações com um script Node curto que **aborta com exit ≠ 0 se a
string alvo não existir no arquivo** — sem essa checagem, não dá para distinguir "guarda não pegou"
de "perturbação não aconteceu". Sempre rode um controle limpo antes e depois da bateria. `node` roda
`.ts` direto (type stripping, Node 24) sem tsconfig, então a cópia em scratchpad executa sem
preparo. Vale também para qualquer outra edição de arquivo em lote: prefira Node ou as ferramentas
Edit/Write a `python`/`sed` improvisados.
