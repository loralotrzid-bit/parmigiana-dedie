import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root=process.cwd(), destination=path.resolve(root,'..','livraison-la-parmigiana');
assert(!fs.existsSync(destination),'Delivery folder already exists');
const env=fs.readFileSync('.env.local','utf8');
const vars=Object.fromEntries(env.trim().split(/\r?\n/).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,'')];}));
assert.deepEqual(Object.keys(vars).sort(),['VITE_SUPABASE_PROJECT_ID','VITE_SUPABASE_PUBLISHABLE_KEY','VITE_SUPABASE_URL']);
assert.equal(vars.VITE_SUPABASE_PROJECT_ID,'aehfmqoxvfuizcloowlj');
assert.equal(vars.VITE_SUPABASE_URL,'https://aehfmqoxvfuizcloowlj.supabase.co');
assert(vars.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_'));
assert(fs.existsSync('dist/index.html'),'Build first');
const files=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{encoding:'utf8'}).split('\0').filter(Boolean);
const source=path.join(destination,'app');fs.mkdirSync(source,{recursive:true});
for(const file of files){
 if(['.env','.env.local','.prewarm','bun.lock','bun.lockb'].includes(file)||file.includes('.local.')||file.endsWith('.log'))continue;
 assert(!file.split(/[\\/]/).includes('..'));
 const target=path.join(source,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);
}
fs.writeFileSync(path.join(source,'.env'),env);
fs.cpSync('dist',path.join(destination,'site'),{recursive:true});
fs.writeFileSync(path.join(destination,'netlify.toml'),'[build]\n  base = "app"\n  command = "npm ci && npm run build"\n  publish = "dist"\n\n[build.environment]\n  NODE_VERSION = "22"\n');
fs.writeFileSync(path.join(destination,'ENVIRONNEMENT.md'),'# Variables publiques Supabase\n\nLe projet actuel est conservé. Ces trois valeurs sont publiques, intégrées au\nJavaScript du site et fournies dans `app/.env` :\n\n```dotenv\n'+env+'\n```\n\nPour un build Netlify/Lovable, les renseigner aussi dans la configuration de\nl’hébergeur si celui-ci ignore les fichiers `.env`. Après modification, reconstruire.\nAucune clé service-role, clé privée ou mot de passe inclus.\n');
const guide=`# La Parmigiana — ZIP universel Lovable / Netlify

## Contenu

- app/ : sources React/Vite, tests, PDF, documentation et fonctions Supabase.
- site/ : site compilé du même code, prêt à déposer sur Netlify.
- ENVIRONNEMENT.md : trois variables publiques Supabase déjà renseignées.
- netlify.toml : build depuis app/, sortie dist, Node 22.

## Netlify, publication manuelle

Dézipper, puis déposer **le dossier site/** dans Netlify Deploy.
Ne pas déposer le ZIP universel entier : il contient aussi les sources.

## Netlify, build continu

Utiliser cette arborescence dans le dépôt relié à Netlify. La configuration racine
utilise app/ comme base et npm ci && npm run build. Si seul app/ est importé,
son propre netlify.toml construit depuis cette racine.

## Lovable

Fournir ce ZIP et utiliser les sources app/. Conserver le Supabase externe actuel,
ses données et les fonctions digital-menu, cart-api, create-order déjà déployées.
Ne pas créer une autre base et ne pas rejouer les migrations sur la base courante.
Le mode d’import peut demander une adaptation par Lovable. Utiliser les variables
de ENVIRONNEMENT.md ; ne pas réactiver Google, actuellement seulement visuel.

## Avant exploitation

Lire app/docs/verification-et-deploiement.md. **Aucun compte administrateur actif
n’est encore configuré dans la nouvelle base** : la réception n’a pas été testée
avec un compte admin réel. La commande utilisateur 008 n’a pas été modifiée.
La base et le site public n’ont pas été modifiés pendant la revue de livraison.

Après publication : ouvrir https://VOTRE-DOMAINE/menu/la-parmigiana, vérifier une
commande et sa réception restaurant, puis inscrire cette URL dans les QR/NFC.
Mettre à jour les URLs Auth Supabase avec le domaine final pour l’accès extérieur.
Le nom, le téléphone et l’adresse restent facultatifs dans le parcours QR/NFC.
Le chat et les promotions ne sont pas proposés dans le parcours invité.

Aucune donnée client, session privée, dépendance node_modules ou historique .git
n’est inclus. Les images historiques peuvent encore dépendre de l’ancien stockage.
Pour une évolution future du backend, consulter l’historique avant toute migration.
`;
fs.writeFileSync(path.join(destination,'LISEZMOI.md'),guide);
fs.writeFileSync(path.join(source,'README.md'),'# La Parmigiana × RZ Food\n\nMenu : /menu/la-parmigiana\n\nDéveloppement : npm ci puis npm run dev. Build : npm run build.\n\nLes variables publiques du projet actuel sont dans .env. Ne jamais mettre\nune clé service-role dans VITE_*. Lire docs/verification-et-deploiement.md\npour Lovable, Netlify et les limites connues. Ne pas rejouer les migrations\nsur le Supabase courant, déjà installé.\n');
function inspect(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()){assert(!['node_modules','.git'].includes(e.name));inspect(p);}else if(/\.(ts|tsx|js|mjs|json|md|toml)$/.test(p)||e.name==='.env'){assert(!/\bsb_secret_[A-Za-z0-9_-]{15,}|\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(fs.readFileSync(p,'utf8')),'Possible private credential: '+p);}}}
inspect(destination);
console.log(JSON.stringify({destination,publicVariables:Object.keys(vars),credentialScan:'passed'}));
