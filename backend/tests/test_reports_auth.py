import sys
from types import ModuleType
from unittest.mock import patch

from fastapi import HTTPException

from app.core.security import verify_supabase_access_token

# Unit test ini tidak membuka koneksi database. Stub modul database agar suite
# auth dapat berjalan tanpa driver/native PostgreSQL di environment test.
database_stub = ModuleType("app.core.database")
database_stub.execute_query = lambda *args, **kwargs: None
sys.modules.setdefault("app.core.database", database_stub)

from app.routers import reports


ADMIN_ID = "11111111-1111-4111-8111-111111111111"


def test_delete_requires_bearer_token():
    try:
        verify_supabase_access_token(credentials=None)
    except HTTPException as exc:
        assert exc.status_code == 401
    else:
        raise AssertionError("Token kosong seharusnya ditolak")


@patch("app.routers.reports.execute_query")
def test_delete_rejects_non_admin(mock_execute_query):
    mock_execute_query.return_value = None

    try:
        reports._require_admin({"sub": ADMIN_ID})
    except HTTPException as exc:
        assert exc.status_code == 403
    else:
        raise AssertionError("User non-admin seharusnya ditolak")
    mock_execute_query.assert_called_once_with(
        "SELECT 1 FROM auth.users WHERE id = %s AND raw_app_meta_data->>'app_role' = 'admin'",
        (ADMIN_ID,),
        fetch="one",
    )


@patch("app.routers.reports.execute_query")
def test_delete_uses_token_subject_for_admin_lookup(mock_execute_query):
    mock_execute_query.side_effect = [{"?column?": 1}, {"id": "report-1"}]

    response = reports.delete_detection_feedback_report(
        "report-1",
        payload={"sub": ADMIN_ID},
    )

    assert response == {"message": "Report dihapus"}
    assert mock_execute_query.call_args_list[0].args == (
        "SELECT 1 FROM auth.users WHERE id = %s AND raw_app_meta_data->>'app_role' = 'admin'",
        (ADMIN_ID,),
    )
