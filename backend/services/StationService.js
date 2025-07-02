const Station = require('../models/Station');

class StationService {
  /**
   * Auto-arrange stations in a bay using different layout patterns
   */
  static async autoArrangeBay(bayName, deviceType, layoutPattern = 'grid') {
    try {
      const stations = await Station.find({ 
        bay: bayName, 
        deviceType, 
        isActive: true 
      }).sort({ stationNumber: 1 });

      if (stations.length === 0) {
        throw new Error('No stations found in this bay');
      }

      const arrangements = {
        grid: this.arrangeGrid,
        row: this.arrangeRow,
        circle: this.arrangeCircle,
        staggered: this.arrangeStaggered
      };

      const arrangeFunction = arrangements[layoutPattern] || arrangements.grid;
      const positions = arrangeFunction(stations.length);

      // Update positions
      const updatePromises = stations.map(async (station, index) => {
        station.position.x = positions[index].x;
        station.position.y = positions[index].y;
        return station.save();
      });

      await Promise.all(updatePromises);

      return {
        success: true,
        message: `Arranged ${stations.length} stations in ${layoutPattern} pattern`,
        updatedStations: stations.length
      };
    } catch (error) {
      throw new Error(`Failed to auto-arrange bay: ${error.message}`);
    }
  }

  /**
   * Grid layout arrangement
   */
  static arrangeGrid(stationCount, spacing = 60) {
    const positions = [];
    const cols = Math.ceil(Math.sqrt(stationCount));

    for (let i = 0; i < stationCount; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      positions.push({
        x: col * spacing,
        y: row * spacing
      });
    }

    return positions;
  }

  /**
   * Row layout arrangement
   */
  static arrangeRow(stationCount, spacing = 60) {
    const positions = [];
    for (let i = 0; i < stationCount; i++) {
      positions.push({
        x: i * spacing,
        y: 0
      });
    }
    return positions;
  }

  /**
   * Circle layout arrangement
   */
  static arrangeCircle(stationCount, radius = 100) {
    const positions = [];
    const angleStep = (2 * Math.PI) / stationCount;

    for (let i = 0; i < stationCount; i++) {
      const angle = i * angleStep;
      positions.push({
        x: radius + Math.cos(angle) * radius,
        y: radius + Math.sin(angle) * radius
      });
    }

    return positions;
  }

  /**
   * Staggered layout arrangement
   */
  static arrangeStaggered(stationCount, spacing = 60) {
    const positions = [];
    const cols = Math.ceil(Math.sqrt(stationCount));

    for (let i = 0; i < stationCount; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const offset = (row % 2) * (spacing / 2);
      
      positions.push({
        x: col * spacing + offset,
        y: row * spacing
      });
    }

    return positions;
  }

  /**
   * Duplicate a bay with all its stations
   */
  static async duplicateBay(sourceBayName, targetBayName, deviceType, options = {}) {
    try {
      // Check if target bay already exists
      const existingBay = await Station.findOne({ 
        bay: targetBayName, 
        deviceType, 
        isActive: true 
      });

      if (existingBay && !options.overwrite) {
        throw new Error(`Bay ${targetBayName} already exists`);
      }

      // Get source stations
      const sourceStations = await Station.find({ 
        bay: sourceBayName, 
        deviceType, 
        isActive: true 
      }).sort({ stationNumber: 1 });

      if (sourceStations.length === 0) {
        throw new Error(`Source bay ${sourceBayName} not found or empty`);
      }

      // Deactivate existing stations in target bay if overwriting
      if (options.overwrite) {
        await Station.updateMany(
          { bay: targetBayName, deviceType, isActive: true },
          { isActive: false }
        );
      }

      // Find next available station numbers
      const maxStationNumber = await this.getMaxStationNumber(deviceType);
      const newStations = [];

      // Create new stations
      for (let i = 0; i < sourceStations.length; i++) {
        const sourceStation = sourceStations[i];
        const newStationNumber = maxStationNumber + i + 1;

        const newStationData = {
          stationNumber: newStationNumber,
          bay: targetBayName,
          deviceType,
          position: { 
            x: sourceStation.position.x, 
            y: sourceStation.position.y 
          }
        };

        // Copy device data if specified
        if (options.copyDevices && sourceStation.device?.serialNumber) {
          // Generate new serial number for copied device
          const originalSerial = sourceStation.device.serialNumber;
          const newSerial = `${originalSerial}_COPY_${Date.now()}`;
          
          newStationData.device = {
            serialNumber: newSerial,
            brand: sourceStation.device.brand || '',
            model: sourceStation.device.model || '',
            notes: sourceStation.device.notes || '',
            registeredAt: new Date()
          };
        }

        const newStation = await Station.create(newStationData);
        newStations.push(newStation);
      }

      return {
        success: true,
        message: `Duplicated bay ${sourceBayName} to ${targetBayName}`,
        sourceStations: sourceStations.length,
        createdStations: newStations.length,
        newStations
      };
    } catch (error) {
      throw new Error(`Failed to duplicate bay: ${error.message}`);
    }
  }

