const express = require('express');
const router = express.Router();
const Bay = require('../models/bay');
const Station = require('../models/Station');
const { body, validationResult, query } = require('express-validator');

// Get all bays by device type
router.get('/:deviceType', async (req, res, next) => {
  try {
    const { deviceType } = req.params;

    if (!['mouse', 'keyboard', 'headset'].includes(deviceType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid device type'
      });
    }

    const bays = await Bay.find({ deviceType, isActive: true })
      .sort({ name: 1 })
      .populate('stationsCount');

    res.status(200).json({
      success: true,
      count: bays.length,
      data: bays
    });
  } catch (err) {
    next(err);
  }
});

// Create new bay
router.post('/', [
  body('name').notEmpty().withMessage('Bay name is required').isLength({ max: 20 }),
  body('deviceType').isIn(['mouse', 'keyboard', 'headset']).withMessage('Invalid device type'),
  body('position.x').isNumeric().withMessage('Position X must be a number'),
  body('position.y').isNumeric().withMessage('Position Y must be a number'),
  body('size.width').optional().isNumeric().withMessage('Width must be a number'),
  body('size.height').optional().isNumeric().withMessage('Height must be a number')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { name, deviceType, position, size, color, metadata } = req.body;

    // Check if bay name already exists for this device type (only active bays)
    const existingActiveBay = await Bay.findOne({ 
      name: name.toUpperCase(), 
      deviceType,
      isActive: true 
    });

    if (existingActiveBay) {
      return res.status(400).json({
        success: false,
        error: `Bay ${name} already exists for ${deviceType}`
      });
    }

    // Check if there's a deleted bay with the same name - reactivate it instead
    const deletedBay = await Bay.findOne({
      name: name.toUpperCase(),
      deviceType,
      isActive: false
    });

    if (deletedBay) {
      // Reactivate the deleted bay with new position and properties
      deletedBay.isActive = true;
      deletedBay.position = position;
      deletedBay.size = size || { width: 55, height: 50 };
      deletedBay.color = color || '#6c757d';
      deletedBay.metadata = metadata || {};
      deletedBay.updatedAt = new Date();

      await deletedBay.save();

      return res.status(201).json({
        success: true,
        data: deletedBay,
        message: `Bay ${name} reactivated successfully`
      });
    }

    // Create new bay if no existing or deleted bay found
    const bay = await Bay.create({
      name: name.toUpperCase(),
      deviceType,
      position,
      size: size || { width: 55, height: 50 },
      color: color || '#6c757d',
      metadata: metadata || {}
    });

    res.status(201).json({
      success: true,
      data: bay
    });
  } catch (err) {
    // Handle MongoDB duplicate key error specifically
    if (err.code === 11000) {
      // This should rarely happen now since we check for deleted bays
      const bayName = req.body.name || 'Unknown';
      const deviceType = req.body.deviceType || 'Unknown';
      return res.status(400).json({
        success: false,
        error: `Bay ${bayName} already exists for ${deviceType}`
      });
    }
    next(err);
  }
});

// Copy bays (get data for copying)
router.post('/copy', [
  body('bayIds').isArray().withMessage('Bay IDs must be an array'),
  body('bayIds.*').isMongoId().withMessage('Invalid bay ID')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { bayIds } = req.body;
    
    const bays = await Bay.find({ 
      _id: { $in: bayIds }, 
      isActive: true 
    });

    if (bays.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No bays found with provided IDs'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        type: 'bay',
        items: bays,
        copyTimestamp: new Date(),
        count: bays.length
      }
    });
  } catch (err) {
    next(err);
  }
});

// Paste bays (create new bays from copied data)
router.post('/paste', [
  body('data').isObject().withMessage('Data must be an object'),
  body('position').optional().isObject(),
  body('position.x').optional().isNumeric(),
  body('position.y').optional().isNumeric()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { data, position = { x: 50, y: 50 } } = req.body;
    const { type, items } = data;
    
    if (type !== 'bay') {
      return res.status(400).json({
        success: false,
        error: 'Invalid data type for bay paste operation'
      });
    }

    const createdBays = [];
    const timestamp = Date.now();
    
    for (let i = 0; i < items.length; i++) {
      const originalBay = items[i];
      
      // Generate unique name for copied bay
      let copyName = `${originalBay.name}_COPY`;
      let counter = 1;
      
      // Check if name already exists and increment counter
      while (await Bay.findOne({ 
        name: copyName, 
        deviceType: originalBay.deviceType, 
        isActive: true 
      })) {
        copyName = `${originalBay.name}_COPY_${counter}`;
        counter++;
      }
      
      const newBay = await Bay.create({
        name: copyName,
        deviceType: originalBay.deviceType,
        position: {
          x: originalBay.position.x + position.x + (i * 100), // Offset each copy
          y: originalBay.position.y + position.y + (i * 20)
        },
        size: originalBay.size || { width: 55, height: 50 },
        color: originalBay.color || '#6c757d',
        metadata: {
          ...originalBay.metadata,
          copiedFrom: originalBay._id,
          copiedAt: new Date()
        }
      });
      
      createdBays.push(newBay);
    }

    res.status(201).json({
      success: true,
      data: {
        message: `Pasted ${createdBays.length} bay(s)`,
        createdBays,
        count: createdBays.length
      }
    });
  } catch (err) {
    next(err);
  }
});

