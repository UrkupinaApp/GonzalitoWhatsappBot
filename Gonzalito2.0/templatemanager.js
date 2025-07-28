// templateManager.js
const fs        = require('fs');
const path      = require('path');
const Handlebars = require('handlebars');

const TEMPLATES_DIR = path.join(__dirname, 'templates');
const DEFAULTS_DIR  = path.join(TEMPLATES_DIR, 'defaults');
const CUSTOM_DIR    = path.join(TEMPLATES_DIR, 'custom');

function render(name, data = {}) {
  const customPath  = path.join(CUSTOM_DIR,  `${name}.hbs`);
  const defaultPath = path.join(DEFAULTS_DIR, `${name}.hbs`);
  let tpl;
  if (fs.existsSync(customPath)) {
    tpl = fs.readFileSync(customPath, 'utf-8');
  } else {
    tpl = fs.readFileSync(defaultPath, 'utf-8');
  }
  return Handlebars.compile(tpl)(data);
}

module.exports = { render };
