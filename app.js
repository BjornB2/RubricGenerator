const STORAGE_KEY = 'rubricbouwer.v1';
const ASSESSMENT_KEY = 'rubricbouwer.assessment.v1';
const ASSESSMENT_BOOK_KEY = 'rubricbouwer.assessments.v2';
const LINK_LENGTH_WARNING_KEY = 'rubricbouwer.linkLengthWarning.v2';
const THEME_KEY = 'rubricbouwer.theme.v1';

const blankCriterion = () => ({ id: crypto.randomUUID(), title: '', levels: ['', '', ''], weight: 1 });
const defaultState = () => ({
  version: 3,
  title: '',
  levelNames: ['Onvoldoende', 'Voldoende', 'Goed'],
  criteria: [blankCriterion()]
});

let theme = loadTheme();
let state = loadState();
let assessmentBook = loadAssessmentBook();
let assessment = activeAssessment();
let sharedLinkMode = false;
let previewAssessment = null;
let pendingAssessmentImport = null;
let pendingImportReturnToFill = false;
let helpReturnToFill = false;
let linkLengthWarningShown = false;
let saveTimer;
const $ = (selector) => document.querySelector(selector);
const list = $('#criteriaList');

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return normalizeState(parsed);
  } catch { return defaultState(); }
}

function loadTheme() {
  try {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme;
    const legacyTheme = JSON.parse(localStorage.getItem(STORAGE_KEY))?.theme;
    if (legacyTheme === 'dark' || legacyTheme === 'light') {
      localStorage.setItem(THEME_KEY, legacyTheme);
      return legacyTheme;
    }
  } catch {}
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function blankAssessment(teacher = '') {
  return {id:crypto.randomUUID(),rubricTitle:state?.title || '',student:'',teacher,comment:'',choices:{}};
}

function loadAssessmentBook() {
  try {
    const saved = JSON.parse(localStorage.getItem(ASSESSMENT_BOOK_KEY));
    if (Array.isArray(saved?.assessments) && saved.assessments.length) return {...saved,className:String(saved.className ?? '').slice(0,60)};
    const legacy = JSON.parse(localStorage.getItem(ASSESSMENT_KEY));
    if (legacy) {
      const migrated = {...legacy,id:legacy.id || crypto.randomUUID(),choices:legacy.choices || {}};
      return {rubricTitle:migrated.rubricTitle || '',className:'',activeId:migrated.id,assessments:[migrated]};
    }
  } catch {}
  const first = blankAssessment();
  return {rubricTitle:'',className:'',activeId:first.id,assessments:[first]};
}

function activeAssessment() {
  return assessmentBook.assessments.find(item => item.id === assessmentBook.activeId) || assessmentBook.assessments[0];
}

function saveAssessmentBook() {
  assessmentBook.activeId = assessment.id;
  localStorage.setItem(ASSESSMENT_BOOK_KEY, JSON.stringify(assessmentBook));
}

function resetAssessmentBook() {
  const first = blankAssessment(); first.rubricTitle = state.title;
  assessmentBook = {rubricTitle:state.title,className:'',activeId:first.id,assessments:[first]};
  assessment = first; saveAssessmentBook();
}

function restoreAssessmentExport(payload) {
  if (!payload?.rubric || !Array.isArray(payload.assessments)) throw new Error('Ongeldig beoordelingenbestand');
  state = normalizeState(payload.rubric);
  const criterionIds = new Set(state.criteria.map(item => item.id)), usedIds = new Set();
  const restored = payload.assessments.map(item => {
    const id = typeof item?.id === 'string' && item.id && !usedIds.has(item.id) ? item.id : crypto.randomUUID();
    usedIds.add(id);
    const choices = {};
    if (item?.choices && typeof item.choices === 'object') Object.entries(item.choices).forEach(([criterionId,level]) => {
      if (criterionIds.has(criterionId) && Number.isInteger(level) && level >= 0 && level <= 2) choices[criterionId] = level;
    });
    return {id,rubricTitle:state.title,student:String(item?.student ?? '').slice(0,60),teacher:String(item?.teacher ?? '').slice(0,80),comment:String(item?.comment ?? '').slice(0,160),choices};
  });
  if (!restored.length) restored.push(blankAssessment());
  assessmentBook = {rubricTitle:state.title,className:String(payload.className ?? '').slice(0,60),activeId:restored[0].id,assessments:restored};
  assessment = restored[0]; sharedLinkMode = false;
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); saveAssessmentBook(); renderEditor(); applyTheme();
}

function importRubricOnly(payload) {
  state = normalizeState(payload.rubric || payload); sharedLinkMode = false;
  resetAssessmentBook(); renderEditor(); applyTheme(); scheduleSave();
}

function restoreStudentList(payload) {
  const source = payload?.type === 'rubricbouwer-leerlingen' ? payload.students : payload?.assessments;
  if (!Array.isArray(source)) throw new Error('Ongeldige leerlinglijst');
  const students = source.map(item => typeof item === 'string' ? item : item?.student)
    .map(name => String(name ?? '').trim().slice(0,60)).filter(Boolean);
  const restored = students.map(student => ({...blankAssessment(),rubricTitle:state.title,student}));
  if (!restored.length) restored.push(blankAssessment());
  restored.forEach(item => { item.rubricTitle = state.title; });
  assessmentBook = {
    rubricTitle:state.title,
    className:String(payload?.className ?? '').slice(0,60),
    activeId:restored[0].id,
    assessments:restored
  };
  assessment = restored[0]; saveAssessmentBook();
}

function closeAssessmentImportDialog() {
  pendingAssessmentImport = null; pendingImportReturnToFill = false; $('#assessmentImportDialog').close();
}

