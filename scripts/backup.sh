#!/usr/bin/env bash
# Run from the project root. Stops writes while capturing matching SQL and files.
set -euo pipefail
backup_dir="${1:?Usage: bash scripts/backup.sh /absolute/backup-directory}"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
umask 077
docker compose stop app
trap 'docker compose start app >/dev/null' EXIT
docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -u root --single-transaction --routines --triggers --no-tablespaces --set-gtid-purged=OFF "$MYSQL_DATABASE"' > "$backup_dir/database.sql"
docker compose run --rm --no-deps -T --entrypoint tar app -C /data/websites -czf - . > "$backup_dir/websites.tar.gz"
sha256sum "$backup_dir/database.sql" "$backup_dir/websites.tar.gz" > "$backup_dir/SHA256SUMS"
printf '%s\n' 'Backup complete. Copy this directory off the EC2 instance.'
