---
name: orcamento-bytes-e-codificacao
description: Os 263/433 B de architecture-e4.md §1.2 (e o limiar ~600 B) valem para codificação compacta, não para JSON com nomes de campo — medido em e4.2
metadata:
  type: project
---

O snapshot de `e4.2` serializado como JSON do objeto `Snapshot` (forma de `e4.0`) mede **872,7 B/tick**
(60 Hz), acima do limiar de ~600 B do AC 9 — sem nenhum campo de classe 3. Os mesmos snapshots como
tupla posicional com todo número a 0,01 medem **290,7 B** (pico 609), perto dos 263/433 B de §1.2.
Deflate com contexto: 77,9 B/tick.

**Why:** o AC 9 lia "passou de 600 B → vazou classe 3". Isso só vale se a codificação medida for a
compacta de §1.2; com nomes de campo, ~60% dos bytes são chaves repetidas por entidade. Em `e4.2` a
decisão de codificação foi encaminhada a @architect/@po (`e4.3` é dona do serializador/parser).

**How to apply:** em `e4.3`/`e4.4`/`e4.7`, antes de comparar bytes com §1.2, confira QUAL codificação o
fio usa (a linha `orçamento` do `sim:check` mede JSON com nomes). Não trate estouro do limiar como
vazamento sem rodar o detector de chaves da guarda `fio snapshot`. Ver [[golden-hash-nao-prova-correcao]].
