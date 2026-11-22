import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ToastContainer } from './components/ToastContainer';
import {
  AdminDashboardPage,
  ConnectionMode,
  ServerConnectionStatus,
  StorageMode,
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

const SERVER_URL_STORAGE_KEY = 'nexus_dashboard_server_url';
const ADMIN_TOKEN_STORAGE_KEY = 'nexus_dashboard_admin_token';

function normalizeServerUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return `https://${trimmed}`;
}

function getInitialServerUrl(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('api') || params.get('server');
    if (fromQuery) {
      const normalized = normalizeServerUrl(fromQuery);
      if (normalized) {
        localStorage.setItem(SERVER_URL_STORAGE_KEY, normalized);
        return normalized;
      }
    }
    const stored = localStorage.getItem(SERVER_URL_STORAGE_KEY);
    if (stored) return normalizeServerUrl(stored);
    const envUrl = (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL;
    if (envUrl) return normalizeServerUrl(envUrl);
  } catch {
    // ignore storage errors
  }
  return '';
}

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
            <div className="text-[12.5px] text-[#cbb6b9] font-mono-num">{this.state.message}</div>
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
  const [serverUrl, setServerUrl] = useState<string>(() => getInitialServerUrl());
  const [sessionToken, setSessionTokenState] = useState<string | null>(() => loadStoredToken());
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('local');
  const [storageMode, setStorageMode] = useState<StorageMode | undefined>(undefined);
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

  const callApiEndpoint = useCallback(
    async (
      baseUrl: string,
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
        const target = `${baseUrl}${path}`;
        const res = await fetch(target, {
          method,
          headers,
          credentials: baseUrl ? 'omit' : 'include',
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

  // Call PHP bridge (./admin-api.php) when deployed on cPanel / Apache / Nginx with PHP
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
    async (explicitBase?: string): Promise<{ ok: boolean; mode: ConnectionMode; error?: string }> => {
      setConnectionStatus('connecting');
      const targetBase = explicitBase !== undefined ? normalizeServerUrl(explicitBase) : serverUrl;

      // 1. Try explicit Remote Server URL OR same-origin Node/Vercel /api/*
      const apiBaseToTry = targetBase || '';
      const apiRes = await callApiEndpoint(apiBaseToTry, '/api/admin/auth-status');
      if (apiRes && typeof apiRes.data.needsSetup === 'boolean') {
        setConnectionMode('api');
        setConnectionStatus('connected');
        setStorageMode((apiRes.data.storageMode as StorageMode | undefined) ?? undefined);
        setNeedsSetup(Boolean(apiRes.data.needsSetup));
        setAdminAuthed(Boolean(apiRes.data.authenticated));
        if (apiRes.data.authenticated && apiRes.data.state) {
          applyReturnedState(apiRes.data);
        }
        return { ok: true, mode: 'api' };
      }

      if (explicitBase && explicitBase.trim()) {
        setConnectionStatus('offline');
        setConnectionMode('local');
        return {
          ok: false,
          mode: 'local',
          error: 'تعذر الوصول لسيرفر المنصة على الرابط ده — تأكد إن الموقع الرئيسي منشور وشغال',
        };
      }

      // 2. Try PHP bridge (./admin-api.php)
      const phpRes = await callPhpBridge('status');
      if (phpRes && phpRes.ok === true) {
        setConnectionMode('php');
        setConnectionStatus('connected');
        setStorageMode('disk');
        setNeedsSetup(Boolean(phpRes.needsSetup));
        setAdminAuthed(Boolean(phpRes.authenticated));
        if (phpRes.authenticated && phpRes.state) {
          applyReturnedState(phpRes);
        }
        return { ok: true, mode: 'php' };
      }

      // 3. Fallback to local browser persistence
      setConnectionMode('local');
      setConnectionStatus('offline');
      setStorageMode(undefined);
      setNeedsSetup(needsLocalAdminSetup());
      return { ok: false, mode: 'local' };
    },
    [serverUrl, callApiEndpoint, callPhpBridge, applyReturnedState]
  );

  // Initial boot check
  useEffect(() => {
    probeBackend().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveServerUrl = useCallback(
    async (rawUrl: string): Promise<{ ok: boolean; error?: string }> => {
      const normalized = normalizeServerUrl(rawUrl);
      setServerUrl(normalized);
      try {
        if (normalized) {
          localStorage.setItem(SERVER_URL_STORAGE_KEY, normalized);
        } else {
          localStorage.removeItem(SERVER_URL_STORAGE_KEY);
        }
      } catch {
        // ignore storage errors
      }
      setSessionToken(null);
      setAdminAuthed(false);
      const probe = await probeBackend(normalized);
      if (normalized && !probe.ok) {
        return { ok: false, error: probe.error };
      }
      return { ok: true };
    },
    [probeBackend, setSessionToken]
  );

  const activeApiBase = serverUrl;

  return (
    <>
      <AdminDashboardPage
        state={state}
        adminAuthed={adminAuthed}
        needsSetup={needsSetup}
        connectionStatus={connectionStatus}
        connectionMode={connectionMode}
        storageMode={storageMode}
        serverUrl={serverUrl}
        onSaveServerUrl={handleSaveServerUrl}
        onAdminSetup={async (pass) => {
          const cleanPass = pass.trim();
          if (connectionMode === 'api') {
            const apiRes = await callApiEndpoint(activeApiBase, '/api/admin/setup', {
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
          if (connectionMode === 'api') {
            const apiAuth = await callApiEndpoint(activeApiBase, '/api/admin/login', {
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
            await callApiEndpoint(activeApiBase, '/api/admin/logout', { method: 'POST' });
          } else if (connectionMode === 'php') {
            await callPhpBridge('logout', {});
          }
          setSessionToken(null);
          setAdminAuthed(false);
        }}
        onRefreshAdmin={async () => {
          if (connectionMode === 'api') {
            const apiState = await callApiEndpoint(activeApiBase, '/api/admin/state');
            if (apiState?.ok) {
              setConnectionStatus('connected');
              if (apiState.data.storageMode) {
                setStorageMode(apiState.data.storageMode as StorageMode);
              }
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
          setState(loadAdminDb());
        }}
        onCreateUser={async (payload) => {
          if (connectionMode === 'api') {
            const apiRes = await callApiEndpoint(activeApiBase, '/api/admin/users', {
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

          if (connectionMode === 'php') {
            const phpRes = await callPhpBridge('create_user', payload);
            if (phpRes?.ok && phpRes.user) {
              applyReturnedState(phpRes);
              return { ok: true, user: phpRes.user as ManagedUser };
            }
            if (phpRes && !phpRes.ok && phpRes.error) {
              return { ok: false, error: String(phpRes.error) };
            }
          }

          const localRes = await runLocalAdminAction('create_user', payload);
          if (localRes.ok && localRes.state) setState(localRes.state);
          return {
            ok: Boolean(localRes.ok),
            error: localRes.error,
            user: localRes.user,
          };
        }}
        onUpdateUser={async (userId, patch) => {
          if (connectionMode === 'api') {
            const apiRes = await callApiEndpoint(
              activeApiBase,
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
          if (connectionMode === 'api') {
            const apiRes = await callApiEndpoint(
              activeApiBase,
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
          if (connectionMode === 'api') {
            const apiRes = await callApiEndpoint(activeApiBase, '/api/admin/deposit-number', {
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
          if (connectionMode === 'api') {
            const apiRes = await callApiEndpoint(activeApiBase, '/api/admin/withdrawals', {
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
          if (connectionMode === 'api') {
            const apiRes = await callApiEndpoint(
              activeApiBase,
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
          if (connectionMode === 'api') {
            const apiRes = await callApiEndpoint(activeApiBase, '/api/admin/messages', {
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
          if (connectionMode === 'api') {
            const apiRes = await callApiEndpoint(activeApiBase, '/api/admin/deposits', {
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
          if (connectionMode === 'api') {
            const apiRes = await callApiEndpoint(
              activeApiBase,
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
          if (connectionMode === 'api') {
            const apiRes = await callApiEndpoint(activeApiBase, '/api/admin/config', {
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
