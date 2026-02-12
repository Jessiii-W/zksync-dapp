# 项目架构与流程

本文档描述 zksync-dapp 的仓库结构、各模块职责、数据流与关键流程。

---

## 一、项目概览

本项目是一个基于 **zkSync Sepolia** 的 DApp：发行 ERC20 代币（JES），支持转账与质押挖矿（Staking）。采用 **pnpm workspace + Turbo** 的 monorepo 结构，包含智能合约、SDK、后端与前端四个子包。

| 包 | 职责 |
|----|------|
| **contracts** | JessToken（ERC20）、Staking（质押挖矿）合约；部署脚本与单元测试 |
| **sdk** | 对合约调用的封装，供 server 与 frontend 共用；部署配置与 RPC |
| **server** | Express 服务：只读链上数据、监听事件、提供 REST API |
| **frontend** | React 应用：连接钱包、转账、质押/解质押/领奖，消费后端 API |

目标链：**zkSync Sepolia**（chainId 300）。

---

## 二、仓库结构

```
zksync-dapp/
├── package.json              # 根脚本：build / test / dev / clean
├── pnpm-workspace.yaml       # workspace 定义 packages/*
├── turbo.json                # Turbo 流水线（build 依赖 ^build，test 依赖 build）
├── docs/
│   ├── ARCHITECTURE_AND_FLOW.md
│   └── TEST_REPORT.md
└── packages/
    ├── contracts/            # 智能合约
    │   ├── contracts/        # JessToken.sol, Staking.sol
    │   ├── deploy/           # 01_deploy_jesstoken.ts, 02_deploy_staking.ts
    │   ├── test/             # JessToken.test.js, Staking.test.js
    │   ├── dist/
    │   │   ├── artifacts/    # 编译产物 ABI 等
    │   │   └── deployments/  # zkSyncSepolia.json（JessToken + Staking 地址）
    │   └── hardhat.config.js
    ├── sdk/                  # 共享 SDK
    │   ├── src/
    │   │   ├── config.ts     # 部署配置加载、createZkSyncProvider
    │   │   ├── jess-token.ts # JessTokenSDK
    │   │   ├── staking.ts    # StakingSDK
    │   │   └── abi/          # JessToken.json, Staking.json
    │   └── tsup.config.ts
    ├── server/               # 后端
    │   └── src/
    │       └── index.ts      # Express：事件监听 + /api/transfers, /api/token-info, /api/staking/*
    └── frontend/             # 前端
        └── src/
            ├── App.tsx       # 钱包连接、Transfer / Staking 两个 Tab
            └── main.tsx
```

---

## 三、架构图

```
                    ┌─────────────────────────────────────────┐
                    │         zkSync Sepolia 链                 │
                    │  JessToken (ERC20)    Staking (质押)      │
                    └─────────────────────────────────────────┘
                       ▲                    ▲
                       │ RPC 只读/事件      │ RPC 只读
                       │                    │
              ┌────────┴────────┐  ┌───────┴────────┐
              │     Server      │  │    Frontend    │
              │  (Provider 只读) │  │ (Provider 读   │
              │  监听 Transfer   │  │  Signer 写)    │
              │  提供 REST API   │  │  调 SDK 发交易  │
              └────────┬────────┘  └───────┬────────┘
                       │                  │
                       │    HTTP API      │  HTTP 请求
                       │  /api/transfers  │  /api/token-info
                       │  /api/token-info │  /api/staking/info
                       │  /api/staking/*  │  /api/staking/user/:addr
                       └─────────────────┴───────────────────┘
                                         │
                              ┌──────────┴──────────┐
                              │   @zksync-dapp/sdk  │
                              │  JessTokenSDK      │
                              │  StakingSDK        │
                              │  createZkSyncProvider
                              │  getDeployments()  │
                              └────────────────────┘
                                         ▲
                              ┌──────────┴──────────┐
                              │   contracts 部署    │
                              │  zkSyncSepolia.json │
                              └────────────────────┘
```

- **Server**：仅使用 **Provider**（无私钥），只读链上数据并监听 JessToken 的 Transfer 事件，将历史写入内存，通过 REST 暴露。
- **Frontend**：连接钱包后持有 **Signer**，写操作（转账、质押、解质押、领奖）均通过 SDK(Signer) 发起交易；读数据（代币信息、转账历史、质押池汇总、用户质押）来自后端 API。

---

## 四、模块职责与依赖

### 4.1 contracts

- **产出**：JessToken.sol、Staking.sol 编译后的 ABI 与字节码；部署后写入 `dist/deployments/zkSyncSepolia.json`（含 `JessToken`、`Staking`、`chainId`、`rpcUrl` 等）。
- **依赖**：Hardhat、zkSync 插件、OpenZeppelin。不依赖 sdk/server/frontend。
- **被依赖**：sdk 通过部署文件或默认配置读取合约地址；server/frontend 通过 sdk 访问链。

### 4.2 sdk

