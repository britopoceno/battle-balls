# O jogo ainda não tem nome

*Devlog 1: uma arena de bolas, um documento escrito antes da primeira linha de código,
três defeitos que só apareceram porque eu testei a simulação sem jogar, e o método de
trabalho que produziu tudo isso.*

Este é o primeiro post de uma série sobre um jogo que estou construindo em público. Nos
documentos ele se chama Battle Balls, um nome provisório feio o bastante para me lembrar
todo dia de que ainda não escolhi um de verdade. Vou contar a ideia, depois o caminho que
percorri até aqui, incluindo os trechos em que descobri que estava errado, e por fim como
o trabalho está organizado, que é a parte que costuma ficar de fora dos devlogs e que na
prática determina tudo o resto.

## A ideia

É um PvP de dois contra dois em tempo real, com física de bolas numa arena fechada, feito
para celular em modo paisagem e rodando no navegador.

O formato combina duas coisas que normalmente não convivem. De um lado está a lógica de
autobattler, na qual você monta a composição e depois assiste ela resolver a luta
sozinha, o que desloca a decisão para antes do confronto. Do outro estão os elementos de
ação, que exigem mira, leitura de posição e escolha de momento enquanto a luta acontece.
Combinei os dois separando o que é automático do que é do jogador: os personagens se
movimentam e usam seus ataques básicos sozinhos, enquanto as habilidades ativáveis e a
ultimate são miradas e disparadas por você.

O comportamento automático não é genérico, e é justamente aí que mora a identidade de
cada personagem, porque cada um tem características próprias que aparecem na forma como
ele se conduz. O Golem avança reto e devagar na ameaça mais próxima, sem desviar de nada,
já que a lentidão dele é o preço do tamanho e da massa. O Vex nunca vai direto: ele
circula o inimigo a 165 pixels de distância, que não é um número arbitrário, mas
exatamente a faixa em que o tiro dele alcança e o soco do Golem não, e só abandona a
órbita para mergulhar quando o alvo cai abaixo de 40% de vida, momento em que a
agressividade passa a compensar o risco. Com isso, reconhecer um personagem deixa de
depender de ler a descrição dele e passa a depender de observar como a bola se comporta.

Sobre esse comportamento automático vem a camada que é sua:

```
┌──────────────────────────────────────────────┐
│ ♥♥♥♥♥♥♥♥ Golem·Vex          Golem·Vex ♥♥♥♥♥♥ │
│                                              │
│         ●          ○                         │
│              ●        ○                      │
│                                              │
│  ◍ativa                          ativa◍      │
│    ◍ult                            ult◍      │
└──────────────────────────────────────────────┘
   polegar E                        polegar D
```

No draft você escolhe o personagem 1 e o personagem 2, e essa escolha já define o
teclado: o polegar esquerdo comanda o primeiro e o direito comanda o segundo, de maneira
que não existe selecionar personagem no meio da luta, porque cada mão já é um deles. Você
arrasta a partir do botão e a mira aparece na bola correspondente, sendo que a direção do
arrasto sempre decide para onde a habilidade vai, enquanto a distância do arrasto pode
decidir quão longe ela cai, conforme o personagem, já que nem toda habilidade tem alcance
variável. Como as duas mãos são independentes, os dois personagens podem estar mirando ao
mesmo tempo.

Falta contar a regra que amarra a física ao combate, e ela é a decisão da qual mais me
orgulho e sobre a qual mais tenho dúvida. Encostar no inimigo não causa dano nenhum,
apenas empurra. À primeira vista isso desperdiça a física, já que numa arena de bolas o
esbarrão parece ser o evento principal, mas o efeito é o contrário: como o ataque básico
de cada personagem é automático e tem alcance limitado, uma bola empurrada para longe
fica batendo no vazio durante os segundos que levar para voltar. Empurrar deixa de ser uma
forma de machucar e passa a ser uma forma de desligar o adversário temporariamente, o que
dá à colisão um papel tático em vez de aritmético. Todo o jogo do Golem, que só machuca
encostado, se resume então a um único problema, que é chegar.

