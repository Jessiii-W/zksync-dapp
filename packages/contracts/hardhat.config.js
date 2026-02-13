import "@nomicfoundation/hardhat-toolbox"; // 测试用：注入 ethers、getSigners 等
import "@matterlabs/hardhat-zksync-solc"; // zkSync编译插件
import "@matterlabs/hardhat-zksync-deploy"; // zkSync部署插件
import "@matterlabs/hardhat-zksync-verify"; // zkSync验证插件
import * as dotenv from "dotenv";

dotenv.config();

export default {
  // zkSync编译插件配置
  zksolc: {
    version: "1.5.1",
    compilerSource: "binary",
    settings: {
      optimizer: {
        enabled: true,
      },
    },
  },

  // 路径配置：指定产物输出目录，方便SDK读取
  paths: {
    artifacts: "./dist/artifacts", // 合约ABI产物
    cache: "./dist/cache", // 编译缓存
    typechain: "./dist/typechain", // ts类型声明
    deploy: "./deploy", // 部署脚本
    deployments: "./dist/deployments", // 部署地址存储目录
  },

  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200, // 优化器假设合约函数被调用的次数
      },
    },
  },
  // 网络配置
  networks: {
    hardhat: { zksync: false }, // 本地节点，关闭zkSync模式
    zkSyncSepolia: {
      url: process.env.ZKSYNC_SEPOLIA_RPC_URL,
      ethNetwork: "sepolia", // 底层L1网络（Ethereum Sepolia）
      zksync: true,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: process.env.CHAIN_ID
        ? parseInt(process.env.CHAIN_ID)
        : undefined,
    },
  },
  // 类型生成：适配ethers v6
  typechain: {
    outDir: "./dist/typechain",
    target: "ethers-v6",
  },
  // zkSync合约验证配置
  verify: {
    zksync: {
      apiUrl: process.env.ZKSYNC_API_URL,
    },
  },
};
