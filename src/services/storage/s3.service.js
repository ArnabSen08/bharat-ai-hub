const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const logger = require('../../utils/logger');

class S3Service {
  constructor() {
    this.client = new S3Client({
      region: process.env.S3_REGION || process.env.AWS_REGION || 'ap-south-1'
    });
    this.bucketName = process.env.S3_BUCKET_NAME;
  }

  /**
   * Upload file to S3
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} key - S3 object key
   * @param {string} contentType - File content type
   * @returns {Promise<string>} S3 object URL
   */
  async uploadFile(fileBuffer, key, contentType) {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType
      });

      await this.client.send(command);
      
      const url = `https://${this.bucketName}.s3.${process.env.S3_REGION}.amazonaws.com/${key}`;
      logger.info(`File uploaded successfully: ${key}`);
      return url;
    } catch (error) {
      logger.error('Error uploading file to S3:', error);
      throw error;
    }
  }

  /**
   * Upload medical document
   * @param {Buffer} documentBuffer - Document buffer
   * @param {string} patientId - Patient ID
   * @param {string} documentType - Document type
   * @returns {Promise<string>} Document URL
   */
  async uploadMedicalDocument(documentBuffer, patientId, documentType) {
    const key = `healthcare/patients/${patientId}/${documentType}/${Date.now()}.pdf`;
    return await this.uploadFile(documentBuffer, key, 'application/pdf');
  }

  /**
   * Upload prescription image
   * @param {Buffer} imageBuffer - Image buffer
   * @param {string} patientId - Patient ID
   * @returns {Promise<string>} Image URL
   */
  async uploadPrescription(imageBuffer, patientId) {
    const key = `healthcare/prescriptions/${patientId}/${Date.now()}.jpg`;
    return await this.uploadFile(imageBuffer, key, 'image/jpeg');
  }

  /**
   * Upload product image for retail
   * @param {Buffer} imageBuffer - Image buffer
   * @param {string} productId - Product ID
   * @returns {Promise<string>} Image URL
   */
  async uploadProductImage(imageBuffer, productId) {
    const key = `retail/products/${productId}/${Date.now()}.jpg`;
    return await this.uploadFile(imageBuffer, key, 'image/jpeg');
  }

  /**
   * Upload crop image for rural module
   * @param {Buffer} imageBuffer - Image buffer
   * @param {string} farmerId - Farmer ID
   * @returns {Promise<string>} Image URL
   */
  async uploadCropImage(imageBuffer, farmerId) {
    const key = `rural/crops/${farmerId}/${Date.now()}.jpg`;
    return await this.uploadFile(imageBuffer, key, 'image/jpeg');
  }

  /**
   * Upload learning content
   * @param {Buffer} contentBuffer - Content buffer
   * @param {string} courseId - Course ID
   * @param {string} fileName - File name
   * @returns {Promise<string>} Content URL
   */
  async uploadLearningContent(contentBuffer, courseId, fileName) {
    const key = `learning/courses/${courseId}/${fileName}`;
    const contentType = this.getContentType(fileName);
    return await this.uploadFile(contentBuffer, key, contentType);
  }

  /**
   * Get file from S3
   * @param {string} key - S3 object key
   * @returns {Promise<Buffer>} File buffer
   */
  async getFile(key) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      const response = await this.client.send(command);
      const stream = response.Body;
      
      // Convert stream to buffer
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      
      logger.info(`File retrieved successfully: ${key}`);
      return Buffer.concat(chunks);
    } catch (error) {
      logger.error('Error getting file from S3:', error);
      throw error;
    }
  }

  /**
   * Generate presigned URL for temporary access
   * @param {string} key - S3 object key
   * @param {number} expiresIn - URL expiration in seconds
   * @returns {Promise<string>} Presigned URL
   */
  async getPresignedUrl(key, expiresIn = 3600) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      const url = await getSignedUrl(this.client, command, { expiresIn });
      logger.info(`Presigned URL generated for: ${key}`);
      return url;
    } catch (error) {
      logger.error('Error generating presigned URL:', error);
      throw error;
    }
  }

  /**
   * Delete file from S3
   * @param {string} key - S3 object key
   * @returns {Promise<void>}
   */
  async deleteFile(key) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      await this.client.send(command);
      logger.info(`File deleted successfully: ${key}`);
    } catch (error) {
      logger.error('Error deleting file from S3:', error);
      throw error;
    }
  }

  /**
   * Helper: Get content type from file name
   */
  getContentType(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const contentTypes = {
      'pdf': 'application/pdf',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'mp4': 'video/mp4',
      'mp3': 'audio/mpeg',
      'txt': 'text/plain',
      'json': 'application/json'
    };
    return contentTypes[ext] || 'application/octet-stream';
  }
}

module.exports = new S3Service();
