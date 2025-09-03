import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog } from './entities/audit-log.entity';
import { ComplianceRule } from './entities/compliance-rule.entity';
import { ActivityLog, ActivityLogDocument } from './schemas/activity-log.schema';

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
    @InjectRepository(ComplianceRule)
    private complianceRuleRepository: Repository<ComplianceRule>,
    @InjectModel(ActivityLog.name)
    private activityLogModel: Model<ActivityLogDocument>,
  ) {}

  async checkCompliance(data: any) {
    try {
      const { userId, actionType, amount, instrumentType } = data;
      const violations = [];

      // Check position limits
      const positionCheck = await this.checkPositionLimits(userId, amount, instrumentType);
      if (!positionCheck.compliant) {
        violations.push(positionCheck.violation);
      }

      // Check concentration limits
      const concentrationCheck = await this.checkConcentrationLimits(userId, instrumentType);
      if (!concentrationCheck.compliant) {
        violations.push(concentrationCheck.violation);
      }

      // Check trading hours
      const tradingHoursCheck = this.checkTradingHours();
      if (!tradingHoursCheck.compliant) {
        violations.push(tradingHoursCheck.violation);
      }

      // Check AML requirements
      const amlCheck = await this.checkAMLRequirements(userId, amount);
      if (!amlCheck.compliant) {
        violations.push(amlCheck.violation);
      }

      return {
        compliant: violations.length === 0,
        violations,
        riskScore: this.calculateRiskScore(violations),
      };
    } catch (error) {
      this.logger.error('Compliance check failed:', error);
      return { compliant: false, error: error.message };
    }
  }

  async logActivity(data: any) {
    try {
      // Log to PostgreSQL for structured audit trail
      const auditLog = this.auditLogRepository.create({
        userId: data.userId,
        action: data.action,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        oldValues: data.oldValues,
        newValues: data.newValues,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        timestamp: new Date(),
      });

      await this.auditLogRepository.save(auditLog);

      // Also log to MongoDB for flexible analysis
      const activityLog = new this.activityLogModel({
        userId: data.userId,
        sessionId: data.sessionId,
        action: data.action,
        details: data.details,
        metadata: data.metadata,
        riskIndicators: await this.calculateRiskIndicators(data),
        timestamp: new Date(),
      });

      await activityLog.save();

      return { success: true, logId: auditLog.id };
    } catch (error) {
      this.logger.error('Activity logging failed:', error);
      return { success: false, error: error.message };
    }
  }

  async generateReport(data: any) {
    try {
      const { reportType, startDate, endDate, filters } = data;

      switch (reportType) {
        case 'TRADE_SURVEILLANCE':
          return await this.generateTradeSurveillanceReport(startDate, endDate, filters);
        case 'AML_SUMMARY':
          return await this.generateAMLSummaryReport(startDate, endDate, filters);
        case 'POSITION_LIMITS':
          return await this.generatePositionLimitsReport(startDate, endDate, filters);
        case 'REGULATORY_FILING':
          return await this.generateRegulatoryFilingReport(startDate, endDate, filters);
        default:
          throw new Error(`Unsupported report type: ${reportType}`);
      }
    } catch (error) {
      this.logger.error('Report generation failed:', error);
      return { success: false, error: error.message };
    }
  }

  async detectSuspiciousActivity(data: any) {
    try {
      const { userId, timeWindow = 24 } = data;
      const suspicious = [];

      // Unusual trading patterns
      const tradingPatterns = await this.analyzeTradePatterns(userId, timeWindow);
      if (tradingPatterns.suspicious) {
        suspicious.push({
          type: 'UNUSUAL_TRADING_PATTERN',
          description: tradingPatterns.description,
          riskLevel: tradingPatterns.riskLevel,
        });
      }

      // Rapid succession trades
      const rapidTrades = await this.checkRapidTrades(userId, timeWindow);
      if (rapidTrades.detected) {
        suspicious.push({
          type: 'RAPID_SUCCESSION_TRADES',
          description: `${rapidTrades.count} trades within ${rapidTrades.timespan} minutes`,
          riskLevel: 'MEDIUM',
        });
      }

      // Large volume deviations
      const volumeDeviations = await this.checkVolumeDeviations(userId);
      if (volumeDeviations.detected) {
        suspicious.push({
          type: 'VOLUME_DEVIATION',
          description: `Trading volume ${volumeDeviations.percentageChange}% above average`,
          riskLevel: volumeDeviations.riskLevel,
        });
      }

      return {
        userId,
        suspiciousActivities: suspicious,
        overallRiskLevel: this.calculateOverallRisk(suspicious),
        requiresInvestigation: suspicious.some(s => s.riskLevel === 'HIGH'),
      };
    } catch (error) {
      this.logger.error('Suspicious activity detection failed:', error);
      return { error: error.message };
    }
  }

  async performTradeSurveillance(tradeData: any) {
    try {
      // Real-time trade surveillance
      const alerts = [];

      // Check for front-running
      const frontRunning = await this.detectFrontRunning(tradeData);
      if (frontRunning.detected) {
        alerts.push({ type: 'FRONT_RUNNING', ...frontRunning });
      }

      // Check for wash trading
      const washTrading = await this.detectWashTrading(tradeData);
      if (washTrading.detected) {
        alerts.push({ type: 'WASH_TRADING', ...washTrading });
      }

      // Check for market manipulation
      const marketManipulation = await this.detectMarketManipulation(tradeData);
      if (marketManipulation.detected) {
        alerts.push({ type: 'MARKET_MANIPULATION', ...marketManipulation });
      }

      if (alerts.length > 0) {
        await this.escalateAlerts(alerts, tradeData);
      }

      return { alerts, requiresAction: alerts.length > 0 };
    } catch (error) {
      this.logger.error('Trade surveillance failed:', error);
    }
  }

  private async checkPositionLimits(userId: string, amount: number, instrumentType: string) {
    // Mock implementation - in production, check against user's position limits
    const userLimits = await this.getUserLimits(userId);
    const currentPosition = await this.getCurrentPosition(userId, instrumentType);
    
    const newPosition = currentPosition + amount;
    const limit = userLimits[instrumentType] || 1000000; // Default 10L limit

    return {
      compliant: newPosition <= limit,
      violation: newPosition > limit ? {
        type: 'POSITION_LIMIT_EXCEEDED',
        limit,
        attempted: newPosition,
        excess: newPosition - limit,
      } : null,
    };
  }

  private async checkConcentrationLimits(userId: string, instrumentType: string) {
    // Check portfolio concentration
    const portfolio = await this.getUserPortfolio(userId);
    const instrumentValue = portfolio[instrumentType] || 0;
    const totalValue = Object.values(portfolio).reduce((sum: number, value: number) => sum + value, 0);
    
    const concentration = totalValue > 0 ? (instrumentValue / totalValue) : 0;
    const limit = 0.3; // 30% concentration limit

    return {
      compliant: concentration <= limit,
      violation: concentration > limit ? {
        type: 'CONCENTRATION_LIMIT_EXCEEDED',
        limit: limit * 100,
        current: concentration * 100,
      } : null,
    };
  }

  private checkTradingHours() {
    const now = new Date();
    const hour = now.getHours();
    const isWeekday = now.getDay() >= 1 && now.getDay() <= 5;
    const isTradingHour = hour >= 9 && hour < 15; // 9 AM to 3 PM

    return {
      compliant: isWeekday && isTradingHour,
      violation: (!isWeekday || !isTradingHour) ? {
        type: 'OUTSIDE_TRADING_HOURS',
        currentTime: now.toISOString(),
      } : null,
    };
  }

  private async checkAMLRequirements(userId: string, amount: number) {
    // Check AML thresholds and requirements
    const threshold = 1000000; // 10L threshold
    const userProfile = await this.getUserProfile(userId);

    if (amount >= threshold && !userProfile.enhancedDueDiligence) {
      return {
        compliant: false,
        violation: {
          type: 'AML_ENHANCED_DUE_DILIGENCE_REQUIRED',
          amount,
          threshold,
        },
      };
    }

    return { compliant: true, violation: null };
  }

  private calculateRiskScore(violations: any[]) {
    if (violations.length === 0) return 0;
    
    const riskWeights = {
      'POSITION_LIMIT_EXCEEDED': 30,
      'CONCENTRATION_LIMIT_EXCEEDED': 25,
      'OUTSIDE_TRADING_HOURS': 10,
      'AML_ENHANCED_DUE_DILIGENCE_REQUIRED': 35,
    };

    return violations.reduce((score, violation) => {
      return score + (riskWeights[violation.type] || 10);
    }, 0);
  }

  private calculateOverallRisk(suspicious: any[]) {
    const highRiskCount = suspicious.filter(s => s.riskLevel === 'HIGH').length;
    const mediumRiskCount = suspicious.filter(s => s.riskLevel === 'MEDIUM').length;

    if (highRiskCount > 0) return 'HIGH';
    if (mediumRiskCount > 1) return 'HIGH';
    if (mediumRiskCount > 0) return 'MEDIUM';
    return 'LOW';
  }

  // Mock helper methods (in production, these would query actual data)
  private async getUserLimits(userId: string) {
    return { CORPORATE_BOND: 5000000 }; // 50L limit
  }

  private async getCurrentPosition(userId: string, instrumentType: string) {
    return 0; // Mock current position
  }

  private async getUserPortfolio(userId: string) {
    return { CORPORATE_BOND: 1000000 }; // Mock portfolio
  }

  private async getUserProfile(userId: string) {
    return { enhancedDueDiligence: false }; // Mock user profile
  }

  private async calculateRiskIndicators(data: any) {
    return {
      geolocation: data.ipAddress ? 'IN' : 'UNKNOWN',
      deviceFingerprint: data.userAgent ? 'web' : 'unknown',
      timeOfDay: new Date().getHours(),
      dayOfWeek: new Date().getDay(),
    };
  }

  // Additional surveillance methods would be implemented here...
  private async analyzeTradePatterns(userId: string, timeWindow: number) {
    return { suspicious: false, description: '', riskLevel: 'LOW' };
  }

  private async checkRapidTrades(userId: string, timeWindow: number) {
    return { detected: false, count: 0, timespan: 0 };
  }

  private async checkVolumeDeviations(userId: string) {
    return { detected: false, percentageChange: 0, riskLevel: 'LOW' };
  }

  private async detectFrontRunning(tradeData: any) {
    return { detected: false };
  }

  private async detectWashTrading(tradeData: any) {
    return { detected: false };
  }

  private async detectMarketManipulation(tradeData: any) {
    return { detected: false };
  }

  private async escalateAlerts(alerts: any[], tradeData: any) {
    this.logger.warn('Compliance alerts detected:', { alerts, tradeData });
    // In production, this would trigger notifications to compliance team
  }

  private async generateTradeSurveillanceReport(startDate: Date, endDate: Date, filters: any) {
    return { reportType: 'TRADE_SURVEILLANCE', data: [] };
  }

  private async generateAMLSummaryReport(startDate: Date, endDate: Date, filters: any) {
    return { reportType: 'AML_SUMMARY', data: [] };
  }

  private async generatePositionLimitsReport(startDate: Date, endDate: Date, filters: any) {
    return { reportType: 'POSITION_LIMITS', data: [] };
  }

  private async generateRegulatoryFilingReport(startDate: Date, endDate: Date, filters: any) {
    return { reportType: 'REGULATORY_FILING', data: [] };
  }
}
