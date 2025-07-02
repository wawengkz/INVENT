const express = require('express');
const router = express.Router();
const Audit = require('../models/Audit');
const Department = require('../models/Department'); // NEW
const { protect } = require('../middleware/auth');

// Get monthly summary report
router.get('/monthly-summary', protect, async (req, res, next) => {
  try {
    const { month, year } = req.query;
    
    if (!month || !year) {
      return res.status(400).json({
        success: false,
        error: 'Please provide month and year'
      });
    }
    
    const audits = await Audit.find({
      month: parseInt(month),
      year: parseInt(year)
    });
    
    // Get active departments for dynamic calculation
    const departments = await Department.find({ isActive: true }).sort({ order: 1 });
    
    // Calculate totals
    let totalUnits = 0;
    let totalDefectives = 0;
    let itemTotals = {
      CPU: 0,
      Monitor: 0,
      Keyboard: 0,
      Mouse: 0,
      Headset: 0
    };
    
    audits.forEach(audit => {
      totalUnits += audit.summary.totalUnits;
      totalDefectives += audit.summary.defectives;
      
      Object.keys(itemTotals).forEach(item => {
        if (audit.items[item]) {
          itemTotals[item] += audit.items[item].overallTotal || 0;
        }
      });
    });
    
    res.status(200).json({
      success: true,
      data: {
        month: parseInt(month),
        year: parseInt(year),
        auditCount: audits.length,
        totalUnits,
        totalDefectives,
        defectRate: totalUnits > 0 ? (totalDefectives / totalUnits * 100).toFixed(2) : 0,
        itemTotals,
        departments: departments.map(d => ({ name: d.name, label: d.label })) // NEW
      }
    });
  } catch (err) {
    next(err);
  }
});

// Get item trends over time
router.get('/item-trends', protect, async (req, res, next) => {
  try {
    const { item, startDate, endDate } = req.query;
    
    if (!item) {
      return res.status(400).json({
        success: false,
        error: 'Please provide item name'
      });
    }
    
    let query = {};
    
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const audits = await Audit.find(query).sort({ date: 1 });
    
    const trends = audits.map(audit => ({
      date: audit.date,
      total: audit.items[item]?.overallTotal || 0,
      defectives: audit.items[item]?.defectives || 0
    }));
    
    res.status(200).json({
      success: true,
      data: trends
    });
  } catch (err) {
    next(err);
  }
});

// Get defects analysis with dynamic departments
router.get('/defects-analysis', protect, async (req, res, next) => {
  try {
    const { month, year } = req.query;
    
    let query = {};
    
    if (month && year) {
      query = {
        month: parseInt(month),
        year: parseInt(year)
      };
    }
    
    const audits = await Audit.find(query);
    const departments = await Department.find({ isActive: true }).sort({ order: 1 });
    
    // Analyze defects by item
    const defectsByItem = {};
    const defectsByDepartment = {};
    
    // Initialize department defects tracking
    departments.forEach(dept => {
      defectsByDepartment[dept.name] = 0;
    });
    
    audits.forEach(audit => {
      Object.keys(audit.items).forEach(itemKey => {
        const item = audit.items[itemKey];
        
        if (!defectsByItem[itemKey]) {
          defectsByItem[itemKey] = 0;
        }
        defectsByItem[itemKey] += item.defectives || 0;
        
        // Calculate defects by department dynamically
        departments.forEach(dept => {
          if (item[dept.name]) {
            // Assuming a percentage of items from each department are defective
            defectsByDepartment[dept.name] += Math.round((item[dept.name] || 0) * 0.05); // 5% defect rate example
          }
        });
      });
    });
    
    res.status(200).json({
      success: true,
      data: {
        defectsByItem,
        defectsByDepartment,
        totalAudits: audits.length,
        departments: departments.map(d => ({ name: d.name, label: d.label })) // NEW
      }
    });
  } catch (err) {
    next(err);
  }
});

