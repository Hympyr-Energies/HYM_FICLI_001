/* Contrôle de syntaxe de tous les modules JavaScript de src/ (avant assemblage). Usage : node tests/syntaxe.js */
const fs = require('fs'), path = require('path');
const dossier = path.join(__dirname, '..', 'src');
let erreurs = 0;
fs.readdirSync(dossier).filter((f) => f.endsWith('.js')).forEach((f) => {
  try { new Function(fs.readFileSync(path.join(dossier, f), 'utf8')); console.log('ok     ' + f); } catch (e) { erreurs++; console.log('ERREUR ' + f + ' : ' + e.message); }
});
process.exit(erreurs ? 1 : 0);
