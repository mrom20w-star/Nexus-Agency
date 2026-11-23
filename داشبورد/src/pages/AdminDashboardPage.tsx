import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  Check,
  CheckCircle2,
  Coins,
  Copy,
  Database,
  Edit3,
  Eye,
  EyeOff,
  Globe,
  Hash,
  KeyRound,
  Lock,
  LogOut,
  MailPlus,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { CountryFlagBadge, HostapayLogo } from '../components/HpayIcons';
import { StatusBadge } from '../components/StatusBadge';
import {
  ALLOWED_PAYMENT_METHODS,
  ManagedUser,
  PlatformConfig,
  PlatformState,
  ToastMessage,
} from '../types';
import { formatDateTime, formatMoney } from '../utils/format';

export type ServerConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'api_disabled'
  | 'permission_denied'
  | 'offline';
export type ConnectionMode = 'firebase' | 'api' | 'php' | 'local';

export interface AdminDashboardPageProps {
  state: PlatformState;
  adminAuthed: boolean;
  needsSetup?: boolean;
  connectionStatus?: ServerConnectionStatus;
  connectionMode?: ConnectionMode;
  firebaseProjectId?: string;
  onAdminLogin: (password: string) => Promise<{ ok: boolean; error?: string }>;
  onAdminSetup?: (password: string) => Promise<{ ok: boolean; error?: string }>;
  onAdminLogout: () => void | Promise<void>;
  onRefreshAdmin: () => Promise<void>;
  onCreateUser: (payload: {
    email: string;
    password: string;
    displayName: string;
    username: string;
    balanceEgp?: number;
    active?: boolean;
    fixedDepositNumber?: string;
    fixedDepositMethod?: string;
  }) => Promise<{ ok: boolean; error?: string; user?: ManagedUser }>;
  onUpdateUser: (
    userId: string,
    patch: Partial<{
      displayName: string;
      email: string;
      password: string;
      balanceEgp: number;
      active: boolean;
      canTrade: boolean;
      fixedDepositNumber: string;
      fixedDepositMethod: string;
    }>
  ) => Promise<{ ok: boolean; error?: string }>;
  onDeleteUser: (userId: string) => Promise<void>;
  onSetDepositNumber?: (payload: {
    userId?: string;
    identifier?: string;
    depositNumber: string;
    depositMethod?: string;
  }) => Promise<{ ok: boolean; error?: string; user?: ManagedUser }>;
  onSendWithdrawalToUser: (payload: {
    userId: string;
    amountEgp: number;
    destinationMethod: string;
    requisiteNumber: string;
    recipientName: string;
    note?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onWithdrawalAction?: (
    id: string,
    action: 'confirm' | 'reject'
  ) => Promise<{ ok: boolean; error?: string } | void>;
  onSendMessageToUser: (payload: {
    userId: string;
    sender: string;
    body: string;
    amountEgp?: number;
  }) => Promise<void>;
  onCreateDepositForUser: (payload: {
    userId?: string;
    identifier?: string;
    amountEgp: number;
    bankName?: string;
    depositNumber?: string;
    saveAsFixed?: boolean;
    note?: string;
    autoCredit?: boolean;
  }) => Promise<{ ok: boolean; error?: string; user?: ManagedUser }>;
  onDepositAction: (id: string, action: 'confirm' | 'cancel') => Promise<void>;
  onUpdateConfig: (patch: Partial<PlatformConfig>) => Promise<{ ok: boolean; error?: string } | void>;
  onNotify: (type: ToastMessage['type'], title: string, message?: string) => void;
}

const PAYMENT_METHOD_CHIPS = [...ALLOWED_PAYMENT_METHODS];
const WD_PRESET_AMOUNTS = [500, 1000, 2500, 5000, 10000];

function generateStrongPin(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'EG-';
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function AdminDashboardPage({
  state,
  adminAuthed,
  needsSetup = false,
  connectionStatus = 'connected',
  connectionMode = 'firebase',
  firebaseProjectId = 'moorrcv',
  onAdminLogin,
  onAdminSetup,
  onAdminLogout,
  onRefreshAdmin,
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
  onSetDepositNumber,
  onSendWithdrawalToUser,
  onWithdrawalAction,
  onSendMessageToUser,
  onCreateDepositForUser,
  onDepositAction,
  onUpdateConfig,
  onNotify,
}: AdminDashboardPageProps) {
  const [adminPassInput, setAdminPassInput] = useState('');
  const [adminPassConfirm, setAdminPassConfirm] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [tab, setTab] = useState<'users' | 'withdrawals' | 'orders' | 'settings'>('users');
  const [userSearch, setUserSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revealedPassIds, setRevealedPassIds] = useState<Record<string, boolean>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [previewUser, setPreviewUser] = useState<ManagedUser | null>(null);

  const emailInputRef = useRef<HTMLInputElement | null>(null);

  // Create user state
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newFixedDepMethod, setNewFixedDepMethod] = useState('فودافون كاش');
  const [newFixedDepNumber, setNewFixedDepNumber] = useState('');
  const [newUserActive, setNewUserActive] = useState(true);
  const [creatingUser, setCreatingUser] = useState(false);
  const [createUserFeedback, setCreateUserFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const fixedDepSectionRef = useRef<HTMLInputElement | null>(null);

  // Fixed deposit number assignment form
  const [fixedDepIdentifier, setFixedDepIdentifier] = useState('');
  const [fixedDepNumberInput, setFixedDepNumberInput] = useState('');
  const [fixedDepMethodInput, setFixedDepMethodInput] = useState('فودافون كاش');
  const [savingFixedDep, setSavingFixedDep] = useState(false);
  const [fixedDepFeedback, setFixedDepFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Edit user drawer
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editBalance, setEditBalance] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editFixedDepNum, setEditFixedDepNum] = useState('');
  const [editFixedDepMethod, setEditFixedDepMethod] = useState('فودافون كاش');

  // Withdrawal request form (Admin -> User)
  const users = state.users ?? [];
  const [wdUserId, setWdUserId] = useState(users[0]?.id ?? '');
  const [wdAmount, setWdAmount] = useState('1500');
  const [wdMethod, setWdMethod] = useState('فودافون كاش');
  const [wdNumber, setWdNumber] = useState('010');
  const [wdRecipient, setWdRecipient] = useState('');
  const [wdNote, setWdNote] = useState('');
  const [sendingWd, setSendingWd] = useState(false);
  const [wdFeedback, setWdFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Instant Deposit form
  const [instantDepIdentifier, setInstantDepIdentifier] = useState('');
  const [instantDepAmount, setInstantDepAmount] = useState('1000');
  const [instantDepMethod, setInstantDepMethod] = useState('فودافون كاش');
  const [instantDepNumber, setInstantDepNumber] = useState('');
  const [instantSaveFixedDep, setInstantSaveFixedDep] = useState(true);
  const [instantDepNote, setInstantDepNote] = useState('');
  const [sendingDep, setSendingDep] = useState(false);
  const [instantDepFeedback, setInstantDepFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Tab 3: Custom message & Deposit form
  const [msgUserId, setMsgUserId] = useState(users[0]?.id ?? '');
  const [msgSender, setMsgSender] = useState('إدارة المنصة');
  const [msgBody, setMsgBody] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [msgFeedback, setMsgFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const [depIdentifier, setDepIdentifier] = useState('');
  const [depAmount, setDepAmount] = useState('1000');
  const [depMethod, setDepMethod] = useState('فودافون كاش');
  const [depNumber, setDepNumber] = useState('');
  const [depSaveFixed, setDepSaveFixed] = useState(true);
  const [depNote, setDepNote] = useState('');
  const [sendingOrderDep, setSendingOrderDep] = useState(false);
  const [orderDepFeedback, setOrderDepFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Tab 4: Config form
  const [usdRateInput, setUsdRateInput] = useState(String(state.config.usdRate));
  const [defaultDepNumInput, setDefaultDepNumInput] = useState(
    state.config.defaultDepositNumber || ''
  );
  const [vodafoneDepNum, setVodafoneDepNum] = useState(
    state.config.depositMethodNumbers?.vodafone || ''
  );
  const [etisalatDepNum, setEtisalatDepNum] = useState(
    state.config.depositMethodNumbers?.etisalat || ''
  );
  const [orangeDepNum, setOrangeDepNum] = useState(
    state.config.depositMethodNumbers?.orange || ''
  );
  const [binanceDepId, setBinanceDepId] = useState(
    state.config.depositMethodNumbers?.binance || ''
  );
  const [newAdminPass, setNewAdminPass] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [configFeedback, setConfigFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    setUsdRateInput(String(state.config.usdRate));
    setDefaultDepNumInput(state.config.defaultDepositNumber || '');
    setVodafoneDepNum(state.config.depositMethodNumbers?.vodafone || '');
    setEtisalatDepNum(state.config.depositMethodNumbers?.etisalat || '');
    setOrangeDepNum(state.config.depositMethodNumbers?.orange || '');
    setBinanceDepId(state.config.depositMethodNumbers?.binance || '');
  }, [state.config]);

  useEffect(() => {
    if ((!wdUserId || !users.some((u) => u.id === wdUserId)) && users[0]?.id) {
      setWdUserId(users[0].id);
    }
    if ((!msgUserId || !users.some((u) => u.id === msgUserId)) && users[0]?.id) {
      setMsgUserId(users[0].id);
    }
  }, [users, wdUserId, msgUserId]);

  useEffect(() => {
    if (!adminAuthed) return;
    const timer = setInterval(() => {
      onRefreshAdmin().catch(() => undefined);
    }, 8000);
    return () => clearInterval(timer);
  }, [adminAuthed, onRefreshAdmin]);

  const matchUserByIdentifier = (ident: string): ManagedUser | null => {
    const qRaw = ident.trim().toLowerCase();
    if (!qRaw) return null;
    const qNoAt = qRaw.replace(/^@/, '');
    return (
      users.find(
        (u) =>
          u.email.trim().toLowerCase() === qRaw ||
          u.username.trim().toLowerCase().replace(/^@/, '') === qNoAt ||
          (u.playerId || '').trim().toLowerCase() === qRaw
      ) ?? null
    );
  };

  const matchedFixedDepUser = useMemo(
    () => matchUserByIdentifier(fixedDepIdentifier),
    [users, fixedDepIdentifier]
  );

  const matchedDepUser = useMemo(
    () => matchUserByIdentifier(instantDepIdentifier),
    [users, instantDepIdentifier]
  );

  const matchedOrderDepUser = useMemo(
    () => matchUserByIdentifier(depIdentifier),
    [users, depIdentifier]
  );

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.playerId || '').toLowerCase().includes(q) ||
        (u.fixedDepositNumber || '').toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const jumpToCreatePlayer = () => {
    setTab('users');
    setTimeout(() => {
      emailInputRef.current?.focus();
      emailInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  };

  const copyText = (key: string, text: string, label: string) => {
    navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopiedId(key);
    onNotify('success', `تم النسخ: ${label}`, text);
    setTimeout(() => setCopiedId((prev) => (prev === key ? null : prev)), 1800);
  };

  if (!adminAuthed) {
    return (
      <div
        dir="rtl"
        className="min-h-dvh w-full bg-[#0f0b0c] bg-[radial-gradient(ellipse_at_top,_rgba(196,69,75,0.24),transparent_62%),radial-gradient(ellipse_at_bottom_left,_rgba(184,59,68,0.12),transparent_55%)] flex items-center justify-center p-4 text-white"
      >
        <div className="w-full max-w-[440px] rounded-[20px] border border-[#c4454b]/25 bg-[#1a1013]/68 backdrop-blur-xl p-7 shadow-[0_28px_70px_rgba(0,0,0,0.6)] space-y-6">
          <div className="flex items-center justify-between gap-2">
            <HostapayLogo
              platformName={state.config.platformName}
              countryCode={state.config.countryCode}
            />
            <span className="rounded-lg border border-[#c4454b]/35 bg-[#c4454b]/15 px-2.5 py-1 text-[11px] font-bold text-[#f09599] whitespace-nowrap shrink-0">
              إدارة المنصة
            </span>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-[21px] font-bold text-white flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#c4454b]/18 text-[#f09599] border border-[#c4454b]/35">
                <Shield className="h-5 w-5" />
              </span>
              <span>{needsSetup ? 'تفعيل كلمة مرور الإدارة لأول مرة' : 'لوحة تحكم الإدارة'}</span>
            </h1>
            <p className="text-[13px] text-[#c7b3b6] max-w-md">
              {needsSetup
                ? 'عيّن كلمة مرور خاصة بك لحماية لوحة التحكم، إدارة اللاعبين، الإيداعات، السحب، وسعر الصرف لايف.'
                : 'ربط مباشر بقاعدة بيانات المنصة لإدارة اللاعبين، الأرصدة، السحب، الإيداعات، وأرقام الإيداع الثابتة.'}
            </p>
          </div>

          {loginError && (
            <div className="rounded-[12px] border border-[#e35d6a]/45 bg-[#e35d6a]/15 px-3.5 py-2.5 text-[12.5px] text-[#f28b94]">
              {loginError}
            </div>
          )}

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setLoginError(null);
              const cleanPass = adminPassInput.trim();
              if (!cleanPass) {
                setLoginError('أدخل كلمة مرور الإدارة');
                return;
              }
              if (needsSetup && onAdminSetup) {
                if (cleanPass.length < 6) {
                  setLoginError('يجب أن لا تقل كلمة المرور عن 6 أحرف');
                  return;
                }
                if (cleanPass !== adminPassConfirm.trim()) {
                  setLoginError('كلمتا المرور غير متطابقتين');
                  return;
                }
                setLoggingIn(true);
                try {
                  const res = await onAdminSetup(cleanPass);
                  if (!res.ok) {
                    setLoginError(res.error || 'تعذر حفظ كلمة المرور');
                  } else {
                    setAdminPassInput('');
                    setAdminPassConfirm('');
                    onNotify('success', 'تم تفعيل لوحة الإدارة بنجاح');
                  }
                } finally {
                  setLoggingIn(false);
                }
                return;
              }

              setLoggingIn(true);
              try {
                const res = await onAdminLogin(cleanPass);
                if (!res.ok) {
                  setLoginError(res.error || 'كلمة مرور الأدمن مش صحيحة');
                } else {
                  setAdminPassInput('');
                }
              } finally {
                setLoggingIn(false);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-[#e2d4d6] block">
                {needsSetup ? 'كلمة مرور الإدارة الجديدة' : 'كلمة مرور الأدمن'}
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3.5 h-4 w-4 text-[#a38f92]" />
                <input
                  type="password"
                  required
                  value={adminPassInput}
                  onChange={(e) => setAdminPassInput(e.target.value)}
                  placeholder="أدخل كلمة مرور الإدارة"
                  className="w-full rounded-[11px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md ps-10 pe-3 py-2.5 text-[14px] text-white outline-none focus:border-[#d15b62] transition-colors"
                />
              </div>
            </div>

            {needsSetup && (
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-[#e2d4d6] block">
                  تأكيد كلمة المرور
                </label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3.5 h-4 w-4 text-[#a38f92]" />
                  <input
                    type="password"
                    required
                    value={adminPassConfirm}
                    onChange={(e) => setAdminPassConfirm(e.target.value)}
                    placeholder="أعد كتابة كلمة المرور"
                    className="w-full rounded-[11px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md ps-10 pe-3 py-2.5 text-[14px] text-white outline-none focus:border-[#d15b62] transition-colors"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full rounded-[11px] border border-[#f29b9f]/25 bg-[#b83b44]/85 py-3 text-[14px] font-semibold text-white hover:bg-[#c94a53]/90 backdrop-blur-md disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
            >
              {loggingIn
                ? 'جاري التحقق والدخول...'
                : needsSetup
                ? 'حفظ كلمة المرور ودخول الإدارة'
                : 'دخول لوحة الإدارة'}
            </button>
          </form>

          <div className="pt-3 border-t border-[#c4454b]/20 flex items-center justify-between gap-2 text-[11.5px]">
            <span className="text-[#c7b3b6] flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-[#f09599]" />
              <span>حالة سيرفر Firebase ({firebaseProjectId})</span>
            </span>
            <span
              className={`rounded-md px-2 py-0.5 text-[10.5px] font-bold ${
                connectionMode === 'firebase' && connectionStatus === 'connected'
                  ? 'bg-[#00e344]/15 text-[#00e344] border border-[#00e344]/30'
                  : connectionMode === 'api' || connectionMode === 'php'
                  ? 'bg-[#00e344]/15 text-[#00e344] border border-[#00e344]/30'
                  : connectionStatus === 'connecting'
                  ? 'bg-[#c4454b]/18 text-[#f09599] border border-[#c4454b]/30'
                  : 'bg-[#e35d6a]/15 text-[#fda4af] border border-[#e35d6a]/30'
              }`}
            >
              {connectionMode === 'firebase' && connectionStatus === 'connected'
                ? 'متصل لايف'
                : connectionMode === 'api'
                ? 'متصل بالسيرفر'
                : connectionMode === 'php'
                ? 'متصل (PHP)'
                : connectionStatus === 'connecting'
                ? 'جاري الاتصال...'
                : connectionStatus === 'api_disabled'
                ? 'يلزم تفعيل Firestore'
                : connectionStatus === 'permission_denied'
                ? 'صلاحيات Rules مرفوضة'
                : 'وضع محلي'}
            </span>
          </div>

          {connectionStatus === 'api_disabled' && (
            <div className="rounded-[10px] border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-[11.5px] text-amber-200 leading-relaxed">
              خدمة Cloud Firestore غير مفعّلة بعد في مشروع Firebase ({firebaseProjectId}). فعّل Firestore من Firebase Console للمزامنة عبر كل الأجهزة.
            </div>
          )}
        </div>
      </div>
    );
  }

  const totalBalanceEgp = users.reduce((sum, u) => sum + (u.balanceEgp || 0), 0);
  const onlineList = state.onlinePresence ?? [];
  const onlineCount = state.onlineCount ?? onlineList.length;
  const adminWithdrawals = state.withdrawals.filter((w) => w.adminCreated || w.requestedByAgent || w.userId);
  const pendingDeposits = state.deposits.filter((d) => d.status === 'pending');
  const pendingAgentWithdrawals = state.withdrawals.filter(
    (w) => w.requestedByAgent && w.status === 'awaiting_confirmation'
  );
  const pendingAdminMsgWithdrawals = state.messages.filter(
    (m) => m.withdrawalActionStatus === 'pending_confirmation'
  ).length;
  const totalPendingRequests = pendingDeposits.length + pendingAgentWithdrawals.length;

  const navItems = [
    {
      id: 'users' as const,
      label: 'اللاعبين والحسابات',
      sub: 'إنشاء و ID عشوائي',
      icon: Users,
      badge: users.length,
    },
    {
      id: 'withdrawals' as const,
      label: 'طلبات السحب والإيداع',
      sub: 'سحب وإيداع وطلبات معلقة',
      icon: Send,
      badge: totalPendingRequests > 0 ? totalPendingRequests : undefined,
      badgeColor: 'bg-[#b83b44] text-white',
    },
    {
      id: 'orders' as const,
      label: 'الإيداعات والرسايل',
      sub: 'رسايل مباشرة وإيداع',
      icon: MailPlus,
      badge: pendingDeposits.length > 0 ? pendingDeposits.length : undefined,
      badgeColor: 'bg-[#c4454b] text-white',
    },
    {
      id: 'settings' as const,
      label: 'إعدادات المنصة والصرف',
      sub: 'سعر الصرف وأرقام الإيداع',
      icon: Globe,
    },
  ];

  return (
    <div
      dir="rtl"
      className="min-h-dvh bg-[#0f0b0c] bg-[radial-gradient(ellipse_at_top,_rgba(196,69,75,0.24),transparent_62%),radial-gradient(ellipse_at_bottom_left,_rgba(184,59,68,0.12),transparent_55%)] text-white flex flex-col"
    >
      {/* Top Command Bar */}
      <header className="sticky top-0 z-30 border-b border-[#c4454b]/25 bg-[#160d10]/72 backdrop-blur-xl px-4 lg:px-6 h-16 shrink-0 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <HostapayLogo
            platformName={state.config.platformName}
            countryCode={state.config.countryCode}
          />
          <span className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-[#c4454b]/35 bg-[#c4454b]/15 px-2.5 py-0.5 text-[11px] font-bold text-[#f09599] whitespace-nowrap shrink-0">
            لوحة التحكم
          </span>
          <span
            className={`hidden md:inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap shrink-0 ${
              connectionMode === 'local'
                ? 'border-[#e35d6a]/35 bg-[#e35d6a]/12 text-[#fda4af]'
                : 'border-[#00e344]/30 bg-[#00e344]/10 text-[#00e344]'
            }`}
          >
            <Database className="h-3 w-3 shrink-0" />
            <span>
              {connectionMode === 'firebase'
                ? `متصل بـ Firebase (${firebaseProjectId})`
                : connectionMode === 'api'
                ? 'متصل بسيرفر المنصة لايف'
                : connectionMode === 'php'
                ? 'متصل بسيرفر PHP'
                : connectionStatus === 'api_disabled'
                ? 'يلزم تفعيل Firestore'
                : 'وضع محلي'}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">

          <button
            type="button"
            onClick={jumpToCreatePlayer}
            className="flex h-9 items-center gap-1.5 rounded-[10px] border border-[#f29b9f]/25 bg-[#b83b44]/85 px-3 text-[12.5px] font-bold text-white hover:bg-[#c94a53]/90 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <UserPlus className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">إنشاء حساب لاعب</span>
          </button>

          <div className="flex items-center gap-2 rounded-[10px] border border-[#00e344]/30 bg-[#00e344]/10 px-3 py-1.5 text-[12.5px] font-semibold text-[#00e344] whitespace-nowrap shrink-0">
            <span className="inline-flex rounded-full h-2 w-2 bg-[#00e344] shrink-0" />
            <span className="hidden xs:inline">أونلاين:</span>
            <span className="font-mono-num font-bold text-[14px]">{onlineCount}</span>
          </div>

          <button
            type="button"
            onClick={() => onRefreshAdmin()}
            title="تحديث فوري"
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#c4454b]/25 bg-[#241317]/70 text-[#c7b3b6] hover:text-white cursor-pointer shrink-0"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onAdminLogout}
            className="flex h-9 items-center gap-1.5 rounded-[10px] border border-[#e35d6a]/35 bg-[#e35d6a]/15 px-3 text-[12.5px] text-[#f28b94] hover:bg-[#e35d6a]/25 cursor-pointer whitespace-nowrap shrink-0"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">خروج</span>
          </button>
        </div>
      </header>

      <div className="flex-1 max-w-[1440px] w-full mx-auto p-4 lg:p-6 flex flex-col lg:flex-row gap-5">
        {/* Sidebar Rail */}
        <aside className="lg:w-64 shrink-0 space-y-3">
          <div className="rounded-[16px] border border-[#c4454b]/25 bg-[#1a1013]/68 backdrop-blur-xl shadow-[0_12px_36px_rgba(0,0,0,0.42)] p-2.5 grid grid-cols-2 lg:grid-cols-1 gap-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`flex items-center justify-between gap-2 rounded-[11px] px-3 py-2.5 text-start transition-all cursor-pointer ${
                    active
                      ? 'bg-[#b83b44]/85 border border-[#f29b9f]/25 text-white shadow-[0_8px_24px_rgba(184,59,68,0.32)] backdrop-blur-md'
                      : 'border border-transparent text-[#c7b3b6] hover:bg-[#241317]/65 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className="h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold truncate">{item.label}</div>
                      <div
                        className={`hidden lg:block text-[10.5px] truncate ${
                          active ? 'text-white/80' : 'text-[#a38f92]'
                        }`}
                      >
                        {item.sub}
                      </div>
                    </div>
                  </div>
                  {item.badge !== undefined && (
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[11px] font-mono-num font-bold shrink-0 ${
                        active
                          ? 'bg-black/25 text-white'
                          : item.badgeColor || 'bg-[#280e14]/85 text-[#e2d4d6]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="hidden lg:block rounded-[16px] border border-[#c4454b]/25 bg-[#1a1013]/68 backdrop-blur-xl shadow-[0_12px_36px_rgba(0,0,0,0.42)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-[#c7b3b6]">اسم المنصة (مثبّت)</span>
              <CountryFlagBadge code={state.config.countryCode} />
            </div>
            <div className="text-[15px] font-bold text-white truncate flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-[#00e344] shrink-0" />
              <span>{state.config.platformName}</span>
            </div>
            <div className="pt-2 border-t border-[#c4454b]/20 flex items-center justify-between text-[12px]">
              <span className="text-[#c7b3b6]">سعر الصرف</span>
              <span className="font-mono-num font-bold text-[#f09599]">
                1 USD = {state.config.usdRate} ج.م
              </span>
            </div>
            <button
              type="button"
              onClick={() => setTab('settings')}
              className="w-full rounded-[9px] border border-[#c4454b]/25 bg-[#241317]/65 py-1.5 text-[12px] font-semibold text-[#e2d4d6] hover:text-white hover:border-[#c4454b]/50 cursor-pointer whitespace-nowrap"
            >
              إعدادات سعر الصرف والأمان
            </button>
          </div>
        </aside>

        {/* Main Workspace */}
        <div className="flex-1 min-w-0 space-y-5">
          {connectionMode === 'local' && (
            <div className="rounded-[15px] border border-amber-400/45 bg-amber-500/12 backdrop-blur-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-[0_10px_28px_rgba(0,0,0,0.3)]">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/20 border border-amber-400/35 text-amber-300 mt-0.5">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div className="space-y-1 text-[12.5px]">
                  <div className="font-bold text-amber-200">
                    {connectionStatus === 'permission_denied'
                      ? `صلاحيات قواعد Firestore مرفوضة في مشروع (${firebaseProjectId})`
                      : `قاعدة بيانات Firestore غير مفعّلة بعد في مشروع Firebase (${firebaseProjectId})`}
                  </div>
                  <div className="text-amber-100/85 leading-relaxed">
                    {connectionStatus === 'permission_denied'
                      ? 'الحسابات لن تفتح على الموقع الرئيسي حتى تجعل Firestore Rules تسمح بالقراءة والكتابة (allow read, write: if true;).'
                      : 'أي حساب تنشئه الآن يُحفظ في هذا المتصفح فقط ولن يفتح في الموقع الرئيسي! فعّل Firestore Database في لوحة Firebase لمشروع moorrcv ليعمل الحساب فوراً على الموقع ومن أي جهاز.'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`https://console.firebase.google.com/project/${firebaseProjectId}/firestore`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-[10px] border border-amber-300/40 bg-amber-400/20 hover:bg-amber-400/30 px-3.5 py-2 text-[12px] font-bold text-amber-100 transition-colors whitespace-nowrap"
                >
                  تفعيل Firestore في {firebaseProjectId}
                </a>
                <button
                  type="button"
                  onClick={() => onRefreshAdmin()}
                  className="rounded-[10px] border border-[#c4454b]/35 bg-[#b83b44]/85 hover:bg-[#c94a53]/90 px-3.5 py-2 text-[12px] font-bold text-white cursor-pointer whitespace-nowrap"
                >
                  فحص الاتصال الآن
                </button>
              </div>
            </div>
          )}

          {/* KPI Grid */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5">
            <div className="rounded-[15px] border border-[#c4454b]/25 bg-gradient-to-b from-[#241317]/75 to-[#160d10]/65 backdrop-blur-xl shadow-[0_10px_28px_rgba(0,0,0,0.32)] p-4 flex items-center justify-between gap-2">
              <div>
                <div className="text-[11.5px] text-[#c7b3b6]">المستخدمين أونلاين حاليًا</div>
                <div className="mt-1 text-[26px] font-bold font-mono-num text-[#00e344]">
                  {onlineCount}
                </div>
                <div className="text-[10.5px] text-[#a38f92]">مراقبة فورية لايف</div>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#00e344]/12 border border-[#00e344]/25 text-[#00e344]">
                <Activity className="h-5 w-5" />
              </div>
            </div>

            <div className="rounded-[15px] border border-[#c4454b]/25 bg-gradient-to-b from-[#241317]/75 to-[#160d10]/65 backdrop-blur-xl shadow-[0_10px_28px_rgba(0,0,0,0.32)] p-4 flex items-center justify-between gap-2">
              <div>
                <div className="text-[11.5px] text-[#c7b3b6]">إجمالي اللاعبين</div>
                <div className="mt-1 text-[26px] font-bold font-mono-num text-white">
                  {users.length}
                </div>
                <div className="text-[10.5px] text-[#a38f92]">
                  مفعّل: {users.filter((u) => u.active).length}
                </div>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#c4454b]/18 border border-[#c4454b]/30 text-[#f09599]">
                <Users className="h-5 w-5" />
              </div>
            </div>

            <div className="rounded-[15px] border border-[#c4454b]/25 bg-gradient-to-b from-[#241317]/75 to-[#160d10]/65 backdrop-blur-xl shadow-[0_10px_28px_rgba(0,0,0,0.32)] p-4 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11.5px] text-[#c7b3b6]">مجموع أرصدة الموقع</div>
                <div className="mt-1 text-[20px] sm:text-[22px] font-bold font-mono-num text-[#f09599] truncate">
                  {formatMoney(totalBalanceEgp)} ج.م
                </div>
                <div className="text-[10.5px] text-[#a38f92]">بالجنيه المصري</div>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#c4454b]/18 border border-[#c4454b]/30 text-[#f09599]">
                <Coins className="h-5 w-5" />
              </div>
            </div>

            <div className="rounded-[15px] border border-[#c4454b]/25 bg-gradient-to-b from-[#241317]/75 to-[#160d10]/65 backdrop-blur-xl shadow-[0_10px_28px_rgba(0,0,0,0.32)] p-4 flex items-center justify-between gap-2">
              <div>
                <div className="text-[11.5px] text-[#c7b3b6]">طلبات بانتظار القرار</div>
                <div className="mt-1 text-[26px] font-bold font-mono-num text-[#f09599]">
                  {totalPendingRequests + pendingAdminMsgWithdrawals}
                </div>
                <div className="text-[10.5px] text-[#a38f92]">
                  {pendingDeposits.length} إيداع · {pendingAgentWithdrawals.length} سحب
                </div>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#c4454b]/18 border border-[#c4454b]/30 text-[#f09599]">
                <Wallet className="h-5 w-5" />
              </div>
            </div>
          </div>

          {/* TAB 1: USERS */}
          {tab === 'users' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
              <div className="xl:col-span-4 space-y-5">
                {/* Create User Card */}
                <div className="rounded-[16px] border border-[#c4454b]/25 bg-[#1a1013]/68 backdrop-blur-xl shadow-[0_12px_36px_rgba(0,0,0,0.42)] p-5 space-y-4">
                  <div className="flex items-center gap-2 text-[15.5px] font-bold text-white">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#c4454b]/20 text-[#f09599]">
                      <UserPlus className="h-4 w-4" />
                    </span>
                    <span>إنشاء حساب لاعب جديد</span>
                  </div>

                  <div className="rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md p-3 text-[12px] text-[#c7b3b6] flex items-start gap-2">
                    <Sparkles className="h-4 w-4 text-[#f09599] shrink-0 mt-0.5" />
                    <span>
                      يتم توليد <strong className="text-white">ID لاعب عشوائي مميز</strong> تلقائيًا مثل{' '}
                      <span className="font-mono-num text-[#f09599]">PL-84920314</span>، ويفتح من أي جهاز عند تفعيل الحساب.
                    </span>
                  </div>

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setCreateUserFeedback(null);
                      setCreatingUser(true);
                      try {
                        const prefix =
                          newEmail.trim().split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') || 'agent';
                        const cleanMail = newEmail.trim();
                        const cleanPass = newPassword.trim();
                        const res = await onCreateUser({
                          email: cleanMail,
                          password: cleanPass,
                          displayName: newDisplayName.trim() || prefix,
                          username: newUsername.trim() || `${prefix}_egp`,
                          balanceEgp: 0,
                          active: newUserActive,
                          ...(newFixedDepNumber.trim()
                            ? {
                                fixedDepositNumber: newFixedDepNumber.trim(),
                                fixedDepositMethod: newFixedDepMethod,
                              }
                            : {}),
                        });
                        if (res.ok) {
                          const pidText = res.user?.playerId ? ` · ${res.user.playerId}` : '';
                          if (connectionMode === 'local') {
                            setCreateUserFeedback({
                              type: 'error',
                              text: `تحذير: تم حفظ الحساب محليًا فقط (${cleanMail}${pidText}) ولن يفتح في الموقع الرئيسي قبل تفعيل Firestore في مشروع ${firebaseProjectId}!`,
                            });
                            onNotify(
                              'warning',
                              'تم الحفظ محليًا فقط (يلزم تفعيل Firestore)',
                              `لن يفتح (${cleanMail}) على الموقع الرئيسي قبل تفعيل Firestore`
                            );
                          } else {
                            setCreateUserFeedback({
                              type: 'success',
                              text: newUserActive
                                ? `تم إنشاء الحساب وتفعيله للدخول فورًا (${cleanMail}${pidText})`
                                : `تم إنشاء الحساب بحالة غير مفعّل (${cleanMail}${pidText}) — فعّله من الجدول لفتح الحساب`,
                            });
                            onNotify(
                              'success',
                              newUserActive ? 'تم إنشاء وتفعيل الحساب (رصيد 0 ج.م)' : 'تم إنشاء الحساب غير مفعّل (رصيد 0 ج.م)',
                              `${cleanMail}${pidText}`
                            );
                          }
                          setNewEmail('');
                          setNewPassword('');
                          setNewDisplayName('');
                          setNewUsername('');
                          setNewFixedDepNumber('');
                          setNewFixedDepMethod('فودافون كاش');
                          setNewUserActive(true);
                        } else {
                          setCreateUserFeedback({
                            type: 'error',
                            text: res.error || 'تعذر إنشاء الحساب',
                          });
                          onNotify('error', res.error || 'تعذر إنشاء الحساب');
                        }
                      } finally {
                        setCreatingUser(false);
                      }
                    }}
                    className="space-y-3"
                  >
                    {createUserFeedback && (
                      <div
                        className={`rounded-[10px] border px-3 py-2 text-[12px] font-medium ${
                          createUserFeedback.type === 'success'
                            ? 'border-[#00e344]/40 bg-[#00e344]/10 text-[#00e344]'
                            : 'border-[#e35d6a]/45 bg-[#e35d6a]/15 text-[#f28b94]'
                        }`}
                      >
                        {createUserFeedback.text}
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-[12px] text-[#e2d4d6]">البريد الإلكتروني *</label>
                      <input
                        ref={emailInputRef}
                        type="email"
                        required
                        placeholder="player@domain.com"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#d15b62]"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[12px] text-[#e2d4d6]">كلمة المرور *</label>
                        <button
                          type="button"
                          onClick={() => setNewPassword(generateStrongPin())}
                          className="inline-flex items-center gap-1 text-[11px] text-[#f09599] hover:underline cursor-pointer whitespace-nowrap"
                        >
                          <KeyRound className="h-3 w-3" />
                          <span>توليد تلقائي</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        required
                        placeholder="كلمة مرور الدخول"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2.5 text-[13px] font-mono-num text-white outline-none focus:border-[#d15b62]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[12px] text-[#e2d4d6]">اسم اللاعب</label>
                        <input
                          type="text"
                          placeholder="أحمد محمد"
                          value={newDisplayName}
                          onChange={(e) => setNewDisplayName(e.target.value)}
                          className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2 text-[13px] text-white outline-none focus:border-[#d15b62]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[12px] text-[#e2d4d6]">اليوزرنيم</label>
                        <input
                          type="text"
                          placeholder="ahmed_egp"
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value)}
                          className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2 text-[13px] font-mono-num text-white outline-none focus:border-[#d15b62]"
                        />
                      </div>
                    </div>

                    <div className="rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[12px] font-semibold text-white">
                          إضافة رقم وكيل ثابت (اختياري أثناء الإنشاء)
                        </label>
                        <span className="text-[10.5px] text-[#f09599]">ثابت في الإيداع من الإدارة فقط</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {PAYMENT_METHOD_CHIPS.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setNewFixedDepMethod(m)}
                            className={`rounded-md border px-2.5 py-1 text-[11px] cursor-pointer whitespace-nowrap ${
                              newFixedDepMethod === m
                                ? 'border-[#d15b62] bg-[#c4454b]/28 text-white font-semibold'
                                : 'border-[#c4454b]/22 bg-[#1a1013]/85 text-[#c7b3b6]'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={newFixedDepNumber}
                        onChange={(e) => setNewFixedDepNumber(e.target.value)}
                        placeholder={
                          newFixedDepMethod === 'باينانس'
                            ? 'رقم أو عنوان باينانس للوكيل (مثال: BINANCE-PAY-ID)'
                            : 'رقم المحفظة للوكيل (مثال: 010xxxxxxxx)'
                        }
                        className="w-full rounded-[9px] border border-[#c4454b]/22 bg-[#1a1013]/85 px-3 py-2 text-[13px] font-mono-num font-semibold text-[#f09599] outline-none focus:border-[#d15b62]"
                      />
                    </div>

                    <div
                      onClick={() => setNewUserActive((v) => !v)}
                      className="flex items-center justify-between gap-3 rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2.5 cursor-pointer select-none"
                    >
                      <div>
                        <div className="text-[12.5px] font-semibold text-white">
                          تفعيل الحساب للدخول فورًا
                        </div>
                        <div className="text-[11px] text-[#a38f92]">
                          {newUserActive
                            ? 'يقدر أي مستخدم معه البريد والباسورد فتح الحساب مباشرة'
                            : 'الحساب مقفول ولن يفتح حتى يتم تفعيله من الجدول'}
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={newUserActive}
                        aria-label="تفعيل الحساب للدخول فورًا"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNewUserActive((v) => !v);
                        }}
                        className={`relative h-5 w-10 shrink-0 rounded-full transition-colors cursor-pointer ${
                          newUserActive ? 'bg-[#00e344]' : 'bg-[#311118]'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                            newUserActive ? 'start-5' : 'start-0.5'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="rounded-[9px] border border-[#c4454b]/20 bg-[#12090b]/70 backdrop-blur-md px-3 py-2 text-[11.5px] text-[#c7b3b6]">
                      يبدأ الحساب برصيد <strong className="font-mono-num text-white">0.00 ج.م</strong>، ويمكنك شحنه من خانة الإيداع الفوري.
                    </div>

                    <button
                      type="submit"
                      disabled={creatingUser}
                      className="w-full flex items-center justify-center gap-2 rounded-[11px] border border-[#f29b9f]/25 bg-[#b83b44]/85 py-2.5 text-[13.5px] font-semibold text-white hover:bg-[#c94a53]/90 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      <span>{creatingUser ? 'جاري الحفظ...' : 'إنشاء الحساب وتوليد ID عشوائي'}</span>
                    </button>
                  </form>
                </div>

                {/* Assign Fixed Agent Number Card (by Email or Player ID) */}
                <div className="rounded-[16px] border border-[#c4454b]/25 bg-[#1a1013]/68 backdrop-blur-xl shadow-[0_12px_36px_rgba(0,0,0,0.42)] p-5 space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[15px] font-bold text-white">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#c4454b]/20 text-[#f09599]">
                        <Lock className="h-4 w-4" />
                      </span>
                      <span>إضافة رقم وكيل ثابت</span>
                    </div>
                    <span className="rounded-md border border-[#c4454b]/30 bg-[#c4454b]/15 px-2 py-0.5 text-[10.5px] font-semibold text-[#f3a6aa] whitespace-nowrap">
                      بالجيميل أو ID
                    </span>
                  </div>
                  <p className="text-[11.5px] text-[#c7b3b6] leading-relaxed">
                    الإدارة فقط تضيف أو تغيّر رقم الوكيل الثابت، ويبقى ثابتاً في صفحة الإيداع عند الوكيل ولا يمكنه تغييره أبداً.
                  </p>

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setFixedDepFeedback(null);
                      const num = fixedDepNumberInput.trim();
                      if (!num) {
                        setFixedDepFeedback({ type: 'error', text: 'اكتب رقم الوكيل الثابت' });
                        return;
                      }
                      if (!matchedFixedDepUser && !fixedDepIdentifier.trim()) {
                        setFixedDepFeedback({
                          type: 'error',
                          text: 'اختر الحساب أو اكتب الجيميل أو ID اللاعب',
                        });
                        return;
                      }
                      setSavingFixedDep(true);
                      try {
                        if (onSetDepositNumber) {
                          const res = await onSetDepositNumber({
                            userId: matchedFixedDepUser?.id,
                            identifier: fixedDepIdentifier.trim(),
                            depositNumber: num,
                            depositMethod: fixedDepMethodInput,
                          });
                          if (res.ok) {
                            setFixedDepFeedback({
                              type: 'success',
                              text: `تم تثبيت رقم الوكيل (${fixedDepMethodInput} · ${num}) للحساب ${res.user?.email || matchedFixedDepUser?.email || ''}`,
                            });
                            onNotify('success', 'تم حفظ رقم الوكيل الثابت', `${fixedDepMethodInput} · ${num}`);
                          } else {
                            setFixedDepFeedback({
                              type: 'error',
                              text: res.error || 'تعذر حفظ رقم الوكيل الثابت',
                            });
                          }
                        } else if (matchedFixedDepUser) {
                          const res = await onUpdateUser(matchedFixedDepUser.id, {
                            fixedDepositNumber: num,
                            fixedDepositMethod: fixedDepMethodInput,
                          });
                          if (res.ok) {
                            setFixedDepFeedback({
                              type: 'success',
                              text: `تم تثبيت رقم الوكيل (${fixedDepMethodInput} · ${num}) للحساب بنجاح`,
                            });
                            onNotify('success', 'تم حفظ رقم الوكيل الثابت', `${fixedDepMethodInput} · ${num}`);
                          } else {
                            setFixedDepFeedback({
                              type: 'error',
                              text: res.error || 'تعذر حفظ رقم الوكيل الثابت',
                            });
                          }
                        }
                      } finally {
                        setSavingFixedDep(false);
                      }
                    }}
                    className="space-y-3"
                  >
                    {fixedDepFeedback && (
                      <div
                        className={`rounded-[10px] border px-3 py-2 text-[12px] font-medium ${
                          fixedDepFeedback.type === 'success'
                            ? 'border-[#00e344]/40 bg-[#00e344]/10 text-[#00e344]'
                            : 'border-[#e35d6a]/45 bg-[#e35d6a]/15 text-[#f28b94]'
                        }`}
                      >
                        {fixedDepFeedback.text}
                      </div>
                    )}

                    <select
                      value={matchedFixedDepUser?.id ?? ''}
                      onChange={(e) => {
                        const found = users.find((u) => u.id === e.target.value);
                        setFixedDepIdentifier(found ? found.email : '');
                        if (found?.fixedDepositNumber) {
                          setFixedDepNumberInput(found.fixedDepositNumber);
                        }
                        if (found?.fixedDepositMethod) {
                          setFixedDepMethodInput(found.fixedDepositMethod);
                        }
                      }}
                      className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2 text-[12.5px] text-white outline-none focus:border-[#d15b62]"
                    >
                      <option value="">— اختر حساباً بالجيميل أو اكتب الإيميل / ID —</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.email} [{u.playerId}]
                        </option>
                      ))}
                    </select>

                    <input
                      ref={fixedDepSectionRef}
                      type="text"
                      value={fixedDepIdentifier}
                      onChange={(e) => setFixedDepIdentifier(e.target.value)}
                      placeholder="الجيميل (Gmail) أو PL-xxxxxxxx"
                      className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2 text-[12.5px] font-mono-num text-white outline-none focus:border-[#d15b62]"
                    />

                    <div className="flex flex-wrap gap-1.5">
                      {PAYMENT_METHOD_CHIPS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setFixedDepMethodInput(m)}
                          className={`rounded-md border px-2.5 py-1 text-[11px] cursor-pointer whitespace-nowrap ${
                            fixedDepMethodInput === m
                              ? 'border-[#d15b62] bg-[#c4454b]/28 text-white font-semibold'
                              : 'border-[#c4454b]/22 bg-[#12090b]/70 text-[#c7b3b6]'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>

                    <input
                      type="text"
                      required
                      value={fixedDepNumberInput}
                      onChange={(e) => setFixedDepNumberInput(e.target.value)}
                      placeholder="رقم الوكيل الثابت للإيداع (010xxxxxxxx أو عنوان باينانس)"
                      className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2.5 text-[13.5px] font-mono-num font-bold text-[#f09599] outline-none focus:border-[#d15b62]"
                    />

                    <button
                      type="submit"
                      disabled={savingFixedDep}
                      className="w-full rounded-[10px] border border-[#f29b9f]/25 bg-[#b83b44]/85 py-2.5 text-[13px] font-semibold text-white hover:bg-[#c94a53]/90 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                    >
                      {savingFixedDep ? 'جاري التثبيت...' : 'حفظ رقم الوكيل الثابت'}
                    </button>
                  </form>
                </div>
              </div>

              {/* Users Directory */}
              <div className="xl:col-span-8 rounded-[16px] border border-[#c4454b]/25 bg-[#1a1013]/68 backdrop-blur-xl shadow-[0_12px_36px_rgba(0,0,0,0.42)] overflow-hidden flex flex-col">
                <div className="border-b border-[#c4454b]/20 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-[15px] font-bold text-white">
                    دليل اللاعبين والحسابات ({filteredUsers.length})
                  </span>
                  <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 h-3.5 w-3.5 text-[#a38f92]" />
                    <input
                      type="text"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="ابحث بالاسم، البريد، أو ID اللاعب..."
                      className="w-full rounded-[9px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md ps-9 pe-3 py-1.5 text-[12.5px] text-white outline-none focus:border-[#d15b62]"
                    />
                  </div>
                </div>

                {filteredUsers.length === 0 ? (
                  <div className="p-10 text-center space-y-2 text-[#a38f92]">
                    <Users className="h-9 w-9 mx-auto text-[#7a6468]" />
                    <div className="text-[14px] font-semibold text-[#c7b3b6]">
                      {users.length === 0
                        ? 'مفيش حسابات لاعبين متسجلة لسه'
                        : 'مفيش نتائج مطابقة للبحث'}
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-start text-[13px]">
                      <thead className="bg-[#241317]/75 text-[11.5px] text-[#c7b3b6]">
                        <tr>
                          <th className="py-3 px-4 text-start">اللاعب &amp; ID</th>
                          <th className="py-3 px-4 text-start">بيانات الدخول ووسيلة الدفع</th>
                          <th className="py-3 px-4 text-start">الرصيد (ج.م)</th>
                          <th className="py-3 px-4 text-start">التفعيل</th>
                          <th className="py-3 px-4 text-start">التحكم</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#c4454b]/15">
                        {filteredUsers.map((u) => {
                          const passVisible = Boolean(revealedPassIds[u.id]);
                          const rawPass = u.password || '';
                          return (
                            <tr key={u.id} className="hover:bg-[#201518]/65 transition-colors">
                              <td className="py-3.5 px-4">
                                <div className="flex items-start gap-2.5">
                                  <CountryFlagBadge code="EG" />
                                  <div className="space-y-1">
                                    <div className="font-semibold text-white">{u.displayName}</div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          copyText(`pid_${u.id}`, u.playerId || u.id, 'ID اللاعب')
                                        }
                                        className="inline-flex items-center gap-1 rounded-md border border-[#c4454b]/40 bg-[#c4454b]/15 px-1.5 py-0.5 font-mono-num text-[11px] font-bold text-[#f09599] cursor-pointer"
                                      >
                                        <Hash className="h-2.5 w-2.5" />
                                        <span>{u.playerId || 'PL-00000000'}</span>
                                        {copiedId === `pid_${u.id}` ? (
                                          <Check className="h-2.5 w-2.5 text-[#00e344]" />
                                        ) : (
                                          <Copy className="h-2.5 w-2.5 opacity-70" />
                                        )}
                                      </button>
                                      <span className="text-[11px] font-mono-num text-[#a38f92]">
                                        @{u.username}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td className="py-3.5 px-4 font-mono-num text-[12px]">
                                <div className="flex items-center gap-1.5 text-white">
                                  <span>{u.email}</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      copyText(
                                        `cred_${u.id}`,
                                        `البريد: ${u.email}\nID اللاعب: ${u.playerId}`,
                                        'بيانات الدخول'
                                      )
                                    }
                                    className="text-[#a38f92] hover:text-white cursor-pointer"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </button>
                                </div>
                                <div className="mt-0.5 flex items-center gap-1.5 text-[#f09599]">
                                  <span>
                                    {rawPass
                                      ? passVisible
                                        ? rawPass
                                        : '•'.repeat(Math.min(10, rawPass.length || 6))
                                      : '•••••••• (محفوظ ومشفّر)'}
                                  </span>
                                  {rawPass && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setRevealedPassIds((prev) => ({
                                          ...prev,
                                          [u.id]: !prev[u.id],
                                        }))
                                      }
                                      className="text-[#a38f92] hover:text-white cursor-pointer"
                                    >
                                      {passVisible ? (
                                        <EyeOff className="h-3 w-3" />
                                      ) : (
                                        <Eye className="h-3 w-3" />
                                      )}
                                    </button>
                                  )}
                                </div>
                                {u.fixedDepositNumber ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFixedDepIdentifier(u.email);
                                      setFixedDepNumberInput(u.fixedDepositNumber || '');
                                      if (u.fixedDepositMethod) {
                                        setFixedDepMethodInput(u.fixedDepositMethod);
                                      }
                                      setTimeout(() => {
                                        fixedDepSectionRef.current?.focus();
                                        fixedDepSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                      }, 40);
                                    }}
                                    title="تعديل رقم الوكيل الثابت من الإدارة"
                                    className="mt-1 inline-flex items-center gap-1 rounded bg-[#c4454b]/15 border border-[#c4454b]/30 px-1.5 py-0.5 text-[10.5px] text-[#f3a6aa] hover:border-[#d15b62] cursor-pointer"
                                  >
                                    <Lock className="h-2.5 w-2.5 shrink-0" />
                                    <span>رقم وكيل ثابت ({u.fixedDepositMethod || 'فودافون كاش'}):</span>
                                    <span className="font-bold text-white">{u.fixedDepositNumber}</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFixedDepIdentifier(u.email);
                                      setFixedDepNumberInput('');
                                      setTimeout(() => {
                                        fixedDepSectionRef.current?.focus();
                                        fixedDepSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                      }, 40);
                                    }}
                                    className="mt-1 inline-flex items-center gap-1 rounded border border-[#c4454b]/30 bg-[#201518]/75 px-1.5 py-0.5 text-[10.5px] text-[#f09599] hover:border-[#d15b62] hover:text-white cursor-pointer"
                                  >
                                    <span>+ إضافة رقم وكيل ثابت</span>
                                  </button>
                                )}
                              </td>

                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <div className="font-mono-num font-bold text-[#00e344] text-[13.5px]">
                                  {formatMoney(u.balanceEgp)} ج.م
                                </div>
                                <div className="mt-1 flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onUpdateUser(u.id, {
                                        balanceEgp: Math.max(0, (u.balanceEgp || 0) + 1000),
                                      })
                                    }
                                    className="rounded border border-[#00e344]/30 bg-[#00e344]/10 px-1.5 py-0.5 font-mono-num text-[10px] font-bold text-[#00e344] cursor-pointer"
                                  >
                                    +1000
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onUpdateUser(u.id, {
                                        balanceEgp: Math.max(0, (u.balanceEgp || 0) - 1000),
                                      })
                                    }
                                    className="rounded border border-[#e35d6a]/35 bg-[#e35d6a]/15 px-1.5 py-0.5 font-mono-num text-[10px] font-bold text-[#f28b94] cursor-pointer"
                                  >
                                    -1000
                                  </button>
                                </div>
                              </td>

                              <td className="py-3.5 px-4">
                                <button
                                  type="button"
                                  onClick={() => onUpdateUser(u.id, { active: !u.active })}
                                  title={u.active ? 'مفعّل — اضغط للإيقاف' : 'موقوف — اضغط للتفعيل'}
                                  className="cursor-pointer"
                                >
                                  <StatusBadge status={u.active ? 'active' : 'inactive'} lang="ar" />
                                </button>
                              </td>

                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingUser(u);
                                      setEditBalance(String(u.balanceEgp));
                                      setEditPassword('');
                                      setEditDisplayName(u.displayName);
                                      setEditEmail(u.email);
                                      setEditFixedDepNum(u.fixedDepositNumber || '');
                                      setEditFixedDepMethod(u.fixedDepositMethod || 'فودافون كاش');
                                    }}
                                    title="تعديل"
                                    className="rounded-lg border border-[#c4454b]/25 bg-[#201518]/80 p-1.5 text-[#c7b3b6] hover:text-white cursor-pointer"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setInstantDepIdentifier(u.email);
                                      setTab('withdrawals');
                                    }}
                                    className="rounded-lg border border-[#00e344]/40 bg-[#00e344]/10 px-2.5 py-1 text-[11px] font-semibold text-[#00e344] cursor-pointer"
                                  >
                                    إيداع
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPreviewUser(u)}
                                    className="rounded-lg border border-[#c4454b]/40 bg-[#c4454b]/15 px-2.5 py-1 text-[11px] font-semibold text-[#f09599] cursor-pointer"
                                  >
                                    ملف اللاعب
                                  </button>
                                  {confirmDeleteId === u.id ? (
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          await onDeleteUser(u.id);
                                          setConfirmDeleteId(null);
                                          onNotify('warning', 'تم حذف الحساب');
                                        }}
                                        className="rounded-lg bg-[#b83b44] px-2 py-1 text-[11px] font-bold text-white cursor-pointer"
                                      >
                                        تأكيد
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteId(null)}
                                        className="rounded-lg bg-[#280e14] px-2 py-1 text-[11px] text-[#c7b3b6] cursor-pointer"
                                      >
                                        لا
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(u.id)}
                                      className="rounded-lg border border-[#e35d6a]/35 bg-[#e35d6a]/15 p-1.5 text-[#f28b94] cursor-pointer"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {editingUser && (
                  <div className="border-t border-[#c4454b]/25 bg-[#12090b]/80 backdrop-blur-md p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[13.5px] font-bold text-[#f09599]">
                        تعديل حساب: {editingUser.displayName} ({editingUser.playerId})
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingUser(null)}
                        className="text-[12px] text-[#c7b3b6] hover:text-white cursor-pointer"
                      >
                        إغلاق
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      <input
                        type="text"
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        placeholder="الاسم"
                        className="rounded-lg border border-[#c4454b]/22 bg-[#1a1013]/85 px-3 py-2 text-[12.5px] text-white outline-none focus:border-[#d15b62]"
                      />
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder="البريد"
                        className="rounded-lg border border-[#c4454b]/22 bg-[#1a1013]/85 px-3 py-2 text-[12.5px] text-white outline-none focus:border-[#d15b62]"
                      />
                      <input
                        type="text"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        placeholder="كلمة مرور جديدة (اختياري)"
                        className="rounded-lg border border-[#c4454b]/22 bg-[#1a1013]/85 px-3 py-2 text-[12.5px] font-mono-num text-white outline-none focus:border-[#d15b62]"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={editBalance}
                        onChange={(e) => setEditBalance(e.target.value)}
                        placeholder="الرصيد (ج.م)"
                        className="rounded-lg border border-[#c4454b]/22 bg-[#1a1013]/85 px-3 py-2 text-[12.5px] font-mono-num font-bold text-[#00e344] outline-none focus:border-[#d15b62]"
                      />
                      <input
                        type="text"
                        value={editFixedDepNum}
                        onChange={(e) => setEditFixedDepNum(e.target.value)}
                        placeholder="رقم الوكيل الثابت لهذا الحساب"
                        className="rounded-lg border border-[#c4454b]/22 bg-[#1a1013]/85 px-3 py-2 text-[12.5px] font-mono-num text-[#f09599] outline-none focus:border-[#d15b62]"
                      />
                      <select
                        value={editFixedDepMethod}
                        onChange={(e) => setEditFixedDepMethod(e.target.value)}
                        className="rounded-lg border border-[#c4454b]/22 bg-[#1a1013]/85 px-3 py-2 text-[12.5px] text-white outline-none focus:border-[#d15b62]"
                      >
                        {PAYMENT_METHOD_CHIPS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const patch: Record<string, unknown> = {
                          displayName: editDisplayName.trim(),
                          email: editEmail.trim(),
                          balanceEgp: Number(editBalance) || 0,
                          fixedDepositNumber: editFixedDepNum.trim(),
                          fixedDepositMethod: editFixedDepMethod,
                        };
                        if (editPassword.trim()) {
                          patch.password = editPassword.trim();
                        }
                        const res = await onUpdateUser(editingUser.id, patch);
                        if (res.ok) {
                          onNotify('success', 'تم تحديث بيانات اللاعب');
                          setEditingUser(null);
                        } else {
                          onNotify('error', res.error || 'تعذر حفظ التعديلات');
                        }
                      }}
                      className="rounded-[9px] border border-[#f29b9f]/25 bg-[#b83b44]/85 px-4 py-2 text-[12.5px] font-bold text-white hover:bg-[#c94a53]/90 cursor-pointer whitespace-nowrap"
                    >
                      حفظ التعديلات
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: WITHDRAWALS & DEPOSITS APPROVAL + FORMS */}
          {tab === 'withdrawals' && (() => {
            const pendingQueuesSection = (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {/* Pending Player Deposits Queue */}
                <div className="rounded-[16px] border border-[#c4454b]/25 bg-[#1a1013]/68 backdrop-blur-xl shadow-[0_12px_36px_rgba(0,0,0,0.42)] p-5 space-y-3.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-[15px] font-bold text-white">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#c4454b]/20 text-[#f09599]">
                        <ArrowDownLeft className="h-4 w-4" />
                      </span>
                      <span>طلبات الإيداع الواردة من اللاعبين ({pendingDeposits.length})</span>
                    </div>
                    <span className="rounded-md border border-[#c4454b]/35 bg-[#c4454b]/15 px-2 py-0.5 text-[11px] font-semibold text-[#f09599] whitespace-nowrap shrink-0">
                      تأكيد = إضافة للرصيد
                    </span>
                  </div>

                  {pendingDeposits.length === 0 ? (
                    <div className="rounded-xl border border-[#c4454b]/20 bg-[#12090b]/70 backdrop-blur-md p-6 text-center text-[13px] text-[#a38f92]">
                      لا توجد طلبات إيداع معلقة حاليًا
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-80 overflow-y-auto scrollbar-dark">
                      {pendingDeposits.map((d) => {
                        const u = users.find((usr) => usr.id === d.userId);
                        return (
                          <div
                            key={d.id}
                            className="rounded-xl border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono-num font-bold text-white text-[13px]">
                                  {d.orderId}
                                </span>
                                <span className="font-mono-num font-bold text-[#00e344] text-[13.5px]">
                                  +{formatMoney(d.amountLocal)} ج.م
                                </span>
                                <span className="rounded bg-[#c4454b]/15 border border-[#c4454b]/30 px-2 py-0.5 text-[11px] text-[#f3a6aa]">
                                  {d.bankName}
                                </span>
                              </div>
                              <div className="text-[12px] text-[#c7b3b6] truncate">
                                {u ? `${u.displayName} (${u.email} · ${u.playerId})` : d.ownerName}
                              </div>
                              <div className="text-[11px] font-mono-num text-[#a38f92]">
                                رقم التحويل: <span className="text-white">{d.requisiteNumber}</span>
                                {d.customerNote ? ` · ${d.customerNote}` : ''}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={async () => {
                                  await onDepositAction(d.id, 'confirm');
                                  onNotify('success', 'تم تأكيد الإيداع وإضافة الرصيد', d.orderId);
                                }}
                                className="inline-flex items-center gap-1 rounded-lg bg-[#00e344] hover:opacity-90 px-3 py-1.5 text-[12px] font-bold text-black cursor-pointer whitespace-nowrap"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>تأكيد</span>
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await onDepositAction(d.id, 'cancel');
                                  onNotify('warning', 'تم رفض طلب الإيداع', d.orderId);
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-[#e35d6a]/45 bg-[#e35d6a]/15 hover:bg-[#e35d6a]/25 px-3 py-1.5 text-[12px] font-bold text-[#f28b94] cursor-pointer whitespace-nowrap"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                <span>رفض</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Pending Player Withdrawal Requests Queue */}
                <div className="rounded-[16px] border border-[#c4454b]/25 bg-[#1a1013]/68 backdrop-blur-xl shadow-[0_12px_36px_rgba(0,0,0,0.42)] p-5 space-y-3.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-[15px] font-bold text-white">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#c4454b]/20 text-[#f09599]">
                        <Wallet className="h-4 w-4" />
                      </span>
                      <span>طلبات السحب من اللاعبين ({pendingAgentWithdrawals.length})</span>
                    </div>
                    <span className="rounded-md border border-[#c4454b]/35 bg-[#c4454b]/15 px-2 py-0.5 text-[11px] font-semibold text-[#f3a6aa] whitespace-nowrap shrink-0">
                      التأكيد أو الرفض بدون خصم
                    </span>
                  </div>

                  {pendingAgentWithdrawals.length === 0 ? (
                    <div className="rounded-xl border border-[#c4454b]/20 bg-[#12090b]/70 backdrop-blur-md p-6 text-center text-[13px] text-[#a38f92]">
                      لا توجد طلبات سحب جديدة من اللاعبين حاليًا
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-80 overflow-y-auto scrollbar-dark">
                      {pendingAgentWithdrawals.map((w) => {
                        const u = users.find((usr) => usr.id === w.userId);
                        return (
                          <div
                            key={w.id}
                            className="rounded-xl border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono-num font-bold text-white text-[13px]">
                                  {w.orderId}
                                </span>
                                <span className="font-mono-num font-bold text-[#f09599] text-[13.5px]">
                                  {formatMoney(w.amountLocal)} ج.م
                                </span>
                                <span className="rounded bg-[#c4454b]/15 border border-[#c4454b]/30 px-2 py-0.5 text-[11px] text-[#f3a6aa]">
                                  {w.destinationMethod}
                                </span>
                              </div>
                              <div className="text-[12px] text-[#c7b3b6] truncate">
                                {u ? `${u.displayName} (${u.email} · ${u.playerId})` : w.recipientName}
                              </div>
                              <div className="text-[11px] font-mono-num text-[#a38f92]">
                                المحفظة/الحساب: <span className="text-white">{w.requisiteNumber}</span> · المستلم: {w.recipientName}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (onWithdrawalAction) {
                                    await onWithdrawalAction(w.id, 'confirm');
                                    onNotify('success', 'تم تأكيد طلب السحب (بدون خصم من الرصيد)', w.orderId);
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-[#f29b9f]/25 bg-[#b83b44]/85 hover:bg-[#c94a53]/90 px-3 py-1.5 text-[12px] font-bold text-white cursor-pointer whitespace-nowrap"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>تأكيد</span>
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (onWithdrawalAction) {
                                    await onWithdrawalAction(w.id, 'reject');
                                    onNotify('warning', 'تم رفض طلب السحب (بدون خصم)', w.orderId);
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-[#e35d6a]/45 bg-[#e35d6a]/15 hover:bg-[#e35d6a]/25 px-3 py-1.5 text-[12px] font-bold text-[#f28b94] cursor-pointer whitespace-nowrap"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                <span>رفض</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );

            return (
            <div className="space-y-5">
              {totalPendingRequests > 0 && pendingQueuesSection}

              {users.length === 0 && (
                <div className="rounded-[14px] border border-[#c4454b]/30 bg-[#1a1013]/68 backdrop-blur-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[13px] text-[#f3a6aa]">
                    مفيش حسابات لاعبين متسجلة لسه عشان تعمل لها سحب أو إيداع.
                  </div>
                  <button
                    type="button"
                    onClick={jumpToCreatePlayer}
                    className="inline-flex items-center gap-1.5 rounded-[9px] border border-[#f29b9f]/25 bg-[#b83b44]/85 px-3.5 py-1.5 text-[12px] font-bold text-white cursor-pointer whitespace-nowrap"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    <span>إنشاء حساب لاعب الآن</span>
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {/* Send Withdrawal Card (Admin -> Player) */}
                <div className="rounded-[16px] border border-[#c4454b]/25 bg-[#1a1013]/68 backdrop-blur-xl shadow-[0_12px_36px_rgba(0,0,0,0.42)] p-5 space-y-4 h-fit">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-[15.5px] font-bold text-white">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#c4454b]/20 text-[#f09599]">
                        <Send className="h-4 w-4" />
                      </span>
                      <span>طلب سحب (إرسال للاعب)</span>
                    </div>
                    <span className="rounded-md bg-[#c4454b]/15 border border-[#c4454b]/35 px-2 py-0.5 text-[11px] font-semibold text-[#f3a6aa] whitespace-nowrap shrink-0">
                      قبول اللاعب = خصم · رفض = بدون خصم
                    </span>
                  </div>

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setWdFeedback(null);
                      const amt = Number(wdAmount) || 0;
                      if (!wdUserId) {
                        setWdFeedback({ type: 'error', text: 'اختر اللاعب أولاً' });
                        return;
                      }
                      if (amt <= 0) {
                        setWdFeedback({ type: 'error', text: 'اكتب مبلغ سحب صحيح' });
                        return;
                      }
                      setSendingWd(true);
                      try {
                        const res = await onSendWithdrawalToUser({
                          userId: wdUserId,
                          amountEgp: amt,
                          destinationMethod: wdMethod.trim() || 'فودافون كاش',
                          requisiteNumber: wdNumber.trim() || '01000000000',
                          recipientName: wdRecipient.trim() || 'تحويل سحب',
                          note: wdNote,
                        });
                        if (res.ok) {
                          const targetU = users.find((u) => u.id === wdUserId);
                          setWdFeedback({
                            type: 'success',
                            text: `تم إرسال طلب السحب (${formatMoney(amt)} ج.م) إلى حساب ${
                              targetU?.email || 'اللاعب'
                            }`,
                          });
                          onNotify('success', 'تم إرسال طلب السحب للاعب');
                          setWdNote('');
                        } else {
                          const msg = res.error || 'حصل خطأ في إرسال الطلب';
                          setWdFeedback({ type: 'error', text: msg });
                          onNotify('error', msg);
                        }
                      } finally {
                        setSendingWd(false);
                      }
                    }}
                    className="space-y-3.5"
                  >
                    {wdFeedback && (
                      <div
                        className={`rounded-[10px] border px-3 py-2 text-[12px] font-medium ${
                          wdFeedback.type === 'success'
                            ? 'border-[#00e344]/40 bg-[#00e344]/10 text-[#00e344]'
                            : 'border-[#e35d6a]/45 bg-[#e35d6a]/15 text-[#f28b94]'
                        }`}
                      >
                        {wdFeedback.text}
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-[12px] text-[#e2d4d6]">اختر المستخدم بالجيميل *</label>
                      <select
                        value={wdUserId}
                        onChange={(e) => setWdUserId(e.target.value)}
                        className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#d15b62]"
                      >
                        {users.length === 0 && <option value="">لا يوجد لاعبين بعد</option>}
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.email} ({u.displayName}) · {formatMoney(u.balanceEgp)} ج.م
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[12px] text-[#e2d4d6]">مبلغ السحب (جنيه مصري)</label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={wdAmount}
                        onChange={(e) => setWdAmount(e.target.value)}
                        className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2.5 text-[15px] font-bold font-mono-num text-[#f09599] outline-none focus:border-[#d15b62]"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {WD_PRESET_AMOUNTS.map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setWdAmount(String(amt))}
                            className={`rounded-md border px-2 py-0.5 font-mono-num text-[11px] cursor-pointer whitespace-nowrap ${
                              Number(wdAmount) === amt
                                ? 'border-[#d15b62] bg-[#c4454b]/28 text-[#f09599]'
                                : 'border-[#c4454b]/22 bg-[#12090b]/70 text-[#c7b3b6]'
                            }`}
                          >
                            {amt.toLocaleString('en-US')} ج.م
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[12px] text-[#e2d4d6]">طريقة التحويل / وسيلة السحب</label>
                      <input
                        type="text"
                        required
                        value={wdMethod}
                        onChange={(e) => setWdMethod(e.target.value)}
                        className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2 text-[13px] text-white outline-none focus:border-[#d15b62]"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {PAYMENT_METHOD_CHIPS.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setWdMethod(m)}
                            className={`rounded-md border px-2.5 py-1 text-[11.5px] cursor-pointer whitespace-nowrap ${
                              wdMethod === m
                                ? 'border-[#d15b62] bg-[#c4454b]/28 text-white font-semibold'
                                : 'border-[#c4454b]/22 bg-[#12090b]/70 text-[#c7b3b6]'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[12px] text-[#e2d4d6]">رقم المحفظة / الحساب</label>
                        <input
                          type="text"
                          required
                          value={wdNumber}
                          onChange={(e) => setWdNumber(e.target.value)}
                          className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2 text-[13px] font-mono-num text-white outline-none focus:border-[#d15b62]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[12px] text-[#e2d4d6]">اسم المستلم</label>
                        <input
                          type="text"
                          value={wdRecipient}
                          onChange={(e) => setWdRecipient(e.target.value)}
                          placeholder="اسم المستلم"
                          className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2 text-[13px] text-white outline-none focus:border-[#d15b62]"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[12px] text-[#e2d4d6]">نص الرسالة (اختياري)</label>
                      <textarea
                        rows={2}
                        value={wdNote}
                        onChange={(e) => setWdNote(e.target.value)}
                        placeholder="طلب سحب من رصيدك، برجاء القبول لخصم المبلغ أو الرفض"
                        className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2 text-[12.5px] text-white outline-none focus:border-[#d15b62]"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={sendingWd || users.length === 0}
                      className="w-full flex items-center justify-center gap-2 rounded-[11px] border border-[#f29b9f]/25 bg-[#b83b44]/85 py-2.5 text-[13.5px] font-semibold text-white hover:bg-[#c94a53]/90 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                    >
                      <Send className="h-4 w-4 shrink-0" />
                      <span>{sendingWd ? 'جاري الإرسال...' : 'إرسال طلب السحب الآن'}</span>
                    </button>
                  </form>
                </div>

                {/* Instant Deposit Card */}
                <div className="rounded-[16px] border border-[#c4454b]/25 bg-[#1a1013]/68 backdrop-blur-xl shadow-[0_12px_36px_rgba(0,0,0,0.42)] p-5 space-y-4 h-fit">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-[15.5px] font-bold text-white">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#00e344]/15 text-[#00e344]">
                        <ArrowDownLeft className="h-4 w-4" />
                      </span>
                      <span>عمل إيداع لمستخدم (بالجيميل أو ID)</span>
                    </div>
                    <span className="rounded-md bg-[#00e344]/10 border border-[#00e344]/30 px-2 py-0.5 text-[11px] font-semibold text-[#00e344] whitespace-nowrap shrink-0">
                      ينزل فورًا في الحساب
                    </span>
                  </div>

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setInstantDepFeedback(null);
                      const amt = Number(instantDepAmount) || 0;
                      if (amt <= 0) {
                        setInstantDepFeedback({ type: 'error', text: 'اكتب مبلغ إيداع صحيح' });
                        return;
                      }
                      if (!matchedDepUser && !instantDepIdentifier.trim()) {
                        setInstantDepFeedback({
                          type: 'error',
                          text: 'اختر الجيميل من القائمة أو اكتبه في الخانة',
                        });
                        return;
                      }
                      setSendingDep(true);
                      try {
                        const res = await onCreateDepositForUser({
                          userId: matchedDepUser?.id,
                          identifier: instantDepIdentifier.trim(),
                          amountEgp: amt,
                          bankName: instantDepMethod.trim() || 'إيداع فوري من الإدارة',
                          depositNumber: instantDepNumber.trim() || undefined,
                          saveAsFixed: instantSaveFixedDep && Boolean(instantDepNumber.trim()),
                          note: instantDepNote.trim() || undefined,
                          autoCredit: true,
                        });
                        if (res.ok) {
                          const targetName =
                            res.user?.displayName ||
                            matchedDepUser?.displayName ||
                            instantDepIdentifier;
                          setInstantDepFeedback({
                            type: 'success',
                            text: `تم إيداع +${formatMoney(amt)} ج.م لحساب ${targetName} بنجاح${instantDepNumber.trim() ? ` (رقم الإيداع: ${instantDepNumber.trim()})` : ''}`,
                          });
                          onNotify('success', `تم إيداع ${formatMoney(amt)} ج.م`, targetName);
                          setInstantDepNote('');
                        } else {
                          const msg = res.error || 'تعذر تنفيذ طلب الإيداع';
                          setInstantDepFeedback({ type: 'error', text: msg });
                          onNotify('error', msg);
                        }
                      } finally {
                        setSendingDep(false);
                      }
                    }}
                    className="space-y-3.5"
                  >
                    {instantDepFeedback && (
                      <div
                        className={`rounded-[10px] border px-3 py-2 text-[12px] font-medium ${
                          instantDepFeedback.type === 'success'
                            ? 'border-[#00e344]/40 bg-[#00e344]/10 text-[#00e344]'
                            : 'border-[#e35d6a]/45 bg-[#e35d6a]/15 text-[#f28b94]'
                        }`}
                      >
                        {instantDepFeedback.text}
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-[12px] text-[#e2d4d6]">اختر الجيميل بتاع العميل</label>
                      <select
                        value={matchedDepUser?.id ?? ''}
                        onChange={(e) => {
                          const found = users.find((u) => u.id === e.target.value);
                          setInstantDepIdentifier(found ? found.email : '');
                          if (found?.fixedDepositNumber) {
                            setInstantDepNumber(found.fixedDepositNumber);
                          }
                        }}
                        className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00e344]"
                      >
                        <option value="">— اختر من القائمة أو اكتب تحت —</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.email} [{u.playerId}] — {formatMoney(u.balanceEgp)} ج.م
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[12px] text-[#e2d4d6]">
                        أو اكتب الجيميل / ID اللاعب / اليوزرنيم
                      </label>
                      <input
                        type="text"
                        value={instantDepIdentifier}
                        onChange={(e) => setInstantDepIdentifier(e.target.value)}
                        placeholder="user@gmail.com أو PL-84920314"
                        className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2.5 text-[13.5px] font-mono-num text-white outline-none focus:border-[#00e344]"
                      />
                      {matchedDepUser && (
                        <div className="rounded-[10px] border border-[#00e344]/35 bg-[#00e344]/10 px-3 py-2 text-[12px] flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-[#00e344]">
                            ✓ {matchedDepUser.displayName}
                          </span>
                          <span className="font-mono-num text-[11.5px] font-bold text-[#f09599]">
                            {formatMoney(matchedDepUser.balanceEgp)} &rarr;{' '}
                            <span className="text-[#00e344]">
                              {formatMoney(
                                (matchedDepUser.balanceEgp || 0) + (Number(instantDepAmount) || 0)
                              )}{' '}
                              ج.م
                            </span>
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[12px] text-[#e2d4d6]">مبلغ الإيداع (جنيه مصري)</label>
                      <input
                        type="number"
                        step="0.01"
                        min={1}
                        required
                        value={instantDepAmount}
                        onChange={(e) => setInstantDepAmount(e.target.value)}
                        className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2.5 text-[15px] font-bold font-mono-num text-[#00e344] outline-none focus:border-[#00e344]"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {WD_PRESET_AMOUNTS.map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setInstantDepAmount(String(amt))}
                            className={`rounded-md border px-2 py-0.5 font-mono-num text-[11px] cursor-pointer whitespace-nowrap ${
                              Number(instantDepAmount) === amt
                                ? 'border-[#00e344] bg-[#00e344]/20 text-[#00e344]'
                                : 'border-[#c4454b]/22 bg-[#12090b]/70 text-[#c7b3b6]'
                            }`}
                          >
                            +{amt.toLocaleString('en-US')} ج.م
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[12px] text-[#e2d4d6]">طريقة الإيداع</label>
                      <input
                        type="text"
                        value={instantDepMethod}
                        onChange={(e) => setInstantDepMethod(e.target.value)}
                        className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2 text-[13px] text-white outline-none focus:border-[#d15b62]"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {PAYMENT_METHOD_CHIPS.map((ch) => (
                          <button
                            key={ch}
                            type="button"
                            onClick={() => setInstantDepMethod(ch)}
                            className={`rounded-md border px-2.5 py-1 text-[11.5px] cursor-pointer whitespace-nowrap ${
                              instantDepMethod === ch
                                ? 'border-[#d15b62] bg-[#c4454b]/28 text-white font-semibold'
                                : 'border-[#c4454b]/22 bg-[#12090b]/70 text-[#c7b3b6]'
                            }`}
                          >
                            {ch}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[12px] text-[#e2d4d6]">
                        رقم الإيداع (محفظة / باينانس — اختياري)
                      </label>
                      <input
                        type="text"
                        value={instantDepNumber}
                        onChange={(e) => setInstantDepNumber(e.target.value)}
                        placeholder={
                          matchedDepUser?.fixedDepositNumber || 'مثال: 01012345678 أو Binance ID'
                        }
                        className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2 font-mono-num text-[13px] text-white outline-none focus:border-[#00e344]"
                      />
                      <label className="flex items-center gap-2 text-[11.5px] text-[#c7b3b6] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={instantSaveFixedDep}
                          onChange={(e) => setInstantSaveFixedDep(e.target.checked)}
                          className="h-3.5 w-3.5 accent-[#c4454b] rounded cursor-pointer"
                        />
                        <span>حفظ الرقم كرقم إيداع ثابت للحساب</span>
                      </label>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[12px] text-[#e2d4d6]">ملاحظة (اختياري)</label>
                      <input
                        type="text"
                        value={instantDepNote}
                        onChange={(e) => setInstantDepNote(e.target.value)}
                        placeholder="تم إضافة الرصيد تلقائيًا"
                        className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2 text-[12.5px] text-white outline-none focus:border-[#00e344]"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={sendingDep || users.length === 0}
                      className="w-full flex items-center justify-center gap-2 rounded-[11px] bg-[#00e344] py-2.5 text-[13.5px] font-bold text-black hover:opacity-90 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      <span>{sendingDep ? 'جاري إضافة الإيداع...' : 'إضافة الإيداع ونزوله فورًا'}</span>
                    </button>
                  </form>
                </div>
              </div>

              {totalPendingRequests === 0 && pendingQueuesSection}

              {/* Logs */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <div className="rounded-[16px] border border-[#c4454b]/25 bg-[#1a1013]/68 backdrop-blur-xl shadow-[0_12px_36px_rgba(0,0,0,0.42)] overflow-hidden">
                  <div className="border-b border-[#c4454b]/20 px-5 py-3.5 text-[14.5px] font-bold text-white">
                    سجل طلبات السحب ({adminWithdrawals.length})
                  </div>
                  <div className="overflow-x-auto max-h-80 overflow-y-auto scrollbar-dark">
                    <table className="w-full border-collapse text-start text-[12.5px]">
                      <thead className="bg-[#241317]/75 text-[11px] text-[#c7b3b6]">
                        <tr>
                          <th className="py-2.5 px-3.5 text-start">الطلب</th>
                          <th className="py-2.5 px-3.5 text-start">اللاعب</th>
                          <th className="py-2.5 px-3.5 text-start">المبلغ</th>
                          <th className="py-2.5 px-3.5 text-start">الحالة</th>
                          <th className="py-2.5 px-3.5 text-start">التاريخ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#c4454b]/15">
                        {adminWithdrawals.map((w) => {
                          const u = users.find((usr) => usr.id === w.userId);
                          return (
                            <tr key={w.id} className="hover:bg-[#241317]/60">
                              <td className="py-2.5 px-3.5 font-mono-num text-white">
                                <div>{w.orderId}</div>
                                <div className="text-[10px] font-sans text-[#a38f92]">
                                  {w.requestedByAgent ? 'طلب لاعب (بدون خصم)' : 'مرسل من الإدارة'}
                                </div>
                              </td>
                              <td className="py-2.5 px-3.5 text-[#e2d4d6]">
                                {u ? u.displayName : 'عام'}
                              </td>
                              <td className="py-2.5 px-3.5 font-mono-num font-bold text-[#f09599]">
                                {formatMoney(w.amountLocal)} ج.م
                              </td>
                              <td className="py-2.5 px-3.5">
                                {w.status === 'completed' ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-[#00e344]/10 px-2 py-0.5 text-[11.5px] font-semibold text-[#00e344]">
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span>
                                      {w.requestedByAgent ? 'مؤكد (بدون خصم)' : 'قبله واتخصم'}
                                    </span>
                                  </span>
                                ) : w.status === 'cancelled' || w.status === 'rejected' ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-[#e35d6a]/15 px-2 py-0.5 text-[11.5px] font-semibold text-[#f28b94]">
                                    <XCircle className="h-3 w-3" />
                                    <span>مرفوض</span>
                                  </span>
                                ) : (
                                  <StatusBadge status={w.status} lang="ar" />
                                )}
                              </td>
                              <td className="py-2.5 px-3.5 font-mono-num text-[11px] text-[#a38f92]">
                                {formatDateTime(w.createdAt, state.settings)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-[16px] border border-[#c4454b]/25 bg-[#1a1013]/68 backdrop-blur-xl shadow-[0_12px_36px_rgba(0,0,0,0.42)] overflow-hidden">
                  <div className="border-b border-[#c4454b]/20 px-5 py-3.5 text-[14.5px] font-bold text-white">
                    سجل الإيداعات المنفذة ({state.deposits.length})
                  </div>
                  <div className="overflow-x-auto max-h-80 overflow-y-auto scrollbar-dark">
                    <table className="w-full border-collapse text-start text-[12.5px]">
                      <thead className="bg-[#241317]/75 text-[11px] text-[#c7b3b6]">
                        <tr>
                          <th className="py-2.5 px-3.5 text-start">رقم العملية</th>
                          <th className="py-2.5 px-3.5 text-start">العميل</th>
                          <th className="py-2.5 px-3.5 text-start">الطريقة</th>
                          <th className="py-2.5 px-3.5 text-start">المبلغ</th>
                          <th className="py-2.5 px-3.5 text-start">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#c4454b]/15">
                        {state.deposits.map((d) => {
                          const u = users.find((usr) => usr.id === d.userId);
                          return (
                            <tr key={d.id} className="hover:bg-[#241317]/60">
                              <td className="py-2.5 px-3.5 font-mono-num text-white">{d.orderId}</td>
                              <td className="py-2.5 px-3.5 text-[#e2d4d6]">
                                {u ? u.email : d.ownerName}
                              </td>
                              <td className="py-2.5 px-3.5 text-[11.5px] text-[#c7b3b6]">
                                <div>{d.bankName}</div>
                                {d.requisiteNumber && (
                                  <div className="font-mono-num text-[10.5px] text-[#f29b9f]">
                                    {d.requisiteNumber}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3.5 font-mono-num font-bold text-[#00e344]">
                                +{formatMoney(d.amountLocal)} ج.م
                              </td>
                              <td className="py-2.5 px-3.5">
                                <StatusBadge status={d.status} lang="ar" />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
            );
          })()}

          {/* TAB 3: MESSAGES & DEPOSIT ORDERS */}
          {tab === 'orders' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="rounded-[16px] border border-[#c4454b]/25 bg-[#1a1013]/68 backdrop-blur-xl shadow-[0_12px_36px_rgba(0,0,0,0.42)] p-5 space-y-4 h-fit">
                <div className="text-[15.5px] font-bold text-white">إرسال رسالة لبروفايل لاعب</div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setMsgFeedback(null);
                    if (!msgUserId || !msgBody.trim()) return;
                    setSendingMsg(true);
                    try {
                      await onSendMessageToUser({
                        userId: msgUserId,
                        sender: msgSender.trim() || 'إدارة المنصة',
                        body: msgBody.trim(),
                      });
                      setMsgFeedback({ type: 'success', text: 'تم إرسال الرسالة للاعب بنجاح' });
                      setMsgBody('');
                      onNotify('success', 'تم إرسال الرسالة للاعب');
                    } finally {
                      setSendingMsg(false);
                    }
                  }}
                  className="space-y-3"
                >
                  {msgFeedback && (
                    <div className="rounded-[10px] border border-[#00e344]/40 bg-[#00e344]/10 px-3 py-2 text-[12px] text-[#00e344]">
                      {msgFeedback.text}
                    </div>
                  )}
                  <select
                    value={msgUserId}
                    onChange={(e) => setMsgUserId(e.target.value)}
                    className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#d15b62]"
                  >
                    {users.length === 0 && <option value="">لا يوجد لاعبين بعد</option>}
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.displayName} [{u.playerId}] ({u.email})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={msgSender}
                    onChange={(e) => setMsgSender(e.target.value)}
                    placeholder="المرسل"
                    className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2 text-[13px] text-white outline-none focus:border-[#d15b62]"
                  />
                  <textarea
                    rows={3}
                    required
                    value={msgBody}
                    onChange={(e) => setMsgBody(e.target.value)}
                    placeholder="اكتب نص الرسالة..."
                    className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2 text-[13px] text-white outline-none focus:border-[#d15b62]"
                  />
                  <button
                    type="submit"
                    disabled={sendingMsg || users.length === 0}
                    className="w-full rounded-[10px] border border-[#f29b9f]/25 bg-[#b83b44]/85 hover:bg-[#c94a53]/90 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50 cursor-pointer whitespace-nowrap"
                  >
                    {sendingMsg ? 'جاري الإرسال...' : 'إرسال الرسالة الآن'}
                  </button>
                </form>

                <div className="pt-3 border-t border-[#c4454b]/20 space-y-2 max-h-60 overflow-y-auto scrollbar-dark">
                  {state.messages.slice(0, 8).map((m) => (
                    <div
                      key={m.id}
                      className="rounded-lg border border-[#c4454b]/20 bg-[#12090b]/70 backdrop-blur-md px-3 py-2 text-[12px]"
                    >
                      <div className="font-semibold text-[#f09599]">{m.sender}</div>
                      <div className="text-[#e2d4d6] mt-0.5">{m.body}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[16px] border border-[#c4454b]/25 bg-[#1a1013]/68 backdrop-blur-xl shadow-[0_12px_36px_rgba(0,0,0,0.42)] p-5 space-y-4 h-fit">
                <div className="text-[15.5px] font-bold text-white">إيداع فوري لحساب لاعب</div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setOrderDepFeedback(null);
                    const amt = Number(depAmount) || 0;
                    if (amt <= 0) return;
                    setSendingOrderDep(true);
                    try {
                      const res = await onCreateDepositForUser({
                        userId: matchedOrderDepUser?.id,
                        identifier: depIdentifier.trim(),
                        amountEgp: amt,
                        bankName: depMethod.trim() || 'فودافون كاش',
                        depositNumber: depNumber.trim() || undefined,
                        saveAsFixed: depSaveFixed && Boolean(depNumber.trim()),
                        note: depNote.trim() || undefined,
                        autoCredit: true,
                      });
                      if (res.ok) {
                        setOrderDepFeedback({
                          type: 'success',
                          text: `تم إيداع +${formatMoney(amt)} ج.م بنجاح${depNumber.trim() ? ` (رقم: ${depNumber.trim()})` : ''}`,
                        });
                        setDepNote('');
                        onNotify('success', 'تم إضافة الإيداع ونزوله تلقائيًا');
                      } else {
                        setOrderDepFeedback({ type: 'error', text: res.error || 'تعذر التنفيذ' });
                      }
                    } finally {
                      setSendingOrderDep(false);
                    }
                  }}
                  className="space-y-3"
                >
                  {orderDepFeedback && (
                    <div
                      className={`rounded-[10px] border px-3 py-2 text-[12px] ${
                        orderDepFeedback.type === 'success'
                          ? 'border-[#00e344]/40 bg-[#00e344]/10 text-[#00e344]'
                          : 'border-[#e35d6a]/45 bg-[#e35d6a]/15 text-[#f28b94]'
                      }`}
                    >
                      {orderDepFeedback.text}
                    </div>
                  )}
                  <select
                    value={matchedOrderDepUser?.id ?? ''}
                    onChange={(e) => {
                      const found = users.find((u) => u.id === e.target.value);
                      setDepIdentifier(found ? found.email : '');
                      if (found?.fixedDepositNumber) {
                        setDepNumber(found.fixedDepositNumber);
                      }
                    }}
                    className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#d15b62]"
                  >
                    <option value="">— اختر الجيميل بتاع العميل —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.email} [{u.playerId}] — {formatMoney(u.balanceEgp)} ج.م
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={depIdentifier}
                    onChange={(e) => setDepIdentifier(e.target.value)}
                    placeholder="أو اكتب الجيميل / ID اللاعب"
                    className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2 text-[13px] font-mono-num text-white outline-none focus:border-[#d15b62]"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min={1}
                    required
                    value={depAmount}
                    onChange={(e) => setDepAmount(e.target.value)}
                    placeholder="مبلغ الإيداع (جنيه مصري)"
                    className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2 text-[14px] font-bold font-mono-num text-[#00e344] outline-none focus:border-[#d15b62]"
                  />
                  <select
                    value={depMethod}
                    onChange={(e) => setDepMethod(e.target.value)}
                    className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2 text-[13px] text-white outline-none focus:border-[#d15b62]"
                  >
                    {PAYMENT_METHOD_CHIPS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={depNumber}
                      onChange={(e) => setDepNumber(e.target.value)}
                      placeholder={
                        matchedOrderDepUser?.fixedDepositNumber ||
                        'رقم الإيداع (اختياري — مثال: 01012345678)'
                      }
                      className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2 font-mono-num text-[13px] text-white outline-none focus:border-[#d15b62]"
                    />
                    <label className="flex items-center gap-2 text-[11.5px] text-[#c7b3b6] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={depSaveFixed}
                        onChange={(e) => setDepSaveFixed(e.target.checked)}
                        className="h-3.5 w-3.5 accent-[#c4454b] rounded cursor-pointer"
                      />
                      <span>حفظ كرقم ثابت للحساب</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    value={depNote}
                    onChange={(e) => setDepNote(e.target.value)}
                    placeholder="ملاحظة (اختياري)"
                    className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2 text-[12.5px] text-white outline-none focus:border-[#d15b62]"
                  />
                  <button
                    type="submit"
                    disabled={sendingOrderDep || users.length === 0}
                    className="w-full rounded-[10px] bg-[#00e344] px-4 py-2.5 text-[13px] font-bold text-black disabled:opacity-50 cursor-pointer whitespace-nowrap"
                  >
                    {sendingOrderDep ? 'جاري التنفيذ...' : 'إضافة الإيداع ونزوله فورًا'}
                  </button>
                </form>

                <div className="pt-3 border-t border-[#c4454b]/20 space-y-2 max-h-64 overflow-y-auto scrollbar-dark">
                  {state.deposits.slice(0, 12).map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[#c4454b]/20 bg-[#12090b]/70 backdrop-blur-md px-3 py-2 text-[12px]"
                    >
                      <div className="min-w-0">
                        <div>
                          <span className="font-mono-num font-bold text-white">{d.orderId}</span>
                          <span className="mx-2 text-[#00e344] font-mono-num">
                            +{formatMoney(d.amountLocal)} ج.م
                          </span>
                          <span className="text-[11px] text-[#f3a6aa]">({d.bankName})</span>
                        </div>
                        <div className="text-[11px] text-[#a38f92] font-mono-num truncate">
                          {d.ownerName} · رقم: {d.requisiteNumber}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <StatusBadge status={d.status} lang="ar" />
                        {d.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => onDepositAction(d.id, 'confirm')}
                              className="rounded bg-[#00e344] px-2 py-0.5 text-[11px] font-bold text-black cursor-pointer whitespace-nowrap"
                            >
                              تأكيد
                            </button>
                            <button
                              type="button"
                              onClick={() => onDepositAction(d.id, 'cancel')}
                              className="rounded bg-[#e35d6a]/20 px-2 py-0.5 text-[11px] text-[#f28b94] cursor-pointer whitespace-nowrap"
                            >
                              رفض
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SETTINGS */}
          {tab === 'settings' && (
            <div className="rounded-[16px] border border-[#c4454b]/25 bg-[#1a1013]/68 backdrop-blur-xl shadow-[0_12px_36px_rgba(0,0,0,0.42)] p-6 max-w-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-[15.5px] font-bold text-white">إعدادات المنصة وسعر الصرف</div>
                <CountryFlagBadge code={state.config.countryCode} />
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setConfigFeedback(null);
                  setSavingConfig(true);
                  try {
                    const nextRate = Number(usdRateInput) || state.config.usdRate;
                    const res = await onUpdateConfig({
                      platformName: 'Nexus Agency',
                      usdRate: nextRate,
                      defaultDepositNumber: defaultDepNumInput.trim(),
                      depositMethodNumbers: {
                        vodafone: vodafoneDepNum.trim(),
                        etisalat: etisalatDepNum.trim(),
                        orange: orangeDepNum.trim(),
                        binance: binanceDepId.trim(),
                      },
                      ...(newAdminPass.trim() ? { adminPassword: newAdminPass.trim() } : {}),
                    });
                    if (res && 'ok' in res && !res.ok) {
                      setConfigFeedback({
                        type: 'error',
                        text: res.error || 'تعذر حفظ الإعدادات',
                      });
                      return;
                    }
                    setNewAdminPass('');
                    setConfigFeedback({
                      type: 'success',
                      text: `تم حفظ الإعدادات بنجاح (1 USD = ${nextRate} ج.م)`,
                    });
                    onNotify('success', 'تم حفظ الإعدادات', 'Nexus Agency');
                  } finally {
                    setSavingConfig(false);
                  }
                }}
                className="space-y-3.5"
              >
                {configFeedback && (
                  <div
                    className={`rounded-[10px] border px-3 py-2 text-[12px] ${
                      configFeedback.type === 'success'
                        ? 'border-[#00e344]/40 bg-[#00e344]/10 text-[#00e344]'
                        : 'border-[#e35d6a]/45 bg-[#e35d6a]/15 text-[#f28b94]'
                    }`}
                  >
                    {configFeedback.text}
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[12px] text-[#e2d4d6]">اسم المنصة (مثبّت لا يتغير)</label>
                  <input
                    type="text"
                    value="Nexus Agency"
                    readOnly
                    disabled
                    className="w-full rounded-[10px] border border-[#c4454b]/20 bg-[#10080a]/75 px-3 py-2.5 text-[14px] font-bold text-white/80 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[12px] text-[#e2d4d6]">سعر الدولار مقابل الجنيه المصري</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={usdRateInput}
                    onChange={(e) => setUsdRateInput(e.target.value)}
                    className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2.5 text-[14px] font-mono-num text-[#f09599] outline-none focus:border-[#d15b62]"
                  />
                </div>

                <div className="rounded-[12px] border border-[#c4454b]/25 bg-[#12090b]/65 backdrop-blur-md p-4 space-y-3">
                  <div className="text-[13px] font-bold text-[#f09599]">
                    أرقام الإيداع الثابتة الافتراضية للمنصة
                  </div>
                  <div className="space-y-1">
                    <label className="text-[12px] text-[#e2d4d6]">
                      رقم الإيداع العام الافتراضي (للحسابات التي لم يحدد لها رقم خاص)
                    </label>
                    <input
                      type="text"
                      value={defaultDepNumInput}
                      onChange={(e) => setDefaultDepNumInput(e.target.value)}
                      placeholder="010xxxxxxxx"
                      className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#1a1013]/80 px-3 py-2 text-[13px] font-mono-num text-white outline-none focus:border-[#d15b62]"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[11.5px] text-[#e2d4d6]">رقم فودافون كاش</label>
                      <input
                        type="text"
                        value={vodafoneDepNum}
                        onChange={(e) => setVodafoneDepNum(e.target.value)}
                        placeholder="010xxxxxxxx"
                        className="w-full rounded-[9px] border border-[#c4454b]/22 bg-[#1a1013]/80 px-3 py-2 text-[12.5px] font-mono-num text-white outline-none focus:border-[#d15b62]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11.5px] text-[#e2d4d6]">رقم اتصالات كاش</label>
                      <input
                        type="text"
                        value={etisalatDepNum}
                        onChange={(e) => setEtisalatDepNum(e.target.value)}
                        placeholder="011xxxxxxxx"
                        className="w-full rounded-[9px] border border-[#c4454b]/22 bg-[#1a1013]/80 px-3 py-2 text-[12.5px] font-mono-num text-white outline-none focus:border-[#d15b62]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11.5px] text-[#e2d4d6]">رقم أورنج كاش</label>
                      <input
                        type="text"
                        value={orangeDepNum}
                        onChange={(e) => setOrangeDepNum(e.target.value)}
                        placeholder="012xxxxxxxx"
                        className="w-full rounded-[9px] border border-[#c4454b]/22 bg-[#1a1013]/80 px-3 py-2 text-[12.5px] font-mono-num text-white outline-none focus:border-[#d15b62]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11.5px] text-[#e2d4d6]">معرف باينانس (Binance ID)</label>
                      <input
                        type="text"
                        value={binanceDepId}
                        onChange={(e) => setBinanceDepId(e.target.value)}
                        placeholder="Binance Pay ID / TRC-20"
                        className="w-full rounded-[9px] border border-[#c4454b]/22 bg-[#1a1013]/80 px-3 py-2 text-[12.5px] font-mono-num text-white outline-none focus:border-[#d15b62]"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[12px] text-[#e2d4d6]">تغيير كلمة مرور الأدمن (اختياري)</label>
                  <input
                    type="password"
                    value={newAdminPass}
                    onChange={(e) => setNewAdminPass(e.target.value)}
                    placeholder="سيبه فاضي لو مش عايز تغيرها"
                    className="w-full rounded-[10px] border border-[#c4454b]/22 bg-[#12090b]/70 backdrop-blur-md px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#d15b62]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingConfig}
                  className="rounded-[10px] border border-[#f29b9f]/25 bg-[#b83b44]/85 px-5 py-2.5 text-[13.5px] font-semibold text-white hover:bg-[#c94a53]/90 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                >
                  {savingConfig ? 'جاري التحديث...' : 'حفظ الإعدادات'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Standalone Player Quick-Profile Modal */}
      {previewUser && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewUser(null)}
        >
          <div
            className="w-full max-w-md rounded-[18px] border border-[#c4454b]/30 bg-[#1a1013]/80 backdrop-blur-xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="font-bold text-[16px] text-white">
                ملف اللاعب: {previewUser.displayName}
              </div>
              <button
                type="button"
                onClick={() => setPreviewUser(null)}
                className="rounded-lg p-1 text-[#c7b3b6] hover:bg-[#280e14] hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 text-[13px] font-mono-num bg-[#12090b]/75 rounded-xl p-3.5 border border-[#c4454b]/22">
              <div className="flex justify-between">
                <span className="text-[#a38f92]">Player ID:</span>
                <span className="text-[#f09599] font-bold">{previewUser.playerId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#a38f92]">البريد:</span>
                <span className="text-white">{previewUser.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#a38f92]">اليوزرنيم:</span>
                <span className="text-[#f3a6aa]">@{previewUser.username}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#a38f92]">رقم الوكيل الثابت:</span>
                <span className="text-white font-bold">
                  {previewUser.fixedDepositNumber || 'غير معيّن بعد'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#a38f92]">الرصيد:</span>
                <span className="text-[#00e344] font-bold">
                  {formatMoney(previewUser.balanceEgp)} ج.م
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setInstantDepIdentifier(previewUser.email);
                  setPreviewUser(null);
                  setTab('withdrawals');
                }}
                className="flex-1 rounded-[10px] bg-[#00e344] py-2 text-[12.5px] font-bold text-black cursor-pointer whitespace-nowrap"
              >
                إيداع فوري له
              </button>
              <button
                type="button"
                onClick={() =>
                  copyText(
                    `modal_${previewUser.id}`,
                    `البريد: ${previewUser.email}\nID اللاعب: ${previewUser.playerId}`,
                    'بيانات اللاعب'
                  )
                }
                className="flex-1 rounded-[10px] border border-[#c4454b]/25 bg-[#241317]/75 py-2 text-[12.5px] font-semibold text-white cursor-pointer whitespace-nowrap"
              >
                نسخ البيانات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
