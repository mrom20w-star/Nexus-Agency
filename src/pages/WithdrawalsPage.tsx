import React, { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Copy, FileText, Info, Plus, Search, Upload, XCircle } from 'lucide-react';
import { DetailDrawer, DrawerAction } from '../components/DetailDrawer';
import { StatusBadge } from '../components/StatusBadge';
import { t } from '../i18n';
import {
  ALLOWED_PAYMENT_METHODS,
  AllowedPaymentMethod,
  AccountDesk,
  AppSettings,
  WithdrawalOrder,
} from '../types';
import { formatDateTime, formatMoney, formatNumber, formatRemainingMinutes } from '../utils/format';

export function WithdrawalsPage({
  mode,
  withdrawals,
  currentAccount,
  settings,
  onClaim,
  onUpdate,
  onCreateWithdrawal,
  onRespondWithdrawal,
  onNotify,
}: {
  mode: 'pool' | 'my';
  withdrawals: WithdrawalOrder[];
  currentAccount: AccountDesk;
  settings: AppSettings;
  onClaim: (id: string) => Promise<void>;
  onUpdate: (
    id: string,
    action: 'complete' | 'release' | 'attach',
    files?: Array<{ name: string; size: string }>
  ) => Promise<void>;
  onCreateWithdrawal: (payload: {
    destinationMethod: AllowedPaymentMethod;
    requisiteNumber: string;
    recipientName: string;
    amountLocal: number;
  }) => Promise<{ ok: boolean; error?: string }>;
  onRespondWithdrawal: (
    id: string,
    action: 'confirm' | 'reject'
  ) => Promise<{ ok: boolean; error?: string }>;
  onNotify: (type: 'success' | 'error' | 'warning', title: string, message?: string) => void;
}) {
  const lang = settings.lang;
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create withdrawal request state
  const [createOpen, setCreateOpen] = useState(false);
  const [destinationMethod, setDestinationMethod] = useState<AllowedPaymentMethod>('فودافون كاش');
  const [requisiteNumber, setRequisiteNumber] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [amountInput, setAmountInput] = useState('1000');
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return withdrawals.filter((w) => {
      if (w.accountId !== currentAccount.account_id) return false;
      if (mode === 'pool' && w.status !== 'available' && w.status !== 'awaiting_confirmation') {
        return false;
      }
      if (mode === 'my' && w.status === 'available') return false;
      if (q) {
        return (
          w.orderId.toLowerCase().includes(q) ||
          w.recipientName.toLowerCase().includes(q) ||
          w.requisiteNumber.toLowerCase().includes(q) ||
          w.destinationMethod.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [withdrawals, currentAccount.account_id, mode, search]);

  const selected = useMemo(
    () => withdrawals.find((w) => w.id === selectedId) ?? null,
    [withdrawals, selectedId]
  );

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || !selected) return;
    const files = Array.from(fileList).map((f) => ({
      name: f.name,
      size: `${Math.max(12, Math.round(f.size / 1024))} KB`,
    }));
    await onUpdate(selected.id, 'attach', files);
    onNotify('success', t(lang, 'uploadReceipt'), files.map((f) => f.name).join(', '));
  };

  const copyVal = async (val: string) => {
    try {
      await navigator.clipboard.writeText(val);
      onNotify('success', t(lang, 'copied'), val);
    } catch {
      onNotify('error', t(lang, 'copyFailed'));
    }
  };

  const handleSubmitCreate = async () => {
    const amt = Number(amountInput) || 0;
    if (amt <= 0) {
      onNotify('error', lang === 'ar' ? 'أدخل مبلغ سحب صحيح' : 'Enter a valid withdrawal amount');
      return;
    }
    if (!requisiteNumber.trim()) {
      onNotify(
        'error',
        lang === 'ar' ? 'أدخل رقم المحفظة أو حساب باينانس' : 'Enter wallet or Binance ID'
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await onCreateWithdrawal({
        destinationMethod,
        requisiteNumber: requisiteNumber.trim(),
        recipientName: recipientName.trim() || currentAccount.username,
        amountLocal: amt,
      });
      if (res.ok) {
        onNotify(
          'success',
          lang === 'ar' ? 'تم إرسال طلب السحب للإدارة' : 'Withdrawal request sent to Admin',
          lang === 'ar' ? 'بانتظار التأكيد أو الرفض من لوحة الإدارة' : 'Pending Admin review'
        );
        setCreateOpen(false);
        setRequisiteNumber('');
        setRecipientName('');
      } else {
        onNotify('error', res.error || (lang === 'ar' ? 'تعذر إرسال الطلب' : 'Failed to submit'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const drawerActions: DrawerAction[] = selected
    ? selected.adminCreated && selected.status === 'awaiting_confirmation'
      ? [
          {
            label: lang === 'ar' ? 'قبول وخصم الرصيد' : 'Accept & Deduct',
            tone: 'primary',
            onClick: async () => {
              const res = await onRespondWithdrawal(selected.id, 'confirm');
              if (res.ok) {
                onNotify(
                  'success',
                  lang === 'ar' ? 'تم قبول السحب وخصم المبلغ' : 'Withdrawal accepted & deducted',
                  selected.orderId
                );
              } else {
                onNotify('error', res.error || 'تعذر تنفيذ الطلب');
              }
            },
          },
          {
            label: lang === 'ar' ? 'رفض (بدون خصم)' : 'Reject (No Deduction)',
            tone: 'danger',
            onClick: async () => {
              const res = await onRespondWithdrawal(selected.id, 'reject');
              if (res.ok) {
                onNotify(
                  'warning',
                  lang === 'ar' ? 'تم رفض السحب ولم يتم خصم شيء' : 'Withdrawal rejected — no balance deducted',
                  selected.orderId
                );
              } else {
                onNotify('error', res.error || 'تعذر رفض الطلب');
              }
            },
          },
        ]
      : selected.requestedByAgent && selected.status === 'awaiting_confirmation'
      ? [
          {
            label: lang === 'ar' ? 'إلغاء الطلب' : 'Cancel Request',
            tone: 'danger',
            onClick: async () => {
              await onUpdate(selected.id, 'release');
              onNotify('warning', lang === 'ar' ? 'تم إلغاء طلب السحب' : 'Request cancelled', selected.orderId);
              setSelectedId(null);
            },
          },
        ]
      : selected.status === 'available'
      ? [
          {
            label: t(lang, 'claimWithdrawal'),
            tone: 'primary',
            onClick: async () => {
              await onClaim(selected.id);
              onNotify('success', t(lang, 'claimWithdrawal'), selected.orderId);
            },
          },
        ]
      : selected.status === 'accepted'
      ? [
          {
            label: t(lang, 'completeWithdrawal'),
            tone: 'primary',
            confirm: {
              severity: 'info',
              title: t(lang, 'completeWithdrawalTitle'),
              message: t(lang, 'completeWithdrawalMsg'),
              confirmLabel: t(lang, 'completeWithdrawal'),
            },
            onClick: async () => {
              const autoReceipt =
                selected.receiptFiles.length === 0
                  ? [{ name: `receipt-${selected.orderId}.jpg`, size: '214 KB' }]
                  : undefined;
              await onUpdate(selected.id, 'complete', autoReceipt);
              onNotify('success', t(lang, 'status_completed'), selected.orderId);
            },
          },
          {
            label: t(lang, 'releaseWithdrawal'),
            tone: 'secondary',
            onClick: async () => {
              await onUpdate(selected.id, 'release');
              onNotify('warning', t(lang, 'releaseWithdrawal'), selected.orderId);
              setSelectedId(null);
            },
          },
        ]
      : []
    : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="hpay-toolbar flex flex-wrap items-center justify-between gap-3 border-b border-[#c4454b]/20 bg-[#171012]/80 backdrop-blur-md px-4 lg:px-6 py-3 shrink-0">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 h-3.5 w-3.5 text-[#a38f92]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(lang, 'searchWithdrawalId')}
            className="h-9 w-full rounded-[10px] border border-[#c4454b]/25 bg-[#120c0e]/85 ps-9 pe-3 text-[13px] text-white placeholder:text-[#a38f92] outline-none focus:border-[#d15b62]"
          />
        </div>

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#f29b9f]/25 bg-[#b83b44]/85 hover:bg-[#c94a53]/90 backdrop-blur-md px-3.5 text-[13px] font-semibold text-white transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>{lang === 'ar' ? 'طلب سحب جديد' : 'New Withdrawal Request'}</span>
        </button>
      </div>

      <div className="hpay-table-wrap flex-1 min-h-0 overflow-auto scrollbar-dark">
        {filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-[#a38f92]">
            <p className="text-[14px]">{t(lang, 'nothingFound')}</p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#c4454b]/40 bg-[#c4454b]/15 px-3.5 py-1.5 text-[13px] font-semibold text-[#f09599] hover:bg-[#c4454b]/25 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{lang === 'ar' ? 'إرسال طلب سحب للإدارة' : 'Submit Withdrawal Request'}</span>
            </button>
          </div>
        ) : (
          <table className="hpay-table w-full border-collapse text-start">
            <thead className="sticky top-0 z-10 bg-[#1c1315]/95 backdrop-blur-md border-b border-[#c4454b]/22">
              <tr className="text-[12px] font-medium text-[#c7b3b6]">
                {!settings.hideRowNumbers && <th className="py-3 px-4 text-start w-12">#</th>}
                <th className="py-3 px-4 text-start">{t(lang, 'orderId')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'amount')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'usdt')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'destinationMethod')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'recipientName')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'timeLeft')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'status')}</th>
                <th className="py-3 px-4 text-start">{lang === 'ar' ? 'إجراء' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c4454b]/15">
              {filtered.map((w, idx) => (
                <tr
                  key={w.id}
                  onClick={() => setSelectedId(w.id)}
                  className={`cursor-pointer transition-colors ${
                    w.id === selectedId ? 'bg-[#c4454b]/15' : 'hover:bg-[#1e1417]/75'
                  }`}
                >
                  {!settings.hideRowNumbers && (
                    <td className="py-3 px-4 text-[#a38f92] font-mono-num">{idx + 1}</td>
                  )}
                  <td className="py-3 px-4 font-mono-num font-medium text-white whitespace-nowrap">
                    <div>{w.orderId}</div>
                    {w.adminCreated && (
                      <div className="text-[10.5px] font-sans text-[#f09599]">
                        {lang === 'ar' ? 'مرسل من الإدارة' : 'From Admin'}
                      </div>
                    )}
                    {w.requestedByAgent && (
                      <div className="text-[10.5px] font-sans text-[#f3a6aa]">
                        {lang === 'ar' ? 'طلب سحب من حسابك' : 'Your Request'}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono-num font-semibold text-white whitespace-nowrap">
                    {formatMoney(w.amountLocal)} {currentAccount.currency}
                  </td>
                  <td className="py-3 px-4 font-mono-num text-[#c7b3b6] whitespace-nowrap">
                    {formatNumber(w.amountUsdt)}
                  </td>
                  <td className="py-3 px-4 text-[#e2d4d6]">
                    <div>{w.destinationMethod}</div>
                    <div className="text-[11.5px] font-mono-num text-[#a38f92]">{w.requisiteNumber}</div>
                  </td>
                  <td className="py-3 px-4 text-white whitespace-nowrap">{w.recipientName}</td>
                  <td className="py-3 px-4 font-mono-num text-[#f09599] whitespace-nowrap">
                    {w.status === 'available' || w.status === 'accepted' || w.status === 'awaiting_confirmation'
                      ? formatRemainingMinutes(w.expiresAt, lang)
                      : '—'}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <StatusBadge status={w.status} lang={lang} />
                  </td>
                  <td
                    className="py-3 px-4 whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {w.adminCreated && w.status === 'awaiting_confirmation' ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await onRespondWithdrawal(w.id, 'confirm');
                            if (res.ok) {
                              onNotify(
                                'success',
                                lang === 'ar' ? 'تم قبول السحب وخصم الرصيد' : 'Accepted & Deducted',
                                w.orderId
                              );
                            } else {
                              onNotify('error', res.error || 'خطأ');
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#f29b9f]/25 bg-[#b83b44]/85 hover:bg-[#c94a53]/90 px-2.5 py-1 text-[11.5px] font-semibold text-white cursor-pointer"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>{lang === 'ar' ? 'قبول' : 'Accept'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await onRespondWithdrawal(w.id, 'reject');
                            if (res.ok) {
                              onNotify(
                                'warning',
                                lang === 'ar' ? 'تم رفض السحب' : 'Rejected',
                                w.orderId
                              );
                            } else {
                              onNotify('error', res.error || 'خطأ');
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#e35d6a]/40 bg-[#e35d6a]/15 hover:bg-[#e35d6a]/25 px-2.5 py-1 text-[11.5px] font-semibold text-[#f28b94] cursor-pointer"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>{lang === 'ar' ? 'رفض' : 'Reject'}</span>
                        </button>
                      </div>
                    ) : w.requestedByAgent && w.status === 'awaiting_confirmation' ? (
                      <span className="text-[11.5px] text-[#f09599]">
                        {lang === 'ar' ? 'بانتظار الإدارة' : 'Pending Admin'}
                      </span>
                    ) : (
                      <span className="text-[11.5px] text-[#a38f92]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Withdrawal Request Drawer */}
      <DetailDrawer
        open={createOpen}
        lang={lang}
        section={t(lang, 'withdrawalsListing')}
        title={lang === 'ar' ? 'طلب سحب جديد' : 'New Withdrawal Request'}
        onClose={() => setCreateOpen(false)}
        actions={[
          {
            label: submitting
              ? lang === 'ar'
                ? 'جاري الإرسال...'
                : 'Sending...'
              : lang === 'ar'
              ? 'إرسال طلب السحب للإدارة'
              : 'Submit Withdrawal Request',
            tone: 'primary',
            onClick: handleSubmitCreate,
          },
        ]}
      >
        <div className="space-y-4">
          <div className="rounded-[12px] border border-[#c4454b]/35 bg-[#c4454b]/14 p-3 text-[12.5px] text-[#f3a6aa] flex items-start gap-2.5">
            <Info className="h-4 w-4 text-[#f09599] shrink-0 mt-0.5" />
            <span>
              {lang === 'ar'
                ? 'يُرسل طلب السحب إلى لوحة تحكم الإدارة للمراجعة (تأكيد أو رفض)، ولا يتم خصم أي مبلغ من رصيدك تلقائياً.'
                : 'Your withdrawal request is sent to Admin for Confirm/Reject. No balance is automatically deducted.'}
            </span>
          </div>

          <div className="space-y-2">
            <label className="text-[12px] font-medium text-[#c7b3b6] block">
              {lang === 'ar' ? 'اختر وسيلة السحب (وسيلة واحدة)' : 'Choose Payment Method (1 option)'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ALLOWED_PAYMENT_METHODS.map((method) => {
                const active = destinationMethod === method;
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setDestinationMethod(method)}
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

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[#c7b3b6]">
              {destinationMethod === 'باينانس'
                ? lang === 'ar'
                  ? 'معرف باينانس (Binance ID / Pay / TRC-20)'
                  : 'Binance Pay ID / Address'
                : lang === 'ar'
                ? 'رقم المحفظة المستلمة'
                : 'Wallet Phone Number'}
            </label>
            <input
              type="text"
              value={requisiteNumber}
              onChange={(e) => setRequisiteNumber(e.target.value)}
              placeholder={destinationMethod === 'باينانس' ? 'ID أو عنوان باينانس' : '010xxxxxxxx'}
              className="w-full rounded-[10px] border border-[#c4454b]/25 bg-[#120c0e]/85 px-3 py-2.5 text-[13.5px] font-mono-num text-white outline-none focus:border-[#d15b62]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[#c7b3b6]">
              {lang === 'ar' ? 'اسم المستلم' : 'Recipient Name'}
            </label>
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder={currentAccount.username}
              className="w-full rounded-[10px] border border-[#c4454b]/25 bg-[#120c0e]/85 px-3 py-2.5 text-[13.5px] text-white outline-none focus:border-[#d15b62]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[#c7b3b6]">
              {lang === 'ar' ? `المبلغ المطلوب (${currentAccount.currency})` : `Amount (${currentAccount.currency})`}
            </label>
            <input
              type="number"
              min={1}
              step="0.01"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="w-full rounded-[10px] border border-[#c4454b]/25 bg-[#120c0e]/85 px-3 py-2.5 text-[16px] font-bold font-mono-num text-[#f09599] outline-none focus:border-[#d15b62]"
            />
          </div>
        </div>
      </DetailDrawer>

      {/* Withdrawal Details Drawer */}
      <DetailDrawer
        open={Boolean(selected)}
        lang={lang}
        section={mode === 'pool' ? t(lang, 'withdrawalsListing') : t(lang, 'myWithdrawals')}
        title={selected?.orderId ?? ''}
        status={selected?.status}
        copyText={selected ? `${selected.orderId} | ${selected.requisiteNumber}` : ''}
        skipConfirm={settings.skipConfirm}
        onCopySuccess={() => onNotify('success', t(lang, 'copied'))}
        onClose={() => setSelectedId(null)}
        actions={drawerActions}
      >
        {selected && (
          <div className="space-y-4">
            {selected.adminCreated && selected.status === 'awaiting_confirmation' && (
              <div className="rounded-[12px] border border-[#c4454b]/35 bg-[#c4454b]/14 p-3.5 text-[12.5px] text-[#f3a6aa]">
                {lang === 'ar'
                  ? 'طلب سحب وارد من الإدارة: عند الضغط على «قبول» يتم خصم المبلغ من رصيدك، وعند «الرفض» لا يتم خصم أي مبلغ.'
                  : 'Admin withdrawal request: Accepting deducts the amount from your balance. Rejecting deducts nothing.'}
              </div>
            )}

            {selected.requestedByAgent && selected.status === 'awaiting_confirmation' && (
              <div className="rounded-[12px] border border-[#c4454b]/35 bg-[#c4454b]/14 p-3.5 text-[12.5px] text-[#f3a6aa]">
                {lang === 'ar'
                  ? 'طلب السحب قيد المراجعة في لوحة تحكم الإدارة (تأكيد أو رفض) بدون خصم من رصيدك.'
                  : 'Your withdrawal request is awaiting Admin review (Confirm or Reject) without balance deduction.'}
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

            <div className="rounded-[12px] border border-[#c4454b]/22 bg-[#201518]/70 p-4 space-y-3 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-[#a38f92]">{t(lang, 'destinationMethod')}</span>
                <span className="text-white font-medium">{selected.destinationMethod}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#a38f92]">{t(lang, 'recipientName')}</span>
                <span className="text-white">{selected.recipientName}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#a38f92]">{t(lang, 'requisite')}</span>
                <button
                  type="button"
                  onClick={() => copyVal(selected.requisiteNumber)}
                  className="flex items-center gap-1.5 rounded-lg border border-[#c4454b]/28 bg-[#281b1e]/80 px-2.5 py-1 text-[12.5px] font-mono-num text-white hover:bg-[#322125] cursor-pointer"
                >
                  <span>{selected.requisiteNumber}</span>
                  <Copy className="h-3 w-3 text-[#c7b3b6]" />
                </button>
              </div>
              {selected.acceptedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-[#a38f92]">{t(lang, 'acceptedAt')}</span>
                  <span className="font-mono-num text-[#c7b3b6] text-[12px]">
                    {formatDateTime(selected.acceptedAt, settings)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[#a38f92]">{t(lang, 'expiresAt')}</span>
                <span className="font-mono-num text-[#f09599] text-[12px]">
                  {formatRemainingMinutes(selected.expiresAt, lang)}
                </span>
              </div>
            </div>

            {(selected.status === 'accepted' || selected.status === 'completed') && (
              <div className="rounded-[12px] border border-[#c4454b]/22 bg-[#201518]/70 p-4 space-y-3">
                <div className="text-[13px] font-semibold text-white">{t(lang, 'uploadReceipt')}</div>
                {selected.status === 'accepted' && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => handleFilesSelected(e.target.files)}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex w-full flex-col items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-[#c4454b]/35 bg-[#120c0e]/75 py-5 px-4 text-center hover:border-[#d15b62] transition-colors cursor-pointer"
                    >
                      <Upload className="h-5 w-5 text-[#f09599]" />
                      <span className="text-[13px] font-medium text-white">{t(lang, 'attachFiles')}</span>
                      <span className="text-[11.5px] text-[#a38f92]">{t(lang, 'multipleFiles')}</span>
                    </button>
                  </>
                )}

                {selected.receiptFiles.length > 0 && (
                  <div className="space-y-2">
                    {selected.receiptFiles.map((f, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-lg border border-[#c4454b]/20 bg-[#191113]/85 px-3 py-2 text-[12.5px]"
                      >
                        <span className="flex items-center gap-2 text-white truncate">
                          <FileText className="h-4 w-4 text-[#00e344] shrink-0" />
                          <span className="truncate">{f.name}</span>
                        </span>
                        <span className="text-[#a38f92] font-mono-num shrink-0">{f.size}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
