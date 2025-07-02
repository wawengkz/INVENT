const express = require('express');
const router = express.Router();
const Station = require('../models/Station');
const { body, validationResult, query } = require('express-validator');

// Middleware to get user's site
function getUserSite(req, res, next) {
  req.userSite = req.user.site;
  next();
}

// Apply middleware to all routes
router.use(getUserSite);

// Get all stations by device type
router.get('/:deviceType', async (req, res, next) => {
  try {
    const { deviceType } = req.params;
    
    if (!['mouse', 'keyboard', 'headset'].includes(deviceType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid device type'
      });
    }

    const stations = await Station.getByDeviceType(deviceType);
    
    res.status(200).json({
      success: true,
      count: stations.length,
      data: stations
    });
  } catch (err) {
    next(err);
  }
});

// Create new station - Updated to include site
router.post('/', [
  body('deviceType').isIn(['mouse', 'keyboard', 'headset']).withMessage('Invalid device type'),
  body('position.x').optional().isNumeric().withMessage('Position X must be a number'),
  body('position.y').optional().isNumeric().withMessage('Position Y must be a number'),
  body('bay').optional().isString().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { deviceType, position, bay } = req.body;

    const stationData = {
      deviceType,
      position: position || { x: 0, y: 0 },
      bay: bay || null,
      site: req.userSite, // Add user's site
      isActive: true
    };

    const station = await Station.create(stationData);

    res.status(201).json({
      success: true,
      data: station
    });
  } catch (err) {
    next(err);
  }
});

// Update station number
router.patch('/:id/number', [
  body('stationNumber').notEmpty().withMessage('Station number is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const station = await Station.findById(req.params.id);
    
    if (!station) {
      return res.status(404).json({
        success: false,
        error: 'Station not found'
      });
    }

    // Check if station number already exists for this device type
    const existingStation = await Station.findOne({
      stationNumber: req.body.stationNumber,
      deviceType: station.deviceType,
      isActive: true,
      _id: { $ne: req.params.id }
    });

    if (existingStation) {
      return res.status(400).json({
        success: false,
        error: `Station number ${req.body.stationNumber} already exists for ${station.deviceType}`
      });
    }

    station.stationNumber = req.body.stationNumber;
    await station.save();

    res.status(200).json({
      success: true,
      data: station
    });
  } catch (err) {
    next(err);
  }
});

// Register device to station (NO UNIQUE CHECK FOR SERIAL)
router.post('/:id/device', [
  body('serialNumber').notEmpty().withMessage('Serial number is required'),
  body('brand').optional().isString().trim(),
  body('model').optional().isString().trim(),
  body('notes').optional().isString().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const station = await Station.findById(req.params.id);
    
    if (!station) {
      return res.status(404).json({
        success: false,
        error: 'Station not found'
      });
    }

    // NO CHECK for duplicate serial numbers - they are allowed
    
    const deviceData = {
      serialNumber: req.body.serialNumber,
      brand: req.body.brand || '',
      model: req.body.model || '',
      notes: req.body.notes || '',
      registeredAt: new Date()
    };

    await station.registerDevice(deviceData);

    res.status(200).json({
      success: true,
      data: station,
      message: 'Device registered successfully'
    });
  } catch (err) {
    next(err);
  }
});

// Update station position
router.patch('/:id/position', [
  body('x').isNumeric().withMessage('X position must be a number'),
  body('y').isNumeric().withMessage('Y position must be a number')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const station = await Station.findById(req.params.id);
    
    if (!station) {
      return res.status(404).json({
        success: false,
        error: 'Station not found'
      });
    }

    await station.updatePosition(req.body.x, req.body.y);

    res.status(200).json({
      success: true,
      data: station
    });
  } catch (err) {
    next(err);
  }
});

