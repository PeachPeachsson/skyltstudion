import {renderMessage} from "./message-layout.js";
export {loadFonts} from "./message-layout.js";
// Native layout additions. These functions return the same vector scene used
// by the existing preview, PDF writer and print view; no DOM overlays or iframes.
export const formats = {
  a4: {label: 'A4', sub: 'Ett original · A4-papper', w: 210, h: 297, icon: 'portrait'},
  a5: {label: '1 × A5 på A4', sub: 'Centrerad · med skärmarkeringar', w: 210, h: 297, icon: 'inset'},
  a5x2: {label: '2 × A5 på A4', sub: 'Två stående · delad liggande A4', w: 297, h: 210, icon: 'two'},
  'a5-portrait': {label: 'A5 stående', sub: 'Ett original · A5-papper', w: 148, h: 210, icon: 'portrait'},
  'a5-landscape': {label: 'A5 liggande', sub: 'Ett original · A5-papper', w: 210, h: 148, icon: 'landscape'},
  'a6-single': {label: '1 × A6', sub: 'Ett stående original · A6-papper', w: 105, h: 148, icon: 'portrait'},
  a6: {label: '4 × A6 på A4', sub: 'Fyra stående · delad A4', w: 210, h: 297, icon: 'four'},
  '50x70': {label: '50 × 70', sub: 'Affisch · plotter', w: 500, h: 700, icon: 'poster'},
  '70x100': {label: '70 × 100', sub: 'Affisch · plotter', w: 700, h: 1000, icon: 'poster'},
};
export const textDefaults = {uniformText: 'Skriv ditt budskap här', uniformSize: 36, uniformAlign: 'center'};
export const signName = sign => sign.mode === 'uniform' ? sign.uniformText : sign.mode === 'message' ? sign.headline : sign.product || sign.price;
export function validateText(sign) {
  if (sign.mode !== 'uniform') return '';
  if (!sign.uniformText.trim()) return 'Skriv text på skylten.';
  if (!Number.isFinite(sign.uniformSize) || sign.uniformSize < 8 || sign.uniformSize > 144) return 'Välj en textstorlek mellan 8 och 144 punkter.';
  return '';
}
export function normalizeText(sign) {
  const result = {...textDefaults, ...sign};
  if (typeof result.uniformText !== 'string' || result.uniformText.length > 2000 || !Number.isFinite(result.uniformSize) || result.uniformSize < 8 || result.uniformSize > 144 || !['left', 'center'].includes(result.uniformAlign)) throw Error('Skyltfilen har ogiltiga inställningar för Enkel text.');
  return result;
}
// Carry an active draft from the retired overlay into the normal saved sign.
export function migrateDraft(draft, storage) {
  if (!draft?.sign || draft.sign.uniformText !== undefined || draft.sign.mode !== 'message') return draft;
  try {
    const legacy = JSON.parse(storage.getItem('jordnara-uniform-message-v1') || 'null');
    if (legacy?.active && typeof legacy.text === 'string') {
      const innerWidth = draft.format === 'a6' ? 99 : draft.format === 'a5' || draft.format === 'a5x2' ? 140 : 198;
      return {...draft, sign: {...draft.sign, mode:'uniform', uniformText:legacy.text.slice(0, 2000), uniformSize:Math.max(8, Math.min(144, Math.round((Number(legacy.size) || 64) * innerWidth / 1000 * 72 / 25.4))), uniformAlign:'center'}};
    }
  } catch { /* A corrupt retired draft must not prevent the current app loading. */ }
  return draft;
}

