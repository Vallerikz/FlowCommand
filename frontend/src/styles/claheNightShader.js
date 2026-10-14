/**
 * @fileoverview Adverse-weather / nighttime CLAHE post-process for CesiumJS.
 *
 * Local luminance adaptive contrast (CLAHE analogue), specular headlight
 * glare suppression, and Sobel silhouette sharpening for monsoon and
 * low-light Pune intersection feeds. Consumed as a Cesium PostProcessStage
 * by the gods-eye-view layer controllers.
 */

'use strict';

/**
 * GLSL fragment stage. Cesium injects `colorTexture` and
 * `v_textureCoordinates`; output is written to `out_FragColor`.
 * @type {string}
 */
export const CLAHE_NIGHT_FRAGMENT_SHADER = `
uniform sampler2D colorTexture;
uniform float u_clipLimit;
uniform float u_glareThreshold;
uniform float u_glareStrength;
uniform float u_sharpen;
uniform float u_edgeGain;
uniform float u_nightLift;
uniform vec2 u_texelSize;

in vec2 v_textureCoordinates;

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 saturateColor(vec3 c, float amt) {
  float y = luma(c);
  return mix(vec3(y), c, amt);
}

void accumBin(inout float h0, inout float h1, inout float h2, inout float h3,
              inout float h4, inout float h5, inout float h6, inout float h7,
              float y) {
  float t = clamp(y, 0.0, 0.999) * 8.0;
  int b = int(floor(t));
  if (b <= 0) h0 += 1.0;
  else if (b == 1) h1 += 1.0;
  else if (b == 2) h2 += 1.0;
  else if (b == 3) h3 += 1.0;
  else if (b == 4) h4 += 1.0;
  else if (b == 5) h5 += 1.0;
  else if (b == 6) h6 += 1.0;
  else h7 += 1.0;
}

float cdfMap(float h0, float h1, float h2, float h3,
             float h4, float h5, float h6, float h7,
             float y, float invN) {
  float c0 = h0;
  float c1 = c0 + h1;
  float c2 = c1 + h2;
  float c3 = c2 + h3;
  float c4 = c3 + h4;
  float c5 = c4 + h5;
  float c6 = c5 + h6;
  float c7 = c6 + h7;
  float t = clamp(y, 0.0, 0.999) * 8.0;
  int b = int(floor(t));
  float cdf = c7;
  if (b <= 0) cdf = c0;
  else if (b == 1) cdf = c1;
  else if (b == 2) cdf = c2;
  else if (b == 3) cdf = c3;
  else if (b == 4) cdf = c4;
  else if (b == 5) cdf = c5;
  else if (b == 6) cdf = c6;
  return clamp(cdf * invN, 0.0, 1.0);
}

void main() {
  vec2 uv = v_textureCoordinates;
  vec4 src = texture(colorTexture, uv);
  vec3 color = src.rgb;

  float h0 = 0.0;
  float h1 = 0.0;
  float h2 = 0.0;
  float h3 = 0.0;
  float h4 = 0.0;
  float h5 = 0.0;
  float h6 = 0.0;
  float h7 = 0.0;
  float localMean = 0.0;
  float localMax = 0.0;
  float n = 0.0;

  const int RADIUS = 4;
  for (int j = -RADIUS; j <= RADIUS; ++j) {
    for (int i = -RADIUS; i <= RADIUS; ++i) {
      vec2 off = vec2(float(i), float(j)) * u_texelSize * 1.75;
      float y = luma(texture(colorTexture, uv + off).rgb);
      accumBin(h0, h1, h2, h3, h4, h5, h6, h7, y);
      localMean += y;
      localMax = max(localMax, y);
      n += 1.0;
    }
  }
  localMean /= max(n, 1.0);

  float clip = max(u_clipLimit, 0.5) * (n / 8.0);
  h0 = min(h0, clip);
  h1 = min(h1, clip);
  h2 = min(h2, clip);
  h3 = min(h3, clip);
  h4 = min(h4, clip);
  h5 = min(h5, clip);
  h6 = min(h6, clip);
  h7 = min(h7, clip);
  float clippedSum = h0 + h1 + h2 + h3 + h4 + h5 + h6 + h7;
  float redistribute = max(n - clippedSum, 0.0) / 8.0;
  h0 += redistribute;
  h1 += redistribute;
  h2 += redistribute;
  h3 += redistribute;
  h4 += redistribute;
  h5 += redistribute;
  h6 += redistribute;
  h7 += redistribute;

  float y0 = luma(color);
  float yEq = cdfMap(h0, h1, h2, h3, h4, h5, h6, h7, y0, 1.0 / max(n, 1.0));
  float lift = mix(y0, max(yEq, y0 * 0.35 + u_nightLift), 0.78);
  float ratio = lift / max(y0, 1e-4);
  vec3 enhanced = color * ratio;

  float glare = smoothstep(u_glareThreshold, 1.0, y0) *
    smoothstep(u_glareThreshold - 0.08, 1.0, localMax);
  float localContrast = abs(y0 - localMean);
  float specular = glare * (1.0 - smoothstep(0.04, 0.18, localContrast));
  float compressed = y0 / (1.0 + y0 * 2.8);
  enhanced = mix(enhanced, saturateColor(color, 0.35) * compressed, specular * u_glareStrength);

  vec2 px = u_texelSize;
  float tl = luma(texture(colorTexture, uv + vec2(-px.x,  px.y)).rgb);
  float t  = luma(texture(colorTexture, uv + vec2( 0.0,   px.y)).rgb);
  float tr = luma(texture(colorTexture, uv + vec2( px.x,  px.y)).rgb);
  float l  = luma(texture(colorTexture, uv + vec2(-px.x,  0.0)).rgb);
  float r  = luma(texture(colorTexture, uv + vec2( px.x,  0.0)).rgb);
  float bl = luma(texture(colorTexture, uv + vec2(-px.x, -px.y)).rgb);
  float b  = luma(texture(colorTexture, uv + vec2( 0.0,  -px.y)).rgb);
  float br = luma(texture(colorTexture, uv + vec2( px.x, -px.y)).rgb);
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float edge = clamp(length(vec2(gx, gy)), 0.0, 1.0);

  vec3 sharp = enhanced + enhanced * (lift - y0) * u_sharpen;
  vec3 plateBoost = vec3(1.0, 0.96, 0.82);
  sharp = mix(sharp, sharp * plateBoost + vec3(edge * u_edgeGain), edge * 0.55);
  sharp = clamp(sharp, 0.0, 1.0);

  out_FragColor = vec4(sharp, src.a);
}
`;

