# Evidência de telemetria — sessões humanas de e3.5/e3.6 (P3.1/P3.2)

Exports do coletor de `e3.5` (`client/telemetria.ts`), preservados aqui pelo gate de QA de `e3.6`
(DOC-104: a evidência que justifica o único movimento de golden hash da Fase 3 não pode viver só
na pasta Downloads do usuário). O coletor **acumula** em `localStorage` entre sessões — cada export
é um superconjunto dos anteriores; o último arquivo é o registro definitivo e os anteriores provam
a linha do tempo.

Checksums MD5 conferidos pelo @qa em 2026-08-16 contra os originais em Downloads:

| Arquivo (timestamp do export) | MD5 | Conteúdo novo naquele export |
|---|---|---|
| `…1785815023371.json` (2026-08-04 00:43 −03) | `3ed7358940ded207d8598458fe489e8c` | partida 262981154 (3 rodadas, 11.7-15.3s) — **pré-alavanca** (×1.0), era de e3.4/e3.5 |
| `…1785816621271.json` (2026-08-04 01:10 −03) | `84abafd4c0fe17f52ccc9476a48ddfef` | partida 320638362 (4 rodadas, 12.2-20.4s) — **pré-alavanca**; sessão de TOQUE citada pelo gate FAIL de e3.5 (TEL-E35-006, "23 casts, 23 pointerId distintos"); estava untracked em `docs/`, movida para cá |
| `…1785908807719.json` (2026-08-05 02:46 −03) | `a00588643110f6e186548faeae81d71e` | partidas 734981348 e 21386782 (~14s, escala não citada na bissecção) + **partida 82669425 = a sessão ×2.0 da bissecção** (29.2/21.3/27.4/22.9/21.1s, mediana 22.9s, n=5) |
| `…1785909111972.json` (2026-08-05 02:51 −03) | `a511ba695f9b2d040b0fb6ec6f69f600` | **partida 12294565 = a sessão ×3.0** (22.6/23.5/24.6/21.0s, mediana 23.0s, n=4) |
| `…1785909682703.json` (2026-08-05 03:01 −03) | `65c05271df9fdd705180c42de7f759ea` | **partidas 992276418 e 670239056 = as duas sessões ×6.0** (27.7/26.5/25.1s + 67.0/71.1/58.4/71.8s, mediana conjunta 58.4s, n=7, `atingiu60s: true` em 3 das 4 últimas) — **este é o arquivo definitivo**, contém todas as partidas acima |

## A linha do tempo intercala exatamente com os commits da bissecção de e3.6

| Hora (−03, 2026-08-05) | Evento |
|---|---|
| 02:41:33 | commit `0ac1f7c` — alavanca criada, `ESCALA_HP = 2.0` |
| 02:46:47 | export `…8807719` — sessão ×2.0 jogada (partida 82669425, mediana 22.9s) |
| 02:49:08 | commit `a4c2927` — `ESCALA_HP` 2.0 → 3.0 |
| 02:51:51 | export `…9111972` — sessão ×3.0 jogada (partida 12294565, mediana 23.0s) |
| 02:54:19 | commit `ddb6281` — `ESCALA_HP` 3.0 → 6.0 (salto diagnóstico) |
| 03:01:22 | export `…9682703` — sessões ×6.0 jogadas (992276418 + 670239056, mediana 58.4s) |
| 03:45:58 | commit `13ee9d8` — re-baseline em `ESCALA_HP = 6.0`, decisão de produto |

Todas as rodadas citadas têm `controle: ["humano","bot"]` — sessões humanas reais, exatamente o que
T-2 de `e3.6` exige como evidência P3.1. Os números da tabela de bissecção do Dev Agent Record de
`e3.6` reproduzem **verbatim** destes arquivos (conferido rodada a rodada pelo @qa).

As partidas 734981348 e 21386782 (~14s de mediana) não são citadas na tabela de bissecção — as
medianas são consistentes com ×1.0 (jogadas antes do build ×2.0 publicado chegar ao navegador);
ficam registradas sem atribuição de escala, como o arquivo as trouxe.
