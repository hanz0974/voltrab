"""
Skema Pydantic untuk validasi request dan response.
"""
from pydantic import BaseModel
from typing import Any, Optional


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
    matched_component_id: Optional[str] = None


class DetectionResponse(BaseModel):
    detections: list[DetectionResultItem]
    image_url: Optional[str] = None
