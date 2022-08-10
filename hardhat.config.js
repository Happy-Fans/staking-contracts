require('@nomiclabs/hardhat-ethers');
require('@nomiclabs/hardhat-truffle5');
require('@nomiclabs/hardhat-web3');
require('@nomiclabs/hardhat-etherscan');
require('hardhat-deploy');
require('hardhat-contract-sizer');
require('hardhat-abi-exporter');
require('solidity-coverage');
require('dotenv').config();

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: '0.8.7',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    // Binance Smart Chain
    bsc: {
      url: 'https://bsc-dataseed.binance.org/',
      accounts: { mnemonic: process.env.MNEMONIC },
      chainId: 56
    },
    bscTestnet: {
      url: 'https://data-seed-prebsc-1-s1.binance.org:8545',
      accounts: { mnemonic: process.env.MNEMONIC },
      chainId: 97
    }
  },
  etherscan: {
    apiKey: {
      // Binance Smart Chain
      bsc: process.env.BSCSCAN_KEY,
      bscTestnet: process.env.BSCSCAN_KEY,
    }
  },
  namedAccounts: {
    owner: {
      default: 0,
      mainnet: process.env.MAIN_OWNER,
      testnet: process.env.TEST_OWNER
    },
    happyFansToken: {
      default: 1,
      mainnet: '0xf5d8a096cccb31b9d7bce5afe812be23e3d4690d',
      testnet: '0x8959f7c84aa1d8387cdb8f04f5023146c6f1b39e'
    },
    lpToken: {
      default: 2,
      mainnet: '0x008604a38cd589680f7b8f085dc2d5b4f81151db',
      testnet: '0x830ce39783730a3f327c609e94e930cd01682dc9'
    }
  }
};
