# Promo Dashboard — NoCodeFlow

Setup en 4 étapes.

---

## 1. Google Sheet

Créer un nouveau Google Sheet vide (ou utiliser un existant).
Laisser tous les onglets vides — le script les crée automatiquement.

---

## 2. Google Apps Script

1. Dans le Sheet : **Extensions > Apps Script**
2. Supprimer le code par défaut (`function myFunction() {}`)
3. Coller le contenu de `apps-script/code.gs`
4. Sauvegarder (Ctrl+S)

---

## 3. Setup initial (création des onglets + données de test)

Dans l'éditeur Apps Script, lancer manuellement la fonction `setup` :

- Cliquer sur le menu déroulant des fonctions (à côté du bouton Run)
- Sélectionner `setup`
- Cliquer **Run**
- Autoriser les permissions demandées (accès au Spreadsheet)

Résultat : 4 onglets créés (`Config`, `Planning`, `Articles`, `Textes`) avec des données de test.

---

## 4. Déployer en Web App

1. **Déployer > Nouvelle version**
2. Type : **Application web**
3. Exécuter en tant que : **Moi**
4. Accès autorisé à : **Tout le monde** (pour accès depuis le dashboard HTML)
5. Cliquer **Déployer**
6. Copier l'URL fournie (`https://script.google.com/macros/s/XXXX/exec`)

---

## 5. Connecter le dashboard HTML

Dans le fichier `index.html` du dashboard, remplacer la variable :

```js
const API_URL = 'https://script.google.com/macros/s/VOTRE_ID/exec';
```

---

## Endpoints disponibles

| Méthode | Paramètre | Description |
|---|---|---|
| GET | `?action=today` | Tâches du jour + textes résolus |
| GET | `?action=config` | Toutes les lignes Config |
| GET | `?action=stats` | Compteurs done/skipped/pending |
| GET | `?action=stats&date=YYYY-MM-DD` | Stats pour une date précise |
| GET | `?action=setup` | Recréer onglets + données test |
| POST | `{"action":"done","row":2,"article":"slug"}` | Marquer fait |
| POST | `{"action":"skip","row":2}` | Marquer skippé |
| POST | `{"action":"toggle","row":2,"active":false}` | Toggle actif Config |
| POST | `{"action":"generate","date":"YYYY-MM-DD"}` | Générer planning du jour |

---

## Structure des onglets

**Config** — une ligne par cible (groupe Facebook, subreddit, etc.)
- `platform` / `group` / `url` / `type` (AUTO|MANUEL) / `active` / `frequency` (daily|3x-week|weekly) / `lastPosted` / `notes`

**Planning** — une ligne par tâche planifiée
- `date` / `platform` / `group` / `article` / `status` (pending|done|skipped) / `doneAt`

**Articles** — un article par ligne
- `slug` / `title` / `url` / `lastShared` / `shareCount`

**Textes** — templates par plateforme + article
- `platform` / `article` / `template` (avec `{title}` et `{url}`) / `variant` (A|B|C)

---

## Notes

- CORS : Apps Script ne supporte pas les headers CORS personnalisés. Si le dashboard est servi depuis GitHub Pages, utiliser `mode: 'no-cors'` ou un proxy Cloudflare Worker.
- Chaque fois qu'on redéploie une nouvelle version, l'URL change. Utiliser **"Gérer les versions"** pour déployer sur la même URL.
- Version du script : v1.0.0
