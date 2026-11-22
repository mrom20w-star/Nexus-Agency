import React, { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  CreditCard,
  HelpCircle,
  Inbox,
  Info,
  Landmark,
  MinusSquare,
  Plus,
  PlusSquare,
  TrendingUp,
  Users,
} from 'lucide-react';
import { BottomBar } from '../components/BottomBar';
import { DetailDrawer } from '../components/DetailDrawer';
import { QrCodeSvg } from '../components/QrCodeSvg';
import { StatusBadge } from '../components/StatusBadge';
import { t } from '../i18n';
import {
  ALLOWED_PAYMENT_METHODS,
  AllowedPaymentMethod,
  AccountDesk,
  AppSettings,
  DepositOrder,
  PlatformConfig,
  RoutePath,
  UserProfile,
  WithdrawalOrder,
} from '../types';
import { formatDateTime, formatMoney, formatNumber } from '../utils/format';

function resolveDepositNumber(
  method: AllowedPaymentMethod,
  currentAccount: AccountDesk,
  config: PlatformConfig
): string {
  const userNum = (currentAccount.fixedDepositNumber || '').trim();
  if (userNum) return userNum;
  const map: Record<AllowedPaymentMethod, string | undefined> = {
    'فودافون كاش': config.depositMethodNumbers?.vodafone,
    'اتصالات كاش': config.depositMethodNumbers?.etisalat,
    'أورنج كاش': config.depositMethodNumbers?.orange,
    'باينانس': config.depositMethodNumbers?.binance,
  };
  return (map[method] || '').trim() || (config.defaultDepositNumber || '').trim();
}

