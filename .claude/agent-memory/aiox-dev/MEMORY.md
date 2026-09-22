# Memory Index — @dev (Dex) · Battle Balls

- [CodeRabbit indisponível nesta máquina](project_coderabbit_unavailable.md) — o gate por WSL não roda aqui; cubra com `npm run check` + `npm run sim:check`.
- [Escopo da story vence artefato de framework](feedback_story_scope_artifacts.md) — AC que lista arquivos permitidos? Self-critique e logs vão inline no Dev Agent Record.
- [Bateria negativa: use Node, não python](project_bateria_negativa_toolchain.md) — python não existe aqui e falha com exit 0; perturbação silenciosa vira conclusão errada.
- [Grep de pureza de src/net/ casa comentários](project_net_purity_grep.md) — não cite a lib de socket em comentário; use `grep -rn`.
- [Golden hash / replay não provam correção](project_golden_hash_cobertura.md) — hash e replay medem "nada mudou"; provar que algo FUNCIONA exige teste dirigido de valores.
- [AC de tamanho de diff precisa de prova no tsc](project_ac_diff_size_claims.md) — "exatamente N linhas" em arquivo tipado pode ser impossível; experimente e reverta antes.
- [Orçamento de bytes depende da codificação](project_orcamento_bytes_codificacao.md) — 263 B de §1.2 é tupla compacta; JSON com nomes dá 873 B sem vazar classe 3.
- [Commit de implementação separado da story](feedback_commit_escopo_separado.md) — AC que fixa o `git show --stat`? Implementação num commit, story em outro.
- [git checkout regrava em CRLF](project_autocrlf_checkout_crlf.md) — autocrlf=true: depois de `checkout --`, normalize para LF antes de mutar.
- [Commits paralelos mudam a base](project_commits_paralelos_base.md) — @sm commita na mesma árvore; leia o pai do commit depois de commitar.
- [Cópia descartável por git archive](project_git_archive_copia_descartavel.md) — `-o` absoluto; tar com C: falha; árvore não commitada: cp + junction (MSYS_NO_PATHCONV), rmdir.
