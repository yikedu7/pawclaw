import { ethers } from 'ethers';

const ERC20_BALANCE_ABI = ['function balanceOf(address) view returns (uint256)'];

/**
 * Returns the pet's current PAW token balance in PAW units (not Wei).
 * Result is a decimal string like "150.5", suitable for numeric DB storage
 * and direct use in hunger = clamp((1 - balance / initial_credits) * 100, 0, 100).
 *
 * Requires env vars:
 *   PAYMENT_TOKEN_ADDRESS — deployed PAW ERC20 contract address
 *   X_LAYER_RPC_URL       — (optional) X Layer JSON-RPC endpoint; defaults to mainnet
 */
export async function getPawBalance(walletAddress: string): Promise<string> {
  const tokenAddress = process.env.PAYMENT_TOKEN_ADDRESS;
  const rpcUrl = process.env.X_LAYER_RPC_URL ?? 'https://rpc.xlayer.tech';

  if (!tokenAddress) throw new Error('PAYMENT_TOKEN_ADDRESS not set');

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const token = new ethers.Contract(tokenAddress, ERC20_BALANCE_ABI, provider);
  const decimals = parseInt(process.env.PAYMENT_TOKEN_DECIMALS ?? '18', 10);
  const wei = await token.balanceOf(walletAddress) as bigint;
  return ethers.formatUnits(wei, decimals);
}
