const { ethers, getNamedAccounts } = require('hardhat');

//npx hardhat run --network bscTestnet B:\Projects\Happy_Fans\staking-contracts\scripts\deploy-locked-staking.js
//npx hardhat verify --network bscTestnet 0xe41C53c5442e8230A218a349661b6D72Ff946b2F "0x3051A82bc747Fc6A98c5Ff64b1B7F03bF779EcDB" "0x3051A82bc747Fc6A98c5Ff64b1B7F03bF779EcDB" "12020742" "17494742" "100000000" "1200"

async function main () {
    const { owner, happyFansToken } = await getNamedAccounts();

    const START_BLOCK = 12020742;
    const END_BLOCK = 17494742;
    const REWARD_PER_BLOCK = 100000000;
    const LOCKING_PERIOD_BLOCK = 1200;  //For example 30 days period lock: 864000

    const StakePool = await ethers.getContractFactory('StakePool');

    const stakePool = await StakePool.deploy(
        happyFansToken,
        happyFansToken,
        START_BLOCK,
        END_BLOCK,
        REWARD_PER_BLOCK,
        LOCKING_PERIOD_BLOCK
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
