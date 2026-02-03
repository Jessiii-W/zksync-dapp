// packages/frontend/src/App.tsx
import { useState, useEffect } from "react";
import { ethers } from "ethers";
// @ts-expect-error - SDK 类型声明可能在构建后生成
import { JessTokenSDK } from "@zksync-dapp/sdk";
import axios from "axios";
import "./App.css";

// zkSync Sepolia链ID（十六进制，300 → 0x12c）
const ZKSYNC_SEPOLIA_CHAIN_ID = "0x12c";
// 后端API基础地址
const API_BASE_URL = "http://localhost:3001/api";

function App() {
  // 状态管理
  const [account, setAccount] = useState<string>("");
  const [balance, setBalance] = useState<string>("0");
  const [tokenName, setTokenName] = useState<string>("MyZkSyncToken");
  const [recipient, setRecipient] = useState<string>("");
  const [transferAmount, setTransferAmount] = useState<string>("");
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  // 初始化：获取代币信息+轮询转账记录
  useEffect(() => {
    const fetchInitData = async () => {
      // 获取代币信息
      try {
        const res = await axios.get(`${API_BASE_URL}/token-info`);
        setTokenName(res.data.data.name);
      } catch (err) {
        setError("Failed to load token info, please check backend server");
      }
      // 轮询转账记录（每2秒一次，Demo简化，企业级用WebSocket）
      const interval = setInterval(async () => {
        try {
          const res = await axios.get(`${API_BASE_URL}/transfers`);
          setTransfers(res.data.data);
        } catch (err) {
          setError("Failed to load transfer history");
        }
      }, 2000);
      // 清除定时器
      return () => clearInterval(interval);
    };
    fetchInitData();
  }, []);

  // 1. 连接MetaMask钱包（适配zkSync Sepolia）
  const connectWallet = async () => {
    setError("");
    // 检查MetaMask是否安装
    if (!window.ethereum) {
      setError("MetaMask is not installed! Please install it first.");
      return;
    }
    // 检查钱包是否切换到zkSync Sepolia
    const currentChainId = await window.ethereum.request({ method: "eth_chainId" });
    if (currentChainId !== ZKSYNC_SEPOLIA_CHAIN_ID) {
      setError("Please switch MetaMask to zkSync Sepolia Testnet!");
      return;
    }
    // 请求钱包授权
    try {
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const accounts = await provider.send("eth_requestAccounts", []);
      const userAccount = accounts[0];
      setAccount(userAccount);
      // 获取钱包余额
      const signer = await provider.getSigner();
      const sdk = new JessTokenSDK(signer);
      const userBalance = await sdk.getBalance(userAccount);
      setBalance(userBalance);
    } catch (err) {
      setError(`Failed to connect wallet: ${(err as Error).message}`);
    }
  };

  // 2. 发起转账（zkSync Sepolia）
  const transferToken = async () => {
    setError("");
    setLoading(true);
    // 校验参数
    if (!account || !recipient || !transferAmount || Number(transferAmount) <= 0) {
      setError("Please fill valid recipient and amount!");
      setLoading(false);
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();
      const sdk = new JessTokenSDK(signer);
      // 发起转账交易
      const tx = await sdk.transfer(recipient, transferAmount);
      await tx.wait(); // 等待交易上链
      // 刷新余额
      const newBalance = await sdk.getBalance(account);
      setBalance(newBalance);
      // 清空输入
      setRecipient("");
      setTransferAmount("");
      alert("✅ Transfer successful! View on zkSync Explorer.");
    } catch (err) {
      setError(`Transfer failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>{tokenName} (zkSync Sepolia)</h1>
        {/* 错误提示 */}
        {error && <p className="error">{error}</p>}
        {/* 连接钱包按钮 */}
        {!account ? (
          <button onClick={connectWallet} className="btn primary">
            Connect MetaMask (zkSync Sepolia)
          </button>
        ) : (
          <div className="wallet-section">
            {/* 钱包信息 */}
            <p className="account">
              Connected: {account.slice(0, 6)}...{account.slice(-4)}
            </p>
            <p className="balance">Balance: {Number(balance).toFixed(2)} JES</p>
            {/* 转账表单 */}
            <div className="transfer-form">
              <h3>Transfer Tokens</h3>
              <input
                type="text"
                placeholder="Recipient Address (zkSync)"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="input"
              />
              <input
                type="number"
                placeholder="Amount (JES)"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                min="0.0001"
                step="0.0001"
                className="input"
              />
              <button
                onClick={transferToken}
                disabled={loading}
                className="btn transfer"
              >
                {loading ? "Processing..." : "Transfer"}
              </button>
            </div>
            {/* 转账记录 */}
            <div className="transfer-history">
              <h3>Transfer History</h3>
              {transfers.length === 0 ? (
                <p className="empty">No transfers yet</p>
              ) : (
                <ul className="history-list">
                  {transfers.map((t, i) => (
                    <li key={i} className="history-item">
                      <span>{t.from.slice(0, 6)}... → {t.to.slice(0, 6)}...</span>
                      <span className="amount">{t.amount} JES</span>
                      <span className="time">{new Date(t.timestamp).toLocaleTimeString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </header>
    </div>
  );
}

export default App;