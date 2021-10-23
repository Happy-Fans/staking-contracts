const { ethers, getNamedAccounts } = require('hardhat');

async function main () {
  const { owner, happyFansToken } = await getNamedAccounts();

  const START_BLOCK = 12020742;
  const END_BLOCK = 12884742;
  const REWARD_PER_BLOCK = ethers.utils.parseEther('10');

  const StakePool = await ethers.getContractFactory('StakePool');

  const stakePool = await StakePool.deploy(
    happyFansToken,
    happyFansToken,
    START_BLOCK,
    END_BLOCK,
    REWARD_PER_BLOCK
  );

  await stakePool.transferOwnership(owner);

  console.log(`StakePool: ${stakePool.address}`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
