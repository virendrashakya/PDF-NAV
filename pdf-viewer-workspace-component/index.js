import { createCustomElement, actionTypes } from '@servicenow/ui-core';
import snabbdom from '@servicenow/ui-renderer-snabbdom';
import styles from './styles.scss';

/* ============================================
 * PDF Viewer Workspace Component
 * ============================================
 * A configurable PDF viewer for UI Builder
 * Accepts: documentUrl, coordinates, pageNumber
 * ============================================ */

const { COMPONENT_BOOTSTRAPPED, COMPONENT_PROPERTY_CHANGED } = actionTypes;

// Action types
const LOAD_DOCUMENT = 'PDF_VIEWER_LOAD_DOCUMENT';
const NAVIGATE_TO_COORDINATES = 'PDF_VIEWER_NAVIGATE_TO_COORDINATES';
const GO_TO_PAGE = 'PDF_VIEWER_GO_TO_PAGE';
const SET_ZOOM = 'PDF_VIEWER_SET_ZOOM';
const INTERNAL_PDF_LOADED = 'INTERNAL_PDF_LOADED';
const INTERNAL_RENDER_PAGE = 'INTERNAL_RENDER_PAGE';
const INTERNAL_SET_ERROR = 'INTERNAL_SET_ERROR';

// Dispatch event types
const DOCUMENT_LOADED = 'PDF_VIEWER#DOCUMENT_LOADED';
const PAGE_CHANGED = 'PDF_VIEWER#PAGE_CHANGED';
const ERROR = 'PDF_VIEWER#ERROR';

// Initial state
const initialState = {
    pdfDoc: null,
    currentPage: 1,
    totalPages: 0,
    scale: 1.0,
    zoomMode: 'actual-size',
    isLoading: false,
    error: null,
    currentDocumentUrl: '',
    activeCoordinates: []
};

// View renderer
const view = (state, { dispatch, updateState, properties }) => {
    const {
        documentUrl,
        coordinates,
        pageNumber,
        scale,
        zoomMode,
        showControls,
        showPageNav,
        height
    } = properties;

    const { isLoading, error, currentPage, totalPages } = state;

    return (
        <div className="pdf-viewer-component" style={{ height: height || '100%' }}>
            {/* Loading Overlay */}
            {isLoading && (
                <div className="pdf-loading">
                    <div className="loading-spinner"></div>
                    <span>Loading PDF...</span>
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className="pdf-error">
                    <now-icon icon="circle-exclamation-outline" size="lg" />
                    <span>{error}</span>
                </div>
            )}

            {/* Controls Bar */}
            {showControls && !isLoading && !error && totalPages > 0 && (
                <div className="pdf-controls">
                    {/* Page Navigation */}
                    {showPageNav && (
                        <div className="page-nav">
                            <now-button
                                variant="secondary"
                                size="sm"
                                icon="chevron-left-outline"
                                disabled={currentPage <= 1}
                                on-click={() => dispatch(GO_TO_PAGE, { page: currentPage - 1 })}
                            />
                            <span className="page-info">
                                {currentPage} / {totalPages}
                            </span>
                            <now-button
                                variant="secondary"
                                size="sm"
                                icon="chevron-right-outline"
                                disabled={currentPage >= totalPages}
                                on-click={() => dispatch(GO_TO_PAGE, { page: currentPage + 1 })}
                            />
                        </div>
                    )}

                    {/* Zoom Controls */}
                    <div className="zoom-controls">
                        <now-button
                            variant="secondary"
                            size="sm"
                            icon="zoom-out-outline"
                            on-click={() => dispatch(SET_ZOOM, { scale: state.scale / 1.25 })}
                        />
                        <span className="zoom-level">{Math.round(state.scale * 100)}%</span>
                        <now-button
                            variant="secondary"
                            size="sm"
                            icon="zoom-in-outline"
                            on-click={() => dispatch(SET_ZOOM, { scale: state.scale * 1.25 })}
                        />
                    </div>
                </div>
            )}

            {/* PDF Container */}
            <div className="pdf-container" id="pdfContainer">
                {!documentUrl && !isLoading && (
                    <div className="pdf-empty">
                        <now-icon icon="document-pdf-outline" size="xl" />
                        <p>No document loaded</p>
                    </div>
                )}
                <canvas id="pdfCanvas" className="pdf-canvas"></canvas>
                <canvas id="annotationCanvas" className="annotation-canvas"></canvas>
            </div>
        </div>
    );
};

