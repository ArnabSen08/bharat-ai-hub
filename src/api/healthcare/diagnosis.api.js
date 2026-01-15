const express = require('express');
const router = express.Router();
const bedrockService = require('../../services/ai/bedrock.service');
const textractService = require('../../services/ai/textract.service');
const s3Service = require('../../services/storage/s3.service');
const postgresService = require('../../services/database/postgres.service');
const logger = require('../../utils/logger');

/**
 * POST /api/healthcare/diagnosis
 * AI-powered diagnosis assistant
 */
router.post('/diagnosis', async (req, res) => {
  try {
    const { symptoms, medicalHistory, patientId } = req.body;

    if (!symptoms) {
      return res.status(400).json({ error: 'Symptoms are required' });
    }

    // Get AI diagnosis
    const diagnosis = await bedrockService.diagnosisAssistant(symptoms, medicalHistory);

    // Save to database
    await postgresService.query(
      `INSERT INTO diagnoses (patient_id, symptoms, diagnosis, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [patientId, symptoms, JSON.stringify(diagnosis)]
    );

    logger.info(`Diagnosis generated for patient: ${patientId}`);

    res.json({
      success: true,
      diagnosis,
      disclaimer: 'This is an AI-generated preliminary assessment. Please consult a healthcare professional for accurate diagnosis.'
    });
  } catch (error) {
    logger.error('Error in diagnosis API:', error);
    res.status(500).json({ error: 'Failed to generate diagnosis' });
  }
});

/**
 * POST /api/healthcare/prescription/upload
 * Upload and extract prescription
 */
router.post('/prescription/upload', async (req, res) => {
  try {
    const { patientId, prescriptionImage } = req.body;

    if (!prescriptionImage) {
      return res.status(400).json({ error: 'Prescription image is required' });
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(prescriptionImage, 'base64');

    // Upload to S3
    const imageUrl = await s3Service.uploadPrescription(imageBuffer, patientId);

    // Extract text using Textract
    const extractedData = await textractService.extractPrescription(imageBuffer);

    // Save to database
    await postgresService.query(
      `INSERT INTO prescriptions (patient_id, image_url, extracted_data, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [patientId, imageUrl, JSON.stringify(extractedData)]
    );

    logger.info(`Prescription uploaded and processed for patient: ${patientId}`);

    res.json({
      success: true,
      imageUrl,
      extractedData
    });
  } catch (error) {
    logger.error('Error uploading prescription:', error);
    res.status(500).json({ error: 'Failed to process prescription' });
  }
});

/**
 * GET /api/healthcare/patient/:patientId/records
 * Get patient medical records
 */
router.get('/patient/:patientId/records', async (req, res) => {
  try {
    const { patientId } = req.params;

    const records = await postgresService.query(
      `SELECT * FROM patients WHERE id = $1`,
      [patientId]
    );

    const diagnoses = await postgresService.query(
      `SELECT * FROM diagnoses WHERE patient_id = $1 ORDER BY created_at DESC`,
      [patientId]
    );

    const prescriptions = await postgresService.query(
      `SELECT * FROM prescriptions WHERE patient_id = $1 ORDER BY created_at DESC`,
      [patientId]
    );

    res.json({
      success: true,
      patient: records.rows[0],
      diagnoses: diagnoses.rows,
      prescriptions: prescriptions.rows
    });
  } catch (error) {
    logger.error('Error fetching patient records:', error);
    res.status(500).json({ error: 'Failed to fetch patient records' });
  }
});

/**
 * POST /api/healthcare/telemedicine/session
 * Create telemedicine session
 */
router.post('/telemedicine/session', async (req, res) => {
  try {
    const { patientId, doctorId, scheduledTime } = req.body;

    const result = await postgresService.query(
      `INSERT INTO telemedicine_sessions (patient_id, doctor_id, scheduled_time, status)
       VALUES ($1, $2, $3, 'scheduled')
       RETURNING id`,
      [patientId, doctorId, scheduledTime]
    );

    logger.info(`Telemedicine session created: ${result.rows[0].id}`);

    res.json({
      success: true,
      sessionId: result.rows[0].id,
      message: 'Telemedicine session scheduled successfully'
    });
  } catch (error) {
    logger.error('Error creating telemedicine session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

module.exports = router;