Em volta desse núcleo existe um desenho maior, ainda inteiramente no papel: escolha
alternada de personagens, builds decididas em segredo sob um timer de 30 segundos, melhor
de cinco rodadas e uma loja entre elas na qual os dois jogadores recebem exatamente a
mesma renda, sem bônus por vitória. Essa última regra existe porque, se vencer desse ouro,
quem ganha a primeira rodada compra vantagem para a segunda e a partida se decide cedo
demais; tirando o prêmio, a pergunta econômica deixa de ser quanto você ganhou e passa a
ser em que momento você gasta, que é uma decisão mais interessante e igualmente
disponível para os dois lados.

Vale dizer com todas as letras: nada dessa parte existe ainda.

## O documento veio antes do código

Antes da primeira linha, escrevi um documento de design com sessenta decisões, cobrindo
arena, movimento, dano, habilidades, controles, economia, arquitetura e rede. Escrever
antes de codificar não me deixa mais inteligente, e eu não teria acertado mais decisões
por causa disso; o ganho é de outra natureza, porque uma decisão escrita pode ser
conferida meses depois contra aquilo que o código realmente faz, ao passo que uma decisão
que só existiu na minha cabeça se ajusta silenciosamente à implementação até ninguém mais
lembrar qual era a intenção original.

As duas seções de que mais gosto, aliás, não são as das decisões.

A primeira se chama "riscos conhecidos" e atribui gravidade a cada item, o que obriga a
transformar desconforto vago em afirmação testável. O risco número um diz, sem rodeio, que
a linha de itens físicos do jogo pode nascer morta, uma vez que numa partida curta o dano
direto tende a vencer o controle indireto; e como ele está escrito com um número
associado, eu vou conseguir descobrir se ele se realizou em vez de discutir sobre isso. O
terceiro estima que a soma de física, PvP síncrono, economia, mira e oito personagens dá
algo perto de doze meses de trabalho, o que é menos uma previsão e mais um aviso a mim
mesmo.

A segunda se chama "em aberto" e lista o que eu deliberadamente não decidi, incluindo os
números da economia, a arte, o som e o nome. Deixar uma decisão em aberto de propósito, e
registrar que ela está em aberto, evita o pior dos dois mundos, que é fechar cedo por
inércia e depois tratar a escolha acidental como se tivesse sido pensada.

Guarde esse detalhe sobre conferir o documento contra o código, porque mais adiante eu
descubro que ele estava mentindo sobre o meu próprio jogo.

## Uma pergunta por fase

Doze meses de escopo matam um projeto pessoal, não porque o trabalho seja demais, mas
porque o intervalo entre começar e descobrir se a ideia presta é longo demais para
qualquer motivação sobreviver. A saída que adotei foi cortar o jogo em sete fases e
atribuir a cada uma delas uma única pergunta, de forma que a fase seguinte só começa
depois que a pergunta da anterior for respondida com sim.

| Fase | O que entrega | A pergunta |
|---|---|---|
| 0. Núcleo | Simulação, dois personagens, mira | Mirar habilidades em bolas que andam sozinhas é divertido? |
| 1. Sensação | Layout de celular, quatro botões | Os dois polegares funcionam sem atrapalhar um ao outro? |
| 2. Medição | Adversário automático, dez mil lutas | Consigo detectar um personagem quebrado sem jogar? |
| 3. Loop | Draft, builds, melhor de cinco, loja | Dá vontade de jogar outra partida? |
| 4. Rede | Servidor árbitro, sala por link | Um contra um entre dois celulares é fluido? |
| 5. Conteúdo | Oito personagens, itens, telemetria | Todos ficam entre 45% e 55% de vitória? |
| 6. Meta | Ranked, progressão, som, arte | Sem pergunta própria: só existe se as outras passarem |

