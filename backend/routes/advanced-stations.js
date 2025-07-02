const express = require('express');
const router = express.Router();
const Station = require('../models/Station');
const StationService = require('../services/StationService');
const { body, validationResult, query, param } = require('express-validator');

// Auto-arrange stations in a bay
router.post('/bays/:bayName/:deviceType/arrange', [
  param('bayName').notEmpty().withMessage('Bay name is required'),
  param('deviceType').isIn(['mouse', 'keyboard', 'headset']).withMessage('Invalid device type'),
  body('pattern').optional().isIn(['grid', 'row', 'circle', 'staggered']).withMessage('Invalid layout pattern'),
  body('spacing').optional().isNumeric().withMessage('Spacing must be a number')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { bayName, deviceType } = req.params;
    const { pattern = 'grid', spacing } = req.body;

    const result = await StationService.autoArrangeBay(bayName, deviceType, pattern, spacing);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Duplicate a bay
router.post('/bays/:sourceBay/:deviceType/duplicate', [
  param('sourceBay').notEmpty().withMessage('Source bay name is required'),
  param('deviceType').isIn(['mouse', 'keyboard', 'headset']).withMessage('Invalid device type'),
  body('targetBay').notEmpty().withMessage('Target bay name is required'),
  body('copyDevices').optional().isBoolean().withMessage('Copy devices must be boolean'),
  body('overwrite').optional().isBoolean().withMessage('Overwrite must be boolean')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { sourceBay, deviceType } = req.params;
    const { targetBay, copyDevices = false, overwrite = false } = req.body;

    const result = await StationService.duplicateBay(
      sourceBay, 
      targetBay, 
      deviceType, 
      { copyDevices, overwrite }
    );

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Validate layout
router.get('/layout/:deviceType/validate', [
  param('deviceType').isIn(['mouse', 'keyboard', 'headset']).withMessage('Invalid device type'),
  query('bay').optional().isString().withMessage('Bay must be a string')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { deviceType } = req.params;
    const { bay } = req.query;

    const validation = await StationService.validateLayout(deviceType, bay);

    res.status(200).json({
      success: true,
      data: validation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Auto-fix layout issues
router.post('/layout/:deviceType/autofix', [
  param('deviceType').isIn(['mouse', 'keyboard', 'headset']).withMessage('Invalid device type'),
  body('bay').optional().isString().withMessage('Bay must be a string')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { deviceType } = req.params;
    const { bay } = req.body;

    const result = await StationService.autoFixLayout(deviceType, bay);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Renumber stations in a bay
router.post('/bays/:bayName/:deviceType/renumber', [
  param('bayName').notEmpty().withMessage('Bay name is required'),
  param('deviceType').isIn(['mouse', 'keyboard', 'headset']).withMessage('Invalid device type'),
  body('startNumber').optional().isInt({ min: 1 }).withMessage('Start number must be a positive integer')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { bayName, deviceType } = req.params;
    const { startNumber } = req.body;

    const result = await StationService.renumberBay(bayName, deviceType, startNumber);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Export bay as template
router.get('/bays/:bayName/:deviceType/template', [
  param('bayName').notEmpty().withMessage('Bay name is required'),
  param('deviceType').isIn(['mouse', 'keyboard', 'headset']).withMessage('Invalid device type')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { bayName, deviceType } = req.params;

    const template = await StationService.exportBayTemplate(bayName, deviceType);

    res.status(200).json({
      success: true,
      data: template
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Create bay from template
router.post('/bays/:deviceType/from-template', [
  param('deviceType').isIn(['mouse', 'keyboard', 'headset']).withMessage('Invalid device type'),
  body('template').notEmpty().withMessage('Template is required'),
  body('bayName').notEmpty().withMessage('Bay name is required'),
  body('startPosition').optional().isObject().withMessage('Start position must be an object'),
  body('startPosition.x').optional().isNumeric().withMessage('X position must be numeric'),
  body('startPosition.y').optional().isNumeric().withMessage('Y position must be numeric')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { deviceType } = req.params;
    const { template, bayName, startPosition = { x: 0, y: 0 } } = req.body;

    const result = await StationService.createBayFromTemplate(
      template, 
      bayName, 
      deviceType, 
      startPosition
    );

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Get comprehensive statistics
router.get('/:deviceType/comprehensive-stats', [
  param('deviceType').isIn(['mouse', 'keyboard', 'headset']).withMessage('Invalid device type')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { deviceType } = req.params;

    const stats = await StationService.getComprehensiveStats(deviceType);

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get bay-specific statistics
router.get('/bays/:bayName/:deviceType/stats', [
  param('bayName').notEmpty().withMessage('Bay name is required'),
  param('deviceType').isIn(['mouse', 'keyboard', 'headset']).withMessage('Invalid device type')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { bayName, deviceType } = req.params;

    const stations = await Station.find({ 
      bay: bayName, 
      deviceType, 
      isActive: true 
    });

    const totalStations = stations.length;
    const registeredDevices = stations.filter(s => s.device?.serialNumber).length;
    const emptyStations = totalStations - registeredDevices;
    const lockedStations = stations.filter(s => s.isLocked).length;
    const stationsNeedingAudit = stations.filter(s => s.needsAudit()).length;

    // Calculate layout bounds
    const positions = stations.map(s => s.position);
    const bounds = positions.length > 0 ? {
      minX: Math.min(...positions.map(p => p.x)),
      maxX: Math.max(...positions.map(p => p.x)),
      minY: Math.min(...positions.map(p => p.y)),
      maxY: Math.max(...positions.map(p => p.y))
    } : null;

    res.status(200).json({
      success: true,
      data: {
        bayName,
        deviceType,
        totalStations,
        registeredDevices,
        emptyStations,
        lockedStations,
        stationsNeedingAudit,
        registrationRate: totalStations > 0 ? ((registeredDevices / totalStations) * 100).toFixed(1) : 0,
        bounds,
        lastUpdated: new Date()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Clone multiple stations
router.post('/clone-multiple', [
  body('stationIds').isArray().withMessage('Station IDs must be an array'),
  body('stationIds.*').isMongoId().withMessage('Invalid station ID'),
  body('targetBay').optional().isString().withMessage('Target bay must be a string'),
  body('offsetX').optional().isNumeric().withMessage('Offset X must be numeric'),
  body('offsetY').optional().isNumeric().withMessage('Offset Y must be numeric')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { stationIds, targetBay, offsetX = 100, offsetY = 50 } = req.body;

    const sourceStations = await Station.find({ _id: { $in: stationIds } });
    
    if (sourceStations.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No stations found with provided IDs'
      });
    }

    const deviceType = sourceStations[0].deviceType;
    const maxStationNumber = await StationService.getMaxStationNumber(deviceType);
    const clonedStations = [];

    for (let i = 0; i < sourceStations.length; i++) {
      const sourceStation = sourceStations[i];
      const newStationNumber = maxStationNumber + i + 1;
      
      const clonedStation = await Station.create({
        stationNumber: newStationNumber,
        bay: targetBay || sourceStation.bay,
        deviceType: sourceStation.deviceType,
        position: {
          x: sourceStation.position.x + offsetX,
          y: sourceStation.position.y + offsetY
        },
        layout: { ...sourceStation.layout },
        metadata: { 
          ...sourceStation.metadata,
          tags: [...(sourceStation.metadata.tags || [])]
        }
      });

      clonedStations.push(clonedStation);
    }

    res.status(201).json({
      success: true,
      data: {
        message: `Cloned ${clonedStations.length} stations`,
        clonedStations
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Batch update station metadata
router.patch('/batch/metadata', [
  body('stationIds').isArray().withMessage('Station IDs must be an array'),
  body('stationIds.*').isMongoId().withMessage('Invalid station ID'),
  body('metadata').isObject().withMessage('Metadata must be an object'),
  body('metadata.department').optional().isString(),
  body('metadata.shift').optional().isIn(['morning', 'afternoon', 'evening', 'night', 'all']),
  body('metadata.priority').optional().isInt({ min: 1, max: 5 }),
  body('addTags').optional().isArray(),
  body('removeTags').optional().isArray()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { stationIds, metadata, addTags, removeTags } = req.body;

    const updatePromises = stationIds.map(async (stationId) => {
      const station = await Station.findById(stationId);
      if (!station) return null;

      // Update metadata
      Object.keys(metadata).forEach(key => {
        if (metadata[key] !== undefined) {
          station.metadata[key] = metadata[key];
        }
      });

      // Add tags
      if (addTags && addTags.length > 0) {
        await station.addTags(addTags);
      }

      // Remove tags
      if (removeTags && removeTags.length > 0) {
        await station.removeTags(removeTags);
      }

      return station.save();
    });

    const updatedStations = await Promise.all(updatePromises);
    const successCount = updatedStations.filter(s => s !== null).length;

    res.status(200).json({
      success: true,
      data: {
        message: `Updated metadata for ${successCount} stations`,
        updatedCount: successCount
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Lock/unlock stations
router.patch('/batch/lock', [
  body('stationIds').isArray().withMessage('Station IDs must be an array'),
  body('stationIds.*').isMongoId().withMessage('Invalid station ID'),
  body('locked').isBoolean().withMessage('Locked must be boolean')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { stationIds, locked } = req.body;

    const result = await Station.updateMany(
      { _id: { $in: stationIds } },
      { isLocked: locked }
    );

    res.status(200).json({
      success: true,
      data: {
        message: `${locked ? 'Locked' : 'Unlocked'} ${result.modifiedCount} stations`,
        modifiedCount: result.modifiedCount
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Add audit entry to stations
router.post('/batch/audit', [
  body('stationIds').isArray().withMessage('Station IDs must be an array'),
  body('stationIds.*').isMongoId().withMessage('Invalid station ID'),
  body('status').isIn(['present', 'missing', 'damaged', 'replaced']).withMessage('Invalid audit status'),
  body('auditedBy').notEmpty().withMessage('Audited by is required'),
  body('notes').optional().isString()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { stationIds, status, auditedBy, notes } = req.body;

    const auditPromises = stationIds.map(async (stationId) => {
      const station = await Station.findById(stationId);
      if (!station) return null;

      return station.addAudit({
        status,
        auditedBy,
        notes,
        auditDate: new Date()
      });
    });

    const auditedStations = await Promise.all(auditPromises);
    const successCount = auditedStations.filter(s => s !== null).length;

    res.status(200).json({
      success: true,
      data: {
        message: `Added audit entry to ${successCount} stations`,
        auditedCount: successCount
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;