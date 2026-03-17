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
    model: 'gemini-2.0-flash-exp-image-generation',
    resultImage: null,
    sliderPos: 0.5,
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

  const stepUpload  = $('#step-upload');
  const stepCatalog = $('#step-catalog');
  const stepResult  = $('#step-result');

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
    [stepUpload, stepCatalog, stepResult].forEach(s => s.classList.add('hidden'));
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
      showError('La imagen es demasiado grande. Máximo 10MB.');
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

      // Show catalog
      showStep(stepCatalog);
      stepUpload.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }

  btnChange.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.value = '';
    fileInput.click();
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
  // 4. Generate via server proxy → Gemini API
  // ============================================================
  btnGenerate.addEventListener('click', generatePreview);

  async function generatePreview() {
    if (!state.originalImage || !state.selectedPanelId) return;

    const panel = PANEL_CATALOG.find(p => p.id === state.selectedPanelId);
    if (!panel) return;

    // Build prompt for WALL PANELS
    let prompt = `Replace the wall surface in this photo with ${panel.prompt}. ` +
      `The panels should have vertical slats/grooves running from floor to ceiling. ` +
      `Maintain the exact same perspective, lighting, shadows, floor, furniture, and all other elements. ` +
      `The new wall panels should look photorealistic and naturally integrated with the room's lighting. ` +
      `Do NOT change anything else in the image except the wall surface where panels should be applied.`;

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
        throw new Error('No se recibió una imagen del servidor');
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
    'La IA está analizando tu espacio...',
    'Identificando las paredes...',
    'Aplicando los paneles seleccionados...',
    'Ajustando perspectiva e iluminación...',
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