const rect = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`;
export function sheet(font, sign, format, cuts, render, path) {
  const f = formats[format];
  const four = format === 'a6', two = format === 'a5x2', inset = format === 'a5';
  const width = four ? 105 : two || inset ? 148 : f.w;
  const height = four ? 148 : two || inset ? 210 : f.h;
  const margin = four || format === 'a6-single' ? 3 : two || inset || format.startsWith('a5-') ? 4 : format === 'a4' ? 6 : 10;
  const content = render(font, sign, (height - 2 * margin) / (width - 2 * margin), width - 2 * margin);
  const scale = (width - 2 * margin) / content.width;
  const shapes = [{d: rect(0, 0, f.w, f.h), fill: '#ffffff'}];
  for (let index = 0; index < (four ? 4 : two ? 2 : 1); index++) {
    const x = inset ? 31 + margin : (two ? .5 : 0) + index % 2 * width + margin;
    const y = inset ? 43.5 + margin : (four ? .5 + Math.floor(index / 2) * height : 0) + margin;
    for (const shape of content.shapes) shapes.push({d: path(shape.d).scale(scale).translate(x, y).round(4).toString(), fill: shape.fill});
  }
  const marks = four ? [[104.9,0,.2,3],[104.9,294,.2,3],[0,148.4,3,.2],[207,148.4,3,.2],[102,148.4,6,.2],[104.9,145.5,.2,6]]
    : two ? [[148.4,0,.2,5],[148.4,205,.2,5]]
    : inset ? [[26,43.3,4,.2],[180,43.3,4,.2],[26,253.5,4,.2],[180,253.5,4,.2],[30.8,38.5,.2,4],[30.8,254.5,.2,4],[179,38.5,.2,4],[179,254.5,.2,4]] : [];
  if (cuts) for (const mark of marks) shapes.push({d: rect(...mark), fill: '#555555'});
  return {width: f.w, height: f.h, shapes, smallText: content.smallText, error: content.error || ''};
}

function wrap(font, text, size, width, breakWords = false) {
  const lines = [];
  const measure = value => font.getAdvanceWidth(value, size, {kerning: true});
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      if (line && measure(`${line} ${word}`) > width) { lines.push(line); line = ''; }
      if (!breakWords) { line += (line ? ' ' : '') + word; continue; }
      // Long unbroken words are split without silently changing the font size.
      for (const character of (line ? ' ' : '') + word) {
        if (line && measure(line + character) > width) { lines.push(line); line = ''; }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

function twoLines(font, text) {
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return [text];
  let best = [text], score = Infinity;
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const width = Math.max(...lines.map(line => font.getAdvanceWidth(line, 100)));
    if (width < score) { best = lines; score = width; }
  }
  return best;
}

export function renderSign(font, sign, ratio, physicalWidth, assets, path, parsePrice) {
  if (sign.mode === 'message') return renderMessage(font, sign, ratio, assets, path);
  const width = 1000, height = width * ratio;
  const white = sign.background === 'white';
  const foreground = white ? '#000000' : '#ffffff';
  const headlineColor = {default: foreground, red: '#d2232a', yellow: white ? foreground : '#ffb445', lightblue: white ? foreground : '#d6f2f5'}[sign.messageHeadlineColor] || foreground;
  const shapes = [{d: rect(0, 0, width, height), fill: white ? '#ffffff' : '#3d5980'}];
  let error = '';
  const add = (d, fill) => shapes.push({d, fill});
  function graphic(name, x, y, w, color, angle = 0) {
    const asset = assets[name];
    const [vx, vy, vw, vh] = asset.viewBox.split(/\s+/).map(Number);
    const scale = w / vw;
    for (const d of asset.paths) add(path(d).translate(-vx, -vy).rotate(angle, vw / 2, vh / 2).scale(scale).translate(x, y).toString(), color);
    for (const circle of asset.circles || []) add(path(`M${circle.cx-circle.r} ${circle.cy}a${circle.r} ${circle.r} 0 1 0 ${circle.r*2} 0a${circle.r} ${circle.r} 0 1 0 ${-circle.r*2} 0`).translate(-vx, -vy).scale(scale).translate(x, y).toString(), color);
    return vh * scale;
  }
  function textBlock(text, x, y, w, h, maxSize, color = foreground, fixed = false, align = 'center', mode = 'wrap') {
    if (!text.trim()) return;
    const layout = size => {
      const lines = mode === 'one' ? [text.replace(/\n/g, ' ')] : mode === 'manual' ? text.split(/\r?\n/) : mode === 'two' ? twoLines(font, text) : wrap(font, text, size, w, fixed);
      const boxes = lines.filter(Boolean).map(line => font.getPath(line, 0, 0, size).getBoundingBox());
      const ascent = Math.max(size * .72, ...boxes.map(box => -box.y1));
      const descent = Math.max(size * .2, ...boxes.map(box => box.y2));
      return {lines, ascent, total: ascent + descent + (lines.length - 1) * size * 1.22, maxWidth: Math.max(0, ...lines.map(line => font.getAdvanceWidth(line, size, {kerning: true})))};
    };
    let size = maxSize, l = layout(size);
    while (!fixed && size > 2 && (l.total > h || l.maxWidth > w)) { size -= .5; l = layout(size); }
    if (fixed && (l.total > h || l.maxWidth > w)) error = 'Texten ryms inte. Minska textstorleken eller korta texten innan du skriver ut.';
    const baseline = y + Math.max(0, (h - l.total) / 2) + l.ascent;
    l.lines.forEach((line, index) => {
      if (!line) return;
      const outline = font.getPath(line, 0, 0, size), box = outline.getBoundingBox();
      const left = align === 'left' ? x - box.x1 : x + (w - box.x2 - box.x1) / 2;
      add(path(outline.toPathData(3)).translate(left, baseline + index * size * 1.22).toString(), color);
    });
  }
  const logo = (x, y, w) => graphic(white ? 'logoDark' : 'logo', x, y, w, white ? '#3d5980' : '#d6f2f5');
  if (sign.decoration && sign.decorationStyle === 'flowers') {
    const color = white ? '#e2e6ec' : '#5c7897';
    graphic('flower1', 25, 20, 140, color); graphic('flower2', 790, height * .52, 175, color);
    graphic('flower1', 35, height - 185, 155, color);
  }
  if (sign.mode === 'uniform') {
    const logoHeight = logo(355, 35, 290);
    if (sign.decoration && sign.decorationStyle !== 'flowers') {
      const name = sign.decorationStyle === 'wow' ? 'wow' : sign.decorationStyle === 'classic' ? 'decoration' : 'glitter';
      graphic(name, 875, 45, 75, '#ffb445'); graphic(name, 35, height - 125, 75, '#ffb445');
    }
    const top = 35 + logoHeight + 45;
    const size = sign.uniformSize * 25.4 / 72 * width / physicalWidth;
    textBlock(sign.uniformText, 100, top, 800, height - top - 75, size, headlineColor, true, sign.uniformAlign);
  } else {
    // A true horizontal composition: upright headline and logo to the left,
    // upright offer to the right. No rotation of a portrait original.
    logo(75, 60, 310);
    const ad = sign.mode === 'ad';
    if (ad) graphic('adHeading', 25, height * .37, 410, white ? '#d2232a' : '#ffb445');
    else textBlock(sign.headline, 35, 185, 390, height - 270, 85, foreground, false, 'center', sign.lineMode === 'auto' ? 'wrap' : sign.lineMode);
    const diameter = Math.min(520, height - 105), sx = 720 - diameter / 2, sy = (height - diameter) / 2 - 8;
    graphic('splash', sx, sy, diameter, sign.color);
    if (sign.decoration && sign.decorationStyle !== 'flowers') {
      const name = sign.decorationStyle === 'wow' ? 'wow' : sign.decorationStyle === 'classic' ? 'decoration' : 'glitter';
      graphic(name, 430, 30, 60, sign.decorationStyle === 'wow' ? '#d2232a' : '#ffb445');
      graphic(name, 912, height - 105, 65, sign.decorationStyle === 'wow' ? '#d2232a' : '#ffb445');
    }
    const ink = sign.color === '#d2232a' ? '#ffffff' : '#000000';
    if (sign.unit === 'pay-for') {
      textBlock(`${sign.quantity} för ${sign.payQuantity}`, sx + diameter * .12, sy + diameter * .36, diameter * .76, diameter * .22, 125, ink, false, 'center', 'one');
      textBlock(`Köp ${sign.quantity} betala för ${sign.payQuantity}`, sx + diameter * .17, sy + diameter * .59, diameter * .66, diameter * .09, 28, ink, false, 'center', 'one');
    } else {
      textBlock(sign.unit === 'bundle' ? `${sign.quantity} för` : sign.product, sx + diameter * .2, sy + diameter * .17, diameter * .6, diameter * .19, 44, ink);
      const price = parsePrice(sign.price);
      if (sign.unit === '%') textBlock(`${price?.whole || '—'}${price?.decimal ? ',' + price.decimal : ''}%`, sx + diameter * .12, sy + diameter * .4, diameter * .76, diameter * .29, 170, ink, false, 'center', 'one');
      else {
        const whole = price?.whole || '—', decimals = price?.decimal || '';
        let size = 177;
        const advance = (text, s) => font.getAdvanceWidth(text, s, {kerning: true});
        while (advance(whole, size) + (decimals ? advance(decimals, size * .43) + 5 : 0) > diameter * .72) size -= .5;
        const p = font.getPath(whole, 0, 0, size), box = p.getBoundingBox();
        const px = sx + (diameter - advance(whole, size) - (decimals ? advance(decimals, size * .43) + 5 : 0)) / 2;
        const py = sy + diameter * .53 - (box.y1 + box.y2) / 2;
        add(path(p.toPathData(3)).translate(px, py).toString(), ink);
        if (decimals) {
          const p2 = font.getPath(decimals, 0, 0, size * .43), b2 = p2.getBoundingBox();
          add(path(p2.toPathData(3)).translate(px + advance(whole, size) + 5, py + box.y1 - b2.y1 + 2).toString(), ink);
        }
        textBlock(sign.unit === 'bundle' ? 'kr' : sign.unit, sx + diameter * .22, sy + diameter * .73, diameter * .56, diameter * .085, 35, ink, false, 'center', 'one');
      }
    }
    const unit = ['bundle', 'pay-for', '%'].includes(sign.unit) ? sign.originalUnit : sign.unit;
    textBlock(sign.showOriginal && sign.original.trim() ? `Ord. pris ${sign.original} ${unit}` : '', 470, height - 47, 500, 24, 23);
    textBlock(sign.footer, 35, height - 42, 390, 24, 18);
  }
  return {width, height, shapes, error, smallText: false};
}

export function TextControls({sign, onChange, jsx, React}) {
  const h = jsx;
  const [draftSize, setDraftSize] = React.useState(String(sign.uniformSize));
  React.useEffect(() => setDraftSize(String(sign.uniformSize)), [sign.uniformSize]);
  const setSize = event => {
    const value = Number(event.target.value);
    if (Number.isFinite(value)) onChange('uniformSize', Math.max(8, Math.min(144, value)));
  };
  return h('div', {className: 'uniform-controls', children: [
    h('p', {className: 'field-hint', children: 'En textyta, samma storlek på alla rader. Radbrytning sker automatiskt. Enter ger en egen radbrytning.'}),
    h('label', {className: 'field-label', htmlFor: 'uniform-text', children: 'Text på skylten'}),
    h('textarea', {id: 'uniform-text', rows: 8, maxLength: 2000, value: sign.uniformText, onChange: event => onChange('uniformText', event.target.value)}),
    h('label', {className: 'field-label uniform-size-label', htmlFor: 'uniform-size-number', children: 'Textstorlek (punkter)'}),
    h('div', {className: 'uniform-size', children: [
      h('input', {type: 'range', min: 8, max: 144, value: sign.uniformSize, onChange: setSize, 'aria-label': 'Textstorlek'}),
      h('input', {id: 'uniform-size-number', type: 'number', min: 8, max: 144, value: draftSize, onChange: event => {
        const value = event.target.value; setDraftSize(value);
        if (value !== '' && Number(value) >= 8 && Number(value) <= 144) onChange('uniformSize', Number(value));
      }, onBlur: () => setDraftSize(String(sign.uniformSize))}),
    ]}),
    h('p', {className: 'field-hint', children: 'Storleken behålls vid utskrift. Om texten inte ryms får du en varning.'}),
    h('label', {className: 'field-label', htmlFor: 'uniform-align', children: 'Textplacering'}),
    h('select', {id: 'uniform-align', className: 'studio-select', value: sign.uniformAlign, onChange: event => onChange('uniformAlign', event.target.value), children: [h('option', {value:'center', children:'Centrerad'}), h('option', {value:'left', children:'Vänsterställd'})]}),
  ]});
}
export function FormatIcon({format, jsx}) {
  const type = formats[format].icon;
  const sheets = type === 'two' ? [[4,4,11,24],[17,4,11,24]] : type === 'four' ? [[7,3,8,11],[17,3,8,11],[7,17,8,11],[17,17,8,11]] : type === 'landscape' ? [[2,6,28,20]] : [[7,2,18,28]];
  const children = sheets.map(([x,y,width,height], index) => jsx('rect', {x,y,width,height,rx:1}, index));
  if (type === 'inset') children.push(jsx('rect', {x:10,y:8,width:12,height:17,strokeDasharray:'2 1'}, 'inset'));
  if (type === 'poster') children.push(jsx('path', {d:'M10 7h12M10 25h12'}, 'poster'));
  return jsx('svg', {className:'format-icon sheet-icon', viewBox:'0 0 32 32', fill:'none', stroke:'currentColor', strokeWidth:1.3, 'aria-hidden':true, children});
}
export function formatInfo(id) {
  const f = formats[id];
  const paper = id.startsWith('a5-') ? 'A5' : id === 'a6-single' ? 'A6' : id.includes('x') && !id.startsWith('a5') ? `${f.w} × ${f.h} mm` : 'A4';
  return `Skriv ut på ${paper}, ${f.w > f.h ? 'liggande' : 'stående'}, i 100 %. Stäng av sidhuvud och sidfot.`;
}
export function previewLabel(id) {
  return id === 'a6' ? 'A4 · 4 A6-skyltar' : id === 'a5x2' ? 'A4 liggande · 2 A5-skyltar' : id === 'a5' ? 'A4 · 1 A5-skylt' : `${formats[id].label}${id.includes('x') ? ' cm' : ''} · ett original`;
}
