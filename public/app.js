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
    model: 'gemini-3.1-flash-image-preview',
    resultImage: null,
    sliderPos: 0.5,
    // Polygon-based areas: each zone is an array of {x, y} points (normalized 0-1)
    zones: [],          // Array of completed polygons: [ [{x,y}, ...], ... ]
    currentPoints: [],  // Points of polygon being drawn
    naturalWidth: 0,
    naturalHeight: 0,
  };

  // --- DOM ---
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // --- Welcome screen ---
  const welcomeScreen = $('#welcome-screen');
  const wizardContainer = $('#wizard-container');
  const btnStart = $('#btn-start');
  const btnStart2 = $('#btn-start-2');

  function startWizard() {
    welcomeScreen.classList.add('hidden');
    wizardContainer.classList.remove('hidden');
    window.scrollTo({ top: 0 });
  }

  if (btnStart) btnStart.addEventListener('click', startWizard);
  if (btnStart2) btnStart2.addEventListener('click', startWizard);

  const uploadArea     = $('#upload-area');
  const fileInput      = $('#file-input');
  const uploadPlaceholder = $('#upload-placeholder');
  const previewImage   = $('#preview-image');
  const btnChange      = $('#btn-change');
  const panelGrid      = $('#panel-grid');
  const btnGenerate    = $('#btn-generate');
  const extraInstructions = $('#extra-instructions');
  const loadingOverlay = $('#loading-overlay');
  const loadingText    = $('#loading-phrase');
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
  // Wizard step click navigation (only backward to completed steps)
  // ============================================================
  $$('.wizard-step').forEach(ws => {
    ws.style.cursor = 'pointer';
    ws.addEventListener('click', () => {
      const targetStep = parseInt(ws.dataset.step);
      // Only allow going back to completed steps (not forward)
      if (targetStep < state.currentStep) {
        goToStep(targetStep);
      }
    });
  });

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
    state.zones = [];
    state.currentPoints = [];
    initDrawCanvas();
    goToStep(2);
  });

  // ============================================================
  // Step 2: Polygon area selector (connect-the-dots)
  // ============================================================
  const POINT_RADIUS = 10;
  const CLOSE_THRESHOLD = 20; // px distance to close polygon

  function initDrawCanvas() {
    const img = new Image();
    img.onload = () => {
      const wrapperWidth = canvasWrapper.clientWidth;
      const maxH = window.innerHeight * 0.55;
      const ratio = img.naturalHeight / img.naturalWidth;
      let canvasW = wrapperWidth;
      let canvasH = Math.round(wrapperWidth * ratio);

      if (canvasH > maxH) {
        canvasH = Math.round(maxH);
        canvasW = Math.round(canvasH / ratio);
      }

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

      // Draw completed zones
      state.zones.forEach((poly, i) => drawPolygon(ctx, poly, i, true));

      // Draw current in-progress polygon
      if (state.currentPoints.length > 0) {
        drawPolygon(ctx, state.currentPoints, state.zones.length, false);
      }

      updateAreaButtons();
    };
    img.src = state.originalImage;
  }

  function drawPolygon(ctx, points, zoneIndex, closed) {
    if (points.length === 0) return;
    const c = getZoneColor(zoneIndex);
    const W = drawCanvas.width;
    const H = drawCanvas.height;

    // Draw filled polygon
    ctx.beginPath();
    ctx.moveTo(points[0].x * W, points[0].y * H);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x * W, points[i].y * H);
    }
    if (closed) ctx.closePath();
    ctx.fillStyle = c.fill;
    ctx.fill();

    // Draw polygon outline
    ctx.beginPath();
    ctx.moveTo(points[0].x * W, points[0].y * H);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x * W, points[i].y * H);
    }
    if (closed) ctx.closePath();
    ctx.strokeStyle = c.stroke;
    ctx.lineWidth = 2;
    ctx.setLineDash(closed ? [] : [6, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw points (dots)
    points.forEach((pt, i) => {
      const px = pt.x * W;
      const py = pt.y * H;

      ctx.beginPath();
      ctx.arc(px, py, POINT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = (i === 0 && !closed && points.length >= 3) ? '#fff' : c.stroke;
      ctx.fill();
      ctx.strokeStyle = c.stroke;
      ctx.lineWidth = 2;
      ctx.stroke();

      // First point: show "close" indicator when enough points
      if (i === 0 && !closed && points.length >= 3) {
        ctx.beginPath();
        ctx.arc(px, py, POINT_RADIUS + 4, 0, Math.PI * 2);
        ctx.strokeStyle = c.stroke;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    // Zone label for completed zones
    if (closed && points.length >= 3) {
      const cx = points.reduce((s, p) => s + p.x, 0) / points.length * W;
      const cy = points.reduce((s, p) => s + p.y, 0) / points.length * H;
      const label = ZONE_NAMES[zoneIndex] || `Zona ${zoneIndex + 1}`;
      ctx.font = 'bold 13px Inter, system-ui, sans-serif';
      const tw = ctx.measureText(label).width;
      const lx = cx - (tw + 14) / 2;
      const ly = cy - 11;

      ctx.fillStyle = c.stroke;
      ctx.beginPath();
      ctx.roundRect(lx, ly, tw + 14, 22, 6);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(label, lx + 7, ly + 15);
    }
  }

  const drawHint = $('#draw-hint');
  const areaCount = $('#area-count');
  const zoneLabelsContainer = $('#zone-labels');

  const ZONE_COLORS = [
    { fill: 'rgba(37, 99, 235, 0.25)', stroke: '#2563eb', bg: '#eff6ff', text: '#2563eb' },
    { fill: 'rgba(168, 85, 247, 0.25)', stroke: '#a855f7', bg: '#faf5ff', text: '#a855f7' },
    { fill: 'rgba(234, 179, 8, 0.25)', stroke: '#ca8a04', bg: '#fefce8', text: '#ca8a04' },
    { fill: 'rgba(16, 185, 129, 0.25)', stroke: '#059669', bg: '#ecfdf5', text: '#059669' },
    { fill: 'rgba(239, 68, 68, 0.25)', stroke: '#ef4444', bg: '#fef2f2', text: '#ef4444' },
  ];

  const ZONE_NAMES = ['Zona 1', 'Zona 2', 'Zona 3', 'Zona 4', 'Zona 5'];

  function getZoneColor(i) {
    return ZONE_COLORS[i % ZONE_COLORS.length];
  }

  function updateZoneLabels() {
    if (!zoneLabelsContainer) return;
    const total = state.zones.length;
    if (total === 0 && state.currentPoints.length === 0) {
      zoneLabelsContainer.classList.add('hidden');
      zoneLabelsContainer.innerHTML = '';
      return;
    }
    zoneLabelsContainer.classList.remove('hidden');
    const allZones = [...state.zones.map((_, i) => i)];
    if (state.currentPoints.length > 0) allZones.push(state.zones.length);

    zoneLabelsContainer.innerHTML = allZones.map((i) => {
      const c = getZoneColor(i);
      const isCurrent = i === state.zones.length && state.currentPoints.length > 0;
      return `<span class="zone-label" style="background:${c.bg};border-color:${c.stroke};color:${c.text}">
        <span class="zone-color-dot" style="background:${c.stroke}"></span>
        ${ZONE_NAMES[i] || 'Zona ' + (i + 1)}${isCurrent ? ' (dibujando...)' : ''}
      </span>`;
    }).join('');
  }

  function updateAreaButtons() {
    const hasZones = state.zones.length > 0;
    const hasCurrentPoints = state.currentPoints.length > 0;
    btnUndoArea.disabled = !hasZones && !hasCurrentPoints;
    btnClearAreas.disabled = !hasZones && !hasCurrentPoints;
    btnConfirmArea.disabled = !hasZones;

    // Show/hide hint
    if (drawHint) drawHint.classList.toggle('hidden', hasZones || hasCurrentPoints);

    // Update area count badge
    if (areaCount) {
      if (hasZones || hasCurrentPoints) {
        areaCount.classList.remove('hidden');
        const completed = state.zones.length;
        const drawing = hasCurrentPoints ? 1 : 0;
        if (completed === 0 && drawing) {
          areaCount.textContent = 'Dibujando zona...';
        } else {
          areaCount.textContent = completed === 1
            ? '1 zona marcada'
            : `${completed} zonas marcadas`;
        }
      } else {
        areaCount.classList.add('hidden');
      }
    }

    updateZoneLabels();
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

  function distPixels(p1, p2) {
    const dx = (p1.x - p2.x) * drawCanvas.width;
    const dy = (p1.y - p2.y) * drawCanvas.height;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Click/tap to add a point
  drawCanvas.addEventListener('click', onCanvasClick);
  drawCanvas.addEventListener('touchend', onCanvasTap);

  let lastTapTime = 0;

  function onCanvasTap(e) {
    e.preventDefault();
    // Prevent double-firing with click
    lastTapTime = Date.now();
    const touch = e.changedTouches[0];
    const rect = drawCanvas.getBoundingClientRect();
    const pos = {
      x: Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (touch.clientY - rect.top) / rect.height)),
    };
    addPoint(pos);
  }

  function onCanvasClick(e) {
    // Skip if a touch just happened (prevent double-fire)
    if (Date.now() - lastTapTime < 300) return;
    const rect = drawCanvas.getBoundingClientRect();
    const pos = {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
    addPoint(pos);
  }

  function addPoint(pos) {
    // If we have 3+ points and click near the first point, close the polygon
    if (state.currentPoints.length >= 3) {
      const first = state.currentPoints[0];
      if (distPixels(pos, first) < CLOSE_THRESHOLD) {
        // Close polygon — save zone
        state.zones.push([...state.currentPoints]);
        state.currentPoints = [];
        redrawCanvas();
        return;
      }
    }

    // Add point
    state.currentPoints.push(pos);
    redrawCanvas();
  }

  btnUndoArea.addEventListener('click', () => {
    if (state.currentPoints.length > 0) {
      state.currentPoints.pop();
    } else if (state.zones.length > 0) {
      // Reopen last zone for editing
      state.currentPoints = state.zones.pop();
    }
    redrawCanvas();
  });

  btnClearAreas.addEventListener('click', () => {
    state.zones = [];
    state.currentPoints = [];
    redrawCanvas();
  });

  btnSkipArea.addEventListener('click', () => {
    state.zones = [];
    state.currentPoints = [];
    state.selectedWall = 'all';
    goToStep(3);
  });

  btnConfirmArea.addEventListener('click', () => {
    // Auto-close current polygon if it has 3+ points
    if (state.currentPoints.length >= 3) {
      state.zones.push([...state.currentPoints]);
      state.currentPoints = [];
    }
    state.selectedWall = state.zones.length > 0 ? 'custom' : 'all';
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
      const dpr = window.devicePixelRatio || 1;
      const size = Math.round(160 * dpr);
      canvas.width = size;
      canvas.height = size;
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
    if (state.selectedWall === 'custom' && state.zones.length > 0) {
      const zones = state.zones.map((poly, i) => {
        const coords = poly.map(p => `(${Math.round(p.x * 100)}%, ${Math.round(p.y * 100)}%)`).join(' → ');
        return `Zone ${i+1}: the polygon area defined by these points: ${coords}`;
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
    'Eternit te acompa\u00f1a a hacer realidad el espacio que siempre so\u00f1aste...',
    'Analizando tu espacio con inteligencia artificial...',
    'Identificando las paredes de tu hogar...',
    'Aplicando el panel perfecto para tu dise\u00f1o...',
    'Ajustando perspectiva e iluminaci\u00f3n...',
    'Transformando tu espacio en algo extraordinario...',
    'Casi listo... tu sue\u00f1o est\u00e1 tomando forma...',
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
