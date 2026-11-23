import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  runTransaction,
  setDoc,
  updateDoc,
} from 'firebase/firestore/lite';
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

function stripInvisibleChars(value: string): string {
  return value.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '');
}

function pureSha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const bitLen = bytes.length * 8;
  const padLen = ((bytes.length + 9 + 63) >> 6) << 6;
  const padded = new Uint8Array(padLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(padLen - 4, bitLen >>> 0, false);

  const w = new Uint32Array(64);
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < padLen; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3);
      const s1 = rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }
  return Array.from(H)
    .map((v) => v.toString(16).padStart(8, '0'))
    .join('');
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    try {
      const bytes = new TextEncoder().encode(input);
      const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // fall through to pure JS SHA-256
    }
  }
  return pureSha256Hex(input);
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
  if (cachedProbe && cachedProbe.result.ok && Date.now() - cachedProbe.ts < 15000) {
    return cachedProbe.result;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
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
    if (
      bodyText.includes('SERVICE_DISABLED') ||
      bodyText.includes('has not been used in project') ||
      bodyText.includes('it is disabled')
    ) {
      return {
        ok: false,
        reason: 'api_disabled',
        message: 'يلزم تفعيل Cloud Firestore في مشروع Firebase (moorrcv)',
      };
    }
    if (res.status === 403 || bodyText.includes('PERMISSION_DENIED')) {
      return {
        ok: false,
        reason: 'permission_denied',
        message: 'صلاحيات Firestore Rules مرفوضة في مشروع moorrcv',
      };
    }
  } catch {
    // fallback check via Firestore SDK directly
  }

  try {
    await getDoc(doc(firestoreDb, 'platform_meta', 'config'));
    const result: FirestoreProbeResult = { ok: true };
    cachedProbe = { ts: Date.now(), result };
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('PERMISSION_DENIED') || msg.includes('permission-denied')) {
      return {
        ok: false,
        reason: 'permission_denied',
        message: 'صلاحيات Firestore Rules مرفوضة في مشروع moorrcv',
      };
    }
    return {
      ok: false,
      reason: 'offline',
      message: 'تعذر الاتصال بسيرفر Firebase',
    };
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

export async function fetchAdminCollections(): Promise<{
  ok: boolean;
  config?: PlatformConfig;
  users?: ManagedUser[];
  presence?: OnlinePresenceEntry[];
  withdrawals?: WithdrawalOrder[];
  deposits?: DepositOrder[];
  messages?: SmsMessage[];
}> {
  try {
    const [cfgSnap, usersSnap, presSnap, wdSnap, depSnap, msgSnap] = await Promise.all([
      getDoc(doc(firestoreDb, 'platform_meta', 'config')),
      getDocs(collection(firestoreDb, 'users')),
      getDocs(collection(firestoreDb, 'online_presence')),
      getDocs(collection(firestoreDb, 'withdrawals')),
      getDocs(collection(firestoreDb, 'deposits')),
      getDocs(collection(firestoreDb, 'messages')),
    ]);

    let config: PlatformConfig | undefined;
    if (cfgSnap.exists()) {
      const d = cfgSnap.data() as Record<string, unknown>;
      config = {
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
      };
    }

    const users = usersSnap.docs
      .map((d) => sanitizeFirestoreUser({ ...d.data(), id: d.id }))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    const now = Date.now();
    const presence = presSnap.docs
      .map((d) => d.data() as OnlinePresenceEntry & { lastPingMs?: number })
      .filter((entry) => {
        const ms =
          typeof entry.lastPingMs === 'number' ? entry.lastPingMs : Date.parse(entry.lastPingAt || '');
        return Number.isFinite(ms) && now - ms <= 45000;
      });

    const withdrawals = wdSnap.docs
      .map((d) => ({ ...(d.data() as WithdrawalOrder), id: d.id }))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    const deposits = depSnap.docs
      .map((d) => ({ ...(d.data() as DepositOrder), id: d.id }))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    const messages = msgSnap.docs
      .map((d) => ({ ...(d.data() as SmsMessage), id: d.id }))
      .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));

    return { ok: true, config, users, presence, withdrawals, deposits, messages };
  } catch {
    return { ok: false };
  }
}

export function subscribeAdminCollections(callbacks: {
  onConfig: (cfg: PlatformConfig) => void;
  onUsers: (users: ManagedUser[]) => void;
  onPresence: (entries: OnlinePresenceEntry[]) => void;
  onWithdrawals: (items: WithdrawalOrder[]) => void;
  onDeposits: (items: DepositOrder[]) => void;
  onMessages: (items: SmsMessage[]) => void;
}): () => void {
  let stopped = false;

  const syncOnce = async () => {
    const res = await fetchAdminCollections();
    if (stopped || !res.ok) return;
    if (res.config) callbacks.onConfig(res.config);
    if (res.users) callbacks.onUsers(res.users);
    if (res.presence) callbacks.onPresence(res.presence);
    if (res.withdrawals) callbacks.onWithdrawals(res.withdrawals);
    if (res.deposits) callbacks.onDeposits(res.deposits);
    if (res.messages) callbacks.onMessages(res.messages);
  };

  syncOnce().catch(() => undefined);
  const timer = globalThis.setInterval(() => {
    syncOnce().catch(() => undefined);
  }, 3500);

  return () => {
    stopped = true;
    globalThis.clearInterval(timer);
  };
}

async function syncUserRequisiteInFirestore(user: {
  id: string;
  displayName: string;
  depositFeePct?: number;
  fixedDepositNumber?: string;
  fixedDepositMethod?: string;
}): Promise<void> {
  const reqId = `req_${user.id}`;
  const reqRef = doc(firestoreDb, 'requisites', reqId);
  const cleanNum = (user.fixedDepositNumber || '').trim();
  if (!cleanNum) {
    await deleteDoc(reqRef).catch(() => undefined);
    return;
  }
  const methodName = (user.fixedDepositMethod || '').trim() || 'فودافون كاش';
  await setDoc(reqRef, {
    id: reqId,
    userId: user.id,
    accountId: `acc_${user.id}`,
    bankName: methodName,
    ownerName: user.displayName,
    accountNumber: cleanNum,
    type: methodName === 'باينانس' ? 'instapay' : 'wallet',
    minOrder: 100,
    maxOrder: 30000,
    dailyLimit: 150000,
    dailyUsed: 0,
    bidRate: Number(user.depositFeePct ?? 3.0),
    active: true,
  });
}

export async function createFirestoreUser(payload: {
  email: string;
  password: string;
  displayName: string;
  username: string;
  balanceEgp?: number;
  active?: boolean;
  fixedDepositNumber?: string;
  fixedDepositMethod?: string;
}): Promise<{ ok: boolean; error?: string; user?: ManagedUser }> {
  const email = stripInvisibleChars(payload.email).trim();
  const password = stripInvisibleChars(payload.password).trim();
  if (!email || !password) {
    return { ok: false, error: 'البريد وكلمة المرور مطلوبان' };
  }
  const emailLower = email.toLowerCase();

  try {
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
    const fixedDepNum = (payload.fixedDepositNumber || '').trim();
    const fixedDepMethod = fixedDepNum
      ? (payload.fixedDepositMethod || '').trim() || 'فودافون كاش'
      : '';

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
      fixedDepositNumber: fixedDepNum,
      fixedDepositMethod: fixedDepMethod,
      createdAt: new Date().toISOString(),
    };

    await setDoc(doc(firestoreDb, 'users', id), rawUser);
    if (fixedDepNum) {
      await syncUserRequisiteInFirestore(rawUser);
    }
    return { ok: true, user: sanitizeFirestoreUser(rawUser as unknown as Record<string, unknown>) };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? `تعذر الحفظ في Firebase: ${err.message}` : 'تعذر الحفظ في Firebase',
    };
  }
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
  if (typeof patch.email === 'string' && stripInvisibleChars(patch.email).trim()) {
    const cleanEmail = stripInvisibleChars(patch.email).trim();
    const cleanLower = cleanEmail.toLowerCase();
    const all = await getDocs(collection(firestoreDb, 'users'));
    const dup = all.docs.find(
      (d) =>
        d.id !== userId &&
        stripInvisibleChars(String(d.data().email || '')).trim().toLowerCase() === cleanLower
    );
    if (dup) {
      return { ok: false, error: 'البريد الإلكتروني مستخدم لحساب آخر' };
    }
    updates.email = cleanEmail;
    updates.emailLower = cleanLower;
  }
  if (typeof patch.password === 'string' && stripInvisibleChars(patch.password).trim()) {
    const salt = randomSalt();
    updates.passwordSalt = salt;
    updates.passwordHash = await sha256Hex(`${salt}:${stripInvisibleChars(patch.password).trim()}`);
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
  if (typeof patch.fixedDepositNumber === 'string' || typeof patch.fixedDepositMethod === 'string' || typeof patch.displayName === 'string') {
    const freshSnap = await getDoc(userRef);
    if (freshSnap.exists()) {
      const freshUser = sanitizeFirestoreUser({ ...freshSnap.data(), id: freshSnap.id });
      await syncUserRequisiteInFirestore(freshUser);
    }
  }
  return { ok: true };
}

