---
name: e4-versao-do-fio
description: Decisões de E48-ARC-003 (bed4603, §11.6.1 de architecture-e4.md) — story nova e4.9 antes de e4.3, fixture em debt.12, achado do segredo de assento, O-1 aberta
metadata:
  type: project
---

Decidido em 2026-09-21 (commit `bed4603`, `docs/architecture-e4.md` §11.6.1): `VERSAO_DO_FIO` +
`{t:'sala'}` com `versao` (tipo literal) e `assento`, conferida por `decodificarDoServidor`, numa
story nova (sugestão `e4.9`) entre `debt.11` e `e4.3`; `debt.12` congela `FIO_CONGELADO` (lista só de
acréscimo) com amostra própria.

**Why:** gatilho da §11.6 não tinha dono; e o `{t:'sala'}` não tinha campo para o segredo de assento
que `e4.0`/AC 12 e `e4.4`/AC 7 exigem (achado M-4) — `e4.4` era inimplementável no próprio escopo.

**How to apply:** ao revisar `e4.3`/`e4.4`/`e4.5`/`e4.7`/`debt.12`, conferir se os deltas da §11.6.1
foram aplicados pelo @po. O-1 (buffer do cliente vs override de `SNAPSHOT_HZ` só no servidor na
varredura de `e4.7`) ficou devolvida ao @po, não decidida. Ver [[fase3-loop]].

**E49-REQ-004 (2026-09-21, `6c6b9a0`): descida permissiva de propósito.** O critério (i) versão,
(ii) valor fora do tipo do produtor, (iii) erro longe da causa está no adendo da §11.6.1. Medido: todas
as variantes não-`snap` da descida passam de corpo vazio, então o achado era mais largo que o `sala`.
Não reabrir por campo extra ou `jogador`/`estado`. O bug plausível, `jogador` trocado entre assentos,
é da guarda do produtor (`e4.3`/AC 11 e). Essa ficou como delta recomendado ao @po.

**Gate de `e4.3` (2026-09-21, `188998e`, §2.2 + §11.6.2):** hash do servidor por seta declarada
`server/main.ts → tools/harness.ts` (só `hash`), não por mover; `{t:'evento'}` por assento (privado se tem
`jogador`) com `VERSAO_DO_FIO` 2 numa story nova (`e4.10`) entre `debt.12` e `e4.6`; `FIO_CONGELADO` ganha
`variantes` (item 5), porque os itens 1-4 não pegam variante nova sem bump. A pausa de R-02 não reserva
nada no fio. **Why:** broadcast de evento vazava o `buildPadrao` (= build 0/0) do ausente na pausa de
R-02, medido. **How to apply:** `debt.12` estava em implementação na árvore quando decidi — conferir se o
delta `variantes`/item 5/caso `VERSAO_DO_FIO + 1` chegou a ela antes do gate; senão vira achado.

**`'shield'` na amostra (2026-09-21, `00c628d`, errata DEBT12-ARC-001):** não é `EffectKind`, fica de
propósito, sem bump. A v2 da `e4.10` repete o texto da v1 com `'shield'`, e a troca por `'dot'` vai na
primeira subida que mudar o layout do `snap`. **Why:** snap igual entre v1 e v2 prova, pelo diff, que só
`variantes` mudou. **How to apply:** no gate da `e4.10`, a entrada 2 com o kind trocado é desvio. Amostra
nova com asserção de tipo também é desvio.