function prepareImport(payload, returnToFill = false) {
  const isFull = payload?.type === 'rubricbouwer-beoordelingen' && payload?.rubric && Array.isArray(payload.assessments);
  const isStudentList = payload?.type === 'rubricbouwer-leerlingen' && Array.isArray(payload.students);
  const hasRubric = isFull || (!isStudentList && payload && typeof payload === 'object');
  const hasStudentList = isFull || isStudentList;
  if (!hasRubric && !hasStudentList) throw new Error('Ongeldig bestand');
  pendingAssessmentImport = payload; pendingImportReturnToFill = returnToFill;
  $('#importRubricOnly').disabled = !hasRubric;
  $('#importStudentListOnly').disabled = !hasStudentList;
  $('#importRubricAndAssessments').disabled = !isFull;
  if (isFull) {
    const count = payload.assessments.length;
    $('#assessmentImportSummary').textContent = `Dit bestand bevat een rubric, een leerlinglijst en ${count} beoordeling${count === 1 ? '' : 'en'}.`;
  } else if (isStudentList) {
    $('#assessmentImportSummary').textContent = `Dit bestand bevat een leerlinglijst met ${payload.students.length} leerling${payload.students.length === 1 ? '' : 'en'}.`;
  } else {
    $('#assessmentImportSummary').textContent = 'Dit bestand bevat alleen een rubric.';
  }
  $('#assessmentImportDialog').showModal();
}

