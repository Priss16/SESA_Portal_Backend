const request = require('supertest');
const express = require('express');
const authRoutes = require('../src/routes/authRoutes');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

// Mock the DB connection
jest.mock('../src/db', () => ({
  query: jest.fn(),
  execute: jest.fn(),
}));

const db = require('../src/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

describe('Auth Endpoints', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test_secret';
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('should return 400 if credentials are missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
    });

    it('should login successfully with valid credentials', async () => {
      const mockUser = {
        id: 1,
        username: 'admin',
        password_hash: await bcrypt.hash('password123', 10),
        role: 'admin',
        is_active: 1
      };

      db.query.mockResolvedValue([[mockUser]]);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'password123'
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
    });

    it('should return 401 with invalid credentials', async () => {
      const mockUser = {
        id: 1,
        username: 'admin',
        password_hash: await bcrypt.hash('password123', 10),
        role: 'admin',
        is_active: 1
      };

      db.query.mockResolvedValue([[mockUser]]);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'wrongpassword'
        });

      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
    });
  });
});
