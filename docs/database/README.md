# Database and sample data

## Local MySQL access

The development database runs in Docker. Open
[phpMyAdmin](http://localhost:8081) and sign in with `MYSQL_USER` and
`MYSQL_PASSWORD` from the repository's `.env` file.

MySQL data is stored in Docker's `mysql_data` named volume, not in the repository.
Attachment contents are stored separately in `attachments_data`. This avoids
committing database files; inspect or change data through phpMyAdmin or SQL rather
than editing Docker's volume files. Stopping the stack does not remove either
volume.

## Schema initialization and upgrades

Files in `infrastructure/database/init/` are executed by MySQL only when it
initializes a new data volume. Reusing an existing volume does not rerun those
scripts.

When started with `npm run dev`, the backend creates missing tables and applies
the development schema updates for report review and stored-file message links
before accepting API requests. This also handles existing local volumes and
preserves their rows. The development schema upgrader is not used by the static
runtime image.

SQL upgrades for deployed databases are in
[`infrastructure/database/migrations/`](../../infrastructure/database/migrations/).
Back up the database before applying migrations, and apply them in order using
the deployment's database procedure.

## Sample accounts and records

The development Compose profile runs
[`seed.sql`](../../infrastructure/database/dev/seed.sql) after the API is healthy.
It is safe to rerun and inserts missing demo accounts, conversations, messages,
reports and the confidential sample attachment without resetting existing data.
To run it manually:

```sh
docker compose --profile devtools run --rm dev-seed
```

The demo accounts all use the local development password `password`:

| Username | Role |
|---|---|
| `bob` | Employee |
| `sample_employee` | Employee |
| `sample_colleague` | Employee |
| `sample_manager` | Group manager |
| `bobadmin` | Organisation administrator |

These fixed-password accounts and sample records are for local development only.
Do not run the seeder or use these accounts in a deployed environment.

## Backup

Back up and restore the MySQL database and `attachments_data` volume together so
attachment metadata and file contents remain consistent.
