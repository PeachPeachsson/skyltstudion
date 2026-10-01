// Budskap typography is measured with the actual outline fonts. Its tight
// vertical stack is shared by portrait/landscape preview, PDF and printing.
export async function loadFonts(parse) {
  const files = ['cooper-black.ttf', 'cooper-medium.otf', 'roboto-regular.ttf'];
  const [headline, subtitle, body] = await Promise.all(files.map(async file => {
    const response = await fetch(new URL(file, import.meta.url));
    if (!response.ok) throw Error(`Typsnittet ${file} kunde inte läsas.`);
    return parse(await response.arrayBuffer());
  }));
  headline.messageFonts = {subtitle, body};
  return headline;
}

function linesFor(font, text, size, width, mode) {
  if (mode === 'one') return [text.replace(/\r?\n/g, ' ')];
  if (mode === 'manual') return text.split(/\r?\n/);
  const measure = value => font.getAdvanceWidth(value, size, {kerning: true});
  if (mode === 'two') {
    const words = text.trim().split(/\s+/);
    if (words.length < 2) return [text];
    let best = [text], score = Infinity;
    for (let i = 1; i < words.length; i++) {
      const pair = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
      const value = Math.max(...pair.map(measure));
      if (value < score) { best = pair; score = value; }
    }
    return best;
  }
  const result = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      if (line && measure(`${line} ${word}`) > width) { result.push(line); line = ''; }
      line += (line ? ' ' : '') + word;
    }
    result.push(line);
  }
  return result;
}

export function measureBlock(font, text, size, width, leading, mode = 'auto') {
  const lines = linesFor(font, text, size, width, mode);
  const outlines = lines.map(line => line ? font.getPath(line, 0, 0, size) : null);
  const boxes = outlines.filter(Boolean).map(outline => outline.getBoundingBox());
  const ascent = Math.max(0, ...boxes.map(box => -box.y1));
  const descent = Math.max(0, ...boxes.map(box => box.y2));
  return {font, text, size, width, lines, outlines, ascent, descent,
    lineHeight: size * leading,
    height: ascent + descent + Math.max(0, lines.length - 1) * size * leading,
    measuredWidth: Math.max(0, ...boxes.map(box => box.x2 - box.x1))};
}

// The legacy font library's decimal serializer can produce NaN for tiny
// floating-point coordinates. Serialize the finite outline coordinates directly.
export function outlineData(outline) {
  const fields = {M:['x','y'],L:['x','y'],Q:['x1','y1','x','y'],C:['x1','y1','x2','y2','x','y'],Z:[]};
  return outline.commands.map(command => command.type + fields[command.type].map(key => {
    if (!Number.isFinite(command[key])) throw Error('Typsnittet innehåller en ogiltig kontur.');
    return Number(command[key].toFixed(4));
  }).join(' ')).join('');
}

