// ============================================================
// Simulador de Paneles — IA con Gemini API (server-side proxy)
// ============================================================

(function () {
  'use strict';

  // --- State ---
  const state = {
    originalImage: null,
    originalMime: 'image/jpeg',
    selectedPanelId: null,
    selectedWall: 'all',
    model: 'gemini-2.5-flash-image',
    resultImage: null,
    sliderPos: 0.5,
    drawRects: [],       // [{x, y, w, h} in normalized 0-1 coords]
    isDrawing: false,
    drawStart: null,
    naturalWidth: 0,
    naturalHeight: 0,
  };

  // --- DOM ---
  const $ = (s) => document.querySelector(s);
  const uploadArea     = $('#upload-area');
  const fileInput      = $('#file-input');
  const uploadPlaceholder = $('#upload-placeholder');
  const previewImage   = $('#preview-image');
  const btnChange      = $('#btn-change');
  const panelGrid      = $('#panel-grid');
  const btnGenerate    = $('#btn-generate');
  const extraInstructions = $('#extra-instructions');
  const loadingOverlay = $('#loading-overlay');
  const loadingText    = $('.loading-text');
  const toast          = $('#toast');
  const apiStatusBanner = $('#api-status-banner');

  const stepUpload     = $('#step-upload');
  const stepSelectArea = $('#step-select-area');
  const stepCatalog    = $('#step-catalog');
  const stepResult     = $('#step-result');

  const drawCanvas     = $('#draw-canvas');
  const canvasWrapper  = $('#canvas-wrapper');
  const btnUndoArea    = $('#btn-undo-area');
  const btnClearAreas  = $('#btn-clear-areas');
  const btnSkipArea    = $('#btn-skip-area');
  const btnConfirmArea = $('#btn-confirm-area');

  // ============================================================
  // Check API status on load
  // ============================================================
  async function checkAPIStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (!data.apiConfigured && apiStatusBanner) {
        apiStatusBanner.classList.remove('hidden');
      }
    } catch (e) {
      console.warn('Could not check API status');
    }
  }
  checkAPIStatus();

  // ============================================================
  // Step navigation
  // ============================================================
  function showStep(target) {
    [stepUpload, stepSelectArea, stepCatalog, stepResult].forEach(s => s.classList.add('hidden'));
    target.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ============================================================
  // 1. File Upload
  // ============================================================
  uploadArea.addEventListener('click', (e) => {
    if (e.target.closest('.btn-change')) return;
    fileInput.click();
  });

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleFile(fileInput.files[0]);
  });

  function handleFile(file) {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) {
      showError('La imagen es demasiado grande. Maximo 10MB.');
      return;
    }

    state.originalMime = file.type;

    const reader = new FileReader();
    reader.onload = (e) => {
      state.originalImage = e.target.result;
      previewImage.src = state.originalImage;
      previewImage.classList.remove('hidden');
      uploadPlaceholder.style.display = 'none';
      btnChange.classList.remove('hidden');
      uploadArea.style.padding = '1.5rem';
      uploadArea.style.borderStyle = 'solid';

      // Load image to get natural dimensions, then go to area selection
      const img = new Image();
      img.onload = () => {
        state.naturalWidth = img.naturalWidth;
        state.naturalHeight = img.naturalHeight;
        state.drawRects = [];
        initDrawCanvas();
        showStep(stepSelectArea);
        stepUpload.classList.remove('hidden');
      };
      img.src = state.originalImage;
    };
    reader.readAsDataURL(file);
  }

  btnChange.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.value = '';
    fileInput.click();
  });

  // ============================================================
  // 1.5. Draw area selector (canvas overlay)
  // ============================================================
  function initDrawCanvas() {
    const img = new Image();
    img.onload = () => {
      // Fit canvas to wrapper width
      const wrapperWidth = canvasWrapper.clientWidth;
      const ratio = img.naturalHeight / img.naturalWidth;
      const canvasW = wrapperWidth;
      const canvasH = Math.round(wrapperWidth * ratio);

      drawCanvas.width = canvasW;
      drawCanvas.height = canvasH;
      drawCanvas.style.width = canvasW + 'px';
      drawCanvas.style.height = canvasH + 'px';

      redrawCanvas();
    };
    img.src = state.originalImage;
  }

  function redrawCanvas() {
    const ctx = drawCanvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      ctx.drawImage(img, 0, 0, drawCanvas.width, drawCanvas.height);

      // Draw existing rectangles
      state.drawRects.forEach((r, i) => {
        const x = r.x * drawCanvas.width;
        const y = r.y * drawCanvas.height;
        const w = r.w * drawCanvas.width;
        const h = r.h * drawCanvas.height;

        ctx.fillStyle = 'rgba(37, 99, 235, 0.25)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);

        // Label
        ctx.fillStyle = '#2563eb';
        ctx.font = 'bold 14px Inter, system-ui, sans-serif';
        ctx.fillText(`Zona ${i + 1}`, x + 6, y + 18);
      });

      updateAreaButtons();
    };
    img.src = state.originalImage;
  }

  function updateAreaButtons() {
    const hasRects = state.drawRects.length > 0;
    btnUndoArea.disabled = !hasRects;
    btnClearAreas.disabled = !hasRects;
  }

  // Mouse/touch drawing on canvas
  function getCanvasPos(e) {
    const rect = drawCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  }

  drawCanvas.addEventListener('mousedown', startDraw);
  drawCanvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDraw(e); }, { passive: false });

  function startDraw(e) {
    state.isDrawing = true;
    state.drawStart = getCanvasPos(e);
  }

  window.addEventListener('mousemove', moveDraw);
  window.addEventListener('touchmove', (e) => { if (state.isDrawing) moveDraw(e); }, { passive: true });

  function moveDraw(e) {
    if (!state.isDrawing || !state.drawStart) return;
    const pos = getCanvasPos(e);

    // Redraw with temp rect
    redrawCanvasSync();
    const ctx = drawCanvas.getContext('2d');
    const x = state.drawStart.x * drawCanvas.width;
    const y = state.drawStart.y * drawCanvas.height;
    const w = (pos.x - state.drawStart.x) * drawCanvas.width;
    const h = (pos.y - state.drawStart.y) * drawCanvas.height;

    ctx.fillStyle = 'rgba(37, 99, 235, 0.2)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }

  function redrawCanvasSync() {
    const ctx = drawCanvas.getContext('2d');
    const img = previewImage;
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    ctx.drawImage(img, 0, 0, drawCanvas.width, drawCanvas.height);

    state.drawRects.forEach((r, i) => {
      const x = r.x * drawCanvas.width;
      const y = r.y * drawCanvas.height;
      const w = r.w * drawCanvas.width;
      const h = r.h * drawCanvas.height;

      ctx.fillStyle = 'rgba(37, 99, 235, 0.25)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      ctx.fillStyle = '#2563eb';
      ctx.font = 'bold 14px Inter, system-ui, sans-serif';
      ctx.fillText(`Zona ${i + 1}`, x + 6, y + 18);
    });
  }

  window.addEventListener('mouseup', endDraw);
  window.addEventListener('touchend', endDraw);

  function endDraw(e) {
    if (!state.isDrawing || !state.drawStart) {
      state.isDrawing = false;
      return;
    }
    state.isDrawing = false;

    // Get final pos
    let pos;
    if (e.changedTouches) {
      const rect = drawCanvas.getBoundingClientRect();
      pos = {
        x: (e.changedTouches[0].clientX - rect.left) / rect.width,
        y: (e.changedTouches[0].clientY - rect.top) / rect.height,
      };
    } else {
      const rect = drawCanvas.getBoundingClientRect();
      pos = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    }

    const x = Math.min(state.drawStart.x, pos.x);
    const y = Math.min(state.drawStart.y, pos.y);
    const w = Math.abs(pos.x - state.drawStart.x);
    const h = Math.abs(pos.y - state.drawStart.y);

    // Only add if rect is big enough (at least 3% of image)
    if (w > 0.03 && h > 0.03) {
      state.drawRects.push({ x, y, w, h });
    }

    state.drawStart = null;
    redrawCanvas();
  }

  // Undo / clear
  btnUndoArea.addEventListener('click', () => {
    state.drawRects.pop();
    redrawCanvas();
  });

  btnClearAreas.addEventListener('click', () => {
    state.drawRects = [];
    redrawCanvas();
  });

  // Skip = apply to all walls
  btnSkipArea.addEventListener('click', () => {
    state.drawRects = [];
    state.selectedWall = 'all';
    showStep(stepCatalog);
    stepUpload.classList.remove('hidden');
  });

  // Confirm area
  btnConfirmArea.addEventListener('click', () => {
    if (state.drawRects.length === 0) {
      state.selectedWall = 'all';
    } else {
      state.selectedWall = 'custom';
    }
    showStep(stepCatalog);
    stepUpload.classList.remove('hidden');
  });

  // ============================================================
  // 2. Panel Catalog
  // ============================================================
  function buildCatalog() {
    panelGrid.innerHTML = '';
    PANEL_CATALOG.forEach((panel) => {
      const card = document.createElement('div');
      card.className = 'tile-card';
      card.dataset.id = panel.id;

      // Generate canvas swatch
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 120;
      canvas.className = 'tile-swatch';
      panel.generateVisual(canvas);
      card.appendChild(canvas);

      const label = document.createElement('div');
      label.className = 'tile-label';
      label.textContent = panel.name;
      card.appendChild(label);

      card.addEventListener('click', () => selectPanel(panel.id));
      panelGrid.appendChild(card);
    });
  }

  function selectPanel(id) {
    state.selectedPanelId = id;
    document.querySelectorAll('.tile-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.id === id);
    });
    btnGenerate.disabled = false;
  }

  buildCatalog();

  // ============================================================
  // 3. Model selector
  // ============================================================
  document.querySelectorAll('.model-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.model-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.model = btn.dataset.model;
    });
  });

  // ============================================================
  // 4. Generate via server proxy -> Gemini API
  // ============================================================
  btnGenerate.addEventListener('click', generatePreview);

  async function generatePreview() {
    if (!state.originalImage || !state.selectedPanelId) return;

    const panel = PANEL_CATALOG.find(p => p.id === state.selectedPanelId);
    if (!panel) return;

    // Build prompt
    let areaDescription;
    if (state.selectedWall === 'custom' && state.drawRects.length > 0) {
      const zones = state.drawRects.map((r, i) => {
        const left = Math.round(r.x * 100);
        const top = Math.round(r.y * 100);
        const right = Math.round((r.x + r.w) * 100);
        const bottom = Math.round((r.y + r.h) * 100);
        return `Zone ${i+1}: the rectangular area from approximately ${left}% to ${right}% horizontally, and ${top}% to ${bottom}% vertically`;
      });
      areaDescription = `ONLY the following specific wall areas (leave everything else unchanged): ${zones.join('; ')}`;
    } else {
      areaDescription = 'all visible walls';
    }

    let prompt = `Replace ${areaDescription} in this photo with ${panel.prompt}. ` +
      `The panels should have vertical slats/grooves running from floor to ceiling. ` +
      `Maintain the exact same perspective, lighting, shadows, floor, furniture, and all other elements. ` +
      `The new wall panels should look photorealistic and naturally integrated with the room's lighting. ` +
      `Do NOT change anything else in the image except the specified wall surface where panels should be applied.`;

    const extra = extraInstructions.value.trim();
    if (extra) {
      prompt += ` Additional instructions: ${extra}`;
    }

    const base64Data = state.originalImage.split(',')[1];

    showLoading(true);
    btnGenerate.disabled = true;

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          imageBase64: base64Data,
          mimeType: state.originalMime,
          model: state.model,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Error al generar la imagen');
      }

      if (!data.image) {
        throw new Error('No se recibio una imagen del servidor');
      }

      state.resultImage = data.image;

      // Show result
      $('#result-before').src = state.originalImage;
      $('#result-after').src = state.resultImage;

      showLoading(false);
      showStep(stepResult);
      initComparison();

    } catch (err) {
      console.error('Generation error:', err);
      showLoading(false);
      showError(err.message || 'Error al generar la imagen. Intenta de nuevo.');
    } finally {
      btnGenerate.disabled = !state.selectedPanelId;
    }
  }

  // ============================================================
  // 5. Comparison Slider
  // ============================================================
  let dragging = false;

  function initComparison() {
    state.sliderPos = 0.5;
    updateSlider();
  }

  function updateSlider() {
    const pct = state.sliderPos * 100;
    const afterImg = $('#result-after');
    const sliderLine = $('#slider-line');
    afterImg.style.clipPath = `inset(0 0 0 ${pct}%)`;
    sliderLine.style.left = pct + '%';
  }

  const compSlider = $('#comparison-slider');

  compSlider?.addEventListener('mousedown', (e) => {
    dragging = true;
    moveSlider(e);
  });
  compSlider?.addEventListener('touchstart', (e) => {
    dragging = true;
    moveSlider(e.touches[0]);
  }, { passive: true });

  window.addEventListener('mousemove', (e) => { if (dragging) moveSlider(e); });
  window.addEventListener('touchmove', (e) => { if (dragging) moveSlider(e.touches[0]); }, { passive: true });
  window.addEventListener('mouseup', () => dragging = false);
  window.addEventListener('touchend', () => dragging = false);

  function moveSlider(e) {
    const rect = compSlider.getBoundingClientRect();
    let pos = (e.clientX - rect.left) / rect.width;
    pos = Math.max(0.02, Math.min(0.98, pos));
    state.sliderPos = pos;
    updateSlider();
  }

  // ============================================================
  // 6. Actions
  // ============================================================
  $('#btn-download')?.addEventListener('click', () => {
    if (!state.resultImage) return;
    const a = document.createElement('a');
    a.download = `simulacion-panel-${state.selectedPanelId}.png`;
    a.href = state.resultImage;
    a.click();
  });

  $('#btn-retry')?.addEventListener('click', () => {
    showStep(stepCatalog);
    stepUpload.classList.remove('hidden');
  });

  // ============================================================
  // 7. Loading & Errors
  // ============================================================
  const loadingMessages = [
    'La IA esta analizando tu espacio...',
    'Identificando las paredes...',
    'Aplicando los paneles seleccionados...',
    'Ajustando perspectiva e iluminacion...',
    'Casi listo, dando los toques finales...',
  ];

  let loadingInterval;

  function showLoading(show) {
    if (show) {
      loadingOverlay.classList.remove('hidden');
      let msgIdx = 0;
      if (loadingText) loadingText.textContent = loadingMessages[0];
      loadingInterval = setInterval(() => {
        msgIdx = (msgIdx + 1) % loadingMessages.length;
        if (loadingText) loadingText.textContent = loadingMessages[msgIdx];
      }, 3500);
    } else {
      loadingOverlay.classList.add('hidden');
      clearInterval(loadingInterval);
    }
  }

  function showError(msg) {
    toast.textContent = '\u2297 ' + msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 6000);
  }

})();
