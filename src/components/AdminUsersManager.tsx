import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Loader2, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AdminUserRecord {
  user_id: string;
  email: string;
  created_at: string;
}

interface AdminUsersManagerProps {
  currentUserId: string;
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'Terjadi kesalahan. Silakan coba lagi.';
}

export function AdminUsersManager({ currentUserId }: AdminUsersManagerProps) {
  const [admins, setAdmins] = useState<AdminUserRecord[]>([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadAdmins = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase.rpc('list_admin_users');
    if (fetchError) {
      setError(fetchError.message);
    } else {
      setAdmins((data ?? []) as AdminUserRecord[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAdmins();
  }, [loadAdmins]);

  const addAdmin = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    setSaving(true);
    setError(null);
    setWarning(null);
    setSuccess(null);
    const { error: addError } = await supabase.rpc('add_admin_user_by_email', {
      p_email: normalizedEmail,
    });

    if (addError) {
      if (addError.code === 'P0002') {
        setWarning(
          `${normalizedEmail} belum bisa dijadikan admin karena belum terdaftar di website ini. Minta user untuk daftar atau login terlebih dahulu.`,
        );
      } else {
        setError(addError.message);
      }
    } else {
      setEmail('');
      setSuccess(`${normalizedEmail} berhasil dijadikan admin.`);
      await loadAdmins();
    }
    setSaving(false);
  };

  const removeAdmin = async (admin: AdminUserRecord) => {
    if (!window.confirm(`Cabut akses admin dari ${admin.email}?`)) return;

    setRemovingId(admin.user_id);
    setError(null);
    setWarning(null);
    setSuccess(null);
    const { error: removeError } = await supabase.rpc('remove_admin_user', {
      p_user_id: admin.user_id,
    });

    if (removeError) {
      setError(removeError.message);
    } else {
      setSuccess(`Akses admin ${admin.email} berhasil dicabut.`);
      await loadAdmins();
    }
    setRemovingId(null);
  };

  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-brand-50 p-3 text-brand-600">
          <Users className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Kelola Admin</h2>
          <p className="mt-1 text-sm text-slate-600">
            User harus sudah pernah mendaftar atau login sebelum dapat dijadikan admin.
          </p>
        </div>
      </div>

      <form onSubmit={addAdmin} className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="email.user@gmail.com"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          required
        />
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Tambah Admin
        </button>
      </form>

      {error && <div className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{getErrorMessage(error)}</div>}
      {warning && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{warning}</span>
        </div>
      )}
      {success && <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Memuat daftar admin...
          </div>
        ) : admins.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Belum ada admin.</div>
        ) : (
          <ul className="divide-y divide-slate-200 bg-white">
            {admins.map((admin) => {
              const isCurrentUser = admin.user_id === currentUserId;
              return (
                <li key={admin.user_id} className="flex items-center justify-between gap-4 px-4 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="rounded-full bg-emerald-50 p-2 text-emerald-600">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{admin.email}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {isCurrentUser ? 'Akun Anda' : `Admin sejak ${new Date(admin.created_at).toLocaleDateString('id-ID')}`}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeAdmin(admin)}
                    disabled={isCurrentUser || removingId === admin.user_id}
                    title={isCurrentUser ? 'Anda tidak dapat mencabut akses admin sendiri' : 'Cabut akses admin'}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                  >
                    {removingId === admin.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    <span className="hidden sm:inline">Cabut</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
