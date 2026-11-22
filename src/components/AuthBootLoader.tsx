import React from 'react';
import { CountryFlagBadge, HostapayMark } from './HpayIcons';

export function AuthBootLoader({
  phase,
  error,
  lang = 'ar',
  platformName = 'Nexus Agency',
  countryCode = 'EG',
  onRetry,
}: {
  phase: 'preparing' | 'accounts';
  error?: string | null;
  lang?: 'ar' | 'en';
  platformName?: string;
  countryCode?: 'SA' | 'EG' | 'AE' | 'KG';
  onRetry?: () => void;
}) {
  const isAr = lang === 'ar';

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="grid min-h-dvh w-full place-items-center bg-[#0f0b0c] bg-[radial-gradient(ellipse_at_top,rgba(196,69,75,0.18),transparent_60%)] px-6 text-white select-none"
    >
      <div className="w-full max-w-[420px] rounded-[24px] border border-[#c4454b]/25 bg-[#191113]/75 backdrop-blur-xl p-7 text-center shadow-[0_24px_60px_rgba(0,0,0,0.55)]">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#c4454b]/25 bg-[#221619]/75 px-3 py-1 text-[12px] font-semibold text-[#f3d5d7]">
          <CountryFlagBadge code={countryCode} />
          <span className="tracking-tight">{platformName}</span>
        </div>

        <div className="mx-auto mb-5 relative flex h-16 w-16 items-center justify-center">
          <div className="absolute inset-0 rounded-2xl border border-[#c4454b]/25 bg-[#201417]/80" />
          <div className="absolute -inset-1 rounded-[20px] border-2 border-transparent border-t-[#c4454b] border-r-[#e87d82]/45 animate-spin" />
          <HostapayMark className="relative z-10 h-7 w-7 text-white" />
        </div>

        <div className="text-[19px] font-semibold tracking-tight text-white">
          {isAr ? 'التفويض والتحقق' : 'Authorization'}
        </div>

        <div className="mt-2.5 text-[13.5px] text-[#c7b3b6]">
          {phase === 'preparing'
            ? isAr
              ? 'جاري تجهيز بوابة الدخول والتحقق من الجلسة…'
              : 'Preparing authorization redirect…'
            : isAr
            ? 'جاري تحميل بيانات الحساب…'
            : 'Loading account desk…'}
        </div>

        {!error && (
          <div className="mt-5 h-1 w-full overflow-hidden rounded-full bg-[#2a1c1f]">
            <div
              className={`h-full rounded-full bg-[#c4454b] transition-all duration-500 ease-out ${
                phase === 'preparing' ? 'w-2/5' : 'w-[88%]'
              }`}
            />
          </div>
        )}

        {error && (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-[#e35d6a]/40 bg-[#e35d6a]/12 p-3 text-[13px] text-[#fda4af]">
              {error}
            </div>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-2xl bg-[#b83b44]/85 hover:bg-[#c94a53]/90 border border-[#f29b9f]/25 px-5 py-2.5 text-[13.5px] font-semibold text-white backdrop-blur-md cursor-pointer"
              >
                {isAr ? 'إعادة المحاولة' : 'Retry'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
