// LedgerLine Seed Script
// Seeds demo accounts for Admin, Account Holder, and Auditor roles,
// along with the SYSTEM_CLEARING account and balanced initial ledger entries.

const { PrismaClient, Role, AccountType, TransactionType, EntryType, AuditStatus } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Demo credentials (for evaluation & testing only)
const DEMO_CREDENTIALS = {
  admin: {
    email: process.env.DEMO_ADMIN_EMAIL || 'admin@ledgerline.internal',
    password: process.env.DEMO_ADMIN_PASSWORD || 'AdminPassword123!',
    fullName: 'System Administrator',
    role: Role.ADMIN,
  },
  auditor: {
    email: process.env.DEMO_AUDITOR_EMAIL || 'auditor@ledgerline.internal',
    password: process.env.DEMO_AUDITOR_PASSWORD || 'AuditorPassword123!',
    fullName: 'Compliance Auditor',
    role: Role.AUDITOR,
  },
  alice: {
    email: process.env.DEMO_ALICE_EMAIL || 'alice@ledgerline.internal',
    password: process.env.DEMO_ALICE_PASSWORD || 'AlicePassword123!',
    fullName: 'Alice AccountHolder',
    role: Role.ACCOUNT_HOLDER,
    accountNumber: 'ACC-ALICE-001',
    initialDeposit: '1000.00',
  },
  bob: {
    email: process.env.DEMO_BOB_EMAIL || 'bob@ledgerline.internal',
    password: process.env.DEMO_BOB_PASSWORD || 'BobPassword123!',
    fullName: 'Bob AccountHolder',
    role: Role.ACCOUNT_HOLDER,
    accountNumber: 'ACC-BOB-001',
    initialDeposit: '500.00',
  },
};

