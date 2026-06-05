// Firma digital simple sobre <canvas>, sin dependencias externas.
(function () {
  const canvas = document.getElementById("firma");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let dibujando = false, vacio = true;

  // Ajustar resolución al tamaño real en pantalla (nítido en mobile)
  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
  }
  resize();

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }
  function start(e) { dibujando = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); }
  function move(e) { if (!dibujando) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); vacio = false; e.preventDefault(); }
  function end() { dibujando = false; }

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  canvas.addEventListener("mouseup", end);
  canvas.addEventListener("touchstart", start);
  canvas.addEventListener("touchmove", move);
  canvas.addEventListener("touchend", end);

  window.limpiarFirma = function () {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    vacio = true;
  };

  window.prepararFirma = function () {
    if (vacio) { alert("Necesitamos tu firma antes de continuar."); return false; }
    document.getElementById("firma_png").value = canvas.toDataURL("image/png");
    return true;
  };
})();
