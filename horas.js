// Cálculo de horas trabajadas. Lo comparten el panel (admin.js), la app del estudiante (app.js) y el informe (informe.js).
// Reglas:
//  - Una jornada cuenta solo si está enviada y sus horas son confiables: tiene entrada y salida reales (o declaradas y aprobadas).
//  - Cierre tardío (de un día anterior): cuenta solo con la hora de salida DECLARADA por el estudiante y aprobada (o aprobada sola, dentro del margen).
//  - Hora declarada pendiente de revisión o rechazada: la jornada no suma horas hasta que se resuelva.
//  - Entrada anticipada que NO es tiempo extra: se cuenta desde la hora de entrada del horario (queda guardada como hora considerada).
//  - Almuerzo: el que tenía el horario al iniciar la jornada (sched_lunch); sin horario se descuenta 1 hora (ALMUERZO_MIN).
//    Se descuenta cuando la permanencia pasa de ALMUERZO_DESDE_MIN (las jornadas cortas, sin almuerzo, no se tocan).
//  - Horas extra = lo que pasa de la jornada de cada día: 8 horas netas (de lunes a viernes) o 4 horas (sábado), antes o después del horario.
(function (g) {
  const JORNADA_MIN = 8 * 60, SABADO_MIN = 4 * 60, ALMUERZO_MIN = 60, ALMUERZO_DESDE_MIN = 5 * 60, TOL_MIN = 20;
  const jornada = date => new Date(date + 'T12:00:00Z').getUTCDay() === 6 ? SABADO_MIN : JORNADA_MIN;
  const ok = s => s === 'auto' || s === 'approved';
  // 'pending' | 'rejected' | '' : hay una hora declarada sin aprobar
  const review = x => { const st = [x?.entry_adj_status, x?.exit_adj_status]; return st.includes('pending') ? 'pending' : st.includes('rejected') ? 'rejected' : ''; };
  // horas consideradas de la jornada, o null si todavía no son confiables
  const times = x => {
    if (!(x && x.status === 'submitted' && x.exit_at && x.entry_at) || review(x)) return null;
    const adjX = x.exit_adj_at && ok(x.exit_adj_status), adjE = x.entry_adj_at && ok(x.entry_adj_status);
    if (x.closed_late && !adjX) return null;
    return { entry: adjE ? x.entry_adj_at : x.entry_at, exit: adjX ? x.exit_adj_at : x.exit_at };
  };
  const stay = x => { const t = times(x) || x; return Math.max(0, Math.round((new Date(t.exit_at ?? t.exit) - new Date(t.entry_at ?? t.entry)) / 60000)); };
  const lunch = (m, x) => m > ALMUERZO_DESDE_MIN ? (x && x.sched_lunch != null ? x.sched_lunch : ALMUERZO_MIN) : 0;
  const minutes = x => { if (!times(x)) return null; const m = stay(x); return m - lunch(m, x); };
  const fHM = m => { m = Math.round(m || 0); const hh = Math.floor(m / 60), mm = m % 60;
    return hh && mm ? `${hh} h ${mm} min` : hh ? `${hh} h` : `${mm} min`; };
  // logs: bitácoras de UN estudiante
  function summarize(logs) {
    let total = 0, over = 0, days = 0, full = 0, short = 0, noCount = 0, max = 0, pend = 0;
    for (const x of logs) {
      const m = minutes(x);
      if (review(x) === 'pending') pend++;
      if (m === null) { if (x.status !== 'in_progress' || x.closed_late) noCount++; continue; }
      const J = jornada(x.practice_date);
      days++; total += m; if (m > max) max = m;
      if (m > J) over += m - J;
      if (m >= J) full++; else short++;
    }
    return { total, over, days, full, short, noCount, max, pend, avg: days ? Math.round(total / days) : 0 };
  }
  g.Horas = { JORNADA_MIN, SABADO_MIN, ALMUERZO_MIN, TOL_MIN, jornada, review, times, stay, lunch, minutes, fHM, summarize };
})(window);
