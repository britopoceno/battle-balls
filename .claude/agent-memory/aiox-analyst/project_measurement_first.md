---
name: battle-balls-measurement-first
description: Battle Balls balances by measurement, not reasoning — always run the harness and cite real numbers instead of estimating
metadata:
  type: project
---

Em Battle Balls, balanceamento é **medição, não raciocínio** — não existe moeda comum de
dano, então nenhuma fórmula responde "este personagem está forte?". Rodar
`npm run sim:check` e citar números reais em vez de estimar. Conferir sempre contra o que
o `README.md` afirma e reportar divergência.

**Why:** a liberdade total de design (cada personagem tem movimento, ataque e regra de
carga de ult próprios) foi escolhida com esse custo aceito de forma explícita. E o arnês
já provou seu valor: achou três bugs invisíveis à leitura de código, um deles travando 20%
das rodadas (alcance corpo a corpo matematicamente inatingível entre dois corpos grandes).

**How to apply:** antes de afirmar qualquer coisa sobre equilíbrio, duração ou simetria,
medir. E qualificar o poder estatístico: as 40 seeds do arnês da Fase 0 dão margem de
±15pp e **não servem para balancear** — distinguir 55% de 50% com 80% de poder exige
~800 lutas por confronto (por isso o design pede 10k). Quando propuser um risco, propor
junto o indicador numérico e o gatilho.

Ver também [[design-md-is-locked]].
