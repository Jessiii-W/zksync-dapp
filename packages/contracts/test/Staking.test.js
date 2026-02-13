const { expect } = require("chai");
const { ethers } = require("hardhat");
const hre = require("hardhat");

const NAME = "JessToken";
const SYMBOL = "JES";
const INITIAL_SUPPLY = ethers.parseEther("10000");

// 收益：每秒每 1e18 代币获得的奖励。例：1 年 ≈ 31536000 秒，10e18 表示每年代币 10 倍
// rewardRatePerTokenPerSecond = 10e18 / 31536000
const SECONDS_PER_YEAR = 365 * 24 * 3600;
const REWARD_RATE_PER_YEAR = ethers.parseEther("10"); // 每年代币 10 倍
const REWARD_RATE_PER_SECOND =
  (REWARD_RATE_PER_YEAR * BigInt(1e18)) / BigInt(SECONDS_PER_YEAR);

describe("Staking (质押挖矿)", function () {
  let jessToken;
  let staking;
  let owner;
  let user1;
  let user2;

  beforeEach(async function () {
    await hre.network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
    [owner, user1, user2] = await ethers.getSigners();
    const JessToken = await ethers.getContractFactory("JessToken");
    jessToken = await JessToken.deploy(NAME, SYMBOL);
    await jessToken.waitForDeployment();
    await jessToken.mint(owner.address, ethers.parseEther("10000"));
    const Staking = await ethers.getContractFactory("Staking");
    staking = await Staking.deploy(await jessToken.getAddress());
    await staking.waitForDeployment();
    await staking.setRewardRatePerTokenPerSecond(REWARD_RATE_PER_SECOND);
    await jessToken.approve(await staking.getAddress(), ethers.MaxUint256);
    await jessToken.transfer(user1.address, ethers.parseEther("1000"));
    await jessToken.transfer(user2.address, ethers.parseEther("500"));
    await jessToken
      .connect(user1)
      .approve(await staking.getAddress(), ethers.MaxUint256);
    await jessToken
      .connect(user2)
      .approve(await staking.getAddress(), ethers.MaxUint256);
  });

  // owner 转出 1500 后剩 8500，奖励池充值不超过 8500
  async function fundRewardPool(amount) {
    await staking.fundRewardPool(amount);
  }

  // 相对当前区块时间增加秒数并挖块（注意：evm_increaseTime 在 Hardhat 中会累积，长周期测试用 setNextBlockTimestamp 更稳）
  async function increaseTime(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine", []);
  }

  // 固定「一段时间后」时间：用最近一次 stake 所在区块的时间戳 + seconds
  async function setBlockTimestampAfterStake(secondsAfterStake) {
    const block = await ethers.provider.getBlock("latest");
    const next = Number(block.timestamp) + secondsAfterStake;
    await ethers.provider.send("evm_setNextBlockTimestamp", [next]);
    await ethers.provider.send("evm_mine", []);
  }

  describe("部署与配置", function () {
    it("应正确设置 stakeToken 与 owner", async function () {
      expect(await staking.stakeToken()).to.equal(await jessToken.getAddress());
      expect(await staking.owner()).to.equal(owner.address);
    });

    it("仅 owner 可设置 rewardRatePerTokenPerSecond", async function () {
      await expect(
        staking.connect(user1).setRewardRatePerTokenPerSecond(0)
      ).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
    });

    it("仅 owner 可 fundRewardPool", async function () {
      await jessToken
        .connect(user1)
        .approve(await staking.getAddress(), ethers.parseEther("100"));
      await expect(
        staking.connect(user1).fundRewardPool(ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
    });
  });

  describe("正常流程：质押 → 时间流逝 → 解质押（本金+收益）", function () {
    it("用户质押后 totalStaked 与 userStake 正确", async function () {
      await fundRewardPool(ethers.parseEther("10000"));
      const amount = ethers.parseEther("100");
      await staking.connect(user1).stake(amount);
      expect(await staking.totalStaked()).to.equal(amount);
      const u = await staking.userStake(user1.address);
      expect(u.balance).to.equal(amount);
      expect(u.stakeTime).to.be.gt(0);
    });

    it("rate=0 时 pendingReward 为 0；rate>0 时按时间线性累积", async function () {
      await staking.setRewardRatePerTokenPerSecond(0);
      await fundRewardPool(ethers.parseEther("1"));
      await staking.connect(user1).stake(ethers.parseEther("100"));
      expect(await staking.pendingReward(user1.address)).to.equal(0);
      await staking.setRewardRatePerTokenPerSecond(REWARD_RATE_PER_SECOND);
      await fundRewardPool(ethers.parseEther("10000"));
      const oneDay = 24 * 3600;
      await setBlockTimestampAfterStake(oneDay);
      const pending = await staking.pendingReward(user1.address);
      expect(pending).to.be.gt(0);
    });

    it("解质押可拿回本金 + 收益（rate=0 时仅本金）", async function () {
      await staking.setRewardRatePerTokenPerSecond(0);
      await fundRewardPool(ethers.parseEther("1"));
      const amount = ethers.parseEther("100");
      await staking.connect(user1).stake(amount);
      const balBefore = await jessToken.balanceOf(user1.address);
      await staking.connect(user1).unstake();
      const balAfter = await jessToken.balanceOf(user1.address);
      expect(balAfter - balBefore).to.equal(amount);
    });

    it("仅领取收益不解除质押：claimReward 后 stake 仍存在", async function () {
      await staking.setRewardRatePerTokenPerSecond(0);
      await fundRewardPool(ethers.parseEther("1"));
      const amount = ethers.parseEther("100");
      await staking.connect(user1).stake(amount);
      await staking.connect(user1).claimReward(); // rate=0 时 no-op
      const u = await staking.userStake(user1.address);
      expect(u.balance ?? u[0]).to.equal(amount);
      expect(await staking.pendingReward(user1.address)).to.equal(0n);
    });
  });

  describe("异常场景", function () {
    it("质押 0 应 revert ZeroAmount", async function () {
      await expect(
        staking.connect(user1).stake(0)
      ).to.be.revertedWithCustomError(staking, "ZeroAmount");
    });

    it("无质押时解质押应 revert NoStake", async function () {
      await expect(
        staking.connect(user1).unstake()
      ).to.be.revertedWithCustomError(staking, "NoStake");
    });

    it("解质押后再次解质押应 revert NoStake", async function () {
      await staking.setRewardRatePerTokenPerSecond(0);
      await fundRewardPool(ethers.parseEther("1"));
      await staking.connect(user1).stake(ethers.parseEther("100"));
      await staking.connect(user1).unstake();
      await expect(
        staking.connect(user1).unstake()
      ).to.be.revertedWithCustomError(staking, "NoStake");
    });

    it("暂停后质押应 revert EnforcedPause", async function () {
      await staking.pause();
      await expect(
        staking.connect(user1).stake(ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(staking, "EnforcedPause");
    });

    it("暂停后解质押应 revert EnforcedPause", async function () {
      await fundRewardPool(ethers.parseEther("1000"));
      await staking.connect(user1).stake(ethers.parseEther("100"));
      await staking.pause();
      await expect(
        staking.connect(user1).unstake()
      ).to.be.revertedWithCustomError(staking, "EnforcedPause");
    });

    it("暂停后 unpause 可恢复质押与解质押", async function () {
      await staking.pause();
      await staking.unpause();
      await staking.setRewardRatePerTokenPerSecond(0);
      await fundRewardPool(ethers.parseEther("1"));
      await staking.connect(user1).stake(ethers.parseEther("100"));
      await staking.connect(user1).unstake();
      expect(await jessToken.balanceOf(user1.address)).to.be.gte(
        ethers.parseEther("100")
      );
    });

    it("奖励池不足时解质押应 revert InsufficientRewardPool", async function () {
      await staking.fundRewardPool(ethers.parseEther("1"));
      await staking.connect(user1).stake(ethers.parseEther("100"));
      await increaseTime(SECONDS_PER_YEAR);
      await expect(
        staking.connect(user1).unstake()
      ).to.be.revertedWithCustomError(staking, "InsufficientRewardPool");
    });
  });

  describe("追加质押：先结算收益再叠加", function () {
    it("追加质押时先发放待领收益再更新 stakeTime（rate=0 时仅叠加本金）", async function () {
      await staking.setRewardRatePerTokenPerSecond(0);
      await fundRewardPool(ethers.parseEther("1"));
      await staking.connect(user1).stake(ethers.parseEther("100"));
      await staking.connect(user1).stake(ethers.parseEther("100"));
      const u = await staking.userStake(user1.address);
      expect(u.balance).to.equal(ethers.parseEther("200"));
    });
  });

  describe("仅 owner 可 pause/unpause", function () {
    it("非 owner 调用 pause 应 revert", async function () {
      await expect(
        staking.connect(user1).pause()
      ).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
    });

    it("非 owner 调用 unpause 应 revert", async function () {
      await staking.pause();
      await expect(
        staking.connect(user1).unpause()
      ).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
    });
  });
});
