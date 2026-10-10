# GymIQ: instructions for any AI coding agent

The full operating manual is in [CLAUDE.md](./CLAUDE.md). Read it, then follow the rule below.

## Start of every session (do this first)

1. Run `git pull --ff-only` (if there are unsaved changes, skip the pull and say so).
2. Read `HANDOVER.md` if it exists.
3. Run `git status` and `git log -5`.
4. Tell Paul in a few plain lines where things stand, then wait for his instruction.

Paul switches between Claude, Codex and other tools, including from his phone. `HANDOVER.md` is how they stay in step. Before you stop, update it: what was asked, what is done, what is half done, the exact next step, and what must not be touched.