import { useState, useRef, useCallback, useEffect } from 'react'

interface Props {
  src: string
  name: string
}

const MIN_ZOOM = 10
const MAX_ZOOM = 800
const STEP = 20

// null = "fit" mode (CSS handles sizing); number = explicit % of natural size
type Zoom = number | null

export default function ImagePreview({ src, name }: Props) {
  const [zoom, setZoom] = useState<Zoom>(null)
  const [displayPct, setDisplayPct] = useState<number | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const clamp = (v: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(v)))

  // Compute actual rendered % of natural size for display in toolbar
  const updateDisplayPct = useCallback(() => {
    const img = imgRef.current
    if (!img || !img.naturalWidth) return
    setDisplayPct(Math.round((img.clientWidth / img.naturalWidth) * 100))
  }, [])

  // After image loads, compute fit-mode display percentage
  const handleLoad = useCallback(() => {
    updateDisplayPct()
  }, [updateDisplayPct])

  // Re-run when zoom changes (wait for layout)
  useEffect(() => {
    requestAnimationFrame(updateDisplayPct)
  }, [zoom, updateDisplayPct])

  // When entering explicit zoom mode, base it on current rendered size
  const enterExplicitZoom = useCallback((delta: number) => {
    const img = imgRef.current
    if (!img || !img.naturalWidth) return
    const current = Math.round((img.clientWidth / img.naturalWidth) * 100)
    setZoom(clamp(current + delta))
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY < 0 ? STEP : -STEP
    if (zoom === null) {
      enterExplicitZoom(delta)
    } else {
      setZoom(z => clamp((z ?? 100) + delta))
    }
  }, [zoom, enterExplicitZoom])

  const zoomIn = () => {
    if (zoom === null) enterExplicitZoom(STEP)
    else setZoom(z => clamp((z ?? 100) + STEP))
  }
  const zoomOut = () => {
    if (zoom === null) enterExplicitZoom(-STEP)
    else setZoom(z => clamp((z ?? 100) - STEP))
  }
  const resetZoom = () => setZoom(null) // back to fit

  // In fit mode: CSS max-width/max-height handles it.
  // In explicit mode: width = naturalWidth * zoom / 100 px.
  const imgStyle: React.CSSProperties = zoom === null
    ? { maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' }
    : (() => {
        const natural = imgRef.current?.naturalWidth ?? 0
        return natural
          ? { width: `${Math.round(natural * zoom / 100)}px`, height: 'auto' }
          : { width: `${zoom}%`, height: 'auto' }
      })()

  const label = zoom === null
    ? (displayPct !== null ? `${displayPct}%` : 'Fit')
    : `${zoom}%`

  return (
    <div className="image-preview-wrap">
      <div
        className="image-preview-canvas"
        ref={containerRef}
        onWheel={handleWheel}
      >
        <img
          ref={imgRef}
          src={src}
          alt={name}
          className="image-preview-img"
          style={imgStyle}
          draggable={false}
          onLoad={handleLoad}
        />
      </div>
      <div className="image-preview-toolbar">
        <button className="img-zoom-btn" onClick={zoomOut} title="Zoom out">−</button>
        <button
          className="img-zoom-reset"
          onClick={resetZoom}
          title={zoom !== null ? 'Reset to fit' : 'Fitted to view'}
        >
          {label}
        </button>
        <button className="img-zoom-btn" onClick={zoomIn} title="Zoom in">+</button>
      </div>
    </div>
  )
}