function validCriteria() { return state.criteria.filter(item => item.title.trim() || item.levels.some(x => x.trim())); }
function maxPoints(criteria = validCriteria()) { return criteria.reduce((sum, item) => sum + item.weight * 2, 0); }
function assessmentScore(criteria = validCriteria(), current = assessment) { return criteria.reduce((sum,item) => sum + (Number.isInteger(current.choices?.[item.id]) ? current.choices[item.id] * item.weight : 0), 0); }
function isAssessmentComplete(current, criteria = validCriteria()) { return Boolean(criteria.length && current && criteria.every(item => Number.isInteger(current.choices?.[item.id]))); }
function gradeFor(score, max) {
  if (!max) return 1;
  const ratio = Math.max(0, Math.min(1, score / max));
  const grade = ratio <= .5 ? 1 + ratio * 10 : 6 + (ratio - .5) * 8;
  return Math.max(1, Math.min(10, Math.round(grade * 2) / 2));
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
  return { version: 3, title, levelNames: names.map(x => String(x).slice(0, 40)), criteria: criteria.length ? criteria : [blankCriterion()] };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function criterionTemplate(item, index) {
  return `<article class="criterion-card" data-id="${item.id}">
    <div class="criterion-top">
      <button class="drag-handle" type="button" draggable="true" title="Versleep criterium" aria-label="Versleep criterium ${index + 1}" aria-roledescription="sleepgreep">
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="7" cy="5" r="1.5"/><circle cx="13" cy="5" r="1.5"/><circle cx="7" cy="10" r="1.5"/><circle cx="13" cy="10" r="1.5"/><circle cx="7" cy="15" r="1.5"/><circle cx="13" cy="15" r="1.5"/></svg>
      </button>
      <input class="criterion-title" data-field="title" value="${escapeHtml(item.title)}" maxlength="100" aria-label="Naam criterium ${index + 1}" placeholder="Criterium ${index + 1}, bijvoorbeeld: Afwerking">
      <div class="icon-actions">
        <button class="icon-button duplicate" type="button" title="Dupliceren" aria-label="Criterium dupliceren"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg></button>
        <button class="icon-button delete" type="button" title="Verwijderen" aria-label="Criterium verwijderen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg></button>
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

let draggedCriterionId = null;

function reorderCriterion(sourceId, targetId, placeAfter) {
  if (!sourceId || sourceId === targetId) return;
  const sourceIndex = state.criteria.findIndex(item => item.id === sourceId);
  if (sourceIndex < 0) return;
  const [source] = state.criteria.splice(sourceIndex, 1);
  const targetIndex = state.criteria.findIndex(item => item.id === targetId);
  if (targetIndex < 0) { state.criteria.splice(sourceIndex, 0, source); return; }
  state.criteria.splice(targetIndex + (placeAfter ? 1 : 0), 0, source);
  renderEditor(); scheduleSave();
}

list.addEventListener('dragstart', event => {
  const handle = event.target.closest('.drag-handle');
  const card = handle?.closest('.criterion-card');
  if (!card) { event.preventDefault(); return; }
  draggedCriterionId = card.dataset.id;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggedCriterionId);
  requestAnimationFrame(() => card.classList.add('is-dragging'));
});

list.addEventListener('dragover', event => {
  const card = event.target.closest('.criterion-card');
  if (!card || card.dataset.id === draggedCriterionId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  list.querySelectorAll('.drop-before,.drop-after').forEach(item => item.classList.remove('drop-before','drop-after'));
  card.classList.add(event.clientY < card.getBoundingClientRect().top + card.offsetHeight / 2 ? 'drop-before' : 'drop-after');
});

list.addEventListener('drop', event => {
  const card = event.target.closest('.criterion-card');
  if (!card) return;
  event.preventDefault();
  const placeAfter = event.clientY >= card.getBoundingClientRect().top + card.offsetHeight / 2;
  reorderCriterion(draggedCriterionId || event.dataTransfer.getData('text/plain'), card.dataset.id, placeAfter);
});

list.addEventListener('dragend', () => {
  draggedCriterionId = null;
  list.querySelectorAll('.is-dragging,.drop-before,.drop-after').forEach(item => item.classList.remove('is-dragging','drop-before','drop-after'));
});

let touchDrag = null;

list.addEventListener('pointerdown', event => {
  if (event.pointerType === 'mouse') return;
  const handle = event.target.closest('.drag-handle');
  const card = handle?.closest('.criterion-card');
  if (!card) return;
  touchDrag = {pointerId:event.pointerId,sourceId:card.dataset.id,startY:event.clientY,targetId:null,placeAfter:false,active:false};
  handle.setPointerCapture?.(event.pointerId);
});

list.addEventListener('pointermove', event => {
  if (!touchDrag || event.pointerId !== touchDrag.pointerId) return;
  if (!touchDrag.active && Math.abs(event.clientY - touchDrag.startY) < 7) return;
  touchDrag.active = true; event.preventDefault();
  list.querySelector(`[data-id="${touchDrag.sourceId}"]`)?.classList.add('is-dragging');
  const card = document.elementFromPoint(event.clientX,event.clientY)?.closest('.criterion-card');
  list.querySelectorAll('.drop-before,.drop-after').forEach(item => item.classList.remove('drop-before','drop-after'));
  if (!card || card.dataset.id === touchDrag.sourceId) { touchDrag.targetId = null; return; }
  touchDrag.targetId = card.dataset.id;
  touchDrag.placeAfter = event.clientY >= card.getBoundingClientRect().top + card.offsetHeight / 2;
  card.classList.add(touchDrag.placeAfter ? 'drop-after' : 'drop-before');
});

function finishTouchDrag(event) {
  if (!touchDrag || event.pointerId !== touchDrag.pointerId) return;
  const current = touchDrag; touchDrag = null;
  list.querySelectorAll('.is-dragging,.drop-before,.drop-after').forEach(item => item.classList.remove('is-dragging','drop-before','drop-after'));
  if (current.active && current.targetId) reorderCriterion(current.sourceId,current.targetId,current.placeAfter);
}

list.addEventListener('pointerup', finishTouchDrag);
list.addEventListener('pointercancel', finishTouchDrag);

list.addEventListener('keydown', event => {
  const handle = event.target.closest('.drag-handle');
  if (!handle || !['ArrowUp','ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const card = handle.closest('.criterion-card');
  const index = state.criteria.findIndex(item => item.id === card.dataset.id);
  const target = index + (event.key === 'ArrowUp' ? -1 : 1);
  if (target < 0 || target >= state.criteria.length) return;
  moveCriterion(index, target - index);
  requestAnimationFrame(() => list.children[target]?.querySelector('.drag-handle').focus());
});

list.addEventListener('input', event => {
  const card = event.target.closest('.criterion-card');
  if (!card) return;
  const item = state.criteria.find(x => x.id === card.dataset.id);
  if (event.target.dataset.field === 'title') item.title = event.target.value;
  if (event.target.dataset.level !== undefined) item.levels[Number(event.target.dataset.level)] = event.target.value;
  if ((event.target.dataset.field === 'title' && event.target.value.length >= 80) ||
      (event.target.dataset.level !== undefined && event.target.value.length >= 240)) {
    showLinkLengthWarning();
  }
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
    const values = Array.from({length: max + 1}, (_, score) => score).filter(score => gradeFor(score, max) === grade);
    if (!values.length) return { grade: String(grade).replace('.', ','), range: '—' };
    const first = values[0], last = values.at(-1);
    return { grade: String(grade).replace('.', ','), range: first === last ? `${first}` : `${first}–${last}` };
  });
}

function openPreview(currentAssessment = null) {
  const valid = validCriteria();
  if (!state.title.trim()) { showToast('Vul eerst de naam van het project in.'); return; }
  if (!valid.length) { showToast('Vul eerst minimaal één criterium in.'); return; }
  $('#previewTitle').textContent = state.title.trim();
  state.levelNames.forEach((name, i) => $(`#previewLevel${i + 1}`).textContent = name.trim() || `Niveau ${i + 1}`);
  $('#previewRows').innerHTML = valid.map(item => `<tr>
    <td>${escapeHtml(item.title.trim() || 'Naamloos criterium')}</td>
    ${item.levels.map(text => `<td>${escapeHtml(text.trim() || '—')}</td>`).join('')}
    <td class="score-options">${[0,1,2].map(level => `<span class="${currentAssessment?.choices?.[item.id] === level ? 'selected' : ''}">${level * item.weight}</span>`).join('')}</td>
  </tr>`).join('');
  const max = maxPoints(valid), total = currentAssessment ? assessmentScore(valid,currentAssessment) : '';
  $('#footerMax').textContent = max;
  $('#previewStudent').textContent = currentAssessment?.student || '';
  $('#previewTeacher').textContent = currentAssessment?.teacher || '';
  const previewComment = String(currentAssessment?.comment || '').trim().replace(/\s+/g, ' ');
  $('#previewComment').textContent = previewComment;
  $('#previewComment').hidden = !previewComment;
  $('#previewTotal').textContent = total;
  $('#previewGrade').textContent = isAssessmentComplete(currentAssessment,valid) ? gradeFor(total,max).toFixed(1).replace('.',',') : '';
  previewAssessment = currentAssessment;
  const readOnlySharedAssessment = sharedLinkMode && Boolean(currentAssessment);
  $('#backButton').hidden = readOnlySharedAssessment;
  $('#downloadPackage').textContent = sharedLinkMode ? 'PDF downloaden' : 'Rubricpakket downloaden';
  $('.preview-note').textContent = sharedLinkMode
    ? 'Gedeelde rubric — gegevens uit deze link worden niet online opgeslagen.'
    : 'Download de PDF en het rubricbestand samen in één rubricpakket.';
  const bands = gradeBands(max);
  $('#gradeScale').style.gridTemplateColumns = `27mm repeat(${bands.length},1fr)`;
  $('#gradeScale').innerHTML = `<div class="scale-label"><b>Behaalde punten</b><span>Cijfer</span></div>${bands.map(x => `<div class="grade-cell"><b>${x.range}</b><span>${x.grade}</span></div>`).join('')}`;
  $('#editor').style.display = 'none'; $('.app-header').style.display = 'none';
  document.body.classList.add('mobile-actions-hidden');
  $('#preview').classList.add('active'); $('#preview').setAttribute('aria-hidden','false');
  document.title = `${state.title || 'Rubric'} – PDF-preview`; window.scrollTo(0,0);
}

function closePreview() {
  $('#preview').classList.remove('active'); $('#preview').setAttribute('aria-hidden','true');
  $('#editor').style.display = ''; $('.app-header').style.display = '';
  document.body.classList.remove('mobile-actions-hidden');
  document.title = 'OnlineRubric';
}

function openHelp() {
  helpReturnToFill = $('#fillScreen').classList.contains('active');
  $('#closeHelpButton').textContent = helpReturnToFill ? '← Terug naar invullen' : '← Terug naar editor';
  closeMobileMenu(); document.body.classList.add('mobile-actions-hidden');
  if (helpReturnToFill) { $('#fillScreen').classList.remove('active'); $('#fillScreen').setAttribute('aria-hidden','true'); }
  $('#editor').style.display = 'none'; $('.app-header').style.display = 'none';
  $('#helpScreen').classList.add('active'); $('#helpScreen').setAttribute('aria-hidden','false');
  document.title = 'Uitleg – OnlineRubric'; window.scrollTo(0,0);
}

function closeHelp() {
  $('#helpScreen').classList.remove('active'); $('#helpScreen').setAttribute('aria-hidden','true');
  if (helpReturnToFill) {
    $('#fillScreen').classList.add('active'); $('#fillScreen').setAttribute('aria-hidden','false');
    document.title = `${state.title || 'Rubric'} – Online beoordelen`;
  } else {
    $('#editor').style.display = ''; $('.app-header').style.display = '';
    document.body.classList.remove('mobile-actions-hidden'); document.title = 'OnlineRubric';
  }
  helpReturnToFill = false; window.scrollTo(0,0);
}

function applyTheme() {
  document.documentElement.dataset.theme = theme;
  const themeAction = theme === 'dark' ? 'Lichte modus inschakelen' : 'Donkere modus inschakelen';
  [$('#themeToggle'),$('#fillThemeToggle')].forEach(button => {
    button.setAttribute('aria-label',themeAction); button.title = themeAction;
    button.setAttribute('aria-pressed', theme === 'dark');
  });
  $('#mobileThemeToggle span').textContent = theme === 'dark' ? 'Licht thema' : 'Donker thema';
  $('#mobileThemeToggle').setAttribute('aria-pressed', theme === 'dark');
}

function exportSettings() {
  const data = JSON.stringify({...state, exportedAt: new Date().toISOString()}, null, 2);
  const blob = new Blob([data], {type:'application/json'});
  const link = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: `${slug(state.title) || 'rubric'}.rubric.json`});
  link.click(); URL.revokeObjectURL(link.href); showToast('Rubric opgeslagen.');
}