// Action handlers
const actionHandlers = {
    // Component lifecycle
    [COMPONENT_BOOTSTRAPPED]: ({ dispatch, properties }) => {
        // Load PDF.js library
        loadPdfJsLibrary().then(() => {
            if (properties.documentUrl) {
                dispatch(LOAD_DOCUMENT, { url: properties.documentUrl });
            }
        });
    },

    // Property changes
    [COMPONENT_PROPERTY_CHANGED]: ({ action, dispatch, state }) => {
        const { name, value, previousValue } = action.payload;

        if (name === 'documentUrl' && value && value !== previousValue) {
            dispatch(LOAD_DOCUMENT, { url: value });
        }

        if (name === 'coordinates' && value && value !== previousValue) {
            dispatch(NAVIGATE_TO_COORDINATES, { coordinates: value });
        }

        if (name === 'pageNumber' && value && value !== previousValue) {
            dispatch(GO_TO_PAGE, { page: value });
        }
    },

    // Load document action
    [LOAD_DOCUMENT]: async ({ action, updateState, dispatch }) => {
        const { url } = action.payload;
        if (!url) return;

        updateState({ isLoading: true, error: null });

        try {
            const loadingTask = window.pdfjsLib.getDocument({
                url: url,
                cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/cmaps/',
                cMapPacked: true
            });

            const pdfDoc = await loadingTask.promise;

            updateState({
                pdfDoc: pdfDoc,
                totalPages: pdfDoc.numPages,
                currentPage: 1,
                isLoading: false,
                currentDocumentUrl: url
            });

            dispatch(INTERNAL_RENDER_PAGE, { page: 1 });
            dispatch(DOCUMENT_LOADED, {
                success: true,
                pageCount: pdfDoc.numPages,
                documentUrl: url
            });

        } catch (error) {
            updateState({
                isLoading: false,
                error: 'Failed to load PDF: ' + error.message
            });
            dispatch(ERROR, { message: error.message, type: 'load' });
        }
    },

    // Navigate to coordinates
    [NAVIGATE_TO_COORDINATES]: ({ action, state, dispatch, updateState }) => {
        const { coordinates, page } = action.payload;
        const parsedCoords = parseCoordinateString(coordinates);

        if (parsedCoords.length > 0) {
            const targetPage = page || parsedCoords[0].page;
            updateState({ activeCoordinates: parsedCoords });

            if (targetPage !== state.currentPage) {
                dispatch(GO_TO_PAGE, { page: targetPage });
            } else {
                highlightCoordinates(parsedCoords, state.scale);
            }
        }
    },

    // Go to page
    [GO_TO_PAGE]: ({ action, state, dispatch, updateState }) => {
        const { page } = action.payload;
        const pageNum = parseInt(page);

        if (state.pdfDoc && pageNum >= 1 && pageNum <= state.totalPages) {
            updateState({ currentPage: pageNum });
            dispatch(INTERNAL_RENDER_PAGE, { page: pageNum });
            dispatch(PAGE_CHANGED, { page: pageNum, totalPages: state.totalPages });
        }
    },

    // Set zoom
    [SET_ZOOM]: ({ action, state, dispatch, updateState }) => {
        const { scale, mode } = action.payload;
        const newScale = Math.max(0.25, Math.min(4.0, scale || state.scale));

        updateState({ scale: newScale, zoomMode: mode || 'custom' });
        dispatch(INTERNAL_RENDER_PAGE, { page: state.currentPage });
    },

    // Internal render page
    [INTERNAL_RENDER_PAGE]: async ({ action, state, properties }) => {
        const { page } = action.payload;
        if (!state.pdfDoc) return;

        try {
            const pdfPage = await state.pdfDoc.getPage(page);
            const canvas = document.getElementById('pdfCanvas');
            const annotationCanvas = document.getElementById('annotationCanvas');

            if (!canvas || !annotationCanvas) return;

            const ctx = canvas.getContext('2d');
            const annotationCtx = annotationCanvas.getContext('2d');

            // Calculate scale for fit-width if needed
            let scale = state.scale;
            if (state.zoomMode === 'fit-width') {
                const container = document.getElementById('pdfContainer');
                if (container) {
                    const baseViewport = pdfPage.getViewport({ scale: 1.0 });
                    scale = (container.clientWidth - 40) / baseViewport.width;
                }
            }

            const viewport = pdfPage.getViewport({ scale });

            // Set canvas dimensions
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            annotationCanvas.width = viewport.width;
            annotationCanvas.height = viewport.height;

            // Clear and render
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

            await pdfPage.render({
                canvasContext: ctx,
                viewport: viewport
            }).promise;

            // Re-apply highlights if on current page
            if (state.activeCoordinates.length > 0) {
                const coordsOnPage = state.activeCoordinates.filter(c => c.page === page);
                if (coordsOnPage.length > 0) {
                    highlightCoordinates(coordsOnPage, scale, properties.highlightColor);
                }
            }

        } catch (error) {
            console.error('Render error:', error);
        }
    }
};

// Helper: Load PDF.js library
function loadPdfJsLibrary() {
    return new Promise((resolve, reject) => {
        if (window.pdfjsLib) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.min.js';
        script.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';
            resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Helper: Parse D string coordinates
function parseCoordinateString(source) {
    if (!source || typeof source !== 'string') return [];

    const coordinates = [];
    const dStrings = source.split(';');

    dStrings.forEach(dString => {
        const match = dString.trim().match(
            /D\((\d+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)/
        );
        if (match) {
            coordinates.push({
                page: parseInt(match[1]),
                x1: parseFloat(match[2]),
                y1: parseFloat(match[3]),
                x2: parseFloat(match[4]),
                y2: parseFloat(match[5]),
                x3: parseFloat(match[6]),
                y3: parseFloat(match[7]),
                x4: parseFloat(match[8]),
                y4: parseFloat(match[9])
            });
        }
    });

    return coordinates;
}

// Helper: Highlight coordinates on canvas
function highlightCoordinates(coordinates, scale, highlightColor) {
    const canvas = document.getElementById('annotationCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const color = highlightColor || 'rgba(255, 235, 59, 0.4)';

    coordinates.forEach((coord, index) => {
        const x1 = coord.x1 * scale;
        const y1 = canvas.height - (coord.y1 * scale);
        const x2 = coord.x2 * scale;
        const y2 = canvas.height - (coord.y2 * scale);
        const x3 = coord.x3 * scale;
        const y3 = canvas.height - (coord.y3 * scale);
        const x4 = coord.x4 * scale;
        const y4 = canvas.height - (coord.y4 * scale);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.lineTo(x4, y4);
        ctx.closePath();

        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 152, 0, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
    });
}

// Create and export component
createCustomElement('x-pdf-viewer', {
    renderer: { type: snabbdom },
    view,
    initialState,
    actionHandlers,
    styles
});

export default {};