A Fase 0 é a que explica o método inteiro. Ela não entrega um pedaço horizontal do jogo,
como seria construir toda a interface ou todo o sistema de personagens, e sim uma fatia
vertical fina que atravessa o produto de ponta a ponta: um pouco de simulação, um pouco de
desenho na tela, um pouco de controle, o suficiente para que exista algo jogável e nada
além disso. A razão de fatiar verticalmente é que só a fatia completa responde perguntas
sobre diversão, ao passo que uma camada horizontal perfeita não responde nenhuma. E a
pergunta escolhida foi deliberadamente a mais perigosa de todas, porque se mirar
habilidades em bolas que se movem sozinhas for chato, então as outras cinquenta e nove
decisões do documento perdem a utilidade de uma só vez, sem que a elegância da economia ou
a correção da rede possam salvar coisa alguma. Duas semanas de protótipo custam bem menos
do que doze meses de descoberta.

Existe ainda uma segunda trava, que escrevi contra mim mesmo de propósito: o nono
personagem só pode existir quando os oito primeiros estiverem todos entre 45% e 55% de
vitória. O valor dela não está na regra em si, mas no fato de que ela se aplica sozinha,
sem depender de eu estar disciplinado num domingo à noite quando bater vontade de desenhar
mais um personagem em vez de equilibrar os que já existem.

## O que existe hoje, e por que foi construído assim

A Fase 0 entrega simulação, dois personagens, desenho na tela, mira por arrasto e um
programa de testes, somando 2.365 linhas de TypeScript sem nenhuma biblioteca no núcleo.

![Tela de seleção com os cards de Golem e Vex, cada um com duas ativas e duas passivas
para escolher](img/01-selecao.jpg)

Duas escolhas técnicas sustentam tudo o que vem depois, e vale explicar as duas com calma,
porque elas parecem detalhes de engenharia e na verdade são o que torna possível o resto
do projeto.

A primeira é o passo de tempo fixo. Um jogo comum pergunta, a cada quadro desenhado,
quanto tempo se passou desde o quadro anterior, e usa esse valor para avançar a física, o
que faz o resultado depender da velocidade da máquina naquele instante. A minha simulação
não pergunta nada: ela avança sempre a mesma fatia de 16,67 milissegundos, sessenta vezes
por segundo, independentemente de o computador estar sobrando ou sufocando. Somando a isso
o fato de que todo o acaso vem de um gerador que recebe um número inicial, chamado
semente, e produz sempre a mesma sequência a partir dele, chega-se à propriedade que
interessa: duas execuções que partam da mesma semente e recebam os mesmos comandos
terminam bit a bit idênticas.

Essa propriedade sozinha abre três portas ao mesmo tempo, e é por isso que ela veio antes
de qualquer coisa bonita na tela. Primeiro, gravar uma partida inteira passa a custar quase
nada, já que basta guardar a semente e a lista de comandos com o instante de cada um, em
vez de vídeo ou de posições quadro a quadro. Segundo, quando a Fase 4 chegar e existir um
servidor, ele poderá recalcular por conta própria o que o cliente afirma ter acontecido, de
modo que trapaça deixa de ser um problema a resolver e passa a ser algo que a arquitetura
já impede. Terceiro, e mais imediato, dá para rodar dez mil lutas seguidas sem abrir tela
nenhuma, medindo equilíbrio antes que qualquer pessoa jogue, que é exatamente o que a
próxima seção conta.

A segunda escolha é que a simulação não conhece ninguém. A pasta onde ela mora não importa
nada dos personagens, do adversário automático ou da tela, sendo os personagens entregues a
ela de fora, no momento em que o mundo é criado. Essa é a única regra de arquitetura que me
proibi de quebrar, e a razão é que o sentido da seta de dependência determina onde o código
pode rodar: enquanto a simulação depender apenas de si mesma, ela roda igualmente no
navegador do jogador, no servidor que vai arbitrar as partidas e no programa de medição, ao
passo que bastaria uma importação de algo ligado à tela para que ela deixasse de rodar fora
do navegador, e todo o resto do plano cairia junto.

