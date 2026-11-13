const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authenticate = require('../middleware/authMiddleware');

// Public route: Register new user
router.post('/register', authController.register);

// Public route: Login with credentials
router.post('/login', authController.login);

// Protected route: Inspect current authenticated session
router.get('/me', authenticate, authController.getMe);

module.exports = router;
