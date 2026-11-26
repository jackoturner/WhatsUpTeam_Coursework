from sqlalchemy import BigInteger, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organisation_id: Mapped[int] = mapped_column(
        ForeignKey("organisations.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    source_ip: Mapped[str] = mapped_column(String(45), nullable=False)
    # Never store message bodies here: audit rows are visible to organisation admins.
    details: Mapped[str] = mapped_column(String(255), nullable=False)
    occurred_at: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
