// npm run auto: git add . → git commit -m "<today>" → git push → npm run deploy
import { execSync } from 'node:child_process';

const run = cmd => { console.log(`\n> ${cmd}`); execSync(cmd, { stdio: 'inherit' }); };
const d = new Date(), pad = n => String(n).padStart(2, '0');
const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

run('git add .');
// Nothing staged → skip the commit but still push and deploy.
const staged = execSync('git diff --cached --name-only').toString().trim();
if (staged) run(`git commit -m "${today}"`);
else console.log('\n沒有新的變更，略過 commit');
run('git push');
run('npm run deploy');
console.log(`\n完成：${today} 已推送並部署`);
