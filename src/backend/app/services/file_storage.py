"""Validated, access-controlled storage for message attachments and user avatars."""

import os
import re
import time
import uuid
from pathlib import Path, PurePosixPath
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.conversation import Conversation
from app.models.message import Message
from app.models.stored_file import StoredFile
from app.models.user import User
from app.services.access import require_conversation_member
from app.services.audit import record_event
from app.views.files import StoredFileView
from app.views.messaging import MessageView, iso_utc

MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
MAX_AVATAR_BYTES = 2 * 1024 * 1024
TEXT_EXTENSIONS = {".txt"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
ALLOWED_EXTENSIONS = TEXT_EXTENSIONS | IMAGE_EXTENSIONS | {".pdf"}
STORAGE_KEY_PATTERN = re.compile(r"^[0-9a-f]{32}$")


def _storage_root() -> Path:
    return Path(os.environ.get("ATTACHMENT_STORAGE_PATH", "/var/lib/whatsup/attachments"))


def _safe_filename(filename: str) -> str:
    basename = PurePosixPath(filename.replace("\\", "/")).name
    cleaned = "".join(
        character
        for character in basename
        if character.isprintable() and character not in '<>:"/\\|?*'
    ).strip(" .")
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="A valid filename is required.")
    return cleaned[:255]


def _detect_content(filename: str, content: bytes, *, avatar: bool = False) -> str:
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="The file is empty.")
    extension = Path(filename).suffix.lower()
    detected: str | None = None
    if content.startswith(b"%PDF-"):
        detected = "application/pdf"
    elif content.startswith(b"\x89PNG\r\n\x1a\n"):
        detected = "image/png"
    elif content.startswith(b"\xff\xd8\xff"):
        detected = "image/jpeg"
    elif len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        detected = "image/webp"
    elif extension in TEXT_EXTENSIONS:
        try:
            decoded = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            decoded = ""
        if decoded and not any(
            (ord(character) < 32 and character not in "\r\n\t") or ord(character) == 127
            for character in decoded
        ):
            detected = "text/plain"

    extensions_by_type = {
        "application/pdf": {".pdf"},
        "image/png": {".png"},
        "image/jpeg": {".jpg", ".jpeg"},
        "image/webp": {".webp"},
        "text/plain": TEXT_EXTENSIONS,
    }
    allowed = set().union(*extensions_by_type.values())
    if avatar:
        allowed = IMAGE_EXTENSIONS
    if detected is None or extension not in allowed or extension not in extensions_by_type[detected]:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="This file type is not allowed or does not match its contents.",
        )
    if avatar and not detected.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Avatar must be a supported image.")
    return detected


def _write_file(storage_key: str, content: bytes) -> Path:
    root = _storage_root()
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    target = root / storage_key
    with target.open("xb") as stored:
        stored.write(content)
        stored.flush()
        os.fsync(stored.fileno())
    return target


def _remove_file(storage_key: str) -> None:
    if STORAGE_KEY_PATTERN.fullmatch(storage_key) is None:
        raise ValueError("Invalid internal storage key.")
    (_storage_root() / storage_key).unlink(missing_ok=True)


def safe_file_path(storage_key: str) -> Path:
    if STORAGE_KEY_PATTERN.fullmatch(storage_key) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")
    path = _storage_root() / storage_key
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")
    return path


def attachment_view(stored_file: StoredFile) -> StoredFileView:
    if stored_file.conversation_id is None:
        raise ValueError("Only conversation attachments have an attachment view.")
    base_url = f"/api/conversations/{stored_file.conversation_id}/attachments/{stored_file.id}"
    can_download = not stored_file.is_confidential
    return StoredFileView(
        id=stored_file.id,
        filename=stored_file.original_filename,
        content_type=stored_file.content_type,
        size_bytes=stored_file.size_bytes,
        is_confidential=stored_file.is_confidential,
        created_at=iso_utc(stored_file.created_at),
        can_download=can_download,
        preview_url=f"{base_url}/preview",
        download_url=base_url if can_download else None,
    )


def list_attachments(db: Session, user: User, conversation_id: int) -> list[StoredFileView]:
    conversation = require_conversation_member(db, user, conversation_id)
    files = db.scalars(
        select(StoredFile)
        .where(StoredFile.conversation_id == conversation.id)
        .order_by(StoredFile.id)
    ).all()
    return [
        attachment_view(stored_file)
        for stored_file in files
    ]


def store_attachment(
    db: Session,
    user: User,
    conversation_id: int,
    filename: str,
    content: bytes,
    confidential: bool,
    source_ip: str,
) -> MessageView:
    conversation = require_conversation_member(db, user, conversation_id)
    if len(content) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="The file is too large.")
    safe_name = _safe_filename(filename)
    content_type = _detect_content(safe_name, content)
    storage_key = uuid.uuid4().hex
    path = _write_file(storage_key, content)
    created_at = int(time.time())
    message = Message(
        conversation_id=conversation.id,
        sender_id=user.id,
        body=f"Shared an attachment: {safe_name}",
        created_at=created_at,
    )
    try:
        db.add(message)
        db.flush()
        stored_file = StoredFile(
            conversation_id=conversation.id,
            message_id=message.id,
            owner_user_id=None,
            uploaded_by_user_id=user.id,
            storage_key=storage_key,
            original_filename=safe_name,
            content_type=content_type,
            size_bytes=len(content),
            is_confidential=confidential,
            created_at=created_at,
        )
        db.add(stored_file)
        record_event(
            db,
            event_type="attachment_uploaded",
            organisation_id=user.organisation_id,
            actor_user_id=user.id,
            source_ip=source_ip,
            details=f"Attachment uploaded to conversation {conversation.id} ({len(content)} bytes).",
        )
        db.commit()
        db.refresh(stored_file)
        db.refresh(message)
    except Exception:
        db.rollback()
        path.unlink(missing_ok=True)
        raise
    return MessageView(
        id=message.id,
        conversation_id=message.conversation_id,
        author_name=user.display_name,
        body=message.body,
        created_at=iso_utc(message.created_at),
        is_mine=True,
        attachments=[attachment_view(stored_file)],
    )


