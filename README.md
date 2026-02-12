# zksync-dapp

基于 **zkSync Sepolia** 的 DApp：发行 ERC20 代币 **JES (JessToken)**，支持转账与质押挖矿（Staking）。

## 功能

- **代币**：JessToken (JES)，ERC20 + Pausable + Permit + Ownable2Step
- **转账**：连接钱包后转账 JES，查看链上转账历史
- **质押**：将 JES 质押到 Staking 合约，按时间线性计息，支持解质押与领取收益

## 技术栈

| 层级     | 技术 |
|----------|------|
| 合约     | Solidity 0.8.26、Hardhat、zkSync 插件、OpenZeppelin |
| 链交互   | zkSync Sepolia、ethers / zksync-ethers |
| 共享层   | TypeScript SDK（合约封装与部署配置） |
| 后端     | Express、仅 Provider 只读 + Transfer 事件监听 |
| 前端     | React 19、Vite、MetaMask 钱包 |

## 环境要求

- **Node.js** >= 22.0.0
- **pnpm** >= 10.28.2

## 项目结构（Monorepo）

```
zksync-dapp/
├── packages/
│   ├── contracts/   # 智能合约 JessToken、Staking；部署脚本与测试
│   ├── sdk/         # 共享 SDK，供 server 与 frontend 使用
│   ├── server/      # Express API（转账历史、代币信息、质押数据）
│   └── frontend/    # React 应用（钱包、转账、质押）
├── docs/            # 架构说明、测试报告等
├── pnpm-workspace.yaml
└── turbo.json
```

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 构建

```bash
pnpm run build
```

Turbo 会按依赖顺序构建：contracts → sdk → server / frontend。

### 3. 配置合约（仅部署或跑合约测试时需要）

在 `packages/contracts` 下创建 `.env`：

```env
ZKSYNC_SEPOLIA_RPC_URL=https://sepolia.era.zksync.dev
PRIVATE_KEY=你的私钥（不含 0x 或带 0x 均可）
```

可选：`CHAIN_ID=300`、`ZKSYNC_API_URL`（验证合约用）。

### 4. 部署合约（首次或换链时）

```bash
# 部署 JessToken
pnpm --filter @zksync-dapp/contracts deploy:zksync

# 部署 Staking（依赖已部署的 JessToken 地址）
pnpm --filter @zksync-dapp/contracts deploy:zksync:staking
```

部署结果会写入 `packages/contracts/dist/deployments/zkSyncSepolia.json`，SDK 会据此连接合约。

### 5. 启动后端与前端

**方式一：分别启动（推荐开发时）**

```bash
# 终端 1：后端，默认 http://localhost:3001
pnpm --filter @zksync-dapp/server dev

# 终端 2：前端
pnpm --filter @zksync-dapp/frontend dev
```

**方式二：并行启动**

```bash
pnpm run dev
```

浏览器打开前端地址（如 Vite 默认 `http://localhost:5173`），连接 **zkSync Sepolia** 钱包即可使用。

## 脚本说明

| 命令 | 说明 |
|------|------|
| `pnpm install` | 安装所有 workspace 依赖 |
| `pnpm run build` | 全量构建（contracts + sdk + server + frontend） |
| `pnpm run test` | 运行各包测试（合约测试需配置 contracts 的 `.env`） |
| `pnpm run dev` | 并行启动 server 与 frontend 的 dev 服务 |
| `pnpm run clean` | 清理各包构建产物与根 node_modules |

## 测试

- **合约测试**：在 `packages/contracts` 下执行 `pnpm test`，需配置 `ZKSYNC_SEPOLIA_RPC_URL`（部分测试可能请求链上）。
- 详细说明见 [docs/TEST_REPORT.md](docs/TEST_REPORT.md)。

## 文档

- [项目架构与流程](docs/ARCHITECTURE_AND_FLOW.md) — 模块职责、数据流、部署与运行流程
- [测试报告](docs/TEST_REPORT.md) — 合约测试覆盖与运行方式

## License

见各包内声明（合约为 UNLICENSED，其余见对应 package.json）。