function studentListExportData() {
  return {
    type:'rubricbouwer-leerlingen',version:1,exportedAt:new Date().toISOString(),
    className:assessmentBook.className || '',
    students:assessmentBook.assessments.map(item => item.student.trim()).filter(Boolean)
  };
}

function downloadStudentList() {
  const data = studentListExportData();
  if (!data.students.length) { showToast('Vul eerst minimaal één leerlingnaam in.'); return; }
  const className = safeName(data.className) || 'Klas';
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const link = Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`Leerlinglijst ${className}.json`});
  link.click(); setTimeout(() => URL.revokeObjectURL(link.href),1000); showToast('Leerlinglijst opgeslagen.');
}

function openRubricExportDialog() {
  const count = assessmentBook.assessments.length;
  $('#rubricExportAssessmentCount').textContent = `${count} beoordeling${count === 1 ? '' : 'en'}`;
  $('#rubricExportDialog').showModal();
}

function closeRubricExportDialog() {
  $('#rubricExportDialog').close();
}

function buildPdf(valid, max, currentAssessment = null) {
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
  if (isAssessmentComplete(currentAssessment,valid)) { pdf.setTextColor(...navy); pdf.setFont('helvetica','bold'); pdf.setFontSize(12); pdf.text(gradeFor(assessmentScore(valid,currentAssessment),max).toFixed(1).replace('.',','),271,15.7,{align:'center'}); }
  const comment = String(currentAssessment?.comment || '').trim().replace(/\s+/g, ' ');
  pdf.setDrawColor(82,101,109); pdf.setLineWidth(.25);
  pdf.text('Naam leerling', 14, 35); pdf.line(41, 35, 142, 35);
  pdf.text('Docent', 154, 35); pdf.line(169, 35, 283, 35);
  if (currentAssessment) { pdf.setFont('helvetica','normal'); pdf.setTextColor(...navy); pdf.text(currentAssessment.student || '',43,34); pdf.text(currentAssessment.teacher || '',171,34); }
  if (comment) {
    pdf.setFont('helvetica','normal'); pdf.setTextColor(...navy); pdf.setFontSize(6.8);
    while (pdf.getTextWidth(comment) > 269 && pdf.getFontSize() > 5.8) pdf.setFontSize(pdf.getFontSize() - .2);
    pdf.text(comment,14,40);
  }
  const headers = ['Criterium', ...state.levelNames.map((x, i) => x.trim() || `Niveau ${i + 1}`), 'Score'];
  const rows = valid.map(item => [item.title.trim() || 'Naamloos criterium', ...item.levels.map(x => x.trim() || '—'), '']);
  pdf.autoTable({
    startY: comment ? 44 : 40, head: [headers], body: rows, margin: {left:14,right:14,bottom:35},
    styles: {font:'helvetica',fontSize:7.2,cellPadding:comment ? 1.9 : 2.1,valign:'middle',lineColor:[203,211,214],lineWidth:.2,textColor:[24,48,62]},
    headStyles: {fillColor:navy,textColor:255,fontStyle:'bold',halign:'center'},
    alternateRowStyles: {fillColor:[241,245,246]},
    columnStyles: {0:{cellWidth:43,fontStyle:'bold'},1:{cellWidth:64},2:{cellWidth:64},3:{cellWidth:64},4:{cellWidth:34,halign:'center',fontStyle:'bold'}},
    didDrawCell(data) {
      if (data.section !== 'body' || data.column.index !== 4) return;
      const item = valid[data.row.index], values = [0, item.weight, item.weight * 2];
      const centerY = data.cell.y + data.cell.height / 2, spacing = 9;
      values.forEach((value, i) => {
        const x = data.cell.x + data.cell.width / 2 + (i - 1) * spacing;
        const selected = currentAssessment?.choices?.[item.id] === i;
        pdf.setDrawColor(...(selected ? orange : [145,160,165])); pdf.setLineWidth(.25);
        if (selected) pdf.setFillColor(...orange);
        pdf.circle(x,centerY,3,selected ? 'FD' : 'S');
        pdf.setTextColor(...(selected ? [255,255,255] : [24,48,62])); pdf.setFont('helvetica','bold'); pdf.setFontSize(6.5);
        pdf.text(String(value),x,centerY+1.1,{align:'center'});
      });
    }
  });
  const totalY = pdf.lastAutoTable.finalY + 5;
  pdf.setTextColor(...navy); pdf.setFont('helvetica','bold'); pdf.setFontSize(7);
  pdf.text('Totaalscore',249,totalY); pdf.setDrawColor(82,101,109); pdf.line(249,totalY+5,271,totalY+5);
  pdf.setFont('helvetica','normal'); pdf.text(`/ ${max}`,274,totalY+5);
  if (currentAssessment) { pdf.setFont('helvetica','bold'); pdf.text(String(assessmentScore(valid,currentAssessment)),260,totalY+4,{align:'center'}); }
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
  pdf.setProperties({title: state.title || 'Rubric', subject:'Printbare beoordelingsrubric', creator:'OnlineRubric'});
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

function downloadPreviewPdf() {
  const valid = validCriteria();
  if (!valid.length) { showToast('Deze rubric bevat geen criteria.'); return; }
  const studentSuffix = previewAssessment?.student ? ` - ${safeName(previewAssessment.student)}` : '';
  buildPdf(valid, maxPoints(valid), previewAssessment).save(`${safeName(state.title) || 'Rubric'}${studentSuffix}.pdf`);
  showToast('PDF gedownload.');
}

function safeName(value) { return String(value).trim().replace(/[<>:"/\\|?*\x00-\x1F]/g,'-').replace(/[. ]+$/,'').slice(0,80); }

function assessmentFileBase() {
  const title = safeName(state.title) || 'Rubric';
  const className = safeName(assessmentBook.className);
  return className ? `${title} - ${className}` : title;
}

function openFill() {
  const valid = validCriteria();
  if (!state.title.trim() || !valid.length) { showToast('Vul eerst de projectnaam en minimaal één criterium in.'); return; }
  if (assessmentBook.rubricTitle !== state.title) {
    const first = blankAssessment(assessment.teacher || '');
    first.rubricTitle = state.title;
    assessmentBook = {rubricTitle:state.title,className:'',activeId:first.id,assessments:[first]};
    assessment = first;
  }
  closeMobileMenu(); document.body.classList.add('mobile-actions-hidden');
  $('#editor').style.display = 'none'; $('.app-header').style.display = 'none'; $('#preview').classList.remove('active');
  $('#fillScreen').classList.add('active'); $('#fillScreen').setAttribute('aria-hidden','false');
  $('#fillProjectTitle').textContent = state.title;
  renderFill(); window.scrollTo(0,0);
}

function closeFill() {
  $('#fillScreen').classList.remove('active'); $('#fillScreen').setAttribute('aria-hidden','true');
  $('#editor').style.display = ''; $('.app-header').style.display = ''; document.body.classList.remove('mobile-actions-hidden'); document.title = 'OnlineRubric';
}

function renderFill() {
  const valid = validCriteria();
  const activeIndex = assessmentBook.assessments.findIndex(item => item.id === assessment.id);
  $('#studentSelect').innerHTML = assessmentBook.assessments.map((item,index) => {
    const complete = valid.length && valid.every(criterion => Number.isInteger(item.choices?.[criterion.id]));
    return `<option value="${item.id}" ${item.id === assessment.id ? 'selected' : ''}>${complete ? '✓' : '○'} ${index + 1}. ${escapeHtml(item.student || 'Naam nog invullen')}</option>`;
  }).join('');
  $('#studentCounter').textContent = `Leerling ${activeIndex + 1} van ${assessmentBook.assessments.length}`;
  $('#previousStudentButton').disabled = activeIndex <= 0;
  $('#nextStudentButton').disabled = activeIndex >= assessmentBook.assessments.length - 1;
  $('#removeStudentButton').disabled = assessmentBook.assessments.length === 1;
  $('#className').value = assessmentBook.className || '';
  $('#studentName').value = assessment.student || '';
  $('#teacherName').value = assessment.teacher || '';
  $('#assessmentComment').value = assessment.comment || '';
  $('#assessmentCommentCount').textContent = `${(assessment.comment || '').length}/160`;
  $('#fillCriteria').innerHTML = valid.map(item => `<article class="fill-row" data-id="${item.id}"><div class="fill-row-title">${escapeHtml(item.title || 'Naamloos criterium')}</div>${item.levels.map((text,i) => `<button class="level-choice ${assessment.choices?.[item.id] === i ? 'selected' : ''}" data-level="${i}"><small>${escapeHtml(state.levelNames[i].trim() || `Niveau ${i + 1}`)}</small>${escapeHtml(text || '—')}<b>${i*item.weight}</b></button>`).join('')}</article>`).join('');
  const answered = valid.filter(item => Number.isInteger(assessment.choices?.[item.id])).length, max = maxPoints(valid), total = assessmentScore(valid);
  $('#fillProgress').textContent = `${answered}/${valid.length}`; $('#fillTotal').textContent = `${total}/${max}`;
  $('#fillGrade').textContent = answered === valid.length ? gradeFor(total,max).toFixed(1).replace('.',',') : '—';
  saveAssessmentBook();
}

function openSharedAssessment(currentAssessment) {
  const valid = validCriteria();
  previewAssessment = currentAssessment;
  document.documentElement.dataset.theme = 'light';
  document.body.classList.add('mobile-actions-hidden');
  $('#editor').style.display = 'none';
  $('.app-header').style.display = 'none';
  $('#preview').classList.remove('active');
  $('#fillScreen').classList.remove('active');
  $('#sharedProjectTitle').textContent = state.title;
  $('#sharedStudentName').textContent = currentAssessment.student || '—';
  $('#sharedTeacherName').textContent = currentAssessment.teacher || '—';
  const comment = String(currentAssessment.comment || '').trim();
  $('#sharedComment').textContent = comment;
  $('#sharedComment').hidden = !comment;
  $('#sharedCriteria').innerHTML = valid.map(item => `<article class="fill-row" data-id="${item.id}">
    <div class="fill-row-title">${escapeHtml(item.title || 'Naamloos criterium')}</div>
    ${item.levels.map((text, i) => {
      const selected = currentAssessment.choices?.[item.id] === i;
      const levelName = state.levelNames[i].trim() || `Niveau ${i + 1}`;
      const points = i * item.weight;
      const label = `${levelName}: ${text || '—'}; ${points} ${points === 1 ? 'punt' : 'punten'}${selected ? '; geselecteerd' : ''}`;
      return `<div class="level-choice ${selected ? 'selected' : ''}" role="group" aria-label="${escapeHtml(label)}">
        <small>${escapeHtml(levelName)}</small>${escapeHtml(text || '—')}<b>${points}</b>
      </div>`;
    }).join('')}
  </article>`).join('');
  const max = maxPoints(valid), total = assessmentScore(valid, currentAssessment);
  $('#sharedTotal').textContent = `${total}/${max}`;
  $('#sharedGrade').textContent = isAssessmentComplete(currentAssessment, valid) ? gradeFor(total, max).toFixed(1).replace('.', ',') : '—';
  $('#sharedAssessmentScreen').classList.add('active');
  $('#sharedAssessmentScreen').setAttribute('aria-hidden', 'false');
  document.title = `${state.title || 'Rubric'} – Gedeelde beoordeling`;
  window.scrollTo(0, 0);
}

function addStudentAssessment() {
  const next = blankAssessment(assessment.teacher || '');
  next.rubricTitle = state.title;
  assessmentBook.assessments.push(next); assessmentBook.activeId = next.id; assessment = next;
  renderFill(); $('#studentName').focus();
}

function selectStudentAssessment(id) {
  const selected = assessmentBook.assessments.find(item => item.id === id); if (!selected) return;
  assessmentBook.activeId = id; assessment = selected; renderFill();
}

function stepStudentAssessment(direction) {
  const index = assessmentBook.assessments.findIndex(item => item.id === assessment.id);
  const next = assessmentBook.assessments[index + direction]; if (!next) return;
  selectStudentAssessment(next.id);
}

function removeStudentAssessment(id) {
  if (assessmentBook.assessments.length === 1) return;
  const index = assessmentBook.assessments.findIndex(item => item.id === id); if (index < 0) return;
  assessmentBook.assessments.splice(index,1);
  assessment = assessmentBook.assessments[Math.min(index, assessmentBook.assessments.length - 1)];
  assessmentBook.activeId = assessment.id; renderFill();
}

async function downloadAllAssessments() {
  const valid = validCriteria();
  const named = assessmentBook.assessments.filter(item => item.student.trim());
  const completed = named.filter(item => isAssessmentComplete(item,valid));
  const skipped = named.length - completed.length;
  if (!completed.length) { showToast('Rond eerst minimaal één beoordeling volledig af.'); return; }
  const button = $('#downloadAllButton');
  button.disabled = true; button.setAttribute('aria-busy','true');
  try {
    const folderName = assessmentFileBase(), zip = new JSZip(), folder = zip.folder(folderName);
    completed.forEach((item,index) => {
      const order = String(index + 1).padStart(2,'0');
      folder.file(`${order} - ${safeName(item.student) || `Leerling ${index + 1}`}.pdf`, buildPdf(valid,maxPoints(valid),item).output('arraybuffer'));
    });
    folder.file(`${folderName} - beoordelingen.json`, JSON.stringify(assessmentExportData(), null, 2));
    const blob = await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
    const link = Object.assign(document.createElement('a'), {href:URL.createObjectURL(blob),download:`${folderName} - ingevulde rubrics.zip`});
    link.click(); setTimeout(() => URL.revokeObjectURL(link.href),1000);
    showToast(`${completed.length} PDF’s en het klasbestand gedownload${skipped ? `; ${skipped} onvolledige beoordeling${skipped === 1 ? '' : 'en'} overgeslagen` : ''}.`);
  } catch (error) { console.error(error); showToast('De gezamenlijke download is niet gelukt.'); }
  finally { button.disabled = false; button.removeAttribute('aria-busy'); }
}

function assessmentExportData() {
  const valid = validCriteria(), max = maxPoints(valid);
  return {
    type:'rubricbouwer-beoordelingen',version:1,exportedAt:new Date().toISOString(),className:assessmentBook.className || '',
    rubric:{version:state.version,title:state.title,levelNames:state.levelNames,criteria:state.criteria},
    assessments:assessmentBook.assessments.map(item => {
      const answered = valid.filter(criterion => Number.isInteger(item.choices?.[criterion.id])).length;
      const total = assessmentScore(valid,item), complete = valid.length > 0 && answered === valid.length;
      return {id:item.id,student:item.student,teacher:item.teacher,comment:String(item.comment || '').slice(0,160),choices:item.choices,answered,criteriaCount:valid.length,total,max,complete,grade:complete ? gradeFor(total,max) : null};
    })
  };
}

function downloadAssessmentsJson() {
  const folderName = assessmentFileBase();
  const blob = new Blob([JSON.stringify(assessmentExportData(),null,2)],{type:'application/json'});
  const link = Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`${folderName} - beoordelingen.json`});
  link.click(); setTimeout(() => URL.revokeObjectURL(link.href),1000); showToast('Klasbestand opgeslagen.');
}

async function gzipEncode(value) {
  const stream = new Blob([value]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function gzipDecode(value) {
  const padded = value.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-value.length%4)%4);
  const binary = atob(padded), bytes = Uint8Array.from(binary,c=>c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

async function makeShareLink(includeAssessment) {
  try {
    if (includeAssessment && !assessment.student.trim()) { showToast('Vul eerst de voornaam van de leerling in.'); return; }
    if (includeAssessment && !isAssessmentComplete(assessment)) { showToast('Vul eerst alle criteria voor deze leerling in.'); return; }
    const sharedState = {version:state.version,title:state.title,levelNames:state.levelNames,criteria:state.criteria};
    const payload = {v:1,r:sharedState,...(includeAssessment ? {a:assessment} : {})};
    const encoded = await gzipEncode(JSON.stringify(payload));
    const url = `${location.origin}${location.pathname}#rubric=v1.${encoded}`;
    await navigator.clipboard.writeText(url);
    showToast(`${includeAssessment ? 'Deellink voor leerling' : 'Deellink naar rubric'} gekopieerd (${url.length} tekens).`);
  } catch (error) { console.error(error); showToast('Deellink maken is niet gelukt.'); }
}

async function loadSharedLink() {
  const match = location.hash.match(/^#rubric=v1\.([A-Za-z0-9_-]+)$/); if (!match) return;
  try {
    const payload = JSON.parse(await gzipDecode(match[1]));
    state = normalizeState(payload.r); sharedLinkMode = true; renderEditor();
    if (payload.a) assessment = {...payload.a,comment:String(payload.a.comment || '').slice(0,160),choices:payload.a.choices || {}};
    if (payload.a) openSharedAssessment(assessment);
    else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      history.replaceState(null, '', `${location.pathname}${location.search}`);
      showToast('Gedeelde rubric geopend in de editor.');
    }
  } catch (error) { console.error(error); showToast('Deze deellink kan niet worden gelezen.'); }
}

function slug(value) { return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
function showToast(message, duration = 2400) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), duration); }
function showLinkLengthWarning() {
  if (linkLengthWarningShown || localStorage.getItem(LINK_LENGTH_WARNING_KEY)) return;
  linkLengthWarningShown = true;
  $('#linkLengthWarning').hidden = false;
}

function startNewRubric() {
  if (!confirm('Een nieuwe rubric starten? De huidige versie blijft alleen behouden als je die eerst opslaat.')) return;
  state = defaultState(); sharedLinkMode = false; resetAssessmentBook(); renderEditor(); applyTheme(); scheduleSave();
}

function openMobileMenu() {
  const menu = $('#mobileMenu');
  menu.hidden = false; document.body.classList.add('mobile-menu-open');
  $('#mobileMenuToggle').setAttribute('aria-expanded','true');
  requestAnimationFrame(() => $('#mobileMenuClose').focus());
}

function closeMobileMenu() {
  const menu = $('#mobileMenu');
  if (!menu || menu.hidden) return;
  menu.hidden = true; document.body.classList.remove('mobile-menu-open');
  $('#mobileMenuToggle').setAttribute('aria-expanded','false');
}

function toggleTheme() {
  theme = theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, theme);
  applyTheme();
}

$('#importFile').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    prepareImport(payload, $('#fillScreen').classList.contains('active'));
  }
  catch { showToast('Dit bestand is geen geldige rubric, leerlinglijst of klasbestand.'); }
  event.target.value = '';
});

