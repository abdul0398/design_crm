SET @username_migration = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='username')=0,
  'ALTER TABLE users ADD COLUMN username VARCHAR(64) NULL, ADD UNIQUE INDEX users_username_unique (username)',
  'SELECT 1'
);
PREPARE username_statement FROM @username_migration;
EXECUTE username_statement;
DEALLOCATE PREPARE username_statement;
