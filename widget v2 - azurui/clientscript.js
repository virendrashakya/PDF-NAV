api.controller = function($scope, $location, $filter, $window, spUtil, $timeout) {
  var c = this;
  
  // Initialize variables (existing)
  c.pdfLoaded = false;
  c.extractedFields = [];
  c.globalExtractedFields = [];
  c.groupedFields = {};
  c.collapsedSections = {};
  c.scale = 1.0;
  c.currentPage = 1;
  c.totalPages = 0;
  c.activeField = null;
  c.activeFieldCoordIndex = 0;
  c.mappingData = null;
  c.fieldSearch = '';
  c.showAdvancedButton = false;
  c.showAdvancedMode = false;
  c.manualCoordinate = '';
  c.manualFields = { page: 1, x1: 0, y1: 0, x2: 0, y2: 0, x3: 0, y3: 0, x4: 0, y4: 0 };
  c.calculatedPixels = '';
  c.parsedManualCoordinates = [];
  c.parsedCoordinatesCount = 0;
  c.documents = [];
  c.selectedDocument = '';
  c.pdfFile = null;
  c.jsonFile = null;
  c.canUpload = c.data.canUpload || false;
  c.isLoading = false;
  c.loadingMessage = 'Loading...';
  c.zoomMode = 'actual-size';
  c.containerWidth = 0;
  
  // NEW: Field creation mode variables
  c.isCreatingField = false;
  c.creationPoints = [];
  c.creationMode = 'new'; // 'new', 'add', 'edit'
  c.editingField = null;
  c.editingCoordIndex = null;
  c.showFieldDialog = false;
  c.newFieldData = {
    field_name: '',
    field_value: '',
    section_name: 'User Created',
    confidence_indicator: 1.0
  };
  c.tempCoordinateSets = [];
  
  $('head title').text("Genpact Insurance Policy Suite");
  
  // PDF.js variables (existing)
  var pdfDoc = null;
  var canvas = null;
  var ctx = null;
  var annotationCanvas = null;
  var annotationCtx = null;
  var pageRendering = false;
  var pageNumPending = null;
  var currentHighlights = [];
  var renderTask = null;
  var currentPageInstance = null;
  
  // URL parameters
  var submissionSysId = $location.search().submissionSysId || '74c2873d93947210ce18b5d97bba102d';
  
  // Performance optimization: Debounce functions (existing)
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
  
  // NEW: Start field creation mode
  c.startFieldCreation = function() {
    if (!c.pdfLoaded) {
      spUtil.addErrorMessage('Please load a document first');
      return;
    }
    c.isCreatingField = true;
    c.creationMode = 'new';
    c.creationPoints = [];
    c.tempCoordinateSets = [];
    c.newFieldData = {
      field_name: '',
      field_value: '',
      section_name: 'User Created',
      confidence_indicator: 1.0
    };
    clearAnnotations();
    spUtil.addInfoMessage('Click 4 points on the PDF to define a field boundary');
  };
  
  // NEW: Add coordinates to existing field
  c.addCoordinatesToField = function(field) {
    if (!c.pdfLoaded) return;
    c.isCreatingField = true;
    c.creationMode = 'add';
    c.editingField = field;
    c.creationPoints = [];
    clearAnnotations();
    highlightMultipleFields(field.allCoordinates, false);
    spUtil.addInfoMessage('Click 4 points to add another coordinate set to: ' + field.field_name);
  };
  
  // NEW: Edit specific coordinate set
  c.editCoordinate = function(field, coordIndex) {
    if (!c.pdfLoaded) return;
    c.isCreatingField = true;
    c.creationMode = 'edit';
    c.editingField = field;
    c.editingCoordIndex = coordIndex;
    c.creationPoints = [];
    clearAnnotations();
    
    // Highlight other coordinates in the set
    var otherCoords = field.allCoordinates.filter(function(coord, idx) {
      return idx !== coordIndex;
    });
    if (otherCoords.length > 0) {
      highlightMultipleFields(otherCoords, false);
    }
    
    spUtil.addInfoMessage('Click 4 points to replace coordinate set ' + (coordIndex + 1));
  };
  
  // NEW: Delete coordinate set
  c.deleteCoordinate = function(field, coordIndex) {
    if (!field.allCoordinates || field.allCoordinates.length <= 1) {
      spUtil.addErrorMessage('Cannot delete the only coordinate set. Delete the field instead.');
      return;
    }
    
    field.allCoordinates.splice(coordIndex, 1);
    field.coordinates = field.allCoordinates[0];
    
    // Update source string
    field.source = field.allCoordinates.map(function(coord) {
      return formatDString(coord);
    }).join(';');
    
    spUtil.addInfoMessage('Coordinate set deleted');
    c.saveFieldChanges(field);
  };
  
  // NEW: Delete entire field
  c.deleteField = function(field) {
    if (!confirm('Are you sure you want to delete this field?')) return;
    
    // Find and remove from grouped fields
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
    });
  };
  
  // NEW: Cancel field creation
  c.cancelFieldCreation = function() {
    c.isCreatingField = false;
    c.creationPoints = [];
    c.editingField = null;
    c.editingCoordIndex = null;
    c.tempCoordinateSets = [];
    clearAnnotations();
    
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
  
  // NEW: Save new field or complete edit
  c.saveNewField = function() {
    if (c.creationMode === 'new' && !c.newFieldData.field_name) {
      spUtil.addErrorMessage('Please enter a field name');
      return;
    }
    
    if (c.creationMode === 'new') {
      // Create new field object
      var newField = {
        field_name: c.newFieldData.field_name,
        field_value: c.newFieldData.field_value,
        new_section_name: c.newFieldData.section_name,
        confidence_indicator: c.newFieldData.confidence_indicator,
        allCoordinates: c.tempCoordinateSets,
        coordinates: c.tempCoordinateSets[0],
        source: c.tempCoordinateSets.map(formatDString).join(';'),
        attachmentData: {
          file_name: c.selectedDocument ? c.selectedDocument.name : '',
          file_url: c.selectedDocument ? c.selectedDocument.url : ''
        },
        sys_id: 'temp_' + Date.now()
      };
      
      // Add to grouped fields
      if (!c.groupedFields[newField.new_section_name]) {
        c.groupedFields[newField.new_section_name] = [];
        c.collapsedSections[newField.new_section_name] = false;
      }
      c.groupedFields[newField.new_section_name].push(newField);
      
      spUtil.addInfoMessage('Field created: ' + newField.field_name);
      c.saveFieldChanges(newField);
    }
    
    c.showFieldDialog = false;
    c.cancelFieldCreation();
  };
  
  // NEW: Format coordinate to D string
  function formatDString(coord) {
    return 'D(' + coord.page + ',' +
           coord.x1.toFixed(4) + ',' + coord.y1.toFixed(4) + ',' +
           coord.x2.toFixed(4) + ',' + coord.y2.toFixed(4) + ',' +
           coord.x3.toFixed(4) + ',' + coord.y3.toFixed(4) + ',' +
           coord.x4.toFixed(4) + ',' + coord.y4.toFixed(4) + ')';
  }
  
  // NEW: Save field changes to server
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
      if (response.data.success) {
        if (response.data.sys_id && field.sys_id.indexOf('temp_') === 0) {
          field.sys_id = response.data.sys_id;
        }
      }
    });
  };
  
  // NEW: Handle canvas click for point selection
  function handleCanvasClick(event) {
    if (!c.isCreatingField) return;
    
    var rect = canvas.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var y = event.clientY - rect.top;
    
    // Convert to PDF coordinates
    var pdfX = x / (72 * c.scale);
    var pdfY = y / (72 * c.scale);
    
    c.creationPoints.push({x: pdfX, y: pdfY});
    
    // Draw temporary point
    drawTemporaryPoints();
    
    if (c.creationPoints.length === 4) {
      // Complete the coordinate set
      var newCoord = {
        page: c.currentPage,
        x1: c.creationPoints[0].x,
        y1: c.creationPoints[0].y,
        x2: c.creationPoints[1].x,
        y2: c.creationPoints[1].y,
        x3: c.creationPoints[2].x,
        y3: c.creationPoints[2].y,
        x4: c.creationPoints[3].x,
        y4: c.creationPoints[3].y
      };
      
      if (c.creationMode === 'new') {
        c.tempCoordinateSets.push(newCoord);
        c.creationPoints = [];
        
        // Ask if user wants to add more coordinates
        if (confirm('Coordinate set added. Add another coordinate set for this field?')) {
          drawTemporaryCoordinateSets();
        } else {
          c.showFieldDialog = true;
          $scope.$apply();
        }
      } else if (c.creationMode === 'add') {
        c.editingField.allCoordinates.push(newCoord);
        c.editingField.source = c.editingField.allCoordinates.map(formatDString).join(';');
        c.saveFieldChanges(c.editingField);
        c.cancelFieldCreation();
        spUtil.addInfoMessage('Coordinate set added');
        $scope.$apply();
      } else if (c.creationMode === 'edit') {
        c.editingField.allCoordinates[c.editingCoordIndex] = newCoord;
        if (c.editingCoordIndex === 0) {
          c.editingField.coordinates = newCoord;
        }
        c.editingField.source = c.editingField.allCoordinates.map(formatDString).join(';');
        c.saveFieldChanges(c.editingField);
        c.cancelFieldCreation();
        spUtil.addInfoMessage('Coordinate set updated');
        $scope.$apply();
      }
    } else {
      spUtil.addInfoMessage((4 - c.creationPoints.length) + ' points remaining');
    }
  }
  
  // NEW: Draw temporary points during creation
  function drawTemporaryPoints() {
    if (!annotationCtx) return;
    
    clearAnnotations();
    drawTemporaryCoordinateSets();
    
    // Draw points
    annotationCtx.fillStyle = 'rgba(220, 38, 127, 0.8)';
    annotationCtx.strokeStyle = 'rgba(220, 38, 127, 1)';
    
    c.creationPoints.forEach(function(point, index) {
      var x = point.x * 72 * c.scale;
      var y = point.y * 72 * c.scale;
      
      // Draw circle
      annotationCtx.beginPath();
      annotationCtx.arc(x, y, 5, 0, 2 * Math.PI);
      annotationCtx.fill();
      annotationCtx.stroke();
      
      // Draw number
      annotationCtx.fillStyle = 'white';
      annotationCtx.font = 'bold 10px Arial';
      annotationCtx.fillText((index + 1).toString(), x - 3, y + 3);
      annotationCtx.fillStyle = 'rgba(220, 38, 127, 0.8)';
    });
    
    // Draw lines between points
    if (c.creationPoints.length > 1) {
      annotationCtx.strokeStyle = 'rgba(220, 38, 127, 0.5)';
      annotationCtx.setLineDash([5, 5]);
      annotationCtx.beginPath();
      for (var i = 0; i < c.creationPoints.length; i++) {
        var x = c.creationPoints[i].x * 72 * c.scale;
        var y = c.creationPoints[i].y * 72 * c.scale;
        if (i === 0) {
          annotationCtx.moveTo(x, y);
        } else {
          annotationCtx.lineTo(x, y);
        }
      }
      if (c.creationPoints.length === 3) {
        // Preview closing line
        var x0 = c.creationPoints[0].x * 72 * c.scale;
        var y0 = c.creationPoints[0].y * 72 * c.scale;
        annotationCtx.lineTo(x0, y0);
      }
      annotationCtx.stroke();
      annotationCtx.setLineDash([]);
    }
  }
  
  // NEW: Draw temporary coordinate sets
  function drawTemporaryCoordinateSets() {
    if (!annotationCtx || c.tempCoordinateSets.length === 0) return;
    
    c.tempCoordinateSets.forEach(function(coord) {
      if (coord.page === c.currentPage) {
        annotationCtx.fillStyle = 'rgba(34, 197, 94, 0.2)';
        annotationCtx.strokeStyle = 'rgba(34, 197, 94, 0.6)';
        annotationCtx.lineWidth = 2;
        
        var x1 = coord.x1 * 72 * c.scale;
        var y1 = coord.y1 * 72 * c.scale;
        var x2 = coord.x2 * 72 * c.scale;
        var y2 = coord.y2 * 72 * c.scale;
        var x3 = coord.x3 * 72 * c.scale;
        var y3 = coord.y3 * 72 * c.scale;
        var x4 = coord.x4 * 72 * c.scale;
        var y4 = coord.y4 * 72 * c.scale;
        
        annotationCtx.beginPath();
        annotationCtx.moveTo(x1, y1);
        annotationCtx.lineTo(x2, y2);
        annotationCtx.lineTo(x3, y3);
        annotationCtx.lineTo(x4, y4);
        annotationCtx.closePath();
        annotationCtx.fill();
        annotationCtx.stroke();
      }
    });
  }
  
  // Add ALL existing trimInitialNumberAdvanced and other helper functions here...
  c.trimInitialNumberAdvanced = function(text) {
    return text.replace(/^(Group:\s*\d+\s*|\d+(?:\.\d+)*[\.\)\-\s]*)/, '').trim();
  };
  
  c.flatten = function(obj) {
    var result = [];
    for (var key in obj) {
      if (obj.hasOwnProperty(key) && Array.isArray(obj[key])) {
        result = result.concat(obj[key]);
      }
    }
    return result;
  };
  
  c.getFilteredCount = function() {
    return c.getFilteredByBoth().length;
  };
  
  c.getTotalCount = function() {
    return c.flatten(c.groupedFields).length;
  };
  
  c.getDocumentFieldCount = function() {
    if (!c.selectedDocument || !c.selectedDocument.name) {
      return c.getTotalCount();
    }
    return c.getFilteredByFileName(c.selectedDocument.name).length;
  };
  
  c.getUniqueFileNames = function() {
    var flattened = c.flatten(c.groupedFields);
    var fileNames = {};
    flattened.forEach(function(item) {
      if (item.attachmentData && item.attachmentData.file_name) {
        fileNames[item.attachmentData.file_name] = true;
      }
    });
    return Object.keys(fileNames).sort();
  };
  
  c.getFilteredGroupedFields = function() {
    var filtered = c.getFilteredByBoth();
    var grouped = {};
    var collapsed = {};
    
    filtered.forEach(function(field) {
      var sectionName = field.new_section_name || 'Uncategorized';
      if (!field.allCoordinates) {
        if (field.coordinates) {
          field.allCoordinates = [field.coordinates];
        } else {
          field.allCoordinates = [];
        }
      }
      if (!grouped[sectionName]) {
        grouped[sectionName] = [];
        collapsed[sectionName] = c.collapsedSections[sectionName] || false;
      }
      grouped[sectionName].push(field);
    });
    
    var sortedSections = {};
    Object.keys(grouped).sort().forEach(function(key) {
      sortedSections[key] = grouped[key];
    });
    return sortedSections;
  };
  
  c.getFilteredSectionFields = function(sectionName) {
    var filteredGroups = c.getFilteredGroupedFields();
    return filteredGroups[sectionName] || [];
  };
  
  c.getSectionAverageScore = function(sectionName) {
    var fields = c.groupedFields[sectionName] || [];
    if (fields.length === 0) return 0;
    var sum = fields.reduce(function(total, item) {
      return total + (item.confidence_indicator || 0);
    }, 0);
    return sum / fields.length;
  };
  
  c.getSectionFilteredCount = function(sectionName) {
    var fields = c.groupedFields[sectionName] || [];
    var filtered = fields;
    
    if (c.fieldSearch) {
      filtered = filtered.filter(function(item) {
        return item.field_name && 
          item.field_name.toLowerCase().indexOf(c.fieldSearch.toLowerCase()) !== -1;
      });
    }
    
    if (c.selectedDocument && c.selectedDocument.name) {
      filtered = filtered.filter(function(item) {
        return item.attachmentData && 
          item.attachmentData.file_name && 
          item.attachmentData.file_name === c.selectedDocument.name;
      });
    }
    
    return filtered.length;
  };
  
  // Load PDF.js library
  function loadPdfJs() {
    c.isLoading = true;
    c.loadingMessage = 'Loading PDF library...';
    
    if (!$window.pdfjsLib) {
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.min.js';
      script.onload = function() {
        $window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';
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
  
  // Initialize widget
  function initializeWidget() {
    c.loadingMessage = 'Initializing...';
    
    $timeout(function() {
      canvas = document.getElementById('pdfCanvas');
      annotationCanvas = document.getElementById('annotationCanvas');
      if (canvas && annotationCanvas) {
        ctx = canvas.getContext('2d');
        annotationCtx = annotationCanvas.getContext('2d');
        
        // NEW: Add click listener
        annotationCanvas.addEventListener('click', handleCanvasClick);
        annotationCanvas.style.pointerEvents = 'auto';
      }
    }, 100);
    loadSourceMapping();
  }
  
  // Load document
  c.loadDocument = function() {
    if (!c.selectedDocument) return;
    
    c.isLoading = true;
    c.loadingMessage = 'Loading document...';
    c.activeField = null;
    c.activeFieldCoordIndex = 0;
    clearAnnotations();
    
    loadPdfFromUrl(c.selectedDocument.url);
    filterCoordinatesBySelectedDocument(c.selectedDocument);
  };
  
  c.getFilteredByFieldName = function() {
    var flattened = c.flatten(c.groupedFields);
    if (!c.fieldSearch) {
      return flattened;
    }
    return $filter('filter')(flattened, {field_name: c.fieldSearch});
  };
  
  c.getFilteredByFileName = function(fileName) {
    var flattened = c.flatten(c.groupedFields);
    if (!fileName) {
      return flattened;
    }
    
    return flattened.filter(function(item) {
      return item.attachmentData && 
        item.attachmentData.file_name && 
        item.attachmentData.file_name === fileName;
    });
  };
  
  c.getFilteredByBoth = function() {
    var flattened = c.flatten(c.groupedFields);
    var result = flattened;
    
    if (c.fieldSearch) {
      result = result.filter(function(item) {
        return item.field_name && 
          item.field_name.toLowerCase().indexOf(c.fieldSearch.toLowerCase()) !== -1;
      });
    }
    
    if (c.selectedDocument && c.selectedDocument.name) {
      result = result.filter(function(item) {
        return item.attachmentData && 
          item.attachmentData.file_name && 
          item.attachmentData.file_name === c.selectedDocument.name;
      });
    }
    
    return result;
  };
  
  var filterCoordinatesBySelectedDocument = function(selectedDocument) {
    if (!selectedDocument || !selectedDocument.name) {
      c.extractedFields = c.globalExtractedFields;
      return;
    }
    
    c.extractedFields = c.globalExtractedFields.filter(function(extractedField) {
      return extractedField.attachmentData && 
        extractedField.attachmentData.file_name === selectedDocument.name;
    });
  };
  
  c.toggleSection = function(sectionName) {
    c.collapsedSections[sectionName] = !c.collapsedSections[sectionName];
  };
  
  function extractAttachmentOptions(jsonResponse) {
    var options = [];
    
    jsonResponse.forEach(function(record) {
      if (record.attachmentData && record.attachmentData.file_name && record.attachmentData.file_url) {
        options.push({
          name: record.attachmentData.file_name,
          url: record.attachmentData.file_url
        });
      }
    });
    
    var unique = [];
    var seen = new Set();
    
    options.forEach(function(opt) {
      if (!seen.has(opt.name)) {
        seen.add(opt.name);
        unique.push(opt);
      }
    });
    
    return unique;
  }
  
  function loadSourceMapping() {
    if (!submissionSysId) {
      c.isLoading = false;
      return;
    }
    
    c.loadingMessage = 'Loading field mappings...';
    
    c.server.get({
      action: 'fetchMapping',
      submissionSysId: submissionSysId
    }).then(function(response) {
      var documentList = extractAttachmentOptions(response.data.mapping);
      if (documentList.length == 0) {
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
    }).catch(function(error) {
      c.isLoading = false;
      console.error('Failed to load mapping:', error);
    });
  }
  
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
    
    loadingTask.promise.then(function(pdf) {
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
      }, 100);
    }).catch(function(error) {
      console.error('Error loading PDF:', error);
      c.isLoading = false;
      spUtil.addErrorMessage('Failed to load PDF: ' + error.message);
    });
  }
  
  function parseMultipleCoordinateStrings(source) {
    if (!source || typeof source !== 'string') return [];
    
    var coordinates = [];
    var dStrings = source.split(';');
    
    dStrings.forEach(function(dString) {
      var coord = parseCoordinateString(dString.trim());
      if (coord) {
        coordinates.push(coord);
      }
    });
    
    return coordinates;
  }
  
  function groupFieldsBySection(processedMappingData) {
    c.groupedFields = {};
    c.collapsedSections = {};
    
    if (!processedMappingData || processedMappingData.length === 0) {
      return;
    }
    
    processedMappingData.forEach(function(field) {
      var sectionName = field.new_section_name || 'Uncategorized';
      
      if (!field.allCoordinates) {
        if (field.coordinates) {
          field.allCoordinates = [field.coordinates];
        } else {
          field.allCoordinates = [];
        }
      }
      
      if (!c.groupedFields[sectionName]) {
        c.groupedFields[sectionName] = [];
        c.collapsedSections[sectionName] = false;
      }
      
      c.groupedFields[sectionName].push(field);
    });
    
    var sortedSections = {};
    Object.keys(c.groupedFields).sort().forEach(function(key) {
      sortedSections[key] = c.groupedFields[key];
    });
    
    return sortedSections;
  }
  
  function processMappingData(mappingData) {
    if (!mappingData || !Array.isArray(mappingData)) {
      c.mappingData = [];
      c.extractedFields = [];
      return;
    }
    
    var processedMappingData = mappingData.map(function(mapping) {
      var allCoordinates = parseMultipleCoordinateStrings(mapping.source);
      mapping.coordinates = allCoordinates.length > 0 ? allCoordinates[0] : null;
      mapping.allCoordinates = allCoordinates;
      return mapping;
    }).filter(function(mapping) {
      return mapping.allCoordinates.length > 0;
    });
    
    c.groupedFields = groupFieldsBySection(processedMappingData);
    filterCoordinatesBySelectedDocument(c.selectedDocument);
  }
  
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
  
  function renderPage(pageNumber) {
    if (!pdfDoc || !canvas || !ctx) return;
    
    if (pageRendering) {
      pageNumPending = pageNumber;
      return;
    }
    
    pageRendering = true;
    c.loadingMessage = 'Rendering page ' + pageNumber + '...';
    
    if (renderTask) {
      renderTask.cancel();
    }
    
    pdfDoc.getPage(pageNumber).then(function(page) {
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
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      clearAnnotations();
      
      renderTask = page.render({
        canvasContext: ctx,
        viewport: viewport
      });
      
      renderTask.promise.then(function() {
        pageRendering = false;
        renderTask = null;
        
        if (pageNumPending !== null) {
          var pending = pageNumPending;
          pageNumPending = null;
          renderPage(pending);
        }
        
        // Re-draw creation points or highlights
        if (c.isCreatingField) {
          drawTemporaryPoints();
        } else if (c.activeField && c.activeField.allCoordinates) {
          var coordsOnPage = c.activeField.allCoordinates.filter(function(coord) {
            return coord.page === pageNumber;
          });
          
          if (coordsOnPage.length > 0) {
            $timeout(function() {
              highlightMultipleFields(coordsOnPage, false);
            }, 100);
          }
        }
      }).catch(function(error) {
        if (error.name !== 'RenderingCancelledException') {
          console.error('Error rendering page:', error);
          pageRendering = false;
        }
      });
    }).catch(function(error) {
      console.error('Error getting page:', error);
      pageRendering = false;
      spUtil.addErrorMessage('Failed to render page');
    });
  }
  
  function clearAnnotations() {
    if (annotationCtx && annotationCanvas) {
      annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
    }
    var marker = document.getElementById('pageMarker');
    if (marker) {
      marker.style.display = 'none';
    }
    currentHighlights = [];
  }
  
  c.navigateToField = function(field) {
    if (!field || !field.allCoordinates || field.allCoordinates.length === 0 || !canvas) return;
    
    c.activeField = field;
    c.activeFieldCoordIndex = 0;
    
    var firstCoord = field.allCoordinates[0];
    
    if (firstCoord.page !== c.currentPage) {
      c.currentPage = firstCoord.page;
      renderPage(c.currentPage);
      
      $timeout(function() {
        var coordsOnPage = field.allCoordinates.filter(function(coord) {
          return coord.page === c.currentPage;
        });
        highlightMultipleFields(coordsOnPage, true);
      }, 500);
    } else {
      var coordsOnPage = field.allCoordinates.filter(function(coord) {
        return coord.page === c.currentPage;
      });
      highlightMultipleFields(coordsOnPage, true);
    }
  };
  
  c.navigateToSingleCoordinate = function(coord) {
    if (!coord || !canvas) return;
    
    if (coord.page !== c.currentPage) {
      c.currentPage = coord.page;
      renderPage(c.currentPage);
      
      $timeout(function() {
        highlightField(coord, true);
      }, 500);
    } else {
      highlightField(coord, true);
    }
  };
  
  var toPixels = function(value) { return value * 72 * c.scale; };
  
  function highlightMultipleFields(coords, scrollToView) {
    if (!coords || coords.length === 0 || !annotationCtx) return;
    
    clearAnnotations();
    
    var centerX = 0, centerY = 0;
    
    coords.forEach(function(coord, index) {
      var x1 = toPixels(coord.x1);
      var y1 = toPixels(coord.y1);
      var x2 = toPixels(coord.x2);
      var y2 = toPixels(coord.y2);
      var x3 = toPixels(coord.x3) || toPixels(coord.x2);
      var y3 = toPixels(coord.y3) || toPixels(coord.y2);
      var x4 = toPixels(coord.x4) || toPixels(coord.x1);
      var y4 = toPixels(coord.y4) || toPixels(coord.y1);
      
      if (index === 0) {
        centerX = (x1 + x2 + x3 + x4) / 4;
        centerY = (y1 + y2 + y3 + y4) / 4;
      }
      
      var opacity = coords.length > 1 ? 0.2 : 0.3;
      var strokeOpacity = coords.length > 1 ? 0.6 : 0.8;
      
      annotationCtx.fillStyle = 'rgba(249, 115, 22, ' + opacity + ')';
      annotationCtx.strokeStyle = 'rgba(249, 115, 22, ' + strokeOpacity + ')';
      annotationCtx.lineWidth = 2;
      
      annotationCtx.beginPath();
      annotationCtx.moveTo(x1, y1);
      annotationCtx.lineTo(x2, y2);
      annotationCtx.lineTo(x3, y3);
      annotationCtx.lineTo(x4, y4);
      annotationCtx.closePath();
      annotationCtx.stroke();
    });
    
    if (scrollToView) {
      smoothScrollToCoordinate(centerX, centerY);
    }
  }
  
  function highlightField(coord, scrollToView) {
    if (!coord || !annotationCtx) return;
    
    clearAnnotations();
    
    var x1 = toPixels(coord.x1);
    var y1 = toPixels(coord.y1);
    var x2 = toPixels(coord.x2);
    var y2 = toPixels(coord.y2);
    var x3 = toPixels(coord.x3) || toPixels(coord.x2);
    var y3 = toPixels(coord.y3) || toPixels(coord.y2);
    var x4 = toPixels(coord.x4) || toPixels(coord.x1);
    var y4 = toPixels(coord.y4) || toPixels(coord.y1);
    
    var centerX = (x1 + x2 + x3 + x4) / 4;
    var centerY = (y1 + y2 + y3 + y4) / 4;
    
    var opacity = 0;
    var animationId;
    
    function animateHighlight() {
      if (opacity < 0.3) {
        opacity += 0.03;
        
        annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
        
        annotationCtx.fillStyle = 'rgba(249, 115, 22, ' + opacity + ')';
        annotationCtx.beginPath();
        annotationCtx.moveTo(x1, y1);
        annotationCtx.lineTo(x2, y2);
        annotationCtx.lineTo(x3, y3);
        annotationCtx.lineTo(x4, y4);
        annotationCtx.closePath();
        
        annotationCtx.strokeStyle = 'rgba(249, 115, 22, ' + (opacity * 2.5) + ')';
        annotationCtx.lineWidth = 2;
        annotationCtx.stroke();
        
        animationId = requestAnimationFrame(animateHighlight);
      } else {
        annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
        annotationCtx.fillStyle = 'rgba(249, 115, 22, 0.3)';
        annotationCtx.strokeStyle = 'rgba(249, 115, 22, 0.8)';
        annotationCtx.lineWidth = 2;
        
        annotationCtx.beginPath();
        annotationCtx.moveTo(x1, y1);
        annotationCtx.lineTo(x2, y2);
        annotationCtx.lineTo(x3, y3);
        annotationCtx.lineTo(x4, y4);
        annotationCtx.closePath();
        annotationCtx.stroke();
      }
    }
    
    animateHighlight();
    
    if (scrollToView) {
      smoothScrollToCoordinate(centerX, centerY);
    }
  }
  
  function smoothScrollToCoordinate(x, y) {
    var container = document.getElementById('pdfContainer');
    if (!container) return;
    
    var targetX = x - container.clientWidth / 2;
    var targetY = y - container.clientHeight / 2;
    
    targetX = Math.max(0, Math.min(targetX, container.scrollWidth - container.clientWidth));
    targetY = Math.max(0, Math.min(targetY, container.scrollHeight - container.clientHeight));
    
    container.scrollTo({
      left: targetX,
      top: targetY,
      behavior: 'smooth'
    });
  }
  
  // Navigation controls
  c.nextPage = function() {
    if (c.currentPage < c.totalPages && !pageRendering) {
      c.currentPage++;
      c.activeField = null;
      c.activeFieldCoordIndex = 0;
      renderPage(c.currentPage);
    }
  };
  
  c.previousPage = function() {
    if (c.currentPage > 1 && !pageRendering) {
      c.currentPage--;
      c.activeField = null;
      c.activeFieldCoordIndex = 0;
      renderPage(c.currentPage);
    }
  };
  
  // Zoom controls
  c.zoomIn = debounce(function() {
    if (c.scale < 3) {
      c.scale = Math.min(3, c.scale * 1.2);
      renderPage(c.currentPage);
    }
  }, 300);
  
  c.zoomOut = debounce(function() {
    if (c.scale > 0.5) {
      c.scale = Math.max(0.5, c.scale * 0.8);
      renderPage(c.currentPage);
    }
  }, 300);
  
  c.resetZoom = function() {
    c.scale = 1.0;
    renderPage(c.currentPage);
  };
  
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
  
  c.actual100Percent = function() {
    if (!pdfDoc) return;
    
    c.zoomMode = 'actual-size';
    c.scale = 1.0;
    renderPage(c.currentPage);
  };
  
  c.getConfidenceClass = function(confidence) {
    var value = parseFloat(confidence) || 0;
    if (value >= 0.75) return 'bg-green-100';
    if (value >= 0.5) return 'bg-yellow-100';
    return 'bg-red-100';
  };
  
  // Parse manual coordinate string(s)
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
    c.activeFieldCoordIndex = 0;
    
    var firstCoord = coords[0];
    
    if (firstCoord.page !== c.currentPage) {
      c.currentPage = firstCoord.page;
      renderPage(c.currentPage);
      $timeout(function() {
        var coordsOnPage = coords.filter(function(coord) {
          return coord.page === c.currentPage;
        });
        highlightMultipleFields(coordsOnPage, true);
      }, 500);
    } else {
      var coordsOnPage = coords.filter(function(coord) {
        return coord.page === c.currentPage;
      });
      highlightMultipleFields(coordsOnPage, true);
    }
    
    spUtil.addInfoMessage('Highlighting ' + coords.length + ' coordinate(s)');
  };
  
  c.copyCurrentCoordinates = function() {
    if (!c.activeField || !c.activeField.allCoordinates) {
      spUtil.addInfoMessage('No active field selected');
      return;
    }
    
    var dStrings = c.activeField.allCoordinates.map(function(coord) {
      return formatDString(coord);
    });
    
    var fullString = dStrings.join(';');
    c.manualCoordinate = fullString;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullString).then(function() {
        spUtil.addInfoMessage('Coordinates copied to clipboard! (' + dStrings.length + ' coordinate(s))');
      }).catch(function() {
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
  
  // Cleanup on destroy
  $scope.$on('$destroy', function() {
    if (renderTask) {
      renderTask.cancel();
    }
    if (pdfDoc) {
      pdfDoc.destroy();
    }
    if (annotationCanvas) {
      annotationCanvas.removeEventListener('click', handleCanvasClick);
    }
  });
  
  // Window resize handler
  var resizeHandler = debounce(function() {
    if (c.zoomMode === 'fit-width' && pdfDoc && currentPageInstance) {
      c.fitWidth();
    }
  }, 300);
  
  $window.addEventListener('resize', resizeHandler);
  
  // Initialize on load
  $timeout(function() {
    loadPdfJs();
  }, 100);
};