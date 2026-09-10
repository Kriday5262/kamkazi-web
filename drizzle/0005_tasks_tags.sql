-- Phase 2 — tasks architecture: lists → tags.
--
-- No DDL: `tasks.tags` is already text[] and `list_id` stays (NOT NULL) but is
-- no longer used by the app. This migration only reshapes data:
--   1. Merge each task's list name into its tags (dedupe, keep existing tags).
--   2. Point every task at the sentinel list id 'inbox' (list concept retired).
UPDATE tasks
SET tags = (
  SELECT COALESCE(array_agg(DISTINCT tag), '{}')
  FROM unnest(
    tasks.tags
    || COALESCE(
      (SELECT array_agg(l.name) FROM task_lists l WHERE l.id = tasks.list_id),
      '{}'
    )
  ) AS tag
  WHERE tag IS NOT NULL AND btrim(tag) <> ''
)
WHERE list_id <> 'inbox';

UPDATE tasks SET list_id = 'inbox' WHERE list_id <> 'inbox';