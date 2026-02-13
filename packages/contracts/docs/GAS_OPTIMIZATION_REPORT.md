# Staking 合约 Gas 优化报告

## 一、已实现的优化点

### 1. unchecked 块（明确无溢出场景）

| 位置 | 说明 | 效果 |
|------|------|------|
| `stake()` 中 `totalStaked += amount` | 已校验 `amount > 0`，总质押量有上界（代币供应量） | 省去溢出检查，减少 Gas |
| `unstake()` 中 `totalStaked -= uint256(balance)` | 先校验 `balance > 0` 且为用户真实余额，减法不会下溢 | 省去下溢检查 |
| `unstake()` / `_settleReward()` / `claimReward()` 中 `rewardPool -= reward` | 已先校验 `reward <= rewardPool` | 省去下溢检查 |
| `_pendingRewardRaw()` 中 `elapsed = block.timestamp - u.stakeTime` | 时间单调递增，`stakeTime` 为历史写入，必有 `elapsed >= 0` | 省去下溢检查 |

**原理**：Solidity 0.8+ 默认会插入溢出/下溢检查。在数学上可证明不会溢出/下溢的代码用 `unchecked { }` 包裹后，编译器不再插入检查，从而节省 Gas。

---

### 2. 压缩变量（uint128 / uint64 替代 uint256）

| 位置 | 说明 | 效果 |
|------|------|------|
| `UserStake.balance` 使用 `uint128` | 单用户质押量在 2^128/10^18 ≈ 3.4e20 代币内足够 | 与 `stakeTime` 打包进同一 storage slot |
| `UserStake.stakeTime` 使用 `uint64` | 时间戳到 2106 年仍可表示 | 同上，单 slot 存整条用户记录 |

**原理**：EVM 一个 storage slot 为 32 字节（256 位）。  
- 若 `balance` 和 `stakeTime` 各用 `uint256` 和 `uint64`，会占 2 个 slot，SSTORE 约 20000 Gas/slot。  
- 打包为 `uint128 + uint64`（共 192 位）放入 1 个 slot，**每次读写用户信息只涉及 1 次 SLOAD/SSTORE**，显著减少冷/热存储访问。

**注意**：`_toU128()` 在入参超过 `type(uint128).max` 时 revert（`BalanceOverflow`），保证安全。

---

### 3. 批量处理（设计预留）

当前合约未实现多用户批量接口，但结构支持后续扩展：

- **可选扩展**：增加 `batchStake(address[] users, uint256[] amounts)` 或由上层/前端对多笔 `stake` 做批量提交（如 multicall、batch 交易），减少单用户多次调用的固定开销。
- **收益**：多用户一次交易可摊薄 `nonReentrant`、`whenNotPaused` 及合约入口的固定 Gas，在大量用户同时操作时更明显。

---

## 二、测试中观测到的 Gas 数据（Hardhat 环境）

以下为 `pnpm test test/Staking.test.js` 时 Gas Reporter 的典型输出（仅作参考，实际链上会因网络与状态不同而略有差异）：

| 方法 | 典型 Gas (Avg) |
|------|----------------|
| Staking 部署 | ~857,459 |
| stake | ~93,096 |
| unstake | ~48,958 |
| claimReward | ~30,218 |
| fundRewardPool | ~84,721 |
| setRewardRatePerTokenPerSecond | ~47,263 |
| pause | ~47,597 |
| unpause | ~25,697 |

---

## 三、优化小结

1. **unchecked**：在已通过前置条件保证无溢出/下溢的地方使用 `unchecked`，减少算术检查带来的 Gas。  
2. **打包存储**：`UserStake` 使用 `uint128 + uint64` 单 slot 存储，降低读写用户状态的存储成本。  
3. **批量处理**：当前为单用户接口；若产品需要，可在此基础上增加批量接口或配合 multicall 使用，进一步摊薄单次调用成本。

上述优化在不改变业务逻辑与安全性的前提下，降低了 Staking 合约的 Gas 消耗，尤其对高频的 `stake`/`unstake`/`claimReward` 路径有利。
