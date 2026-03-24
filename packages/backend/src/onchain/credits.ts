import { ethers } from 'ethers';

const X_LAYER_RPC = 'https://rpc.xlayer.tech';

// 200 PAW = ~72 days at 0.001 PAW per 3h heartbeat
const REGISTRATION_GRANT = ethers.parseUnits('200', 18);

const ERC20_TRANSFER_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
];

/**
 * Transfers 200 PAW from the platform wallet to the newly created pet wallet.
 * Called once at pet registration to fund the pet's heartbeat payments.
 *
 * Requires env vars:
 *   BACKEND_RELAYER_PRIVATE_KEY — private key of the platform wallet that holds PAW
 *   PAW_TOKEN_ADDRESS           — deployed PAW ERC20 contract address
 *   PLATFORM_WALLET_ADDRESS     — public address of the platform wallet (for logging)
 */
export async function grantRegistrationCredits(petWalletAddress: string): Promise<void> {
  const privateKey = process.env.BACKEND_RELAYER_PRIVATE_KEY;
  const tokenAddress = process.env.PAW_TOKEN_ADDRESS;

  if (!privateKey) throw new Error('BACKEND_RELAYER_PRIVATE_KEY not set');
  if (!tokenAddress) throw new Error('PAW_TOKEN_ADDRESS not set');

  const provider = new ethers.JsonRpcProvider(X_LAYER_RPC);
  const signer = new ethers.Wallet(privateKey, provider);

  const token = new ethers.Contract(tokenAddress, ERC20_TRANSFER_ABI, signer);
  const tx = await token.transfer(petWalletAddress, REGISTRATION_GRANT) as ethers.ContractTransactionResponse;
  await tx.wait();
}
