// packages/sdk/src/index.ts
// 按 contracts 模块统一导出：config / JessToken / Staking

// 配置与网络
export {
  type ZkSyncDeployments,
  loadDeployments,
  getDeployments,
  createZkSyncProvider,
} from "./config";

// JessToken（对应 contracts/JessToken.sol）
export { JessTokenSDK } from "./jess-token";

// Staking（对应 contracts/Staking.sol）
export { StakingSDK, type UserStake } from "./staking";
