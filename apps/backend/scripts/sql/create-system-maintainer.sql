-- Create first SYSTEM_MAINTAINER (SUPER_ADMIN) without application command.
--
-- Replace placeholders before execution:
--   __MAINTAINER_EMAIL__
--   __MAINTAINER_DISPLAY_NAME__
--   __MAINTAINER_PASSWORD_HASH__
--
-- Password hash format expected by backend:
--   scrypt$<salt_hex>$<derived_hex>
--
-- No additional ENV secret is required in the current implementation.
-- Salt is random per password and part of the stored hash string.
--
-- Example hash generation (run locally, never in SQL):
--   node -e "const { randomBytes, scryptSync } = require('crypto'); const p=process.argv[1]; const s=randomBytes(16).toString('hex'); const d=scryptSync(p,s,64).toString('hex'); console.log('scrypt$'+s+'$'+d);" "YOUR_PASSWORD"

BEGIN;

WITH system_user AS (
  SELECT id
  FROM users
  WHERE system_role = 'SYSTEM'
    AND deleted_at IS NULL
  LIMIT 1
),
inserted_user AS (
  INSERT INTO users (
    email,
    password_hash,
    display_name,
    system_role,
    status,
    email_verified_at,
    created_by,
    updated_by
  )
  SELECT
    '__MAINTAINER_EMAIL__',
    '__MAINTAINER_PASSWORD_HASH__',
    '__MAINTAINER_DISPLAY_NAME__',
    'SUPER_ADMIN',
    'ACTIVE',
    now(),
    system_user.id,
    system_user.id
  FROM system_user
  WHERE NOT EXISTS (
    SELECT 1
    FROM users u
    WHERE u.email = '__MAINTAINER_EMAIL__'
      AND u.deleted_at IS NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM users u
    WHERE u.system_role = 'SUPER_ADMIN'
      AND u.status = 'ACTIVE'
      AND u.deleted_at IS NULL
  )
  RETURNING id
)
INSERT INTO user_settings (
  user_id,
  locale,
  timezone,
  theme,
  reduced_motion,
  ui_preferences,
  created_by,
  updated_by
)
SELECT
  inserted_user.id,
  'de',
  'UTC',
  'SYSTEM',
  false,
  '{}'::jsonb,
  system_user.id,
  system_user.id
FROM inserted_user
JOIN system_user ON true;

COMMIT;

-- Optional check after execution:
-- SELECT id, email, system_role, status, created_by, created_at
-- FROM users
-- WHERE email = '__MAINTAINER_EMAIL__' AND deleted_at IS NULL;
