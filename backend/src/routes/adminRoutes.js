const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authenticate = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/roleMiddleware');

// All routes in this router require valid JWT and ADMIN role
router.use(authenticate, requireAdmin);

router.get('/users', adminController.listUsers);
router.post('/users', adminController.createUser);

module.exports = router;
