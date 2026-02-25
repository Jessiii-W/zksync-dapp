// packages/sdk/src/jess-token.ts
// JessToken 合约 SDK（对应 contracts/JessToken.sol）

import { ethers } from "ethers";
import { getDeployments } from "./config";
import JessTokenABI from "./abi/JessToken.json";

const abi = (JessTokenABI as { abi: ethers.InterfaceAbi }).abi;

/**
 * JessToken 合约调用封装，适配 zkSync Sepolia，前后端共用
 */
export class JessTokenSDK {
  public contract: ethers.Contract;
  public signer: ethers.Signer | ethers.Provider;

  constructor(
    providerOrSigner: ethers.Signer | ethers.Provider,
    contractAddress?: string,
  ) {
    this.signer = providerOrSigner;
    const address = contractAddress ?? getDeployments().JessToken;
    if (!address)
      throw new Error("JessToken contract address not found. Deploy first.");
    this.contract = new ethers.Contract(address, abi, providerOrSigner);
  }

  async getBalance(address: string): Promise<string> {
    const balance = await this.contract.balanceOf(address);
    return ethers.formatEther(balance);
  }

  async transfer(
    to: string,
    amount: string,
  ): Promise<ethers.ContractTransactionResponse> {
    return this.contract.transfer(to, ethers.parseEther(amount));
  }

  async getTokenInfo(): Promise<{ name: string; symbol: string }> {
    const [name, symbol] = await Promise.all([
      this.contract.name(),
      this.contract.symbol(),
    ]);
    return { name, symbol };
  }

  /** 查询 owner 对 spender 的授权额度（格式化为 ether 字符串） */
  async allowance(owner: string, spender: string): Promise<string> {
    const raw = await this.contract.allowance(owner, spender);
    return ethers.formatEther(raw);
  }

  /** 授权 spender 可转走 amount（18 位小数字符串，如 "100" 表示 100 JES） */
  async approve(
    spender: string,
    amount: string,
  ): Promise<ethers.ContractTransactionResponse> {
    return this.contract.approve(spender, ethers.parseEther(amount));
  }

  onTransfer(
    callback: (from: string, to: string, amount: string) => void,
  ): () => void {
    this.contract.on("Transfer", (from: string, to: string, amount: bigint) => {
      callback(from, to, ethers.formatEther(amount));
    });
    return () => this.contract.off("Transfer");
  }
}
