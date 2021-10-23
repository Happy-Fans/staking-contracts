const { expect } = require('chai');
const { BN, expectRevert } = require('@openzeppelin/test-helpers');
const RewardTreasury = artifacts.require('RewardTreasury');
const MockToken = artifacts.require('MockToken');

contract('RewardTreasury', accounts => {
  const [owner, bob, nonOwner] = accounts;

  beforeEach(async () => {
    this.token = await MockToken.new('Reward Token', 'RWD', '1000000000', { from: owner });
    this.treasury = await RewardTreasury.new(this.token.address, { from: owner });

    this.token.transfer(this.treasury.address, '1000000000');
  });

  it('should send reward', async () => {
    const reward = new BN('100');
    const bobInitialBalance = await this.token.balanceOf(bob);
    const treasuryInitialBalance = await this.token.balanceOf(this.treasury.address);
    await this.treasury.sendReward(bob, reward, { from: owner });
    const bobFinalBalance = await this.token.balanceOf(bob);
    const treasuryFinalBalance = await this.token.balanceOf(this.treasury.address);
    expect(bobFinalBalance).to.be.bignumber.equal(bobInitialBalance.add(reward));
    expect(treasuryFinalBalance).to.be.bignumber.equal(treasuryInitialBalance.sub(reward));
  });

  it('reverts when sending reward from non-owner', async () => {
    await expectRevert(
      this.treasury.sendReward(bob, '100', { from: nonOwner }),
      'Ownable: caller is not the owner'
    );
  });
});