Como consequência dessas duas regras, um personagem acaba sendo um arquivo curto e quase
todo declarativo:

```ts
export const golem = {
  id: 'golem', maxHp: 190, radius: 24, mass: 3.2, maxSpeed: 105,

  // anda reto na ameaça mais próxima
  move: (ctx, self) => ctx.seek(self, ctx.nearestEnemy(self)),

  // soco de contato, alcance de 18px além do raio: precisa estar encostado
  atk: { kind: 'melee', cd: 1100, dmg: 16, range: 18, knockback: 320 },
}
```

O Vex, declarado do mesmo jeito, tem 100 de vida, massa 0,9, velocidade 250 e um tiro de
alcance 200, e a distância entre os dois vai muito além dos números, porque até a regra que
enche a barra de ult é diferente em cada um: a do Golem sobe quando ele apanha, enquanto a
do Vex sobe quando ele causa dano. Fazer da condição de carga uma característica do
personagem, em vez de um cronômetro igual para todos, muda o comportamento de quem joga, já
que o jogador de Golem tem incentivo para entrar na briga, ao passo que o de Vex tem
incentivo para manter pressão constante. Como essa regra é invisível, um ícone dentro da
própria barra informa qual é a condição, para que a barra parada seja entendida em vez de
parecer defeito.

Registro por fim três desvios conscientes, para que não virem lenda depois: um pacote único
em vez de vários, desenho em Canvas 2D em vez de uma biblioteca gráfica, porque quatro
círculos não pagam a dependência, e o atraso de rede desligado por enquanto.

## Testar a simulação sem jogar

Junto com o jogo eu construí uma bancada de testes, que é um programa que roda a simulação
sem abrir tela nenhuma. São 40 partidas, cada uma partindo de uma semente diferente, com
times idênticos dos dois lados, um Golem e um Vex em cada, e o mesmo adversário automático
controlando as duas equipes. A ideia por trás desse arranjo é simples e vale mais do que a
implementação: quando os dois lados são rigorosamente iguais, qualquer assimetria que
apareça no resultado não pode vir de o jogo ser desequilibrado, e portanto vem de um defeito
meu.

```
determinismo   ok
espelho 2v2    time0 19 · time1 14 · empate 7
duração        mediana 13.8s · min 12.3s · max 19.5s
```

A bancada encontrou três defeitos, e o que os une é que nenhum deles aparece na leitura do
código, porque todos os três são erros de aritmética entre números que estavam certos
individualmente.

**O Golem não conseguia atacar o Golem.** O alcance do soco era conferido tomando a
distância entre os centros das duas bolas e subtraindo o raio do alvo, o que, com alcance 18
e raio 24, exigia que o Golem chegasse a 42 pixels do centro do inimigo. Acontece que dois
corpos de raio 24 nunca ficam a menos de 48 pixels um do outro, já que encostam antes disso,
de modo que a condição de ataque era inatingível por aritmética e não por dificuldade. Na
prática, o Golem chegava, encostava e ficava ali empurrando até o tempo acabar, o que travava
vinte por cento das rodadas. A correção foi medir de superfície a superfície, subtraindo os
dois raios em vez de um só, e o aprendizado que fica é que alcance corpo a corpo precisa ser
expresso como folga entre as bordas, porque é isso que ele significa fisicamente.

**Os tiros nunca acertavam quem estava orbitando.** O Vex se move a 250 pixels por segundo,
o tiro dele viaja a 470 e a órbita fica a 165 pixels de distância, de forma que o tempo de
voo é de 0,35 segundo e, nesse intervalo, o alvo percorre 88 pixels. Como a mira apontava
para a posição atual, o tiro passava sistematicamente atrás, e Vex contra Vex virava um
empate eterno de dois orbitadores girando e errando. A solução é interceptação: em vez de
mirar onde o alvo está, calcula-se onde ele estará quando o projétil chegar, supondo que ele
mantenha a velocidade atual. O detalhe interessante é que esse cálculo morde a própria
cauda, porque o ponto de encontro depende do tempo de voo e o tempo de voo depende do ponto
de encontro, e a saída prática é iterar duas vezes, estimando o tempo com a posição atual,
corrigindo a posição com esse tempo e recalculando. Mais importante do que a correção
funcionar é que ela preserva a intenção do design: como a previsão assume velocidade
constante, empurrar o alvo continua fazendo o tiro errar, o que mantém de pé a regra de que
deslocar o inimigo é uma jogada.

