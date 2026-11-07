# Truco Trainer

Jogo de truco mineiro (manilha fixa) contra bots. O objetivo número 1 é
**me fazer melhorar como jogador**: no fim de cada partida o app analisa
minhas decisões e me diz onde errei e por quê. Jogar é o meio, evoluir é o fim.

**Fase atual: 2 (feedback pós-partida).** Fase 1 concluída (motor, bots,
UI 1x1/2x2, sinais). Não adiante nada das fases seguintes.

---

## Como trabalhar comigo

- **Eu decido a arquitetura.** Em escolhas de arquitetura, biblioteca ou
  padrão, apresente as opções com tradeoffs e espere minha decisão. Não
  decida sozinho.
- **YAGNI é lei.** Construa só o que a fase atual pede. Se achar que algo
  extra vale a pena, avise e espere meu ok antes de fazer.
- **Passos pequenos e testáveis.** Nada de despejar um monte de arquivos de
  uma vez. Um passo, eu testo, seguimos.
- **Me ensine enquanto constrói.** Ainda estou aprendendo Angular/TS:
  explique os conceitos novos quando aparecerem (signals, DI, standalone,
  tipagem etc.).
- **Código claro > código esperto.** Nada de "mágica" que eu não entenda.
- **Idioma:** converse comigo em português; código, nomes, commits e
  comentários técnicos em inglês.

---

## Stack

- Angular (standalone components) + TypeScript.
- Sem backend (YAGNI). Estado e histórico em `localStorage`.
- UI caprichada: tema de mesa de carta, limpa e responsiva.

---

## Regras do jogo (truco mineiro, manilha fixa)

- **Baralho limpo, 27 cartas:** Q, J, K, A, 2, 3 dos 4 naipes + as
  manilhas 4♣, 7♥, 7♦ (o A♠ já está entre os ases). Sem 5, 6, 8, 9, 10,
  sem coringas; 4 e 7 só existem como manilha.
- **Manilhas fixas** (da maior pra menor):
  zap 4♣ > copas 7♥ > espadão A♠ > pica-fumo/mula 7♦.
- **Cartas comuns** (da maior pra menor):
  3 > 2 > A > K > J > Q.
- **Mão** = melhor de 3 rodadas.
- **Apostas:** truco (3) > seis (6) > nove (9) > doze (12).
- **Mão de 11:** quando um time tem 11 pontos, a mão já vale 3 e ele vê as
  próprias cartas antes de decidir se joga.

### Decisões de regra (fechadas)
- **Alvo da partida:** configurável, 12 ou 24 pontos.
- **Correr:** entrega o valor anterior da aposta (correr do truco = 1,
  do seis = 3, do nove = 6, do doze = 9).
- **Pedir truco/aumento:** só na própria vez, antes de jogar a carta.
- **Responder:** quem responde é o adversário que joga logo depois de quem
  pediu (no 2x2, os parceiros não se consultam). Respostas: aceitar, correr
  ou aumentar na hora (ex.: truco → seis). Aumentar em cima de um pedido
  equivale a aceitá-lo; o novo pedido é respondido pelo jogador seguinte a
  quem aumentou.
- **Direito de aumentar alterna:** depois de aceito, só o time que aceitou
  pode pedir o próximo aumento (mais tarde, na sua vez). Quem pediu nunca
  aumenta em cima de si mesmo.
- **Sinais (só 2x2, só em mão normal):** antes da 1ª carta há uma rodada de
  sinais: cada jogador, a partir de quem é mão, faz um sinal ou fica
  quieto. Sinais clássicos, cada um anuncia a maior carta: zap = piscar,
  copas = sobrancelha, espadão = boca torta, pica-fumo = língua, três =
  morder o lábio, nada = encolher os ombros, **deixa comigo** = bater no
  peito (≥ 2 cartas fortes, manilha ou 3, sendo ao menos uma manilha; o
  parceiro bot que recebe joga sempre a menor, nunca corre de aposta e não
  pede truco por conta própria). Mentir é permitido. O parceiro
  sempre vê; cada rival tem 25% de chance de flagrar. Quem flagra o quê é
  sorteado pela seed na hora de dar as cartas (motor segue determinístico).
- **Formato:** 1x1 e 2x2 (parceiro bot). Motor genérico pra 2 ou 4
  jogadores desde o início; entregar 1x1 jogável primeiro, 2x2 em seguida.
- **Quem é mão:** a 1ª mão da partida é sorteada (pela seed); depois roda
  pro próximo assento a cada mão.
- **Mão de 11** (na partida de 24, "mão de 23": sempre um ponto da
  vitória): o time com 11 vê as cartas e decide: jogar (vale 3) ou correr
  (adversário ganha 1). No 2x2 cada um só vê as próprias cartas, e decide o
  jogador desse time mais próximo de ser mão.
