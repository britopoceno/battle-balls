# Battle Balls — Arquitetura da camada de stats, contato e RNG

> Resolve a **dívida de arquitetura que bloqueia a Fase 3** (`docs/prd.md` §4: C2 e C3) e
> executa o trabalho de arquitetura gerado pelas decisões **D-04, D-07 e D-08** (`docs/prd.md` §5).
> Não reabre decisão de produto. Onde discordo, a discordância está isolada na §8 — o usuário decide.
> **Este documento projeta. Não implementa.** Nenhuma linha de `src/` foi alterada ao escrevê-lo.
> Data: 2026-07-28 · Autor: @architect (Aria) · Baseline medido nesta sessão, reproduzido em §6.0.

---

## 0. O que este documento fecha

| Problema | Onde está resolvido | Estado |
|---|---|---|
| C2 — Borracha (+elasticidade) sem ponto de aplicação | §2 | Resolvido: `restBall`/`restWall` viram stat por corpo |
| C2 — Relicário (−cooldown) sem ponto de aplicação | §3 | Resolvido: stat `cdSpeed`, com dois pisos |
| C2 — Luneta (+alcance) parcial | §1.6 | **Mantido parcial por D-03.** Fronteira documentada, não estendida |
| C3 — `mods` sobrescrito por atribuição absoluta | §1 | Resolvido: `base` / `bonusPassive` / `bonusItem` / `stat` derivado |
| D-04 — tetos explícitos por campo | §1.4 | 15 campos com número escrito |
| D-07 — janela de contato como campo do personagem | §4 | `CharDef.contactWindows` + auditoria em 3 camadas |
| D-08 — stream de PRNG do bot | §5 | `deriveSeed` + `WorldView` sem `rng` (invariante de tipo) |
| Ordem de migração com `sim:check` verde | §6 | 8 passos, 7 deles com hash **idêntico** — provado numericamente |
| Riscos da proposta | §7 | Custo a 60Hz, 6 vetores de não-determinismo, 1 bug latente achado |

**O que NÃO está aqui, deliberadamente:** preço e quantidade de itens (D-09, tuning da Fase 3);
ajuste de HP/dano para a mediana-alvo (D-05, decisão de produto medida na Fase 3); regra de empate
(D-02, já fechada pelo PM); redação da loja e UI.

---

## 1. Modelo de stats em camadas

### 1.1 O problema em uma frase

Hoje `Ball` tem **duas categorias de atributo que não conversam**: campos diretos
(`mass`, `drag`, `maxHp`, `radius`, `maxSpeed`, `steer` — lidos crus pela física) e `Ball.mods`
(`{dmg, atkSpeed, range, speed, knockbackResist}` — multiplicadores lidos pelo combate).
Os campos diretos ninguém modifica; `mods` é modificado por **atribuição absoluta** —
`vex.ts:97` escreve `self.mods.speed = ...` a cada tick, `golem.ts:95` escreve
`self.mods.knockbackResist = 0.6` no `init`. O último a escrever ganha. Com itens, o último a
escrever é a passiva, 60 vezes por segundo, e a compra do jogador some.

Não dá para consertar só `mods`: metade da loja (Chumbo, Lixa, Couraça) aponta para os campos
diretos, que hoje **não têm camada de modificação nenhuma**. Se `mods` virar acumulador e os
campos diretos ficarem como estão, três dos oito itens continuam sem regra e a fórmula de D-04
vale para metade da loja. Por isso a proposta unifica as duas categorias num só bloco.

### 1.2 As cinco camadas

```
1. base            valor do CharDef, congelado na criação da bola        → StatBlock (absoluto)
2. bônus de passiva aditivo, adimensional, zerado e reescrito por tick    → BonusBlock (fração)
3. bônus de item   aditivo, adimensional, CONGELADO durante a rodada      → BonusBlock (fração)
   ── D-04 opera aqui: stat = clamp( base × (1 + clamp(Σ2 + Σ3)) ) ──
4. efeito temporário  multiplicativo, aplicado NO PONTO DE USO            → slow / amp / vuln
5. hook de evento     multiplicativo, só em dealDamage                    → onDamageDealt/Taken
```

**Fórmula canônica (D-04, literal):**

```
Σ[k]     = Σ bônus_passiva[k] + Σ bônus_item[k]
Σef[k]   = clamp( Σ[k], ΣMIN[k], ΣMAX[k] )              ← teto de balanceamento (§1.4)
stat[k]  = clamp( base[k] × (1 + Σef[k]), ABS_MIN[k], ABS_MAX[k] )   ← clamp de motor (§1.4)
```

E no ponto de uso, camada 4:

| Campo | Como o efeito temporário entra |
|---|---|
| `maxSpeed` | `stat.maxSpeed × (1 − min(0.85, Σslow))` — em `effectiveSpeed` |
| `dmg` | `stat.dmg × (1 + Σamp)` — em `dealDamage`, no atacante |
| `dmgTaken` | `stat.dmgTaken × (1 + Σvuln)` — em `dealDamage`, no alvo |
| todos os demais | `× 1` — nenhum efeito temporário os toca hoje |

**Por que a camada 4 fica FORA da soma de D-04, e não como um terceiro somando.**
É a decisão não óbvia desta seção. A alternativa (`Σ = Σpassiva + Σitem + Σefeito`) é mais
uniforme e faria os tetos por campo valerem também para lentidão e amplificação — vantagem real.
Recusada por dois motivos:

1. **Efeito temporário é a camada de interação entre jogadores.** Se `slow` somasse no mesmo
   orçamento de `maxSpeed`, uma Turbina comprada **cancelaria** parcialmente o Tremor do inimigo.
   Isso transforma um item de mobilidade em item de resistência a controle — mudança de design que
   ninguém decidiu, entrando pela porta dos fundos de uma refatoração.
2. **Quebra a paridade numérica da migração.** Hoje `250 × 1.25 × (1 − 0.45) = 171,9`. Somando na
   mesma bolsa daria `250 × (1 + 0.25 − 0.45) = 200`. Hash diferente, comportamento diferente, e a
   migração deixaria de ser verificável (§6).

A alternativa fica registrada: se a Fase 3 mostrar que controle está forte demais, mover `slow`
para dentro da soma é uma mudança de duas linhas — e aí é decisão de produto, tomada com medição.

### 1.3 Estrutura de dados

```ts
// sim/stats.ts — arquivo novo. Ponto único de verdade dos stats e dos tetos.

export const STAT_KEYS = [
  // estruturais — recomputados só em evento explícito (§1.5)
  'maxHp', 'radius',
  // contínuos — recomputados uma vez por bola por tick
  'mass', 'maxSpeed', 'steer', 'drag', 'restBall', 'restWall',
  'dmg', 'dmgTaken', 'atkSpeed', 'cdSpeed', 'range', 'knockbackTaken',
] as const

export type StatKey  = typeof STAT_KEYS[number]
/** valores absolutos, na unidade do campo */
export type StatBlock  = Record<StatKey, number>
/** frações aditivas · 0 é neutro · +0.25 = "+25%" */
export type BonusBlock = Record<StatKey, number>
```

```ts
// sim/types.ts — Ball, depois da migração

export interface Ball {
  id: number; charId: string; team: Team
  x: number; y: number; vx: number; vy: number; ax: number; ay: number
  facing: number

  /** camada 1 — congelado na criação, vindo do CharDef */
  base: StatBlock
  /** camada 3 — congelado durante a rodada. A loja é entre rodadas (invariante §1.7) */
  bonusItem: BonusBlock
  /** camada 2 — zerado e reescrito a cada tick. Nunca sobrescreve item: acumula */
  bonusPassive: BonusBlock
  /** DERIVADO. Só recomputeStats escreve aqui. Ler sempre daqui, nunca de base */
  stat: Readonly<StatBlock>

  hp: number                 // estado, não stat
  alive: boolean
  effects: Effect[]          // camada 4
  atkReadyAt: number; abilityReadyAt: number
  ultCharge: number; ultThreshold: number
  abilityIndex: 0 | 1; passiveIndex: 0 | 1
  contact: ContactState | null   // §4
  memory: Record<string, number> // rascunho livre · o MOTOR nunca lê daqui (§4.1)
}
```

