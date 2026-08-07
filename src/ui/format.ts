const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

function letterSuffix(tier: number): string {
  // Después de Dc: aa, ab, ac, ...
  const i = tier - SUFFIXES.length;
  const first = Math.floor(i / 26);
  const second = i % 26;
  return String.fromCharCode(97 + first) + String.fromCharCode(97 + second);
}

/** Siempre 3 dígitos significativos. Los números grandes son parte del placer. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const neg = n < 0;
  n = Math.abs(n);
  if (n < 1000) {
    const s = n < 10 && n % 1 !== 0 ? n.toFixed(1) : String(Math.floor(n));
    return neg ? `-${s}` : s;
  }
  const tier = Math.floor(Math.log10(n) / 3);
  const scaled = n / Math.pow(1000, tier);
  const suffix = tier < SUFFIXES.length ? SUFFIXES[tier] : letterSuffix(tier);
  const s = scaled < 10 ? scaled.toFixed(2) : scaled < 100 ? scaled.toFixed(1) : scaled.toFixed(0);
  return `${neg ? '-' : ''}${s}${suffix}`;
}

export function fmtCash(n: number): string {
  return `$${fmt(n)}`;
}

export function fmtInt(n: number): string {
  return Math.floor(n).toLocaleString('es-AR');
}

export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtDuration(seconds: number): string {
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
