import { DepositOrder, ManagedUser, PlatformState, SmsMessage, WithdrawalOrder } from '../types';

export const FIXED_PLATFORM_NAME = 'Nexus Agency';

const STORAGE_KEY = 'nexus_admin_local_db_v1';

interface StoredLocalDb extends PlatformState {
  adminHash?: string | null;
  adminSalt?: string | null;
}

const DEFAULT_STATE: StoredLocalDb = {
  config: {
    platformName: FIXED_PLATFORM_NAME,
    countryCode: 'EG',
    currencyCode: 'EGP',
    usdRate: 49.85,
    defaultDepositNumber: '01000000000',
    depositMethodNumbers: {
      vodafone: '01000000000',
      etisalat: '01100000000',
      orange: '01200000000',
      binance: 'BINANCE-PAY-EG-01',
    },
  },
  users: [],
  onlinePresence: [],
  onlineCount: 0,
  deposits: [],
  withdrawals: [],
  messages: [],
  settings: {
    lang: 'ar',
    tzOffset: 2,
    dateFormat: 'DD.MM.YYYY',
    clockFormat: '24h',
    notificationPosition: 'bottom-left',
  },
  adminHash: null,
  adminSalt: null,
};

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let h1 = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h1 ^= bytes[i];
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0');
}

function randomSalt(): string {
  const arr = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generatePlayerId(users: ManagedUser[]): string {
  const taken = new Set(users.map((u) => u.playerId));
  for (let i = 0; i < 25; i++) {
    const cand = `PL-${Math.floor(10000000 + Math.random() * 89999999)}`;
    if (!taken.has(cand)) return cand;
  }
  return `PL-${Date.now().toString().slice(-8)}`;
}

function loadRawDb(): StoredLocalDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw) as Partial<StoredLocalDb>;
    return {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      config: {
        ...DEFAULT_STATE.config,
        ...(parsed.config ?? {}),
        platformName: FIXED_PLATFORM_NAME,
      },
      users: Array.isArray(parsed.users) ? parsed.users : [],
      deposits: Array.isArray(parsed.deposits) ? parsed.deposits : [],
      withdrawals: Array.isArray(parsed.withdrawals) ? parsed.withdrawals : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      onlinePresence: Array.isArray(parsed.onlinePresence) ? parsed.onlinePresence : [],
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function writeRawDb(db: StoredLocalDb): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...db,
        config: { ...db.config, platformName: FIXED_PLATFORM_NAME },
      })
    );
  } catch {
    // ignore storage quota errors
  }
}

export function stripSecretsForView(db: StoredLocalDb): PlatformState {
  return {
    config: {
      platformName: FIXED_PLATFORM_NAME,
      countryCode: db.config.countryCode || 'EG',
      currencyCode: db.config.currencyCode || 'EGP',
      usdRate: Number(db.config.usdRate) || 49.85,
      defaultDepositNumber: db.config.defaultDepositNumber || '',
      depositMethodNumbers: db.config.depositMethodNumbers ?? {},
    },
    users: (db.users ?? []).map((u) => ({
      ...u,
      password: undefined,
      hasPassword: Boolean(u.hasPassword || u.password),
    })),
    onlinePresence: db.onlinePresence ?? [],
    onlineCount: db.onlinePresence?.length ?? db.onlineCount ?? 0,
    deposits: db.deposits ?? [],
    withdrawals: db.withdrawals ?? [],
    messages: db.messages ?? [],
    settings: db.settings ?? DEFAULT_STATE.settings,
  };
}

export function loadAdminDb(): PlatformState {
  return stripSecretsForView(loadRawDb());
}

export function saveAdminDb(state: PlatformState): void {
  const raw = loadRawDb();
  writeRawDb({
    ...raw,
    config: {
      ...raw.config,
      ...state.config,
      platformName: FIXED_PLATFORM_NAME,
    },
    users: state.users,
    onlinePresence: state.onlinePresence,
    onlineCount: state.onlineCount,
    deposits: state.deposits,
    withdrawals: state.withdrawals,
    messages: state.messages,
    settings: state.settings ?? raw.settings,
  });
}

export function needsLocalAdminSetup(): boolean {
  const raw = loadRawDb();
  return !raw.adminHash;
}

export async function setupLocalAdminPassword(password: string): Promise<{ ok: boolean; error?: string; state?: PlatformState }> {
  const clean = password.trim();
  if (clean.length < 6) {
    return { ok: false, error: 'يجب أن لا تقل كلمة المرور عن 6 أحرف' };
  }
  const db = loadRawDb();
  if (db.adminHash) {
    return { ok: false, error: 'تم إعداد كلمة مرور الإدارة بالفعل' };
  }
  const salt = randomSalt();
  db.adminSalt = salt;
  db.adminHash = await sha256Hex(`${salt}:${clean}`);
  writeRawDb(db);
  return { ok: true, state: stripSecretsForView(db) };
}

