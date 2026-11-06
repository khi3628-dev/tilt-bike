// src → dist/index.html (아티팩트·GitHub Pages용) + crazygames/index.html (SDK 스크립트 포함)
const fs = require('fs');
const path = require('path');
const rd = p => fs.readFileSync(path.join(__dirname, p), 'utf8');
const safe = s => s.replace(/<\/script/gi, '<\\/script');
function build(withSdk) {
  let html = rd('src/index.src.html');
  html = html.replace('<!--CGSDK-->', withSdk ? '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>' : '');
  html = html.replace('<script>/*PLANCK*/</script>', () => '<script>' + safe(rd('node_modules/planck/dist/planck.min.js').replace(/\/\/# sourceMappingURL=.*$/m, '')) + '</script>');
  for (const [tag, file] of [['I18N', 'src/i18n.js'], ['CORE', 'src/core.js'], ['AUDIO', 'src/audio.js'], ['CG', 'src/cg.js'], ['APP', 'src/app.js']])
    html = html.replace('<script>/*' + tag + '*/</script>', () => '<script>' + safe(rd(file)) + '</script>');
  return html;
}
fs.mkdirSync(path.join(__dirname, 'dist/img'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'crazygames/img'), { recursive: true });
const a = build(false), b = build(true);
fs.writeFileSync(path.join(__dirname, 'dist/index.html'), a);
fs.writeFileSync(path.join(__dirname, 'index.html'), a);
fs.writeFileSync(path.join(__dirname, 'crazygames/index.html'), b);
// 그림 복사
const imgDir = path.join(__dirname, 'img');
if (fs.existsSync(imgDir)) for (const f of fs.readdirSync(imgDir)) {
  if (!/\.(webp|png|jpg)$/.test(f)) continue;
  for (const d of ['dist/img', 'crazygames/img']) fs.copyFileSync(path.join(imgDir, f), path.join(__dirname, d, f));
}
console.log('dist/index.html', (a.length / 1024).toFixed(0) + 'KB · crazygames/index.html', (b.length / 1024).toFixed(0) + 'KB');
