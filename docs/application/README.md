# Application features and permissions

## Sign-in and sessions

The app uses local username/password sign-in. The API exposes:

- `POST /api/auth/login` to authenticate and set an HttpOnly session cookie.
- `POST /api/auth/logout` to revoke the current database session.
- `GET /api/auth/me` to return the current user or `401`.

Passwords are stored as PBKDF2-HMAC-SHA256 hashes. Session tokens are random,
expire after eight hours and are stored hashed in MySQL. State-changing
authentication requests use a double-submit CSRF token. Login attempts are
limited per client IP in the backend process.

## Roles and access

- **Employees** can message colleagues in their organisation, access groups they
  belong to, report messages and manage their own account settings.
- **Group managers** and organisation administrators can create and manage
  groups within their organisation.
- **Organisation administrators** can manage users and organisation settings,
  review reports and access security audit records.

The API enforces roles, organisation boundaries and conversation membership;
frontend navigation and route guards are not authorization controls.

Users can change their display name and password in Settings. A password change
requires the current password and a new password of at least 12 characters, and
revokes active sessions. An organisation must retain at least one active
administrator.

## Attachments

Attachments are sent as messages in conversations. Supported types are PDF, PNG,
JPEG, WebP and UTF-8 text, up to 10 MiB. Confidential files can be previewed by
conversation members but cannot be downloaded through the app. Non-confidential
files can be downloaded. Internal resharing is limited to conversations the
sender belongs to in the same organisation, and retains the file classification.
External sharing is not implemented.

Previews are not DRM and cannot prevent screenshots or all browser-level copying.
The application validates file content and stores files outside the web root, but
does not scan uploads for malware.

Avatars support PNG, JPEG and WebP up to 2 MiB.
