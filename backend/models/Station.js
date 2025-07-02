const mongoose = require('mongoose');

const stationSchema = new mongoose.Schema({
  stationNumber: {
    type: Number,
    required: false,
    sparse: true
  },
  bay: {
    type: String,
    required: false,
    trim: true
  },
  position: {
    x: {
      type: Number,
      required: true,
      default: 0
    },
    y: {
      type: Number,
      required: true,
      default: 0
    }
  },
  deviceType: {
    type: String,
    enum: ['mouse', 'keyboard', 'headset'],
    required: true
  },
  device: {
    serialNumber: {
      type: String,
      trim: true,
      sparse: true
      // NO UNIQUE CONSTRAINT - Duplicates allowed
    },
    brand: {
      type: String,
      trim: true,
      maxlength: 50
    },
    model: {
      type: String,
      trim: true,
      maxlength: 50
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 200
    },
    registeredAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound unique index - station number must be unique per device type (when not null)
stationSchema.index(
  { stationNumber: 1, deviceType: 1 }, 
  { 
    unique: true, 
    sparse: true,
    partialFilterExpression: { stationNumber: { $type: "number" } }
  }
);

// Other useful indexes
stationSchema.index({ deviceType: 1, bay: 1 });
stationSchema.index({ 'device.serialNumber': 1 }, { sparse: true }); // NO UNIQUE
stationSchema.index({ bay: 1, stationNumber: 1 });
stationSchema.index({ isActive: 1, deviceType: 1 });

// Update timestamp on save
stationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  if (this.device && this.device.serialNumber) {
    this.device.updatedAt = Date.now();
  }
  next();
});

// Virtual for device status
stationSchema.virtual('hasDevice').get(function() {
  return !!(this.device && this.device.serialNumber);
});

// Virtual for station status
stationSchema.virtual('status').get(function() {
  if (!this.isActive) return 'inactive';
  if (this.hasDevice) return 'occupied';
  return 'empty';
});

// Virtual for display number
stationSchema.virtual('displayNumber').get(function() {
  return this.stationNumber || 'Unnumbered';
});

// Static method to get stations by device type
stationSchema.statics.getByDeviceType = async function(deviceType, options = {}) {
  const query = { deviceType, isActive: true };
  
  if (options.bay) query.bay = options.bay;
  if (options.hasDevice !== undefined) {
    if (options.hasDevice) {
      query['device.serialNumber'] = { $exists: true, $ne: null };
    } else {
      query.$or = [
        { 'device.serialNumber': { $exists: false } },
        { 'device.serialNumber': null }
      ];
    }
  }
  
  return this.find(query).sort({ bay: 1, stationNumber: 1 });
};

// Modified to return ALL stations with this serial (duplicates allowed)
stationSchema.statics.findBySerial = async function(serialNumber, deviceType) {
  return this.find({ 
    'device.serialNumber': serialNumber,
    deviceType,
    isActive: true
  });
};

// Static method to get next available station number for device type
stationSchema.statics.getNextStationNumber = async function(deviceType) {
  const lastStation = await this.findOne({ 
    deviceType, 
    isActive: true,
    stationNumber: { $exists: true, $ne: null }
  })
    .sort({ stationNumber: -1 })
    .select('stationNumber');
  
  return lastStation ? lastStation.stationNumber + 1 : 1;
};

// Static method to get max station number for device type
stationSchema.statics.getMaxStationNumber = async function(deviceType) {
  const result = await this.findOne({ 
    deviceType, 
    isActive: true,
    stationNumber: { $exists: true, $ne: null }
  })
    .sort({ stationNumber: -1 })
    .select('stationNumber');
  
  return result ? result.stationNumber : 0;
};

// Method to register device
stationSchema.methods.registerDevice = function(deviceData) {
  this.device = {
    serialNumber: deviceData.serialNumber,
    brand: deviceData.brand || '',
    model: deviceData.model || '',
    notes: deviceData.notes || '',
    registeredAt: deviceData.registeredAt || new Date(),
    updatedAt: new Date()
  };
  return this.save();
};

// Method to remove device
stationSchema.methods.removeDevice = function() {
  this.device = undefined;
  return this.save();
};

// Method to update position
stationSchema.methods.updatePosition = function(x, y) {
  this.position.x = x;
  this.position.y = y;
  return this.save();
};

// Method to assign station number
stationSchema.methods.assignNumber = function(number) {
  this.stationNumber = number;
  return this.save();
};

// Ensure virtual fields are serialized
stationSchema.set('toJSON', { virtuals: true });
stationSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Station', stationSchema);