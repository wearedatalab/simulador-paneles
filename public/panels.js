/**
 * Panel Catalog – Wall Panel Simulator
 * Each panel has an id, name, color (for fallback), prompt description for AI,
 * and a visual generator that draws a preview on canvas.
 */
const PANEL_CATALOG = [
  {
    id: 'teca-natural',
    name: 'Teca Natural',
    color: '#b07a3a',
    prompt: 'wooden slatted wall panels in warm teak/natural wood tone with vertical grooves, similar to WPC or MDF decorative wall panels',
    generateVisual: (canvas) => {
      const ctx = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height;
      // Warm wood base
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#c4884a');
      grad.addColorStop(0.3, '#b07a3a');
      grad.addColorStop(0.7, '#a06e30');
      grad.addColorStop(1, '#b57e3e');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      // Vertical slats
      const slatWidth = w / 22;
      for (let i = 0; i < 22; i++) {
        const x = i * slatWidth;
        // Groove
        ctx.fillStyle = 'rgba(60, 30, 10, 0.6)';
        ctx.fillRect(x + slatWidth - 1.5, 0, 2, h);
        // Slat highlight
        ctx.fillStyle = 'rgba(255, 200, 130, 0.08)';
        ctx.fillRect(x + 2, 0, slatWidth * 0.3, h);
      }
      // Subtle wood grain
      ctx.strokeStyle = 'rgba(80, 40, 15, 0.06)';
      ctx.lineWidth = 0.5;
      for (let y = 0; y < h; y += 8) {
        ctx.beginPath();
        ctx.moveTo(0, y + Math.sin(y * 0.02) * 3);
        ctx.lineTo(w, y + Math.cos(y * 0.02) * 3);
        ctx.stroke();
      }
    }
  },
  {
    id: 'gris-ceniza',
    name: 'Gris Ceniza',
    color: '#7a7a70',
    prompt: 'gray ash-colored slatted wall panels with vertical grooves, modern gray WPC or MDF decorative wall panels',
    generateVisual: (canvas) => {
      const ctx = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#868678');
      grad.addColorStop(0.5, '#7a7a70');
      grad.addColorStop(1, '#6e6e64');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      const slatWidth = w / 22;
      for (let i = 0; i < 22; i++) {
        const x = i * slatWidth;
        ctx.fillStyle = 'rgba(40, 40, 35, 0.5)';
        ctx.fillRect(x + slatWidth - 1.5, 0, 2, h);
        ctx.fillStyle = 'rgba(180, 180, 170, 0.06)';
        ctx.fillRect(x + 2, 0, slatWidth * 0.3, h);
      }
    }
  },
  {
    id: 'chocolate',
    name: 'Chocolate',
    color: '#7a5234',
    prompt: 'dark chocolate brown slatted wall panels with vertical grooves, rich brown WPC or MDF decorative wall panels',
    generateVisual: (canvas) => {
      const ctx = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#8a5e3c');
      grad.addColorStop(0.5, '#7a5234');
      grad.addColorStop(1, '#6a4630');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      const slatWidth = w / 22;
      for (let i = 0; i < 22; i++) {
        const x = i * slatWidth;
        ctx.fillStyle = 'rgba(30, 15, 5, 0.55)';
        ctx.fillRect(x + slatWidth - 1.5, 0, 2, h);
        ctx.fillStyle = 'rgba(160, 110, 70, 0.06)';
        ctx.fillRect(x + 2, 0, slatWidth * 0.3, h);
      }
      ctx.strokeStyle = 'rgba(40, 20, 8, 0.05)';
      ctx.lineWidth = 0.5;
      for (let y = 0; y < h; y += 10) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y + Math.sin(y * 0.01) * 2);
        ctx.stroke();
      }
    }
  },
  {
    id: 'roble-medio',
    name: 'Roble Medio',
    color: '#8b6b3e',
    prompt: 'medium oak wood slatted wall panels with vertical grooves and visible wood grain, oak-toned WPC or MDF decorative wall panels',
    generateVisual: (canvas) => {
      const ctx = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#9a7a4e');
      grad.addColorStop(0.3, '#8b6b3e');
      grad.addColorStop(0.7, '#7d5f36');
      grad.addColorStop(1, '#8e6d42');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      const slatWidth = w / 22;
      for (let i = 0; i < 22; i++) {
        const x = i * slatWidth;
        ctx.fillStyle = 'rgba(50, 30, 10, 0.55)';
        ctx.fillRect(x + slatWidth - 1.5, 0, 2, h);
        ctx.fillStyle = 'rgba(200, 160, 100, 0.07)';
        ctx.fillRect(x + 2, 0, slatWidth * 0.3, h);
      }
      // Wood grain texture
      ctx.strokeStyle = 'rgba(60, 35, 12, 0.06)';
      ctx.lineWidth = 0.5;
      for (let y = 0; y < h; y += 6) {
        ctx.beginPath();
        ctx.moveTo(0, y + Math.sin(y * 0.03) * 4);
        ctx.lineTo(w, y + Math.cos(y * 0.03) * 4);
        ctx.stroke();
      }
    }
  }
];
