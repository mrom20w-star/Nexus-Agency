import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Clock,
  Copy,
  Download,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { BottomBar } from '../components/BottomBar';
import { DetailDrawer, DrawerAction } from '../components/DetailDrawer';
import { FilterDrawer } from '../components/FilterDrawer';
import { QrCodeSvg } from '../components/QrCodeSvg';
import { StatusBadge } from '../components/StatusBadge';
import { t } from '../i18n';
import {
  ALLOWED_PAYMENT_METHODS,
  AllowedPaymentMethod,
  AccountDesk,
  AppSettings,
  DepositOrder,
  DepositStatus,
  PlatformConfig,
} from '../types';
import {
  downloadCsv,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatRemainingMinutes,
} from '../utils/format';

interface DepositsPageProps {
  deposits: DepositOrder[];
  currentAccount: AccountDesk;
  config: PlatformConfig;
  settings: AppSettings;
  triggerCreate?: boolean;
  onClearTriggerCreate?: () => void;
  onAction: (id: string, action: 'cancel' | 'dispute') => Promise<void>;
  onCreateDeposit: (payload: {
    paymentMethod: AllowedPaymentMethod;
    amountLocal: number;
    senderNumber?: string;
    note?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onNotify: (type: 'success' | 'error' | 'warning', title: string, message?: string) => void;
}

export function DepositsPage({
  deposits,
  currentAccount,
  config,
  settings,
  triggerCreate = false,
  onClearTriggerCreate,
  onAction,
  onCreateDeposit,
  onNotify,
}: DepositsPageProps) {
  const lang = settings.lang;
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | DepositStatus>('all');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  const [draftStatus, setDraftStatus] = useState<'all' | DepositStatus>('all');
  const [draftMin, setDraftMin] = useState('');
  const [draftMax, setDraftMax] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<AllowedPaymentMethod>('فودافون كاش');
  const [depositAmount, setDepositAmount] = useState('1000');
  const [senderNumber, setSenderNumber] = useState('');
  const [depositNote, setDepositNote] = useState('');
  const [submittingDeposit, setSubmittingDeposit] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (triggerCreate) {
      setSelectedId(null);
      setCreateOpen(true);
      onClearTriggerCreate?.();
    }
  }, [triggerCreate, onClearTriggerCreate]);

  const resolvedFixedNumber = useMemo(() => {
    const userNum = (currentAccount.fixedDepositNumber || '').trim();
    if (userNum) return userNum;
    const m = config.depositMethodNumbers ?? {};
    const methodNum =
      selectedMethod === 'فودافون كاش'
        ? m.vodafone
        : selectedMethod === 'اتصالات كاش'
        ? m.etisalat
        : selectedMethod === 'أورنج كاش'
        ? m.orange
        : m.binance;
    return (methodNum || '').trim() || (config.defaultDepositNumber || '').trim();
  }, [currentAccount.fixedDepositNumber, config, selectedMethod]);

