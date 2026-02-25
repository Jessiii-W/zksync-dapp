declare module "@zksync-dapp/sdk" {
  import type { Provider, Signer } from "ethers";
  export function createZkSyncProvider(): import("ethers").JsonRpcProvider;
  export class JessTokenSDK {
    constructor(providerOrSigner: Signer | Provider, contractAddress?: string);
    getTokenInfo(): Promise<{ name: string; symbol: string }>;
    allowance(owner: string, spender: string): Promise<string>;
    approve(
      spender: string,
      amount: string,
    ): Promise<import("ethers").ContractTransactionResponse>;
    onTransfer(
      cb: (from: string, to: string, amount: string) => void,
    ): () => void;
  }
  export class StakingSDK {
    constructor(providerOrSigner: Signer | Provider, contractAddress?: string);
    getContractAddress(): string;
    totalStaked(): Promise<bigint>;
    rewardPool(): Promise<bigint>;
    userStake(address: string): Promise<{ balance: bigint; stakeTime: bigint }>;
    pendingReward(address: string): Promise<bigint>;
  }
}
