import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthBootLoader } from './components/AuthBootLoader';
import { CommandPalette } from './components/CommandPalette';
import { LoginView } from './components/LoginView';
import { SettingsDrawer } from './components/SettingsDrawer';
import { Sidebar } from './components/Sidebar';
import { ToastContainer } from './components/ToastContainer';
import { TopHeader } from './components/TopHeader';
import { DepositsPage } from './pages/DepositsPage';
import { DisputesPage } from './pages/DisputesPage';
import { MessagesPage } from './pages/MessagesPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReferralsPage } from './pages/ReferralsPage';
import { RequisitesPage } from './pages/RequisitesPage';
import { StatisticsPage } from './pages/StatisticsPage';
import { WithdrawalsPage } from './pages/WithdrawalsPage';
import {
  AccountDesk,
  AppSettings,
  PlatformConfig,
  PlatformState,
  RoutePath,
  ToastMessage,
} from './types';

const VALID_AGENT_ROUTES: RoutePath[] = [
  '/deposits',
  '/deposits/disputes',
  '/withdrawals',
  '/withdrawals/my',
  '/statistics',
  '/requisite',
  '/messages',
  '/profile',
  '/referrals',
];

const AGENT_TOKEN_KEY = 'nexus_agent_token';

function loadStoredToken(key: string): string | null {
  try {
    return localStorage.getItem(key) || null;
  } catch {
    return null;
  }
}

function persistStoredToken(key: string, token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(key, token);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore storage errors
  }
}

const DEFAULT_SETTINGS: AppSettings = {
  lang: 'en',
  tzOffset: 2,
  dateFormat: 'DD.MM.YYYY',
  clockFormat: '24h',
  compactTables: false,
  mirrorHeader: false,
  compactCards: false,
  hideRowNumbers: false,
  fullRowTint: false,
  tableZoom: 100,
  sidebarCollapsedDesktop: false,
  notificationPosition: 'bottom-right',
  skipConfirm: false,
  defaultLanding: '/profile',
};

const EMPTY_ACCOUNT: AccountDesk = {
  account_id: 'acc_guest',
  uuid: '01a1a848-4f12-7901-b4a2-884019e3c102',
  username: 'agent_egp',
  countryCode: 'EG',
  label: 'EG | ج.م · مصر',
  labelEn: 'EG | EGP',
  currency: 'EGP',
  balanceUsdt: 0,
  frozenUsdt: 0,
  insuranceAmount: null,
  rate: 49.85,
  canTrade: false,
  depositFeePct: 3.0,
  withdrawalFeePct: 1.8,
};

const EMPTY_STATE: PlatformState = {
  config: {
    platformName: 'Nexus Agency',
    countryCode: 'EG',
    currencyCode: 'EGP',
    usdRate: 49.85,
  },
  users: [],
  onlinePresence: [],
  onlineCount: 0,
  profile: {
    traderId: 'TRD-EG-001',
    displayName: 'مكتب مصر للمدفوعات',
    email: '',
    telegramHandle: '@nexus_desk',
    twoFactorEnabled: true,
    referralCode: 'EG-ELITE-01',
    referralRatePct: 0.5,
    trc20Address: 'TY9xK8mPq7VwRz4nLp3JdXs2kF9aBc7eW1',
  },
  currentAccountId: 'acc_guest',
  accounts: [EMPTY_ACCOUNT],
  requisites: [],
  deposits: [],
  disputes: [],
  withdrawals: [],
  androidDevices: [],
  telegramBots: [],
  apiKeys: [],
  messages: [],
  topUps: [],
  referrals: [],
  settings: DEFAULT_SETTINGS,
};

function isAgentRoute(path: string): path is RoutePath {
  return VALID_AGENT_ROUTES.includes(path as RoutePath);
}

