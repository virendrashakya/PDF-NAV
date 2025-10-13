api.controller = function($scope, $location, $filter, $window, spUtil, $timeout) {
  var c = this;
  
  // ==========================================
  // 1. CONSTANTS & CONFIGURATION
  // ==========================================
  var CONSTANTS = {
    // PDF
    PDF_POINTS_PER_INCH: 72,
    MIN_SELECTION_SIZE: 0.1,
    
    // Text Extraction
    LINE_HEIGHT_THRESHOLD: 5,
    
    // Performance
    MAX_QUERY_LIMIT: 500,
    DEBOUNCE_DELAY: 300,
    
    // Zoom
    MIN_ZOOM_SCALE: 0.5,
    MAX_ZOOM_SCALE: 3.0,
    ZOOM_STEP: 1.2,
    
    // Animation
    HIGHLIGHT_OPACITY: 0.3,
    HIGHLIGHT_OPACITY_STEP: 0.03,
    RENDER_DELAY: 100,
    SCROLL_DELAY: 500,
    
    // Default Values
    DEFAULT_SECTION: 'User Created',
    DEFAULT_CONFIDENCE: 1.0,
    
    // Colors
    COLORS: {
      // Selection colors (drag-to-select)
      SELECTION_FILL: 'rgba(59, 130, 246, 0.1)',      // Blue with 10% opacity
      SELECTION_STROKE: 'rgba(59, 130, 246, 0.8)',    // Blue with 80% opacity
      SELECTION_HANDLE: 'rgba(59, 130, 246, 1)',      // Solid blue for resize handles
      
      // Highlight colors (active field)
      HIGHLIGHT_FILL: 'rgba(249, 115, 22, 0.3)',      // Orange with 30% opacity
      HIGHLIGHT_STROKE: 'rgba(249, 115, 22, 0.8)',    // Orange with 80% opacity
      
      // Multi-field highlight (when multiple coordinates)
      MULTI_HIGHLIGHT_FILL: 'rgba(249, 115, 22, 0.2)',   // Orange with 20% opacity
      MULTI_HIGHLIGHT_STROKE: 'rgba(249, 115, 22, 0.6)', // Orange with 60% opacity
      
      // Temporary coordinates (in creation mode)
      TEMP_COORD_FILL: 'rgba(34, 197, 94, 0.2)',     // Green with 20% opacity
      TEMP_COORD_STROKE: 'rgba(34, 197, 94, 0.6)'    // Green with 60% opacity
    },
    
    // Border & Line Widths
    BORDER_WIDTH: {
      SELECTION: 2,           // Selection rectangle border
      HIGHLIGHT: 2,           // Field highlight border
      HANDLE_SIZE: 6,         // Resize handle size
      DASH_PATTERN: [5, 5]    // Dashed line pattern [dash, gap]
    }
  };
  
  var submissionSysId = $location.search().submissionSysId || '74c2873d93947210ce18b5d97bba102d';
  
  // ==========================================
  // 2. STATE VARIABLES
  // ==========================================
  
  // 2.1 PDF State
  c.pdfLoaded = false;
  c.currentPage = 1;
  c.totalPages = 0;
  c.scale = 1.0;
  c.zoomMode = 'actual-size';
  c.containerWidth = 0;
  
  // 2.2 Field State
  c.globalExtractedFields = [];
  c.groupedFields = {};
  c.collapsedSections = {};
  c.activeField = null;
  c.fieldSearch = '';
  
  // 2.3 Document State
  c.documents = [];
  c.selectedDocument = '';
  
  // 2.4 Creation State
  c.isCreatingField = false;
  c.creationMode = 'new'; // 'new' or 'edit'
  c.editingField = null;
  c.isDragging = false;
  c.dragStart = null;
  c.dragEnd = null;
  c.showFieldDialog = false;
  c.newFieldData = {
    field_name: '',
    field_value: '',
    section_name: CONSTANTS.DEFAULT_SECTION,
    confidence_indicator: CONSTANTS.DEFAULT_CONFIDENCE
  };
  
  // 2.5 Pending Changes State
  c.pendingFields = [];
  c.isSaving = false;
  
  // 2.6 UI State
  c.canUpload = c.data.canUpload || false;
  c.isLoading = false;
  c.loadingMessage = 'Loading...';
  c.showAdvancedButton = false;
  c.showAdvancedMode = false;
  c.manualCoordinate = '';
  c.parsedManualCoordinates = [];
  c.parsedCoordinatesCount = 0;
  
  // 2.7 PDF.js Variables
  var pdfDoc = null;
  var canvas = null;
  var pdfContext = null;
  var annotationCanvas = null;
  var annotationContext = null;
  var pageRendering = false;
  var pageNumPending = null;
  var renderTask = null;
  var currentPageInstance = null;
  
  // Set page title
  $('head title').text("Genpact Insurance Policy Suite");
  
  // ==========================================
  // 3. UTILITY FUNCTIONS
  // ==========================================
  
  /**
   * Debounce function to limit function execution rate
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in milliseconds
   * @returns {Function} Debounced function
   */
  var debounce = function(func, wait) {
    var timeout;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        func.apply(context, args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };
  
  /**
   * Coordinate conversion utilities
   */
  var CoordinateConverter = {
    /**
     * Convert screen coordinates to PDF coordinates
     * @param {number} screenX - X position in pixels
     * @param {number} screenY - Y position in pixels
     * @returns {Object} PDF coordinates {x, y}
     */
    toPDF: function(screenX, screenY) {
      return {
        x: screenX / (CONSTANTS.PDF_POINTS_PER_INCH * c.scale),
        y: screenY / (CONSTANTS.PDF_POINTS_PER_INCH * c.scale)
      };
    },
    
    /**
     * Convert PDF coordinates to screen coordinates
     * @param {number} pdfX - X position in PDF units
     * @param {number} pdfY - Y position in PDF units
     * @returns {Object} Screen coordinates {x, y}
     */
    toScreen: function(pdfX, pdfY) {
      return {
        x: pdfX * CONSTANTS.PDF_POINTS_PER_INCH * c.scale,
        y: pdfY * CONSTANTS.PDF_POINTS_PER_INCH * c.scale
      };
    }
  };
  
  /**
   * Error handling utility
   * @param {string} context - Error context
   * @param {Error} error - Error object
   * @param {string} userMessage - User-friendly message
   */
  function handleError(context, error, userMessage) {
    console.error(context + ':', error);
    if (userMessage) {
      spUtil.addErrorMessage(userMessage);
    }
  }
  
  // ==========================================
  // 4. FIELD CREATION
  // ==========================================
  
  /**
   * Initialize creation mode
   * @param {string} mode - Creation mode ('new' or 'edit')
   * @param {Object} field - Field object (for edit mode)
   */
  function initializeCreationMode(mode, field) {
    c.isCreatingField = true;
    c.creationMode = mode;
    c.editingField = field || null;
    c.isDragging = false;
    c.dragStart = null;
    c.dragEnd = null;
    clearAnnotations();
    enableCreationMode();
  }
  
  /**
   * Start field creation mode
   */
  c.startFieldCreation = function() {
    if (!c.pdfLoaded) {
      spUtil.addErrorMessage('Please load a document first');
      return;
    }
    
    initializeCreationMode('new', null);
    c.newFieldData = {
      field_name: '',
      field_value: '',
      section_name: CONSTANTS.DEFAULT_SECTION,
      confidence_indicator: CONSTANTS.DEFAULT_CONFIDENCE
    };
    spUtil.addInfoMessage('Click and drag on the PDF to select a field area');
  };
  
  /**
   * Edit existing field
   * @param {Object} field - Field to edit
   */
  c.editField = function(field) {
    if (!c.pdfLoaded) return;
    
    initializeCreationMode('edit', field);
    
    // Populate edit data with existing field values
    c.newFieldData = {
      field_name: field.field_name || '',
      field_value: field.field_value || '',
      section_name: field.section_name || field.new_section_name || CONSTANTS.DEFAULT_SECTION,
      confidence_indicator: field.confidence_indicator || CONSTANTS.DEFAULT_CONFIDENCE
    };
    
    // Navigate to field's page if needed
    if (field.coordinates && field.coordinates.page !== c.currentPage) {
      c.currentPage = field.coordinates.page;
      renderPage(c.currentPage);
    }
    
    spUtil.addInfoMessage('Click and drag to update field selection: ' + field.field_name);
  };
  
  /**
   * Cancel field creation
   */
  c.cancelFieldCreation = function() {
    c.isCreatingField = false;
    c.editingField = null;
    c.isDragging = false;
    c.dragStart = null;
    c.dragEnd = null;
    clearAnnotations();
    disableCreationMode();
    
    // Re-highlight active field if exists
    if (c.activeField && c.activeField.allCoordinates) {
      var coordsOnPage = c.activeField.allCoordinates.filter(function(coord) {
        return coord.page === c.currentPage;
      });
      if (coordsOnPage.length > 0) {
        highlightMultipleFields(coordsOnPage, false);
      }
    }
  };
  
  /**
   * Save new field
   */
  c.saveNewField = function() {
    if (!c.newFieldData.field_name) {
      spUtil.addErrorMessage('Please enter a field name');
      return;
    }
    
    if (c.creationMode === 'new') {
      var newField = {
        field_name: c.newFieldData.field_name,
        field_value: c.newFieldData.field_value,
        new_section_name: c.newFieldData.section_name,
        section_name: c.newFieldData.section_name,
        confidence_indicator: c.newFieldData.confidence_indicator,
        allCoordinates: [c.newFieldData.coordinates],
        coordinates: c.newFieldData.coordinates,
        source: formatDString(c.newFieldData.coordinates),
        attachmentData: {
          file_name: c.selectedDocument ? c.selectedDocument.name : '',
          file_url: c.selectedDocument ? c.selectedDocument.url : ''
        },
        sys_id: 'temp_' + Date.now(),
        isPending: true,
        isNew: true
      };
      
      // Add to grouped fields
      var sectionKey = newField.section_name || 'Uncategorized';
      if (!c.groupedFields[sectionKey]) {
        c.groupedFields[sectionKey] = [];
        c.collapsedSections[sectionKey] = false;
      }
      c.groupedFields[sectionKey].push(newField);
      
      // Add to pending fields
      c.pendingFields.push(newField);
      
      spUtil.addInfoMessage('Field added - click Save to persist: ' + newField.field_name);
    } else if (c.creationMode === 'edit' && c.editingField) {
      // Update existing field with new values from dialog
      var oldSectionName = c.editingField.section_name || c.editingField.new_section_name || 'Uncategorized';
      var newSectionName = c.newFieldData.section_name || 'Uncategorized';
      
      // Update field properties
      c.editingField.field_name = c.newFieldData.field_name;
      c.editingField.field_value = c.newFieldData.field_value;
      c.editingField.section_name = newSectionName;
      c.editingField.new_section_name = newSectionName;
      c.editingField.coordinates = c.newFieldData.coordinates;
      c.editingField.allCoordinates = [c.newFieldData.coordinates];
      c.editingField.source = formatDString(c.newFieldData.coordinates);
      c.editingField.isPending = true;
      
      // If section changed, move field to new section
      if (oldSectionName !== newSectionName) {
        // Remove from old section
        if (c.groupedFields[oldSectionName]) {
          var idx = c.groupedFields[oldSectionName].indexOf(c.editingField);
          if (idx > -1) {
            c.groupedFields[oldSectionName].splice(idx, 1);
            if (c.groupedFields[oldSectionName].length === 0) {
              delete c.groupedFields[oldSectionName];
              delete c.collapsedSections[oldSectionName];
            }
          }
        }
        
        // Add to new section
        if (!c.groupedFields[newSectionName]) {
          c.groupedFields[newSectionName] = [];
          c.collapsedSections[newSectionName] = false;
        }
        c.groupedFields[newSectionName].push(c.editingField);
      }
      
      // Add to pending fields if not already there
      addToPendingFields(c.editingField);
      
      spUtil.addInfoMessage('Field updated - click Save to persist changes');
    }
    
    c.showFieldDialog = false;
    c.cancelFieldCreation();
  };
  
  // ==========================================
  // 5. FIELD MANAGEMENT
  // ==========================================
  
  /**
   * Delete field
   * @param {Object} field - Field to delete
   */
  c.deleteField = function(field) {
    if (!field) {
      handleError('deleteField', new Error('Invalid field'), 'Invalid field selected');
      return;
    }
    
    if (!confirm('Are you sure you want to delete this field?')) return;
    
    // Remove from grouped fields
    for (var section in c.groupedFields) {
      var idx = c.groupedFields[section].indexOf(field);
      if (idx > -1) {
        c.groupedFields[section].splice(idx, 1);
        if (c.groupedFields[section].length === 0) {
          delete c.groupedFields[section];
        }
        break;
      }
    }
    
    clearAnnotations();
    spUtil.addInfoMessage('Field deleted: ' + field.field_name);
    
    // Call server to persist deletion
    c.server.get({
      action: 'deleteField',
      fieldId: field.sys_id
    }).catch(function(error) {
      handleError('Delete field', error, 'Failed to delete field');
    });
  };
  
  /**
   * Save all pending fields
   */
  c.saveAllFields = function() {
    if (c.pendingFields.length === 0) {
      spUtil.addInfoMessage('No pending fields to save');
      return;
    }
    
    c.isSaving = true;
    var savePromises = c.pendingFields.map(function(field) {
      return c.server.get({
        action: 'saveField',
        field: {
          sys_id: field.sys_id,
          field_name: field.field_name,
          field_value: field.field_value,
          source: field.source,
          section_name: field.new_section_name,
          confidence: field.confidence_indicator,
          document_name: field.attachmentData.file_name,
          document_url: field.attachmentData.file_url,
          submission_sys_id: submissionSysId
        }
      }).then(function(response) {
        if (response.data.success) {
          if (response.data.sys_id && field.sys_id.indexOf('temp_') === 0) {
            field.sys_id = response.data.sys_id;
          }
          field.isPending = false;
          field.isNew = false;
          return true;
        }
        return false;
      });
    });
    
    Promise.all(savePromises)
      .then(function(results) {
        var successCount = results.filter(Boolean).length;
        c.isSaving = false;
        c.pendingFields = [];
        spUtil.addInfoMessage('Successfully saved ' + successCount + ' field(s)');
        $scope.$apply();
      })
      .catch(function(error) {
        c.isSaving = false;
        handleError('Batch save', error, 'Error saving fields');
        $scope.$apply();
      });
  };
  
  /**
   * Legacy save function for compatibility
   * @param {Object} field - Field to save
   */
  c.saveFieldChanges = function(field) {
    c.server.get({
      action: 'saveField',
      field: {
        sys_id: field.sys_id,
        field_name: field.field_name,
        field_value: field.field_value,
        source: field.source,
        section_name: field.new_section_name,
        confidence: field.confidence_indicator,
        document_name: field.attachmentData.file_name,
        document_url: field.attachmentData.file_url,
        submission_sys_id: submissionSysId
      }
    }).then(function(response) {
      if (response.data.success && response.data.sys_id && field.sys_id.indexOf('temp_') === 0) {
        field.sys_id = response.data.sys_id;
      }
    }).catch(function(error) {
      handleError('Save field', error, 'Failed to save field');
    });
  };
  
  /**
   * Format coordinate to D-string
   * @param {Object} coord - Coordinate object
   * @returns {string} D-string format
   */
  function formatDString(coord) {
    return 'D(' + coord.page + ',' +
           coord.x1.toFixed(4) + ',' + coord.y1.toFixed(4) + ',' +
           coord.x2.toFixed(4) + ',' + coord.y2.toFixed(4) + ',' +
           coord.x3.toFixed(4) + ',' + coord.y3.toFixed(4) + ',' +
           coord.x4.toFixed(4) + ',' + coord.y4.toFixed(4) + ')';
  }
  
  // ==========================================
  // 6. MOUSE EVENT HANDLERS
  // ==========================================
  
  /**
   * Get mouse coordinates relative to canvas
   * @param {MouseEvent} event - Mouse event
   * @returns {Object} PDF coordinates {x, y}
   */
  function getMouseCoordinates(event) {
    var rect = canvas.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var y = event.clientY - rect.top;
    return CoordinateConverter.toPDF(x, y);
  }
  
  /**
   * Start drag selection
   * @param {Object} coords - Starting coordinates
   */
  function startDragSelection(coords) {
    c.isDragging = true;
    c.dragStart = coords;
    c.dragEnd = coords;
  }
  
  /**
   * Update drag selection
   * @param {Object} coords - Current coordinates
   */
  function updateDragSelection(coords) {
    c.dragEnd = coords;
    drawSelectionRectangle();
  }
  
  /**
   * Complete drag selection
   * @returns {Object} Rectangle coordinate
   */
  function completeDragSelection() {
    c.isDragging = false;
    return createRectangleCoordinate(c.dragStart, c.dragEnd);
  }
  
  /**
   * Check if selection is valid
   * @param {Object} selection - Selection coordinate
   * @returns {boolean} True if valid
   */
  function isValidSelection(selection) {
    if (!c.dragStart || !c.dragEnd) return false;
    var width = Math.abs(c.dragEnd.x - c.dragStart.x);
    var height = Math.abs(c.dragEnd.y - c.dragStart.y);
    return width > CONSTANTS.MIN_SELECTION_SIZE && height > CONSTANTS.MIN_SELECTION_SIZE;
  }
  
  /**
   * Create rectangle coordinate from drag points
   * @param {Object} start - Start point
   * @param {Object} end - End point
   * @returns {Object} Rectangle coordinate
   */
  function createRectangleCoordinate(start, end) {
    var minX = Math.min(start.x, end.x);
    var minY = Math.min(start.y, end.y);
    var maxX = Math.max(start.x, end.x);
    var maxY = Math.max(start.y, end.y);
    
    return {
      page: c.currentPage,
      x1: minX, y1: minY,
      x2: maxX, y2: minY,
      x3: maxX, y3: maxY,
      x4: minX, y4: maxY
    };
  }
  
  /**
   * Process selection and extract text
   * @param {Object} coord - Selection coordinate
   */
  function processSelection(coord) {
    extractTextFromArea(coord)
      .then(function(text) {
        handleExtractedText(text, coord);
      })
      .catch(function(error) {
        handleError('Text extraction', error, 'Failed to extract text from selection');
        c.showFieldDialog = true;
        $scope.$apply();
      });
  }
  
  /**
   * Handle extracted text
   * @param {string} text - Extracted text
   * @param {Object} coord - Coordinate
   */
  function handleExtractedText(text, coord) {
    if (c.creationMode === 'new') {
      c.newFieldData.field_value = text || '';
      c.newFieldData.coordinates = coord;
      c.showFieldDialog = true;
      $scope.$apply();
    } else if (c.creationMode === 'edit') {
      // Update the newFieldData with extracted text and show dialog for editing
      c.newFieldData.field_value = text || '';
      c.newFieldData.coordinates = coord;
      c.showFieldDialog = true;
      $scope.$apply();
    }
  }
  
  /**
   * Update existing field with new data
   * @param {Object} field - Field to update
   * @param {Object} coord - New coordinate
   * @param {string} text - Extracted text
   */
  function updateExistingField(field, coord, text) {
    field.coordinates = coord;
    field.allCoordinates = [coord];
    field.source = formatDString(coord);
    field.field_value = text || '';
    field.isPending = true;
    
    addToPendingFields(field);
    c.cancelFieldCreation();
    spUtil.addInfoMessage('Field updated - click Save to persist changes');
    $scope.$apply();
  }
  
  /**
   * Add field to pending queue
   * @param {Object} field - Field to add
   */
  function addToPendingFields(field) {
    var existingIndex = c.pendingFields.findIndex(function(f) {
      return f.sys_id === field.sys_id;
    });
    
    if (existingIndex === -1) {
      c.pendingFields.push(field);
    }
  }
  
  /**
   * Handle mouse down event
   * @param {MouseEvent} event - Mouse event
   */
  function handleMouseDown(event) {
    if (!c.isCreatingField) return;
    var coords = getMouseCoordinates(event);
    startDragSelection(coords);
    event.preventDefault();
  }
  
  /**
   * Handle mouse move event
   * @param {MouseEvent} event - Mouse event
   */
  function handleMouseMove(event) {
    if (!c.isCreatingField || !c.isDragging) return;
    var coords = getMouseCoordinates(event);
    updateDragSelection(coords);
  }
  
  /**
   * Handle mouse up event
   * @param {MouseEvent} event - Mouse event
   */
  function handleMouseUp(event) {
    if (!c.isCreatingField || !c.isDragging) return;
    
    var selection = completeDragSelection();
    if (!isValidSelection(selection)) {
      spUtil.addInfoMessage('Please drag to create a selection area');
      clearAnnotations();
      return;
    }
    
    processSelection(selection);
  }
  
  // ==========================================
  // 7. DRAWING FUNCTIONS
  // ==========================================
  
  /**
   * Draw selection rectangle during drag
   */
  function drawSelectionRectangle() {
    if (!annotationContext || !c.isDragging || !c.dragStart || !c.dragEnd) return;
    
    clearAnnotations();
    
    // Calculate rectangle dimensions
    var start = CoordinateConverter.toScreen(c.dragStart.x, c.dragStart.y);
    var end = CoordinateConverter.toScreen(c.dragEnd.x, c.dragEnd.y);
    
    var x = Math.min(start.x, end.x);
    var y = Math.min(start.y, end.y);
    var width = Math.abs(end.x - start.x);
    var height = Math.abs(end.y - start.y);
    
    // Draw selection rectangle
    annotationContext.fillStyle = CONSTANTS.COLORS.SELECTION_FILL;
    annotationContext.strokeStyle = CONSTANTS.COLORS.SELECTION_STROKE;
    annotationContext.lineWidth = CONSTANTS.BORDER_WIDTH.SELECTION;
    annotationContext.setLineDash(CONSTANTS.BORDER_WIDTH.DASH_PATTERN);
    
    annotationContext.fillRect(x, y, width, height);
    annotationContext.strokeRect(x, y, width, height);
    annotationContext.setLineDash([]);
    
    // Draw resize handles
    var handleSize = CONSTANTS.BORDER_WIDTH.HANDLE_SIZE;
    annotationContext.fillStyle = CONSTANTS.COLORS.SELECTION_HANDLE;
    annotationContext.fillRect(x - handleSize/2, y - handleSize/2, handleSize, handleSize);
    annotationContext.fillRect(x + width - handleSize/2, y - handleSize/2, handleSize, handleSize);
    annotationContext.fillRect(x - handleSize/2, y + height - handleSize/2, handleSize, handleSize);
    annotationContext.fillRect(x + width - handleSize/2, y + height - handleSize/2, handleSize, handleSize);
  }
  
  /**
   * Clear all annotations
   */
  function clearAnnotations() {
    if (annotationContext && annotationCanvas) {
      annotationContext.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
    }
    var marker = document.getElementById('pageMarker');
    if (marker) {
      marker.style.display = 'none';
    }
  }
  
  /**
   * Highlight multiple fields
   * @param {Array} coords - Array of coordinates
   * @param {boolean} scrollToView - Whether to scroll to view
   */
  function highlightMultipleFields(coords, scrollToView) {
    if (!coords || coords.length === 0 || !annotationContext) return;
    
    clearAnnotations();
    
    var centerX = 0, centerY = 0;
    
    coords.forEach(function(coord, index) {
      var p1 = CoordinateConverter.toScreen(coord.x1, coord.y1);
      var p2 = CoordinateConverter.toScreen(coord.x2 || coord.x1, coord.y2 || coord.y1);
      var p3 = CoordinateConverter.toScreen(coord.x3 || coord.x2, coord.y3 || coord.y2);
      var p4 = CoordinateConverter.toScreen(coord.x4 || coord.x1, coord.y4 || coord.y1);
      
      if (index === 0) {
        centerX = (p1.x + p2.x + p3.x + p4.x) / 4;
        centerY = (p1.y + p2.y + p3.y + p4.y) / 4;
      }
      
      // Use different colors for single vs multiple highlights
      var fillStyle = coords.length > 1 
        ? CONSTANTS.COLORS.MULTI_HIGHLIGHT_FILL 
        : CONSTANTS.COLORS.HIGHLIGHT_FILL;
      var strokeStyle = coords.length > 1 
        ? CONSTANTS.COLORS.MULTI_HIGHLIGHT_STROKE 
        : CONSTANTS.COLORS.HIGHLIGHT_STROKE;
      
      annotationContext.fillStyle = fillStyle;
      annotationContext.strokeStyle = strokeStyle;
      annotationContext.lineWidth = CONSTANTS.BORDER_WIDTH.HIGHLIGHT;
      
      annotationContext.beginPath();
      annotationContext.moveTo(p1.x, p1.y);
      annotationContext.lineTo(p2.x, p2.y);
      annotationContext.lineTo(p3.x, p3.y);
      annotationContext.lineTo(p4.x, p4.y);
      annotationContext.closePath();
      annotationContext.stroke();
    });
    
    if (scrollToView) {
      smoothScrollToCoordinate(centerX, centerY);
    }
  }
  
  /**
   * Highlight single field with animation
   * @param {Object} coord - Coordinate to highlight
   * @param {boolean} scrollToView - Whether to scroll
   */
  function highlightField(coord, scrollToView) {
    if (!coord || !annotationContext) return;
    
    clearAnnotations();
    
    var p1 = CoordinateConverter.toScreen(coord.x1, coord.y1);
    var p2 = CoordinateConverter.toScreen(coord.x2 || coord.x1, coord.y2 || coord.y1);
    var p3 = CoordinateConverter.toScreen(coord.x3 || coord.x2, coord.y3 || coord.y2);
    var p4 = CoordinateConverter.toScreen(coord.x4 || coord.x1, coord.y4 || coord.y1);
    
    var centerX = (p1.x + p2.x + p3.x + p4.x) / 4;
    var centerY = (p1.y + p2.y + p3.y + p4.y) / 4;
    
    var opacity = 0;
    
    function animateHighlight() {
      if (opacity < CONSTANTS.HIGHLIGHT_OPACITY) {
        opacity += CONSTANTS.HIGHLIGHT_OPACITY_STEP;
        
        annotationContext.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
        annotationContext.fillStyle = CONSTANTS.COLORS.HIGHLIGHT_FILL.replace(/[\d.]+\)$/, opacity + ')');
        annotationContext.strokeStyle = CONSTANTS.COLORS.HIGHLIGHT_STROKE.replace(/[\d.]+\)$/, (opacity * 2.5) + ')');
        annotationContext.lineWidth = CONSTANTS.BORDER_WIDTH.HIGHLIGHT;
        
        annotationContext.beginPath();
        annotationContext.moveTo(p1.x, p1.y);
        annotationContext.lineTo(p2.x, p2.y);
        annotationContext.lineTo(p3.x, p3.y);
        annotationContext.lineTo(p4.x, p4.y);
        annotationContext.closePath();
        annotationContext.stroke();
        
        requestAnimationFrame(animateHighlight);
      } else {
        annotationContext.fillStyle = CONSTANTS.COLORS.HIGHLIGHT_FILL;
        annotationContext.strokeStyle = CONSTANTS.COLORS.HIGHLIGHT_STROKE;
        annotationContext.fill();
      }
    }
    
    animateHighlight();
    
    if (scrollToView) {
      smoothScrollToCoordinate(centerX, centerY);
    }
  }
  
  /**
   * Smooth scroll to coordinate
   * @param {number} x - X position
   * @param {number} y - Y position
   */
  function smoothScrollToCoordinate(x, y) {
    var container = document.getElementById('pdfContainer');
    if (!container) return;
    
    var targetX = Math.max(0, Math.min(x - container.clientWidth / 2, 
      container.scrollWidth - container.clientWidth));
    var targetY = Math.max(0, Math.min(y - container.clientHeight / 2, 
      container.scrollHeight - container.clientHeight));
    
    container.scrollTo({
      left: targetX,
      top: targetY,
      behavior: 'smooth'
    });
  }
  
  /**
   * Enable creation mode visual indicators
   */
  function enableCreationMode() {
    var pdfContent = document.getElementById('pdfContainer');
    if (pdfContent) {
      pdfContent.classList.add('creation-mode');
    }
    if (annotationCanvas) {
      annotationCanvas.classList.add('creation-mode');
    }
  }
  
  /**
   * Disable creation mode visual indicators
   */
  function disableCreationMode() {
    var pdfContent = document.getElementById('pdfContainer');
    if (pdfContent) {
      pdfContent.classList.remove('creation-mode');
    }
    if (annotationCanvas) {
      annotationCanvas.classList.remove('creation-mode');
    }
  }
  
  // ==========================================
  // 8. TEXT EXTRACTION
  // ==========================================
  
  /**
   * Get area bounds in PDF units
   * @param {Object} coord - Coordinate object
   * @returns {Object} Bounds {minX, minY, maxX, maxY}
   */
  function getAreaBounds(coord) {
    return {
      minX: coord.x1 * CONSTANTS.PDF_POINTS_PER_INCH,
      minY: coord.y1 * CONSTANTS.PDF_POINTS_PER_INCH,
      maxX: coord.x3 * CONSTANTS.PDF_POINTS_PER_INCH,
      maxY: coord.y3 * CONSTANTS.PDF_POINTS_PER_INCH
    };
  }
  
  /**
   * Check if position is within bounds
   * @param {Object} pos - Position with x, y, width
   * @param {Object} bounds - Bounds object
   * @returns {boolean} True if in bounds
   */
  function isInBounds(pos, bounds) {
		
		console.log('POS: >>>> ', pos);
		console.log('bounds: >>>> ', bounds);
		
    return pos.x + pos.width >= bounds.minX && 
           pos.x <= bounds.maxX && 
           pos.y >= bounds.minY && 
           pos.y <= bounds.maxY;
  }
  
  /**
   * Filter text items within area
   * @param {Array} items - Text items from PDF.js
   * @param {Object} coord - Coordinate object
   * @returns {Array} Filtered and positioned items
   */
  function filterTextItemsInArea(items, coord) {
    var bounds = getAreaBounds(coord);
    var viewport = currentPageInstance.getViewport({ scale: 1.0 });
    var pageHeight = viewport.height;
    
    return items
      .map(function(item) {
        return {
          text: item.str,
          x: item.transform[4],
          y: pageHeight - item.transform[5],
          width: item.width || 0
        };
      })
      .filter(function(item) {
        return isInBounds(item, bounds);
      });
  }
  
  /**
   * Sort text items by position
   * @param {Array} items - Text items
   * @returns {Array} Sorted items
   */
  function sortTextItemsByPosition(items) {
    return items.sort(function(a, b) {
      var yDiff = a.y - b.y;
      return Math.abs(yDiff) > CONSTANTS.LINE_HEIGHT_THRESHOLD ? yDiff : a.x - b.x;
    });
  }
  
  /**
   * Combine text items with proper spacing
   * @param {Array} items - Sorted text items
   * @returns {string} Combined text
   */
  function combineTextItems(items) {
    var text = '';
    var lastY = -1;
    
    items.forEach(function(item, index) {
      if (index > 0) {
        text += Math.abs(item.y - lastY) > CONSTANTS.LINE_HEIGHT_THRESHOLD ? '\n' : ' ';
      }
      text += item.text;
      lastY = item.y;
    });
    
    return text.trim();
  }
  
  /**
   * Extract text from selected area
   * @param {Object} coord - Coordinate object
   * @returns {Promise<string>} Extracted text
   */
  function extractTextFromArea(coord) {
    return new Promise(function(resolve, reject) {
      if (!currentPageInstance) {
        resolve('');
        return;
      }
      
      currentPageInstance.getTextContent()
        .then(function(textContent) {
					console.log('LALALAL')
					console.log(textContent);
				
          var selectedItems = filterTextItemsInArea(textContent.items, coord);
          var sortedItems = sortTextItemsByPosition(selectedItems);
          var extractedText = combineTextItems(sortedItems);
          resolve(extractedText);
        })
        .catch(function(error) {
          console.error('Error extracting text:', error);
          reject(error);
        });
    });
  }
  
  // ==========================================
  // 9. PDF RENDERING
  // ==========================================
  
  /**
   * Load PDF from URL
   * @param {string} url - PDF URL
   */
  function loadPdfFromUrl(url) {
    c.loadingMessage = 'Loading PDF document...';
    
    if (renderTask) {
      renderTask.cancel();
      renderTask = null;
    }
    
    var loadingTask = $window.pdfjsLib.getDocument({
      url: url,
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/cmaps/',
      cMapPacked: true
    });
    
    loadingTask.promise
      .then(function(pdf) {
        pdfDoc = pdf;
        c.pdfLoaded = true;
        c.totalPages = pdf.numPages;
        c.currentPage = 1;
        c.zoomMode = 'actual-size';
        
        $scope.$apply(function() {
          c.isLoading = false;
        });
        
        $timeout(function() {
          renderPage(c.currentPage);
        }, CONSTANTS.RENDER_DELAY);
      })
      .catch(function(error) {
        c.isLoading = false;
        handleError('PDF loading', error, 'Failed to load PDF: ' + error.message);
      });
  }
  
  /**
   * Render PDF page
   * @param {number} pageNumber - Page number to render
   */
  function renderPage(pageNumber) {
    if (!pdfDoc || !canvas || !pdfContext) return;
    
    if (pageRendering) {
      pageNumPending = pageNumber;
      return;
    }
    
    pageRendering = true;
    c.loadingMessage = 'Rendering page ' + pageNumber + '...';
    
    if (renderTask) {
      renderTask.cancel();
    }
    
    pdfDoc.getPage(pageNumber)
      .then(function(page) {
        currentPageInstance = page;
        
        if (c.zoomMode === 'fit-width') {
          var container = document.getElementById('pdfContainer');
          if (container) {
            c.containerWidth = container.clientWidth - 40;
            var baseViewport = page.getViewport({ scale: 1.0 });
            c.scale = c.containerWidth / baseViewport.width;
          }
        }
        
        var viewport = page.getViewport({ scale: c.scale });
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        annotationCanvas.height = viewport.height;
        annotationCanvas.width = viewport.width;
        
        pdfContext.clearRect(0, 0, canvas.width, canvas.height);
        clearAnnotations();
        
        renderTask = page.render({
          canvasContext: pdfContext,
          viewport: viewport
        });
        
        renderTask.promise
          .then(function() {
            pageRendering = false;
            renderTask = null;
            
            if (pageNumPending !== null) {
              renderPage(pageNumPending);
              pageNumPending = null;
            }
            
            // Re-draw highlights or selection
            if (c.isCreatingField && c.isDragging) {
              drawSelectionRectangle();
            } else if (c.activeField && c.activeField.allCoordinates) {
              var coordsOnPage = c.activeField.allCoordinates.filter(function(coord) {
                return coord.page === pageNumber;
              });
              
              if (coordsOnPage.length > 0) {
                $timeout(function() {
                  highlightMultipleFields(coordsOnPage, false);
                }, CONSTANTS.RENDER_DELAY);
              }
            }
          })
          .catch(function(error) {
            if (error.name !== 'RenderingCancelledException') {
              pageRendering = false;
              handleError('Page rendering', error, 'Failed to render page');
            }
          });
      })
      .catch(function(error) {
        pageRendering = false;
        handleError('Page retrieval', error, 'Failed to get page');
      });
  }
  
  // ==========================================
  // 10. NAVIGATION
  // ==========================================
  
  /**
   * Navigate to field
   * @param {Object} field - Field to navigate to
   */
  c.navigateToField = function(field) {
    if (!field || !field.allCoordinates || field.allCoordinates.length === 0 || !canvas) return;
    
    c.activeField = field;
    var firstCoord = field.allCoordinates[0];
    
    if (firstCoord.page !== c.currentPage) {
      c.currentPage = firstCoord.page;
      renderPage(c.currentPage);
      
      $timeout(function() {
        var coordsOnPage = field.allCoordinates.filter(function(coord) {
          return coord.page === c.currentPage;
        });
        highlightMultipleFields(coordsOnPage, true);
      }, CONSTANTS.SCROLL_DELAY);
    } else {
      var coordsOnPage = field.allCoordinates.filter(function(coord) {
        return coord.page === c.currentPage;
      });
      highlightMultipleFields(coordsOnPage, true);
    }
  };
  
  /**
   * Navigate to single coordinate
   * @param {Object} coord - Coordinate to navigate to
   */
  c.navigateToSingleCoordinate = function(coord) {
    if (!coord || !canvas) return;
    
    if (coord.page !== c.currentPage) {
      c.currentPage = coord.page;
      renderPage(c.currentPage);
      
      $timeout(function() {
        highlightField(coord, true);
      }, CONSTANTS.SCROLL_DELAY);
    } else {
      highlightField(coord, true);
    }
  };
  
  /**
   * Next page
   */
  c.nextPage = function() {
    if (c.currentPage < c.totalPages && !pageRendering) {
      c.currentPage++;
      c.activeField = null;
      renderPage(c.currentPage);
    }
  };
  
  /**
   * Previous page
   */
  c.previousPage = function() {
    if (c.currentPage > 1 && !pageRendering) {
      c.currentPage--;
      c.activeField = null;
      renderPage(c.currentPage);
    }
  };
  
  /**
   * Zoom in
   */
  c.zoomIn = debounce(function() {
    if (c.scale < CONSTANTS.MAX_ZOOM_SCALE) {
      c.scale = Math.min(CONSTANTS.MAX_ZOOM_SCALE, c.scale * CONSTANTS.ZOOM_STEP);
      renderPage(c.currentPage);
    }
  }, CONSTANTS.DEBOUNCE_DELAY);
  
  /**
   * Zoom out
   */
  c.zoomOut = debounce(function() {
    if (c.scale > CONSTANTS.MIN_ZOOM_SCALE) {
      c.scale = Math.max(CONSTANTS.MIN_ZOOM_SCALE, c.scale / CONSTANTS.ZOOM_STEP);
      renderPage(c.currentPage);
    }
  }, CONSTANTS.DEBOUNCE_DELAY);
  
  /**
   * Reset zoom
   */
  c.resetZoom = function() {
    c.scale = 1.0;
    renderPage(c.currentPage);
  };
  
  /**
   * Fit to width
   */
  c.fitWidth = function() {
    if (!pdfDoc || !currentPageInstance) return;
    
    c.zoomMode = 'fit-width';
    var container = document.getElementById('pdfContainer');
    if (container) {
      c.containerWidth = container.clientWidth - 40;
      var viewport = currentPageInstance.getViewport({ scale: 1.0 });
      c.scale = c.containerWidth / viewport.width;
      renderPage(c.currentPage);
    }
  };
  
  /**
   * Actual 100% size
   */
  c.actual100Percent = function() {
    if (!pdfDoc) return;
    c.zoomMode = 'actual-size';
    c.scale = 1.0;
    renderPage(c.currentPage);
  };
  
  // ==========================================
  // 11. SEARCH & FILTER
  // ==========================================
  
  /**
   * Flatten grouped fields to array
   * @param {Object} groupedFields - Grouped fields object
   * @returns {Array} Flattened array
   */
  c.flatten = function(groupedFields) {
    var result = [];
    for (var key in groupedFields) {
      if (groupedFields.hasOwnProperty(key) && Array.isArray(groupedFields[key])) {
        result = result.concat(groupedFields[key]);
      }
    }
    return result;
  };
  
  /**
   * Get filtered fields by both search and document
   * @returns {Array} Filtered fields
   */
  c.getFilteredByBoth = function() {
    var result = c.flatten(c.groupedFields);
    
    if (c.fieldSearch) {
      var searchLower = c.fieldSearch.toLowerCase();
      result = result.filter(function(item) {
        return item.field_name && item.field_name.toLowerCase().indexOf(searchLower) !== -1;
      });
    }
    
    if (c.selectedDocument && c.selectedDocument.name) {
      result = result.filter(function(item) {
        return item.attachmentData && 
               item.attachmentData.file_name === c.selectedDocument.name;
      });
    }
    
    return result;
  };
  
  /**
   * Get filtered count
   * @returns {number} Count
   */
  c.getFilteredCount = function() {
    return c.getFilteredByBoth().length;
  };
  
  /**
   * Get total count
   * @returns {number} Count
   */
  c.getTotalCount = function() {
    return c.flatten(c.groupedFields).length;
  };
  
  /**
   * Get document field count
   * @returns {number} Count
   */
  c.getDocumentFieldCount = function() {
    if (!c.selectedDocument || !c.selectedDocument.name) {
      return c.getTotalCount();
    }
    
    return c.flatten(c.groupedFields).filter(function(item) {
      return item.attachmentData && item.attachmentData.file_name === c.selectedDocument.name;
    }).length;
  };
  
  /**
   * Get filtered grouped fields
   * @returns {Object} Grouped fields
   */
  c.getFilteredGroupedFields = function() {
    var filtered = c.getFilteredByBoth();
    var grouped = {};
    
    filtered.forEach(function(field) {
      var sectionName = field.new_section_name || 'Uncategorized';
      
      if (!field.allCoordinates) {
        field.allCoordinates = field.coordinates ? [field.coordinates] : [];
      }
      
      if (!grouped[sectionName]) {
        grouped[sectionName] = [];
      }
      grouped[sectionName].push(field);
    });
    
    var sortedSections = {};
    Object.keys(grouped).sort().forEach(function(key) {
      sortedSections[key] = grouped[key];
    });
    
    return sortedSections;
  };
  
  /**
   * Get filtered section fields
   * @param {string} sectionName - Section name
   * @returns {Array} Filtered fields
   */
  c.getFilteredSectionFields = function(sectionName) {
    var filteredGroups = c.getFilteredGroupedFields();
    return filteredGroups[sectionName] || [];
  };
  
  /**
   * Get section average score
   * @param {string} sectionName - Section name
   * @returns {number} Average score
   */
  c.getSectionAverageScore = function(sectionName) {
    var fields = c.groupedFields[sectionName] || [];
    if (fields.length === 0) return 0;
    
    var sum = fields.reduce(function(total, item) {
      return total + (item.confidence_indicator || 0);
    }, 0);
    
    return sum / fields.length;
  };
  
  /**
   * Get section filtered count
   * @param {string} sectionName - Section name
   * @returns {number} Count
   */
  c.getSectionFilteredCount = function(sectionName) {
    var fields = c.groupedFields[sectionName] || [];
    var filtered = fields;
    
    if (c.fieldSearch) {
      var searchLower = c.fieldSearch.toLowerCase();
      filtered = filtered.filter(function(item) {
        return item.field_name && item.field_name.toLowerCase().indexOf(searchLower) !== -1;
      });
    }
    
    if (c.selectedDocument && c.selectedDocument.name) {
      filtered = filtered.filter(function(item) {
        return item.attachmentData && 
               item.attachmentData.file_name === c.selectedDocument.name;
      });
    }
    
    return filtered.length;
  };
  
  /**
   * Toggle section collapse
   * @param {string} sectionName - Section name
   */
  c.toggleSection = function(sectionName) {
    c.collapsedSections[sectionName] = !c.collapsedSections[sectionName];
  };
  
  /**
   * Trim initial numbers from text
   * @param {string} text - Text to trim
   * @returns {string} Trimmed text
   */
  c.trimInitialNumberAdvanced = function(text) {
    return text.replace(/^(Group:\s*\d+\s*|\d+(?:\.\d+)*[\.\)\-\s]*)/, '').trim();
  };
  
  /**
   * Get confidence class
   * @param {number} confidence - Confidence score
   * @returns {string} CSS class
   */
  c.getConfidenceClass = function(confidence) {
    var value = parseFloat(confidence) || 0;
    if (value >= 0.75) return 'bg-green-100';
    if (value >= 0.5) return 'bg-yellow-100';
    return 'bg-red-100';
  };
  
  // ==========================================
  // 12. DATA PROCESSING
  // ==========================================
  
  /**
   * Parse coordinate string
   * @param {string} source - D-string coordinate
   * @returns {Object|null} Parsed coordinate or null
   */
  function parseCoordinateString(source) {
    if (!source || typeof source !== 'string') return null;
    
    var match = source.match(/D\((\d+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)/);
    if (match) {
      return {
        page: parseInt(match[1]),
        x1: parseFloat(match[2]),
        y1: parseFloat(match[3]),
        x2: parseFloat(match[4]),
        y2: parseFloat(match[5]),
        x3: parseFloat(match[6]),
        y3: parseFloat(match[7]),
        x4: parseFloat(match[8]),
        y4: parseFloat(match[9])
      };
    }
    return null;
  }
  
  /**
   * Parse multiple coordinate strings
   * @param {string} source - Semicolon-separated D-strings
   * @returns {Array} Array of coordinates
   */
  function parseMultipleCoordinateStrings(source) {
    if (!source || typeof source !== 'string') return [];
    
    var dStrings = source.split(';');
    var coordinates = [];
    
    dStrings.forEach(function(dString) {
      var coord = parseCoordinateString(dString.trim());
      if (coord) {
        coordinates.push(coord);
      }
    });
    
    return coordinates;
  }
  
  /**
   * Group fields by section
   * @param {Array} processedMappingData - Processed mapping data
   * @returns {Object} Grouped fields
   */
  function groupFieldsBySection(processedMappingData) {
    var grouped = {};
    
    if (!processedMappingData || processedMappingData.length === 0) {
      return grouped;
    }
    
    processedMappingData.forEach(function(field) {
      // Use section_name from server, fallback to new_section_name for new fields
      var sectionName = field.section_name || field.new_section_name || 'Uncategorized';
      
      if (!field.allCoordinates) {
        field.allCoordinates = field.coordinates ? [field.coordinates] : [];
      }
      
      if (!grouped[sectionName]) {
        grouped[sectionName] = [];
      }
      
      grouped[sectionName].push(field);
    });
    
    var sortedSections = {};
    Object.keys(grouped).sort().forEach(function(key) {
      sortedSections[key] = grouped[key];
    });
    
    return sortedSections;
  }
  
  /**
   * Process mapping data
   * @param {Array} mappingData - Raw mapping data
   */
  function processMappingData(mappingData) {
    if (!mappingData || !Array.isArray(mappingData)) {
      return;
    }
    
    var processedMappingData = mappingData
      .map(function(mapping) {
        var allCoordinates = parseMultipleCoordinateStrings(mapping.source);
        mapping.coordinates = allCoordinates.length > 0 ? allCoordinates[0] : null;
        mapping.allCoordinates = allCoordinates;
        return mapping;
      })
      .filter(function(mapping) {
        return mapping.allCoordinates.length > 0;
      });
    
    c.groupedFields = groupFieldsBySection(processedMappingData);
    c.collapsedSections = {};
    Object.keys(c.groupedFields).forEach(function(key) {
      c.collapsedSections[key] = false;
    });
  }
  
  /**
   * Extract attachment options from response
   * @param {Array} jsonResponse - JSON response
   * @returns {Array} Unique attachment options
   */
  function extractAttachmentOptions(jsonResponse) {
    var seen = new Set();
    var options = [];
    
    jsonResponse.forEach(function(record) {
      if (record.attachmentData && 
          record.attachmentData.file_name && 
          record.attachmentData.file_url &&
          !seen.has(record.attachmentData.file_name)) {
        
        seen.add(record.attachmentData.file_name);
        options.push({
          name: record.attachmentData.file_name,
          url: record.attachmentData.file_url
        });
      }
    });
    
    return options;
  }
  
  /**
   * Filter coordinates by selected document
   * @param {Object} selectedDocument - Selected document
   */
  function filterCoordinatesBySelectedDocument(selectedDocument) {
    // This function is kept for compatibility but simplified
    // Filtering is now done in getFilteredByBoth()
  }
  
  // ==========================================
  // 13. DOCUMENT OPERATIONS
  // ==========================================
  
  /**
   * Load document
   */
  c.loadDocument = function() {
    if (!c.selectedDocument) return;
    
    c.isLoading = true;
    c.loadingMessage = 'Loading document...';
    c.activeField = null;
    clearAnnotations();
    
    loadPdfFromUrl(c.selectedDocument.url);
    filterCoordinatesBySelectedDocument(c.selectedDocument);
  };
  
  // ==========================================
  // 14. MANUAL COORDINATES
  // ==========================================
  
  /**
   * Watch manual coordinate changes
   */
  $scope.$watch('c.manualCoordinate', function(newVal) {
    if (!newVal) {
      c.parsedManualCoordinates = [];
      c.parsedCoordinatesCount = 0;
      return;
    }
    
    var coords = parseMultipleCoordinateStrings(newVal);
    c.parsedManualCoordinates = coords.map(function(coord) {
      coord.displayText = 'x1:' + coord.x1.toFixed(1) + ', y1:' + coord.y1.toFixed(1) + 
                         ', x2:' + coord.x2.toFixed(1) + ', y2:' + coord.y2.toFixed(1);
      return coord;
    });
    c.parsedCoordinatesCount = coords.length;
  });
  
  /**
   * Navigate to manual coordinates
   */
  c.navigateToManualCoordinates = function() {
    if (!c.manualCoordinate) {
      spUtil.addErrorMessage('Please enter coordinate string(s)');
      return;
    }
    
    var coords = parseMultipleCoordinateStrings(c.manualCoordinate);
    
    if (coords.length === 0) {
      spUtil.addErrorMessage('Invalid coordinates');
      return;
    }
    
    c.activeField = { 
      allCoordinates: coords, 
      coordinates: coords[0],
      field_name: 'Manual Coordinates (' + coords.length + ')' 
    };
    
    var firstCoord = coords[0];
    
    if (firstCoord.page !== c.currentPage) {
      c.currentPage = firstCoord.page;
      renderPage(c.currentPage);
      
      $timeout(function() {
        var coordsOnPage = coords.filter(function(coord) {
          return coord.page === c.currentPage;
        });
        highlightMultipleFields(coordsOnPage, true);
      }, CONSTANTS.SCROLL_DELAY);
    } else {
      var coordsOnPage = coords.filter(function(coord) {
        return coord.page === c.currentPage;
      });
      highlightMultipleFields(coordsOnPage, true);
    }
    
    spUtil.addInfoMessage('Highlighting ' + coords.length + ' coordinate(s)');
  };
  
  /**
   * Copy current coordinates
   */
  c.copyCurrentCoordinates = function() {
    if (!c.activeField || !c.activeField.allCoordinates) {
      spUtil.addInfoMessage('No active field selected');
      return;
    }
    
    var dStrings = c.activeField.allCoordinates.map(formatDString);
    var fullString = dStrings.join(';');
    c.manualCoordinate = fullString;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullString)
        .then(function() {
          spUtil.addInfoMessage('Coordinates copied to clipboard! (' + dStrings.length + ' coordinate(s))');
        })
        .catch(function() {
          spUtil.addInfoMessage('Coordinates updated in manual fields');
        });
    } else {
      var tempInput = document.createElement('textarea');
      tempInput.value = fullString;
      document.body.appendChild(tempInput);
      tempInput.select();
      try {
        document.execCommand('copy');
        spUtil.addInfoMessage('Coordinates copied to clipboard! (' + dStrings.length + ' coordinate(s))');
      } catch (err) {
        spUtil.addInfoMessage('Coordinates updated in manual fields');
      }
      document.body.removeChild(tempInput);
    }
  };
  
  // ==========================================
  // 15. INITIALIZATION
  // ==========================================
  
  /**
   * Initialize widget
   */
  function initializeWidget() {
    c.loadingMessage = 'Initializing...';
    
    $timeout(function() {
      canvas = document.getElementById('pdfCanvas');
      annotationCanvas = document.getElementById('annotationCanvas');
      
      if (canvas && annotationCanvas) {
        pdfContext = canvas.getContext('2d');
        annotationContext = annotationCanvas.getContext('2d');
        
        // Add mouse event listeners
        annotationCanvas.addEventListener('mousedown', handleMouseDown);
        annotationCanvas.addEventListener('mousemove', handleMouseMove);
        annotationCanvas.addEventListener('mouseup', handleMouseUp);
        
        // Handle mouse leave
        annotationCanvas.addEventListener('mouseleave', function(event) {
          if (c.isDragging) {
            c.isDragging = false;
            clearAnnotations();
          }
        });
      }
    }, CONSTANTS.RENDER_DELAY);
    
    loadSourceMapping();
  }
  
  /**
   * Load PDF.js library
   */
  function loadPdfJs() {
    c.isLoading = true;
    c.loadingMessage = 'Loading PDF library...';
    
    if (!$window.pdfjsLib) {
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.min.js';
      script.onload = function() {
        $window.pdfjsLib.GlobalWorkerOptions.workerSrc = 
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';
        initializeWidget();
      };
      script.onerror = function() {
        c.isLoading = false;
        spUtil.addErrorMessage('Failed to load PDF library');
      };
      document.head.appendChild(script);
    } else {
      initializeWidget();
    }
  }
  
  /**
   * Load source mapping from server
   */
  function loadSourceMapping() {
    if (!submissionSysId) {
      c.isLoading = false;
      return;
    }
    
    c.loadingMessage = 'Loading field mappings...';
    
    c.server.get({
      action: 'fetchMapping',
      submissionSysId: submissionSysId
    })
      .then(function(response) {
        var documentList = extractAttachmentOptions(response.data.mapping);
        
        if (documentList.length === 0) {
          spUtil.addErrorMessage('No Document Returned From Submission');
        }
        
        c.documents = documentList;
        c.selectedDocument = documentList[0];
        
        if (c.selectedDocument) {
          c.loadDocument();
        }
        
        if (response.data.success) {
          processMappingData(response.data.mapping);
        }
        
        c.isLoading = false;
      })
      .catch(function(error) {
        c.isLoading = false;
        handleError('Load mapping', error, 'Failed to load field mappings');
      });
  }
  
  // ==========================================
  // 16. CLEANUP
  // ==========================================
  
  /**
   * Cleanup on destroy
   */
  $scope.$on('$destroy', function() {
    if (renderTask) {
      renderTask.cancel();
    }
    if (pdfDoc) {
      pdfDoc.destroy();
    }
    if (annotationCanvas) {
      annotationCanvas.removeEventListener('mousedown', handleMouseDown);
      annotationCanvas.removeEventListener('mousemove', handleMouseMove);
      annotationCanvas.removeEventListener('mouseup', handleMouseUp);
    }
  });
  
  /**
   * Window resize handler
   */
  var resizeHandler = debounce(function() {
    if (c.zoomMode === 'fit-width' && pdfDoc && currentPageInstance) {
      c.fitWidth();
    }
  }, CONSTANTS.DEBOUNCE_DELAY);
  
  $window.addEventListener('resize', resizeHandler);
  
  // ==========================================
  // 17. START APPLICATION
  // ==========================================
  
  $timeout(function() {
    loadPdfJs();
  }, CONSTANTS.RENDER_DELAY);
};

