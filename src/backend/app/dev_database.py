"""Bring the local development database up to the schema expected by the app."""

from sqlalchemy import Engine, inspect, text

from app.database import get_engine
from app.models.auth_session import AuthSession
from app.models.audit_event import AuditEvent
from app.models.base import Base
from app.models.conversation import Conversation, ConversationMember
from app.models.message import Message
from app.models.message_report import MessageReport
from app.models.organisation import Organisation
from app.models.stored_file import StoredFile
from app.models.user import User

_REGISTERED_MODELS = (
    AuthSession,
    AuditEvent,
    Conversation,
    ConversationMember,
    Message,
    MessageReport,
    Organisation,
    StoredFile,
    User,
)


def _ensure_columns(engine: Engine, table_name: str, definitions: dict[str, str]) -> None:
    columns = {column["name"] for column in inspect(engine).get_columns(table_name)}
    for column_name, definition in definitions.items():
        if column_name in columns:
            continue
        with engine.begin() as connection:
            connection.execute(
                text(f"ALTER TABLE `{table_name}` ADD COLUMN `{column_name}` {definition}")
            )
        columns.add(column_name)


def _ensure_mysql_constraints(engine: Engine) -> None:
    inspector = inspect(engine)
    if engine.dialect.name != "mysql":
        return

    report_checks = {
        constraint.get("name")
        for constraint in inspector.get_check_constraints("message_reports")
    }
    if "ck_message_reports_review_status" not in report_checks:
        with engine.begin() as connection:
            connection.execute(text(
                "ALTER TABLE message_reports ADD CONSTRAINT "
                "ck_message_reports_review_status "
                "CHECK (review_status IN ('open', 'in_review', 'resolved'))"
            ))

    report_foreign_keys = {
        foreign_key.get("name")
        for foreign_key in inspect(engine).get_foreign_keys("message_reports")
    }
    if "fk_message_reports_reviewer" not in report_foreign_keys:
        with engine.begin() as connection:
            connection.execute(text(
                "ALTER TABLE message_reports ADD CONSTRAINT "
                "fk_message_reports_reviewer FOREIGN KEY (reviewed_by_user_id) "
                "REFERENCES users (id) ON DELETE SET NULL"
            ))

    file_indexes = {
        index["name"] for index in inspect(engine).get_indexes("stored_files")
    }
    if "ix_stored_files_message_id" not in file_indexes:
        with engine.begin() as connection:
            connection.execute(text(
                "CREATE INDEX ix_stored_files_message_id ON stored_files (message_id)"
            ))

    file_foreign_keys = {
        foreign_key.get("name")
        for foreign_key in inspect(engine).get_foreign_keys("stored_files")
    }
    if "fk_stored_files_message" not in file_foreign_keys:
        with engine.begin() as connection:
            connection.execute(text(
                "ALTER TABLE stored_files ADD CONSTRAINT fk_stored_files_message "
                "FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE"
            ))


def upgrade_dev_schema(engine: Engine | None = None) -> None:
    active_engine = engine or get_engine()
    Base.metadata.create_all(active_engine)

    _ensure_columns(
        active_engine,
        "message_reports",
        {
            "review_status": "VARCHAR(16) NOT NULL DEFAULT 'open'",
            "reviewed_by_user_id": "INT NULL",
            "reviewed_at": "BIGINT NULL",
        },
    )
    _ensure_columns(active_engine, "stored_files", {"message_id": "INT NULL"})
    _ensure_mysql_constraints(active_engine)


if __name__ == "__main__":
    upgrade_dev_schema()
