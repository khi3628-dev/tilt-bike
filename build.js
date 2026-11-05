// src → dist/index.html (한 파일, 외부 요청 없음)
const fs = require('fs');
const path = require('path');
const rd = p => fs.readFileSync(path.join(__dirname, p), 'utf8');
const safe = s => s.replace(/<\/script/gi, '<\\/script');
let html = rd('src/index.src.html');
html = html.replace('<script>/*PLANCK*/</script>', () => '<script>' + safe(rd('node_modules/planck/dist/planck.min.js').replace(/\/\/# sourceMappingURL=.*$/m, '')) + '</script>');
html = html.replace('<script>/*CORE*/</script>', () => '<script>' + safe(rd('src/core.js')) + '</script>');
html = html.replace('<script>/*APP*/</script>', () => '<script>' + safe(rd('src/app.js')) + '</script>');
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist/index.html'), html);
fs.writeFileSync(path.join(__dirname, 'index.html'), html); // GitHub Pages용
console.log('dist/index.html', (html.length / 1024).toFixed(0) + 'KB');
