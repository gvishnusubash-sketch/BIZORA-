# BIZORA Security Specification (Phase 0 TDD)

## 1. Core Data Invariants
1. **Tenant Isolation**: Every business record lives under `/businesses/{businessId}/...` and requires active membership in `/businesses/{businessId}/members/{request.auth.uid}` with `status == 'active'`. Cross-business reads and writes are impossible.
2. **Identity & Verification Integrity**: All writes require `request.auth != null && request.auth.token.email_verified == true`. Author/actor fields (`uid`, `ownerId`, `createdByUid`, `performedByUid`, `receivedByUid`, `recordedByUid`, `actorUid`) must strictly match `request.auth.uid`.
3. **Role-Based Access Control (RBAC)**:
   - `owner`: Full read/write across business settings, staff HR, invites, members, inventory, sales, customers, expenses, and logs.
   - `manager`: Full operational read/write across inventory, sales, customers, expenses, staff HR, and invites; cannot delete the business or modify owner membership.
   - `cashier`: Can create/read sales, customers, payments, and read products; cannot edit product purchase prices, delete products, view staff HR salaries, or modify business settings.
   - `inventory`: Can manage products and stock movements; cannot view customer PII/credit ledgers, staff HR salaries, or financial expense ledgers.
4. **Terminal State Locking**: Sales invoices with `status` of `'returned'` or `'cancelled'` cannot be reverted to `'completed'` or modified further. Stock movements and activity logs are append-only (immutable after creation).
5. **Temporal Integrity**: `createdAt` and `updatedAt` timestamps must equal `request.time`; `createdAt` is immutable on updates.

## 2. Dirty Dozen Adversarial Payloads
1. **Unverified Email Spoof**: Authenticated user with `email_verified: false` attempts to create a business or read `/businesses/{id}/customers`. -> `PERMISSION_DENIED`
2. **Self-Assigned Owner Escalation**: Cashier attempts to write `/businesses/{id}/members/{uid}` with `role: 'owner'`. -> `PERMISSION_DENIED`
3. **Cross-Tenant Scraping**: User in Business A queries `/businesses/{businessB}/sales` or `/businesses/{businessB}/customers`. -> `PERMISSION_DENIED`
4. **Shadow / Ghost Field Injection**: User includes `isAdmin: true` or `shadowFee: 999` in a Product or Sale payload. -> `PERMISSION_DENIED`
5. **ID Poisoning / 1MB Path Attack**: Attacker creates `/businesses/{id}/products/` with a 200-char or special-character document ID. -> `PERMISSION_DENIED`
6. **Negative Stock / Price Tampering**: Payload attempts `currentStock: -5` or `sellingPrice: -100` on Product creation. -> `PERMISSION_DENIED`
7. **Post-Return Sale Tampering**: User tries to update a `'returned'` Sale back to `'completed'` or alter `grandTotal`. -> `PERMISSION_DENIED`
8. **Ledger History Erasure**: Manager or Cashier attempts to `update` or `delete` an immutable `stockMovements` or `activityLogs` document. -> `PERMISSION_DENIED`
9. **Staff HR PII Leak**: Cashier or Inventory Clerk attempts `get` or `list` on `/businesses/{id}/staff`. -> `PERMISSION_DENIED`
10. **Fake Timestamp Backdating**: User submits `createdAt` set to a past date instead of `request.time`. -> `PERMISSION_DENIED`
11. **Impersonated Cashier Billing**: Cashier A creates a Sale with `createdByUid: 'cashier_B_uid'`. -> `PERMISSION_DENIED`
12. **Unbounded Line-Item Array DoS**: Attacker submits a Sale with 55 items (`items.size() > 50`). -> `PERMISSION_DENIED`
