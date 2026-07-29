// Capa crop editor — drag to pan, scroll/pinch/slider to zoom in AND out
(function () {
  const OUTPUT_W = 1500;
  const OUTPUT_H = 500;

  let _resolve = null;
  let isDragging = false;
  let lastMouseX, lastMouseY;
  let imgX = 0, imgY = 0;
  let scale = 1;
  let coverScale = 1; // scale where image fills the frame
  let absMin = 0.1;   // minimum allowed scale (fit * 0.5)
  let absMax = 4;     // maximum allowed scale (cover * 4)
  let imgNaturalW = 0, imgNaturalH = 0;
  let previewW = 0, previewH = 0;
  let imgEl = null;
  let viewportEl = null;
  let zoomInputEl = null;

  // Logarithmic slider mapping: slider 0–200, midpoint 100 = coverScale
  function scaleToSlider(s) {
    return Math.round(200 * Math.log(s / absMin) / Math.log(absMax / absMin));
  }
  function sliderToScale(v) {
    return absMin * Math.pow(absMax / absMin, v / 200);
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
          color: rgba(255,255,255,0.55); font-size: 13px;
          margin-bottom: 12px; text-align: center; line-height: 1.4;
        }
        #capa-editor-viewport {
          position: relative;
          width: 100%; max-width: 780px;
          aspect-ratio: 3 / 1;
          overflow: hidden;
          border-radius: 10px;
          border: 2px solid rgba(255,255,255,0.25);
          cursor: grab;
          touch-action: none;
          user-select: none;
          background: #1a1a1a;
        }
        #capa-editor-viewport.dragging { cursor: grabbing; }
        #capa-editor-img {
          position: absolute;
          transform-origin: top left;
          pointer-events: none;
          will-change: transform;
        }
        #capa-zoom-bar {
          display: flex; align-items: center; gap: 12px;
          margin-top: 14px;
        }
        #capa-zoom-bar button {
          background: none; border: none; color: rgba(255,255,255,0.7);
          font-size: 22px; cursor: pointer; line-height: 1;
          padding: 0 4px;
        }
        #capa-zoom-input {
          -webkit-appearance: none; appearance: none;
          height: 4px; background: rgba(255,255,255,0.3);
          border-radius: 2px; outline: none; width: 180px;
          cursor: pointer;
        }
        #capa-zoom-input::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 18px; height: 18px; border-radius: 50%;
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
        .capa-editor-btn.cancel { background: rgba(255,255,255,0.12); color: #fff; }
        .capa-editor-btn.cancel:hover { background: rgba(255,255,255,0.2); }
      </style>
      <div id="capa-editor-title">Posicionar capa</div>
      <div id="capa-editor-hint">Arraste para reposicionar &nbsp;·&nbsp; − + ou slider para aumentar/diminuir &nbsp;·&nbsp; Pinça no celular</div>
      <div id="capa-editor-viewport">
        <img id="capa-editor-img" draggable="false" alt="">
      </div>
      <div id="capa-zoom-bar">
        <button id="capa-zoom-out" type="button">−</button>
        <input type="range" id="capa-zoom-input" min="0" max="200" value="100" step="1">
        <button id="capa-zoom-in" type="button">+</button>
      </div>
      <div id="capa-editor-actions">
        <button class="capa-editor-btn cancel" id="capa-editor-cancel" type="button">Cancelar</button>
        <button class="capa-editor-btn confirm" id="capa-editor-confirm" type="button">Aplicar capa</button>
      </div>
    `;
    document.body.appendChild(overlay);

    viewportEl = overlay.querySelector("#capa-editor-viewport");
    imgEl = overlay.querySelector("#capa-editor-img");
    zoomInputEl = overlay.querySelector("#capa-zoom-input");
    const btnZoomIn = overlay.querySelector("#capa-zoom-in");
    const btnZoomOut = overlay.querySelector("#capa-zoom-out");
    const btnConfirm = overlay.querySelector("#capa-editor-confirm");
    const btnCancel = overlay.querySelector("#capa-editor-cancel");

    const objectUrl = URL.createObjectURL(file);
    imgEl.src = objectUrl;

    imgEl.onload = () => {
      imgNaturalW = imgEl.naturalWidth;
      imgNaturalH = imgEl.naturalHeight;
      previewW = viewportEl.clientWidth;
      previewH = viewportEl.clientHeight;

      const scaleW = previewW / imgNaturalW;
      const scaleH = previewH / imgNaturalH;
      coverScale = Math.max(scaleW, scaleH);
      const fitScale  = Math.min(scaleW, scaleH);

      absMin = fitScale * 0.5;   // zoom out to half of fit-in-box
      absMax = coverScale * 4;   // zoom in to 4× cover

      scale = coverScale;        // start filling the frame
      imgX = 0;
      imgY = 0;

      zoomInputEl.value = scaleToSlider(scale);
      applyTransform();
    };

    function applyTransform() {
      const dispW = imgNaturalW * scale;
      const dispH = imgNaturalH * scale;

      // When image covers: clamp so no gap appears at edges
      // When image fits inside: clamp so image stays within viewport
      const maxX = Math.abs(dispW - previewW) / 2;
      const maxY = Math.abs(dispH - previewH) / 2;
      imgX = Math.max(-maxX, Math.min(maxX, imgX));
      imgY = Math.max(-maxY, Math.min(maxY, imgY));

      const left = (previewW - dispW) / 2 + imgX;
      const top  = (previewH - dispH) / 2 + imgY;
      imgEl.style.width  = dispW + "px";
      imgEl.style.height = dispH + "px";
      imgEl.style.left   = left + "px";
      imgEl.style.top    = top  + "px";
    }

    function setScale(newScale) {
      scale = Math.max(absMin, Math.min(absMax, newScale));
      zoomInputEl.value = scaleToSlider(scale);
      applyTransform();
    }

    // Mouse drag
    viewportEl.addEventListener("mousedown", (e) => {
      isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      viewportEl.classList.add("dragging");
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      imgX += e.clientX - lastMouseX;
      imgY += e.clientY - lastMouseY;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      applyTransform();
    });
    window.addEventListener("mouseup", () => {
      isDragging = false;
      viewportEl.classList.remove("dragging");
    });

    // Touch drag + pinch
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

    // Scroll zoom
    viewportEl.addEventListener("wheel", (e) => {
      e.preventDefault();
      setScale(scale * (e.deltaY > 0 ? 0.92 : 1.08));
    }, { passive: false });

    // Slider zoom (logarithmic)
    zoomInputEl.addEventListener("input", () => {
      scale = Math.max(absMin, Math.min(absMax, sliderToScale(Number(zoomInputEl.value))));
      applyTransform();
    });

    btnZoomIn.addEventListener("click",  () => setScale(scale * 1.15));
    btnZoomOut.addEventListener("click", () => setScale(scale / 1.15));

    // Cancel
    btnCancel.addEventListener("click", () => {
      URL.revokeObjectURL(objectUrl);
      overlay.remove();
      _resolve(null);
    });

    // Confirm — draw to canvas with proper clipping and black fill
    btnConfirm.addEventListener("click", () => {
      previewW = viewportEl.clientWidth;
      previewH = viewportEl.clientHeight;

      const dispW = imgNaturalW * scale;
      const dispH = imgNaturalH * scale;
      const maxX = Math.abs(dispW - previewW) / 2;
      const maxY = Math.abs(dispH - previewH) / 2;
      const clX = Math.max(-maxX, Math.min(maxX, imgX));
      const clY = Math.max(-maxY, Math.min(maxY, imgY));
      const imgLeft = (previewW - dispW) / 2 + clX;
      const imgTop  = (previewH - dispH) / 2 + clY;

      // Intersection of viewport and image (handles zoom-out where image doesn't fill)
      const clipL = Math.max(0, imgLeft);
      const clipT = Math.max(0, imgTop);
      const clipR = Math.min(previewW, imgLeft + dispW);
      const clipB = Math.min(previewH, imgTop + dispH);

      const canvas = document.createElement("canvas");
      canvas.width  = OUTPUT_W;
      canvas.height = OUTPUT_H;
      const ctx = canvas.getContext("2d");

      // Black background for any empty areas (when zoomed out)
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, OUTPUT_W, OUTPUT_H);

      if (clipR > clipL && clipB > clipT) {
        const ratio = OUTPUT_W / previewW;
        // Source in original image pixels
        const sx = ((clipL - imgLeft) / dispW) * imgNaturalW;
        const sy = ((clipT - imgTop)  / dispH) * imgNaturalH;
        const sw = ((clipR - clipL)   / dispW) * imgNaturalW;
        const sh = ((clipB - clipT)   / dispH) * imgNaturalH;
        // Destination in canvas pixels
        const dx = clipL * ratio;
        const dy = clipT * ratio;
        const dw = (clipR - clipL) * ratio;
        const dh = (clipB - clipT) * ratio;
        ctx.drawImage(imgEl, sx, sy, sw, sh, dx, dy, dw, dh);
      }

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);
        overlay.remove();
        _resolve(blob);
      }, "image/jpeg", 0.92);
    });
  }

  window.openCapaEditor = openCapaEditor;
})();
