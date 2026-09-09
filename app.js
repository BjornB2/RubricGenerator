const STORAGE_KEY = 'rubricbouwer.v1';

const blankCriterion = () => ({ id: crypto.randomUUID(), title: '', levels: ['', '', ''], weight: 1 });
const defaultState = () => ({
  version: 3,
  theme: window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  title: '',
  levelNames: ['Onvoldoende', 'Voldoende', 'Goed'],
  criteria: [blankCriterion()]
});

let state = loadState();
let saveTimer;
const $ = (selector) => document.querySelector(selector);
const list = $('#criteriaList');

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return normalizeState(parsed);
  } catch { return defaultState(); }
}

function normalizeState(input) {
  if (!input || typeof input !== 'object') return defaultState();
  const names = Array.isArray(input.levelNames) ? input.levelNames.slice(0, 3) : [];
  while (names.length < 3) names.push(['Onvoldoende', 'Voldoende', 'Goed'][names.length]);
  const criteria = Array.isArray(input.criteria) ? input.criteria.map(item => ({
    id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
    title: String(item.title ?? '').slice(0, 100),
    levels: [0, 1, 2].map(i => String(item.levels?.[i] ?? '').slice(0, 400)),
    weight: Math.min(3, Math.max(1, Number(item.weight) || 1))
  })) : [];
  const inputVersion = Number(input.version) || 1;
  if (inputVersion < 2 && names[0] === 'Nog oefenen') names[0] = 'Onvoldoende';
  let title = String(input.title ?? '').slice(0, 120);
  if (inputVersion < 3) title = title.replace(/^Beoordelingsrubric\s+/i, '');
  return { version: 3, theme: input.theme === 'dark' ? 'dark' : 'light', title, levelNames: names.map(x => String(x).slice(0, 40)), criteria: criteria.length ? criteria : [blankCriterion()] };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function criterionTemplate(item, index) {
  return `<article class="criterion-card" data-id="${item.id}">
    <div class="criterion-top">
      <input class="criterion-title" data-field="title" value="${escapeHtml(item.title)}" maxlength="100" aria-label="Naam criterium ${index + 1}" placeholder="Criterium ${index + 1}, bijvoorbeeld: Afwerking">
      <div class="icon-actions">
        <button class="icon-button move-up" title="Omhoog" aria-label="Criterium omhoog">↑</button>
        <button class="icon-button move-down" title="Omlaag" aria-label="Criterium omlaag">↓</button>
        <button class="icon-button duplicate" title="Dupliceren" aria-label="Criterium dupliceren">⧉</button>
        <button class="icon-button delete" title="Verwijderen" aria-label="Criterium verwijderen">×</button>
      </div>
    </div>
    <div class="criterion-body">
      ${item.levels.map((level, i) => `<label class="level-field">Niveau ${i + 1}<textarea data-level="${i}" maxlength="400" placeholder="Beschrijf zichtbaar gedrag of resultaat">${escapeHtml(level)}</textarea></label>`).join('')}
      <div class="weight-box">
        <div class="weight-head"><span>Gewicht</span><span class="weight-badge">${item.weight}×</span></div>
        <input type="range" min="1" max="3" step="1" value="${item.weight}" data-field="weight" aria-label="Gewicht criterium ${index + 1}">
        <div class="weight-labels"><span>Basis</span><span>Belangrijk</span><span>Zwaar</span></div>
        <div class="points-preview">Punten: <strong>0 · ${item.weight} · ${item.weight * 2}</strong></div>
      </div>
    </div>
  </article>`;
}

function renderEditor() {
  $('#rubricTitle').value = state.title;
  state.levelNames.forEach((name, i) => $(`#level${i + 1}Name`).value = name);
  list.innerHTML = state.criteria.map(criterionTemplate).join('');
  updateSummary();
}

function updateSummary() {
  $('#criterionCount').textContent = state.criteria.length;
  $('#maxScore').textContent = state.criteria.reduce((sum, item) => sum + item.weight * 2, 0);
}

function scheduleSave() {
  $('#saveStatus').classList.add('saving');
  $('#saveStatus').lastChild.textContent = ' Opslaan…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    $('#saveStatus').classList.remove('saving');
    $('#saveStatus').lastChild.textContent = ' Opgeslagen';
  }, 250);
  updateSummary();
}

