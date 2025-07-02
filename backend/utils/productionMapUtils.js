// Enhanced Production Map Utilities
class ProductionMapUtils {
  constructor() {
    this.clipboard = {
      stations: [],
      type: null,
      timestamp: null
    };
    this.history = {
      actions: [],
      currentIndex: -1,
      maxSize: 50
    };
    this.shortcuts = new Map();
    this.setupKeyboardShortcuts();
  }

  // Keyboard shortcuts setup
  setupKeyboardShortcuts() {
    this.shortcuts.set('ctrl+z', () => this.undo());
    this.shortcuts.set('ctrl+y', () => this.redo());
    this.shortcuts.set('ctrl+shift+z', () => this.redo());
    this.shortcuts.set('ctrl+a', () => this.selectAll());
    this.shortcuts.set('ctrl+c', () => this.copySelected());
    this.shortcuts.set('ctrl+v', () => this.pasteStations());
    this.shortcuts.set('ctrl+x', () => this.cutSelected());
    this.shortcuts.set('delete', () => this.deleteSelected());
    this.shortcuts.set('backspace', () => this.deleteSelected());
    this.shortcuts.set('escape', () => this.clearSelection());
    this.shortcuts.set('ctrl+d', () => this.duplicateSelected());
    this.shortcuts.set('ctrl+g', () => this.groupSelected());
    this.shortcuts.set('ctrl+shift+g', () => this.ungroupSelected());
    this.shortcuts.set('ctrl+l', () => this.lockSelected());
    this.shortcuts.set('ctrl+shift+l', () => this.unlockSelected());
    this.shortcuts.set('f2', () => this.renameSelected());
    this.shortcuts.set('ctrl+f', () => this.openSearch());
    this.shortcuts.set('ctrl+s', () => this.saveLayout());
    this.shortcuts.set('space', () => this.togglePanMode());
    
    // Arrow keys for fine movement
    this.shortcuts.set('arrowleft', () => this.moveSelected(-1, 0));
    this.shortcuts.set('arrowright', () => this.moveSelected(1, 0));
    this.shortcuts.set('arrowup', () => this.moveSelected(0, -1));
    this.shortcuts.set('arrowdown', () => this.moveSelected(0, 1));
    
    // Shift + arrows for bigger movement
    this.shortcuts.set('shift+arrowleft', () => this.moveSelected(-10, 0));
    this.shortcuts.set('shift+arrowright', () => this.moveSelected(10, 0));
    this.shortcuts.set('shift+arrowup', () => this.moveSelected(0, -10));
    this.shortcuts.set('shift+arrowdown', () => this.moveSelected(0, 10));
  }

  // History management
  addToHistory(action) {
    // Remove any actions after current index (when undoing and then doing new action)
    this.history.actions = this.history.actions.slice(0, this.history.currentIndex + 1);
    
    // Add new action
    this.history.actions.push({
      ...action,
      timestamp: Date.now()
    });
    
    // Maintain max size
    if (this.history.actions.length > this.history.maxSize) {
      this.history.actions.shift();
    } else {
      this.history.currentIndex++;
    }
  }

  undo() {
    if (this.history.currentIndex >= 0) {
      const action = this.history.actions[this.history.currentIndex];
      this.executeReverseAction(action);
      this.history.currentIndex--;
      showToast(`Undid: ${action.description}`, 'info');
    } else {
      showToast('Nothing to undo', 'warning');
    }
  }

  redo() {
    if (this.history.currentIndex < this.history.actions.length - 1) {
      this.history.currentIndex++;
      const action = this.history.actions[this.history.currentIndex];
      this.executeAction(action);
      showToast(`Redid: ${action.description}`, 'info');
    } else {
      showToast('Nothing to redo', 'warning');
    }
  }

  executeAction(action) {
    switch (action.type) {
      case 'move':
        this.moveStationsById(action.stationIds, action.newPositions);
        break;
      case 'create':
        this.recreateStations(action.stationData);
        break;
      case 'delete':
        this.deleteStationsById(action.stationIds);
        break;
      case 'modify':
        this.modifyStations(action.stationIds, action.newData);
        break;
    }
  }