**A semente não fazia nada.** Esse é o mais assustador dos três, e também o mais instrutivo.
Nenhuma parte da simulação consumia números do gerador, uma vez que os personagens não
tinham nada de aleatório e as posições iniciais eram fixas, de modo que as 40 sementes
rodavam todas exatamente a mesma partida. O teste passava com folga e não estava testando
coisa alguma, porque quarenta repetições de um único caso continuam sendo um único caso. A
correção foi acrescentar um pequeno sorteio de posição e velocidade na largada, e a lição
que levo é que um teste precisa ser capaz de falhar para significar alguma coisa, o que
implica verificar de vez em quando se ele ainda falha quando deveria.

![Rodada em andamento aos 15,3 segundos: quatro bolas, números de dano subindo, a área do
Tremor no chão, uma muralha atravessada e, no topo, a contagem para a morte súbita, o
momento em que a arena começa a encolher para forçar o confronto](img/03-rodada.jpg)

## O defeito que a bancada não pegaria, e o que continua quebrado

Passei na bancada, abri o navegador e a tela ficou preta.

O motivo é um detalhe de JavaScript que vale conhecer, porque ele produz falhas totais a
partir de causas mínimas. Funções declaradas sobem sozinhas para o topo do arquivo, podendo
ser chamadas antes da linha em que aparecem, ao passo que variáveis declaradas com `let` não
sobem e ficam num limbo até a linha da declaração ser executada. Como eu chamava uma dessas
funções antes de declarar uma das variáveis que ela usa, o arquivo inteiro morria durante a
inicialização, e o sintoma foi cruel justamente por ser parcial: a tela de seleção continuava
aparecendo, porque ela é HTML estático, enquanto nada que dependesse de código funcionava.
Trocar duas linhas de lugar resolveu, mas a conclusão que registrei no repositório é mais
duradoura, e é a de que uma bancada sem tela prova a simulação e não prova o cliente, motivo
pelo qual a Fase 1 precisa do próprio critério de verificação visual em vez de herdar o da
Fase 0.

Agora a parte honesta. Eu joguei, achei divertido e a Fase 0 passou, mas ela passou com cinco
coisas quebradas, e listá-las é o que impede que elas sejam esquecidas.

1. **Testei no computador, com mouse, quando o jogo é sobre polegar.** O teste no celular
   falhou por um problema de rede local que ainda não resolvi, e o diagnóstico está
   incompleto de um jeito irritante: a resposta HTTP é válida, os bytes conferem com o
   tamanho declarado, o aparelho aparece conectado no log do servidor, e mesmo assim a
   página não carrega, o que coloca a interferência em algum ponto entre o roteador e o
   celular.
2. **A rodada dura 13,8 segundos na mediana**, contra os até 60 segundos que o design assume
   antes de a arena começar a encolher, o que deixa o valor medido 4,3 vezes fora do
   previsto. Não ajustei de propósito, porque subir vida ou baixar dano é fácil e escolher o
   número certo depende de ter uma pessoa no controle, e isso é Fase 3.
3. **O Golem provavelmente é impotente contra o Vex**, considerando que são 105 pixels por
   segundo contra 250 e alcance 18 contra 200. Se a suspeita se confirmar, ela é informação
   de design antes de ser defeito, já que um personagem lento e curto de alcance deve mesmo
   sofrer contra um rápido e distante, contanto que tenha alguma resposta, que é o que falta
   descobrir.
