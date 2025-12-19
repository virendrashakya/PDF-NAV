api.controller = function ($scope, $location, $filter, $window, spUtil, $timeout) {
  /* ============================================
   * PDF-NAV Widget Client Script
   * ============================================
   * Handles: PDF viewing, field navigation, data editing, save operations
   * ============================================ */

  var c = this;

  /* ============================================
   * INITIALIZATION - State Variables
   * ============================================ */

  // PDF state
  c.pdfLoaded = false;
  c.scale = 1.0;
  c.currentPage = 1;
  c.totalPages = 0;
  c.zoomMode = 'actual-size'; // 'fit-width' or 'actual-size'
  c.containerWidth = 0;

  // Field data
  c.extractedFields = [];
  c.globalExtractedFields = [];
  c.groupedFields = {};
  c.collapsedSections = {};
  c.mappingData = null;
  c.fieldSearch = '';

  // Active field navigation
  c.activeField = null;
  c.activeFieldCoordIndex = 0;

  // Document selection
  c.documents = [];
  c.selectedDocument = '';

  // Loading states
  c.isLoading = false;
  c.isSaving = false;
  c.loadingMessage = 'Loading...';
  c.isCompleting = false;

  // Change tracking for save functionality
  c.hasChanges = false;
  c.changedFields = {};  // Tracks fields with unsaved changes: { sys_id: true }

  // Auto-save status
  c.saveStatus = '';  // '', 'saving', 'saved', 'error'
  c.saveStatusMessage = '';
  c.lastSavedTime = null;

  // Submission status choice: determines which fields are editable
  // 'a' = Data Verification editable, QA Override readonly
  // 'b' = Data Verification readonly, QA Override editable
  c.dataReview = 'CONFIRM_DATA_REVIEW';
  c.qaKey = 'QUALITY_ASSURANCE';

  c.submissionNumber = '';
  c.submissionStatusChoice = '';

  // Advanced mode (optional)
  c.showAdvancedButton = false;
  c.showAdvancedMode = false;
  c.manualCoordinate = '';
  c.manualFields = { page: 1, x1: 0, y1: 0, x2: 0, y2: 0, x3: 0, y3: 0, x4: 0, y4: 0 };
  c.calculatedPixels = '';
  c.parsedManualCoordinates = [];
  c.parsedCoordinatesCount = 0;

  // File upload (if enabled)
  c.pdfFile = null;
  c.jsonFile = null;
  c.canUpload = c.data.canUpload || false;

  // Set page title
  $('head title').text("Genpact Insurance Policy Suite");

  // PDF.js variables
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
  var submissionSysId = $location.search().submissionSysId || '4047569b9375f290ce18b5d97bba1044';

  // Performance optimization: Debounce functions
  var debounce = function (func, wait) {
    var timeout;
    return function () {
      var context = this, args = arguments;
      var later = function () {
        timeout = null;
        func.apply(context, args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  c.trimInitialNumberAdvanced = function (text) {
    // Matches patterns like: "01 ", "1. ", "123) ", "4- ", etc.
    //return text.replace(/^\d+[\.\)\-\s]+/, '').trim();
    return text.replace(/^(Group:\s*\d+\s*|\d+(?:\.\d+)*[\.\)\-\s]*)/, '').trim();
  }

  //helper flattenmethod
  // Method to flatten the nested structure
  c.flatten = function (obj) {
    var result = [];
    for (var key in obj) {
      if (obj.hasOwnProperty(key) && Array.isArray(obj[key])) {
        result = result.concat(obj[key]);
      }
    }
    return result;
  };

  //WORKING: Get filtered count considering both filters
  c.getFilteredCount = function () {
    return c.getFilteredByBoth().length;
  };

  //WORKING: Get total count
  c.getTotalCount = function () {
    return c.flatten(c.groupedFields).length;
  };

  //WORKING: Get count for current document
  c.getDocumentFieldCount = function () {
    if (!c.selectedDocument || !c.selectedDocument.name) {
      return c.getTotalCount();
    }
    return c.getFilteredByFileName(c.selectedDocument.name).length;
  };

  // Helper: Check if field is active (belongs to selected document)
  c.isFieldActive = function (field) {
    if (!c.selectedDocument || !field || !field.attachmentData) return false;
    return field.attachmentData.file_name === c.selectedDocument.name;
  };

  // Helper: Get fields filtered by both (search + document - but we want all for list)
  c.getFilteredByBoth = function () {
    // Return all fields
    return c.flatten(c.groupedFields);
  };

  // Helper: Get fields by filename
  c.getFilteredByFileName = function (fileName) {
    var allFields = c.flatten(c.groupedFields);
    return allFields.filter(function (field) {
      return field.attachmentData && field.attachmentData.file_name === fileName;
    });
  };

  // Helper: Filter coordinates (no-op for now to keep all fields)
  function filterCoordinatesBySelectedDocument(document) {
    // Do nothing, we want to keep all fields in c.groupedFields
  }

  /* ============================================
   * CHANGE TRACKING & SAVE FUNCTIONS
   * ============================================ */

  /**
   * Helper to get object keys (for ng-repeat in template)
   * @param {object} obj - Object to get keys from
   * @returns {array} Array of keys
   */
  c.getObjectKeys = function (obj) {
    return obj ? Object.keys(obj) : [];
  };

  /**
   * Truncate text for display with ellipsis
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length before truncation
   * @returns {string} Truncated text with ellipsis or original text
   */
  c.truncateText = function (text, maxLength) {
    if (!text) return '';
    maxLength = maxLength || 30;
    if (text.length > maxLength) {
      return text.substring(0, maxLength) + '...';
    }
    return text;
  };

  /**
   * Mark a field as changed (called on ng-change of override_value input)
   * @param {object} field - The field object that was modified
   */
  c.markFieldAsChanged = function (field) {
    if (field && field.sys_id) {
      c.changedFields[field.sys_id] = true;
      c.hasChanges = true;
    }
  };

  /**
   * Auto-save a single field when input loses focus (blur)
   * @param {object} field - The field object to save
   */
  c.autoSaveField = function (field) {
    if (!field || !field.sys_id || !c.changedFields[field.sys_id]) {
      return; // No changes to save for this field
    }

    // Build update object
    var update = { sys_id: field.sys_id };

    // Include the appropriate editable field based on submission status
    if (c.submissionStatusChoice === c.dataReview) {
      update.data_verification = field.data_verification || '';
    } else if (c.submissionStatusChoice === c.qaKey) {
      update.override_value = field.override_value || '';
    } else {
      update.override_value = field.override_value || '';
      update.data_verification = field.data_verification || '';
    }

    // Show saving status
    c.saveStatus = 'saving';
    c.saveStatusMessage = 'Saving...';

    // Call server to save
    c.server.get({
      action: 'saveMapping',
      updates: [update]
    }).then(function (response) {
      if (response.data.success) {
        // Remove from changed fields tracking
        delete c.changedFields[field.sys_id];
        c.hasChanges = Object.keys(c.changedFields).length > 0;

        // Update status
        c.saveStatus = 'saved';
        c.lastSavedTime = new Date();
        c.saveStatusMessage = 'Saved at ' + c.formatTime(c.lastSavedTime);

        // Clear status after 3 seconds
        $timeout(function () {
          if (c.saveStatus === 'saved') {
            c.saveStatus = '';
          }
        }, 3000);
      } else {
        c.saveStatus = 'error';
        c.saveStatusMessage = 'Save failed: ' + (response.data.error || 'Unknown error');
      }
    }).catch(function (error) {
      console.error('Auto-save error:', error);
      c.saveStatus = 'error';
      c.saveStatusMessage = 'Save failed';
    });
  };

  /**
   * Format time for display
   * @param {Date} date - Date object
   * @returns {string} Formatted time string
   */
  c.formatTime = function (date) {
    if (!date) return '';
    var hours = date.getHours();
    var minutes = date.getMinutes();
    var seconds = date.getSeconds();
    var ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    seconds = seconds < 10 ? '0' + seconds : seconds;
    return hours + ':' + minutes + ':' + seconds + ' ' + ampm;
  };

  /**
   * Save all changed fields to the server
   * Sends only fields that have been modified
   */
  c.saveAllChanges = function () {
    if (!c.hasChanges || c.isSaving) return;

    // Collect all changed fields with their updated values
    var updates = [];
    var allFields = c.flatten(c.groupedFields);

    allFields.forEach(function (field) {
      if (c.changedFields[field.sys_id]) {
        var update = { sys_id: field.sys_id };

        // Include the appropriate editable field based on submission status
        if (c.submissionStatusChoice === c.dataReview) {
          update.data_verification = field.data_verification || '';
        } else if (c.submissionStatusChoice === c.qaKey) {
          update.override_value = field.override_value || '';
        } else {
          // Default: include both if status is unknown
          update.override_value = field.override_value || '';
          update.data_verification = field.data_verification || '';
        }

        updates.push(update);
      }
    });

    if (updates.length === 0) {
      spUtil.addInfoMessage('No changes to save');
      return;
    }

    // Show saving state
    c.isSaving = true;
    c.loadingMessage = 'Saving ' + updates.length + ' change(s)...';

    // Call server to save
    c.server.get({
      action: 'saveMapping',
      updates: updates
    }).then(function (response) {
      c.isSaving = false;

      if (response.data.success) {
        // Clear change tracking
        c.changedFields = {};
        c.hasChanges = false;

        spUtil.addInfoMessage(response.data.message || 'Changes saved successfully');

        // Log any partial errors
        if (response.data.errors && response.data.errors.length > 0) {
          console.warn('Save completed with errors:', response.data.errors);
        }
      } else {
        spUtil.addErrorMessage('Failed to save: ' + (response.data.error || 'Unknown error'));
      }
    }).catch(function (error) {
      c.isSaving = false;
      console.error('Save error:', error);
      spUtil.addErrorMessage('Failed to save changes');
    });
  };

  /**
   * Refer submission action
   * Placeholder for refer functionality
   */
  c.referSubmission = function () {
    // TODO: Implement refer logic
    spUtil.addInfoMessage('Refer action - to be implemented');
  };

  /**
   * Mark as done action
   * Placeholder for done functionality
   */
  c.markAsComplete = function () {

    // Show saving state
    c.isCompleting = true;
    c.loadingMessage = 'Completing... ';

    console.log('--------', c.submissionNumber);

    // Call server to save
    c.server.get({
      action: 'markComplete',
      submissionNumber: c.submissionNumber
    }).then(function (response) {
      c.isCompleting = false;

      if (response.data.success) {
        // Clear change tracking


        spUtil.addInfoMessage(response.data.message || 'Mark Complete successfully');

        // Log any partial errors
        if (response.data.errors && response.data.errors.length > 0) {
          console.warn('Mark completed with errors:', response.data.errors);
        }
      } else {
        spUtil.addErrorMessage('Failed to complete: ' + (response.data.error || 'Unknown error'));
      }
    }).catch(function (error) {
      c.isCompleting = false;
      console.error('Mark Complete error:', error);
      spUtil.addErrorMessage('Failed to mark complete changes');
    });
  };

  // Load Document
  c.loadDocument = function () {
    if (c.selectedDocument && c.selectedDocument.url) {
      loadPdfFromUrl(c.selectedDocument.url);
    }
  };

  function extractAttachmentOptions(jsonResponse) {
    var options = [];

    jsonResponse.forEach(record => {
      if (record.attachmentData && record.attachmentData.file_name && record.attachmentData.file_url) {
        options.push({
          name: record.attachmentData.file_name,
          url: record.attachmentData.file_url
        });
      }
    });

    // remove duplicates by file_name
    var unique = [];
    var seen = new Set();

    options.forEach(opt => {
      if (!seen.has(opt.name)) {
        seen.add(opt.name);
        unique.push(opt);
      }
    });

    return unique;
  }

  // Load PDF.js library
  function loadPdfJs() {
    c.isLoading = true;
    c.loadingMessage = 'Loading PDF library...';

    if (!$window.pdfjsLib) {
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.min.js';
      script.onload = function () {
        $window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';
        initializeWidget();
      };
      script.onerror = function () {
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

    // Setup canvases
    $timeout(function () {
      canvas = document.getElementById('pdfCanvas');
      annotationCanvas = document.getElementById('annotationCanvas');
      if (canvas && annotationCanvas) {
        ctx = canvas.getContext('2d');
        annotationCtx = annotationCanvas.getContext('2d');
      }
    }, 100);
    loadSourceMapping();
  }

  // Load source mapping
  function loadSourceMapping() {
    if (!submissionSysId) {
      c.isLoading = false;
      return;
    }

    c.loadingMessage = 'Loading field mappings...';

    c.server.get({
      action: 'fetchMapping',
      submissionSysId: submissionSysId
    }).then(function (response) {

      // Capture submission status choice for conditional field editing
      c.submissionNumber = response.data.submissionNumber;
      c.submissionStatusChoice = response.data.submissionStatusChoice || '';

      var documentList = extractAttachmentOptions(response.data.mapping);
      if (documentList.length == 0) {
        spUtil.addErrorMessage('No Document Returned From Submission');
      }
      c.documents = documentList;
      c.selectedDocument = documentList[0];
      if (c.selectedDocument) {
        c.loadDocument();
        //loadPdfFromUrl(c.selectedDocument.url);
      }
      if (response.data.success) {
        processMappingData(response.data.mapping);
      }
      c.isLoading = false;
    }).catch(function (error) {
      c.isLoading = false;
      console.error('Failed to load mapping:', error);
    });
  }

  // Load PDF from URL with optimization
  function loadPdfFromUrl(url) {
    c.loadingMessage = 'Loading PDF document...';

    // Cancel any existing render task
    if (renderTask) {
      renderTask.cancel();
      renderTask = null;
    }

    var loadingTask = $window.pdfjsLib.getDocument({
      url: url,
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/cmaps/',
      cMapPacked: true
    });

    loadingTask.promise.then(function (pdf) {
      pdfDoc = pdf;
      c.pdfLoaded = true;
      c.totalPages = pdf.numPages;
      c.currentPage = 1;

      // Set initial zoom mode to fit-width
      c.zoomMode = 'actual-size';

      $scope.$apply(function () {
        c.isLoading = false;
      });

      // Wait for container to be ready, then render with fit-width
      $timeout(function () {
        renderPage(c.currentPage);
      }, 100);
    }).catch(function (error) {
      console.error('Error loading PDF:', error);
      c.isLoading = false;
      spUtil.addErrorMessage('Failed to load PDF: ' + error.message);
    });
  }

  // Parse multiple coordinate strings
  function parseMultipleCoordinateStrings(source) {
    if (!source || typeof source !== 'string') return [];

    var coordinates = [];
    var dStrings = source.split(';');

    dStrings.forEach(function (dString) {
      var coord = parseCoordinateString(dString.trim());
      if (coord) {
        coordinates.push(coord);
      }
    });

    return coordinates;
  }

  // Group fields by section name
  function groupFieldsBySection(processedMappingData) {
    c.groupedFields = {};
    c.collapsedSections = {};

    if (!processedMappingData || processedMappingData.length === 0) {
      return;
    }

    processedMappingData.forEach(function (field) {
      var sectionName = field.new_section_name || 'Uncategorized';

      // Ensure allCoordinates exists
      if (!field.allCoordinates) {
        if (field.coordinates) {
          field.allCoordinates = [field.coordinates];
        } else {
          field.allCoordinates = [];
        }
      }

      if (!c.groupedFields[sectionName]) {
        c.groupedFields[sectionName] = [];
        c.collapsedSections[sectionName] = false; // Initialize as expanded
      }

      c.groupedFields[sectionName].push(field);
    });

    // Sort sections alphabetically
    var sortedSections = {};
    Object.keys(c.groupedFields).sort().forEach(function (key) {
      sortedSections[key] = c.groupedFields[key];
    });


    return sortedSections;

  }

  // Process mapping data - process cordinates to canvas compatable
  function processMappingData(mappingData) {
    if (!mappingData || !Array.isArray(mappingData)) {
      c.mappingData = [];
      c.extractedFields = [];
      return;
    }

    // Process all mappings - include those without coordinates too
    var processedMappingData = mappingData.map(function (mapping) {
      // Parse multiple coordinate strings (will be empty array if source is blank)
      var allCoordinates = parseMultipleCoordinateStrings(mapping.source);

      // Keep first coordinate as primary for backward compatibility
      mapping.coordinates = allCoordinates.length > 0 ? allCoordinates[0] : null;
      mapping.allCoordinates = allCoordinates;

      return mapping;
    });
    // Note: Previously filtered out fields without coordinates - now including all fields


    //c.extractedFields = c.mappingData;
    //c.globalExtractedFields = JSON.parse(JSON.stringify(c.mappingData));

    c.groupedFields = groupFieldsBySection(processedMappingData);
    filterCoordinatesBySelectedDocument(c.selectedDocument);
  }

  // Parse coordinate string with validation
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

  // Optimized page rendering with queue
  function renderPage(pageNumber) {
    if (!pdfDoc || !canvas || !ctx) return;

    if (pageRendering) {
      pageNumPending = pageNumber;
      return;
    }

    pageRendering = true;
    c.loadingMessage = 'Rendering page ' + pageNumber + '...';

    // Cancel previous render task if exists
    if (renderTask) {
      renderTask.cancel();
    }

    pdfDoc.getPage(pageNumber).then(function (page) {
      currentPageInstance = page;

      // Auto-adjust scale if in fit-width mode
      if (c.zoomMode === 'fit-width') {
        var container = document.getElementById('pdfContainer');
        if (container) {
          c.containerWidth = container.clientWidth - 40; // Subtract padding
          var baseViewport = page.getViewport({ scale: 1.0 });
          c.scale = c.containerWidth / baseViewport.width;
        }
      }

      var viewport = page.getViewport({ scale: c.scale });

      // Set canvas dimensions
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      annotationCanvas.height = viewport.height;
      annotationCanvas.width = viewport.width;

      // Clear canvases
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      clearAnnotations();

      // Render PDF page
      renderTask = page.render({
        canvasContext: ctx,
        viewport: viewport
      });

      renderTask.promise.then(function () {
        pageRendering = false;
        renderTask = null;

        // Render pending page
        if (pageNumPending !== null) {
          var pending = pageNumPending;
          pageNumPending = null;
          renderPage(pending);
        }

        // Re-highlight active field if on current page
        if (c.activeField && c.activeField.allCoordinates) {
          var coordsOnPage = c.activeField.allCoordinates.filter(function (coord) {
            return coord.page === pageNumber;
          });

          if (coordsOnPage.length > 0) {
            $timeout(function () {
              highlightMultipleFields(coordsOnPage, false);
            }, 100);
          }
        }
      }).catch(function (error) {
        if (error.name !== 'RenderingCancelledException') {
          console.error('Error rendering page:', error);
          pageRendering = false;
        }
      });
    }).catch(function (error) {
      console.error('Error getting page:', error);
      pageRendering = false;
      spUtil.addErrorMessage('Failed to render page');
    });
  }

  // Clear annotation canvas
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

  // Navigate to field with multiple coordinates support
  c.navigateToField = function (field) {
    if (!field || !field.allCoordinates || field.allCoordinates.length === 0 || !canvas) return;

    c.activeField = field;
    c.activeFieldCoordIndex = 0;

    // Navigate to first coordinate's page
    var firstCoord = field.allCoordinates[0];

    if (firstCoord.page !== c.currentPage) {
      c.currentPage = firstCoord.page;
      renderPage(c.currentPage);

      // Highlight after page loads
      $timeout(function () {
        var coordsOnPage = field.allCoordinates.filter(function (coord) {
          return coord.page === c.currentPage;
        });
        highlightMultipleFields(coordsOnPage, true);
      }, 500);
    } else {
      var coordsOnPage = field.allCoordinates.filter(function (coord) {
        return coord.page === c.currentPage;
      });
      highlightMultipleFields(coordsOnPage, true);
    }
  };

  // Navigate to a single coordinate from parsed list
  c.navigateToSingleCoordinate = function (coord) {
    if (!coord || !canvas) return;

    if (coord.page !== c.currentPage) {
      c.currentPage = coord.page;
      renderPage(c.currentPage);

      $timeout(function () {
        highlightField(coord, true);
      }, 500);
    } else {
      highlightField(coord, true);
    }
  };

  var toPixels = function (value) { return value * 72 * c.scale; };

  // Highlight multiple fields
  function highlightMultipleFields(coords, scrollToView) {
    if (!coords || coords.length === 0 || !annotationCtx) return;

    clearAnnotations();

    var centerX = 0, centerY = 0;

    coords.forEach(function (coord, index) {
      var x1 = toPixels(coord.x1);
      var y1 = toPixels(coord.y1);
      var x2 = toPixels(coord.x2);
      var y2 = toPixels(coord.y2);
      var x3 = toPixels(coord.x3) || toPixels(coord.x2);
      var y3 = toPixels(coord.y3) || toPixels(coord.y2);
      var x4 = toPixels(coord.x4) || toPixels(coord.x1);
      var y4 = toPixels(coord.y4) || toPixels(coord.y1);

      // Calculate center for first coordinate
      if (index === 0) {
        centerX = (x1 + x2 + x3 + x4) / 4;
        centerY = (y1 + y2 + y3 + y4) / 4;
      }

      // Draw highlight with different opacity for multiple coords
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

      // Add index label for multiple coordinates
      //if (coords.length > 1) {
      //annotationCtx.fillStyle = 'rgba(0, 120, 212, 0.9)';
      //annotationCtx.font = 'bold 12px Arial';
      //annotationCtx.fillText((index + 1).toString(), x1 + 5, y1 + 15);
      //}
    });

    if (scrollToView) {
      smoothScrollToCoordinate(centerX, centerY);
    }
  }

  // Enhanced field highlighting with smooth animation
  function highlightField(coord, scrollToView) {
    if (!coord || !annotationCtx) return;

    clearAnnotations();

    // Calculate pixel coordinates
    var x1 = toPixels(coord.x1);
    var y1 = toPixels(coord.y1);
    var x2 = toPixels(coord.x2);
    var y2 = toPixels(coord.y2);
    var x3 = toPixels(coord.x3) || toPixels(coord.x2);
    var y3 = toPixels(coord.y3) || toPixels(coord.y2);
    var x4 = toPixels(coord.x4) || toPixels(coord.x1);
    var y4 = toPixels(coord.y4) || toPixels(coord.y1);

    // Calculate center point
    var centerX = (x1 + x2 + x3 + x4) / 4;
    var centerY = (y1 + y2 + y3 + y4) / 4;

    // Animate highlight
    var opacity = 0;
    var animationId;

    function animateHighlight() {
      if (opacity < 0.3) {
        opacity += 0.03;

        // Clear and redraw
        annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

        // Draw filled area
        annotationCtx.fillStyle = 'rgba(249, 115, 22, ' + opacity + ')';
        annotationCtx.beginPath();
        annotationCtx.moveTo(x1, y1);
        annotationCtx.lineTo(x2, y2);
        annotationCtx.lineTo(x3, y3);
        annotationCtx.lineTo(x4, y4);
        annotationCtx.closePath();

        // Draw border
        annotationCtx.strokeStyle = 'rgba(249, 115, 22, ' + (opacity * 2.5) + ')';
        annotationCtx.lineWidth = 2;
        annotationCtx.stroke();

        animationId = requestAnimationFrame(animateHighlight);
      } else {
        // Final state
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

    // Smooth scroll to view
    if (scrollToView) {
      smoothScrollToCoordinate(centerX, centerY);
    }
  }

  // Smooth scroll to coordinate
  function smoothScrollToCoordinate(x, y) {
    var container = document.getElementById('pdfContainer');
    if (!container) return;

    var targetX = x - container.clientWidth / 2;
    var targetY = y - container.clientHeight / 2;

    // Ensure targets are within bounds
    targetX = Math.max(0, Math.min(targetX, container.scrollWidth - container.clientWidth));
    targetY = Math.max(0, Math.min(targetY, container.scrollHeight - container.clientHeight));

    // Smooth scroll
    container.scrollTo({
      left: targetX,
      top: targetY,
      behavior: 'smooth'
    });
  }

  // Navigation controls
  c.nextPage = function () {
    if (c.currentPage < c.totalPages && !pageRendering) {
      c.currentPage++;
      c.activeField = null;
      c.activeFieldCoordIndex = 0;
      renderPage(c.currentPage);
    }
  };

  c.previousPage = function () {
    if (c.currentPage > 1 && !pageRendering) {
      c.currentPage--;
      c.activeField = null;
      c.activeFieldCoordIndex = 0;
      renderPage(c.currentPage);
    }
  };

  // Zoom controls with debouncing
  c.zoomIn = debounce(function () {
    if (c.scale < 3) {
      c.scale = Math.min(3, c.scale * 1.2);
      renderPage(c.currentPage);
    }
  }, 300);

  c.zoomOut = debounce(function () {
    if (c.scale > 0.5) {
      c.scale = Math.max(0.5, c.scale * 0.8);
      renderPage(c.currentPage);
    }
  }, 300);

  c.resetZoom = function () {
    c.scale = 1.0;
    renderPage(c.currentPage);
  };

  // Fit to width function
  c.fitWidth = function () {
    if (!pdfDoc || !currentPageInstance) return;

    c.zoomMode = 'fit-width';
    var container = document.getElementById('pdfContainer');
    if (container) {
      c.containerWidth = container.clientWidth - 40; // Subtract padding
      var viewport = currentPageInstance.getViewport({ scale: 1.0 });
      c.scale = c.containerWidth / viewport.width;
      renderPage(c.currentPage);
    }
  };

  // Actual 100% size function
  c.actual100Percent = function () {
    if (!pdfDoc) return;

    c.zoomMode = 'actual-size';
    c.scale = 1.0;
    renderPage(c.currentPage);
  };

  // Get confidence class
  c.getConfidenceClass = function (confidence) {
    var value = parseFloat(confidence) || 0;
    if (value >= 0.75) return 'bg-green-100';
    if (value >= 0.5) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  // Get confidence pill class for styling
  c.getConfidencePillClass = function (confidence) {
    var value = parseFloat(confidence) || 0;
    if (value >= 0.75) return 'high';
    if (value >= 0.5) return 'medium';
    return 'low';
  };

  // Calculate section accuracy percentage
  c.calculateSectionAccuracy = function (fields) {
    if (!fields || fields.length === 0) return 0;
    var totalConfidence = 0;
    var count = 0;
    fields.forEach(function (field) {
      if (field.confidence_indicator !== undefined && field.confidence_indicator !== null) {
        totalConfidence += parseFloat(field.confidence_indicator) || 0;
        count++;
      }
    });
    return count > 0 ? (totalConfidence / count) * 100 : 0;
  };

  // Parse manual coordinate string(s)
  $scope.$watch('manualCoordinate', function (newVal) {
    if (!newVal) {
      c.parsedManualCoordinates = [];
      c.parsedCoordinatesCount = 0;
      return;
    }

    var coords = parseMultipleCoordinateStrings(newVal);
    c.parsedManualCoordinates = coords.map(function (coord) {
      coord.displayText = 'x1:' + coord.x1.toFixed(1) + ', y1:' + coord.y1.toFixed(1) +
        ', x2:' + coord.x2.toFixed(1) + ', y2:' + coord.y2.toFixed(1);
      return coord;
    });
    c.parsedCoordinatesCount = coords.length;
  });

  // Navigate to manual coordinates (supports multiple)
  c.navigateToManualCoordinates = function () {
    if (!c.manualCoordinate) {
      spUtil.addErrorMessage('Please enter coordinate string(s)');
      return;
    }

    var coords = parseMultipleCoordinateStrings(c.manualCoordinate);

    if (coords.length === 0) {
      spUtil.addErrorMessage('Invalid coordinates');
      return;
    }

    // Create a temporary field object with all coordinates
    c.activeField = {
      allCoordinates: coords,
      coordinates: coords[0],
      field_name: 'Manual Coordinates (' + coords.length + ')'
    };
    c.activeFieldCoordIndex = 0;

    // Navigate to first coordinate's page
    var firstCoord = coords[0];

    if (firstCoord.page !== c.currentPage) {
      c.currentPage = firstCoord.page;
      renderPage(c.currentPage);
      $timeout(function () {
        var coordsOnPage = coords.filter(function (coord) {
          return coord.page === c.currentPage;
        });
        highlightMultipleFields(coordsOnPage, true);
      }, 500);
    } else {
      var coordsOnPage = coords.filter(function (coord) {
        return coord.page === c.currentPage;
      });
      highlightMultipleFields(coordsOnPage, true);
    }

    spUtil.addInfoMessage('Highlighting ' + coords.length + ' coordinate(s)');
  };

  // Copy current coordinates (supports multiple)
  c.copyCurrentCoordinates = function () {
    if (!c.activeField || !c.activeField.allCoordinates) {
      spUtil.addInfoMessage('No active field selected');
      return;
    }

    var dStrings = c.activeField.allCoordinates.map(function (coord) {
      return 'D(' + coord.page + ',' +
        coord.x1.toFixed(2) + ',' + coord.y1.toFixed(2) + ',' +
        coord.x2.toFixed(2) + ',' + coord.y2.toFixed(2) + ',' +
        (coord.x3 || coord.x2).toFixed(2) + ',' + (coord.y3 || coord.y2).toFixed(2) + ',' +
        (coord.x4 || coord.x1).toFixed(2) + ',' + (coord.y4 || coord.y1).toFixed(2) + ')';
    });

    var fullString = dStrings.join(';');

    // Update manual coordinate field
    c.manualCoordinate = fullString;

    // Copy to clipboard if available
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullString).then(function () {
        spUtil.addInfoMessage('Coordinates copied to clipboard! (' + dStrings.length + ' coordinate(s))');
      }).catch(function () {
        spUtil.addInfoMessage('Coordinates updated in manual fields');
      });
    } else {
      // Fallback for older browsers
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
  $scope.$on('$destroy', function () {
    if (renderTask) {
      renderTask.cancel();
    }
    if (pdfDoc) {
      pdfDoc.destroy();
    }
  });

  // Window resize handler
  var resizeHandler = debounce(function () {
    if (c.zoomMode === 'fit-width' && pdfDoc && currentPageInstance) {
      c.fitWidth();
    }
  }, 300);

  // Add resize listener
  $window.addEventListener('resize', resizeHandler);

  // Initialize on load
  $timeout(function () {
    loadPdfJs();
  }, 100);
};