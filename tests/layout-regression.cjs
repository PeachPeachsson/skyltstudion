// Run with: node --experimental-vm-modules tests/layout-regression.cjs
// Execute the shipped renderer and React component without a browser or printer.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../assets');
let printCalls = 0;
const context = vm.createContext({console, setTimeout, clearTimeout, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, URL, Blob, atob, btoa, window: {print: () => printCalls++}, document: {createElement: () => ({relList: {supports: () => true}})}, navigator: {userAgent: 'node'}, MutationObserver: class {observe(){}}});
const modules = new Map();
async function load(filename) {
  if (modules.has(filename)) return modules.get(filename);
  let src = fs.readFileSync(filename, 'utf8');
  if (filename.endsWith('index-skyltstudion-v6.js')) {
    src = src.replace('(0,D.createRoot)(document.getElementById(`root`)).render((0,X.jsx)(tp,{}));', '');
    src += '\nexport {I as defaults,G as normalize,z as parseFont,le as sheet,ce as render,ue as svg,de as pdf,ne as validate,tp as App,T as React,X as JSX};';
  }
  const mod = new vm.SourceTextModule(src, {context, identifier: filename, initializeImportMeta: meta => {meta.url = 'file://' + filename}, importModuleDynamically: async (ref, referencing) => {const m = await load(path.resolve(path.dirname(referencing.identifier), ref)); if (m.status === 'linked') await m.evaluate(); return m;}});
  modules.set(filename, mod);
  await mod.link((ref, referencing) => load(path.resolve(path.dirname(referencing.identifier), ref)));
  return mod;
}
function treeNodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(treeNodes);
  return [tree, ...treeNodes(tree.props?.children)];
}
(async () => {
  const m = await load(root + '/index-skyltstudion-v6.js'); await m.evaluate(); const app = m.namespace;
  const updates = modules.get(root + '/studio-updates.js').namespace;
  const bytes = fs.readFileSync(root + '/cooper-black.ttf');
  const font = app.parseFont(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const parseAsset = filename => {
    const bytes = fs.readFileSync(root + '/' + filename);
    return app.parseFont(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  };
  font.messageFonts = {subtitle:parseAsset('cooper-medium.otf'), body:parseAsset('roboto-regular.ttf')};
  const input = {...app.defaults, price: '49,90', uniformText: 'Välkommen!', uniformSize: 24};
  const order = Object.keys(updates.formats);
  assert.equal(order.slice(1, 5).join(','), 'a5,a5x2,a5-portrait,a5-landscape');
  let checked = 0;
  for (const mode of ['standard', 'ad', 'message', 'uniform']) {
    for (const format of order) {
      const sign = {...input, mode};
      const scene = app.sheet(font, sign, format, true), dimensions = updates.formats[format];
      assert.equal(scene.width, dimensions.w); assert.equal(scene.height, dimensions.h);
      assert.equal(scene.error, '');
      const copies = format === 'a6' ? 4 : format === 'a5x2' ? 2 : 1;
      assert.equal(scene.shapes.filter(shape => shape.fill === '#3d5980').length, copies, `${mode} ${format}: copies`);
      const svg = app.svg(scene);
      assert(!svg.includes('NaN')); assert(!svg.includes('<text')); assert(!svg.includes('<image')); // Fully outlined, self-contained output.
      if (mode === 'standard') assert.equal(svg, app.svg(app.sheet(font, {...sign, price: '49:90'}, format, true)), 'Comma and colon prices must match');
      const pdfBytes = await app.pdf(scene);
      const pdfLib = modules.get(root + '/es-skyltstudion-v6.js').namespace;
      const pdf = await pdfLib.PDFDocument.load(pdfBytes);
      assert.equal(pdf.getPageCount(), 1, 'Only one PDF page');
      const size = pdf.getPage(0).getSize();
      assert(Math.abs(size.width - dimensions.w * 72 / 25.4) < .001);
      assert(Math.abs(size.height - dimensions.h * 72 / 25.4) < .001);
      checked++;
    }
  }
  // Large text must be reported instead of silently resized or exported clipped.
  const overflowing = {...input, mode:'uniform', uniformText: 'Mycket text '.repeat(100), uniformSize:144};
  assert(app.sheet(font, overflowing, 'a6-single', false).error.includes('ryms inte'));
  assert(app.validate({...input, mode:'uniform', uniformText:' '}).includes('Skriv text'));
  const normalized = app.normalize(JSON.parse(JSON.stringify({...input, mode:'uniform', uniformAlign:'left', uniformSize:29})));
  assert.equal(normalized.uniformText, input.uniformText); assert.equal(normalized.uniformSize, 29); assert.equal(normalized.uniformAlign,'left');
  assert.equal(app.normalize({...app.defaults}).uniformSize, 36);

  // All text paths in a uniform sign receive the same explicitly selected size.
  for (const points of [16, 32]) {
    const sizes = [];
    const measuredFont = Object.create(font);
    measuredFont.getPath = (...args) => {sizes.push(args[3]); return font.getPath(...args);};
    app.sheet(measuredFont, {...input, mode:'uniform', uniformText:'Första raden\nAndra raden', uniformSize:points}, 'a5-landscape', false);
    assert(sizes.length >= 2);
    const expected = points * 25.4 / 72 * 1000 / 202;
    assert(sizes.every(size => Math.abs(size - expected) < .000001));
  }
  const legacyDraft = {sign:{...input,mode:'message'},format:'a5'};
  delete legacyDraft.sign.uniformText;
  const migrated = updates.migrateDraft(legacyDraft, {getItem:()=>JSON.stringify({active:true,text:'Ett sparat budskap',size:64})});
  assert.equal(migrated.sign.mode,'uniform'); assert.equal(migrated.sign.uniformText,'Ett sparat budskap');
  assert.equal(updates.migrateDraft({sign:normalized}, {getItem:()=>'{bad'}).sign.uniformSize,29);

  // Budskap uses three actual font weights and a measured vertical stack.
  assert.equal(font.messageFonts.subtitle.tables.os2.usWeightClass, 500);
  assert.equal(font.messageFonts.body.tables.os2.usWeightClass, 400);
  const messageLayout = modules.get(root + '/message-layout.js').namespace;
  for (const testFont of [font, font.messageFonts.subtitle, font.messageFonts.body]) {
    for (const size of [18, 29.44, 32, 38, 49, 83]) {
      const outline = testFont.getPath('Underrubrik skriver du här. ÅÄÖ åäö 123', 0, 0, size);
      const d = messageLayout.outlineData(outline);
      assert(!d.includes('NaN'));
      assert.equal((d.match(/[MLCQZ]/g)||[]).length, outline.commands.length, 'No truncated glyph contours');
    }
  }
  for (const ratio of [285/198, 140/202]) for (const icon of ['none','arrow-left','warning']) for (const subtitle of [false,true]) for (const body of [false,true]) {
    const sign = {...input,mode:'message',lineMode:'auto',messageIcon:icon,showMessageSubtitle:subtitle,showMessageBody:body,
      headline:'Här är ett viktigt budskap! som man kan läsa ifall man vill',messageBody:input.messageBody+' '+input.messageBody};
    const scene = app.render(font,sign,ratio,198);
    assert.equal(scene.error,'');
    assert.equal(scene.typography.map(block=>block.role).join(','), ['headline',...(subtitle?['subtitle']:[]),...(body?['body']:[])].join(','));
    scene.typography.forEach((block,index,blocks)=>{
      assert(block.measuredWidth <= block.width + .01);
      assert(block.y + block.height < scene.height - 40);
      if(index){const previous=blocks[index-1];assert(Math.abs(block.y-previous.y-previous.height-block.gap)<.001);assert(block.gap<=60);assert(block.size<previous.size);}
    });
  }

  // Exercise the shipped App handlers across successive format and type changes.
  let state = [{...input}, 'a4', true, font], cursor = 0;
  const dispatcher = {
    useState: initial => {const index=cursor++;if (!(index in state)) state[index]=typeof initial==='function'?initial():initial;return [state[index], value => {state[index]=typeof value==='function'?value(state[index]):value}];},
    useRef: value => ({current:value}), useEffect: () => {}, useMemo: fn => fn(),
  };
  app.React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H = dispatcher;
  const render = () => {cursor=0;return treeNodes(app.App());};
  for (const mode of ['uniform','message','ad','standard','uniform']) {
    let nodes = render();
    nodes.find(node=>node.props?.className==='layout-choices').props.onValueChange(mode);
    nodes = render(); assert.equal(state[0].mode,mode);
    assert.equal(nodes.filter(node=>node.props?.className==='layout-choice chosen').length,1);
    if(mode==='uniform') {
      assert(!nodes.some(node=>node.props?.id==='product'||node.props?.id==='headline'));
      assert(nodes.some(node=>node.type===updates.TextControls));
    }
    for (const format of [...order].reverse()) {
      nodes = render();
      const options = nodes.filter(node=>node.type==='button'&&node.props?.className?.startsWith('format-option'));
      options[order.indexOf(format)].props.onClick();
      nodes = render(); assert.equal(state[1],format);
      assert.equal(nodes.filter(node=>node.props?.className==='format-option selected').length,1);
      const preview = nodes.find(node=>node.props?.role==='img');
      const printed = nodes.find(node=>node.props?.className==='print-only');
      assert.equal(preview.props.dangerouslySetInnerHTML.__html,printed.props.dangerouslySetInnerHTML.__html);
      const button=nodes.find(node=>node.props?.className==='print-button');
      assert(!button.props.disabled);
      const before=printCalls;button.props.onClick();assert.equal(printCalls,before+1);
      const size=updates.formats[format];
      assert(nodes.find(node=>node.props?.className==='paper').props.style.aspectRatio === `${size.w}/${size.h}`);
    }
  }
  state[0]=overflowing;
  assert(render().find(node=>node.props?.className==='print-button').props.disabled);
  const html=fs.readFileSync(path.resolve(root,'../index.html'),'utf8');
  assert(!html.includes('customer-update.js'), 'Retired overlay must not load');
  console.log(`PASS: ${checked} layout/PDF combinations, 45 format/type transitions, identical print/preview, one print call per click, text overflow and saved settings.`);
})().catch(error => {console.error(error);process.exit(1)});