**Campos que DESAPARECEM de `Ball`:** `mods`, `radius`, `mass`, `maxSpeed`, `steer`, `drag`,
`maxHp`. Todos passam a ser `b.stat.*`. Isso é deliberado: manter os campos antigos como espelho
somente-leitura seria mais barato de migrar, mas recria exatamente o pecado de C3 — duas fontes de
verdade para o mesmo número. Removendo, o `tsc` aponta todos os ~20 pontos de leitura, inclusive em
`client/render.ts` e `tools/inspect.ts`, e nenhum passa despercebido.

```ts
// sim/types.ts — CharDef e PassiveDef, depois da migração

export interface CharDef {
  id: string; name: string; color: string
  // camada 1 — os mesmos números de hoje, agora explicitamente "base"
  maxHp: number; radius: number; mass: number
  maxSpeed: number; steer: number; drag: number
  /** restituição própria do corpo. default 0.65 / 0.72 — ver §2 */
  restBall?: number
  restWall?: number

  atk: AtkDef
  move: (ctx: SimCtx, self: Ball) => void
  abilities: [AbilityDef, AbilityDef]
  passives: [PassiveDef, PassiveDef]
  ult: UltDef
  /** §4 — janelas de dano por contato. Ausente = o personagem nunca causa dano por contato */
  contactWindows?: ContactWindowDef[]
  on?: { tick?; collide?; kill?; death? }
}

export interface PassiveDef {
  id: string; name: string; desc: string
  /** bônus estáticos, sempre ativos. DECLARATIVO: auditável sem executar código */
  bonus?: Partial<BonusBlock>
  /** bônus condicionais. Só pode chamar ctx.addBonus — verificado por fase (§4.3) */
  onTick?: (ctx: SimCtx, self: Ball) => void
  onDamageDealt?: (ctx: SimCtx, self: Ball, target: Ball) => number   // camada 5
  onDamageTaken?: (ctx: SimCtx, self: Ball, source: Ball | null) => number
}
```

**`PassiveDef.init` é removido.** Ele era literalmente o vetor de escrita absoluta que causa C3
(`golem.ts:94-96`). Passiva estática vira `bonus` declarativo; passiva condicional vira `onTick`
chamando `ctx.addBonus`. Não há terceiro caso hoje, e se aparecer, ele deve nascer como camada
nomeada, não como escrita livre.

```ts
// sim/types.ts — adições ao SimCtx
export interface SimCtx {
  // ... tudo que já existe ...
  /** soma no bonusPassive da bola. Válido só na fase 'tick' */
  addBonus: (self: Ball, key: StatKey, amount: number) => void
  /** abre a janela de contato declarada em CharDef.contactWindows. Válido nas fases 'cast' e 'tick' */
  openContactWindow: (self: Ball, source: string) => void
}
```

```ts
// sim/world.ts — entrada de itens. sim/ NUNCA conhece "item", "preço" ou "loja"
export interface PickSetup {
  charId: string
  abilityIndex: 0 | 1
  passiveIndex: 0 | 1
  /** bônus JÁ AGREGADOS dos itens comprados, em ordem canônica (§7.2.1) */
  itemBonus?: Partial<BonusBlock>
}
```

Esta é a fronteira que preserva a pureza de `sim/`: o catálogo de itens vive em `src/shop/`
(ou `chars/items.ts`), a agregação acontece lá, e a simulação recebe um bloco de números — exatamente
o mesmo padrão do registro de personagens injetado em `createWorld`. `sim/` não ganha
uma dependência nova nem um conceito de economia.

### 1.4 Tetos — os números escritos que D-04 exige

Dois níveis, com papéis diferentes e que não devem ser confundidos:

- **ΣMIN / ΣMAX** — teto de **balanceamento**. É a regra de jogo de D-04. Limita quanto a soma de
  bônus pode valer. Mexer nele é decisão de produto.
- **ABS_MIN / ABS_MAX** — clamp de **motor**. Rede de segurança contra valores que quebram a
  simulação (tunneling, knockback que não decai, imunidade a empurrão). Mexer nele é decisão de
  arquitetura e precisa de argumento numérico.

Bases atuais entre parênteses: (Golem / Vex).

| Stat | Classe | Base | ΣMIN | ΣMAX | Clamp absoluto | Por que este número |
|---|---|---|---|---|---|---|
| `maxHp` | estrutural | 190 / 100 | −0.50 | **+1.00** | ≥ 20 | ×2 no Vex = 200 HP, encostando no Golem (190). Combinado com o teto de `dmg`, a duração da rodada varia no máximo 4× — grande, mas dentro da faixa que D-05 vai medir |
| `radius` | estrutural | 24 / 15 | −0.20 | **+0.30** | [8, 40] | Raio entra na colisão **e** no alcance superfície-a-superfície. Golem a 31px: dois Golems ficam a 62px de centro, e o alcance dele é 18 — continua alcançável. Acima de 40px duas bolas ocupam 1/6 da largura da arena |
| `mass` | contínuo | 3.2 / 0.9 | −0.50 | **+1.50** | ≥ 0.20 | Hoje o Vex absorve 78% do deslocamento numa colisão com Golem (`invA/invSum`). No extremo (Golem 8.0 vs Vex 0.45) sobe para **94.7%** — o ponto em que "empurrar o Golem" deixa de existir como jogada e o Pilar 3 vira decorativo |
| `maxSpeed` | contínuo | 105 / 250 | −0.85 | **+0.60** | [20, **420**] | 420 px/s = 7,0 px por tick, menos da metade do menor raio (15). Teto derivado do integrador, não de gosto. Vex 250×1.6 = 400 ✓. ΣMIN = −0.85 alinha com o `MAX_SLOW` atual, absorvendo aquela constante ad-hoc |
| `steer` | contínuo | 1.3 / 3.2 | −0.40 | **+0.60** | [0.2, 6.0] | Estabilidade do Euler explícito exige `steer × dt < 1` ⇒ `steer < 60` — folgadíssimo. O limite real é de design: acima de ~6 a bola vira instantânea e a inércia, que é o jogo, desaparece |
| `drag` | contínuo | 0.30 / 0.22 | −0.60 | **+1.20** | [0.05, **0.60**] | `drag` é fração retida por segundo; **mais drag = menos atrito**. A 0.60, após 3s ainda restam 21% da velocidade — no limite do "knockback decai em 1-2s" que o `integrate` promete. Golem 0.30×2.2 = 0.66 → **o clamp morde**, de propósito |
| `restBall` | contínuo | 0.65 | −0.60 | **+0.45** | [0.05, **0.92**] | 0.65×1.45 = 0.94 → clamp morde em 0.92. Acima disso a colisão devolve quase toda a energia e, somada a `drag` alto e knockback repetido, a arena vira pinball sem estado de repouso |
| `restWall` | contínuo | 0.72 | −0.60 | **+0.45** | [0.05, **0.92**] | Mesma escala. Aqui o clamp morde já em +0.28 — intencional: parede devolve mais que bola, então o orçamento útil é menor |
| `dmg` | contínuo | 1.00 | −0.75 | **+1.00** | — | ×2 dobra o DPS. Com a mediana atual de 13,8s isso daria ~7s; mesmo depois do ajuste de HP da Fase 3, ×2 é o ponto onde o piso de 25s de D-05 é violado sozinho por itens |
| `dmgTaken` | contínuo | 1.00 | −0.60 | **+1.00** | [0.30, 2.50] | Campo novo, hoje sempre 1.0. Existe para a Couraça poder virar armadura sem inventar camada; e o piso 0.30 impede build imortal |
| `atkSpeed` | contínuo | 1.00 | −0.60 | **+1.00** | cd efetivo ≥ **120 ms** | ×2: Vex 520→260ms = 15,6 ticks; Golem 1100→550ms. O piso de 120ms (≈7 ticks) só morde para um personagem futuro de cadência alta, e existe para que "ataque por tick" nunca seja alcançável |
| `cdSpeed` | contínuo | 1.00 | −0.50 | **+1.00** | cd efetivo ≥ **500 ms** | Ver §3. O piso tem origem concreta: a maior janela de dano por contato declarada hoje é 450ms (dash do Golem) — o piso precisa ficar ACIMA dela, não apenas perto. *Corrigido de 400 para 500 (QA-001, gate de `debt.4`): 400 < 450 não entregava a garantia que este texto já alegava.* |
| `range` | contínuo | 1.00 | −0.50 | **+0.60** | alcance ef. ≤ **324 px** | 324 = 60% da menor dimensão da arena (540). Enquanto o alcance não cobre a arena, reposicionar continua negando DPS — que é o Pilar 3. Vex 200×1.6 = 320 ✓, encostando |
| `knockbackTaken` | contínuo | 1.00 | −0.75 | **+1.00** | [**0.25**, 2.00] | Piso 0.25 impede imunidade a empurrão. A Âncora do Golem sozinha (−0.60) já consome 80% do orçamento de redução — sinal de que a passiva é forte, e agora isso é visível num número |

