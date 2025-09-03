import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface VerificationResult {
  isValid: boolean;
  data?: any;
  reason?: string;
}

@Injectable()
export class DigitalVerificationService {
  private readonly logger = new Logger(DigitalVerificationService.name);

  constructor(private httpService: HttpService) {}

  async verifyAadhaar(aadhaarNumber: string, documentUrl: string): Promise<VerificationResult> {
    try {
      // In production, integrate with actual Aadhaar verification API
      // This is a mock implementation
      const response = await firstValueFrom(
        this.httpService.post(`${process.env.DIGILOCKER_API_URL}/verify-aadhaar`, {
          aadhaar_number: aadhaarNumber,
          document_url: documentUrl,
        }, {
          headers: {
            'Authorization': `Bearer ${process.env.DIGILOCKER_API_KEY}`,
            'Content-Type': 'application/json',
          },
        })
      );

      return {
        isValid: response.data.status === 'verified',
        data: response.data,
        reason: response.data.message,
      };
    } catch (error) {
      this.logger.error('Aadhaar verification failed', error);
      return {
        isValid: false,
        reason: 'Aadhaar verification service unavailable',
      };
    }
  }

  async verifyPan(panNumber: string, documentUrl: string): Promise<VerificationResult> {
    try {
      // Mock PAN verification
      const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
      const isValidFormat = panRegex.test(panNumber);

      if (!isValidFormat) {
        return {
          isValid: false,
          reason: 'Invalid PAN format',
        };
      }

      // In production, call actual PAN verification API
      const response = await firstValueFrom(
        this.httpService.post(`${process.env.PAN_VERIFICATION_API_URL}/verify`, {
          pan_number: panNumber,
          document_url: documentUrl,
        }, {
          headers: {
            'Authorization': `Bearer ${process.env.PAN_API_KEY}`,
          },
        })
      );

      return {
        isValid: response.data.valid,
        data: response.data,
      };
    } catch (error) {
      this.logger.error('PAN verification failed', error);
      return {
        isValid: false,
        reason: 'PAN verification service unavailable',
      };
    }
  }

  async verifyGenericDocument(documentUrl: string): Promise<VerificationResult> {
    // Basic document validation (file type, size, etc.)
    try {
      const response = await firstValueFrom(
        this.httpService.get(documentUrl)
      );

      const contentType = response.headers['content-type'];
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];

      if (!allowedTypes.includes(contentType)) {
        return {
          isValid: false,
          reason: 'Unsupported file type',
        };
      }

      return {
        isValid: true,
        data: { contentType, size: response.data.length },
      };
    } catch (error) {
      return {
        isValid: false,
        reason: 'Document not accessible',
      };
    }
  }
}
