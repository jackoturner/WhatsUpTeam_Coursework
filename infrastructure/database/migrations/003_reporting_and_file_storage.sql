-- Apply once to volumes created before report review and protected file storage.
ALTER TABLE message_reports
    ADD COLUMN review_status VARCHAR(16) NOT NULL DEFAULT 'open',
    ADD COLUMN reviewed_by_user_id INT NULL,
    ADD COLUMN reviewed_at BIGINT NULL,
    ADD CONSTRAINT ck_message_reports_review_status
        CHECK (review_status IN ('open', 'in_review', 'resolved')),
    ADD CONSTRAINT fk_message_reports_reviewer
        FOREIGN KEY (reviewed_by_user_id) REFERENCES users (id) ON DELETE SET NULL;

CREATE TABLE stored_files (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NULL,
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
    CONSTRAINT fk_stored_files_owner
        FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT uq_stored_files_avatar UNIQUE (owner_user_id),
    CONSTRAINT fk_stored_files_uploader
        FOREIGN KEY (uploaded_by_user_id) REFERENCES users (id) ON DELETE RESTRICT,
    INDEX ix_stored_files_conversation_id (conversation_id, id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
