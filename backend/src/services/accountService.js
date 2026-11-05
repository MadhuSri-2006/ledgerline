// Account Service
// Business logic for customer account management and mathematical balance reconciliation

const { Prisma } = require('@prisma/client');
const prisma = require('../config/db');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Creates a new customer account. Restricted to Admin.
 * Initial balance is strictly 0.00 (balances change only via double-entry ledger in Stage 6).
 */
async function createCustomerAccount({ userId, accountNumber, currency = 'INR', adminUserId }) {
  if (!userId) {
    throw { statusCode: 400, message: 'Validation failed: userId is required.' };
  }

  if (!UUID_REGEX.test(userId)) {
    throw { statusCode: 400, message: 'Validation failed: Invalid userId format. Expected a valid UUID.' };
  }

  // 1. Verify target user exists and is an ACCOUNT_HOLDER
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!targetUser) {
    throw { statusCode: 404, message: 'User not found. Cannot create account for non-existent user.' };
  }

  if (targetUser.role !== 'ACCOUNT_HOLDER') {
    throw {
      statusCode: 400,
      message: `Invalid user role '${targetUser.role}'. Customer accounts can only be assigned to ACCOUNT_HOLDER users.`,
    };
  }

  // 2. Generate or validate account number
  let finalAccountNumber = accountNumber ? accountNumber.trim().toUpperCase() : null;
  if (!finalAccountNumber) {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    finalAccountNumber = `ACC-${Date.now().toString().slice(-6)}-${randomSuffix}`;
  }

  // Check uniqueness
  const existingAcc = await prisma.account.findUnique({
    where: { accountNumber: finalAccountNumber },
  });

  if (existingAcc) {
    throw { statusCode: 409, message: `Account with number '${finalAccountNumber}' already exists.` };
  }

  // 3. Create account with exact 0.00 Decimal balance
  const account = await prisma.account.create({
    data: {
      accountNumber: finalAccountNumber,
      userId: targetUser.id,
      type: 'STANDARD', // Strictly STANDARD; SYSTEM_CLEARING can never be created through this route
      balance: new Prisma.Decimal('0.00'),
      currency: currency.toUpperCase(),
      status: 'ACTIVE',
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
        },
      },
    },
  });

  // 4. Log audit entry for account creation
  await prisma.auditLog.create({
    data: {
      userId: adminUserId,
      accountId: account.id,
      action: 'ADMIN_ACCOUNT_CREATED',
      status: 'SUCCESS',
      reason: `Admin created account ${account.accountNumber} for user ${targetUser.email}`,
      runningBalance: account.balance,
    },
  });

  return account;
}

/**
 * Returns accounts according to user role:
 * - ADMIN & AUDITOR: View all accounts.
 * - ACCOUNT_HOLDER: View strictly their own accounts.
 */
async function getAccountsForUser(user) {
  if (user.role === 'ADMIN' || user.role === 'AUDITOR') {
    return prisma.account.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
      },
    });
  }

  // ACCOUNT_HOLDER can only query accounts they own
  return prisma.account.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Reconciles the cached Account.balance against the sum of all historical LedgerEntry rows.
 * Uses exact Decimal math to prevent floating-point inaccuracies:
 *   Reconciled Balance = SUM(CREDITS) - SUM(DEBITS)
 */
async function reconcileAccountBalance(accountId) {
  if (!UUID_REGEX.test(accountId)) {
    throw { statusCode: 400, message: 'Invalid account ID format. Expected a valid UUID.' };
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    throw { statusCode: 404, message: 'Account not found.' };
  }

  // Sum all Credits
  const creditsAgg = await prisma.ledgerEntry.aggregate({
    where: { accountId: account.id, entryType: 'CREDIT' },
    _sum: { amount: true },
  });

  // Sum all Debits
  const debitsAgg = await prisma.ledgerEntry.aggregate({
    where: { accountId: account.id, entryType: 'DEBIT' },
    _sum: { amount: true },
  });

  const totalCredits = creditsAgg._sum.amount || new Prisma.Decimal('0.00');
  const totalDebits = debitsAgg._sum.amount || new Prisma.Decimal('0.00');

  // Reconciled balance: Credits increase balance, Debits decrease balance
  const reconciledBalance = totalCredits.minus(totalDebits);
  const isBalanced = account.balance.equals(reconciledBalance);
  const discrepancy = account.balance.minus(reconciledBalance);

  return {
    accountId: account.id,
    accountNumber: account.accountNumber,
    accountType: account.type,
    currency: account.currency,
    storedBalance: account.balance.toFixed(2),
    reconciledBalance: reconciledBalance.toFixed(2),
    totalCredits: totalCredits.toFixed(2),
    totalDebits: totalDebits.toFixed(2),
    discrepancy: discrepancy.toFixed(2),
    isBalanced,
  };
}

module.exports = {
  createCustomerAccount,
  getAccountsForUser,
  reconcileAccountBalance,
};
