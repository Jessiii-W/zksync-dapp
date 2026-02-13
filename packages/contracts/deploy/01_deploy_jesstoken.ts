import { Wallet, Provider } from "zksync-ethers";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export default async function deploy() {
  // 初始化部署器，连接zkSync网络
  const provider = new Provider(process.env.ZKSYNC_SEPOLIA_RPC_URL!);
  const wallet = new Wallet(process.env.PRIVATE_KEY!, provider);
  const deployer = new Deployer(hre, wallet);

  // 确保合约编译完成
  await (hre as any).run("compile");
  console.log("✅ Contract compiled successfully");

  // 加载合约ABI
  const jessTokenArtifact = await deployer.loadArtifact("JessToken");

  const name = "JessToken";
  const symbol = "JES";

  // 部署合约（zkSync需显式部署，自动计算Gas）
  console.log(
    `📤 Deploying JessToken to zkSync Sepolia (${process.env.ZKSYNC_SEPOLIA_RPC_URL})...`
  );
  const jessToken = await deployer.deploy(jessTokenArtifact, [name, symbol]);
  await jessToken.waitForDeployment();
  const contractAddress = await jessToken.getAddress();

  // 输出部署结果
  console.log(`✅ JessToken deployed to zkSync Sepolia: ${contractAddress}`);
  console.log(
    `🔍 View on explorer: https://sepolia.explorer.zksync.io/address/${contractAddress}`
  );

  // 保存部署地址到文件（供SDK/前后端读取）
  // 在 ES 模块中，使用 import.meta.url 替代 __dirname
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const deploymentsDir = path.join(__dirname, "../dist/deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(deploymentsDir, "zkSyncSepolia.json"),
    JSON.stringify(
      {
        JessToken: contractAddress,
        chainId: process.env.CHAIN_ID,
        rpcUrl: process.env.ZKSYNC_SEPOLIA_RPC_URL,
        deployTime: new Date().toISOString(),
      },
      null,
      2 // 缩进字符
    )
  );

  // 验证合约
  try {
    console.log("🔍 Verifying JessToken on zkSync Sepolia...");
    await (hre as any).run("verify:verify", {
      address: contractAddress,
      contract: "contracts/JessToken.sol:JessToken",
      network: "zkSyncSepolia",
      constructorArguments: [name, symbol],
    });
    console.log("✅ Contract verified successfully!");
  } catch (error) {
    console.error("❌ Failed to verify contract:", error);
    throw error;
  }
}
