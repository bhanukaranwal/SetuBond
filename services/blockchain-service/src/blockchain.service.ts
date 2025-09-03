import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { SetuBondTokenABI } from './contracts/SetuBondToken.abi';
import { AtomicSwapABI } from './contracts/AtomicSwap.abi';

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private setuBondContract: ethers.Contract;
  private atomicSwapContract: ethers.Contract;

  constructor() {
    this.initializeBlockchain();
  }

  private initializeBlockchain() {
    this.provider = new ethers.JsonRpcProvider(
      process.env.ETHEREUM_RPC_URL || 'http://localhost:8545'
    );
    
    this.wallet = new ethers.Wallet(
      process.env.PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000000',
      this.provider
    );

    this.setuBondContract = new ethers.Contract(
      process.env.SETUBOND_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000',
      SetuBondTokenABI,
      this.wallet
    );

    this.atomicSwapContract = new ethers.Contract(
      process.env.ATOMIC_SWAP_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000',
      AtomicSwapABI,
      this.wallet
    );
  }

  async tokenizeBond(bondData: any) {
    try {
      const tx = await this.setuBondContract.createBond(
        bondData.isin,
        bondData.name,
        bondData.issuer,
        ethers.parseUnits(bondData.faceValue.toString(), 18),
        bondData.couponRate * 100, // Convert to basis points
        Math.floor(new Date(bondData.maturityDate).getTime() / 1000),
        ethers.parseUnits(bondData.totalSupply.toString(), 18),
        ethers.parseUnits(bondData.minInvestment.toString(), 18),
        bondData.prospectusHash || ''
      );

      const receipt = await tx.wait();
      
      this.logger.log(`Bond tokenized: ${bondData.isin}, TX: ${tx.hash}`);
      
      return {
        success: true,
        transactionHash: tx.hash,
        tokenId: receipt.logs[0]?.topics[1], // Extract token ID from event
        gasUsed: receipt.gasUsed.toString(),
      };
    } catch (error) {
      this.logger.error('Bond tokenization failed:', error);
      return { success: false, error: error.message };
    }
  }

  async transferTokens(transferData: any) {
    try {
      const tx = await this.setuBondContract.safeTransferFrom(
        transferData.from,
        transferData.to,
        transferData.tokenId,
        ethers.parseUnits(transferData.amount.toString(), 18),
        ethers.toUtf8Bytes(transferData.data || '')
      );

      const receipt = await tx.wait();
      
      return {
        success: true,
        transactionHash: tx.hash,
        gasUsed: receipt.gasUsed.toString(),
      };
    } catch (error) {
      this.logger.error('Token transfer failed:', error);
      return { success: false, error: error.message };
    }
  }

  async getBalance(address: string, tokenId: string) {
    try {
      const balance = await this.setuBondContract.balanceOf(address, tokenId);
      
      return {
        balance: ethers.formatUnits(balance, 18),
        address,
        tokenId,
      };
    } catch (error) {
      this.logger.error('Balance query failed:', error);
      return { balance: '0', error: error.message };
    }
  }

  async createAtomicSwap(swapData: any) {
    try {
      const expiryTime = Math.floor(Date.now() / 1000) + (swapData.expiryMinutes * 60);
      const secretHash = ethers.keccak256(ethers.toUtf8Bytes(swapData.secret));

      const tx = await this.atomicSwapContract.createSwap(
        swapData.counterparty,
        swapData.bondToken,
        swapData.bondTokenId,
        ethers.parseUnits(swapData.bondAmount.toString(), 18),
        swapData.paymentToken,
        ethers.parseUnits(swapData.paymentAmount.toString(), 18),
        expiryTime,
        secretHash
      );

      const receipt = await tx.wait();
      
      return {
        success: true,
        swapId: receipt.logs[0]?.topics[1], // Extract swap ID from event
        transactionHash: tx.hash,
        expiryTime,
      };
    } catch (error) {
      this.logger.error('Atomic swap creation failed:', error);
      return { success: false, error: error.message };
    }
  }

  async executeSwap(swapId: string, secret: string) {
    try {
      const tx = await this.atomicSwapContract.executeSwap(
        swapId,
        ethers.toUtf8Bytes(secret)
      );

      const receipt = await tx.wait();
      
      return {
        success: true,
        transactionHash: tx.hash,
        gasUsed: receipt.gasUsed.toString(),
      };
    } catch (error) {
      this.logger.error('Swap execution failed:', error);
      return { success: false, error: error.message };
    }
  }

  async getTransactionStatus(txHash: string) {
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);
      return {
        status: receipt ? 'confirmed' : 'pending',
        blockNumber: receipt?.blockNumber,
        gasUsed: receipt?.gasUsed.toString(),
      };
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }
}
