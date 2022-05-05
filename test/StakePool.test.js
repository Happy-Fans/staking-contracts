const { expect } = require('chai');
const { BN, time, expectRevert, expectEvent } = require('@openzeppelin/test-helpers');
const StakePool = artifacts.require('StakePool');
const MockToken = artifacts.require('MockToken');

contract('StakePool', accounts => {
  const [owner, bob, alice, nonOwner] = accounts;
  const rewardPerBlock = new BN('2000');
  const lockingPeriodBlock = new BN('0');

  beforeEach(async () => {
    this.stakeToken = await MockToken.new('Stake Token', 'STK', '1000000000', { from: owner });
    this.rewardToken = await MockToken.new('Reward Token', 'RWD', '1000000000', { from: owner });

    const latestBlock = await time.latestBlock();

    this.startBlock = latestBlock.add(new BN('50'));
    this.endBlock = this.startBlock.add(new BN('100'));

    this.pool = await StakePool.new(
      this.stakeToken.address,
      this.rewardToken.address,
      this.startBlock,
      this.endBlock,
      rewardPerBlock,
      lockingPeriodBlock,
      { from: owner }
    );

    this.rewardTreasuryAddress = await this.pool.rewardTreasury();
  });

  it('should add reward tokens', async () => {
    const totalReward = this.endBlock.sub(this.startBlock).mul(rewardPerBlock);
    await this.rewardToken.approve(this.pool.address, totalReward, { from: owner });
    await this.pool.addRewardTokens(totalReward, { from: owner });
    const rewardTreasuryBalance = await this.rewardToken.balanceOf(this.rewardTreasuryAddress);
    expect(rewardTreasuryBalance).to.be.bignumber.equal(totalReward);
  });

  describe('after adding reward', () => {
    beforeEach(async () => {
      this.totalReward = this.endBlock.sub(this.startBlock).mul(rewardPerBlock);
      await this.rewardToken.approve(this.pool.address, this.totalReward, { from: owner });
      await this.pool.addRewardTokens(this.totalReward, { from: owner });
    });

    it('should remove reward tokens', async () => {
      const initialOwnerBalance = await this.rewardToken.balanceOf(owner);
      const initialTreasuryBalance = await this.rewardToken.balanceOf(this.rewardTreasuryAddress);
      await this.pool.removeRewardTokens(this.totalReward, { from: owner });
      const finalOwnerBalance = await this.rewardToken.balanceOf(owner);
      const finalTreasuryBalance = await this.rewardToken.balanceOf(this.rewardTreasuryAddress);
      expect(finalOwnerBalance).to.be.bignumber.equal(initialOwnerBalance.add(this.totalReward));
      expect(finalTreasuryBalance).to.be.bignumber.equal(initialTreasuryBalance.sub(this.totalReward));
    });

    it('reverts when removing reward tokens from non-owner', async () => {
      await expectRevert(
        this.pool.removeRewardTokens(this.totalReward, { from: nonOwner }),
        'Ownable: caller is not the owner'
      );
    });

    describe('before startBlock', () => {
      it('reverts when depositing', async () => {
        await expectRevert(
          this.pool.deposit('1000', { from: bob }),
          'Pool: pool is not open yet'
        );
      });
    });

    describe('after startBlock', () => {
      beforeEach(async () => {
        await time.advanceBlockTo(this.startBlock);
      });

      it('should deposit', async () => {
        const amount = new BN('1000');
        await this.stakeToken.transfer(bob, amount, { from: owner });
        await this.stakeToken.approve(this.pool.address, amount, { from: bob });
        const result = await this.pool.deposit(amount, { from: bob });
        expectEvent(result, 'Deposit', { user: bob, amount: amount });
        const userInfo = await this.pool.usersInfo(bob);
        expect(userInfo.amount).to.be.bignumber.equal(amount);
        const totalStakedTokens = await this.pool.totalStakedTokens();
        expect(totalStakedTokens).to.be.bignumber.equal(amount);
      });

      it('reverts when depositing a zero amount', async () => {
        await expectRevert(
          this.pool.deposit('0', { from: bob }),
          'Pool: deposit amount is zero'
        );
      });

      it('reverts when withdrawing before deposit', async () => {
        await expectRevert(
          this.pool.withdraw('1000', { from: bob }),
          'Pool: not enough staked tokens'
        );
      });

      it('reverts when performing an emergency withdraw before deposit', async () => {
        await expectRevert(
          this.pool.emergencyWithdraw({ from: bob }),
          'Pool: nothing to withdraw'
        );
      });

      it('reverts when claiming reward before deposit', async () => {
        await expectRevert(
          this.pool.claimReward({ from: bob }),
          'Pool: no staked token'
        );
      });

      describe('after deposit', () => {
        beforeEach(async () => {
          this.amount = new BN('1000');
          await this.stakeToken.transfer(bob, this.amount, { from: owner });
          await this.stakeToken.approve(this.pool.address, this.amount, { from: bob });
          const result = await this.pool.deposit(this.amount, { from: bob });
          this.depositBlock = new BN(result.receipt.blockNumber);

          const latestBlock = await time.latestBlock();
          await time.advanceBlockTo(latestBlock.add(new BN('20')));
        });

        it('should get pending reward', async () => {
          const latestBlock = await time.latestBlock();
          const elapsedBlocks = latestBlock.sub(this.depositBlock);
          const expectedReward = elapsedBlocks.mul(rewardPerBlock);
          const actualReward = await this.pool.getPendingReward(bob);
          expect(actualReward).to.be.bignumber.equal(expectedReward);
        });

        it('should claim pending reward', async () => {
          const result = await this.pool.claimReward({ from: bob });
          const claimBlock = new BN(result.receipt.blockNumber);
          const elapsedBlocks = claimBlock.sub(this.depositBlock);
          const expectedReward = elapsedBlocks.mul(rewardPerBlock);
          const actualReward = await this.rewardToken.balanceOf(bob);
          expect(actualReward).to.be.bignumber.equal(expectedReward);
          expectEvent(result, 'RewardClaim', { user: bob, amount: expectedReward });
        });

        it('should deposit more tokens and automatically claim pending reward', async () => {
          const newDepositAmount = new BN('500');
          await this.stakeToken.transfer(bob, newDepositAmount, { from: owner });
          await this.stakeToken.approve(this.pool.address, newDepositAmount, { from: bob });
          const result = await this.pool.deposit(newDepositAmount, { from: bob });
          const userInfo = await this.pool.usersInfo(bob);
          expect(userInfo.amount).to.be.bignumber.equal(this.amount.add(newDepositAmount));
          const totalStakedTokens = await this.pool.totalStakedTokens();
          expect(totalStakedTokens).to.be.bignumber.equal(this.amount.add(newDepositAmount));
          const claimBlock = new BN(result.receipt.blockNumber);
          const elapsedBlocks = claimBlock.sub(this.depositBlock);
          const expectedReward = elapsedBlocks.mul(rewardPerBlock);
          const actualReward = await this.rewardToken.balanceOf(bob);
          expect(actualReward).to.be.bignumber.equal(expectedReward);
        });

        it('should withdraw tokens and automatically claim pending reward', async () => {
          const result = await this.pool.withdraw(this.amount, { from: bob });
          expectEvent(result, 'Withdraw', { user: bob, amount: this.amount });
          const balance = await this.stakeToken.balanceOf(bob);
          expect(balance).to.be.bignumber.equal(this.amount);
          const userInfo = await this.pool.usersInfo(bob);
          expect(userInfo.amount).to.be.bignumber.equal('0');
          const totalStakedTokens = await this.pool.totalStakedTokens();
          expect(totalStakedTokens).to.be.bignumber.equal('0');
          const claimBlock = new BN(result.receipt.blockNumber);
          const elapsedBlocks = claimBlock.sub(this.depositBlock);
          const expectedReward = elapsedBlocks.mul(rewardPerBlock);
          const actualReward = await this.rewardToken.balanceOf(bob);
          expect(actualReward).to.be.bignumber.equal(expectedReward);
        });

        it('reverts when withdrawing a zero amount', async () => {
          await expectRevert(
            this.pool.withdraw('0', { from: bob }),
            'Pool: withdraw amount is zero'
          );
        });

        it('should peform an emergency withdraw', async () => {
          const result = await this.pool.emergencyWithdraw({ from: bob });
          expectEvent(result, 'EmergencyWithdraw', { user: bob, amount: this.amount });
          const balance = await this.stakeToken.balanceOf(bob);
          expect(balance).to.be.bignumber.equal(this.amount);
          const userInfo = await this.pool.usersInfo(bob);
          expect(userInfo.amount).to.be.bignumber.equal('0');
          const pendingReward = await this.pool.getPendingReward(bob);
          expect(pendingReward).to.be.bignumber.equal('0');
          const sentReward = await this.rewardToken.balanceOf(bob);
          expect(sentReward).to.be.bignumber.equal('0');
        });

        it('should receive the right amount of reward when the reward per block is updated', async () => {
          const newRewardPerBlock = new BN('5000');
          await this.pool.setRewardPerBlock(newRewardPerBlock, { from: owner });
          const currentReward = await this.pool.getPendingReward(bob);
          await time.advanceBlock();
          const expectedReward = currentReward.add(newRewardPerBlock);
          const actualReward = await this.pool.getPendingReward(bob);
          expect(actualReward).to.be.bignumber.equal(expectedReward);
        });

        describe('after endBlock', () => {
          beforeEach(async () => {
            await time.advanceBlockTo(this.endBlock.add(new BN('1')));
          });

          it('should stop distributing rewards', async () => {
            const initialReward = await this.pool.getPendingReward(bob);
            await time.advanceBlock();
            const finalReward = await this.pool.getPendingReward(bob);
            expect(finalReward).to.be.bignumber.equal(initialReward);
          });

          it('reverts when depositing', async () => {
            await expectRevert(
              this.pool.deposit('1000', { from: bob }),
              'Pool: pool is already closed'
            );
          });

          it('should restart distributing rewards from the moment endBlock is postponed', async () => {
            const initialPendingReward = await this.pool.getPendingReward(bob);
            await time.advanceBlock();
            const latestBlock = await time.latestBlock();
            await this.pool.setEndBlock(latestBlock.add(new BN('20')));
            await time.advanceBlock();
            const finalPendingReward = await this.pool.getPendingReward(bob);
            expect(finalPendingReward).to.be.bignumber.equal(initialPendingReward.add(rewardPerBlock));
          });

          it('should allow deposits after endBlock is postponed', async () => {
            const amount = new BN('1000');
            await time.advanceBlock();
            const latestBlock = await time.latestBlock();
            await this.pool.setEndBlock(latestBlock.add(new BN('20')));
            await this.stakeToken.transfer(bob, amount, { from: owner });
            await this.stakeToken.approve(this.pool.address, amount, { from: bob });
            await this.pool.deposit(amount, { from: bob });
          });
        });
      });

      describe('if pool have locking period', () => {

        const newLockingPeriod = new BN('100');

        beforeEach(async () => {
          this.amount = new BN('1000');
          await this.pool.setLockingPeriodInBlock(newLockingPeriod, {from: owner});
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

        it('reverts when setting locking period from non-owner', async () => {
          await expectRevert(
              this.pool.setLockingPeriodInBlock(newLockingPeriod, {from: nonOwner}),
              'Ownable: caller is not the owner'
          );
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
    });
  });

  describe('rewardPerBlock', () => {
    it('should update the reward per block', async () => {
      const newRewardPerBlock = new BN('5000');
      await this.pool.setRewardPerBlock(newRewardPerBlock, { from: owner });
      const actualRewardPerBlock = await this.pool.rewardPerBlock();
      expect(actualRewardPerBlock).to.be.bignumber.equal(newRewardPerBlock);
    });

    it('reverts when updating the reward per block from non-owner', async () => {
      const newRewardPerBlock = new BN('5000');

      await expectRevert(
        this.pool.setRewardPerBlock(newRewardPerBlock, { from: nonOwner }),
        'Ownable: caller is not the owner'
      );
    });
  });

  describe('endBlock', () => {
    it('should set a new end block before it is reached', async () => {
      const newEndBlock = new BN('5000');
      await this.pool.setEndBlock(newEndBlock, { from: owner });
      const actualEndBlock = await this.pool.endBlock();
      expect(actualEndBlock).to.be.bignumber.equal(newEndBlock);
    });

    it('should set a new end block after it is reached', async () => {
      await time.advanceBlockTo(this.endBlock);
      const newEndBlock = this.endBlock.add(new BN('20'));
      await this.pool.setEndBlock(newEndBlock, { from: owner });
      const actualEndBlock = await this.pool.endBlock();
      expect(actualEndBlock).to.be.bignumber.equal(newEndBlock);
    });

    it('reverts when setting a new endBlock that is in the past', async () => {
      const latestBlock = await time.latestBlock();
      const newEndBlock = latestBlock.sub(new BN('1'));

      await expectRevert(
        this.pool.setEndBlock(newEndBlock, { from: owner }),
        'Pool: new endBlock is in the past'
      );
    });

    it('reverts when setting a new endBlock from non-owner', async () => {
      const newEndBlock = this.endBlock.add(new BN('1'));

      await expectRevert(
        this.pool.setEndBlock(newEndBlock, { from: nonOwner }),
        'Ownable: caller is not the owner'
      );
    });
  });

  describe('reward distribution', () => {
    beforeEach(async () => {
      await time.advanceBlockTo(this.startBlock);
    });

    it('should proportionally distribute rewards for each block', async () => {
      const bobAmount = new BN('1000');
      const aliceAmount = new BN('3000');

      const bobExpectedReward = new BN('2500');
      const aliceExpectedReward = new BN('1500');

      await this.stakeToken.transfer(bob, bobAmount, { from: owner });
      await this.stakeToken.transfer(alice, aliceAmount, { from: owner });

      await this.stakeToken.approve(this.pool.address, bobAmount, { from: bob });
      await this.stakeToken.approve(this.pool.address, aliceAmount, { from: alice });

      await this.pool.deposit(bobAmount, { from: bob });
      await this.pool.deposit(aliceAmount, { from: alice });

      await time.advanceBlock();

      const bobActualReward = await this.pool.getPendingReward(bob);
      const aliceActualReward = await this.pool.getPendingReward(alice);

      expect(bobActualReward).to.be.bignumber.equal(bobExpectedReward);
      expect(aliceActualReward).to.be.bignumber.equal(aliceExpectedReward);
    });
  });
});
