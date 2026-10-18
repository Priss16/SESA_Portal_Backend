const request = require('supertest');
const express = require('express');
const seatingRoutes = require('../src/routes/seatingRoutes');

const app = express();
app.use(express.json());

// mock auth middleware
jest.mock('../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: 1, role: 'admin' };
    next();
  },
  authorizeRoles: (...roles) => (req, res, next) => {
    next();
  }
}));

app.use('/api/seating', seatingRoutes);

jest.mock('../src/db', () => ({
  query: jest.fn(),
  execute: jest.fn(),
}));

const db = require('../src/db');

describe('Seating Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/seating', () => {
    it('should return 400 if exam_id is missing', async () => {
      const res = await request(app).get('/api/seating');
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
    });

    it('should return seating assignments for a valid exam', async () => {
      db.query
        .mockResolvedValueOnce([[{ id: 1, department_id: 1 }]]) // exams
        .mockResolvedValueOnce([[{ id: 1, role: 'admin', department_id: 1 }]]) // user
        .mockResolvedValueOnce([[{ id: 1, student_name: 'John Doe', seat_number: 'A1' }]]); // assignments

      const res = await request(app).get('/api/seating?exam_id=1');
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });
});
