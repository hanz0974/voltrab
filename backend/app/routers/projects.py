"""
Router untuk menyimpan dan memuat progres RAB per pengguna.
Menggunakan tabel user_projects di Supabase Postgres.
"""
from fastapi import APIRouter, HTTPException, Depends, status
from app.core.security import decode_access_token
from app.core.database import execute_query
from app.models.schemas import ProjectSave, ProjectResponse
import json

router = APIRouter(prefix="/projects", tags=["projects"])


def get_user_id(payload: dict) -> str:
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token tidak valid")
    return payload["sub"]


@router.get("", response_model=list[ProjectResponse])
def list_projects(payload: dict = Depends(decode_access_token)):
    """Ambil semua project milik user, diurutkan berdasarkan updated_at terbaru."""
    user_id = get_user_id(payload)
    rows = execute_query(
        """SELECT id, name, project_data, updated_at, created_at
           FROM user_projects
           WHERE user_id = %s
           ORDER BY updated_at DESC""",
        (user_id,),
        fetch="all",
    )
    return [
        ProjectResponse(
            id=str(r["id"]),
            name=r["name"],
            project_data=r["project_data"] if isinstance(r["project_data"], dict) else json.loads(r["project_data"]),
            updated_at=r["updated_at"].isoformat() if r["updated_at"] else "",
            created_at=r["created_at"].isoformat() if r["created_at"] else "",
        )
        for r in rows
    ]


@router.post("", response_model=ProjectResponse)
def save_project(project: ProjectSave, payload: dict = Depends(decode_access_token)):
    """Buat project baru atau update yang sudah ada (upsert berdasarkan project_data)."""
    user_id = get_user_id(payload)

    row = execute_query(
        """INSERT INTO user_projects (user_id, name, project_data)
           VALUES (%s, %s, %s)
           RETURNING id, name, project_data, updated_at, created_at""",
        (user_id, project.name, json.dumps(project.project_data)),
        fetch="one",
    )
    return ProjectResponse(
        id=str(row["id"]),
        name=row["name"],
        project_data=row["project_data"] if isinstance(row["project_data"], dict) else json.loads(row["project_data"]),
        updated_at=row["updated_at"].isoformat() if row["updated_at"] else "",
        created_at=row["created_at"].isoformat() if row["created_at"] else "",
    )


@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: str, project: ProjectSave, payload: dict = Depends(decode_access_token)):
    """Update project yang sudah ada."""
    user_id = get_user_id(payload)

    row = execute_query(
        """UPDATE user_projects
           SET name = %s, project_data = %s, updated_at = now()
           WHERE id = %s AND user_id = %s
           RETURNING id, name, project_data, updated_at, created_at""",
        (project.name, json.dumps(project.project_data), project_id, user_id),
        fetch="one",
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project tidak ditemukan")
    return ProjectResponse(
        id=str(row["id"]),
        name=row["name"],
        project_data=row["project_data"] if isinstance(row["project_data"], dict) else json.loads(row["project_data"]),
        updated_at=row["updated_at"].isoformat() if row["updated_at"] else "",
        created_at=row["created_at"].isoformat() if row["created_at"] else "",
    )


@router.delete("/{project_id}")
def delete_project(project_id: str, payload: dict = Depends(decode_access_token)):
    """Hapus project."""
    user_id = get_user_id(payload)
    execute_query(
        "DELETE FROM user_projects WHERE id = %s AND user_id = %s",
        (project_id, user_id),
        fetch="none",
    )
    return {"message": "Project dihapus"}
