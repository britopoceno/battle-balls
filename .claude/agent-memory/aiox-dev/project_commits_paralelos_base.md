---
name: commits-paralelos-base
description: Other agents (@sm/@po) commit in the same tree during a story; the "base" of the implementation commit must be read after committing, not from HEAD at start
metadata:
  type: project
---

@sm/@po commit story docs into the same working tree while @dev implements (e4.9: `d378ca5` landed between my start at `c5459e0` and my commit `6f2f56c`).

**Why:** The Dev Agent Record said "base c5459e0" and was wrong. The parent was the @sm docs commit. @qa checks `git show` and the parent.

**How to apply:** Get the parent with `git log --oneline <impl>^ -1` after committing, then write it into the story. If the intervening commit is docs-only, say so ("code identical"). Stage only your own files, by name. Related: [[feedback_commit_escopo_separado]].
