/* Node-д `@arcgis/core/layers/FeatureLayer`-ийг REST орлуулагчаар (`featureLayer.mjs`) солих шийдвэрлэгч */
const SHIM = new URL('./featureLayer.mjs', import.meta.url).href;
export async function resolve(spec, ctx, next) {
  if (spec === '@arcgis/core/layers/FeatureLayer' || spec === '@arcgis/core/layers/FeatureLayer.js') return { url: SHIM, shortCircuit: true };
  return next(spec, ctx);
}
