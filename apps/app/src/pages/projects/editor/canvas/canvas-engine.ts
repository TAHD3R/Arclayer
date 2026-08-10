export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export function clampCanvasZoom(zoom: number, minZoom: number, maxZoom: number): number {
  return Math.min(maxZoom, Math.max(minZoom, zoom));
}

export function panCanvasViewport(viewport: CanvasViewport, delta: CanvasPoint): CanvasViewport {
  return {
    ...viewport,
    x: viewport.x + delta.x,
    y: viewport.y + delta.y,
  };
}

export function zoomCanvasViewport(
  viewport: CanvasViewport,
  nextZoom: number,
  anchor: CanvasPoint,
  minZoom: number,
  maxZoom: number,
): CanvasViewport {
  const zoom = clampCanvasZoom(nextZoom, minZoom, maxZoom);
  if (zoom === viewport.zoom) return viewport;
  return {
    zoom,
    x: anchor.x - ((anchor.x - viewport.x) / viewport.zoom) * zoom,
    y: anchor.y - ((anchor.y - viewport.y) / viewport.zoom) * zoom,
  };
}

export function screenToCanvasWorld(point: CanvasPoint, viewport: CanvasViewport): CanvasPoint {
  return {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom,
  };
}

export function worldToCanvasScreen(point: CanvasPoint, viewport: CanvasViewport): CanvasPoint {
  return {
    x: viewport.x + point.x * viewport.zoom,
    y: viewport.y + point.y * viewport.zoom,
  };
}

export function fitCanvasViewport(params: {
  bounds: CanvasBounds;
  surfaceWidth: number;
  surfaceHeight: number;
  minZoom: number;
  maxZoom: number;
  fitMaxZoom: number;
  padding: number;
  bottomSafeArea?: number;
}): CanvasViewport | null {
  const { bounds, surfaceWidth, surfaceHeight, minZoom, maxZoom, fitMaxZoom, padding } = params;
  if (bounds.width <= 0 || bounds.height <= 0 || surfaceWidth <= 0 || surfaceHeight <= 0) {
    return null;
  }

  const availableWidth = Math.max(1, surfaceWidth - padding * 2);
  const availableHeight = Math.max(1, surfaceHeight - padding * 2 - (params.bottomSafeArea ?? 0));
  const zoom = clampCanvasZoom(
    Math.min(availableWidth / bounds.width, availableHeight / bounds.height, fitMaxZoom),
    minZoom,
    maxZoom,
  );
  const contentCenter = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const surfaceCenter = {
    x: surfaceWidth / 2,
    y: padding + availableHeight / 2,
  };

  return {
    zoom,
    x: surfaceCenter.x - contentCenter.x * zoom,
    y: surfaceCenter.y - contentCenter.y * zoom,
  };
}
