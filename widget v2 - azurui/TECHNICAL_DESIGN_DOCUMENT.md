# Technical Design Document
## ServiceNow PDF Viewer & Field Management Widget

**Version:** 2.0  
**Last Updated:** October 2025  
**Author:** Development Team  
**Document Status:** Final

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Core Features](#core-features)
4. [Technical Implementation](#technical-implementation)
5. [Data Models](#data-models)
6. [API Specifications](#api-specifications)
7. [UI/UX Design](#uiux-design)
8. [Security & Performance](#security--performance)
9. [Deployment Guide](#deployment-guide)
10. [Testing Strategy](#testing-strategy)

---

## 1. Executive Summary

### 1.1 Overview
The PDF Viewer & Field Management Widget is a ServiceNow portal widget that provides interactive PDF document viewing with intelligent field extraction, highlighting, and management capabilities. It enables users to visualize extracted data fields overlaid on PDF documents and create/edit fields through an intuitive drag-and-drop interface.

### 1.2 Business Value
- **Reduced Manual Data Entry**: Automatic text extraction from PDF selections
- **Improved Data Accuracy**: Visual verification of field locations
- **Enhanced User Experience**: Intuitive drag-and-drop field creation
- **Streamlined Workflows**: Batch save operations for efficiency
- **Real-time Validation**: Immediate visual feedback for field placement

### 1.3 Key Capabilities
- PDF rendering with zoom and navigation controls
- Interactive field highlighting with coordinate-based positioning
- Click-and-drag field creation with OCR text extraction
- Batch field management (create, edit, delete)
- Document filtering and field search
- Section-based field organization
- Confidence score visualization

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Client Browser                       │
│  ┌──────────────────────────────────────────────────┐  │
│  │           ServiceNow Portal Widget               │  │
│  │  ┌────────────┐  ┌──────────────────────────┐   │  │
│  │  │   HTML     │  │    Client Script (JS)    │   │  │
│  │  │  Template  │  │  - AngularJS Controller  │   │  │
│  │  │            │  │  - PDF.js Integration    │   │  │
│  │  │  - Layout  │  │  - Event Handlers        │   │  │
│  │  │  - Binding │  │  - Text Extraction       │   │  │
│  │  └────────────┘  └──────────────────────────┘   │  │
│  │                                                   │  │
│  │  ┌────────────────────────────────────────────┐ │  │
│  │  │              CSS Styles                    │ │  │
│  │  │  - Fluent Design System                    │ │  │
│  │  │  - Responsive Layout                       │ │  │
│  │  └────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                            │
                            │ AJAX (REST)
                            ▼
┌─────────────────────────────────────────────────────────┐
│              ServiceNow Server-Side                     │
│  ┌──────────────────────────────────────────────────┐  │
│  │           Server Script (Rhino JS)               │  │
│  │  - fetchMapping()                                │  │
│  │  - saveField()                                   │  │
│  │  - deleteField()                                 │  │
│  └──────────────────────────────────────────────────┘  │
│                            │                            │
│                            ▼                            │
│  ┌──────────────────────────────────────────────────┐  │
│  │          ServiceNow Database Tables              │  │
│  │  - x_gegis_uwm_dashbo_submission                │  │
│  │  - x_gegis_uwm_dashbo_data_extraction_lineitem  │  │
│  │  - sys_attachment                                │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Component Breakdown

#### 2.2.1 Client-Side Components
- **PDF Rendering Engine**: PDF.js library for document rendering
- **Canvas Layer**: Dual-canvas architecture (PDF + Annotations)
- **State Management**: AngularJS scope-based reactive state
- **Event System**: Mouse events for drag-selection and navigation

#### 2.2.2 Server-Side Components
- **Data Access Layer**: GlideRecord API for database operations
- **Business Logic Layer**: Field validation and transformation
- **Integration Layer**: Attachment URL generation and retrieval

### 2.3 Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Frontend Framework | AngularJS | 1.x | UI binding and state management |
| PDF Rendering | PDF.js | 2.11.338 | PDF document rendering |
| Styling | Tailwind CSS | 2.2.19 | Utility-first CSS framework |
| Icons | Font Awesome | 6.4.0 | Icon library |
| Backend | ServiceNow Rhino | Platform-specific | Server-side scripting |
| Database | ServiceNow Tables | Platform-specific | Data persistence |

---

## 3. Core Features

### 3.1 PDF Document Rendering

#### 3.1.1 Feature Description
Renders PDF documents with high fidelity using PDF.js library, supporting zoom, pan, and page navigation.

#### 3.1.2 Technical Implementation
```javascript
// PDF Loading
var loadingTask = pdfjsLib.getDocument({
  url: documentUrl,
  cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/cmaps/',
  cMapPacked: true
});

// Page Rendering
page.render({
  canvasContext: ctx,
  viewport: viewport
});
```

#### 3.1.3 Key Functions
- `loadPdfFromUrl(url)`: Loads PDF document from attachment URL
- `renderPage(pageNumber)`: Renders specific page to canvas
- `renderTask.cancel()`: Cancels pending render operations

#### 3.1.4 Zoom Modes
- **Actual Size (100%)**: Default 1:1 scale rendering
- **Fit to Width**: Auto-scales to container width
- **Manual Zoom**: 50% to 300% range with zoom in/out controls

#### 3.1.5 Canvas Architecture
```
┌─────────────────────────────────┐
│     PDF Canvas (Base Layer)     │  ← PDF content rendering
│   z-index: 1                     │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│  Annotation Canvas (Overlay)    │  ← Highlights & selections
│   z-index: 2                     │
│   pointer-events: conditional    │
└─────────────────────────────────┘
```

### 3.2 Field Highlighting System

#### 3.2.1 Feature Description
Displays interactive highlights over PDF to show field locations with support for multi-coordinate fields and animated transitions.

#### 3.2.2 Coordinate System
```
D-String Format: D(page, x1, y1, x2, y2, x3, y3, x4, y4)

Where:
- page: 1-based page number
- (x1,y1): Top-left corner in PDF units (1/72 inch)
- (x2,y2): Top-right corner
- (x3,y3): Bottom-right corner
- (x4,y4): Bottom-left corner
```

#### 3.2.3 Coordinate Transformation
```javascript
// PDF to Screen Conversion
var screenX = pdfX * 72 * scale;
var screenY = pdfY * 72 * scale;

// Screen to PDF Conversion  
var pdfX = screenX / (72 * scale);
var pdfY = screenY / (72 * scale);
```

#### 3.2.4 Parsing Logic
```javascript
function parseCoordinateString(source) {
  var match = source.match(
    /D\((\d+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)/
  );
  
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
```

#### 3.2.5 Highlight Rendering
```javascript
function highlightField(coord, scrollToView) {
  // Draw quadrilateral highlight
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
  
  // Optional: Smooth scroll to coordinate
  if (scrollToView) {
    smoothScrollToCoordinate(centerX, centerY);
  }
}
```

#### 3.2.6 Multi-Coordinate Support
Fields can have multiple coordinate sets (for multi-line text):
```javascript
// Parse multiple D-strings separated by semicolon
function parseMultipleCoordinateStrings(source) {
  var dStrings = source.split(';');
  var coordinates = [];
  
  dStrings.forEach(function(dString) {
    var coord = parseCoordinateString(dString.trim());
    if (coord) coordinates.push(coord);
  });
  
  return coordinates;
}
```

### 3.3 Interactive Field Creation

#### 3.3.1 Feature Description
Enables users to create new fields by dragging on the PDF to select an area, with automatic text extraction from the selection.

#### 3.3.2 User Interaction Flow
```
1. User clicks "Create Field" button
   ↓
2. Widget enters creation mode (crosshair cursor)
   ↓
3. User clicks and drags on PDF
   ↓
4. Blue selection rectangle appears with resize handles
   ↓
5. On mouse release, text extraction begins
   ↓
6. Dialog shows with extracted text pre-filled
   ↓
7. User enters field name and section
   ↓
8. Field added to pending queue with "UNSAVED" badge
   ↓
9. User clicks "Save" to persist to database
```

#### 3.3.3 Mouse Event Handlers

**Mouse Down:**
```javascript
function handleMouseDown(event) {
  if (!c.isCreatingField) return;
  
  var rect = canvas.getBoundingClientRect();
  var x = event.clientX - rect.left;
  var y = event.clientY - rect.top;
  
  c.isDragging = true;
  c.dragStart = { 
    x: x / (72 * c.scale), 
    y: y / (72 * c.scale) 
  };
  
  event.preventDefault();
}
```

**Mouse Move:**
```javascript
function handleMouseMove(event) {
  if (!c.isDragging) return;
  
  var rect = canvas.getBoundingClientRect();
  var x = event.clientX - rect.left;
  var y = event.clientY - rect.top;
  
  c.dragEnd = { 
    x: x / (72 * c.scale), 
    y: y / (72 * c.scale) 
  };
  
  drawSelectionRectangle();
}
```

**Mouse Up:**
```javascript
function handleMouseUp(event) {
  if (!c.isDragging) return;
  c.isDragging = false;
  
  // Create rectangle coordinates
  var minX = Math.min(c.dragStart.x, c.dragEnd.x);
  var minY = Math.min(c.dragStart.y, c.dragEnd.y);
  var maxX = Math.max(c.dragStart.x, c.dragEnd.x);
  var maxY = Math.max(c.dragStart.y, c.dragEnd.y);
  
  var newCoord = {
    page: c.currentPage,
    x1: minX, y1: minY,
    x2: maxX, y2: minY,
    x3: maxX, y3: maxY,
    x4: minX, y4: maxY
  };
  
  extractTextFromArea(newCoord).then(function(text) {
    c.newFieldData.field_value = text;
    c.showFieldDialog = true;
  });
}
```

#### 3.3.4 Text Extraction Algorithm

```javascript
function extractTextFromArea(coord) {
  return new Promise(function(resolve) {
    currentPageInstance.getTextContent().then(function(textContent) {
      var extractedText = '';
      var items = textContent.items;
      
      // Convert coordinates to PDF units
      var minX = coord.x1 * 72;
      var minY = coord.y1 * 72;
      var maxX = coord.x3 * 72;
      var maxY = coord.y3 * 72;
      
      // Get viewport for coordinate conversion
      var viewport = currentPageInstance.getViewport({ scale: 1.0 });
      var pageHeight = viewport.height;
      
      // Filter text items within selection
      var selectedItems = [];
      items.forEach(function(item) {
        var transform = item.transform;
        var x = transform[4];
        var y = pageHeight - transform[5];
        
        if (x + item.width >= minX && x <= maxX && 
            y >= minY && y <= maxY) {
          selectedItems.push({
            text: item.str,
            x: x,
            y: y
          });
        }
      });
      
      // Sort by position (top to bottom, left to right)
      selectedItems.sort(function(a, b) {
        var yDiff = a.y - b.y;
        if (Math.abs(yDiff) > 5) return yDiff;
        return a.x - b.x;
      });
      
      // Combine text with proper spacing
      var lastY = -1;
      selectedItems.forEach(function(item, index) {
        if (lastY !== -1 && Math.abs(item.y - lastY) > 5) {
          extractedText += '\n';
        }
        if (index > 0 && lastY !== -1 && Math.abs(item.y - lastY) <= 5) {
          extractedText += ' ';
        }
        extractedText += item.text;
        lastY = item.y;
      });
      
      resolve(extractedText.trim());
    });
  });
}
```

#### 3.3.5 Visual Feedback

**Selection Rectangle:**
```javascript
function drawSelectionRectangle() {
  // Calculate dimensions
  var x = Math.min(x1, x2);
  var y = Math.min(y1, y2);
  var width = Math.abs(x2 - x1);
  var height = Math.abs(y2 - y1);
  
  // Draw semi-transparent blue rectangle
  annotationCtx.fillStyle = 'rgba(59, 130, 246, 0.1)';
  annotationCtx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
  annotationCtx.lineWidth = 2;
  annotationCtx.setLineDash([5, 5]);
  
  annotationCtx.fillRect(x, y, width, height);
  annotationCtx.strokeRect(x, y, width, height);
  
  // Draw resize handles at corners
  var handleSize = 6;
  annotationCtx.fillStyle = 'rgba(59, 130, 246, 1)';
  annotationCtx.fillRect(x - handleSize/2, y - handleSize/2, handleSize, handleSize);
  annotationCtx.fillRect(x + width - handleSize/2, y - handleSize/2, handleSize, handleSize);
  annotationCtx.fillRect(x - handleSize/2, y + height - handleSize/2, handleSize, handleSize);
  annotationCtx.fillRect(x + width - handleSize/2, y + height - handleSize/2, handleSize, handleSize);
}
```

### 3.4 Field Management Operations

#### 3.4.1 Edit Field
```javascript
c.editField = function(field) {
  c.isCreatingField = true;
  c.creationMode = 'edit';
  c.editingField = field;
  
  // Navigate to field's page
  if (field.coordinates.page !== c.currentPage) {
    c.currentPage = field.coordinates.page;
    renderPage(c.currentPage);
  }
  
  enableCreationMode();
};
```

**Edit Flow:**
1. User clicks Edit button
2. Widget navigates to field's page
3. Creation mode activated
4. User drags new selection
5. Field value updated with extracted text
6. Field marked as pending
7. Changes saved on batch save

#### 3.4.2 Delete Field
```javascript
c.deleteField = function(field) {
  if (!confirm('Are you sure you want to delete this field?')) return;
  
  // Remove from UI
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
  
  // Delete from server
  c.server.get({
    action: 'deleteField',
    fieldId: field.sys_id
  });
};
```

#### 3.4.3 Batch Save
```javascript
c.saveAllFields = function() {
  c.isSaving = true;
  var savePromises = [];
  
  c.pendingFields.forEach(function(field) {
    var promise = c.server.get({
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
    });
    savePromises.push(promise);
  });
  
  Promise.all(savePromises).then(function(results) {
    c.isSaving = false;
    c.pendingFields = [];
    spUtil.addInfoMessage('Successfully saved ' + results.length + ' field(s)');
  });
};
```

### 3.5 Document & Field Navigation

#### 3.5.1 Document Selector
```javascript
c.loadDocument = function() {
  if (!c.selectedDocument) return;
  
  c.isLoading = true;
  c.activeField = null;
  clearAnnotations();
  
  loadPdfFromUrl(c.selectedDocument.url);
  filterCoordinatesBySelectedDocument(c.selectedDocument);
};
```

#### 3.5.2 Field Navigation
```javascript
c.navigateToField = function(field) {
  if (!field || !field.allCoordinates || field.allCoordinates.length === 0) return;
  
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
    }, 500);
  } else {
    var coordsOnPage = field.allCoordinates.filter(function(coord) {
      return coord.page === c.currentPage;
    });
    highlightMultipleFields(coordsOnPage, true);
  }
};
```

#### 3.5.3 Smooth Scroll
```javascript
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
```

### 3.6 Search & Filter

#### 3.6.1 Field Search
```javascript
c.getFilteredByBoth = function() {
  var result = c.flatten(c.groupedFields);
  
  // Filter by search term
  if (c.fieldSearch) {
    result = result.filter(function(item) {
      return item.field_name && 
        item.field_name.toLowerCase().indexOf(c.fieldSearch.toLowerCase()) !== -1;
    });
  }
  
  // Filter by selected document
  if (c.selectedDocument && c.selectedDocument.name) {
    result = result.filter(function(item) {
      return item.attachmentData && 
        item.attachmentData.file_name === c.selectedDocument.name;
    });
  }
  
  return result;
};
```

#### 3.6.2 Section Grouping
```javascript
function groupFieldsBySection(processedMappingData) {
  var grouped = {};
  
  processedMappingData.forEach(function(field) {
    var sectionName = field.new_section_name || 'Uncategorized';
    
    if (!grouped[sectionName]) {
      grouped[sectionName] = [];
    }
    
    grouped[sectionName].push(field);
  });
  
  // Sort sections alphabetically
  var sortedSections = {};
  Object.keys(grouped).sort().forEach(function(key) {
    sortedSections[key] = grouped[key];
  });
  
  return sortedSections;
}
```

### 3.7 Advanced Features

#### 3.7.1 Manual Coordinate Entry
```javascript
c.navigateToManualCoordinates = function() {
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
      highlightMultipleFields(coords, true);
    }, 500);
  } else {
    highlightMultipleFields(coords, true);
  }
};
```

#### 3.7.2 Copy Coordinates
```javascript
c.copyCurrentCoordinates = function() {
  if (!c.activeField || !c.activeField.allCoordinates) return;
  
  var dStrings = c.activeField.allCoordinates.map(formatDString);
  var fullString = dStrings.join(';');
  
  navigator.clipboard.writeText(fullString).then(function() {
    spUtil.addInfoMessage('Coordinates copied to clipboard!');
  });
};
```

---

## 4. Technical Implementation

### 4.1 State Management

#### 4.1.1 Core State Variables
```javascript
// PDF State
c.pdfLoaded = false;
c.currentPage = 1;
c.totalPages = 0;
c.scale = 1.0;
c.zoomMode = 'actual-size';

// Field State
c.extractedFields = [];
c.groupedFields = {};
c.activeField = null;
c.fieldSearch = '';

// Creation State
c.isCreatingField = false;
c.creationMode = 'new'; // 'new', 'edit'
c.isDragging = false;
c.dragStart = null;
c.dragEnd = null;

// Pending Changes State
c.pendingFields = [];
c.isSaving = false;

// Dialog State
c.showFieldDialog = false;
c.newFieldData = {
  field_name: '',
  field_value: '',
  section_name: 'User Created',
  confidence_indicator: 1.0
};
```

#### 4.1.2 State Transitions

```
Initial State → Document Selected → PDF Loaded → Ready
                                                    ↓
                                          Field Selected → Highlighted
                                                    ↓
                                         Creation Mode → Dragging → Selection Complete
                                                                           ↓
                                                                    Dialog Shown → Field Added
                                                                                        ↓
                                                                                Pending → Saved
```

### 4.2 Performance Optimizations

#### 4.2.1 Debouncing
```javascript
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

c.zoomIn = debounce(function() {
  c.scale = Math.min(3, c.scale * 1.2);
  renderPage(c.currentPage);
}, 300);
```

#### 4.2.2 Render Cancellation
```javascript
function renderPage(pageNumber) {
  if (renderTask) {
    renderTask.cancel();
    renderTask = null;
  }
  
  pdfDoc.getPage(pageNumber).then(function(page) {
    renderTask = page.render({
      canvasContext: ctx,
      viewport: viewport
    });
    
    renderTask.promise.then(function() {
      renderTask = null;
      // Re-render pending page if queued
      if (pageNumPending !== null) {
        renderPage(pageNumPending);
        pageNumPending = null;
      }
    });
  });
}
```

#### 4.2.3 Lazy Loading
- Fields loaded on-demand per document
- PDF pages rendered only when visible
- Attachment URLs fetched lazily

### 4.3 Error Handling

#### 4.3.1 PDF Loading Errors
```javascript
loadingTask.promise.then(function(pdf) {
  pdfDoc = pdf;
  c.pdfLoaded = true;
}).catch(function(error) {
  console.error('Error loading PDF:', error);
  c.isLoading = false;
  spUtil.addErrorMessage('Failed to load PDF: ' + error.message);
});
```

#### 4.3.2 Text Extraction Errors
```javascript
extractTextFromArea(coord).then(function(text) {
  c.newFieldData.field_value = text || '';
}).catch(function(error) {
  console.error('Error extracting text:', error);
  c.newFieldData.field_value = '';
});
```

#### 4.3.3 Server Communication Errors
```javascript
c.server.get({
  action: 'saveField',
  field: fieldData
}).then(function(response) {
  if (response.data.success) {
    // Success handling
  } else {
    spUtil.addErrorMessage(response.data.error || 'Failed to save field');
  }
}).catch(function(error) {
  spUtil.addErrorMessage('Server error: ' + error.message);
});
```

---

## 5. Data Models

### 5.1 Database Schema

#### 5.1.1 Submission Table
**Table:** `x_gegis_uwm_dashbo_submission`

| Column | Type | Description |
|--------|------|-------------|
| sys_id | GUID | Primary key |
| data_extract | Reference | Link to data extraction record |
| created_on | DateTime | Creation timestamp |

#### 5.1.2 Data Extraction Line Item Table
**Table:** `x_gegis_uwm_dashbo_data_extraction_lineitem`

| Column | Type | Description |
|--------|------|-------------|
| sys_id | GUID | Primary key |
| parent | Reference | Link to data extraction |
| field_name | String | Name of the field |
| field_value | String | Extracted value |
| source | String | D-string coordinates |
| section_name | String | Section/category name |
| confidence_indicator | Decimal | Confidence score (0-1) |
| documentname_attachment_sysid | String | Attachment sys_id |

#### 5.1.3 Attachment Table
**Table:** `sys_attachment`

| Column | Type | Description |
|--------|------|-------------|
| sys_id | GUID | Primary key |
| file_name | String | PDF filename |
| content_type | String | MIME type |
| size_bytes | Integer | File size |
| table_name | String | Related table |
| table_sys_id | String | Related record |

### 5.2 Client-Side Data Structures

#### 5.2.1 Field Object
```javascript
{
  sys_id: "abc123",
  field_name: "Policy Number",
  field_value: "POL-2024-001",
  new_section_name: "Policy Information",
  confidence_indicator: 0.95,
  source: "D(1,100.5,200.3,150.7,200.3,150.7,220.8,100.5,220.8)",
  coordinates: {
    page: 1,
    x1: 100.5, y1: 200.3,
    x2: 150.7, y2: 200.3,
    x3: 150.7, y3: 220.8,
    x4: 100.5, y4: 220.8
  },
  allCoordinates: [...],
  attachmentData: {
    file_name: "policy.pdf",
    file_url: "/sys_attachment.do?sys_id=xyz789"
  },
  isPending: false,
  isNew: false
}
```

#### 5.2.2 Document Object
```javascript
{
  name: "policy.pdf",
  url: "/sys_attachment.do?sys_id=xyz789",
  sys_id: "xyz789"
}
```

#### 5.2.3 Coordinate Object
```javascript
{
  page: 1,           // Page number (1-based)
  x1: 100.5,         // Top-left X (PDF units)
  y1: 200.3,         // Top-left Y
  x2: 150.7,         // Top-right X
  y2: 200.3,         // Top-right Y
  x3: 150.7,         // Bottom-right X
  y3: 220.8,         // Bottom-right Y
  x4: 100.5,         // Bottom-left X
  y4: 220.8          // Bottom-left Y
}
```

---

## 6. API Specifications

### 6.1 Server Script Actions

#### 6.1.1 fetchMapping

**Purpose:** Retrieve field mappings for a submission

**Request:**
```javascript
{
  action: 'fetchMapping',
  submissionSysId: 'abc123def456'
}
```

**Response:**
```javascript
{
  success: true,
  mapping: [
    {
      sys_id: "field001",
      section_name: "Policy Info",
      field_name: "Policy Number",
      field_value: "POL-2024-001",
      source: "D(1,100,200,150,200,150,220,100,220)",
      confidence_indicator: 0.95,
      attachmentData: {
        sys_id: "att001",
        file_name: "policy.pdf",
        file_url: "/sys_attachment.do?sys_id=att001"
      }
    }
  ],
  totalMappings: 25,
  serverTime: 1698765432000
}
```

**Server Implementation:**
```javascript
function fetchMapping() {
  var submissionSysId = input.submissionSysId;
  var submissionGr = new GlideRecord('x_gegis_uwm_dashbo_submission');
  
  if (!submissionGr.get(submissionSysId)) {
    data.error = 'Submission not found';
    return;
  }
  
  var dataExtractSysId = submissionGr.getValue('data_extract');
  
  var mappingGr = new GlideRecord('x_gegis_uwm_dashbo_data_extraction_lineitem');
  mappingGr.addQuery('parent', dataExtractSysId);
  mappingGr.addNotNullQuery('source');
  mappingGr.addQuery('source', '!=', '');
  mappingGr.orderBy('field_name');
  mappingGr.setLimit(500);
  mappingGr.query();
  
  while (mappingGr.next()) {
    var source = mappingGr.getValue('source');
    if (source && source.indexOf('D(') === 0) {
      data.mapping.push({
        sys_id: mappingGr.getUniqueValue(),
        section_name: mappingGr.getValue('section_name'),
        field_name: mappingGr.getValue('field_name'),
        field_value: mappingGr.getValue('field_value'),
        source: source,
        confidence_indicator: parseFloat(mappingGr.getValue('confidence_indicator')) || 0,
        attachmentData: _getAttachmentData(mappingGr.getValue('documentname_attachment_sysid'))
      });
    }
  }
  
  data.success = true;
}
```

#### 6.1.2 saveField

**Purpose:** Create or update a field

**Request:**
```javascript
{
  action: 'saveField',
  field: {
    sys_id: 'temp_1698765432',
    field_name: 'Policy Number',
    field_value: 'POL-2024-001',
    source: 'D(1,100,200,150,200,150,220,100,220)',
    section_name: 'Policy Information',
    confidence: 0.95,
    document_name: 'policy.pdf',
    document_url: '/sys_attachment.do?sys_id=xyz789',
    submission_sys_id: 'abc123'
  }
}
```

**Response:**
```javascript
{
  success: true,
  sys_id: 'field123abc456',
  serverTime: 1698765432000
}
```

**Server Implementation:**
```javascript
function saveField() {
  var field = input.field;
  var tableName = 'x_gegis_uwm_dashbo_data_extraction_lineitem';
  var gr;
  
  if (field.sys_id && field.sys_id.indexOf('temp_') !== 0) {
    // Update existing
    gr = new GlideRecord(tableName);
    if (gr.get(field.sys_id)) {
      gr.setValue('field_name', field.field_name);
      gr.setValue('field_value', field.field_value);
      gr.setValue('source', field.source);
      gr.setValue('section_name', field.section_name);
      gr.setValue('confidence_indicator', field.confidence);
      gr.update();
      data.sys_id = gr.getUniqueValue();
      data.success = true;
    }
  } else {
    // Create new
    gr = new GlideRecord(tableName);
    gr.initialize();
    
    // Get parent data extract
    var submissionGr = new GlideRecord('x_gegis_uwm_dashbo_submission');
    if (submissionGr.get(field.submission_sys_id)) {
      gr.setValue('parent', submissionGr.getValue('data_extract'));
    }
    
    gr.setValue('field_name', field.field_name);
    gr.setValue('field_value', field.field_value);
    gr.setValue('source', field.source);
    gr.setValue('section_name', field.section_name);
    gr.setValue('confidence_indicator', field.confidence);
    
    // Extract attachment sys_id from URL
    var attachmentMatch = field.document_url.match(/sys_id=([a-f0-9]{32})/);
    if (attachmentMatch && attachmentMatch[1]) {
      gr.setValue('documentname_attachment_sysid', attachmentMatch[1]);
    }
    
    var newSysId = gr.insert();
    data.sys_id = newSysId;
    data.success = true;
  }
}
```

#### 6.1.3 deleteField

**Purpose:** Delete a field

**Request:**
```javascript
{
  action: 'deleteField',
  fieldId: 'field123abc456'
}
```

**Response:**
```javascript
{
  success: true,
  serverTime: 1698765432000
}
```

**Server Implementation:**
```javascript
function deleteField() {
  var fieldId = input.fieldId;
  var tableName = 'x_gegis_uwm_dashbo_data_extraction_lineitem';
  
  var gr = new GlideRecord(tableName);
  if (gr.get(fieldId)) {
    if (gr.deleteRecord()) {
      data.success = true;
    } else {
      data.error = 'Failed to delete field';
    }
  } else {
    data.error = 'Field not found';
  }
}
```

### 6.2 Helper Functions

#### 6.2.1 Get Attachment Data
```javascript
function _getAttachmentData(attachmentSysId) {
  var attachmentGr = new GlideRecord('sys_attachment');
  attachmentGr.addQuery('sys_id', attachmentSysId);
  attachmentGr.addQuery('content_type', 'application/pdf');
  attachmentGr.setLimit(1);
  attachmentGr.query();
  
  if (attachmentGr.next()) {
    return {
      sys_id: attachmentGr.getUniqueValue(),
      file_name: attachmentGr.getValue('file_name'),
      content_type: attachmentGr.getValue('content_type'),
      size_bytes: parseInt(attachmentGr.getValue('size_bytes')) || 0,
      size_formatted: _formatFileSize(attachmentGr.getValue('size_bytes')),
      file_url: "/sys_attachment.do?sys_id=" + attachmentSysId
    };
  }
  
  return null;
}
```

#### 6.2.2 Format File Size
```javascript
function _formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 Bytes';
  var k = 1024;
  var sizes = ['Bytes', 'KB', 'MB', 'GB'];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
```

---

## 7. UI/UX Design

### 7.1 Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│                         Header                              │
│  Genpact Insurance Policy Suite                            │
└─────────────────────────────────────────────────────────────┘
┌──────────────────┬──────────────────────────────────────────┐
│   Left Sidebar   │         PDF Viewer Panel                 │
│   (40% width)    │         (60% width)                      │
│                  │                                          │
│ ┌──────────────┐ │ ┌──────────────────────────────────────┐ │
│ │  Document    │ │ │  PDF Header                          │ │
│ │  Selector    │ │ │  - Title                             │ │
│ └──────────────┘ │ │  - Create/Save Buttons               │ │
│                  │ │  - Zoom/Page Controls                │ │
│ ┌──────────────┐ │ └──────────────────────────────────────┘ │
│ │  Field       │ │                                          │
│ │  Search      │ │ ┌──────────────────────────────────────┐ │
│ └──────────────┘ │ │                                      │ │
│                  │ │        PDF Canvas                    │ │
│ ┌──────────────┐ │ │     (Dual Layer)                     │ │
│ │  Fields      │ │ │                                      │ │
│ │  Table       │ │ │  - PDF Layer                         │ │
│ │              │ │ │  - Annotation Layer                  │ │
│ │  Sections:   │ │ │                                      │ │
│ │  - Policy    │ │ │                                      │ │
│ │  - Customer  │ │ │                                      │ │
│ │  - Coverage  │ │ │                                      │ │
│ │              │ │ └──────────────────────────────────────┘ │
│ │  [Scrollable]│ │                                          │
│ └──────────────┘ │ ┌──────────────────────────────────────┐ │
│                  │ │  PDF Footer                          │ │
│                  │ │  - Page info, Scale, Active field    │ │
│                  │ └──────────────────────────────────────┘ │
└──────────────────┴──────────────────────────────────────────┘
```

### 7.2 Color Palette

#### 7.2.1 Primary Colors
- **Primary Blue**: `#0078d4` - Primary actions, links
- **Accent Orange**: `#f97316` - Highlights, active states
- **Success Green**: `#10b981` - Pending badges, save button
- **Error Red**: `#d13438` - Errors, delete actions

#### 7.2.2 Neutral Colors
- **Background**: `#faf9f8` - Sidebar background
- **White**: `#ffffff` - Cards, inputs
- **Gray 100**: `#f3f2f1` - Subtle backgrounds
- **Gray 300**: `#e1dfdd` - Borders
- **Gray 600**: `#605e5c` - Secondary text
- **Gray 900**: `#323130` - Primary text

#### 7.2.3 Semantic Colors
```css
/* Confidence Scores */
.bg-green-100 { background: #dff6dd; color: #0e7a0d; } /* High: >= 75% */
.bg-yellow-100 { background: #fff4ce; color: #835c00; } /* Medium: >= 50% */
.bg-red-100 { background: #fde7e9; color: #a80000; } /* Low: < 50% */

/* Field States */
.active-row { background: #f9d292; } /* Selected field */
.pending-row { background: #f0fdf4; border-left: 3px solid #10b981; } /* Unsaved */
```

### 7.3 Typography

```css
/* Font Family */
font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;

/* Headings */
.section-title { font-size: 14px; font-weight: 600; }
.section-label { font-size: 12px; font-weight: 600; text-transform: uppercase; }

/* Body Text */
.field-name { font-size: 13px; font-weight: 500; }
.field-value { font-size: 13px; font-weight: 400; }
.helper-text { font-size: 11px; color: #605e5c; }

/* Monospace (Coordinates) */
.coord-details { font-family: 'Consolas', 'Courier New', monospace; font-size: 11px; }
```

### 7.4 Interactive Elements

#### 7.4.1 Buttons
```css
/* Primary Button */
.btn-primary {
  background: #0078d4;
  color: #ffffff;
  padding: 8px 16px;
  border-radius: 4px;
  transition: background 0.2s;
}
.btn-primary:hover { background: #106ebe; }

/* Secondary Button */
.btn-secondary {
  background: #ffffff;
  color: #323130;
  border: 1px solid #d2d0ce;
}
.btn-secondary:hover { background: #f3f2f1; }

/* Success Button */
.btn-success {
  background: #10b981;
  color: #ffffff;
}
.btn-success:hover { background: #059669; }
```

#### 7.4.2 Inputs
```css
.form-input, .form-textarea {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #d2d0ce;
  border-radius: 4px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-input:focus, .form-textarea:focus {
  outline: none;
  border-color: #f9d292;
  box-shadow: 0 0 0.1px 0.1rem #f9d292;
}
```

#### 7.4.3 Table Rows
```css
.fields-table tbody tr {
  cursor: pointer;
  transition: background 0.2s;
}

.fields-table tbody tr:hover {
  background: #f8f8f8;
}

.fields-table tbody tr.active-row {
  background: #f9d292;
}
```

### 7.5 Animations

#### 7.5.1 Loading Spinner
```css
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.spinner {
  border: 3px solid #e1dfdd;
  border-top-color: #0078d4;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
}
```

#### 7.5.2 Highlight Animation
```javascript
function animateHighlight() {
  var opacity = 0;
  
  function animate() {
    if (opacity < 0.3) {
      opacity += 0.03;
      annotationCtx.fillStyle = 'rgba(249, 115, 22, ' + opacity + ')';
      // ... draw highlight
      requestAnimationFrame(animate);
    }
  }
  
  animate();
}
```

#### 7.5.3 Modal Transitions
```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.modal-overlay {
  animation: fadeIn 0.2s ease;
}

.modal-dialog {
  animation: slideUp 0.3s ease;
}
```

### 7.6 Responsive Design

```css
@media (max-width: 1024px) {
  .left-sidebar {
    width: 320px;
  }
}

@media (max-width: 768px) {
  .main-layout {
    flex-direction: column;
  }
  
  .left-sidebar {
    width: 100%;
    max-height: 40vh;
    border-right: none;
    border-bottom: 1px solid #e1dfdd;
  }
}
```

---

## 8. Security & Performance

### 8.1 Security Considerations

#### 8.1.1 Access Control
```javascript
// Server-side role check
data.canUpload = gs.hasRole('admin') || gs.hasRole('pdf_uploader');

// Client-side permission check
if (!c.canUpload) {
  spUtil.addErrorMessage('You do not have permission to create fields');
  return;
}
```

#### 8.1.2 Input Validation
```javascript
// Validate field name
if (!c.newFieldData.field_name || c.newFieldData.field_name.trim() === '') {
  spUtil.addErrorMessage('Please enter a field name');
  return;
}

// Validate coordinates
if (!coord || !coord.page || coord.page < 1) {
  spUtil.addErrorMessage('Invalid coordinates');
  return;
}

// Server-side validation
function saveField() {
  var field = input.field;
  
  if (!field || !field.field_name) {
    data.error = 'Invalid field data';
    return;
  }
  
  // Sanitize inputs
  field.field_name = field.field_name.toString().substring(0, 255);
  field.field_value = field.field_value.toString().substring(0, 4000);
  
  // ...
}
```

#### 8.1.3 XSS Prevention
```html
<!-- Angular automatic escaping -->
<td class="field-name">{{field.field_name}}</td>

<!-- Manual sanitization for innerHTML -->
<div ng-bind-html="field.description | sanitize"></div>
```

#### 8.1.4 CSRF Protection
ServiceNow platform provides automatic CSRF token management for all server calls.

### 8.2 Performance Optimization

#### 8.2.1 Query Limits
```javascript
// Limit database queries
mappingGr.setLimit(500);

// Pagination for large datasets
if (count > 500) {
  // Implement pagination
}
```

#### 8.2.2 Caching Strategy
```javascript
// Cache PDF document
var pdfDocCache = {};

function loadPdfFromUrl(url) {
  if (pdfDocCache[url]) {
    pdfDoc = pdfDocCache[url];
    renderPage(c.currentPage);
    return;
  }
  
  // Load and cache
  pdfjsLib.getDocument(url).promise.then(function(pdf) {
    pdfDocCache[url] = pdf;
    pdfDoc = pdf;
    renderPage(c.currentPage);
  });
}
```

#### 8.2.3 DOM Optimization
```javascript
// Virtual scrolling for large field lists
// Track visible range
var visibleStart = Math.floor(scrollTop / rowHeight);
var visibleEnd = Math.ceil((scrollTop + containerHeight) / rowHeight);

// Render only visible rows
var visibleFields = allFields.slice(visibleStart, visibleEnd);
```

#### 8.2.4 Canvas Performance
```javascript
// Batch canvas operations
annotationCtx.save();
// ... multiple draw operations
annotationCtx.restore();

// Clear only dirty regions
annotationCtx.clearRect(x, y, width, height);

// Use requestAnimationFrame for animations
requestAnimationFrame(drawFrame);
```

### 8.3 Memory Management

#### 8.3.1 Cleanup on Destroy
```javascript
$scope.$on('$destroy', function() {
  // Cancel render tasks
  if (renderTask) {
    renderTask.cancel();
  }
  
  // Destroy PDF document
  if (pdfDoc) {
    pdfDoc.destroy();
  }
  
  // Remove event listeners
  if (annotationCanvas) {
    annotationCanvas.removeEventListener('mousedown', handleMouseDown);
    annotationCanvas.removeEventListener('mousemove', handleMouseMove);
    annotationCanvas.removeEventListener('mouseup', handleMouseUp);
  }
  
  // Clear references
  canvas = null;
  ctx = null;
  annotationCanvas = null;
  annotationCtx = null;
});
```

#### 8.3.2 Memory Leak Prevention
```javascript
// Clear intervals/timeouts
var intervalId = setInterval(checkStatus, 1000);
$scope.$on('$destroy', function() {
  clearInterval(intervalId);
});

// Unbind watchers
var unwatch = $scope.$watch('c.fieldSearch', updateFilter);
$scope.$on('$destroy', function() {
  unwatch();
});
```

---

## 9. Deployment Guide

### 9.1 Prerequisites

- ServiceNow instance (Orlando or later)
- Portal created with Service Portal framework
- Custom application scope configured
- Required tables created:
  - `x_gegis_uwm_dashbo_submission`
  - `x_gegis_uwm_dashbo_data_extraction_lineitem`

### 9.2 Installation Steps

#### 9.2.1 Create Widget
1. Navigate to **Service Portal > Widgets**
2. Click **New**
3. Fill in widget details:
   - **Widget ID**: `pdf_field_viewer`
   - **Widget Name**: PDF Field Viewer
   - **Description**: Interactive PDF viewer with field management

#### 9.2.2 Add Dependencies
1. In widget record, add to **CSS Includes**:
   ```
   https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css
   https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css
   ```

2. Add to **Link Function** (if needed):
   ```javascript
   // No link function required
   ```

#### 9.2.3 Upload Files
1. Copy HTML template to **HTML Template** field
2. Copy Client Script to **Client controller** field
3. Copy CSS to **CSS - SCSS** field
4. Copy Server Script to **Server script** field

#### 9.2.4 Configure Widget Options
```javascript
{
  "canUpload": {
    "type": "boolean",
    "default": false,
    "label": "Can Upload"
  }
}
```

### 9.3 Page Configuration

#### 9.3.1 Add Widget to Page
1. Navigate to **Service Portal > Pages**
2. Open target page in Page Designer
3. Drag widget to desired container
4. Configure widget instance options

#### 9.3.2 URL Parameters
Widget accepts URL parameter:
```
?submissionSysId=<sys_id>
```

Example:
```
/sp?id=pdf_viewer&submissionSysId=74c2873d93947210ce18b5d97bba102d
```

### 9.4 Access Control

#### 9.4.1 Create Roles
1. Navigate to **User Administration > Roles**
2. Create roles:
   - `pdf_viewer` - View PDF and fields
   - `pdf_field_manager` - Create/edit/delete fields

#### 9.4.2 Configure ACLs
Create ACL rules for table `x_gegis_uwm_dashbo_data_extraction_lineitem`:

| Operation | Role Required |
|-----------|---------------|
| Read | pdf_viewer |
| Write | pdf_field_manager |
| Create | pdf_field_manager |
| Delete | pdf_field_manager |

### 9.5 Testing Checklist

- [ ] PDF loads correctly
- [ ] Fields highlight on click
- [ ] Search filters fields
- [ ] Document selector works
- [ ] Create field opens dialog
- [ ] Drag selection works
- [ ] Text extraction functions
- [ ] Save button persists changes
- [ ] Edit field updates correctly
- [ ] Delete field removes record
- [ ] Zoom controls work
- [ ] Page navigation works
- [ ] Responsive on mobile
- [ ] No console errors
- [ ] Performance acceptable

---

## 10. Testing Strategy

### 10.1 Unit Testing

#### 10.1.1 Coordinate Parsing
```javascript
describe('parseCoordinateString', function() {
  it('should parse valid D-string', function() {
    var result = parseCoordinateString('D(1,100.5,200.3,150.7,200.3,150.7,220.8,100.5,220.8)');
    
    expect(result.page).toBe(1);
    expect(result.x1).toBe(100.5);
    expect(result.y1).toBe(200.3);
  });
  
  it('should return null for invalid string', function() {
    var result = parseCoordinateString('invalid');
    expect(result).toBeNull();
  });
});
```

#### 10.1.2 Text Extraction
```javascript
describe('extractTextFromArea', function() {
  it('should extract text from selection', function(done) {
    var coord = { page: 1, x1: 100, y1: 200, x3: 150, y3: 220 };
    
    extractTextFromArea(coord).then(function(text) {
      expect(text).toBeDefined();
      expect(text.length).toBeGreaterThan(0);
      done();
    });
  });
});
```

### 10.2 Integration Testing

#### 10.2.1 Server API Tests
```javascript
describe('Server API', function() {
  it('should fetch mappings', function() {
    var request = {
      action: 'fetchMapping',
      submissionSysId: 'test123'
    };
    
    // Call server script
    var response = serverScript(request);
    
    expect(response.success).toBe(true);
    expect(response.mapping).toBeDefined();
    expect(Array.isArray(response.mapping)).toBe(true);
  });
  
  it('should save new field', function() {
    var request = {
      action: 'saveField',
      field: {
        sys_id: 'temp_123',
        field_name: 'Test Field',
        field_value: 'Test Value'
      }
    };
    
    var response = serverScript(request);
    
    expect(response.success).toBe(true);
    expect(response.sys_id).toBeDefined();
    expect(response.sys_id).not.toContain('temp_');
  });
});
```

### 10.3 UI Testing

#### 10.3.1 User Workflows
```javascript
describe('Field Creation Workflow', function() {
  it('should create field via drag selection', function() {
    // 1. Click Create Field button
    clickElement('.btn-primary');
    expect(scope.isCreatingField).toBe(true);
    
    // 2. Drag on canvas
    dragOnCanvas(100, 200, 150, 220);
    
    // 3. Check dialog opens
    expect(scope.showFieldDialog).toBe(true);
    
    // 4. Enter field name
    setInputValue('#field-name', 'Test Field');
    
    // 5. Click save
    clickElement('.modal-footer .btn-primary');
    
    // 6. Check field added to pending
    expect(scope.pendingFields.length).toBe(1);
  });
});
```

### 10.4 Performance Testing

#### 10.4.1 Load Testing
```javascript
describe('Performance', function() {
  it('should render 1000 fields without lag', function() {
    var startTime = performance.now();
    
    // Load 1000 fields
    scope.groupedFields = generateMockFields(1000);
    scope.$digest();
    
    var endTime = performance.now();
    var renderTime = endTime - startTime;
    
    expect(renderTime).toBeLessThan(1000); // < 1 second
  });
  
  it('should handle rapid zoom changes', function() {
    for (var i = 0; i < 10; i++) {
      scope.zoomIn();
      scope.zoomOut();
    }
    
    // Should not crash or hang
    expect(scope.scale).toBeDefined();
  });
});
```

### 10.5 Browser Compatibility

Test on:
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ⚠️ IE 11 (limited support)

### 10.6 Regression Testing

Create regression test suite covering:
1. All critical user paths
2. Previously fixed bugs
3. Edge cases and error scenarios
4. Performance benchmarks

---

## Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| D-String | Coordinate format: `D(page,x1,y1,x2,y2,x3,y3,x4,y4)` |
| PDF Units | 1/72 inch measurement system |
| Viewport | Visible area of PDF at current scale |
| Annotation Layer | Transparent overlay for highlights |
| Pending Field | Unsaved field in local state |
| Confidence Score | AI extraction accuracy (0-1) |

### B. Known Limitations

1. **File Size**: PDF.js performance degrades with files > 50MB
2. **Browser Memory**: Large PDFs may cause memory issues on mobile
3. **Text Extraction**: Accuracy depends on PDF text layer quality
4. **Concurrent Edits**: No real-time collaboration support
5. **Offline Mode**: Requires internet for PDF.js CDN

### C. Future Enhancements

1. **Advanced OCR**: Integrate Tesseract.js for scanned PDFs
2. **Collaborative Editing**: Real-time multi-user field editing
3. **Templates**: Save coordinate templates for similar documents
4. **Bulk Operations**: Multi-select and batch field operations
5. **Export**: Export fields to CSV/Excel
6. **Audit Trail**: Track all field changes with timestamps
7. **Mobile App**: Native mobile application
8. **AI Suggestions**: Auto-suggest field names based on content

### D. Support & Maintenance

**Contact Information:**
- Technical Support: support@example.com
- Bug Reports: bugs@example.com
- Feature Requests: features@example.com

**Documentation Updates:**
- This document will be updated quarterly
- Version history maintained in ServiceNow
- Change log available at: /docs/changelog

---

**Document Version:** 2.0  
**Last Reviewed:** October 2025  
**Next Review:** January 2026

