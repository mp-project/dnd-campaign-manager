-- Hard-delete a user including current direct auth/settings dependencies.
--
-- Set the user email in exactly one place (vUserEmail) before execution.
--
-- Safety rules:
-- - Refuses to delete SYSTEM user.
-- - Deletes dependent rows first (restrict FKs):
--   password_reset_tokens, refresh_tokens, user_settings.
-- - Also removes email_verification_requests for the user's email.
--
-- Note:
-- - `created_by` / `updated_by` in current schema are not enforced with FK constraints.
-- - If future modules add tables with `user_id` FKs, extend this script accordingly.

BEGIN;

DO $$
DECLARE
  vUserEmail text := 'mark.pimpl@gmx.de';
  inputUserEmail text;
  targetUserId uuid;
  targetUserEmail text;
  targetSystemRole text;
  affectedRows integer;
BEGIN
  inputUserEmail := lower(trim(vUserEmail));

  IF inputUserEmail = '' THEN
    RAISE EXCEPTION 'Set vUserEmail before executing this script';
  END IF;

  SELECT u.id, u.email, u.system_role::text
  INTO targetUserId, targetUserEmail, targetSystemRole
  FROM users u
  WHERE u.deleted_at IS NULL
    AND lower(u.email) = inputUserEmail
  LIMIT 1;

  IF targetUserId IS NULL THEN
    RAISE EXCEPTION 'No active user found for provided identifier';
  END IF;

  IF targetSystemRole = 'SYSTEM' THEN
    RAISE EXCEPTION 'Refusing to hard-delete SYSTEM user (%)', targetUserId;
  END IF;

  DELETE FROM password_reset_tokens WHERE user_id = targetUserId;
  GET DIAGNOSTICS affectedRows = ROW_COUNT;
  RAISE NOTICE 'Deleted password_reset_tokens: %', affectedRows;

  DELETE FROM refresh_tokens WHERE user_id = targetUserId;
  GET DIAGNOSTICS affectedRows = ROW_COUNT;
  RAISE NOTICE 'Deleted refresh_tokens: %', affectedRows;

  DELETE FROM user_settings WHERE user_id = targetUserId;
  GET DIAGNOSTICS affectedRows = ROW_COUNT;
  RAISE NOTICE 'Deleted user_settings: %', affectedRows;

  DELETE FROM email_verification_requests WHERE email = targetUserEmail;
  GET DIAGNOSTICS affectedRows = ROW_COUNT;
  RAISE NOTICE 'Deleted email_verification_requests: %', affectedRows;

  DELETE FROM users WHERE id = targetUserId;
  GET DIAGNOSTICS affectedRows = ROW_COUNT;

  IF affectedRows <> 1 THEN
    RAISE EXCEPTION 'Expected to delete exactly one user row, deleted: %', affectedRows;
  END IF;

  RAISE NOTICE 'Hard-deleted user: id=%, email=%', targetUserId, targetUserEmail;
END $$;

COMMIT;

-- Optional check:
-- SELECT id, email, system_role, status, deleted_at
-- FROM users
-- WHERE lower(email) = lower('deine-email@example.com');
