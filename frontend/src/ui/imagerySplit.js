/**
 * @fileoverview Split-Screen Geospatial Comparison UI for FlowCommand ATSC.
 * Compares legacy Static Signal Timers (Pune TOD baseline) vs. FlowCommand AI Adaptive Control.
 *
 * Invariant: Vanilla JS ES module, 2-space indent, single quotes, semicolons.
 */

'use strict';

/**
 * Controller for side-by-side split comparison of static vs. adaptive signal control.
 */
export class FlowCommandSplitController {
  /**
   * @param {Object} context { viewer, Cesium, ... }
   * @param {Object} [options]
   */
  constructor(context = {}, options = {}) {
    this.Cesium = context.Cesium || (typeof window !== 'undefined' ? window.Cesium : null);
    this.viewer = context.viewer || null;
    this.scene = this.viewer ? this.viewer.scene : null;
    this.options = options;

    this.enabled = false;
    this.splitPosition = 0.5; // [0.0 .. 1.0]

    /** @type {HTMLElement|null} */
    this.container = null;
    /** @type {HTMLElement|null} */
    this.sliderHandle = null;
    /** @type {HTMLElement|null} */
    this.leftBadge = null;
    /** @type {HTMLElement|null} */
    this.rightBadge = null;

    this.isDragging = false;
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
  }

  /**
   * Initializes the split-screen comparison UI and binds to Cesium scene.
   * @param {HTMLElement} [parentElement=document.body]
   */
  init(parentElement = null) {
    if (this.container || typeof document === 'undefined') return;

    const parent = parentElement || (this.viewer && this.viewer.container) || document.body;

    // 1. Root split container overlay
    this.container = document.createElement('div');
    this.container.className = 'gev-imagery-split-container';
    this.container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 99;
      display: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
    `;

    // 2. Center Draggable Slider Handle
    this.sliderHandle = document.createElement('div');
    this.sliderHandle.className = 'gev-split-slider';
    this.sliderHandle.style.cssText = `
      position: absolute;
      top: 0;
      bottom: 0;
      width: 4px;
      left: 50%;
      background: #00FF88;
      box-shadow: 0 0 12px rgba(0, 255, 136, 0.8), 0 0 24px rgba(0, 0, 0, 0.8);
      pointer-events: auto;
      cursor: ew-resize;
      transform: translateX(-50%);
    `;

    const knob = document.createElement('div');
    knob.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      width: 32px;
      height: 32px;
      background: #0A0E17;
      border: 2px solid #00FF88;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #00FF88;
      font-size: 14px;
      font-weight: bold;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.9);
      user-select: none;
    `;
    knob.innerHTML = '&#8644;';
    this.sliderHandle.appendChild(knob);

    // 3. Left Badge: STATIC TIMER
    this.leftBadge = document.createElement('div');
    this.leftBadge.className = 'gev-split-badge-left';
    this.leftBadge.style.cssText = `
      position: absolute;
      top: 24px;
      left: 24px;
      padding: 8px 14px;
      background: rgba(14, 18, 24, 0.88);
      border: 1px solid rgba(255, 179, 71, 0.6);
      border-left: 4px solid #FFB347;
      border-radius: 4px;
      color: #FFB347;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
      backdrop-filter: blur(8px);
      box-shadow: 0 4px 16px rgba(0,0,0,0.6);
      pointer-events: auto;
    `;
    this.leftBadge.innerHTML = '&#9201; STATIC TIMERS (PUNE TOD BASELINE)<br><span style="font-weight:400;font-size:10px;color:#A0AEC0;">Fixed cycle: NS 45s / EW 30s · No AI Preemption</span>';

    // 4. Right Badge: AI ADAPTIVE
    this.rightBadge = document.createElement('div');
    this.rightBadge.className = 'gev-split-badge-right';
    this.rightBadge.style.cssText = `
      position: absolute;
      top: 24px;
      right: 24px;
      padding: 8px 14px;
      background: rgba(14, 18, 24, 0.88);
      border: 1px solid rgba(0, 255, 136, 0.6);
      border-right: 4px solid #00FF88;
      border-radius: 4px;
      color: #00FF88;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
      backdrop-filter: blur(8px);
      box-shadow: 0 4px 16px rgba(0,0,0,0.6);
      pointer-events: auto;
      text-align: right;
    `;
    this.rightBadge.innerHTML = '&#9889; FLOWCOMMAND AI ADAPTIVE (SIH26127)<br><span style="font-weight:400;font-size:10px;color:#A0AEC0;">Webster Delay Minimisation + Real-time PCU Boost</span>';

    this.container.appendChild(this.sliderHandle);
    this.container.appendChild(this.leftBadge);
    this.container.appendChild(this.rightBadge);
    parent.appendChild(this.container);

    this.sliderHandle.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);

