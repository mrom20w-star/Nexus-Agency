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
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
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

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
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

  const requisites = reqSnap.docs.map((d) => ({ ...(d.data() as Requisite), id: d.id }));
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
  const email = emailRaw.trim().toLowerCase();
  const password = passwordRaw.trim();
  if (!email || !password) {
    return {
      ok: false,
      status: 400,
      error: 'من فضلك أدخل البريد الإلكتروني وكلمة المرور',
    };
  }

  const probe = await probeFirestoreServer();
  if (!probe.ok) {
    return { ok: false, status: 503, error: probe.message };
  }

  const q = query(collection(firestoreDb, 'users'), where('emailLower', '==', email));
  let snap = await getDocs(q);
  if (snap.empty) {
    // Secondary scan in case legacy doc lacks emailLower
    const allSnap = await getDocs(collection(firestoreDb, 'users'));
    const matchDoc = allSnap.docs.find(
      (d) => String(d.data().email || '').trim().toLowerCase() === email
    );
    if (!matchDoc) {
      return {
        ok: false,
        status: 401,
        error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      };
    }
    snap = { docs: [matchDoc] } as unknown as typeof snap;
  }

  const targetDoc = snap.docs[0];
  const user = parseUserDoc(targetDoc.id, targetDoc.data() as Record<string, unknown>);

  let validPass = false;
  if (user.passwordHash && user.passwordSalt) {
    const candidateHash = await sha256Hex(`${user.passwordSalt}:${password}`);
    validPass = candidateHash === user.passwordHash;
  } else if (typeof targetDoc.data().password === 'string') {
    validPass = targetDoc.data().password === password;
  }

  if (!validPass) {
    return {
      ok: false,
      status: 401,
      error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    };
  }

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

  return { ok: true, status: 200, userId: user.id, slice: sliceRes.slice };
}

export function subscribeAgentInFirestore(
  userId: string,
  onSliceRefresh: () => void,
  onDeactivated: () => void
): () => void {
  const unsubs: Array<() => void> = [];

  unsubs.push(
    onSnapshot(doc(firestoreDb, 'users', userId), (snap) => {
      if (!snap.exists() || snap.data().active === false) {
        onDeactivated();
        return;
      }
      onSliceRefresh();
    })
  );
  unsubs.push(onSnapshot(doc(firestoreDb, 'platform_meta', 'config'), () => onSliceRefresh()));
  unsubs.push(
    onSnapshot(
      query(collection(firestoreDb, 'deposits'), where('userId', '==', userId)),
      () => onSliceRefresh()
    )
  );
  unsubs.push(
    onSnapshot(
      query(collection(firestoreDb, 'withdrawals'), where('userId', '==', userId)),
      () => onSliceRefresh()
    )
  );
  unsubs.push(
    onSnapshot(
      query(collection(firestoreDb, 'messages'), where('userId', '==', userId)),
      () => onSliceRefresh()
    )
  );
  unsubs.push(
    onSnapshot(
      query(collection(firestoreDb, 'requisites'), where('userId', '==', userId)),
      () => onSliceRefresh()
    )
  );
  unsubs.push(
    onSnapshot(
      query(collection(firestoreDb, 'disputes'), where('userId', '==', userId)),
      () => onSliceRefresh()
    )
  );

  return () => {
    for (const u of unsubs) u();
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
  const assignedDepositNumber =
    (user.fixedDepositNumber || '').trim() ||
    (methodMap[paymentMethod] || '').trim() ||
    (cfg.defaultDepositNumber || '').trim();

  if (!assignedDepositNumber) {
    return {
      ok: false,
      error: 'لم يتم تعيين رقم إيداع ثابت من الإدارة بعد — برجاء التواصل مع الإدارة',
    };
  }

  const rate = Math.max(1, Number(cfg.usdRate) || 49.85);
  const depId = `dep_${Date.now()}_${Math.floor(100 + Math.random() * 899)}`;
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
    bankName: paymentMethod,
    ownerName: user.displayName,
    requisiteNumber: assignedDepositNumber,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    confirmedAt: null,
    customerNote: senderNumber
      ? `محوّل من: ${senderNumber}${note ? ` · ${note}` : ''}`
      : note || undefined,
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
  userId: string,
  data: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const bankName = String(data.bankName || '').trim();
  if (!ALLOWED_METHOD_SET.has(bankName)) {
    return {
      ok: false,
      error: 'اختر وسيلة دفع واحدة من: فودافون كاش، اتصالات كاش، أورنج كاش، باينانس',
    };
  }
  const existing = await getDocs(
    query(collection(firestoreDb, 'requisites'), where('userId', '==', userId))
  );
  if (!existing.empty) {
    return {
      ok: false,
      error: 'يُسمح بوسيلة دفع واحدة فقط لكل حساب — يمكنك تعديلها أو حذفها أولاً',
    };
  }
  const id = `req_${Date.now()}_${Math.floor(100 + Math.random() * 899)}`;
  const reqDoc: Requisite = {
    id,
    userId,
    accountId: `acc_${userId}`,
    bankName,
    ownerName: String(data.ownerName || '').trim(),
    accountNumber: String(data.accountNumber || '').trim(),
    type: bankName === 'باينانس' ? 'instapay' : 'wallet',
    minOrder: Math.max(1, Number(data.minOrder) || 100),
    maxOrder: Math.max(100, Number(data.maxOrder) || 30000),
    dailyLimit: Math.max(100, Number(data.dailyLimit) || 100000),
    dailyUsed: 0,
    bidRate: Number(data.bidRate) || 3.0,
    active: data.active !== false,
  };
  await setDoc(doc(firestoreDb, 'requisites', id), reqDoc);
  return { ok: true };
}

export async function updateFirestoreRequisite(
  userId: string,
  id: string,
  data: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const reqRef = doc(firestoreDb, 'requisites', id);
  const snap = await getDoc(reqRef);
  if (!snap.exists() || snap.data().userId !== userId) {
    return { ok: false, error: 'وسيلة الدفع غير موجودة' };
  }
  if (typeof data.bankName === 'string' && !ALLOWED_METHOD_SET.has(data.bankName.trim())) {
    return {
      ok: false,
      error: 'اختر وسيلة دفع واحدة صالحة',
    };
  }
  await updateDoc(reqRef, data);
  return { ok: true };
}

export async function deleteFirestoreRequisite(userId: string, id: string): Promise<void> {
  const reqRef = doc(firestoreDb, 'requisites', id);
  const snap = await getDoc(reqRef);
  if (snap.exists() && snap.data().userId === userId) {
    await deleteDoc(reqRef);
  }
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
