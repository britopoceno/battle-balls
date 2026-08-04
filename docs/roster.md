# Closed Sys — Roster

> **O que este documento é.** A ficha dos 8 personagens iniciais: sinopse, identidade de
> movimento, bloco de stats, kit completo e regra de carga de ult. Um personagem por seção.
>
> **O que este documento NÃO é.** Não é balanceamento. **Todo número aqui é provisório** —
> Decisão #13 (medição, não raciocínio) e D-09 governam, e o portão real é `npm run balance`
> reportando os 8 dentro de 45–55%. Não é autorização de escopo: conteúdo de personagem é
> Fase 5, e a Fase 3 tem 8 stories `Ready` com zero implementadas (Risco #3 vigia isto).
>
> **Idioma.** Prosa em português, como o resto de `docs/`. Nomes de personagem, habilidade e
> item em inglês, conforme a decisão de conceito #15 (English-first).
>
> Data: 2026-07-31 · Fonte de conceito: `docs/concept.md` (decisões #1-#16)

---

## Como ler uma ficha

**Semente ER.** O arquétipo de Eternal Return de onde o personagem partiu. É origem, não
cópia — a relação pretendida é a que existe entre Brawl Stars e LoL: o mesmo espírito
mecânico, reinterpretado num idioma completamente diferente.

**No casulo.** O que está dentro da esfera. A decisão #6 do conceito manda: casulo padrão e
idêntico em todo o roster, conteúdo irrestrito. A coerência é do recipiente, nunca do ocupante.

**Como você reconhece.** A lei de movimento. É o canal de identidade primário do jogo
(*"você reconhece o personagem pelo jeito que a bola anda"*), é o mais barato que existe — o
closure `move` é código autoral que o bot nunca lê — e sob a decisão #12 do conceito (time é
dono do matiz) ele passa a ser o canal **principal**, não o secundário.

**Regra da silhueta.** Nada na silhueta pode ler como arma. Dano só existe dentro de
`contactWindows` declarada ou de projétil. Regra de arte e regra de motor são a mesma regra.

---

## 1 · CAIRN

> **Semente ER: Hyunwoo.** O bruto que anda na sua direção em linha reta, absorve o que você
> tem e devolve com juros. A pergunta que ele faz é sempre a mesma: *quanto tempo você
> consegue me manter longe?*

**No casulo:** um empilhamento de pedras que não deveria ficar de pé, e fica.

**Sinopse.** Cairn não persegue — ele *chega*. Não desvia, não circula, não recua, e a
distância entre vocês dois é a única estatística que importa na partida inteira. Ele quase não
sente empurrão e distribui muito, então cada colisão o aproxima do único lugar onde ele
funciona: encostado. A ult dele carrega com o que você faz nele. Bater em Cairn é um
empréstimo, e ele cobra.

**Como você reconhece:** linha reta, devagar, sem hesitação. Sem inimigo vivo, segura o centro.

| | |
|---|---|
| HP · raio · massa | 190 · 24 · 3.2 |
| Vel. máx · esterço · drag | 105 · 1.3 · 0.30 |
| Ataque básico | `melee` · cd 1100 · dmg 16 · alcance 18 · knockback 320 |

**Ativas (escolhe 1)**
- **Impact** — `dash` (speed 900, ms 450). Investe o próprio corpo. Abre janela de contato
  declarada: dmg 14, knockback 520, re-hit 250ms.
- **Tremor** — `burst` (raio 110, delay 0). Racha o chão: dmg 18, slow 45% por 1,8s,
  afastamento 300.

**Passivas (escolhe 1)**
- **Anchor** — ignora 60% do knockback recebido (`knockbackTaken −0.60`).
- **Rind** — recebe 18% menos dano acima de metade da vida.

**Ult · Rampart** — `utilidade` · carga **`damageTaken` 🩸** (limiar 110) · alcance 70–240.
Ergue uma parede sólida perpendicular à mira por 5s. Zero dano: controle de espaço puro.

> **Nota de arnês.** `utilidade` declarado: o bot não sabe avaliar controle de espaço, e a
> omissão é explícita em vez de silenciosa. Está no orçamento (ult, nunca ativa).

> **Nota de implementação.** Este é o `golem` que já existe em código, com stats e kit
> **intocados**. Só o `name` muda; `id: 'golem'` permanece, e nenhum hash de referência se
> move. A troca tem ripple documental (GDD §4, `brief.md`, stories) — é recusável.

---

## 2 · VEX

> **Semente ER: Aya + Zahir.** A precisão que vive numa distância específica, cruzada com a
> mobilidade que a mantém. Vex ocupa exatamente o raio onde ela acerta e o corpo a corpo não.

**No casulo:** algo que nunca aprendeu a ir direto.

**Sinopse.** Vex circula a 165px — a distância em que ela acerta e Cairn não — e não abandona
essa órbita por nada, exceto sangue. Quando o alvo cai abaixo de 40%, ela larga a disciplina e
mergulha. Massa quase nula: qualquer empurrão a tira de posição, e fora de posição ela não
causa dano nenhum. É a demonstração viva do Pilar 3 — a física a mata sem nunca a machucar.

**Como você reconhece:** órbita constante, depois um mergulho súbito e comprometido.

| | |
|---|---|
| HP · raio · massa | 100 · 15 · 0.9 |
| Vel. máx · esterço · drag | 250 · 3.2 · 0.22 |
| Ataque básico | `projectile` · cd 520 · dmg 6 · alcance 200 · speed 470 |

**Ativas (escolhe 1)**
- **Phantom Blade** — `raio` (raio 9, speed 620, ms 950). Projétil perfurante: dmg 14, slow
  40% por 1,5s.
- **Glide** — `reposicao` (speed 1000). Reposicionamento puro, sai com +30% de dano por 2,5s.
  Zero dano no cast.

**Passivas (escolhe 1)**
- **Predator** — +28% de dano em alvos abaixo de metade da vida.
- **Wraith** — +25% de velocidade abaixo de 40% da vida.

**Ult · Convergence** — `burst` (raio 190, delay 1300) · carga **`damageDealt` 💥** (limiar 130)
· alcance 80–300. Vórtice que puxa (força 2600) e detona 1,3s depois por 24. A atração divide
pela massa: Cairn resiste naturalmente, outra Vex não.

> **Nota de implementação.** Existe em código, intocado. Nome mantido — *vex* significa
> literalmente *importunar*, que é a lei de movimento dela escrita como verbo.

---

## 3 · QUARREL

> **Semente ER: Debi & Marlene.** Duas pessoas, um controle. ER as coloca em dois corpos; aqui
> só existe uma esfera por personagem, então elas dividem uma — e não gostam disso.

**No casulo:** dois ocupantes que se detestam, presos no mesmo casulo, alternando o volante.

**Sinopse.** Quarrel tem duas vozes e só uma pode dirigir. A que está no comando quer chegar
perto e resolver; a outra quer distância e tem razão. **Toda habilidade que você casta troca
quem dirige** — então mirar não é só escolher um alvo, é escolher que personagem você vai ter
pelos próximos segundos. É o único personagem do roster cuja lei de movimento você muda de
propósito, e o único que pune você por castar na hora errada.

**Como você reconhece:** avança com convicção, depois inverte e recua com a mesma convicção.
A troca é visível — a esfera literalmente muda de ideia no meio do caminho.

| | |
|---|---|
| HP · raio · massa | 135 · 17 · 1.4 |
| Vel. máx · esterço · drag | 210 · 2.6 · 0.26 |
| Ataque básico | `projectile` · cd 640 · dmg 8 · alcance 170 · speed 430 |

**Lei de movimento.** `memory.voice` alterna 0/1 a cada cast de ativa.
Voz 0 → `seek` no inimigo mais próximo, +12% velocidade, −20% alcance.
Voz 1 → `orbit` a 210px, +25% alcance, −15% velocidade.

**Ativas (escolhe 1)**
- **Interject** — `raio` (raio 8, speed 540, ms 900). Projétil, dmg 12. Troca a voz.
- **Talk Over** — `burst` (raio 85, delay 0). Área, dmg 15 + slow 30% por 1,2s. Troca a voz.

**Passivas (escolhe 1)**
- **Last Word** — +22% de dano por 1,5s depois de cada troca de voz.
- **Deadlock** — −20% de dano recebido enquanto a voz não trocar há 4s. Recompensa não castar.

**Ult · Settle It** — `dash` (speed 820, ms 500) · carga **`casts` ⚡** (limiar 6) · alcance
120–260. As duas vozes agem ao mesmo tempo: investida com janela de contato declarada
(dmg 16, knockback 480, re-hit 260ms) e a voz não troca no fim.

> **Nota de arnês.** Zero custo: `raio`, `burst` e `dash` são todos avaliáveis. A alternância
> vive em `memory` e no closure `move`, que o bot não lê — e não precisa ler, porque o efeito
> aparece na geometria que ele já mede.

---

## 4 · ESCROW

> **Semente ER: Isol.** O dano que você planta agora e cobra depois. ER faz isso com minas;
> aqui é uma máquina que trata consequência como contrato.

**No casulo:** uma máquina que não causa dano — ela o **agenda**.

**Sinopse.** Nada que Escrow faz acontece quando acontece. Cada habilidade é uma obrigação com
data marcada, e você tem tempo de sobra para sair do caminho — se souber que ela existe. É o
personagem mais telegrafado do roster e o mais punitivo contra quem não presta atenção. Ela
também não persegue ninguém: posiciona-se no ponto médio entre os dois inimigos, porque uma
obrigação que vence no lugar certo não precisa de mira.

**Como você reconhece:** não corre atrás de nada. Fica entre vocês dois e espera.

| | |
|---|---|
| HP · raio · massa | 140 · 19 · 1.9 |
| Vel. máx · esterço · drag | 145 · 1.4 · 0.28 |
| Ataque básico | `projectile` · cd 1000 · dmg 10 · alcance 230 · speed 340 |

**Lei de movimento.** `seek` no ponto médio entre os inimigos vivos. Com um só inimigo vivo,
`hold` a 200px dele.

**Ativas (escolhe 1)**
- **Maturity** — `burst` (raio 95, delay 1100). Vórtice de `pull 0`: dmg 26 quando vence.
  Dano alto, aviso longo.
- **Lien** — `burst` (raio 70, delay 700). Sem dano: aplica `vuln` 30% por 3s na área.

**Passivas (escolhe 1)**
- **Compound** — obrigações pendentes ganham +2 de dano a cada 300ms de espera.
- **Collateral** — −22% de dano recebido enquanto houver qualquer obrigação pendente.

**Ult · Foreclosure** — `burst` (raio 170, delay 1800) · carga **`time` ⏱** (limiar 22000) ·
alcance 90–300. A obrigação maior: dmg 40 e knockback 420 quando vence. 1,8s é tempo de
sobra para sair — e é exatamente esse o desenho.

> **Nota de arnês.** `delayMs` grande é o parâmetro que o estimador de `pAcerto` já consome
> (`sigma` cresce com `tImpacto`), então o bot naturalmente subvaloriza Escrow contra alvos
> rápidos. Isso é **correto**, não viés: é o mesmo desconto que um humano aplicaria.

---

## 5 · WARD

> **Semente ER: Sissela.** A criança e a coisa que anda com ela. ER separa as duas em corpo e
> boneco; aqui a criança é o ocupante e a coisa é o que está enrolado no casulo.

**No casulo:** algo pequeno e assustado. Ao redor do casulo, algo que não é.

**Sinopse.** O ocupante de Ward não luta e não tem como lutar. O que luta é o que veio junto —
e ele não ataca, ele **interpõe**. Ward passa a rodada inteira se colocando entre o inimigo
mais próximo e seu aliado, e a coisa enrolada no casulo resolve qualquer um que insista. O
casulo é grande e o ocupante é minúsculo, o que faz de Ward a silhueta mais estranha do
roster: um alvo enorme com quase nada dentro.

**Como você reconhece:** nunca vai até você. Sempre se coloca no meio do caminho.

| | |
|---|---|
| HP · raio · massa | 105 · 22 · 2.4 |
| Vel. máx · esterço · drag | 130 · 1.6 · 0.32 |
| Ataque básico | `melee` · cd 850 · dmg 13 · alcance 22 · knockback 380 |

**Lei de movimento.** `seek` no ponto entre o aliado vivo e o inimigo mais próximo dele. Sem
aliado vivo, `seek` no inimigo mais próximo.

**Ativas (escolhe 1)**
- **Overhang** — `dash` (speed 760, ms 400). A coisa se estica. Janela de contato: dmg 10,
  knockback 600, re-hit 300ms. Empurra muito, machuca pouco — Pilar 3 como habilidade.
- **Cradle** — `burst` (raio 100, delay 0). Empurrão radial: dmg 8, knockback 520 para fora.

**Passivas (escolhe 1)**
- **Shell Game** — o primeiro dano recebido a cada 5s é anulado.
- **Tantrum** — +40% de knockback causado abaixo de metade da vida.

**Ult · Don't** — `burst` (raio 200, delay 400) · carga **`damageTaken` 🩸** (limiar 95) ·
alcance 0–160. Onda para fora: dmg 20 e knockback 900. A maior negação de posição do jogo.

---

## 6 · REFRAIN

> **Semente ER: Hart.** O suporte cuja presença é o efeito. ER faz isso com voz; aqui é um som
> que só existe entre duas coisas, e que some quando uma delas some.

**No casulo:** uma frase repetida. Não há ocupante — há uma repetição.

**Sinopse.** Refrain é o único personagem cuja lei de movimento **não menciona o time
inimigo**. Ela orbita o aliado, não o alvo, e tudo que ela faz de bom acontece em função dessa
distância. Sozinha ela é fraca e sabe disso: se o aliado cai, a órbita não tem centro e
Refrain vira um personagem médio até o fim da rodada. É a peça que torna o 2v2 estrutural em
vez de acidental.

**Como você reconhece:** ela persegue seu próprio aliado. Nunca você.

| | |
|---|---|
| HP · raio · massa | 145 · 19 · 1.6 |
| Vel. máx · esterço · drag | 160 · 2.2 · 0.25 |
| Ataque básico | `projectile` · cd 620 · dmg 7 · alcance 180 · speed 400 |

**Lei de movimento.** `orbit` no aliado vivo a 110px. Sem aliado vivo, `orbit` no inimigo mais
próximo a 200px.

**Ativas (escolhe 1)**
- **Unison** — `burst` (raio 90, delay 0). dmg 16 + slow 35% por 1,5s.
- **Descant** — `raio` (raio 8, speed 560, ms 900). Projétil perfurante, dmg 13.

**Passivas (escolhe 1)**
- **Sostenuto** — aliado a menos de 120px recebe 15% menos dano.
- **Harmony** — ganha `amp` 20% enquanto estiver a menos de 120px do aliado.

**Ult · Hold** — `utilidade` · carga **`casts` ⚡** (limiar 5) · alcance 0–200. Escuda o aliado
por 3s e limpa efeitos negativos dele. Zero dano.

> **Nota de arnês.** Segundo e último `utilidade` do roster, e por isso está no **ult**:
> buffar aliado é exatamente o que o estimador de `VE` não sabe pontuar. As duas ativas miram
> inimigo de propósito — a regra de orçamento funcionando como desenhada.

---

## 7 · MIRTH

> **Semente ER: Jackie.** O que gosta disso. ER dá a ela um machado e sede de sangue; aqui a
> ferramenta desapareceu e a alegria ficou.

**No casulo:** uma pessoa se divertindo muito mais do que deveria.

**Sinopse.** Mirth não vai no inimigo mais próximo — vai no **mais fraco**, sempre, e atravessa
a arena inteira para isso se precisar. Os golpes dela são rápidos e pequenos, e ficam maiores
enquanto ela não parar de acertar; interromper esse ritmo é a única defesa que existe contra
ela. É o personagem mais simples de entender do roster e o mais desconfortável de encarar,
porque a decisão dele já foi tomada e é sobre você.

**Como você reconhece:** ignora quem está perto e vai direto em quem está ferido.

| | |
|---|---|
| HP · raio · massa | 115 · 14 · 0.85 |
| Vel. máx · esterço · drag | 245 · 3.0 · 0.20 |
| Ataque básico | `melee` · cd 480 · dmg 7 · alcance 14 · knockback 180 |

**Lei de movimento.** `seek` no `weakestEnemy`, não no mais próximo. Sem inimigo ferido,
`seek` no mais próximo.

**Ativas (escolhe 1)**
- **Giggle** — `dash` (speed 700, ms 320). Investida curta e rápida. Janela de contato: dmg 9,
  knockback 120, re-hit 200ms. Knockback baixo de propósito: ela quer ficar perto.
- **Encore** — `raio` (raio 7, speed 600, ms 800). dmg 12, e cura 5 se acertar.

**Passivas (escolhe 1)**
- **Momentum** — cada básico acertado dentro de 1,5s do anterior acumula +8% de dano, até 5
  pilhas. Zera se ela errar o ritmo.
- **Delight** — cura 2 por básico acertado enquanto estiver abaixo de metade da vida.

**Ult · The Punchline** — `burst` (raio 140, delay 300) · carga **`kills` ☠** (limiar 1) ·
alcance 60–220. Dano escala com a vida que falta no alvo: 14 base, até 38 contra alvo quase
morto.

> **Nota de RF-18.** Limiar `1` numa regra `kills` e limiar `22000` numa regra `time` no mesmo
> campo numérico é exatamente a dívida que RF-18 descreve. Com 8 personagens ela deixa de ser
> teórica.

---

## 8 · CAROM

> **Semente ER: Silvia.** A identidade que é puro deslocamento. ER dá a ela uma moto; aqui não
> há veículo — só um corpo que não sabe parar.

**No casulo:** um ricochete. Enquanto está parado, não existe.

**Sinopse.** Carom não navega a arena, ela **quica** nela. O esterço é terrível e o drag é
quase zero, então ela mantém quase toda a velocidade que ganha e vira muito mal — as paredes
não são o cenário dela, são o sistema de movimento. Todo o dano dela escala com a própria
velocidade, o que a torna o único personagem do jogo que fica mais forte por ter sido
empurrada. É o Pilar 3 lido ao contrário.

**Como você reconhece:** trajetórias retas e longas, curvas amplas, e um ângulo novo toda vez
que encosta numa parede.

| | |
|---|---|
| HP · raio · massa | 85 · 11 · 0.5 |
| Vel. máx · esterço · drag | 300 · 0.6 · 0.05 |
| Restituição | **restBall 0.95 · restWall 0.98** (padrão: 0.65 / 0.72) |
| Ataque básico | `melee` · cd 700 · dmg 7 · alcance 12 |

**Lei de movimento.** `seek` no inimigo mais próximo com multiplicador 0.35. O esterço baixo e
o drag mínimo fazem a intenção quase não vencer a inércia — ela tenta ir, e a física decide.

**Ativas (escolhe 1)**
- **Snap** — `dash` (speed 1000, ms 380). Janela de contato: dmg 12, knockback 400,
  re-hit 240ms.
- **Bank** — `reposicao` (speed 1100). Redirecionamento duro sem perda de velocidade. Zero
  dano no cast.

**Passivas (escolhe 1)**
- **Spin** — dano causado escala com a velocidade atual: ×1.0 parada, até ×1.5 no máximo.
- **English** — +8% de velocidade por ricochete em parede, acumulando até +32%, decaindo em 2s.

**Ult · Break** — `dash` (speed 1150, ms 700) · carga **`damageDealt` 💥** (limiar 120) ·
alcance 150–340. Janela longa: dmg 15, knockback 700, re-hit 220ms.

> **Nota de design.** Carom é o personagem que torna **Borracha** — o item medido como o mais
> fraco do catálogo — uma identidade em vez de uma estatística. Se a trilha física estiver
> viva em algum lugar do roster, é aqui, e o Risco #1 tem nela seu detector mais sensível.

---

## Ledger de conformidade

| Verificação | Resultado |
|---|---|
| Novos `AimSpec.kind` exigidos | **0** — nenhum estimador novo, nenhum bump de `BOT_VERSION`, nenhuma matriz invalidada |
| Slots `utilidade` | **2 de 8** (Cairn, Refrain) — ambos em ult, nenhum em ativa ✅ |
| Cobertura de `ChargeRule` | as cinco: `damageTaken` ×2 · `damageDealt` ×2 · `casts` ×2 · `time` ×1 · `kills` ×1 |
| Mistura de ocupantes (conceito #6) | 2 pessoas · 2 criaturas/construtos · 1 máquina · 3 abstrações |
| Silhuetas sem arma | 8 de 8 — dano só via `contactWindows` declarada ou projétil |
| Novos primitivos de motor | **0** — zonas seguem `wall`/`vortex`, efeitos seguem `slow`/`dot`/`amp`/`vuln` |
| Leis de movimento distintas | 8 de 8 — nenhuma repetida |

**Zonas com `delay`** são implementadas como `vortex` de `pull 0` e `burstDmg > 0`, que é
exatamente o que a Convergence de Vex já faz hoje. Nenhum tipo de zona novo é necessário.

---

## O que este documento não decide

| Aberto | Onde fecha |
|---|---|
| Todos os números | Fase 5, por medição. Portão: os 8 dentro de 45–55% |
| Nomes em inglês de habilidades já implementadas (Impacto Sísmico, Tremor, Muralha…) | Backlog de tradução, decisão de conceito #15 |
| Se Cairn substitui Golem como `name` | Ripple documental — recusável |
| Arte de retrato dos 8 | Fase 6 |
| RF-18 (unidade implícita do limiar de ult) | **Antes do 3º personagem existir** — este roster torna a dívida concreta |
