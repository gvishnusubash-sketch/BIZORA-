// Adversarial verification cases for BIZORA Firestore security rules.
// Designed for @firebase/rules-unit-testing against the Dirty Dozen payloads in security_spec.md.

export interface DirtyDozenCase {
  id: string;
  description: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED';
  payload?: Record<string, unknown>;
}

export const DIRTY_DOZEN_TEST_CASES: DirtyDozenCase[] = [
  {
    id: 'DD-01',
    description: 'Unverified email user cannot create a business',
    collectionPath: 'businesses/biz_test_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { name: 'Spoof Shop', ownerId: 'user_unverified' },
  },
  {
    id: 'DD-02',
    description: 'Cashier cannot escalate own role to owner in members subcollection',
    collectionPath: 'businesses/biz_1/members/cashier_1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { role: 'owner' },
  },
  {
    id: 'DD-03',
    description: 'User in Business A cannot list sales in Business B',
    collectionPath: 'businesses/biz_b/sales',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-04',
    description: 'Shadow field injection on product create is rejected by hasOnly',
    collectionPath: 'businesses/biz_1/products/prod_shadow',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { name: 'Cable', shadowAdminBypass: true },
  },
  {
    id: 'DD-05',
    description: 'Invalid document ID with spaces or >128 chars is rejected',
    collectionPath: 'businesses/biz_1/products/bad id with spaces!!',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-06',
    description: 'Negative stock or negative price is rejected by isValidProduct',
    collectionPath: 'businesses/biz_1/products/prod_neg',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { currentStock: -10, sellingPrice: -50 },
  },
  {
    id: 'DD-07',
    description: 'Returned sale cannot be updated back to completed (terminal state lock)',
    collectionPath: 'businesses/biz_1/sales/sale_returned',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { status: 'completed' },
  },
  {
    id: 'DD-08',
    description: 'Immutable stockMovements record cannot be updated or deleted',
    collectionPath: 'businesses/biz_1/stockMovements/mov_1',
    operation: 'delete',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-09',
    description: 'Cashier cannot read staff HR/salary records',
    collectionPath: 'businesses/biz_1/staff/staff_1',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-10',
    description: 'Backdated createdAt timestamp != request.time is rejected',
    collectionPath: 'businesses/biz_1/expenses/exp_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { createdAt: '2020-01-01T00:00:00Z' },
  },
  {
    id: 'DD-11',
    description: 'Cashier cannot spoof createdByUid of another employee on a sale',
    collectionPath: 'businesses/biz_1/sales/sale_spoof',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { createdByUid: 'other_cashier_uid' },
  },
  {
    id: 'DD-12',
    description: 'Sale with more than 50 line items is rejected',
    collectionPath: 'businesses/biz_1/sales/sale_huge',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { itemsCount: 55 },
  },
];
