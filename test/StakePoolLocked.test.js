const { expect } = require('chai');
const { BN, time, expectRevert, expectEvent } = require('@openzeppelin/test-helpers');
const StakePool = artifacts.require('StakePool');
const MockToken = artifacts.require('MockToken');

contract('StakePoolLocked', accounts => {
    const [owner, bob, alice, nonOwner] = accounts;
    const rewardPerBlock = new BN('2000');
    const lockingPeriodBlock = new BN('100');

    beforeEach(async () => {
        this.stakeToken = await MockToken.new('Stake Token', 'STK', '1000000000', {from: owner});
        this.rewardToken = await MockToken.new('Reward Token', 'RWD', '1000000000', {from: owner});

        const latestBlock = await time.latestBlock();

        this.startBlock = latestBlock;
        this.endBlock = this.startBlock.add(new BN('500'));

        this.pool = await StakePool.new(
            this.stakeToken.address,
            this.rewardToken.address,
            this.startBlock,
            this.endBlock,
            rewardPerBlock,
            lockingPeriodBlock,
            {from: owner}
        );

        this.rewardTreasuryAddress = await this.pool.rewardTreasury();

        this.amount = new BN('1000');
        const totalReward = this.endBlock.sub(this.startBlock).mul(rewardPerBlock);
        await this.rewardToken.approve(this.pool.address, totalReward, {from: owner});
        await this.pool.addRewardTokens(totalReward, {from: owner});
    });


    it('should deposit with locking period', async () => {
        await this.stakeToken.transfer(bob, this.amount, {from: owner});
        await this.stakeToken.approve(this.pool.address, this.amount, {from: bob});
        const result = await this.pool.deposit(this.amount, {from: bob});
        expectEvent(result, 'Deposit', {user: bob, amount: this.amount});
        const userInfo = await this.pool.usersInfo(bob);
        expect(userInfo.amount).to.be.bignumber.equal(this.amount);
        const stakingStartBlock = new BN(result.receipt.blockNumber);
        expect(userInfo.stakingStartBlock).to.be.bignumber.equal(stakingStartBlock);
        const totalStakedTokens = await this.pool.totalStakedTokens();
        expect(totalStakedTokens).to.be.bignumber.equal(this.amount);
    });

    describe('after deposit with locking period', () => {

        beforeEach(async () => {
            await this.stakeToken.transfer(bob, this.amount, {from: owner});
            await this.stakeToken.approve(this.pool.address, this.amount, {from: bob});
            const result = await this.pool.deposit(this.amount, {from: bob});
            this.depositBlock = new BN(result.receipt.blockNumber);
        });

        it('reverts when withdrawing before locking period', async () => {
            await expectRevert(
                this.pool.withdraw(this.amount, {from: bob}),
                'Pool: lock period not over yet'
            );
        });

        it('reverts when emergency withdrawing before locking period', async () => {
            await expectRevert(
                this.pool.emergencyWithdraw({from: bob}),
                'Pool: lock period not over yet'
            );
        });

        describe('stop giving rewards after locking period ends', () => {

            beforeEach(async () => {
                const latestBlock = await time.latestBlock();
                const actualLockingPeriodBlock = await this.pool.lockingPeriodBlock();
                await time.advanceBlockTo(latestBlock.add(actualLockingPeriodBlock.add(new BN('1'))));
            });

            it('compare 2 user rewards after locking period ends', async () => {
                const actualReward = await this.pool.getPendingReward(bob);
                const actualBlock = await time.latestBlock();
                await time.advanceBlockTo(actualBlock.add(new BN('100')));
                const futureReward = await this.pool.getPendingReward(bob);
                expect(actualReward).to.be.bignumber.equal(futureReward);
            });
        });

        describe('withdraw after locking period', () => {

            beforeEach(async () => {
                const latestBlock = await time.latestBlock();
                const actualLockingPeriodBlock = await this.pool.lockingPeriodBlock();
                await time.advanceBlockTo(latestBlock.add(actualLockingPeriodBlock));
            });

            it('should withdraw tokens and automatically claim pending reward', async () => {
                const result = await this.pool.withdraw(this.amount, {from: bob});
                expectEvent(result, 'Withdraw', {user: bob, amount: this.amount});
                const balance = await this.stakeToken.balanceOf(bob);
                expect(balance).to.be.bignumber.equal(this.amount);
                const userInfo = await this.pool.usersInfo(bob);
                expect(userInfo.amount).to.be.bignumber.equal('0');
                expect(userInfo.stakingStartBlock).to.be.bignumber.equal('0');
                const totalStakedTokens = await this.pool.totalStakedTokens();
                expect(totalStakedTokens).to.be.bignumber.equal('0');
                const claimBlock = new BN(result.receipt.blockNumber);
                const elapsedBlocks = claimBlock.sub(this.depositBlock);
                const expectedReward = elapsedBlocks.mul(rewardPerBlock);
                const actualReward = await this.rewardToken.balanceOf(bob);
                expect(actualReward).to.be.bignumber.equal(expectedReward);
            });

            it('should perform an emergency withdraw', async () => {
                const result = await this.pool.emergencyWithdraw({from: bob});
                expectEvent(result, 'EmergencyWithdraw', {user: bob, amount: this.amount});
                const balance = await this.stakeToken.balanceOf(bob);
                expect(balance).to.be.bignumber.equal(this.amount);
                const userInfo = await this.pool.usersInfo(bob);
                expect(userInfo.amount).to.be.bignumber.equal('0');
                expect(userInfo.stakingStartBlock).to.be.bignumber.equal('0');
                const pendingReward = await this.pool.getPendingReward(bob);
                expect(pendingReward).to.be.bignumber.equal('0');
                const sentReward = await this.rewardToken.balanceOf(bob);
                expect(sentReward).to.be.bignumber.equal('0');
            });
        });
    });
});