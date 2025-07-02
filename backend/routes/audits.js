const express = require('express');
const router = express.Router();
const Audit = require('../models/Audit');
const Department = require('../models/Department'); // NEW
const { body, validationResult } = require('express-validator');

// Get all audits for a specific month
router.get('/', async (req, res, next) => {
  try {
    const { month, year } = req.query;

    let query = {};

    if (month !== undefined && year !== undefined) {
      query = {
        month: parseInt(month),
        year: parseInt(year)
      };
    }

    const audits = await Audit.find(query)
  .populate('createdBy', 'username')
  .sort({ date: 1 });

    res.status(200).json({
      success: true,
      count: audits.length,
      data: audits
    });
  } catch (err) {
    next(err);
  }
});

// Get single audit by date
router.get('/:date', async (req, res, next) => {
  try {
    const date = new Date(req.params.date);

    const audit = await Audit.findOne({ date })
  .populate('createdBy', 'username');

    if (!audit) {
      return res.status(404).json({
        success: false,
        error: 'Audit not found'
      });
    }

    res.status(200).json({
      success: true,
      data: audit
    });
  } catch (err) {
    next(err);
  }
});

// Create new audit with dynamic department support
router.post('/', [
  body('date').isISO8601(),
  body('items').isObject(),
  body('otherItems').optional().isObject(),
  body('missingItems').optional().isObject()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const auditDate = new Date(req.body.date);

    const existingAudit = await Audit.findOne({ date: auditDate });
    if (existingAudit) {
      return res.status(400).json({
        success: false,
        error: 'Audit already exists for this date'
      });
    }

    // Get active departments to validate the audit data structure
    const departments = await Department.find({ isActive: true });
    const departmentNames = departments.map(d => d.name);

    // Validate that items contain valid department fields
    const { items } = req.body;
    const mainItems = ['CPU', 'Monitor', 'Keyboard', 'Mouse', 'Headset'];
    
    // Ensure all main items have proper structure
    mainItems.forEach(itemName => {
      if (!items[itemName]) {
        items[itemName] = {};
      }
      
      // Initialize department values
      departmentNames.forEach(deptName => {
        if (items[itemName][deptName] === undefined) {
          items[itemName][deptName] = 0;
        }
      });
      
      // Calculate totals
      let total = 0;
      departmentNames.forEach(deptName => {
        total += items[itemName][deptName] || 0;
      });
      
      items[itemName].total = total;
      items[itemName].stock = items[itemName].stock || 0;
      items[itemName].defectives = items[itemName].defectives || 0;
      items[itemName].overallTotal = total + (items[itemName].stock || 0) + (items[itemName].defectives || 0);
    });

    const auditData = {
  ...req.body,
  date: auditDate,
  site: req.body.site || 'Unknown', // Add default site
  month: auditDate.getMonth(),
  year: auditDate.getFullYear(),
  createdBy: req.user ? req.user._id : null, // Use authenticated user if available
  items: items
};

    const audit = await Audit.create(auditData);

    res.status(201).json({
      success: true,
      data: audit
    });
  } catch (err) {
    next(err);
  }
});

// Update audit with dynamic department support
router.put('/:date', [
  body('items').optional().isObject(),
  body('otherItems').optional().isObject(),
  body('missingItems').optional().isObject()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const date = new Date(req.params.date);

    const audit = await Audit.findOne({ date });

    if (!audit) {
      return res.status(404).json({
        success: false,
        error: 'Audit not found'
      });
    }

    // Get active departments for validation
    const departments = await Department.find({ isActive: true });
    const departmentNames = departments.map(d => d.name);

    // Update fields if provided
    if (req.body.items) {
      const { items } = req.body;
      const mainItems = ['CPU', 'Monitor', 'Keyboard', 'Mouse', 'Headset'];
      
      // Recalculate totals for updated items
      mainItems.forEach(itemName => {
        if (items[itemName]) {
          let total = 0;
          departmentNames.forEach(deptName => {
            if (items[itemName][deptName] !== undefined) {
              total += items[itemName][deptName] || 0;
            }
          });
          
          items[itemName].total = total;
          items[itemName].overallTotal = total + 
            (items[itemName].stock || 0) + 
            (items[itemName].defectives || 0);
        }
      });
      
      audit.items = items;
    }
    
    if (req.body.otherItems) {
      audit.otherItems = req.body.otherItems;
    }
    
    if (req.body.missingItems) {
      audit.missingItems = req.body.missingItems;
    }

    await audit.save();

    res.status(200).json({
      success: true,
      data: audit
    });
  } catch (err) {
    next(err);
  }
});

