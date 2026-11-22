import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  runTransaction,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { DepositOrder, ManagedUser, OnlinePresenceEntry, PlatformConfig, SmsMessage, WithdrawalOrder } from '../types';

export const FIXED_PLATFORM_NAME = 'Nexus Agency';

export const firebaseConfig = {
  apiKey: 'AIzaSyBvG-eGAih3HUmcnFQsIDZZWUEs4eeFVKA',
  authDomain: 'moorrcv.firebaseapp.com',
  projectId: 'moorrcv',
  storageBucket: 'moorrcv.firebasestorage.app',
  messagingSenderId: '511044160505',
  appId: '1:511044160505:web:c2372a921d5fa01dc90b28',
  measurementId: 'G-F1M5B7V74R',
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firestoreDb = getFirestore(app);

if (typeof window !== 'undefined') {
  isAnalyticsSupported()
    .then((ok) => {
      if (ok) getAnalytics(app);
    })
    .catch(() => undefined);
}

const DEFAULT_CONFIG: PlatformConfig = {
  platformName: FIXED_PLATFORM_NAME,
  countryCode: 'EG',
  currencyCode: 'EGP',
  usdRate: 49.85,
  defaultDepositNumber: '',
  depositMethodNumbers: {
    vodafone: '',
    etisalat: '',
    orange: '',
    binance: '',
  },
};

export type FirestoreProbeResult = {
  ok: boolean;
  reason?: 'api_disabled' | 'permission_denied' | 'offline';
  message?: string;
};

let cachedProbe: { ts: number; result: FirestoreProbeResult } | null = null;

export function clearFirestoreProbeCache(): void {
  cachedProbe = null;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
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
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(arr);
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

export async function probeFirestoreServer(): Promise<FirestoreProbeResult> {
  if (cachedProbe && Date.now() - cachedProbe.ts < 8000) {
    return cachedProbe.result;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const restUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/platform_meta/config?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
    const res = await fetch(restUrl, { method: 'GET', signal: controller.signal }).finally(() =>
      clearTimeout(timer)
    );

    if (res.status === 200 || res.status === 404) {
      const result: FirestoreProbeResult = { ok: true };
      cachedProbe = { ts: Date.now(), result };
      return result;
    }

    const bodyText = await res.text().catch(() => '');
    let result: FirestoreProbeResult;
    if (
      bodyText.includes('SERVICE_DISABLED') ||
      bodyText.includes('has not been used in project') ||
      bodyText.includes('it is disabled')
    ) {
      result = {
        ok: false,
        reason: 'api_disabled',
        message: 'يلزم تفعيل Cloud Firestore في مشروع Firebase (moorrcv)',
      };
    } else if (res.status === 403 || bodyText.includes('PERMISSION_DENIED')) {
      result = {
        ok: false,
        reason: 'permission_denied',
        message: 'صلاحيات Firestore Rules مرفوضة في مشروع moorrcv',
      };
    } else {
      result = {
        ok: false,
        reason: 'offline',
        message: 'تعذر الاتصال بسيرفر Firebase',
      };
    }
    cachedProbe = { ts: Date.now(), result };
    return result;
  } catch {
    const result: FirestoreProbeResult = {
      ok: false,
      reason: 'offline',
      message: 'تعذر الاتصال بسيرفر Firebase',
    };
    cachedProbe = { ts: Date.now(), result };
    return result;
  }
}

export async function getFirestoreAdminStatus(): Promise<{
  ok: boolean;
  needsSetup: boolean;
  reason?: FirestoreProbeResult['reason'];
}> {
  const probe = await probeFirestoreServer();
  if (!probe.ok) {
    return { ok: false, needsSetup: true, reason: probe.reason };
  }
  try {
    const snap = await getDoc(doc(firestoreDb, 'platform_meta', 'config'));
    const data = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
    const hasHash = Boolean(data?.adminHash && data?.adminSalt);
    return { ok: true, needsSetup: !hasHash };
  } catch {
    return { ok: false, needsSetup: true, reason: 'offline' };
  }
}

export async function setupFirestoreAdminPassword(
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const clean = password.trim();
  if (clean.length < 6) {
    return { ok: false, error: 'يجب أن لا تقل كلمة المرور عن 6 أحرف' };
  }
  const probe = await probeFirestoreServer();
  if (!probe.ok) return { ok: false, error: probe.message };

  const cfgRef = doc(firestoreDb, 'platform_meta', 'config');
  const snap = await getDoc(cfgRef);
  const existing = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
  if (existing.adminHash && existing.adminSalt) {
    return { ok: false, error: 'تم إعداد كلمة مرور الإدارة مسبقًا' };
  }

  const salt = randomSalt();
  const hash = await sha256Hex(`${salt}:${clean}`);
  await setDoc(
    cfgRef,
    {
      ...DEFAULT_CONFIG,
      ...existing,
      platformName: FIXED_PLATFORM_NAME,
      adminSalt: salt,
      adminHash: hash,
    },
    { merge: true }
  );
  return { ok: true };
}

export async function verifyFirestoreAdminPassword(
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const clean = password.trim();
  if (!clean) return { ok: false, error: 'أدخل كلمة مرور الإدارة' };
  const probe = await probeFirestoreServer();
  if (!probe.ok) return { ok: false, error: probe.message };

  const snap = await getDoc(doc(firestoreDb, 'platform_meta', 'config'));
  if (!snap.exists()) {
    return { ok: false, error: 'يرجى تعيين كلمة مرور الإدارة أولاً' };
  }
  const data = snap.data() as Record<string, unknown>;
  const salt = String(data.adminSalt || '');
  const hash = String(data.adminHash || '');
  if (!salt || !hash) {
    return { ok: false, error: 'يرجى تعيين كلمة مرور الإدارة أولاً' };
  }
  const cand = await sha256Hex(`${salt}:${clean}`);
  if (cand === hash) return { ok: true };
  return { ok: false, error: 'كلمة مرور الأدمن مش صحيحة' };
}

function sanitizeFirestoreUser(raw: Record<string, unknown>): ManagedUser {
  return {
    id: String(raw.id || ''),
    playerId: String(raw.playerId || ''),
    uuid: String(raw.uuid || ''),
    username: String(raw.username || ''),
    displayName: String(raw.displayName || ''),
    email: String(raw.email || ''),
    emailLower: String(raw.emailLower || ''),
    hasPassword: Boolean(raw.passwordHash || raw.hasPassword),
    telegramHandle: String(raw.telegramHandle || ''),
    balanceEgp: Number(raw.balanceEgp || 0),
    frozenEgp: Number(raw.frozenEgp || 0),
    insuranceEgp: (raw.insuranceEgp as number | null) ?? null,
    canTrade: raw.canTrade !== false,
    active: raw.active !== false,
    depositFeePct: Number(raw.depositFeePct ?? 3.0),
    withdrawalFeePct: Number(raw.withdrawalFeePct ?? 1.8),
    referralCode: String(raw.referralCode || ''),
    referralRatePct: Number(raw.referralRatePct ?? 0.5),
    twoFactorEnabled: raw.twoFactorEnabled !== false,
    trc20Address: String(raw.trc20Address || 'TY9xK8mPq7VwRz4nLp3JdXs2kF9aBc7eW1'),
    fixedDepositNumber: String(raw.fixedDepositNumber || ''),
    fixedDepositMethod: String(raw.fixedDepositMethod || ''),
    createdAt: String(raw.createdAt || new Date().toISOString()),
  };
}

export async function fetchFirestoreUsers(): Promise<{ ok: boolean; users?: ManagedUser[] }> {
  const probe = await probeFirestoreServer();
  if (!probe.ok) return { ok: false };
  const snap = await getDocs(collection(firestoreDb, 'users'));
  const users = snap.docs
    .map((d) => sanitizeFirestoreUser({ ...d.data(), id: d.id }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return { ok: true, users };
}

export function subscribeAdminCollections(callbacks: {
  onConfig: (cfg: PlatformConfig) => void;
  onUsers: (users: ManagedUser[]) => void;
  onPresence: (entries: OnlinePresenceEntry[]) => void;
  onWithdrawals: (items: WithdrawalOrder[]) => void;
  onDeposits: (items: DepositOrder[]) => void;
  onMessages: (items: SmsMessage[]) => void;
}): () => void {
  const unsubs: Array<() => void> = [];

  unsubs.push(
    onSnapshot(
      doc(firestoreDb, 'platform_meta', 'config'),
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data() as Record<string, unknown>;
        callbacks.onConfig({
          platformName: FIXED_PLATFORM_NAME,
          countryCode: (d.countryCode as PlatformConfig['countryCode']) || 'EG',
          currencyCode: String(d.currencyCode || 'EGP'),
          usdRate: Math.max(1, Number(d.usdRate) || 49.85),
          defaultDepositNumber: String(d.defaultDepositNumber || ''),
          depositMethodNumbers: {
            vodafone: String(
              (d.depositMethodNumbers as Record<string, unknown> | undefined)?.vodafone || ''
            ),
            etisalat: String(
              (d.depositMethodNumbers as Record<string, unknown> | undefined)?.etisalat || ''
            ),
            orange: String(
              (d.depositMethodNumbers as Record<string, unknown> | undefined)?.orange || ''
            ),
            binance: String(
              (d.depositMethodNumbers as Record<string, unknown> | undefined)?.binance || ''
            ),
          },
        });
      },
      () => undefined
    )
  );

  unsubs.push(
    onSnapshot(
      collection(firestoreDb, 'users'),
      (snap) => {
        const list = snap.docs
          .map((d) => sanitizeFirestoreUser({ ...d.data(), id: d.id }))
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        callbacks.onUsers(list);
      },
      () => undefined
    )
  );

  unsubs.push(
    onSnapshot(
      collection(firestoreDb, 'online_presence'),
      (snap) => {
        const now = Date.now();
        const active = snap.docs
          .map((d) => d.data() as OnlinePresenceEntry & { lastPingMs?: number })
          .filter((entry) => {
            const ms =
              typeof entry.lastPingMs === 'number'
                ? entry.lastPingMs
                : Date.parse(entry.lastPingAt || '');
            return Number.isFinite(ms) && now - ms <= 45000;
          });
        callbacks.onPresence(active);
      },
      () => undefined
    )
  );

  unsubs.push(
    onSnapshot(
      collection(firestoreDb, 'withdrawals'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ ...(d.data() as WithdrawalOrder), id: d.id }))
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        callbacks.onWithdrawals(list);
      },
      () => undefined
    )
  );

  unsubs.push(
    onSnapshot(
      collection(firestoreDb, 'deposits'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ ...(d.data() as DepositOrder), id: d.id }))
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        callbacks.onDeposits(list);
      },
      () => undefined
    )
  );

  unsubs.push(
    onSnapshot(
      collection(firestoreDb, 'messages'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ ...(d.data() as SmsMessage), id: d.id }))
          .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
        callbacks.onMessages(list);
      },
      () => undefined
    )
  );

  return () => {
    for (const u of unsubs) u();
  };
}

