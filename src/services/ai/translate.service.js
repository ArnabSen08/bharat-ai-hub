const { TranslateClient, TranslateTextCommand } = require('@aws-sdk/client-translate');
const logger = require('../../utils/logger');

class TranslateService {
  constructor() {
    this.client = new TranslateClient({
      region: process.env.AWS_REGION || 'ap-south-1'
    });
    
    // Indian languages supported
    this.supportedLanguages = {
      'hi': 'Hindi',
      'bn': 'Bengali',
      'te': 'Telugu',
      'mr': 'Marathi',
      'ta': 'Tamil',
      'ur': 'Urdu',
      'gu': 'Gujarati',
      'kn': 'Kannada',
      'ml': 'Malayalam',
      'pa': 'Punjabi',
      'en': 'English'
    };
  }

  /**
   * Translate text to target language
   * @param {string} text - Text to translate
   * @param {string} targetLanguage - Target language code
   * @param {string} sourceLanguage - Source language code (default: auto)
   * @returns {Promise<string>} Translated text
   */
  async translateText(text, targetLanguage, sourceLanguage = 'auto') {
    try {
      const command = new TranslateTextCommand({
        Text: text,
        SourceLanguageCode: sourceLanguage,
        TargetLanguageCode: targetLanguage
      });

      const response = await this.client.send(command);
      
      logger.info(`Text translated from ${response.SourceLanguageCode} to ${targetLanguage}`);
      return response.TranslatedText;
    } catch (error) {
      logger.error('Error translating text:', error);
      throw error;
    }
  }

  /**
   * Translate healthcare content to multiple Indian languages
   * @param {string} content - Healthcare content
   * @param {Array<string>} targetLanguages - Array of target language codes
   * @returns {Promise<object>} Translations object
   */
  async translateHealthcareContent(content, targetLanguages) {
    const translations = {};
    
    for (const lang of targetLanguages) {
      try {
        translations[lang] = await this.translateText(content, lang, 'en');
      } catch (error) {
        logger.error(`Failed to translate to ${lang}:`, error);
        translations[lang] = null;
      }
    }
    
    return translations;
  }

  /**
   * Translate agricultural advisory
   * @param {object} advisory - Advisory object with multiple fields
   * @param {string} targetLanguage - Target language
   * @returns {Promise<object>} Translated advisory
   */
  async translateAdvisory(advisory, targetLanguage) {
    const translated = {};
    
    for (const [key, value] of Object.entries(advisory)) {
      if (typeof value === 'string') {
        translated[key] = await this.translateText(value, targetLanguage, 'en');
      } else if (Array.isArray(value)) {
        translated[key] = await Promise.all(
          value.map(item => 
            typeof item === 'string' 
              ? this.translateText(item, targetLanguage, 'en')
              : item
          )
        );
      } else {
        translated[key] = value;
      }
    }
    
    return translated;
  }

  /**
   * Batch translate for content module
   * @param {Array<string>} texts - Array of texts to translate
   * @param {string} targetLanguage - Target language
   * @returns {Promise<Array<string>>} Array of translated texts
   */
  async batchTranslate(texts, targetLanguage) {
    const translations = await Promise.all(
      texts.map(text => this.translateText(text, targetLanguage, 'en'))
    );
    
    return translations;
  }

  /**
   * Get supported languages
   * @returns {object} Supported languages
   */
  getSupportedLanguages() {
    return this.supportedLanguages;
  }
}

module.exports = new TranslateService();
