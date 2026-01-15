const { TextractClient, AnalyzeDocumentCommand, DetectDocumentTextCommand } = require('@aws-sdk/client-textract');
const logger = require('../../utils/logger');

class TextractService {
  constructor() {
    this.client = new TextractClient({
      region: process.env.AWS_REGION || 'ap-south-1'
    });
  }

  /**
   * Extract text from medical documents
   * @param {Buffer} documentBuffer - Document buffer
   * @returns {Promise<object>} Extracted text and data
   */
  async extractMedicalDocument(documentBuffer) {
    try {
      const command = new AnalyzeDocumentCommand({
        Document: {
          Bytes: documentBuffer
        },
        FeatureTypes: ['FORMS', 'TABLES']
      });

      const response = await this.client.send(command);
      
      const extractedData = {
        text: '',
        forms: [],
        tables: []
      };

      // Process blocks
      response.Blocks.forEach(block => {
        if (block.BlockType === 'LINE') {
          extractedData.text += block.Text + '\n';
        } else if (block.BlockType === 'KEY_VALUE_SET') {
          extractedData.forms.push({
            key: block.Text,
            confidence: block.Confidence
          });
        }
      });

      logger.info('Medical document extracted successfully');
      return extractedData;
    } catch (error) {
      logger.error('Error extracting medical document:', error);
      throw error;
    }
  }

  /**
   * Extract text from prescriptions
   * @param {Buffer} prescriptionImage - Prescription image buffer
   * @returns {Promise<object>} Extracted prescription data
   */
  async extractPrescription(prescriptionImage) {
    try {
      const command = new DetectDocumentTextCommand({
        Document: {
          Bytes: prescriptionImage
        }
      });

      const response = await this.client.send(command);
      
      const lines = response.Blocks
        .filter(block => block.BlockType === 'LINE')
        .map(block => block.Text);

      // Parse prescription details
      const prescription = {
        rawText: lines.join('\n'),
        medicines: this.parseMedicines(lines),
        doctorName: this.extractDoctorName(lines),
        date: this.extractDate(lines)
      };

      logger.info('Prescription extracted successfully');
      return prescription;
    } catch (error) {
      logger.error('Error extracting prescription:', error);
      throw error;
    }
  }

  /**
   * Extract data from invoices (for retail module)
   * @param {Buffer} invoiceBuffer - Invoice buffer
   * @returns {Promise<object>} Extracted invoice data
   */
  async extractInvoice(invoiceBuffer) {
    try {
      const command = new AnalyzeDocumentCommand({
        Document: {
          Bytes: invoiceBuffer
        },
        FeatureTypes: ['FORMS', 'TABLES']
      });

      const response = await this.client.send(command);
      
      const invoice = {
        items: [],
        total: 0,
        date: null,
        vendor: null
      };

      // Extract invoice details from blocks
      // Implementation would parse specific invoice fields

      logger.info('Invoice extracted successfully');
      return invoice;
    } catch (error) {
      logger.error('Error extracting invoice:', error);
      throw error;
    }
  }

  /**
   * Helper: Parse medicines from text lines
   */
  parseMedicines(lines) {
    const medicines = [];
    const medicinePattern = /\d+\.\s*([A-Za-z\s]+)\s*-?\s*(\d+\s*mg)?/;
    
    lines.forEach(line => {
      const match = line.match(medicinePattern);
      if (match) {
        medicines.push({
          name: match[1].trim(),
          dosage: match[2] || 'Not specified'
        });
      }
    });
    
    return medicines;
  }

  /**
   * Helper: Extract doctor name
   */
  extractDoctorName(lines) {
    const doctorPattern = /Dr\.?\s+([A-Za-z\s]+)/i;
    for (const line of lines) {
      const match = line.match(doctorPattern);
      if (match) return match[1].trim();
    }
    return 'Unknown';
  }

  /**
   * Helper: Extract date
   */
  extractDate(lines) {
    const datePattern = /\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/;
    for (const line of lines) {
      const match = line.match(datePattern);
      if (match) return match[0];
    }
    return null;
  }
}

module.exports = new TextractService();
