import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { clampStr, FIELD_LIMITS, generateSafeId, roundInr } from '../lib/validation';
import type {
  ActivityLog,
  Business,
  BusinessInvite,
  Customer,
  Expense,
  ExpenseCategory,
  GstMode,
  NonCreditPaymentMethod,
  Payment,
  PaymentMethod,
  Product,
  Role,
  Sale,
  SaleItem,
  StaffMember,
  StockMovement,
  StockMovementType,
  UserMembership,
  UserProfile,
} from '../types/bizora';

export interface ActorContext {
  uid: string;
  name: string;
  email: string;
  role: Role;
}

export interface CreateBusinessInput {
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
  invoicePrefix?: string;
  isDemo?: boolean;
}

export async function ensureUserProfile(user: {
  uid: string;
  email: string;
  displayName: string | null;
}): Promise<UserProfile> {
  const userRef = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
    const payload = {
      uid: user.uid,
      email: clampStr(user.email, FIELD_LIMITS.email.max),
      displayName: clampStr(user.displayName || user.email.split('@')[0] || 'Owner', FIELD_LIMITS.staffName.max),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(userRef, payload);
    const createdSnap = await getDoc(userRef);
    return createdSnap.data() as UserProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
  }
}

export async function setActiveBusinessForUser(uid: string, businessId: string): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      activeBusinessId: businessId,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function createBusinessWorkspace(
  actor: { uid: string; email: string; displayName: string },
  input: CreateBusinessInput
): Promise<string> {
  const businessId = generateSafeId(input.isDemo ? 'demo' : 'biz');
  const staffId = generateSafeId('staff');
  const businessPath = `businesses/${businessId}`;

  try {
    const businessPayload: Record<string, unknown> = {
      name: clampStr(input.name, FIELD_LIMITS.businessName.max),
      gstEnabled: Boolean(input.gstEnabled),
      invoicePrefix: clampStr(input.invoicePrefix || 'INV', FIELD_LIMITS.invoicePrefix.max).toUpperCase(),
      nextInvoiceNumber: 1001,
      currency: 'INR',
      ownerId: actor.uid,
      isDemo: Boolean(input.isDemo),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (input.tagline?.trim()) businessPayload.tagline = clampStr(input.tagline, FIELD_LIMITS.tagline.max);
    if (input.gstin?.trim()) businessPayload.gstin = clampStr(input.gstin.toUpperCase(), FIELD_LIMITS.gstin.length);
    if (input.phone?.trim()) businessPayload.phone = clampStr(input.phone, FIELD_LIMITS.phone.max);
    if (input.email?.trim()) businessPayload.email = clampStr(input.email, FIELD_LIMITS.email.max);
    if (input.address?.trim()) businessPayload.address = clampStr(input.address, FIELD_LIMITS.address.max);
    if (input.city?.trim()) businessPayload.city = clampStr(input.city, FIELD_LIMITS.city.max);
    if (input.state?.trim()) businessPayload.state = clampStr(input.state, FIELD_LIMITS.state.max);
    if (input.pincode?.trim()) businessPayload.pincode = clampStr(input.pincode, FIELD_LIMITS.pincode.max);

    const batch1 = writeBatch(db);
    batch1.set(doc(db, 'businesses', businessId), businessPayload);

    batch1.set(doc(db, 'businesses', businessId, 'members', actor.uid), {
      uid: actor.uid,
      businessId,
      email: clampStr(actor.email, FIELD_LIMITS.email.max),
      displayName: clampStr(actor.displayName, FIELD_LIMITS.staffName.max),
      role: 'owner',
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch1.set(doc(db, 'businesses', businessId, 'staff', staffId), {
      businessId,
      name: clampStr(actor.displayName, FIELD_LIMITS.staffName.max),
      email: clampStr(actor.email, FIELD_LIMITS.email.max),
      role: 'owner',
      department: 'Management',
      monthlySalary: 0,
      status: 'active',
      linkedUid: actor.uid,
      joinedDate: new Date().toISOString().slice(0, 10),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Commit business + member + staff to server FIRST before updating user profile pointers
    await batch1.commit();

    const batch2 = writeBatch(db);
    batch2.set(doc(db, 'users', actor.uid, 'memberships', businessId), {
      businessId,
      businessName: clampStr(input.name, FIELD_LIMITS.businessName.max),
      role: 'owner',
      isDemo: Boolean(input.isDemo),
      joinedAt: serverTimestamp(),
    });

    batch2.update(doc(db, 'users', actor.uid), {
      activeBusinessId: businessId,
      updatedAt: serverTimestamp(),
    });

    await batch2.commit();
    return businessId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, businessPath);
  }
}

export async function createDemoBusinessWithSeedData(actor: {
  uid: string;
  email: string;
  displayName: string;
}): Promise<string> {
  const businessId = await createBusinessWorkspace(actor, {
    name: 'Kaveri Mobile & Tech Mart (Demo)',
    tagline: 'Smartphones, GaN Chargers, Audio & Accessories',
    gstin: '29AABCK4821M1Z7',
    gstEnabled: true,
    phone: '+91 98450 61234',
    email: actor.email,
    address: '42, 100 Feet Road, Indiranagar',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560038',
    invoicePrefix: 'KVM',
    isDemo: true,
  });

  try {
    const batch = writeBatch(db);
    const now = Date.now();
    const daysAgo = (d: number, hour = 14) => {
      const dt = new Date(now - d * 86400000);
      dt.setHours(hour, 15, 0, 0);
      return Timestamp.fromDate(dt);
    };

    const demoProducts: Array<Omit<Product, 'id' | 'businessId' | 'createdAt' | 'updatedAt'> & { id: string }> = [
      {
        id: 'prod_gan65',
        name: 'Anker 65W GaN II Dual USB-C Charger',
        sku: 'KVM-CHG-065',
        category: 'Chargers & Cables',
        brand: 'Anker',
        unit: 'pcs',
        purchasePrice: 1850,
        sellingPrice: 2799,
        gstRate: 18,
        currentStock: 24,
        lowStockThreshold: 8,
        supplierName: 'Shree Balaji Telecom Distributors',
        supplierPhone: '+91 98801 44210',
        isActive: true,
      },
      {
        id: 'prod_tws_air',
        name: 'OnePlus Nord Buds 3 Pro ANC',
        sku: 'KVM-AUD-104',
        category: 'Audio & Earbuds',
        brand: 'OnePlus',
        unit: 'pcs',
        purchasePrice: 2150,
        sellingPrice: 2999,
        gstRate: 18,
        currentStock: 16,
        lowStockThreshold: 6,
        supplierName: 'Deccan Digital Wholesale',
        supplierPhone: '+91 97402 88912',
        isActive: true,
      },
      {
        id: 'prod_pb20k',
        name: 'Xiaomi 20000mAh 33W Power Bank',
        sku: 'KVM-PWR-20K',
        category: 'Power Banks',
        brand: 'Xiaomi',
        unit: 'pcs',
        purchasePrice: 1450,
        sellingPrice: 2199,
        gstRate: 18,
        currentStock: 5,
        lowStockThreshold: 8,
        supplierName: 'Deccan Digital Wholesale',
        supplierPhone: '+91 97402 88912',
        isActive: true,
      },
      {
        id: 'prod_glass_16',
        name: 'Spigen EZ Fit Tempered Glass (iPhone 16)',
        sku: 'KVM-PRT-16T',
        category: 'Screen Protection',
        brand: 'Spigen',
        unit: 'pack',
        purchasePrice: 520,
        sellingPrice: 999,
        gstRate: 18,
        currentStock: 4,
        lowStockThreshold: 10,
        supplierName: 'Metro Mobile Spares',
        supplierPhone: '+91 99004 11765',
        isActive: true,
      },
      {
        id: 'prod_cable_c',
        name: 'Belkin Braided USB-C to C Cable (2m)',
        sku: 'KVM-CBL-200',
        category: 'Chargers & Cables',
        brand: 'Belkin',
        unit: 'pcs',
        purchasePrice: 410,
        sellingPrice: 799,
        gstRate: 18,
        currentStock: 38,
        lowStockThreshold: 10,
        supplierName: 'Shree Balaji Telecom Distributors',
        supplierPhone: '+91 98801 44210',
        isActive: true,
      },
      {
        id: 'prod_stand',
        name: 'Aluminium Foldable MagSafe Desk Stand',
        sku: 'KVM-ACC-308',
        category: 'Stands & Mounts',
        brand: 'Portronics',
        unit: 'pcs',
        purchasePrice: 380,
        sellingPrice: 699,
        gstRate: 12,
        currentStock: 19,
        lowStockThreshold: 5,
        supplierName: 'Metro Mobile Spares',
        supplierPhone: '+91 99004 11765',
        isActive: true,
      },
      {
        id: 'prod_ssd1tb',
        name: 'SanDisk 1TB Portable NVMe SSD',
        sku: 'KVM-STR-1TB',
        category: 'Storage',
        brand: 'SanDisk',
        unit: 'pcs',
        purchasePrice: 6400,
        sellingPrice: 8299,
        gstRate: 18,
        currentStock: 3,
        lowStockThreshold: 4,
        supplierName: 'Apex IT Peripherals',
        supplierPhone: '+91 98455 77100',
        isActive: true,
      },
    ];

    for (const p of demoProducts) {
      const { id, ...rest } = p;
      batch.set(doc(db, 'businesses', businessId, 'products', id), {
        ...rest,
        businessId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'businesses', businessId, 'stockMovements', generateSafeId('mov')), {
        businessId,
        productId: id,
        productName: p.name,
        sku: p.sku,
        type: 'initial',
        quantityDelta: p.currentStock,
        previousStock: 0,
        newStock: p.currentStock,
        reason: 'Opening stock (Demo Store)',
        performedByUid: actor.uid,
        performedByName: actor.displayName,
        createdAt: serverTimestamp(),
      });
    }

    const demoCustomers = [
      {
        id: 'cust_arjun',
        name: 'Arjun Deshmukh (TechWorks Studio)',
        phone: '+91 98451 22019',
        email: 'arjun@techworks.in',
        address: 'HSR Layout Sector 2, Bengaluru',
        gstin: '29AADCT9021B1Z2',
        totalPurchases: 29487,
        totalPaid: 21000,
        outstandingBalance: 8487,
        notes: 'Corporate bulk buyer — 15-day credit terms',
      },
      {
        id: 'cust_meera',
        name: 'Meera Nair',
        phone: '+91 97412 33091',
        email: 'meera.nair@example.com',
        address: 'Koramangala 4th Block, Bengaluru',
        totalPurchases: 6136,
        totalPaid: 6136,
        outstandingBalance: 0,
        notes: 'Regular retail customer',
      },
      {
        id: 'cust_sanjay',
        name: 'Sanjay Traders & Mobiles',
        phone: '+91 99011 54820',
        address: 'SP Road, Bengaluru',
        gstin: '29AABFS1234K1Z9',
        totalPurchases: 17118,
        totalPaid: 12000,
        outstandingBalance: 5118,
        notes: 'Sub-dealer wholesale account',
      },
      {
        id: 'cust_priya',
        name: 'Priya Venkatesh',
        phone: '+91 98862 71045',
        address: 'Domlur, Bengaluru',
        totalPurchases: 3303,
        totalPaid: 3303,
        outstandingBalance: 0,
      },
    ];

    for (const c of demoCustomers) {
      const { id, ...rest } = c;
      batch.set(doc(db, 'businesses', businessId, 'customers', id), {
        ...rest,
        businessId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const demoSales: Array<{
      id: string;
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
      daysAgo: number;
    }> = [
      {
        id: 'sale_demo_1',
        invoiceNumber: 'KVM-1001',
        customerId: 'cust_arjun',
        customerName: 'Arjun Deshmukh (TechWorks Studio)',
        customerPhone: '+91 98451 22019',
        items: [
          {
            productId: 'prod_ssd1tb',
            productName: 'SanDisk 1TB Portable NVMe SSD',
            sku: 'KVM-STR-1TB',
            quantity: 2,
            unitPrice: 8299,
            purchasePrice: 6400,
            discountAmount: 0,
            gstRate: 18,
            taxAmount: 2987.64,
            lineTotal: 19585.64,
          },
          {
            productId: 'prod_gan65',
            productName: 'Anker 65W GaN II Dual USB-C Charger',
            sku: 'KVM-CHG-065',
            quantity: 3,
            unitPrice: 2799,
            purchasePrice: 1850,
            discountAmount: 0,
            gstRate: 18,
            taxAmount: 1511.46,
            lineTotal: 9908.46,
          },
        ],
        subtotal: 24995,
        discountTotal: 0,
        taxTotal: 4499.1,
        grandTotal: 29494.1,
        cogsTotal: 18350,
        gstMode: 'cgst_sgst',
        paymentMethod: 'bank_transfer',
        amountPaid: 21007.1,
        balanceDue: 8487,
        paymentStatus: 'partial',
        daysAgo: 18,
      },
      {
        id: 'sale_demo_2',
        invoiceNumber: 'KVM-1002',
        customerId: 'cust_meera',
        customerName: 'Meera Nair',
        customerPhone: '+91 97412 33091',
        items: [
          {
            productId: 'prod_tws_air',
            productName: 'OnePlus Nord Buds 3 Pro ANC',
            sku: 'KVM-AUD-104',
            quantity: 1,
            unitPrice: 2999,
            purchasePrice: 2150,
            discountAmount: 100,
            gstRate: 18,
            taxAmount: 521.82,
            lineTotal: 3420.82,
          },
          {
            productId: 'prod_pb20k',
            productName: 'Xiaomi 20000mAh 33W Power Bank',
            sku: 'KVM-PWR-20K',
            quantity: 1,
            unitPrice: 2199,
            purchasePrice: 1450,
            discountAmount: 0,
            gstRate: 18,
            taxAmount: 395.82,
            lineTotal: 2594.82,
          },
        ],
        subtotal: 5198,
        discountTotal: 100,
        taxTotal: 917.64,
        grandTotal: 6015.64,
        cogsTotal: 3600,
        gstMode: 'cgst_sgst',
        paymentMethod: 'upi',
        amountPaid: 6015.64,
        balanceDue: 0,
        paymentStatus: 'paid',
        daysAgo: 11,
      },
      {
        id: 'sale_demo_3',
        invoiceNumber: 'KVM-1003',
        customerId: 'cust_sanjay',
        customerName: 'Sanjay Traders & Mobiles',
        customerPhone: '+91 99011 54820',
        items: [
          {
            productId: 'prod_cable_c',
            productName: 'Belkin Braided USB-C to C Cable (2m)',
            sku: 'KVM-CBL-200',
            quantity: 10,
            unitPrice: 799,
            purchasePrice: 410,
            discountAmount: 400,
            gstRate: 18,
            taxAmount: 1366.2,
            lineTotal: 8956.2,
          },
          {
            productId: 'prod_glass_16',
            productName: 'Spigen EZ Fit Tempered Glass (iPhone 16)',
            sku: 'KVM-PRT-16T',
            quantity: 7,
            unitPrice: 999,
            purchasePrice: 520,
            discountAmount: 0,
            gstRate: 18,
            taxAmount: 1258.74,
            lineTotal: 8251.74,
          },
        ],
        subtotal: 14983,
        discountTotal: 400,
        taxTotal: 2624.94,
        grandTotal: 17207.94,
        cogsTotal: 7740,
        gstMode: 'cgst_sgst',
        paymentMethod: 'credit',
        amountPaid: 12089.94,
        balanceDue: 5118,
        paymentStatus: 'partial',
        daysAgo: 5,
      },
      {
        id: 'sale_demo_4',
        invoiceNumber: 'KVM-1004',
        customerId: 'cust_priya',
        customerName: 'Priya Venkatesh',
        customerPhone: '+91 98862 71045',
        items: [
          {
            productId: 'prod_gan65',
            productName: 'Anker 65W GaN II Dual USB-C Charger',
            sku: 'KVM-CHG-065',
            quantity: 1,
            unitPrice: 2799,
            purchasePrice: 1850,
            discountAmount: 0,
            gstRate: 18,
            taxAmount: 503.82,
            lineTotal: 3302.82,
          },
        ],
        subtotal: 2799,
        discountTotal: 0,
        taxTotal: 503.82,
        grandTotal: 3302.82,
        cogsTotal: 1850,
        gstMode: 'cgst_sgst',
        paymentMethod: 'upi',
        amountPaid: 3302.82,
        balanceDue: 0,
        paymentStatus: 'paid',
        daysAgo: 2,
      },
      {
        id: 'sale_demo_5',
        invoiceNumber: 'KVM-1005',
        customerName: 'Walk-in Customer',
        items: [
          {
            productId: 'prod_stand',
            productName: 'Aluminium Foldable MagSafe Desk Stand',
            sku: 'KVM-ACC-308',
            quantity: 2,
            unitPrice: 699,
            purchasePrice: 380,
            discountAmount: 0,
            gstRate: 12,
            taxAmount: 167.76,
            lineTotal: 1565.76,
          },
          {
            productId: 'prod_cable_c',
            productName: 'Belkin Braided USB-C to C Cable (2m)',
            sku: 'KVM-CBL-200',
            quantity: 2,
            unitPrice: 799,
            purchasePrice: 410,
            discountAmount: 0,
            gstRate: 18,
            taxAmount: 287.64,
            lineTotal: 1885.64,
          },
        ],
        subtotal: 2996,
        discountTotal: 0,
        taxTotal: 455.4,
        grandTotal: 3451.4,
        cogsTotal: 1580,
        gstMode: 'cgst_sgst',
        paymentMethod: 'cash',
        amountPaid: 3451.4,
        balanceDue: 0,
        paymentStatus: 'paid',
        daysAgo: 0,
      },
    ];

    for (const s of demoSales) {
      const { id, daysAgo: dAgo, ...rest } = s;
      batch.set(doc(db, 'businesses', businessId, 'sales', id), {
        ...rest,
        businessId,
        status: 'completed',
        createdByUid: actor.uid,
        createdByName: actor.displayName,
        saleDate: daysAgo(dAgo, 15),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    batch.set(doc(db, 'businesses', businessId, 'payments', 'pay_demo_1'), {
      businessId,
      customerId: 'cust_sanjay',
      customerName: 'Sanjay Traders & Mobiles',
      saleId: 'sale_demo_3',
      invoiceNumber: 'KVM-1003',
      amount: 12000,
      method: 'upi',
      referenceNote: 'GPay part payment against KVM-1003',
      receivedByUid: actor.uid,
      receivedByName: actor.displayName,
      paymentDate: daysAgo(3, 12),
      createdAt: serverTimestamp(),
    });

    const demoExpenses: Array<{
      id: string;
      title: string;
      category: ExpenseCategory;
      amount: number;
      paymentMethod: NonCreditPaymentMethod;
      vendorName: string;
      daysAgo: number;
    }> = [
      {
        id: 'exp_demo_1',
        title: 'Indiranagar Shop Monthly Rent',
        category: 'rent',
        amount: 24000,
        paymentMethod: 'bank_transfer',
        vendorName: 'Lakshmi Commercial Properties',
        daysAgo: 20,
      },
      {
        id: 'exp_demo_2',
        title: 'BESCOM Electricity & Fiber Broadband',
        category: 'utilities',
        amount: 3850,
        paymentMethod: 'upi',
        vendorName: 'BESCOM / ACT Fibernet',
        daysAgo: 9,
      },
      {
        id: 'exp_demo_3',
        title: 'Dunzo / Porter Local Wholesale Delivery',
        category: 'transport',
        amount: 940,
        paymentMethod: 'cash',
        vendorName: 'Local Courier',
        daysAgo: 3,
      },
      {
        id: 'exp_demo_4',
        title: 'Storefront Display LED & Packaging Bags',
        category: 'marketing',
        amount: 2200,
        paymentMethod: 'upi',
        vendorName: 'PrintCraft Bengaluru',
        daysAgo: 1,
      },
    ];

    for (const e of demoExpenses) {
      const { id, daysAgo: dAgo, ...rest } = e;
      batch.set(doc(db, 'businesses', businessId, 'expenses', id), {
        ...rest,
        businessId,
        expenseDate: daysAgo(dAgo, 11),
        recordedByUid: actor.uid,
        recordedByName: actor.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    batch.set(doc(db, 'businesses', businessId, 'staff', generateSafeId('staff')), {
      businessId,
      name: 'Karthik Gowda',
      email: 'karthik.billing@example.com',
      phone: '+91 96112 40921',
      role: 'cashier',
      department: 'POS & Billing',
      monthlySalary: 18000,
      status: 'active',
      joinedDate: '2025-04-01',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'businesses', businessId, 'staff', generateSafeId('staff')), {
      businessId,
      name: 'Deepa Kulkarni',
      email: 'deepa.inventory@example.com',
      phone: '+91 99802 18440',
      role: 'inventory',
      department: 'Stock & Receiving',
      monthlySalary: 20000,
      status: 'active',
      joinedDate: '2025-02-15',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'businesses', businessId), {
      nextInvoiceNumber: 1006,
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'businesses', businessId, 'activityLogs', generateSafeId('log')), {
      businessId,
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: 'owner',
      module: 'settings',
      action: 'DEMO_INITIALIZED',
      summary: 'Initialized sample demo workspace with Indian electronics retail inventory and ledger data.',
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    return businessId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `businesses/${businessId}`);
  }
}

export async function updateBusinessSettings(
  businessId: string,
  actor: ActorContext,
  updates: Partial<Omit<Business, 'id' | 'ownerId' | 'isDemo' | 'currency' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const path = `businesses/${businessId}`;
  try {
    const clean: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (updates.name !== undefined) clean.name = clampStr(updates.name, FIELD_LIMITS.businessName.max);
    if (updates.tagline !== undefined) clean.tagline = clampStr(updates.tagline, FIELD_LIMITS.tagline.max);
    if (updates.gstin !== undefined) clean.gstin = clampStr(updates.gstin.toUpperCase(), FIELD_LIMITS.gstin.length);
    if (updates.gstEnabled !== undefined) clean.gstEnabled = Boolean(updates.gstEnabled);
    if (updates.phone !== undefined) clean.phone = clampStr(updates.phone, FIELD_LIMITS.phone.max);
    if (updates.email !== undefined) clean.email = clampStr(updates.email, FIELD_LIMITS.email.max);
    if (updates.address !== undefined) clean.address = clampStr(updates.address, FIELD_LIMITS.address.max);
    if (updates.city !== undefined) clean.city = clampStr(updates.city, FIELD_LIMITS.city.max);
    if (updates.state !== undefined) clean.state = clampStr(updates.state, FIELD_LIMITS.state.max);
    if (updates.pincode !== undefined) clean.pincode = clampStr(updates.pincode, FIELD_LIMITS.pincode.max);
    if (updates.invoicePrefix !== undefined) {
      clean.invoicePrefix = clampStr(updates.invoicePrefix, FIELD_LIMITS.invoicePrefix.max).toUpperCase();
    }

    const batch = writeBatch(db);
    batch.update(doc(db, 'businesses', businessId), clean);
    batch.set(doc(db, 'businesses', businessId, 'activityLogs', generateSafeId('log')), {
      businessId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      module: 'settings',
      action: 'BUSINESS_SETTINGS_UPDATED',
      summary: 'Updated business profile and GST configuration.',
      targetId: businessId,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function acceptBusinessInvite(
  invite: BusinessInvite,
  user: { uid: string; email: string; displayName: string }
): Promise<void> {
  const path = `businesses/${invite.businessId}/members/${user.uid}`;
  try {
    const batch1 = writeBatch(db);
    batch1.set(doc(db, 'businesses', invite.businessId, 'members', user.uid), {
      uid: user.uid,
      businessId: invite.businessId,
      email: clampStr(user.email, FIELD_LIMITS.email.max),
      displayName: clampStr(user.displayName, FIELD_LIMITS.staffName.max),
      role: invite.role,
      status: 'active',
      inviteId: invite.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch1.update(doc(db, 'businessInvites', invite.id), {
      status: 'accepted',
      updatedAt: serverTimestamp(),
    });
    await batch1.commit();

    const batch2 = writeBatch(db);
    batch2.set(doc(db, 'users', user.uid, 'memberships', invite.businessId), {
      businessId: invite.businessId,
      businessName: clampStr(invite.businessName, FIELD_LIMITS.businessName.max),
      role: invite.role,
      isDemo: false,
      joinedAt: serverTimestamp(),
    });
    batch2.update(doc(db, 'users', user.uid), {
      activeBusinessId: invite.businessId,
      updatedAt: serverTimestamp(),
    });
    await batch2.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ============================================================================
// INVENTORY MODULE
// ============================================================================

export async function createProduct(
  businessId: string,
  actor: ActorContext,
  data: {
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
  }
): Promise<string> {
  const productId = generateSafeId('prod');
  const path = `businesses/${businessId}/products/${productId}`;
  try {
    const batch = writeBatch(db);
    const payload: Record<string, unknown> = {
      businessId,
      name: clampStr(data.name, FIELD_LIMITS.productName.max),
      sku: clampStr(data.sku.toUpperCase(), FIELD_LIMITS.sku.max),
      category: clampStr(data.category, FIELD_LIMITS.category.max),
      unit: clampStr(data.unit || 'pcs', FIELD_LIMITS.unit.max),
      purchasePrice: roundInr(Math.max(0, data.purchasePrice)),
      sellingPrice: roundInr(Math.max(0, data.sellingPrice)),
      gstRate: data.gstRate,
      currentStock: Math.max(0, Math.floor(data.currentStock)),
      lowStockThreshold: Math.max(0, Math.floor(data.lowStockThreshold)),
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (data.brand?.trim()) payload.brand = clampStr(data.brand, FIELD_LIMITS.brand.max);
    if (data.supplierName?.trim()) payload.supplierName = clampStr(data.supplierName, FIELD_LIMITS.supplierName.max);
    if (data.supplierPhone?.trim()) payload.supplierPhone = clampStr(data.supplierPhone, FIELD_LIMITS.phone.max);

    batch.set(doc(db, 'businesses', businessId, 'products', productId), payload);

    if (data.currentStock > 0) {
      batch.set(doc(db, 'businesses', businessId, 'stockMovements', generateSafeId('mov')), {
        businessId,
        productId,
        productName: payload.name,
        sku: payload.sku,
        type: 'initial' satisfies StockMovementType,
        quantityDelta: Math.floor(data.currentStock),
        previousStock: 0,
        newStock: Math.floor(data.currentStock),
        reason: 'Initial product entry',
        performedByUid: actor.uid,
        performedByName: actor.name,
        createdAt: serverTimestamp(),
      });
    }

    batch.set(doc(db, 'businesses', businessId, 'activityLogs', generateSafeId('log')), {
      businessId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      module: 'inventory',
      action: 'PRODUCT_CREATED',
      summary: `Added product ${payload.name} (${payload.sku}) with ${payload.currentStock} ${payload.unit}.`,
      targetId: productId,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    return productId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateProductDetails(
  businessId: string,
  productId: string,
  actor: ActorContext,
  data: {
    name: string;
    sku: string;
    category: string;
    brand?: string;
    unit: string;
    purchasePrice: number;
    sellingPrice: number;
    gstRate: 0 | 5 | 12 | 18 | 28;
    lowStockThreshold: number;
    supplierName?: string;
    supplierPhone?: string;
  }
): Promise<void> {
  const path = `businesses/${businessId}/products/${productId}`;
  try {
    const updates: Record<string, unknown> = {
      name: clampStr(data.name, FIELD_LIMITS.productName.max),
      sku: clampStr(data.sku.toUpperCase(), FIELD_LIMITS.sku.max),
      category: clampStr(data.category, FIELD_LIMITS.category.max),
      unit: clampStr(data.unit || 'pcs', FIELD_LIMITS.unit.max),
      purchasePrice: roundInr(Math.max(0, data.purchasePrice)),
      sellingPrice: roundInr(Math.max(0, data.sellingPrice)),
      gstRate: data.gstRate,
      lowStockThreshold: Math.max(0, Math.floor(data.lowStockThreshold)),
      brand: clampStr(data.brand || '', FIELD_LIMITS.brand.max),
      supplierName: clampStr(data.supplierName || '', FIELD_LIMITS.supplierName.max),
      supplierPhone: clampStr(data.supplierPhone || '', FIELD_LIMITS.phone.max),
      updatedAt: serverTimestamp(),
    };

    const batch = writeBatch(db);
    batch.update(doc(db, 'businesses', businessId, 'products', productId), updates);
    batch.set(doc(db, 'businesses', businessId, 'activityLogs', generateSafeId('log')), {
      businessId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      module: 'inventory',
      action: 'PRODUCT_UPDATED',
      summary: `Updated product details for ${updates.name} (${updates.sku}).`,
      targetId: productId,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adjustProductStock(
  businessId: string,
  productId: string,
  actor: ActorContext,
  input: {
    type: 'purchase' | 'adjustment_in' | 'adjustment_out';
    quantity: number;
    reason: string;
  }
): Promise<void> {
  const path = `businesses/${businessId}/products/${productId}`;
  const qty = Math.floor(input.quantity);
  if (qty <= 0) {
    throw new Error('Adjustment quantity must be greater than zero.');
  }

  try {
    await runTransaction(db, async (tx) => {
      const prodRef = doc(db, 'businesses', businessId, 'products', productId);
      const prodSnap = await tx.get(prodRef);
      if (!prodSnap.exists()) {
        throw new Error('Product no longer exists.');
      }
      const product = prodSnap.data() as Product;
      const delta = input.type === 'adjustment_out' ? -qty : qty;
      const newStock = product.currentStock + delta;
      if (newStock < 0) {
        throw new Error(`Cannot reduce stock below 0. Available stock is ${product.currentStock}.`);
      }

      tx.update(prodRef, {
        currentStock: newStock,
        updatedAt: serverTimestamp(),
      });

      const movRef = doc(db, 'businesses', businessId, 'stockMovements', generateSafeId('mov'));
      tx.set(movRef, {
        businessId,
        productId,
        productName: product.name,
        sku: product.sku,
        type: input.type,
        quantityDelta: delta,
        previousStock: product.currentStock,
        newStock,
        reason: clampStr(input.reason || input.type, FIELD_LIMITS.reason.max),
        performedByUid: actor.uid,
        performedByName: actor.name,
        createdAt: serverTimestamp(),
      });

      const logRef = doc(db, 'businesses', businessId, 'activityLogs', generateSafeId('log'));
      tx.set(logRef, {
        businessId,
        actorUid: actor.uid,
        actorName: actor.name,
        actorRole: actor.role,
        module: 'inventory',
        action: 'STOCK_ADJUSTED',
        summary: `${delta > 0 ? '+' : ''}${delta} ${product.unit} on ${product.name} (${product.currentStock} → ${newStock}).`,
        targetId: productId,
        createdAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Available stock') || error.message.includes('no longer exists'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteProduct(
  businessId: string,
  product: Product,
  actor: ActorContext
): Promise<void> {
  const path = `businesses/${businessId}/products/${product.id}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'businesses', businessId, 'products', product.id));
    batch.set(doc(db, 'businesses', businessId, 'activityLogs', generateSafeId('log')), {
      businessId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      module: 'inventory',
      action: 'PRODUCT_DELETED',
      summary: `Removed product ${product.name} (${product.sku}) from catalog.`,
      targetId: product.id,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ============================================================================
// CUSTOMERS & PAYMENTS MODULE
// ============================================================================

export async function createCustomer(
  businessId: string,
  actor: ActorContext,
  data: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    gstin?: string;
    notes?: string;
  }
): Promise<string> {
  const customerId = generateSafeId('cust');
  const path = `businesses/${businessId}/customers/${customerId}`;
  try {
    const batch = writeBatch(db);
    const payload: Record<string, unknown> = {
      businessId,
      name: clampStr(data.name, FIELD_LIMITS.customerName.max),
      phone: clampStr(data.phone, FIELD_LIMITS.phone.max),
      totalPurchases: 0,
      totalPaid: 0,
      outstandingBalance: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (data.email?.trim()) payload.email = clampStr(data.email, FIELD_LIMITS.email.max);
    if (data.address?.trim()) payload.address = clampStr(data.address, FIELD_LIMITS.address.max);
    if (data.gstin?.trim()) payload.gstin = clampStr(data.gstin.toUpperCase(), FIELD_LIMITS.gstin.length);
    if (data.notes?.trim()) payload.notes = clampStr(data.notes, FIELD_LIMITS.notes.max);

    batch.set(doc(db, 'businesses', businessId, 'customers', customerId), payload);
    batch.set(doc(db, 'businesses', businessId, 'activityLogs', generateSafeId('log')), {
      businessId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      module: 'customers',
      action: 'CUSTOMER_CREATED',
      summary: `Added customer ${payload.name} (${payload.phone}).`,
      targetId: customerId,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    return customerId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateCustomer(
  businessId: string,
  customerId: string,
  actor: ActorContext,
  data: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    gstin?: string;
    notes?: string;
  }
): Promise<void> {
  const path = `businesses/${businessId}/customers/${customerId}`;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'businesses', businessId, 'customers', customerId), {
      name: clampStr(data.name, FIELD_LIMITS.customerName.max),
      phone: clampStr(data.phone, FIELD_LIMITS.phone.max),
      email: clampStr(data.email || '', FIELD_LIMITS.email.max),
      address: clampStr(data.address || '', FIELD_LIMITS.address.max),
      gstin: clampStr((data.gstin || '').toUpperCase(), FIELD_LIMITS.gstin.length),
      notes: clampStr(data.notes || '', FIELD_LIMITS.notes.max),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'businesses', businessId, 'activityLogs', generateSafeId('log')), {
      businessId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      module: 'customers',
      action: 'CUSTOMER_UPDATED',
      summary: `Updated profile for customer ${clampStr(data.name, 60)}.`,
      targetId: customerId,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function recordCustomerPayment(
  businessId: string,
  actor: ActorContext,
  input: {
    customerId: string;
    amount: number;
    method: NonCreditPaymentMethod;
    saleId?: string;
    referenceNote?: string;
  }
): Promise<void> {
  const amount = roundInr(input.amount);
  if (amount <= 0) {
    throw new Error('Payment amount must be greater than ₹0.');
  }
  const path = `businesses/${businessId}/payments`;

  try {
    await runTransaction(db, async (tx) => {
      const custRef = doc(db, 'businesses', businessId, 'customers', input.customerId);
      const custSnap = await tx.get(custRef);
      if (!custSnap.exists()) {
        throw new Error('Customer record not found.');
      }
      const customer = custSnap.data() as Customer;
      if (amount > customer.outstandingBalance + 0.01) {
        throw new Error(`Payment exceeds customer outstanding balance of ₹${customer.outstandingBalance.toFixed(2)}.`);
      }

      let linkedInvoiceNumber: string | undefined;
      if (input.saleId) {
        const saleRef = doc(db, 'businesses', businessId, 'sales', input.saleId);
        const saleSnap = await tx.get(saleRef);
        if (saleSnap.exists()) {
          const sale = saleSnap.data() as Sale;
          if (sale.status === 'completed' && sale.balanceDue > 0) {
            linkedInvoiceNumber = sale.invoiceNumber;
            const appliedToSale = Math.min(amount, sale.balanceDue);
            const newAmountPaid = roundInr(sale.amountPaid + appliedToSale);
            const newBalanceDue = roundInr(Math.max(0, sale.balanceDue - appliedToSale));
            const newPaymentStatus = newBalanceDue <= 0 ? 'paid' : 'partial';
            tx.update(saleRef, {
              amountPaid: newAmountPaid,
              balanceDue: newBalanceDue,
              paymentStatus: newPaymentStatus,
              updatedAt: serverTimestamp(),
            });
          }
        }
      }

      const newOutstanding = roundInr(Math.max(0, customer.outstandingBalance - amount));
      const newTotalPaid = roundInr(customer.totalPaid + amount);
      tx.update(custRef, {
        totalPaid: newTotalPaid,
        outstandingBalance: newOutstanding,
        updatedAt: serverTimestamp(),
      });

      const paymentId = generateSafeId('pay');
      const paymentPayload: Record<string, unknown> = {
        businessId,
        customerId: input.customerId,
        customerName: customer.name,
        amount,
        method: input.method,
        receivedByUid: actor.uid,
        receivedByName: actor.name,
        paymentDate: Timestamp.now(),
        createdAt: serverTimestamp(),
      };
      if (input.saleId && linkedInvoiceNumber) {
        paymentPayload.saleId = input.saleId;
        paymentPayload.invoiceNumber = linkedInvoiceNumber;
      }
      if (input.referenceNote?.trim()) {
        paymentPayload.referenceNote = clampStr(input.referenceNote, 200);
      }

      tx.set(doc(db, 'businesses', businessId, 'payments', paymentId), paymentPayload);

      tx.set(doc(db, 'businesses', businessId, 'activityLogs', generateSafeId('log')), {
        businessId,
        actorUid: actor.uid,
        actorName: actor.name,
        actorRole: actor.role,
        module: 'customers',
        action: 'PAYMENT_RECEIVED',
        summary: `Collected ₹${amount.toFixed(2)} via ${input.method.toUpperCase()} from ${customer.name}.`,
        targetId: paymentId,
        createdAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('exceeds') || error.message.includes('not found'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ============================================================================
// SALES & BILLING MODULE (ATOMIC INVENTORY + CUSTOMER LEDGER)
// ============================================================================

export async function createSaleInvoice(
  businessId: string,
  actor: ActorContext,
  input: {
    customerId?: string;
    customerName: string;
    customerPhone?: string;
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      discountAmount: number;
      gstRate: number;
    }>;
    gstMode: GstMode;
    paymentMethod: PaymentMethod;
    amountPaid: number;
  }
): Promise<Sale> {
  if (input.items.length === 0 || input.items.length > FIELD_LIMITS.maxSaleItems) {
    throw new Error(`An invoice must contain between 1 and ${FIELD_LIMITS.maxSaleItems} line items.`);
  }

  const saleId = generateSafeId('sale');
  const path = `businesses/${businessId}/sales/${saleId}`;

  try {
    let createdSale!: Sale;

    await runTransaction(db, async (tx) => {
      const bizRef = doc(db, 'businesses', businessId);
      const bizSnap = await tx.get(bizRef);
      if (!bizSnap.exists()) {
        throw new Error('Business workspace not found.');
      }
      const business = bizSnap.data() as Business;

      let customerSnapData: Customer | null = null;
      const customerRef = input.customerId
        ? doc(db, 'businesses', businessId, 'customers', input.customerId)
        : null;
      if (customerRef) {
        const cSnap = await tx.get(customerRef);
        if (!cSnap.exists()) {
          throw new Error('Selected customer no longer exists.');
        }
        customerSnapData = cSnap.data() as Customer;
      }

      // Read all product snapshots first (Firestore transaction requirement)
      const productSnaps = new Map<string, Product>();
      for (const line of input.items) {
        if (!productSnaps.has(line.productId)) {
          const pSnap = await tx.get(doc(db, 'businesses', businessId, 'products', line.productId));
          if (!pSnap.exists()) {
            throw new Error('One of the products in the cart was deleted.');
          }
          productSnaps.set(line.productId, { id: pSnap.id, ...(pSnap.data() as Omit<Product, 'id'>) });
        }
      }

      // Aggregate quantities per product to verify stock accurately even if product added twice
      const requestedQtyByProduct = new Map<string, number>();
      for (const line of input.items) {
        const qty = Math.floor(line.quantity);
        if (qty <= 0) {
          throw new Error('Line item quantity must be at least 1.');
        }
        requestedQtyByProduct.set(line.productId, (requestedQtyByProduct.get(line.productId) || 0) + qty);
      }

      for (const [productId, totalQty] of requestedQtyByProduct.entries()) {
        const prod = productSnaps.get(productId)!;
        if (prod.currentStock < totalQty) {
          throw new Error(`Insufficient stock for ${prod.name}. Available: ${prod.currentStock}, Requested: ${totalQty}.`);
        }
      }

      const builtItems: SaleItem[] = [];
      let subtotal = 0;
      let discountTotal = 0;
      let taxTotal = 0;
      let cogsTotal = 0;

      for (const line of input.items) {
        const prod = productSnaps.get(line.productId)!;
        const qty = Math.floor(line.quantity);
        const unitPrice = roundInr(Math.max(0, line.unitPrice));
        const grossLine = roundInr(unitPrice * qty);
        const discountAmt = roundInr(Math.min(grossLine, Math.max(0, line.discountAmount)));
        const taxable = roundInr(grossLine - discountAmt);
        const gstRate = input.gstMode === 'none' ? 0 : line.gstRate;
        const taxAmt = roundInr((taxable * gstRate) / 100);
        const lineTotal = roundInr(taxable + taxAmt);

        subtotal = roundInr(subtotal + grossLine);
        discountTotal = roundInr(discountTotal + discountAmt);
        taxTotal = roundInr(taxTotal + taxAmt);
        cogsTotal = roundInr(cogsTotal + prod.purchasePrice * qty);

        builtItems.push({
          productId: prod.id,
          productName: prod.name,
          sku: prod.sku,
          quantity: qty,
          unitPrice,
          purchasePrice: prod.purchasePrice,
          discountAmount: discountAmt,
          gstRate,
          taxAmount: taxAmt,
          lineTotal,
        });
      }

      const grandTotal = roundInr(subtotal - discountTotal + taxTotal);
      let amountPaid = roundInr(Math.max(0, Math.min(grandTotal, input.amountPaid)));
      if (input.paymentMethod === 'credit') {
        amountPaid = roundInr(Math.min(grandTotal, Math.max(0, input.amountPaid)));
      }
      const balanceDue = roundInr(Math.max(0, grandTotal - amountPaid));

      if (balanceDue > 0 && !customerRef) {
        throw new Error('Please select or add a customer when recording a credit or partial-payment invoice.');
      }

      const paymentStatus: 'paid' | 'partial' | 'unpaid' =
        balanceDue <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid';

      const invoiceNumber = `${business.invoicePrefix}-${business.nextInvoiceNumber}`;
      const saleTimestamp = Timestamp.now();

      // 1. Increment business invoice counter
      tx.update(bizRef, {
        nextInvoiceNumber: business.nextInvoiceNumber + 1,
        updatedAt: serverTimestamp(),
      });

      // 2. Decrement product stocks and append immutable stock movements
      for (const [productId, totalQty] of requestedQtyByProduct.entries()) {
        const prod = productSnaps.get(productId)!;
        const newStock = prod.currentStock - totalQty;
        tx.update(doc(db, 'businesses', businessId, 'products', productId), {
          currentStock: newStock,
          updatedAt: serverTimestamp(),
        });
        tx.set(doc(db, 'businesses', businessId, 'stockMovements', generateSafeId('mov')), {
          businessId,
          productId,
          productName: prod.name,
          sku: prod.sku,
          type: 'sale' satisfies StockMovementType,
          quantityDelta: -totalQty,
          previousStock: prod.currentStock,
          newStock,
          referenceId: invoiceNumber,
          reason: `Sold on invoice ${invoiceNumber}`,
          performedByUid: actor.uid,
          performedByName: actor.name,
          createdAt: serverTimestamp(),
        });
      }

      // 3. Update customer credit ledger if customer attached
      if (customerRef && customerSnapData) {
        tx.update(customerRef, {
          totalPurchases: roundInr(customerSnapData.totalPurchases + grandTotal),
          totalPaid: roundInr(customerSnapData.totalPaid + amountPaid),
          outstandingBalance: roundInr(customerSnapData.outstandingBalance + balanceDue),
          updatedAt: serverTimestamp(),
        });
      }

      // 4. Write Sale document
      const saleDocPayload: Record<string, unknown> = {
        businessId,
        invoiceNumber,
        customerName: clampStr(customerSnapData?.name || input.customerName || 'Walk-in Customer', FIELD_LIMITS.customerName.max),
        items: builtItems,
        subtotal,
        discountTotal,
        taxTotal,
        grandTotal,
        cogsTotal,
        gstMode: input.gstMode,
        paymentMethod: input.paymentMethod,
        amountPaid,
        balanceDue,
        paymentStatus,
        status: 'completed',
        createdByUid: actor.uid,
        createdByName: actor.name,
        saleDate: saleTimestamp,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (customerRef && customerSnapData) {
        saleDocPayload.customerId = customerRef.id;
        saleDocPayload.customerPhone = customerSnapData.phone;
      } else if (input.customerPhone?.trim()) {
        saleDocPayload.customerPhone = clampStr(input.customerPhone, FIELD_LIMITS.phone.max);
      }

      tx.set(doc(db, 'businesses', businessId, 'sales', saleId), saleDocPayload);

      // 5. Log Activity
      tx.set(doc(db, 'businesses', businessId, 'activityLogs', generateSafeId('log')), {
        businessId,
        actorUid: actor.uid,
        actorName: actor.name,
        actorRole: actor.role,
        module: 'sales',
        action: 'SALE_CREATED',
        summary: `Created invoice ${invoiceNumber} for ${saleDocPayload.customerName} (₹${grandTotal.toFixed(2)}).`,
        targetId: saleId,
        createdAt: serverTimestamp(),
      });

      createdSale = {
        id: saleId,
        ...(saleDocPayload as Omit<Sale, 'id' | 'createdAt' | 'updatedAt'>),
        createdAt: saleTimestamp,
        updatedAt: saleTimestamp,
      };
    });

    return createdSale;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Insufficient stock') ||
        error.message.includes('Please select') ||
        error.message.includes('cart') ||
        error.message.includes('Line item') ||
        error.message.includes('Selected customer'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function processSaleReturnOrCancel(
  businessId: string,
  saleId: string,
  actor: ActorContext,
  input: {
    targetStatus: 'returned' | 'cancelled';
    reason: string;
  }
): Promise<void> {
  const path = `businesses/${businessId}/sales/${saleId}`;
  try {
    await runTransaction(db, async (tx) => {
      const saleRef = doc(db, 'businesses', businessId, 'sales', saleId);
      const saleSnap = await tx.get(saleRef);
      if (!saleSnap.exists()) {
        throw new Error('Invoice not found.');
      }
      const sale = saleSnap.data() as Sale;
      if (sale.status !== 'completed') {
        throw new Error(`Invoice ${sale.invoiceNumber} is already ${sale.status}.`);
      }

      // Read all products in the invoice
      const qtyByProduct = new Map<string, number>();
      for (const item of sale.items) {
        qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) || 0) + item.quantity);
      }
      const productSnaps = new Map<string, Product>();
      for (const productId of qtyByProduct.keys()) {
        const pSnap = await tx.get(doc(db, 'businesses', businessId, 'products', productId));
        if (pSnap.exists()) {
          productSnaps.set(productId, { id: pSnap.id, ...(pSnap.data() as Omit<Product, 'id'>) });
        }
      }

      // Read customer if attached
      let customerData: Customer | null = null;
      const customerRef = sale.customerId
        ? doc(db, 'businesses', businessId, 'customers', sale.customerId)
        : null;
      if (customerRef) {
        const cSnap = await tx.get(customerRef);
        if (cSnap.exists()) {
          customerData = cSnap.data() as Customer;
        }
      }

      // 1. Mark sale returned/cancelled & clear unpaid balance due
      tx.update(saleRef, {
        status: input.targetStatus,
        returnReason: clampStr(input.reason || input.targetStatus, FIELD_LIMITS.returnReason.max),
        balanceDue: 0,
        paymentStatus: sale.paymentStatus,
        updatedAt: serverTimestamp(),
      });

      // 2. Restore stock for existing products & append stock movement
      for (const [productId, qty] of qtyByProduct.entries()) {
        const prod = productSnaps.get(productId);
        if (prod) {
          const newStock = prod.currentStock + qty;
          tx.update(doc(db, 'businesses', businessId, 'products', productId), {
            currentStock: newStock,
            updatedAt: serverTimestamp(),
          });
          tx.set(doc(db, 'businesses', businessId, 'stockMovements', generateSafeId('mov')), {
            businessId,
            productId,
            productName: prod.name,
            sku: prod.sku,
            type: 'return' satisfies StockMovementType,
            quantityDelta: qty,
            previousStock: prod.currentStock,
            newStock,
            referenceId: sale.invoiceNumber,
            reason: `${input.targetStatus === 'returned' ? 'Sales return' : 'Order cancelled'}: ${clampStr(input.reason, 120)}`,
            performedByUid: actor.uid,
            performedByName: actor.name,
            createdAt: serverTimestamp(),
          });
        }
      }

      // 3. Reverse customer totals & outstanding balance
      if (customerRef && customerData) {
        tx.update(customerRef, {
          totalPurchases: roundInr(Math.max(0, customerData.totalPurchases - sale.grandTotal)),
          totalPaid: roundInr(Math.max(0, customerData.totalPaid - sale.amountPaid)),
          outstandingBalance: roundInr(Math.max(0, customerData.outstandingBalance - sale.balanceDue)),
          updatedAt: serverTimestamp(),
        });
      }

      // 4. Activity log
      tx.set(doc(db, 'businesses', businessId, 'activityLogs', generateSafeId('log')), {
        businessId,
        actorUid: actor.uid,
        actorName: actor.name,
        actorRole: actor.role,
        module: 'sales',
        action: input.targetStatus === 'returned' ? 'SALE_RETURNED' : 'SALE_CANCELLED',
        summary: `${input.targetStatus === 'returned' ? 'Processed return' : 'Cancelled'} invoice ${sale.invoiceNumber} (${clampStr(input.reason, 80)}).`,
        targetId: saleId,
        createdAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('already') || error.message.includes('not found'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ============================================================================
// EXPENSES MODULE
// ============================================================================

export async function createExpense(
  businessId: string,
  actor: ActorContext,
  data: {
    title: string;
    category: ExpenseCategory;
    amount: number;
    paymentMethod: NonCreditPaymentMethod;
    vendorName?: string;
    notes?: string;
    expenseDate: Date;
  }
): Promise<string> {
  const expenseId = generateSafeId('exp');
  const path = `businesses/${businessId}/expenses/${expenseId}`;
  try {
    const batch = writeBatch(db);
    const payload: Record<string, unknown> = {
      businessId,
      title: clampStr(data.title, FIELD_LIMITS.expenseTitle.max),
      category: data.category,
      amount: roundInr(Math.max(0.01, data.amount)),
      paymentMethod: data.paymentMethod,
      expenseDate: Timestamp.fromDate(data.expenseDate),
      recordedByUid: actor.uid,
      recordedByName: actor.name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (data.vendorName?.trim()) payload.vendorName = clampStr(data.vendorName, FIELD_LIMITS.vendorName.max);
    if (data.notes?.trim()) payload.notes = clampStr(data.notes, 240);

    batch.set(doc(db, 'businesses', businessId, 'expenses', expenseId), payload);
    batch.set(doc(db, 'businesses', businessId, 'activityLogs', generateSafeId('log')), {
      businessId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      module: 'expenses',
      action: 'EXPENSE_RECORDED',
      summary: `Recorded expense "${payload.title}" of ₹${Number(payload.amount).toFixed(2)}.`,
      targetId: expenseId,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    return expenseId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteExpense(
  businessId: string,
  expense: Expense,
  actor: ActorContext
): Promise<void> {
  const path = `businesses/${businessId}/expenses/${expense.id}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'businesses', businessId, 'expenses', expense.id));
    batch.set(doc(db, 'businesses', businessId, 'activityLogs', generateSafeId('log')), {
      businessId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      module: 'expenses',
      action: 'EXPENSE_DELETED',
      summary: `Deleted expense "${expense.title}" (₹${expense.amount.toFixed(2)}).`,
      targetId: expense.id,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ============================================================================
// STAFF & RBAC MANAGEMENT
// ============================================================================

export async function addStaffAndInvite(
  businessId: string,
  businessName: string,
  actor: ActorContext,
  data: {
    name: string;
    email: string;
    phone?: string;
    role: Exclude<Role, 'owner'>;
    department?: string;
    monthlySalary: number;
    sendPortalInvite: boolean;
  }
): Promise<void> {
  const staffId = generateSafeId('staff');
  const path = `businesses/${businessId}/staff/${staffId}`;
  try {
    const batch = writeBatch(db);
    const cleanEmail = clampStr(data.email.toLowerCase(), FIELD_LIMITS.email.max);

    const staffPayload: Record<string, unknown> = {
      businessId,
      name: clampStr(data.name, FIELD_LIMITS.staffName.max),
      email: cleanEmail,
      role: data.role,
      monthlySalary: roundInr(Math.max(0, data.monthlySalary)),
      status: data.sendPortalInvite ? 'invited' : 'active',
      joinedDate: new Date().toISOString().slice(0, 10),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (data.phone?.trim()) staffPayload.phone = clampStr(data.phone, FIELD_LIMITS.phone.max);
    if (data.department?.trim()) staffPayload.department = clampStr(data.department, FIELD_LIMITS.department.max);

    batch.set(doc(db, 'businesses', businessId, 'staff', staffId), staffPayload);

    if (data.sendPortalInvite) {
      const inviteId = generateSafeId('inv');
      batch.set(doc(db, 'businessInvites', inviteId), {
        businessId,
        businessName: clampStr(businessName, FIELD_LIMITS.businessName.max),
        email: cleanEmail,
        role: data.role,
        staffId,
        invitedByUid: actor.uid,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    batch.set(doc(db, 'businesses', businessId, 'activityLogs', generateSafeId('log')), {
      businessId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      module: 'staff',
      action: 'STAFF_ADDED',
      summary: `Added staff profile for ${staffPayload.name} (${data.role})${data.sendPortalInvite ? ' with workspace invite' : ''}.`,
      targetId: staffId,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateStaffProfileAndRole(
  businessId: string,
  staff: StaffMember,
  actor: ActorContext,
  updates: {
    name: string;
    phone?: string;
    role: Role;
    department?: string;
    monthlySalary: number;
    status: 'active' | 'invited' | 'inactive';
  }
): Promise<void> {
  const path = `businesses/${businessId}/staff/${staff.id}`;
  try {
    const batch = writeBatch(db);
    const nextRole = staff.role === 'owner' ? 'owner' : updates.role === 'owner' ? staff.role : updates.role;
    batch.update(doc(db, 'businesses', businessId, 'staff', staff.id), {
      name: clampStr(updates.name, FIELD_LIMITS.staffName.max),
      phone: clampStr(updates.phone || '', FIELD_LIMITS.phone.max),
      role: nextRole,
      department: clampStr(updates.department || '', FIELD_LIMITS.department.max),
      monthlySalary: roundInr(Math.max(0, updates.monthlySalary)),
      status: staff.role === 'owner' ? 'active' : updates.status,
      updatedAt: serverTimestamp(),
    });

    if (staff.linkedUid && staff.role !== 'owner' && actor.role === 'owner') {
      batch.update(doc(db, 'businesses', businessId, 'members', staff.linkedUid), {
        role: nextRole,
        status: updates.status === 'inactive' ? 'suspended' : 'active',
        displayName: clampStr(updates.name, FIELD_LIMITS.staffName.max),
        updatedAt: serverTimestamp(),
      });
    }

    batch.set(doc(db, 'businesses', businessId, 'activityLogs', generateSafeId('log')), {
      businessId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      module: 'staff',
      action: 'STAFF_UPDATED',
      summary: `Updated role/status for ${clampStr(updates.name, 60)} (${nextRole}, ${updates.status}).`,
      targetId: staff.id,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function removeStaffMember(
  businessId: string,
  staff: StaffMember,
  actor: ActorContext
): Promise<void> {
  if (staff.role === 'owner') {
    throw new Error('The primary business owner cannot be deleted.');
  }
  const path = `businesses/${businessId}/staff/${staff.id}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'businesses', businessId, 'staff', staff.id));
    if (staff.linkedUid) {
      batch.delete(doc(db, 'businesses', businessId, 'members', staff.linkedUid));
    }
    batch.set(doc(db, 'businesses', businessId, 'activityLogs', generateSafeId('log')), {
      businessId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      module: 'staff',
      action: 'STAFF_REMOVED',
      summary: `Removed ${staff.name} (${staff.role}) from staff directory.`,
      targetId: staff.id,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ============================================================================
// REAL-TIME SUBSCRIPTIONS
// ============================================================================

export function subscribeUserMemberships(
  uid: string,
  onData: (items: UserMembership[]) => void
): Unsubscribe {
  const path = `users/${uid}/memberships`;
  const q = query(collection(db, 'users', uid, 'memberships'), orderBy('joinedAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      if (snap.metadata.hasPendingWrites) return;
      onData(snap.docs.map((d) => d.data() as UserMembership));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export function subscribePendingInvites(
  email: string,
  onData: (items: BusinessInvite[]) => void
): Unsubscribe {
  const path = 'businessInvites';
  const q = query(collection(db, 'businessInvites'), where('email', '==', email));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<BusinessInvite, 'id'>) }))
        .filter((inv) => inv.status === 'pending');
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export function subscribeCollection<T>(
  path: string,
  onData: (items: T[]) => void,
  orderByField?: string,
  direction: 'asc' | 'desc' = 'desc'
): Unsubscribe {
  const colRef = collection(db, path);
  const q = orderByField ? query(colRef, orderBy(orderByField, direction)) : colRef;
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as T));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function fetchCustomerPayments(businessId: string, customerId: string): Promise<Payment[]> {
  const path = `businesses/${businessId}/payments`;
  try {
    const q = query(
      collection(db, 'businesses', businessId, 'payments'),
      where('customerId', '==', customerId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Payment, 'id'>) }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function deleteBusinessWorkspace(businessId: string, uid: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', uid, 'memberships', businessId));
    batch.delete(doc(db, 'businesses', businessId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `businesses/${businessId}`);
  }
}
