// Cálculo de horas trabajadas. Lo comparten el panel (admin.js) y el informe (informe.js).
// Reglas:
//  - Una jornada cuenta solo si está enviada a tiempo: tiene entrada y salida reales.
//  - Las de cierre tardío NO cuentan: su «salida» es la hora en que se envió el formulario, no el fin real de la práctica.
//  - Las sin cerrar o no concluidas no tienen hora de salida y tampoco cuentan.
//  - Horas extra = lo que pasa de JORNADA_MIN en cada día (los días cortos no restan).
(function (g) {
  const JORNADA_MIN = 8 * 60;
  const minutes = x => (x && x.status === 'submitted' && !x.closed_late && x.exit_at && x.entry_at)
    ? Math.max(0, Math.round((new Date(x.exit_at) - new Date(x.entry_at)) / 60000)) : null;
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
  g.Horas = { JORNADA_MIN, minutes, fHM, summarize };
})(window);
