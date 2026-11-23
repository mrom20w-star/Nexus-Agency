import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ToastContainer } from './components/ToastContainer';
import {
  clearFirestoreProbeCache,
  createFirestoreUser,
  deleteFirestoreUser,
  fetchFirestoreUsers,
  firebaseConfig,
  getFirestoreAdminStatus,
  sendFirestoreInstantDeposit,
  sendFirestoreMessage,
  sendFirestoreWithdrawal,
  setFirestoreDepositNumber,
  setupFirestoreAdminPassword,
  subscribeAdminCollections,
  updateFirestoreConfig,
  updateFirestoreDeposit,
  updateFirestoreUser,
  updateFirestoreWithdrawal,
  verifyFirestoreAdminPassword,
} from './firebase/client';
import {
  AdminDashboardPage,
  ConnectionMode,
  ServerConnectionStatus,
} from './pages/AdminDashboardPage';
import { ManagedUser, PlatformState, ToastMessage } from './types';
import {
  FIXED_PLATFORM_NAME,
  loadAdminDb,
  needsLocalAdminSetup,
  runLocalAdminAction,
  saveAdminDb,
  setupLocalAdminPassword,
  verifyLocalAdminPassword,
} from './utils/localStore';

const ADMIN_TOKEN_STORAGE_KEY = 'nexus_dashboard_admin_token';

function loadStoredToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function persistToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

class AdminErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(err: Error) {
    return { hasError: true, message: err?.message || 'Render error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-dvh bg-[#0f0b0c] bg-[radial-gradient(ellipse_at_top,_rgba(196,69,75,0.24),transparent_62%),radial-gradient(ellipse_at_bottom_left,_rgba(184,59,68,0.12),transparent_55%)] text-white flex items-center justify-center p-4"
        >
          <div className="max-w-md w-full rounded-2xl border border-[#c4454b]/25 bg-[#1a1013]/68 backdrop-blur-xl p-6 text-center space-y-4">
            <div className="text-[17px] font-bold">حدث خطأ مؤقت في لوحة الإدارة</div>
            <div className="text-[12.5px] text-[#c7b3b6] font-mono-num">{this.state.message}</div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl border border-[#f29b9f]/25 bg-[#b83b44]/85 hover:bg-[#c94a53]/90 px-5 py-2 text-[13px] font-semibold text-white cursor-pointer"
            >
              إعادة التحميل
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AdminErrorBoundary>
      <AdminAppInner />
    </AdminErrorBoundary>
  );
}

function AdminAppInner() {
  const [state, setState] = useState<PlatformState>(() => loadAdminDb());
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(() => needsLocalAdminSetup());
  const [sessionToken, setSessionTokenState] = useState<string | null>(() => loadStoredToken());
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('firebase');
  const [connectionStatus, setConnectionStatus] = useState<ServerConnectionStatus>('connecting');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const tokenRef = useRef<string | null>(sessionToken);
  const setSessionToken = useCallback((next: string | null) => {
    tokenRef.current = next;
    setSessionTokenState(next);
    persistToken(next);
  }, []);

  const notify = useCallback(
    (type: ToastMessage['type'], title: string, message?: string) => {
      const id = `toast_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, type, title, message }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  // Same-origin Node/Vercel /api/* helper (used only when co-hosted and Firestore isn't enabled)
  const callApiEndpoint = useCallback(
    async (
      path: string,
      options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; token?: string | null } = {}
    ): Promise<{ ok: boolean; status: number; data: Record<string, unknown> } | null> => {
      try {
        const method = options.method || 'GET';
        const headers: Record<string, string> = {
          'X-Requested-With': 'fetch',
        };
        if (options.body !== undefined) {
          headers['Content-Type'] = 'application/json';
        }
        const activeToken = options.token !== undefined ? options.token : tokenRef.current;
        if (activeToken) {
          headers['Authorization'] = `Bearer ${activeToken}`;
        }
        const res = await fetch(path, {
          method,
          headers,
          credentials: 'include',
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        });
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) return null;
        const data = (await res.json()) as Record<string, unknown>;
        return { ok: res.ok && data.ok !== false, status: res.status, data };
      } catch {
        return null;
      }
    },
    []
  );

  // PHP bridge fallback (./admin-api.php) on cPanel / Apache
  const callPhpBridge = useCallback(
    async (action: string, payload?: Record<string, unknown>, tokenOverride?: string | null) => {
      const activeToken = tokenOverride ?? tokenRef.current;
      try {
        const headers: Record<string, string> = {
          'X-Requested-With': 'fetch',
        };
        if (payload) headers['Content-Type'] = 'application/json';
        if (activeToken) headers['Authorization'] = `Bearer ${activeToken}`;

        const res = await fetch(`./admin-api.php?action=${encodeURIComponent(action)}`, {
          method: payload ? 'POST' : 'GET',
          credentials: 'include',
          headers,
          body: payload ? JSON.stringify(payload) : undefined,
        });
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) return null;
        return (await res.json()) as Record<string, unknown>;
      } catch {
        return null;
      }
    },
    []
  );

  const applyReturnedState = useCallback((res: Record<string, unknown> | null) => {
    if (res?.state) {
      const next = res.state as PlatformState;
      const merged: PlatformState = {
        ...loadAdminDb(),
        ...next,
        config: {
          ...next.config,
          platformName: FIXED_PLATFORM_NAME,
        },
        settings: next.settings ?? loadAdminDb().settings,
      };
      saveAdminDb(merged);
      setState(merged);
    }
  }, []);

  const probeBackend = useCallback(
    async (forceRefresh = false): Promise<{ ok: boolean; mode: ConnectionMode }> => {
      setConnectionStatus('connecting');
      if (forceRefresh) {
        clearFirestoreProbeCache();
      }

      // 1. Primary shared backend: Firebase Firestore (moorrcv)
      const fsStatus = await getFirestoreAdminStatus();
      if (fsStatus.ok) {
        setConnectionMode('firebase');
        setConnectionStatus('connected');
        setNeedsSetup(fsStatus.needsSetup);
        return { ok: true, mode: 'firebase' };
      }

      // 2. Fallback: Same-origin Node/Vercel /api/*
      const apiRes = await callApiEndpoint('/api/admin/auth-status');
      if (apiRes && typeof apiRes.data.needsSetup === 'boolean') {
        setConnectionMode('api');
        setConnectionStatus('connected');
        setNeedsSetup(Boolean(apiRes.data.needsSetup));
        setAdminAuthed(Boolean(apiRes.data.authenticated));
        if (apiRes.data.authenticated && apiRes.data.state) {
          applyReturnedState(apiRes.data);
        }
        return { ok: true, mode: 'api' };
      }

      // 3. Fallback: Same-origin PHP bridge (./admin-api.php)
      const phpRes = await callPhpBridge('status');
      if (phpRes && phpRes.ok === true) {
        setConnectionMode('php');
        setConnectionStatus('connected');
        setNeedsSetup(Boolean(phpRes.needsSetup));
        setAdminAuthed(Boolean(phpRes.authenticated));
        if (phpRes.authenticated && phpRes.state) {
          applyReturnedState(phpRes);
        }
        return { ok: true, mode: 'php' };
      }

      // 4. Local fallback (clearly surfaces Firestore activation status if disabled)
      setConnectionMode('local');
      setConnectionStatus(fsStatus.reason || 'offline');
      setNeedsSetup(needsLocalAdminSetup());
      return { ok: false, mode: 'local' };
    },
    [callApiEndpoint, callPhpBridge, applyReturnedState]
  );

  // Initial boot probe
  useEffect(() => {
    probeBackend().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time Firebase Firestore subscriptions while admin is authenticated
  useEffect(() => {
    if (!adminAuthed || connectionMode !== 'firebase') return;

    const unsubscribe = subscribeAdminCollections({
      onConfig: (config) => {
        setState((prev) => ({
          ...prev,
          config: { ...config, platformName: FIXED_PLATFORM_NAME },
        }));
      },
      onUsers: (users) => {
        setState((prev) => ({ ...prev, users }));
      },
      onPresence: (onlinePresence) => {
        setState((prev) => ({
          ...prev,
          onlinePresence,
          onlineCount: onlinePresence.length,
        }));
      },
      onWithdrawals: (withdrawals) => {
        setState((prev) => ({ ...prev, withdrawals }));
      },
      onDeposits: (deposits) => {
        setState((prev) => ({ ...prev, deposits }));
      },
      onMessages: (messages) => {
        setState((prev) => ({ ...prev, messages }));
      },
    });

    return () => {
      unsubscribe();
    };
  }, [adminAuthed, connectionMode]);

  return (
    <>
      <AdminDashboardPage
        state={state}
        adminAuthed={adminAuthed}
        needsSetup={needsSetup}
        connectionStatus={connectionStatus}
        connectionMode={connectionMode}
        firebaseProjectId={firebaseConfig.projectId}
        onAdminSetup={async (pass) => {
          const cleanPass = pass.trim();
          if (connectionMode === 'firebase') {
            const fsRes = await setupFirestoreAdminPassword(cleanPass);
            if (fsRes.ok) {
              setNeedsSetup(false);
              setAdminAuthed(true);
              return { ok: true };
            }
            return { ok: false, error: fsRes.error || 'تعذر إعداد كلمة المرور على Firebase' };
          }

          if (connectionMode === 'api') {
            const apiRes = await callApiEndpoint('/api/admin/setup', {
              method: 'POST',
              body: { password: cleanPass },
            });
            if (apiRes?.ok) {
              setSessionToken((apiRes.data.token as string) || null);
              setNeedsSetup(false);
              setAdminAuthed(true);
              applyReturnedState(apiRes.data);
              return { ok: true };
            }
            if (apiRes?.data?.error) return { ok: false, error: String(apiRes.data.error) };
            return { ok: false, error: 'تعذر إعداد كلمة المرور على السيرفر' };
          }

          if (connectionMode === 'php') {
            const phpRes = await callPhpBridge('setup', { password: cleanPass });
            if (phpRes?.ok) {
              setSessionToken((phpRes.token as string) || null);
              setNeedsSetup(false);
              setAdminAuthed(true);
              applyReturnedState(phpRes);
              return { ok: true };
            }
            if (phpRes?.error) return { ok: false, error: String(phpRes.error) };
          }

          const localRes = await setupLocalAdminPassword(cleanPass);
          if (localRes.ok && localRes.state) {
            setNeedsSetup(false);
            setAdminAuthed(true);
            setState(localRes.state);
            return { ok: true };
          }
          return { ok: false, error: localRes.error || 'تعذر حفظ كلمة المرور' };
        }}
        onAdminLogin={async (pass) => {
          const cleanPass = pass.trim();
          if (connectionMode === 'firebase') {
            const fsAuth = await verifyFirestoreAdminPassword(cleanPass);
            if (fsAuth.ok) {
              setAdminAuthed(true);
              return { ok: true };
            }
            return { ok: false, error: fsAuth.error || 'كلمة مرور الأدمن مش صحيحة' };
          }

          if (connectionMode === 'api') {
            const apiAuth = await callApiEndpoint('/api/admin/login', {
              method: 'POST',
              body: { password: cleanPass },
            });
            if (apiAuth?.ok) {
              setSessionToken((apiAuth.data.token as string) || null);
              setAdminAuthed(true);
              applyReturnedState(apiAuth.data);
              return { ok: true };
            }
            return {
              ok: false,
              error: (apiAuth?.data?.error as string | undefined) || 'كلمة مرور الأدمن مش صح',
            };
          }

          if (connectionMode === 'php') {
            const phpAuth = await callPhpBridge('auth', { password: cleanPass });
            if (phpAuth?.ok) {
              setSessionToken((phpAuth.token as string) || null);
              setAdminAuthed(true);
              applyReturnedState(phpAuth);
              return { ok: true };
            }
            return {
              ok: false,
              error: (phpAuth?.error as string | undefined) || 'كلمة مرور الأدمن مش صح',
            };
          }

          const localAuth = await verifyLocalAdminPassword(cleanPass);
          if (localAuth.ok && localAuth.state) {
            setAdminAuthed(true);
            setState(localAuth.state);
            return { ok: true };
          }
          return {
            ok: false,
            error: localAuth.error || 'كلمة مرور الأدمن مش صح',
          };
        }}
        onAdminLogout={async () => {
          if (connectionMode === 'api') {
            await callApiEndpoint('/api/admin/logout', { method: 'POST' });
          } else if (connectionMode === 'php') {
            await callPhpBridge('logout', {});
          }
          setSessionToken(null);
          setAdminAuthed(false);
        }}
        onRefreshAdmin={async () => {
          if (connectionMode === 'firebase') {
            const res = await fetchFirestoreUsers();
            if (res.ok && res.users) {
              setConnectionStatus('connected');
              setState((prev) => ({ ...prev, users: res.users! }));
            }
            return;
          }

          if (connectionMode === 'api') {
            const apiState = await callApiEndpoint('/api/admin/state');
            if (apiState?.ok) {
              setConnectionStatus('connected');
              applyReturnedState(apiState.data);
              return;
            }
            if (apiState?.status === 401) {
              setSessionToken(null);
              setAdminAuthed(false);
              return;
            }
          }

          if (connectionMode === 'php') {
            const phpState = await callPhpBridge('state');
            if (phpState?.ok) {
              setConnectionStatus('connected');
              applyReturnedState(phpState);
              return;
            }
          }

          const probed = await probeBackend(true);
          if (probed.mode === 'firebase') {
            const res = await fetchFirestoreUsers();
            if (res.ok && res.users) {
              setState((prev) => ({ ...prev, users: res.users! }));
            }
            return;
          }

          setState(loadAdminDb());
        }}
        onCreateUser={async (payload) => {
          let activeMode = connectionMode;
          if (activeMode === 'local') {
            const recheck = await probeBackend(true);
            activeMode = recheck.mode;
          }

          if (activeMode === 'firebase') {
            const fsRes = await createFirestoreUser(payload);
            if (fsRes.ok && fsRes.user) {
              setState((prev) => ({
                ...prev,
                users: [fsRes.user!, ...prev.users.filter((u) => u.id !== fsRes.user!.id)],
              }));
              return { ok: true, user: fsRes.user };
            }
            return { ok: false, error: fsRes.error || 'تعذر إنشاء الحساب على Firebase' };
          }

          if (activeMode === 'api') {
            const apiRes = await callApiEndpoint('/api/admin/users', {
              method: 'POST',
              body: payload,
            });
            if (apiRes?.ok && apiRes.data.user) {
              applyReturnedState(apiRes.data);
              return { ok: true, user: apiRes.data.user as ManagedUser };
            }
            return {
              ok: false,
              error: String(apiRes?.data?.error || 'تعذر إنشاء الحساب على السيرفر'),
            };
          }

          if (activeMode === 'php') {
            const phpRes = await callPhpBridge('create_user', payload);
            if (phpRes?.ok && phpRes.user) {
              applyReturnedState(phpRes);
              return { ok: true, user: phpRes.user as ManagedUser };
            }
            if (phpRes && !phpRes.ok && phpRes.error) {
              return { ok: false, error: String(phpRes.error) };
            }
          }

          return {
            ok: false,
            error:
              'تعذر حفظ الحساب في قاعدة بيانات Firebase (moorrcv) — تحقق من الاتصال وصلاحيات Firestore ثم اضغط فحص الاتصال الآن',
          };
        }}
        onUpdateUser={async (userId, patch) => {
          if (connectionMode === 'firebase') {
            const fsRes = await updateFirestoreUser(userId, patch);
            if (fsRes.ok) {
              setState((prev) => ({
                ...prev,
                users: prev.users.map((u) => (u.id === userId ? { ...u, ...patch } : u)),
              }));
              return { ok: true };
            }
            return { ok: false, error: fsRes.error || 'تعذر تحديث الحساب على Firebase' };
          }

          if (connectionMode === 'api') {
            const apiRes = await callApiEndpoint(
              `/api/admin/users/${encodeURIComponent(userId)}`,
              {
                method: 'PATCH',
                body: patch,
              }
            );
            if (apiRes?.ok) {
              applyReturnedState(apiRes.data);
              return { ok: true };
            }
            return { ok: false, error: String(apiRes?.data?.error || 'تعذر تحديث الحساب') };
          }

          if (connectionMode === 'php') {
            const phpRes = await callPhpBridge('update_user', { userId, patch });
            if (phpRes?.ok) {
              applyReturnedState(phpRes);
              return { ok: true };
            }
            if (phpRes && !phpRes.ok && phpRes.error) {
              return { ok: false, error: String(phpRes.error) };
            }
          }

          const localRes = await runLocalAdminAction('update_user', { userId, patch });
          if (localRes.state) setState(localRes.state);
          return { ok: Boolean(localRes.ok), error: localRes.error };
        }}
        onDeleteUser={async (userId) => {
          if (connectionMode === 'firebase') {
            await deleteFirestoreUser(userId);
            setState((prev) => ({
              ...prev,
              users: prev.users.filter((u) => u.id !== userId),
            }));
            return;
          }

          if (connectionMode === 'api') {
            const apiRes = await callApiEndpoint(
              `/api/admin/users/${encodeURIComponent(userId)}`,
              { method: 'DELETE' }
            );
            if (apiRes?.ok) {
              applyReturnedState(apiRes.data);
              return;
            }
          }

          if (connectionMode === 'php') {
            const phpRes = await callPhpBridge('delete_user', { userId });
            if (phpRes?.ok) {
              applyReturnedState(phpRes);
              return;
            }
          }

          const localRes = await runLocalAdminAction('delete_user', { userId });
          if (localRes.state) setState(localRes.state);
        }}
        onSetDepositNumber={async (payload) => {
          if (connectionMode === 'firebase') {
            const fsRes = await setFirestoreDepositNumber(payload);
            if (fsRes.ok && fsRes.user) {
              setState((prev) => ({
                ...prev,
                users: prev.users.map((u) => (u.id === fsRes.user!.id ? fsRes.user! : u)),
              }));
              return { ok: true, user: fsRes.user };
            }
            return { ok: false, error: fsRes.error || 'تعذر حفظ رقم الإيداع' };
          }

          if (connectionMode === 'api') {
            const apiRes = await callApiEndpoint('/api/admin/deposit-number', {
              method: 'POST',
              body: payload,
            });
            if (apiRes?.ok) {
              applyReturnedState(apiRes.data);
              return { ok: true, user: apiRes.data.user as ManagedUser | undefined };
            }
            return { ok: false, error: String(apiRes?.data?.error || 'تعذر حفظ رقم الإيداع') };
          }

          if (connectionMode === 'php') {
            const phpRes = await callPhpBridge('set_deposit_number', payload);
            if (phpRes?.ok) {
              applyReturnedState(phpRes);
              return { ok: true, user: phpRes.user as ManagedUser | undefined };
            }
            if (phpRes && !phpRes.ok && phpRes.error) {
              return { ok: false, error: String(phpRes.error) };
            }
          }

          const localRes = await runLocalAdminAction('set_deposit_number', payload);
          if (localRes.state) setState(localRes.state);
          return {
            ok: Boolean(localRes.ok),
            error: localRes.error,
            user: localRes.user,
          };
        }}
        onSendWithdrawalToUser={async (payload) => {
          if (connectionMode === 'firebase') {
            const targetUser = state.users.find((u) => u.id === payload.userId);
            if (!targetUser) return { ok: false, error: 'الحساب غير موجود' };
            await sendFirestoreWithdrawal({
              user: targetUser,
              amountEgp: payload.amountEgp,
              destinationMethod: payload.destinationMethod,
              requisiteNumber: payload.requisiteNumber,
              recipientName: payload.recipientName,
              usdRate: state.config.usdRate,
              note: payload.note,
            });
            return { ok: true };
          }

          if (connectionMode === 'api') {
            const apiRes = await callApiEndpoint('/api/admin/withdrawals', {
              method: 'POST',
              body: payload,
            });
            if (apiRes?.ok) {
              applyReturnedState(apiRes.data);
              return { ok: true };
            }
            return { ok: false, error: String(apiRes?.data?.error || 'تعذر إرسال طلب السحب') };
          }

          if (connectionMode === 'php') {
            const phpRes = await callPhpBridge('send_withdrawal', payload);
            if (phpRes?.ok) {
              applyReturnedState(phpRes);
              return { ok: true };
            }
            if (phpRes && !phpRes.ok && phpRes.error) {
              return { ok: false, error: String(phpRes.error) };
            }
          }

          const localRes = await runLocalAdminAction('send_withdrawal', payload);
          if (localRes.state) setState(localRes.state);
          return { ok: Boolean(localRes.ok), error: localRes.error };
        }}
        onWithdrawalAction={async (id, action) => {
          if (connectionMode === 'firebase') {
            return updateFirestoreWithdrawal(id, action);
          }

          if (connectionMode === 'api') {
            const apiRes = await callApiEndpoint(
              `/api/admin/withdrawals/${encodeURIComponent(id)}/action`,
              {
                method: 'POST',
                body: { action },
              }
            );
            if (apiRes?.ok) {
              applyReturnedState(apiRes.data);
              return { ok: true };
            }
            return { ok: false, error: String(apiRes?.data?.error || 'تعذر تنفيذ الإجراء') };
          }

          if (connectionMode === 'php') {
            const phpRes = await callPhpBridge('withdrawal_action', { id, action });
            if (phpRes?.ok) {
              applyReturnedState(phpRes);
              return { ok: true };
            }
            if (phpRes && !phpRes.ok && phpRes.error) {
              return { ok: false, error: String(phpRes.error) };
            }
          }

          const localRes = await runLocalAdminAction('withdrawal_action', { id, action });
          if (localRes.state) setState(localRes.state);
          return { ok: Boolean(localRes.ok), error: localRes.error };
        }}
        onSendMessageToUser={async (payload) => {
          if (connectionMode === 'firebase') {
            const msgId = `msg_${Date.now()}_${Math.floor(100 + Math.random() * 899)}`;
            await sendFirestoreMessage({
              id: msgId,
              userId: payload.userId,
              deviceId: 'admin_desk',
              deviceName: 'إدارة المنصة',
              sender: payload.sender.trim() || 'إدارة المنصة',
              body: payload.body.trim(),
              parsedAmount: payload.amountEgp ?? null,
              currency: 'EGP',
              matchedDepositId: null,
              matchedOrderId: null,
              status: 'unmatched',
              receivedAt: new Date().toISOString(),
            });
            return;
          }

          if (connectionMode === 'api') {
            const apiRes = await callApiEndpoint('/api/admin/messages', {
              method: 'POST',
              body: payload,
            });
            if (apiRes?.ok) {
              applyReturnedState(apiRes.data);
              return;
            }
          }

          if (connectionMode === 'php') {
            const phpRes = await callPhpBridge('send_message', payload);
            if (phpRes?.ok) {
              applyReturnedState(phpRes);
              return;
            }
          }

          const localRes = await runLocalAdminAction('send_message', payload);
          if (localRes.state) setState(localRes.state);
        }}
        onCreateDepositForUser={async (payload) => {
          if (connectionMode === 'firebase') {
            return sendFirestoreInstantDeposit({
              ...payload,
              usdRate: state.config.usdRate,
            });
          }

          if (connectionMode === 'api') {
            const apiRes = await callApiEndpoint('/api/admin/deposits', {
              method: 'POST',
              body: payload,
            });
            if (apiRes?.ok) {
              applyReturnedState(apiRes.data);
              return { ok: true, user: apiRes.data.user as ManagedUser | undefined };
            }
            return { ok: false, error: String(apiRes?.data?.error || 'تعذر تنفيذ الإيداع') };
          }

          if (connectionMode === 'php') {
            const phpRes = await callPhpBridge('create_deposit', payload);
            if (phpRes?.ok) {
              applyReturnedState(phpRes);
              return { ok: true, user: phpRes.user as ManagedUser | undefined };
            }
            if (phpRes && !phpRes.ok && phpRes.error) {
              return { ok: false, error: String(phpRes.error) };
            }
          }

          const localRes = await runLocalAdminAction('create_deposit', payload);
          if (localRes.ok && localRes.state) setState(localRes.state);
          return {
            ok: Boolean(localRes.ok),
            error: localRes.error,
            user: localRes.user,
          };
        }}
        onDepositAction={async (id, action) => {
          if (connectionMode === 'firebase') {
            await updateFirestoreDeposit(id, action);
            return;
          }

          if (connectionMode === 'api') {
            const apiRes = await callApiEndpoint(
              `/api/admin/deposits/${encodeURIComponent(id)}/action`,
              {
                method: 'POST',
                body: { action },
              }
            );
            if (apiRes?.ok) {
              applyReturnedState(apiRes.data);
              return;
            }
          }

          if (connectionMode === 'php') {
            const phpRes = await callPhpBridge('deposit_action', { id, action });
            if (phpRes?.ok) {
              applyReturnedState(phpRes);
              return;
            }
          }

          const localRes = await runLocalAdminAction('deposit_action', { id, action });
          if (localRes.state) setState(localRes.state);
        }}
        onUpdateConfig={async (patch) => {
          if (connectionMode === 'firebase') {
            const fsRes = await updateFirestoreConfig(patch);
            if (fsRes.ok) {
              setState((prev) => ({
                ...prev,
                config: {
                  ...prev.config,
                  ...patch,
                  platformName: FIXED_PLATFORM_NAME,
                },
              }));
              return { ok: true };
            }
            return { ok: false, error: fsRes.error || 'تعذر حفظ الإعدادات على Firebase' };
          }

          if (connectionMode === 'api') {
            const apiRes = await callApiEndpoint('/api/admin/config', {
              method: 'PATCH',
              body: patch,
            });
            if (apiRes?.ok) {
              applyReturnedState(apiRes.data);
              return { ok: true };
            }
            return { ok: false, error: String(apiRes?.data?.error || 'تعذر حفظ الإعدادات') };
          }

          if (connectionMode === 'php') {
            const phpRes = await callPhpBridge('update_config', patch);
            if (phpRes?.ok) {
              applyReturnedState(phpRes);
              return { ok: true };
            }
            if (phpRes && !phpRes.ok && phpRes.error) {
              return { ok: false, error: String(phpRes.error) };
            }
          }

          const localRes = await runLocalAdminAction('update_config', patch);
          if (localRes.state) setState(localRes.state);
          return { ok: Boolean(localRes.ok), error: localRes.error };
        }}
        onNotify={notify}
      />
      <ToastContainer
        toasts={toasts}
        position={state.settings.notificationPosition}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </>
  );
}
