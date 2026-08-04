---
name: battle-balls-hosting
description: Battle Balls é publicado no GitHub Pages via Actions em britopoceno/battle-balls, branch master, para o usuário testar o jogo no celular
metadata:
  type: project
---

O jogo Battle Balls é hospedado em `https://britopoceno.github.io/battle-balls/`
(repo `britopoceno/battle-balls`, branch padrão **`master`**, não `main`).
Pages está configurado com `build_type: workflow` — o deploy roda `vite build`
pelo workflow `.github/workflows/deploy-pages.yml`, acionado por push em `master`.
O `vite.config.ts` usa base condicional para o subcaminho `/battle-balls/`.

**Why:** o usuário quis testar o jogo no celular, e um build estático servido por
Pages é o caminho mais curto — sem servidor, sem conta nova. Como o bundle precisa
ser compilado, a fonte tem que ser Actions e não branch estático.

**How to apply:** ao publicar mudanças do jogo, basta push em `master` — o deploy é
automático. Não converter Pages para fonte de branch (quebraria o build do Vite).
Atenção ao nome do branch: comandos com `main` falham neste repo.

**Gotcha de verificação (não use o hash do bundle como prova):** o CSS do jogo vive
num bloco `<style>` inline dentro de `index.html` — não existe `.css` como asset
separado nem `<link rel=stylesheet>`. Logo, um commit só de CSS **não muda** o nome
de `assets/index-<hash>.js`, e isso não significa que o deploy falhou. Para provar
que uma mudança de CSS foi ao ar, faça grep das regras novas no HTML servido e
confira o SHA publicado em
`gh api "repos/britopoceno/battle-balls/deployments?environment=github-pages&per_page=1"`.
O deploy inteiro leva ~35s, então não vale ficar em polling longo.

**Gotcha operacional:** o hook `.claude/hooks/enforce-git-push-authority.cjs`
(Constitution Art. II) bloqueia `git push` / `gh pr create|merge` e a mensagem de erro
não diz como resolver. A identidade do agente vem de env var — declarar no escopo do
comando resolve: `AIOX_ACTIVE_AGENT=devops git push ...`. Só o @devops deve fazer isso.
O `gh` não está no PATH do Bash; usar `"/c/Program Files/GitHub CLI/gh.exe"`.
