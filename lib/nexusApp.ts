import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type {
  AccountDesk,
  AndroidDevice,
  ApiKeyConfig,
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
  TelegramBotConfig,
  TopUpRecord,
  UserProfile,
  WithdrawalOrder,
} from '../src/types';

export const FIXED_PLATFORM_NAME = 'Nexus Agency';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const PRESENCE_TTL_MS = 45000;
const REDIS_DB_KEY = 'nexus_agency_hpay_db_v1';

const IS_VERCEL = Boolean(process.env.VERCEL);
const SEED_DB_PATH = path.resolve(process.cwd(), 'data', 'hpay-db.json');
const DISK_DATA_DIR = IS_VERCEL ? os.tmpdir() : path.resolve(process.cwd(), 'data');
const DISK_DB_PATH = IS_VERCEL
  ? path.join(os.tmpdir(), 'nexus-hpay-db.json')
  : SEED_DB_PATH;

export type StorageMode = 'redis' | 'disk' | 'ephemeral_tmp';

export interface StoredUser extends ManagedUser {
  passwordHash?: string;
}

export interface StoredDb {
  sessionSecret?: string;
  config: PlatformConfig;
  adminPasswordHash?: string;
  users: StoredUser[];
  onlinePresence: OnlinePresenceEntry[];
  requisites: Requisite[];
  deposits: DepositOrder[];
  disputes: DisputeItem[];
  withdrawals: WithdrawalOrder[];
  androidDevices: AndroidDevice[];
  telegramBots: TelegramBotConfig[];
  apiKeys: ApiKeyConfig[];
  messages: SmsMessage[];
  topUps: TopUpRecord[];
  referrals: ReferralPartner[];
  userSettings: Record<string, AppSettings>;
}

interface SessionRecord {
  jti: string;
  role: 'admin' | 'agent';
  userId?: string;
  expiresAt: number;
}

const revokedTokens = new Set<string>();
const ALLOWED_METHODS = new Set(['فودافون كاش', 'اتصالات كاش', 'أورنج كاش', 'باينانس']);

const globalCache = globalThis as unknown as {
  __nexusMemDb?: StoredDb;
};

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

function getRedisCredentials(): { url: string; token: string } | null {
  const url = (
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    ''
  ).trim();
  const token = (
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    ''
  ).trim();
  if (url && token) {
    return { url: url.replace(/\/+$/, ''), token };
  }
  return null;
}

export function getStorageMode(): StorageMode {
  if (getRedisCredentials()) return 'redis';
  return IS_VERCEL ? 'ephemeral_tmp' : 'disk';
}

function createDefaultDb(): StoredDb {
  return {
    sessionSecret: crypto.randomBytes(32).toString('hex'),
    config: {
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
    },
    users: [],
    onlinePresence: [],
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
    userSettings: {},
  };
}

function normalizeDb(parsed: Partial<StoredDb> | null | undefined, base: StoredDb): StoredDb {
  if (!parsed || typeof parsed !== 'object') return base;
  return {
    ...base,
    ...parsed,
    sessionSecret: parsed.sessionSecret || base.sessionSecret,
    config: {
      ...base.config,
      ...(parsed.config ?? {}),
      platformName: FIXED_PLATFORM_NAME,
      depositMethodNumbers: {
        ...base.config.depositMethodNumbers,
        ...(parsed.config?.depositMethodNumbers ?? {}),
      },
    },
    users: Array.isArray(parsed.users) ? parsed.users : [],
    onlinePresence: Array.isArray(parsed.onlinePresence) ? parsed.onlinePresence : [],
    requisites: Array.isArray(parsed.requisites) ? parsed.requisites : [],
    deposits: Array.isArray(parsed.deposits) ? parsed.deposits : [],
    disputes: Array.isArray(parsed.disputes) ? parsed.disputes : [],
    withdrawals: Array.isArray(parsed.withdrawals) ? parsed.withdrawals : [],
    androidDevices: Array.isArray(parsed.androidDevices) ? parsed.androidDevices : [],
    telegramBots: Array.isArray(parsed.telegramBots) ? parsed.telegramBots : [],
    apiKeys: Array.isArray(parsed.apiKeys) ? parsed.apiKeys : [],
    messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    topUps: Array.isArray(parsed.topUps) ? parsed.topUps : [],
    referrals: Array.isArray(parsed.referrals) ? parsed.referrals : [],
    userSettings:
      parsed.userSettings && typeof parsed.userSettings === 'object' ? parsed.userSettings : {},
  };
}

function ensureDiskDir(): void {
  if (!fs.existsSync(DISK_DATA_DIR)) {
    fs.mkdirSync(DISK_DATA_DIR, { recursive: true });
  }
}

function loadFromDiskSync(): StoredDb {
  const base = createDefaultDb();
  try {
    ensureDiskDir();
    if (!fs.existsSync(DISK_DB_PATH)) {
      if (IS_VERCEL && fs.existsSync(SEED_DB_PATH)) {
        try {
          const seedRaw = fs.readFileSync(SEED_DB_PATH, 'utf8');
          const seedParsed = JSON.parse(seedRaw) as Partial<StoredDb>;
          const seeded = normalizeDb(seedParsed, base);
          saveToDiskSync(seeded);
          return seeded;
        } catch {
          // ignore corrupt seed
        }
      }
      if (globalCache.__nexusMemDb) {
        return globalCache.__nexusMemDb;
      }
      saveToDiskSync(base);
      return base;
    }
    const raw = fs.readFileSync(DISK_DB_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoredDb>;
    const merged = normalizeDb(parsed, base);
    if (!parsed.sessionSecret) {
      saveToDiskSync(merged);
    }
    globalCache.__nexusMemDb = merged;
    return merged;
  } catch {
    return globalCache.__nexusMemDb ?? base;
  }
}

function saveToDiskSync(db: StoredDb): void {
  db.config.platformName = FIXED_PLATFORM_NAME;
  globalCache.__nexusMemDb = db;
  try {
    ensureDiskDir();
    const tmpPath = path.resolve(
      DISK_DATA_DIR,
      `hpay-db.${process.pid}.${Date.now()}.tmp`
    );
    fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmpPath, DISK_DB_PATH);
  } catch {
    // Mem cache remains active even if disk write fails
  }
}

async function loadDb(): Promise<StoredDb> {
  const redis = getRedisCredentials();
  if (redis) {
    const base = createDefaultDb();
    try {
      const res = await fetch(`${redis.url}/get/${encodeURIComponent(REDIS_DB_KEY)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${redis.token}`,
        },
      });
      if (res.ok) {
        const payload = (await res.json()) as { result?: string | null };
        if (payload.result) {
          const parsed = JSON.parse(payload.result) as Partial<StoredDb>;
          const merged = normalizeDb(parsed, base);
          globalCache.__nexusMemDb = merged;
          return merged;
        }
        await saveDb(base);
        return base;
      }
    } catch {
      // Fallback to warm cache or disk if transient network failure
    }
  }
  return loadFromDiskSync();
}

