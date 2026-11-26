-- Conversations, messages, message reports and audit events.
-- Runs once on a fresh database volume (after 001_auth.sql).

CREATE TABLE conversations (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    organisation_id INT NOT NULL,
    kind VARCHAR(16) NOT NULL,
    name VARCHAR(100) NULL,
    created_at BIGINT NOT NULL,
    CONSTRAINT ck_conversations_kind CHECK (kind IN ('direct', 'group')),
    INDEX ix_conversations_organisation_id (organisation_id),
    CONSTRAINT fk_conversations_organisation
        FOREIGN KEY (organisation_id) REFERENCES organisations (id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE conversation_members (
    conversation_id INT NOT NULL,
    user_id INT NOT NULL,
    PRIMARY KEY (conversation_id, user_id),
    INDEX ix_conversation_members_user_id (user_id),
    CONSTRAINT fk_conversation_members_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
    CONSTRAINT fk_conversation_members_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE messages (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    sender_id INT NOT NULL,
    body VARCHAR(500) NOT NULL,
    created_at BIGINT NOT NULL,
    INDEX ix_messages_conversation_id (conversation_id, id),
    CONSTRAINT fk_messages_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
    CONSTRAINT fk_messages_sender
        FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE RESTRICT
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE message_reports (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    reporter_id INT NOT NULL,
    reason VARCHAR(500) NOT NULL,
    created_at BIGINT NOT NULL,
    CONSTRAINT uq_message_reports_message_reporter UNIQUE (message_id, reporter_id),
    CONSTRAINT fk_message_reports_message
        FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE,
    CONSTRAINT fk_message_reports_reporter
        FOREIGN KEY (reporter_id) REFERENCES users (id) ON DELETE RESTRICT
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE audit_events (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    organisation_id INT NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    actor_user_id INT NULL,
    source_ip VARCHAR(45) NOT NULL,
    details VARCHAR(255) NOT NULL,
    occurred_at BIGINT NOT NULL,
    INDEX ix_audit_events_organisation_id (organisation_id, id),
    CONSTRAINT fk_audit_events_organisation
        FOREIGN KEY (organisation_id) REFERENCES organisations (id) ON DELETE RESTRICT,
    CONSTRAINT fk_audit_events_actor
        FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- Demo users who appear in the sample conversations. Their password hash is not a valid
-- PBKDF2 value and they are inactive, so nobody can sign in as them.
INSERT INTO users (username, display_name, password_hash, role, organisation_id, is_active)
SELECT 'sarah', 'Sarah Jenkins', '!', 'employee', id, FALSE
FROM organisations WHERE name = 'Demo Organisation';

INSERT INTO users (username, display_name, password_hash, role, organisation_id, is_active)
SELECT 'alex', 'Alex Carter', '!', 'employee', id, FALSE
FROM organisations WHERE name = 'Demo Organisation';

INSERT INTO users (username, display_name, password_hash, role, organisation_id, is_active)
SELECT 'john', 'John Davies', '!', 'employee', id, FALSE
FROM organisations WHERE name = 'Demo Organisation';

-- Conversation 1: group. Conversation 2: direct message between bob and John Davies.
INSERT INTO conversations (id, organisation_id, kind, name, created_at)
SELECT 1, id, 'group', 'Project team', UNIX_TIMESTAMP() FROM organisations WHERE name = 'Demo Organisation';

INSERT INTO conversations (id, organisation_id, kind, name, created_at)
SELECT 2, id, 'direct', NULL, UNIX_TIMESTAMP() FROM organisations WHERE name = 'Demo Organisation';

INSERT INTO conversation_members (conversation_id, user_id)
SELECT 1, id FROM users WHERE username IN ('bob', 'bobadmin', 'sarah', 'alex');

INSERT INTO conversation_members (conversation_id, user_id)
SELECT 2, id FROM users WHERE username IN ('bob', 'john');

INSERT INTO messages (conversation_id, sender_id, body, created_at)
SELECT 1, id, 'Morning all, the sprint review moved to 3pm.', UNIX_TIMESTAMP() - 7200
FROM users WHERE username = 'sarah';

INSERT INTO messages (conversation_id, sender_id, body, created_at)
SELECT 1, id, 'Thanks, I will update the deck.', UNIX_TIMESTAMP() - 6600
FROM users WHERE username = 'alex';

INSERT INTO messages (conversation_id, sender_id, body, created_at)
SELECT 2, id, 'Hi, can you check the shared folder for the latest file?', UNIX_TIMESTAMP() - 3600
FROM users WHERE username = 'john';

INSERT INTO messages (conversation_id, sender_id, body, created_at)
SELECT 2, id,
    'Hi team, I need the latest employee list with full names, contact numbers, and salary details. Please send it to my personal email at john.davies.consulting@gmail.com as soon as possible.',
    UNIX_TIMESTAMP() - 1800
FROM users WHERE username = 'john';