async function main() {
  console.log('--- Starting LedgerLine Database Seed ---');

  // 1. Clean existing records in referential order to ensure clean idempotency
  console.log('Cleaning existing records...');
  await prisma.auditLog.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.transactionRecord.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();

  // 2. Hash passwords using bcrypt (10 rounds)
  const saltRounds = 10;
  const adminHash = await bcrypt.hash(DEMO_CREDENTIALS.admin.password, saltRounds);
  const auditorHash = await bcrypt.hash(DEMO_CREDENTIALS.auditor.password, saltRounds);
  const aliceHash = await bcrypt.hash(DEMO_CREDENTIALS.alice.password, saltRounds);
  const bobHash = await bcrypt.hash(DEMO_CREDENTIALS.bob.password, saltRounds);

  // 3. Create Users
  console.log('Creating demo users...');
  const adminUser = await prisma.user.create({
    data: {
      email: DEMO_CREDENTIALS.admin.email,
      passwordHash: adminHash,
      fullName: DEMO_CREDENTIALS.admin.fullName,
      role: DEMO_CREDENTIALS.admin.role,
    },
  });

  const auditorUser = await prisma.user.create({
    data: {
      email: DEMO_CREDENTIALS.auditor.email,
      passwordHash: auditorHash,
      fullName: DEMO_CREDENTIALS.auditor.fullName,
      role: DEMO_CREDENTIALS.auditor.role,
    },
  });

  const aliceUser = await prisma.user.create({
    data: {
      email: DEMO_CREDENTIALS.alice.email,
      passwordHash: aliceHash,
      fullName: DEMO_CREDENTIALS.alice.fullName,
      role: DEMO_CREDENTIALS.alice.role,
    },
  });

  const bobUser = await prisma.user.create({
    data: {
      email: DEMO_CREDENTIALS.bob.email,
      passwordHash: bobHash,
      fullName: DEMO_CREDENTIALS.bob.fullName,
      role: DEMO_CREDENTIALS.bob.role,
    },
  });

  // 4. Create SYSTEM_CLEARING Account
  console.log('Creating SYSTEM_CLEARING account...');
  const clearingAccount = await prisma.account.create({
    data: {
      accountNumber: 'SYS-CLEARING-001',
      userId: null, // Clearing account has no human owner
      type: AccountType.SYSTEM_CLEARING,
      balance: '0.00',
      currency: 'INR',
    },
  });

  // 5. Create Customer Accounts with Initial Zero Balance
  console.log('Creating customer accounts...');
  const aliceAccount = await prisma.account.create({
    data: {
      accountNumber: DEMO_CREDENTIALS.alice.accountNumber,
      userId: aliceUser.id,
      type: AccountType.STANDARD,
      balance: '0.00', // Will be credited via balanced initial deposit
      currency: 'INR',
    },
  });

  const bobAccount = await prisma.account.create({
    data: {
      accountNumber: DEMO_CREDENTIALS.bob.accountNumber,
      userId: bobUser.id,
      type: AccountType.STANDARD,
      balance: '0.00',
      currency: 'INR',
    },
  });

  // 6. Fund Alice's Account via Balanced Double-Entry Deposit
  console.log('Funding Alice with balanced initial deposit (1000.00 INR)...');
  const aliceTx = await prisma.transactionRecord.create({
    data: {
      reference: 'TXN-SEED-ALICE-INIT-001',
      type: TransactionType.DEPOSIT,
      amount: DEMO_CREDENTIALS.alice.initialDeposit,
      description: 'Initial seed deposit',
      initiatedById: adminUser.id,
      ledgerEntries: {
        create: [
          {
            accountId: clearingAccount.id,
            entryType: EntryType.DEBIT,
            amount: DEMO_CREDENTIALS.alice.initialDeposit,
            balanceAfter: '-1000.00', // Clearing account tracks external liability/reserve
          },
          {
            accountId: aliceAccount.id,
            entryType: EntryType.CREDIT,
            amount: DEMO_CREDENTIALS.alice.initialDeposit,
            balanceAfter: '1000.00',
          },
        ],
      },
    },
  });

  await prisma.account.update({
    where: { id: aliceAccount.id },
    data: { balance: '1000.00' },
  });

  await prisma.account.update({
    where: { id: clearingAccount.id },
    data: { balance: '-1000.00' },
  });

  // 7. Fund Bob's Account via Balanced Double-Entry Deposit
  console.log('Funding Bob with balanced initial deposit (500.00 INR)...');
  const bobTx = await prisma.transactionRecord.create({
    data: {
      reference: 'TXN-SEED-BOB-INIT-001',
      type: TransactionType.DEPOSIT,
      amount: DEMO_CREDENTIALS.bob.initialDeposit,
      description: 'Initial seed deposit',
      initiatedById: adminUser.id,
      ledgerEntries: {
        create: [
          {
            accountId: clearingAccount.id,
            entryType: EntryType.DEBIT,
            amount: DEMO_CREDENTIALS.bob.initialDeposit,
            balanceAfter: '-1500.00',
          },
          {
            accountId: bobAccount.id,
            entryType: EntryType.CREDIT,
            amount: DEMO_CREDENTIALS.bob.initialDeposit,
            balanceAfter: '500.00',
          },
        ],
      },
    },
  });

  await prisma.account.update({
    where: { id: bobAccount.id },
    data: { balance: '500.00' },
  });

  await prisma.account.update({
    where: { id: clearingAccount.id },
    data: { balance: '-1500.00' },
  });

  // 8. Log initial audit records for initialization
  await prisma.auditLog.createMany({
    data: [
      {
        userId: adminUser.id,
        action: 'SYSTEM_SEEDED',
        status: AuditStatus.SUCCESS,
        reason: 'Initial demo accounts and double-entry ledger created',
      },
      {
        userId: adminUser.id,
        accountId: aliceAccount.id,
        transactionId: aliceTx.id,
        action: 'INITIAL_SEED_DEPOSIT',
        status: AuditStatus.SUCCESS,
        runningBalance: '1000.00',
      },
      {
        userId: adminUser.id,
        accountId: bobAccount.id,
        transactionId: bobTx.id,
        action: 'INITIAL_SEED_DEPOSIT',
        status: AuditStatus.SUCCESS,
        runningBalance: '500.00',
      },
    ],
  });

  console.log('\n--- Seed Completed Successfully! ---');
  console.log('Seeded Users:');
  console.log(`- Admin:   ${DEMO_CREDENTIALS.admin.email} (Role: ADMIN)`);
  console.log(`- Auditor: ${DEMO_CREDENTIALS.auditor.email} (Role: AUDITOR)`);
  console.log(`- Alice:   ${DEMO_CREDENTIALS.alice.email} (Account: ${DEMO_CREDENTIALS.alice.accountNumber}, Balance: 1000.00 INR)`);
  console.log(`- Bob:     ${DEMO_CREDENTIALS.bob.email} (Account: ${DEMO_CREDENTIALS.bob.accountNumber}, Balance: 500.00 INR)`);
  console.log(`- Clearing Account: SYS-CLEARING-001 (Type: SYSTEM_CLEARING, Balance: -1500.00 INR)`);
  console.log(`- Net System Check: Customer Balances (1500.00) + Clearing (-1500.00) = 0.00 (Balanced!)\n`);
}

main()
  .catch((e) => {
    console.error('Seed Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
