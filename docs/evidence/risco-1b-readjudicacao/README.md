# Evidência do Risco #1b — re-adjudicação formal sob `ESCALA_HP = 6.0`

Saídas cruas e agregação da **re-adjudicação formal do Risco #1b** (PRD §6), executada em 2026-08-18
por **@pm/@architect** sob o mandato do gate `e3.6` (achado `REQ-101`, severity high). O indicador
tinha sido lido em `e2.7` **antes** da alavanca de D-05; esta pasta é a leitura dele **depois**, no
jogo entregue (`ESCALA_HP = 6.0`, `ESCALA_DMG = 1.0` — decisão de produto do usuário, fora de
discussão aqui).

O gatilho aprovado é conjuntivo e por personagem: **físico < +2pp E dano > +5pp → "a trilha física
nasce morta"**, onde "físico" e "dano" são deltas de winrate dos pacotes nomeados `fisico`
(`{mass:+0.20, drag:+0.20}`) e `dano` (`{dmg:+0.20}`) contra o controle, na mesma seed base.

## Protocolo — não é escolha desta pasta

O protocolo é a **recomendação formal do QA no gate `e2.7`**: n≥3000 decididas por célula, ≥3 bases de
seed, média **entre bases** por personagem. Executado com 4 bases, sobre o commit `44311f6` (working
tree limpo, `npm run check` verde):

```bash
npm run balance -- --risco-1b --n=3000 --seed=1    --json > risco1b-n3000-base1.out
npm run balance -- --risco-1b --n=3000 --seed=1001 --json > risco1b-n3000-base1001.out
npm run balance -- --risco-1b --n=3000 --seed=2001 --json > risco1b-n3000-base2001.out
npm run balance -- --risco-1b --n=3000 --seed=3001 --json > risco1b-n3000-base3001.out

node agrega-risco1b.mjs <dir>   # → risco1b-agregado.json
```

A agregação lê os campos crus de winrate do `--json` (não o `deltaPp` impresso, que já vem
arredondado) e calcula `delta = winrate(pacote) − winrate(controle)` em precisão cheia.

## O que foi medido

IC de **±1,7892pp por célula**. Deltas em pontos percentuais:

| Base de seed | golem físico | golem dano | vex físico | vex dano | gatilho golem | gatilho vex |
|---|---:|---:|---:|---:|---|---|
| 1 | +0,7667 | +18,4667 | −1,5333 | +35,1333 | SIM | SIM |
| 1001 | +1,4667 | +17,5667 | +0,3000 | +35,4667 | SIM | SIM |
| 2001 | +0,7000 | +20,0000 | +0,3667 | +37,1667 | SIM | SIM |
| 3001 | +2,3667 | +19,1333 | +0,9667 | +36,9667 | NÃO | SIM |
| **média entre bases** | **+1,3250** | **+18,7917** | **+0,0250** | **+36,1833** | **SIM** | **SIM** |

Dispersão do termo que decide (o físico): golem **sd 0,776 · amplitude 1,667**; vex **sd 1,081 ·
amplitude 2,500**. No vex, as quatro leituras de base (−1,53 a +0,97) ficam todas a menos de um IC
de célula (±1,79pp) de zero — compatível com um valor verdadeiro ≈0.

**Veredito na média entre bases:** golem **SIM** (1,3250 < 2 **e** 18,7917 > 5); vex **SIM**
(0,0250 < 2 **e** 36,1833 > 5). Por base isolada, vex dá SIM em 4 de 4 e golem em 3 de 4 — o único
NÃO é a base 3001, físico +2,37, e é exatamente esse tipo de oscilação que a média entre bases existe
para absorver.

### O pacote físico colapsou entre `e2.7` e hoje

Referência pré-alavanca (`e2.7`, n=800, base 1, ×1.0): golem +2,62 físico / +10,63 dano; vex **+8,38
físico** / +17,63 dano; gatilhos NÃO/NÃO. Sob ×6.0 o físico do vex vai de +8,38pp a **+0,025pp** e o
do golem de +2,62 a +1,325, enquanto o pacote de dano sobe de valor (golem +10,63 → +18,79, **+77%**;
vex +17,63 → +36,18, **×2,05**). A "inversão de sinal" do vex citada no gate (−1,53pp na base 1) **é
ruído em torno de zero**: as quatro bases vão de −1,53 a +0,97.

