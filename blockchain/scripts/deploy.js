const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Starting SetuBond deployment...");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // Deploy SetuBondToken contract
  console.log("\n📋 Deploying SetuBondToken...");
  const SetuBondToken = await ethers.getContractFactory("SetuBondToken");
  const bondToken = await SetuBondToken.deploy();
  await bondToken.deployed();
  console.log("✅ SetuBondToken deployed to:", bondToken.address);

  // Deploy AtomicSwap contract
  console.log("\n🔄 Deploying AtomicSwap...");
  const AtomicSwap = await ethers.getContractFactory("AtomicSwap");
  const atomicSwap = await AtomicSwap.deploy(deployer.address); // Fee recipient
  await atomicSwap.deployed();
  console.log("✅ AtomicSwap deployed to:", atomicSwap.address);

  // Verify contracts on Etherscan (if on mainnet/testnet)
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("\n🔍 Verifying contracts...");
    
    try {
      await hre.run("verify:verify", {
        address: bondToken.address,
        constructorArguments: [],
      });
      console.log("✅ SetuBondToken verified on Etherscan");
    } catch (error) {
      console.log("❌ SetuBondToken verification failed:", error.message);
    }

    try {
      await hre.run("verify:verify", {
        address: atomicSwap.address,
        constructorArguments: [deployer.address],
      });
      console.log("✅ AtomicSwap verified on Etherscan");
    } catch (error) {
      console.log("❌ AtomicSwap verification failed:", error.message);
    }
  }

  // Save deployment addresses
  const deploymentInfo = {
    network: network.name,
    deployer: deployer.address,
    contracts: {
      SetuBondToken: bondToken.address,
      AtomicSwap: atomicSwap.address,
    },
    blockNumber: await ethers.provider.getBlockNumber(),
    timestamp: new Date().toISOString(),
  };

  const fs = require('fs');
  fs.writeFileSync(
    `deployments/${network.name}.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\n🎉 Deployment completed successfully!");
  console.log("📄 Deployment info saved to:", `deployments/${network.name}.json`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
