// Prisma Client Singleton
const { PrismaClient } = require('@prisma/client');

// Use TEST_DATABASE_URL in test environment strictly when it is genuinely separate from DATABASE_URL
const hasSeparateTestDb = Boolean(
  process.env.NODE_ENV === 'test' &&
  process.env.TEST_DATABASE_URL &&
  process.env.TEST_DATABASE_URL.trim() !== '' &&
  process.env.TEST_DATABASE_URL.trim() !== (process.env.DATABASE_URL || '').trim()
);

const dbUrl = (process.env.NODE_ENV === 'test' && hasSeparateTestDb)
  ? process.env.TEST_DATABASE_URL
  : process.env.DATABASE_URL;

const prisma = new PrismaClient({
  datasources: dbUrl ? { db: { url: dbUrl } } : undefined,
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

module.exports = prisma;
module.exports.hasSeparateTestDb = hasSeparateTestDb;
