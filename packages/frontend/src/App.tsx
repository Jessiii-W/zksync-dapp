import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { JessTokenSDK, StakingSDK } from "@zksync-dapp/sdk";
import axios from "axios";
import "./App.css";

const ZKSYNC_SEPOLIA_CHAIN_ID = "0x12c";
const API_BASE_URL = "http://localhost:3001/api";

type Tab = "transfer" | "staking";

// 质押池信息（来自后端 API）
type StakingInfo = {
  totalStakedFormatted: string;
  rewardPoolFormatted: string;
} | null;

// 当前用户的质押信息（来自后端 API 或前端 SDK）
type UserStaking = {
  balanceFormatted: string;
  pendingRewardFormatted: string;
} | null;

function App() {
  const [account, setAccount] = useState<string>("");
  const [balance, setBalance] = useState<string>("0");
  const [tokenName, setTokenName] = useState<string>("JessToken");
  const [tab, setTab] = useState<Tab>("transfer");

  // 转账
  const [recipient, setRecipient] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transfers, setTransfers] = useState<Array<{ from: string; to: string; amount: string; timestamp: number }>>([]);

  // 质押
  const [stakingInfo, setStakingInfo] = useState<StakingInfo>(null);
  const [userStaking, setUserStaking] = useState<UserStaking>(null);
  const [stakeAmount, setStakeAmount] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchTokenInfo = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/token-info`);
        setTokenName(res.data.data.name);
      } catch {
        setError("Failed to load token info. Is server running?");
      }
    };
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/transfers`);
        setTransfers(res.data.data ?? []);
      } catch { }
    }, 2000);
    fetchTokenInfo();
    return () => clearInterval(interval);
  }, []);

  const fetchStakingInfo = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/staking/info`);
      setStakingInfo({
        totalStakedFormatted: res.data.data.totalStakedFormatted,
        rewardPoolFormatted: res.data.data.rewardPoolFormatted,
      });
    } catch {
      setStakingInfo(null);
    }
  }, []);

  useEffect(() => {
    fetchStakingInfo();
    const t = setInterval(fetchStakingInfo, 5000);
    return () => clearInterval(t);
  }, [fetchStakingInfo]);

  // 当前用户的质押数据：有 account 时从后端拉取
  const fetchUserStaking = useCallback(async (userAddress: string) => {
    try {
      const res = await axios.get(`${API_BASE_URL}/staking/user/${userAddress}`);
      setUserStaking({
        balanceFormatted: res.data.data.balanceFormatted,
        pendingRewardFormatted: res.data.data.pendingRewardFormatted,
      });
    } catch {
      setUserStaking(null);
    }
  }, []);

  useEffect(() => {
    if (account) fetchUserStaking(account);
    else setUserStaking(null);
  }, [account, fetchUserStaking]);

  const connectWallet = async () => {
    setError("");
    if (!window.ethereum) {
      setError("MetaMask is not installed.");
      return;
    }
    const currentChainId = await window.ethereum.request({ method: "eth_chainId" });
    if (currentChainId !== ZKSYNC_SEPOLIA_CHAIN_ID) {
      setError("Please switch to zkSync Sepolia Testnet.");
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const userAccount = accounts[0];
      setAccount(userAccount);
      const signer = await provider.getSigner();
      const jess = new JessTokenSDK(signer);
      const userBalance = await jess.getBalance(userAccount);
      setBalance(userBalance);
    } catch (err) {
      setError(`Connect failed: ${(err as Error).message}`);
    }
  };

  const refreshBalance = async () => {
    if (!account || !window.ethereum) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const jess = new JessTokenSDK(signer);
      setBalance(await jess.getBalance(account));
    } catch { }
  };

  const transferToken = async () => {
    setError("");
    if (!account || !recipient || !transferAmount || Number(transferAmount) <= 0) {
      setError("Please fill valid recipient and amount.");
      return;
    }
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();
      const jess = new JessTokenSDK(signer);
      const tx = await jess.transfer(recipient, transferAmount);
      await tx.wait();
      await refreshBalance();
      setRecipient("");
      setTransferAmount("");
      alert("Transfer successful.");
    } catch (err) {
      setError(`Transfer failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const stake = async () => {
    setError("");
    if (!account || !stakeAmount || Number(stakeAmount) <= 0) {
      setError("Please enter a valid amount to stake.");
      return;
    }
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();
      const jess = new JessTokenSDK(signer);
      const staking = new StakingSDK(signer);
      const stakingAddress = staking.getContractAddress();
      const currentAllowance = await jess.allowance(account, stakingAddress);
      if (Number(currentAllowance) < Number(stakeAmount)) {
        const approveTx = await jess.approve(stakingAddress, stakeAmount);
        await approveTx.wait();
      }
      const tx = await staking.stake(stakeAmount);
      await tx.wait();
      await refreshBalance();
      await fetchUserStaking(account);
      await fetchStakingInfo();
      setStakeAmount("");
      alert("Stake successful.");
    } catch (err) {
      setError(`Stake failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const unstake = async () => {
    setError("");
    if (!account) return;
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();
      const staking = new StakingSDK(signer);
      const tx = await staking.unstake();
      await tx.wait();
      await refreshBalance();
      setUserStaking(null);
      await fetchStakingInfo();
      alert("Unstake successful.");
    } catch (err) {
      setError(`Unstake failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const claimReward = async () => {
    setError("");
    if (!account) return;
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();
      const staking = new StakingSDK(signer);
      const tx = await staking.claimReward();
      await tx.wait();
      await refreshBalance();
      await fetchUserStaking(account);
      await fetchStakingInfo();
      alert("Claim reward successful.");
    } catch (err) {
      setError(`Claim failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>{tokenName} (zkSync Sepolia)</h1>
        {error && <p className="error">{error}</p>}

        {!account ? (
          <button onClick={connectWallet} className="btn primary">
            Connect MetaMask (zkSync Sepolia)
          </button>
        ) : (
          <div className="wallet-section">
            <p className="account">
              Connected: {account.slice(0, 6)}...{account.slice(-4)}
            </p>
            <p className="balance">JES Balance: {Number(balance).toFixed(4)}</p>

            <div className="tabs">
              <button
                className={`tab ${tab === "transfer" ? "active" : ""}`}
                onClick={() => setTab("transfer")}
              >
                Transfer
              </button>
              <button
                className={`tab ${tab === "staking" ? "active" : ""}`}
                onClick={() => setTab("staking")}
              >
                Staking
              </button>
            </div>

            {tab === "transfer" && (
              <div className="transfer-form">
                <h3>Transfer JES</h3>
                <input
                  type="text"
                  placeholder="Recipient address"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="input"
                />
                <input
                  type="number"
                  placeholder="Amount (JES)"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  min="0"
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

            {tab === "staking" && (
              <div className="staking-section">
                <h3>Staking Pool (read from API)</h3>
                {stakingInfo ? (
                  <p className="pool-info">
                    Total Staked: <strong>{stakingInfo.totalStakedFormatted}</strong> JES · Reward Pool: <strong>{stakingInfo.rewardPoolFormatted}</strong> JES
                  </p>
                ) : (
                  <p className="empty">Failed to load pool info. Is Staking contract deployed?</p>
                )}

                <h3>Your Staking (read from API)</h3>
                {userStaking ? (
                  <p className="pool-info">
                    Staked: <strong>{userStaking.balanceFormatted}</strong> JES · Pending Reward: <strong>{userStaking.pendingRewardFormatted}</strong> JES
                  </p>
                ) : (
                  <p className="empty">No stake or load failed.</p>
                )}

                <div className="transfer-form">
                  <input
                    type="number"
                    placeholder="Amount to stake (JES)"
                    value={stakeAmount}
                    onChange={(e) => setStakeAmount(e.target.value)}
                    min="0"
                    step="0.0001"
                    className="input"
                  />
                  <button onClick={stake} disabled={loading} className="btn staking-btn">
                    {loading ? "..." : "Stake"}
                  </button>
                  <button onClick={claimReward} disabled={loading || !userStaking || Number(userStaking.pendingRewardFormatted) <= 0} className="btn staking-btn claim">
                    Claim Reward
                  </button>
                  <button onClick={unstake} disabled={loading || !userStaking || Number(userStaking.balanceFormatted) <= 0} className="btn staking-btn unstake">
                    Unstake All
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </header>
    </div>
  );
}

export default App;