export function ProfilePage({
  profile,
  currentAccount,
  config,
  deposits = [],
  withdrawals,
  depositsCount = 0,
  pendingDepositsCount = 0,
  pendingWithdrawalsCount = 0,
  requisitesCount = 0,
  settings,
  triggerCreate,
  onClearTriggerCreate,
  onCreateDeposit,
  onToggle2FA,
  onNavigate,
  onNotify,
}: {
  profile: UserProfile;
  currentAccount: AccountDesk;
  config: PlatformConfig;
  deposits?: DepositOrder[];
  withdrawals: WithdrawalOrder[];
  depositsCount?: number;
  pendingDepositsCount?: number;
  pendingWithdrawalsCount?: number;
  requisitesCount?: number;
  settings: AppSettings;
  triggerCreate: boolean;
  onClearTriggerCreate: () => void;
  onCreateDeposit: (payload: {
    paymentMethod: AllowedPaymentMethod;
    amountLocal: number;
    senderNumber?: string;
    note?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onToggle2FA: (enabled: boolean) => Promise<void>;
  onNavigate?: (route: RoutePath) => void;
  onNotify: (type: 'success' | 'error' | 'warning', title: string, message?: string) => void;
}) {
  const lang = settings.lang;
  const currLabel = t(lang, 'currencyShort');
  const [accountInfoOpen, setAccountInfoOpen] = useState(true);
  const [balanceHistoryOpen, setBalanceHistoryOpen] = useState(true);
  const [historyTab, setHistoryTab] = useState<'deposit' | 'withdrawals'>('deposit');
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [amountInput, setAmountInput] = useState('1000');
  const [paymentMethod, setPaymentMethod] = useState<AllowedPaymentMethod>('فودافون كاش');
  const [senderNumber, setSenderNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);

  const safePlayerId = profile.playerId || profile.traderId || 'PL-00000001';
  const safeUuid = currentAccount.uuid || '01a1a848-4f12-7901-b4a2-884019e3c102';
  const safeEmail = profile.email || '—';
  const fixedNumberForAccount =
    (currentAccount.fixedDepositNumber || profile.fixedDepositNumber || config.defaultDepositNumber || '').trim();
  const activeDepositNumber = resolveDepositNumber(paymentMethod, currentAccount, config);

  useEffect(() => {
    if (triggerCreate) {
      setDepositModalOpen(true);
      onClearTriggerCreate();
    }
  }, [triggerCreate, onClearTriggerCreate]);

  const copyVal = async (val: string) => {
    if (!val) return;
    try {
      await navigator.clipboard.writeText(val);
      onNotify('success', t(lang, 'copied'), val);
    } catch {
      onNotify('error', t(lang, 'copyFailed'));
    }
  };

  const quickSections: Array<{
    route: RoutePath;
    title: string;
    desc: string;
    count?: number;
    icon: React.ReactNode;
    accent: string;
  }> = [
    {
      route: '/deposits',
      title: t(lang, 'depositsListing'),
      desc: lang === 'ar' ? 'إرسال طلب إيداع ومتابعة الموافقة' : 'Submit deposits & track admin approval',
      count: depositsCount,
      icon: <PlusSquare className="h-4.5 w-4.5" />,
      accent: 'text-[#00e344] bg-[#00e344]/10 border-[#00e344]/25',
    },
    {
      route: '/withdrawals',
      title: t(lang, 'withdrawalsListing'),
      desc: lang === 'ar' ? 'طلبات السحب والقبول والرفض' : 'Withdrawals & approval actions',
      count: withdrawals.length,
      icon: <MinusSquare className="h-4.5 w-4.5" />,
      accent: 'text-[#f09599] bg-[#c4454b]/15 border-[#c4454b]/30',
    },
    {
      route: '/requisite',
      title: t(lang, 'requisite'),
      desc: lang === 'ar' ? 'وسيلة دفع واحدة: فودافون · اتصالات · أورنج · باينانس' : 'Single method: Vodafone · Etisalat · Orange · Binance',
      count: requisitesCount,
      icon: <CreditCard className="h-4.5 w-4.5" />,
      accent: 'text-[#e87d82] bg-[#b83b44]/15 border-[#c4454b]/30',
    },
    {
      route: '/messages',
      title: t(lang, 'messages'),
      desc: lang === 'ar' ? 'رسائل التأكيد وطلبات السحب الواردة' : 'Incoming alerts & withdrawal confirmations',
      count: pendingWithdrawalsCount,
      icon: <Inbox className="h-4.5 w-4.5" />,
      accent: 'text-[#f09599] bg-[#c4454b]/15 border-[#c4454b]/30',
    },
    {
      route: '/statistics',
      title: t(lang, 'statistics'),
      desc: lang === 'ar' ? 'ملخص الأرباح وحجم التداول' : 'Volume, profit & conversion metrics',
      icon: <TrendingUp className="h-4.5 w-4.5" />,
      accent: 'text-[#f3a6aa] bg-[#b83b44]/15 border-[#c4454b]/30',
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-transparent">
      <div className="flex-1 overflow-y-auto scrollbar-dark">
        <div className="border-b border-[#c4454b]/20 px-4 lg:px-6 py-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#c4454b]/25 bg-gradient-to-l from-[#b83b44]/18 via-[#191113]/80 to-[#191113]/80 backdrop-blur-md px-4 py-3.5">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[16px] font-bold text-white">
                  {lang === 'ar'
                    ? `أهلاً بك، ${profile.displayName || currentAccount.username}`
                    : `Welcome, ${profile.displayName || currentAccount.username}`}
                </h2>
                <span className="rounded-md border border-[#c4454b]/40 bg-[#c4454b]/16 px-2 py-0.5 font-mono-num text-[11px] font-bold text-[#f09599]">
                  {safePlayerId}
                </span>
                <span
                  className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                    currentAccount.canTrade
                      ? 'border border-[#00e344]/35 bg-[#00e344]/10 text-[#00e344]'
                      : 'border border-[#c4454b]/25 bg-[#201518]/80 text-[#c7b3b6]'
                  }`}
                >
                  {currentAccount.canTrade ? t(lang, 'active') : t(lang, 'paused')}
                </span>
              </div>
              <div className="text-[12.5px] text-[#c7b3b6]">
                {lang === 'ar'
                  ? 'لوحة التحكم جاهزة للعمل — يمكنك متابعة رصيدك، طلبات الإيداع، السحوبات، ووسيلة الدفع مباشرة.'
                  : 'Your desk is active and ready — manage balance, deposits, withdrawals, and your payment method.'}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDepositModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#f29b9f]/25 bg-[#b83b44]/85 hover:bg-[#c94a53]/90 backdrop-blur-md px-3.5 py-2 text-[13px] font-semibold text-white transition-colors cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>{lang === 'ar' ? 'طلب إيداع جديد' : 'New Deposit'}</span>
              </button>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('/referrals')}
                  className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#c4454b]/25 bg-[#201518]/75 hover:border-[#c4454b]/50 px-3 py-2 text-[13px] font-medium text-[#e2d4d6] hover:text-white transition-colors cursor-pointer"
                >
                  <Users className="h-4 w-4 text-[#f09599]" />
                  <span>{t(lang, 'referrals')}</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-[12px] border border-[#c4454b]/22 bg-[#191113]/75 backdrop-blur-md px-4 py-3">
              <div className="text-[12px] text-[#a38f92]">{t(lang, 'balance')}</div>
              <div className="mt-1 font-mono-num text-[18px] font-bold text-[#00e344]">
                {formatNumber(currentAccount.balanceUsdt)} {currLabel}
              </div>
            </div>
            <div className="rounded-[12px] border border-[#c4454b]/22 bg-[#191113]/75 backdrop-blur-md px-4 py-3">
              <div className="text-[12px] text-[#a38f92]">{t(lang, 'frozen')}</div>
              <div className="mt-1 font-mono-num text-[18px] font-bold text-[#f09599]">
                {formatNumber(currentAccount.frozenUsdt)} {currLabel}
              </div>
            </div>
            <div className="rounded-[12px] border border-[#c4454b]/22 bg-[#191113]/75 backdrop-blur-md px-4 py-3">
              <div className="text-[12px] text-[#a38f92]">
                {lang === 'ar' ? 'الإيداعات / بانتظار الإدارة' : 'Deposits / Pending'}
              </div>
              <div className="mt-1 font-mono-num text-[18px] font-bold text-white">
                {depositsCount}{' '}
                <span className="text-[12px] font-medium text-[#f09599]">
                  ({pendingDepositsCount} {lang === 'ar' ? 'معلق' : 'pending'})
                </span>
              </div>
            </div>
            <div className="rounded-[12px] border border-[#c4454b]/22 bg-[#191113]/75 backdrop-blur-md px-4 py-3">
              <div className="text-[12px] text-[#a38f92]">
                {lang === 'ar' ? 'طلبات السحب والوسيلة' : 'Withdrawals & Method'}
              </div>
              <div className="mt-1 font-mono-num text-[18px] font-bold text-white">
                {withdrawals.length}{' '}
                <span className="text-[12px] font-medium text-[#f09599]">
                  · {requisitesCount} {lang === 'ar' ? 'وسيلة' : 'method'}
                </span>
              </div>
            </div>
          </div>

          {onNavigate && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {quickSections.map((item) => (
                <button
                  key={item.route}
                  type="button"
                  onClick={() => onNavigate(item.route)}
                  className="flex items-center justify-between gap-3 rounded-[12px] border border-[#c4454b]/22 bg-[#191113]/75 backdrop-blur-md hover:border-[#c4454b]/55 hover:bg-[#221619]/80 px-4 py-3 text-start transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border ${item.accent}`}
                    >
                      {item.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold text-white truncate">
                        {item.title}
                      </div>
                      <div className="text-[11.5px] text-[#a38f92] truncate">{item.desc}</div>
                    </div>
                  </div>
                  {item.count !== undefined && (
                    <span className="shrink-0 rounded-md border border-[#c4454b]/25 bg-[#120c0e]/85 px-2 py-0.5 font-mono-num text-[12px] font-bold text-[#e2d4d6]">
                      {item.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-b border-[#c4454b]/20">
          <div className="flex items-center justify-between px-4 lg:px-6 py-3.5">
            <div className="flex items-center gap-2.5 text-[14.5px] font-medium text-white">
              <HelpCircle className="h-[18px] w-[18px] text-[#e87d82]" />
              <span>{lang === 'ar' ? 'بيانات الحساب' : 'Account info'}</span>
            </div>
            <button
              type="button"
              onClick={() => setAccountInfoOpen((o) => !o)}
              aria-label="Toggle account info"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#c4454b]/25 bg-[#201518]/75 text-[#c7b3b6] hover:text-white cursor-pointer"
            >
              {accountInfoOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>

          {accountInfoOpen && (
            <div className="px-4 lg:px-6 pb-5 pt-1">
              <div className="flex gap-3 overflow-x-auto scrollbar-dark pb-2">
                <div className="shrink-0 min-w-[180px] rounded-[12px] border border-[#c4454b]/35 bg-[#c4454b]/[0.12] backdrop-blur-md px-4 py-3.5">
                  <div className="flex items-center gap-2 text-[12px] text-[#f09599]">
                    <span>{lang === 'ar' ? 'ID اللاعب' : 'Player ID'}</span>
                    <button
                      type="button"
                      onClick={() => copyVal(safePlayerId)}
                      className="text-[#f09599] hover:text-white cursor-pointer"
                      aria-label={t(lang, 'copy')}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-1.5 font-mono-num text-[14px] font-bold text-white">
                    {safePlayerId}
                  </div>
                </div>

                <div className="shrink-0 min-w-[220px] rounded-[12px] border border-[#c4454b]/35 bg-[#c4454b]/[0.12] backdrop-blur-md px-4 py-3.5">
                  <div className="flex items-center gap-2 text-[12px] text-[#f3a6aa]">
                    <span>{lang === 'ar' ? 'رقم الإيداع الثابت' : 'Fixed Deposit Number'}</span>
                    {fixedNumberForAccount && (
                      <button
                        type="button"
                        onClick={() => copyVal(fixedNumberForAccount)}
                        className="text-[#f3a6aa] hover:text-white cursor-pointer"
                        aria-label={t(lang, 'copy')}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 font-mono-num text-[14px] font-bold text-white">
                    {fixedNumberForAccount || (lang === 'ar' ? 'لم يحدد بعد' : 'Not assigned yet')}
                  </div>
                </div>

                <div className="shrink-0 min-w-[295px] rounded-[12px] border border-[#c4454b]/22 bg-[#191113]/75 backdrop-blur-md px-4 py-3.5">
                  <div className="flex items-center gap-2 text-[12px] text-[#a38f92]">
                    <span>{lang === 'ar' ? 'معرف الحساب' : 'account id'}</span>
                    <button
                      type="button"
                      onClick={() => copyVal(safeUuid)}
                      className="text-[#a38f92] hover:text-white cursor-pointer"
                      aria-label={t(lang, 'copy')}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-1.5 font-mono-num text-[13px] font-semibold text-white">
                    {safeUuid}
                  </div>
                </div>

                <div className="shrink-0 min-w-[165px] rounded-[12px] border border-[#c4454b]/22 bg-[#191113]/75 backdrop-blur-md px-4 py-3.5">
                  <div className="text-[12px] text-[#a38f92]">{t(lang, 'balance')}</div>
                  <div className="mt-1.5 font-mono-num text-[14px] font-bold text-[#00e344]">
                    {formatNumber(currentAccount.balanceUsdt)} {currLabel}
                  </div>
                </div>

                <div className="shrink-0 min-w-[210px] rounded-[12px] border border-[#c4454b]/22 bg-[#191113]/75 backdrop-blur-md px-4 py-3.5">
                  <div className="text-[12px] text-[#a38f92]">
                    {lang === 'ar' ? 'البريد الإلكتروني' : 'email'}
                  </div>
                  <div className="mt-1.5 font-mono-num text-[13px] font-semibold text-white truncate">
                    {safeEmail}
                  </div>
                </div>

                <div className="shrink-0 min-w-[135px] rounded-[12px] border border-[#c4454b]/22 bg-[#191113]/75 backdrop-blur-md px-4 py-3.5">
                  <div className="text-[12px] text-[#a38f92]">
                    {lang === 'ar' ? 'التأمين' : 'insurance'}
                  </div>
                  <div className="mt-1.5 font-mono-num text-[14px] font-semibold text-white">
                    {currentAccount.insuranceAmount != null
                      ? `${formatNumber(currentAccount.insuranceAmount)} ${currLabel}`
                      : `— ${currLabel}`}
                  </div>
                </div>

                <div className="shrink-0 min-w-[130px] rounded-[12px] border border-[#c4454b]/22 bg-[#191113]/75 backdrop-blur-md px-4 py-3.5">
                  <div className="text-[12px] text-[#a38f92]">
                    {lang === 'ar' ? 'عمولة الإيداع' : 'deposit fee'}
                  </div>
                  <div className="mt-1.5 font-mono-num text-[14px] font-semibold text-[#00e344]">
                    {currentAccount.depositFeePct ?? 3.0}%
                  </div>
                </div>

                <div className="shrink-0 min-w-[130px] rounded-[12px] border border-[#c4454b]/22 bg-[#191113]/75 backdrop-blur-md px-4 py-3.5">
                  <div className="text-[12px] text-[#a38f92]">
                    {lang === 'ar' ? 'عمولة السحب' : 'withdrawal fee'}
                  </div>
                  <div className="mt-1.5 font-mono-num text-[14px] font-semibold text-[#f09599]">
                    {currentAccount.withdrawalFeePct ?? 1.8}%
                  </div>
                </div>

                <div className="shrink-0 min-w-[175px] rounded-[12px] border border-[#c4454b]/22 bg-[#191113]/75 backdrop-blur-md px-4 py-3.5 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[12px] text-[#a38f92]">2FA</div>
                    <div className="mt-1 text-[13px] font-semibold text-white">
                      {profile.twoFactorEnabled ? t(lang, 'active') : t(lang, 'paused')}
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={profile.twoFactorEnabled}
                    onClick={async () => {
                      await onToggle2FA(!profile.twoFactorEnabled);
                      onNotify('success', t(lang, 'security2fa'));
                    }}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                      profile.twoFactorEnabled ? 'bg-[#b83b44]' : 'bg-[#35262a]'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                        profile.twoFactorEnabled
                          ? 'translate-x-4.5 rtl:-translate-x-4.5'
                          : 'translate-x-1 rtl:-translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 lg:px-6 py-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-[14.5px] font-medium text-white">
              <Landmark className="h-[18px] w-[18px] text-[#e87d82]" />
              <span>{lang === 'ar' ? 'سجل الرصيد والعمليات' : 'Balance history'}</span>
            </div>
            <button
              type="button"
              onClick={() => setBalanceHistoryOpen((o) => !o)}
              aria-label="Toggle balance history"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#c4454b]/25 bg-[#201518]/75 text-[#c7b3b6] hover:text-white cursor-pointer"
            >
              {balanceHistoryOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>

          {balanceHistoryOpen && (
            <div className="space-y-3.5">
              <div className="flex flex-col items-start gap-3">
                <button
                  type="button"
                  onClick={() => setDepositModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-[10px] border border-[#f29b9f]/25 bg-[#b83b44]/85 hover:bg-[#c94a53]/90 backdrop-blur-md px-4 py-2 text-[13.5px] font-semibold text-white transition-colors cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>{lang === 'ar' ? 'طلب إيداع جديد' : 'Create new deposit'}</span>
                </button>

                <div className="inline-flex items-center rounded-[10px] border border-[#c4454b]/22 bg-[#191113]/75 p-1">
                  <button
                    type="button"
                    onClick={() => setHistoryTab('deposit')}
                    className={`rounded-[7px] px-4 py-1.5 text-[13px] font-medium transition-colors cursor-pointer ${
                      historyTab === 'deposit' ? 'bg-[#b83b44]/85 text-white' : 'text-[#c7b3b6] hover:text-white'
                    }`}
                  >
                    {lang === 'ar' ? 'طلبات الإيداع' : 'Deposit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryTab('withdrawals')}
                    className={`rounded-[7px] px-4 py-1.5 text-[13px] font-medium transition-colors cursor-pointer ${
                      historyTab === 'withdrawals' ? 'bg-[#b83b44]/85 text-white' : 'text-[#c7b3b6] hover:text-white'
                    }`}
                  >
                    {lang === 'ar' ? 'سجل السحوبات' : 'Withdrawals'}
                  </button>
                </div>
              </div>

              <div className="rounded-[12px] border border-[#c4454b]/22 bg-[#191113]/75 backdrop-blur-md overflow-hidden">
                {historyTab === 'deposit' ? (
                  deposits.length === 0 ? (
                    <div className="py-10 text-center text-[13.5px] text-[#a38f92]">
                      {t(lang, 'nothingFound')}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-start text-[13px]">
                        <thead className="bg-[#1c1315]/90 text-[12px] text-[#c7b3b6]">
                          <tr>
                            <th className="py-2.5 px-4 text-start">{t(lang, 'orderId')}</th>
                            <th className="py-2.5 px-4 text-start">{t(lang, 'bank')}</th>
                            <th className="py-2.5 px-4 text-start">{lang === 'ar' ? 'رقم التحويل' : 'Deposit Number'}</th>
                            <th className="py-2.5 px-4 text-start">{t(lang, 'amount')}</th>
                            <th className="py-2.5 px-4 text-start">{t(lang, 'status')}</th>
                            <th className="py-2.5 px-4 text-start">{t(lang, 'date')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#c4454b]/15">
                          {deposits.map((dep) => (
                            <tr key={dep.id} className="hover:bg-[#201518]/75">
                              <td className="py-3 px-4 font-mono-num text-white">{dep.orderId}</td>
                              <td className="py-3 px-4 text-[#e2d4d6]">{dep.bankName}</td>
                              <td className="py-3 px-4 font-mono-num text-[#f09599]">{dep.requisiteNumber}</td>
                              <td className="py-3 px-4 font-mono-num font-semibold text-[#00e344]">
                                +{formatMoney(dep.amountLocal)} {currLabel}
                              </td>
                              <td className="py-3 px-4">
                                <StatusBadge status={dep.status} lang={lang} />
                              </td>
                              <td className="py-3 px-4 font-mono-num text-[12px] text-[#a38f92]">
                                {formatDateTime(dep.createdAt, settings)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : withdrawals.length === 0 ? (
                  <div className="py-10 text-center text-[13.5px] text-[#a38f92]">
                    {t(lang, 'nothingFound')}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-start text-[13px]">
                      <thead className="bg-[#1c1315]/90 text-[12px] text-[#c7b3b6]">
                        <tr>
                          <th className="py-2.5 px-4 text-start">{t(lang, 'orderId')}</th>
                          <th className="py-2.5 px-4 text-start">{t(lang, 'destinationMethod')}</th>
                          <th className="py-2.5 px-4 text-start">{t(lang, 'amount')}</th>
                          <th className="py-2.5 px-4 text-start">{t(lang, 'status')}</th>
                          <th className="py-2.5 px-4 text-start">{t(lang, 'date')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#c4454b]/15">
                        {withdrawals.map((wd) => (
                          <tr key={wd.id} className="hover:bg-[#201518]/75">
                            <td className="py-3 px-4 font-mono-num text-white">{wd.orderId}</td>
                            <td className="py-3 px-4 text-[#e2d4d6]">
                              <div>{wd.destinationMethod}</div>
                              <div className="text-[11.5px] font-mono-num text-[#a38f92]">{wd.requisiteNumber}</div>
                            </td>
                            <td className="py-3 px-4 font-mono-num font-semibold text-white">
                              {formatMoney(wd.amountLocal)} {currLabel}
                            </td>
                            <td className="py-3 px-4">
                              <StatusBadge status={wd.status} lang={lang} />
                            </td>
                            <td className="py-3 px-4 font-mono-num text-[12px] text-[#a38f92]">
                              {formatDateTime(wd.createdAt, settings)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <BottomBar
        lang={lang}
        page={page}
        totalPages={1}
        onPageChange={setPage}
        onRefresh={() => onNotify('success', t(lang, 'refresh'))}
      />

      <DetailDrawer
        open={depositModalOpen}
        lang={lang}
        section={t(lang, 'profile')}
        title={lang === 'ar' ? 'طلب إيداع جديد' : 'New Deposit Request'}
        onClose={() => setDepositModalOpen(false)}
        actions={[
          {
            label: submitting
              ? lang === 'ar'
                ? 'جاري الإرسال...'
                : 'Submitting...'
              : lang === 'ar'
              ? 'إرسال طلب الإيداع (انتظار الموافقة)'
              : 'Submit Deposit (Await Approval)',
            tone: 'primary',
            onClick: async () => {
              const val = Number(amountInput) || 0;
              if (val <= 0) {
                onNotify('error', lang === 'ar' ? 'أدخل مبلغ إيداع صحيح' : 'Enter a valid amount');
                return;
              }
              setSubmitting(true);
              try {
                const res = await onCreateDeposit({
                  paymentMethod,
                  amountLocal: val,
                  senderNumber: senderNumber.trim() || undefined,
                });
                if (res.ok) {
                  setDepositModalOpen(false);
                  setSenderNumber('');
                  onNotify(
                    'success',
                    lang === 'ar' ? 'تم إرسال طلب الإيداع' : 'Deposit Request Submitted',
                    lang === 'ar'
                      ? 'الطلب في حالة انتظار موافقة الإدارة'
                      : 'Waiting for Admin approval'
                  );
                } else {
                  onNotify('error', res.error || (lang === 'ar' ? 'تعذر إرسال الإيداع' : 'Deposit failed'));
                }
              } finally {
                setSubmitting(false);
              }
            },
          },
        ]}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[12px] font-medium text-[#c7b3b6] block">
              {lang === 'ar' ? 'اختر وسيلة الإيداع (وسيلة واحدة)' : 'Choose Payment Method'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ALLOWED_PAYMENT_METHODS.map((method) => {
                const active = paymentMethod === method;
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
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

          <div className="flex flex-col items-center rounded-[12px] border border-[#c4454b]/35 bg-[#c4454b]/14 p-4 gap-3">
            {activeDepositNumber ? (
              <>
                <QrCodeSvg value={activeDepositNumber} size={126} />
                <div className="text-[12px] font-semibold text-[#f3a6aa]">
                  {lang === 'ar'
                    ? 'حوّل المبلغ أولاً على هذا الرقم الثابت:'
                    : 'Transfer first to this fixed deposit number:'}
                </div>
                <div className="flex w-full items-center justify-between gap-2 rounded-lg border border-[#c4454b]/35 bg-[#120c0e]/85 px-3 py-2">
                  <span className="font-mono-num text-[14px] font-bold text-white truncate">
                    {activeDepositNumber}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyVal(activeDepositNumber)}
                    className="text-[#f09599] hover:text-white shrink-0 cursor-pointer"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center text-[12.5px] text-[#f28b94] py-2">
                {lang === 'ar'
                  ? 'لم يتم تعيين رقم إيداع ثابت لهذا الحساب من الإدارة بعد'
                  : 'No fixed deposit number assigned by Admin yet'}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[#c7b3b6]">
              {lang === 'ar' ? `المبلغ (${currLabel})` : `Amount (${currLabel})`}
            </label>
            <input
              type="number"
              min={1}
              step="0.01"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="w-full rounded-[10px] border border-[#c4454b]/25 bg-[#120c0e]/85 px-3 py-2 text-[15px] font-bold font-mono-num text-white outline-none focus:border-[#d15b62]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[#c7b3b6]">
              {lang === 'ar' ? 'الرقم المحول منه (اختياري)' : 'Sender Number / ID (optional)'}
            </label>
            <input
              type="text"
              value={senderNumber}
              onChange={(e) => setSenderNumber(e.target.value)}
              placeholder="010xxxxxxxx"
              className="w-full rounded-[10px] border border-[#c4454b]/25 bg-[#120c0e]/85 px-3 py-2 text-[13px] font-mono-num text-white outline-none focus:border-[#d15b62]"
            />
          </div>

          <div className="rounded-[10px] border border-[#c4454b]/30 bg-[#c4454b]/14 p-3 text-[12px] text-[#f3a6aa] flex items-start gap-2">
            <Info className="h-4 w-4 text-[#f09599] shrink-0 mt-0.5" />
            <span>
              {lang === 'ar'
                ? 'بعد الإرسال سيظهر الطلب في حالة «انتظار موافقة الإيداع» ويُضاف الرصيد بعد تأكيد الإدارة.'
                : 'After submission, status becomes "Awaiting Approval" and balance is credited once Admin confirms.'}
            </span>
          </div>
        </div>
      </DetailDrawer>
    </div>
  );
}
