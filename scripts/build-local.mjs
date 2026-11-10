// Build a strict static allowlist for Wrangler Pages (Advanced Mode).
// Never serve the repository root: it also contains Java/SQL/tests/secrets.
import { copyFileSync, cpSync, mkdirSync, readdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(root,'.local-pages');
export function includedFiles(){
  const allowed=new Set(['_worker.js','_headers','_routes.json','robots.txt','rules-defaults.json']);
  return readdirSync(root).filter(name => statSync(resolve(root,name)).isFile() &&
    (allowed.has(name) || /\.(?:html|js|css)$/.test(name))).sort();
}
export function buildLocal(){
  rmSync(out,{recursive:true,force:true});
  mkdirSync(out,{recursive:true});
  for(const name of includedFiles()) copyFileSync(resolve(root,name),resolve(out,name));
  if(existsSync(resolve(root,'assets')))cpSync(resolve(root,'assets'),resolve(out,'assets'),{recursive:true});
  if(!existsSync(resolve(out,'_worker.js')) || !existsSync(resolve(out,'index.html')))
    throw Error('Source website SSCircle tidak lengkap.');
  return {output:out,files:includedFiles().length};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=buildLocal();
  console.log(`[SSCircle] ${result.files} file aplikasi + assets disiapkan di .local-pages`);
}