**Nota sobre os tetos que são chute calibrado.** Os de origem física (`maxSpeed`, `radius`, `drag`,
`restBall/Wall`, pisos de cooldown) têm argumento numérico e eu os defendo. Os de balanceamento
(`dmg`, `maxHp`, `range`, `mass`) são raciocínio — e a decisão #13 do design manda **medir**, não
raciocinar. Por isso a §7.3 recomenda instrumentar quantas vezes cada clamp morde durante o arnês da
Fase 2: teto que nunca morde é rede de segurança barata; teto que morde toda hora virou regra de jogo
por acidente e volta como decisão de produto.

### 1.5 Ponto de recálculo no tick

Um único ponto por bola por tick, e ele fica **depois das passivas e antes do movimento**:

```
step(world, commands):
  world.events = []
  ctx = makeCtx(world)

  phase = 'cast'
    para cada comando agendado para este tick → castCommand
        ↑ lê stat do tick ANTERIOR (defasagem declarada, ver abaixo)

  para cada bola viva:
      phase = 'effect';  tickEffects(b)                  // dot, expiração
      phase = 'tick'
        zeroBonus(b.bonusPassive)                        // reuso do objeto, sem alocar
        somar passives[i].bonus (declarativo)
        passives[i].onTick(ctx, b)   → ctx.addBonus
        char.on.tick(ctx, b)         → ctx.addBonus
      recomputeStats(b)                    ◄── ÚNICO PONTO DE RECÁLCULO
      char.move(ctx, b)                                  // já lê o stat novo
      carga de ult por tempo

  phase = 'attack';      para cada bola → autoAttack     // lê stat.range, stat.atkSpeed
  phase = 'zone';        tickZones
  phase = 'projectile';  tickProjectiles

  integrate(world)                                       // lê stat.drag
  collideZoneWalls(world)                                // lê stat.restWall
  collideBalls(world, (a, b) => {
      phase = 'contact'; resolveContactWindow(a, b)      // §4 — o motor causa o dano
      phase = 'collide'; char.on.collide(ctx, a, b)      // dano AQUI é violação do Pilar 3
  })                                                     // lê stat.mass, stat.radius, stat.restBall
  collideWalls(world)                                    // lê stat.restWall

  morte súbita · checkEnd · tick++ · time
```

**Defasagem de um tick, declarada.** `castCommand` roda antes do laço de bolas e lê o `stat`
computado no tick anterior (16,7 ms de atraso). É determinístico e irrelevante em jogo — e a
alternativa (recomputar duas vezes por tick, ou mover o processamento de comandos para depois do
laço) custa o dobro de CPU ou reordena o `step`, mudando o comportamento medido sem ganho. Fica
escrito para ninguém "consertar" isso depois sem saber que era intencional.

**Inicialização.** `makeBall` chama `recomputeStats` uma vez, com estruturais e contínuos, antes de
devolver a bola. `stat` nunca é lido não inicializado, nem no tick 0.

### 1.6 O que acontece com `mass`, `drag`, `maxHp` e `radius`

Resposta direta ao ponto do briefing: os quatro **entram no `StatBlock` e param de ser campos
diretos**. Mas dois deles têm regra especial, e essa distinção é a parte que importa.

| Campo | Classe | Recomputado | Regra especial |
|---|---|---|---|
| `mass` | **contínuo** | todo tick | Nenhuma. Massa é lida uma vez por tick pelo resolvedor de colisão; mudá-la entre ticks é seguro. Uma passiva futura tipo "massa dobrada durante o dash" fica possível sem trabalho novo |
| `drag` | **contínuo** | todo tick | Armadilha semântica registrada: o item chama-se **"Lixa (−atrito)"**, mas o bônus é **positivo em `drag`**, porque `drag` é a fração de velocidade *retida* por segundo (`k = pow(drag, dt)` em `physics.ts:17`). Quem escrever o catálogo da loja vai errar o sinal se isso não estiver escrito |
| `maxHp` | **estrutural** | só em `makeBall` e em mudança explícita de `bonusItem` | Quando `stat.maxHp` **cresce**, `hp` ganha o **delta absoluto** (não a proporção). Quando **encolhe**, `hp` é clampado em `min(hp, stat.maxHp)`. Proporcional daria cura grátis; clamp puro no crescimento daria HP máximo inalcançável |
| `radius` | **estrutural** | idem | Raio é o único stat cuja mudança em tempo real pode criar **interpenetração instantânea**: crescer o raio dentro de um tick coloca duas bolas sobrepostas, e o resolvedor de posição as separa com um impulso que não veio de lugar nenhum. Congelar remove a classe inteira de bug |

**Por que `maxHp` é estrutural e não contínuo.** Se uma passiva pudesse oscilar `maxHp` por tick,
a regra do delta produziria cura líquida cada vez que ela liga e desliga (sobe +50, o HP sobe 50;
desce −50, o HP é clampado no topo → o jogador ganhou vida de graça). Congelando, essa passiva é
impossível por construção, e não é preciso escrever regra defensiva nenhuma. O custo: uma passiva
"+30% de HP enquanto a ult estiver carregada" fica proibida. Aceito — é design que ninguém pediu, e
a alavanca alternativa (`dmgTaken`) faz a mesma coisa sem o problema.

**Invariante que sustenta "estrutural":** `bonusItem` é **imutável durante a rodada**. É verdade por
design (a loja é entre rodadas, `DESIGN.md` §4) e a bola é recriada a cada rodada. Isso também
permite pré-somar `bonusItem` uma vez em `makeBall`, tirando uma soma do caminho quente.

### 1.7 Reescrita dos multiplicadores de redução — como D-04 continua literal

Dois campos de hoje têm base neutra **zero**, e `base × (1 + Σ)` é indefinido para eles:
`knockbackResist` (0 = neutro) e o "−cooldown" do Relicário (que nem existe). Em vez de abrir
exceção na fórmula aprovada, eu **remodelo os campos** para que a base neutra seja 1.0:

| Antes | Depois | Conversão | Preserva o número? |
|---|---|---|---|
| `mods.knockbackResist` = 0.6 (fração ignorada) | `stat.knockbackTaken` = 0.4 (multiplicador da força) | `taken = 1 − resist` | **Sim, bit a bit.** `1 − 0.6 === 0.4` é `true` em binário64 — verificado nesta sessão |
| `mods.speed` = 1.25 (multiplicador sobre `maxSpeed`) | bônus de +0.25 em `stat.maxSpeed` | um campo só, em vez de dois | **Sim.** `250 × 1.25 === 250 × (1 + 0.25)` — verificado |
| (não existe) "−20% de cooldown" | `stat.cdSpeed` = 1.25 | `cd_ef = cd / cdSpeed` | — |

Consequência que precisa aparecer na UI da loja e está sinalizada em §8/R-01: um Relicário
apresentado como "−20% de cooldown" é internamente "+0.25 em `cdSpeed`". Dois Relicários somam
para +0.50 → `cd × 1/1.5` = −33%, não −40%. Retorno decrescente natural, exatamente o efeito que
D-04 quer, e sem exceção na fórmula.

### 1.8 Fronteira do alcance (D-03) — documentada, não estendida

`stat.range` multiplica **apenas** `def.atk.range`, em `world.ts:344`. `AbilityDef.minRange`,
`AbilityDef.maxRange`, `UltDef.minRange` e `UltDef.maxRange` **não recebem modificador**, por D-03.
Registro dois pontos, sem contrariar a decisão:

1. **Onde a extensão entraria, se a Fase 5 a aprovar:** uma única linha em `aimFrom`
   (`world.ts:299-306`), multiplicando `minRange` e `maxRange` antes de interpolar por `mag`. Deixar
   isso escrito evita que a revisão prevista em D-03 vire refatoração.
