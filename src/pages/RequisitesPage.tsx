import React, { useEffect, useMemo, useState } from 'react';
import { Copy, CreditCard, Info, Plus, Search, Wallet } from 'lucide-react';
import { DetailDrawer, DrawerAction } from '../components/DetailDrawer';
import { QrCodeSvg } from '../components/QrCodeSvg';
import { StatusBadge } from '../components/StatusBadge';
import { t } from '../i18n';
import {
  ALLOWED_PAYMENT_METHODS,
  AllowedPaymentMethod,
  AccountDesk,
  AppSettings,
  Requisite,
} from '../types';
import { formatMoney } from '../utils/format';

export function RequisitesPage({
  requisites,
  currentAccount,
  settings,
  triggerCreate,
  onClearTriggerCreate,
  onCreate,
  onUpdate,
  onDelete,
  onNotify,
}: {
  requisites: Requisite[];
  currentAccount: AccountDesk;
  settings: AppSettings;
  triggerCreate: boolean;
  onClearTriggerCreate: () => void;
  onCreate: (data: Partial<Requisite>) => Promise<{ ok?: boolean; error?: string } | void>;
  onUpdate: (id: string, data: Partial<Requisite>) => Promise<{ ok?: boolean; error?: string } | void>;
  onDelete: (id: string) => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'warning', title: string, message?: string) => void;
}) {
  const lang = settings.lang;
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [bankName, setBankName] = useState<AllowedPaymentMethod>('فودافون كاش');
  const [ownerName, setOwnerName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [minOrder, setMinOrder] = useState('200');
  const [maxOrder, setMaxOrder] = useState('30000');
  const [dailyLimit, setDailyLimit] = useState('150000');
  const [bidRate, setBidRate] = useState(String(currentAccount.depositFeePct));

  const accountRequisites = useMemo(
    () => requisites.filter((r) => r.accountId === currentAccount.account_id),
    [requisites, currentAccount.account_id]
  );

  const hasReachedLimit = accountRequisites.length >= 1;

  const openCreateDrawer = () => {
    if (hasReachedLimit) {
      onNotify(
        'warning',
        lang === 'ar' ? 'يُسمح بوسيلة دفع واحدة فقط' : 'Only 1 payment method allowed',
        lang === 'ar' ? 'يمكنك تعديل أو حذف الوسيلة الحالية' : 'Edit or delete your existing method first'
      );
      return;
    }
    setSelectedId(null);
    setBankName('فودافون كاش');
    setOwnerName('');
    setAccountNumber('');
    setMinOrder('200');
    setMaxOrder('30000');
    setDailyLimit('150000');
    setBidRate(String(currentAccount.depositFeePct));
    setCreating(true);
  };

  useEffect(() => {
    if (triggerCreate) {
      openCreateDrawer();
      onClearTriggerCreate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerCreate]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accountRequisites.filter((r) => {
      if (q) {
        return (
          r.bankName.toLowerCase().includes(q) ||
          r.ownerName.toLowerCase().includes(q) ||
          r.accountNumber.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [accountRequisites, search]);

  const selected = useMemo(
    () => requisites.find((r) => r.id === selectedId) ?? null,
    [requisites, selectedId]
  );

  const selectForEdit = (req: Requisite) => {
    setCreating(false);
    setSelectedId(req.id);
    const matchedMethod = ALLOWED_PAYMENT_METHODS.find((m) => m === req.bankName) ?? 'فودافون كاش';
    setBankName(matchedMethod);
    setOwnerName(req.ownerName);
    setAccountNumber(req.accountNumber);
    setMinOrder(String(req.minOrder));
    setMaxOrder(String(req.maxOrder));
    setDailyLimit(String(req.dailyLimit));
    setBidRate(String(req.bidRate));
  };

  const copyNum = async (num: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await navigator.clipboard.writeText(num);
      onNotify('success', t(lang, 'copied'), num);
    } catch {
      onNotify('error', t(lang, 'copyFailed'));
    }
  };

  const drawerActions: DrawerAction[] = creating
    ? [
        {
          label: t(lang, 'createRequisite'),
          tone: 'primary',
          onClick: async () => {
            if (!accountNumber.trim()) {
              onNotify(
                'error',
                lang === 'ar'
                  ? 'أدخل رقم المحفظة أو عنوان باينانس'
                  : 'Wallet number or Binance ID is required'
              );
              return;
            }
            const res = await onCreate({
              accountId: currentAccount.account_id,
              bankName,
              ownerName: ownerName.trim() || currentAccount.username,
              accountNumber: accountNumber.trim(),
              type: bankName === 'باينانس' ? 'instapay' : 'wallet',
              minOrder: Number(minOrder) || 200,
              maxOrder: Number(maxOrder) || 25000,
              dailyLimit: Number(dailyLimit) || 150000,
              bidRate: Number(bidRate) || currentAccount.depositFeePct,
            });
            if (res && res.ok === false) {
              onNotify('error', res.error || 'Error');
              return;
            }
            setCreating(false);
            onNotify('success', t(lang, 'createRequisite'), bankName);
          },
        },
      ]
    : selected
    ? [
        {
          label: t(lang, 'updateRequisite'),
          tone: 'primary',
          onClick: async () => {
            const res = await onUpdate(selected.id, {
              bankName,
              ownerName,
              accountNumber,
              type: bankName === 'باينانس' ? 'instapay' : 'wallet',
              minOrder: Number(minOrder) || selected.minOrder,
              maxOrder: Number(maxOrder) || selected.maxOrder,
              dailyLimit: Number(dailyLimit) || selected.dailyLimit,
              bidRate: Number(bidRate) || selected.bidRate,
            });
            if (res && res.ok === false) {
              onNotify('error', res.error || 'Error');
              return;
            }
            onNotify('success', t(lang, 'updateRequisite'));
          },
        },
        {
          label: selected.active ? t(lang, 'disable') : t(lang, 'enable'),
          tone: 'secondary',
          onClick: async () => {
            await onUpdate(selected.id, { active: !selected.active });
            onNotify('success', selected.active ? t(lang, 'paused') : t(lang, 'active'));
          },
        },
        {
          label: t(lang, 'deleteRequisite'),
          tone: 'danger',
          confirm: {
            severity: 'danger',
            title: t(lang, 'deleteRequisiteTitle'),
            message: t(lang, 'deleteRequisiteMsg'),
            confirmLabel: t(lang, 'deleteRequisite'),
          },
          onClick: async () => {
            await onDelete(selected.id);
            setSelectedId(null);
            onNotify('error', t(lang, 'deleteRequisite'));
          },
        },
      ]
    : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="hpay-toolbar flex flex-wrap items-center justify-between gap-3 border-b border-[#e05b64]/26 bg-[#2a0f15]/58 backdrop-blur-md px-4 lg:px-6 py-3 shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 h-3.5 w-3.5 text-[#a38f92]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              lang === 'ar'
                ? 'ابحث بالوسيلة أو رقم المحفظة أو المالك...'
                : 'Search method, wallet, or owner...'
            }
            className="h-9 w-full rounded-[10px] border border-[#c4454b]/25 bg-[#120c0e]/85 ps-9 pe-3 text-[13px] text-white placeholder:text-[#a38f92] outline-none focus:border-[#d15b62]"
          />
        </div>

        <button
          type="button"
          onClick={openCreateDrawer}
          disabled={hasReachedLimit}
          className={`flex h-9 items-center gap-1.5 rounded-[10px] px-3.5 text-[13px] font-semibold transition-colors whitespace-nowrap ${
            hasReachedLimit
              ? 'border border-[#c4454b]/18 bg-[#201518]/60 text-[#8e7a7d] cursor-not-allowed'
              : 'border border-[#f29b9f]/25 bg-[#b83b44]/85 text-white hover:bg-[#c94a53]/90 backdrop-blur-md cursor-pointer'
          }`}
        >
          <Plus className="h-4 w-4" />
          <span>{t(lang, 'createRequisite')}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-dark p-4 lg:p-6 space-y-4">
        <div className="flex items-start gap-2.5 rounded-[12px] border border-[#c4454b]/35 bg-[#c4454b]/14 px-4 py-3 text-[12.5px] text-[#f3a6aa]">
          <Info className="h-4 w-4 text-[#f09599] shrink-0 mt-0.5" />
          <span>
            {lang === 'ar'
              ? 'يُسمح بإضافة وسيلة دفع واحدة فقط لكل حساب من الوسائل المتاحة: فودافون كاش، اتصالات كاش، أورنج كاش، أو باينانس.'
              : 'Only 1 payment method is allowed per account from: Vodafone Cash, Etisalat Cash, Orange Cash, or Binance.'}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 text-[#a38f92]">
            <p className="text-[14px]">{t(lang, 'nothingFound')}</p>
            {!hasReachedLimit && (
              <button
                type="button"
                onClick={openCreateDrawer}
                className="flex items-center gap-1.5 rounded-[10px] border border-[#f29b9f]/25 bg-[#b83b44]/85 px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#c94a53]/90 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>{t(lang, 'createRequisite')}</span>
              </button>
            )}
          </div>
        ) : (
          <div
            className={`grid gap-4 ${
              settings.compactCards
                ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
            }`}
          >
            {filtered.map((req) => {
              const pct = Math.min(100, Math.round((req.dailyUsed / Math.max(1, req.dailyLimit)) * 100));
              return (
                <div
                  key={req.id}
                  onClick={() => selectForEdit(req)}
                  className={`rounded-[12px] border backdrop-blur-md transition-colors cursor-pointer ${
                    settings.compactCards ? 'p-3.5' : 'p-4'
                  } ${
                    req.id === selectedId
                      ? 'border-[#d15b62] bg-[#25171b]/85'
                      : 'border-[#e05b64]/26 bg-[#280e14]/56 hover:border-[#e05b64]/48 hover:bg-[#341219]/68'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#c4454b]/35 bg-[#c4454b]/15 text-[#f09599]">
                        {req.bankName === 'باينانس' ? (
                          <CreditCard className="h-4 w-4" />
                        ) : (
                          <Wallet className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold text-white truncate">{req.bankName}</div>
                        <div className="text-[12px] text-[#a38f92] truncate">{req.ownerName}</div>
                      </div>
                    </div>
                    <StatusBadge
                      status={req.active ? 'active' : 'inactive'}
                      lang={lang}
                      label={req.active ? t(lang, 'active') : t(lang, 'paused')}
                    />
                  </div>

                  <div className="mt-3.5 flex items-center justify-between gap-2 rounded-lg border border-[#c4454b]/20 bg-[#201518]/75 px-3 py-2">
                    <span className="font-mono-num text-[13px] font-medium text-white truncate">
                      {req.accountNumber}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => copyNum(req.accountNumber, e)}
                      className="text-[#c7b3b6] hover:text-white shrink-0 cursor-pointer"
                      aria-label={t(lang, 'copy')}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-[11.5px]">
                    <div>
                      <div className="text-[#a38f92]">{t(lang, 'minOrder')}</div>
                      <div className="font-mono-num text-white mt-0.5">{formatMoney(req.minOrder)}</div>
                    </div>
                    <div>
                      <div className="text-[#a38f92]">{t(lang, 'maxOrder')}</div>
                      <div className="font-mono-num text-white mt-0.5">{formatMoney(req.maxOrder)}</div>
                    </div>
                    <div>
                      <div className="text-[#a38f92]">{t(lang, 'bidRate')}</div>
                      <div className="font-mono-num text-[#f09599] font-semibold mt-0.5">{req.bidRate}%</div>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-[#c4454b]/18">
                    <div className="flex items-center justify-between text-[11.5px] mb-1.5">
                      <span className="text-[#a38f92]">{t(lang, 'dailyLimit')}</span>
                      <span className="font-mono-num text-[#c7b3b6]">
                        {formatMoney(req.dailyUsed)} / {formatMoney(req.dailyLimit)} {currentAccount.currency}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[#2a1c20] overflow-hidden">
                      <div
                        style={{ width: `${pct}%` }}
                        className={`h-full rounded-full ${
                          pct > 85 ? 'bg-[#e35d6a]' : pct > 60 ? 'bg-[#f4c20d]' : 'bg-[#b83b44]'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <DetailDrawer
        open={creating || Boolean(selected)}
        lang={lang}
        section={t(lang, 'requisite')}
        title={creating ? t(lang, 'createRequisite') : selected?.bankName ?? ''}
        status={selected ? (selected.active ? 'active' : 'inactive') : undefined}
        copyText={selected?.accountNumber}
        skipConfirm={settings.skipConfirm}
        onCopySuccess={() => onNotify('success', t(lang, 'copied'))}
        onClose={() => {
          setCreating(false);
          setSelectedId(null);
        }}
        actions={drawerActions}
      >
        <div className="space-y-4">
          {selected && (
            <div className="flex flex-col items-center rounded-[12px] border border-[#c4454b]/22 bg-[#201518]/70 p-4 gap-2">
              <QrCodeSvg value={`req:${selected.id}:${selected.accountNumber}`} size={124} />
              <span className="text-[11.5px] font-mono-num text-[#a38f92]">{selected.id}</span>
            </div>
          )}

          <Field label={lang === 'ar' ? 'اختر وسيلة دفع واحدة' : 'Select One Payment Method'}>
            <div className="grid grid-cols-2 gap-2">
              {ALLOWED_PAYMENT_METHODS.map((method) => {
                const active = bankName === method;
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setBankName(method)}
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
          </Field>

          <Field label={t(lang, 'ownerName')}>
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder={lang === 'ar' ? 'الاسم الكامل لصاحب الحساب' : 'Account holder full name'}
              className="w-full rounded-[10px] border border-[#c4454b]/25 bg-[#120c0e]/85 px-3 py-2 text-[13px] text-white outline-none focus:border-[#d15b62]"
            />
          </Field>

          <Field
            label={
              bankName === 'باينانس'
                ? lang === 'ar'
                  ? 'معرف باينانس / Binance Pay ID أو العنوان'
                  : 'Binance Pay ID / Address'
                : t(lang, 'accountNumber')
            }
          >
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder={bankName === 'باينانس' ? 'Binance Pay ID / TRC20' : '010XXXXXXXX'}
              className="w-full rounded-[10px] border border-[#c4454b]/25 bg-[#120c0e]/85 px-3 py-2 text-[13px] font-mono-num text-white outline-none focus:border-[#d15b62]"
            />
          </Field>

          <div className="grid grid-cols-3 gap-2.5">
            <Field label={t(lang, 'minOrder')}>
              <input
                type="number"
                value={minOrder}
                onChange={(e) => setMinOrder(e.target.value)}
                className="w-full rounded-[10px] border border-[#c4454b]/25 bg-[#120c0e]/85 px-2.5 py-2 text-[13px] font-mono-num text-white outline-none focus:border-[#d15b62]"
              />
            </Field>
            <Field label={t(lang, 'maxOrder')}>
              <input
                type="number"
                value={maxOrder}
                onChange={(e) => setMaxOrder(e.target.value)}
                className="w-full rounded-[10px] border border-[#c4454b]/25 bg-[#120c0e]/85 px-2.5 py-2 text-[13px] font-mono-num text-white outline-none focus:border-[#d15b62]"
              />
            </Field>
            <Field label={t(lang, 'dailyLimit')}>
              <input
                type="number"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
                className="w-full rounded-[10px] border border-[#c4454b]/25 bg-[#120c0e]/85 px-2.5 py-2 text-[13px] font-mono-num text-white outline-none focus:border-[#d15b62]"
              />
            </Field>
          </div>
        </div>
      </DetailDrawer>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-medium text-[#c7b3b6] block">{label}</label>
      {children}
    </div>
  );
}