export function renderMessage(font, sign, ratio, assets, path) {
  const fonts = font.messageFonts;
  if (!fonts?.subtitle || !fonts?.body) throw Error('Budskapets typsnitt är inte laddade.');
  const width = 1000, height = width * ratio, landscape = ratio < 1;
  const white = sign.background === 'white', foreground = white ? '#000000' : '#ffffff';
  const colors = {default: foreground, red: '#d2232a', yellow: white ? foreground : '#ffb445', lightblue: white ? foreground : '#d6f2f5'};
  const shapes = [{d: `M0 0h1000v${height}h-1000z`, fill: white ? '#ffffff' : '#3d5980'}];
  const add = (d, fill) => shapes.push({d, fill});
  function graphic(name, x, y, w, color, angle = 0) {
    const asset = assets[name], [vx, vy, vw, vh] = asset.viewBox.split(/\s+/).map(Number);
    const scale = w / vw;
    for (const d of asset.paths) add(path(d).translate(-vx, -vy).rotate(angle, vw / 2, vh / 2).scale(scale).translate(x, y).toString(), color);
    for (const c of asset.circles || []) add(path(`M${c.cx-c.r} ${c.cy}a${c.r} ${c.r} 0 1 0 ${c.r*2} 0a${c.r} ${c.r} 0 1 0 ${-c.r*2} 0`).translate(-vx, -vy).scale(scale).translate(x, y).toString(), color);
    return vh * scale;
  }
  function icon(cx, cy, size) {
    const warning = sign.messageIcon === 'warning';
    const name = warning ? 'warning' : 'arrow';
    const angle = warning ? 0 : {'arrow-up':0,'arrow-right':90,'arrow-down':180,'arrow-left':270}[sign.messageIcon];
    const [, , vw, vh] = assets[name].viewBox.split(/\s+/).map(Number);
    const w = vw * size / Math.max(vw, vh), h = vh * size / Math.max(vw, vh);
    graphic(name, cx - w / 2, cy - h / 2, w, '#ffb445', angle);
  }
  if (sign.decoration && sign.decorationStyle === 'flowers') {
    const color = white ? '#e2e6ec' : '#5c7897';
    graphic('flower1', 30, 45, 150, color); graphic('flower2', 785, height * .47, 175, color);
    graphic('flower1', 40, height - 210, 155, color);
  }
  const logoWidth = landscape ? 270 : 380, logoY = landscape ? 25 : height * .045;
  const logoHeight = graphic(white ? 'logoDark' : 'logo', (width - logoWidth) / 2, logoY, logoWidth, white ? '#3d5980' : '#d6f2f5');
  const hasIcon = sign.messageIcon !== 'none';
  const column = landscape && hasIcon ? {x:350, width:565} : {x:80, width:840};
  const top = logoY + logoHeight + (landscape ? 40 : 65);
  const bottom = height - (sign.footer.trim() ? 100 : landscape ? 60 : 105);
  const available = bottom - top;
  const iconSize = landscape ? 205 : 210;
  const iconSpace = hasIcon && !landscape ? iconSize + 35 : 0;
  const roles = [{role:'headline', font, text:sign.headline, size:landscape ? 86 : 108, width:column.width, leading:1.1, gap:0, mode:sign.lineMode, fill:colors[sign.messageHeadlineColor] || foreground}];
  if (sign.showMessageSubtitle && sign.messageSubtitle.trim()) roles.push({role:'subtitle', font:fonts.subtitle, text:sign.messageSubtitle, size:landscape ? 41 : 49, width:column.width - 40, leading:1.2, gap:44, fill:foreground});
  if (sign.showMessageBody && sign.messageBody.trim()) roles.push({role:'body', font:fonts.body, text:sign.messageBody, size:landscape ? 32 : 38, width:column.width - 80, leading:1.38, gap:60, fill:foreground});
  const makeBlocks = scale => {
    let headlineSize;
    return roles.map(role => {
      let size = role.size * scale;
      if (role.role !== 'headline') size = Math.min(size, headlineSize * (role.role === 'subtitle' ? .76 : .62));
      let block = measureBlock(role.font, role.text, size, role.width, role.leading, role.mode);
      const maxHeight = role.role === 'headline' ? (landscape ? available * .48 : hasIcon ? 320 : 390) : Infinity;
      while ((block.measuredWidth > role.width || block.height > maxHeight) && size > 3) block = measureBlock(role.font, role.text, --size, role.width, role.leading, role.mode);
      if (role.role === 'headline') headlineSize = size;
      return {...role, ...block, gap:role.gap * scale};
    });
  };
  let scale = 1, blocks = makeBlocks(scale);
  const total = list => list.reduce((sum, block) => sum + block.height + block.gap, 0);
  while (scale > .16 && (total(blocks) + iconSpace > available || blocks.some(block => block.measuredWidth > block.width))) {
    scale -= .01; blocks = makeBlocks(scale);
  }
  const totalHeight = total(blocks) + iconSpace;
  let y = top + Math.max(0, (available - totalHeight) * .4);
  if (hasIcon) {
    if (landscape) icon(190, top + available / 2, iconSize);
    else { icon(500, y + iconSize / 2, iconSize); y += iconSpace; }
  }
  const typography = [];
  function draw(block, x, y) {
    block.outlines.forEach((outline, index) => {
      if (!outline) return;
      const box = outline.getBoundingBox();
      const left = x + (block.width - box.x1 - box.x2) / 2;
      add(path(outlineData(outline)).translate(left, y + block.ascent + index * block.lineHeight).toString(), block.fill);
    });
  }
  for (const block of blocks) {
    y += block.gap;
    draw(block, column.x + (column.width - block.width) / 2, y);
    typography.push({role:block.role, size:block.size, y, height:block.height, gap:block.gap, width:block.width, measuredWidth:block.measuredWidth});
    y += block.height;
  }
  if (sign.decoration && sign.decorationStyle !== 'flowers') {
    const name = sign.decorationStyle === 'wow' ? 'wow' : sign.decorationStyle === 'classic' ? 'decoration' : 'glitter';
    const size = landscape ? 58 : 95;
    graphic(name, landscape ? 928 : 875, Math.max(logoY + logoHeight + 15, typography[0].y - size - 12), size, sign.decorationStyle === 'wow' ? '#d2232a' : '#ffb445');
    if (!landscape) graphic(name, 28, Math.min(height - size - 35, y + 45), size, sign.decorationStyle === 'wow' ? '#d2232a' : '#ffb445');
  }
  if (sign.footer.trim()) {
    let size = 22, footer = measureBlock(fonts.body, sign.footer, size, 840, 1.2, 'one');
    while (footer.measuredWidth > 840 && size > 5) footer = measureBlock(fonts.body, sign.footer, --size, 840, 1.2, 'one');
    draw({...footer,fill:foreground}, 80, height - 50 - footer.height);
  }
  return {width,height,shapes,typography,smallText:scale < .57,error:totalHeight > available || blocks.some(block=>block.measuredWidth>block.width) ? 'Texten ryms inte. Korta rubriken eller brödtexten.' : ''};
}