function addCriterion(afterIndex = state.criteria.length - 1) {
  state.criteria.splice(afterIndex + 1, 0, blankCriterion());
  renderEditor(); scheduleSave();
  requestAnimationFrame(() => list.children[afterIndex + 1]?.querySelector('.criterion-title').focus());
}

function moveCriterion(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= state.criteria.length) return;
  [state.criteria[index], state.criteria[target]] = [state.criteria[target], state.criteria[index]];
  renderEditor(); scheduleSave();
}

list.addEventListener('input', event => {
  const card = event.target.closest('.criterion-card');
  if (!card) return;
  const item = state.criteria.find(x => x.id === card.dataset.id);
  if (event.target.dataset.field === 'title') item.title = event.target.value;
  if (event.target.dataset.level !== undefined) item.levels[Number(event.target.dataset.level)] = event.target.value;
  if (event.target.dataset.field === 'weight') {
    item.weight = Number(event.target.value);
    card.querySelector('.weight-badge').textContent = `${item.weight}×`;
    card.querySelector('.points-preview strong').textContent = `0 · ${item.weight} · ${item.weight * 2}`;
  }
  scheduleSave();
});

list.addEventListener('click', event => {
  const button = event.target.closest('button');
  const card = event.target.closest('.criterion-card');
  if (!button || !card) return;
  const index = state.criteria.findIndex(x => x.id === card.dataset.id);
  if (button.classList.contains('move-up')) moveCriterion(index, -1);
  if (button.classList.contains('move-down')) moveCriterion(index, 1);
  if (button.classList.contains('duplicate')) {
    const source = state.criteria[index];
    state.criteria.splice(index + 1, 0, {...source, id: crypto.randomUUID(), levels: [...source.levels]});
    renderEditor(); scheduleSave();
  }
  if (button.classList.contains('delete')) {
    if (state.criteria.length === 1) { state.criteria[0] = blankCriterion(); }
    else state.criteria.splice(index, 1);
    renderEditor(); scheduleSave();
  }
});

['rubricTitle','level1Name','level2Name','level3Name'].forEach((id, i) => {
  $(`#${id}`).addEventListener('input', event => {
    if (id === 'rubricTitle') state.title = event.target.value;
    else state.levelNames[i - 1] = event.target.value;
    scheduleSave();
  });
});

function gradeBands(max) {
  return Array.from({length: 19}, (_, i) => {
    const grade = 1 + i * .5;
    const values = Array.from({length: max + 1}, (_, score) => score).filter(score => Math.max(1, Math.min(10, Math.round((1 + score / max * 9) * 2) / 2)) === grade);
    if (!values.length) return { grade: String(grade).replace('.', ','), range: '—' };
    const first = values[0], last = values.at(-1);
    return { grade: String(grade).replace('.', ','), range: first === last ? `${first}` : `${first}–${last}` };
  });
}

function openPreview() {
  const valid = state.criteria.filter(item => item.title.trim() || item.levels.some(x => x.trim()));
  if (!state.title.trim()) { showToast('Vul eerst de naam van het project in.'); return; }
  if (!valid.length) { showToast('Vul eerst minimaal één criterium in.'); return; }
  $('#previewTitle').textContent = state.title.trim();
  state.levelNames.forEach((name, i) => $(`#previewLevel${i + 1}`).textContent = `${i + 1} · ${name.trim() || `Niveau ${i + 1}`}`);
  $('#previewRows').innerHTML = valid.map(item => `<tr>
    <td>${escapeHtml(item.title.trim() || 'Naamloos criterium')}</td>
    ${item.levels.map(text => `<td>${escapeHtml(text.trim() || '—')}</td>`).join('')}
    <td class="score-options"><span>0</span><span>${item.weight}</span><span>${item.weight * 2}</span></td>
  </tr>`).join('');
  const max = valid.reduce((sum, item) => sum + item.weight * 2, 0);
  $('#footerMax').textContent = max;
  const bands = gradeBands(max);
  $('#gradeScale').style.gridTemplateColumns = `27mm repeat(${bands.length},1fr)`;
  $('#gradeScale').innerHTML = `<div class="scale-label"><b>Behaalde punten</b><span>Cijfer</span></div>${bands.map(x => `<div class="grade-cell"><b>${x.range}</b><span>${x.grade}</span></div>`).join('')}`;
  $('#editor').style.display = 'none'; $('.app-header').style.display = 'none';
  $('#preview').classList.add('active'); $('#preview').setAttribute('aria-hidden','false');
  document.title = `${state.title || 'Rubric'} – PDF-preview`; window.scrollTo(0,0);
}

