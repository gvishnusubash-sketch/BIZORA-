import type { Timestamp } from 'firebase/firestore';

export type Role = 'owner' | 'manager' | 'cashier' | 'inventory';

export type DateRangePreset = 'today' | 'week' | 'month' | 'custom';

export type GstMode = 'none' | 'cgst_sgst' | 'igst';

export type PaymentMethod = 'cash' | 'upi' | 'card' | 'bank_transfer' | 'credit';

export type NonCreditPaymentMethod = 'cash' | 'upi' | 'card' | 'bank_transfer';

export type ExpenseCategory =
  | 'rent'
  | 'utilities'
  | 'salaries'
  | 'inventory_purchase'
  | 'transport'
  | 'marketing'
  | 'maintenance'
  | 'other';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  activeBusinessId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserMembership {
  businessId: string;
  businessName: string;
  role: Role;
  isDemo: boolean;
  joinedAt: Timestamp;
}

export interface Business {
  id: string;
  name: string;
  tagline?: string;
  gstin?: string;
  gstEnabled: boolean;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  currency: 'INR';
  ownerId: string;
  isDemo: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface BusinessMember {
  uid: string;
  businessId: string;
  email: string;
  displayName: string;
  role: Role;
  status: 'active' | 'suspended';
  inviteId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface BusinessInvite {
  id: string;
  businessId: string;
  businessName: string;
  email: string;
  role: Exclude<Role, 'owner'>;
  staffId?: string;
  invitedByUid: string;
  status: 'pending' | 'accepted' | 'revoked';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StaffMember {
  id: string;
  businessId: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  department?: string;
  monthlySalary: number;
  status: 'active' | 'invited' | 'inactive';
  linkedUid?: string;
  joinedDate?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Product {
  id: string;
  businessId: string;
  name: string;
  sku: string;
  category: string;
  brand?: string;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  gstRate: 0 | 5 | 12 | 18 | 28;
  currentStock: number;
  lowStockThreshold: number;
  supplierName?: string;
  supplierPhone?: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type StockMovementType =
  | 'initial'
  | 'purchase'
  | 'sale'
  | 'return'
  | 'adjustment_in'
  | 'adjustment_out';

export interface StockMovement {
  id: string;
  businessId: string;
  productId: string;
  productName: string;
  sku: string;
  type: StockMovementType;
  quantityDelta: number;
  previousStock: number;
  newStock: number;
  referenceId?: string;
  reason?: string;
  performedByUid: string;
  performedByName: string;
  createdAt: Timestamp;
}

export interface Customer {
  id: string;
  businessId: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  gstin?: string;
  totalPurchases: number;
  totalPaid: number;
  outstandingBalance: number;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SaleItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  purchasePrice: number;
  discountAmount: number;
  gstRate: number;
  taxAmount: number;
  lineTotal: number;
}

export interface Sale {
  id: string;
  businessId: string;
  invoiceNumber: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  items: SaleItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  cogsTotal: number;
  gstMode: GstMode;
  paymentMethod: PaymentMethod;
  amountPaid: number;
  balanceDue: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  status: 'completed' | 'returned' | 'cancelled';
  returnReason?: string;
  createdByUid: string;
  createdByName: string;
  saleDate: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Payment {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  saleId?: string;
  invoiceNumber?: string;
  amount: number;
  method: NonCreditPaymentMethod;
  referenceNote?: string;
  receivedByUid: string;
  receivedByName: string;
  paymentDate: Timestamp;
  createdAt: Timestamp;
}

export interface Expense {
  id: string;
  businessId: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  paymentMethod: NonCreditPaymentMethod;
  vendorName?: string;
  notes?: string;
  expenseDate: Timestamp;
  recordedByUid: string;
  recordedByName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ActivityLog {
  id: string;
  businessId: string;
  actorUid: string;
  actorName: string;
  actorRole: Role;
  module: 'inventory' | 'sales' | 'customers' | 'staff' | 'expenses' | 'settings';
  action: string;
  summary: string;
  targetId?: string;
  createdAt: Timestamp;
}
