from urllib.parse import quote, unquote
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import file_storage
from app.services.access import client_ip
from app.services.auth import current_user, verify_csrf
from app.views.auth import UserView, user_view
from app.views.files import ReshareAttachmentRequest, StoredFileList
from app.views.messaging import MessageView

router = APIRouter(tags=["files"])


async def _read_limited_body(request: Request, maximum: int) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > maximum:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="The file is too large.",
                )
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid content length.") from None

    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > maximum:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="The file is too large.",
            )
    return bytes(content)


def _filename(request: Request) -> str:
    encoded = request.headers.get("x-file-name", "")
    if not encoded or len(encoded) > 1024:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="A valid filename is required.")
    try:
        return unquote(encoded, errors="strict")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="A valid filename is required.",
        ) from None


@router.get("/conversations/{conversation_id}/attachments", response_model=StoredFileList)
def list_attachments(
    conversation_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> StoredFileList:
    user = current_user(db, request)
    return StoredFileList(files=file_storage.list_attachments(db, user, conversation_id))


@router.post(
    "/conversations/{conversation_id}/attachments",
    response_model=MessageView,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_csrf)],
)
async def upload_attachment(
    conversation_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    confidential: bool = False,
) -> MessageView:
    user = current_user(db, request)
    content = await _read_limited_body(request, file_storage.MAX_ATTACHMENT_BYTES)
    return file_storage.store_attachment(
        db,
        user,
        conversation_id,
        _filename(request),
        content,
        confidential,
        client_ip(request),
    )


@router.get("/conversations/{conversation_id}/attachments/{file_id}/preview")
def preview_attachment(
    conversation_id: int,
    file_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> FileResponse:
    user = current_user(db, request)
    stored_file = file_storage.attachment_for_preview(db, user, conversation_id, file_id)
    encoded_filename = quote(stored_file.original_filename, safe="")
    return FileResponse(
        file_storage.safe_file_path(stored_file.storage_key),
        media_type=stored_file.content_type,
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{encoded_filename}",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


@router.get("/conversations/{conversation_id}/attachments/{file_id}")
def download_attachment(
    conversation_id: int,
    file_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> FileResponse:
    user = current_user(db, request)
    stored_file = file_storage.attachment_for_download(db, user, conversation_id, file_id)
    return FileResponse(
        file_storage.safe_file_path(stored_file.storage_key),
        media_type=stored_file.content_type,
        filename=stored_file.original_filename,
        headers={
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


@router.post(
    "/conversations/{conversation_id}/attachments/{file_id}/share",
    response_model=MessageView,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_csrf)],
)
def reshare_attachment(
    conversation_id: int,
    file_id: int,
    payload: ReshareAttachmentRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> MessageView:
    user = current_user(db, request)
    return file_storage.reshare_attachment(
        db,
        user,
        conversation_id,
        file_id,
        payload.target_conversation_id,
        client_ip(request),
    )


@router.post(
    "/auth/avatar",
    response_model=UserView,
    dependencies=[Depends(verify_csrf)],
)
async def upload_avatar(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> UserView:
    user = current_user(db, request)
    content = await _read_limited_body(request, file_storage.MAX_AVATAR_BYTES)
    updated = file_storage.store_avatar(db, user, _filename(request), content, client_ip(request))
    return user_view(updated)


@router.delete(
    "/auth/avatar",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(verify_csrf)],
)
def remove_avatar(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    user = current_user(db, request)
    file_storage.delete_avatar(db, user, client_ip(request))


@router.get("/users/{user_id}/avatar")
def get_avatar(
    user_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> FileResponse:
    viewer = current_user(db, request)
    stored_file = file_storage.avatar_for_viewer(db, viewer, user_id)
    return FileResponse(
        file_storage.safe_file_path(stored_file.storage_key),
        media_type=stored_file.content_type,
        headers={
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )
