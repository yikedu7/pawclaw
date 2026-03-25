import { ethers } from 'ethers';
import type { PaymentAuthorization } from './x402.js';

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

/**
 * Verify an EIP-3009 TransferWithAuthorization signature off-chain.
 * Returns the recovered signer address.
 * Throws if the signature is malformed.
 */
export function verifyEIP3009Signature(
  authorization: PaymentAuthorization,
  signature: string,
  tokenAddress: string,
  tokenName: string,
  tokenVersion = '1',
): string {
  const domain = {
    name: tokenName,
    version: tokenVersion,
    chainId: 196n,
    verifyingContract: tokenAddress,
  };
  return ethers.verifyTypedData(domain, EIP3009_TYPES, authorization, signature);
}

const TRANSFER_WITH_AUTHORIZATION_ABI = [
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)',
];

/**
 * Submit a transferWithAuthorization transaction to X Layer.
 * Returns the transaction hash after the tx is mined.
 */
export async function submitTransferWithAuthorization(
  authorization: PaymentAuthorization,
  signature: string,
  tokenAddress: string,
): Promise<string> {
  const privateKey = process.env.BACKEND_RELAYER_PRIVATE_KEY;
  if (!privateKey) throw new Error('BACKEND_RELAYER_PRIVATE_KEY not configured');

  const rpcUrl = process.env.X_LAYER_RPC_URL ?? 'https://rpc.xlayer.tech';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const relayer = new ethers.Wallet(privateKey, provider);
  const token = new ethers.Contract(tokenAddress, TRANSFER_WITH_AUTHORIZATION_ABI, relayer);

  const sig = ethers.Signature.from(signature);
  const tx = await (token.transferWithAuthorization as (
    from: string, to: string, value: bigint, validAfter: bigint, validBefore: bigint,
    nonce: string, v: number, r: string, s: string,
  ) => Promise<ethers.TransactionResponse>)(
    authorization.from,
    authorization.to,
    BigInt(authorization.value),
    BigInt(authorization.validAfter),
    BigInt(authorization.validBefore),
    authorization.nonce,
    sig.v,
    sig.r,
    sig.s,
  );

  await tx.wait();
  return tx.hash;
}
