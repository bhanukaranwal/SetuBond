import { Controller } from '@nestjs/common';
import { GrpcMethod, MessagePattern } from '@nestjs/microservices';
import { ComplianceService } from './compliance.service';

@Controller()
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @GrpcMethod('ComplianceService', 'CheckCompliance')
  async checkCompliance(data: any) {
    return this.complianceService.checkCompliance(data);
  }

  @GrpcMethod('ComplianceService', 'LogActivity')
  async logActivity(data: any) {
    return this.complianceService.logActivity(data);
  }

  @GrpcMethod('ComplianceService', 'GenerateReport')
  async generateReport(data: any) {
    return this.complianceService.generateReport(data);
  }

  @GrpcMethod('ComplianceService', 'DetectSuspiciousActivity')
  async detectSuspiciousActivity(data: any) {
    return this.complianceService.detectSuspiciousActivity(data);
  }

  @MessagePattern('trade.surveillance')
  async surveillanceTrade(data: any) {
    await this.complianceService.performTradeSurveillance(data);
  }
}
