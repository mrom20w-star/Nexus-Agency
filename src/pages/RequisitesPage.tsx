import React, { useMemo, useState } from 'react';
import { Copy, CreditCard, Lock, Search, Wallet } from 'lucide-react';
import { DetailDrawer } from '../components/DetailDrawer';
import { QrCodeSvg } from '../components/QrCodeSvg';
import { StatusBadge } from '../components/StatusBadge';
import { t } from '../i18n';
import { AccountDesk, AppSettings, Requisite } from '../types';
import { formatMoney } from '../utils/format';

export function RequisitesPage({
  requisites,
  currentAccount,
  settings,
  onNotify,
}: {
  requisites: Requisite[];
  currentAccount: AccountDesk;
  settings: AppSettings;
  onNotify: (type: 'success' | 'error' | 'warning', title: string, message?: string) => void;
}) {
  const lang = settings.lang;
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const accountRequisites = useMemo(() => {
    const matched = requisites.filter((r) => r.accountId === currentAccount.account_id);
    if (matched.length > 0) return matched;
    const fixedNum = (currentAccount.fixedDepositNumber || '').trim();
    if (!fixedNum) return [];
    const methodName = (currentAccount.fixedDepositMethod || '').trim() || 'فودافون كاش';
    const synthesized: Requisite = {
      id: `req_${currentAccount.account_id}`,
      accountId: currentAccount.account_id,
      bankName: methodName,
      ownerName: currentAccount.username,
      accountNumber: fixedNum,
      type: methodName === 'باينانس' ? 'instapay' : 'wallet',
      minOrder: 100,
      maxOrder: 30000,
      dailyLimit: 150000,
      dailyUsed: 0,
      bidRate: currentAccount.depositFeePct,
      active: true,
    };
    return [synthesized];
  }, [
    requisites,
    currentAccount.account_id,
    currentAccount.fixedDepositNumber,
    currentAccount.fixedDepositMethod,
    currentAccount.username,
    currentAccount.depositFeePct,
  ]);

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
    () => accountRequisites.find((r) => r.id === selectedId) ?? null,
    [accountRequisites, selectedId]
  );

  const copyNum = async (num: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await navigator.clipboard.writeText(num);
      onNotify('success', t(lang, 'copied'), num);
    } catch {
      onNotify('error', t(lang, 'copyFailed'));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="hpay-toolbar flex flex-wrap items-center justify-between gap-3 border-b border-[#c4454b]/26 bg-[#280e14]/58 backdrop-blur-md px-4 lg:px-6 py-3 shrink-0">
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

        <div className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#c4454b]/30 bg-[#201518]/80 px-3.5 text-[12px] font-semibold text-[#f3a6aa] whitespace-nowrap">
          <Lock className="h-3.5 w-3.5 text-[#f09599]" />
          <span>
            {lang === 'ar' ? 'تعيين وتعديل من الإدارة فقط' : 'Managed by Admin Only'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-dark p-4 lg:p-6 space-y-4">
        <div className="flex items-start gap-2.5 rounded-[12px] border border-[#c4454b]/35 bg-[#c4454b]/14 px-4 py-3 text-[12.5px] text-[#f3a6aa]">
          <Lock className="h-4 w-4 text-[#f09599] shrink-0 mt-0.5" />
          <span>
            {lang === 'ar'
              ? 'تتم إضافة وتعديل وسيلة الدفع ورقم المحفظة من لوحة تحكم الإدارة فقط عن طريق البريد الإلكتروني (Gmail)، ولا يمكن للوكيل إضافتهما أو تعديلهما.'
              : 'Payment method and wallet number are assigned and managed exclusively by Admin from the Dashboard via your email and cannot be modified here.'}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="flex h-60 flex-col items-center justify-center gap-3 rounded-[14px] border border-[#c4454b]/22 bg-[#201518]/55 px-6 text-center text-[#a38f92]">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#c4454b]/30 bg-[#c4454b]/12 text-[#f09599]">
              <Wallet className="h-5 w-5" />
            </span>
            <p className="text-[14px] font-semibold text-white">
              {search.trim()
                ? t(lang, 'nothingFound')
                : lang === 'ar'
                ? 'لم يتم تعيين رقم محفظة لحسابك بعد'
                : 'No wallet number assigned yet'}
            </p>
            {!search.trim() && (
              <p className="max-w-md text-[12.5px] text-[#c7b3b6]">
                {lang === 'ar'
                  ? 'يتم ربط وسيلة الدفع ورقم المحفظة بحسابك من لوحة تحكم الإدارة فقط بالبريد الإلكتروني.'
                  : 'Admin assigns your payment method and wallet number from the Dashboard using your email.'}
              </p>
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
                  onClick={() => setSelectedId(req.id)}
                  className={`rounded-[12px] border backdrop-blur-md transition-colors cursor-pointer ${
                    settings.compactCards ? 'p-3.5' : 'p-4'
                  } ${
                    req.id === selectedId
                      ? 'border-[#d15b62] bg-[#241317]/85'
                      : 'border-[#c4454b]/26 bg-[#280e14]/56 hover:border-[#c4454b]/48 hover:bg-[#311118]/68'
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
                    <div className="h-1.5 w-full rounded-full bg-[#280e14] overflow-hidden">
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
        open={Boolean(selected)}
        lang={lang}
        section={t(lang, 'requisite')}
        title={selected?.bankName ?? ''}
        status={selected ? (selected.active ? 'active' : 'inactive') : undefined}
        copyText={selected?.accountNumber}
        skipConfirm={settings.skipConfirm}
        onCopySuccess={() => onNotify('success', t(lang, 'copied'))}
        onClose={() => setSelectedId(null)}
        actions={[]}
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-col items-center rounded-[12px] border border-[#c4454b]/22 bg-[#201518]/70 p-4 gap-2">
              <QrCodeSvg value={`req:${selected.id}:${selected.accountNumber}`} size={124} />
              <span className="text-[11.5px] font-mono-num text-[#a38f92]">{selected.id}</span>
            </div>

            <div className="flex items-start gap-2 rounded-[10px] border border-[#c4454b]/30 bg-[#c4454b]/12 p-3 text-[12px] text-[#f3a6aa]">
              <Lock className="h-4 w-4 text-[#f09599] shrink-0 mt-0.5" />
              <span>
                {lang === 'ar'
                  ? 'بيانات وسيلة الدفع ورقم المحفظة للعرض والنسخ فقط — التعديل أو التغيير يتم من لوحة تحكم الإدارة.'
                  : 'Payment method details are read-only. Updates are made exclusively by Admin from the Dashboard.'}
              </span>
            </div>

            <div className="rounded-[12px] border border-[#c4454b]/22 bg-[#201518]/70 p-4 space-y-3 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-[#a38f92]">{lang === 'ar' ? 'وسيلة الدفع' : 'Payment Method'}</span>
                <span className="font-semibold text-white">{selected.bankName}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#a38f92]">{t(lang, 'ownerName')}</span>
                <span className="text-white">{selected.ownerName}</span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[#a38f92]">
                  {selected.bankName === 'باينانس'
                    ? lang === 'ar'
                      ? 'معرف باينانس'
                      : 'Binance Pay ID'
                    : t(lang, 'accountNumber')}
                </span>
                <button
                  type="button"
                  onClick={() => copyNum(selected.accountNumber)}
                  className="flex items-center gap-1.5 rounded-lg border border-[#c4454b]/28 bg-[#280e14]/80 px-2.5 py-1 text-[12.5px] font-mono-num font-bold text-white hover:bg-[#311118] cursor-pointer"
                >
                  <span>{selected.accountNumber}</span>
                  <Copy className="h-3 w-3 text-[#c7b3b6]" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 rounded-[12px] border border-[#c4454b]/22 bg-[#201518]/70 p-3.5 text-[12px]">
              <div>
                <div className="text-[#a38f92]">{t(lang, 'minOrder')}</div>
                <div className="font-mono-num font-semibold text-white mt-0.5">
                  {formatMoney(selected.minOrder)}
                </div>
              </div>
              <div>
                <div className="text-[#a38f92]">{t(lang, 'maxOrder')}</div>
                <div className="font-mono-num font-semibold text-white mt-0.5">
                  {formatMoney(selected.maxOrder)}
                </div>
              </div>
              <div>
                <div className="text-[#a38f92]">{t(lang, 'dailyLimit')}</div>
                <div className="font-mono-num font-semibold text-white mt-0.5">
                  {formatMoney(selected.dailyLimit)}
                </div>
              </div>
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
