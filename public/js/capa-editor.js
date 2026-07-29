// Capa crop editor — drag, zoom in/out, rotate
(function () {
  const OUTPUT_W = 1500;
  const OUTPUT_H = 500;

  let _resolve = null;
  let isDragging = false;
  let lastMouseX, lastMouseY;
  let imgX = 0, imgY = 0;
  let scale = 1;
  let rotation = 0;      // 0 | 90 | 180 | 270
  let coverScale = 1;
  let absMin = 0.1;
  let absMax = 4;
  let imgNaturalW = 0, imgNaturalH = 0;
  let previewW = 0, previewH = 0;
  let imgEl = null;
  let viewportEl = null;
  let zoomInputEl = null;

  // Effective visual dimensions after rotation
  function effDims(nat_w, nat_h, rot) {
    return (rot === 90 || rot === 270)
      ? { w: nat_h, h: nat_w }
      : { w: nat_w, h: nat_h };
  }

  // Logarithmic slider ↔ scale (0–200, midpoint = coverScale)
  function scaleToSlider(s) {
    return Math.round(200 * Math.log(s / absMin) / Math.log(absMax / absMin));
  }
  function sliderToScale(v) {
    return absMin * Math.pow(absMax / absMin, v / 200);
  }

  function recalcScaleBounds() {
    const { w: effW, h: effH } = effDims(imgNaturalW, imgNaturalH, rotation);
    coverScale = Math.max(previewW / effW, previewH / effH);
    const fitScale = Math.min(previewW / effW, previewH / effH);
    absMin = fitScale * 0.5;
    absMax = coverScale * 4;
  }

  function openCapaEditor(file) {
    return new Promise((resolve) => {
      _resolve = resolve;
      buildModal(file);
    });
  }

  function buildModal(file) {
    const existing = document.getElementById("capa-editor-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "capa-editor-overlay";
    overlay.innerHTML = `
      <style>
        #capa-editor-overlay {
          position: fixed; inset: 0; z-index: 9999;
          background: rgba(0,0,0,0.88);
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 16px; box-sizing: border-box;
        }
        #capa-editor-title {
          color: #fff; font-size: 16px; font-weight: 600;
          margin-bottom: 6px;
        }
        #capa-editor-hint {
          color: rgba(255,255,255,0.5); font-size: 12px;
          margin-bottom: 12px; text-align: center; line-height: 1.5;
        }
        #capa-editor-viewport {
          position: relative;
          width: 100%; max-width: 780px;
          aspect-ratio: 3 / 1;
          overflow: hidden;
          border-radius: 10px;
          border: 2px solid rgba(255,255,255,0.2);
          cursor: grab;
          touch-action: none;
          user-select: none;
          background: #1a1a1a;
        }
        #capa-editor-viewport.dragging { cursor: grabbing; }
        #capa-editor-img {
          position: absolute;
          transform-origin: center center;
          pointer-events: none;
          will-change: transform;
        }
        #capa-editor-controls {
          display: flex; align-items: center; gap: 16px;
          margin-top: 14px; flex-wrap: wrap; justify-content: center;
        }
        .capa-ctrl-group {
          display: flex; align-items: center; gap: 8px;
        }
        .capa-ctrl-group span {
          color: rgba(255,255,255,0.4); font-size: 11px;
          text-transform: uppercase; letter-spacing: 0.5px;
        }
        .capa-icon-btn {
          background: rgba(255,255,255,0.1); border: none;
          color: #fff; font-size: 18px; cursor: pointer;
          width: 36px; height: 36px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.15s;
        }
        .capa-icon-btn:hover { background: rgba(255,255,255,0.2); }
        #capa-zoom-input {
          -webkit-appearance: none; appearance: none;
          height: 4px; background: rgba(255,255,255,0.25);
          border-radius: 2px; outline: none; width: 150px; cursor: pointer;
        }
        #capa-zoom-input::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 16px; height: 16px; border-radius: 50%;
          background: #6f3cff; cursor: pointer;
        }
        #capa-editor-actions {
          display: flex; gap: 12px; margin-top: 16px;
        }
        .capa-editor-btn {
          padding: 10px 28px; border-radius: 8px;
          font-size: 14px; font-weight: 600; cursor: pointer;
          border: none; outline: none; font-family: inherit;
        }
        .capa-editor-btn.confirm { background: #6f3cff; color: #fff; }
        .capa-editor-btn.confirm:hover { background: #5a2ee0; }
        .capa-editor-btn.cancel { background: rgba(255,255,255,0.1); color: #fff; }
        .capa-editor-btn.cancel:hover { background: rgba(255,255,255,0.18); }
      </style>
      <div id="capa-editor-title">Posicionar capa</div>
      <div id="capa-editor-hint">
        Arraste para reposicionar &nbsp;·&nbsp; Slider ou pinça para zoom &nbsp;·&nbsp; ↺ ↻ para girar
      </div>
      <div id="capa-editor-viewport">
        <img id="capa-editor-img" draggable="false" alt="">
      </div>

      <div id="capa-editor-controls">

        <!-- Rotação -->
        <div class="capa-ctrl-group">
          <span>Girar</span>
          <button class="capa-icon-btn" id="capa-rot-left"  type="button" title="Girar 90° esquerda">↺</button>
          <button class="capa-icon-btn" id="capa-rot-right" type="button" title="Girar 90° direita">↻</button>
        </div>

        <!-- Zoom -->
        <div class="capa-ctrl-group">
          <button class="capa-icon-btn" id="capa-zoom-out" type="button">−</button>
          <input type="range" id="capa-zoom-input" min="0" max="200" value="100" step="1">
          <button class="capa-icon-btn" id="capa-zoom-in"  type="button">+</button>
        </div>

      </div>

      <div id="capa-editor-actions">
        <button class="capa-editor-btn cancel"  id="capa-editor-cancel"  type="button">Cancelar</button>
        <button class="capa-editor-btn confirm" id="capa-editor-confirm" type="button">Aplicar capa</button>
      </div>
    `;
    document.body.appendChild(overlay);

    viewportEl  = overlay.querySelector("#capa-editor-viewport");
    imgEl       = overlay.querySelector("#capa-editor-img");
    zoomInputEl = overlay.querySelector("#capa-zoom-input");

    const btnRotLeft  = overlay.querySelector("#capa-rot-left");
    const btnRotRight = overlay.querySelector("#capa-rot-right");
    const btnZoomIn   = overlay.querySelector("#capa-zoom-in");
    const btnZoomOut  = overlay.querySelector("#capa-zoom-out");
    const btnConfirm  = overlay.querySelector("#capa-editor-confirm");
    const btnCancel   = overlay.querySelector("#capa-editor-cancel");

    rotation = 0;
    imgX = 0; imgY = 0;

    const objectUrl = URL.createObjectURL(file);
    imgEl.src = objectUrl;

    imgEl.onload = () => {
      imgNaturalW = imgEl.naturalWidth;
      imgNaturalH = imgEl.naturalHeight;
      previewW = viewportEl.clientWidth;
      previewH = viewportEl.clientHeight;

      recalcScaleBounds();
      scale = coverScale;
      zoomInputEl.value = scaleToSlider(scale);
      applyTransform();
    };

    // ── Transform ──────────────────────────────────────────────
    function applyTransform() {
      const dispW = imgNaturalW * scale;
      const dispH = imgNaturalH * scale;

      // Visual (effective) dimensions after CSS rotation
      const { w: visW, h: visH } = effDims(dispW, dispH, rotation);

      // Clamp pan: covers → no gap; fits-inside → stays within viewport
      const maxX = Math.abs(visW - previewW) / 2;
      const maxY = Math.abs(visH - previewH) / 2;
      imgX = Math.max(-maxX, Math.min(maxX, imgX));
      imgY = Math.max(-maxY, Math.min(maxY, imgY));

      // Element center stays at (previewW/2 + imgX, previewH/2 + imgY)
      const left = (previewW - dispW) / 2 + imgX;
      const top  = (previewH - dispH) / 2 + imgY;

      imgEl.style.width     = dispW + "px";
      imgEl.style.height    = dispH + "px";
      imgEl.style.left      = left  + "px";
      imgEl.style.top       = top   + "px";
      imgEl.style.transform = `rotate(${rotation}deg)`;
    }

    function setScale(newScale) {
      scale = Math.max(absMin, Math.min(absMax, newScale));
      zoomInputEl.value = scaleToSlider(scale);
      applyTransform();
    }

    function doRotate(dir) { // dir: +1 CW, -1 CCW
      rotation = ((rotation + dir * 90) + 360) % 360;
      imgX = 0; imgY = 0;
      recalcScaleBounds();
      // Keep scale within new bounds; reset to cover if too small
      scale = Math.max(absMin, Math.min(absMax, scale));
      if (scale < coverScale) scale = coverScale;
      zoomInputEl.value = scaleToSlider(scale);
      applyTransform();
    }

    // ── Mouse drag ─────────────────────────────────────────────
    viewportEl.addEventListener("mousedown", (e) => {
      isDragging = true;
      lastMouseX = e.clientX; lastMouseY = e.clientY;
      viewportEl.classList.add("dragging");
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      imgX += e.clientX - lastMouseX;
      imgY += e.clientY - lastMouseY;
      lastMouseX = e.clientX; lastMouseY = e.clientY;
      applyTransform();
    });
    window.addEventListener("mouseup", () => {
      isDragging = false;
      viewportEl.classList.remove("dragging");
    });

    // ── Touch drag + pinch ─────────────────────────────────────
    let lastTouches = null;
    viewportEl.addEventListener("touchstart", (e) => {
      e.preventDefault();
      lastTouches = e.touches;
    }, { passive: false });

    viewportEl.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const touches = e.touches;
      if (touches.length === 1 && lastTouches && lastTouches.length === 1) {
        imgX += touches[0].clientX - lastTouches[0].clientX;
        imgY += touches[0].clientY - lastTouches[0].clientY;
        applyTransform();
      } else if (touches.length === 2 && lastTouches && lastTouches.length >= 1) {
        const prevDist = lastTouches.length === 2
          ? Math.hypot(lastTouches[0].clientX - lastTouches[1].clientX, lastTouches[0].clientY - lastTouches[1].clientY)
          : 0;
        const newDist = Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
        if (prevDist > 0) setScale(scale * (newDist / prevDist));
      }
      lastTouches = touches;
    }, { passive: false });

    // ── Scroll zoom ────────────────────────────────────────────
    viewportEl.addEventListener("wheel", (e) => {
      e.preventDefault();
      setScale(scale * (e.deltaY > 0 ? 0.92 : 1.08));
    }, { passive: false });

    // ── Slider zoom ────────────────────────────────────────────
    zoomInputEl.addEventListener("input", () => {
      scale = Math.max(absMin, Math.min(absMax, sliderToScale(Number(zoomInputEl.value))));
      applyTransform();
    });

    btnZoomIn.addEventListener("click",   () => setScale(scale * 1.15));
    btnZoomOut.addEventListener("click",  () => setScale(scale / 1.15));
    btnRotLeft.addEventListener("click",  () => doRotate(-1));
    btnRotRight.addEventListener("click", () => doRotate(+1));

    // ── Cancel ─────────────────────────────────────────────────
    btnCancel.addEventListener("click", () => {
      URL.revokeObjectURL(objectUrl);
      overlay.remove();
      _resolve(null);
    });

    // ── Confirm: render to canvas ───────────────────────────────
    btnConfirm.addEventListener("click", () => {
      previewW = viewportEl.clientWidth;
      previewH = viewportEl.clientHeight;

      const dispW = imgNaturalW * scale;
      const dispH = imgNaturalH * scale;
      const { w: visW, h: visH } = effDims(dispW, dispH, rotation);
      const maxX = Math.abs(visW - previewW) / 2;
      const maxY = Math.abs(visH - previewH) / 2;
      const clX  = Math.max(-maxX, Math.min(maxX, imgX));
      const clY  = Math.max(-maxY, Math.min(maxY, imgY));

      const canvas = document.createElement("canvas");
      canvas.width  = OUTPUT_W;
      canvas.height = OUTPUT_H;
      const ctx = canvas.getContext("2d");

      // Black background for any empty areas
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, OUTPUT_W, OUTPUT_H);

      const ratio = OUTPUT_W / previewW; // same ratio for both axes (3:1)

      // Move to output center, apply rotation, draw image
      ctx.save();
      ctx.translate(OUTPUT_W / 2, OUTPUT_H / 2);
      ctx.rotate(rotation * Math.PI / 180);
      // Image center in viewport relative to viewport center: (clX, clY)
      // Draw image at that offset in the rotated coordinate system
      ctx.drawImage(
        imgEl,
        0, 0, imgNaturalW, imgNaturalH,
        clX * ratio - (dispW * ratio) / 2,
        clY * ratio - (dispH * ratio) / 2,
        dispW * ratio,
        dispH * ratio
      );
      ctx.restore();

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);
        overlay.remove();
        _resolve(blob);
      }, "image/jpeg", 0.92);
    });
  }

  window.openCapaEditor = openCapaEditor;
})();
