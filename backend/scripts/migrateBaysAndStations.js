const mongoose = require('mongoose');
const Station = require('./models/Station');
const Bay = require('./models/Bay');

/**
 * Migration script to separate bays and stations
 * This script creates separate bay entities from existing station bay groupings
 */

async function migrateBaysAndStations() {
  try {
    console.log('Starting migration: Separating bays and stations...');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Get all unique bay-deviceType combinations from existing stations
    const bayGroups = await Station.aggregate([
      {
        $match: {
          isActive: true,
          bay: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: {
            bay: '$bay',
            deviceType: '$deviceType'
          },
          stations: { $push: '$$ROOT' },
          minX: { $min: '$position.x' },
          maxX: { $max: '$position.x' },
          minY: { $min: '$position.y' },
          maxY: { $max: '$position.y' },
          count: { $sum: 1 }
        }
      }
    ]);

    console.log(`Found ${bayGroups.length} bay groups to migrate`);

    let createdBays = 0;
    let skippedBays = 0;

    for (const group of bayGroups) {
      const { bay: bayName, deviceType } = group._id;
      const { minX, maxX, minY, maxY, count } = group;

      // Check if bay already exists
      const existingBay = await Bay.findOne({
        name: bayName,
        deviceType: deviceType
      });

      if (existingBay) {
        console.log(`Bay ${bayName} (${deviceType}) already exists, skipping...`);
        skippedBays++;
        continue;
      }

      // Calculate bay position based on first station in the group
      const firstStation = group.stations[0];
      const bayX = Math.max(0, firstStation.position.x - 10); // Position bay slightly before first station
      const bayY = Math.max(0, firstStation.position.y - 10); // Position bay slightly above first station

      // Determine bay color based on device type
      const colors = {
        mouse: '#6c757d',
        keyboard: '#28a745',
        headset: '#17a2b8'
      };

      try {
        const newBay = await Bay.create({
          name: bayName,
          deviceType: deviceType,
          position: { x: bayX, y: bayY },
          size: { width: 55, height: 50 }, // Same size as stations
          color: colors[deviceType] || '#6c757d',
          metadata: {
            description: `Migrated bay containing ${count} stations`,
            capacity: count,
            migrated: true,
            migratedAt: new Date()
          }
        });

        console.log(`✓ Created bay: ${bayName} (${deviceType}) at position (${bayX}, ${bayY}) with station size (55x50)`);
        createdBays++;

      } catch (error) {
        console.error(`✗ Failed to create bay ${bayName} (${deviceType}):`, error.message);
      }
    }

    // Update stations to ensure they have proper indexes
    console.log('Updating station indexes...');
    
    // Fix any stations that might have null station numbers
    const stationsWithoutNumbers = await Station.find({
      isActive: true,
      $or: [
        { stationNumber: null },
        { stationNumber: { $exists: false } }
      ]
    });

    if (stationsWithoutNumbers.length > 0) {
      console.log(`Found ${stationsWithoutNumbers.length} stations without numbers`);
      
      // Group by device type to assign sequential numbers
      const deviceTypeGroups = {};
      stationsWithoutNumbers.forEach(station => {
        if (!deviceTypeGroups[station.deviceType]) {
          deviceTypeGroups[station.deviceType] = [];
        }
        deviceTypeGroups[station.deviceType].push(station);
      });

      for (const [deviceType, stations] of Object.entries(deviceTypeGroups)) {
        // Get the current max station number for this device type
        const maxStation = await Station.findOne({
          deviceType,
          isActive: true,
          stationNumber: { $exists: true, $ne: null }
        }).sort({ stationNumber: -1 });

        let nextNumber = maxStation ? maxStation.stationNumber + 1 : 1;

        for (const station of stations) {
          // Check if this number is already taken
          while (await Station.findOne({ 
            deviceType, 
            stationNumber: nextNumber, 
            isActive: true,
            _id: { $ne: station._id }
          })) {
            nextNumber++;
          }

          station.stationNumber = nextNumber;
          await station.save();
          console.log(`✓ Assigned station number ${nextNumber} to station ${station._id} (${deviceType})`);
          nextNumber++;
        }
      }
    }

    // Create summary report
    const finalStats = {
      totalBaysCreated: createdBays,
      totalBaysSkipped: skippedBays,
      totalStations: await Station.countDocuments({ isActive: true }),
      totalBays: await Bay.countDocuments({ isActive: true }),
      stationsWithNumbers: await Station.countDocuments({ 
        isActive: true, 
        stationNumber: { $exists: true, $ne: null } 
      }),
      stationsWithoutNumbers: await Station.countDocuments({ 
        isActive: true, 
        $or: [
          { stationNumber: null },
          { stationNumber: { $exists: false } }
        ]
      })
    };

    console.log('\n=== Migration Summary ===');
    console.log(`Bays created: ${finalStats.totalBaysCreated}`);
    console.log(`Bays skipped (already existed): ${finalStats.totalBaysSkipped}`);
    console.log(`Total stations: ${finalStats.totalStations}`);
    console.log(`Total bays: ${finalStats.totalBays}`);
    console.log(`Stations with numbers: ${finalStats.stationsWithNumbers}`);
    console.log(`Stations without numbers: ${finalStats.stationsWithoutNumbers}`);
    console.log('=========================\n');

    if (finalStats.stationsWithoutNumbers > 0) {
      console.log('⚠️  Note: Some stations still don\'t have numbers. Users can assign them manually in the UI.');
    }

    console.log('✅ Migration completed successfully!');
    console.log('📝 Next steps:');
    console.log('   1. Test the new bay/station interface');
    console.log('   2. Assign numbers to any unnumbered stations');
    console.log('   3. Adjust bay positions and sizes as needed');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Rollback function in case migration needs to be reversed
async function rollbackMigration() {
  try {
    console.log('Starting rollback: Removing migrated bays...');

    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Remove all bays that were created during migration
    const result = await Bay.deleteMany({
      'metadata.migrated': true
    });

    console.log(`✓ Removed ${result.deletedCount} migrated bays`);
    console.log('✅ Rollback completed successfully!');

  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2];
  
  switch (command) {
    case 'migrate':
      migrateBaysAndStations().catch(process.exit);
      break;
    case 'rollback':
      rollbackMigration().catch(process.exit);
      break;
    default:
      console.log('Usage:');
      console.log('  node migration.js migrate   - Run the migration');
      console.log('  node migration.js rollback  - Rollback the migration');
      process.exit(1);
  }
}

module.exports = {
  migrateBaysAndStations,
  rollbackMigration
};