"""
Skema Pydantic untuk validasi request dan response.
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Any, Optional


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserResponse(BaseModel):
    id: str
    email: str


class ProjectSave(BaseModel):
    name: str = "Project Tanpa Nama"
    project_data: dict[str, Any]


class ProjectResponse(BaseModel):
    id: str
    name: str
    project_data: dict[str, Any]
    updated_at: str
    created_at: str


class DetectionResultItem(BaseModel):
    label: str
    confidence: float
    bbox: dict
    ocr_text: Optional[str] = None
    matched_component_id: Optional[str] = None


class DetectionResponse(BaseModel):
    detections: list[DetectionResultItem]
    image_url: Optional[str] = None