// Duplicate bay (single bay duplication)
router.post('/:id/duplicate', [
  body('newName').optional().isString().isLength({ max: 20 }),
  body('position').optional().isObject(),
  body('includeStations').optional().isBoolean()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const bay = await Bay.findById(req.params.id);
    
    if (!bay) {
      return res.status(404).json({
        success: false,
        error: 'Bay not found'
      });
    }

    const { newName, position = { x: 50, y: 50 }, includeStations = false } = req.body;
    
    // Generate name for duplicated bay
    let duplicateName = newName || `${bay.name}_DUPLICATE`;
    let counter = 1;
    
    while (await Bay.findOne({ 
      name: duplicateName, 
      deviceType: bay.deviceType, 
      isActive: true 
    })) {
      duplicateName = newName ? `${newName}_${counter}` : `${bay.name}_DUPLICATE_${counter}`;
      counter++;
    }
    
    // Create duplicated bay
    const duplicatedBay = await Bay.create({
      name: duplicateName,
      deviceType: bay.deviceType,
      position: {
        x: bay.position.x + position.x,
        y: bay.position.y + position.y
      },
      size: bay.size,
      color: bay.color,
      metadata: {
        ...bay.metadata,
        duplicatedFrom: bay._id,
        duplicatedAt: new Date()
      }
    });

    let duplicatedStations = [];
    
    // Duplicate stations if requested
    if (includeStations) {
      const stations = await Station.find({ 
        bay: bay.name, 
        deviceType: bay.deviceType, 
        isActive: true 
      });
      
      if (stations.length > 0) {
        const maxStationNumber = await Station.getMaxStationNumber(bay.deviceType);
        
        for (let i = 0; i < stations.length; i++) {
          const originalStation = stations[i];
          const newStation = await Station.create({
            stationNumber: maxStationNumber + i + 1,
            bay: duplicatedBay.name,
            deviceType: originalStation.deviceType,
            position: {
              x: originalStation.position.x + position.x,
              y: originalStation.position.y + position.y
            }
            // Don't copy device data - create empty stations
          });
          duplicatedStations.push(newStation);
        }
      }
    }

    res.status(201).json({
      success: true,
      data: {
        bay: duplicatedBay,
        stationCount: duplicatedStations.length,
        stations: duplicatedStations,
        message: `Bay duplicated successfully${includeStations ? ` with ${duplicatedStations.length} stations` : ''}`
      }
    });
  } catch (err) {
    next(err);
  }
});

// Update bay
router.put('/:id', [
  body('name').optional().isLength({ max: 20 }),
  body('position.x').optional().isNumeric(),
  body('position.y').optional().isNumeric(),
  body('size.width').optional().isNumeric(),
  body('size.height').optional().isNumeric()
], async (req, res, next) => {
  try {
    const validationErrors = validationResult(req);
    if (!validationErrors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: validationErrors.array() 
      });
    }

    const bay = await Bay.findById(req.params.id);

    if (!bay) {
      return res.status(404).json({
        success: false,
        error: 'Bay not found'
      });
    }

    // Check for duplicate bay name if updating (only check active bays)
    if (req.body.name && req.body.name.toUpperCase() !== bay.name) {
      const existingBay = await Bay.findOne({
        name: req.body.name.toUpperCase(),
        deviceType: bay.deviceType,
        isActive: true,
        _id: { $ne: req.params.id }
      });

      if (existingBay) {
        return res.status(400).json({
          success: false,
          error: `Bay ${req.body.name} already exists for ${bay.deviceType}`
        });
      }

      // Update bay name in all associated stations
      await Station.updateMany(
        { bay: bay.name, deviceType: bay.deviceType },
        { bay: req.body.name.toUpperCase() }
      );
    }

    // Update fields
    Object.keys(req.body).forEach(key => {
      if (key === 'position') {
        if (req.body.position.x !== undefined) bay.position.x = req.body.position.x;
        if (req.body.position.y !== undefined) bay.position.y = req.body.position.y;
      } else if (key === 'size') {
        if (req.body.size.width !== undefined) bay.size.width = req.body.size.width;
        if (req.body.size.height !== undefined) bay.size.height = req.body.size.height;
      } else if (key === 'name') {
        bay[key] = req.body[key].toUpperCase();
      } else {
        bay[key] = req.body[key];
      }
    });

    await bay.save();

    res.status(200).json({
      success: true,
      data: bay
    });
  } catch (err) {
    next(err);
  }
});

