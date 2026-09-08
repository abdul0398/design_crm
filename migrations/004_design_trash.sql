SET @design_trash_migration = IF(
 (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='designs' AND column_name='deleted_at')=0,
 'ALTER TABLE designs ADD COLUMN deleted_at DATETIME(3) NULL, ADD INDEX designs_project_deleted (project_id,deleted_at)',
 'SELECT 1'
);
PREPARE design_trash_statement FROM @design_trash_migration;
EXECUTE design_trash_statement;
DEALLOCATE PREPARE design_trash_statement;