- **职责**：统一封装合约调用与链配置。`config` 提供 `getDeployments()`、`createZkSyncProvider()`；`JessTokenSDK` / `StakingSDK` 封装 ERC20 与 Staking 的读/写接口。
- **配置来源**：Node 环境优先读 `contracts/dist/deployments/zkSyncSepolia.json`；浏览器环境可用 `window.__ZKSYNC_DEPLOYMENTS__` 或内置默认地址。环境变量可覆盖（如 `STAKING_ADDRESS`、`ZKSYNC_SEPOLIA_RPC_URL`）。
- **依赖**：ethers、合约 ABI（复制自 contracts 产物或同仓库路径）。被 server、frontend 以 `workspace:*` 引用。

### 4.3 server

- **职责**：启动时用 `createZkSyncProvider()` + `JessTokenSDK(provider)` 监听 Transfer，将记录推入内存；对外提供：
  - `GET /api/transfers`：转账历史
  - `GET /api/token-info`：代币 name/symbol
  - `GET /api/staking/info`：总质押量、奖励池余额
  - `GET /api/staking/user/:address`：指定地址的质押额与待领收益
- **依赖**：@zksync-dapp/sdk、express、cors、ethers。不直接读合约 ABI 文件，仅通过 SDK 访问链。

### 4.4 frontend

- **职责**：用户连接 MetaMask（zkSync Sepolia）后，展示 JES 余额、转账表单与历史、质押池信息与个人质押/待领收益；发起转账、质押、解质押、领奖时通过 `JessTokenSDK(signer)` / `StakingSDK(signer)` 发送交易。
- **依赖**：@zksync-dapp/sdk、ethers、react、axios。请求后端 `API_BASE_URL`（默认 `http://localhost:3001/api`）。

---

## 五、部署流程

1. **环境**：在 `packages/contracts` 下配置 `.env`（如 `ZKSYNC_SEPOLIA_RPC_URL`、`PRIVATE_KEY`，可选 `CHAIN_ID`、`ZKSYNC_API_URL` 用于验证）。
2. **部署 JessToken**：执行 `01_deploy_jesstoken.ts`，将 JessToken 地址写入 `dist/deployments/zkSyncSepolia.json`。
3. **部署 Staking**：执行 `02_deploy_staking.ts`，读取同一 JSON 中的 `JessToken` 作为质押代币地址，部署 Staking 后将 `Staking` 地址合并回 `zkSyncSepolia.json`。
4. **后续**：Server 与 Frontend 通过 SDK 的 `getDeployments()` 使用同一份部署文件（或默认/环境变量），无需再改配置。

---

## 六、运行时数据流

### 6.1 只读数据（后端 API）

- 前端轮询或按需请求：
  - `/api/token-info` → Server 用 `JessTokenSDK(provider)` 读 name/symbol。
  - `/api/transfers` → Server 返回内存中的 Transfer 历史（由监听器写入）。
  - `/api/staking/info` → Server 用 `StakingSDK(provider)` 读 `totalStaked()`、`rewardPool()`。
  - `/api/staking/user/:address` → Server 用 `StakingSDK(provider)` 读 `userStake(address)`、`pendingReward(address)`。
- 所有写链操作均由前端使用钱包 Signer 完成，后端不参与签名。

### 6.2 用户写操作（前端 + 钱包）

| 操作 | 前端调用 | 合约方法 |
|------|----------|----------|
| 转账 JES | `JessTokenSDK(signer).transfer(to, amount)` | `JessToken.transfer` |
| 质押 | `StakingSDK(signer).stake(amount)` | `Staking.stake`（内部会 `transferFrom` 用户，需用户已对 Staking approve） |
| 解质押 | `StakingSDK(signer).unstake()` | `Staking.unstake` |
| 领奖 | `StakingSDK(signer).claimReward()` | `Staking.claimReward` |

前端在用户连接钱包后，对 Staking 合约做一次 JES 的 `approve`（或无限额），才能正常调用 `stake`。

### 6.3 事件与历史

- Server 启动时订阅 JessToken 的 `Transfer` 事件，将 `from / to / amount` 与时间戳存入内存，供 `/api/transfers` 返回。
- Staking 的 `Staked` / `Unstaked` 当前未在后端做持久化；前端展示的质押数据来自 `/api/staking/user/:address` 的实时链上查询（由 Server 通过 SDK 读链后返回）。

---

## 七、构建与运行顺序

1. **安装**：根目录 `pnpm install`。
2. **构建**：`pnpm run build`（Turbo 按依赖顺序构建 contracts → sdk → server/frontend）。
3. **合约测试**：`pnpm --filter @zksync-dapp/contracts test`（需 Hardhat 配置可加载，必要时配置 `.env`）。
4. **启动后端**：`pnpm --filter @zksync-dapp/server dev`（端口 3001）。
5. **启动前端**：`pnpm --filter @zksync-dapp/frontend dev`。
6. **使用**：浏览器打开前端，连接 zkSync Sepolia 钱包，进行转账或质押/解质押/领奖。

---

## 八、配置与扩展点

- **合约地址**：通过 `contracts/dist/deployments/zkSyncSepolia.json` 或 SDK 的默认值/环境变量统一生效。
- **后端端口**：`server/src/index.ts` 中 `PORT = 3001`。
- **前端 API 基址**：`frontend/src/App.tsx` 中 `API_BASE_URL`，生产环境可改为实际后端域名。
- **链**：当前仅支持 zkSync Sepolia；更换链需改合约部署目标、SDK 的 `rpcUrl`/`chainId` 及前端的 chainId 校验。

以上即为本项目的架构与主要流程说明。