// Remove device from station
router.delete('/:id/device', async (req, res, next) => {
  try {
    const station = await Station.findById(req.params.id);
    
    if (!station) {
      return res.status(404).json({
        success: false,
        error: 'Station not found'
      });
    }

    await station.removeDevice();

    res.status(200).json({
      success: true,
      data: station,
      message: 'Device removed successfully'
    });
  } catch (err) {
    next(err);
  }
});

// Delete station
router.delete('/:id', async (req, res, next) => {
  try {
    const station = await Station.findById(req.params.id);
    
    if (!station) {
      return res.status(404).json({
        success: false,
        error: 'Station not found'
      });
    }

    // Soft delete
    station.isActive = false;
    await station.save();

    res.status(200).json({
      success: true,
      data: {},
      message: 'Station deleted successfully'
    });
  } catch (err) {
    next(err);
  }
});

// Get all stations by device type - Updated to filter by site
router.get('/:deviceType', async (req, res, next) => {
  try {
    const { deviceType } = req.params;
    
    if (!['mouse', 'keyboard', 'headset'].includes(deviceType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid device type'
      });
    }

    const stations = await Station.find({ 
      deviceType, 
      site: req.userSite, // Filter by user's site
      isActive: true 
    }).sort({ stationNumber: 1 });
    
    res.status(200).json({
      success: true,
      count: stations.length,
      data: stations
    });
  } catch (err) {
    next(err);
  }
});

// Search stations by serial number (returns multiple if duplicates exist)
router.get('/:deviceType/search', [
  query('serialNumber').optional().isString(),
  query('stationNumber').optional().isNumeric(),
  query('bay').optional().isString()
], async (req, res, next) => {
  try {
    const { deviceType } = req.params;
    const { serialNumber, stationNumber, bay } = req.query;
    
    if (!['mouse', 'keyboard', 'headset'].includes(deviceType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid device type'
      });
    }

    const query = { deviceType, isActive: true };
    
    if (serialNumber) {
      query['device.serialNumber'] = new RegExp(serialNumber, 'i');
    }
    
    if (stationNumber) {
      query.stationNumber = parseInt(stationNumber);
    }
    
    if (bay) {
      query.bay = bay;
    }

    const stations = await Station.find(query).sort({ stationNumber: 1 });

    res.status(200).json({
      success: true,
      count: stations.length,
      data: stations
    });
  } catch (err) {
    next(err);
  }
});

// Bulk create stations
router.post('/bulk', [
  body('stations').isArray().withMessage('Stations must be an array'),
  body('stations.*.deviceType').isIn(['mouse', 'keyboard', 'headset']),
  body('stations.*.position.x').isNumeric(),
  body('stations.*.position.y').isNumeric()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { stations } = req.body;
    const createdStations = [];

    for (const stationData of stations) {
      const station = await Station.create({
        deviceType: stationData.deviceType,
        position: stationData.position,
        bay: stationData.bay || null,
        isActive: true
      });
      createdStations.push(station);
    }

    res.status(201).json({
      success: true,
      count: createdStations.length,
      data: createdStations
    });
  } catch (err) {
    next(err);
  }
});

// Update station bay assignment
router.patch('/:id/bay', [
  body('bay').optional().isString().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const station = await Station.findById(req.params.id);
    
    if (!station) {
      return res.status(404).json({
        success: false,
        error: 'Station not found'
      });
    }

    station.bay = req.body.bay || null;
    await station.save();

    res.status(200).json({
      success: true,
      data: station
    });
  } catch (err) {
    next(err);
  }
});

// Copy stations
router.post('/copy', [
  body('stationIds').isArray().withMessage('Station IDs must be an array'),
  body('stationIds.*').isMongoId().withMessage('Invalid station ID')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { stationIds } = req.body;
    
    const stations = await Station.find({ 
      _id: { $in: stationIds }, 
      isActive: true 
    });

    if (stations.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No stations found with provided IDs'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        type: 'station',
        items: stations,
        copyTimestamp: new Date(),
        count: stations.length
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;