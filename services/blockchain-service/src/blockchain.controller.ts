import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { BlockchainService } from './blockchain.service';

@Controller()
export class BlockchainController {
  constructor(private readonly blockchainService: BlockchainService) {}

  @GrpcMethod('BlockchainService', 'TokenizeBond')
  async tokenizeBond(data: any) {
    return this.blockchainService.tokenizeBond(data);
  }

  @GrpcMethod('BlockchainService', 'TransferTokens')
  async transferTokens(data: any) {
    return this.blockchainService.transferTokens(data);
  }

  @GrpcMethod('BlockchainService', 'GetBalance')
  async getBalance(data: { address: string; tokenId: string }) {
    return this.blockchainService.getBalance(data.address, data.tokenId);
  }

  @GrpcMethod('BlockchainService', 'CreateAtomicSwap')
  async createAtomicSwap(data: any) {
    return this.blockchainService.createAtomicSwap(data);
  }

  @GrpcMethod('BlockchainService', 'ExecuteSwap')
  async executeSwap(data: { swapId: string; secret: string }) {
    return this.blockchainService.executeSwap(data.swapId, data.secret);
  }
}
