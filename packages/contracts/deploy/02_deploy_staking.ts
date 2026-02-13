import { Provider, Wallet } from "zksync-ethers";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export default async function deploy() {
  // 先获取已部署的token合约地址
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const deploymentsPath = path.join(
    __dirname,
    "../dist/deployments/zkSyncSepolia.json"
  );
  console.log(deploymentsPath);
  if (!fs.existsSync(deploymentsPath)) {
    throw new Error("请先部署token合约");
  }
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));
  const stakeTokenAddress = deployments.JessToken as string;

  // 编译staking合约
  const provider = new Provider(process.env.ZKSYNC_SEPOLIA_RPC_URL!);
  const wallet = new Wallet(process.env.PRIVATE_KEY!, provider);
  const deployer = new Deployer(hre, wallet);

  await (hre as any).run("compile");
  console.log("✅ Contract compiled successfully");

  // 加载staking合约
  const stakingArtifact = await deployer.loadArtifact("Staking");
  console.log("✅ Staking artifact loaded successfully");

  // 部署staking合约
  console.log("Deploying Staking to zksync sepolia");
  const Staking = await deployer.deploy(stakingArtifact, [stakeTokenAddress]);
  await Staking.waitForDeployment();
  const stakingAddress = await Staking.getAddress();
  console.log(`✅ Staking deployed to zksync sepolia: ${stakingAddress}`);
  console.log(
    `🔍 View on explorer: https://sepolia.explorer.zksync.io/address/${stakingAddress}`
  );

  // 合并到同一部署文件，供 SDK / 前后端读取（一份 zkSyncSepolia.json 含 JessToken + Staking）
  deployments.Staking = stakingAddress;
  deployments.deployTime = new Date().toISOString();
  fs.writeFileSync(
    deploymentsPath,
    JSON.stringify(deployments, null, 2)
  );
  console.log(`✅ Staking address merged into ${deploymentsPath}`);
}
