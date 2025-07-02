const mongoose = require('mongoose');

const baySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 20
  },
  deviceType: {
    type: String,
    enum: ['mouse', 'keyboard', 'headset'],
    required: true
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
  size: {
    width: {
      type: Number,
      default: 55
    },
    height: {
      type: Number,
      default: 50
    }
  },
  color: {
    type: String,
    default: '#6c757d'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    description: String,
    capacity: Number,
    department: String
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

// Compound unique index - bay name must be unique per device type
baySchema.index({ name: 1, deviceType: 1 }, { unique: true });

// Other indexes
baySchema.index({ deviceType: 1 });
baySchema.index({ isActive: 1, deviceType: 1 });

// Update timestamp on save
baySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual to get stations count
baySchema.virtual('stationsCount', {
  ref: 'Station',
  localField: 'name',
  foreignField: 'bay',
  count: true,
  match: { isActive: true }
});

// Static method to get bays by device type
baySchema.statics.getByDeviceType = async function(deviceType) {
  return this.find({ deviceType, isActive: true }).sort({ name: 1 });
};

// Method to update position
baySchema.methods.updatePosition = function(x, y) {
  this.position.x = x;
  this.position.y = y;
  return this.save();
};

// Method to update size
baySchema.methods.updateSize = function(width, height) {
  this.size.width = width;
  this.size.height = height;
  return this.save();
};

// Ensure virtual fields are serialized
baySchema.set('toJSON', { virtuals: true });
baySchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Bay', baySchema);