$('#newRubric').addEventListener('click', startNewRubric);
$('#importButton').addEventListener('click', () => $('#importFile').click());
$('#cancelAssessmentImport').addEventListener('click', closeAssessmentImportDialog);
$('#assessmentImportDialog').addEventListener('cancel', () => { pendingAssessmentImport = null; pendingImportReturnToFill = false; });
$('#importRubricOnly').addEventListener('click', () => {
  if (!pendingAssessmentImport) return;
  const payload = pendingAssessmentImport, returnToFill = pendingImportReturnToFill;
  importRubricOnly(payload); closeAssessmentImportDialog();
  if (returnToFill) { $('#fillProjectTitle').textContent = state.title; renderFill(); }
  showToast('Alleen de rubric is geopend.');
});
$('#importStudentListOnly').addEventListener('click', () => {
  if (!pendingAssessmentImport) return;
  const payload = pendingAssessmentImport, returnToFill = pendingImportReturnToFill;
  restoreStudentList(payload); closeAssessmentImportDialog();
  if (returnToFill) renderFill();
  showToast(`${assessmentBook.assessments.filter(item => item.student).length} leerlingen geopend.`);
});
$('#importRubricAndAssessments').addEventListener('click', () => {
  if (!pendingAssessmentImport) return;
  const payload = pendingAssessmentImport, returnToFill = pendingImportReturnToFill;
  restoreAssessmentExport(payload); closeAssessmentImportDialog();
  if (returnToFill) { $('#fillProjectTitle').textContent = state.title; renderFill(); }
  showToast(`${assessmentBook.assessments.length} beoordelingen geopend.`);
});
$('#helpButton').addEventListener('click', openHelp);
$('#closeHelpButton').addEventListener('click', closeHelp);
$('#themeToggle').addEventListener('click', toggleTheme);
$('#exportButton').addEventListener('click', openRubricExportDialog);
$('#cancelRubricExport').addEventListener('click', closeRubricExportDialog);
$('#rubricExportDialog').addEventListener('cancel', closeRubricExportDialog);
$('#exportRubricOnly').addEventListener('click', () => { closeRubricExportDialog(); exportSettings(); });
$('#exportStudentListOnly').addEventListener('click', () => { closeRubricExportDialog(); downloadStudentList(); });
$('#exportRubricAndAssessments').addEventListener('click', () => { closeRubricExportDialog(); downloadAssessmentsJson(); });
$('#shareRubricButton').addEventListener('click', () => makeShareLink(false));
$('#fillButton').addEventListener('click', openFill);
$('#addCriterionBottom').addEventListener('click', () => addCriterion());
$('#previewButton').addEventListener('click', () => openPreview());
$('#backButton').addEventListener('click', closePreview);
$('#downloadPackage').addEventListener('click', () => sharedLinkMode ? downloadPreviewPdf() : downloadPackage());
$('#closeFillButton').addEventListener('click', closeFill);
$('#fillHelpButton').addEventListener('click', openHelp);
$('#fillThemeToggle').addEventListener('click', toggleTheme);
$('#fillImportButton').addEventListener('click', () => $('#importFile').click());
$('#fillExportButton').addEventListener('click', openRubricExportDialog);
$('#shareFilledButton').addEventListener('click', () => makeShareLink(true));
$('#addStudentButton').addEventListener('click', addStudentAssessment);
$('#removeStudentButton').addEventListener('click', () => removeStudentAssessment(assessment.id));
$('#previousStudentButton').addEventListener('click', () => stepStudentAssessment(-1));
$('#nextStudentButton').addEventListener('click', () => stepStudentAssessment(1));
$('#studentSelect').addEventListener('change', event => selectStudentAssessment(event.target.value));
$('#downloadAllButton').addEventListener('click', downloadAllAssessments);
$('#filledPdfButton').addEventListener('click', () => {
  const valid = validCriteria(); if (!assessment.student.trim()) { showToast('Vul eerst de voornaam van de leerling in.'); return; }
  if (!isAssessmentComplete(assessment,valid)) { showToast('Vul eerst alle criteria voor deze leerling in.'); return; }
  buildPdf(valid,maxPoints(valid),assessment).save(`${assessmentFileBase()} - ${safeName(assessment.student)}.pdf`);
});
$('#sharedPdfButton').addEventListener('click', downloadPreviewPdf);