// Delete audit
router.delete('/:date', async (req, res, next) => {
  try {
    const date = new Date(req.params.date);

    const audit = await Audit.findOne({ date });

    if (!audit) {
      return res.status(404).json({
        success: false,
        error: 'Audit not found'
      });
    }

    await audit.deleteOne();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    next(err);
  }
});

// NEW: Get audit template with current departments
router.get('/template/current', async (req, res, next) => {
  try {
    const departments = await Department.find({ isActive: true }).sort({ order: 1 });
    const mainItems = ['CPU', 'Monitor', 'Keyboard', 'Mouse', 'Headset'];
    const otherItems = ['Laptop', 'Webcam', 'RAM', 'SSD'];
    const missingItems = ['CPU', 'Monitor', 'Keyboard', 'Mouse', 'Headset'];
    
    const template = {
      items: {},
      otherItems: {},
      missingItems: {}
    };
    
    // Create template structure for main items
    mainItems.forEach(item => {
      template.items[item] = {
        total: 0,
        stock: 0,
        defectives: 0,
        overallTotal: 0
      };
      
      // Add department fields
      departments.forEach(dept => {
        template.items[item][dept.name] = 0;
      });
    });
    
    // Create template for other items
    otherItems.forEach(item => {
      template.otherItems[item] = 0;
    });
    
    // Create template for missing items
    missingItems.forEach(item => {
      template.missingItems[item] = 0;
    });
    
    res.status(200).json({
      success: true,
      data: {
        template,
        departments: departments.map(d => ({ name: d.name, label: d.label, order: d.order })),
        mainItems,
        otherItems,
        missingItems
      }
    });
  } catch (err) {
    next(err);
  }
});

// NEW: Bulk update audits when departments change
router.post('/migrate-departments', async (req, res, next) => {
  try {
    const { addedDepartments, removedDepartments } = req.body;
    
    if (!addedDepartments && !removedDepartments) {
      return res.status(400).json({
        success: false,
        error: 'Please specify departments to add or remove'
      });
    }
    
    const audits = await Audit.find({});
    let updatedCount = 0;
    
    for (const audit of audits) {
      let needsUpdate = false;
      const items = audit.items || {};
      
      Object.keys(items).forEach(itemKey => {
        const item = items[itemKey];
        
        // Add new departments with 0 values
        if (addedDepartments && Array.isArray(addedDepartments)) {
          addedDepartments.forEach(deptName => {
            if (item[deptName] === undefined) {
              item[deptName] = 0;
              needsUpdate = true;
            }
          });
        }
        
        // Remove departments (optional - you might want to keep historical data)
        if (removedDepartments && Array.isArray(removedDepartments)) {
          removedDepartments.forEach(deptName => {
            if (item[deptName] !== undefined) {
              delete item[deptName];
              needsUpdate = true;
              
              // Recalculate totals
              let total = 0;
              Object.keys(item).forEach(key => {
                if (!['total', 'stock', 'defectives', 'overallTotal'].includes(key)) {
                  total += item[key] || 0;
                }
              });
              item.total = total;
              item.overallTotal = total + (item.stock || 0) + (item.defectives || 0);
            }
          });
        }
      });
      
      if (needsUpdate) {
        audit.items = items;
        await audit.save();
        updatedCount++;
      }
    }
    
    res.status(200).json({
      success: true,
      data: {
        updatedAudits: updatedCount,
        message: `Successfully updated ${updatedCount} audits`
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;