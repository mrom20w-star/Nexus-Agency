import React, { useMemo, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { DetailDrawer, DrawerAction } from '../components/DetailDrawer';
import { StatusBadge } from '../components/StatusBadge';
import { t } from '../i18n';
import { AccountDesk, AppSettings, DisputeItem, DisputeStatus } from '../types';
import { formatDateTime, formatMoney, formatNumber } from '../utils/format';

export function DisputesPage({
  disputes,
  currentAccount,
  settings,
  onResolve,
  onNotify,
}: {
  disputes: DisputeItem[];
  currentAccount: AccountDesk;
  settings: AppSettings;
  onResolve: (id: string, action: 'approve' | 'reject', note?: string) => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'warning', title: string, message?: string) => void;
}) {
  const lang = settings.lang;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | DisputeStatus>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return disputes.filter((d) => {
      if (d.accountId !== currentAccount.account_id) return false;
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (q) {
        return (
          d.orderId.toLowerCase().includes(q) ||
          d.receiptRef.toLowerCase().includes(q) ||
          d.bankName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [disputes, currentAccount.account_id, statusFilter, search]);

  const selected = useMemo(
    () => disputes.find((d) => d.id === selectedId) ?? null,
    [disputes, selectedId]
  );

  const isUnresolved = selected && (selected.status === 'open' || selected.status === 'reviewing');

  const drawerActions: DrawerAction[] = isUnresolved
    ? [
        {
          label: t(lang, 'rejectDispute'),
          tone: 'danger',
          confirm: {
            severity: 'danger',
            title: t(lang, 'rejectDisputeTitle'),
            message: t(lang, 'rejectDisputeMsg'),
            confirmLabel: t(lang, 'rejectDispute'),
          },
          onClick: async () => {
            await onResolve(selected.id, 'reject', note);
            onNotify('error', t(lang, 'status_resolved_reject'), selected.orderId);
            setNote('');
          },
        },
      ]
    : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="hpay-toolbar flex flex-wrap items-center justify-between gap-3 border-b border-[#c4454b]/20 bg-[#171012]/80 backdrop-blur-md px-4 lg:px-6 py-3 shrink-0">
        <div className="flex items-center gap-2.5 flex-1 min-w-[240px]">
          <div className="relative flex-1 max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 h-3.5 w-3.5 text-[#a38f92]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t(lang, 'searchDepositId')}
              className="h-9 w-full rounded-[10px] border border-[#c4454b]/25 bg-[#120c0e]/85 ps-9 pe-3 text-[13px] text-white placeholder:text-[#a38f92] outline-none focus:border-[#d15b62]"
            />
          </div>

          <div className="flex items-center gap-1 rounded-[10px] border border-[#c4454b]/22 bg-[#120c0e]/75 p-1">
            {(['all', 'open', 'reviewing', 'resolved_approve', 'resolved_reject'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === st ? 'bg-[#b83b44]/85 text-white' : 'text-[#c7b3b6] hover:text-white'
                }`}
              >
                {st === 'all' ? t(lang, 'anyStatus') : t(lang, `status_${st}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="hpay-table-wrap flex-1 min-h-0 overflow-auto scrollbar-dark">
        {filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-[#a38f92]">
            <p className="text-[14px]">{t(lang, 'nothingFound')}</p>
          </div>
        ) : (
          <table className="hpay-table w-full border-collapse text-start">
            <thead className="sticky top-0 z-10 bg-[#1c1315]/95 backdrop-blur-md border-b border-[#c4454b]/22">
              <tr className="text-[12px] font-medium text-[#c7b3b6]">
                {!settings.hideRowNumbers && <th className="py-3 px-4 text-start w-12">#</th>}
                <th className="py-3 px-4 text-start">{t(lang, 'orderId')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'claimedAmount')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'usdt')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'bank')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'receiptRef')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'slaLeft')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'status')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'date')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c4454b]/15">
              {filtered.map((d, idx) => (
                <tr
                  key={d.id}
                  onClick={() => setSelectedId(d.id)}
                  className={`cursor-pointer transition-colors ${
                    d.id === selectedId ? 'bg-[#c4454b]/15' : 'hover:bg-[#1e1417]/75'
                  }`}
                >
                  {!settings.hideRowNumbers && (
                    <td className="py-3 px-4 text-[#a38f92] font-mono-num">{idx + 1}</td>
                  )}
                  <td className="py-3 px-4 font-mono-num font-medium text-white whitespace-nowrap">
                    {d.orderId}
                  </td>
                  <td className="py-3 px-4 font-mono-num font-semibold text-white whitespace-nowrap">
                    {formatMoney(d.claimedAmountLocal)} {currentAccount.currency}
                  </td>
                  <td className="py-3 px-4 font-mono-num text-[#c7b3b6] whitespace-nowrap">
                    {formatNumber(d.amountUsdt)}
                  </td>
                  <td className="py-3 px-4 text-[#e2d4d6] whitespace-nowrap">{d.bankName}</td>
                  <td className="py-3 px-4 font-mono-num text-[#f09599] whitespace-nowrap">{d.receiptRef}</td>
                  <td className="py-3 px-4 font-mono-num text-[#f4c20d] whitespace-nowrap">
                    {d.status === 'open' || d.status === 'reviewing' ? `${d.slaMinutesLeft}m` : '—'}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <StatusBadge status={d.status} lang={lang} />
                  </td>
                  <td className="py-3 px-4 text-[12px] font-mono-num text-[#a38f92] whitespace-nowrap">
                    {formatDateTime(d.createdAt, settings)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <DetailDrawer
        open={Boolean(selected)}
        lang={lang}
        section={t(lang, 'disputes')}
        title={selected?.orderId ?? ''}
        status={selected?.status}
        copyText={selected ? `${selected.orderId} | ${selected.receiptRef}` : ''}
        skipConfirm={settings.skipConfirm}
        onCopySuccess={() => onNotify('success', t(lang, 'copied'))}
        onClose={() => setSelectedId(null)}
        actions={drawerActions}
      >
        {selected && (
          <div className="space-y-4">
            <div className="rounded-[12px] border border-[#e35d6a]/35 bg-[#e35d6a]/12 p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-[#f28b94] shrink-0 mt-0.5" />
              <div>
                <div className="text-[13.5px] font-semibold text-white">{t(lang, 'disputeReason')}</div>
                <p className="mt-1 text-[13px] text-white/80 leading-relaxed">{selected.reason}</p>
              </div>
            </div>

            <div className="rounded-[12px] border border-[#c4454b]/22 bg-[#201518]/70 p-4 space-y-2.5 text-[13px]">
              <Row label={t(lang, 'claimedAmount')} value={`${formatMoney(selected.claimedAmountLocal)} ${currentAccount.currency}`} mono />
              <Row label={t(lang, 'originalAmount')} value={`${formatMoney(selected.originalAmountLocal)} ${currentAccount.currency}`} mono />
              <Row label={t(lang, 'usdt')} value={`${formatNumber(selected.amountUsdt)} USDT`} mono />
              <Row label={t(lang, 'bank')} value={selected.bankName} />
              <Row label={t(lang, 'accountNumber')} value={selected.requisiteNumber} mono />
              <Row label={t(lang, 'receiptRef')} value={selected.receiptRef} mono />
            </div>

            {isUnresolved ? (
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-[#c7b3b6]">
                  {lang === 'ar' ? 'ملاحظة الوكيل (اختياري)' : 'Trader resolution note (optional)'}
                </label>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={lang === 'ar' ? 'أضف تفاصيل المطابقة البنكية...' : 'Add bank statement verification note...'}
                  className="w-full rounded-[10px] border border-[#c4454b]/25 bg-[#120c0e]/85 p-3 text-[13px] text-white placeholder:text-[#a38f92] outline-none focus:border-[#d15b62]"
                />
              </div>
            ) : (
              selected.resolutionNote && (
                <div className="rounded-[12px] border border-[#c4454b]/22 bg-[#201518]/70 p-4">
                  <div className="text-[12px] text-[#a38f92]">{lang === 'ar' ? 'قرار الحل' : 'Resolution'}</div>
                  <p className="mt-1 text-[13px] text-white">{selected.resolutionNote}</p>
                </div>
              )
            )}
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[#a38f92]">{label}</span>
      <span className={`text-white ${mono ? 'font-mono-num' : ''}`}>{value}</span>
    </div>
  );
}
