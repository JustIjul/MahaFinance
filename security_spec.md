# Security Specification for MahaFinance

## Data Invariants
- A transaction must belong to the authenticated user.
- Transaction amount must be a positive number.
- Transaction date must be a valid ISO string.
- User configuration labels (categories/storage) must be strings.
- Users can only read/write their own data in `users/{userId}`.

## The "Dirty Dozen" Payloads
1. Create transaction for another user's ID.
2. Read all transactions of another user.
3. Update another user's config.
4. Create transaction with negative amount.
5. Create transaction with missing required fields.
6. Inject super large string (1MB+) into `notes`.
7. Update `id` field of a transaction (immutability).
8. Change `type` of a transaction after creation.
9. Delete another user's transaction.
10. Create transaction with invalid `type` (e.g., 'hack').
11. List all users' transactions.
12. Modify user config with non-string array items.

## The Test Runner
A `firestore.rules.test.ts` would verify that all the above unauthorized operations return `PERMISSION_DENIED`.
