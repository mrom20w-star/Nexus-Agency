import React, { useState } from 'react';
import { Lock, Mail, ShieldAlert } from 'lucide-react';
import { HostapayLogo } from './HpayIcons';
import { Language } from '../types';

export function LoginView({
  lang,
  platformName,
  countryCode = 'EG',
  onLogin,
  onToggleLang,
}: {
  lang: Language;
  platformName: string;
  countryCode?: 'SA' | 'EG' | 'AE' | 'KG';
  onLogin: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  onToggleLang: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError(
        lang === 'ar'
          ? 'من فضلك اكتب البريد الإلكتروني وكلمة المرور الأول'
          : 'Please enter both email and password'
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await onLogin(email.trim(), password);
      if (!res.ok) {
        setError(
          res.error ||
            (lang === 'ar'
              ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة، أو الحساب غير مفعّل'
              : 'Invalid email or password, or account is not active')
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="min-h-dvh w-full bg-[#16070a] bg-[radial-gradient(ellipse_at_top,rgba(205,58,68,0.34),transparent_60%),radial-gradient(ellipse_at_bottom_left,rgba(184,48,58,0.22),transparent_58%)] flex flex-col items-center justify-center p-4"
    >
      <div className="w-full max-w-[430px] rounded-[20px] border border-[#e05b64]/30 bg-[#280e14]/58 backdrop-blur-xl p-7 shadow-[0_24px_60px_rgba(0,0,0,0.55)] space-y-6">
        <div className="flex items-center justify-between gap-3">
          <HostapayLogo platformName={platformName} countryCode={countryCode} />
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleLang}
              className="rounded-lg border border-[#c4454b]/25 bg-[#24181b]/75 px-2.5 py-1 text-[12px] text-[#d8c7c9] hover:text-white cursor-pointer"
            >
              {lang === 'ar' ? 'EN' : 'مصري'}
            </button>
          </div>
        </div>

        <div>
          <h1 className="text-[20px] font-bold text-white">
            {lang === 'ar' ? 'تسجيل دخول الوكيل' : 'Agent Sign In'}
          </h1>
          <p className="mt-1 text-[13px] text-[#cbb3b7]">
            {lang === 'ar'
              ? 'أدخل البريد الإلكتروني وكلمة المرور للدخول إلى حسابك'
              : 'Enter your email and password to sign in to your account'}
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-[12px] border border-[#e35d6a]/40 bg-[#e35d6a]/12 p-3 text-[12.5px] text-[#fda4af]">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[#d8c7c9] block">
              {lang === 'ar' ? 'البريد الإلكتروني' : 'Email Address'}
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-[#9e868a]" />
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="agent@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-[10px] border border-[#c4454b]/25 bg-[#120c0e]/85 ps-10 pe-3 py-2.5 text-[13.5px] text-white placeholder:text-[#7a6468] outline-none focus:border-[#d15b62]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[#d8c7c9] block">
              {lang === 'ar' ? 'كلمة المرور' : 'Password'}
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-[#9e868a]" />
              <input
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-[10px] border border-[#c4454b]/25 bg-[#120c0e]/85 ps-10 pe-3 py-2.5 text-[13.5px] text-white placeholder:text-[#7a6468] outline-none focus:border-[#d15b62]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-[10px] bg-[#b83b44]/85 hover:bg-[#c94a53]/90 border border-[#f29b9f]/25 py-3 text-[14px] font-semibold text-white backdrop-blur-md shadow-[0_8px_24px_rgba(184,59,68,0.25)] disabled:opacity-60 transition-colors cursor-pointer"
          >
            {submitting
              ? lang === 'ar'
                ? 'جاري تسجيل الدخول...'
                : 'Signing in...'
              : lang === 'ar'
              ? 'دخول على المنصة'
              : 'Sign In to Desk'}
          </button>
        </form>
      </div>
    </div>
  );
}