- **Mão de ferro** (os dois times a um ponto da vitória): todos jogam sem
  ver as cartas, vale 1. Esconder as cartas é papel da UI e do bot; o motor
  não sabe o que cada um "vê".
- **Truco na mão de 11 e de ferro:** o motor oferece a opção, mas quem pede
  perde a mão na hora (adversário leva o valor atual). É um erro detectável
  pro feedback.
- **Cangou:** se a 1ª rodada cangou, quem ganhar a próxima leva a mão. Se a
  1ª teve vencedor e uma rodada seguinte cangou, leva quem ganhou a 1ª. Se
  as 3 cangarem, ninguém pontua. Após uma rodada cangada, quem começou essa
  rodada começa a próxima.
- **Vencedor da rodada:** quem jogou a maior carta abre a próxima rodada. No
  2x2, se os dois parceiros empatam na maior carta, o time ganha (não é
  cangou); abre quem jogou essa carta primeiro.

---

## Decisões de arquitetura (fechadas)

- Motor em `src/app/engine/`, TypeScript puro. **Proibido importar Angular
  ali** (regra de disciplina, não forçada pelo build).
- Estado do jogo imutável, alterado por funções puras:
  `applyAction(state, action) => newState` + `getLegalActions(state)`.
- Aleatoriedade com seed: nunca `Math.random` direto. A partida guarda a
  `seed` no estado e cada mão usa `createRng(seed + handNumber)`. Mesma
  seed = mesma partida, e o estado continua sendo só dados.
- Histórico de decisões: `MatchState.history` guarda só as ações
  (`{ handNumber, action }`) de todos os jogadores. Qualquer momento é
  reconstruído rodando o motor de novo a partir da seed (replay).
- Bot (e futuramente o feedback) decide a partir de uma `PlayerView`
  (`getPlayerView(match, seat)`): só o que aquele assento enxerga. Nunca
  recebe o `MatchState` inteiro.
- Bot avalia a mão com uma nota 0..1 e compara com limiares derivados de
  `aggressiveness`/`bluffChance`. Um nível de dificuldade por ora
  (`DEFAULT_BOT`); níveis futuros = presets de `BotParams`.
- UI: `GameService` (`providedIn: 'root'`) guarda o `MatchState` num
  signal e expõe `computed`s; componentes só leem e chamam métodos. O bot
  joga via `setTimeout` agendado pelo serviço depois de cada ação (sem
  `effect()` alterando estado). Componentes: Setup, Table, Card. Cartas
  desenhadas em HTML + CSS.
- Mesa: o humano é sempre o assento 0, embaixo. No 2x2 a vez gira no
  sentido anti-horário: assento 1 à direita (Rival 1), 2 em cima (Parceiro),
  3 à esquerda (Rival 2). Todos os outros assentos são bots.
- Testes com Vitest.
- Estilo em SCSS próprio, sem framework de UI.

---

## O motor é a autoridade

Toda regra, jogada legal e resultado vêm do **motor de regras
determinístico**. Qualquer camada "inteligente" (bot ou feedback) só escolhe
**dentro** do que o motor permite — nunca inventa jogada ou regra.

Consequências práticas:
- O motor é TypeScript puro, sem dependência de Angular, e testável isolado.
- Componentes de UI não contêm regra de jogo; só leem estado e despacham ações.
- Bot e feedback recebem a lista de ações legais do motor e escolhem dela.

---

## Bots

- Lógica por heurística, **não** LLM.
- Dois parâmetros regulam o comportamento: `aggressiveness` e `bluffChance`.
- Níveis de dificuldade = ajustar esses parâmetros + sofisticação da
  avaliação de mão. **Não** reescrever o bot por nível.
- **Melhoria do bot (em andamento):** heurísticas melhores, sem Monte Carlo
  (isso é Fase 3). Probabilidades exatas em `src/app/engine/odds.ts`, usadas
  pelo bot e pelo feedback. Toda melhoria é medida num **teste de arena**:
  centenas de partidas com seed contra uma cópia congelada do bot antigo
  (`bot/baseline.ts`, só pra teste); o bot novo precisa vencer por margem.
  Níveis de dificuldade ficam pra depois.
  - Bot avalia `winChance` (chance de o time ganhar a mão, com contagem de
    cartas) e decide aceitar/jogar a mão de 11 comparando a chance de ganhar
    a **partida** (`matchWinChance`, fórmula da ruína do jogador) aceitando
    vs correndo, com margem de segurança. No começo da partida isso equivale
    a aceitar truco a partir de ~1/3; perto do fim o placar muda a decisão.
  - Lê apostas: cada truco/aumento de rival na mão desconta da chance.
    Blefe só 1x por mão e só com rivais provavelmente sem manilha.
  - Regra: parceiro anunciou zap/copas (ainda não jogado) → nunca corre de
    truco simples.
  - Cartas: pergunta ao motor (`roundWinner`) o que cada carta faz; cangar de
    propósito quando não dá pra ganhar (exceto após perder a 1ª). Testado e
    rejeitado na arena: abrir fraco após ganhar a 1ª; segurar carta porque o
    parceiro "cobre" pelo sinal.
  - Deixa comigo: se os dois parceiros disseram, o bot joga pelo próprio
    julgamento (senão ninguém tentaria ganhar).
  - Arena atual contra o baseline: até 12 ~61% (1x1) / ~65% (2x2); até 24
    ~69% / ~64%.

