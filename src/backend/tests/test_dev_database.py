from sqlalchemy import create_engine, inspect, text

from app.dev_database import upgrade_dev_schema


def test_dev_schema_upgrade_adds_attachment_and_report_columns_without_losing_rows():
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE organisations (id INTEGER PRIMARY KEY, name VARCHAR(100) NOT NULL)"
        ))
        connection.execute(text(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, organisation_id INTEGER NOT NULL)"
        ))
        connection.execute(text(
            "CREATE TABLE conversations (id INTEGER PRIMARY KEY)"
        ))
        connection.execute(text(
            "CREATE TABLE messages (id INTEGER PRIMARY KEY)"
        ))
        connection.execute(text(
            "CREATE TABLE message_reports ("
            "id INTEGER PRIMARY KEY, message_id INTEGER NOT NULL, reporter_id INTEGER NOT NULL, "
            "reason VARCHAR(500) NOT NULL, created_at BIGINT NOT NULL)"
        ))
        connection.execute(text(
            "CREATE TABLE stored_files ("
            "id INTEGER PRIMARY KEY, conversation_id INTEGER, owner_user_id INTEGER, "
            "uploaded_by_user_id INTEGER NOT NULL, storage_key VARCHAR(32) NOT NULL, "
            "original_filename VARCHAR(255) NOT NULL, content_type VARCHAR(100) NOT NULL, "
            "size_bytes BIGINT NOT NULL, is_confidential BOOLEAN NOT NULL, created_at BIGINT NOT NULL)"
        ))
        connection.execute(text(
            "INSERT INTO stored_files VALUES "
            "(1, 1, NULL, 1, 'sample-key', 'sample.txt', 'text/plain', 10, 1, 1)"
        ))

    upgrade_dev_schema(engine)
    upgrade_dev_schema(engine)

    file_columns = {column["name"] for column in inspect(engine).get_columns("stored_files")}
    report_columns = {column["name"] for column in inspect(engine).get_columns("message_reports")}
    with engine.connect() as connection:
        stored_file_count = connection.execute(
            text("SELECT COUNT(*) FROM stored_files WHERE storage_key = 'sample-key'")
        ).scalar_one()

    assert "message_id" in file_columns
    assert {"review_status", "reviewed_by_user_id", "reviewed_at"} <= report_columns
    assert stored_file_count == 1
