"""
Router untuk administrasi detection feedback reports.
"""
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import execute_query
from app.core.security import verify_supabase_access_token

router = APIRouter(prefix="/reports", tags=["reports"])


def _require_admin(payload: dict) -> str:
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token tidak valid")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token tidak valid")

    row = execute_query(
        "SELECT 1 FROM auth.users WHERE id = %s AND raw_app_meta_data->>'app_role' = 'admin'",
        (user_id,),
        fetch="one",
    )

    if not row:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hanya admin yang bisa menghapus report")

    return str(user_id)


@router.delete("/{report_id}")
def delete_detection_feedback_report(
    report_id: str,
    payload: dict = Depends(verify_supabase_access_token),
):
    """Hapus satu report deteksi milik user dari database."""
    _require_admin(payload)

    row = execute_query(
        "DELETE FROM detection_feedback_reports WHERE id = %s RETURNING id",
        (report_id,),
        fetch="one",
    )

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report tidak ditemukan")

    return {"message": "Report dihapus"}