---

## Feedback de performance (feature central — Fase 2)

Ao fim de cada partida, gerar um relatório heurístico: o motor registra cada
decisão minha e compara com a decisão recomendada pela lógica + estatística
do jogo.

> Na Fase 1, só garanta que o motor **registre o histórico de decisões** de
> forma que o feedback possa ser plugado depois. Não implemente a análise.

**Decisões da Fase 2 (fechadas):**
- Analisador em `src/app/feedback/`, TypeScript puro. Reconstrói a partida
  por replay (seed + histórico) e julga cada decisão minha.
- Cada erro é um **detector** explícito, apoiado em contas exatas com as
  cartas ainda não vistas; cada achado traz o porquê em 1 linha.
- A nota usa só o que eu sabia na hora (`PlayerView` daquele momento). O
  relatório pode **revelar** o que os outros tinham, como curiosidade, sem
  mudar a nota.
- Começar pelos 4 detectores núcleo: correr de mão forte; truco/aceite com
  mão fraca; desperdiçar manilha; queimar a melhor carta cedo. Depois:
  blefe que faltou, ignorar sinais do rival, erros de sinal, mão de 11.
- `localStorage` guarda por partida: config (seed) + ações + resumo
  (data, placar, vitória, nota). O relatório é recalculado ao abrir.
- **Critérios dos detectores** (carta *segura* = rival tem ≤ 20% de chance
  de batê-la):
  - **No 2x2 os detectores olham o time:** contam as cartas que o parceiro
    anunciou por sinal (e ainda não jogou), só se eu vi o sinal. Com
    "deixa comigo" do parceiro, aceitar nunca é erro.
  - *Correr de mão forte:* correu tendo nº de cartas seguras ≥ rodadas que
    faltam pra ganhar a mão.
  - *Mão fraca* = nenhuma rodada ganha e rival com ≥ 50% de chance de bater
    minha melhor carta (limite próprio, mais solto que o de carta segura). Aceitar
    (inclusive jogar a mão de 11) assim = erro. Pedir/aumentar assim = blefe
    (não é erro); blefe deu certo se o rival correu.
  - *Desperdiçar manilha:* só quando eu fecho a rodada (último a jogar):
    joguei manilha e uma carta mais fraca minha teria o mesmo resultado, ou
    nenhuma carta minha ganharia e eu tinha uma mais fraca.
  - *Queimar a melhor carta cedo:* abri a 1ª rodada com minha carta mais
    forte, sendo ela manilha.
- **Nota de qualidade** = % das decisões sem erro, contando só jogar carta,
  pedir, aceitar e correr.
- **Telas com Angular Router:** `/` início, `/mesa` (só com partida em
  andamento), `/relatorio/:id`, `/historico`. Fim de partida mostra
  VITÓRIA/DERROTA + nota + botão "Ver análise". Histórico = lista simples
  com win rate, nota média e acerto de blefe (gráficos ficam pra Fase 4).

**Erros a detectar (exemplos):**
- Corri de uma mão forte (tinha manilha alta / carta vencedora viva).
- Pedi truco ou aceitei aumento com mão fraca, sem blefe justificável.
- Desperdicei manilha (carta alta em rodada já ganha ou já perdida).
- Queimei minha melhor carta cedo demais sem necessidade.
- Deixei de blefar numa situação estatisticamente favorável
  (ex.: zap já saiu, chance alta de o adversário não ter manilha).
- Aceitei aumento ignorando sinais de força do adversário.

**O relatório traz, por partida:**
- Resumo: vitória/derrota, placar, nº de mãos.
- Momentos-chave: o que fiz, o que seria melhor, e o porquê em 1 linha
  (didático, linguagem de jogador).
- Métricas: win rate, taxa de acerto em blefe, qualidade média das decisões.
- Histórico salvo no `localStorage` pra acompanhar evolução.

---

## Fases (uma de cada vez)

1. **MVP:** motor de regras + partida contra bot simples + UI jogável.
2. **Feedback pós-partida** (heurístico) — a razão de existir do projeto.
3. **Painel de estatística:** simulação Monte Carlo com as probabilidades reais.
4. **Dashboard de evolução** ao longo do tempo.

---

## Fora de escopo por ora (YAGNI)

- Multiplayer online, contas/login, backend, mobile nativo, sons.
- Bots com LLM (possível fase futura via proxy Spring Boot — não agora).
- Feedback via LLM (o heurístico resolve a Fase 2).
