import { AppSettings, Language } from '../types';

export function formatNumber(val: number): string {
  const num = Number.isFinite(Number(val)) ? Number(val) : 0;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

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

export function formatRemainingMinutes(iso: string, lang: Language): string {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return '—';
  const diffMin = Math.max(0, Math.round((target - Date.now()) / 60000));
  if (diffMin <= 0) return lang === 'ar' ? 'منتهي' : 'Expired';
  if (diffMin >= 60) {
    const hrs = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    return lang === 'ar' ? `${hrs} س ${mins} د` : `${hrs}h ${mins}m`;
  }
  return lang === 'ar' ? `${diffMin} د` : `${diffMin}m`;
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number>>
): void {
  const esc = (cell: string | number) => {
    const s = String(cell ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
