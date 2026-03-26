/**
 * Unit tests for wallet address parsing in fetchWalletAddress.
 *
 * fetchWalletAddress calls Docker exec which is not available in unit tests.
 * We verify the JSON address-extraction logic directly.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Mirrors the Zod-based parsing logic in container.ts fetchWalletAddress
const WalletAddSchema = z.object({
  ok: z.boolean(),
  data: z.object({
    addressList: z.array(z.object({ address: z.string(), chainIndex: z.string() })),
  }).optional(),
});

function parseWalletAddressFromWalletAdd(stdout: string): string | null {
  let raw: unknown;
  try { raw = JSON.parse(stdout); } catch { return null; }
  const parsed = WalletAddSchema.safeParse(raw);
  if (!parsed.success) return null;
  const entry = parsed.data.data?.addressList.find((a) => a.chainIndex === '196');
  return entry?.address ?? null;
}

describe('wallet address parsing (container.fetchWalletAddress — wallet add output)', () => {
  it('extracts chain-196 address from wallet add JSON output', () => {
    const output = JSON.stringify({
      ok: true,
      data: {
        accountId: 'acc-001',
        addressList: [{ address: '0xAbCd1234567890AbCd1234567890abcd12345678', chainIndex: '196' }],
      },
    });
    expect(parseWalletAddressFromWalletAdd(output)).toBe('0xAbCd1234567890AbCd1234567890abcd12345678');
  });

  it('filters by chainIndex 196 when multiple chains are present', () => {
    const output = JSON.stringify({
      ok: true,
      data: {
        accountId: 'acc-002',
        addressList: [
          { address: '0x1111111111111111111111111111111111111111', chainIndex: '1' },
          { address: '0x2222222222222222222222222222222222222222', chainIndex: '196' },
          { address: '0x3333333333333333333333333333333333333333', chainIndex: '56' },
        ],
      },
    });
    expect(parseWalletAddressFromWalletAdd(output)).toBe('0x2222222222222222222222222222222222222222');
  });

  it('returns null when no chain-196 address is present', () => {
    const output = JSON.stringify({
      ok: true,
      data: {
        accountId: 'acc-003',
        addressList: [{ address: '0x1111111111111111111111111111111111111111', chainIndex: '1' }],
      },
    });
    expect(parseWalletAddressFromWalletAdd(output)).toBeNull();
  });

  it('returns null when addressList is empty', () => {
    const output = JSON.stringify({ ok: true, data: { accountId: 'acc-004', addressList: [] } });
    expect(parseWalletAddressFromWalletAdd(output)).toBeNull();
  });

  it('returns null when output is not valid JSON', () => {
    expect(parseWalletAddressFromWalletAdd('Error: wallet command failed')).toBeNull();
    expect(parseWalletAddressFromWalletAdd('')).toBeNull();
  });

  it('returns null when data is missing', () => {
    expect(parseWalletAddressFromWalletAdd(JSON.stringify({ ok: false }))).toBeNull();
  });

  it('each parsed call returns a distinct address (uniqueness check)', () => {
    const outputs = [
      { accountId: 'acc-a', address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
      { accountId: 'acc-b', address: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' },
      { accountId: 'acc-c', address: '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' },
    ].map(({ accountId, address }) =>
      JSON.stringify({ ok: true, data: { accountId, addressList: [{ address, chainIndex: '196' }] } }),
    );

    const addresses = outputs.map(parseWalletAddressFromWalletAdd);
    const unique = new Set(addresses);
    expect(unique.size).toBe(3);
  });
});
