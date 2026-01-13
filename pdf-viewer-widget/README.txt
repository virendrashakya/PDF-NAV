================================================================================
PDF Viewer Widget
ServiceNow Service Portal Widget
================================================================================

OVERVIEW
--------
Standalone PDF viewer widget that can be controlled via events from other 
widgets. Accepts document URL, coordinates, and page number for navigation.

================================================================================

WIDGET OPTIONS (Instance Options)
---------------------------------
- documentUrl    : Initial PDF URL to load
- initialPage    : Starting page number (default: 1)
- initialScale   : Starting zoom scale (default: 1.0)
- showControls   : Show control bar (default: true)

================================================================================

EVENTS LISTENED
---------------
1. pdf-viewer:loadDocument
   Payload: { url: string }
   Action: Loads the specified PDF document

2. pdf-viewer:navigateToField
   Payload: { coordinates: array, documentUrl: string (optional) }
   Action: Navigates to coordinates and highlights them

3. pdf-viewer:goToPage
   Payload: { page: number }
   Action: Goes to specified page

4. pdf-viewer:setZoom
   Payload: { mode: 'fit-width' | 'actual-size' | numeric scale }
   Action: Sets zoom level

================================================================================

EVENTS BROADCAST
----------------
1. pdf-viewer:documentLoaded
   Payload: { success: boolean, pages: number, url: string }
   Fired: After document loads (or fails)

================================================================================

COORDINATE FORMAT
-----------------
Coordinates object structure:
{
  page: number,      // Page number (1-indexed)
  x1: number,        // Top-left X
  y1: number,        // Top-left Y
  x2: number,        // Top-right X
  y2: number,        // Top-right Y
  x3: number,        // Bottom-right X
  y3: number,        // Bottom-right Y
  x4: number,        // Bottom-left X
  y4: number         // Bottom-left Y
}

================================================================================

USAGE EXAMPLE
-------------
From another widget's client script:

// Load a document
$rootScope.$broadcast('pdf-viewer:loadDocument', {
  url: '/sys_attachment.do?sys_id=abc123'
});

// Navigate to coordinates
$rootScope.$broadcast('pdf-viewer:navigateToField', {
  coordinates: [{ page: 1, x1: 100, y1: 200, ... }],
  documentUrl: '/sys_attachment.do?sys_id=abc123'
});

================================================================================

FILES
-----
- serverscript.js  : Minimal, passes widget options
- clientscript.js  : PDF.js integration, event handling, rendering
- html             : Widget template with controls and canvas
- css              : Dark theme styling

================================================================================

DEPENDENCIES
------------
- PDF.js library (v2.11.338) - Loaded from CDN
- AngularJS $rootScope for event communication

================================================================================
