SET @project_trash_migration = IF(
 (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='projects' AND column_name='deleted_at')=0,
 'ALTER TABLE projects ADD COLUMN deleted_at DATETIME(3) NULL, ADD INDEX projects_deleted_at (deleted_at)',
 'SELECT 1'
);
PREPARE project_trash_statement FROM @project_trash_migration;
EXECUTE project_trash_statement;
DEALLOCATE PREPARE project_trash_statement;
