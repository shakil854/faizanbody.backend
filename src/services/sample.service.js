import db from '../config/db.js';

/**
 * Business logic layer
 * Keeps controllers clean and focused only on HTTP req/res
 */
class SampleService {
  async getWelcomeMessage() {
    return {
      title: 'Welcome to FaizanBody API',
      version: '1.0.0',
      database: 'MySQL (mysql2/promise Pool)',
      features: [
        'Modular Clean Architecture',
        'MySQL Database Connection Pool',
        'Global Error Handling',
        'Async Handler Wrapper',
        'Centralized Axios Instance Integration',
        'Standardized JSON Responses',
      ],
      author: 'Senior Software Engineer Architecture',
    };
  }

  async getSampleItems() {
    try {
      // 1. Try querying from MySQL database table
      const [rows] = await db.query('SELECT id, name, category, status FROM vehicle_models LIMIT 10');
      if (rows && rows.length > 0) {
        return rows;
      }
    } catch (dbError) {
      // If table doesn't exist yet or connection pending, fallback gracefully with demo data
      console.warn('⚠️ [DB Notice] vehicle_models table query fallback:', dbError.message);
    }

    // Default fallback sample items
    return [
      { id: 1, name: 'Truck Body Model Alpha', category: 'Heavy Duty', status: 'Active' },
      { id: 2, name: 'Tipper Body Model X', category: 'Tipper', status: 'Active' },
      { id: 3, name: 'Container Body Spec-Z', category: 'Container', status: 'Pending Review' },
    ];
  }
}

export const sampleService = new SampleService();
