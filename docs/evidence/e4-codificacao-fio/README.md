# Evidência — codificação do fio do `{t:'snap'}` (Fase 4 / E4, decisão de 2026-09-21)

Medições que sustentam a **§5.5 de `docs/architecture-e4.md`**. Feitas em 2026-09-21, com o código
em `b1c0668` (fim de `e4.2`), **sem alterar uma linha de `src/`**: os scripts importam o código atual e
medem os snapshots REAIS que `net/snapshot.ts` produz.

Ambiente: Windows 11 x64 · Node v24.13.1. Convenção das rodadas, a mesma de `architecture-e4.md` §1:
`[golem, vex]` dos dois lados, `abilityIndex 0` / `passiveIndex 0`, bot heurístico dos dois lados,
seeds **1 / 1001 / 2001 / 3001 / 379** (23 166 ticks, o mesmo total de §1.1 e da guarda `fio snapshot`).

## Arquivos

| arquivo | o quê |
|---|---|
| `01-codificacoes.ts` | Cinco codificações do mesmo `{t:'snap', s, seq}` (envelope incluído), por quadro, na cadência de `SNAPSHOT_HZ` com o flush do último tick; bytes crus, deflate isolado e deflate com contexto (o que o `permessage-deflate` entrega com *context takeover*, sem os 4 B de cauda). Conta também quantas vezes a prontidão decodificada diverge da do `World`. `INT=1` → 60 Hz, `INT=3` → 20 Hz |
| `01-codificacoes-30hz.out` · `-60hz.out` · `-20hz.out` | Saídas brutas |
| `02-prontidao.mjs` · `.out` | 2 × 10⁶ casos sintéticos concentrados na fronteira de prontidão: regra segura × arredondamento ingênuo |

## O que os números dizem

- **JSON com nomes, como `e4.2` produz: 904,0 B/quadro a 30 Hz** (879 B sem o envelope, o número do Dev
  Agent Record de `e4.2`). Nada de classe 3: o custo é nome de campo repetido e dígito de float.
- **Tupla posicional em JSON, com a quantização segura: 325,8 B/quadro** (pico 687). É a codificação
  decidida.
- **Com deflate de contexto as duas empatam** (82,0 × 74,7 B/quadro): o compressor apaga os nomes de
  campo. A tupla só compra alguma coisa quando o deflate NÃO está ligado — e é exatamente esse o caso
  que o projeto não controla (§5.5).
- **Prontidão, in vivo: 0 viradas em 46 340 amostras bola×quadro, tanto na regra segura quanto no
  arredondamento ingênuo.** Nenhuma amostra caiu a menos de 0,005 do limiar. Ou seja: a rodada real
  NÃO discrimina a regra certa da errada, e um teste que só olhasse a rodada real passaria com o
  arredondamento ingênuo.
- **Prontidão, sintética (`02`): a regra segura vira 0 vezes em 2 × 10⁶; o arredondamento ingênuo vira
  654 971 (habilidade) e 2 171 710 (ult).** O piso de `ultCharge` falha em 100% dos casos quando o limiar
  não é múltiplo do passo (`110.005`) — por isso a guarda de `e4.3` confere o roster.

## O que estes números não são

Não são medição de rede: o custo por mensagem de transporte (cabeçalho WebSocket, registro TLS, TCP/IP)
é **estimado** na §5.5 (~70 B por quadro), não medido. E são bot × bot, como toda a §1.