    this.setSplitPosition(0.5);
  }

  /**
   * Sets the horizontal split ratio in [0.0 .. 1.0].
   * @param {number} position
   */
  setSplitPosition(position) {
    this.splitPosition = Math.max(0.05, Math.min(0.95, Number(position)));
    if (this.sliderHandle) {
      this.sliderHandle.style.left = `${(this.splitPosition * 100).toFixed(2)}%`;
    }
    if (this.scene && typeof this.scene.imagerySplitPosition !== 'undefined') {
      this.scene.imagerySplitPosition = this.splitPosition;
    }
  }

  /**
   * Enables the split view.
   */
  enable() {
    this.enabled = true;
    if (this.container) {
      this.container.style.display = 'block';
    }
    this.setSplitPosition(this.splitPosition);
  }

  /**
   * Disables the split view.
   */
  disable() {
    this.enabled = false;
    if (this.container) {
      this.container.style.display = 'none';
    }
  }

  /**
   * Updates comparison stats display.
   * @param {Object} staticMetrics
   * @param {Object} aiMetrics
   */
  updateSplitData(staticMetrics = {}, aiMetrics = {}) {
    if (this.leftBadge && staticMetrics.cycleSec) {
      this.leftBadge.innerHTML = `&#9201; STATIC TIMERS (PUNE TOD)<br><span style="font-weight:400;font-size:10px;color:#A0AEC0;">Cycle: ${staticMetrics.cycleSec}s · Delay: ${staticMetrics.avgDelayS || 48}s/veh</span>`;
    }
    if (this.rightBadge && aiMetrics.greenSec) {
      this.rightBadge.innerHTML = `&#9889; FLOWCOMMAND AI ADAPTIVE<br><span style="font-weight:400;font-size:10px;color:#A0AEC0;">Green: ${aiMetrics.greenSec}s (+${aiMetrics.boostSec || 0}s AI) · Delay: ${aiMetrics.avgDelayS || 24}s/veh</span>`;
    }
  }

  onMouseDown(e) {
    this.isDragging = true;
    e.preventDefault();
  }

  onMouseMove(e) {
    if (!this.isDragging || !this.container) return;
    const rect = this.container.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    this.setSplitPosition(pos);
  }

  onMouseUp() {
    this.isDragging = false;
  }

  /**
   * Cleans up DOM elements and event listeners.
   */
  destroy() {
    this.disable();
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);

    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
    }
  }
}

/**
 * Convenience factory to attach split-screen comparison to a Cesium viewer.
 * @param {Object} viewer Cesium.Viewer
 * @param {Object} [options]
 * @returns {FlowCommandSplitController}
 */
export function initFlowCommandSplit(viewer, options = {}) {
  const ctrl = new FlowCommandSplitController({ viewer, Cesium: viewer ? viewer.Cesium : null }, options);
  ctrl.init();
  return ctrl;
}

export default {
  FlowCommandSplitController,
  initFlowCommandSplit
};
