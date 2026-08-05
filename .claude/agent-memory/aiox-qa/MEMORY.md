# Memória — @qa (Quinn) · Battle Balls

- [Verificação independente em gates](feedback_verificacao_independente.md) — reexecutar comandos e reproduzir testes negativos do zero; nunca aceitar alegação da story.
- [Sintético herda a premissa errada](feedback_sintetico_herda_premissa.md) — em borda de plataforma (Pointer Events, sensores), exigir artefato do aparelho-alvo; fixture meu não basta.
- [Migração debt.0–debt.7 (épico FECHADO)](project_migracao_debt.md) — golden hash intacto nos 8 gates; lições, técnicas e o que fica aberto para a Fase 3.
- [Épico E2 / arnês (Fase 2) — FECHADO em e2.8](project_fase2_arnes.md) — 9 gates: golden hash não protege ordem de comandos **nem o caminho de instrumentação LIGADA**; `!(x>0)` barra NaN mas `x<limiar` deixa passar; **o call site nunca é testado (4ª vez)**; portão insatisfazível no próprio `n`; varrer a base de seed derruba vereditos; 7 MEDIUM abertos para Fase 3/5.
