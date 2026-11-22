import { AppSettings } from '../types';

export function formatMoney(val: number): string {
  const num = Number.isFinite(Number(val)) ? Number(val) : 0;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function formatDateTime(iso: string, settings: AppSettings): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';

  const shifted = new Date(d.getTime() + (settings.tzOffset ?? 2) * 3600_000);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');

  let datePart = `${dd}.${mm}.${yyyy}`;
  if (settings.dateFormat === 'YYYY-MM-DD') {
    datePart = `${yyyy}-${mm}-${dd}`;
  } else if (settings.dateFormat === 'MM/DD/YYYY') {
    datePart = `${mm}/${dd}/${yyyy}`;
  }

  let hh = shifted.getUTCHours();
  const min = String(shifted.getUTCMinutes()).padStart(2, '0');
  if (settings.clockFormat === '12h') {
    const ampm = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12 || 12;
    return `${datePart} ${String(hh).padStart(2, '0')}:${min} ${ampm}`;
  }
  return `${datePart} ${String(hh).padStart(2, '0')}:${min}`;
}
