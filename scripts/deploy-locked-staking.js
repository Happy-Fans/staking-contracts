const { ethers, getNamedAccounts } = require('hardhat');

//npx hardhat run --network bscTestnet B:\Projects\Happy_Fans\staking-contracts\scripts\deploy-locked-staking.js
//npx hardhat verify --network bscTestnet 0x2d5389628Ee2Ada88bEbFECe3AC2F0C900782e25 "0x8959f7c84aa1d8387cdb8f04f5023146c6f1b39e" "0x8959f7c84aa1d8387cdb8f04f5023146c6f1b39e" "12020742" "22494742" "100000000000000000000" "200"
// --show-stack-traces

async function main () {
    const { owner, happyFansToken } = await getNamedAccounts();

    const START_BLOCK = 12020742;
    const END_BLOCK = 22494742;
    const REWARD_PER_BLOCK = ethers.utils.parseEther('100');
    const LOCKING_PERIOD_BLOCK = 200;  //For example 30 days period lock: 864000

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