async function saveDb(db: StoredDb): Promise<void> {
  db.config.platformName = FIXED_PLATFORM_NAME;
  globalCache.__nexusMemDb = db;
  const redis = getRedisCredentials();
  if (redis) {
    try {
      const res = await fetch(`${redis.url}/set/${encodeURIComponent(REDIS_DB_KEY)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redis.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(db),
      });
      if (res.ok) {
        return;
      }
    } catch {
      // fallback to disk write below
    }
  }
  saveToDiskSync(db);
}

function hashSecret(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifySecret(plain: string, storedHash?: string): boolean {
  if (!plain || !storedHash || !storedHash.includes(':')) return false;
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(plain, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function timingSafeStringCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function prunePresence(db: StoredDb): OnlinePresenceEntry[] {
  const now = Date.now();
  const active = (db.onlinePresence ?? []).filter((entry) => {
    const ms =
      typeof entry.lastPingMs === 'number'
        ? entry.lastPingMs
        : Date.parse(entry.lastPingAt || '');
    return Number.isFinite(ms) && now - ms <= PRESENCE_TTL_MS;
  });
  db.onlinePresence = active;
  return active;
}

function sanitizeUser(u: StoredUser): ManagedUser {
  const { passwordHash, password, ...rest } = u;
  return {
    ...rest,
    hasPassword: Boolean(passwordHash || password),
  };
}

function buildProfileForUser(u: StoredUser): UserProfile {
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

function buildAccountForUser(u: StoredUser, cfg: PlatformConfig): AccountDesk {
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

function buildPublicConfig(db: StoredDb): PlatformConfig {
  return {
    platformName: FIXED_PLATFORM_NAME,
    countryCode: db.config.countryCode || 'EG',
    currencyCode: db.config.currencyCode || 'EGP',
    usdRate: Math.max(1, Number(db.config.usdRate) || 49.85),
    defaultDepositNumber: db.config.defaultDepositNumber || '',
    depositMethodNumbers: {
      vodafone: db.config.depositMethodNumbers?.vodafone || '',
      etisalat: db.config.depositMethodNumbers?.etisalat || '',
      orange: db.config.depositMethodNumbers?.orange || '',
      binance: db.config.depositMethodNumbers?.binance || '',
    },
  };
}

function buildAgentSlice(db: StoredDb, uid: string): PlatformState | null {
  const target = db.users.find((u) => u.id === uid);
  if (!target) return null;
  const account = buildAccountForUser(target, db.config);
  const accId = account.account_id;
  const ownRequisites = db.requisites.filter((r) => r.userId === uid || r.accountId === accId);
  const ownDeposits = db.deposits.filter((d) => d.userId === uid || d.accountId === accId);
  const ownDisputes = db.disputes.filter((d) => d.userId === uid || d.accountId === accId);
  const ownWithdrawals = db.withdrawals.filter(
    (w) => w.userId === uid || w.accountId === accId
  );
  const ownDevices = db.androidDevices.filter((d) => d.userId === uid);
  const ownBots = db.telegramBots.filter((b) => b.userId === uid);
  const ownKeys = db.apiKeys.filter((k) => k.userId === uid);
  const ownMessages = db.messages.filter((m) => m.userId === uid);
  const ownTopUps = db.topUps.filter((t) => t.userId === uid);
  const ownReferrals = db.referrals.filter((r) => r.userId === uid);
  const settings = { ...DEFAULT_SETTINGS, ...(db.userSettings[uid] ?? {}) };

  return {
    config: buildPublicConfig(db),
    users: [],
    onlinePresence: [],
    onlineCount: prunePresence(db).length,
    profile: buildProfileForUser(target),
    currentAccountId: accId,
    accounts: [account],
    requisites: ownRequisites,
    deposits: ownDeposits,
    disputes: ownDisputes,
    withdrawals: ownWithdrawals,
    androidDevices: ownDevices,
    telegramBots: ownBots,
    apiKeys: ownKeys,
    messages: ownMessages,
    topUps: ownTopUps,
    referrals: ownReferrals,
    settings,
  };
}

function buildAdminState(db: StoredDb): PlatformState {
  const activePresence = prunePresence(db);
  const firstUser = db.users[0];
  return {
    config: buildPublicConfig(db),
    users: db.users.map(sanitizeUser),
    onlinePresence: activePresence,
    onlineCount: activePresence.length,
    profile: firstUser
      ? buildProfileForUser(firstUser)
      : {
          traderId: 'ADMIN',
          displayName: 'مدير المنصة',
          email: '',
          telegramHandle: '@nexus_admin',
          twoFactorEnabled: true,
          referralCode: 'EG-ADMIN',
          referralRatePct: 0.5,
          trc20Address: 'TY9xK8mPq7VwRz4nLp3JdXs2kF9aBc7eW1',
        },
    currentAccountId: firstUser ? `acc_${firstUser.id}` : 'acc_admin',
    accounts: firstUser ? [buildAccountForUser(firstUser, db.config)] : [],
    requisites: db.requisites,
    deposits: db.deposits,
    disputes: db.disputes,
    withdrawals: db.withdrawals,
    androidDevices: db.androidDevices,
    telegramBots: db.telegramBots,
    apiKeys: db.apiKeys,
    messages: db.messages,
    topUps: db.topUps,
    referrals: db.referrals,
    settings: { ...DEFAULT_SETTINGS },
  };
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function getSigningSecret(db: StoredDb): string {
  return (
    process.env.SESSION_SECRET?.trim() ||
    db.sessionSecret ||
    process.env.ADMIN_PASSWORD?.trim() ||
    'nexus_fallback_secret'
  );
}

function createSession(role: 'admin' | 'agent', userId: string | undefined, db: StoredDb): string {
  const payload: SessionRecord = {
    jti: crypto.randomBytes(12).toString('hex'),
    role,
    userId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningSecret(db))
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function getSessionFromToken(token: string | null | undefined, db: StoredDb): SessionRecord | null {
  if (!token || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret(db))
    .update(encoded)
    .digest('base64url');
  if (!timingSafeStringCompare(sig, expectedSig)) return null;
  try {
    const rec = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionRecord;
    if (!rec || !rec.jti || revokedTokens.has(rec.jti)) return null;
    if (rec.expiresAt < Date.now()) return null;
    return rec;
  } catch {
    return null;
  }
}

function revokeSessionToken(token: string | null | undefined, db: StoredDb): void {
  if (!token) return;
  const rec = getSessionFromToken(token, db);
  if (rec?.jti) {
    revokedTokens.add(rec.jti);
  }
}

function setSessionCookie(res: Response, req: Request, cookieName: string, token: string): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const attrs = [
    `${cookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (isHttps) {
    attrs.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    attrs.push('SameSite=Lax');
  }
  res.append('Set-Cookie', attrs.join('; '));
}

function clearSessionCookie(res: Response, req: Request, cookieName: string): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const attrs = [`${cookieName}=`, 'Path=/', 'HttpOnly', 'Max-Age=0'];
  if (isHttps) {
    attrs.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    attrs.push('SameSite=Lax');
  }
  res.append('Set-Cookie', attrs.join('; '));
}

function extractToken(
  req: Request,
  cookieName: string
): { token: string | null; viaCookie: boolean } {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const t = auth.slice(7).trim();
    if (t) return { token: t, viaCookie: false };
  }
  const cookies = parseCookies(req);
  if (cookies[cookieName]) {
    return { token: cookies[cookieName], viaCookie: true };
  }
  return { token: null, viaCookie: false };
}

function isSameOriginSafe(req: Request): boolean {
  if (req.headers['x-requested-with'] === 'fetch') return true;
  const host = req.headers.host;
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  if (origin && host) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  if (referer && host) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }
  return false;
}

async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const db = await loadDb();
  const { token, viaCookie } = extractToken(req, 'nexus_admin_session');
  const sess = getSessionFromToken(token, db);
  if (!sess || sess.role !== 'admin') {
    res.status(401).json({ ok: false, error: 'غير مصرح — يلزم تسجيل دخول الإدارة' });
    return;
  }
  if (viaCookie && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !isSameOriginSafe(req)) {
    res.status(403).json({ ok: false, error: 'CSRF check failed' });
    return;
  }
  (req as Request & { loadedDb: StoredDb }).loadedDb = db;
  next();
}

async function requireAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
  const db = await loadDb();
  const { token, viaCookie } = extractToken(req, 'nexus_agent_session');
  const sess = getSessionFromToken(token, db);
  if (!sess || sess.role !== 'agent' || !sess.userId) {
    res.status(401).json({ ok: false, error: 'جلسة الوكيل غير صالحة أو منتهية' });
    return;
  }
  const user = db.users.find((u) => u.id === sess.userId);
  if (!user || !user.active) {
    res.status(401).json({ ok: false, error: 'الحساب موقوف أو غير مفعّل من الإدارة' });
    return;
  }
  if (viaCookie && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !isSameOriginSafe(req)) {
    res.status(403).json({ ok: false, error: 'CSRF check failed' });
    return;
  }
  (req as Request & { agentUserId: string; loadedDb: StoredDb }).agentUserId = sess.userId;
  (req as Request & { loadedDb: StoredDb }).loadedDb = db;
  next();
}

