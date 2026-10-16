#!/usr/bin/env bash
# Nightly backup (add to cron):  0 3 * * * /opt/marriage-swipe/deploy/backup.sh
set -euo pipefail
cd "$(dirname "$0")"; mkdir -p ../backups; d=$(date +%F)
docker compose exec -T db pg_dump -U marriage marriageswipe | gzip > ../backups/db-$d.sql.gz
docker run --rm -v ${UPLOADS_VOLUME:-deploy_uploads}:/u -v "$(cd ../backups && pwd)":/b alpine tar czf /b/uploads-$d.tgz -C /u .
find ../backups -type f -mtime +14 -delete
