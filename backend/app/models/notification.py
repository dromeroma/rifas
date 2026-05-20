from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base_mixins import TimestampMixin


class Notification(Base, TimestampMixin):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), nullable=True)
    channel: Mapped[str] = mapped_column(String(20), nullable=False)  # email|whatsapp|inapp
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
