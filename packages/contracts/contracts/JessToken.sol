// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract JessToken is Ownable2Step, ERC20Pausable, ERC20Permit {
    constructor(
        string memory name_,
        string memory symbol_
    ) Ownable(msg.sender) ERC20(name_, symbol_) ERC20Permit(name_) {
        // 初始供应量铸造给部署者
        _mint(msg.sender, 10000 * 10 ** decimals());
    }

    // 紧急暂停
    function pause() external onlyOwner {
        _pause();
    }

    // 恢复暂停
    function unpause() external onlyOwner {
        _unpause();
    }

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20Pausable, ERC20) {
        super._update(from, to, value);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}