## O que esta leitura decide

- Que o gatilho do Risco #1b lê **SIM para golem e SIM para vex** sob ×6.0, pelo protocolo formal, na
  média entre bases — **por personagem**.
- Que a frase do PRD "a trilha física nasce morta" deixa de ser previsão e passa a ser **estado medido**.
- Que a **pré-condição (a) de `debt.9`** (re-adjudicação formal concluída e registrada) está satisfeita.

## O que esta leitura NÃO decide

- **Como reagir.** Baixar preço, subir magnitude, redistribuir itens da trilha física — decisão do
  **@pm** quando `debt.9` executar (AC 9), informada por esta evidência **mais** a amostra de telemetria
  humana 100% ×6.0 (pré-condição **(b)**, ainda pendente: hoje existem 3 compras ×6.0, o piso é n≥30).
  O usuário pode ratificar ou vetar.
- **R-04 de `architecture-e2.md` §9.** A média usada aqui agrega **repetições do mesmo personagem**. A
  agregação **entre** personagens (global vs por personagem) segue adiada para a Fase 5, intocada.
  (Não confundir com o R-04 de `architecture-e3.md` §14, que é a renda das rodadas 6/7.)
- **D-05 / R-05.** `ESCALA_HP = 6.0` e a aceitação da morte súbita são decisões de produto do usuário,
  fixas. Esta pasta avalia o indicador **sob** ×6.0; não o reabre.
- **Escolha humana.** A telemetria (11/11 compras humanas na trilha combate, 0 na física) corrobora a
  direção, mas mede **escolha**, não desempenho — instrumento diferente, não substituto desta bateria.

## Determinismo e continuidade

O arnês é determinístico: re-executar os mesmos comandos sobre o mesmo commit **reproduz as saídas byte
a byte**. Foi o que se verificou na continuidade — a re-execução de 2026-08-18 do mesmo comando de T-4/
`e3.6` (base 1) reproduziu **exatamente** a tabela n=3000 do story `e3.6`: golem +0,77 / +18,47 (SIM),
vex −1,53 / +35,13 (SIM). Isso fixa o conjunto canônico do Risco #1b: **a tabela n=3000 do story
`e3.6`**.

Os números citados no gate `e3.6`/REQ-101 (golem +1,88/+17,63; vex −0,62/+35,12) são a **leitura n=800
completa** (seed base 1) da re-execução independente do QA — **não há erro no gate**. A re-execução de
2026-08-18 de `npm run balance -- --risco-1b --json` (n=800 default, seed base 1) reproduziu os quatro
números exatamente: golem físico +1,88 / dano +17,63 → SIM; vex físico −0,62 / dano +35,12 → SIM
(saída completa em `risco1b-n800-base1.out`, nesta pasta). O story `e3.6` publicou apenas o físico
dessa coluna; a igualdade do +17,63 (dano do golem a n=800) com o dano do vex pré-alavanca de `e2.7`
(+17,63) é coincidência numérica — deltas a n=800 têm granularidade de 0,125pp. A divergência story ×
gate reduz-se, portanto, a **n=800 vs n=3000**, com as duas leituras dando SIM/SIM sob ×6.0; o conjunto
canônico é a tabela n=3000 porque o próprio arnês avisa, na saída n=800, que "um gatilho lido no piso
de RF-48 é leitura de ruído. Suba --n antes de decidir por ele" (IC ±3,46pp). O gate **não** é editado
retroativamente; este registro vive na errata de `docs/architecture-e3.md` §14 e aqui.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `risco1b-n3000-base1.out` | saída completa do arnês, base de seed 1 (stdout + bloco `--json`) |
| `risco1b-n3000-base1001.out` | idem, base 1001 |
| `risco1b-n3000-base2001.out` | idem, base 2001 |
| `risco1b-n3000-base3001.out` | idem, base 3001 — a única base cujo golem lê NÃO |
| `risco1b-n800-base1.out` | verificação da divergência story × gate: leitura n=800 completa (seed base 1, stdout + bloco `--json`), reproduz os quatro números do gate `e3.6`/REQ-101 |
| `agrega-risco1b.mjs` | agregação entre bases em precisão cheia (winrates crus, não `deltaPp` impresso) |
| `risco1b-agregado.json` | resultado da agregação: por base, médias, sd, amplitude e veredito |
