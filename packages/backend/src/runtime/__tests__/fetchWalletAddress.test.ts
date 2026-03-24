/**
 * Unit tests for wallet address parsing in fetchWalletAddress.
 *
 * fetchWalletAddress calls Docker exec which is not available in unit tests.
 * We verify the address-extraction regex logic directly.
 */
import { describe, it, expect } from 'vitest';

// Extracted regex logic from container.ts — inline test of the parsing algorithm
function parseWalletAddress(text: string): string | null {
  const match = text.match(/0x[0-9a-fA-F]{40}/);
  return match ? match[0] : null;
}

describe('wallet address parsing (container.fetchWalletAddress)', () => {
  it('extracts a valid EVM address from onchainos output', () => {
    const output = `
Addresses for chain 196:
  EVM: 0xAbCd1234567890AbCd1234567890abcd12345678
`;
    expect(parseWalletAddress(output)).toBe('0xAbCd1234567890AbCd1234567890abcd12345678');
  });

  it('extracts address from single-line output', () => {
    expect(parseWalletAddress('0x0000000000000000000000000000000000000001')).toBe(
      '0x0000000000000000000000000000000000000001',
    );
  });

  it('returns null when no address in output', () => {
    expect(parseWalletAddress('Error: wallet not initialised yet')).toBeNull();
    expect(parseWalletAddress('')).toBeNull();
  });

  it('returns first address when multiple present', () => {
    const output = '0xaaaa000000000000000000000000000000000001 0xbbbb000000000000000000000000000000000002';
    expect(parseWalletAddress(output)).toBe('0xaaaa000000000000000000000000000000000001');
  });
});