  /**
   * Get the maximum station number for a device type
   */
  static async getMaxStationNumber(deviceType) {
    const result = await Station.findOne({ deviceType, isActive: true })
      .sort({ stationNumber: -1 })
      .select('stationNumber');
    
    return result ? result.stationNumber : 0;
  }

  /**
   * Get the next available station number for a device type
   */
  static async getNextStationNumber(deviceType) {
    const maxNumber = await this.getMaxStationNumber(deviceType);
    return maxNumber + 1;
  }

  /**
   * Validate station layout for overlaps and issues
   */
  static async validateLayout(deviceType, bayName = null) {
    try {
      const query = { deviceType, isActive: true };
      if (bayName) query.bay = bayName;

      const stations = await Station.find(query);
      const issues = [];

      // Check for overlapping positions
      const positionMap = new Map();
      stations.forEach(station => {
        const posKey = `${Math.round(station.position.x)},${Math.round(station.position.y)}`;
        if (positionMap.has(posKey)) {
          const existing = positionMap.get(posKey);
          issues.push({
            type: 'overlap',
            stations: [existing.stationNumber, station.stationNumber],
            position: station.position,
            message: `Stations ${existing.stationNumber} and ${station.stationNumber} overlap`
          });
        } else {
          positionMap.set(posKey, station);
        }
      });

      // Check for duplicate station numbers
      const numberMap = new Map();
      stations.forEach(station => {
        if (numberMap.has(station.stationNumber)) {
          const existing = numberMap.get(station.stationNumber);
          issues.push({
            type: 'duplicate_number',
            stations: [existing._id, station._id],
            stationNumber: station.stationNumber,
            message: `Duplicate station number ${station.stationNumber}`
          });
        } else {
          numberMap.set(station.stationNumber, station);
        }
      });

      // Check for stations too close together
      const minDistance = 30; // Minimum distance between stations
      stations.forEach((station1, i) => {
        stations.slice(i + 1).forEach(station2 => {
          const distance = Math.sqrt(
            Math.pow(station1.position.x - station2.position.x, 2) +
            Math.pow(station1.position.y - station2.position.y, 2)
          );
          
          if (distance < minDistance && distance > 0) {
            issues.push({
              type: 'too_close',
              stations: [station1.stationNumber, station2.stationNumber],
              distance: Math.round(distance),
              message: `Stations ${station1.stationNumber} and ${station2.stationNumber} are too close (${Math.round(distance)}px)`
            });
          }
        });
      });

      return {
        valid: issues.length === 0,
        totalStations: stations.length,
        issues,
        summary: {
          overlaps: issues.filter(i => i.type === 'overlap').length,
          duplicates: issues.filter(i => i.type === 'duplicate_number').length,
          tooClose: issues.filter(i => i.type === 'too_close').length
        }
      };
    } catch (error) {
      throw new Error(`Failed to validate layout: ${error.message}`);
    }
  }

  /**
   * Auto-fix layout issues
   */
  static async autoFixLayout(deviceType, bayName = null) {
    try {
      const validation = await this.validateLayout(deviceType, bayName);
      const fixedIssues = [];

      // Fix overlapping positions by slightly moving stations
      for (const issue of validation.issues) {
        if (issue.type === 'overlap') {
          const [stationNum1, stationNum2] = issue.stations;
          const station2 = await Station.findOne({ 
            stationNumber: stationNum2, 
            deviceType, 
            isActive: true 
          });
          
          if (station2) {
            // Move station2 slightly to the right
            station2.position.x = station2.position.x + 60;
            await station2.save();
            fixedIssues.push(`Moved station ${stationNum2} to resolve overlap`);
          }
        }
      }

      // Fix stations that are too close
      for (const issue of validation.issues) {
        if (issue.type === 'too_close') {
          const [stationNum1, stationNum2] = issue.stations;
          const station2 = await Station.findOne({ 
            stationNumber: stationNum2, 
            deviceType, 
            isActive: true 
          });
          
          if (station2) {
            // Move station2 to minimum distance
            const station1 = await Station.findOne({ 
              stationNumber: stationNum1, 
              deviceType, 
              isActive: true 
            });
            
            const angle = Math.atan2(
              station2.position.y - station1.position.y,
              station2.position.x - station1.position.x
            );
            
            const newX = station1.position.x + Math.cos(angle) * 60;
            const newY = station1.position.y + Math.sin(angle) * 60;
            
            station2.position.x = newX;
            station2.position.y = newY;
            await station2.save();
            fixedIssues.push(`Moved station ${stationNum2} to maintain minimum distance`);
          }
        }
      }

      return {
        success: true,
        fixedIssues,
        message: `Fixed ${fixedIssues.length} layout issues`
      };
    } catch (error) {
      throw new Error(`Failed to auto-fix layout: ${error.message}`);
    }
  }

