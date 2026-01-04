# superagent-issues

A minimal, project-local issue tracker. One JSONL file, no daemon, no magic.

## Structure

```
.issues/
  issues.jsonl    # All issues, one JSON object per line
```

## Issue Schema

```json
{
  "id": "001",
  "title": "Short description",
  "status": "open",
  "priority": 2,
  "type": "task",
  "created": "2025-01-04T12:00:00Z",
  "updated": "2025-01-04T12:00:00Z"
}
```

### Fields

| Field | Type | Values |
|-------|------|--------|
| `id` | string | Auto-incrementing, zero-padded (001, 002, ...) |
| `title` | string | Brief description |
| `status` | string | `open`, `in_progress`, `closed` |
| `priority` | number | 0-4 (0=critical, 2=medium, 4=backlog) |
| `type` | string | `task`, `bug`, `feature` |
| `created` | string | ISO 8601 timestamp |
| `updated` | string | ISO 8601 timestamp |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Longer details |
| `blocked_by` | string[] | IDs of blocking issues |
| `labels` | string[] | Tags for categorization |
| `closed_reason` | string | Why it was closed |

## Philosophy

- **Project-local**: Lives in the repo, not your home directory
- **Single file**: One JSONL file, easy to read/edit/merge
- **Git-native**: Just commit the file, no sync daemon
- **Minimal**: Start simple, add complexity only when needed
