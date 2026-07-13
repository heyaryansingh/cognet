# Cognet Agent Coordination Protocol

## Hierarchy

```
director (main worktree — the human-facing session)
├── ideas    (staff)  — product/growth/design ideation, feeds director
├── review   (staff)  — reviews impl output, gates merges, feedback to impl agents
└── impl-1..4 (workers) — bounded implementation in own worktree/branch
```

## Layout

- Main repo: `C:\Aryan\GitHub Projects\cognet` (branch `main`) — director works here.
- Agent worktrees: `C:\Aryan\GitHub Projects\cognet-wt\<agent>` on branch `agent/<agent>`.
- Shared mailbox hub (gitignored, filesystem-shared, no git sync needed):
  `C:\Aryan\GitHub Projects\cognet\coord\`
  - `broadcast.md` — director → everyone. Read on every wake.
  - `<agent>\inbox.md` — messages TO the agent (director or peers append).
  - `<agent>\outbox.md` — agent's reports UP (director/review read these).

## Message format

Appended blocks:

```
## [2026-07-13T14:00:00] from: director  to: impl-1
<body>
```

## Rules

1. **Wake loop:** read `broadcast.md` + your `inbox.md`, do the work, append report to your `outbox.md`.
2. **Routing up:** impl agents also append completion reports to `coord\review\inbox.md` (review is your first gate). Review + ideas report only to their own outbox (director reads it).
3. **Routing down:** only director writes broadcast. Review may write feedback directly to impl inboxes.
4. **Git:** work only on your own branch in your own worktree. Never touch `main`. Director merges after review approves.
5. **Spec is law:** `docs/specs/2026-07-13-cognet-design.md`. Deviations require a note in your outbox before proceeding.

## Director tooling

```powershell
scripts\agentctl.ps1 init                      # create branches + worktrees + mailboxes + per-agent CLAUDE.md
scripts\agentctl.ps1 send all "msg"            # broadcast
scripts\agentctl.ps1 send impl "msg"           # tier fan-out (staff | impl | all)
scripts\agentctl.ps1 send impl-2 "msg"         # individual
scripts\agentctl.ps1 collect                   # dump all outboxes
scripts\agentctl.ps1 status                    # worktrees + mailbox activity
scripts\agentctl.ps1 spawn impl-1              # launch claude --dangerously-skip-permissions in that worktree
scripts\agentctl.ps1 spawn all                 # launch everyone
```
