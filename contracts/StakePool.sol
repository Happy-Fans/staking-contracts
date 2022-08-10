// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { RewardTreasury } from "./RewardTreasury.sol";

/**
 * @dev The StakePool contract allows users to stake tokens in exchange for rewards.
 * Rewards can be distributed in any token, be it the same token that is being staked
 * or another one.
 *
 * A fixed number of reward tokens is distributed every block.
 * This amount can be updated anytime by the contract owner and the update will
 * be effective from the next block.
 *
 * The amount of reward entitled to each user is calculated based on its
 * weight in the pool.
 *
 * The pool opens at a specific start block.
 * After the start block is reached, users will be able to {deposit} stake tokens.
 * To receive all the accrued rewards to their wallet, they can call the {claimReward} function.
 *
 * When the end block is reached, no more rewards will be distributed and deposits will be disabled.
 * Staked tokens are still withdrawable through the {widthdraw} function and pending reward can still be claimed.
 *
 * Every time tokens are deposited or withdrawn, all the pending rewards are automatically sent to user's wallet.
 */
contract StakePool is Ownable {
    using SafeERC20 for IERC20;

    /// @dev Info of each user.
    struct UserInfo {
        // How many `stakeTokens` the user has provided.
        uint256 amount;
        // Reward debt. See explanation below.
        uint256 rewardDebt;
        // Block that save the start of user's staking period.
        uint256 stakingStartBlock;
        //
        // Any point in time, the amount of reward tokens entitled to a user
        // but is pending to be distributed is:
        //
        //   pendingReward = (user.amount * pool.accRewardPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws tokens to the pool:
        //   1. The `accRewardPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    /// @dev The token to be staked.
    IERC20 public stakeToken;
    /// @dev The token in which rewards are distributed.
    IERC20 public rewardToken;
    /// @dev The treasury contract that holds the reward tokens to be distributed.
    RewardTreasury public rewardTreasury;
    /// @dev The most recent block up to which the rewards have been calculated.
    uint256 public lastRewardBlock;
    /// @dev Accumulated reward per share, times 1e12. See explanation above.
    uint256 public accRewardPerShare;
    /// @dev The total amount of tokens staked.
    uint256 public totalStakedTokens;
    /// @dev The block when reward distribution starts.
    uint256 public startBlock;
    /// @dev The block when reward distribution ends.
    uint256 public endBlock;
    /// @dev Reward tokens to be distributed per block.
    uint256 public rewardPerBlock;
    /// @dev Duration of locking period in blocks.
    uint256 public lockingPeriodBlock;
    /// @dev Info of each user that stakes tokens.
    mapping (address => UserInfo) public usersInfo;

    /// @dev Emitter when `user` deposits some tokens.
    event Deposit(address indexed user, uint256 amount);
    /// @dev Emitter when `user` withdraws some tokens.
    event Withdraw(address indexed user, uint256 amount);
    /// @dev Emitter when `user` claims the accrues rewards.
    event RewardClaim(address indexed user, uint256 amount);
    /// @dev Emitter when `user` performs an emergency withdraw.
    event EmergencyWithdraw(address indexed user, uint256 amount);

    /**
     * @dev Initializes state variables.
     */
    constructor(
        IERC20 stakeToken_,
        IERC20 rewardToken_,
        uint256 startBlock_,
        uint256 endBlock_,
        uint256 rewardPerBlock_,
        uint256 lockingPeriodBlock_
    ) {
        stakeToken = stakeToken_;
        rewardToken = rewardToken_;
        startBlock = startBlock_;
        endBlock = endBlock_;
        rewardPerBlock = rewardPerBlock_;
        lockingPeriodBlock = lockingPeriodBlock_;
        rewardTreasury = new RewardTreasury(rewardToken_);
    }

    //TODO Remove before deploy
    function setLockingPeriodInBlock(uint256 lockingPeriodBlock_) external onlyOwner {
        lockingPeriodBlock = lockingPeriodBlock_;
    }

    /**
        * @dev Get the user staking locked end_block.
     */
    function getStakingEndBlock(address user) public view returns(uint256 stakingEndBlock) {
        UserInfo storage userInfo = usersInfo[user];

        if (userInfo.stakingStartBlock > 0) {
            stakingEndBlock = userInfo.stakingStartBlock + lockingPeriodBlock;
        } else {
            stakingEndBlock = 0;
        }

        return stakingEndBlock;
    }

    /**
     * @dev Adds reward tokens to the `rewardTreasury`.
     */
    function addRewardTokens(uint256 amount) external {
        rewardToken.safeTransferFrom(msg.sender, address(rewardTreasury), amount);
    }

    /**
     * @dev Removes reward tokens from the `rewardTreasury`.
     *
     * Requirements:
     *
     * - caller must be the owner.
     */
    function removeRewardTokens(uint256 amount) external onlyOwner {
        rewardTreasury.sendReward(msg.sender, amount);
    }

    /**
     * @dev Updates the reward distributed for each block.
     *
     * Requirements:
     *
     * - caller must be the owner.
     */
    function setRewardPerBlock(uint256 rewardPerBlock_) external onlyOwner {
        _updatePool();

        rewardPerBlock = rewardPerBlock_;
    }

    /**
     * @dev Updates the block when reward distribution ends.
     *
     * Requirements:
     *
     * - caller must be the owner.
     */
    function setEndBlock(uint256 endBlock_) external onlyOwner {
        require(endBlock_ >= block.number, "Pool: new endBlock is in the past");

        _updatePool();

        if (endBlock < block.number) {
            lastRewardBlock = block.number;
        }

        endBlock = endBlock_;
    }

    /**
     * @dev Deposits tokens.
     *
     * Pending reward will be automatically sent to user's wallet.
     */
    function deposit(uint256 amount) external {
        require(amount > 0, "Pool: deposit amount is zero");
        require(block.number >= startBlock, "Pool: pool is not open yet");
        require(block.number < endBlock, "Pool: pool is already closed");

        UserInfo storage userInfo = usersInfo[msg.sender];

        _updatePool();

        if (userInfo.amount > 0) {
            _sendReward(msg.sender);
        }

        userInfo.amount += amount;

        if (lockingPeriodBlock > 0) {
            userInfo.stakingStartBlock = block.number;
        }

        userInfo.rewardDebt = userInfo.amount * accRewardPerShare / 1e12;
        totalStakedTokens += amount;
        stakeToken.safeTransferFrom(msg.sender, address(this), amount);

        emit Deposit(msg.sender, amount);
    }

    /**
     * @dev Withdraws tokens.
     *
     * Pending reward will be automatically sent to user's wallet.
     */
    function withdraw(uint256 amount) external {
        require(amount > 0, "Pool: withdraw amount is zero");

        UserInfo storage userInfo = usersInfo[msg.sender];

        if (lockingPeriodBlock > 0) {
            uint256 stakingEndBlock = getStakingEndBlock(msg.sender);
            require(stakingEndBlock <= block.number, "Pool: lock period not over yet");
        }
        require(userInfo.amount >= amount, "Pool: not enough staked tokens");

        _updatePool();
        _sendReward(msg.sender);

        userInfo.amount -= amount;
        userInfo.rewardDebt = userInfo.amount * accRewardPerShare / 1e12;
        if ( userInfo.amount == 0 && userInfo.rewardDebt == 0 && userInfo.stakingStartBlock != 0) {
            userInfo.stakingStartBlock = 0;
        }
        totalStakedTokens -= amount;

        stakeToken.safeTransfer(msg.sender, amount);

        emit Withdraw(msg.sender, amount);
    }

    /**
 * @dev Withdraws all tokens without caring about the reward.
     *
     * Only for emergencies.
     */
    function emergencyWithdraw() external {
        UserInfo storage userInfo = usersInfo[msg.sender];

        if (lockingPeriodBlock > 0) {
            uint256 stakingEndBlock = getStakingEndBlock(msg.sender);
            require(stakingEndBlock <= block.number, "Pool: lock period not over yet");
        }
        require(userInfo.amount > 0, "Pool: nothing to withdraw");

        uint256 amount = userInfo.amount;

        userInfo.amount = 0;
        userInfo.rewardDebt = 0;
        userInfo.stakingStartBlock = 0;
        totalStakedTokens -= amount;

        stakeToken.safeTransfer(msg.sender, amount);

        emit EmergencyWithdraw(msg.sender, amount);
    }

    /**
     * @dev Sends all the accrued reward to user's wallet.
     */

    function claimReward() external {
        UserInfo storage userInfo = usersInfo[msg.sender];

        require(userInfo.amount > 0, "Pool: no staked token");

        _updatePool();
        _sendReward(msg.sender);
    }

    /**
     * @dev Returns the amount of pending reward to be claimed.
     */
    function getPendingReward(address user) public view returns (uint256) {
        UserInfo storage userInfo = usersInfo[user];

        uint256 lastProfitableBlock = block.number > endBlock ? endBlock : block.number;
        uint256 currentAccRewardPerShare = accRewardPerShare;

        if (lockingPeriodBlock > 0) {
            uint256 stakingEndBlock = getStakingEndBlock(user);
            lastProfitableBlock = lastProfitableBlock > stakingEndBlock ? stakingEndBlock : lastProfitableBlock;
        }

        if (lastProfitableBlock > lastRewardBlock && totalStakedTokens != 0) {
            uint256 elapsedBlocks = lastProfitableBlock - lastRewardBlock;
            uint256 reward = rewardPerBlock * elapsedBlocks;

            currentAccRewardPerShare = accRewardPerShare + reward * 1e12 / totalStakedTokens;
        }

        return userInfo.amount * currentAccRewardPerShare / 1e12 - userInfo.rewardDebt;
    }

    /**
     * @dev Updated contract variables to be up-to-date.
     */
    function _updatePool() internal {
        uint256 lastProfitableBlock = block.number > endBlock ? endBlock : block.number;

        if (lastProfitableBlock <= lastRewardBlock) {
            return;
        }

        if (totalStakedTokens == 0) {
            lastRewardBlock = lastProfitableBlock;
            return;
        }

        uint256 elapsedBlocks = lastProfitableBlock - lastRewardBlock;
        uint256 reward = rewardPerBlock * elapsedBlocks;

        accRewardPerShare += reward * 1e12 / totalStakedTokens;
        lastRewardBlock = lastProfitableBlock;
    }

    /**
     * @dev Internal function to send all the accrued reward to user's wallet.
     *
     * [WARNING]
     * The pool must be updated with {_updatePool} before calling this function.
     */
    function _sendReward(address user) internal {
        uint256 pendingReward = getPendingReward(user);

        if (pendingReward > 0) {
            UserInfo storage userInfo = usersInfo[user];
            userInfo.rewardDebt = userInfo.amount * accRewardPerShare / 1e12;

            rewardTreasury.sendReward(user, pendingReward);

            emit RewardClaim(user, pendingReward);
        }
    }
}
