const express = require('express');

const exportController = require('../controllers/export.controller');
const checkAuth = require('../middleware/check-auth');
const checkRole = require('../middleware/check-role');

const router = express.Router();

router.use(checkAuth);

router.get('/', checkRole('staff', 'admin'), exportController.getExports);
router.post('/', checkRole('staff'), exportController.createExport);

module.exports = router;
