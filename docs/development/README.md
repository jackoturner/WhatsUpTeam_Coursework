# Development and testing

## Start the development stack

Start Docker Desktop, then run this command from the repository root:

```sh
npm run dev
```

The command creates `.env` from `.env.example` when needed, builds the development
images, and starts the frontend, API, MySQL, phpMyAdmin and sample-data seeder.
Open the app at [http://localhost:3000](http://localhost:3000) and phpMyAdmin at
[http://localhost:8081](http://localhost:8081). Sign in to phpMyAdmin with
`MYSQL_USER` and `MYSQL_PASSWORD` from `.env`.

The terminal shows service logs. Press **Ctrl+C** to stop the attached stack, or
run `npm run stop` from another terminal.

## Hot reload and rebuilds

The development Compose override enables:

- React Fast Refresh for frontend source changes.
- Automatic Uvicorn restart for backend application changes.
- Development-schema upgrades before the backend accepts requests.
- Automatic seeding of missing sample records.

Source is mounted read-only in the containers. After changing package
dependencies, Python requirements, Docker configuration or `.env`, restart
`npm run dev` so affected images and services are rebuilt.

To run the stack detached and wait for it to be ready:

```sh
docker compose --profile devtools up --build --detach --wait
```

Use `npm run logs` to follow logs. Stopping services preserves database and
attachment data in Docker volumes.

To build the static runtime images without development source mounts:

```sh
docker compose -f compose.yaml up --build --detach --wait
```

## Checks and tests

Build the frontend and run its TypeScript checks:

```sh
npm --prefix src/frontend run build
```

Run backend tests from `src/backend`:

```sh
python -m pytest
```

Browser smoke and acceptance tests, including their PowerShell commands, are
documented in [test/README.md](../../test/README.md). Security-specific expected
results and manual verification steps are in the
[security verification plan](../security-verification.md).
