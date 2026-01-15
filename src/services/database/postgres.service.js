const { Pool } = require('pg');
const logger = require('../../utils/logger');

class PostgresService {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', err);
    });
  }

  /**
   * Execute a query
   * @param {string} text - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<object>} Query result
   */
  async query(text, params) {
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;
      logger.info('Executed query', { text, duration, rows: res.rowCount });
      return res;
    } catch (error) {
      logger.error('Error executing query', { text, error });
      throw error;
    }
  }

  /**
   * Get a client from the pool for transactions
   * @returns {Promise<object>} Database client
   */
  async getClient() {
    const client = await this.pool.connect();
    const query = client.query;
    const release = client.release;

    // Set a timeout of 5 seconds
    const timeout = setTimeout(() => {
      logger.error('A client has been checked out for more than 5 seconds!');
    }, 5000);

    // Monkey patch the query method to keep track of the last query executed
    client.query = (...args) => {
      client.lastQuery = args;
      return query.apply(client, args);
    };

    client.release = () => {
      clearTimeout(timeout);
      client.query = query;
      client.release = release;
      return release.apply(client);
    };

    return client;
  }

  /**
   * Healthcare: Save patient record
   */
  async savePatientRecord(patientData) {
    const query = `
      INSERT INTO patients (name, age, gender, contact, medical_history, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id
    `;
    const values = [
      patientData.name,
      patientData.age,
      patientData.gender,
      patientData.contact,
      JSON.stringify(patientData.medicalHistory)
    ];
    
    const result = await this.query(query, values);
    return result.rows[0].id;
  }

  /**
   * Healthcare: Get patient records
   */
  async getPatientRecords(patientId) {
    const query = 'SELECT * FROM patients WHERE id = $1';
    const result = await this.query(query, [patientId]);
    return result.rows[0];
  }

  /**
   * Retail: Save sales transaction
   */
  async saveSalesTransaction(transactionData) {
    const query = `
      INSERT INTO sales_transactions (
        product_id, quantity, price, customer_id, timestamp
      ) VALUES ($1, $2, $3, $4, NOW())
      RETURNING id
    `;
    const values = [
      transactionData.productId,
      transactionData.quantity,
      transactionData.price,
      transactionData.customerId
    ];
    
    const result = await this.query(query, values);
    return result.rows[0].id;
  }

  /**
   * Rural: Save farmer profile
   */
  async saveFarmerProfile(farmerData) {
    const query = `
      INSERT INTO farmers (
        name, contact, location, land_size, crops, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id
    `;
    const values = [
      farmerData.name,
      farmerData.contact,
      farmerData.location,
      farmerData.landSize,
      JSON.stringify(farmerData.crops)
    ];
    
    const result = await this.query(query, values);
    return result.rows[0].id;
  }

  /**
   * Learning: Save student progress
   */
  async saveStudentProgress(progressData) {
    const query = `
      INSERT INTO student_progress (
        student_id, course_id, module_id, completion_percentage, last_accessed
      ) VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (student_id, course_id, module_id)
      DO UPDATE SET completion_percentage = $4, last_accessed = NOW()
    `;
    const values = [
      progressData.studentId,
      progressData.courseId,
      progressData.moduleId,
      progressData.completionPercentage
    ];
    
    await this.query(query, values);
  }

  /**
   * Community: Save grievance
   */
  async saveGrievance(grievanceData) {
    const query = `
      INSERT INTO grievances (
        user_id, category, description, priority, status, created_at
      ) VALUES ($1, $2, $3, $4, 'pending', NOW())
      RETURNING id
    `;
    const values = [
      grievanceData.userId,
      grievanceData.category,
      grievanceData.description,
      grievanceData.priority
    ];
    
    const result = await this.query(query, values);
    return result.rows[0].id;
  }

  /**
   * Close all connections
   */
  async close() {
    await this.pool.end();
    logger.info('Database pool closed');
  }
}

module.exports = new PostgresService();
