import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore/lite';
import {
  AccountDesk,
  ALLOWED_PAYMENT_METHODS,
  AppSettings,
  DepositOrder,
  DisputeItem,
  ManagedUser,
  OnlinePresenceEntry,
  PlatformConfig,
  PlatformState,
  ReferralPartner,
  Requisite,
  SmsMessage,
  TopUpRecord,
  UserProfile,
  WithdrawalOrder,
} from '../types';

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

const isNewApp = getApps().length === 0;
const app = isNewApp ? initializeApp(firebaseConfig) : getApp();
export const firestoreDb = getFirestore(app);

if (typeof window !== 'undefined') {
  isAnalyticsSupported()
    .then((ok) => {
      if (ok) getAnalytics(app);
    })
    .catch(() => undefined);
}

const ALLOWED_METHOD_SET = new Set<string>(ALLOWED_PAYMENT_METHODS);

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

function parseConfigDoc(raw: Record<string, unknown> | undefined): PlatformConfig {
  if (!raw) return { ...DEFAULT_CONFIG };
  const methods = (raw.depositMethodNumbers as Record<string, unknown> | undefined) ?? {};
  return {
    platformName: FIXED_PLATFORM_NAME,
    countryCode: (raw.countryCode as PlatformConfig['countryCode']) || 'EG',
    currencyCode: String(raw.currencyCode || 'EGP'),
    usdRate: Math.max(1, Number(raw.usdRate) || 49.85),
    defaultDepositNumber: String(raw.defaultDepositNumber || ''),
    depositMethodNumbers: {
      vodafone: String(methods.vodafone || ''),
      etisalat: String(methods.etisalat || ''),
      orange: String(methods.orange || ''),
      binance: String(methods.binance || ''),
    },
  };
}

