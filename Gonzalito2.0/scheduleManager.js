// scheduleManager.js
const fs   = require('fs');
const path = require('path');

function getSchedules() {
  const p = path.join(__dirname, 'schedules.json');
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

/**
 * Devuelve el nombre de la plantilla activa según la hora.
 * @param {string} defaultTpl — nombre fallback si no encaja en ninguna franja
 */
function activeTemplate(defaultTpl) {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  for (const s of getSchedules()) {
    const [h1,m1] = s.from.split(':').map(Number);
    const [h2,m2] = s.to.split(':').map(Number);
    let start = h1*60 + m1, end = h2*60 + m2;
    // si cruza medianoche
    if (end <= start) end += 24*60;
    const current = minutes < start ? minutes + 24*60 : minutes;
    if (current >= start && current < end) return s.template;
  }
  return defaultTpl;
}

module.exports = { activeTemplate };
