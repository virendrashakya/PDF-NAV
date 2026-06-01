import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min?url'
import { useToast } from '../context/ToastContext'
import '../styles/pdfViewer.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker
const pdfCache = new Map<string, pdfjsLib.PDFDocumentProxy>()

interface PDFViewerProps {
  attachmentId?: string
  documentName?: string
  baseUrl?: string
  token?: string
  navigateSource?: string
  navigateKey?: number
  sourceOverlays?: PDFSourceOverlay[]
  onOverlaySelect?: (overlayId: string) => void
}

interface Coordinate {
  page: number
  x1: number
  y1: number
  x2: number
  y2: number
  x3: number
  y3: number
  x4: number
  y4: number
}

export interface PDFSourceOverlay {
  id: string
  source: string
  label?: string
  tone?: 'review' | 'conflict' | 'missing' | 'validated'
  isFocused?: boolean
}

interface OverlayCoordinate extends Coordinate {
  overlayId: string
  label?: string
  tone: NonNullable<PDFSourceOverlay['tone']>
  isFocused: boolean
}

const EMPTY_OVERLAYS: PDFSourceOverlay[] = []

export const PDFViewer: React.FC<PDFViewerProps> = ({
  attachmentId,
  documentName = 'Document',
  baseUrl,
  token,
  navigateSource,
  navigateKey,
  sourceOverlays = EMPTY_OVERLAYS,
  onOverlaySelect
}) => {
  const [scale, setScale] = useState(1)
  const [zoomMode, setZoomMode] = useState<'fit-width' | 'manual' | 'preset-200'>('manual')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(false)
  const [isPanMode, setIsPanMode] = useState(false)
  const [panOffsetX, setPanOffsetX] = useState(0)
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [error, setError] = useState('')
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const annotationCanvasRef = useRef<HTMLCanvasElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const canvasWrapperRef = useRef<HTMLDivElement>(null)
  const pageTransitionDirectionRef = useRef<'next' | 'prev' | null>(null)
  const wheelLockRef = useRef(0)
  const requestSeqRef = useRef(0)
  const pageRenderSeqRef = useRef(0)
  const panSessionRef = useRef<{
    startX: number
    startY: number
    scrollLeft: number
    scrollTop: number
    panOffsetX: number
  } | null>(null)
  const { showToast } = useToast()

  const getPanSlack = () => {
    if (!contentRef.current || !canvasWrapperRef.current) return 0
    return Math.max(0, contentRef.current.clientWidth - canvasWrapperRef.current.offsetWidth)
  }

  const clampPanOffsetX = (nextValue: number) => {
    const slack = getPanSlack()
    if (!slack) return 0
    const limit = slack / 2
    return Math.max(-limit, Math.min(limit, nextValue))
  }

  const parseCoordinateString = (source: string): Coordinate | null => {
    const match = source.match(/D\((\d+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)/)
    if (!match) return null
    return {
      page: Number.parseInt(match[1], 10),
      x1: Number.parseFloat(match[2]),
      y1: Number.parseFloat(match[3]),
      x2: Number.parseFloat(match[4]),
      y2: Number.parseFloat(match[5]),
      x3: Number.parseFloat(match[6]),
      y3: Number.parseFloat(match[7]),
      x4: Number.parseFloat(match[8]),
      y4: Number.parseFloat(match[9])
    }
  }

  const parseMultipleCoordinateStrings = (source?: string): Coordinate[] => {
    if (!source || typeof source !== 'string') return []
    return source
      .split(';')
      .map((item) => parseCoordinateString(item.trim()))
      .filter((item): item is Coordinate => Boolean(item))
  }

  const buildOverlayCoordinates = (overlays: PDFSourceOverlay[]): OverlayCoordinate[] => {
    return overlays.flatMap((overlay) =>
      parseMultipleCoordinateStrings(overlay.source).map((coordinate) => ({
        ...coordinate,
        overlayId: overlay.id,
        label: overlay.label,
        tone: overlay.tone || 'review',
        isFocused: Boolean(overlay.isFocused)
      }))
    )
  }

  useEffect(() => {
    const requestSeq = requestSeqRef.current + 1
    requestSeqRef.current = requestSeq
    const controller = new AbortController()

    const loadPDF = async () => {
      if (!attachmentId || !baseUrl || !token) {
        setPdfDoc(null)
        setTotalPages(0)
        setError('')
        return
      }

      try {
        setLoading(true)
        setError('')

        const cacheKey = `${baseUrl}::${attachmentId}`
        const cachedPdf = pdfCache.get(cacheKey)

        if (cachedPdf) {
          const firstPage = await cachedPdf.getPage(1)
          const viewport = firstPage.getViewport({ scale: 1 })
          if (requestSeq !== requestSeqRef.current) return
          setPdfDoc(cachedPdf)
          setTotalPages(cachedPdf.numPages)
          setCurrentPage(1)
          setPageSize({ width: viewport.width, height: viewport.height })
          setLoading(false)
          return
        }

        const url = `${baseUrl}/api/x_gegis_uwm_dashbo/v1/auditpageapi/attachment/${attachmentId}?format=binary`
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`
          },
          signal: controller.signal
        })

        if (!response.ok) {
          throw new Error(`API Error: ${response.status}`)
        }

        const pdfBytes = await response.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise
        const firstPage = await pdf.getPage(1)
        const viewport = firstPage.getViewport({ scale: 1 })

        if (requestSeq !== requestSeqRef.current) return
        pdfCache.set(cacheKey, pdf)
        setPdfDoc(pdf)
        setTotalPages(pdf.numPages)
        setCurrentPage(1)
        setPageSize({ width: viewport.width, height: viewport.height })
        showToast(`Loaded ${pdf.numPages} pages`, 'success', 2500)
      } catch (err) {
        if (controller.signal.aborted) {
          return
        }
        if (requestSeq !== requestSeqRef.current) return
        const message = err instanceof Error ? err.message : 'Failed to load PDF'
        setError(message)
        showToast(`PDF Error: ${message}`, 'error', 5000)
      } finally {
        if (requestSeq === requestSeqRef.current) {
          setLoading(false)
        }
      }
    }

    void loadPDF()

    return () => {
      controller.abort()
    }
  }, [attachmentId, baseUrl, token, showToast])

  useEffect(() => {
    const updateFitWidth = async () => {
      if (!pdfDoc || !contentRef.current || zoomMode !== 'fit-width') return
      const page = await pdfDoc.getPage(currentPage)
      const viewport = page.getViewport({ scale: 1 })
      const availableWidth = Math.max(contentRef.current.clientWidth - 64, 320)
      setScale(availableWidth / viewport.width)
    }

    void updateFitWidth()
  }, [pdfDoc, currentPage, zoomMode])

  const highlightCoords = useMemo<OverlayCoordinate[]>(() => {
    if (sourceOverlays && sourceOverlays.length > 0) {
      return buildOverlayCoordinates(sourceOverlays)
    }
    return parseMultipleCoordinateStrings(navigateSource).map((coordinate) => ({
      ...coordinate,
      overlayId: 'focused',
      label: 'Focused field',
      tone: 'review' as const,
      isFocused: true
    }))
  }, [navigateSource, sourceOverlays])

  useEffect(() => {
    if (!navigateKey) return
    const parsed = parseMultipleCoordinateStrings(navigateSource)
    if (!parsed.length) return
    const firstPage = parsed[0].page
    if (firstPage > 0) {
      setCurrentPage(firstPage)
    }
  }, [navigateKey, navigateSource])

  useEffect(() => {
    setPanOffsetX(0)
  }, [attachmentId, currentPage, scale])

  useEffect(() => {
    const renderSeq = pageRenderSeqRef.current + 1
    pageRenderSeqRef.current = renderSeq

    const renderPage = async () => {
      if (!pdfDoc || !canvasRef.current || !annotationCanvasRef.current) return

      const page = await pdfDoc.getPage(currentPage)
      if (renderSeq !== pageRenderSeqRef.current) return
      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current
      const annotationCanvas = annotationCanvasRef.current
      const context = canvas.getContext('2d')

      if (!context) return

      canvas.width = viewport.width
      canvas.height = viewport.height
      annotationCanvas.width = viewport.width
      annotationCanvas.height = viewport.height
      setPageSize({ width: Math.round(viewport.width), height: Math.round(viewport.height) })

      const renderTask = page.render({
        canvasContext: context,
        viewport
      })

      try {
        await renderTask.promise
      } catch (error) {
        const typedError = error as { name?: string }
        if (typedError?.name === 'RenderingCancelledException') return
        throw error
      }

      if (renderSeq !== pageRenderSeqRef.current) return

      if (contentRef.current && pageTransitionDirectionRef.current) {
        contentRef.current.scrollTop = pageTransitionDirectionRef.current === 'next'
          ? 0
          : contentRef.current.scrollHeight
        pageTransitionDirectionRef.current = null
      }
    }

    void renderPage()

    return () => {
      pageRenderSeqRef.current += 1
    }
  }, [pdfDoc, currentPage, scale])

  useEffect(() => {
    if (!annotationCanvasRef.current || !canvasRef.current) return

    const annotationCanvas = annotationCanvasRef.current
    const canvas = canvasRef.current
    const annotationContext = annotationCanvas.getContext('2d')

    if (!annotationContext) return

    if (annotationCanvas.width !== canvas.width || annotationCanvas.height !== canvas.height) {
      annotationCanvas.width = canvas.width
      annotationCanvas.height = canvas.height
    }

    annotationContext.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height)
    const coordsOnPage = highlightCoords.filter((coord) => coord.page === currentPage)
    const toPixels = (value: number) => value * 72 * scale

    const toneMap: Record<OverlayCoordinate['tone'], { fill: string; stroke: string }> = {
      validated: { fill: 'rgba(22, 155, 98, 0.16)', stroke: 'rgba(22, 155, 98, 0.92)' },
      review: { fill: 'rgba(217, 119, 6, 0.15)', stroke: 'rgba(217, 119, 6, 0.9)' },
      conflict: { fill: 'rgba(225, 29, 72, 0.16)', stroke: 'rgba(225, 29, 72, 0.92)' },
      missing: { fill: 'rgba(95, 107, 122, 0.14)', stroke: 'rgba(95, 107, 122, 0.84)' }
    }

    coordsOnPage.forEach((coord) => {
      const x1 = toPixels(coord.x1)
      const y1 = toPixels(coord.y1)
      const x2 = toPixels(coord.x2)
      const y2 = toPixels(coord.y2)
      const x3 = toPixels(coord.x3) || x2
      const y3 = toPixels(coord.y3) || y2
      const x4 = toPixels(coord.x4) || x1
      const y4 = toPixels(coord.y4) || y1
      const tone = toneMap[coord.tone]

      annotationContext.fillStyle = tone.fill
      annotationContext.strokeStyle = tone.stroke
      annotationContext.lineWidth = coord.isFocused ? 2.6 : 1.35
      annotationContext.globalAlpha = coord.isFocused ? 1 : 0.75

      annotationContext.beginPath()
      annotationContext.moveTo(x1, y1)
      annotationContext.lineTo(x2, y2)
      annotationContext.lineTo(x3, y3)
      annotationContext.lineTo(x4, y4)
      annotationContext.closePath()
      annotationContext.fill()
      annotationContext.stroke()

      if (coord.isFocused && coord.label) {
        annotationContext.globalAlpha = 1
        annotationContext.font = '600 11px Segoe UI'
        const labelWidth = annotationContext.measureText(coord.label).width + 12
        const labelX = Math.max(4, x1)
        const labelY = Math.max(16, y1 - 8)

        annotationContext.fillStyle = tone.stroke
        annotationContext.fillRect(labelX, labelY - 14, labelWidth, 16)
        annotationContext.fillStyle = '#ffffff'
        annotationContext.fillText(coord.label, labelX + 6, labelY - 3)
      }
    })
    annotationContext.globalAlpha = 1
  }, [currentPage, highlightCoords, scale])

  const fitWidth = () => setZoomMode('fit-width')
  const actual100Percent = () => {
    setZoomMode('manual')
    setScale(1)
  }
  const actual200Percent = () => {
    setZoomMode('preset-200')
    setScale(2)
  }
  const zoomOut = () => {
    setZoomMode('manual')
    setScale((currentValue) => Math.max(0.5, Number((currentValue - 0.1).toFixed(2))))
  }
  const zoomIn = () => {
    setZoomMode('manual')
    setScale((currentValue) => Math.min(3, Number((currentValue + 0.1).toFixed(2))))
  }

  const handleContentWheel: React.WheelEventHandler<HTMLDivElement> = (event) => {
    if (loading || !pdfDoc || !contentRef.current) return

    const container = contentRef.current
    const reachedBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 8
    const reachedTop = container.scrollTop <= 8
    const now = Date.now()

    if (now - wheelLockRef.current < 240) {
      return
    }

    if (event.deltaY > 0 && reachedBottom && currentPage < totalPages) {
      event.preventDefault()
      wheelLockRef.current = now
      pageTransitionDirectionRef.current = 'next'
      setCurrentPage((page) => Math.min(page + 1, totalPages))
      return
    }

    if (event.deltaY < 0 && reachedTop && currentPage > 1) {
      event.preventDefault()
      wheelLockRef.current = now
      pageTransitionDirectionRef.current = 'prev'
      setCurrentPage((page) => Math.max(page - 1, 1))
    }
  }

  const handlePanMouseDown: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (!isPanMode || !contentRef.current || event.button !== 0) return

    panSessionRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: contentRef.current.scrollLeft,
      scrollTop: contentRef.current.scrollTop,
      panOffsetX
    }

    event.preventDefault()
  }

  const handlePanMouseMove: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (!isPanMode || !contentRef.current || !panSessionRef.current) return

    const { startX, startY, scrollLeft, scrollTop, panOffsetX: startPanOffsetX } = panSessionRef.current
    const deltaX = event.clientX - startX
    const deltaY = event.clientY - startY

    if (contentRef.current.scrollWidth > contentRef.current.clientWidth + 2) {
      contentRef.current.scrollLeft = scrollLeft - deltaX
      setPanOffsetX(0)
    } else {
      setPanOffsetX(clampPanOffsetX(startPanOffsetX + deltaX))
    }
    contentRef.current.scrollTop = scrollTop - deltaY
  }

  const handlePanMouseUp = () => {
    panSessionRef.current = null
  }

  const visibleMarkingsCount = highlightCoords.filter((coord) => coord.page === currentPage).length
  const overlayButtons = highlightCoords
    .filter((coord) => coord.page === currentPage)
    .map((coord, index) => {
      const pointsX = [coord.x1, coord.x2, coord.x3, coord.x4]
      const pointsY = [coord.y1, coord.y2, coord.y3, coord.y4]
      const left = Math.min(...pointsX) * 72 * scale
      const top = Math.min(...pointsY) * 72 * scale
      const width = Math.max(...pointsX) * 72 * scale - left
      const height = Math.max(...pointsY) * 72 * scale - top

      return {
        key: `${coord.overlayId}-${index}`,
        overlayId: coord.overlayId,
        label: coord.label,
        tone: coord.tone,
        isFocused: coord.isFocused,
        style: {
          left,
          top,
          width: Math.max(width, 10),
          height: Math.max(height, 10)
        }
      }
    })

  return (
    <div className="pdf-panel">
      <div className="pdf-header">
        <div className="pdf-header-left">
          <div className="control-group">
            <button
              onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
              disabled={currentPage <= 1 || loading}
              className="btn-icon"
              title="Previous Page"
            >
              <i className="fas fa-chevron-left" />
            </button>
            <div className="page-info">Page {currentPage} / {Math.max(totalPages, 0)}</div>
            <button
              onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
              disabled={currentPage >= totalPages || loading}
              className="btn-icon"
              title="Next Page"
            >
              <i className="fas fa-chevron-right" />
            </button>
          </div>
        </div>

        <div className="pdf-title">
          <i className="fas fa-file-pdf" />
          <span>{documentName || 'No document selected'}</span>
        </div>

        <div className="pdf-controls">
          <div className="control-group">
            <button
              onClick={zoomOut}
              disabled={loading || !pdfDoc}
              className="btn-icon"
              title="Zoom out"
            >
              <i className="fas fa-minus" />
            </button>
            <button
              onClick={zoomIn}
              disabled={loading || !pdfDoc}
              className="btn-icon"
              title="Zoom in"
            >
              <i className="fas fa-plus" />
            </button>
            <button
              onClick={fitWidth}
              disabled={loading || !pdfDoc}
              className={`btn-zoom ${zoomMode === 'fit-width' ? 'active' : ''}`}
              title="Fit"
            >
              Fit
            </button>
            <button
              onClick={actual100Percent}
              disabled={loading || !pdfDoc}
              className={`btn-zoom ${zoomMode === 'manual' && Math.round(scale * 100) === 100 ? 'active' : ''}`}
              title="100%"
            >
              100%
            </button>
            <button
              onClick={actual200Percent}
              disabled={loading || !pdfDoc}
              className={`btn-zoom ${zoomMode === 'preset-200' ? 'active' : ''}`}
              title="200%"
            >
              200%
            </button>
            <button
              onClick={() => setIsPanMode((currentValue) => !currentValue)}
              disabled={loading || !pdfDoc}
              className={`btn-icon ${isPanMode ? 'active' : ''}`}
              title="Pan document"
            >
              <i className="fas fa-hand" />
            </button>
          </div>
        </div>
      </div>

      <div
        className={`pdf-content ${isPanMode ? 'is-pan-mode' : ''}`}
        ref={contentRef}
        onWheel={handleContentWheel}
        onMouseDown={handlePanMouseDown}
        onMouseMove={handlePanMouseMove}
        onMouseUp={handlePanMouseUp}
        onMouseLeave={handlePanMouseUp}
      >
        {loading && !pdfDoc && (
          <div className="pdf-loading-overlay">
            <div className="pdf-loader">
              <i className="fas fa-spinner fa-spin" />
              <span>Loading PDF...</span>
            </div>
          </div>
        )}

        {loading && !!pdfDoc && (
          <div className="pdf-loading-inline">
            <i className="fas fa-spinner fa-spin" />
            <span>Updating document...</span>
          </div>
        )}

        {!loading && (!!error || !attachmentId) && (
          <div className="pdf-placeholder">
            <div className="placeholder-content">
              <i className="fas fa-file-pdf placeholder-icon" />
              <h3 className="placeholder-title">No Document Available</h3>
              <p className="placeholder-text">{error || 'Select a document to view'}</p>
            </div>
          </div>
        )}

        {!error && !!pdfDoc && (
          <div
            ref={canvasWrapperRef}
            className="pdf-canvas-wrapper"
            style={{ transform: `translateX(${panOffsetX}px)` }}
          >
            <canvas ref={canvasRef} className="pdf-canvas" />
            <canvas ref={annotationCanvasRef} className="annotation-canvas" />
            <div className={`annotation-overlay-layer ${isPanMode ? 'is-pan-mode' : ''}`}>
              {overlayButtons.map((overlay) => (
                <button
                  key={overlay.key}
                  type="button"
                  title={overlay.label || 'Mapped field'}
                  className={`annotation-hitbox tone-${overlay.tone} ${overlay.isFocused ? 'is-focused' : ''}`}
                  style={overlay.style}
                  onClick={() => onOverlaySelect?.(overlay.overlayId)}
                />
              ))}
            </div>
            <div className="page-marker" />
          </div>
        )}
      </div>

      <div className="pdf-footer">
        <div className="footer-content">
          <span className="footer-item">
            <i className="fas fa-file" />
            {pageSize ? `A4: ${pageSize.width} x ${pageSize.height} points` : 'A4'}
          </span>
          <span className="footer-item">
            <i className="fas fa-expand" />
            Scale: {Math.round(scale * 100)}%
          </span>
          <span className="footer-item">
            <i className="fas fa-crosshairs" />
            Markings: {highlightCoords.length} total · {visibleMarkingsCount} on page
          </span>
        </div>
      </div>
    </div>
  )
}
