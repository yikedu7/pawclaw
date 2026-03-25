# PawClaw Contracts

Foundry project containing the `PawToken` ERC-20 + EIP-3009 contract.

## Prerequisites

- [Foundry](https://getfoundry.sh/) installed (`forge --version`)
- A funded deployer wallet on X Layer testnet (get OKB from faucet at https://www.okx.com/xlayer/faucet)

## Contracts

### `PawToken` (`src/PawToken.sol`)

ERC-20 token with full **EIP-3009** support — required by the OKX TEE for `x402-pay`.

| Feature | Implemented |
|---------|------------|
| ERC-20 (transfer, approve, transferFrom) | Yes |
| EIP-3009 `transferWithAuthorization` | Yes |
| EIP-3009 `cancelAuthorization` | Yes |
| EIP-3009 `authorizationState` | Yes |
| `nonces(address)` (EIP-2612 compat) | Yes |
| EIP-712 domain separator | Yes |
| Initial supply: 1,000,000 PAW to deployer | Yes |

Name: `PawClaw Token`, Symbol: `PAW`, Decimals: `18`.

## Build & Test

```bash
cd packages/contracts
forge build
forge test
```

## Deploy to X Layer Testnet (chainId 195)

```bash
export DEPLOYER_PRIVATE_KEY=0x<your-private-key>

cd packages/contracts
forge script script/Deploy.s.sol:DeployPawToken \
  --rpc-url https://testrpc.xlayer.tech \
  --broadcast \
  --legacy \
  -vvv
```

The `--legacy` flag is required because X Layer testnet does not support EIP-1559 transactions.

After deployment, the script prints:
```
==============================================
PawToken deployed to: 0x<new-address>
Initial holder:       0x<deployer-address>
Total supply:         1000000000000000000000000
==============================================
Update PAYMENT_TOKEN_ADDRESS in .env and Railway to: 0x<new-address>
```

## Post-deploy steps

1. Copy the new contract address.
2. Update `PAYMENT_TOKEN_ADDRESS` in:
   - `packages/backend/.env`
   - Railway environment variables for the backend service
3. Re-run `grantRegistrationCredits` for existing pets with the new contract address.
4. Verify with: `onchainos payment x402-pay --asset <new-address>`

## Network details

| Parameter | Value |
|-----------|-------|
| Network   | X Layer Testnet |
| Chain ID  | 195 |
| RPC URL   | https://testrpc.xlayer.tech |
| Explorer  | https://www.oklink.com/xlayer-test |
