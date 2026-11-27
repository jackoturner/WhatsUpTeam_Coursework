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
    review_status VARCHAR(16) NOT NULL DEFAULT 'open',
    reviewed_by_user_id INT NULL,
    reviewed_at BIGINT NULL,
    CONSTRAINT ck_message_reports_review_status
        CHECK (review_status IN ('open', 'in_review', 'resolved')),
    CONSTRAINT uq_message_reports_message_reporter UNIQUE (message_id, reporter_id),
    CONSTRAINT fk_message_reports_message
        FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE,
    CONSTRAINT fk_message_reports_reporter
        FOREIGN KEY (reporter_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_message_reports_reviewer
        FOREIGN KEY (reviewed_by_user_id) REFERENCES users (id) ON DELETE SET NULL
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

CREATE TABLE stored_files (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NULL,
    message_id INT NULL,
    owner_user_id INT NULL,
    uploaded_by_user_id INT NOT NULL,
    storage_key CHAR(32) NOT NULL UNIQUE,
    original_filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    is_confidential BOOLEAN NOT NULL DEFAULT FALSE,
    created_at BIGINT NOT NULL,
    CONSTRAINT ck_stored_files_owner CHECK (
        (conversation_id IS NOT NULL AND owner_user_id IS NULL) OR
        (conversation_id IS NULL AND owner_user_id IS NOT NULL)
    ),
    CONSTRAINT fk_stored_files_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
    CONSTRAINT fk_stored_files_message
        FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE,
    CONSTRAINT fk_stored_files_owner
        FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT uq_stored_files_avatar UNIQUE (owner_user_id),
    CONSTRAINT fk_stored_files_uploader
        FOREIGN KEY (uploaded_by_user_id) REFERENCES users (id) ON DELETE RESTRICT,
    INDEX ix_stored_files_conversation_id (conversation_id, id),
    INDEX ix_stored_files_message_id (message_id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