4. **Quarenta sementes não servem para equilibrar nada.** A margem de erro nesse tamanho de
   amostra é de quinze pontos percentuais para cima ou para baixo, o que significa que um
   personagem com 55% de vitória real e outro com 50% produziriam resultados
   indistinguíveis; para separar os dois com alguma confiança seriam necessárias cerca de 800
   lutas por confronto, e é dessa conta que vêm as dez mil lutas planejadas para a Fase 2.
5. **A regra de que encostar não causa dano já era falsa no meu próprio código**, porque a
   investida do Golem causa 14 de dano por contato numa janela de 450 milissegundos. Escrita
   em termos absolutos, a regra não podia ser conferida, e nada impediria o terceiro, o
   quarto e o quinto personagem de abrirem exceção pelo mesmo caminho até ela virar
   decoração. Reescrevi então em termos verificáveis: colisão comum não causa dano, e dano
   por contato só existe dentro de uma janela declarada como campo do personagem, de modo que
   dá para auditar o elenco inteiro lendo uma tabela em vez de reler todo o código.

## O método: quem faz o quê, e por que isso importa

O histórico do repositório é todo do mesmo dia, e isso pede explicação. Eu não digitei essas
2.365 linhas: conduzi um conjunto de agentes de inteligência artificial, cada um com um papel
definido, operando dentro de um método que existe antes deles e que continuaria valendo se os
executores fossem pessoas. Como essa é a parte que mais me perguntam e a que menos aparece
nos devlogs, vale desdobrá-la com calma.

### A unidade de trabalho é a story, não a tarefa

Nada é implementado a partir de uma conversa. Tudo começa com um documento chamado story, que
descreve uma única mudança e traz, no mínimo, quatro coisas: o objetivo escrito na forma
"como X, eu quero Y, para que Z", que obriga a declarar a finalidade e não apenas a ação; a
lista de dependências, que diz quais outras stories precisam estar concluídas antes desta
começar; os critérios de aceite numerados, que precisam ser verificáveis por alguém que não
escreveu o código; e a lista de tarefas com caixas de seleção, que registra o andamento.

Um exemplo real do meu repositório, para sair do abstrato. A story `debt.1` declara como
dependência a `debt.0` e explica por quê, em uma frase que resume o valor de todo o método:
sem o registro de referência gravado pela `debt.0`, não existe como provar que a `debt.1` não
mudou o comportamento do jogo. As dependências declaradas transformam o épico inteiro num
grafo, de modo que a ordem de execução deixa de ser preferência e passa a ser consequência.

O critério de aceite dessa mesma story chega ao ponto de dizer o que fazer se ele falhar: se
o resultado da simulação mudar, então alguma coisa está lendo os campos novos antes da hora,
e a instrução é reverter e localizar o vazamento antes de prosseguir. Escrever isso na hora do
planejamento, e não na hora do incidente, é o que impede que a resposta a um teste vermelho
seja improvisada sob pressão.

### O que cada agente é, antes do que ele faz

Um agente aqui não é um assistente genérico que recebe tarefas variadas. Ele é um papel, com
três coisas atadas a si: um escopo de autoridade, que define o que ele pode decidir; um
artefato de saída, que define o que ele entrega; e um conjunto de proibições, que define o que
ele não pode tocar mesmo que consiga.

| Papel | O que ele é | O que ele entrega |
|---|---|---|
| Analista | A leitura fria da realidade | Relatório que cruza o documento com o código e lista as divergências |
| Gerente de produto | O dono da decisão de produto | Requisitos e decisões fechadas, com o motivo de cada uma |
| Arquiteto | O dono da forma técnica | Desenho da solução e plano de migração, sem escrever código |
| Scrum master | O tradutor de plano em trabalho | Stories com critérios de aceite verificáveis |
| Product owner | O guardião da coerência | Validação da story antes de ela virar código |
| Desenvolvedor | O executor | Código, testes e as caixas de seleção marcadas |
| QA | A verificação independente | Veredito formal com evidência reproduzida |
| DevOps | O responsável pela porta de saída | Publicação, com autoridade exclusiva sobre isso |

