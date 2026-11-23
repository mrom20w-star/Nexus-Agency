import React from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { t } from '../i18n';
import { Language } from '../types';

export function FilterDrawer({
  open,
  lang,
  title,
  onClose,
  onClear,
  onApply,
  children,
}: {
  open: boolean;
  lang: Language;
  title?: string;
  onClose: () => void;
  onClear: () => void;
  onApply: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden" onClick={onClose} aria-hidden="true" />
      <aside className="fixed z-50 lg:z-35 top-0 lg:top-[3.75rem] start-0 lg:start-[20rem] w-full lg:w-[336px] h-full lg:h-[calc(100vh-3.75rem)] bg-[#241317]/75 backdrop-blur-2xl border-e border-[#c4454b]/28 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 h-[3.75rem] border-b border-[#c4454b]/24 shrink-0">
          <div className="flex items-center gap-2 text-[14px] font-semibold text-white">
            <SlidersHorizontal className="h-4 w-4 text-[#f09599]" />
            <span>{title || t(lang, 'filters')}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#c4454b]/28 bg-[#311118]/65 text-[#c7b3b6] hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-dark">{children}</div>

        <div className="shrink-0 border-t border-[#c4454b]/20 px-5 py-4 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClear}
            className="flex-1 rounded-[10px] border border-[#c4454b]/25 bg-[#241317]/80 py-2.5 text-[13.5px] font-medium text-[#c7b3b6] hover:text-white transition-colors cursor-pointer"
          >
            {t(lang, 'clearAll')}
          </button>
          <button
            type="button"
            onClick={() => {
              onApply();
              onClose();
            }}
            className="flex-1 rounded-[10px] bg-[#b83b44]/85 hover:bg-[#c94a53]/90 border border-[#f29b9f]/25 py-2.5 text-[13.5px] font-semibold text-white backdrop-blur-md transition-colors cursor-pointer"
          >
            {t(lang, 'applyFilter')}
          </button>
        </div>
      </aside>
    </>
  );
}