  const accountDeposits = useMemo(
    () => deposits.filter((d) => d.accountId === currentAccount.account_id),
    [deposits, currentAccount.account_id]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const min = minAmount ? Number(minAmount) : null;
    const max = maxAmount ? Number(maxAmount) : null;
    return accountDeposits.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (min !== null && d.amountLocal < min) return false;
      if (max !== null && d.amountLocal > max) return false;
      if (q) {
        return (
          d.orderId.toLowerCase().includes(q) ||
          d.bankName.toLowerCase().includes(q) ||
          d.requisiteNumber.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [accountDeposits, search, statusFilter, minAmount, maxAmount]);

  const selected = useMemo(
    () => accountDeposits.find((d) => d.id === selectedId) ?? null,
    [accountDeposits, selectedId]
  );

  const openFilterDrawer = () => {
    setDraftStatus(statusFilter);
    setDraftMin(minAmount);
    setDraftMax(maxAmount);
    setFilterOpen(true);
  };

  const copyText = async (val: string) => {
    try {
      await navigator.clipboard.writeText(val);
      onNotify('success', t(lang, 'copied'), val);
    } catch {
      onNotify('error', t(lang, 'copyFailed'));
    }
  };

  const handleExport = () => {
    downloadCsv(
      `nexus-deposits-${currentAccount.currency}.csv`,
      [t(lang, 'orderId'), t(lang, 'amount'), t(lang, 'usdt'), t(lang, 'income'), t(lang, 'bank'), t(lang, 'status'), t(lang, 'date')],
      filtered.map((d) => [
        d.orderId,
        `${d.amountLocal} ${currentAccount.currency}`,
        d.amountUsdt,
        d.incomeUsdt,
        d.bankName,
        d.status,
        formatDateTime(d.createdAt, settings),
      ])
    );
    onNotify('success', t(lang, 'exportCsv'));
  };

  const handleSubmitNewDeposit = async () => {
    const amt = Number(depositAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      onNotify('error', lang === 'ar' ? 'أدخل مبلغ إيداع صحيح' : 'Enter a valid deposit amount');
      return;
    }
    if (!resolvedFixedNumber) {
      onNotify(
        'error',
        lang === 'ar'
          ? 'لم يتم تعيين رقم إيداع ثابت بعد من الإدارة'
          : 'No fixed deposit number assigned by Admin yet'
      );
      return;
    }
    setSubmittingDeposit(true);
    try {
      const res = await onCreateDeposit({
        paymentMethod: selectedMethod,
        amountLocal: amt,
        senderNumber: senderNumber.trim() || undefined,
        note: depositNote.trim() || undefined,
      });
      if (res.ok) {
        setCreateOpen(false);
        setSenderNumber('');
        setDepositNote('');
        onNotify(
          'success',
          lang === 'ar' ? 'تم إرسال طلب الإيداع' : 'Deposit Request Submitted',
          lang === 'ar'
            ? 'الطلب في انتظار موافقة الإدارة'
            : 'Awaiting Admin approval on dashboard'
        );
      } else {
        onNotify('error', res.error || (lang === 'ar' ? 'تعذر إنشاء الطلب' : 'Failed to submit deposit'));
      }
    } finally {
      setSubmittingDeposit(false);
    }
  };

  const drawerActions: DrawerAction[] = selected
    ? selected.status === 'pending'
      ? [
          {
            label: t(lang, 'openDispute'),
            tone: 'secondary',
            onClick: async () => {
              await onAction(selected.id, 'dispute');
              onNotify('warning', t(lang, 'status_disputed'), selected.orderId);
            },
          },
          {
            label: t(lang, 'cancelOrder'),
            tone: 'danger',
            confirm: {
              severity: 'danger',
              title: t(lang, 'cancelOrderTitle'),
              message: t(lang, 'cancelOrderMsg'),
              confirmLabel: t(lang, 'cancelOrder'),
            },
            onClick: async () => {
              await onAction(selected.id, 'cancel');
              onNotify('error', t(lang, 'status_cancelled'), selected.orderId);
            },
          },
        ]
      : []
    : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="hpay-toolbar flex flex-wrap items-center justify-between gap-3 border-b border-[#e05b64]/26 bg-[#2a0f15]/58 backdrop-blur-md px-4 lg:px-6 py-3 shrink-0">
        <div className="flex items-center gap-2.5 flex-1 min-w-[240px]">
          <button
            type="button"
            onClick={openFilterDrawer}
            className={`flex h-9 items-center gap-2 rounded-[10px] border px-3 text-[13px] font-medium transition-colors cursor-pointer shrink-0 ${
              statusFilter !== 'all' || minAmount || maxAmount
                ? 'border-[#d15b62]/60 bg-[#c4454b]/18 text-[#f09599]'
                : 'border-[#c4454b]/25 bg-[#201518]/75 text-white hover:bg-[#2a1c20]'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>{t(lang, 'filters')}</span>
          </button>

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

          <div className="hidden xl:flex items-center gap-1 rounded-[10px] border border-[#c4454b]/22 bg-[#120c0e]/75 p-1">
            {(['all', 'pending', 'completed', 'disputed'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === st
                    ? 'bg-[#b83b44]/85 text-white'
                    : 'text-[#c7b3b6] hover:text-white'
                }`}
              >
                {st === 'all' ? t(lang, 'anyStatus') : t(lang, `status_${st}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExport}
            className="flex h-9 items-center gap-1.5 rounded-[10px] border border-[#c4454b]/25 bg-[#201518]/75 px-3 text-[13px] font-medium text-[#c7b3b6] hover:text-white hover:bg-[#2a1c20] transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t(lang, 'exportCsv')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedId(null);
              setCreateOpen(true);
            }}
            className="flex h-9 items-center gap-1.5 rounded-[10px] border border-[#f29b9f]/25 bg-[#b83b44]/85 px-3.5 text-[13px] font-semibold text-white hover:bg-[#c94a53]/90 backdrop-blur-md transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>{t(lang, 'simulateNewOrder')}</span>
          </button>
        </div>
      </div>

      <div className="hpay-table-wrap flex-1 min-h-0 overflow-auto scrollbar-dark">
        {filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-[#a38f92]">
            <p className="text-[14px]">{t(lang, 'nothingFound')}</p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 rounded-[10px] border border-[#f29b9f]/25 bg-[#b83b44]/85 px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#c94a53]/90 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>{t(lang, 'simulateNewOrder')}</span>
            </button>
          </div>
        ) : (
          <table className="hpay-table w-full border-collapse text-start">
            <thead className="sticky top-0 z-10 bg-[#311118]/82 backdrop-blur-md border-b border-[#e05b64]/26">
              <tr className="text-[12px] font-medium text-[#c7b3b6]">
                {!settings.hideRowNumbers && <th className="py-3 px-4 text-start w-12">#</th>}
                <th className="py-3 px-4 text-start">{t(lang, 'orderId')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'amount')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'usdt')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'income')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'bank')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'status')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'date')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c4454b]/15">
              {filtered.map((dep, idx) => {
                const isSelected = dep.id === selectedId;
                const rowTint = settings.fullRowTint
                  ? dep.status === 'completed'
                    ? 'bg-[#00e344]/[0.04]'
                    : dep.status === 'disputed'
                    ? 'bg-[#e35d6a]/[0.07]'
                    : dep.status === 'pending'
                    ? 'bg-[#c4454b]/[0.09]'
                    : ''
                  : '';

                return (
                  <tr
                    key={dep.id}
                    onClick={() => {
                      setCreateOpen(false);
                      setSelectedId(dep.id);
                    }}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#c4454b]/15' : `${rowTint} hover:bg-[#1e1417]/75`
                    }`}
                  >
                    {!settings.hideRowNumbers && (
                      <td className="py-3 px-4 text-[#a38f92] font-mono-num">{idx + 1}</td>
                    )}
                    <td className="py-3 px-4 font-mono-num font-medium text-white whitespace-nowrap">
                      {dep.orderId}
                    </td>
                    <td className="py-3 px-4 font-mono-num font-semibold text-white whitespace-nowrap">
                      {formatMoney(dep.amountLocal)}{' '}
                      <span className="text-[11px] font-normal text-[#a38f92]">{currentAccount.currency}</span>
                    </td>
                    <td className="py-3 px-4 font-mono-num text-[#c7b3b6] whitespace-nowrap">
                      {formatNumber(dep.amountUsdt)}
                    </td>
                    <td className="py-3 px-4 font-mono-num text-[#00e344] whitespace-nowrap">
                      +{formatNumber(dep.incomeUsdt)}
                    </td>
                    <td className="py-3 px-4 text-[#e2d4d6]">
                      <div className="max-w-[210px] truncate">{dep.bankName}</div>
                      <div className="text-[11.5px] font-mono-num text-[#a38f92] truncate">{dep.requisiteNumber}</div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusBadge status={dep.status} lang={lang} />
                    </td>
                    <td className="py-3 px-4 text-[12px] font-mono-num text-[#a38f92] whitespace-nowrap">
                      {formatDateTime(dep.createdAt, settings)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <FilterDrawer
        open={filterOpen}
        lang={lang}
        onClose={() => setFilterOpen(false)}
        onClear={() => {
          setDraftStatus('all');
          setDraftMin('');
          setDraftMax('');
          setStatusFilter('all');
          setMinAmount('');
          setMaxAmount('');
        }}
        onApply={() => {
          setStatusFilter(draftStatus);
          setMinAmount(draftMin);
          setMaxAmount(draftMax);
        }}
      >
        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-[#c7b3b6]">{t(lang, 'status')}</label>
          <select
            value={draftStatus}
            onChange={(e) => setDraftStatus(e.target.value as 'all' | DepositStatus)}
            className="w-full rounded-[10px] border border-[#c4454b]/25 bg-[#120c0e]/85 px-3 py-2 text-[13px] text-white outline-none focus:border-[#d15b62]"
          >
            <option value="all">{t(lang, 'anyStatus')}</option>
            <option value="pending">{t(lang, 'status_pending')}</option>
            <option value="completed">{t(lang, 'status_completed')}</option>
            <option value="disputed">{t(lang, 'status_disputed')}</option>
            <option value="cancelled">{t(lang, 'status_cancelled')}</option>
            <option value="expired">{t(lang, 'status_expired')}</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-[#c7b3b6]">
            {t(lang, 'minAmount')} ({currentAccount.currency})
          </label>
          <input
            type="number"
            value={draftMin}
            onChange={(e) => setDraftMin(e.target.value)}
            placeholder="0"
            className="w-full rounded-[10px] border border-[#c4454b]/25 bg-[#120c0e]/85 px-3 py-2 text-[13px] text-white font-mono-num outline-none focus:border-[#d15b62]"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-[#c7b3b6]">
            {t(lang, 'maxAmount')} ({currentAccount.currency})
          </label>
          <input
            type="number"
            value={draftMax}
            onChange={(e) => setDraftMax(e.target.value)}
            placeholder="100000"
            className="w-full rounded-[10px] border border-[#c4454b]/25 bg-[#120c0e]/85 px-3 py-2 text-[13px] text-white font-mono-num outline-none focus:border-[#d15b62]"
          />
        </div>
      </FilterDrawer>

      {/* New Deposit Drawer */}
      <DetailDrawer
        open={createOpen}
        lang={lang}
        section={t(lang, 'depositsListing')}
        title={t(lang, 'simulateNewOrder')}
        onClose={() => setCreateOpen(false)}
        actions={[
          {
            label: submittingDeposit
              ? lang === 'ar'
                ? 'جاري إرسال الطلب...'
                : 'Submitting...'
              : lang === 'ar'
              ? 'تم التحويل · إرسال للموافقة'
              : 'Transferred · Submit for Approval',
            tone: 'primary',
            disabled: submittingDeposit || !resolvedFixedNumber,
            onClick: handleSubmitNewDeposit,
          },
        ]}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[#c7b3b6] block">
              {lang === 'ar' ? '1) اختر وسيلة واحدة فقط' : '1) Select One Payment Method'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ALLOWED_PAYMENT_METHODS.map((method) => {
                const active = selectedMethod === method;
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setSelectedMethod(method)}
                    className={`rounded-[10px] border px-3 py-2.5 text-[13px] font-semibold transition-colors cursor-pointer ${
                      active
                        ? 'border-[#d15b62] bg-[#b83b44]/25 text-white'
                        : 'border-[#c4454b]/22 bg-[#201518]/70 text-[#c7b3b6] hover:text-white'
                    }`}
                  >
                    {method}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[12px] border border-[#c4454b]/35 bg-[#c4454b]/14 p-4 space-y-2.5">
            <div className="text-[12.5px] font-semibold text-[#f3a6aa]">
              {lang === 'ar'
                ? '2) حوّل المبلغ أولاً على رقم الإيداع الثابت:'
                : '2) Transfer first to this fixed deposit number:'}
            </div>
            {resolvedFixedNumber ? (
              <div className="flex items-center justify-between gap-2 rounded-[10px] border border-[#c4454b]/35 bg-[#120c0e]/85 px-3 py-2.5">
                <span className="font-mono-num text-[15px] font-bold text-white truncate">
                  {resolvedFixedNumber}
                </span>
                <button
                  type="button"
                  onClick={() => copyText(resolvedFixedNumber)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#f29b9f]/25 bg-[#b83b44]/85 px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-[#c94a53]/90 shrink-0 cursor-pointer"
                >
                  <Copy className="h-3 w-3" />
                  <span>{t(lang, 'copy')}</span>
                </button>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-[#e35d6a]/40 bg-[#e35d6a]/15 p-2.5 text-[12px] text-[#f28b94]">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  {lang === 'ar'
                    ? 'لم يتم تحديد رقم إيداع ثابت لحسابك من الإدارة بعد.'
                    : 'No fixed deposit number assigned to your account yet.'}
                </span>
              </div>
            )}
            <div className="text-[11.5px] text-[#f3a6aa]/85">
              {lang === 'ar'
                ? 'بعد التحويل اضغط إرسال، وسيدخل الطلب في حالة الانتظار لحين مراجعة وتأكيد الإدارة.'
                : 'After transferring, submit the request and wait for approval.'}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[#c7b3b6] block">
              {lang === 'ar'
                ? `3) مبلغ الإيداع (${currentAccount.currency})`
                : `3) Deposit Amount (${currentAccount.currency})`}
            </label>
            <input
              type="number"
              min={1}
              step="0.01"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="w-full rounded-[10px] border border-[#c4454b]/25 bg-[#120c0e]/85 px-3 py-2.5 text-[16px] font-bold font-mono-num text-white outline-none focus:border-[#d15b62]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[#c7b3b6] block">
              {selectedMethod === 'باينانس'
                ? lang === 'ar'
                  ? 'معرف حساب باينانس المحوّل منه'
                  : 'Sender Binance ID / TXID'
                : lang === 'ar'
                ? 'الرقم الذي تم التحويل منه'
                : 'Sender Phone / Wallet Number'}
            </label>
            <input
              type="text"
              value={senderNumber}
              onChange={(e) => setSenderNumber(e.target.value)}
              placeholder={selectedMethod === 'باينانس' ? 'Binance Pay ID / TXID' : '010XXXXXXXX'}
              className="w-full rounded-[10px] border border-[#c4454b]/25 bg-[#120c0e]/85 px-3 py-2 text-[13px] font-mono-num text-white outline-none focus:border-[#d15b62]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[#c7b3b6] block">
              {lang === 'ar' ? 'ملاحظة أو رقم مرجعي (اختياري)' : 'Reference / Note (optional)'}
            </label>
            <input
              type="text"
              value={depositNote}
              onChange={(e) => setDepositNote(e.target.value)}
              placeholder={lang === 'ar' ? 'تفاصيل إضافية...' : 'Optional details...'}
              className="w-full rounded-[10px] border border-[#c4454b]/25 bg-[#120c0e]/85 px-3 py-2 text-[13px] text-white outline-none focus:border-[#d15b62]"
            />
          </div>
        </div>
      </DetailDrawer>

      {/* Deposit Detail Drawer */}
      <DetailDrawer
        open={Boolean(selected) && !createOpen}
        lang={lang}
        section={t(lang, 'depositsListing')}
        title={selected?.orderId ?? ''}
        status={selected?.status}
        copyText={selected ? `${selected.orderId} | ${selected.amountLocal} ${currentAccount.currency} | ${selected.requisiteNumber}` : ''}
        skipConfirm={settings.skipConfirm}
        onCopySuccess={() => onNotify('success', t(lang, 'copied'))}
        onClose={() => setSelectedId(null)}
        actions={drawerActions}
      >
        {selected && (
          <div className="space-y-5">
            {selected.status === 'pending' && (
              <div className="flex items-start gap-2.5 rounded-[12px] border border-[#c4454b]/35 bg-[#c4454b]/14 p-3.5 text-[12.5px] text-[#f3a6aa]">
                <Clock className="h-4 w-4 text-[#f09599] shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white">
                    {lang === 'ar'
                      ? 'في انتظار موافقة الإدارة على الإيداع'
                      : 'Awaiting Admin Deposit Approval'}
                  </div>
                  <div className="mt-0.5 text-[12px] text-[#f3a6aa]/85">
                    {lang === 'ar'
                      ? 'سيتم تأكيد العملية وإضافة الرصيد فور مراجعتها من لوحة الإدارة.'
                      : 'Funds will be credited to your balance as soon as the Admin confirms the transfer.'}
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-[12px] border border-[#c4454b]/22 bg-[#201518]/70 p-4">
              <div className="text-[12px] text-[#a38f92]">{t(lang, 'amount')}</div>
              <div className="mt-1 text-[24px] font-bold font-mono-num text-white">
                {formatMoney(selected.amountLocal)}{' '}
                <span className="text-[14px] font-medium text-[#c7b3b6]">{currentAccount.currency}</span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[#c4454b]/18 pt-3 text-[12px]">
                <div>
                  <div className="text-[#a38f92]">{t(lang, 'usdt')}</div>
                  <div className="mt-0.5 font-mono-num font-semibold text-white">
                    {formatNumber(selected.amountUsdt)}
                  </div>
                </div>
                <div>
                  <div className="text-[#a38f92]">{t(lang, 'income')}</div>
                  <div className="mt-0.5 font-mono-num font-semibold text-[#00e344]">
                    +{formatNumber(selected.incomeUsdt)}
                  </div>
                </div>
                <div>
                  <div className="text-[#a38f92]">{t(lang, 'acquiringRate')}</div>
                  <div className="mt-0.5 font-mono-num font-semibold text-[#f09599]">
                    {selected.rate.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[12px] border border-[#c4454b]/22 bg-[#201518]/70 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-white">{t(lang, 'requisite')}</span>
                <span className="text-[11.5px] font-mono-num text-[#a38f92]">{selected.requisiteId}</span>
              </div>

              <DetailRow label={t(lang, 'bank')} value={selected.bankName} />
              <DetailRow label={t(lang, 'ownerName')} value={selected.ownerName} />

              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[12px] text-[#a38f92]">{t(lang, 'accountNumber')}</span>
                <button
                  type="button"
                  onClick={() => copyText(selected.requisiteNumber)}
                  className="flex items-center gap-1.5 rounded-lg border border-[#c4454b]/28 bg-[#281b1e]/80 px-2.5 py-1 text-[12.5px] font-mono-num text-white hover:bg-[#322125] cursor-pointer"
                >
                  <span>{selected.requisiteNumber}</span>
                  <Copy className="h-3 w-3 text-[#c7b3b6]" />
                </button>
              </div>
              {selected.customerNote && (
                <DetailRow label={lang === 'ar' ? 'ملاحظة' : 'Note'} value={selected.customerNote} />
              )}
            </div>

            <div className="flex flex-col items-center justify-center rounded-[12px] border border-[#c4454b]/22 bg-[#201518]/70 p-4 gap-2">
              <div className="text-[12px] text-[#a38f92] self-start">{t(lang, 'qrCode')}</div>
              <QrCodeSvg value={`nexus:${selected.orderId}:${selected.requisiteNumber}:${selected.amountLocal}`} size={136} />
            </div>

            <div className="rounded-[12px] border border-[#c4454b]/22 bg-[#201518]/70 p-4 space-y-2.5">
              <DetailRow label={t(lang, 'date')} value={formatDateTime(selected.createdAt, settings)} mono />
              <DetailRow
                label={t(lang, 'timeLeft')}
                value={
                  selected.status === 'pending'
                    ? formatRemainingMinutes(selected.expiresAt, lang)
                    : '—'
                }
                mono
              />
              {selected.confirmedAt && (
                <DetailRow
                  label={t(lang, 'status_completed')}
                  value={formatDateTime(selected.confirmedAt, settings)}
                  mono
                />
              )}
            </div>
          </div>
        )}
      </DetailDrawer>

      <BottomBar
        lang={lang}
        page={page}
        totalPages={1}
        onPageChange={setPage}
        onRefresh={() => onNotify('success', t(lang, 'refresh'))}
      />
    </div>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[12.5px]">
      <span className="text-[#a38f92] shrink-0">{label}</span>
      <span className={`text-white text-end truncate ${mono ? 'font-mono-num' : ''}`}>{value}</span>
    </div>
  );
}
