const express = require('express');
const router = express.Router();
const Department = require('../models/Department');
const { body, validationResult } = require('express-validator');

// Get all departments
router.get('/', async (req, res, next) => {
  try {
    const { active } = req.query;
    
    let query = {};
    if (active !== undefined) {
      query.isActive = active === 'true';
    }

    const departments = await Department.find(query).sort({ order: 1, createdAt: 1 });

    res.status(200).json({
      success: true,
      count: departments.length,
      data: departments
    });
  } catch (err) {
    next(err);
  }
});

// Get single department
router.get('/:id', async (req, res, next) => {
  try {
    const department = await Department.findById(req.params.id);

    if (!department) {
      return res.status(404).json({
        success: false,
        error: 'Department not found'
      });
    }

    res.status(200).json({
      success: true,
      data: department
    });
  } catch (err) {
    next(err);
  }
});

// Create new department
router.post('/', [
  body('name').notEmpty().withMessage('Department name is required'),
  body('label').notEmpty().withMessage('Department label is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { name, label, order } = req.body;

    // Check if department with same name already exists
    const existingDept = await Department.findOne({ name: name.toLowerCase() });
    if (existingDept) {
      return res.status(400).json({
        success: false,
        error: 'Department with this name already exists'
      });
    }

    // If no order specified, set to highest + 1
    let departmentOrder = order;
    if (departmentOrder === undefined) {
      const lastDept = await Department.findOne().sort({ order: -1 });
      departmentOrder = lastDept ? lastDept.order + 1 : 0;
    }

    const department = await Department.create({
      name: name.toLowerCase(),
      label: label.toUpperCase(),
      order: departmentOrder,
      isActive: true
    });

    res.status(201).json({
      success: true,
      data: department
    });
  } catch (err) {
    next(err);
  }
});

// Update department
router.put('/:id', [
  body('name').optional().notEmpty().withMessage('Department name cannot be empty'),
  body('label').optional().notEmpty().withMessage('Department label cannot be empty')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { name, label, order, isActive } = req.body;

    const department = await Department.findById(req.params.id);

    if (!department) {
      return res.status(404).json({
        success: false,
        error: 'Department not found'
      });
    }

    // Check if new name conflicts with existing department
    if (name && name.toLowerCase() !== department.name) {
      const existingDept = await Department.findOne({ 
        name: name.toLowerCase(),
        _id: { $ne: req.params.id }
      });
      if (existingDept) {
        return res.status(400).json({
          success: false,
          error: 'Department with this name already exists'
        });
      }
    }

    // Update fields
    if (name !== undefined) department.name = name.toLowerCase();
    if (label !== undefined) department.label = label.toUpperCase();
    if (order !== undefined) department.order = order;
    if (isActive !== undefined) department.isActive = isActive;

    await department.save();

    res.status(200).json({
      success: true,
      data: department
    });
  } catch (err) {
    next(err);
  }
});

// Delete department
router.delete('/:id', async (req, res, next) => {
  try {
    const department = await Department.findById(req.params.id);

    if (!department) {
      return res.status(404).json({
        success: false,
        error: 'Department not found'
      });
    }

    await department.deleteOne();

    res.status(200).json({
      success: true,
      data: {},
      message: 'Department deleted successfully'
    });
  } catch (err) {
    next(err);
  }
});

// Reorder departments
router.put('/reorder/batch', [
  body('departments').isArray().withMessage('Departments must be an array'),
  body('departments.*.id').notEmpty().withMessage('Department ID is required'),
  body('departments.*.order').isNumeric().withMessage('Order must be a number')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { departments } = req.body;

    // Update all departments in a transaction-like manner
    const updatePromises = departments.map(dept => 
      Department.findByIdAndUpdate(dept.id, { order: dept.order }, { new: true })
    );

    const updatedDepartments = await Promise.all(updatePromises);

    res.status(200).json({
      success: true,
      data: updatedDepartments,
      message: 'Departments reordered successfully'
    });
  } catch (err) {
    next(err);
  }
});

// Initialize default departments (for setup)
router.post('/initialize', async (req, res, next) => {
  try {
    // Check if departments already exist
    const existingCount = await Department.countDocuments();
    
    if (existingCount > 0) {
      return res.status(400).json({
        success: false,
        error: 'Departments already initialized'
      });
    }

    const defaultDepartments = [
      { name: 'firstprod', label: '1ST PROD', order: 0 },
      { name: 'secondprod', label: '2ND PROD', order: 1 },
      { name: 'hr', label: 'HR', order: 2 },
      { name: 'do', label: 'D.O.', order: 3 },
      { name: 'watneyrobotics', label: 'WATNEY ROBOTICS', order: 4 },
      { name: 'workforcefirstprod', label: 'WORKFORCE (1ST PROD)', order: 5 },
      { name: 'workforcesecondprod', label: 'WORKFORCE (2ND PROD)', order: 6 }
    ];

    const createdDepartments = await Department.insertMany(defaultDepartments);

    res.status(201).json({
      success: true,
      data: createdDepartments,
      message: 'Default departments initialized successfully'
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;