// Database Connection Smoke Test
// Non-destructive check to verify connectivity to Neon PostgreSQL

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testConnection() {
  try {
    await prisma.$connect();
    const result = await prisma.$queryRaw`SELECT 1 as connected, version();`;
    console.log('SUCCESS: Connected to PostgreSQL database!');
    console.log('Server Version Info:', result[0]?.version || 'PostgreSQL');
  } catch (error) {
    // Redact credentials from error output before printing
    const sanitizedError = (error.message || '').replace(/:([^:@]+)@/, ':***@');
    console.error('CONNECTION_FAILED:', sanitizedError);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
