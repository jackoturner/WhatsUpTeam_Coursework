-- Apply once to volumes that already have stored_files from migration 003.
ALTER TABLE stored_files
    ADD COLUMN message_id INT NULL,
    ADD CONSTRAINT fk_stored_files_message
        FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE,
    ADD INDEX ix_stored_files_message_id (message_id);
