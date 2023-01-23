const { ethers, getNamedAccounts } = require('hardhat');

async function main () {
    const { owner, happyFansToken } = await getNamedAccounts();

    const RewardTreasury = await ethers.getContractFactory('RewardTreasury');

    const rewardTreasury = await RewardTreasury.deploy(
        happyFansToken,
    );

    await rewardTreasury.transferOwnership(owner);

    console.log(`RewardTreasury: ${rewardTreasury.address}`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