Vale insistir na última coluna da terceira linha, porque ela costuma surpreender: o arquiteto
não escreve código. O documento de arquitetura deste projeto afirma, na abertura, que nenhuma
linha do código-fonte foi alterada durante a sua escrita. Separar quem desenha de quem
implementa parece burocracia até você perceber o efeito prático, que é obrigar o desenho a
ficar completo o bastante para outra pessoa executar, em vez de permanecer meio implícito na
cabeça de quem já está com o editor aberto.

Do mesmo modo, o DevOps tem autoridade exclusiva sobre publicar. Nenhum outro papel envia
código para fora, mesmo tendo capacidade técnica para isso, porque concentrar a saída num só
lugar significa que existe exatamente um ponto onde as verificações finais acontecem.

### O fluxo, do pedido ao commit

O caminho de uma mudança é sempre o mesmo, e cada troca de mãos muda o estado da story, que
percorre os valores Draft, Ready, InProgress, InReview e Done.

O scrum master escreve a story e ela nasce em Draft. O product owner valida contra uma lista
de verificação e, se aprovar, move para Ready, o que significa que a story está clara o
suficiente para ser executada por alguém que não participou de nenhuma conversa anterior. O
desenvolvedor pega a story em Ready, move para InProgress, implementa, marca as caixas
concluídas e move para InReview. O QA então revisa e emite um veredito, que pode ser aprovação,
aprovação com ressalvas, reprovação ou dispensa formal; nos dois primeiros casos a story vai
para Done, enquanto a reprovação devolve o trabalho ao desenvolvedor com a lista do que falta.
Só depois disso o DevOps publica.

O detalhe que faz esse ciclo funcionar é que o veredito do QA não é uma mensagem, e sim um
arquivo versionado junto com o código. No meu repositório ele é um YAML que registra o
identificador da story, o veredito, o commit exato que foi revisado, a lista de verificações
executadas, o resultado individual de cada critério de aceite e os problemas encontrados, cada
um com identificador, severidade, descrição e ação sugerida. Como o arquivo fica no repositório,
a revisão passa a ter a mesma durabilidade do código, e a pergunta "por que isso foi aprovado?"
tem resposta seis meses depois.

### Por que isso pega o que uma pessoa sozinha não pega

Dois episódios reais explicam melhor do que qualquer princípio.

O primeiro é sobre verificação independente. Ao revisar a `debt.0`, o QA precisava confirmar que
o novo teste realmente falha quando deveria falhar. Em vez de reler o código do desenvolvedor,
ele reproduziu o teste negativo do zero, e escolheu deliberadamente campos diferentes dos que o
desenvolvedor tinha usado, verificando que a comparação acusava divergência nomeando semente e
campo em cada caso. A diferença entre concordar com um teste e reproduzi-lo com entradas
próprias é a diferença entre revisão e carimbo.

O segundo é sobre limites. Nessa mesma revisão, o QA notou que as caixas de seleção das tarefas
continuavam desmarcadas mesmo com a story implementada, o que contraria a regra do projeto. Ele
não marcou as caixas, ainda que fosse trivial: registrou o problema, atribuiu severidade baixa e
anotou a justificativa de que aquela seção pertence ao desenvolvedor e o QA não a edita. Manter
essa fronteira parece preciosismo até você considerar a alternativa, na qual o revisor conserta
silenciosamente aquilo que revisa e, a partir daí, ninguém consegue mais dizer se o trabalho
estava certo ou se apenas foi corrigido durante a conferência.

Some-se a isso um princípio que o projeto chama de "não invenção", segundo o qual toda afirmação
num documento precisa poder ser rastreada até um requisito, uma medição ou uma decisão registrada.
É uma regra chata de seguir e é justamente ela que impede o acúmulo de justificativas plausíveis
que ninguém verificou.

### O que o método encontrou neste caso

O analista encontrou quatro contradições entre o documento de design e o código, e a mais séria
delas é que metade da loja não tem onde encaixar na simulação. O item que aumenta elasticidade
não tem ponto de aplicação, dado que a elasticidade é uma constante global do módulo de física e
não uma propriedade de cada bola, enquanto o item que reduz tempo de recarga simplesmente não tem
onde ser aplicado, porque o cooldown é somado ao relógio sem passar por multiplicador nenhum.
Note que o problema não é de código faltando, e sim de uma decisão de produto tomada no papel sem
que existisse o lugar onde ela viveria.

A segunda contradição é mais discreta e bem mais cara. As habilidades passivas escrevem seus
efeitos por atribuição direta, sessenta vezes por segundo, o que hoje é inofensivo porque itens
ainda não existem; mas na Fase 3, quando o jogador comprasse uma turbina para o Vex, a passiva
dele apagaria esse bônus sessenta vezes por segundo, e o jogador pagaria por um item que não faz
absolutamente nada. A solução desenhada foi separar o que era um único número em camadas com
papéis distintos, de forma que o valor base do personagem, os bônus de passiva e os bônus de item
passam a viver em lugares diferentes, sendo o valor final derivado deles pela fórmula base × (1 +
soma dos bônus), com um teto escrito para cada atributo. A parte instrutiva está na escolha de
somar os bônus em vez de multiplicá-los: quando dois itens multiplicam, o efeito de cada um
depende do que o outro está fazendo, o que torna impossível olhar uma matriz de vitórias
desequilibrada e dizer qual item causou o problema, ao passo que a soma preserva a atribuição de
causa, que é exatamente do que a Fase 2 vai precisar.

O arquiteto respondeu com um plano de migração em oito passos, dos quais sete produzem um
resultado idêntico bit a bit, provado com aritmética antes de qualquer código ser escrito, de
maneira que a refatoração inteira acontece com o comportamento do jogo congelado e só muda quando
o primeiro item de verdade existir. De quebra, ele apontou que meu teste de determinismo era mais
fraco do que eu imaginava, uma vez que ele rodava cada semente duas vezes e comparava os
resultados entre si, provando que a simulação era reprodutível sem provar que ela continuava
sendo a mesma de ontem; uma refatoração conduzida sob esse critério seria conduzida no escuro. A
primeira tarefa do épico virou, por isso, gravar valores de referência e compará-los a cada
execução, e só então as outras sete puderam começar.

Nada disso é mágica, e talvez seja essa a conclusão mais útil do post. O método descrito aqui não
depende de inteligência artificial para existir, porque ele é apenas trabalho organizado em
papéis com fronteiras, artefatos duráveis e verificação independente, algo que equipes humanas
fazem há décadas. O que a automação mudou foi o preço: escrever o relatório, cruzar documento e
código linha a linha, desenhar a migração antes de migrar e revisar reproduzindo em vez de
concordar são atividades que eu, sozinho, teria pulado por custarem tempo demais para um projeto
de fim de semana. Elas ficaram baratas o suficiente para eu de fato fazer, e o gargalo do
trabalho deixou de ser digitar para passar a ser decidir.

## A próxima pergunta

A Fase 1 tem uma pergunta só: dois polegares mirando ao mesmo tempo funcionam, ou um atrapalha o
outro?

Eu não sei, e nenhum documento resolve isso, porque a resposta depende de coordenação motora e
não de raciocínio, o que exige protótipo na mão, num celular de verdade, com o layout em paisagem
e os quatro botões semitransparentes no lugar.

O critério já está escrito, para que eu não consiga me enganar depois: se em mais de 70% das
rodadas o jogador usar só uma das mãos e ignorar a outra, então o controle de duas bolas falhou,
e o plano B é um jogo diferente, com uma bola pilotada e uma automática. Escrever o número antes
de medir é o que separa um teste de uma justificativa, já que depois do resultado é sempre
possível encontrar uma leitura confortável.

O próximo devlog responde isso. Se a resposta for não, ele vai dizer que foi não.

---

*Escrito enquanto a rodada ainda dura 13,8 segundos.*
