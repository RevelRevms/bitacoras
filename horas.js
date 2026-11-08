// Cálculo de horas trabajadas. Lo comparten el panel (admin.js) y el informe (informe.js).
// Reglas:
//  - Una jornada cuenta solo si está enviada a tiempo: tiene entrada y salida reales.
//  - Las de cierre tardío NO cuentan: su «salida» es la hora en que se envió el formulario, no el fin real de la práctica.
//  - Las sin cerrar o no concluidas no tienen hora de salida y tampoco cuentan.
//  - Cada jornada larga incluye una hora de almuerzo que NO se cuenta como laborada: se descuentan ALMUERZO_MIN
//    cuando la permanencia (salida - entrada) pasa de ALMUERZO_DESDE_MIN (las jornadas cortas, sin almuerzo, no se tocan).
//  - Horas extra = lo que pasa de JORNADA_MIN en cada día (los días cortos no restan).
(function (g) {
  const JORNADA_MIN = 8 * 60, ALMUERZO_MIN = 60, ALMUERZO_DESDE_MIN = 5 * 60;
  const stay = x => Math.max(0, Math.round((new Date(x.exit_at) - new Date(x.entry_at)) / 60000));
  const lunch = m => m > ALMUERZO_DESDE_MIN ? ALMUERZO_MIN : 0;
  const minutes = x => { if (!(x && x.status === 'submitted' && !x.closed_late && x.exit_at && x.entry_at)) return null;
    const m = stay(x); return m - lunch(m); };
  const fHM = m => { m = Math.round(m || 0); const hh = Math.floor(m / 60), mm = m % 60;
    return hh && mm ? `${hh} h ${mm} min` : hh ? `${hh} h` : `${mm} min`; };
  // logs: bitácoras de UN estudiante
  function summarize(logs) {
    let total = 0, over = 0, days = 0, full = 0, short = 0, noCount = 0, max = 0;
    for (const x of logs) {
      const m = minutes(x);
      if (m === null) { if (x.status !== 'in_progress' || x.closed_late) noCount++; continue; }
      days++; total += m; if (m > max) max = m;
      if (m > JORNADA_MIN) over += m - JORNADA_MIN;
      if (m >= JORNADA_MIN) full++; else short++;
    }
    return { total, over, days, full, short, noCount, max, avg: days ? Math.round(total / days) : 0 };
  }
  g.Horas = { JORNADA_MIN, ALMUERZO_MIN, stay, lunch, minutes, fHM, summarize };
})(window);
