// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @dev The RewardTresury contract stores the tokens to be sent as reward
 * for the StakePool.
 */
contract RewardTreasury is Ownable {
    using SafeERC20 for IERC20;

    /// @dev The token in which rewards are distributed
    IERC20 public token;

    /**
     * @dev Initializes state variables.
     */
    constructor(IERC20 token_) {
        token = token_;
    }

    /**
     * @dev Transfers the reward to user's wallet.
     */
    function sendReward(address to, uint256 amount) external onlyOwner {
        token.safeTransfer(to, amount);
    }
}
