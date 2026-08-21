# Configuration Firebase — Frontières

Le jeu utilise Firebase Authentication anonyme et Realtime Database. Dans la console Firebase :

1. Activez **Authentication > Sign-in method > Anonymous**.
2. Ouvrez **Realtime Database > Rules**.
3. Ajoutez le contenu de `frontieres.rules.fragment.json` sous votre objet `rules` existant, à côté de `rooms` et `battlezone`.
4. Publiez les règles.

Exemple de fusion (ne remplacez pas vos namespaces existants) :

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "rooms": { "...": "vos règles actuelles" },
    "battlezone": { "...": "vos règles actuelles" },
    "frontieres": { "...": "copier ici la valeur frontieres du fragment" }
  }
}
```

Le mode solo fonctionne encore en ouvrant `index.html` directement. Le mode multijoueur doit être servi en HTTP, par exemple avec **Live Server** dans VS Code.

## Modèle de données

Chaque partie est stockée sous `frontieres/rooms/{CODE}`. L’hôte est le seul navigateur qui fait avancer la simulation et écrit `snapshot`. Chaque joueur ne peut modifier que son profil, réserver son créneau et écrire ses commandes. Une commande reçue est revalidée par le moteur de l’hôte avant d’être exécutée.

La connexion anonyme Firebase persiste normalement après un rechargement dans le même navigateur. Le créneau n’est pas libéré lors d’une coupure et le marqueur de présence passe à `connected: false`; le joueur peut donc reprendre sa place pendant la fenêtre de reconnexion.
