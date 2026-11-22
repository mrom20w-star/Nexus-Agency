import React from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { Language } from '../types';

export function BottomBar({
  lang,
  page,
  totalPages,
  onPageChange,
  onRefresh,
  expanded,
  onToggleExpand,
  refreshing = false,
}: {
  lang: Language;
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  onRefresh: () => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
  refreshing?: boolean;
}) {
  const safeTotal = Math.max(1, totalPages);

  return (
    <div className="shrink-0 border-t border-[#c4454b]/20 bg-[#161012]/80 backdrop-blur-md px-4 lg:px-5 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRefresh}
          aria-label={lang === 'ar' ? 'تحديث' : 'Refresh'}
          className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#b83b44]/85 hover:bg-[#c94a53]/90 border border-[#f29b9f]/25 text-white transition-colors cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>

        {onToggleExpand && (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={lang === 'ar' ? 'تبديل العرض' : 'Toggle density'}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#c4454b]/25 bg-[#221619]/75 text-[#c7b3b6] hover:text-white hover:bg-[#2c1c20] transition-colors cursor-pointer"
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          aria-label="Previous page"
          className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#a38f92] hover:bg-[#24181b] hover:text-white disabled:opacity-35 disabled:pointer-events-none cursor-pointer"
        >
          {lang === 'ar' ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>

        <span className="flex h-8 min-w-8 items-center justify-center rounded-[8px] border border-[#c4454b]/25 bg-[#24181b]/80 px-2.5 text-[13px] font-medium font-mono-num text-white">
          {page}
        </span>

        <button
          type="button"
          disabled={page >= safeTotal}
          onClick={() => onPageChange(Math.min(safeTotal, page + 1))}
          aria-label="Next page"
          className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#a38f92] hover:bg-[#24181b] hover:text-white disabled:opacity-35 disabled:pointer-events-none cursor-pointer"
        >
          {lang === 'ar' ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
