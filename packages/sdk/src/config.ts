// packages/sdk/src/config.ts
// 部署配置与网络：按 contracts 部署产物统一管理

import { ethers } from "ethers";

/** 部署地址与链配置（与 contracts/dist/deployments/*.json 结构一致） */
export type ZkSyncDeployments = {
  JessToken: string;
  Staking?: string;
  chainId: string;
  rpcUrl: string;
  deployTime?: string;
};

function isNodeEnvironment(): boolean {
  return (
    typeof process !== "undefined" &&
    process.versions != null &&
    process.versions.node != null
  );
}

const DEFAULT_DEPLOYMENTS: ZkSyncDeployments = {
  JessToken: "0x42bDC59f4F28F492365f3763e9ADcAD6428C3714",
  Staking: "0x0fB17833E13caD85818a12977328588283F54649",
  chainId: "300",
  rpcUrl: "https://sepolia.era.zksync.dev",
};

/** 运行时加载部署配置（浏览器用 window.__ZKSYNC_DEPLOYMENTS__ 或默认值，Node 用文件） */
export function loadDeployments(): ZkSyncDeployments {
  if (!isNodeEnvironment()) {
    const windowConfig =
      typeof window !== "undefined"
        ? (window as unknown as { __ZKSYNC_DEPLOYMENTS__?: ZkSyncDeployments }).__ZKSYNC_DEPLOYMENTS__
        : undefined;
    return windowConfig ?? DEFAULT_DEPLOYMENTS;
  }

  try {
    const fs = require("fs");
    const path = require("path");
    let currentDir: string;
    if (typeof __dirname !== "undefined") {
      currentDir = __dirname;
    } else {
      const { fileURLToPath } = require("url");
      currentDir = path.dirname(fileURLToPath(import.meta.url));
    }
    const deploymentsDir = path.join(currentDir, "../../contracts/dist/deployments");
    const mainPath = path.join(deploymentsDir, "zkSyncSepolia.json");
    if (!fs.existsSync(mainPath)) {
      throw new Error(`Deployment file not found: ${mainPath}`);
    }
    const deployments = JSON.parse(fs.readFileSync(mainPath, "utf-8")) as ZkSyncDeployments;
    // Staking 可能单独部署在 zkSyncSepolia-staking.json 中，合并进来
    const stakingPath = path.join(deploymentsDir, "zkSyncSepolia-staking.json");
    if (fs.existsSync(stakingPath)) {
      const stakingJson = JSON.parse(fs.readFileSync(stakingPath, "utf-8")) as { Staking?: string };
      if (stakingJson.Staking) deployments.Staking = stakingJson.Staking;
    }
    return deployments;
  } catch (error) {
    console.warn("Failed to load deployment file, using defaults:", error);
    return {
      JessToken: process.env.JESS_TOKEN_ADDRESS ?? DEFAULT_DEPLOYMENTS.JessToken,
      Staking: process.env.STAKING_ADDRESS ?? DEFAULT_DEPLOYMENTS.Staking,
      chainId: process.env.CHAIN_ID ?? DEFAULT_DEPLOYMENTS.chainId,
      rpcUrl: process.env.ZKSYNC_SEPOLIA_RPC_URL ?? DEFAULT_DEPLOYMENTS.rpcUrl,
    };
  }
}

let _deployments: ZkSyncDeployments | null = null;

/** 获取当前部署配置（单例，避免重复读文件） */
export function getDeployments(): ZkSyncDeployments {
  if (_deployments == null) _deployments = loadDeployments();
  return _deployments;
}

/** 创建 zkSync Sepolia Provider */
export function createZkSyncProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(getDeployments().rpcUrl);
}
