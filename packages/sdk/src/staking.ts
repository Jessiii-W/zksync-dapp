// packages/sdk/src/staking.ts
// Staking 合约 SDK（对应 contracts/Staking.sol）

import { ethers } from "ethers";
import { getDeployments } from "./config";
import StakingABI from "./abi/Staking.json";

const abi = (StakingABI as { abi: ethers.InterfaceAbi }).abi;

/** 用户质押信息（与合约 UserStake 一致） */
export type UserStake = {
  balance: bigint;
  stakeTime: bigint;
};

/**
 * Staking 质押挖矿合约调用封装，适配 zkSync Sepolia
 */
export class StakingSDK {
  public contract: ethers.Contract;
  public signer: ethers.Signer | ethers.Provider;

  constructor(
    providerOrSigner: ethers.Signer | ethers.Provider,
    contractAddress?: string,
  ) {
    this.signer = providerOrSigner;
    const address = contractAddress ?? getDeployments().Staking;
    if (!address)
      throw new Error("Staking contract address not found. Deploy first.");
    this.contract = new ethers.Contract(address, abi, providerOrSigner);
  }

  /** 当前 Staking 合约地址（用于前端做 approve 时作为 spender） */
  getContractAddress(): string {
    return this.contract.target as string;
  }

  /** 质押代币 */
  async stake(amount: string): Promise<ethers.ContractTransactionResponse> {
    return this.contract.stake(ethers.parseEther(amount));
  }

  /** 解质押（本金 + 收益） */
  async unstake(): Promise<ethers.ContractTransactionResponse> {
    return this.contract.unstake();
  }

  /** 仅领取待领收益，不解除质押 */
  async claimReward(): Promise<ethers.ContractTransactionResponse> {
    return this.contract.claimReward();
  }

  /** 某用户待领收益（wei） */
  async pendingReward(userAddress: string): Promise<bigint> {
    return this.contract.pendingReward(userAddress);
  }

  /** 某用户质押信息 */
  async userStake(userAddress: string): Promise<UserStake> {
    const [balance, stakeTime] = await this.contract.userStake(userAddress);
    return { balance, stakeTime };
  }

  /** 当前总质押量（wei） */
  async totalStaked(): Promise<bigint> {
    return this.contract.totalStaked();
  }

  /** 奖励池余额（wei） */
  async rewardPool(): Promise<bigint> {
    return this.contract.rewardPool();
  }

  /** 质押代币合约地址 */
  async stakeToken(): Promise<string> {
    return this.contract.stakeToken();
  }
}
