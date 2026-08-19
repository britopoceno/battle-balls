# Evidência — determinismo entre engines, banda e CPU (Fase 4 / E4)

Medições que sustentam a **§1 de `docs/architecture-e4.md`**. Feitas em 2026-08-18/19, com o código
em `4d9ede2`, **sem alterar uma linha de `src/`**.

Ambiente: Windows 11 x64 · **Node v24.13.1 (V8 13.6.233.17-node.40)** · **Chrome 151** ·
`ESCALA_HP = 6.0`, `ESCALA_DMG = 1.0` (o tuning decidido em `e3.6`).

Convenção das rodadas, a mesma de `architecture-e3.md` §1: composição `[golem, vex]` dos dois
lados, `abilityIndex 0` / `passiveIndex 0`, bot heurístico dos dois lados, seeds
**1 / 1001 / 2001 / 3001 / 379**.

## O achado principal

**A mesma simulação, na mesma seed, produz estados diferentes em bits no Node e no Chrome.**

- O `hash()` do arnês (quantizado por `toFixed(4)`) **bateu em 5/5 seeds**; ticks e vencedor também.
- O estado em precisão total **divergiu em 3/5 seeds**. Maior divergência observada: **1,6e-9 px**
  depois de 5 249 ticks.
- Causa nomeada: `Math.atan2`, `Math.sin` e `Math.cos` **diferem entre as duas engines**
  (`Math.hypot`, `Math.pow` e `Math.sqrt` batem). Isto é conforme a ECMA-262, que só exige precisão
  exata de `sqrt` e da aritmética — as demais são *implementation-defined*, e Node 24 e Chrome 151
  embarcam versões diferentes do V8.
- Ponto de entrada no jogo: `chars/golem.ts:140` (`atan2` do ângulo da Muralha), que alimenta
  `sim/physics.ts:181-182` (cos/sin da colisão com parede).

Leitura completa, incluindo por que **quantização não é banda de tolerância**, em
`docs/architecture-e4.md` §1.5 e §11.1.

## Arquivos

| Arquivo | O que é |
|---|---|
| `01-banda-cpu-duracao.mjs` / `.out` | Duração da rodada, tamanho de snapshot (World inteiro × snapshot de render, cru e comprimido), banda por taxa, volume de comandos, custo de CPU por tick e salas por núcleo |
| `02-trilha-node.mjs` / `.out` | Hash bruto (sem quantização) a cada 25 ticks, seed 1 — usado para bissectar o tick da primeira divergência |
| `03-zoom-node.mjs` / `.out` | Estado em precisão total, ticks 720-755, seed 1 |
| `04-estado-final-node.mjs` / `.out` | Estado em precisão total nos ticks 1000/2000/3000/4000 e no fim, para as 5 seeds |
| `05-math-node.mjs` / `.out` | Bateria `Math.*`: chamada exata do jogo + varredura de 20 000 pares por função |
| `06-math-chrome.out` | Mesma bateria, no Chrome. **Comparar com `05`** |
| `07-delta-chrome-vs-node.out` | Δ campo a campo entre Chrome e Node, por seed e por marco |
| `08-primeira-divergencia.out` | O diff que isola o tick 742 e a linha de código responsável |
| `probe-e4.html` | Lado Chrome de `05` e `07`. Instruções de execução dentro do arquivo |

## Como reproduzir

**Lado Node** — a partir deste diretório:

```bash
node 01-banda-cpu-duracao.mjs > 01-banda-cpu-duracao.out
node 02-trilha-node.mjs        > 02-trilha-node.out
node 03-zoom-node.mjs          > 03-zoom-node.out
node 04-estado-final-node.mjs  > 04-estado-final-node.out
node 05-math-node.mjs          > 05-math-node.out
```

**Lado Chrome:**

```bash
npm run dev -- --port 5177          # na raiz do projeto
cp docs/evidence/e4-determinismo-engines/probe-e4.html .
cp docs/evidence/e4-determinismo-engines/04-estado-final-node.out .
# abrir http://localhost:5177/probe-e4.html
rm probe-e4.html 04-estado-final-node.out
```

As duas cópias na raiz são temporárias porque o servidor de dev do Vite serve a partir dela. Apagar
depois: nenhum arquivo de medição deve ficar fora deste diretório.

## Ressalvas registradas

- **n = 5 seeds.** Basta para provar que a divergência existe; não basta para caracterizar com que
  frequência ela cruzaria qualquer limiar.
- **Uma máquina, um par de versões.** Um celular Android com outro V8, ou um iPhone com
  JavaScriptCore, é outra engine e **não foi medido**.
- **Nada aqui mede rede.** Latência, jitter e perda de pacote não foram medidos e não podem ser sem
  o servidor existir. É o que o portão P4.4 cobre.
- **O bot é o sujeito.** As rodadas são bot × bot; com humano no controle a duração cai (58,4s
  medidos em `e3.6`) e o volume de comandos sobe.
