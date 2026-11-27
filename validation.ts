// Synchronized validation constants and helpers matching firebase-blueprint.json

export const FIELD_LIMITS = {
  id: { min: 1, max: 128 },
  businessName: { min: 2, max: 120 },
  tagline: { max: 160 },
  gstin: { length: 15 },
  phone: { min: 6, max: 20 },
  email: { min: 3, max: 160 },
  address: { max: 240 },
  city: { max: 80 },
  state: { max: 80 },
  pincode: { max: 10 },
  invoicePrefix: { min: 1, max: 12 },
  productName: { min: 1, max: 140 },
  sku: { min: 1, max: 48 },
  category: { min: 1, max: 60 },
  brand: { max: 60 },
  unit: { min: 1, max: 24 },
  supplierName: { max: 100 },
  customerName: { min: 2, max: 120 },
  staffName: { min: 2, max: 100 },
  department: { max: 60 },
  notes: { max: 300 },
  expenseTitle: { min: 2, max: 140 },
  vendorName: { max: 100 },
  reason: { max: 200 },
  returnReason: { max: 240 },
  maxSaleItems: 50,
} as const;

export const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const INDIAN_PHONE_REGEX = /^[+]?[0-9\s-]{6,20}$/;

export function isValidGstin(gstin: string): boolean {
  const trimmed = gstin.trim().toUpperCase();
  if (!trimmed) return true; // optional unless explicitly provided
  return GSTIN_REGEX.test(trimmed);
}

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  return trimmed.length >= FIELD_LIMITS.email.min && trimmed.length <= FIELD_LIMITS.email.max && EMAIL_REGEX.test(trimmed);
}

export function isValidPhone(phone: string): boolean {
  const trimmed = phone.trim();
  return trimmed.length >= FIELD_LIMITS.phone.min && trimmed.length <= FIELD_LIMITS.phone.max && INDIAN_PHONE_REGEX.test(trimmed);
}

export function clampStr(val: string | undefined | null, maxLen: number): string {
  if (!val) return '';
  return val.trim().slice(0, maxLen);
}

export function roundInr(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function generateSafeId(prefix = 'doc'): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16) || 'doc';
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    : Math.random().toString(36).slice(2, 14) + Date.now().toString(36);
  return `${cleanPrefix}_${rand}`;
}
