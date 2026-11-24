#!/bin/bash
# Runs ONCE, the first time the database volume is created. The app gets its own user that can read and write its own database and
# nothing else, so the app never holds the database's root password. (To change it later, use mongosh; this will not run again.)
set -euo pipefail

mongosh --quiet "admin" -u root -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin <<JS
db.getSiblingDB("$MONGO_DB").createUser({
  user: "$MONGO_APP_USER",
  pwd: "$MONGO_APP_PASSWORD",
  roles: [{ role: "readWrite", db: "$MONGO_DB" }]
});
JS
echo "created database user $MONGO_APP_USER for $MONGO_DB"
