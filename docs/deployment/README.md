# Deployment guidance

The Docker Compose setup is for local development and coursework testing; it is
not production-ready without additional controls.

Before deployment:

- Use unique, strong database credentials and keep `.env` and all secrets out of
  source control.
- Do not enable the development `devtools` profile, sample-data seeder or
  phpMyAdmin.
- Serve the app through a trusted TLS-terminating reverse proxy, redirect HTTP
  to HTTPS, configure HSTS at the TLS edge, and set
  `SESSION_COOKIE_SECURE=true`.
- Back up and restore MySQL and the attachment-storage volume together.
- Add malware scanning before accepting untrusted files in production.
- Use a shared rate-limit store when deploying multiple backend processes or
  instances; the current login limit is process-local.
- Provision real users only through an approved administrative process. Store
  password hashes produced by `app.services.auth.hash_password`.
- Apply database migrations using a reviewed deployment procedure after taking
  a backup. Development schema upgrades are not run by the static runtime image.

Do not connect Microsoft Entra ID or Microsoft Graph until a separately approved
test tenant, identity mapping and permission scope have been defined. The
[project plan](../project-development-plan.md) records this integration as
deferred.
