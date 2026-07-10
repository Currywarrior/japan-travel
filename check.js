const fs = require('fs');
const code = fs.readFileSync('data.js', 'utf8').replace("'use strict';", '');
const m = new Function(code + '\nreturn { PREF, REGION };')();
const PREF = m.PREF;

const results = [];
for (const [id, p] of Object.entries(PREF)) {
  const noImgSights = (p.sights || []).filter(s => !s.img || s.img.trim() === '').map(s => s.name);
  const noImgFood = (p.food || []).filter(f => !f.img || f.img.trim() === '').map(f => f.name);
  results.push({
    id, name: p.name,
    sights: (p.sights || []).length,
    food: (p.food || []).length,
    noImgSights, noImgFood
  });
}
results.sort((a, b) => parseInt(a.id) - parseInt(b.id));

let totalNoImg = 0;
let hasIssue = false;
for (const r of results) {
  const issues = [];
  if (r.sights === 0) issues.push('無景點');
  if (r.sights < 5) issues.push(`景點不足(${r.sights})`);
  if (r.food === 0) issues.push('無美食');
  if (r.food < 5) issues.push(`美食不足(${r.food})`);
  if (r.noImgSights.length) issues.push('景點缺圖: ' + r.noImgSights.join(', '));
  if (r.noImgFood.length) issues.push('美食缺圖: ' + r.noImgFood.join(', '));
  totalNoImg += r.noImgSights.length + r.noImgFood.length;
  if (issues.length) {
    console.log(`[${r.id.padStart(2)}] ${r.name.padEnd(5)} 景點${r.sights} 美食${r.food} | ${issues.join(' | ')}`);
    hasIssue = true;
  }
}
if (!hasIssue) console.log('所有縣均有 5+ 景點、5+ 美食且無缺圖');
console.log('---');
console.log('缺圖條目總數:', totalNoImg);
console.log('總縣數:', results.length);
