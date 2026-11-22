import React, { useCallback, useEffect, useState } from 'react';
import { ToastContainer } from './components/ToastContainer';
import { AdminDashboardPage, ServerConnectionStatus } from './pages/AdminDashboardPage';
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
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [phpAvailable, setPhpAvailable] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ServerConnectionStatus>('connecting');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

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

  // Call PHP bridge (./admin-api.php) when deployed on cPanel / Apache / Nginx with PHP
  const callPhpBridge = useCallback(
    async (action: string, payload?: Record<string, unknown>, tokenOverride?: string | null) => {
      const activeToken = tokenOverride ?? sessionToken;
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
    [sessionToken]
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

  // Boot check: probe PHP bridge status; fall back cleanly to local browser persistence on static hosting
  useEffect(() => {
    let active = true;
    callPhpBridge('status').then((res) => {
      if (!active) return;
      if (res && res.ok === true) {
        setPhpAvailable(true);
        setConnectionStatus('connected');
        setNeedsSetup(Boolean(res.needsSetup));
        setAdminAuthed(Boolean(res.authenticated));
        if (res.authenticated && res.state) {
          applyReturnedState(res);
        }
      } else {
        setPhpAvailable(false);
        setConnectionStatus('offline');
        setNeedsSetup(needsLocalAdminSetup());
      }
    });
    return () => {
      active = false;
    };
  }, [callPhpBridge, applyReturnedState]);

  return (
    <>
      <AdminDashboardPage
        state={state}
        adminAuthed={adminAuthed}
        needsSetup={needsSetup}
        connectionStatus={connectionStatus}
        onAdminSetup={async (pass) => {
          const cleanPass = pass.trim();
          if (phpAvailable) {
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
          if (phpAvailable) {
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
          if (phpAvailable) {
            await callPhpBridge('logout', {});
          }
          setSessionToken(null);
          setAdminAuthed(false);
        }}
        onRefreshAdmin={async () => {
          if (phpAvailable) {
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
          if (phpAvailable) {
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
          if (phpAvailable) {
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
          if (phpAvailable) {
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
          if (phpAvailable) {
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
          if (phpAvailable) {
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
          if (phpAvailable) {
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
          if (phpAvailable) {
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
          if (phpAvailable) {
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
          if (phpAvailable) {
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
          if (phpAvailable) {
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
