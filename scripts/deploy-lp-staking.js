const { ethers, getNamedAccounts } = require('hardhat');

async function main () {
    const { owner, happyFansToken, lpToken } = await getNamedAccounts();

    const START_BLOCK = 12020742;
    const END_BLOCK = 12884742;
    const REWARD_PER_BLOCK = ethers.utils.parseEther('100');
    const LOCKING_PERIOD_BLOCK = 0;

    const StakePool = await ethers.getContractFactory('StakePool');

    const stakePool = await StakePool.deploy(
        lpToken,
        happyFansToken,
        START_BLOCK,
        END_BLOCK,
        REWARD_PER_BLOCK,
        LOCKING_PERIOD_BLOCK
    );

    await stakePool.transferOwnership(owner);

    console.log(`StakePoolLP: ${stakePool.address}`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });