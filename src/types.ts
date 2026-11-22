export type Language = 'ar' | 'en';

export type NotificationPosition =
  | 'top-right'
  | 'top-left'
  | 'top-center'
  | 'bottom-right'
  | 'bottom-left'
  | 'bottom-center';

export type RoutePath =
  | '/deposits'
  | '/deposits/disputes'
  | '/withdrawals'
  | '/withdrawals/my'
  | '/statistics'
  | '/requisite'
  | '/messages'
  | '/profile'
  | '/referrals';

export const ALLOWED_PAYMENT_METHODS = [
  'فودافون كاش',
  'اتصالات كاش',
  'أورنج كاش',
  'باينانس',
] as const;

export type AllowedPaymentMethod = (typeof ALLOWED_PAYMENT_METHODS)[number];

export type DepositStatus = 'pending' | 'completed' | 'disputed' | 'cancelled' | 'expired';

export type DisputeStatus = 'open' | 'reviewing' | 'resolved_approve' | 'resolved_reject';

export type WithdrawalStatus =
  | 'available'
  | 'accepted'
  | 'awaiting_confirmation'
  | 'completed'
  | 'cancelled'
  | 'rejected'
  | 'expired';

export type RequisiteType = 'wallet' | 'instapay' | 'card' | 'iban';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning';
  title: string;
  message?: string;
}

export interface AppSettings {
  lang: Language;
  tzOffset: number;
  dateFormat: 'DD.MM.YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY';
  clockFormat: '24h' | '12h';
  compactTables: boolean;
  mirrorHeader: boolean;
  compactCards: boolean;
  hideRowNumbers: boolean;
  fullRowTint: boolean;
  tableZoom: number;
  sidebarCollapsedDesktop: boolean;
  notificationPosition: NotificationPosition;
  skipConfirm: boolean;
  defaultLanding: RoutePath;
}

export interface AccountDesk {
  account_id: string;
  uuid: string;
  username: string;
  countryCode: 'SA' | 'EG' | 'AE' | 'KG';
  label: string;
  labelEn: string;
  currency: string;
  balanceUsdt: number;
  frozenUsdt: number;
  insuranceAmount: number | null;
  rate: number;
  canTrade: boolean;
  depositFeePct: number;
  withdrawalFeePct: number;
  fixedDepositNumber?: string;
  fixedDepositMethod?: string;
}

export interface UserProfile {
  traderId: string;
  playerId?: string;
  displayName: string;
  email: string;
  telegramHandle: string;
  twoFactorEnabled: boolean;
  referralCode: string;
  referralRatePct: number;
  trc20Address: string;
  fixedDepositNumber?: string;
  fixedDepositMethod?: string;
}

export interface ManagedUser {
  id: string;
  playerId: string;
  uuid: string;
  username: string;
  displayName: string;
  email: string;
  emailLower?: string;
  password?: string;
  hasPassword?: boolean;
  telegramHandle: string;
  balanceEgp: number;
  frozenEgp: number;
  insuranceEgp: number | null;
  canTrade: boolean;
  active: boolean;
  depositFeePct: number;
  withdrawalFeePct: number;
  referralCode: string;
  referralRatePct: number;
  twoFactorEnabled: boolean;
  trc20Address: string;
  fixedDepositNumber?: string;
  fixedDepositMethod?: string;
  createdAt: string;
}

export interface DepositOrder {
  id: string;
  userId?: string;
  orderId: string;
  accountId: string;
  amountLocal: number;
  amountUsdt: number;
  incomeUsdt: number;
  rate: number;
  requisiteId: string;
  bankName: string;
  ownerName: string;
  requisiteNumber: string;
  status: DepositStatus;
  createdAt: string;
  expiresAt: string;
  confirmedAt?: string | null;
  customerNote?: string;
}

export interface DisputeItem {
  id: string;
  userId?: string;
  orderId: string;
  accountId: string;
  claimedAmountLocal: number;
  originalAmountLocal: number;
  amountUsdt: number;
  bankName: string;
  requisiteNumber: string;
  receiptRef: string;
  reason: string;
  slaMinutesLeft: number;
  status: DisputeStatus;
  resolutionNote?: string;
  createdAt: string;
}

export interface WithdrawalOrder {
  id: string;
  userId?: string;
  orderId: string;
  accountId: string;
  amountLocal: number;
  amountUsdt: number;
  incomeUsdt: number;
  rate: number;
  destinationMethod: string;
  requisiteNumber: string;
  recipientName: string;
  status: WithdrawalStatus;
  createdAt: string;
  acceptedAt?: string;
  expiresAt: string;
  adminCreated?: boolean;
  requestedByAgent?: boolean;
  receiptFiles: Array<{ name: string; size: string }>;
}

export interface Requisite {
  id: string;
  userId?: string;
  accountId: string;
  bankName: string;
  ownerName: string;
  accountNumber: string;
  type: RequisiteType;
  minOrder: number;
  maxOrder: number;
  dailyLimit: number;
  dailyUsed: number;
  bidRate: number;
  active: boolean;
  deviceId?: string;
}

export interface AndroidDevice {
  id: string;
  userId?: string;
  name: string;
  model: string;
  osVersion: string;
  appVersion: string;
  pairingToken: string;
  online: boolean;
  batteryPct: number;
  capturedCount: number;
  lastPingAt: string;
  linkedRequisiteId?: string;
}

export interface TelegramBotConfig {
  id: string;
  userId?: string;
  name: string;
  botUsername: string;
  chatId: string;
  events: string[];
}

export interface ApiKeyConfig {
  id: string;
  userId?: string;
  label: string;
  keyPrefix: string;
  fullKey: string;
  webhookUrl: string;
  permissions: string[];
  createdAt: string;
}

export interface SmsMessage {
  id: string;
  userId?: string;
  deviceId: string;
  deviceName: string;
  sender: string;
  body: string;
  parsedAmount: number | null;
  currency: string;
  matchedDepositId: string | null;
  matchedOrderId: string | null;
  withdrawalId?: string;
  withdrawalAmountEgp?: number;
  withdrawalDestination?: string;
  withdrawalRecipient?: string;
  withdrawalActionStatus?: 'pending_confirmation' | 'confirmed' | 'rejected';
  status: 'matched' | 'unmatched' | 'ignored';
  receivedAt: string;
}

export interface TopUpRecord {
  id: string;
  userId?: string;
  txHash: string;
  network: 'TRC-20' | 'BEP-20' | 'TON';
  amountUsdt: number;
  status: 'confirming' | 'credited';
  createdAt: string;
}

export interface ReferralPartner {
  id: string;
  userId?: string;
  partnerCode: string;
  volumeUsdt: number;
  earnedUsdt: number;
  status: 'active' | 'inactive';
  joinedAt: string;
}

export interface OnlinePresenceEntry {
  visitorId: string;
  userId: string | null;
  playerId?: string | null;
  userName: string | null;
  email: string | null;
  route: string;
  lastPingAt: string;
  lastPingMs?: number;
}

export interface PlatformConfig {
  platformName: string;
  countryCode: 'SA' | 'EG' | 'AE' | 'KG';
  currencyCode: string;
  usdRate: number;
  adminPassword?: string;
  defaultDepositNumber?: string;
  depositMethodNumbers?: {
    vodafone?: string;
    etisalat?: string;
    orange?: string;
    binance?: string;
  };
}

export interface PlatformState {
  config: PlatformConfig;
  users: ManagedUser[];
  onlinePresence: OnlinePresenceEntry[];
  onlineCount: number;
  profile: UserProfile;
  currentAccountId: string;
  accounts: AccountDesk[];
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
  settings: AppSettings;
}
