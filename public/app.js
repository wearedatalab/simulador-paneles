// ============================================================
// Simulador de Paneles — Mobile-first Wizard
// ============================================================

(function () {
  'use strict';

  // --- State ---
  const state = {
    currentStep: 1,
    originalImage: null,
    originalMime: 'image/jpeg',
    selectedPanelId: null,
    selectedWall: 'all',
    model: 'gemini-2.5-flash-image',
    resultImage: null,
    sliderPos: 0.5,
    drawRects: [],
    isDrawing: false,
    drawStart: null,
    naturalWidth: 0,
    naturalHeight: 0,
  };

  // --- DOM ---
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

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

  const steps = {
    1: $('#step-upload'),
    2: $('#step-select-area'),
    3: $('#step-catalog'),
    4: $('#step-result'),
  };

  const drawCanvas     = $('#draw-canvas');
  const canvasWrapper  = $('#canvas-wrapper');
  const btnUndoArea    = $('#btn-undo-area');
  const btnClearAreas  = $('#btn-clear-areas');
  const btnSkipArea    = $('#btn-skip-area');
  const btnConfirmArea = $('#btn-confirm-area');

  // ============================================================
  // Check API status
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
  // Wizard Navigation
  // ============================================================
  function goToStep(stepNum) {
    state.currentStep = stepNum;

    // Hide all steps
    Object.values(steps).forEach(s => s.classList.remove('active'));

    // Show target step
    steps[stepNum].classList.add('active');

    // Update wizard progress dots
    $$('.wizard-step').forEach(ws => {
      const wsNum = parseInt(ws.dataset.step);
      ws.classList.remove('active', 'completed');
      if (wsNum === stepNum) ws.classList.add('active');
      else if (wsNum < stepNum) ws.classList.add('completed');
    });

    // Update wizard lines
    const lines = $$('.wizard-line');
    lines.forEach((line, i) => {
      line.classList.toggle('completed', i + 1 < stepNum);
    });

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ============================================================
  // Step 1: File Upload
  // ============================================================
  uploadArea.addEventListener('click', (e) => {
    if (e.target.closest('.btn-outline')) return;
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
      uploadArea.classList.add('has-image');

      // Show action buttons
      $('#upload-actions').classList.remove('hidden');

      // Get natural dimensions
      const img = new Image();
      img.onload = () => {
        state.naturalWidth = img.naturalWidth;
        state.naturalHeight = img.naturalHeight;
      };
      img.src = state.originalImage;
    };
    reader.readAsDataURL(file);
  }

  // Change photo
  btnChange.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.value = '';
    fileInput.click();
  });

  // Next from step 1
  $('#btn-next-1').addEventListener('click', () => {
    if (!state.originalImage) return;
    state.drawRects = [];
    initDrawCanvas();
    goToStep(2);
  });

  // ============================================================
  // Step 2: Draw area selector
  // ============================================================
  function initDrawCanvas() {
    const img = new Image();
    img.onload = () => {
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

        ctx.fillStyle = 'rgba(37, 99, 235, 0.85)';
        ctx.font = 'bold 13px Inter, system-ui, sans-serif';
        ctx.fillText(`Zona ${i + 1}`, x + 5, y + 16);
      });

      updateAreaButtons();
    };
    img.src = state.originalImage;
  }

  function redrawCanvasSync() {
    const ctx = drawCanvas.getContext('2d');
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    ctx.drawImage(previewImage, 0, 0, drawCanvas.width, drawCanvas.height);

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
      ctx.fillStyle = 'rgba(37, 99, 235, 0.85)';
      ctx.font = 'bold 13px Inter, system-ui, sans-serif';
      ctx.fillText(`Zona ${i + 1}`, x + 5, y + 16);
    });
  }

  function updateAreaButtons() {
    const hasRects = state.drawRects.length > 0;
    btnUndoArea.disabled = !hasRects;
    btnClearAreas.disabled = !hasRects;
  }

  function getCanvasPos(e) {
    const rect = drawCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }

  drawCanvas.addEventListener('mousedown', startDraw);
  drawCanvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDraw(e); }, { passive: false });

  function startDraw(e) {
    state.isDrawing = true;
    state.drawStart = getCanvasPos(e);
  }

  window.addEventListener('mousemove', moveDraw);
  window.addEventListener('touchmove', (e) => { if (state.isDrawing) { e.preventDefault(); moveDraw(e); } }, { passive: false });

  function moveDraw(e) {
    if (!state.isDrawing || !state.drawStart) return;
    const pos = getCanvasPos(e);

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

  window.addEventListener('mouseup', endDraw);
  window.addEventListener('touchend', endDraw);

  function endDraw(e) {
    if (!state.isDrawing || !state.drawStart) {
      state.isDrawing = false;
      return;
    }
    state.isDrawing = false;

    let pos;
    if (e.changedTouches) {
      const rect = drawCanvas.getBoundingClientRect();
      pos = {
        x: Math.max(0, Math.min(1, (e.changedTouches[0].clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (e.changedTouches[0].clientY - rect.top) / rect.height)),
      };
    } else {
      const rect = drawCanvas.getBoundingClientRect();
      pos = {
        x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
      };
    }

    const x = Math.min(state.drawStart.x, pos.x);
    const y = Math.min(state.drawStart.y, pos.y);
    const w = Math.abs(pos.x - state.drawStart.x);
    const h = Math.abs(pos.y - state.drawStart.y);

    if (w > 0.03 && h > 0.03) {
      state.drawRects.push({ x, y, w, h });
    }

    state.drawStart = null;
    redrawCanvas();
  }

  btnUndoArea.addEventListener('click', () => {
    state.drawRects.pop();
    redrawCanvas();
  });

  btnClearAreas.addEventListener('click', () => {
    state.drawRects = [];
    redrawCanvas();
  });

  btnSkipArea.addEventListener('click', () => {
    state.drawRects = [];
    state.selectedWall = 'all';
    goToStep(3);
  });

  btnConfirmArea.addEventListener('click', () => {
    state.selectedWall = state.drawRects.length > 0 ? 'custom' : 'all';
    goToStep(3);
  });

  // Back from step 2
  $('#btn-back-2').addEventListener('click', () => goToStep(1));

  // ============================================================
  // Step 3: Panel Catalog
  // ============================================================
  function buildCatalog() {
    panelGrid.innerHTML = '';
    PANEL_CATALOG.forEach((panel) => {
      const card = document.createElement('div');
      card.className = 'tile-card';
      card.dataset.id = panel.id;

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
    $$('.tile-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.id === id);
    });
    btnGenerate.disabled = false;
  }

  buildCatalog();

  // Model selector
  $$('.model-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.model-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.model = btn.dataset.model;
    });
  });

  // Back from step 3
  $('#btn-back-3').addEventListener('click', () => goToStep(2));

  // ============================================================
  // Step 4: Generate
  // ============================================================
  btnGenerate.addEventListener('click', generatePreview);

  async function generatePreview() {
    if (!state.originalImage || !state.selectedPanelId) return;

    const panel = PANEL_CATALOG.find(p => p.id === state.selectedPanelId);
    if (!panel) return;

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

      $('#result-before').src = state.originalImage;
      $('#result-after').src = state.resultImage;

      showLoading(false);
      goToStep(4);
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
  // Comparison Slider
  // ============================================================
  let sliderDragging = false;

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
    sliderDragging = true;
    moveSlider(e);
  });
  compSlider?.addEventListener('touchstart', (e) => {
    sliderDragging = true;
    moveSlider(e.touches[0]);
  }, { passive: true });

  window.addEventListener('mousemove', (e) => { if (sliderDragging) moveSlider(e); });
  window.addEventListener('touchmove', (e) => { if (sliderDragging) moveSlider(e.touches[0]); }, { passive: true });
  window.addEventListener('mouseup', () => sliderDragging = false);
  window.addEventListener('touchend', () => sliderDragging = false);

  function moveSlider(e) {
    const rect = compSlider.getBoundingClientRect();
    let pos = (e.clientX - rect.left) / rect.width;
    pos = Math.max(0.02, Math.min(0.98, pos));
    state.sliderPos = pos;
    updateSlider();
  }

  // ============================================================
  // Actions
  // ============================================================
  $('#btn-download')?.addEventListener('click', () => {
    if (!state.resultImage) return;
    const a = document.createElement('a');
    a.download = `simulacion-panel-${state.selectedPanelId}.png`;
    a.href = state.resultImage;
    a.click();
  });

  $('#btn-retry')?.addEventListener('click', () => {
    goToStep(3);
  });

  // ============================================================
  // Loading & Errors
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
