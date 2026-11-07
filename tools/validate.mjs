// Validate BJT content packs. Usage: node tools/validate.mjs [file...]
// With no args, validates everything listed in content/manifest.json and checks ID uniqueness.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'content');
const ALLOWED_TAGS = new Set('table thead tbody tr th td p b strong ul ol li br div span h4 small'.split(' '));
let errors = 0;
const err = (f, id, msg) => { errors++; console.log(`✗ ${f} ${id ?? ''}: ${msg}`); };

function checkQuestion(f, q) {
  const id = q.id;
  if (typeof id !== 'string') return err(f, '?', 'missing id');
  if (![1, 2, 3].includes(q.part)) err(f, id, 'part must be 1-3');
  if (![1, 2, 3].includes(q.section)) err(f, id, 'section must be 1-3');
  if (!['official', 'original'].includes(q.source)) err(f, id, 'bad source');
  if (![1, 2, 3].includes(q.difficulty)) err(f, id, 'difficulty must be 1-3');
  if (!Array.isArray(q.tags)) err(f, id, 'tags must be array');
  if (!Array.isArray(q.choices) || q.choices.length !== 4 || q.choices.some(c => typeof c !== 'string' || !c.trim()))
    err(f, id, 'choices must be 4 non-empty strings');
  else if (new Set(q.choices).size !== 4) err(f, id, 'duplicate choices');
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) err(f, id, 'answer must be 0-3');
  if (!q.explanation || q.explanation.length < 20) err(f, id, 'explanation missing/too short');
  if (q.source === 'original') {
    if (q.part === 1) {
      if (!q.scene) err(f, id, 'P1 needs scene');
      if (q.choicesSpoken !== true) err(f, id, 'P1 needs choicesSpoken: true');
    }
    if (q.part !== 3) {
      const a = q.audio;
      if (!a || !Array.isArray(a.lines) || !a.lines.length) err(f, id, 'P1/P2 need audio.lines');
      else {
        if (!a.question) err(f, id, 'audio.question missing');
        for (const l of a.lines) {
          if (!l.spk || !l.text) err(f, id, 'audio line needs spk+text');
          else if (!a.speakers?.[l.spk]) err(f, id, `speaker ${l.spk} not in audio.speakers`);
        }
        for (const [k, s] of Object.entries(a.speakers ?? {}))
          if (!['m', 'f'].includes(s.gender)) err(f, id, `speaker ${k} gender must be m/f`);
      }
    }
    if (q.part >= 2 && !q.prompt) err(f, id, 'P2/P3 need prompt');
    if (q.part === 3 && q.section === 1 && !/＿/.test(q.prompt ?? '')) err(f, id, 'P3 S1 prompt needs a ＿ blank');
    if (q.part === 3 && q.section === 3 && !q.passage) err(f, id, 'P3 S3 needs passage');
  }
  const m = q.material;
  if (m) {
    if (m.kind === 'chart') {
      const c = m.chart;
      if (!c || !['bar', 'line', 'pie'].includes(c.type)) err(f, id, 'chart.type bad');
      else if (!Array.isArray(c.labels) || !Array.isArray(c.series) || !c.series.length) err(f, id, 'chart needs labels+series');
      else for (const s of c.series)
        if (!Array.isArray(s.values) || s.values.length !== c.labels.length || s.values.some(v => typeof v !== 'number'))
          err(f, id, `series "${s.name}" values must be ${c.labels.length} numbers`);
    } else if (m.kind === 'html') {
      for (const [, tag] of (m.html ?? '').matchAll(/<\/?([a-zA-Z0-9]+)/g))
        if (!ALLOWED_TAGS.has(tag.toLowerCase())) err(f, id, `html tag <${tag}> not allowed`);
      if (/\s(style|on\w+)=/i.test(m.html ?? '')) err(f, id, 'html attributes style/on* not allowed');
    } else err(f, id, 'material.kind must be chart|html');
  }
}

function checkCard(f, c) {
  const id = c.id ?? '?';
  for (const k of ['id', 'front', 'meaning', 'example', 'exampleEn', 'level'])
    if (typeof c[k] !== 'string' || !c[k].trim()) err(f, id, `card.${k} missing`);
  if (typeof c.reading !== 'string') err(f, id, 'card.reading must be string');
  if (c.level && !['N2', 'N1', 'BJT'].includes(c.level)) err(f, id, 'level must be N2|N1|BJT');
}

function checkFile(path) {
  const f = path.replace(/\\/g, '/').split('/content/').pop();
  let data;
  try { data = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { err(f, null, 'invalid JSON: ' + e.message); return []; }
  if (Array.isArray(data.questions)) { data.questions.forEach(q => checkQuestion(f, q)); return data.questions.map(q => q.id); }
  if (Array.isArray(data.cards)) {
    if (!['vocab', 'kanji', 'keigo', 'phrase', 'grammar'].includes(data.deck)) err(f, null, 'bad deck');
    data.cards.forEach(c => checkCard(f, c)); return data.cards.map(c => c.id);
  }
  err(f, null, 'neither questions[] nor cards[]'); return [];
}

const args = process.argv.slice(2);
let files = args.map(a => resolve(a));
if (!files.length) {
  const man = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
  files = [...man.questionPacks, ...man.cardPacks].map(p => resolve(root, p.file));
}
const seen = new Map();
for (const file of files) for (const id of checkFile(file)) {
  if (seen.has(id)) err(file, id, `duplicate id (also in ${seen.get(id)})`);
  seen.set(id, file);
}
console.log(errors ? `\n${errors} error(s) in ${files.length} file(s)` : `✓ ${files.length} file(s), ${seen.size} items OK`);
process.exit(errors ? 1 : 0);