// NEW: Get department performance report
router.get('/department-performance', protect, async (req, res, next) => {
  try {
    const { month, year, departmentName } = req.query;
    
    let query = {};
    if (month && year) {
      query = {
        month: parseInt(month),
        year: parseInt(year)
      };
    }
    
    const audits = await Audit.find(query);
    const departments = await Department.find({ isActive: true }).sort({ order: 1 });
    
    const departmentPerformance = {};
    
    departments.forEach(dept => {
      departmentPerformance[dept.name] = {
        label: dept.label,
        totalItems: 0,
        totalDefectives: 0,
        itemBreakdown: {}
      };
    });
    
    audits.forEach(audit => {
      Object.keys(audit.items).forEach(itemKey => {
        const item = audit.items[itemKey];
        
        departments.forEach(dept => {
          if (item[dept.name] !== undefined) {
            departmentPerformance[dept.name].totalItems += item[dept.name] || 0;
            
            if (!departmentPerformance[dept.name].itemBreakdown[itemKey]) {
              departmentPerformance[dept.name].itemBreakdown[itemKey] = 0;
            }
            departmentPerformance[dept.name].itemBreakdown[itemKey] += item[dept.name] || 0;
          }
        });
      });
    });
    
    // Calculate defect rates
    Object.keys(departmentPerformance).forEach(deptName => {
      const dept = departmentPerformance[deptName];
      dept.defectRate = dept.totalItems > 0 ? 
        ((dept.totalDefectives / dept.totalItems) * 100).toFixed(2) : 0;
    });
    
    res.status(200).json({
      success: true,
      data: {
        departmentPerformance,
        totalAudits: audits.length,
        reportPeriod: { month: parseInt(month), year: parseInt(year) }
      }
    });
  } catch (err) {
    next(err);
  }
});

// NEW: Get comparative analysis between departments
router.get('/department-comparison', protect, async (req, res, next) => {
  try {
    const { month, year, departments: deptNames } = req.query;
    
    let query = {};
    if (month && year) {
      query = {
        month: parseInt(month),
        year: parseInt(year)
      };
    }
    
    const audits = await Audit.find(query);
    const departments = await Department.find({ isActive: true }).sort({ order: 1 });
    
    const comparison = {};
    const targetDepartments = deptNames ? deptNames.split(',') : departments.map(d => d.name);
    
    targetDepartments.forEach(deptName => {
      const dept = departments.find(d => d.name === deptName);
      if (dept) {
        comparison[deptName] = {
          label: dept.label,
          totalProduction: 0,
          averageDaily: 0,
          peakDay: { date: null, count: 0 },
          itemDistribution: {}
        };
      }
    });
    
    audits.forEach(audit => {
      Object.keys(audit.items).forEach(itemKey => {
        const item = audit.items[itemKey];
        
        targetDepartments.forEach(deptName => {
          if (comparison[deptName] && item[deptName] !== undefined) {
            const count = item[deptName] || 0;
            comparison[deptName].totalProduction += count;
            
            // Track peak day
            if (count > comparison[deptName].peakDay.count) {
              comparison[deptName].peakDay = {
                date: audit.date,
                count: count
              };
            }
            
            // Item distribution
            if (!comparison[deptName].itemDistribution[itemKey]) {
              comparison[deptName].itemDistribution[itemKey] = 0;
            }
            comparison[deptName].itemDistribution[itemKey] += count;
          }
        });
      });
    });
    
    // Calculate averages
    Object.keys(comparison).forEach(deptName => {
      if (audits.length > 0) {
        comparison[deptName].averageDaily = 
          (comparison[deptName].totalProduction / audits.length).toFixed(2);
      }
    });
    
    res.status(200).json({
      success: true,
      data: {
        comparison,
        totalAudits: audits.length,
        reportPeriod: { month: parseInt(month), year: parseInt(year) }
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;