/**
 * Default uniforms matching OpenCV CLAHE(clipLimit=3.0, tile=8x8) intent.
 * @return {!Object<string, number|function(): !Object>}
 */
export function createClaheNightUniforms() {
  return {
    u_clipLimit: 3.0,
    u_glareThreshold: 0.82,
    u_glareStrength: 0.72,
    u_sharpen: 0.55,
    u_edgeGain: 0.42,
    u_nightLift: 0.07,
    u_texelSize: function () {
      const w = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1920;
      const h = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 1080;
      return {x: 1.0 / w, y: 1.0 / h};
    }
  };
}

/**
 * Construct a CesiumJS PostProcessStage for night / monsoon feeds.
 * @param {Object} Cesium CesiumJS namespace (viewer.scene / global Cesium).
 * @param {Object=} options Optional uniform overrides.
 * @return {Object} PostProcessStage instance.
 */
export function createClaheNightPostProcessStage(Cesium, options) {
  if (!Cesium || !Cesium.PostProcessStage) {
    throw new Error('Cesium.PostProcessStage is required to install the CLAHE night shader');
  }
  const opts = options || {};
  const uniforms = Object.assign(createClaheNightUniforms(), opts.uniforms || {});
  return new Cesium.PostProcessStage({
    name: opts.name || 'flowcommand_clahe_night',
    fragmentShader: CLAHE_NIGHT_FRAGMENT_SHADER,
    uniforms: uniforms
  });
}

/**
 * Enable or disable the stage on a Cesium viewer / scene.
 * @param {Object} viewer Cesium Viewer or Scene.
 * @param {Object} stage PostProcessStage from createClaheNightPostProcessStage.
 * @param {boolean} enabled
 */
export function setClaheNightEnabled(viewer, stage, enabled) {
  if (!stage) {
    return;
  }
  stage.enabled = !!enabled;
  const collection = viewer && (viewer.postProcessStages || (viewer.scene && viewer.scene.postProcessStages));
  if (!collection) {
    return;
  }
  let present = false;
  for (let i = 0; i < collection.length; i++) {
    if (collection.get(i) === stage) {
      present = true;
      break;
    }
  }
  if (enabled && !present) {
    collection.add(stage);
  }
}

export default {
  fragmentShader: CLAHE_NIGHT_FRAGMENT_SHADER,
  createUniforms: createClaheNightUniforms,
  createStage: createClaheNightPostProcessStage,
  setEnabled: setClaheNightEnabled
};
