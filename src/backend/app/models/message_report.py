from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class MessageReport(Base):
    __tablename__ = "message_reports"
    __table_args__ = (
        UniqueConstraint("message_id", "reporter_id", name="uq_message_reports_message_reporter"),
        CheckConstraint(
            "review_status IN ('open', 'in_review', 'resolved')",
            name="ck_message_reports_review_status",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    message_id: Mapped[int] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"), nullable=False
    )
    reporter_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
    review_status: Mapped[str] = mapped_column(String(16), nullable=False, default="open")
    reviewed_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_at: Mapped[int | None] = mapped_column(BigInteger)