export async function createFirestoreUser(payload: {
  email: string;
  password: string;
  displayName: string;
  username: string;
  balanceEgp?: number;
  active?: boolean;
}): Promise<{ ok: boolean; error?: string; user?: ManagedUser }> {
  const email = payload.email.trim();
  const password = payload.password.trim();
  if (!email || !password) {
    return { ok: false, error: 'البريد وكلمة المرور مطلوبان' };
  }
  const emailLower = email.toLowerCase();

  const existingSnap = await getDocs(collection(firestoreDb, 'users'));
  const existingUsers = existingSnap.docs.map((d) =>
    sanitizeFirestoreUser({ ...d.data(), id: d.id })
  );
  if (existingUsers.some((u) => u.email.trim().toLowerCase() === emailLower)) {
    return { ok: false, error: 'البريد الإلكتروني مسجل من قبل' };
  }

  const prefix = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') || 'agent';
  const playerId = generatePlayerId(existingUsers);
  const id = `usr_${Date.now()}_${Math.floor(100 + Math.random() * 899)}`;
  const salt = randomSalt();
  const passwordHash = await sha256Hex(`${salt}:${password}`);

  const rawUser: ManagedUser & { passwordSalt: string; passwordHash: string } = {
    id,
    playerId,
    uuid:
      typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID
        ? globalThis.crypto.randomUUID()
        : `01a1a848-${Date.now()}`,
    username: (payload.username || `${prefix}_egp`).trim(),
    displayName: (payload.displayName || prefix).trim(),
    email,
    emailLower,
    passwordSalt: salt,
    passwordHash,
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
    createdAt: new Date().toISOString(),
  };

  await setDoc(doc(firestoreDb, 'users', id), rawUser);
  return { ok: true, user: sanitizeFirestoreUser(rawUser as unknown as Record<string, unknown>) };
}