  executeReverseAction(action) {
    switch (action.type) {
      case 'move':
        this.moveStationsById(action.stationIds, action.oldPositions);
        break;
      case 'create':
        this.deleteStationsById(action.stationIds);
        break;
      case 'delete':
        this.recreateStations(action.stationData);
        break;
      case 'modify':
        this.modifyStations(action.stationIds, action.oldData);
        break;
    }
  }

  // Enhanced selection management
  selectAll() {
    if (typeof window.selectAll === 'function') {
      window.selectAll();
    }
  }

  selectByPattern(pattern) {
    clearSelection();
    stationsData.forEach(station => {
      if (this.matchesPattern(station, pattern)) {
        selectStation(station._id);
      }
    });
    updateStationVisuals();
  }

  matchesPattern(station, pattern) {
    const searchStr = pattern.toLowerCase();
    return (
      station.stationNumber.toString().includes(searchStr) ||
      station.bay.toLowerCase().includes(searchStr) ||
      (station.device?.serialNumber?.toLowerCase().includes(searchStr)) ||
      (station.device?.brand?.toLowerCase().includes(searchStr)) ||
      (station.device?.model?.toLowerCase().includes(searchStr))
    );
  }

  // Enhanced copy/paste with formatting preservation
  copySelected() {
    if (selectedStations.size === 0) {
      showToast('No stations selected to copy', 'warning');
      return;
    }

    const selectedData = Array.from(selectedStations).map(stationId => {
      const station = stationsData.find(s => s._id === stationId);
      return {
        ...station,
        originalId: station._id
      };
    });

    this.clipboard = {
      stations: selectedData,
      type: 'copy',
      timestamp: Date.now()
    };

    // Visual feedback
    document.querySelectorAll('.station').forEach(stationEl => {
      const stationId = stationEl.dataset.stationId;
      if (selectedStations.has(stationId)) {
        stationEl.classList.add('copied');
        setTimeout(() => stationEl.classList.remove('copied'), 2000);
      }
    });

    showToast(`Copied ${selectedData.length} stations`, 'success');
  }

  cutSelected() {
    this.copySelected();
    this.clipboard.type = 'cut';
    
    // Add visual feedback for cut
    document.querySelectorAll('.station').forEach(stationEl => {
      const stationId = stationEl.dataset.stationId;
      if (selectedStations.has(stationId)) {
        stationEl.style.opacity = '0.5';
      }
    });
  }

