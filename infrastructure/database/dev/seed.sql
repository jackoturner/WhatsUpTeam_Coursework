INSERT INTO organisations (name)
SELECT 'Local Development'
WHERE NOT EXISTS (
    SELECT 1 FROM organisations WHERE name = 'Local Development'
);

SET @local_organisation_id = (
    SELECT id FROM organisations WHERE name = 'Local Development' ORDER BY id LIMIT 1
);

INSERT INTO users (username, display_name, password_hash, role, organisation_id)
SELECT
    'bob',
    'Bob',
    'pbkdf2_sha256$600000$7bO1gJB_5CMl6DH7YUbqIQ$4cc3438895615b345f9410526c834ab048849f3ffaec267afb4dd35bc13f9d11',
    'employee',
    @local_organisation_id
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'bob');

INSERT INTO users (username, display_name, password_hash, role, organisation_id)
SELECT
    'bobadmin',
    'BobAdmin',
    'pbkdf2_sha256$600000$bvaJez5zUAzz4EmgzLjFdA$4e51d57ddf86f60dbb82f30bb3ee58ed6be9a65359834f18b7dc5ea231350b76',
    'org_admin',
    @local_organisation_id
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'bobadmin');

SET @sample_organisation_id = (
    SELECT organisation_id FROM users WHERE username = 'bobadmin' ORDER BY id LIMIT 1
);

INSERT INTO users (username, display_name, password_hash, role, organisation_id)
SELECT
    'sample_employee',
    'Sam Employee',
    'pbkdf2_sha256$600000$7bO1gJB_5CMl6DH7YUbqIQ$4cc3438895615b345f9410526c834ab048849f3ffaec267afb4dd35bc13f9d11',
    'employee',
    @sample_organisation_id
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'sample_employee');

INSERT INTO users (username, display_name, password_hash, role, organisation_id)
SELECT
    'sample_colleague',
    'Alex Example',
    'pbkdf2_sha256$600000$7bO1gJB_5CMl6DH7YUbqIQ$4cc3438895615b345f9410526c834ab048849f3ffaec267afb4dd35bc13f9d11',
    'employee',
    @sample_organisation_id
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'sample_colleague');

INSERT INTO users (username, display_name, password_hash, role, organisation_id)
SELECT
    'sample_manager',
    'Casey Manager',
    'pbkdf2_sha256$600000$7bO1gJB_5CMl6DH7YUbqIQ$4cc3438895615b345f9410526c834ab048849f3ffaec267afb4dd35bc13f9d11',
    'group_manager',
    @sample_organisation_id
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'sample_manager');

SET @admin_id = (
    SELECT id FROM users
    WHERE username = 'bobadmin' AND organisation_id = @sample_organisation_id
    ORDER BY id LIMIT 1
);
SET @alice_id = (
    SELECT id FROM users
    WHERE username = 'sample_colleague' AND organisation_id = @sample_organisation_id
    ORDER BY id LIMIT 1
);
SET @sample_employee_id = (
    SELECT id FROM users
    WHERE username = 'sample_employee' AND organisation_id = @sample_organisation_id
    ORDER BY id LIMIT 1
);
SET @manager_id = (
    SELECT id FROM users
    WHERE username = 'sample_manager' AND organisation_id = @sample_organisation_id
    ORDER BY id LIMIT 1
);
SET @bob_id = COALESCE(
    (
        SELECT id FROM users
        WHERE username = 'bob' AND organisation_id = @sample_organisation_id
        ORDER BY id LIMIT 1
    ),
    (
        SELECT id FROM users
        WHERE username = 'sample_employee' AND organisation_id = @sample_organisation_id
        ORDER BY id LIMIT 1
    )
);

INSERT INTO conversations (organisation_id, kind, name, created_at)
SELECT @sample_organisation_id, 'group', 'Sample Project Team', UNIX_TIMESTAMP()
WHERE NOT EXISTS (
    SELECT 1 FROM conversations
    WHERE organisation_id = @sample_organisation_id
      AND kind = 'group'
      AND name = 'Sample Project Team'
);

