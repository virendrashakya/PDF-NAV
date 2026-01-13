================================================================================
PDF Viewer Workspace Component
ServiceNow UI Builder / Now Experience Component
================================================================================

OVERVIEW
--------
A configurable PDF viewer component for Agent Workspace / Configurable Workspace.
Accepts document URL, D-string coordinates, and page number as properties.

================================================================================

CONFIGURABLE PROPERTIES
-----------------------
| Property        | Type    | Default      | Description                      |
|-----------------|---------|--------------|----------------------------------|
| documentUrl     | string  | ""           | URL of PDF (sys_attachment.do)   |
| coordinates     | string  | ""           | D-string for highlighting        |
| pageNumber      | integer | 1            | Initial page to display          |
| scale           | number  | 1.0          | Initial zoom scale               |
| zoomMode        | choice  | actual-size  | fit-width, actual-size, fit-page |
| showControls    | boolean | true         | Show control bar                 |
| showPageNav     | boolean | true         | Show page navigation             |
| highlightColor  | string  | rgba(...)    | Highlight color for coordinates  |
| height          | string  | 100%         | Component height (CSS value)     |

================================================================================

ACTIONS (Inbound Events)
------------------------
Actions that can be dispatched TO this component:

1. PDF_VIEWER_LOAD_DOCUMENT
   Payload: { url: string }
   
2. PDF_VIEWER_NAVIGATE_TO_COORDINATES
   Payload: { coordinates: string, page: number }
   
3. PDF_VIEWER_GO_TO_PAGE
   Payload: { page: number }
   
4. PDF_VIEWER_SET_ZOOM
   Payload: { scale: number, mode: string }

================================================================================

DISPATCHED EVENTS (Outbound)
----------------------------
Events dispatched BY this component:

1. PDF_VIEWER#DOCUMENT_LOADED
   Payload: { success: boolean, pageCount: number, documentUrl: string }
   
2. PDF_VIEWER#PAGE_CHANGED
   Payload: { page: number, totalPages: number }
   
3. PDF_VIEWER#ERROR
   Payload: { message: string, type: string }

================================================================================

COORDINATE FORMAT (D-String)
----------------------------
Format: D(page,x1,y1,x2,y2,x3,y3,x4,y4)
Multiple coordinates: D(...);D(...);D(...)

Example:
D(1,100,200,300,250,100,250,300,200)

================================================================================

DEPLOYMENT STEPS
----------------
1. Install @servicenow/cli globally:
   npm install -g @servicenow/cli

2. Login to your instance:
   snc configure profile set

3. Create new component project:
   snc ui-component project --name pdf-viewer-component

4. Copy files to the project:
   - index.js -> src/x-pdf-viewer/index.js
   - styles.scss -> src/x-pdf-viewer/styles.scss
   - now-ui.json -> src/x-pdf-viewer/now-ui.json

5. Build and deploy:
   snc ui-component deploy

6. In UI Builder:
   - Find "PDF Viewer" in component palette
   - Drag to page
   - Configure properties in panel

================================================================================

USAGE IN UI BUILDER
-------------------
1. Add component to page
2. Bind properties:
   - documentUrl -> from state or data resource
   - coordinates -> from field click event or state
   - pageNumber -> from state
3. Connect events:
   - Listen for PDF_VIEWER#DOCUMENT_LOADED
   - Dispatch PDF_VIEWER_NAVIGATE_TO_COORDINATES on field click

================================================================================

FILES
-----
- now-ui.json    : Component definition and properties
- index.js       : Main component logic
- styles.scss    : Component styles (using sass-kit)

================================================================================
