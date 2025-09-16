api.controller = function($scope, $location, $filter, $window, spUtil, $timeout) {
  var c = this;
  
  // Initialize variables
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
  c.zoomMode = 'fit-width'; // 'fit-width' or 'actual-size'
  c.containerWidth = 0;
  
  $('head title').text("Pre-Bind Suite");
  
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
  var submissionSysId = $location.search().submissionSysId || 'f70447bafb7bea10b70efc647befdcb7';
  
  // Performance optimization: Debounce functions
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
	
	//helper flattenmethod
	// Method to flatten the nested structure
	c.flatten = function(obj) {
			var result = [];
			for (var key in obj) {
					if (obj.hasOwnProperty(key) && Array.isArray(obj[key])) {
							result = result.concat(obj[key]);
					}
			}
			return result;
	};
    
	//WORKING: Get filtered count considering both filters
	c.getFilteredCount = function() {
			return c.getFilteredByBoth().length;
	};

	//WORKING: Get total count
	c.getTotalCount = function() {
			return c.flatten(c.groupedFields).length;
	};
	
	//WORKING: Get count for current document
	c.getDocumentFieldCount = function() {
			if (!c.selectedDocument || !c.selectedDocument.name) {
					return c.getTotalCount();
			}
			return c.getFilteredByFileName(c.selectedDocument.name).length;
	};

	//WORKING: Get unique file names from all fields
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
	
	//WORKING: Enhanced groupFieldsBySection that filters by document
	c.getFilteredGroupedFields = function() {
			var filtered = c.getFilteredByBoth();
			var grouped = {};
			var collapsed = {};

			filtered.forEach(function(field) {
					var sectionName = field.section_name || 'Uncategorized';

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

			// Sort sections alphabetically
			var sortedSections = {};
			Object.keys(grouped).sort().forEach(function(key) {
					sortedSections[key] = grouped[key];
			});

			return sortedSections;
	};
	
	// Method to get fields for a specific section with filters applied
	c.getFilteredSectionFields = function(sectionName) {
			var filteredGroups = c.getFilteredGroupedFields();
			return filteredGroups[sectionName] || [];
	};

	// Method to get section field count with filters
	c.getSectionFilteredCount = function(sectionName) {
			var fields = c.groupedFields[sectionName] || [];
			var filtered = fields;

			// Apply field_name filter
			if (c.fieldSearch) {
					filtered = filtered.filter(function(item) {
							return item.field_name && 
									item.field_name.toLowerCase().indexOf(c.fieldSearch.toLowerCase()) !== -1;
					});
			}

			// Apply file_name filter
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
    
    // Setup canvases
    $timeout(function() {
      canvas = document.getElementById('pdfCanvas');
      annotationCanvas = document.getElementById('annotationCanvas');
      if (canvas && annotationCanvas) {
        ctx = canvas.getContext('2d');
        annotationCtx = annotationCanvas.getContext('2d');
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
	
	// Method to get filtered items by field name only
	c.getFilteredByFieldName = function() {
			var flattened = c.flatten(c.groupedFields);
			if (!c.fieldSearch) {
					return flattened;
			}
			return $filter('filter')(flattened, {field_name: c.fieldSearch});
	};

	// Method to get filtered items by file name only
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
	
	// Enhanced filter method that works with both field_name and file_name
	c.getFilteredByBoth = function() {
			var flattened = c.flatten(c.groupedFields);
			var result = flattened;

			// Apply field_name filter
			if (c.fieldSearch) {
					result = result.filter(function(item) {
							return item.field_name && 
									item.field_name.toLowerCase().indexOf(c.fieldSearch.toLowerCase()) !== -1;
					});
			}

			// Apply file_name filter based on selected document
			if (c.selectedDocument && c.selectedDocument.name) {
					result = result.filter(function(item) {
							return item.attachmentData && 
									item.attachmentData.file_name && 
									item.attachmentData.file_name === c.selectedDocument.name;
					});
			}

			return result;
	};
  
//WORKING: Update the existing filterCoordinatesBySelectedDocument function
var filterCoordinatesBySelectedDocument = function(selectedDocument) {
    if (!selectedDocument || !selectedDocument.name) {
        c.extractedFields = c.globalExtractedFields;
        return;
    }
    
    c.extractedFields = c.globalExtractedFields.filter(function(extractedField) {
        return extractedField.attachmentData && 
               extractedField.attachmentData.file_name === selectedDocument.name;
    });
    
    // Trigger re-render of the fields table
    //$scope.$apply();
};
  
  // Toggle section collapse/expand
  c.toggleSection = function(sectionName) {
    c.collapsedSections[sectionName] = !c.collapsedSections[sectionName];
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
    }).then(function(response) {
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
    }).catch(function(error) {
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
    
    loadingTask.promise.then(function(pdf) {
      pdfDoc = pdf;
      c.pdfLoaded = true;
      c.totalPages = pdf.numPages;
      c.currentPage = 1;
      
      // Set initial zoom mode to fit-width
      c.zoomMode = 'fit-width';
      
      $scope.$apply(function() {
        c.isLoading = false;
      });
      
      // Wait for container to be ready, then render with fit-width
      $timeout(function() {
        renderPage(c.currentPage);
      }, 100);
    }).catch(function(error) {
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
    
    dStrings.forEach(function(dString) {
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
    
    processedMappingData.forEach(function(field) {
      var sectionName = field.section_name || 'Uncategorized';
      
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
    Object.keys(c.groupedFields).sort().forEach(function(key) {
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
    
    processedMappingData = mappingData.map(function(mapping) {
      // Parse multiple coordinate strings
      var allCoordinates = parseMultipleCoordinateStrings(mapping.source);
      
      // Keep first coordinate as primary for backward compatibility
      mapping.coordinates = allCoordinates.length > 0 ? allCoordinates[0] : null;
      mapping.allCoordinates = allCoordinates;
      
      return mapping;
    }).filter(function(mapping) {
      return mapping.allCoordinates.length > 0;
    });
    
		
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
    
    pdfDoc.getPage(pageNumber).then(function(page) {
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
      
      renderTask.promise.then(function() {
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
  c.navigateToField = function(field) {
    if (!field || !field.allCoordinates || field.allCoordinates.length === 0 || !canvas) return;
    
    c.activeField = field;
    c.activeFieldCoordIndex = 0;
    
    // Navigate to first coordinate's page
    var firstCoord = field.allCoordinates[0];
    
    if (firstCoord.page !== c.currentPage) {
      c.currentPage = firstCoord.page;
      renderPage(c.currentPage);
      
      // Highlight after page loads
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
  
  // Navigate to a single coordinate from parsed list
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
  
  // Highlight multiple fields
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
      if (coords.length > 1) {
        annotationCtx.fillStyle = 'rgba(0, 120, 212, 0.9)';
        annotationCtx.font = 'bold 12px Arial';
        annotationCtx.fillText((index + 1).toString(), x1 + 5, y1 + 15);
      }
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
  
  // Zoom controls with debouncing
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
  
  // Fit to width function
  c.fitWidth = function() {
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
  c.actual100Percent = function() {
    if (!pdfDoc) return;
    
    c.zoomMode = 'actual-size';
    c.scale = 1.0;
    renderPage(c.currentPage);
  };
  
  // Get confidence class
  c.getConfidenceClass = function(confidence) {
    var value = parseFloat(confidence) || 0;
    if (value >= 0.75) return 'bg-green-100';
    if (value >= 0.5) return 'bg-yellow-100';
    return 'bg-red-100';
  };
  
  // Parse manual coordinate string(s)
  $scope.$watch('manualCoordinate', function(newVal) {
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
  
  // Navigate to manual coordinates (supports multiple)
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
  
  // Copy current coordinates (supports multiple)
  c.copyCurrentCoordinates = function() {
    if (!c.activeField || !c.activeField.allCoordinates) {
      spUtil.addInfoMessage('No active field selected');
      return;
    }
    
    var dStrings = c.activeField.allCoordinates.map(function(coord) {
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
      navigator.clipboard.writeText(fullString).then(function() {
        spUtil.addInfoMessage('Coordinates copied to clipboard! (' + dStrings.length + ' coordinate(s))');
      }).catch(function() {
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
  $scope.$on('$destroy', function() {
    if (renderTask) {
      renderTask.cancel();
    }
    if (pdfDoc) {
      pdfDoc.destroy();
    }
  });
  
  // Window resize handler
  var resizeHandler = debounce(function() {
    if (c.zoomMode === 'fit-width' && pdfDoc && currentPageInstance) {
      c.fitWidth();
    }
  }, 300);
  
  // Add resize listener
  $window.addEventListener('resize', resizeHandler);
  
  // Initialize on load
  $timeout(function() {
    loadPdfJs();
  }, 100);
};