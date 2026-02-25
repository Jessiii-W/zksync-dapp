import express from "express";
import cors from "cors";
import { ethers } from "ethers";
import {
  JessTokenSDK,
  StakingSDK,
  createZkSyncProvider,
} from "@zksync-dapp/sdk";

const app = express();
const PORT = 3001; // 后端服务端口

app.use(cors());
app.use(express.json());

type TransferRecord = {
  from: string;
  to: string;
  amount: string;
  timestamp: number;
  hash?: string;
};

let transferHistory: TransferRecord[] = [];

function initContractListener() {
  try {
    const provider = createZkSyncProvider();
    const sdk = new JessTokenSDK(provider);
    sdk.onTransfer((from: string, to: string, amount: string) => {
      const record: TransferRecord = {
        from,
        to,
        amount,
        timestamp: Date.now(),
      };
      transferHistory.push(record);
      console.log(
        `[zkSync Transfer] ${from.slice(0, 6)}... → ${to.slice(0, 6)}... | ${amount} JES`,
      );
    });
    console.log("✅ zkSync Contract Transfer listener initialized");
  } catch (error) {
    console.error(
      "❌ Failed to init contract listener:",
      (error as Error).message,
    );
    process.exit(1);
  }
}

// ---------- 现有 API ----------

// API 1：获取所有转账记录
app.get("/api/transfers", (req, res) => {
  res.json({
    success: true,
    data: transferHistory,
  });
});

// API 2：获取代币基础信息（名称/符号）
app.get("/api/token-info", async (req, res) => {
  try {
    const provider = createZkSyncProvider();
    const sdk = new JessTokenSDK(provider);
    const tokenInfo = await sdk.getTokenInfo();
    res.json({
      success: true,
      data: tokenInfo,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get token info",
    });
  }
});

// API 3：质押池汇总（总质押量、奖励池余额）
app.get("/api/staking/info", async (req, res) => {
  try {
    const provider = createZkSyncProvider();
    const staking = new StakingSDK(provider);
    const [totalStaked, rewardPool] = await Promise.all([
      staking.totalStaked(),
      staking.rewardPool(),
    ]);
    res.json({
      success: true,
      data: {
        totalStaked: totalStaked.toString(),
        totalStakedFormatted: ethers.formatEther(totalStaked),
        rewardPool: rewardPool.toString(),
        rewardPoolFormatted: ethers.formatEther(rewardPool),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get staking info",
    });
  }
});

// API 4：指定地址的质押信息与待领收益
app.get("/api/staking/user/:address", async (req, res) => {
  const address = req.params.address;
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    res.status(400).json({ success: false, message: "Invalid address" });
    return;
  }
  try {
    const provider = createZkSyncProvider();
    const staking = new StakingSDK(provider);
    const [userStake, pendingReward] = await Promise.all([
      staking.userStake(address),
      staking.pendingReward(address),
    ]);
    res.json({
      success: true,
      data: {
        balance: userStake.balance.toString(),
        balanceFormatted: ethers.formatEther(userStake.balance),
        stakeTime: userStake.stakeTime.toString(),
        pendingReward: pendingReward.toString(),
        pendingRewardFormatted: ethers.formatEther(pendingReward),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get user staking data",
    });
  }
});

function startServer() {
  initContractListener();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

// 执行启动
try {
  startServer();
} catch (error) {
  console.error("❌ Failed to start backend server:", (error as Error).message);
  process.exit(1);
}
