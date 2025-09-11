api.controller = function($scope, $location, $window, spUtil, $timeout) {
  var c = this;
  
  // Initialize variables
  c.pdfLoaded = false;
  c.extractedFields = [];
	c.globalExtractedFields = [];
  c.scale = 1.0;
  c.currentPage = 1;
  c.totalPages = 0;
  c.activeField = null;
  c.mappingData = null;
  c.fieldSearch = '';
  c.showAdvancedButton = false;
  c.showAdvancedMode = false;
  c.manualCoordinate = '';
  c.manualFields = { page: 1, x1: 0, y1: 0, x2: 0, y2: 0, x3: 0, y3: 0, x4: 0, y4: 0 };
  c.calculatedPixels = '';
  c.documents = [];
  c.selectedDocument = '';
  c.pdfFile = null;
  c.jsonFile = null;
  c.canUpload = c.data.canUpload || false;
  c.isLoading = false;
  c.loadingMessage = 'Loading...';
  
	$('head title').text("Pre-Bind Suite");
	
  // PDF.js variables
  var pdfDoc = null;
  var canvas = null;
  var ctx = null;
  var annotationCanvas = null;
  var annotationCtx = null;
  var pageRendering = false;
  var pageNumPending = null;
  var currentHighlight = null;
  var renderTask = null;
  
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
    clearAnnotations();
    
    loadPdfFromUrl(c.selectedDocument.url);
		// write code for filter cordinates based upon selected documnent
		refreshCordinates(c.selectedDocument);
  };
	
	var refreshCordinates = function(selectedDocument) {
		
		console.log('selectedDocument')
		console.log(selectedDocument)
		
		c.extractedFields = c.globalExtractedFields.filter(function(extractedField) {
			if (selectedDocument.name == extractedField.attachmentData.file_name) {
				return  extractedField;
			}
		})
	}
	
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
				loadPdfFromUrl(c.selectedDocument.url);
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
      c.scale = 1.0;
      
      $scope.$apply(function() {
        c.isLoading = false;
      });
      
      renderPage(c.currentPage);
      //spUtil.addInfoMessage('Document loaded successfully');
    }).catch(function(error) {
      console.error('Error loading PDF:', error);
      c.isLoading = false;
      spUtil.addErrorMessage('Failed to load PDF: ' + error.message);
    });
  }
  
  // Process mapping data
  function processMappingData(mappingData) {
    if (!mappingData || !Array.isArray(mappingData)) {
      c.mappingData = [];
      c.extractedFields = [];
      return;
    }
    
    c.mappingData = mappingData.map(function(mapping) {
      var coordinates = parseCoordinateString(mapping.source);
      mapping.coordinates = coordinates;
      return mapping;
    }).filter(function(mapping) {
      return mapping.coordinates !== null;
    });
    c.extractedFields = c.mappingData;
		
		c.globalExtractedFields = JSON.parse(JSON.stringify(c.mappingData)); //[...c.mappingData]
		//c.extractedFields = JSON.parse(JSON.stringify(c.mappingData))
		refreshCordinates(c.selectedDocument)
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
        if (c.activeField && c.activeField.coordinates && 
            c.activeField.coordinates.page === pageNumber) {
          $timeout(function() {
            highlightField(c.activeField.coordinates, false);
          }, 100);
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
  }
  
  // Navigate to field with animation
  c.navigateToField = function(field) {
    if (!field || !field.coordinates || !canvas) return;
    
    c.activeField = field;
    
    if (field.coordinates.page !== c.currentPage) {
      c.currentPage = field.coordinates.page;
      renderPage(c.currentPage);
      
      // Highlight after page loads
      $timeout(function() {
        highlightField(field.coordinates, true);
      }, 500);
    } else {
      highlightField(field.coordinates, true);
    }
  };
	
	var toPixels = function(value) { return value * 72 * c.scale; };
  
  // Enhanced field highlighting with smooth animation
  function highlightField(coord, scrollToView) {
    if (!coord || !annotationCtx) return;
    
    clearAnnotations();
    
    // Calculate pixel coordinates
    var x1 = toPixels(coord.x1);
    var y1 = toPixels(coord.y1);
    var x2 = toPixels(coord.x2);
    var y2 = toPixels(coord.y2);
    var x3 = (toPixels(coord.x3) || toPixels(coord.x2));
    var y3 = (toPixels(coord.y3) || toPixels(coord.y2));
    var x4 = (toPixels(coord.x4) || toPixels(coord.x1));
    var y4 = (toPixels(coord.y4) || toPixels(coord.y1));
    
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
        //annotationCtx.fill();
        
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
        //annotationCtx.fill();
        annotationCtx.stroke();
        
        // Show marker
        //showMarker(centerX, centerY);
      }
    }
    
    animateHighlight();
    
    // Smooth scroll to view
    if (scrollToView) {
      smoothScrollToCoordinate(centerX, centerY);
    }
  }
  
  // Show position marker
  function showMarker(x, y) {
    var marker = document.getElementById('pageMarker');
    if (marker) {
      marker.style.display = 'block';
      marker.style.left = x + 'px';
      marker.style.top = y + 'px';
      marker.classList.add('highlight-animation');
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
      renderPage(c.currentPage);
    }
  };
  
  c.previousPage = function() {
    if (c.currentPage > 1 && !pageRendering) {
      c.currentPage--;
      c.activeField = null;
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
  
  // Get confidence class
  c.getConfidenceClass = function(confidence) {
    var value = parseFloat(confidence) || 0;
    if (value >= 0.8) return 'bg-green-100';
    if (value >= 0.5) return 'bg-yellow-100';
    return 'bg-red-100';
  };
  
  // Advanced mode functions
  c.updateCalculatedPixels = function() {
    var coords = {
      x1: (c.manualFields.x1 || 0) * c.scale,
      y1: (c.manualFields.y1 || 0) * c.scale,
      x2: (c.manualFields.x2 || 0) * c.scale,
      y2: (c.manualFields.y2 || 0) * c.scale,
      x3: (c.manualFields.x3 || 0) * c.scale,
      y3: (c.manualFields.y3 || 0) * c.scale,
      x4: (c.manualFields.x4 || 0) * c.scale,
      y4: (c.manualFields.y4 || 0) * c.scale
    };
    
    c.calculatedPixels = '(' + coords.x1.toFixed(0) + ', ' + coords.y1.toFixed(0) + ') - (' + 
                        coords.x2.toFixed(0) + ', ' + coords.y2.toFixed(0) + ') - (' + 
                        coords.x3.toFixed(0) + ', ' + coords.y3.toFixed(0) + ') - (' + 
                        coords.x4.toFixed(0) + ', ' + coords.y4.toFixed(0) + ')';
  };
  
  // Navigate to manual coordinates
  c.navigateToManualCoordinates = function() {
    var coord = null;
    
    if (c.manualCoordinate) {
      coord = parseCoordinateString(c.manualCoordinate);
    } else if (c.manualFields.page) {
      coord = {
        page: parseInt(c.manualFields.page) || 1,
        x1: parseFloat(c.manualFields.x1) || 0,
        y1: parseFloat(c.manualFields.y1) || 0,
        x2: parseFloat(c.manualFields.x2) || 0,
        y2: parseFloat(c.manualFields.y2) || 0,
        x3: parseFloat(c.manualFields.x3) || 0,
        y3: parseFloat(c.manualFields.y3) || 0,
        x4: parseFloat(c.manualFields.x4) || 0,
        y4: parseFloat(c.manualFields.y4) || 0
      };
    }
    
    if (coord) {
      c.activeField = { coordinates: coord, field_name: 'Manual Coordinate' };
      
      if (coord.page !== c.currentPage) {
        c.currentPage = coord.page;
        renderPage(c.currentPage);
        $timeout(function() {
          highlightField(coord, true);
        }, 500);
      } else {
        highlightField(coord, true);
      }
      
      c.updateCalculatedPixels();
    } else {
      spUtil.addErrorMessage('Invalid coordinates');
    }
  };
  
  // Copy current coordinates
  c.copyCurrentCoordinates = function() {
    if (!c.activeField || !c.activeField.coordinates) {
      spUtil.addInfoMessage('No active field selected');
      return;
    }
    
    var coord = c.activeField.coordinates;
    var dString = 'D(' + coord.page + ',' + 
                  coord.x1.toFixed(2) + ',' + coord.y1.toFixed(2) + ',' + 
                  coord.x2.toFixed(2) + ',' + coord.y2.toFixed(2) + ',' + 
                  (coord.x3 || coord.x2).toFixed(2) + ',' + (coord.y3 || coord.y2).toFixed(2) + ',' + 
                  (coord.x4 || coord.x1).toFixed(2) + ',' + (coord.y4 || coord.y1).toFixed(2) + ')';
    
    // Update manual fields
    c.manualCoordinate = dString;
    c.manualFields = {
      page: coord.page,
      x1: coord.x1,
      y1: coord.y1,
      x2: coord.x2,
      y2: coord.y2,
      x3: coord.x3 || coord.x2,
      y3: coord.y3 || coord.y2,
      x4: coord.x4 || coord.x1,
      y4: coord.y4 || coord.y1
    };
    
    // Copy to clipboard if available
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(dString).then(function() {
        spUtil.addInfoMessage('Coordinates copied to clipboard!');
      }).catch(function() {
        spUtil.addInfoMessage('Coordinates updated in manual fields');
      });
    } else {
      // Fallback for older browsers
      var tempInput = document.createElement('textarea');
      tempInput.value = dString;
      document.body.appendChild(tempInput);
      tempInput.select();
      try {
        document.execCommand('copy');
        spUtil.addInfoMessage('Coordinates copied to clipboard!');
      } catch (err) {
        spUtil.addInfoMessage('Coordinates updated in manual fields');
      }
      document.body.removeChild(tempInput);
    }
    
    c.updateCalculatedPixels();
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
  
  // Initialize on load
  $timeout(function() {
    loadPdfJs();
  }, 100);
};