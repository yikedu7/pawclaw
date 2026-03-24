/**
 * One-time deploy script: deploys PawClaw Token (PAW) ERC20 to X Layer (eip155:196).
 *
 * Run manually:
 *   DEPLOYER_PRIVATE_KEY=0x... tsx packages/backend/src/onchain/deployPaw.ts
 *
 * The deployed contract address must then be set as PAW_TOKEN_ADDRESS in .env /
 * Railway environment variables.
 *
 * Bytecode is compiled from the OpenZeppelin ERC20 source below using:
 *   npx solc --abi --bin --include-path node_modules/ \
 *     --base-path . packages/backend/src/onchain/PawToken.sol
 * Paste the resulting bin hex below as BYTECODE.
 */

import { ethers } from 'ethers';

// Paste compiled bytecode here (from `solc --bin PawToken.sol`).
// Example (replace with real compile output):
//   npx solc --abi --bin --include-path node_modules/ --base-path . PawToken.sol
const BYTECODE = process.env.PAW_BYTECODE ?? '';

const ABI = [
  'constructor(string name, string symbol, uint256 initialSupply)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

const X_LAYER_RPC = 'https://rpc.xlayer.tech';
const INITIAL_SUPPLY = ethers.parseUnits('1000000', 18); // 1 million PAW

async function main(): Promise<void> {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) throw new Error('DEPLOYER_PRIVATE_KEY env var required');
  if (!BYTECODE) throw new Error('PAW_BYTECODE env var required (compile PawToken.sol first)');

  const provider = new ethers.JsonRpcProvider(X_LAYER_RPC);
  const deployer = new ethers.Wallet(privateKey, provider);

  console.log(`Deploying from: ${deployer.address}`);
  const balance = await provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.formatEther(balance)} OKB`);

  const factory = new ethers.ContractFactory(ABI, BYTECODE, deployer);
  const contract = await factory.deploy('PawClaw Token', 'PAW', INITIAL_SUPPLY);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`PAW token deployed at: ${address}`);
  console.log(`Set PAW_TOKEN_ADDRESS=${address} in your environment.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
