import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Zap, Mail, Lock, Loader2, AlertCircle, ArrowRight, UserPlus, LogIn, Eye, EyeOff, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useAuth } from '../lib/auth';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

interface AuthScreenProps {
  onAuthenticated?: () => void;
}

const RESEND_SECONDS = 60;

const AUTH_ERROR_MESSAGES: Array<[string, string]> = [
  ['invalid login credentials', 'Email atau password salah. Kalau Anda belum punya akun, daftar dulu lewat tab Daftar.'],
  ['email not confirmed', 'Email ini belum dikonfirmasi. Daftar ulang untuk menerima kode konfirmasi baru.'],
  ['user already registered', 'Email ini sudah terdaftar. Silakan masuk lewat tab Masuk.'],
  ['token has expired or is invalid', 'Kode konfirmasi salah atau sudah kedaluwarsa. Minta kode baru lalu coba lagi.'],
  ['for security purposes', 'Permintaan terlalu cepat. Tunggu sebentar sebelum meminta kode lagi.'],
  ['email rate limit exceeded', 'Terlalu banyak email dikirim ke alamat ini. Coba lagi beberapa menit lagi.'],
  ['password should be at least', 'Password minimal 6 karakter.'],
  ['unable to validate email address', 'Format email tidak valid.'],
  ['failed to fetch', 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.'],
  ['captcha', 'Verifikasi keamanan gagal. Coba centang ulang lalu ulangi.'],
];

function translateAuthError(message: string): string {
  const lower = message.toLowerCase();
  const match = AUTH_ERROR_MESSAGES.find(([key]) => lower.includes(key));
  return match ? match[1] : message;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const { signIn, sendSignUpCode, verifySignUpCode, sendPasswordResetCode, resetPasswordWithCode, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [captchaToken, setCaptchaToken] = useState('');
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  // Token Turnstile sekali pakai: harus di-reset setelah tiap percobaan.
  const resetCaptcha = () => {
    turnstileRef.current?.reset();
    setCaptchaToken('');
  };

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  const handleSendCode = async () => {
    const target = email.trim();
    if (!target) {
      setError('Masukkan email terlebih dahulu.');
      return;
    }

    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setError('Selesaikan verifikasi keamanan di bawah terlebih dahulu.');
      return;
    }

    setError(null);
    setNotice(null);
    setSendingCode(true);
    const { error: sendError } = mode === 'forgot'
      ? await sendPasswordResetCode(target, captchaToken || undefined)
      : await sendSignUpCode(target, captchaToken || undefined);
    setSendingCode(false);
    resetCaptcha();

    if (sendError) {
      setError(translateAuthError(sendError));
      return;
    }

    setCodeSent(true);
    setResendIn(RESEND_SECONDS);
    setNotice(
      mode === 'forgot'
        ? `Jika ${target} terdaftar, kode reset password telah dikirim ke email tersebut. Periksa juga folder spam.`
        : `Kode konfirmasi telah dikirim ke ${target}. Periksa juga folder spam.`,
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode !== 'login') {
      if (password !== confirmPassword) {
        setError('Konfirmasi password tidak cocok.');
        return;
      }
      if (!codeSent) {
        setError('Kirim kode konfirmasi ke email Anda terlebih dahulu.');
        return;
      }
    }

    if (mode === 'login' && TURNSTILE_SITE_KEY && !captchaToken) {
      setError('Selesaikan verifikasi keamanan di bawah terlebih dahulu.');
      return;
    }

    setLoading(true);

    const result = mode === 'login'
      ? await signIn(email.trim(), password, captchaToken || undefined)
      : mode === 'forgot'
        ? await resetPasswordWithCode(email.trim(), code.trim(), password)
        : await verifySignUpCode(email.trim(), code.trim(), password);

    if (mode === 'login') resetCaptcha();

    if (!result.error) {
      setLoading(false);
      onAuthenticated?.();
      return;
    }

    // Pesan login gagal dibuat sama untuk semua email agar tidak mengungkapkan email yang terdaftar.
    // RPC email_is_registered sudah ditutup untuk pengguna yang belum masuk (perbaikan keamanan M5).
    const message = translateAuthError(result.error);

    setLoading(false);
    setError(message);
  };

  const resetFormState = (next: 'login' | 'register' | 'forgot') => {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword('');
    setConfirmPassword('');
    setCode('');
    setCodeSent(false);
    setResendIn(0);
    resetCaptcha();
  };

  const switchMode = () => resetFormState(mode === 'login' ? 'register' : 'login');

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      setError(translateAuthError(error));
      setGoogleLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900 px-4 py-8">
      {/* Background decorations */}
      <div className="absolute inset-0 bg-grid opacity-20" />
      <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
      <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-accent-500/10 blur-3xl" />
      <div className="absolute right-1/4 top-1/3 h-64 w-64 rounded-full bg-brand-400/10 blur-3xl" />

      <div className="relative w-full max-w-md animate-slide-up">
        {/* Logo & Title */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow">
            <Zap className="h-8 w-8" fill="currentColor" />
          </div>
          <h1 className="text-2xl font-bold text-white">VoltRAB</h1>
          <p className="mt-1 text-sm text-brand-200">RAB Kelistrikan & Deteksi Denah</p>
        </div>

        {/* Auth Card */}
        <div className="rounded-2xl border border-white/10 bg-white/95 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">
              {mode === 'login' ? 'Masuk ke Akun' : mode === 'forgot' ? 'Atur Ulang Password' : 'Daftar Akun Baru'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {mode === 'login'
                ? 'Masuk untuk melanjutkan progres RAB Anda'
                : mode === 'forgot'
                  ? 'Masukkan email akun Anda, lalu buat password baru dengan kode yang dikirim ke email'
                  : 'Buat akun untuk menyimpan progres RAB Anda'}
            </p>
          </div>

          {/* Mode toggle */}
          {mode !== 'forgot' && (
          <div className="mb-6 flex gap-1 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => resetFormState('login')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                mode === 'login'
                  ? 'bg-white text-brand-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <LogIn className="h-4 w-4" />
              Masuk
            </button>
            <button
              type="button"
              onClick={() => resetFormState('register')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                mode === 'register'
                  ? 'bg-white text-brand-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <UserPlus className="h-4 w-4" />
              Daftar
            </button>
          </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label-base" htmlFor="email">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  className={mode !== 'login' ? 'input-base pl-10 pr-32' : 'input-base pl-10'}
                  autoComplete="email"
                  disabled={loading}
                />
                {mode !== 'login' && (
                  <button
                    type="button"
                    onClick={() => void handleSendCode()}
                    disabled={sendingCode || loading || resendIn > 0 || !email.trim()}
                    className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {sendingCode ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Mengirim
                      </>
                    ) : resendIn > 0 ? (
                      `Kirim ulang ${resendIn}s`
                    ) : codeSent ? (
                      'Kirim ulang'
                    ) : (
                      'Kirim kode'
                    )}
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="label-base" htmlFor="password">{mode === 'forgot' ? 'Password Baru' : 'Password'}</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="input-base pl-10 pr-12"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {mode === 'login' && (
                <div className="mt-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => resetFormState('forgot')}
                    className="text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700"
                  >
                    Lupa password?
                  </button>
                </div>
              )}
            </div>

            {mode !== 'login' && (
              <>
                <div>
                  <label className="label-base" htmlFor="confirmPassword">Konfirmasi Password</label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Ulangi password"
                      className="input-base pl-10"
                      autoComplete="new-password"
                      disabled={loading}
                    />
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="mt-1.5 text-xs font-medium text-rose-600">Password belum cocok</p>
                  )}
                </div>

                <div>
                  <label className="label-base" htmlFor="code">Kode Konfirmasi</label>
                  <div className="relative">
                    <ShieldCheck className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="code"
                      type="text"
                      required
                      inputMode="numeric"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="6 digit kode"
                      className="input-base pl-10 tracking-[0.3em]"
                      autoComplete="one-time-code"
                      disabled={loading}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    Masukkan kode yang dikirim ke email Anda lewat tombol &ldquo;Kirim kode&rdquo;.
                  </p>
                </div>
              </>
            )}

            {TURNSTILE_SITE_KEY && (
              <Turnstile
                ref={turnstileRef}
                siteKey={TURNSTILE_SITE_KEY}
                onSuccess={setCaptchaToken}
                onExpire={() => setCaptchaToken('')}
                onError={() => setCaptchaToken('')}
                options={{ theme: 'light', size: 'flexible' }}
              />
            )}

            {notice && (
              <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 animate-fade-in">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{notice}</span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 animate-fade-in">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-base"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  {mode === 'login' ? 'Masuk' : mode === 'forgot' ? 'Simpan Password Baru' : 'Daftar Sekarang'}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {mode !== 'forgot' && (
          <>
          {/* Divider */}
          <div className="mt-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium text-slate-400">atau</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          {/* Google login */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading || loading}
            className="mt-5 flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {googleLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            <span>{googleLoading ? 'Menghubungkan...' : 'Masuk dengan Google'}</span>
          </button>
          </>
          )}

          {/* Switch mode link */}
          <p className="mt-6 text-center text-sm text-slate-500">
            {mode === 'login' ? 'Belum punya akun? ' : mode === 'forgot' ? 'Ingat password Anda? ' : 'Sudah punya akun? '}
            <button
              type="button"
              onClick={switchMode}
              className="font-semibold text-brand-600 transition-colors hover:text-brand-700"
            >
              {mode === 'login' ? 'Daftar di sini' : 'Masuk di sini'}
            </button>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-brand-200/70">
          Progres RAB Anda tersimpan aman per akun
        </p>
      </div>
    </div>
  );
}
