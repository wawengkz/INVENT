const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: false // Allow multiple audits per date (different sites)
  },
  site: {
    type: String,
    required: true,
    enum: ['Calamba', 'Bay', 'Los Baños', 'La Espacio'],
    trim: true
  },
  items: {
    CPU: {
      // Dynamic department fields will be added based on site departments
      total: { type: Number, default: 0 },
      stock: { type: Number, default: 0 },
      defectives: { type: Number, default: 0 },
      overallTotal: { type: Number, default: 0 }
    },
    Monitor: {
      total: { type: Number, default: 0 },
      stock: { type: Number, default: 0 },
      defectives: { type: Number, default: 0 },
      overallTotal: { type: Number, default: 0 }
    },
    Keyboard: {
      total: { type: Number, default: 0 },
      stock: { type: Number, default: 0 },
      defectives: { type: Number, default: 0 },
      overallTotal: { type: Number, default: 0 }
    },
    Mouse: {
      total: { type: Number, default: 0 },
      stock: { type: Number, default: 0 },
      defectives: { type: Number, default: 0 },
      overallTotal: { type: Number, default: 0 }
    },
    Headset: {
      total: { type: Number, default: 0 },
      stock: { type: Number, default: 0 },
      defectives: { type: Number, default: 0 },
      overallTotal: { type: Number, default: 0 }
    }
  },
  otherItems: {
    Laptop: { type: Number, default: 0 },
    Webcam: { type: Number, default: 0 },
    RAM: { type: Number, default: 0 },
    SSD: { type: Number, default: 0 }
  },
  missingItems: {
    CPU: { type: Number, default: 0 },
    Monitor: { type: Number, default: 0 },
    Keyboard: { type: Number, default: 0 },
    Mouse: { type: Number, default: 0 },
    Headset: { type: Number, default: 0 }
  },
  createdBy: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User',
  required: false  // CHANGED TO FALSE
},
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound unique index - one audit per date per site
auditSchema.index({ date: 1, site: 1 }, { unique: true });

// Other indexes
auditSchema.index({ site: 1 });
auditSchema.index({ createdBy: 1 });
auditSchema.index({ date: 1, site: 1, isActive: 1 });

// Static method to get audits by site
auditSchema.statics.getBySite = async function(site, options = {}) {
  const query = { site, isActive: true };
  
  if (options.month !== undefined && options.year !== undefined) {
    const startDate = new Date(options.year, options.month, 1);
    const endDate = new Date(options.year, options.month + 1, 0);
    query.date = { $gte: startDate, $lte: endDate };
  }
  
  return this.find(query).sort({ date: -1 }).populate('createdBy', 'username');
};

// Static method to get audit by date and site
auditSchema.statics.getByDateAndSite = async function(date, site) {
  return this.findOne({ 
    date: new Date(date), 
    site, 
    isActive: true 
  }).populate('createdBy', 'username');
};

// Method to add department data dynamically
auditSchema.methods.addDepartmentData = function(departments) {
  const items = ['CPU', 'Monitor', 'Keyboard', 'Mouse', 'Headset'];
  
  items.forEach(item => {
    if (!this.items[item]) {
      this.items[item] = {};
    }
    
    departments.forEach(dept => {
      if (!this.items[item][dept.name]) {
        this.items[item][dept.name] = 0;
      }
    });
  });
  
  return this.save();
};

module.exports = mongoose.model('Audit', auditSchema);