---
name: git-archive-copia-descartavel
description: Throwaway src/ copies for mutation runs on Windows — `git -C repo archive -o rel.tar` writes INTO the repo, and a tar pipe with a C:\ path fails
metadata:
  type: project
---

To build a throwaway copy of a commit for mutation runs (AC "cópia descartável, nunca a árvore compartilhada"), use:
`git -C "<repo>" archive -o "<ABSOLUTE dir>/a.tar" <commit> src package.json`, then `tar -xf a.tar` with `cwd: dir`.

**Why:** in debt.14 (2026-09-21) two variants went wrong. `-o a.tar` together with `-C` resolved relative to the repo
and dropped a 768 KB `a.tar` into the shared tree. I caught it with `git status` and deleted it. And
`git archive | tar -x -C "C:\..."` fails, because tar reads `C:` as a remote host.

**How to apply:** always use an absolute `-o` path, extract with cwd instead of `-C <windows path>`, and run
`git status --short` afterwards. Include `package.json`, because `node src/tools/determinism.ts` needs its ESM `type`.
Normalize CRLF→LF before textual mutation.

**Uncommitted tree variant (e4.10, 2026-09-21):** to mutate BEFORE committing, `cp -r src` into the scratchpad and
give the copy `node_modules` via junction: `MSYS_NO_PATHCONV=1 cmd /c mklink /J "<win copy>\node_modules" "<win repo>\node_modules"`.
Without `MSYS_NO_PATHCONV`, Git Bash rewrites `/J` and mklink fails with "Opção inválida". To clean up, run
`cmd /c rmdir` on the junction, never `rm -rf`, which can follow it into the real `node_modules`. A mutation script
that restores `src/` from a pristine copy each run, and asserts each pattern matches exactly once, avoids surprises.
Two identical call sites (for example `enviarVisao` + `sincronizar`) need a longer anchor.
**More reliable (e4.4, 2026-09-22):** `cmd //c mklink` with `MSYS_NO_PATHCONV=1` opened an INTERACTIVE cmd, which hung
the Bash call until I killed it. Use PowerShell instead:
`powershell -NoProfile -Command "New-Item -ItemType Junction -Path '<copy>\node_modules' -Target '<repo>\node_modules'"`.
To remove it, use `(Get-Item '<copy>\node_modules').Delete()`, which deletes only the link. Do not use a stray `cat`
with no input in a Bash chain: it waits on stdin forever. Also see [[project_autocrlf_checkout_crlf]] and
[[project_bateria_negativa_toolchain]].
