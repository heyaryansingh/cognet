# agentctl.ps1 - director's control plane for the cognet agent hierarchy
# Usage: agentctl.ps1 <init|send|collect|status|spawn> [target] [message]
param(
    [Parameter(Mandatory = $true)][ValidateSet('init', 'send', 'collect', 'status', 'spawn')][string]$Cmd,
    [string]$Target,
    [string]$Message
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$Coord = Join-Path $Root 'coord'
$WtRoot = Join-Path (Split-Path $Root -Parent) 'cognet-wt'

$Agents = @('ideas', 'review', 'impl-1', 'impl-2', 'impl-3', 'impl-4')
$Tiers = @{
    all   = $Agents
    staff = @('ideas', 'review')
    impl  = @('impl-1', 'impl-2', 'impl-3', 'impl-4')
}

$Roles = @{
    'ideas'  = 'IDEAS AGENT (staff): product/growth/design ideation for Cognet. Study the spec, propose concrete improvements, growth loops, and design refinements. You write no code. Report findings to your outbox.'
    'review' = 'REVIEW AGENT (staff): quality gate. Review impl agents'' branches (git diff main...agent/impl-N), verify against the spec and phase verification checklists. Write verdicts to your outbox AND feedback directly to the relevant impl agent''s inbox. You write no feature code.'
    'impl-1' = 'IMPL AGENT 1 (worker): Phase 0 scaffold + Phase 1 identity/directory. Own files: app scaffold, supabase/migrations/0001, lib/supabase, lib/auth, app/(platform)/directory, app/a/[handle], /api/v1/agents.'
    'impl-2' = 'IMPL AGENT 2 (worker): Phase 2 social. Own files: posts/follows/reactions/reviews/flags migrations + services, app/(platform)/feed, admin page. Depends on impl-1''s schema — coordinate via review agent.'
    'impl-3' = 'IMPL AGENT 3 (worker): Phase 3 marketplace. Own files: tasks/bids/contracts/endorsements migrations + services, app/(platform)/tasks, REST endpoints for tasks/bids/contracts.'
    'impl-4' = 'IMPL AGENT 4 (worker): Phase 3 messaging + realtime + notifications. Own files: conversations/messages/notifications/events migrations + services, app/(platform)/messages, /api/v1/stream SSE, /api/v1/events.'
}

function Resolve-Targets([string]$t) {
    if ([string]::IsNullOrWhiteSpace($t)) { throw 'target required (agent name, tier: all|staff|impl)' }
    if ($Tiers.ContainsKey($t)) { return $Tiers[$t] }
    if ($Agents -contains $t) { return @($t) }
    throw "unknown target '$t'. agents: $($Agents -join ', '); tiers: all, staff, impl"
}

function Stamp() { Get-Date -Format 'yyyy-MM-ddTHH:mm:ss' }

switch ($Cmd) {
    'init' {
        if (-not (Test-Path $WtRoot)) { New-Item -ItemType Directory -Force $WtRoot | Out-Null }
        foreach ($a in $Agents) {
            # mailbox
            $box = Join-Path $Coord $a
            New-Item -ItemType Directory -Force $box | Out-Null
            foreach ($f in 'inbox.md', 'outbox.md') {
                $p = Join-Path $box $f
                if (-not (Test-Path $p)) { Set-Content -Path $p -Value "# $a $($f -replace '\.md','')" -Encoding utf8 }
            }
            # branch + worktree
            $wt = Join-Path $WtRoot $a
            if (-not (Test-Path $wt)) {
                git -C $Root branch "agent/$a" main 2>$null
                git -C $Root worktree add $wt "agent/$a"
            }
            # per-agent CLAUDE.md (untracked in worktree)
            $claudeMd = @"
# You are: $a

$($Roles[$a])

## Protocol (read docs/AGENT_PROTOCOL.md for full rules)

- Shared mailbox hub: ``$Coord``
- On wake: read ``$Coord\broadcast.md`` and ``$Coord\$a\inbox.md``, do the work, append a timestamped report to ``$Coord\$a\outbox.md``.
- Impl agents: also append completion reports to ``$Coord\review\inbox.md``.
- Spec is law: ``docs/specs/2026-07-13-cognet-design.md`` (in this worktree).
- Git: commit only to your branch ``agent/$a`` in this worktree. Never touch main.
- Message block format: ``## [timestamp] from: $a  to: <recipient>`` then body.
"@
            Set-Content -Path (Join-Path $wt 'CLAUDE.md') -Value $claudeMd -Encoding utf8
            Write-Host "ready: $a -> $wt"
        }
        $b = Join-Path $Coord 'broadcast.md'
        if (-not (Test-Path $b)) { Set-Content -Path $b -Value '# broadcast (director -> all)' -Encoding utf8 }
        git -C $Root worktree list
    }
    'send' {
        if ([string]::IsNullOrWhiteSpace($Message)) { throw 'message required' }
        $block = "`n## [$(Stamp)] from: director  to: $Target`n$Message`n"
        if ($Target -eq 'all') {
            Add-Content -Path (Join-Path $Coord 'broadcast.md') -Value $block -Encoding utf8
            Write-Host 'broadcast sent'
        }
        else {
            foreach ($a in Resolve-Targets $Target) {
                Add-Content -Path (Join-Path $Coord "$a\inbox.md") -Value $block -Encoding utf8
                Write-Host "sent -> $a"
            }
        }
    }
    'collect' {
        foreach ($a in $Agents) {
            $p = Join-Path $Coord "$a\outbox.md"
            Write-Host "`n===== $a outbox ====="
            if (Test-Path $p) { Get-Content $p } else { Write-Host '(none)' }
        }
    }
    'status' {
        git -C $Root worktree list
        Write-Host ''
        foreach ($a in $Agents) {
            $out = Join-Path $Coord "$a\outbox.md"
            $inb = Join-Path $Coord "$a\inbox.md"
            $o = if (Test-Path $out) { (Get-Item $out).LastWriteTime } else { '-' }
            $i = if (Test-Path $inb) { (Get-Item $inb).LastWriteTime } else { '-' }
            Write-Host ("{0,-8} inbox: {1,-22} outbox: {2}" -f $a, $i, $o)
        }
    }
    'spawn' {
        foreach ($a in Resolve-Targets $Target) {
            $wt = Join-Path $WtRoot $a
            if (-not (Test-Path $wt)) { throw "worktree missing for $a - run init first" }
            Start-Process powershell -ArgumentList '-NoExit', '-Command', "`$host.UI.RawUI.WindowTitle='cognet:$a'; cd '$wt'; claude --dangerously-skip-permissions"
            Write-Host "spawned: $a in $wt"
        }
    }
}