$('#mobileMenuToggle').addEventListener('click', openMobileMenu);
$('#mobileMenuClose').addEventListener('click', closeMobileMenu);
$('.mobile-menu-backdrop').addEventListener('click', closeMobileMenu);
$('#mobileNewRubric').addEventListener('click', () => { closeMobileMenu(); startNewRubric(); });
$('#mobileImportRubric').addEventListener('click', () => { closeMobileMenu(); $('#importFile').click(); });
$('#mobileExportRubric').addEventListener('click', () => { closeMobileMenu(); openRubricExportDialog(); });
$('#mobileShareRubric').addEventListener('click', () => { closeMobileMenu(); makeShareLink(false); });
$('#mobileThemeToggle').addEventListener('click', () => { toggleTheme(); closeMobileMenu(); });
$('#mobileHelpButton').addEventListener('click', () => { closeMobileMenu(); openHelp(); });
$('#mobileFillButton').addEventListener('click', openFill);
$('#mobilePreviewButton').addEventListener('click', () => openPreview());
$('#dismissLinkLengthWarning').addEventListener('click', () => {
  if ($('#hideLinkLengthWarning').checked) localStorage.setItem(LINK_LENGTH_WARNING_KEY, 'hidden');
  $('#linkLengthWarning').hidden = true;
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#mobileMenu').hidden) { closeMobileMenu(); $('#mobileMenuToggle').focus(); }
});

document.addEventListener('click', event => {
  document.querySelectorAll('.action-menu[open]').forEach(menu => {
    if (!menu.contains(event.target) || event.target.closest('.action-menu-panel button')) menu.removeAttribute('open');
  });
});
$('#studentName').addEventListener('input', event => { assessment.student=event.target.value; renderFill(); });
$('#teacherName').addEventListener('input', event => { assessment.teacher=event.target.value; renderFill(); });
$('#assessmentComment').addEventListener('input', event => {
  assessment.comment = event.target.value.slice(0,160);
  $('#assessmentCommentCount').textContent = `${assessment.comment.length}/160`;
  saveAssessmentBook();
});
$('#className').addEventListener('input', event => { assessmentBook.className=event.target.value; saveAssessmentBook(); });
$('#fillCriteria').addEventListener('click', event => {
  const button=event.target.closest('.level-choice'), row=event.target.closest('.fill-row'); if(!button||!row)return;
  assessment.choices[row.dataset.id]=Number(button.dataset.level); renderFill();
});

applyTheme();
renderEditor();
loadSharedLink();