function getOrCreateVisitorId(): string {
  try {
    const key = 'nexus_visitor_id';
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const created = `vis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(key, created);
    return created;
  } catch {
    return `vis_${Date.now()}`;
  }
}

export default function App() {
  const [pathname, setPathname] = useState<string>(() => {
    const raw = window.location.pathname || '/profile';
    if (raw === '/admin' || raw.startsWith('/admin/')) {
      window.history.replaceState({}, '', '/profile');
      return '/profile';
    }
    return raw;
  });

  // Boot & auth state
  const [bootPhase, setBootPhase] = useState<'ready' | 'preparing' | 'accounts'>('preparing');
  const [bootError, setBootError] = useState<string | null>(null);

  // Agent session & state
  const [agentAuthed, setAgentAuthed] = useState(false);
  const [agentToken, setAgentTokenState] = useState<string | null>(() =>
    loadStoredToken(AGENT_TOKEN_KEY)
  );
  const [agentState, setAgentState] = useState<PlatformState>(EMPTY_STATE);

  const setAgentToken = useCallback((next: string | null) => {
    setAgentTokenState(next);
    persistStoredToken(AGENT_TOKEN_KEY, next);
  }, []);

  // UI controls
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [triggerCreateRequisite, setTriggerCreateRequisite] = useState(false);
  const [triggerCreateTopUp, setTriggerCreateTopUp] = useState(false);
  const [triggerCreateDeposit, setTriggerCreateDeposit] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const visitorIdRef = useRef<string>(getOrCreateVisitorId());

  const notify = useCallback(
    (type: ToastMessage['type'], title: string, message?: string) => {
      const id = `toast_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, type, title, message }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 4200);
    },
    []
  );

  const navigatePath = useCallback((nextPath: string) => {
    setPathname(nextPath);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
  }, []);

  const navigateAgentRoute = useCallback(
    (route: RoutePath) => {
      navigatePath(route);
    },
    [navigatePath]
  );

  const apiFetch = useCallback(
    async <T = Record<string, unknown>>(
      url: string,
      options: {
        method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
        body?: unknown;
        token?: string | null;
      } = {}
    ): Promise<{ ok: boolean; status: number; data: T & { ok?: boolean; error?: string } }> => {
      const method = options.method || 'GET';
      const headers: Record<string, string> = {
        'X-Requested-With': 'fetch',
      };
      if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }
      if (options.token) {
        headers['Authorization'] = `Bearer ${options.token}`;
      }
      const res = await fetch(url, {
        method,
        headers,
        credentials: 'include',
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
      let data: T & { ok?: boolean; error?: string };
      try {
        data = (await res.json()) as T & { ok?: boolean; error?: string };
      } catch {
        data = {
          ok: false,
          error:
            res.status === 405
              ? 'خادم الموقع لا يستقبل طلبات API حاليًا — تأكد من نشر التحديث الأخير لملف vercel.json ومجلد api'
              : `HTTP ${res.status}`,
        } as T & { ok?: boolean; error?: string };
      }
      return { ok: res.ok && data.ok !== false, status: res.status, data };
    },
    []
  );

  // Browser back/forward
  useEffect(() => {
    const onPop = () => {
      setPathname(window.location.pathname || '/profile');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Boot sequence: load public config + check agent session
  const runBoot = useCallback(async () => {
    setBootError(null);
    setBootPhase('preparing');
    try {
      const pubRes = await apiFetch<{ config?: PlatformConfig }>('/api/public/config');
      if (pubRes.ok && pubRes.data.config) {
        setAgentState((prev) => ({ ...prev, config: pubRes.data.config! }));
      }

      setBootPhase('accounts');
      const meRes = await apiFetch<{ slice?: PlatformState }>('/api/auth/me', {
        token: agentToken,
      });

      if (meRes.ok && meRes.data.slice) {
        setAgentState(meRes.data.slice);
        setAgentAuthed(true);
      } else {
        setAgentAuthed(false);
        if (meRes.status === 401 && agentToken) {
          setAgentToken(null);
        }
      }

      setBootPhase('ready');
    } catch {
      setBootError(
        agentState.settings.lang === 'ar'
          ? 'تعذر الاتصال بالخادم — يرجى المحاولة مرة أخرى'
          : 'Unable to reach server — please retry'
      );
    }
  }, [apiFetch, agentToken, agentState.settings.lang, setAgentToken]);

  useEffect(() => {
    runBoot();
    // Only run initial boot once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time polling for Agent Desk
  useEffect(() => {
    if (!agentAuthed) return;
    const timer = window.setInterval(async () => {
      const res = await apiFetch<{ slice?: PlatformState }>('/api/auth/me', { token: agentToken });
      if (res.ok && res.data.slice) {
        setAgentState(res.data.slice);
      } else if (res.status === 401) {
        setAgentAuthed(false);
        setAgentToken(null);
      }
    }, 4500);
    return () => window.clearInterval(timer);
  }, [agentAuthed, agentToken, apiFetch, setAgentToken]);

  // Presence ping
  useEffect(() => {
    const sendPing = () => {
      apiFetch('/api/presence/ping', {
        method: 'POST',
        token: agentToken,
        body: {
          visitorId: visitorIdRef.current,
          route: pathname,
        },
      }).catch(() => undefined);
    };
    sendPing();
    const interval = window.setInterval(sendPing, 15000);
    return () => window.clearInterval(interval);
  }, [pathname, agentToken, apiFetch]);

  // Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    if (!agentAuthed) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [agentAuthed]);

  // Apply HTML direction and layout classes
  const activeSettings = agentState.settings ?? DEFAULT_SETTINGS;
  useEffect(() => {
    const lang = activeSettings.lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.style.setProperty(
      '--table-zoom',
      `${(activeSettings.tableZoom ?? 100) / 100}`
    );
    document.body.classList.toggle('compact-tables', Boolean(activeSettings.compactTables));
    document.body.classList.toggle('mirror-header', Boolean(activeSettings.mirrorHeader));
  }, [
    activeSettings.lang,
    activeSettings.tableZoom,
    activeSettings.compactTables,
    activeSettings.mirrorHeader,
  ]);

  const activeRoute: RoutePath = useMemo(() => {
    if (isAgentRoute(pathname)) return pathname;
    return activeSettings.defaultLanding || '/profile';
  }, [pathname, activeSettings.defaultLanding]);

  const currentAccount = useMemo(
    () =>
      agentState.accounts.find((a) => a.account_id === agentState.currentAccountId) ??
      agentState.accounts[0] ??
      EMPTY_ACCOUNT,
    [agentState.accounts, agentState.currentAccountId]
  );

  // Agent action helper
  const agentMutate = useCallback(
    async (
      url: string,
      method: 'POST' | 'PATCH' | 'DELETE',
      body?: unknown
    ): Promise<{ ok: boolean; error?: string }> => {
      const res = await apiFetch<{ slice?: PlatformState }>(url, {
        method,
        body,
        token: agentToken,
      });
      if (res.ok && res.data.slice) {
        setAgentState(res.data.slice);
        return { ok: true };
      }
      if (res.status === 401) {
        setAgentAuthed(false);
        setAgentToken(null);
      }
      return { ok: false, error: res.data.error };
    },
    [apiFetch, agentToken, setAgentToken]
  );

  if (bootPhase !== 'ready') {
    return (
      <AuthBootLoader
        phase={bootPhase}
        error={bootError}
        lang={activeSettings.lang}
        platformName={agentState.config.platformName}
        countryCode={agentState.config.countryCode}
        onRetry={runBoot}
      />
    );
  }

  // ================= AGENT LOGIN VIEW =================
  if (!agentAuthed) {
    return (
      <>
        <LoginView
          lang={activeSettings.lang}
          platformName={agentState.config.platformName}
          countryCode={agentState.config.countryCode}
          onToggleLang={() =>
            setAgentState((prev) => ({
              ...prev,
              settings: { ...prev.settings, lang: prev.settings.lang === 'ar' ? 'en' : 'ar' },
            }))
          }
          onLogin={async (email, password) => {
            const res = await apiFetch<{ token?: string; slice?: PlatformState }>(
              '/api/auth/login',
              {
                method: 'POST',
                body: { email, password },
              }
            );
            if (res.ok && res.data.slice) {
              setAgentToken(res.data.token ?? null);
              setAgentState(res.data.slice);
              setAgentAuthed(true);
              if (!isAgentRoute(pathname)) {
                navigateAgentRoute(res.data.slice.settings?.defaultLanding || '/profile');
              }
              return { ok: true };
            }
            return { ok: false, error: res.data.error };
          }}
        />
        <ToastContainer
          toasts={toasts}
          position={activeSettings.notificationPosition}
          onDismiss={(id) => setToasts((prev) => prev.filter((item) => item.id !== id))}
        />
      </>
    );
  }

  // ================= AGENT DESK WORKSPACE =================
  const openDisputesCount = agentState.disputes.filter(
    (d) => d.accountId === currentAccount.account_id && (d.status === 'open' || d.status === 'reviewing')
  ).length;
  const availableWithdrawalsCount = agentState.withdrawals.filter(
    (w) =>
      w.accountId === currentAccount.account_id &&
      (w.status === 'available' || (w.adminCreated && w.status === 'awaiting_confirmation'))
  ).length;
  const pendingDepositsCount = agentState.deposits.filter(
    (d) => d.accountId === currentAccount.account_id && d.status === 'pending'
  ).length;
  const pendingMessagesCount = agentState.messages.filter(
    (m) => m.withdrawalActionStatus === 'pending_confirmation'
  ).length;

  const updateSettings = (patch: Partial<AppSettings>) => {
    setAgentState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
    agentMutate('/api/agent/settings', 'PATCH', patch).catch(() => undefined);
  };

  return (
    <div className="h-dvh w-full bg-[#16070a] bg-[radial-gradient(ellipse_at_top,_rgba(205,58,68,0.32),transparent_60%),radial-gradient(ellipse_at_bottom_left,_rgba(184,48,58,0.22),transparent_58%)] text-white flex flex-col overflow-hidden">
      <TopHeader
        lang={activeSettings.lang}
        platformName={agentState.config.platformName}
        currentRoute={activeRoute}
        currentAccount={currentAccount}
        sidebarCollapsed={activeSettings.sidebarCollapsedDesktop}
        onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex flex-1 min-h-0 pt-[3.75rem]">
        <Sidebar
          lang={activeSettings.lang}
          platformName={agentState.config.platformName}
          currentRoute={activeRoute}
          onNavigate={navigateAgentRoute}
          accounts={agentState.accounts}
          currentAccount={currentAccount}
          onSwitchAccount={(id) =>
            setAgentState((prev) => ({ ...prev, currentAccountId: id }))
          }
          onToggleTradeStatus={(canTrade) => {
            agentMutate('/api/agent/trade-status', 'PATCH', { canTrade });
          }}
          collapsed={activeSettings.sidebarCollapsedDesktop}
          onToggleCollapse={() =>
            updateSettings({ sidebarCollapsedDesktop: !activeSettings.sidebarCollapsedDesktop })
          }
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          onOpenSearch={() => setCommandOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleLang={() =>
            updateSettings({ lang: activeSettings.lang === 'ar' ? 'en' : 'ar' })
          }
          onShowLogin={async () => {
            await apiFetch('/api/auth/logout', { method: 'POST', token: agentToken });
            setAgentToken(null);
            setAgentAuthed(false);
          }}
          openDisputesCount={openDisputesCount}
          availableWithdrawalsCount={availableWithdrawalsCount}
          pendingMessagesCount={pendingMessagesCount}
        />

        <main
          className={`flex-1 min-w-0 min-h-0 flex flex-col bg-transparent transition-[padding] duration-300 ${
            activeSettings.sidebarCollapsedDesktop ? 'lg:ps-[4rem]' : 'lg:ps-[20rem]'
          }`}
        >
          {activeRoute === '/deposits' && (
            <DepositsPage
              deposits={agentState.deposits}
              currentAccount={currentAccount}
              config={agentState.config}
              settings={activeSettings}
              triggerCreate={triggerCreateDeposit}
              onClearTriggerCreate={() => setTriggerCreateDeposit(false)}
              onAction={async (id, action) => {
                const res = await agentMutate(
                  `/api/agent/deposits/${encodeURIComponent(id)}/action`,
                  'POST',
                  { action }
                );
                if (!res.ok && res.error) notify('error', res.error);
              }}
              onCreateDeposit={async (payload) =>
                agentMutate('/api/agent/deposits', 'POST', payload)
              }
              onNotify={notify}
            />
          )}

          {activeRoute === '/deposits/disputes' && (
            <DisputesPage
              disputes={agentState.disputes}
              currentAccount={currentAccount}
              settings={activeSettings}
              onResolve={async (id, action, note) => {
                await agentMutate(
                  `/api/agent/disputes/${encodeURIComponent(id)}/resolve`,
                  'POST',
                  { decision: action, note }
                );
              }}
              onNotify={notify}
            />
          )}

          {(activeRoute === '/withdrawals' || activeRoute === '/withdrawals/my') && (
            <WithdrawalsPage
              mode={activeRoute === '/withdrawals' ? 'pool' : 'my'}
              withdrawals={agentState.withdrawals}
              currentAccount={currentAccount}
              settings={activeSettings}
              onClaim={async (id) => {
                await agentMutate(
                  `/api/agent/withdrawals/${encodeURIComponent(id)}/claim`,
                  'POST'
                );
              }}
              onUpdate={async (id, action, files) => {
                const mappedAction =
                  action === 'attach'
                    ? 'upload_receipt'
                    : action === 'release'
                    ? 'cancel'
                    : 'complete';
                const firstFile = files?.[0];
                const res = await agentMutate(
                  `/api/agent/withdrawals/${encodeURIComponent(id)}/action`,
                  'POST',
                  {
                    action: mappedAction,
                    fileName: firstFile?.name,
                    fileSize: firstFile?.size,
                  }
                );
                if (!res.ok && res.error) notify('error', res.error);
              }}
              onCreateWithdrawal={async (payload) =>
                agentMutate('/api/agent/withdrawals', 'POST', payload)
              }
              onRespondWithdrawal={async (id, action) =>
                agentMutate(`/api/agent/withdrawals/${encodeURIComponent(id)}/respond`, 'POST', {
                  action,
                })
              }
              onNotify={notify}
            />
          )}

          {activeRoute === '/statistics' && (
            <StatisticsPage
              deposits={agentState.deposits}
              withdrawals={agentState.withdrawals}
              requisites={agentState.requisites}
              currentAccount={currentAccount}
              settings={activeSettings}
            />
          )}

          {activeRoute === '/requisite' && (
            <RequisitesPage
              requisites={agentState.requisites}
              currentAccount={currentAccount}
              settings={activeSettings}
              triggerCreate={triggerCreateRequisite}
              onClearTriggerCreate={() => setTriggerCreateRequisite(false)}
              onCreate={async (data) => agentMutate('/api/agent/requisites', 'POST', data)}
              onUpdate={async (id, data) =>
                agentMutate(`/api/agent/requisites/${encodeURIComponent(id)}`, 'PATCH', data)
              }
              onDelete={async (id) => {
                await agentMutate(`/api/agent/requisites/${encodeURIComponent(id)}`, 'DELETE');
              }}
              onNotify={notify}
            />
          )}

          {activeRoute === '/messages' && (
            <MessagesPage
              messages={agentState.messages}
              settings={activeSettings}
              onSimulateSms={async () => {
                await agentMutate('/api/agent/messages/simulate', 'POST');
              }}
              onRespondWithdrawal={async (messageId, action) => {
                return agentMutate('/api/agent/messages/withdrawal-response', 'POST', {
                  messageId,
                  action,
                });
              }}
              onNotify={notify}
            />
          )}

          {activeRoute === '/profile' && (
            <ProfilePage
              profile={agentState.profile}
              currentAccount={currentAccount}
              config={agentState.config}
              deposits={agentState.deposits.filter((d) => d.accountId === currentAccount.account_id)}
              withdrawals={agentState.withdrawals}
              depositsCount={
                agentState.deposits.filter((d) => d.accountId === currentAccount.account_id).length
              }
              pendingDepositsCount={pendingDepositsCount}
              pendingWithdrawalsCount={pendingMessagesCount}
              requisitesCount={
                agentState.requisites.filter((r) => r.accountId === currentAccount.account_id)
                  .length
              }
              settings={activeSettings}
              triggerCreate={triggerCreateTopUp}
              onClearTriggerCreate={() => setTriggerCreateTopUp(false)}
              onCreateDeposit={async (payload) =>
                agentMutate('/api/agent/deposits', 'POST', payload)
              }
              onToggle2FA={async (enabled) => {
                await agentMutate('/api/agent/2fa', 'PATCH', { enabled });
              }}
              onNavigate={navigateAgentRoute}
              onNotify={notify}
            />
          )}

          {activeRoute === '/referrals' && (
            <ReferralsPage
              profile={agentState.profile}
              referrals={agentState.referrals}
              settings={activeSettings}
              onNotify={notify}
            />
          )}
        </main>
      </div>

      <SettingsDrawer
        open={settingsOpen}
        settings={activeSettings}
        onClose={() => setSettingsOpen(false)}
        onUpdate={updateSettings}
      />

      <CommandPalette
        open={commandOpen}
        lang={activeSettings.lang}
        currentRoute={activeRoute}
        onClose={() => setCommandOpen(false)}
        onExecute={(route, action) => {
          navigateAgentRoute(route);
          if (action === 'create_requisite') setTriggerCreateRequisite(true);
          if (action === 'create_deposit') setTriggerCreateDeposit(true);
          if (action === 'create_topup') setTriggerCreateTopUp(true);
        }}
      />

      <ToastContainer
        toasts={toasts}
        position={activeSettings.notificationPosition}
        onDismiss={(id) => setToasts((prev) => prev.filter((item) => item.id !== id))}
      />
    </div>
  );
}
