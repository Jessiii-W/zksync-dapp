# zksync-dapp 测试报告

**项目版本**: 1.0.0  
**报告日期**: 2026-02  
**测试范围**: 智能合约单元测试（Hardhat）；Server / Frontend / SDK 当前无自动化测试，见建议章节。

---

## 一、测试概览

| 模块 | 测试类型 | 测试框架 | 用例数 | 说明 |
|------|----------|----------|--------|------|
| **packages/contracts** | 单元测试 | Hardhat + Chai | 见下表 | JessToken + Staking 合约 |
| packages/server | - | - | - | 无自动化测试 |
| packages/frontend | - | - | - | 无自动化测试 |
| packages/sdk | - | - | - | 无自动化测试 |

合约测试在 **Hardhat 本地网络** 上执行（`networks.hardhat`，无需真实 RPC）。运行前需保证 `packages/contracts` 可正常加载 Hardhat 配置（若配置中引用 `zkSyncSepolia`，需在 `.env` 中提供 `ZKSYNC_SEPOLIA_RPC_URL` 等，否则仅加载配置时可能报错；实际用例跑在 hardhat 网络）。

---

## 二、合约测试用例清单

### 2.1 JessToken（ERC20 + Pausable + Permit + Ownable2Step）

| 套件 | 用例 | 说明 |
|------|------|------|
| **部署与基础信息** | 应将初始供应量铸造给部署者 | 初始 10000 JES 在 owner |
| | 应有正确的 name 和 symbol | name=JessToken, symbol=JES |
| | 应在账户间正常转账 | transfer 后余额正确 |
| **Pausable** | 仅 owner 可调用 pause | pause 后转账 revert EnforcedPause |
| | pause 后 unpause 可恢复转账 | 恢复后 transfer 正常 |
| | 非 owner 调用 pause 应 revert | OwnableUnauthorizedAccount |
| | 非 owner 调用 unpause 应 revert | 同上 |
| **Mint / Burn** | 仅 owner 可 mint | mint 后余额增加 |
| | 非 owner 调用 mint 应 revert | OwnableUnauthorizedAccount |
| | 仅 owner 可 burn | burn 后余额减少 |
| | 非 owner 调用 burn 应 revert | OwnableUnauthorizedAccount |
| **Ownable2Step** | transferOwnership 后需新 owner 调用 acceptOwnership | 两阶段转移 |
| | 仅 pendingOwner 可调用 acceptOwnership | 非 pendingOwner revert |
| **ERC20Permit** | 应暴露 DOMAIN_SEPARATOR | 存在且为 bytes32 |
| | nonces 初始为 0，permit 后递增 | permit 后 nonce+1 |
| | permit 后 spender 可 transferFrom | 授权后能转 |
| | 过期 deadline 的 permit 应 revert | ERC2612ExpiredSignature |

**JessToken 小计**: 4 个 describe，共 **18** 个 it。

---

### 2.2 Staking（质押挖矿）

| 套件 | 用例 | 说明 |
|------|------|------|
| **部署与配置** | 应正确设置 stakeToken 与 owner | 与 JessToken 地址、owner 一致 |
| | 仅 owner 可设置 rewardRatePerTokenPerSecond | 非 owner revert |
| | 仅 owner 可 fundRewardPool | 非 owner revert |
| **正常流程** | 用户质押后 totalStaked 与 userStake 正确 | 质押额与时间戳正确 |
| | rate=0 时 pendingReward 为 0；rate>0 时按时间线性累积 | 收益公式与时间相关 |
| | 解质押可拿回本金 + 收益（rate=0 时仅本金） | 本金与收益到账 |
| | 仅领取收益不解除质押：claimReward 后 stake 仍存在 | 只领收益，质押额不变 |
| **异常场景** | 质押 0 应 revert ZeroAmount | 防 0 质押 |
| | 无质押时解质押应 revert NoStake | 防空解质押 |
| | 解质押后再次解质押应 revert NoStake | 防重复解质押 |
| | 暂停后质押应 revert EnforcedPause | 暂停时禁止质押 |
| | 暂停后解质押应 revert EnforcedPause | 暂停时禁止解质押 |
| | 暂停后 unpause 可恢复质押与解质押 | 恢复后流程正常 |
| | 奖励池不足时解质押应 revert InsufficientRewardPool | 奖励不足时保护 |
| **追加质押** | 追加质押时先发放待领收益再更新 stakeTime（rate=0 时仅叠加本金） | 先结算再叠加 |
| **仅 owner 可 pause/unpause** | 非 owner 调用 pause 应 revert | OwnableUnauthorizedAccount |
| | 非 owner 调用 unpause 应 revert | 同上 |

**Staking 小计**: 6 个 describe，共 **17** 个 it。

---

## 三、运行方式与通过标准

- **命令**（在仓库根目录或 `packages/contracts` 下）:
  - 仅合约: `pnpm --filter @zksync-dapp/contracts test`
  - 或: `cd packages/contracts && pnpm test`
- **通过标准**: 所有 `it` 均通过，无未捕获异常。若启用 Hardhat Gas Reporter，会输出各方法 Gas 消耗供参考（见 `packages/contracts/docs/GAS_OPTIMIZATION_REPORT.md`）。

**环境要求**:
- Node >= 22.0.0，pnpm >= 10.28.2
- 若 `hardhat.config.js` 中配置了 `zkSyncSepolia` 且校验 url 必填，需在 `packages/contracts/.env` 中设置 `ZKSYNC_SEPOLIA_RPC_URL`（可为占位值，合约单元测试实际使用 hardhat 网络）

---

## 四、Gas 与优化

- Staking 合约在测试中会触发 Gas Reporter 输出；典型值（Avg）参见 `packages/contracts/docs/GAS_OPTIMIZATION_REPORT.md`。
- 优化点包括：unchecked 块、UserStake 打包（uint128 + uint64）、ReentrancyGuard 与 Pausable 使用。

---

## 五、未覆盖部分与建议

| 模块 | 现状 | 建议 |
|------|------|------|
| **Server** | 无单测 / 集成测 | 可为 `/api/token-info`、`/api/transfers`、`/api/staking/info`、`/api/staking/user/:address` 增加接口测试（如 Jest + supertest），或对链上只读依赖 mock Provider。 |
| **Frontend** | 无单测 / E2E | 可对连接钱包、转账、质押等关键流程做 E2E（如 Playwright）；或对纯 UI 逻辑做 React 组件单测。 |
| **SDK** | 无单测 | 可对 `JessTokenSDK` / `StakingSDK` 在 mock Provider/Signer 下做调用与返回值断言。 |
| **合约** | 无链上集成测 | 若有需要，可在 zkSync Sepolia 部署后增加少量集成用例（依赖 RPC 与私钥，建议 CI 可选）。 |

---

## 六、结论

- **合约层**：JessToken 与 Staking 具备完整单元测试，覆盖正常流程、权限、暂停、异常与边界（0 质押、无质押解质押、奖励池不足等），满足当前版本交付与开源展示需求。
- **应用层**：Server / Frontend / SDK 暂无自动化测试，建议在后续迭代中按上表补充接口测试与关键 E2E，以便在 GitHub 上提供更完整的质量说明。

**测试报告结束。**