  async pasteStations(position = null) {
    if (this.clipboard.stations.length === 0) {
      showToast('Nothing to paste', 'warning');
      return;
    }

    try {
      const basePosition = position || this.getNextAvailablePosition();
      const newStations = [];

      for (let i = 0; i < this.clipboard.stations.length; i++) {
        const station = this.clipboard.stations[i];
        const maxStationNumber = Math.max(...stationsData.map(s => s.stationNumber), 0);
        
        const newStationData = {
          stationNumber: maxStationNumber + i + 1,
          bay: station.bay,
          deviceType: currentDeviceType,
          position: {
            x: basePosition.x + (station.position.x - this.clipboard.stations[0].position.x),
            y: basePosition.y + (station.position.y - this.clipboard.stations[0].position.y)
          },
          layout: { ...station.layout },
          metadata: { ...station.metadata }
        };

        const response = await fetch(`${API_BASE_URL}/stations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify(newStationData)
        });

        if (response.ok) {
          const result = await response.json();
          newStations.push(result.data);
        }
      }

      // If this was a cut operation, delete original stations
      if (this.clipboard.type === 'cut') {
        await this.deleteStationsById(this.clipboard.stations.map(s => s.originalId));
        this.clipboard = { stations: [], type: null, timestamp: null };
      }

      this.addToHistory({
        type: 'create',
        description: `Pasted ${newStations.length} stations`,
        stationIds: newStations.map(s => s._id),
        stationData: newStations
      });

      showToast(`Pasted ${newStations.length} stations`, 'success');
      await loadStations();
    } catch (error) {
      console.error('Error pasting stations:', error);
      showToast('Error pasting stations', 'error');
    }
  }

  // Smart positioning
  getNextAvailablePosition() {
    const occupied = new Set();
    stationsData.forEach(station => {
      const key = `${Math.round(station.position.x / 60)}_${Math.round(station.position.y / 60)}`;
      occupied.add(key);
    });

    // Find next available grid position
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        const key = `${x}_${y}`;
        if (!occupied.has(key)) {
          return { x: x * 60, y: y * 60 };
        }
      }
    }

    return { x: 0, y: 0 };
  }

  // Movement with collision detection
  async moveSelected(deltaX, deltaY) {
    if (selectedStations.size === 0) return;

    const updates = [];
    const selectedStationData = Array.from(selectedStations).map(id => 
      stationsData.find(s => s._id === id)
    );

    // Check for collisions
    const wouldCollide = selectedStationData.some(station => {
      const newX = station.position.x + deltaX;
      const newY = station.position.y + deltaY;
      
      return stationsData.some(otherStation => 
        otherStation._id !== station._id &&
        !selectedStations.has(otherStation._id) &&
        Math.abs(otherStation.position.x - newX) < 30 &&
        Math.abs(otherStation.position.y - newY) < 30
      );
    });

    if (wouldCollide) {
      showToast('Cannot move: would collide with other stations', 'warning');
      return;
    }

    // Record old positions for undo
    const oldPositions = selectedStationData.map(s => ({ ...s.position }));

    // Update positions
    for (const station of selectedStationData) {
      const newX = Math.max(0, station.position.x + deltaX);
      const newY = Math.max(0, station.position.y + deltaY);
      
      updates.push({
        id: station._id,
        x: newX,
        y: newY
      });
    }

    try {
      // Send bulk update to backend
      const response = await fetch(`${API_BASE_URL}/stations/bulk/positions`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ stations: updates })
      });

      if (response.ok) {
        // Update local data
        updates.forEach(update => {
          const station = stationsData.find(s => s._id === update.id);
          if (station) {
            station.position.x = update.x;
            station.position.y = update.y;
          }
        });

        this.addToHistory({
          type: 'move',
          description: `Moved ${updates.length} stations`,
          stationIds: updates.map(u => u.id),
          oldPositions,
          newPositions: updates.map(u => ({ x: u.x, y: u.y }))
        });

        renderStations();
      }
    } catch (error) {
      console.error('Error moving stations:', error);
      showToast('Error moving stations', 'error');
    }
  }

  // Auto-alignment features
  alignSelected(direction) {
    if (selectedStations.size < 2) {
      showToast('Select at least 2 stations to align', 'warning');
      return;
    }

    const selectedStationData = Array.from(selectedStations).map(id => 
      stationsData.find(s => s._id === id)
    );

    let referenceValue;
    const updates = [];

    switch (direction) {
      case 'left':
        referenceValue = Math.min(...selectedStationData.map(s => s.position.x));
        selectedStationData.forEach(station => {
          if (station.position.x !== referenceValue) {
            updates.push({ id: station._id, x: referenceValue, y: station.position.y });
          }
        });
        break;
      case 'right':
        referenceValue = Math.max(...selectedStationData.map(s => s.position.x));
        selectedStationData.forEach(station => {
          if (station.position.x !== referenceValue) {
            updates.push({ id: station._id, x: referenceValue, y: station.position.y });
          }
        });
        break;
      case 'top':
        referenceValue = Math.min(...selectedStationData.map(s => s.position.y));
        selectedStationData.forEach(station => {
          if (station.position.y !== referenceValue) {
            updates.push({ id: station._id, x: station.position.x, y: referenceValue });
          }
        });
        break;
      case 'bottom':
        referenceValue = Math.max(...selectedStationData.map(s => s.position.y));
        selectedStationData.forEach(station => {
          if (station.position.y !== referenceValue) {
            updates.push({ id: station._id, x: station.position.x, y: referenceValue });
          }
        });
        break;
    }

    if (updates.length > 0) {
      this.applyPositionUpdates(updates, `Aligned ${updates.length} stations ${direction}`);
    }
  }

  distributeSelected(direction) {
    if (selectedStations.size < 3) {
      showToast('Select at least 3 stations to distribute', 'warning');
      return;
    }

    const selectedStationData = Array.from(selectedStations).map(id => 
      stationsData.find(s => s._id === id)
    );

    if (direction === 'horizontal') {
      selectedStationData.sort((a, b) => a.position.x - b.position.x);
      const totalWidth = selectedStationData[selectedStationData.length - 1].position.x - selectedStationData[0].position.x;
      const spacing = totalWidth / (selectedStationData.length - 1);

      const updates = selectedStationData.slice(1, -1).map((station, index) => ({
        id: station._id,
        x: selectedStationData[0].position.x + spacing * (index + 1),
        y: station.position.y
      }));

      this.applyPositionUpdates(updates, `Distributed ${updates.length} stations horizontally`);
    } else {
      selectedStationData.sort((a, b) => a.position.y - b.position.y);
      const totalHeight = selectedStationData[selectedStationData.length - 1].position.y - selectedStationData[0].position.y;
      const spacing = totalHeight / (selectedStationData.length - 1);

      const updates = selectedStationData.slice(1, -1).map((station, index) => ({
        id: station._id,
        x: station.position.x,
        y: selectedStationData[0].position.y + spacing * (index + 1)
      }));

      this.applyPositionUpdates(updates, `Distributed ${updates.length} stations vertically`);
    }
  }

  async applyPositionUpdates(updates, description) {
    try {
      const response = await fetch(`${API_BASE_URL}/stations/bulk/positions`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ stations: updates })
      });

      if (response.ok) {
        updates.forEach(update => {
          const station = stationsData.find(s => s._id === update.id);
          if (station) {
            station.position.x = update.x;
            station.position.y = update.y;
          }
        });

        this.addToHistory({
          type: 'move',
          description,
          stationIds: updates.map(u => u.id),
          newPositions: updates.map(u => ({ x: u.x, y: u.y }))
        });

        renderStations();
        showToast(description, 'success');
      }
    } catch (error) {
      console.error('Error updating positions:', error);
      showToast('Error updating positions', 'error');
    }
  }

  // Visual enhancements
  highlightPath(fromStationId, toStationId) {
    const fromStation = stationsData.find(s => s._id === fromStationId);
    const toStation = stationsData.find(s => s._id === toStationId);
    
    if (!fromStation || !toStation) return;

    // Create path element
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '1';

    const d = `M ${fromStation.position.x + 27.5} ${fromStation.position.y + 25} L ${toStation.position.x + 27.5} ${toStation.position.y + 25}`;
    path.setAttribute('d', d);
    path.setAttribute('stroke', '#3498db');
    path.setAttribute('stroke-width', '3');
    path.setAttribute('stroke-dasharray', '5,5');
    path.classList.add('station-path');

    svg.appendChild(path);
    document.getElementById('productionFloor').appendChild(svg);

    // Animate path
    const length = path.getTotalLength();
    path.style.strokeDasharray = length + ' ' + length;
    path.style.strokeDashoffset = length;
    path.style.animation = 'dash 2s linear forwards';

    // Remove path after animation
    setTimeout(() => {
      svg.remove();
    }, 2000);
  }

  // Advanced search and filtering
  createAdvancedSearch() {
    const searchModal = document.createElement('div');
    searchModal.className = 'modal';
    searchModal.innerHTML = `
      <div class="modal-content">
        <h3>Advanced Search</h3>
        <div class="modal-body">
          <div class="form-group">
            <label>Station Number Range</label>
            <div style="display: flex; gap: 10px;">
              <input type="number" id="searchMinStation" placeholder="Min">
              <input type="number" id="searchMaxStation" placeholder="Max">
            </div>
          </div>
          <div class="form-group">
            <label>Bay</label>
            <input type="text" id="searchBay" placeholder="Bay name">
          </div>
          <div class="form-group">
            <label>Device Status</label>
            <select id="searchDeviceStatus">
              <option value="">Any</option>
              <option value="empty">Empty</option>
              <option value="registered">Has Device</option>
            </select>
          </div>
          <div class="form-group">
            <label>Serial Number</label>
            <input type="text" id="searchSerial" placeholder="Serial number">
          </div>
          <div class="form-group">
            <label>Brand</label>
            <input type="text" id="searchBrand" placeholder="Brand">
          </div>
        </div>
        <div class="modal-buttons">
          <button class="btn secondary" onclick="this.closest('.modal').remove()">Cancel</button>
          <button class="btn primary" onclick="window.mapUtils.executeAdvancedSearch()">Search</button>
        </div>
      </div>
    `;

    document.body.appendChild(searchModal);
    searchModal.style.display = 'block';
  }

  executeAdvancedSearch() {
    const criteria = {
      minStation: document.getElementById('searchMinStation').value,
      maxStation: document.getElementById('searchMaxStation').value,
      bay: document.getElementById('searchBay').value,
      deviceStatus: document.getElementById('searchDeviceStatus').value,
      serial: document.getElementById('searchSerial').value,
      brand: document.getElementById('searchBrand').value
    };

    clearSelection();
    let matchCount = 0;

    stationsData.forEach(station => {
      let matches = true;

      if (criteria.minStation && station.stationNumber < parseInt(criteria.minStation)) {
        matches = false;
      }
      if (criteria.maxStation && station.stationNumber > parseInt(criteria.maxStation)) {
        matches = false;
      }
      if (criteria.bay && !station.bay.toLowerCase().includes(criteria.bay.toLowerCase())) {
        matches = false;
      }
      if (criteria.deviceStatus === 'empty' && station.device?.serialNumber) {
        matches = false;
      }
      if (criteria.deviceStatus === 'registered' && !station.device?.serialNumber) {
        matches = false;
      }
      if (criteria.serial && (!station.device?.serialNumber || 
          !station.device.serialNumber.toLowerCase().includes(criteria.serial.toLowerCase()))) {
        matches = false;
      }
      if (criteria.brand && (!station.device?.brand || 
          !station.device.brand.toLowerCase().includes(criteria.brand.toLowerCase()))) {
        matches = false;
      }

      if (matches) {
        selectStation(station._id);
        matchCount++;
      }
    });

    updateStationVisuals();
    document.querySelector('.modal').remove();
    showToast(`Found ${matchCount} matching stations`, 'success');
  }

  // Initialize the utility system
  init() {
    // Add CSS for animations
    const style = document.createElement('style');
    style.textContent = `
      @keyframes dash {
        to {
          stroke-dashoffset: 0;
        }
      }
      .station-highlighted {
        animation: pulse 1s infinite;
      }
      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.1); }
        100% { transform: scale(1); }
      }
    `;
    document.head.appendChild(style);

    // Set up global keyboard listener
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      let shortcut = '';
      if (e.ctrlKey || e.metaKey) shortcut += 'ctrl+';
      if (e.shiftKey) shortcut += 'shift+';
      if (e.altKey) shortcut += 'alt+';
      shortcut += e.key.toLowerCase();

      const action = this.shortcuts.get(shortcut);
      if (action) {
        e.preventDefault();
        action();
      }
    });

    // Make utils globally available
    window.mapUtils = this;
  }
}

// Initialize the utility system
const mapUtils = new ProductionMapUtils();
document.addEventListener('DOMContentLoaded', () => {
  mapUtils.init();
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProductionMapUtils;
}