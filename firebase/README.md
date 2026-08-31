# Configuration Firebase — Frontières

Le jeu utilise Firebase Authentication anonyme et Realtime Database. Dans la console Firebase :

1. Activez **Authentication > Sign-in method > Anonymous**.
2. Ouvrez **Realtime Database > Rules**.
3. Ajoutez le contenu de `frontieres.rules.fragment.json` sous votre objet `rules` existant, à côté de `rooms` et `battlezone`.
4. Publiez les règles.

Le fichier de règles initial fourni avec les autres prototypes ne contient que les espaces `rooms` et `battlezone`. Sans ajouter explicitement `frontieres` au même niveau, la règle globale `.write: false` refuse la lecture ou l’inscription au salon. Le message du lobby précise maintenant si le refus survient pendant la lecture, la réservation du créneau, l’ajout du profil ou l’activation de la présence.

La réservation parcourt uniquement les créneaux libres connus. Sa transaction retourne `undefined` si un autre joueur vient d’occuper la place, ce qui annule la tentative sans demander à Firebase d’écrire sur le créneau d’un autre utilisateur. Les règles n’ont pas besoin d’autoriser la modification d’une place déjà occupée.

La règle de lecture de `frontieres/rooms/$roomCode` doit conserver le test `!data.exists()`. Le créateur vérifie qu’un code aléatoire est libre avant d’écrire le salon; refuser la lecture d’un chemin encore vide provoque `PERMISSION_DENIED` dès la création. Si une ancienne version du fragment contenait `(!data.exists() && false)`, remplacez-la puis republiez les règles.

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

Lors de la création d’un salon, l’hôte peut réserver toute l’équipe adverse à l’IA. Ces participants sont décrits par `meta.opponentMode` et simulés uniquement par l’hôte; ils n’écrivent pas de faux comptes dans `players`. Le champ supplémentaire est accepté par les règles existantes, donc aucune nouvelle publication des règles Firebase n’est requise.

Le type de carte choisi par l’hôte est conservé dans `meta.mapType` (`standard`, `hourglass` ou `archipelago`). Comme la graine, cette valeur est lue avant la construction locale de la carte par chaque client. Les règles actuelles acceptent aussi cette nouvelle valeur sans modification.

La taille choisie est conservée dans `meta.mapSize` (`standard` ou `large`). Elle détermine les dimensions et le nombre de territoires reconstruits à partir de la graine commune. Ce champ supplémentaire est accepté par les règles actuelles et ne demande aucune nouvelle publication.

Le niveau choisi pour l’équipe adverse IA est conservé dans `meta.aiDifficulty` (`relaxed`, `normal`, `hard` ou `relentless`). Tous les clients reçoivent ainsi le même réglage, tandis que seul l’hôte applique le bonus de recrutement dans sa simulation autoritaire. Ce champ est accepté par les règles actuelles : il n’est pas nécessaire de republier les règles Firebase.

Les merveilles utilisent la commande ordinaire `BUILD_WONDER` et les champs dynamiques déjà permis dans `snapshot` (chantier, progression, constructeur, propriétaire, actions automatiques et délai de réactivation). Les tirs de la Grosse Bertha y sont inclus afin que chaque client joue une seule fois leur animation. Leur ajout ne change donc ni la structure du salon ni les autorisations : aucune nouvelle publication des règles Firebase n’est requise.

## Modèle de données

Chaque partie est stockée sous `frontieres/rooms/{CODE}`. L’hôte est le seul navigateur qui fait avancer la simulation et écrit `snapshot`. Chaque joueur ne peut modifier que son profil, réserver son créneau et écrire ses commandes. Une commande reçue est revalidée par le moteur de l’hôte avant d’être exécutée.

La connexion anonyme Firebase persiste normalement après un rechargement dans le même navigateur. Le créneau n’est pas libéré lors d’une coupure et le marqueur de présence passe à `connected: false`; le joueur peut donc reprendre sa place pendant la fenêtre de reconnexion.
