// Unit Tests — Non-database Offline Business Logic & Validation
// Tests pure functions without touching any database or network.

const { _helpers } = require('../../src/services/ledgerService');
const { parseAndValidateAmount, validateUUID, generateReference, hashPayload } = _helpers;
const { Prisma } = require('@prisma/client');

describe('Unit Tests: Financial Validation & Core Utilities (No DB)', () => {
  describe('parseAndValidateAmount', () => {
    it('should parse valid positive decimal amounts', () => {
      const d1 = parseAndValidateAmount('100.00');
      expect(d1).toBeInstanceOf(Prisma.Decimal);
      expect(d1.toFixed(2)).toBe('100.00');

      const d2 = parseAndValidateAmount('0.01');
      expect(d2.toFixed(2)).toBe('0.01');

      const d3 = parseAndValidateAmount('999999999999.99');
      expect(d3.toFixed(2)).toBe('999999999999.99');
    });

    it('should reject missing, empty, or null amount with 400', () => {
      expect(() => parseAndValidateAmount('')).toThrow(
        expect.objectContaining({ statusCode: 400, message: expect.stringMatching(/required/i) })
      );
      expect(() => parseAndValidateAmount(null)).toThrow(
        expect.objectContaining({ statusCode: 400, message: expect.stringMatching(/required/i) })
      );
      expect(() => parseAndValidateAmount(undefined)).toThrow(
        expect.objectContaining({ statusCode: 400, message: expect.stringMatching(/required/i) })
      );
    });

    it('should reject non-numeric amount with 400', () => {
      expect(() => parseAndValidateAmount('abc')).toThrow(
        expect.objectContaining({ statusCode: 400, message: expect.stringMatching(/valid number/i) })
      );
      expect(() => parseAndValidateAmount('12.34.56')).toThrow(
        expect.objectContaining({ statusCode: 400, message: expect.stringMatching(/valid number/i) })
      );
    });

    it('should reject zero and negative amounts with 400', () => {
      expect(() => parseAndValidateAmount('0')).toThrow(
        expect.objectContaining({ statusCode: 400, message: expect.stringMatching(/greater than zero/i) })
      );
      expect(() => parseAndValidateAmount('0.00')).toThrow(
        expect.objectContaining({ statusCode: 400, message: expect.stringMatching(/greater than zero/i) })
      );
      expect(() => parseAndValidateAmount('-50.00')).toThrow(
        expect.objectContaining({ statusCode: 400, message: expect.stringMatching(/greater than zero/i) })
      );
    });

    it('should reject amounts with more than 2 decimal places with 400', () => {
      expect(() => parseAndValidateAmount('10.999')).toThrow(
        expect.objectContaining({ statusCode: 400, message: expect.stringMatching(/at most 2 decimal places/i) })
      );
      expect(() => parseAndValidateAmount('10.0000000001')).toThrow(
        expect.objectContaining({ statusCode: 400, message: expect.stringMatching(/at most 2 decimal places/i) })
      );
    });

    it('should reject amounts exceeding DECIMAL(14,2) maximum capacity with 400', () => {
      expect(() => parseAndValidateAmount('1000000000000.00')).toThrow(
        expect.objectContaining({ statusCode: 400, message: expect.stringMatching(/exceeds maximum allowed limit/i) })
      );
    });
  });

  describe('validateUUID', () => {
    it('should accept properly formatted UUID v4 strings', () => {
      expect(() => validateUUID('c3d2f935-30b6-4fee-9869-be36156d98aa', 'accountId')).not.toThrow();
      expect(() => validateUUID('00000000-0000-0000-0000-000000000000', 'accountId')).not.toThrow();
    });

    it('should reject missing or malformed UUID strings with 400', () => {
      expect(() => validateUUID('', 'accountId')).toThrow(
        expect.objectContaining({ statusCode: 400, message: expect.stringMatching(/required/i) })
      );
      expect(() => validateUUID('not-a-uuid', 'accountId')).toThrow(
        expect.objectContaining({ statusCode: 400, message: expect.stringMatching(/valid UUID/i) })
      );
      expect(() => validateUUID('12345', 'accountId')).toThrow(
        expect.objectContaining({ statusCode: 400, message: expect.stringMatching(/valid UUID/i) })
      );
    });
  });

  describe('generateReference', () => {
    it('should generate properly formatted unique transaction references', () => {
      const ref1 = generateReference();
      const ref2 = generateReference();

      expect(ref1).toMatch(/^TXN-\d{8}-[0-9A-F]{6}$/);
      expect(ref2).toMatch(/^TXN-\d{8}-[0-9A-F]{6}$/);
      expect(ref1).not.toBe(ref2);
    });
  });

  describe('hashPayload', () => {
    it('should generate a 64-character SHA-256 hash of payload', () => {
      const payload1 = { accountId: '123', amount: '50.00' };
      const payload2 = { accountId: '123', amount: '50.00' };
      const payload3 = { accountId: '123', amount: '100.00' };

      const hash1 = hashPayload(payload1);
      const hash2 = hashPayload(payload2);
      const hash3 = hashPayload(payload3);

      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });
  });
});
