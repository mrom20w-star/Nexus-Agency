import React from 'react';
import { t, TranslationKey } from '../i18n';
import { Language } from '../types';

export type BadgeTone = 'success' | 'danger' | 'info' | 'warning' | 'accent' | 'neutral';

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: 'border-[#00e344]/35 bg-[#00e344]/10 text-[#00e344]',
  danger: 'border-[#e35d6a]/40 bg-[#e35d6a]/12 text-[#f28b94]',
  info: 'border-[#c4454b]/40 bg-[#c4454b]/15 text-[#f09599]',
  warning: 'border-[#f4c20d]/35 bg-[#f4c20d]/10 text-[#f4c20d]',
  accent: 'border-[#c4454b]/45 bg-[#c4454b]/18 text-[#f29b9f]',
  neutral: 'border-[#c4454b]/20 bg-[#201518]/75 text-[#c7b3b6]',
};

export function statusToTone(status: string): BadgeTone {
  switch (status) {
    case 'completed':
    case 'resolved_approve':
    case 'matched':
    case 'credited':
    case 'active':
      return 'success';
    case 'pending':
    case 'reviewing':
    case 'accepted':
    case 'confirming':
      return 'warning';
    case 'awaiting_confirmation':
      return 'accent';
    case 'disputed':
    case 'open':
    case 'cancelled':
    case 'resolved_reject':
    case 'unmatched':
    case 'rejected':
      return 'danger';
    case 'available':
      return 'info';
    case 'expired':
    case 'ignored':
    case 'inactive':
    default:
      return 'neutral';
  }
}

export function StatusBadge({
  status,
  lang,
  label,
}: {
  status: string;
  lang: Language;
  label?: string;
}) {
  const tone = statusToTone(status);
  const key = `status_${status}` as TranslationKey;
  const text = label ?? t(lang, key);

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-[6px] border px-[10px] py-[3px] text-[12px] font-medium leading-4 ${TONE_CLASSES[tone]}`}
    >
      {text}
    </span>
  );
}
