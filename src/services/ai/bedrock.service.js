const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const logger = require('../../utils/logger');

class BedrockService {
  constructor() {
    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'ap-south-1'
    });
    this.modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';
  }

  /**
   * Generate AI response using Amazon Bedrock
   * @param {string} prompt - User prompt
   * @param {object} options - Additional options
   * @returns {Promise<string>} AI generated response
   */
  async generateResponse(prompt, options = {}) {
    try {
      const payload = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: options.maxTokens || 2000,
        temperature: options.temperature || 0.7,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      };

      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(payload)
      });

      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      logger.info('Bedrock response generated successfully');
      return responseBody.content[0].text;
    } catch (error) {
      logger.error('Error generating Bedrock response:', error);
      throw error;
    }
  }

  /**
   * Healthcare diagnosis assistant
   * @param {string} symptoms - Patient symptoms
   * @param {object} medicalHistory - Patient medical history
   * @returns {Promise<object>} Diagnosis suggestions
   */
  async diagnosisAssistant(symptoms, medicalHistory = {}) {
    const prompt = `You are a medical AI assistant. Based on the following information, provide preliminary diagnosis suggestions and recommendations. This is for informational purposes only and not a replacement for professional medical advice.

Symptoms: ${symptoms}
Medical History: ${JSON.stringify(medicalHistory)}

Please provide:
1. Possible conditions (with probability)
2. Recommended tests
3. General care advice
4. When to seek immediate medical attention

Format the response in JSON.`;

    const response = await this.generateResponse(prompt, { temperature: 0.3 });
    return JSON.parse(response);
  }

  /**
   * Crop advisory for farmers
   * @param {object} farmData - Farm and crop data
   * @returns {Promise<object>} Crop recommendations
   */
  async cropAdvisory(farmData) {
    const prompt = `You are an agricultural AI expert. Provide crop advisory based on:

Soil Type: ${farmData.soilType}
Location: ${farmData.location}
Season: ${farmData.season}
Previous Crop: ${farmData.previousCrop}
Available Resources: ${JSON.stringify(farmData.resources)}

Provide:
1. Best crops to plant
2. Planting schedule
3. Fertilizer recommendations
4. Pest management
5. Expected yield and market price

Format as JSON.`;

    const response = await this.generateResponse(prompt, { temperature: 0.4 });
    return JSON.parse(response);
  }

  /**
   * Personalized learning path generator
   * @param {object} studentProfile - Student profile and goals
   * @returns {Promise<object>} Learning path
   */
  async generateLearningPath(studentProfile) {
    const prompt = `Create a personalized learning path for:

Current Level: ${studentProfile.currentLevel}
Goal: ${studentProfile.goal}
Available Time: ${studentProfile.availableTime} hours/week
Learning Style: ${studentProfile.learningStyle}
Interests: ${studentProfile.interests.join(', ')}

Provide:
1. Week-by-week curriculum
2. Resources and materials
3. Practice exercises
4. Milestones and assessments
5. Estimated completion time

Format as JSON.`;

    const response = await this.generateResponse(prompt, { temperature: 0.5 });
    return JSON.parse(response);
  }

  /**
   * Content generation for multiple formats
   * @param {string} topic - Content topic
   * @param {string} format - Content format (blog, social, video-script)
   * @param {string} language - Target language
   * @returns {Promise<string>} Generated content
   */
  async generateContent(topic, format, language = 'en') {
    const prompt = `Generate ${format} content about: ${topic}
Language: ${language}
Make it engaging, informative, and culturally appropriate for Indian audience.`;

    return await this.generateResponse(prompt, { temperature: 0.8 });
  }

  /**
   * Retail demand forecasting insights
   * @param {object} salesData - Historical sales data
   * @returns {Promise<object>} Demand insights
   */
  async demandForecastInsights(salesData) {
    const prompt = `Analyze this retail sales data and provide demand forecasting insights:

${JSON.stringify(salesData)}

Provide:
1. Demand trends
2. Seasonal patterns
3. Product recommendations
4. Inventory optimization suggestions
5. Pricing strategy

Format as JSON.`;

    const response = await this.generateResponse(prompt, { temperature: 0.3 });
    return JSON.parse(response);
  }

  /**
   * Community grievance analysis and routing
   * @param {string} grievance - Grievance description
   * @returns {Promise<object>} Analysis and routing
   */
  async analyzeGrievance(grievance) {
    const prompt = `Analyze this community grievance and suggest routing:

Grievance: ${grievance}

Provide:
1. Category (infrastructure, health, education, etc.)
2. Priority (low, medium, high, critical)
3. Recommended department
4. Estimated resolution time
5. Similar past cases

Format as JSON.`;

    const response = await this.generateResponse(prompt, { temperature: 0.2 });
    return JSON.parse(response);
  }
}

module.exports = new BedrockService();