function closePreview() {
  $('#preview').classList.remove('active'); $('#preview').setAttribute('aria-hidden','true');
  $('#editor').style.display = ''; $('.app-header').style.display = '';
  document.title = 'Rubricbouwer';
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  $('#themeToggle span').textContent = state.theme === 'dark' ? 'Licht' : 'Donker';
  $('#themeToggle').setAttribute('aria-pressed', state.theme === 'dark');
}

function exportSettings() {
  const data = JSON.stringify({...state, exportedAt: new Date().toISOString()}, null, 2);
  const blob = new Blob([data], {type:'application/json'});
  const link = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: `${slug(state.title) || 'rubric'}.rubric.json`});
  link.click(); URL.revokeObjectURL(link.href); showToast('Instellingen geëxporteerd.');
}

function buildPdf(valid, max) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const navy = [18, 61, 85], orange = [235, 113, 70];
  pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...orange); pdf.setFontSize(7);
  pdf.text('BEOORDELINGSRUBRIC', 14, 14);
  pdf.setTextColor(...navy); pdf.setFontSize(18);
  pdf.text(state.title.trim(), 14, 22);
  pdf.setDrawColor(...orange); pdf.setLineWidth(.45); pdf.line(14, 26, 283, 26);
  pdf.setFontSize(7.5); pdf.text('Eindcijfer', 241, 14);
  pdf.setDrawColor(...orange); pdf.setLineWidth(.5); pdf.roundedRect(259, 8, 24, 12, 1.4, 1.4);
  pdf.setDrawColor(82,101,109); pdf.setLineWidth(.25);
  pdf.text('Naam leerling', 14, 35); pdf.line(38, 35, 142, 35);
  pdf.text('Docent', 154, 35); pdf.line(169, 35, 283, 35);
  const headers = ['Criterium', ...state.levelNames.map((x, i) => `${i + 1} · ${x.trim() || `Niveau ${i + 1}`}`), 'Score'];
  const rows = valid.map(item => [item.title.trim() || 'Naamloos criterium', ...item.levels.map(x => x.trim() || '—'), '']);
  pdf.autoTable({
    startY: 40, head: [headers], body: rows, margin: {left:14,right:14,bottom:35},
    styles: {font:'helvetica',fontSize:7.2,cellPadding:2.1,valign:'middle',lineColor:[203,211,214],lineWidth:.2,textColor:[24,48,62]},
    headStyles: {fillColor:navy,textColor:255,fontStyle:'bold',halign:'center'},
    alternateRowStyles: {fillColor:[241,245,246]},
    columnStyles: {0:{cellWidth:43,fontStyle:'bold'},1:{cellWidth:64},2:{cellWidth:64},3:{cellWidth:64},4:{cellWidth:34,halign:'center',fontStyle:'bold'}},
    didDrawCell(data) {
      if (data.section !== 'body' || data.column.index !== 4) return;
      const item = valid[data.row.index], values = [0, item.weight, item.weight * 2];
      const centerY = data.cell.y + data.cell.height / 2, spacing = 9;
      values.forEach((value, i) => {
        const x = data.cell.x + data.cell.width / 2 + (i - 1) * spacing;
        pdf.setDrawColor(145,160,165); pdf.setLineWidth(.25); pdf.circle(x,centerY,3);
        pdf.setTextColor(24,48,62); pdf.setFont('helvetica','bold'); pdf.setFontSize(6.5);
        pdf.text(String(value),x,centerY+1.1,{align:'center'});
      });
    }
  });
  const totalY = pdf.lastAutoTable.finalY + 5;
  pdf.setTextColor(...navy); pdf.setFont('helvetica','bold'); pdf.setFontSize(7);
  pdf.text('Totaalscore',249,totalY); pdf.setDrawColor(82,101,109); pdf.line(249,totalY+5,271,totalY+5);
  pdf.setFont('helvetica','normal'); pdf.text(`/ ${max}`,274,totalY+5);
  const bands = gradeBands(max), labelW = 27, scaleW = 230, cellW = (scaleW-labelW) / bands.length, left = (297-scaleW)/2, top = 190;
  pdf.setFillColor(...navy); pdf.rect(left,top,labelW,6,'F'); pdf.setDrawColor(187,199,202); pdf.rect(left,top,labelW,12);
  pdf.setTextColor(255); pdf.setFont('helvetica','bold'); pdf.setFontSize(4.7); pdf.text('BEHAALDE PUNTEN',left+labelW/2,top+3.9,{align:'center'});
  pdf.setTextColor(...navy); pdf.setFontSize(5.5); pdf.text('CIJFER',left+labelW/2,top+10,{align:'center'});
  bands.forEach((band, i) => {
    const x = left + labelW + i * cellW;
    pdf.setFillColor(...navy); pdf.rect(x,top,cellW,6,'F');
    pdf.setDrawColor(187,199,202); pdf.rect(x,top,cellW,12);
    pdf.setTextColor(255); pdf.setFont('helvetica','bold'); pdf.setFontSize(4.5); pdf.text(band.range,x+cellW/2,top+4,{align:'center'});
    pdf.setTextColor(...navy); pdf.setFontSize(5.5); pdf.text(band.grade,x+cellW/2,top+10,{align:'center'});
  });
  pdf.setProperties({title: state.title || 'Rubric', subject:'Printbare beoordelingsrubric', creator:'Rubricbouwer'});
  return pdf;
}

