# CV-SCOPE-01: project-scoped declaration without WHERE clause

Status: critic-validation — Check 6 (SCOPE-01) Step 3 (first bullet) should emit HARD because the declared scope is `project-scoped` but the SQL contains no `WHERE project_id = ?` clause.

## Goal

Add a latest-metric lookup.

## Files

| File                                  | Change | Description |
| ------------------------------------- | ------ | ----------- |
| `shared/src/storage/metrics-store.ts` | Modify | New query.  |

## Steps

1. Add SQL statement: `SELECT * FROM metrics ORDER BY created_at DESC LIMIT 1`.

## Architecture Notes

- **Query scope:** project-scoped (WHERE project_id = ?)
