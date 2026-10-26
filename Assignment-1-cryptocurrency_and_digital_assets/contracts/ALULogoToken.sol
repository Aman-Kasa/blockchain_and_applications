// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title  ALULogoToken (ALUT)
/// @notice ERC-20 token representing fractional ownership shares of the ALU logo.
///         Fixed supply of 1,000,000 shares, all minted to the logo owner at deployment.
/// @dev    decimals() is set to 0 so each token is one whole, indivisible share.
///         This keeps balances and percentages easy to read (1 token = 0.0001%).
contract ALULogoToken is ERC20, Ownable {
    /// @notice Fixed total number of ownership shares.
    uint256 public constant TOTAL_SUPPLY = 1_000_000;

    /// @notice Emitted when the owner distributes shares to a stakeholder.
    event SharesDistributed(address indexed recipient, uint256 amount);

    /// @param logoOwner Wallet that receives the full supply and becomes contract owner.
    constructor(address logoOwner)
        ERC20("ALU Logo Token", "ALUT")
        Ownable(logoOwner) // OpenZeppelin v5: owner must be passed explicitly
    {
        _mint(logoOwner, TOTAL_SUPPLY); // no other mint function exists, so supply is fixed
    }

    /// @notice Shares are whole units, so the token has 0 decimals.
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    /// @notice Transfer ownership shares from the owner to a stakeholder.
    /// @dev    Only the contract owner can call this.
    /// @param recipient Wallet receiving the shares.
    /// @param amount    Number of ALUT shares to transfer.
    function distributeShares(address recipient, uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be greater than zero");
        require(recipient != address(0), "Invalid recipient");
        _transfer(owner(), recipient, amount); // reverts if owner has insufficient balance
        emit SharesDistributed(recipient, amount);
    }

    /// @notice Ownership percentage of a wallet as a whole number (e.g. 500,000 tokens => 50).
    /// @dev    Integer division rounds down, so holdings below 1% return 0.
    function ownershipPercentage(address account) external view returns (uint256) {
        return (balanceOf(account) * 100) / totalSupply();
    }
}