INSERT INTO conversations (organisation_id, kind, name, created_at)
SELECT @sample_organisation_id, 'group', 'Sample Security Review', UNIX_TIMESTAMP()
WHERE NOT EXISTS (
    SELECT 1 FROM conversations
    WHERE organisation_id = @sample_organisation_id
      AND kind = 'group'
      AND name = 'Sample Security Review'
);

INSERT INTO conversations (organisation_id, kind, name, created_at)
SELECT @sample_organisation_id, 'direct', 'sample-seed-direct-bob-alice', UNIX_TIMESTAMP()
WHERE NOT EXISTS (
    SELECT 1 FROM conversations
    WHERE organisation_id = @sample_organisation_id
      AND kind = 'direct'
      AND name = 'sample-seed-direct-bob-alice'
);

SET @project_group_id = (
    SELECT id FROM conversations
    WHERE organisation_id = @sample_organisation_id
      AND kind = 'group'
      AND name = 'Sample Project Team'
    ORDER BY id LIMIT 1
);
SET @security_group_id = (
    SELECT id FROM conversations
    WHERE organisation_id = @sample_organisation_id
      AND kind = 'group'
      AND name = 'Sample Security Review'
    ORDER BY id LIMIT 1
);
SET @direct_conversation_id = (
    SELECT id FROM conversations
    WHERE organisation_id = @sample_organisation_id
      AND kind = 'direct'
      AND name = 'sample-seed-direct-bob-alice'
    ORDER BY id LIMIT 1
);

INSERT INTO conversation_members (conversation_id, user_id)
SELECT @project_group_id, member_id
FROM (
    SELECT @admin_id AS member_id
    UNION SELECT @alice_id
    UNION SELECT @sample_employee_id
    UNION SELECT @manager_id
    UNION SELECT @bob_id
) AS project_members
WHERE member_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM conversation_members
      WHERE conversation_id = @project_group_id AND user_id = member_id
  );

INSERT INTO conversation_members (conversation_id, user_id)
SELECT @security_group_id, member_id
FROM (
    SELECT @admin_id AS member_id
    UNION SELECT @alice_id
    UNION SELECT @sample_employee_id
    UNION SELECT @manager_id
    UNION SELECT @bob_id
) AS security_members
WHERE member_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM conversation_members
      WHERE conversation_id = @security_group_id AND user_id = member_id
  );

INSERT INTO conversation_members (conversation_id, user_id)
SELECT @direct_conversation_id, member_id
FROM (
    SELECT @bob_id AS member_id
    UNION SELECT @alice_id
) AS direct_members
WHERE member_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM conversation_members
      WHERE conversation_id = @direct_conversation_id AND user_id = member_id
  );

INSERT INTO messages (conversation_id, sender_id, body, created_at)
SELECT @project_group_id, @alice_id,
       'Welcome to the sample project chat. Use this group to test messages and membership.',
       UNIX_TIMESTAMP() - 3600
WHERE NOT EXISTS (
    SELECT 1 FROM messages
    WHERE conversation_id = @project_group_id
      AND sender_id = @alice_id
      AND body = 'Welcome to the sample project chat. Use this group to test messages and membership.'
);

INSERT INTO messages (conversation_id, sender_id, body, created_at)
SELECT @project_group_id, @bob_id,
       'I can send replies, report messages, and test a confidential file attachment here.',
       UNIX_TIMESTAMP() - 3000
WHERE NOT EXISTS (
    SELECT 1 FROM messages
    WHERE conversation_id = @project_group_id
      AND sender_id = @bob_id
      AND body = 'I can send replies, report messages, and test a confidential file attachment here.'
);

INSERT INTO messages (conversation_id, sender_id, body, created_at)
SELECT @security_group_id, @alice_id,
       'Training example: verify a message source before opening any link.',
       UNIX_TIMESTAMP() - 2400
