---
name: e4-gates-e45-e46
description: Decisões de 2026-09-22 (commit 3e46e3d, architecture-e4.md §6.3, §7.3, §9.1, §9.2) sobre E45-REQ-001, E45-ARC-001, E46-ARC-001/002 — e4.11 e e4.12 sugeridas
metadata:
  type: project
---

Decidido em 2026-09-22 (`3e46e3d`):
- **§6.3 (E45-REQ-001):** o segredo fica em `sessionStorage` e em `localStorage`. O 1º `entrar` vai sem segredo
  quando a sessão não tem um. Só depois de um `{t:'erro'}` o cliente manda um 2º `entrar` com o segredo do
  `localStorage`, na MESMA conexão. Medido: `server/main.ts:240-243` deixa a conexão recusada aberta, e isso
  virou contrato. Web Locks foi descartado: só existe em contexto seguro, e o portão é `http://` na LAN.
- **§9.1 (E45-ARC-001):** `baseDoPersonagem(def)` pura em `sim/stats.ts`, e `makeBall` passa a chamá-la. O cliente
  aplica a função a `CHARS`. O fio não muda. Base no `EstaticoDaRodada` foi descartado: quem reconecta na loja
  não recebe `rodadaInicio`.
- **§7.3 (E46-ARC-001/002):** `bb.replay.v2`, com `encerramento` por rodada (`natural`/`wo`, classificado por
  `!over && tick < teto`) e por partida, mais `pool` e o carimbo de código injetado. Não espera R-02. Até a v2
  existir, a `e4.7` exclui da prova de P4.3 as partidas com W.O.
- A story `e4.11` (as duas primeiras decisões e o `.gitignore`) é pré-condição de COLETA da `e4.7`. A `e4.12`
  (replay v2) é pré-condição do portão da fase, mas não da `e4.7`.

**Why:** as duas primeiras restauram requisitos já existentes com o menor escopo possível: nenhuma muda o fio.
A v2 registra fatos e não política. Por isso a pergunta "replay com W.O." não é do usuário.

**How to apply:** no gate da `e4.11`, conferir se houve fechamento real de aba, e não navegação para fora; se a
Couraça do golem mostra +228, e não +38; e se recarregar na loja mantém o preview. No gate da `e4.12`, conferir
o contrafactual `ticks−1`. Ver [[e4-versao-do-fio]] e [[medir-antes-de-propor]].