2. **Por que a fronteira é frágil na prática:** o dano principal do Vex vem da ativa (Lâmina
   Fantasma, 14) e não do básico (6). A Luneta nele é quase inerte. O PM já previu e mitigou por
   preço; a mitigação de arquitetura é a linha acima estar mapeada e testada.

---

## 2. Elasticidade por bola (resolve C2 — Borracha)

### 2.1 De constante de módulo a propriedade de corpo

Hoje: `REST_BALL = 0.65` e `REST_WALL = 0.72` em `physics.ts:4-5`, usados em três lugares
(`collideBalls:59`, `collideWalls:78-88`, `collideZoneWalls:120`).

Depois: dois stats por corpo, `restBall` e `restWall`, com base vinda do `CharDef` e default
`0.65`/`0.72` — as mesmas constantes, mudadas de casa para `sim/stats.ts` como `DEFAULT_STATS`.
Nenhum personagem precisa declará-las; ausência = default. `physics.ts` deixa de ter constante e
passa a ler `a.stat.restBall`, `b.stat.restWall`.

### 2.2 A decisão real: duas bolas, duas elasticidades

Quatro regras possíveis para combinar `e_a` e `e_b`:

| Regra | `e` para (0.65, 0.65) | `e` para (0.94, 0.65) | Efeito no item |
|---|---|---|---|
| **A — máximo** `max(ea, eb)` | 0.65 ✓ preserva | 0.94 | Borracha entrega **100%** do que promete, sempre |
| B — média aritmética `(ea+eb)/2` | 0.65 ✓ preserva | 0.795 | Borracha entrega **50%**; o valor depende da build alheia |
| C — produto `ea·eb` | **0.4225** ✗ quebra | 0.611 | Retorno negativo: comprar elasticidade pode *reduzir* o quique |
| D — média geométrica `√(ea·eb)` | 0.65 ✓ preserva | 0.782 | Como B, entrega ~45%; padrão histórico do Box2D |

**Recomendação: A — máximo.** Três razões, em ordem de peso:

1. **É a única regra em que o item não depende da build do inimigo.** Com B, C ou D, o valor
   entregue pela Borracha é função do que o oponente comprou. Isso é exatamente o que impede o arnês
   da Fase 2 de **atribuir causa** quando a matriz de winrate sai de 45–55% — e atribuição de causa
   é a justificativa declarada de D-04 para preferir aditivo a multiplicativo composto. Escolher
   B/C/D aqui reintroduz, na física, o problema que D-04 acabou de eliminar no combate.
2. **É o único caminho que preserva o baseline bit a bit:** `Math.max(0.65, 0.65) === 0.65`
   (verificado). O passo 5 da migração (§6) sai com hash idêntico, e o golden hash prova isso. Com C
   a restituição cairia de 0.65 para 0.42 e toda a Fase 0 medida seria invalidada de lado.
3. **O risco #1 pede um item físico que se sinta.** Elasticidade é a única propriedade puramente
   física da loja (`docs/prd.md` §4). Diluir o único item distintivo da trilha física pela metade,
   numa loja onde a trilha física já é a suspeita de morrer, é empurrar o risco na direção errada.

**O contra-argumento honesto:** com `max`, a Borracha do inimigo também aumenta o quique dele contra
você — o item é não-negável nos dois sentidos. É neutro em 2v2 simétrico e, mais importante, o efeito
líquido é "mais deslocamento na arena", que é justamente o que a trilha física vende. Se a Fase 2
mostrar o inverso do Risco #1 (trilha física forte demais), a alavanca é trocar `max` por `√(ea·eb)`:
**uma linha em `physics.ts`**, sem tocar em mais nada. Registrado como parâmetro reversível.

### 2.3 Casos de borda decididos

| Caso | Regra | Por quê |
|---|---|---|
| Bola × parede da arena | `b.stat.restWall`, sem mixing | Parede não é corpo, não tem stat |
| Bola × zone-wall (Muralha do Golem) | `b.stat.restWall`, sem mixing | v1. A Muralha **poderia** ter restituição própria (`Zone.restitution`) e virar identidade do Golem — fica registrado como espaço de design não usado, para não ser reinventado do zero |
| Borracha afeta `restBall` só, ou os dois? | **Os dois**, com o mesmo bônus | "Quicar na parede" é a metade legível do efeito; só bola-bola seria invisível em 1v1 disperso. Um item declara `Partial<BonusBlock>`, então 1 item → N campos já é suportado |
| `restWall` estourando o clamp | Clamp em 0.92 morde antes do ΣMAX | Intencional, ver §1.4 |

---

## 3. CDR de habilidade (resolve C2 — Relicário)

### 3.1 Onde entra o multiplicador

Um único ponto, em `castCommand` (`world.ts:316`):

```
antes:  self.abilityReadyAt = world.time + ab.cd
depois: self.abilityReadyAt = world.time + max(MIN_ABILITY_CD_MS, ab.cd / self.stat.cdSpeed)
```

Com `cdSpeed = 1.0` (default), `ab.cd / 1.0 === ab.cd` exatamente — divisão por 1.0 é exata em IEEE
754, verificado. O passo 4 da migração sai com hash idêntico.

### 3.2 Escopo — o que `cdSpeed` NÃO toca