function generatePlayerId(users: StoredUser[]): string {
  const taken = new Set(users.map((u) => u.playerId));
  for (let i = 0; i < 30; i++) {
    const candidate = `PL-${crypto.randomInt(10000000, 99999999)}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `PL-${String(Date.now()).slice(-8)}`;
}

function hasAdminCredential(db: StoredDb): boolean {
  const envPass = process.env.ADMIN_PASSWORD?.trim();
  return Boolean(envPass || db.adminPasswordHash);
}

function verifyAdminPasscode(db: StoredDb, candidate: string): boolean {
  const clean = candidate.trim();
  if (!clean) return false;
  const envPass = process.env.ADMIN_PASSWORD?.trim();
  if (envPass && timingSafeStringCompare(envPass, clean)) {
    return true;
  }
  if (db.adminPasswordHash && verifySecret(clean, db.adminPasswordHash)) {
    return true;
  }
  return false;
}

export function createNexusApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);

  // Guard for Vercel serverless runtimes where req.body may already be parsed
  app.use((req, _res, next) => {
    const rawReq = req as unknown as { _body?: boolean };
    if (req.body !== undefined && typeof req.body === 'object' && !rawReq._body) {
      rawReq._body = true;
    }
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  // CORS for /api routes (supports standalone Dashboard hosted on Vercel/cPanel connecting via Bearer token)
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With'
    );
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Public bootstrap config
  app.get('/api/public/config', async (_req, res) => {
    const db = await loadDb();
    res.json({
      ok: true,
      storageMode: getStorageMode(),
      config: buildPublicConfig(db),
    });
  });

  // Presence ping
  app.post('/api/presence/ping', async (req, res) => {
    const db = await loadDb();
    const visitorId = String(req.body?.visitorId || '').trim().slice(0, 80);
    const route = String(req.body?.route || '/profile').slice(0, 80);
    if (!visitorId) {
      res.json({ ok: true });
      return;
    }

    const { token } = extractToken(req, 'nexus_agent_session');
    const sess = getSessionFromToken(token, db);
    const uid = sess?.role === 'agent' && sess.userId ? sess.userId : null;
    const user = uid ? db.users.find((u) => u.id === uid) : undefined;

    const nowMs = Date.now();
    const active = prunePresence(db).filter((p) => p.visitorId !== visitorId);
    active.push({
      visitorId,
      userId: user ? user.id : null,
      playerId: user ? user.playerId : null,
      userName: user ? user.displayName : null,
      email: user ? user.email : null,
      route,
      lastPingAt: new Date(nowMs).toISOString(),
      lastPingMs: nowMs,
    });
    db.onlinePresence = active;
    await saveDb(db);
    res.json({ ok: true, onlineCount: active.length });
  });

  // ================= ADMIN AUTH & SETUP =================
  app.get('/api/admin/auth-status', async (req, res) => {
    const db = await loadDb();
    const { token } = extractToken(req, 'nexus_admin_session');
    const sess = getSessionFromToken(token, db);
    const authenticated = Boolean(sess && sess.role === 'admin');
    res.json({
      ok: true,
      storageMode: getStorageMode(),
      needsSetup: !hasAdminCredential(db),
      authenticated,
      state: authenticated ? buildAdminState(db) : undefined,
    });
  });

  app.post('/api/admin/setup', async (req, res) => {
    const db = await loadDb();
    if (hasAdminCredential(db)) {
      res.status(409).json({ ok: false, error: 'تم إعداد كلمة مرور الإدارة مسبقاً' });
      return;
    }
    const password = String(req.body?.password || '').trim();
    if (password.length < 6) {
      res.status(400).json({ ok: false, error: 'يجب أن لا تقل كلمة المرور عن 6 أحرف' });
      return;
    }
    db.adminPasswordHash = hashSecret(password);
    await saveDb(db);

    const token = createSession('admin', undefined, db);
    setSessionCookie(res, req, 'nexus_admin_session', token);
    res.json({ ok: true, storageMode: getStorageMode(), token, state: buildAdminState(db) });
  });

  app.post('/api/admin/login', async (req, res) => {
    const db = await loadDb();
    if (!hasAdminCredential(db)) {
      res.status(400).json({ ok: false, error: 'يرجى إعداد كلمة مرور الإدارة أولاً' });
      return;
    }
    const password = String(req.body?.password || '').trim();
    if (!verifyAdminPasscode(db, password)) {
      res.status(401).json({ ok: false, error: 'كلمة مرور الإدارة غير صحيحة' });
      return;
    }
    const token = createSession('admin', undefined, db);
    setSessionCookie(res, req, 'nexus_admin_session', token);
    res.json({ ok: true, storageMode: getStorageMode(), token, state: buildAdminState(db) });
  });

  app.post('/api/admin/logout', async (req, res) => {
    const db = await loadDb();
    const { token } = extractToken(req, 'nexus_admin_session');
    revokeSessionToken(token, db);
    clearSessionCookie(res, req, 'nexus_admin_session');
    res.json({ ok: true });
  });

  app.get('/api/admin/state', requireAdmin, async (_req, res) => {
    const db = await loadDb();
    res.json({ ok: true, storageMode: getStorageMode(), state: buildAdminState(db) });
  });

  app.post('/api/admin/users', requireAdmin, async (req, res) => {
    const db = await loadDb();
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '').trim();
    const displayNameInput = String(req.body?.displayName || '').trim();
    const usernameInput = String(req.body?.username || '').trim();

    if (!email || !password) {
      res.status(400).json({ ok: false, error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
      return;
    }

    const emailLower = email.toLowerCase();
    if (db.users.some((u) => u.email.toLowerCase() === emailLower)) {
      res.status(409).json({ ok: false, error: 'البريد الإلكتروني مسجل بالفعل' });
      return;
    }

    const prefix = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') || 'agent';
    const playerId = generatePlayerId(db.users);
    const id = `usr_${Date.now()}_${crypto.randomInt(100, 999)}`;

    const newUser: StoredUser = {
      id,
      playerId,
      uuid: crypto.randomUUID(),
      username: usernameInput || `${prefix}_egp`,
      displayName: displayNameInput || prefix,
      email,
      emailLower,
      passwordHash: hashSecret(password),
      telegramHandle: `@${prefix}`,
      balanceEgp: Math.max(0, Number(req.body?.balanceEgp) || 0),
      frozenEgp: 0,
      insuranceEgp: null,
      canTrade: true,
      active: req.body?.active !== false,
      depositFeePct: 3.0,
      withdrawalFeePct: 1.8,
      referralCode: `EG-${playerId.replace('PL-', '')}`,
      referralRatePct: 0.5,
      twoFactorEnabled: true,
      trc20Address: 'TY9xK8mPq7VwRz4nLp3JdXs2kF9aBc7eW1',
      createdAt: new Date().toISOString(),
    };

    db.users.unshift(newUser);
    await saveDb(db);
    res.json({ ok: true, user: sanitizeUser(newUser), state: buildAdminState(db) });
  });

  app.patch('/api/admin/users/:userId', requireAdmin, async (req, res) => {
    const db = await loadDb();
    const { userId } = req.params;
    const idx = db.users.findIndex((u) => u.id === userId);
    if (idx < 0) {
      res.status(404).json({ ok: false, error: 'الحساب غير موجود' });
      return;
    }

    const user = db.users[idx];
    const patch = req.body ?? {};

    if (typeof patch.displayName === 'string' && patch.displayName.trim()) {
      user.displayName = patch.displayName.trim();
    }
    if (typeof patch.email === 'string' && patch.email.trim()) {
      const nextEmail = patch.email.trim();
      const nextLower = nextEmail.toLowerCase();
      if (db.users.some((u) => u.id !== userId && u.email.toLowerCase() === nextLower)) {
        res.status(409).json({ ok: false, error: 'البريد الإلكتروني مستخدم لحساب آخر' });
        return;
      }
      user.email = nextEmail;
      user.emailLower = nextLower;
    }
    if (typeof patch.password === 'string' && patch.password.trim()) {
      user.passwordHash = hashSecret(patch.password.trim());
      delete user.password;
    }
    if (typeof patch.balanceEgp === 'number' && Number.isFinite(patch.balanceEgp)) {
      user.balanceEgp = Math.max(0, Math.round(patch.balanceEgp * 100) / 100);
    }
    if (typeof patch.active === 'boolean') {
      user.active = patch.active;
    }
    if (typeof patch.canTrade === 'boolean') {
      user.canTrade = patch.canTrade;
    }
    if (typeof patch.fixedDepositNumber === 'string') {
      user.fixedDepositNumber = patch.fixedDepositNumber.trim();
    }
    if (typeof patch.fixedDepositMethod === 'string') {
      user.fixedDepositMethod = patch.fixedDepositMethod.trim();
    }

    db.users[idx] = user;
    await saveDb(db);
    res.json({ ok: true, user: sanitizeUser(user), state: buildAdminState(db) });
  });

  app.post('/api/admin/deposit-number', requireAdmin, async (req, res) => {
    const db = await loadDb();
    const userId = String(req.body?.userId || '').trim();
    const identifier = String(req.body?.identifier || '').trim().toLowerCase();
    const identNoAt = identifier.replace(/^@/, '');
    const depositNumber = String(req.body?.depositNumber || '').trim();
    const depositMethod = String(req.body?.depositMethod || '').trim();

    if (!depositNumber) {
      res.status(400).json({ ok: false, error: 'اكتب رقم الإيداع الثابت أولاً' });
      return;
    }

    const idx = db.users.findIndex((u) => {
      if (userId && u.id === userId) return true;
      if (!identifier) return false;
      const uEmail = u.email.toLowerCase();
      const uUser = u.username.toLowerCase().replace(/^@/, '');
      const uPid = u.playerId.toLowerCase();
      return uEmail === identifier || uUser === identNoAt || uPid === identifier;
    });

    if (idx < 0) {
      res.status(404).json({ ok: false, error: 'لم يتم العثور على الحساب بالبريد أو ID اللاعب' });
      return;
    }

    db.users[idx].fixedDepositNumber = depositNumber;
    if (depositMethod) {
      db.users[idx].fixedDepositMethod = depositMethod;
    }
    await saveDb(db);
    res.json({ ok: true, user: sanitizeUser(db.users[idx]), state: buildAdminState(db) });
  });

  app.delete('/api/admin/users/:userId', requireAdmin, async (req, res) => {
    const db = await loadDb();
    const { userId } = req.params;
    db.users = db.users.filter((u) => u.id !== userId);
    await saveDb(db);
    res.json({ ok: true, state: buildAdminState(db) });
  });

  app.post('/api/admin/withdrawals', requireAdmin, async (req, res) => {
    const db = await loadDb();
    const userId = String(req.body?.userId || '').trim();
    const target = db.users.find((u) => u.id === userId);
    if (!target) {
      res.status(404).json({ ok: false, error: 'اختر وكيل صحيح أولاً' });
      return;
    }

    const amountEgp = Math.max(1, Number(req.body?.amountEgp) || 0);
    const method = String(req.body?.destinationMethod || 'فودافون كاش').trim();
    const number = String(req.body?.requisiteNumber || '01000000000').trim();
    const recipient = String(req.body?.recipientName || target.displayName).trim();
    const note = String(req.body?.note || '').trim();
    const rate = Math.max(1, Number(db.config.usdRate) || 49.85);
    const nowIso = new Date().toISOString();
    const wdId = `wd_${Date.now()}_${crypto.randomInt(100, 999)}`;
    const msgId = `msg_${Date.now()}_${crypto.randomInt(100, 999)}`;
    const orderCode = `WD-${crypto.randomInt(400000, 999999)}`;

    const wdDoc: WithdrawalOrder = {
      id: wdId,
      userId,
      orderId: orderCode,
      accountId: `acc_${userId}`,
      amountLocal: amountEgp,
      amountUsdt: Math.round((amountEgp / rate) * 100) / 100,
      incomeUsdt: 0,
      rate,
      destinationMethod: method,
      requisiteNumber: number,
      recipientName: recipient,
      status: 'awaiting_confirmation',
      createdAt: nowIso,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      adminCreated: true,
      receiptFiles: [],
    };

    const msgDoc: SmsMessage = {
      id: msgId,
      userId,
      deviceId: 'admin_desk',
      deviceName: 'لوحة الإدارة',
      sender: 'طلب سحب من الإدارة',
      body:
        note ||
        `طلب سحب جديد بقيمة ${amountEgp.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م إلى (${method} - ${number}). برجاء التأكيد لخصم المبلغ أو الرفض.`,
      parsedAmount: amountEgp,
      currency: 'EGP',
      matchedDepositId: null,
      matchedOrderId: orderCode,
      withdrawalId: wdId,
      withdrawalAmountEgp: amountEgp,
      withdrawalDestination: `${method} · ${number}`,
      withdrawalRecipient: recipient,
      withdrawalActionStatus: 'pending_confirmation',
      status: 'unmatched',
      receivedAt: nowIso,
    };

    db.withdrawals.unshift(wdDoc);
    db.messages.unshift(msgDoc);
    await saveDb(db);
    res.json({ ok: true, state: buildAdminState(db) });
  });

  app.post('/api/admin/messages', requireAdmin, async (req, res) => {
    const db = await loadDb();
    const userId = String(req.body?.userId || '').trim();
    const target = db.users.find((u) => u.id === userId);
    if (!target) {
      res.status(404).json({ ok: false, error: 'الوكيل غير موجود' });
      return;
    }
    const msgDoc: SmsMessage = {
      id: `msg_${Date.now()}_${crypto.randomInt(100, 999)}`,
      userId,
      deviceId: 'admin_desk',
      deviceName: 'لوحة الإدارة',
      sender: String(req.body?.sender || 'إدارة المنصة').trim(),
      body: String(req.body?.body || '').trim(),
      parsedAmount: typeof req.body?.amountEgp === 'number' ? req.body.amountEgp : null,
      currency: 'EGP',
      matchedDepositId: null,
      matchedOrderId: null,
      status: 'unmatched',
      receivedAt: new Date().toISOString(),
    };
    db.messages.unshift(msgDoc);
    await saveDb(db);
    res.json({ ok: true, state: buildAdminState(db) });
  });

  app.post('/api/admin/deposits', requireAdmin, async (req, res) => {
    const db = await loadDb();
    const userId = String(req.body?.userId || '').trim();
    const identifier = String(req.body?.identifier || '').trim().toLowerCase();
    const identNoAt = identifier.replace(/^@/, '');

    const idx = db.users.findIndex((u) => {
      if (userId && u.id === userId) return true;
      if (!identifier) return false;
      const uEmail = u.email.toLowerCase();
      const uUser = u.username.toLowerCase().replace(/^@/, '');
      const uPid = u.playerId.toLowerCase();
      return uEmail === identifier || uUser === identNoAt || uPid === identifier;
    });

    if (idx < 0) {
      res.status(404).json({ ok: false, error: 'لم يتم العثور على الوكيل بالبريد أو اليوزر المحدد' });
      return;
    }

    const target = db.users[idx];
    const amountEgp = Math.max(1, Number(req.body?.amountEgp) || 0);
    const autoCredit = req.body?.autoCredit !== false;
    const bankName = String(req.body?.bankName || '').trim() || 'إيداع فوري من الإدارة';
    const note = String(req.body?.note || '').trim();
    const rate = Math.max(1, Number(db.config.usdRate) || 49.85);
    const nowIso = new Date().toISOString();

    if (autoCredit) {
      target.balanceEgp = Math.round((Number(target.balanceEgp || 0) + amountEgp) * 100) / 100;
      db.users[idx] = target;
    }

    const depId = `dep_${Date.now()}_${crypto.randomInt(100, 999)}`;
    const orderId = `EG-${crypto.randomInt(884200, 984199)}`;

    const depDoc: DepositOrder = {
      id: depId,
      userId: target.id,
      orderId,
      accountId: `acc_${target.id}`,
      amountLocal: amountEgp,
      amountUsdt: Math.round((amountEgp / rate) * 100) / 100,
      incomeUsdt: Math.round(amountEgp * ((target.depositFeePct ?? 3.0) / 100) * 100) / 100,
      rate,
      requisiteId: 'req_admin_direct',
      bankName,
      ownerName: target.displayName,
      requisiteNumber: target.username,
      status: autoCredit ? 'completed' : 'pending',
      createdAt: nowIso,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      confirmedAt: autoCredit ? nowIso : null,
      customerNote: note || undefined,
    };

    const msgDoc: SmsMessage = {
      id: `msg_${Date.now()}_${crypto.randomInt(100, 999)}`,
      userId: target.id,
      deviceId: 'admin_desk',
      deviceName: 'إدارة المنصة',
      sender: 'إيداع رصيد فوري',
      body:
        note ||
        `تم إيداع مبلغ ${amountEgp.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م في حسابك (${target.email}) بنجاح. رصيدك الحالي: ${target.balanceEgp.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م.`,
      parsedAmount: amountEgp,
      currency: 'EGP',
      matchedDepositId: depId,
      matchedOrderId: orderId,
      status: 'matched',
      receivedAt: nowIso,
    };

    db.deposits.unshift(depDoc);
    db.messages.unshift(msgDoc);
    await saveDb(db);
    res.json({ ok: true, user: sanitizeUser(target), state: buildAdminState(db) });
  });

  app.post('/api/admin/deposits/:id/action', requireAdmin, async (req, res) => {
    const db = await loadDb();
    const { id } = req.params;
    const action = String(req.body?.action || '');
    const depIdx = db.deposits.findIndex((d) => d.id === id);
    if (depIdx < 0) {
      res.status(404).json({ ok: false, error: 'عملية الإيداع غير موجودة' });
      return;
    }

    const dep = db.deposits[depIdx];
    if (dep.status === 'pending') {
      const uIdx = db.users.findIndex((u) => u.id === dep.userId);
      if (action === 'confirm') {
        dep.status = 'completed';
        dep.confirmedAt = new Date().toISOString();
        if (uIdx >= 0) {
          db.users[uIdx].balanceEgp =
            Math.round((Number(db.users[uIdx].balanceEgp || 0) + Number(dep.amountLocal || 0)) * 100) /
            100;
          db.messages.unshift({
            id: `msg_${Date.now()}_${crypto.randomInt(100, 999)}`,
            userId: dep.userId,
            deviceId: 'admin_desk',
            deviceName: 'إدارة المنصة',
            sender: 'تأكيد الإيداع',
            body: `تمت الموافقة على طلب الإيداع (${dep.orderId}) وإضافة ${Number(dep.amountLocal).toLocaleString('en-US')} ج.م إلى رصيدك.`,
            parsedAmount: dep.amountLocal,
            currency: 'EGP',
            matchedDepositId: dep.id,
            matchedOrderId: dep.orderId,
            status: 'matched',
            receivedAt: new Date().toISOString(),
          });
        }
      } else if (action === 'cancel') {
        dep.status = 'cancelled';
        if (uIdx >= 0) {
          db.messages.unshift({
            id: `msg_${Date.now()}_${crypto.randomInt(100, 999)}`,
            userId: dep.userId,
            deviceId: 'admin_desk',
            deviceName: 'إدارة المنصة',
            sender: 'رفض الإيداع',
            body: `تم رفض طلب الإيداع (${dep.orderId}) بمبلغ ${Number(dep.amountLocal).toLocaleString('en-US')} ج.م من الإدارة.`,
            parsedAmount: dep.amountLocal,
            currency: 'EGP',
            matchedDepositId: dep.id,
            matchedOrderId: dep.orderId,
            status: 'ignored',
            receivedAt: new Date().toISOString(),
          });
        }
      }
      db.deposits[depIdx] = dep;
      await saveDb(db);
    }
    res.json({ ok: true, state: buildAdminState(db) });
  });

  app.post('/api/admin/withdrawals/:id/action', requireAdmin, async (req, res) => {
    const db = await loadDb();
    const { id } = req.params;
    const action = String(req.body?.action || '');
    const wdIdx = db.withdrawals.findIndex((w) => w.id === id);
    if (wdIdx < 0) {
      res.status(404).json({ ok: false, error: 'طلب السحب غير موجود' });
      return;
    }

    const w = db.withdrawals[wdIdx];
    if (w.status === 'awaiting_confirmation' || (w.status as unknown as string) === 'pending') {
      if (action === 'confirm') {
        w.status = 'completed';
        w.acceptedAt = new Date().toISOString();
        if (w.userId) {
          db.messages.unshift({
            id: `msg_${Date.now()}_${crypto.randomInt(100, 999)}`,
            userId: w.userId,
            deviceId: 'admin_desk',
            deviceName: 'إدارة المنصة',
            sender: 'تأكيد طلب السحب',
            body: `تمت الموافقة على طلب السحب (${w.orderId}) بقيمة ${Number(w.amountLocal).toLocaleString('en-US')} ج.م (${w.destinationMethod}).`,
            parsedAmount: w.amountLocal,
            currency: 'EGP',
            matchedDepositId: null,
            matchedOrderId: w.orderId,
            status: 'matched',
            receivedAt: new Date().toISOString(),
          });
        }
      } else if (action === 'reject') {
        w.status = 'rejected';
        if (w.userId) {
          db.messages.unshift({
            id: `msg_${Date.now()}_${crypto.randomInt(100, 999)}`,
            userId: w.userId,
            deviceId: 'admin_desk',
            deviceName: 'إدارة المنصة',
            sender: 'رفض طلب السحب',
            body: `تم رفض طلب السحب (${w.orderId}) بقيمة ${Number(w.amountLocal).toLocaleString('en-US')} ج.م من الإدارة.`,
            parsedAmount: w.amountLocal,
            currency: 'EGP',
            matchedDepositId: null,
            matchedOrderId: w.orderId,
            status: 'ignored',
            receivedAt: new Date().toISOString(),
          });
        }
      }
      db.withdrawals[wdIdx] = w;
      await saveDb(db);
    }
    res.json({ ok: true, state: buildAdminState(db) });
  });

  app.patch('/api/admin/config', requireAdmin, async (req, res) => {
    const db = await loadDb();
    db.config.platformName = FIXED_PLATFORM_NAME;
    const usdRate = Number(req.body?.usdRate);
    if (Number.isFinite(usdRate) && usdRate > 0) {
      db.config.usdRate = Math.round(usdRate * 100) / 100;
    }
    if (typeof req.body?.defaultDepositNumber === 'string') {
      db.config.defaultDepositNumber = req.body.defaultDepositNumber.trim();
    }
    if (req.body?.depositMethodNumbers && typeof req.body.depositMethodNumbers === 'object') {
      const m = req.body.depositMethodNumbers as Record<string, unknown>;
      db.config.depositMethodNumbers = {
        vodafone:
          typeof m.vodafone === 'string'
            ? m.vodafone.trim()
            : db.config.depositMethodNumbers?.vodafone || '',
        etisalat:
          typeof m.etisalat === 'string'
            ? m.etisalat.trim()
            : db.config.depositMethodNumbers?.etisalat || '',
        orange:
          typeof m.orange === 'string'
            ? m.orange.trim()
            : db.config.depositMethodNumbers?.orange || '',
        binance:
          typeof m.binance === 'string'
            ? m.binance.trim()
            : db.config.depositMethodNumbers?.binance || '',
      };
    }
    const newPass = String(req.body?.adminPassword || '').trim();
    if (newPass) {
      if (newPass.length < 6) {
        res.status(400).json({ ok: false, error: 'كلمة مرور الإدارة يجب أن لا تقل عن 6 أحرف' });
        return;
      }
      db.adminPasswordHash = hashSecret(newPass);
    }
    await saveDb(db);
    res.json({ ok: true, state: buildAdminState(db) });
  });

  // ================= AGENT AUTH & DESK ROUTES =================
  app.post('/api/auth/login', async (req, res) => {
    const db = await loadDb();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '').trim();

    if (!email || !password) {
      res.status(400).json({ ok: false, error: 'من فضلك أدخل البريد الإلكتروني وكلمة المرور' });
      return;
    }

    const user = db.users.find((u) => u.email.trim().toLowerCase() === email);
    if (!user) {
      res.status(401).json({ ok: false, error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
      return;
    }

    const validPass = user.passwordHash
      ? verifySecret(password, user.passwordHash)
      : Boolean(user.password && timingSafeStringCompare(user.password, password));

    if (!validPass) {
      res.status(401).json({ ok: false, error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
      return;
    }

    if (!user.active) {
      res.status(403).json({
        ok: false,
        error: 'هذا الحساب غير مفعّل من لوحة الإدارة — برجاء التواصل مع الإدارة لتفعيل الحساب',
      });
      return;
    }

    if (!user.passwordHash && user.password) {
      user.passwordHash = hashSecret(password);
      delete user.password;
      await saveDb(db);
    }

    const token = createSession('agent', user.id, db);
    setSessionCookie(res, req, 'nexus_agent_session', token);
    const slice = buildAgentSlice(db, user.id);
    res.json({ ok: true, token, user: sanitizeUser(user), slice });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const db = await loadDb();
    const { token } = extractToken(req, 'nexus_agent_session');
    revokeSessionToken(token, db);
    clearSessionCookie(res, req, 'nexus_agent_session');
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    const user = db.users.find((u) => u.id === uid);
    if (!user || !user.active) {
      res.status(401).json({ ok: false, error: 'الحساب غير نشط أو غير موجود' });
      return;
    }
    const slice = buildAgentSlice(db, uid);
    res.json({ ok: true, user: sanitizeUser(user), slice });
  });

  app.patch('/api/agent/trade-status', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    const idx = db.users.findIndex((u) => u.id === uid);
    if (idx >= 0) {
      db.users[idx].canTrade = Boolean(req.body?.canTrade);
      await saveDb(db);
    }
    res.json({ ok: true, slice: buildAgentSlice(db, uid) });
  });

  app.patch('/api/agent/2fa', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    const idx = db.users.findIndex((u) => u.id === uid);
    if (idx >= 0) {
      db.users[idx].twoFactorEnabled = Boolean(req.body?.enabled);
      await saveDb(db);
    }
    res.json({ ok: true, slice: buildAgentSlice(db, uid) });
  });

  app.patch('/api/agent/settings', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    db.userSettings[uid] = {
      ...DEFAULT_SETTINGS,
      ...(db.userSettings[uid] ?? {}),
      ...(req.body ?? {}),
    };
    await saveDb(db);
    res.json({ ok: true, slice: buildAgentSlice(db, uid) });
  });

  app.post('/api/agent/deposits', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    const user = db.users.find((u) => u.id === uid);
    if (!user) {
      res.status(404).json({ ok: false, error: 'User not found' });
      return;
    }

    const amountLocal = Number(req.body?.amountLocal);
    const paymentMethod = String(req.body?.paymentMethod || '').trim();
    const senderNumber = String(req.body?.senderNumber || '').trim();
    const note = String(req.body?.note || '').trim();

    if (!Number.isFinite(amountLocal) || amountLocal <= 0) {
      res.status(400).json({ ok: false, error: 'أدخل مبلغ إيداع صحيح' });
      return;
    }
    if (!ALLOWED_METHODS.has(paymentMethod)) {
      res.status(400).json({
        ok: false,
        error: 'اختر وسيلة دفع واحدة من: فودافون كاش، اتصالات كاش، أورنج كاش، باينانس',
      });
      return;
    }

    const methodMap: Record<string, string | undefined> = {
      'فودافون كاش': db.config.depositMethodNumbers?.vodafone,
      'اتصالات كاش': db.config.depositMethodNumbers?.etisalat,
      'أورنج كاش': db.config.depositMethodNumbers?.orange,
      'باينانس': db.config.depositMethodNumbers?.binance,
    };
    const assignedDepositNumber =
      (user.fixedDepositNumber || '').trim() ||
      (methodMap[paymentMethod] || '').trim() ||
      (db.config.defaultDepositNumber || '').trim();

    if (!assignedDepositNumber) {
      res.status(400).json({
        ok: false,
        error: 'لم يتم تعيين رقم إيداع ثابت من الإدارة بعد — برجاء التواصل مع الإدارة',
      });
      return;
    }

    const rate = Math.max(1, Number(db.config.usdRate) || 49.85);
    const dep: DepositOrder = {
      id: `dep_${Date.now()}_${crypto.randomInt(100, 999)}`,
      userId: uid,
      orderId: `EG-${crypto.randomInt(884200, 984199)}`,
      accountId: `acc_${uid}`,
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
    db.deposits.unshift(dep);
    await saveDb(db);
    res.json({ ok: true, deposit: dep, slice: buildAgentSlice(db, uid) });
  });

  app.post('/api/agent/deposits/:id/action', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    const { id } = req.params;
    const action = String(req.body?.action || '');
    const depIdx = db.deposits.findIndex((d) => d.id === id && d.userId === uid);
    if (depIdx < 0) {
      res.status(404).json({ ok: false, error: 'الطلب غير موجود' });
      return;
    }

    const dep = db.deposits[depIdx];
    if (action === 'confirm') {
      res.status(403).json({
        ok: false,
        error: 'تأكيد الإيداع يتم فقط من لوحة تحكم الإدارة بعد مراجعة التحويل',
      });
      return;
    } else if (action === 'cancel' && dep.status === 'pending') {
      dep.status = 'cancelled';
    } else if (action === 'dispute' && dep.status !== 'disputed') {
      dep.status = 'disputed';
      const dispute: DisputeItem = {
        id: `dsp_${Date.now()}_${crypto.randomInt(100, 999)}`,
        userId: uid,
        orderId: dep.orderId,
        accountId: dep.accountId,
        claimedAmountLocal: dep.amountLocal,
        originalAmountLocal: dep.amountLocal,
        amountUsdt: dep.amountUsdt,
        bankName: dep.bankName,
        requisiteNumber: dep.requisiteNumber,
        receiptRef: `RCPT-${crypto.randomInt(10000, 99999)}`,
        reason: 'مراجعة مبلغ التحويل من العميل',
        slaMinutesLeft: 25,
        status: 'open',
        createdAt: new Date().toISOString(),
      };
      db.disputes.unshift(dispute);
    }

    db.deposits[depIdx] = dep;
    await saveDb(db);
    res.json({ ok: true, slice: buildAgentSlice(db, uid) });
  });

  app.post('/api/agent/disputes/:id/resolve', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    const { id } = req.params;
    const decision = String(req.body?.decision || '');
    const note = String(req.body?.note || '').trim();

    if (decision === 'approve') {
      res.status(403).json({
        ok: false,
        error: 'اعتماد الإيداعات والنزاعات يتم من لوحة تحكم الإدارة فقط',
      });
      return;
    }

    const idx = db.disputes.findIndex((d) => d.id === id && d.userId === uid);
    if (idx < 0) {
      res.status(404).json({ ok: false, error: 'النزاع غير موجود' });
      return;
    }

    const dsp = db.disputes[idx];
    dsp.status = 'resolved_reject';
    if (note) dsp.resolutionNote = note;
    db.disputes[idx] = dsp;

    const depIdx = db.deposits.findIndex((d) => d.orderId === dsp.orderId && d.userId === uid);
    if (depIdx >= 0 && db.deposits[depIdx].status !== 'completed') {
      db.deposits[depIdx].status = 'cancelled';
    }

    await saveDb(db);
    res.json({ ok: true, slice: buildAgentSlice(db, uid) });
  });

  app.post('/api/agent/withdrawals', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    const user = db.users.find((u) => u.id === uid);
    if (!user) {
      res.status(404).json({ ok: false, error: 'الحساب غير موجود' });
      return;
    }

    const amountLocal = Number(req.body?.amountLocal);
    const destinationMethod = String(req.body?.destinationMethod || '').trim();
    const requisiteNumber = String(req.body?.requisiteNumber || '').trim();
    const recipientName = String(req.body?.recipientName || user.displayName).trim();

    if (!Number.isFinite(amountLocal) || amountLocal <= 0) {
      res.status(400).json({ ok: false, error: 'أدخل مبلغ سحب صحيح' });
      return;
    }
    if (!ALLOWED_METHODS.has(destinationMethod)) {
      res.status(400).json({
        ok: false,
        error: 'اختر وسيلة واحدة من: فودافون كاش، اتصالات كاش، أورنج كاش، باينانس',
      });
      return;
    }
    if (!requisiteNumber) {
      res.status(400).json({ ok: false, error: 'أدخل رقم المحفظة أو حساب باينانس' });
      return;
    }

    const rate = Math.max(1, Number(db.config.usdRate) || 49.85);
    const nowIso = new Date().toISOString();
    const wdDoc: WithdrawalOrder = {
      id: `wd_${Date.now()}_${crypto.randomInt(100, 999)}`,
      userId: uid,
      orderId: `WD-${crypto.randomInt(400000, 999999)}`,
      accountId: `acc_${uid}`,
      amountLocal: Math.round(amountLocal * 100) / 100,
      amountUsdt: Math.round((amountLocal / rate) * 100) / 100,
      incomeUsdt: 0,
      rate,
      destinationMethod,
      requisiteNumber,
      recipientName,
      status: 'awaiting_confirmation',
      createdAt: nowIso,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      adminCreated: false,
      requestedByAgent: true,
      receiptFiles: [],
    };
    db.withdrawals.unshift(wdDoc);
    await saveDb(db);
    res.json({ ok: true, withdrawal: wdDoc, slice: buildAgentSlice(db, uid) });
  });

  app.post('/api/agent/withdrawals/:id/respond', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    const { id } = req.params;
    const action = String(req.body?.action || '');
    if (!['confirm', 'reject'].includes(action)) {
      res.status(400).json({ ok: false, error: 'إجراء غير صحيح' });
      return;
    }

    const wdIdx = db.withdrawals.findIndex(
      (w) => w.id === id && w.userId === uid && w.adminCreated
    );
    if (wdIdx < 0) {
      res.status(404).json({ ok: false, error: 'طلب السحب غير موجود' });
      return;
    }

    const w = db.withdrawals[wdIdx];
    if (w.status !== 'awaiting_confirmation') {
      res.status(400).json({ ok: false, error: 'تم الرد على طلب السحب بالفعل' });
      return;
    }

    const uIdx = db.users.findIndex((u) => u.id === uid);
    if (uIdx < 0) {
      res.status(404).json({ ok: false, error: 'الحساب غير موجود' });
      return;
    }

    if (action === 'confirm') {
      const currentBal = Number(db.users[uIdx].balanceEgp || 0);
      const amt = Number(w.amountLocal || 0);
      if (currentBal < amt) {
        res.status(400).json({ ok: false, error: 'الرصيد الحالي غير كافي لتأكيد خصم السحب' });
        return;
      }
      db.users[uIdx].balanceEgp = Math.round((currentBal - amt) * 100) / 100;
      db.withdrawals[wdIdx].status = 'completed';
    } else {
      db.withdrawals[wdIdx].status = 'rejected';
    }

    const msgIdx = db.messages.findIndex((m) => m.withdrawalId === w.id && m.userId === uid);
    if (msgIdx >= 0) {
      db.messages[msgIdx].withdrawalActionStatus = action === 'confirm' ? 'confirmed' : 'rejected';
      db.messages[msgIdx].status = action === 'confirm' ? 'matched' : 'ignored';
    }

    await saveDb(db);
    res.json({ ok: true, slice: buildAgentSlice(db, uid) });
  });

  app.post('/api/agent/withdrawals/:id/claim', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    const { id } = req.params;
    const idx = db.withdrawals.findIndex(
      (w) => w.id === id && (w.status === 'available' || w.userId === uid)
    );
    if (idx < 0) {
      res.status(404).json({ ok: false, error: 'الطلب غير متاح' });
      return;
    }
    db.withdrawals[idx].userId = uid;
    db.withdrawals[idx].accountId = `acc_${uid}`;
    db.withdrawals[idx].status = 'accepted';
    db.withdrawals[idx].acceptedAt = new Date().toISOString();
    await saveDb(db);
    res.json({ ok: true, slice: buildAgentSlice(db, uid) });
  });

  app.post('/api/agent/withdrawals/:id/action', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    const { id } = req.params;
    const action = String(req.body?.action || '');
    const idx = db.withdrawals.findIndex((w) => w.id === id && w.userId === uid);
    if (idx < 0) {
      res.status(404).json({ ok: false, error: 'طلب السحب غير موجود' });
      return;
    }

    const w = db.withdrawals[idx];
    if (w.requestedByAgent) {
      if (action === 'cancel' && w.status === 'awaiting_confirmation') {
        w.status = 'cancelled';
        db.withdrawals[idx] = w;
        await saveDb(db);
        res.json({ ok: true, slice: buildAgentSlice(db, uid) });
        return;
      }
      res.status(403).json({ ok: false, error: 'تأكيد أو رفض طلب السحب يتم من لوحة الإدارة' });
      return;
    }
    if (action === 'upload_receipt') {
      const fileName = String(req.body?.fileName || `receipt-${Date.now()}.jpg`);
      const fileSize = String(req.body?.fileSize || '240 KB');
      w.receiptFiles = [...(w.receiptFiles ?? []), { name: fileName, size: fileSize }];
      if (w.status === 'accepted') w.status = 'awaiting_confirmation';
    } else if (action === 'complete') {
      const uIdx = db.users.findIndex((u) => u.id === uid);
      if (uIdx >= 0 && w.status !== 'completed') {
        const amt = Number(w.amountLocal || 0);
        if (Number(db.users[uIdx].balanceEgp || 0) < amt) {
          res.status(400).json({ ok: false, error: 'الرصيد الحالي غير كافي لإتمام السحب' });
          return;
        }
        db.users[uIdx].balanceEgp =
          Math.round((Number(db.users[uIdx].balanceEgp || 0) - amt) * 100) / 100;
      }
      w.status = 'completed';
    } else if (action === 'cancel') {
      w.status = 'cancelled';
    }

    db.withdrawals[idx] = w;
    await saveDb(db);
    res.json({ ok: true, slice: buildAgentSlice(db, uid) });
  });

  app.post('/api/agent/requisites', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    const b = req.body ?? {};
    const bankName = String(b.bankName || '').trim();
    if (!ALLOWED_METHODS.has(bankName)) {
      res.status(400).json({
        ok: false,
        error: 'اختر وسيلة دفع واحدة من: فودافون كاش، اتصالات كاش، أورنج كاش، باينانس',
      });
      return;
    }
    const existingCount = db.requisites.filter((r) => r.userId === uid).length;
    if (existingCount >= 1) {
      res.status(400).json({
        ok: false,
        error: 'يُسمح بوسيلة دفع واحدة فقط لكل حساب — يمكنك تعديلها أو حذفها أولاً',
      });
      return;
    }
    const newReq: Requisite = {
      id: `req_${Date.now()}_${crypto.randomInt(100, 999)}`,
      userId: uid,
      accountId: `acc_${uid}`,
      bankName,
      ownerName: String(b.ownerName || '').trim(),
      accountNumber: String(b.accountNumber || '').trim(),
      type: bankName === 'باينانس' ? 'instapay' : 'wallet',
      minOrder: Math.max(1, Number(b.minOrder) || 100),
      maxOrder: Math.max(100, Number(b.maxOrder) || 30000),
      dailyLimit: Math.max(100, Number(b.dailyLimit) || 100000),
      dailyUsed: 0,
      bidRate: Number(b.bidRate) || 3.0,
      active: b.active !== false,
    };
    db.requisites.unshift(newReq);
    await saveDb(db);
    res.json({ ok: true, slice: buildAgentSlice(db, uid) });
  });

  app.patch('/api/agent/requisites/:id', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    const { id } = req.params;
    const idx = db.requisites.findIndex((r) => r.id === id && r.userId === uid);
    if (idx < 0) {
      res.status(404).json({ ok: false, error: 'وسيلة الدفع غير موجودة' });
      return;
    }
    const patch = req.body ?? {};
    if (typeof patch.bankName === 'string' && !ALLOWED_METHODS.has(patch.bankName.trim())) {
      res.status(400).json({
        ok: false,
        error: 'اختر وسيلة دفع واحدة من: فودافون كاش، اتصالات كاش، أورنج كاش، باينانس',
      });
      return;
    }
    db.requisites[idx] = {
      ...db.requisites[idx],
      ...(typeof patch.bankName === 'string' ? { bankName: patch.bankName.trim() } : {}),
      ...(typeof patch.ownerName === 'string' ? { ownerName: patch.ownerName } : {}),
      ...(typeof patch.accountNumber === 'string' ? { accountNumber: patch.accountNumber } : {}),
      ...(typeof patch.minOrder === 'number' ? { minOrder: patch.minOrder } : {}),
      ...(typeof patch.maxOrder === 'number' ? { maxOrder: patch.maxOrder } : {}),
      ...(typeof patch.dailyLimit === 'number' ? { dailyLimit: patch.dailyLimit } : {}),
      ...(typeof patch.active === 'boolean' ? { active: patch.active } : {}),
    };
    await saveDb(db);
    res.json({ ok: true, slice: buildAgentSlice(db, uid) });
  });

  app.delete('/api/agent/requisites/:id', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    const { id } = req.params;
    db.requisites = db.requisites.filter((r) => !(r.id === id && r.userId === uid));
    await saveDb(db);
    res.json({ ok: true, slice: buildAgentSlice(db, uid) });
  });

  app.post('/api/agent/automatic/android', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    const b = req.body ?? {};
    const dev: AndroidDevice = {
      id: `dev_${Date.now()}_${crypto.randomInt(100, 999)}`,
      userId: uid,
      name: String(b.name || 'جهاز استقبال جديد').trim(),
      model: String(b.model || 'Samsung Galaxy').trim(),
      osVersion: 'Android 14',
      appVersion: 'v3.4.2',
      pairingToken: `NX-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      online: true,
      batteryPct: 92,
      capturedCount: 0,
      lastPingAt: new Date().toISOString(),
    };
    db.androidDevices.unshift(dev);
    await saveDb(db);
    res.json({ ok: true, slice: buildAgentSlice(db, uid) });
  });

  app.patch('/api/agent/automatic/android/:id', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    const { id } = req.params;
    const idx = db.androidDevices.findIndex((d) => d.id === id && d.userId === uid);
    if (idx >= 0) {
      db.androidDevices[idx] = {
        ...db.androidDevices[idx],
        ...(typeof req.body?.online === 'boolean' ? { online: req.body.online } : {}),
        ...(req.body?.ping ? { lastPingAt: new Date().toISOString(), online: true } : {}),
      };
      await saveDb(db);
    }
    res.json({ ok: true, slice: buildAgentSlice(db, uid) });
  });

  app.delete('/api/agent/automatic/android/:id', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    const { id } = req.params;
    db.androidDevices = db.androidDevices.filter((d) => !(d.id === id && d.userId === uid));
    await saveDb(db);
    res.json({ ok: true, slice: buildAgentSlice(db, uid) });
  });

  app.post('/api/agent/automatic/telegram', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    const b = req.body ?? {};
    const bot: TelegramBotConfig = {
      id: `tg_${Date.now()}_${crypto.randomInt(100, 999)}`,
      userId: uid,
      name: String(b.name || 'بوت الإشعارات').trim(),
      botUsername: String(b.botUsername || '@nexus_alerts_bot').trim(),
      chatId: String(b.chatId || '-1001928374').trim(),
      events: Array.isArray(b.events) ? b.events : ['deposit_created', 'dispute_opened'],
    };
    db.telegramBots.unshift(bot);
    await saveDb(db);
    res.json({ ok: true, slice: buildAgentSlice(db, uid) });
  });

  app.delete('/api/agent/automatic/telegram/:id', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    const { id } = req.params;
    db.telegramBots = db.telegramBots.filter((b) => !(b.id === id && b.userId === uid));
    await saveDb(db);
    res.json({ ok: true, slice: buildAgentSlice(db, uid) });
  });

  app.post('/api/agent/automatic/apikeys', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    const b = req.body ?? {};
    const rawKey = `nx_live_${crypto.randomBytes(18).toString('hex')}`;
    const keyDoc: ApiKeyConfig = {
      id: `key_${Date.now()}_${crypto.randomInt(100, 999)}`,
      userId: uid,
      label: String(b.label || 'Production Key').trim(),
      keyPrefix: rawKey.slice(0, 14),
      fullKey: rawKey,
      webhookUrl: String(b.webhookUrl || 'https://merchant.example/webhook').trim(),
      permissions: Array.isArray(b.permissions)
        ? b.permissions
        : ['deposits:read', 'withdrawals:write'],
      createdAt: new Date().toISOString(),
    };
    db.apiKeys.unshift(keyDoc);
    await saveDb(db);
    res.json({ ok: true, slice: buildAgentSlice(db, uid) });
  });

  app.delete('/api/agent/automatic/apikeys/:id', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    const { id } = req.params;
    db.apiKeys = db.apiKeys.filter((k) => !(k.id === id && k.userId === uid));
    await saveDb(db);
    res.json({ ok: true, slice: buildAgentSlice(db, uid) });
  });

  app.post('/api/agent/messages/simulate', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    const pending = db.deposits.find((d) => d.userId === uid && d.status === 'pending');
    const amount = pending ? pending.amountLocal : 1000;
    const msg: SmsMessage = {
      id: `msg_${Date.now()}_${crypto.randomInt(100, 999)}`,
      userId: uid,
      deviceId: db.androidDevices.find((d) => d.userId === uid)?.id || 'dev_sim',
      deviceName: db.androidDevices.find((d) => d.userId === uid)?.name || 'جهاز الاستقبال',
      sender: 'VF-Cash',
      body: `تم استلام مبلغ ${amount.toLocaleString('en-US')} جنيه بنجاح.`,
      parsedAmount: amount,
      currency: 'EGP',
      matchedDepositId: pending ? pending.id : null,
      matchedOrderId: pending ? pending.orderId : null,
      status: pending ? 'matched' : 'unmatched',
      receivedAt: new Date().toISOString(),
    };
    db.messages.unshift(msg);
    await saveDb(db);
    res.json({ ok: true, slice: buildAgentSlice(db, uid) });
  });

  app.post('/api/agent/messages/withdrawal-response', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    const messageId = String(req.body?.messageId || '').trim();
    const action = String(req.body?.action || '');

    if (!messageId || !['confirm', 'reject'].includes(action)) {
      res.status(400).json({ ok: false, error: 'بيانات غير مكتملة' });
      return;
    }

    const msgIdx = db.messages.findIndex((m) => m.id === messageId && m.userId === uid);
    if (msgIdx < 0) {
      res.status(404).json({ ok: false, error: 'الرسالة غير موجودة' });
      return;
    }

    const msg = db.messages[msgIdx];
    if (msg.withdrawalActionStatus !== 'pending_confirmation') {
      res.status(400).json({ ok: false, error: 'تم الرد على طلب السحب بالفعل' });
      return;
    }

    const amt = Number(msg.withdrawalAmountEgp ?? msg.parsedAmount ?? 0);
    const uIdx = db.users.findIndex((u) => u.id === uid);
    if (uIdx < 0) {
      res.status(404).json({ ok: false, error: 'الحساب غير موجود' });
      return;
    }

    if (action === 'confirm') {
      const currentBal = Number(db.users[uIdx].balanceEgp || 0);
      if (currentBal < amt) {
        res.status(400).json({ ok: false, error: 'الرصيد الحالي غير كافي لتأكيد خصم السحب' });
        return;
      }
      db.users[uIdx].balanceEgp = Math.round((currentBal - amt) * 100) / 100;
      db.messages[msgIdx].withdrawalActionStatus = 'confirmed';
      db.messages[msgIdx].status = 'matched';
    } else {
      db.messages[msgIdx].withdrawalActionStatus = 'rejected';
      db.messages[msgIdx].status = 'ignored';
    }

    if (msg.withdrawalId) {
      const wdIdx = db.withdrawals.findIndex((w) => w.id === msg.withdrawalId && w.userId === uid);
      if (wdIdx >= 0) {
        db.withdrawals[wdIdx].status = action === 'confirm' ? 'completed' : 'rejected';
      }
    }

    await saveDb(db);
    res.json({ ok: true, slice: buildAgentSlice(db, uid) });
  });

  app.post('/api/agent/topups', requireAgent, async (req, res) => {
    const db = await loadDb();
    const uid = (req as Request & { agentUserId: string }).agentUserId;
    const amount = Math.max(1, Number(req.body?.amountUsdt) || 0);
    const network = (req.body?.network as TopUpRecord['network']) || 'TRC-20';

    const topUp: TopUpRecord = {
      id: `top_${Date.now()}_${crypto.randomInt(100, 999)}`,
      userId: uid,
      txHash: `0x${crypto.randomBytes(16).toString('hex')}`,
      network,
      amountUsdt: amount,
      status: 'confirming',
      createdAt: new Date().toISOString(),
    };
    db.topUps.unshift(topUp);
    await saveDb(db);
    res.json({ ok: true, slice: buildAgentSlice(db, uid) });
  });

  // Fallback JSON error for unknown /api routes so nothing falls back to HTML/405
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ ok: false, error: 'API endpoint not found' });
  });

  return app;
}