WHERE NOT EXISTS (
    SELECT 1 FROM messages
    WHERE conversation_id = @security_group_id
      AND sender_id = @alice_id
      AND body = 'Training example: verify a message source before opening any link.'
);

INSERT INTO messages (conversation_id, sender_id, body, created_at)
SELECT @security_group_id, @manager_id,
       'Use this group to test manager permissions and the admin review queue.',
       UNIX_TIMESTAMP() - 1800
WHERE NOT EXISTS (
    SELECT 1 FROM messages
    WHERE conversation_id = @security_group_id
      AND sender_id = @manager_id
      AND body = 'Use this group to test manager permissions and the admin review queue.'
);

INSERT INTO messages (conversation_id, sender_id, body, created_at)
SELECT @direct_conversation_id, @alice_id,
       'Hi Bob, this is a sample direct conversation.',
       UNIX_TIMESTAMP() - 1200
WHERE NOT EXISTS (
    SELECT 1 FROM messages
    WHERE conversation_id = @direct_conversation_id
      AND sender_id = @alice_id
      AND body = 'Hi Bob, this is a sample direct conversation.'
);

INSERT INTO messages (conversation_id, sender_id, body, created_at)
SELECT @project_group_id, @alice_id,
      'Shared an attachment: sample-notes.txt',
      UNIX_TIMESTAMP() - 600
WHERE NOT EXISTS (
   SELECT 1 FROM messages
   WHERE conversation_id = @project_group_id
     AND sender_id = @alice_id
     AND body = 'Shared an attachment: sample-notes.txt'
);

SET @sample_attachment_message_id = (
   SELECT id FROM messages
   WHERE conversation_id = @project_group_id
     AND sender_id = @alice_id
     AND body = 'Shared an attachment: sample-notes.txt'
   ORDER BY id LIMIT 1
);

SET @report_message_id = (
    SELECT id FROM messages
    WHERE conversation_id = @security_group_id
      AND sender_id = @alice_id
      AND body = 'Training example: verify a message source before opening any link.'
    ORDER BY id LIMIT 1
);

INSERT INTO message_reports (
    message_id, reporter_id, reason, created_at, review_status
)
SELECT
    @report_message_id,
    @bob_id,
    'Sample report for testing the administrator review workflow.',
    UNIX_TIMESTAMP() - 900,
    'open'
WHERE NOT EXISTS (
    SELECT 1 FROM message_reports
    WHERE message_id = @report_message_id AND reporter_id = @bob_id
);

INSERT INTO audit_events (
    organisation_id, event_type, actor_user_id, source_ip, details, occurred_at
)
SELECT
    @sample_organisation_id,
    'message_reported',
    @bob_id,
    '127.0.0.1',
    CONCAT('Message ', @report_message_id, ' reported.'),
    UNIX_TIMESTAMP() - 900
WHERE NOT EXISTS (
    SELECT 1 FROM audit_events
    WHERE organisation_id = @sample_organisation_id
      AND event_type = 'message_reported'
      AND details = CONCAT('Message ', @report_message_id, ' reported.')
);

INSERT INTO stored_files (
    conversation_id,
    message_id,
    owner_user_id,
    uploaded_by_user_id,
    storage_key,
    original_filename,
    content_type,
    size_bytes,
    is_confidential,
    created_at
)
SELECT
    @project_group_id,
    @sample_attachment_message_id,
    NULL,
    @alice_id,
    '00000000000000000000000000000001',
    'sample-notes.txt',
    'text/plain',
    LENGTH(CONCAT(
        'Sample development-only attachment for testing downloads and confidential-file labels.',
        CHAR(10)
    )),
    TRUE,
    UNIX_TIMESTAMP() - 600
WHERE NOT EXISTS (
    SELECT 1 FROM stored_files
    WHERE storage_key = '00000000000000000000000000000001'
);

UPDATE stored_files
SET message_id = @sample_attachment_message_id
WHERE storage_key = '00000000000000000000000000000001'
  AND message_id IS NULL;
