import React, { useState } from 'react';
import { ChevronLeft, Copy, Pin, X } from 'lucide-react';
import { t } from '../i18n';
import { Language } from '../types';
import { StatusBadge } from './StatusBadge';

export interface DrawerAction {
  label: string;
  tone?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  confirm?: {
    severity: 'danger' | 'warning' | 'info';
    title: string;
    message?: string;
    confirmLabel: string;
  };
  onClick: () => void | Promise<void>;
}

interface DetailDrawerProps {
  open: boolean;
  lang: Language;
  title: string;
  section?: string;
  status?: string;
  copyText?: string;
  skipConfirm?: boolean;
  onCopySuccess?: () => void;
  onClose: () => void;
  canBack?: boolean;
  onBack?: () => void;
  actions?: DrawerAction[];
  children: React.ReactNode;
}

export function DetailDrawer({
  open,
  lang,
  title,
  section,
  status,
  copyText,
  skipConfirm,
  onCopySuccess,
  onClose,
  canBack,
  onBack,
  actions = [],
  children,
}: DetailDrawerProps) {
  const [pinned, setPinned] = useState(false);
  const [inlineConfirm, setInlineConfirm] = useState<DrawerAction | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleActionClick = async (act: DrawerAction) => {
    if (act.disabled || busy) return;
    if (act.confirm && !skipConfirm) {
      setInlineConfirm(act);
      return;
    }
    setBusy(true);
    try {
      await act.onClick();
    } finally {
      setBusy(false);
      setInlineConfirm(null);
    }
  };

  const handleConfirm = async () => {
    if (!inlineConfirm || busy) return;
    setBusy(true);
    try {
      await inlineConfirm.onClick();
    } finally {
      setBusy(false);
      setInlineConfirm(null);
    }
  };

  const handleCopy = async () => {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
      onCopySuccess?.();
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="fixed z-50 lg:z-35 top-0 lg:top-[3.75rem] end-0 w-full lg:w-[475px] h-full lg:h-[calc(100vh-3.75rem)] bg-[#171012]/90 backdrop-blur-xl border-s border-[#c4454b]/22 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-5 h-[3.75rem] border-b border-[#c4454b]/20 shrink-0">
          <div className="flex min-w-0 items-center gap-2">
            {canBack && onBack && (
              <button
                type="button"
                onClick={onBack}
                title={t(lang, 'back')}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#c4454b]/25 bg-[#24181b]/80 text-[#d8c7c9] hover:text-white cursor-pointer"
              >
                <ChevronLeft className={`h-4 w-4 ${lang === 'ar' ? 'rotate-180' : ''}`} />
              </button>
            )}
            <div className="min-w-0">
              {section && <div className="text-[11px] text-[#a38f92] truncate">{section}</div>}
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="truncate text-[14.5px] font-semibold text-white">{title}</h2>
                {status && <StatusBadge status={status} lang={lang} />}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setPinned((p) => !p)}
              title={t(lang, 'pin')}
              className={`flex h-8 w-8 items-center justify-center rounded-[6px] border transition-colors cursor-pointer ${
                pinned
                  ? 'border-[#c4454b]/45 bg-[#c4454b]/18 text-[#f09599]'
                  : 'border-[#c4454b]/25 bg-[#24181b]/80 text-[#c7b3b6] hover:text-white'
              }`}
            >
              <Pin className="h-3.5 w-3.5" />
            </button>
            {copyText && (
              <button
                type="button"
                onClick={handleCopy}
                title={t(lang, 'copy')}
                className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[#c4454b]/25 bg-[#24181b]/80 text-[#c7b3b6] hover:text-white transition-colors cursor-pointer"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              title={t(lang, 'close')}
              aria-label={t(lang, 'close')}
              className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[#c4454b]/25 bg-[#24181b]/80 text-[#c7b3b6] hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-dark">{children}</div>

        {(inlineConfirm || actions.length > 0) && (
          <div className="shrink-0 border-t border-[#c4454b]/20 bg-[#171012]/85 px-5 py-4 flex flex-col gap-2">
            {inlineConfirm ? (
              <div
                className={`flex flex-col gap-2.5 rounded-[10px] border p-3 ${
                  inlineConfirm.confirm?.severity === 'danger'
                    ? 'border-[#e35d6a]/40 bg-[#e35d6a]/12'
                    : inlineConfirm.confirm?.severity === 'warning'
                    ? 'border-[#f4c20d]/40 bg-[#f4c20d]/10'
                    : 'border-[#c4454b]/40 bg-[#c4454b]/12'
                }`}
              >
                <div
                  className={`text-[14px] font-semibold ${
                    inlineConfirm.confirm?.severity === 'danger'
                      ? 'text-[#f28b94]'
                      : inlineConfirm.confirm?.severity === 'warning'
                      ? 'text-[#f4c20d]'
                      : 'text-[#f09599]'
                  }`}
                >
                  {inlineConfirm.confirm?.title}
                </div>
                {inlineConfirm.confirm?.message && (
                  <p className="text-[12.5px] text-white/75 leading-relaxed">
                    {inlineConfirm.confirm.message}
                  </p>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setInlineConfirm(null)}
                    className="flex-1 rounded-[10px] border border-[#c4454b]/25 bg-[#24181b]/80 py-2.5 text-[13.5px] font-medium text-white hover:bg-[#2c1c20] cursor-pointer"
                  >
                    {t(lang, 'cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleConfirm}
                    className={`flex-1 rounded-[10px] py-2.5 text-[13.5px] font-semibold text-white cursor-pointer ${
                      inlineConfirm.confirm?.severity === 'danger'
                        ? 'bg-[#c93b47] hover:bg-[#d64854]'
                        : 'bg-[#b83b44]/85 hover:bg-[#c94a53]/90 border border-[#f29b9f]/25'
                    }`}
                  >
                    {inlineConfirm.confirm?.confirmLabel}
                  </button>
                </div>
              </div>
            ) : (
              actions.map((act, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={act.disabled || busy}
                  onClick={() => handleActionClick(act)}
                  className={`w-full rounded-[10px] px-4 py-3 text-[14px] font-semibold transition-colors disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer ${
                    act.tone === 'danger'
                      ? 'bg-[#c93b47]/90 text-white hover:bg-[#d64854]'
                      : act.tone === 'secondary'
                      ? 'border border-[#c4454b]/25 bg-[#24181b]/80 text-white hover:bg-[#2c1c20]'
                      : 'bg-[#b83b44]/85 hover:bg-[#c94a53]/90 border border-[#f29b9f]/25 text-white backdrop-blur-md'
                  }`}
                >
                  {act.label}
                </button>
              ))
            )}
          </div>
        )}
      </aside>
    </>
  );
}