// Update bay position (for drag & drop)
router.patch('/:id/position', [
  body('x').isNumeric().withMessage('X position must be a number'),
  body('y').isNumeric().withMessage('Y position must be a number')
], async (req, res, next) => {
  try {
    const positionValidationErrors = validationResult(req);
    if (!positionValidationErrors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: positionValidationErrors.array() 
      });
    }

    const bay = await Bay.findById(req.params.id);

    if (!bay) {
      return res.status(404).json({
        success: false,
        error: 'Bay not found'
      });
    }

    bay.position.x = req.body.x;
    bay.position.y = req.body.y;
    await bay.save();

    res.status(200).json({
      success: true,
      data: bay,
      message: 'Bay position updated successfully'
    });
  } catch (err) {
    next(err);
  }
});

// Delete bay (soft delete)
router.delete('/:id', async (req, res, next) => {
  try {
    const bay = await Bay.findById(req.params.id);

    if (!bay) {
      return res.status(404).json({
        success: false,
        error: 'Bay not found'
      });
    }

    // Check if bay has stations
    const stationsCount = await Station.countDocuments({ 
      bay: bay.name, 
      deviceType: bay.deviceType, 
      isActive: true 
    });

    if (stationsCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete bay with ${stationsCount} stations. Please remove or reassign stations first.`
      });
    }

    // Soft delete
    bay.isActive = false;
    await bay.save();

    res.status(200).json({
      success: true,
      data: {},
      message: 'Bay deleted successfully'
    });
  } catch (err) {
    next(err);
  }
});

// Get bay with stations
router.get('/:id/stations', async (req, res, next) => {
  try {
    const bay = await Bay.findById(req.params.id);

    if (!bay) {
      return res.status(404).json({
        success: false,
        error: 'Bay not found'
      });
    }

    const stations = await Station.find({ 
      bay: bay.name, 
      deviceType: bay.deviceType, 
      isActive: true 
    }).sort({ stationNumber: 1 });

    res.status(200).json({
      success: true,
      data: {
        bay,
        stations,
        stationCount: stations.length
      }
    });
  } catch (err) {
    next(err);
  }
});

// Bulk update bay positions
router.patch('/bulk/positions', [
  body('bays').isArray().withMessage('Bays must be an array'),
  body('bays.*.id').notEmpty().withMessage('Bay ID is required'),
  body('bays.*.x').isNumeric().withMessage('X position must be a number'),
  body('bays.*.y').isNumeric().withMessage('Y position must be a number')
], async (req, res, next) => {
  try {
    const bulkValidationErrors = validationResult(req);
    if (!bulkValidationErrors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: bulkValidationErrors.array() 
      });
    }

    const { bays } = req.body;
    const updatePromises = bays.map(async (bayUpdate) => {
      const bay = await Bay.findById(bayUpdate.id);
      if (bay) {
        bay.position.x = bayUpdate.x;
        bay.position.y = bayUpdate.y;
        return bay.save();
      }
      return null;
    });

    const results = await Promise.all(updatePromises);
    const successCount = results.filter(r => r !== null).length;

    res.status(200).json({
      success: true,
      message: `Updated positions for ${successCount} bays`
    });
  } catch (err) {
    next(err);
  }
});

// Bulk delete bays
router.delete('/bulk/delete', [
  body('bayIds').isArray().withMessage('Bay IDs must be an array'),
  body('bayIds.*').isMongoId().withMessage('Invalid bay ID')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { bayIds } = req.body;
    
    // Check each bay for stations before deleting
    const baysWithStations = [];
    
    for (const bayId of bayIds) {
      const bay = await Bay.findById(bayId);
      if (bay) {
        const stationsCount = await Station.countDocuments({ 
          bay: bay.name, 
          deviceType: bay.deviceType, 
          isActive: true 
        });
        
        if (stationsCount > 0) {
          baysWithStations.push({ name: bay.name, stationCount: stationsCount });
        }
      }
    }
    
    if (baysWithStations.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete bays with stations',
        details: baysWithStations
      });
    }
    
    // Soft delete all bays
    const result = await Bay.updateMany(
      { _id: { $in: bayIds } },
      { isActive: false }
    );

    res.status(200).json({
      success: true,
      message: `Deleted ${result.modifiedCount} bays`,
      deletedCount: result.modifiedCount
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;