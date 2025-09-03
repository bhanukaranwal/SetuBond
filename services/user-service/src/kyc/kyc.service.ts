import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycDocument, DocumentType, DocumentStatus } from './entities/kyc-document.entity';
import { User } from '../user/entities/user.entity';
import { DigitalVerificationService } from './digital-verification.service';

@Injectable()
export class KycService {
  constructor(
    @InjectRepository(KycDocument)
    private kycRepository: Repository<KycDocument>,
    private digitalVerification: DigitalVerificationService,
  ) {}

  async submitDocument(
    user: User,
    documentType: DocumentType,
    documentNumber: string,
    documentUrl: string
  ): Promise<KycDocument> {
    // Check if document already exists
    const existingDoc = await this.kycRepository.findOne({
      where: {
        user: { id: user.id },
        documentType,
        status: DocumentStatus.VERIFIED,
      },
    });

    if (existingDoc) {
      throw new BadRequestException('Document already verified');
    }

    const document = this.kycRepository.create({
      user,
      documentType,
      documentNumber,
      documentUrl,
      status: DocumentStatus.PENDING,
    });

    const savedDocument = await this.kycRepository.save(document);

    // Start verification process
    this.verifyDocument(savedDocument.id);

    return savedDocument;
  }

  async verifyDocument(documentId: string): Promise<void> {
    const document = await this.kycRepository.findOne({
      where: { id: documentId },
      relations: ['user'],
    });

    if (!document) return;

    try {
      let verificationResult;

      switch (document.documentType) {
        case DocumentType.AADHAAR:
          verificationResult = await this.digitalVerification.verifyAadhaar(
            document.documentNumber,
            document.documentUrl
          );
          break;
        case DocumentType.PAN:
          verificationResult = await this.digitalVerification.verifyPan(
            document.documentNumber,
            document.documentUrl
          );
          break;
        default:
          verificationResult = await this.digitalVerification.verifyGenericDocument(
            document.documentUrl
          );
      }

      document.status = verificationResult.isValid 
        ? DocumentStatus.VERIFIED 
        : DocumentStatus.REJECTED;
      document.verificationData = verificationResult.data;
      
      if (!verificationResult.isValid) {
        document.rejectionReason = verificationResult.reason;
      }

      await this.kycRepository.save(document);

      // Check if user KYC is complete
      await this.checkKycCompletion(document.user.id);

    } catch (error) {
      document.status = DocumentStatus.REJECTED;
      document.rejectionReason = 'Verification failed due to technical error';
      await this.kycRepository.save(document);
    }
  }

  async checkKycCompletion(userId: string): Promise<void> {
    const requiredDocs = [DocumentType.AADHAAR, DocumentType.PAN];
    const verifiedDocs = await this.kycRepository.count({
      where: {
        user: { id: userId },
        status: DocumentStatus.VERIFIED,
        documentType: requiredDocs[0], // Check each required doc
      },
    });

    const panDoc = await this.kycRepository.count({
      where: {
        user: { id: userId },
        status: DocumentStatus.VERIFIED,
        documentType: DocumentType.PAN,
      },
    });

    if (verifiedDocs > 0 && panDoc > 0) {
      // Update user KYC status
      // This would typically be done through a user service call
    }
  }

  async getUserDocuments(userId: string): Promise<KycDocument[]> {
    return this.kycRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }
}
