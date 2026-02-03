import express from "express";
import cors from "cors";
// @ts-expect-error - SDK 类型声明可能在构建后生成
import { JessTokenSDK, createZkSyncProvider } from "@zksync-dapp/sdk";

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

/**
 * 初始化zkSync合约事件监听
 */

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