def _conversation_attachment(
    db: Session,
    user: User,
    conversation_id: int,
    file_id: int,
) -> StoredFile:
    conversation = require_conversation_member(db, user, conversation_id)
    stored_file = db.scalar(
        select(StoredFile).where(
            StoredFile.id == file_id,
            StoredFile.conversation_id == conversation.id,
        )
    )
    if stored_file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")
    return stored_file


def attachment_for_preview(
    db: Session,
    user: User,
    conversation_id: int,
    file_id: int,
) -> StoredFile:
    return _conversation_attachment(db, user, conversation_id, file_id)


def attachment_for_download(
    db: Session,
    user: User,
    conversation_id: int,
    file_id: int,
) -> StoredFile:
    stored_file = _conversation_attachment(db, user, conversation_id, file_id)
    if stored_file.is_confidential:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Confidential attachments are preview-only.",
        )
    return stored_file


def reshare_attachment(
    db: Session,
    user: User,
    source_conversation_id: int,
    file_id: int,
    target_conversation_id: int,
    source_ip: str,
) -> MessageView:
    source = require_conversation_member(db, user, source_conversation_id)
    target = require_conversation_member(db, user, target_conversation_id)
    if source.id == target.id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Choose a different conversation for internal sharing.",
        )
    source_file = db.scalar(
        select(StoredFile).where(
            StoredFile.id == file_id,
            StoredFile.conversation_id == source.id,
        )
    )
    if source_file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")

    content = safe_file_path(source_file.storage_key).read_bytes()
    storage_key = uuid.uuid4().hex
    path = _write_file(storage_key, content)
    created_at = int(time.time())
    message = Message(
        conversation_id=target.id,
        sender_id=user.id,
        body=f"Shared an attachment: {source_file.original_filename}",
        created_at=created_at,
    )
    try:
        db.add(message)
        db.flush()
        shared_file = StoredFile(
            conversation_id=target.id,
            message_id=message.id,
            owner_user_id=None,
            uploaded_by_user_id=user.id,
            storage_key=storage_key,
            original_filename=source_file.original_filename,
            content_type=source_file.content_type,
            size_bytes=source_file.size_bytes,
            is_confidential=source_file.is_confidential,
            created_at=created_at,
        )
        db.add(shared_file)
        record_event(
            db,
            event_type="attachment_reshared",
            organisation_id=user.organisation_id,
            actor_user_id=user.id,
            source_ip=source_ip,
            details=f"Attachment {source_file.id} shared from conversation {source.id} to {target.id}.",
        )
        db.commit()
        db.refresh(message)
        db.refresh(shared_file)
    except Exception:
        db.rollback()
        path.unlink(missing_ok=True)
        raise
    return MessageView(
        id=message.id,
        conversation_id=message.conversation_id,
        author_name=user.display_name,
        body=message.body,
        created_at=iso_utc(message.created_at),
        is_mine=True,
        attachments=[attachment_view(shared_file)],
    )


def store_avatar(
    db: Session,
    user: User,
    filename: str,
    content: bytes,
    source_ip: str,
) -> User:
    if len(content) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="The avatar is too large.")
    safe_name = _safe_filename(filename)
    content_type = _detect_content(safe_name, content, avatar=True)
    previous = db.scalar(select(StoredFile).where(StoredFile.owner_user_id == user.id))
    previous_storage_key = previous.storage_key if previous is not None else None
    storage_key = uuid.uuid4().hex
    path = _write_file(storage_key, content)
    stored_file = StoredFile(
        conversation_id=None,
        owner_user_id=user.id,
        uploaded_by_user_id=user.id,
        storage_key=storage_key,
        original_filename=safe_name,
        content_type=content_type,
        size_bytes=len(content),
        is_confidential=True,
        created_at=int(time.time()),
    )
    try:
        if previous is not None:
            db.delete(previous)
            db.flush()
        db.add(stored_file)
        user.avatar_url = f"/api/users/{user.id}/avatar"
        record_event(
            db,
            event_type="avatar_uploaded",
            organisation_id=user.organisation_id,
            actor_user_id=user.id,
            source_ip=source_ip,
            details="User uploaded an avatar.",
        )
        db.commit()
        db.refresh(user)
    except Exception:
        db.rollback()
        path.unlink(missing_ok=True)
        raise
    if previous_storage_key is not None:
        _remove_file(previous_storage_key)
    return user


def avatar_for_viewer(db: Session, viewer: User, user_id: int) -> StoredFile:
    owner = db.scalar(
        select(User).where(
            User.id == user_id,
            User.organisation_id == viewer.organisation_id,
            User.is_active.is_(True),
        )
    )
    if owner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found.")
    stored_file = db.scalar(
        select(StoredFile).where(StoredFile.owner_user_id == owner.id)
    )
    if stored_file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found.")
    return stored_file


def delete_avatar(db: Session, user: User, source_ip: str) -> None:
    stored_file = db.scalar(select(StoredFile).where(StoredFile.owner_user_id == user.id))
    user.avatar_url = None
    if stored_file is not None:
        db.delete(stored_file)
    record_event(
        db,
        event_type="avatar_removed",
        organisation_id=user.organisation_id,
        actor_user_id=user.id,
        source_ip=source_ip,
        details="User removed their avatar.",
    )
    db.commit()
    if stored_file is not None:
        _remove_file(stored_file.storage_key)
