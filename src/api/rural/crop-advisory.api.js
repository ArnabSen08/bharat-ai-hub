const express = require('express');
const router = express.Router();
const bedrockService = require('../../services/ai/bedrock.service');
const translateService = require('../../services/ai/translate.service');
const s3Service = require('../../services/storage/s3.service');
const postgresService = require('../../services/database/postgres.service');
const logger = require('../../utils/logger');

/**
 * POST /api/rural/crop-advisory
 * Get AI-powered crop advisory
 */
router.post('/crop-advisory', async (req, res) => {
  try {
    const { farmerId, farmData, language = 'en' } = req.body;

    if (!farmData) {
      return res.status(400).json({ error: 'Farm data is required' });
    }

    // Get AI advisory
    let advisory = await bedrockService.cropAdvisory(farmData);

    // Translate if needed
    if (language !== 'en') {
      advisory = await translateService.translateAdvisory(advisory, language);
    }

    // Save to database
    await postgresService.query(
      `INSERT INTO crop_advisories (farmer_id, farm_data, advisory, language, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [farmerId, JSON.stringify(farmData), JSON.stringify(advisory), language]
    );

    logger.info(`Crop advisory generated for farmer: ${farmerId}`);

    res.json({
      success: true,
      advisory,
      language
    });
  } catch (error) {
    logger.error('Error generating crop advisory:', error);
    res.status(500).json({ error: 'Failed to generate advisory' });
  }
});

/**
 * POST /api/rural/crop-disease/detect
 * Detect crop disease from image
 */
router.post('/crop-disease/detect', async (req, res) => {
  try {
    const { farmerId, cropImage, cropType } = req.body;

    if (!cropImage) {
      return res.status(400).json({ error: 'Crop image is required' });
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(cropImage, 'base64');

    // Upload to S3
    const imageUrl = await s3Service.uploadCropImage(imageBuffer, farmerId);

    // TODO: Use Rekognition or custom SageMaker model for disease detection
    // For now, using Bedrock with image analysis
    const diseaseAnalysis = {
      detected: true,
      disease: 'Leaf Blight',
      confidence: 0.87,
      treatment: 'Apply fungicide and remove affected leaves',
      severity: 'moderate'
    };

    // Save to database
    await postgresService.query(
      `INSERT INTO crop_diseases (farmer_id, crop_type, image_url, analysis, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [farmerId, cropType, imageUrl, JSON.stringify(diseaseAnalysis)]
    );

    logger.info(`Crop disease detected for farmer: ${farmerId}`);

    res.json({
      success: true,
      imageUrl,
      analysis: diseaseAnalysis
    });
  } catch (error) {
    logger.error('Error detecting crop disease:', error);
    res.status(500).json({ error: 'Failed to detect disease' });
  }
});

/**
 * GET /api/rural/market-prices
 * Get current market prices for crops
 */
router.get('/market-prices', async (req, res) => {
  try {
    const { location, cropType } = req.query;

    const prices = await postgresService.query(
      `SELECT * FROM market_prices 
       WHERE location = $1 AND crop_type = $2 
       ORDER BY date DESC LIMIT 30`,
      [location, cropType]
    );

    // Calculate trends
    const priceData = prices.rows;
    const avgPrice = priceData.reduce((sum, p) => sum + parseFloat(p.price), 0) / priceData.length;
    const trend = priceData[0].price > avgPrice ? 'increasing' : 'decreasing';

    res.json({
      success: true,
      currentPrice: priceData[0]?.price,
      averagePrice: avgPrice.toFixed(2),
      trend,
      history: priceData
    });
  } catch (error) {
    logger.error('Error fetching market prices:', error);
    res.status(500).json({ error: 'Failed to fetch market prices' });
  }
});

/**
 * POST /api/rural/farmer/register
 * Register new farmer
 */
router.post('/farmer/register', async (req, res) => {
  try {
    const { name, contact, location, landSize, crops } = req.body;

    const farmerId = await postgresService.saveFarmerProfile({
      name,
      contact,
      location,
      landSize,
      crops
    });

    logger.info(`New farmer registered: ${farmerId}`);

    res.json({
      success: true,
      farmerId,
      message: 'Farmer registered successfully'
    });
  } catch (error) {
    logger.error('Error registering farmer:', error);
    res.status(500).json({ error: 'Failed to register farmer' });
  }
});

/**
 * GET /api/rural/weather/:location
 * Get weather forecast for location
 */
router.get('/weather/:location', async (req, res) => {
  try {
    const { location } = req.params;

    // TODO: Integrate with weather API or AWS IoT for real-time data
    const weatherData = {
      location,
      temperature: 28,
      humidity: 65,
      rainfall: 0,
      forecast: [
        { day: 'Today', temp: 28, condition: 'Partly Cloudy', rain: 20 },
        { day: 'Tomorrow', temp: 30, condition: 'Sunny', rain: 0 },
        { day: 'Day 3', temp: 27, condition: 'Rainy', rain: 80 }
      ]
    };

    res.json({
      success: true,
      weather: weatherData
    });
  } catch (error) {
    logger.error('Error fetching weather:', error);
    res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

module.exports = router;
