// LedgerLine Seed Verification Script
// Verifies all seeded accounts, roles, credentials, and double-entry mathematical invariants.

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function verify() {
  console.log('=== Starting Seed Verification ===\n');

  let passed = true;

  // 1. Verify Users
  const users = await prisma.user.findMany({ orderBy: { email: 'asc' } });
  console.log(`[1] Users Found: ${users.length} (Expected: 4)`);
  if (users.length !== 4) passed = false;

  const expectedUsers = [
    { email: 'admin@ledgerline.internal', role: 'ADMIN', password: 'AdminPassword123!' },
    { email: 'alice@ledgerline.internal', role: 'ACCOUNT_HOLDER', password: 'AlicePassword123!' },
    { email: 'auditor@ledgerline.internal', role: 'AUDITOR', password: 'AuditorPassword123!' },
    { email: 'bob@ledgerline.internal', role: 'ACCOUNT_HOLDER', password: 'BobPassword123!' },
  ];

  for (const exp of expectedUsers) {
    const user = users.find((u) => u.email === exp.email);
    if (!user) {
      console.error(`❌ Missing user: ${exp.email}`);
      passed = false;
      continue;
    }
    const match = await bcrypt.compare(exp.password, user.passwordHash);
    if (!match) {
      console.error(`❌ Password hash does not match for ${exp.email}`);
      passed = false;
    } else if (user.role !== exp.role) {
      console.error(`❌ Role mismatch for ${exp.email}: got ${user.role}, expected ${exp.role}`);
      passed = false;
    } else {
      console.log(`  ✓ User verified: ${user.email} [Role: ${user.role}, Password check: OK]`);
    }
  }

  // 2. Verify Accounts
  console.log('\n[2] Verifying Accounts...');
  const accounts = await prisma.account.findMany({ include: { user: true } });
  console.log(`Accounts Found: ${accounts.length} (Expected: 3: Alice, Bob, Clearing)`);
  if (accounts.length !== 3) passed = false;

  const clearing = accounts.find((a) => a.type === 'SYSTEM_CLEARING');
  if (!clearing || clearing.userId !== null) {
    console.error('❌ SYSTEM_CLEARING account missing or improperly assigned to a user!');
    passed = false;
  } else {
    console.log(`  ✓ SYSTEM_CLEARING verified: ${clearing.accountNumber} [Balance: ${clearing.balance.toString()} INR, Owner: None]`);
  }

  // 3. Mathematical Double-Entry Conservation Check
  console.log('\n[3] Mathematical Conservation & Reconciliation Check:');
  for (const acc of accounts) {
    const credits = await prisma.ledgerEntry.aggregate({
      where: { accountId: acc.id, entryType: 'CREDIT' },
      _sum: { amount: true },
    });
    const debits = await prisma.ledgerEntry.aggregate({
      where: { accountId: acc.id, entryType: 'DEBIT' },
      _sum: { amount: true },
    });

    const creditSum = credits._sum.amount ? parseFloat(credits._sum.amount) : 0;
    const debitSum = debits._sum.amount ? parseFloat(debits._sum.amount) : 0;

    // For standard accounts: balance = credits - debits
    // For clearing accounts: balance = credits - debits (liability style)
    const reconciled = creditSum - debitSum;
    const currentBalance = parseFloat(acc.balance);

    if (Math.abs(currentBalance - reconciled) > 0.001) {
      console.error(`❌ Reconciliation failed for ${acc.accountNumber}: Account.balance = ${currentBalance}, Reconciled = ${reconciled}`);
      passed = false;
    } else {
      console.log(`  ✓ Account ${acc.accountNumber}: Stored Balance = ${currentBalance.toFixed(2)}, Reconciled from Ledger = ${reconciled.toFixed(2)} [MATCH]`);
    }
  }

  // System-wide net sum check (Total Debits across system === Total Credits across system)
  const allCredits = await prisma.ledgerEntry.aggregate({
    where: { entryType: 'CREDIT' },
    _sum: { amount: true },
  });
  const allDebits = await prisma.ledgerEntry.aggregate({
    where: { entryType: 'DEBIT' },
    _sum: { amount: true },
  });

  const totalCredits = parseFloat(allCredits._sum.amount || 0);
  const totalDebits = parseFloat(allDebits._sum.amount || 0);
  console.log(`\n  Total System Debits:  ${totalDebits.toFixed(2)} INR`);
  console.log(`  Total System Credits: ${totalCredits.toFixed(2)} INR`);
  if (Math.abs(totalDebits - totalCredits) > 0.001) {
    console.error('❌ SYSTEM-WIDE MONEY CONSERVATION VIOLATED! Total debits != total credits');
    passed = false;
  } else {
    console.log('  ✓ System Net Balance: Total Debits == Total Credits (Double-entry satisfied!)');
  }

  // 4. Verify Audit Logs
  const auditLogs = await prisma.auditLog.findMany();
  console.log(`\n[4] Audit Logs Found: ${auditLogs.length} (Expected: >= 3)`);
  if (auditLogs.length < 3) passed = false;

  console.log('\n=== Verification Summary ===');
  if (passed) {
    console.log('🎉 ALL SEED VERIFICATION CHECKS PASSED SUCCESSFULLY!');
  } else {
    console.error('❌ SOME VERIFICATION CHECKS FAILED. Review errors above.');
    process.exit(1);
  }
}

verify()
  .catch((e) => {
    console.error('Verification Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
