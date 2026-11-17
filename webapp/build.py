# -*- coding: utf-8 -*-
"""Assemble la webapp en UN seul fichier : index.html (CSS converti en vw, JS, logo et scripts d'appel intégrés).

Usage :
    python3 build.py --api-url https://PROJET.supabase.co/functions/v1/fificli-api [--out index.html]
Sans --api-url, la page est construite pour un serveur de test (voir tests/serveur_simule.js : --api-url http://127.0.0.1:8781).
"""
import base64, json, os, re, sys

D = os.path.dirname(os.path.abspath(__file__))
S = os.path.join(D, 'src')
lire = lambda n: open(os.path.join(S, n), encoding='utf-8').read()


def conv(v):
    """px de maquette (1440 px) -> unités relatives : seules unités de dimensionnement vw, vh et %."""
    return re.sub(r'(?<![\w.#-])(-?\d*\.?\d+)px\b', lambda m: 'calc(var(--k)*%s)' % m.group(1), v)


css = []
for ligne in lire('styles.css').split('\n'):
    if ligne.startswith(('@media', '@supports')):
        i = ligne.index('{')
        css.append(ligne[:i] + conv(ligne[i:]))
    else:
        css.append(conv(ligne))
css = '\n'.join(css).replace('calc(var(--k)*1) solid', 'thin solid')

api = ''
if '--api-url' in sys.argv:
    api = sys.argv[sys.argv.index('--api-url') + 1]
config = json.dumps({'API_URL': api}, ensure_ascii=False)

scripts = json.dumps(json.load(open(os.path.join(S, 'scripts.json'), encoding='utf-8')), ensure_ascii=False, separators=(',', ':'))
modules = ['logique.js', 'core.js', 'ui.js', 'donnees.js', 'vue-synthese.js', 'vue-appels.js', 'vue-livraisons.js', 'vue-rappels.js', 'vue-pilotage.js', 'vue-export.js', 'tickets.js', 'main.js']
js = 'window.HYM_SCRIPTS = ' + scripts + ';\n' + '\n'.join(lire(n) for n in modules)
js = js.replace('</script>', '<\\/script>')

favicon = 'data:image/svg+xml;base64,' + base64.b64encode(lire('favicon.svg').encode('utf-8')).decode()

html = lire('template.html')
for k, v in {'{{CSS}}': css, '{{JS}}': js, '{{CONFIG}}': config, '{{FAVICON}}': favicon, '{{LOGO_SYMBOLE}}': lire('logo-symbole.svg')}.items():
    html = html.replace(k, v)
sortie = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else 'index.html'
open(os.path.join(D, sortie), 'w', encoding='utf-8').write(html)
print('%s écrit : %d Ko' % (sortie, len(html.encode('utf-8')) // 1024))
