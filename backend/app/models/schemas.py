"""
Skema Pydantic untuk validasi request dan response.
"""
from pydantic import BaseModel
from typing import Optional


class DetectionResultItem(BaseModel):
    label: str
    confidence: float
    bbox: dict
    matched_component_id: Optional[str] = None


class DetectionResponse(BaseModel):
    detections: list[DetectionResultItem]
    image_url: Optional[str] = None