async function downloadPackage() {
  const valid = state.criteria.filter(item => item.title.trim() || item.levels.some(x => x.trim()));
  if (!valid.length) { showToast('Vul eerst minimaal één criterium in.'); return; }
  const button = $('#downloadPackage'), original = button.textContent;
  button.disabled = true; button.textContent = 'Pakket maken…';
  try {
    const max = valid.reduce((sum, item) => sum + item.weight * 2, 0);
    const folderName = safeName(state.title) || 'Rubric';
    const zip = new JSZip(), folder = zip.folder(folderName);
    folder.file(`${folderName}.pdf`, buildPdf(valid, max).output('arraybuffer'));
    folder.file(`${folderName}.rubric.json`, JSON.stringify({...state, exportedAt:new Date().toISOString()}, null, 2));
    const blob = await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
    const link = Object.assign(document.createElement('a'), {href:URL.createObjectURL(blob),download:`${folderName}.zip`});
    link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); showToast('Rubricpakket gedownload.');
  } catch (error) { console.error(error); showToast('Downloaden is niet gelukt.'); }
  finally { button.disabled = false; button.textContent = original; }
}

function safeName(value) { return String(value).trim().replace(/[<>:"/\\|?*\x00-\x1F]/g,'-').replace(/[. ]+$/,'').slice(0,80); }

function slug(value) { return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2400); }

$('#importFile').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try { state = normalizeState(JSON.parse(await file.text())); renderEditor(); scheduleSave(); showToast('Rubric geïmporteerd.'); }
  catch { showToast('Dit bestand is geen geldige rubric.'); }
  event.target.value = '';
});

$('#newRubric').addEventListener('click', () => {
  if (!confirm('Een nieuwe rubric starten? De huidige versie blijft alleen behouden als je die eerst exporteert.')) return;
  state = defaultState(); renderEditor(); scheduleSave();
});
$('#importButton').addEventListener('click', () => $('#importFile').click());
$('#themeToggle').addEventListener('click', () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; applyTheme(); scheduleSave(); });
$('#exportButton').addEventListener('click', exportSettings);
$('#addCriterion').addEventListener('click', () => addCriterion());
$('#addCriterionBottom').addEventListener('click', () => addCriterion());
$('#previewButton').addEventListener('click', openPreview);
$('#previewButtonBottom').addEventListener('click', openPreview);
$('#backButton').addEventListener('click', closePreview);
$('#downloadPackage').addEventListener('click', downloadPackage);

applyTheme();
renderEditor();