export async function verifyLocalAdminPassword(password: string): Promise<{ ok: boolean; error?: string; state?: PlatformState }> {
  const db = loadRawDb();
  if (!db.adminHash || !db.adminSalt) {
    return { ok: false, error: 'يرجى تعيين كلمة مرور الإدارة أولاً' };
  }
  const candidate = await sha256Hex(`${db.adminSalt}:${password.trim()}`);
  if (candidate === db.adminHash) {
    return { ok: true, state: stripSecretsForView(db) };
  }
  return { ok: false, error: 'كلمة مرور الأدمن مش صح' };
}

export async function runLocalAdminAction(
  action: string,
  payload: Record<string, unknown> = {}
): Promise<{ ok: boolean; error?: string; user?: ManagedUser; state?: PlatformState }> {
  const db = loadRawDb();

  if (action === 'create_user') {
    const email = String(payload.email ?? '').trim();
    const pass = String(payload.password ?? '').trim();
    if (!email || !pass) {
      return { ok: false, error: 'البريد وكلمة المرور مطلوبين' };
    }
    if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return { ok: false, error: 'البريد الإلكتروني مسجل من قبل' };
    }
    const prefix = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') || 'agent';
    const playerId = generatePlayerId(db.users);
    const now = new Date().toISOString();
    const user: ManagedUser = {
      id: `usr_${Date.now()}`,
      playerId,
      uuid: crypto.randomUUID ? crypto.randomUUID() : `01a1a848-${Date.now()}`,
      username: String(payload.username ?? `${prefix}_egp`).trim(),
      displayName: String(payload.displayName ?? prefix).trim(),
      email,
      emailLower: email.toLowerCase(),
      hasPassword: true,
      telegramHandle: `@${prefix}`,
      balanceEgp: Math.max(0, Number(payload.balanceEgp) || 0),
      frozenEgp: 0,
      insuranceEgp: null,
      canTrade: true,
      active: payload.active !== false,
      depositFeePct: 3.0,
      withdrawalFeePct: 1.8,
      referralCode: `EG-${playerId.replace('PL-', '')}`,
      referralRatePct: 0.5,
      twoFactorEnabled: true,
      trc20Address: 'TY9xK8mPq7VwRz4nLp3JdXs2kF9aBc7eW1',
      createdAt: now,
    };
    db.users.unshift(user);
    writeRawDb(db);
    return { ok: true, user, state: stripSecretsForView(db) };
  }

  if (action === 'update_user') {
    const userId = String(payload.userId ?? '');
    const patch = (payload.patch ?? {}) as Partial<ManagedUser>;
    db.users = db.users.map((u) => {
      if (u.id !== userId) return u;
      return {
        ...u,
        ...(patch.displayName !== undefined ? { displayName: String(patch.displayName).trim() } : {}),
        ...(patch.email !== undefined
          ? { email: String(patch.email).trim(), emailLower: String(patch.email).trim().toLowerCase() }
          : {}),
        ...(patch.balanceEgp !== undefined ? { balanceEgp: Math.max(0, Number(patch.balanceEgp) || 0) } : {}),
        ...(patch.active !== undefined ? { active: Boolean(patch.active) } : {}),
        ...(patch.canTrade !== undefined ? { canTrade: Boolean(patch.canTrade) } : {}),
        ...(patch.fixedDepositNumber !== undefined ? { fixedDepositNumber: String(patch.fixedDepositNumber).trim() } : {}),
        ...(patch.fixedDepositMethod !== undefined ? { fixedDepositMethod: String(patch.fixedDepositMethod).trim() } : {}),
        ...(patch.password ? { hasPassword: true } : {}),
      };
    });
    writeRawDb(db);
    return { ok: true, state: stripSecretsForView(db) };
  }

  if (action === 'set_deposit_number') {
    const targetId = String(payload.userId ?? '').trim();
    const ident = String(payload.identifier ?? '').trim().toLowerCase();
    const identNoAt = ident.replace(/^@/, '');
    const depositNumber = String(payload.depositNumber ?? '').trim();
    const depositMethod = String(payload.depositMethod ?? '').trim();
    if (!depositNumber) return { ok: false, error: 'اكتب رقم الإيداع الثابت أولاً' };
    const idx = db.users.findIndex(
      (u) =>
        (targetId && u.id === targetId) ||
        (ident &&
          (u.email.toLowerCase() === ident ||
            u.username.toLowerCase().replace(/^@/, '') === identNoAt ||
            (u.playerId || '').toLowerCase() === ident))
    );
    if (idx < 0) return { ok: false, error: 'لم يتم العثور على الحساب بالبريد أو ID اللاعب' };
    db.users[idx].fixedDepositNumber = depositNumber;
    if (depositMethod) db.users[idx].fixedDepositMethod = depositMethod;
    writeRawDb(db);
    return { ok: true, user: db.users[idx], state: stripSecretsForView(db) };
  }

  if (action === 'delete_user') {
    const userId = String(payload.userId ?? '');
    db.users = db.users.filter((u) => u.id !== userId);
    writeRawDb(db);
    return { ok: true, state: stripSecretsForView(db) };
  }

  if (action === 'send_withdrawal') {
    const userId = String(payload.userId ?? '');
    const target = db.users.find((u) => u.id === userId);
    if (!target) return { ok: false, error: 'اختر مستخدم صحيح أولاً' };
    const amount = Math.max(1, Number(payload.amountEgp) || 0);
    const rate = Number(db.config.usdRate) || 49.85;
    const now = new Date().toISOString();
    const wdId = `wd_${Date.now()}`;
    const orderId = `WD-${Math.floor(400000 + Math.random() * 599999)}`;
    const method = String(payload.destinationMethod ?? 'فودافون كاش').trim();
    const reqNum = String(payload.requisiteNumber ?? '01000000000').trim();
    const recName = String(payload.recipientName ?? target.displayName).trim();

    const wd: WithdrawalOrder = {
      id: wdId,
      userId,
      orderId,
      accountId: `acc_${userId}`,
      amountLocal: amount,
      amountUsdt: Number((amount / rate).toFixed(2)),
      incomeUsdt: 0,
      rate,
      destinationMethod: method,
      requisiteNumber: reqNum,
      recipientName: recName,
      status: 'awaiting_confirmation',
      createdAt: now,
      expiresAt: new Date(Date.now() + 1800_000).toISOString(),
      adminCreated: true,
      receiptFiles: [],
    };
    db.withdrawals.unshift(wd);

    const msg: SmsMessage = {
      id: `msg_${Date.now()}`,
      userId,
      deviceId: 'admin_desk',
      deviceName: 'إدارة المنصة',
      sender: 'طلب سحب من الإدارة',
      body:
        String(payload.note ?? '').trim() ||
        `عندك طلب سحب بمبلغ ${amount.toLocaleString('en-US')} ج.م إلى ${method} (${reqNum}). أكّد عشان يتخصم من رصيدك أو ارفض لو مش موافق.`,
      parsedAmount: amount,
      currency: 'EGP',
      matchedDepositId: null,
      matchedOrderId: orderId,
      withdrawalId: wdId,
      withdrawalAmountEgp: amount,
      withdrawalDestination: `${method} · ${reqNum}`,
      withdrawalRecipient: recName,
      withdrawalActionStatus: 'pending_confirmation',
      status: 'unmatched',
      receivedAt: now,
    };
    db.messages.unshift(msg);
    writeRawDb(db);
    return { ok: true, state: stripSecretsForView(db) };
  }

  if (action === 'withdrawal_action') {
    const wdId = String(payload.id ?? '');
    const act = String(payload.action ?? '');
    const w = db.withdrawals.find((item) => item.id === wdId);
    if (w && w.status === 'awaiting_confirmation') {
      if (act === 'confirm') {
        w.status = 'completed';
        w.acceptedAt = new Date().toISOString();
      } else if (act === 'reject') {
        w.status = 'rejected';
      }
      // Note: Player-requested withdrawals NEVER deduct from balanceEgp on confirm or reject
    }
    writeRawDb(db);
    return { ok: true, state: stripSecretsForView(db) };
  }

  if (action === 'send_message') {
    const msg: SmsMessage = {
      id: `msg_${Date.now()}`,
      userId: String(payload.userId ?? ''),
      deviceId: 'admin_desk',
      deviceName: 'لوحة الإدارة',
      sender: String(payload.sender ?? 'إدارة المنصة').trim() || 'إدارة المنصة',
      body: String(payload.body ?? '').trim(),
      parsedAmount: payload.amountEgp ? Number(payload.amountEgp) : null,
      currency: 'EGP',
      matchedDepositId: null,
      matchedOrderId: null,
      status: 'unmatched',
      receivedAt: new Date().toISOString(),
    };
    db.messages.unshift(msg);
    writeRawDb(db);
    return { ok: true, state: stripSecretsForView(db) };
  }

  if (action === 'create_deposit') {
    const targetId = String(payload.userId ?? '').trim();
    const ident = String(payload.identifier ?? '').trim().toLowerCase();
    const identNoAt = ident.replace(/^@/, '');
    const idx = db.users.findIndex(
      (u) =>
        (targetId && u.id === targetId) ||
        (ident &&
          (u.email.toLowerCase() === ident ||
            u.username.toLowerCase().replace(/^@/, '') === identNoAt ||
            (u.playerId || '').toLowerCase() === ident))
    );
    if (idx < 0) {
      return { ok: false, error: 'لم يتم العثور على العميل بالبريد أو اليوزرنيم ده' };
    }
    const amount = Math.max(1, Number(payload.amountEgp) || 0);
    const rate = Number(db.config.usdRate) || 49.85;
    const autoCredit = payload.autoCredit !== false;
    const now = new Date().toISOString();
    if (autoCredit) {
      db.users[idx].balanceEgp = Number(((db.users[idx].balanceEgp || 0) + amount).toFixed(2));
    }
    const targetUser = db.users[idx];
    const dep: DepositOrder = {
      id: `dep_${Date.now()}`,
      userId: targetUser.id,
      orderId: `EG-${Math.floor(884200 + Math.random() * 99999)}`,
      accountId: `acc_${targetUser.id}`,
      amountLocal: amount,
      amountUsdt: Number((amount / rate).toFixed(2)),
      incomeUsdt: 0,
      rate,
      requisiteId: 'req_admin',
      bankName: String(payload.bankName ?? '').trim() || 'إيداع فوري من الإدارة',
      ownerName: targetUser.displayName,
      requisiteNumber: targetUser.username,
      status: autoCredit ? 'completed' : 'pending',
      createdAt: now,
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      confirmedAt: autoCredit ? now : null,
      customerNote: String(payload.note ?? '').trim() || undefined,
    };
    db.deposits.unshift(dep);
    writeRawDb(db);
    return { ok: true, user: targetUser, state: stripSecretsForView(db) };
  }

  if (action === 'deposit_action') {
    const depId = String(payload.id ?? '');
    const act = String(payload.action ?? '');
    const dep = db.deposits.find((d) => d.id === depId);
    if (dep && dep.status === 'pending') {
      if (act === 'confirm') {
        dep.status = 'completed';
        dep.confirmedAt = new Date().toISOString();
        const user = db.users.find((u) => u.id === dep.userId);
        if (user) {
          user.balanceEgp = Number(((user.balanceEgp || 0) + dep.amountLocal).toFixed(2));
        }
      } else if (act === 'cancel') {
        dep.status = 'cancelled';
      }
    }
    writeRawDb(db);
    return { ok: true, state: stripSecretsForView(db) };
  }

  if (action === 'update_config') {
    db.config.platformName = FIXED_PLATFORM_NAME;
    if (payload.usdRate && Number(payload.usdRate) > 0) {
      db.config.usdRate = Number(payload.usdRate);
    }
    if (typeof payload.defaultDepositNumber === 'string') {
      db.config.defaultDepositNumber = payload.defaultDepositNumber.trim();
    }
    if (payload.depositMethodNumbers && typeof payload.depositMethodNumbers === 'object') {
      const m = payload.depositMethodNumbers as Record<string, unknown>;
      db.config.depositMethodNumbers = {
        vodafone: typeof m.vodafone === 'string' ? m.vodafone.trim() : db.config.depositMethodNumbers?.vodafone || '',
        etisalat: typeof m.etisalat === 'string' ? m.etisalat.trim() : db.config.depositMethodNumbers?.etisalat || '',
        orange: typeof m.orange === 'string' ? m.orange.trim() : db.config.depositMethodNumbers?.orange || '',
        binance: typeof m.binance === 'string' ? m.binance.trim() : db.config.depositMethodNumbers?.binance || '',
      };
    }
    if (payload.adminPassword && String(payload.adminPassword).trim()) {
      const nextPass = String(payload.adminPassword).trim();
      if (nextPass.length < 6) {
        return { ok: false, error: 'يجب أن لا تقل كلمة مرور الأدمن عن 6 أحرف' };
      }
      const salt = randomSalt();
      db.adminSalt = salt;
      db.adminHash = await sha256Hex(`${salt}:${nextPass}`);
    }
    writeRawDb(db);
    return { ok: true, state: stripSecretsForView(db) };
  }

  return { ok: true, state: stripSecretsForView(db) };
}
