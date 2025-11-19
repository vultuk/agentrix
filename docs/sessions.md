# Sessions Payload Reference

The `/sessions` endpoint returns an array of workspaces (GitHub organisations), each aggregating their repositories, active plans, worktrees, and associated terminals. These types mirror the Rust data structures in `src/server/types.rs` and should be kept in sync whenever the API evolves. The current implementation discovers workspaces by scanning the configured `workdir`, expecting a folder hierarchy of `<organisation>/<repository>`.

## Domain Mapping

- **Workspace** → GitHub organisation.
- **Repository** → GitHub repository inside that organisation.
- **Plan** → In-progress plan of action (not yet finalized).
- **Worktree** → Active Git branch currently in use.
- **Terminal** → Active terminal session tied to a worktree (traditional terminal, Codex SDK client, Claude agent, etc.).

| Field | Type | Notes |
| --- | --- | --- |
| `[].name` | `string` | Workspace name |
| `[].repositories[].name` | `string` | Repository identifier |
| `[].repositories[].plans[].name` | `string` | Plan title |
| `[].repositories[].plans[].session_id` | `string (UUID)` | Plan session identifier |
| `[].repositories[].plans[].related_issue` | `number (optional)` | Issue ID if linked |
| `[].repositories[].worktrees[].name` | `string` | Worktree branch name |
| `[].repositories[].worktrees[].terminals[].name` | `string` | Terminal display name |
| `[].repositories[].worktrees[].terminals[].type` | `string` | Terminal type (`terminal`, `codex-sdk`, `claude`, etc.) |
| `[].repositories[].worktrees[].terminals[].dangerous` | `boolean (optional)` | Indicates elevated permissions |
| `[].repositories[].worktrees[].terminals[].session_id` | `string (UUID)` | Terminal session identifier |

## Example Payload

```json
[
  {
    "name": "vultuk",
    "repositories": [
      {
        "name": "simonskinner_me",
        "plans": [
          {
            "name": "Change Colour Scheme",
            "session_id": "35355aa6-5ebb-49f2-bcab-47f90cfa96c4",
            "related_issue": 1832
          }
        ],
        "worktrees": [
          {
            "name": "feat/calendar-url",
            "terminals": [
              {
                "name": "Agent 1",
                "type": "claude",
                "dangerous": true,
                "session_id": "918fd77e-f985-4dfc-a22c-b9ebf108ddf1"
              }
            ]
          }
        ]
      }
    ]
  }
]
```