| Recurso | Governado por | Motivo |
|---|---|---|
| Ativa (`AbilityDef.cd`) | **`cdSpeed`** | É o alvo do Relicário |
| Ataque básico (`AtkDef.cd`) | `atkSpeed` (já existe, `world.ts:360`) | Dois campos separados, dois itens separados. Se fossem um só, Lâmina e Relicário competiriam pelo mesmo teto |
| Ult | **nada** | A ult é balanceada por **regra de carga variável por personagem**, que é identidade (decisão #10). CDR sobre ela seria um segundo eixo sobre um recurso que já tem regra própria. O campo `ultChargeRate` fica **nomeado e não implementado**, para o dia em que alguém quiser |

Isto espelha deliberadamente a fronteira de D-03 para `range`: um ponto de aplicação por item.

### 3.3 O que impede o cooldown de chegar a zero — dois mecanismos, ambos necessários

**Mecanismo 1 — teto de balanceamento (D-04).** `ΣMAX[cdSpeed] = +1.00` ⇒ `cdSpeed ≤ 2.0` ⇒ o
cooldown nunca desce abaixo de **50% do base**. Regra de jogo, mexível por decisão de produto.

**Mecanismo 2 — piso absoluto de motor: `MIN_ABILITY_CD_MS = 500`.** Não é redundante com o
mecanismo 1, e a razão é concreta e verificável:

> A maior **janela de dano por contato** declarada no roster é a do dash do Golem: **450 ms**
> (`golem.ts:52`). Se o cooldown efetivo de uma habilidade descesse abaixo da janela que ela abre, o
> jogador poderia recastar antes de a janela anterior fechar, a janela seria reaberta indefinidamente,
> e **o dano por contato viraria permanente** — quebrando D-07 por dentro, sem que nenhum personagem
> tivesse feito nada de errado.
>
> *Nota de correção: a primeira versão deste documento fixava o piso em 400ms — abaixo dos 450ms que
> ele deveria proteger. O gate de `debt.4` (QA-001) achou a inconsistência antes de ela virar teste
> automatizado em `debt.6`, o que a teria validado pelo motivo errado (quem protegeria seria o teto de
> `cdSpeed`, não o piso). Corrigido para 500ms — folga real acima da maior janela conhecida.*

Daí sai uma **invariante testável**, que liga §3 a §4 e é a peça que torna o Pilar 3 realmente
auditável:

```
para todo personagem C, para toda janela W declarada em C.contactWindows:
    cd_efetivo_mínimo(fonte de W)  ≥  W.ms
onde  cd_efetivo_mínimo(a) = max(MIN_ABILITY_CD_MS, a.cd / cdSpeedMax)
```

Estado atual: Golem `sismico` → `max(500, 7000/2) = 3500 ms ≥ 450 ms` ✓ (fator 7,8 de folga).
Os outros cooldowns do roster: `tremor` 4000, `lamina` 3000, `deslize` 2500 — todos folgados.
O teste falha alto no dia em que alguém desenhar uma habilidade de cd 800ms com janela de 500ms.

### 3.4 CDR é amostrado no instante do cast

`abilityReadyAt` é um **instante absoluto**, fixado quando o cast acontece. Consequência: se uma
passiva ligar CDR no meio do cooldown, o cooldown em curso **não encolhe**.

Isso é intencional. A alternativa (guardar `castAt` + `cd` e comparar contra o `stat` corrente)
permitiria CDR dinâmico, mas abriria a porta para o cooldown **encolher retroativamente** e ficar
pronto no mesmo tick em que a passiva liga — exploit clássico de ligar/desligar. Como itens são
comprados entre rodadas e a bola é recriada, a limitação não custa nada hoje. Fica declarada.

---

## 4. Janela de dano por contato declarada (executa D-07)

### 4.1 O campo que substitui `memory.dashAte`

Hoje o dash do Golem se apoia em três coisas soltas: `self.memory.dashAte` escrito no `cast`
(`golem.ts:52`), `self.memory.dashUltimoAcerto` como trava de re-hit, e 10 linhas de `on.collide`
(`golem.ts:134-144`) que chamam `ctx.damage`. Nada disso é legível de fora do arquivo, e é por isso
que o Pilar 3 não era auditável.

```ts
// sim/types.ts
export interface ContactWindowDef {
  /** id da habilidade ou ult que abre esta janela. Auditoria cruza com abilities[].id / ult.id */
  source: string
  /** duração da janela, ms. Invariante: ≤ cd_efetivo_mínimo da fonte (§3.3) */
  ms: number
  dmg: number
  knockback: number
  /** intervalo mínimo entre dois acertos DESTA janela, independentemente do alvo */
  reHitMs: number
  /** efeito adicional, opcional. Roda sob a fase 'contact' */
  onHit?: (ctx: SimCtx, self: Ball, other: Ball) => void
}

/** estado em Ball. Substitui integralmente memory.dashAte / memory.dashUltimoAcerto */
export interface ContactState {
  source: string
  endsAt: number
  lastHitAt: number
}
```

Golem passa a declarar, de forma legível sem abrir `on.collide`:

```ts
contactWindows: [
  { source: 'sismico', ms: 450, dmg: 14, knockback: 520, reHitMs: 250 },
],
```

e o `cast` do Sísmico troca `self.memory.dashAte = ctx.now + 450` por
`ctx.openContactWindow(self, 'sismico')`. O bloco `on.collide` do Golem **é deletado inteiro** — o
motor faz o trabalho, uma vez, para todo o roster.

**Regra derivada, que vale mais que o campo:** `Ball.memory` continua existindo como rascunho livre
do personagem, mas **o motor nunca lê de `memory`**. Qualquer estado que o motor precise interpretar
tem que ser campo tipado. `memory.dashAte` violava isso, e é por isso que a auditoria era impossível.

**Nota de fidelidade:** a trava de re-hit atual é **global por atacante**, não por alvo
(`golem.ts:139` usa um único `dashUltimoAcerto`). Numa janela de 450ms com `reHitMs` 250, o dash
acerta no máximo 2 vezes no total, não 2 por inimigo. `ContactState.lastHitAt` sendo um número único
reproduz isso exatamente — e a semântica fica escrita no campo, em vez de implícita numa variável.

### 4.2 Resolução no motor

Dentro do callback de `collideBalls`, **antes** de `on.collide`, preservando a ordem de pares atual
(`onCollide(a,b)` e depois `onCollide(b,a)` — `physics.ts:65-66`), o que mantém o hash:

```
resolveContactWindow(world, ctx, self, other):
    se self.contact == null                       → retorna
    se now >= self.contact.endsAt                 → self.contact = null; retorna
    se other.team === self.team                   → retorna
    se now - self.contact.lastHitAt < W.reHitMs   → retorna
    self.contact.lastHitAt = now
    phase = 'contact'
    dealDamage(other, W.dmg, self)
    knockback(other, other.x - self.x, other.y - self.y, W.knockback)
    W.onHit?.(ctx, self, other)
```

### 4.3 Como um teste automatizado audita o Pilar 3

Três camadas. Nenhuma sozinha é suficiente, e vale dizer por quê.

**Camada 1 — auditoria estática (barata, incompleta).** Varredura sobre `src/chars/*.ts`: nenhum
bloco `on.collide` pode conter `damage(`. Custa 10 linhas, roda em milissegundos, pega o caso óbvio.
**Não pega** chamada indireta, helper compartilhado, ou dano aplicado via `fx.dot` de duração 1 tick.
Nota: `ctx.apply(fx.slow(...))` em `on.collide` **continua permitido** — o pilar fala de *dano*, e o
exemplo canônico do `DESIGN.md` §5 (`collide: s.apply(e.other, fx.slow(0.3, 2000))`) precisa
continuar válido.

**Camada 2 — auditoria dinâmica por fase (exata, é a que vale).** `World` ganha um campo:

```ts
world.phase: 'cast' | 'tick' | 'effect' | 'attack' | 'zone' | 'projectile' | 'contact' | 'collide'
```

e `dealDamage` verifica, na primeira linha:

```
se world.phase === 'collide'  →  lançar Error(`Pilar 3: dano por contato fora de janela declarada · ${charId}`)
```

Isso é exato para chamada **síncrona** de `dealDamage` durante `phase === 'collide'` — pega chamada
indireta, helper, qualquer caminho de código que passe por `dealDamage` naquele instante, porque
verifica o fato, não a sintaxe. O dano legítimo da janela roda sob `phase = 'contact'` e passa.

*Correção (QA-001, gate de `debt.6`): a formulação original chamava isto de "exato" sem qualificação —
impreciso. Um `on.collide` que aplique um `Effect` de dano (`ctx.apply(fx.dot(...))`) em vez de chamar
`ctx.damage` direto **atravessa** esta camada: o dano só materializa no tick seguinte, sob
`phase === 'effect'`, não `'collide'`. Provado com teste dirigido pelo @qa. Não é regressão desta
story — nenhum personagem do roster faz isso hoje — mas é uma lacuna real de cobertura, não coberta
por nenhuma das 3 camadas. Registrada como limitação conhecida (ver também QA-002 do mesmo gate: uma
janela `openContactWindow`'d com `source` que não corresponde a nenhum item de `contactWindows`
também falha em silêncio). Fechar as duas é trabalho de telemetria/auditoria de roster em escala —
Fase 2 ou Fase 6, não escopo de `debt.6`.*

Custo: uma comparação de string por chamada de `dealDamage` — que roda dezenas de vezes por rodada,
não por tick. **Recomendo deixar sempre ligada, inclusive em produção.** Um modo de teste diferente
do modo de produção é fonte de divergência de determinismo, que é precisamente o que não podemos ter
na Fase 4.

Armadilha de implementação registrada: a fase precisa ser salva e restaurada, não empilhada com
`try/finally`, porque há reentrância real (dano da janela → morte → `on.kill` → mais dano):
`const prev = world.phase; ...; world.phase = prev`.

**Camada 3 — auditoria de roster (o artefato que D-07 pede).** Um teste que, para cada personagem:

| # | Verificação |
|---|---|
| A1 | Todo `contactWindows[i].source` corresponde a um `abilities[].id` ou a `ult.id` existente |
| A2 | `contactWindows[i].ms ≤ cd_efetivo_mínimo(source)` — a invariante de §3.3 |
| A3 | `contactWindows[i].ms ≤ MIN_ABILITY_CD_MS` não é exigido, mas `≤` o cd real, sim |
| A4 | Nenhum personagem sem `contactWindows` chama `openContactWindow` (nada a abrir) |
| A5 | Rodar N rodadas de cada confronto com a camada 2 ligada → **zero violações de fase** |

E o produto disso: **`npm run sim:check` passa a imprimir a tabela de janelas declaradas do roster.**

```
janelas de dano por contato (Pilar 3)
  golem  sismico   450ms  dmg 14  kb 520  re-hit 250ms   cd_min 3500ms  ✓
  vex    —         (nenhuma)                                             ✓
```

Este é o artefato de auditoria humana que D-07 pede quando diz "dá para verificar personagem a
personagem". Com 8 personagens, é uma tabela de 8 linhas que cabe na tela e que ninguém consegue
burlar sem que apareça ali.

---

## 5. Stream de PRNG do bot (executa D-08)

### 5.1 Onde nasce

`sim/` **não pode** importar de `bot/` — invariante RF-19. Mas o bot precisa de uma seed derivada da
seed da partida. A direção permitida é `bot → sim`, então a função de derivação mora em `sim/rng.ts`
e o bot a consome:

```ts
// sim/rng.ts — adição
/** Deriva seeds descorrelacionadas de uma seed-mãe. Mistura splitmix32. */
export function deriveSeed(seed: number, streamId: number): number
```

**Tabela de streams reservados — escrita, não implícita:**

| id | Dono | Consumido por |
|---|---|---|
| 0 | `world.rng` — a simulação | `createWorld` (ruído de largada) e `ctx.rand` dentro de personagens |
| 1 | Bot do time 0 | jitter de mira, limiar de decisão |
| 2 | Bot do time 1 | idem |
| 3 | Cliente — efeitos visuais | **nunca** pode afetar a simulação |
| 4+ | Arnês, telemetria, geração de cenário | reservado |

`createBot(matchSeed, team)` faz `mulberry32(deriveSeed(matchSeed, team + 1))`, e o estado do gerador
vive **no objeto do bot**, não em `World`. Consequência direta: o `World` serializado (snapshot da
Fase 4) não carrega estado de bot, e dois servidores com versões diferentes de bot produzem o mesmo
`World` a partir da mesma linha do tempo de inputs.

### 5.2 Como o determinismo é preservado — três regras, uma delas forçada pelo compilador

**Regra 1 (a boa) — o bot não recebe acesso ao `rng` da simulação.** Não como convenção: como tipo.

```ts
// sim/types.ts
export type WorldView = Omit<World, 'rng'>

// bot/
export function botCommands(view: WorldView, bot: BotState): Command[]
```

O bot deixa de receber `World` e passa a receber `WorldView`. Tentar chamar `world.rng()` vira **erro
de compilação**, não uma violação que alguém descobre em code review três meses depois. O mesmo vale
para `SimCtx`: o bot nunca o recebe, então `ctx.rand` também está fora de alcance.

*Ressalva técnica:* `Omit` é raso. Um `DeepReadonly<WorldView>` fecha também a escrita acidental em
`view.balls[0].hp`, ao custo de tipagem mais pesada. Recomendo começar com `Omit` + a Regra 3 (que
pega a violação em runtime) e endurecer se aparecer um caso real.

**Regra 2 — o stream do bot avança por decisão, nunca por relógio.** O bot decide a cada N ticks
(`dummy.ts:11` já faz isso) e o número de saques por decisão pode variar com o estado — o que é
determinístico, porque o estado é determinístico. Mudar a heurística muda o consumo do stream do bot,
mas **não** o do stream 0. É exatamente isso que D-08 protege.

Observação de fato sobre o código atual, que fortalece a posição: hoje **nada consome `world.rng`
depois de `createWorld`** — nenhum personagem chama `ctx.rand`. A simulação saca exatamente
`4 × nBolas` números na largada e nunca mais. Quando personagens começarem a usar `ctx.rand` (crítico,
dispersão de projétil), a ordem de consumo passará a depender da ordem de iteração de `world.balls`.
Daí uma invariante nova, a ser escrita junto:

> **`world.balls` nunca pode ser reordenado por valor.** Nada de `sort` por HP, distância ou dano.
> Se alguma lógica precisar de ordem diferente, ela ordena uma **cópia**, e sempre com desempate por
> `id` — porque `Array.prototype.sort` só é estável dentro de um mesmo engine, e a Fase 4 roda
> Node e Chrome ao mesmo tempo.

**Regra 3 — o teste de isolamento, escrevível hoje, antes de o bot existir.** Três passos:

```
(i)   rodar a partida com o bot, gravando Command[] por tick
(ii)  recriar o mundo com a MESMA seed e reproduzir os comandos gravados, sem bot algum
(iii) hash(i) === hash(ii)
```

Se o bot estivesse sacando de `world.rng`, o passo (ii) divergiria imediatamente, porque a sim teria
consumido números diferentes. Este é literalmente o critério **P4.3** do PRD ("replay reconstrói a
partida a partir de seed + linha do tempo de inputs, com hash idêntico"), e a beleza é que ele pode
entrar no `sim:check` **agora**, usando o `dummy.ts` — validando a infraestrutura de replay dois
épicos antes de a Fase 4 começar, quando corrigir ainda é barato.

---

## 6. Plano de migração incremental

Princípio: um passo por vez, `sim:check` verde ao fim de cada um. Mas "verde" hoje é fraco demais
para esta migração — daí o passo 0.

### 6.0 Passo 0 — golden hash (pré-requisito de tudo)

`determinism.ts` hoje verifica **autoconsistência**: roda cada seed duas vezes e compara. Isso
continuaria verde mesmo se a refatoração mudasse silenciosamente o comportamento do jogo — ele prova
que a simulação é reprodutível, não que ela é *a mesma de ontem*. Uma migração de 8 passos feita sob
esse critério é feita no escuro.

**Ação:** gravar um trio (ou quinteto) de hashes de referência e comparar a cada execução. Baseline
medido nesta sessão, com o código atual, sem modificá-lo:

| seed | hash | ticks | vencedor |
|---|---|---|---|
| 1 | `96de1201` | 753 | time 1 |
| 2 | `f66a7416` | 961 | time 0 |
| 3 | `a8db9c28` | 830 | time 0 |
| 7 | `cb77dbe0` | 831 | time 0 |
| 11 | `6aede2d9` | 1168 | empate (duplo-KO) |

Custo: ~15 linhas em `determinism.ts`. Retorno: os passos 1 a 7 abaixo passam a ser **verificáveis**
em vez de plausíveis. A seed 11 vale como bônus — ela exercita o caminho de empate, que é justamente
o que D-02 vai regulamentar.

### 6.1 Os oito passos

| # | Passo | Hash | O que quebra | Risco |
|---|---|---|---|---|
| **0** | Golden hash no `sim:check` | — | nada | nulo |
| **1** | Introduzir `base`/`bonusPassive`/`bonusItem`/`stat` + `recomputeStats`, **com `mods` e os campos diretos ainda vivos e ainda sendo os lidos** | **idêntico** | nada | baixo — código morto por um passo |
| **2** | Trocar os leitores, **um de cada vez**: `effectiveSpeed`→`stat.maxSpeed`; `dealDamage`→`stat.dmg`,`stat.dmgTaken`; `knockback`→`stat.knockbackTaken`; `autoAttack`→`stat.range`,`stat.atkSpeed`; `integrate`→`stat.drag`; `collideBalls`→`stat.mass`,`stat.radius` | **idêntico** — identidades verificadas em §1.7 | nada | baixo. Se o golden hash mudar aqui, a aritmética divergiu e o teste diz exatamente onde |
| **3** | **Remover** `Ball.mods` e os campos diretos (`radius`, `mass`, `maxSpeed`, `steer`, `drag`, `maxHp`) | **idêntico** | `golem.ts`, `vex.ts`, `render.ts`, `inspect.ts`, `world.ts` — **erros de compilação** (ver §6.2) | médio: é o passo grande, mas o `tsc` enumera todos os pontos |
| **4** | `cdSpeed` em `castCommand`, com `MIN_ABILITY_CD_MS` | **idêntico** (`7000/1.0 === 7000`, verificado) | nada | baixo |
| **5** | `restBall`/`restWall` por corpo; constantes viram `DEFAULT_STATS` | **idêntico** (`max(0.65,0.65) === 0.65`, verificado) | nada | baixo |
| **6** | `contactWindows` + `ContactState` + `world.phase` + checagem em `dealDamage` | **idêntico se** a ordem de pares de `collideBalls` for preservada | `golem.ts` — `on.collide` deletado, `cast` reescrito | **médio-alto**: é o único passo em que a paridade depende de ordem de execução, não só de aritmética |
| **7** | `deriveSeed`, `WorldView`, teste de replay no `sim:check` | **idêntico** (o `dummy` não usa rng) | assinatura de `dummyCommands` | baixo |
| **8** | Camada de itens: `PickSetup.itemBonus`, agregação em `src/shop/` | **muda** — e é a primeira vez que deve mudar | nada em `sim/` | já é Fase 3 |

Passos 1 a 7 são **preparação com comportamento congelado**. O jogo só muda no passo 8, quando o
primeiro item existir. Esta é a propriedade que torna a dívida pagável sem reabrir o balanceamento
da Fase 0.

### 6.2 O que quebra em `golem.ts` e `vex.ts`, linha a linha

| Arquivo:linha | Hoje | Depois | Quando quebra | Como |
|---|---|---|---|---|
| `golem.ts:94-96` | `init: (self) => { self.mods.knockbackResist = 0.6 }` | `bonus: { knockbackTaken: -0.6 }` | **passo 3** | Erro de compilação (`mods` e `init` não existem). Conversão exata: `1 − 0.6 === 0.4` |
| `golem.ts:102` | `self.hp / self.maxHp > 0.5` | `self.hp / self.stat.maxHp > 0.5` | passo 3 | Erro de compilação, correção mecânica |
| `golem.ts:52` | `self.memory.dashAte = ctx.now + 450` | `ctx.openContactWindow(self, 'sismico')` | **passo 6** | **NÃO quebra a compilação** — `memory` continua sendo `Record<string, number>`. Quem quebra é a camada 2 da auditoria: se o dev migrar o `cast` e esquecer o `on.collide`, o `sim:check` explode com violação de fase; se migrar o `on.collide` e esquecer o `cast`, a janela nunca abre e o dano some — o **golden hash** pega |
| `golem.ts:134-144` | `on.collide` com `ctx.damage(other, 14, self)` | bloco **deletado**; `contactWindows` declara o mesmo | passo 6 | Violação de fase se sobrar |
| `vex.ts:96-98` | `onTick: (_ctx, self) => { self.mods.speed = ... ? 1.25 : 1 }` | `onTick: (ctx, self) => { if (self.hp / self.stat.maxHp < 0.4) ctx.addBonus(self, 'maxSpeed', 0.25) }` | **passo 3** | Erro de compilação. Diferença semântica que é o ponto de C3: `addBonus` **soma** num bloco zerado a cada tick, então uma Turbina no mesmo Vex sobrevive. Numericamente idêntico: `250 × 1.25 === 250 × (1 + 0.25)` |
| `vex.ts:41` e `:90` | `alvo.hp / alvo.maxHp` | `alvo.hp / alvo.stat.maxHp` | passo 3 | Compilação |
| `world.ts:158` | `b.hp / b.maxHp` em `weakestEnemy` | `b.hp / b.stat.maxHp` | passo 3 | Compilação |

**Os dois pares de olhos que a migração precisa** (e cada um pega o que o outro não pega):

- `tsc --noEmit` pega tudo que é **acesso a campo removido** — passos 1-5, 7.
- golden hash pega tudo que é **mudança de comportamento silenciosa** — o passo 6 inteiro.
- camada 2 da auditoria pega **migração pela metade** do Golem — só o passo 6.

Nenhum dos três é dispensável, e é por isso que o passo 0 vem antes de tudo.

---

## 7. Riscos da própria proposta

### 7.1 Custo de recálculo a 60Hz

**Aritmética.** 15 stats × 4 bolas × 60 Hz = **3 600 recálculos de campo por segundo** no cliente.
Cada um é ~5 operações (duas somas, dois clamps, uma multiplicação). Irrelevante — o `integrate` já
faz mais que isso com `Math.pow` por bola por tick.

**O alvo real não é o cliente, é o arnês.** RF-48 exige n ≥ 800 lutas por confronto × 28 confrontos
= **22 400 rodadas**. Com a duração medida hoje (mediana 828 ticks) são **18,5 M ticks**; com a
mediana-alvo de D-05 (30s = 1 800 ticks) são **40 M ticks**. Isso dá:

| Cenário | ticks | recálculos de campo |
|---|---|---|
| Arnês hoje (13,8s de mediana) | 18,5 M | **1,1 bilhão** |
| Arnês na mediana-alvo (30s) | 40 M | **2,4 bilhões** |

A ~10 ns por campo, são 11 a 24 segundos de CPU só de recompute — contra um arnês que já vai levar
dezenas de minutos. Aceitável, **mas não desprezível**, e o custo real não é a aritmética:

**Mitigações, em ordem de prioridade:**

1. **Nunca alocar no caminho quente.** Zerar `bonusPassive` reusando o objeto
   (`for (const k of STAT_KEYS) bonus[k] = 0`), jamais `{...}`, `Object.assign` com literal ou
   spread. Sem isso são 4 objetos por tick × 40 M ticks = **160 milhões de objetos** para o GC — e aí
   o custo dominante vira pausa de coleta, não multiplicação.
2. **Forma fixa de objeto.** `StatBlock` e `BonusBlock` criados com todas as chaves de uma vez, na
   mesma ordem, nunca `delete`, nunca chave dinâmica. Uma única hidden class no V8; o acesso vira
   offset constante.
3. **Iterar `STAT_KEYS` (array const), nunca `Object.keys()`** — que aloca um array novo a cada
   chamada, 240 M vezes.
4. **Dirty flag, se e somente se medir mostrar necessidade.** `addBonus` marca `b.statsDirty = true`;
   `recomputeStats` sai cedo se falso. No caso comum (nenhuma passiva condicional ativa) o recompute
   inteiro é pulado. **Não implementar de saída** — é otimização pré-medição, e o dirty flag introduz
   uma classe nova de bug (esquecer de marcar). Gatilho escrito: se o arnês de 800 lutas passar de
   **10 minutos**, ligar.
5. **Saída de emergência, registrada e não recomendada:** `Float64Array` indexado por enum, com
   `STAT_KEYS` virando índices. Desempenho máximo, legibilidade péssima. Só se (1)-(4) falharem.

### 7.2 Vetores de não-determinismo — o que esta proposta introduz e o que ela só torna visível

| # | Vetor | Gravidade | Mitigação |
|---|---|---|---|
| **1** | **Ordem de soma dos bônus de item.** Soma em ponto flutuante **não é associativa**: `(a+b)+c ≠ a+(b+c)`. Se o agregador iterar os itens em ordem de compra numa máquina e em ordem de catálogo noutra, o último bit difere → cliente e servidor divergem na Fase 4 | **Alta — é o pior desta lista** | **Obrigatório:** a agregação em `src/shop/` soma em **ordem canônica fixa** (ordem crescente de `itemId` no catálogo), e o resultado é congelado em `bonusItem` na criação da bola. Um teste que embaralha a ordem de compra e exige `bonusItem` byte-idêntico |
| **2** | `Math.hypot`, `Math.pow`, `Math.atan2` **não são bit-exatos entre engines**. `Math.sqrt` é IEEE-exato; `Math.hypot` é notoriamente divergente entre V8, JSC e SpiderMonkey | Alta — **mas pré-existente**, não introduzida por mim | Não é escopo desta dívida, e por isso vai como **achado separado**: trocar `Math.hypot(a,b)` por `Math.sqrt(a*a+b*b)` em `sim/` **antes da Fase 4**, quando o mesmo código passar a rodar em Node e Chrome simultaneamente. Hoje é inofensivo porque só uma engine roda por vez |
| **3** | **Ordem de iteração de `world.balls`** virando dependente de valor (`sort` por HP) no dia em que personagens consumirem `ctx.rand` | Média | Invariante escrita em §5.2: nunca reordenar `world.balls`; ordenar cópias, sempre com desempate por `id` |
| **4** | **`world.phase` mal restaurada** em reentrância (dano de janela → morte → `on.kill` → mais dano) → falso positivo de violação do Pilar 3, que **lança** e mata a rodada | Média | `const prev = world.phase; ...; world.phase = prev`. Um teste que mata uma bola dentro da janela de contato do Golem cobre exatamente esse caminho |
| **5** | **`stat` é estado derivado redundante.** Quem escrever em `stat` direto tem a escrita apagada silenciosamente no tick seguinte | Média | `stat: Readonly<StatBlock>` na interface (o `tsc` pega o caso comum) + uma checagem no `sim:check` comparando `stat` com `recompute(base, bonus)` ao fim de cada rodada |
| **6** | **Clamps introduzem descontinuidade** — não não-determinismo, mas mudam o hash quando mordem pela primeira vez | Baixa | É por isso que o golden hash precisa ser **recalculado deliberadamente**, com registro no commit, quando um teto entrar em ação. Hash que muda sem explicação = bug |

### 7.3 Os tetos são raciocínio, e a decisão #13 manda medir

Autocrítica explícita: os tetos de balanceamento (`dmg`, `maxHp`, `range`, `mass`) são números que eu
argumentei, não medi — e o design é categórico ao dizer que balanceamento é medição.

**Mitigação concreta e barata:** todos os tetos moram em `sim/stats.ts` como constantes nomeadas, e o
arnês da Fase 2 instrumenta **quantas vezes cada clamp mordeu**. Um contador por campo, imprimível
junto da matriz de winrate:

- clamp que **nunca morde** → rede de segurança barata, mantém;
- clamp que **morde às vezes** → funcionando como projetado;
- clamp que **morde sempre** → virou regra de jogo por acidente, e volta ao usuário como decisão de
  produto, não como constante escondida.

Isto transforma a §1.4 de "chute do arquiteto" em hipótese falseável, que é o que a decisão #13 pede.

### 7.4 Achado colateral: margem de tunneling da colisão discreta

A colisão bola-bola é discreta, sem CCD (`physics.ts:27-69`). Duas bolas se atravessam sem detecção
se o deslocamento relativo num tick exceder `2 × (r_a + r_b)`.

| Cenário | Velocidade relativa | Deslocamento/tick | Limite | Margem |
|---|---|---|---|---|
| Golem em dash (900) × Vex em Deslize (1000), frontal | 1 900 px/s | 31,7 px | 78 px | 59% de folga |
| **Vex em Deslize × Vex em Deslize, frontal** | **2 000 px/s** | **33,3 px** | **60 px** | **45% de folga — o pior caso do roster** |

Conclusão: **está seguro hoje**, e os tetos que proponho não consomem essa margem — `maxSpeed` é
limitado em 420 px/s, muito abaixo dos impulsos de habilidade (900-1000), que dominam o pior caso.

**O que preocupa é o vetor de crescimento:** os impulsos de cast (`self.vx = aim.dx * 900`) não
passam por stat nenhum e não têm teto. Um personagem futuro com dash de 1 800 px/s, ou um item que
amplifique impulso, come a margem inteira sem que nada avise.

**Recomendação (barata, medir em vez de supor):** um contador no `integrate` que registra sempre que
`hypot(vx,vy) × dt > 0.5 × (2 × menorSomaDeRaios)`, reportado pelo arnês. Zero custo em jogo, e
transforma um bug latente de física em número acompanhado. Registrado como **fora do escopo desta
dívida, descoberto por ela** — cabe ao usuário decidir se entra na Fase 2.

---

## 8. Ressalvas às decisões aprovadas

Nenhuma decisão aprovada é contrariada neste documento. Duas geram consequências que o usuário
precisa conhecer antes de a Fase 3 começar.

### R-01 — D-04 e os campos de redução (consequência, não discordância)

**A decisão:** `valor = base × (1 + Σbônus_passiva + Σbônus_item)`, com teto explícito por campo.

**O problema:** a fórmula é indefinida para campos cuja base neutra é **zero** — `knockbackResist`
(0 = neutro) e o "−cooldown" do Relicário. `0 × (1 + Σ)` é sempre 0.

**O que fiz:** em vez de abrir exceção na fórmula, **remodelei os campos** para base neutra 1.0
(`knockbackTaken`, `cdSpeed`). A fórmula de D-04 vale literalmente para os 15 campos, sem exceção
alguma. Conversão numericamente exata para os valores existentes (§1.7).

**A consequência que precisa de ciência:** a loja fala em redução, o motor fala em multiplicador.
Um Relicário anunciado como **"−20% de cooldown"** é internamente **"+0.25 em `cdSpeed`"**. E dois
Relicários dão −33%, não −40%. Isso é o retorno decrescente que D-04 quer, mas exige que a UI da
loja traduza — e que quem escrever o catálogo saiba disso, porque errar aqui é silencioso.

Mesma armadilha, outro campo: **"Lixa (−atrito)"** é um bônus **positivo** em `drag`, porque `drag`
é a fração de velocidade *retida*. O sinal do item é o inverso do nome (§1.6).

**Se o usuário preferir o contrário** — manter os nomes de campo atuais e abrir uma exceção na
fórmula para campos aditivos puros — é decisão dele. Meu argumento contra: exceção em fórmula de
balanceamento é onde bug de balanceamento se esconde, e são só dois campos.

### R-02 — D-03 e a fragilidade prática da fronteira do alcance

**A decisão:** +alcance afeta só o ataque básico na v1. **Concordo integralmente** e não estendi.

**O que registro:** com `stat.range` multiplicando apenas `def.atk.range`, a Luneta é quase inerte
em personagens cujo dano principal vem da ativa. No roster atual isso já é o caso do Vex: básico
dmg 6, Lâmina Fantasma dmg 14. O PM previu e mitigou por preço (D-03), o que resolve o problema de
produto.

**A mitigação de arquitetura**, que é o que me cabe: o ponto de extensão é **uma linha** em `aimFrom`
(`world.ts:299-306`). Deixá-lo mapeado e coberto por teste faz com que a revisão prevista para a
Fase 5 seja uma mudança de uma linha, e não uma refatoração.

### D-07 e D-08

Sem ressalva. Concordo com as duas, e ambas melhoram o sistema em direções que eu recomendaria
mesmo se não tivessem sido decididas. D-07 em particular troca um pilar não-auditável por um pilar
com tabela de 8 linhas impressa pelo arnês — é o tipo de decisão que se paga sozinha no 5º personagem.

---

## Anexo A — Mapa de arquivos tocados

| Arquivo | Natureza da mudança | Passos |
|---|---|---|
| `src/sim/stats.ts` | **novo** — `STAT_KEYS`, `StatBlock`, `BonusBlock`, `DEFAULT_STATS`, tabela de tetos, `recomputeStats` | 1 |
| `src/sim/types.ts` | `Ball` reestruturado; `CharDef` ganha restituição e `contactWindows`; `PassiveDef` perde `init` e ganha `bonus`; `SimCtx` ganha `addBonus`/`openContactWindow`; `World` ganha `phase`; novo `WorldView` | 1, 3, 6, 7 |
| `src/sim/world.ts` | `makeBall` monta `base`/`bonus`/`stat`; laço do `step` ganha o ponto de recálculo e as fases; `castCommand` ganha `cdSpeed`; `dealDamage` ganha `dmgTaken` e a checagem de fase; `resolveContactWindow` novo | 1-7 |
| `src/sim/physics.ts` | constantes de restituição saem; leitura por corpo; callback de colisão passa a chamar a janela antes de `on.collide` | 5, 6 |
| `src/sim/rng.ts` | `deriveSeed` | 7 |
| `src/chars/golem.ts` | `init`→`bonus`; `on.collide` deletado; `cast` do Sísmico usa `openContactWindow`; `contactWindows` declarado | 3, 6 |
| `src/chars/vex.ts` | `onTick` usa `ctx.addBonus`; leituras de `maxHp` | 3 |
| `src/tools/determinism.ts` | golden hash; tabela de janelas de contato; teste de replay; contadores de clamp | 0, 6, 7 |
| `src/client/render.ts`, `src/tools/inspect.ts` | leituras de `radius`/`maxHp` → `stat.*` | 3 |
| `src/shop/` | **novo, fora de `sim/`** — catálogo de itens e agregação em ordem canônica | 8 |

## Anexo B — Checklist de portão desta dívida

A Fase 3 pode começar quando todos estiverem verdes:

| # | Critério | Como se verifica |
|---|---|---|
| A-1 | `npm run sim:check` verde, 40/40 seeds | comando |
| A-2 | Golden hash das 5 seeds igual ao baseline de §6.0 — ou diferente **com justificativa registrada** | comando |
| A-3 | `npm run check` (`tsc --noEmit`) verde | comando |
| A-4 | `sim/` continua sem importar de `chars/`, `bot/`, `client/`; sem `Math.random`; sem DOM | grep + revisão |
| A-5 | Os 8 itens do design têm ponto de aplicação nomeado no `StatBlock` | tabela de §1.4 cruzada com `DESIGN.md` §4 |
| A-6 | Nenhuma passiva do roster escreve em `stat` ou em `mods` (que não existe mais) | compilação |
| A-7 | Tabela de janelas de contato impressa pelo `sim:check`, com zero violações de fase | comando |
| A-8 | Teste de replay (§5.2, regra 3) verde | comando |
| A-9 | Todos os 15 tetos existem como constante nomeada em `sim/stats.ts` | revisão |
| A-10 | Um teste que embaralha a ordem de compra e exige `bonusItem` byte-idêntico | comando (passo 8) |
