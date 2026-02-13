// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title Staking
 * @notice 质押挖矿：用户质押 ERC20 → 按时间线性计息 → 解质押时提取本金+收益
 * @dev 收益 = 质押量 × (当前时间 - 上次结算时间) × rewardRatePerTokenPerSecond / 1e18
 *      集成 ReentrancyGuard、Pausable；含 Gas 优化（unchecked、打包变量）
 */
contract Staking is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable stakeToken;

    /// @notice 每秒、每 1e18 代币获得的奖励（18 位小数）。例：10e18 表示每年代币 10 倍收益
    uint256 public rewardRatePerTokenPerSecond;

    /// @notice 当前总质押量（用于收益分配与校验）
    uint256 public totalStaked;

    /// @notice 奖励池余额（合约持有的、可用于发放收益的代币）
    uint256 public rewardPool;

    /// @notice 用户质押信息（Gas 优化：打包到 1 个 slot）
    /// balance: 质押数量（uint128 足够 10^18 量级约 3e38）
    /// stakeTime: 上次结算时间戳（uint64 到 2106 年）
    struct UserStake {
        uint128 balance;
        uint64 stakeTime;
    }
    mapping(address => UserStake) public userStake;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 principal, uint256 reward);
    event RewardRateUpdated(uint256 oldRate, uint256 newRate);
    event RewardPoolFunded(uint256 amount);
    event EmergencyPause();
    event EmergencyUnpause();

    error ZeroAmount();
    error ZeroAddress();
    error InsufficientRewardPool();
    error NoStake();
    error BalanceOverflow();

    constructor(address _stakeToken) Ownable(msg.sender) {
        if (_stakeToken == address(0)) revert ZeroAddress();
        stakeToken = IERC20(_stakeToken);
    }

    /**
     * @notice 质押代币
     * @param amount 质押数量（18 位小数）
     */
    function stake(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        // 若已有质押，先结算并发放待领收益，再叠加新质押（避免旧收益被稀释到新 stakeTime）
        _settleReward(msg.sender);
        UserStake storage u = userStake[msg.sender];
        uint128 currentBalance = u.balance;
        uint128 add = _toU128(amount);
        u.balance = currentBalance + add;
        u.stakeTime = uint64(block.timestamp);
        unchecked {
            totalStaked += amount;
        }
        stakeToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    /**
     * @notice 解质押：先结算并发放收益，再取回本金
     */
    function unstake() external nonReentrant whenNotPaused {
        UserStake storage u = userStake[msg.sender];
        uint128 balance = u.balance;
        if (balance == 0) revert NoStake();
        uint256 reward = _pendingRewardRaw(msg.sender);
        u.balance = 0;
        u.stakeTime = 0;
        unchecked {
            totalStaked -= uint256(balance);
        }
        if (reward > 0) {
            if (reward > rewardPool) revert InsufficientRewardPool();
            unchecked {
                rewardPool -= reward;
            }
            stakeToken.safeTransfer(msg.sender, reward);
        }
        stakeToken.safeTransfer(msg.sender, uint256(balance));
        emit Unstaked(msg.sender, uint256(balance), reward);
    }

    /**
     * @notice 仅领取收益，不解除质押（更新 stakeTime 以便后续按新时间计息）
     */
    function claimReward() external nonReentrant whenNotPaused {
        uint256 reward = _pendingRewardRaw(msg.sender);
        if (reward == 0) return;
        if (reward > rewardPool) revert InsufficientRewardPool();
        userStake[msg.sender].stakeTime = uint64(block.timestamp);
        unchecked {
            rewardPool -= reward;
        }
        stakeToken.safeTransfer(msg.sender, reward);
    }

    /// @notice 查询某用户当前待领收益（仅读，不修改状态）
    function pendingReward(address user) external view returns (uint256) {
        return _pendingRewardRaw(user);
    }

    function _pendingRewardRaw(address user) internal view returns (uint256) {
        UserStake storage u = userStake[user];
        uint128 balance = u.balance;
        if (balance == 0 || rewardRatePerTokenPerSecond == 0) return 0;
        uint256 elapsed;
        unchecked {
            elapsed = block.timestamp - u.stakeTime;
        }
        return
            (uint256(balance) * elapsed * rewardRatePerTokenPerSecond) / 1e18;
    }

    /// @dev 结算用户待领收益：发放并更新 stakeTime（stake 追加时调用）
    function _settleReward(address user) internal {
        UserStake storage u = userStake[user];
        if (u.balance == 0) return;
        uint256 pending = _pendingRewardRaw(user);
        if (pending > 0) {
            if (pending > rewardPool) revert InsufficientRewardPool();
            unchecked {
                rewardPool -= pending;
            }
            stakeToken.safeTransfer(user, pending);
        }
        u.stakeTime = uint64(block.timestamp);
    }

    // ---------- Owner ----------
    function setRewardRatePerTokenPerSecond(
        uint256 newRate
    ) external onlyOwner {
        uint256 old = rewardRatePerTokenPerSecond;
        rewardRatePerTokenPerSecond = newRate;
        emit RewardRateUpdated(old, newRate);
    }

    /// @notice 向合约充值奖励池（需先 approve）
    function fundRewardPool(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        rewardPool += amount;
        stakeToken.safeTransferFrom(msg.sender, address(this), amount);
        emit RewardPoolFunded(amount);
    }

    function pause() external onlyOwner {
        _pause();
        emit EmergencyPause();
    }

    function unpause() external onlyOwner {
        _unpause();
        emit EmergencyUnpause();
    }

    function _toU128(uint256 x) internal pure returns (uint128) {
        if (x > type(uint128).max) revert BalanceOverflow();
        return uint128(x);
    }
}