  /**
   * Generate optimal station numbers for a bay
   */
  static async renumberBay(bayName, deviceType, startNumber = null) {
    try {
      // Fixed the MongoDB sort syntax error
      const stations = await Station.find({ 
        bay: bayName, 
        deviceType, 
        isActive: true 
      }).sort({ "position.y": 1, "position.x": 1 }); // Sort by position

      if (stations.length === 0) {
        throw new Error('No stations found in this bay');
      }

      // Find starting number if not provided
      if (!startNumber) {
        const maxNumber = await this.getMaxStationNumber(deviceType);
        startNumber = maxNumber + 1;
      }

      // Update station numbers
      const updates = [];
      for (let i = 0; i < stations.length; i++) {
        const newNumber = startNumber + i;
        const oldNumber = stations[i].stationNumber;
        
        if (oldNumber !== newNumber) {
          stations[i].stationNumber = newNumber;
          await stations[i].save();
          updates.push({
            oldNumber: oldNumber,
            newNumber: newNumber
          });
        }
      }

      return {
        success: true,
        message: `Renumbered ${updates.length} stations in bay ${bayName}`,
        updates
      };
    } catch (error) {
      throw new Error(`Failed to renumber bay: ${error.message}`);
    }
  }

  /**
   * Export bay layout as template
   */
  static async exportBayTemplate(bayName, deviceType) {
    try {
      const stations = await Station.find({ 
        bay: bayName, 
        deviceType, 
        isActive: true 
      }).sort({ stationNumber: 1 });

      if (stations.length === 0) {
        throw new Error('Bay not found or empty');
      }

      // Calculate relative positions (normalized to start at 0,0)
      const minX = Math.min(...stations.map(s => s.position.x));
      const minY = Math.min(...stations.map(s => s.position.y));

      const template = {
        name: bayName,
        deviceType,
        stationCount: stations.length,
        createdAt: new Date(),
        layout: stations.map((station, index) => ({
          index: index + 1,
          relativePosition: {
            x: station.position.x - minX,
            y: station.position.y - minY
          }
        }))
      };

      return template;
    } catch (error) {
      throw new Error(`Failed to export bay template: ${error.message}`);
    }
  }

  /**
   * Create bay from template
   */
  static async createBayFromTemplate(template, newBayName, deviceType, startPosition = { x: 0, y: 0 }) {
    try {
      if (template.deviceType !== deviceType) {
        throw new Error(`Template is for ${template.deviceType}, not ${deviceType}`);
      }

      // Check if bay already exists
      const existingBay = await Station.findOne({ 
        bay: newBayName, 
        deviceType, 
        isActive: true 
      });

      if (existingBay) {
        throw new Error(`Bay ${newBayName} already exists`);
      }

      // Find next available station numbers
      const maxStationNumber = await this.getMaxStationNumber(deviceType);
      const newStations = [];

      // Create stations from template
      for (let i = 0; i < template.layout.length; i++) {
        const layoutItem = template.layout[i];
        const newStationNumber = maxStationNumber + i + 1;

        const stationData = {
          stationNumber: newStationNumber,
          bay: newBayName,
          deviceType,
          position: {
            x: startPosition.x + layoutItem.relativePosition.x,
            y: startPosition.y + layoutItem.relativePosition.y
          }
        };

        const newStation = await Station.create(stationData);
        newStations.push(newStation);
      }

      return {
        success: true,
        message: `Created bay ${newBayName} from template`,
        createdStations: newStations.length,
        newStations
      };
    } catch (error) {
      throw new Error(`Failed to create bay from template: ${error.message}`);
    }
  }

  /**
   * Get comprehensive statistics for a device type
   */
  static async getComprehensiveStats(deviceType) {
    try {
      const totalStations = await Station.countDocuments({ deviceType, isActive: true });
      const registeredDevices = await Station.countDocuments({
        deviceType,
        isActive: true,
        'device.serialNumber': { $exists: true, $ne: null }
      });
      
      const emptyStations = totalStations - registeredDevices;
      const registrationRate = totalStations > 0 ? ((registeredDevices / totalStations) * 100).toFixed(1) : 0;

      // Get bay statistics
      const bayStats = await Station.aggregate([
        { $match: { deviceType, isActive: true } },
        {
          $group: {
            _id: '$bay',
            totalStations: { $sum: 1 },
            registeredDevices: {
              $sum: {
                $cond: [
                  { $and: [{ $exists: ['$device.serialNumber'] }, { $ne: ['$device.serialNumber', null] }] },
                  1,
                  0
                ]
              }
            }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      const uniqueBays = bayStats.map(bay => bay._id);

      return {
        totalStations,
        registeredDevices,
        emptyStations,
        registrationRate: parseFloat(registrationRate),
        bayCount: uniqueBays.length,
        bays: uniqueBays,
        bayStats
      };
    } catch (error) {
      throw new Error(`Failed to get comprehensive stats: ${error.message}`);
    }
  }
}

module.exports = StationService;