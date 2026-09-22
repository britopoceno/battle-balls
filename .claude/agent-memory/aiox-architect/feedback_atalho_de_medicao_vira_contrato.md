---
name: atalho-de-medicao-vira-contrato
description: Número de um script de evidência meu vira limiar de AC a jusante; declarar no doc a forma medida e os atalhos (arredondamento, filtros) que não são especificação
metadata:
  type: feedback
---

Quando um documento meu publica um número medido (bytes, custo), escrever **ao lado** a forma exata
que foi medida e quais simplificações do script são só de medição.

**Why:** em `architecture-e4.md` §1.2 publiquei 263/433 B de snapshot medidos numa tupla de chaves de
1 letra, com `Math.round(abilityReadyAt)`, `ultCharge` a 0,1 e só `hit` do tick. O @po transformou isso
no limiar "~600 B = vazamento" de `e4.2`/AC 9; o JSON real deu 904 B/quadro sem vazar nada, e o
arredondamento do script era justamente o que vira a prontidão dos botões. Também afirmei em §5.3 que
a medição "já incluía eventos acumulados" — falso, o @qa pegou (E42-ARC-001). Corrigido em 2026-09-21
(§1.2 atualização, §5.5, §5.3).

Reincidiu no mesmo dia: a linha D da §5.5 (325,8 B) usava `seq: 0` e `effects[].kind` numérico,
contra a minha própria tabela de quantização; o codec real de `e4.8` deu 329,2 B. Errata na §5.5.
Lição extra: o script de medição tem de seguir a tabela de spec que o mesmo doc publica.

**How to apply:** toda tabela de medição leva uma linha "forma medida: …; atalhos que NÃO são spec: …".
Antes de afirmar o que um script meu cobre, reler o script. Ver [[medir-antes-de-propor]].