export async function updateFirestoreUser(
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
): Promise<{ ok: boolean; error?: string }> {
  const userRef = doc(firestoreDb, 'users', userId);
  const updates: Record<string, unknown> = {};
  if (typeof patch.displayName === 'string' && patch.displayName.trim()) {
    updates.displayName = patch.displayName.trim();
  }
  if (typeof patch.email === 'string' && patch.email.trim()) {
    const cleanEmail = patch.email.trim();
    const cleanLower = cleanEmail.toLowerCase();
    const all = await getDocs(collection(firestoreDb, 'users'));
    const dup = all.docs.find(
      (d) => d.id !== userId && String(d.data().email || '').trim().toLowerCase() === cleanLower
    );
    if (dup) {
      return { ok: false, error: 'البريد الإلكتروني مستخدم لحساب آخر' };
    }
    updates.email = cleanEmail;
    updates.emailLower = cleanLower;
  }
  if (typeof patch.password === 'string' && patch.password.trim()) {
    const salt = randomSalt();
    updates.passwordSalt = salt;
    updates.passwordHash = await sha256Hex(`${salt}:${patch.password.trim()}`);
    updates.hasPassword = true;
  }
  if (typeof patch.balanceEgp === 'number' && Number.isFinite(patch.balanceEgp)) {
    updates.balanceEgp = Math.max(0, Math.round(patch.balanceEgp * 100) / 100);
  }
  if (typeof patch.active === 'boolean') updates.active = patch.active;
  if (typeof patch.canTrade === 'boolean') updates.canTrade = patch.canTrade;
  if (typeof patch.fixedDepositNumber === 'string') {
    updates.fixedDepositNumber = patch.fixedDepositNumber.trim();
  }
  if (typeof patch.fixedDepositMethod === 'string') {
    updates.fixedDepositMethod = patch.fixedDepositMethod.trim();
  }
  await updateDoc(userRef, updates);
  return { ok: true };
}

export async function deleteFirestoreUser(userId: string): Promise<void> {
  await deleteDoc(doc(firestoreDb, 'users', userId));
}

export async function setFirestoreDepositNumber(payload: {
  userId?: string;
  identifier?: string;
  depositNumber: string;
  depositMethod?: string;
}): Promise<{ ok: boolean; error?: string; user?: ManagedUser }> {
  const depositNumber = payload.depositNumber.trim();
  if (!depositNumber) return { ok: false, error: 'اكتب رقم الإيداع الثابت أولاً' };
  const targetId = (payload.userId || '').trim();
  const ident = (payload.identifier || '').trim().toLowerCase();
  const identNoAt = ident.replace(/^@/, '');

  const snap = await getDocs(collection(firestoreDb, 'users'));
  const found = snap.docs.find((d) => {
    if (targetId && d.id === targetId) return true;
    if (!ident) return false;
    const data = d.data();
    const uEmail = String(data.email || '').trim().toLowerCase();
    const uUser = String(data.username || '').trim().toLowerCase().replace(/^@/, '');
    const uPid = String(data.playerId || '').trim().toLowerCase();
    return uEmail === ident || uUser === identNoAt || uPid === ident;
  });

  if (!found) {
    return { ok: false, error: 'لم يتم العثور على الحساب بالبريد أو ID اللاعب' };
  }

  const updates: Record<string, unknown> = { fixedDepositNumber: depositNumber };
  if (payload.depositMethod?.trim()) {
    updates.fixedDepositMethod = payload.depositMethod.trim();
  }
  await updateDoc(doc(firestoreDb, 'users', found.id), updates);
  const updated = sanitizeFirestoreUser({ ...found.data(), ...updates, id: found.id });
  return { ok: true, user: updated };
}

export async function sendFirestoreWithdrawal(params: {
  user: ManagedUser;
  amountEgp: number;
  destinationMethod: string;
  requisiteNumber: string;
  recipientName: string;
  usdRate: number;
  note?: string;
}): Promise<void> {
  const amount = Math.max(1, Number(params.amountEgp) || 0);
  const rate = Math.max(1, Number(params.usdRate) || 49.85);
  const now = new Date().toISOString();
  const wdId = `wd_${Date.now()}_${Math.floor(100 + Math.random() * 899)}`;
  const msgId = `msg_${Date.now()}_${Math.floor(100 + Math.random() * 899)}`;
  const orderId = `WD-${Math.floor(400000 + Math.random() * 599999)}`;

  const wdDoc: WithdrawalOrder = {
    id: wdId,
    userId: params.user.id,
    orderId,
    accountId: `acc_${params.user.id}`,
    amountLocal: amount,
    amountUsdt: Number((amount / rate).toFixed(2)),
    incomeUsdt: 0,
    rate,
    destinationMethod: params.destinationMethod.trim() || 'فودافون كاش',
    requisiteNumber: params.requisiteNumber.trim() || '01000000000',
    recipientName: params.recipientName.trim() || params.user.displayName,
    status: 'awaiting_confirmation',
    createdAt: now,
    expiresAt: new Date(Date.now() + 1800_000).toISOString(),
    adminCreated: true,
    receiptFiles: [],
  };

  const msgDoc: SmsMessage = {
    id: msgId,
    userId: params.user.id,
    deviceId: 'admin_desk',
    deviceName: 'إدارة المنصة',
    sender: 'طلب سحب من الإدارة',
    body:
      (params.note || '').trim() ||
      `طلب سحب جديد بقيمة ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م إلى (${wdDoc.destinationMethod} - ${wdDoc.requisiteNumber}). برجاء التأكيد لخصم المبلغ أو الرفض.`,
    parsedAmount: amount,
    currency: 'EGP',
    matchedDepositId: null,
    matchedOrderId: orderId,
    withdrawalId: wdId,
    withdrawalAmountEgp: amount,
    withdrawalDestination: `${wdDoc.destinationMethod} · ${wdDoc.requisiteNumber}`,
    withdrawalRecipient: wdDoc.recipientName,
    withdrawalActionStatus: 'pending_confirmation',
    status: 'unmatched',
    receivedAt: now,
  };

  await setDoc(doc(firestoreDb, 'withdrawals', wdId), wdDoc);
  await setDoc(doc(firestoreDb, 'messages', msgId), msgDoc);
}

export async function updateFirestoreWithdrawal(
  id: string,
  action: 'confirm' | 'reject'
): Promise<{ ok: boolean; error?: string }> {
  const wdRef = doc(firestoreDb, 'withdrawals', id);
  const snap = await getDoc(wdRef);
  if (!snap.exists()) return { ok: false, error: 'طلب السحب غير موجود' };
  const w = snap.data() as WithdrawalOrder;
  if (w.status !== 'awaiting_confirmation') return { ok: true };

  const nextStatus = action === 'confirm' ? 'completed' : 'rejected';
  await updateDoc(wdRef, {
    status: nextStatus,
    ...(action === 'confirm' ? { acceptedAt: new Date().toISOString() } : {}),
  });

  if (w.userId) {
    const msgId = `msg_${Date.now()}_${Math.floor(100 + Math.random() * 899)}`;
    const msgDoc: SmsMessage = {
      id: msgId,
      userId: w.userId,
      deviceId: 'admin_desk',
      deviceName: 'إدارة المنصة',
      sender: action === 'confirm' ? 'تأكيد طلب السحب' : 'رفض طلب السحب',
      body:
        action === 'confirm'
          ? `تمت الموافقة على طلب السحب (${w.orderId}) بقيمة ${Number(w.amountLocal).toLocaleString('en-US')} ج.م.`
          : `تم رفض طلب السحب (${w.orderId}) بقيمة ${Number(w.amountLocal).toLocaleString('en-US')} ج.م من الإدارة.`,
      parsedAmount: w.amountLocal,
      currency: 'EGP',
      matchedDepositId: null,
      matchedOrderId: w.orderId,
      status: action === 'confirm' ? 'matched' : 'ignored',
      receivedAt: new Date().toISOString(),
    };
    await setDoc(doc(firestoreDb, 'messages', msgId), msgDoc);
  }

  return { ok: true };
}

export async function sendFirestoreMessage(msg: SmsMessage): Promise<void> {
  await setDoc(doc(firestoreDb, 'messages', msg.id), msg);
}

export async function sendFirestoreInstantDeposit(payload: {
  userId?: string;
  identifier?: string;
  amountEgp: number;
  bankName?: string;
  note?: string;
  autoCredit?: boolean;
  usdRate: number;
}): Promise<{ ok: boolean; error?: string; user?: ManagedUser; deposit?: DepositOrder }> {
  const targetId = (payload.userId || '').trim();
  const ident = (payload.identifier || '').trim().toLowerCase();
  const identNoAt = ident.replace(/^@/, '');

  const snap = await getDocs(collection(firestoreDb, 'users'));
  const foundDoc = snap.docs.find((d) => {
    if (targetId && d.id === targetId) return true;
    if (!ident) return false;
    const data = d.data();
    const uEmail = String(data.email || '').trim().toLowerCase();
    const uUser = String(data.username || '').trim().toLowerCase().replace(/^@/, '');
    const uPid = String(data.playerId || '').trim().toLowerCase();
    return uEmail === ident || uUser === identNoAt || uPid === ident;
  });

  if (!foundDoc) {
    return { ok: false, error: 'لم يتم العثور على العميل بالبريد أو اليوزرنيم' };
  }

  const amount = Math.max(1, Number(payload.amountEgp) || 0);
  const rate = Math.max(1, Number(payload.usdRate) || 49.85);
  const autoCredit = payload.autoCredit !== false;
  const now = new Date().toISOString();
  const depId = `dep_${Date.now()}_${Math.floor(100 + Math.random() * 899)}`;
  const msgId = `msg_${Date.now()}_${Math.floor(100 + Math.random() * 899)}`;
  const orderId = `EG-${Math.floor(884200 + Math.random() * 99999)}`;

  const updatedUser = await runTransaction(firestoreDb, async (tx) => {
    const uRef = doc(firestoreDb, 'users', foundDoc.id);
    const uSnap = await tx.get(uRef);
    const uData = sanitizeFirestoreUser({ ...(uSnap.data() || {}), id: foundDoc.id });
    if (autoCredit) {
      const nextBal = Number(((uData.balanceEgp || 0) + amount).toFixed(2));
      tx.update(uRef, { balanceEgp: nextBal });
      uData.balanceEgp = nextBal;
    }
    return uData;
  });

  const dep: DepositOrder = {
    id: depId,
    userId: updatedUser.id,
    orderId,
    accountId: `acc_${updatedUser.id}`,
    amountLocal: amount,
    amountUsdt: Number((amount / rate).toFixed(2)),
    incomeUsdt: 0,
    rate,
    requisiteId: 'req_admin',
    bankName: (payload.bankName || '').trim() || 'إيداع فوري من الإدارة',
    ownerName: updatedUser.displayName,
    requisiteNumber: updatedUser.username,
    status: autoCredit ? 'completed' : 'pending',
    createdAt: now,
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
    confirmedAt: autoCredit ? now : null,
    customerNote: (payload.note || '').trim() || undefined,
  };

  const msg: SmsMessage = {
    id: msgId,
    userId: updatedUser.id,
    deviceId: 'admin_desk',
    deviceName: 'إدارة المنصة',
    sender: 'إيداع رصيد فوري',
    body:
      (payload.note || '').trim() ||
      `تم إيداع مبلغ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م في حسابك (${updatedUser.email}) بنجاح.`,
    parsedAmount: amount,
    currency: 'EGP',
    matchedDepositId: depId,
    matchedOrderId: orderId,
    status: 'matched',
    receivedAt: now,
  };

  await setDoc(doc(firestoreDb, 'deposits', depId), dep);
  await setDoc(doc(firestoreDb, 'messages', msgId), msg);
  return { ok: true, user: updatedUser, deposit: dep };
}

