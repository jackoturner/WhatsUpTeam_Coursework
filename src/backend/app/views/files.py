from pydantic import BaseModel, Field


class StoredFileView(BaseModel):
    id: int
    filename: str
    content_type: str
    size_bytes: int
    is_confidential: bool
    created_at: str
    can_download: bool
    preview_url: str
    download_url: str | None


class StoredFileList(BaseModel):
    files: list[StoredFileView]


class ReshareAttachmentRequest(BaseModel):
    target_conversation_id: int = Field(ge=1)