export async function deleteFirestoreUser(userId: string): Promise<void> {
  await deleteDoc(doc(firestoreDb, 'users', userId));
  await deleteDoc(doc(firestoreDb, 'requisites', `req_${userId}`)).catch(() => undefined);
}

export async function setFirestoreDepositNumber(payload: {
  userId?: string;
  identifier?: string;
  depositNumber: string;
  depositMethod?: string;
}): Promise<{ ok: boolean; error?: string; user?: ManagedUser }> {
  const depositNumber = payload.depositNumber.trim();
  if (!depositNumber) return { ok: false, error: 'اكتب رقم المحفظة أو الإيداع الثابت أولاً' };
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
  await syncUserRequisiteInFirestore(updated);
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
  depositNumber?: string;
  saveAsFixed?: boolean;
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
    return { ok: false, error: 'لم يتم العثور على العميل بالبريد أو ID اللاعب' };
  }

  const amount = Math.max(1, Number(payload.amountEgp) || 0);
  const rate = Math.max(1, Number(payload.usdRate) || 49.85);
  const autoCredit = payload.autoCredit !== false;
  const cleanDepNum = (payload.depositNumber || '').trim();
  const saveAsFixed = Boolean(payload.saveAsFixed && cleanDepNum);
  const now = new Date().toISOString();
  const depId = `dep_${Date.now()}_${Math.floor(100 + Math.random() * 899)}`;
  const msgId = `msg_${Date.now()}_${Math.floor(100 + Math.random() * 899)}`;
  const orderId = `EG-${Math.floor(884200 + Math.random() * 99999)}`;

  const updatedUser = await runTransaction(firestoreDb, async (tx) => {
    const uRef = doc(firestoreDb, 'users', foundDoc.id);
    const uSnap = await tx.get(uRef);
    const uData = sanitizeFirestoreUser({ ...(uSnap.data() || {}), id: foundDoc.id });
    const txUpdates: Record<string, unknown> = {};
    if (autoCredit) {
      const nextBal = Number(((uData.balanceEgp || 0) + amount).toFixed(2));
      txUpdates.balanceEgp = nextBal;
      uData.balanceEgp = nextBal;
    }
    if (saveAsFixed) {
      txUpdates.fixedDepositNumber = cleanDepNum;
      uData.fixedDepositNumber = cleanDepNum;
      const bankCandidate = (payload.bankName || '').trim();
      if (bankCandidate) {
        txUpdates.fixedDepositMethod = bankCandidate;
        uData.fixedDepositMethod = bankCandidate;
      }
    }
    if (Object.keys(txUpdates).length > 0) {
      tx.update(uRef, txUpdates);
    }
    return uData;
  });
  if (saveAsFixed) {
    await syncUserRequisiteInFirestore(updatedUser);
  }

  const cleanNote = (payload.note || '').trim();
  const resolvedReqNum = cleanDepNum || updatedUser.fixedDepositNumber || updatedUser.username;
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
    requisiteNumber: resolvedReqNum,
    status: autoCredit ? 'completed' : 'pending',
    createdAt: now,
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
    confirmedAt: autoCredit ? now : null,
    ...(cleanNote ? { customerNote: cleanNote } : {}),
  };

  const msg: SmsMessage = {
    id: msgId,
    userId: updatedUser.id,
    deviceId: 'admin_desk',
    deviceName: 'إدارة المنصة',
    sender: 'إيداع رصيد فوري',
    body:
      cleanNote ||
      `تم إيداع مبلغ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م في حسابك (${updatedUser.email})${cleanDepNum ? ` عبر الرقم (${cleanDepNum})` : ''} بنجاح.`,
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
