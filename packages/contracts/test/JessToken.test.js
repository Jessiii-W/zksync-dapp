const { expect } = require("chai");
const { ethers } = require("hardhat");

const NAME = "JessToken";
const SYMBOL = "JES";
const INITIAL_SUPPLY = ethers.parseEther("10000");

describe("JessToken (zkSync ERC20)", function () {
  let jessToken;
  let owner;
  let user1;
  let user2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    const JessToken = await ethers.getContractFactory("JessToken");
    jessToken = await JessToken.deploy(NAME, SYMBOL);
    await jessToken.waitForDeployment();
  });

  describe("部署与基础信息", function () {
    it("应将初始供应量铸造给部署者", async function () {
      const ownerBalance = await jessToken.balanceOf(owner.address);
      expect(ownerBalance).to.equal(INITIAL_SUPPLY);
    });

    it("应有正确的 name 和 symbol", async function () {
      expect(await jessToken.name()).to.equal(NAME);
      expect(await jessToken.symbol()).to.equal(SYMBOL);
    });

    it("应在账户间正常转账", async function () {
      await jessToken.transfer(user1.address, ethers.parseEther("100"));
      expect(await jessToken.balanceOf(user1.address)).to.equal(
        ethers.parseEther("100")
      );
    });
  });

  describe("Pausable", function () {
    it("仅 owner 可调用 pause", async function () {
      await jessToken.pause();
      await expect(
        jessToken.transfer(user1.address, 1)
      ).to.be.revertedWithCustomError(jessToken, "EnforcedPause");
    });

    it("pause 后 unpause 可恢复转账", async function () {
      await jessToken.pause();
      await jessToken.unpause();
      await jessToken.transfer(user1.address, ethers.parseEther("100"));
      expect(await jessToken.balanceOf(user1.address)).to.equal(
        ethers.parseEther("100")
      );
    });

    it("非 owner 调用 pause 应 revert", async function () {
      await expect(
        jessToken.connect(user1).pause()
      ).to.be.revertedWithCustomError(jessToken, "OwnableUnauthorizedAccount");
    });

    it("非 owner 调用 unpause 应 revert", async function () {
      await jessToken.pause();
      await expect(
        jessToken.connect(user1).unpause()
      ).to.be.revertedWithCustomError(jessToken, "OwnableUnauthorizedAccount");
    });
  });

  describe("Mint / Burn", function () {
    it("仅 owner 可 mint", async function () {
      const amount = ethers.parseEther("500");
      await jessToken.mint(user1.address, amount);
      expect(await jessToken.balanceOf(user1.address)).to.equal(amount);
    });

    it("非 owner 调用 mint 应 revert", async function () {
      await expect(
        jessToken.connect(user1).mint(user2.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(jessToken, "OwnableUnauthorizedAccount");
    });

    it("仅 owner 可 burn", async function () {
      await jessToken.transfer(user1.address, ethers.parseEther("100"));
      await jessToken.burn(user1.address, ethers.parseEther("50"));
      expect(await jessToken.balanceOf(user1.address)).to.equal(
        ethers.parseEther("50")
      );
    });

    it("非 owner 调用 burn 应 revert", async function () {
      await jessToken.transfer(user1.address, ethers.parseEther("100"));
      await expect(
        jessToken.connect(user1).burn(user1.address, ethers.parseEther("50"))
      ).to.be.revertedWithCustomError(jessToken, "OwnableUnauthorizedAccount");
    });
  });

  describe("Ownable2Step", function () {
    it("transferOwnership 后需新 owner 调用 acceptOwnership", async function () {
      expect(await jessToken.owner()).to.equal(owner.address);
      await jessToken.transferOwnership(user1.address);
      expect(await jessToken.owner()).to.equal(owner.address);
      expect(await jessToken.pendingOwner()).to.equal(user1.address);
      await jessToken.connect(user1).acceptOwnership();
      expect(await jessToken.owner()).to.equal(user1.address);
    });

    it("仅 pendingOwner 可调用 acceptOwnership", async function () {
      await jessToken.transferOwnership(user1.address);
      await expect(
        jessToken.connect(user2).acceptOwnership()
      ).to.be.revertedWithCustomError(jessToken, "OwnableUnauthorizedAccount");
    });
  });

  describe("ERC20Permit", function () {
    it("应暴露 DOMAIN_SEPARATOR", async function () {
      const domainSeparator = await jessToken.DOMAIN_SEPARATOR();
      expect(
        ethers.isHexString(domainSeparator) && domainSeparator.length === 66
      ).to.be.true;
    });

    it("nonces 初始为 0，permit 后递增", async function () {
      expect(await jessToken.nonces(owner.address)).to.equal(0);
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const value = ethers.parseEther("100");
      const nonce = 0;
      const domain = {
        name: NAME,
        version: "1",
        chainId,
        verifyingContract: await jessToken.getAddress(),
      };
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const message = {
        owner: owner.address,
        spender: user1.address,
        value,
        nonce,
        deadline,
      };
      const signature = await owner.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);
      await jessToken.permit(
        owner.address,
        user1.address,
        value,
        deadline,
        v,
        r,
        s
      );
      expect(await jessToken.allowance(owner.address, user1.address)).to.equal(
        value
      );
      expect(await jessToken.nonces(owner.address)).to.equal(1);
    });

    it("permit 后 spender 可 transferFrom", async function () {
      const value = ethers.parseEther("50");
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = await jessToken.nonces(owner.address);
      const domain = {
        name: NAME,
        version: "1",
        chainId,
        verifyingContract: await jessToken.getAddress(),
      };
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const message = {
        owner: owner.address,
        spender: user1.address,
        value,
        nonce,
        deadline,
      };
      const signature = await owner.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);
      await jessToken.permit(
        owner.address,
        user1.address,
        value,
        deadline,
        v,
        r,
        s
      );
      await jessToken
        .connect(user1)
        .transferFrom(owner.address, user2.address, value);
      expect(await jessToken.balanceOf(user2.address)).to.equal(value);
    });

    it("过期 deadline 的 permit 应 revert", async function () {
      const value = ethers.parseEther("100");
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const deadline = Math.floor(Date.now() / 1000) - 1; // 已过期
      const nonce = await jessToken.nonces(owner.address);
      const domain = {
        name: NAME,
        version: "1",
        chainId,
        verifyingContract: await jessToken.getAddress(),
      };
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const message = {
        owner: owner.address,
        spender: user1.address,
        value,
        nonce,
        deadline,
      };
      const signature = await owner.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);
      await expect(
        jessToken.permit(owner.address, user1.address, value, deadline, v, r, s)
      ).to.be.revertedWithCustomError(jessToken, "ERC2612ExpiredSignature");
    });
  });
});
