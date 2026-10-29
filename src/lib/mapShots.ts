/**
 * Нээлттэй ArcGIS view-үүдийн бүртгэл — «Тайлан татах» (`viewReport.ts`) дэлгэц дээрх
 * газрын зургийн агшин зургийг (`takeScreenshot`) авахад хэрэглэнэ.
 */
type AnyView = __esri.MapView | __esri.SceneView;

const views = new Set<AnyView>();

export function registerMapView(v: AnyView): void {
  for (const x of views) if (x.destroyed) views.delete(x);
  views.add(v);
}

/** `root` дотор DOM-д холбогдсон, устгагдаагүй view-үүд */
export function liveMapViews(root: Element): AnyView[] {
  return [...views].filter((v) => {
    const c = v.container as HTMLElement | null;
    return !v.destroyed && !!c && c.isConnected && root.contains(c);
  });
}