export async function updateFirestoreDeposit(
  id: string,
  action: 'confirm' | 'cancel'
): Promise<void> {
  const depRef = doc(firestoreDb, 'deposits', id);
  await runTransaction(firestoreDb, async (tx) => {
    const depSnap = await tx.get(depRef);
    if (!depSnap.exists()) return;
    const dep = depSnap.data() as DepositOrder;
    if (dep.status !== 'pending') return;

    const uRef = dep.userId ? doc(firestoreDb, 'users', dep.userId) : null;
    const uSnap = uRef ? await tx.get(uRef) : null;

    if (action === 'confirm') {
      tx.update(depRef, { status: 'completed', confirmedAt: new Date().toISOString() });
      if (uRef && uSnap && uSnap.exists()) {
        const curBal = Number(uSnap.data().balanceEgp || 0);
        const nextBal = Number((curBal + Number(dep.amountLocal || 0)).toFixed(2));
        tx.update(uRef, { balanceEgp: nextBal });
      }
    } else {
      tx.update(depRef, { status: 'cancelled' });
    }
  });

  const depSnapAfter = await getDoc(depRef);
  if (depSnapAfter.exists()) {
    const dep = depSnapAfter.data() as DepositOrder;
    if (dep.userId) {
      const msgId = `msg_${Date.now()}_${Math.floor(100 + Math.random() * 899)}`;
      await setDoc(doc(firestoreDb, 'messages', msgId), {
        id: msgId,
        userId: dep.userId,
        deviceId: 'admin_desk',
        deviceName: 'إدارة المنصة',
        sender: action === 'confirm' ? 'تأكيد الإيداع' : 'رفض الإيداع',
        body:
          action === 'confirm'
            ? `تمت الموافقة على طلب الإيداع (${dep.orderId}) وإضافة ${Number(dep.amountLocal).toLocaleString('en-US')} ج.م إلى رصيدك.`
            : `تم رفض طلب الإيداع (${dep.orderId}) بمبلغ ${Number(dep.amountLocal).toLocaleString('en-US')} ج.م من الإدارة.`,
        parsedAmount: dep.amountLocal,
        currency: 'EGP',
        matchedDepositId: dep.id,
        matchedOrderId: dep.orderId,
        status: action === 'confirm' ? 'matched' : 'ignored',
        receivedAt: new Date().toISOString(),
      });
    }
  }
}

export async function updateFirestoreConfig(
  patch: Partial<PlatformConfig>
): Promise<{ ok: boolean; error?: string }> {
  const cfgRef = doc(firestoreDb, 'platform_meta', 'config');
  const updates: Record<string, unknown> = {
    platformName: FIXED_PLATFORM_NAME,
  };
  if (typeof patch.usdRate === 'number' && Number.isFinite(patch.usdRate) && patch.usdRate > 0) {
    updates.usdRate = Math.round(patch.usdRate * 100) / 100;
  }
  if (typeof patch.defaultDepositNumber === 'string') {
    updates.defaultDepositNumber = patch.defaultDepositNumber.trim();
  }
  if (patch.depositMethodNumbers) {
    updates.depositMethodNumbers = {
      vodafone: String(patch.depositMethodNumbers.vodafone || '').trim(),
      etisalat: String(patch.depositMethodNumbers.etisalat || '').trim(),
      orange: String(patch.depositMethodNumbers.orange || '').trim(),
      binance: String(patch.depositMethodNumbers.binance || '').trim(),
    };
  }
  if (patch.adminPassword && patch.adminPassword.trim()) {
    const cleanPass = patch.adminPassword.trim();
    if (cleanPass.length < 6) {
      return { ok: false, error: 'يجب أن لا تقل كلمة مرور الأدمن عن 6 أحرف' };
    }
    const salt = randomSalt();
    updates.adminSalt = salt;
    updates.adminHash = await sha256Hex(`${salt}:${cleanPass}`);
  }
  await setDoc(cfgRef, updates, { merge: true });
  return { ok: true };
}
