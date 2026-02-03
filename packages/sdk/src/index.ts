// packages/sdk/src/index.ts
import { ethers } from "ethers";
import JessTokenABI from "./abi/JessToken.json";

// 定义部署地址类型，避免TS报错
type ZkSyncDeployments = {
  JessToken: string;
  chainId: string;
  rpcUrl: string;
};

// 检测是否在 Node.js 环境中
function isNodeEnvironment(): boolean {
  return (
    typeof process !== "undefined" &&
    process.versions != null &&
    process.versions.node != null
  );
}

// 默认部署信息（用于浏览器环境或文件读取失败时的回退）
const DEFAULT_DEPLOYMENTS: ZkSyncDeployments = {
  JessToken: "0x42bDC59f4F28F492365f3763e9ADcAD6428C3714",
  chainId: "300",
  rpcUrl: "https://sepolia.era.zksync.dev",
};

// 运行时动态加载部署文件（兼容浏览器和 Node.js 环境）
function loadDeployments(): ZkSyncDeployments {
  // 浏览器环境：直接使用默认值
  if (!isNodeEnvironment()) {
    // 浏览器中可以从 window 对象获取配置（如果前端需要动态配置）
    const windowConfig = typeof window !== "undefined" ? (window as any).__ZKSYNC_DEPLOYMENTS__ : undefined;
    return windowConfig || DEFAULT_DEPLOYMENTS;
  }

  // Node.js 环境：从文件系统读取
  try {
    // 动态导入 Node.js 模块（避免在浏览器中被打包）
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require("path");
    
    // 兼容 CJS 和 ESM
    let currentDir: string;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - __dirname 在 CJS 中存在，在 ESM 中不存在
    if (typeof __dirname !== "undefined") {
      // CJS 环境
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - __dirname 在 CJS 中存在
      currentDir = __dirname;
    } else {
      // ESM 环境
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { fileURLToPath } = require("url");
      const __filename = fileURLToPath(import.meta.url);
      currentDir = path.dirname(__filename);
    }
    
    // 从 SDK 的 dist 目录向上查找 contracts 目录
    const deploymentsPath = path.join(
      currentDir,
      "../../contracts/dist/deployments/zkSyncSepolia.json"
    );
    
    if (!fs.existsSync(deploymentsPath)) {
      throw new Error(
        `Deployment file not found at ${deploymentsPath}. Please deploy the contract first.`
      );
    }
    
    const deploymentsContent = fs.readFileSync(deploymentsPath, "utf-8");
    return JSON.parse(deploymentsContent) as ZkSyncDeployments;
  } catch (error) {
    // 如果文件读取失败，使用默认值
    console.warn("Failed to load deployment file, using defaults:", error);
    return {
      JessToken: process.env.JESS_TOKEN_ADDRESS || DEFAULT_DEPLOYMENTS.JessToken,
      chainId: process.env.CHAIN_ID || DEFAULT_DEPLOYMENTS.chainId,
      rpcUrl: process.env.ZKSYNC_SEPOLIA_RPC_URL || DEFAULT_DEPLOYMENTS.rpcUrl,
    };
  }
}

const deployments = loadDeployments();

/**
 * 企业级SDK：JessToken合约调用封装
 * 适配zkSync Sepolia，前后端共用
 */
export class JessTokenSDK {
  public contract: ethers.Contract;
  public signer: ethers.Signer | ethers.Provider;

  /**
   * 构造函数
   * @param providerOrSigner - 提供者（后端）/签名者（前端，带钱包）
   * @param contractAddress - 可选，自定义合约地址
   */
  constructor(
    providerOrSigner: ethers.Signer | ethers.Provider,
    contractAddress?: string,
  ) {
    this.signer = providerOrSigner;
    const address = contractAddress || deployments.JessToken;
    if (!address)
      throw new Error(
        "JessToken contract address not found! Please deploy first.",
      );
    // 初始化合约实例
    this.contract = new ethers.Contract(
      address,
      JessTokenABI.abi,
      providerOrSigner,
    );
  }

  // 1. 获取指定地址的代币余额
  async getBalance(address: string): Promise<string> {
    const balance = await this.contract.balanceOf(address);
    return ethers.formatEther(balance); // 转换为可读格式（去掉18位小数）
  }

  // 2. 转账代币（前端用，需要签名者）
  async transfer(
    to: string,
    amount: string,
  ): Promise<ethers.ContractTransaction> {
    const amountWei = ethers.parseEther(amount); // 转换为wei单位
    return await this.contract.transfer(to, amountWei);
  }

  // 3. 获取代币名称/符号
  async getTokenInfo(): Promise<{ name: string; symbol: string }> {
    const [name, symbol] = await Promise.all([
      this.contract.name(),
      this.contract.symbol(),
    ]);
    return { name, symbol };
  }

  // 4. 监听链上Transfer事件（后端用，监听转账）
  onTransfer(callback: (from: string, to: string, amount: string) => void) {
    this.contract.on("Transfer", (from: string, to: string, amount: bigint) => {
      callback(from, to, ethers.formatEther(amount));
    });
    // 返回取消监听的方法，避免内存泄漏
    return () => this.contract.off("Transfer");
  }
}

/**
 * 创建zkSync Sepolia Provider（前后端共用）
 * @returns ethers.JsonRpcProvider
 */
export function createZkSyncProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(deployments.rpcUrl);
}