function parseUserDoc(id: string, raw: Record<string, unknown>): ManagedUser & {
  passwordSalt?: string;
  passwordHash?: string;
} {
  return {
    id,
    playerId: String(raw.playerId || id),
    uuid: String(raw.uuid || ''),
    username: String(raw.username || ''),
    displayName: String(raw.displayName || ''),
    email: String(raw.email || ''),
    emailLower: String(raw.emailLower || ''),
    passwordSalt: raw.passwordSalt ? String(raw.passwordSalt) : undefined,
    passwordHash: raw.passwordHash ? String(raw.passwordHash) : undefined,
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

function buildProfileForUser(u: ManagedUser): UserProfile {
  return {
    traderId: u.playerId || u.id,
    playerId: u.playerId,
    displayName: u.displayName,
    email: u.email,
    telegramHandle: u.telegramHandle,
    twoFactorEnabled: Boolean(u.twoFactorEnabled),
    referralCode: u.referralCode,
    referralRatePct: u.referralRatePct ?? 0.5,
    trc20Address: u.trc20Address || 'TY9xK8mPq7VwRz4nLp3JdXs2kF9aBc7eW1',
    fixedDepositNumber: u.fixedDepositNumber || '',
    fixedDepositMethod: u.fixedDepositMethod || '',
  };
}

function buildAccountForUser(u: ManagedUser, cfg: PlatformConfig): AccountDesk {
  const rate = Math.max(1, Number(cfg.usdRate) || 49.85);
  return {
    account_id: `acc_${u.id}`,
    uuid: u.uuid,
    username: u.username,
    countryCode: cfg.countryCode || 'EG',
    label: 'EG | ج.م · مصر',
    labelEn: 'EG | EGP',
    currency: cfg.currencyCode || 'EGP',
    balanceUsdt: Number(u.balanceEgp || 0),
    frozenUsdt: Number(u.frozenEgp || 0),
    insuranceAmount: u.insuranceEgp ?? null,
    rate,
    canTrade: Boolean(u.canTrade),
    depositFeePct: Number(u.depositFeePct ?? 3.0),
    withdrawalFeePct: Number(u.withdrawalFeePct ?? 1.8),
    fixedDepositNumber: u.fixedDepositNumber || '',
    fixedDepositMethod: u.fixedDepositMethod || '',
  };
}

export async function fetchPublicConfigFromFirestore(): Promise<PlatformConfig | null> {
  const probe = await probeFirestoreServer();
  if (!probe.ok) return null;
  const snap = await getDoc(doc(firestoreDb, 'platform_meta', 'config'));
  return parseConfigDoc(snap.exists() ? (snap.data() as Record<string, unknown>) : undefined);
}

export async function fetchAgentSliceFromFirestore(
  userId: string
): Promise<{ ok: boolean; inactive?: boolean; slice?: PlatformState }> {
  const userSnap = await getDoc(doc(firestoreDb, 'users', userId));
  if (!userSnap.exists()) {
    return { ok: false, inactive: true };
  }
  const user = parseUserDoc(userSnap.id, userSnap.data() as Record<string, unknown>);
  if (!user.active) {
    return { ok: false, inactive: true };
  }

  const [cfgSnap, depSnap, wdSnap, msgSnap, reqSnap, dspSnap, setSnap, topSnap, refSnap, presSnap] =
    await Promise.all([
      getDoc(doc(firestoreDb, 'platform_meta', 'config')),
      getDocs(query(collection(firestoreDb, 'deposits'), where('userId', '==', userId))),
      getDocs(query(collection(firestoreDb, 'withdrawals'), where('userId', '==', userId))),
      getDocs(query(collection(firestoreDb, 'messages'), where('userId', '==', userId))),
      getDocs(query(collection(firestoreDb, 'requisites'), where('userId', '==', userId))),
      getDocs(query(collection(firestoreDb, 'disputes'), where('userId', '==', userId))),
      getDoc(doc(firestoreDb, 'user_settings', userId)),
      getDocs(query(collection(firestoreDb, 'top_ups'), where('userId', '==', userId))),
      getDocs(query(collection(firestoreDb, 'referrals'), where('userId', '==', userId))),
      getDocs(collection(firestoreDb, 'online_presence')),
    ]);

  const config = parseConfigDoc(cfgSnap.exists() ? (cfgSnap.data() as Record<string, unknown>) : undefined);
  const account = buildAccountForUser(user, config);
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...(setSnap.exists() ? (setSnap.data() as Partial<AppSettings>) : {}),
  };

  const now = Date.now();
  const activePresence = presSnap.docs.filter((d) => {
    const entry = d.data() as OnlinePresenceEntry & { lastPingMs?: number };
    const ms =
      typeof entry.lastPingMs === 'number' ? entry.lastPingMs : Date.parse(entry.lastPingAt || '');
    return Number.isFinite(ms) && now - ms <= 45000;
  });

  const deposits = depSnap.docs
    .map((d) => ({ ...(d.data() as DepositOrder), id: d.id }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const withdrawals = wdSnap.docs
    .map((d) => ({ ...(d.data() as WithdrawalOrder), id: d.id }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const messages = msgSnap.docs
    .map((d) => ({ ...(d.data() as SmsMessage), id: d.id }))
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));

  let requisites = reqSnap.docs.map((d) => ({ ...(d.data() as Requisite), id: d.id }));
  if (requisites.length === 0 && user.fixedDepositNumber?.trim()) {
    const methodName = user.fixedDepositMethod?.trim() || 'فودافون كاش';
    requisites = [
      {
        id: `req_${user.id}`,
        userId: user.id,
        accountId: account.account_id,
        bankName: methodName,
        ownerName: user.displayName,
        accountNumber: user.fixedDepositNumber.trim(),
        type: methodName === 'باينانس' ? 'instapay' : 'wallet',
        minOrder: 100,
        maxOrder: 30000,
        dailyLimit: 150000,
        dailyUsed: 0,
        bidRate: Number(user.depositFeePct ?? 3.0),
        active: true,
      },
    ];
  }
  const disputes = dspSnap.docs
    .map((d) => ({ ...(d.data() as DisputeItem), id: d.id }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const topUps = topSnap.docs
    .map((d) => ({ ...(d.data() as TopUpRecord), id: d.id }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const referrals = refSnap.docs.map((d) => ({ ...(d.data() as ReferralPartner), id: d.id }));

  return {
    ok: true,
    slice: {
      config,
      users: [],
      onlinePresence: [],
      onlineCount: activePresence.length,
      profile: buildProfileForUser(user),
      currentAccountId: account.account_id,
      accounts: [account],
      requisites,
      deposits,
      disputes,
      withdrawals,
      androidDevices: [],
      telegramBots: [],
      apiKeys: [],
      messages,
      topUps,
      referrals,
      settings,
    },
  };
}

export async function loginWithFirestore(
  emailRaw: string,
  passwordRaw: string
): Promise<{ ok: boolean; status: number; userId?: string; slice?: PlatformState; error?: string }> {
  const email = stripInvisibleChars(emailRaw).trim().toLowerCase();
  const passwordClean = stripInvisibleChars(passwordRaw).trim();
  const passwordCandidates = Array.from(
    new Set([passwordRaw.trim(), passwordRaw, passwordClean].filter((p) => p.length > 0))
  );
  if (!email || passwordCandidates.length === 0) {
    return {
      ok: false,
      status: 400,
      error: 'من فضلك أدخل البريد الإلكتروني وكلمة المرور',
    };
  }

  try {
    const q = query(collection(firestoreDb, 'users'), where('emailLower', '==', email));
    const qSnap = await getDocs(q);
    let candidateDocs = qSnap.docs;

    if (candidateDocs.length === 0) {
      const allSnap = await getDocs(collection(firestoreDb, 'users'));
      candidateDocs = allSnap.docs.filter(
        (d) => stripInvisibleChars(String(d.data().email || '')).trim().toLowerCase() === email
      );
    }

    if (candidateDocs.length === 0) {
      return {
        ok: false,
        status: 401,
        error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      };
    }

    let matchedDoc: (typeof candidateDocs)[number] | null = null;
    for (const targetDoc of candidateDocs) {
      const rawData = targetDoc.data() as Record<string, unknown>;
      const parsed = parseUserDoc(targetDoc.id, rawData);
      let okPass = false;
      for (const candidatePass of passwordCandidates) {
        if (parsed.passwordHash && parsed.passwordSalt) {
          const candidateHash = await sha256Hex(`${parsed.passwordSalt}:${candidatePass}`);
          if (candidateHash === parsed.passwordHash) {
            okPass = true;
            break;
          }
        }
        if (typeof rawData.password === 'string' && rawData.password === candidatePass) {
          okPass = true;
          break;
        }
      }
      if (okPass) {
        matchedDoc = targetDoc;
        if (parsed.active) break;
      }
    }

    if (!matchedDoc) {
      return {
        ok: false,
        status: 401,
        error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      };
    }

    const user = parseUserDoc(matchedDoc.id, matchedDoc.data() as Record<string, unknown>);
    if (!user.active) {
      return {
        ok: false,
        status: 403,
        error: 'هذا الحساب غير مفعّل من لوحة الإدارة — برجاء التواصل مع الإدارة لتفعيل الحساب',
      };
    }

    const sliceRes = await fetchAgentSliceFromFirestore(user.id);
    if (!sliceRes.ok || !sliceRes.slice) {
      return { ok: false, status: 403, error: 'الحساب غير مفعّل أو غير متاح' };
    }

    cachedProbe = { ts: Date.now(), result: { ok: true } };
    return { ok: true, status: 200, userId: user.id, slice: sliceRes.slice };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('PERMISSION_DENIED') || msg.includes('permission-denied')) {
      return {
        ok: false,
        status: 503,
        error: 'صلاحيات Firestore Rules مرفوضة في مشروع moorrcv',
      };
    }
    return {
      ok: false,
      status: 503,
      error: 'تعذر الاتصال بقاعدة بيانات Firebase (moorrcv) — يرجى المحاولة مرة أخرى',
    };
  }
}

export function subscribeAgentInFirestore(
  userId: string,
  onSliceRefresh: () => void,
  onDeactivated: () => void
): () => void {
  let stopped = false;

  const poll = async () => {
    if (stopped) return;
    try {
      const snap = await getDoc(doc(firestoreDb, 'users', userId));
      if (stopped) return;
      if (!snap.exists() || snap.data().active === false) {
        onDeactivated();
        return;
      }
      onSliceRefresh();
    } catch {
      // ignore transient network glitches during poll
    }
  };

  const timer = globalThis.setInterval(() => {
    poll().catch(() => undefined);
  }, 3500);

  return () => {
    stopped = true;
    globalThis.clearInterval(timer);
  };
}

export async function pingFirestorePresence(
  visitorId: string,
  route: string,
  user?: { id: string; playerId?: string; displayName: string; email: string } | null
): Promise<void> {
  const probe = await probeFirestoreServer();
  if (!probe.ok || !visitorId) return;
  const nowMs = Date.now();
  await setDoc(doc(firestoreDb, 'online_presence', visitorId), {
    visitorId,
    userId: user?.id ?? null,
    playerId: user?.playerId ?? null,
    userName: user?.displayName ?? null,
    email: user?.email ?? null,
    route,
    lastPingAt: new Date(nowMs).toISOString(),
    lastPingMs: nowMs,
  });
}

export async function updateFirestoreAgentFields(
  userId: string,
  patch: Partial<{ canTrade: boolean; twoFactorEnabled: boolean }>
): Promise<void> {
  await updateDoc(doc(firestoreDb, 'users', userId), patch);
}

export async function updateFirestoreAgentSettings(
  userId: string,
  patch: Partial<AppSettings>
): Promise<void> {
  await setDoc(doc(firestoreDb, 'user_settings', userId), patch, { merge: true });
}

export async function createFirestoreAgentDeposit(
  userId: string,
  payload: { amountLocal: number; paymentMethod: string; senderNumber?: string; note?: string }
): Promise<{ ok: boolean; error?: string }> {
  const amountLocal = Number(payload.amountLocal);
  const paymentMethod = String(payload.paymentMethod || '').trim();
  const senderNumber = String(payload.senderNumber || '').trim();
  const note = String(payload.note || '').trim();

  if (!Number.isFinite(amountLocal) || amountLocal <= 0) {
    return { ok: false, error: 'أدخل مبلغ إيداع صحيح' };
  }
  if (!ALLOWED_METHOD_SET.has(paymentMethod)) {
    return {
      ok: false,
      error: 'اختر وسيلة دفع واحدة من: فودافون كاش، اتصالات كاش، أورنج كاش، باينانس',
    };
  }

  const [uSnap, cfgSnap] = await Promise.all([
    getDoc(doc(firestoreDb, 'users', userId)),
    getDoc(doc(firestoreDb, 'platform_meta', 'config')),
  ]);
  if (!uSnap.exists()) return { ok: false, error: 'الحساب غير موجود' };
  const user = parseUserDoc(uSnap.id, uSnap.data() as Record<string, unknown>);
  const cfg = parseConfigDoc(cfgSnap.exists() ? (cfgSnap.data() as Record<string, unknown>) : undefined);

  const methodMap: Record<string, string | undefined> = {
    'فودافون كاش': cfg.depositMethodNumbers?.vodafone,
    'اتصالات كاش': cfg.depositMethodNumbers?.etisalat,
    'أورنج كاش': cfg.depositMethodNumbers?.orange,
    'باينانس': cfg.depositMethodNumbers?.binance,
  };
  const fixedAgentNumber = (user.fixedDepositNumber || '').trim();
  const fixedAgentMethod = (user.fixedDepositMethod || '').trim();
  const resolvedMethod =
    fixedAgentNumber && fixedAgentMethod && ALLOWED_METHOD_SET.has(fixedAgentMethod)
      ? fixedAgentMethod
      : paymentMethod;

  const assignedDepositNumber =
    fixedAgentNumber ||
    (methodMap[resolvedMethod] || '').trim() ||
    (cfg.defaultDepositNumber || '').trim();

  if (!assignedDepositNumber) {
    return {
      ok: false,
      error: 'لم يتم إضافة رقم وكيل ثابت من لوحة الإدارة بعد — برجاء التواصل مع الإدارة',
    };
  }

  const rate = Math.max(1, Number(cfg.usdRate) || 49.85);
  const depId = `dep_${Date.now()}_${Math.floor(100 + Math.random() * 899)}`;
  const noteText = senderNumber
    ? `محوّل من: ${senderNumber}${note ? ` · ${note}` : ''}`
    : note;
  const dep: DepositOrder = {
    id: depId,
    userId,
    orderId: `EG-${Math.floor(884200 + Math.random() * 99999)}`,
    accountId: `acc_${userId}`,
    amountLocal: Math.round(amountLocal * 100) / 100,
    amountUsdt: Math.round((amountLocal / rate) * 100) / 100,
    incomeUsdt: Math.round(amountLocal * ((user.depositFeePct ?? 3) / 100) * 100) / 100,
    rate,
    requisiteId: 'fixed_deposit',
    bankName: resolvedMethod,
    ownerName: user.displayName,
    requisiteNumber: assignedDepositNumber,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    confirmedAt: null,
    ...(noteText ? { customerNote: noteText } : {}),
  };

  await setDoc(doc(firestoreDb, 'deposits', depId), dep);
  return { ok: true };
}

export async function actFirestoreAgentDeposit(
  userId: string,
  id: string,
  action: 'confirm' | 'cancel' | 'dispute'
): Promise<{ ok: boolean; error?: string }> {
  if (action === 'confirm') {
    return {
      ok: false,
      error: 'تأكيد الإيداع يتم فقط من لوحة تحكم الإدارة بعد مراجعة التحويل',
    };
  }
  const depRef = doc(firestoreDb, 'deposits', id);
  const snap = await getDoc(depRef);
  if (!snap.exists() || snap.data().userId !== userId) {
    return { ok: false, error: 'الطلب غير موجود' };
  }
  const dep = snap.data() as DepositOrder;
  if (action === 'cancel' && dep.status === 'pending') {
    await updateDoc(depRef, { status: 'cancelled' });
  } else if (action === 'dispute' && dep.status !== 'disputed') {
    await updateDoc(depRef, { status: 'disputed' });
    const dspId = `dsp_${Date.now()}_${Math.floor(100 + Math.random() * 899)}`;
    const dispute: DisputeItem = {
      id: dspId,
      userId,
      orderId: dep.orderId,
      accountId: dep.accountId,
      claimedAmountLocal: dep.amountLocal,
      originalAmountLocal: dep.amountLocal,
      amountUsdt: dep.amountUsdt,
      bankName: dep.bankName,
      requisiteNumber: dep.requisiteNumber,
      receiptRef: `RCPT-${Math.floor(10000 + Math.random() * 89999)}`,
      reason: 'مراجعة مبلغ التحويل من العميل',
      slaMinutesLeft: 25,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(firestoreDb, 'disputes', dspId), dispute);
  }
  return { ok: true };
}

export async function resolveFirestoreDispute(
  userId: string,
  id: string,
  decision: string,
  note?: string
): Promise<{ ok: boolean; error?: string }> {
  if (decision === 'approve') {
    return {
      ok: false,
      error: 'اعتماد الإيداعات والنزاعات يتم من لوحة تحكم الإدارة فقط',
    };
  }
  const dspRef = doc(firestoreDb, 'disputes', id);
  const snap = await getDoc(dspRef);
  if (!snap.exists() || snap.data().userId !== userId) {
    return { ok: false, error: 'النزاع غير موجود' };
  }
  await updateDoc(dspRef, {
    status: 'resolved_reject',
    ...(note ? { resolutionNote: note } : {}),
  });
  return { ok: true };
}

export async function createFirestoreAgentWithdrawal(
  userId: string,
  payload: {
    amountLocal: number;
    destinationMethod: string;
    requisiteNumber: string;
    recipientName?: string;
  }
): Promise<{ ok: boolean; error?: string }> {
  const amountLocal = Number(payload.amountLocal);
  const destinationMethod = String(payload.destinationMethod || '').trim();
  const requisiteNumber = String(payload.requisiteNumber || '').trim();

  if (!Number.isFinite(amountLocal) || amountLocal <= 0) {
    return { ok: false, error: 'أدخل مبلغ سحب صحيح' };
  }
  if (!ALLOWED_METHOD_SET.has(destinationMethod)) {
    return {
      ok: false,
      error: 'اختر وسيلة واحدة من: فودافون كاش، اتصالات كاش، أورنج كاش، باينانس',
    };
  }
  if (!requisiteNumber) {
    return { ok: false, error: 'أدخل رقم المحفظة أو حساب باينانس' };
  }

  const [uSnap, cfgSnap] = await Promise.all([
    getDoc(doc(firestoreDb, 'users', userId)),
    getDoc(doc(firestoreDb, 'platform_meta', 'config')),
  ]);
  if (!uSnap.exists()) return { ok: false, error: 'الحساب غير موجود' };
  const user = parseUserDoc(uSnap.id, uSnap.data() as Record<string, unknown>);
  const cfg = parseConfigDoc(cfgSnap.exists() ? (cfgSnap.data() as Record<string, unknown>) : undefined);

  const rate = Math.max(1, Number(cfg.usdRate) || 49.85);
  const wdId = `wd_${Date.now()}_${Math.floor(100 + Math.random() * 899)}`;
  const wdDoc: WithdrawalOrder = {
    id: wdId,
    userId,
    orderId: `WD-${Math.floor(400000 + Math.random() * 599999)}`,
    accountId: `acc_${userId}`,
    amountLocal: Math.round(amountLocal * 100) / 100,
    amountUsdt: Math.round((amountLocal / rate) * 100) / 100,
    incomeUsdt: 0,
    rate,
    destinationMethod,
    requisiteNumber,
    recipientName: String(payload.recipientName || user.displayName).trim(),
    status: 'awaiting_confirmation',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    adminCreated: false,
    requestedByAgent: true,
    receiptFiles: [],
  };

  await setDoc(doc(firestoreDb, 'withdrawals', wdId), wdDoc);
  return { ok: true };
}

export async function respondFirestoreAdminWithdrawal(
  userId: string,
  wdId: string,
  action: 'confirm' | 'reject'
): Promise<{ ok: boolean; error?: string }> {
  try {
    await runTransaction(firestoreDb, async (tx) => {
      const wdRef = doc(firestoreDb, 'withdrawals', wdId);
      const uRef = doc(firestoreDb, 'users', userId);
      const [wdSnap, uSnap] = await Promise.all([tx.get(wdRef), tx.get(uRef)]);
      if (!wdSnap.exists() || wdSnap.data().userId !== userId) {
        throw new Error('طلب السحب غير موجود');
      }
      const w = wdSnap.data() as WithdrawalOrder;
      if (w.status !== 'awaiting_confirmation') {
        throw new Error('تم الرد على طلب السحب بالفعل');
      }
      if (!uSnap.exists()) throw new Error('الحساب غير موجود');

      if (action === 'confirm') {
        const curBal = Number(uSnap.data().balanceEgp || 0);
        const amt = Number(w.amountLocal || 0);
        if (curBal < amt) {
          throw new Error('الرصيد الحالي غير كافي لتأكيد خصم السحب');
        }
        tx.update(uRef, { balanceEgp: Math.round((curBal - amt) * 100) / 100 });
        tx.update(wdRef, { status: 'completed' });
      } else {
        tx.update(wdRef, { status: 'rejected' });
      }
    });

    const msgSnap = await getDocs(
      query(collection(firestoreDb, 'messages'), where('userId', '==', userId))
    );
    const linked = msgSnap.docs.find((d) => d.data().withdrawalId === wdId);
    if (linked) {
      await updateDoc(doc(firestoreDb, 'messages', linked.id), {
        withdrawalActionStatus: action === 'confirm' ? 'confirmed' : 'rejected',
        status: action === 'confirm' ? 'matched' : 'ignored',
      });
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'تعذر تنفيذ الإجراء' };
  }
}

export async function respondFirestoreMessageWithdrawal(
  userId: string,
  messageId: string,
  action: 'confirm' | 'reject'
): Promise<{ ok: boolean; error?: string }> {
  try {
    let linkedWdId: string | undefined;
    await runTransaction(firestoreDb, async (tx) => {
      const msgRef = doc(firestoreDb, 'messages', messageId);
      const uRef = doc(firestoreDb, 'users', userId);
      const [msgSnap, uSnap] = await Promise.all([tx.get(msgRef), tx.get(uRef)]);
      if (!msgSnap.exists() || msgSnap.data().userId !== userId) {
        throw new Error('الرسالة غير موجودة');
      }
      const msg = msgSnap.data() as SmsMessage;
      if (msg.withdrawalActionStatus !== 'pending_confirmation') {
        throw new Error('تم الرد على طلب السحب بالفعل');
      }
      linkedWdId = msg.withdrawalId;
      if (!uSnap.exists()) throw new Error('الحساب غير موجود');

      const amt = Number(msg.withdrawalAmountEgp ?? msg.parsedAmount ?? 0);
      if (action === 'confirm') {
        const curBal = Number(uSnap.data().balanceEgp || 0);
        if (curBal < amt) {
          throw new Error('الرصيد الحالي غير كافي لتأكيد خصم السحب');
        }
        tx.update(uRef, { balanceEgp: Math.round((curBal - amt) * 100) / 100 });
        tx.update(msgRef, { withdrawalActionStatus: 'confirmed', status: 'matched' });
      } else {
        tx.update(msgRef, { withdrawalActionStatus: 'rejected', status: 'ignored' });
      }
    });

    if (linkedWdId) {
      await updateDoc(doc(firestoreDb, 'withdrawals', linkedWdId), {
        status: action === 'confirm' ? 'completed' : 'rejected',
      }).catch(() => undefined);
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'تعذر الرد على الرسالة' };
  }
}

export async function claimFirestoreWithdrawal(userId: string, wdId: string): Promise<void> {
  await updateDoc(doc(firestoreDb, 'withdrawals', wdId), {
    userId,
    accountId: `acc_${userId}`,
    status: 'accepted',
    acceptedAt: new Date().toISOString(),
  });
}

export async function actFirestoreWithdrawal(
  userId: string,
  wdId: string,
  action: 'upload_receipt' | 'complete' | 'cancel',
  fileMeta?: { name?: string; size?: string }
): Promise<{ ok: boolean; error?: string }> {
  const wdRef = doc(firestoreDb, 'withdrawals', wdId);
  const snap = await getDoc(wdRef);
  if (!snap.exists() || snap.data().userId !== userId) {
    return { ok: false, error: 'طلب السحب غير موجود' };
  }
  const w = snap.data() as WithdrawalOrder;
  if (w.requestedByAgent) {
    if (action === 'cancel' && w.status === 'awaiting_confirmation') {
      await updateDoc(wdRef, { status: 'cancelled' });
      return { ok: true };
    }
    return { ok: false, error: 'تأكيد أو رفض طلب السحب يتم من لوحة الإدارة' };
  }
  if (action === 'upload_receipt') {
    const prevFiles = Array.isArray(w.receiptFiles) ? w.receiptFiles : [];
    await updateDoc(wdRef, {
      receiptFiles: [
        ...prevFiles,
        { name: fileMeta?.name || `receipt-${Date.now()}.jpg`, size: fileMeta?.size || '240 KB' },
      ],
      ...(w.status === 'accepted' ? { status: 'awaiting_confirmation' } : {}),
    });
  } else if (action === 'complete') {
    await runTransaction(firestoreDb, async (tx) => {
      const uRef = doc(firestoreDb, 'users', userId);
      const uSnap = await tx.get(uRef);
      if (uSnap.exists() && w.status !== 'completed') {
        const cur = Number(uSnap.data().balanceEgp || 0);
        const amt = Number(w.amountLocal || 0);
        if (cur < amt) throw new Error('الرصيد الحالي غير كافي لإتمام السحب');
        tx.update(uRef, { balanceEgp: Math.round((cur - amt) * 100) / 100 });
      }
      tx.update(wdRef, { status: 'completed' });
    });
  } else if (action === 'cancel') {
    await updateDoc(wdRef, { status: 'cancelled' });
  }
  return { ok: true };
}

export async function createFirestoreRequisite(
  _userId: string,
  _data: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  return {
    ok: false,
    error: 'إضافة وتعديل رقم المحفظة ووسيلة الدفع يتم من لوحة تحكم الإدارة فقط',
  };
}

export async function updateFirestoreRequisite(
  _userId: string,
  _id: string,
  _data: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  return {
    ok: false,
    error: 'إضافة وتعديل رقم المحفظة ووسيلة الدفع يتم من لوحة تحكم الإدارة فقط',
  };
}

export async function deleteFirestoreRequisite(
  _userId: string,
  _id: string
): Promise<{ ok: boolean; error?: string }> {
  return {
    ok: false,
    error: 'حذف أو تعديل رقم المحفظة ووسيلة الدفع يتم من لوحة تحكم الإدارة فقط',
  };
}

export async function simulateFirestoreSms(userId: string): Promise<void> {
  const depSnap = await getDocs(
    query(collection(firestoreDb, 'deposits'), where('userId', '==', userId))
  );
  const pending = depSnap.docs
    .map((d) => d.data() as DepositOrder)
    .find((d) => d.status === 'pending');
  const amount = pending ? pending.amountLocal : 1000;
  const id = `msg_${Date.now()}_${Math.floor(100 + Math.random() * 899)}`;
  await setDoc(doc(firestoreDb, 'messages', id), {
    id,
    userId,
    deviceId: 'dev_sim',
    deviceName: 'جهاز الاستقبال',
    sender: 'VF-Cash',
    body: `تم استلام مبلغ ${amount.toLocaleString('en-US')} جنيه بنجاح.`,
    parsedAmount: amount,
    currency: 'EGP',
    matchedDepositId: pending ? pending.id : null,
    matchedOrderId: pending ? pending.orderId : null,
    status: pending ? 'matched' : 'unmatched',
    receivedAt: new Date().toISOString(),
  });
}

export async function createFirestoreTopUp(
  userId: string,
  amountUsdt: number,
  network: TopUpRecord['network']
): Promise<void> {
  const id = `top_${Date.now()}_${Math.floor(100 + Math.random() * 899)}`;
  const randHex = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0')
  ).join('');
  await setDoc(doc(firestoreDb, 'top_ups', id), {
    id,
    userId,
    txHash: `0x${randHex}`,
    network: network || 'TRC-20',
    amountUsdt: Math.max(1, Number(amountUsdt) || 0),
    status: 'confirming',
    createdAt: new Date().toISOString(),
  });
}
