# Frontières

Prototype de conquête en temps réel dans le navigateur, sans framework ni dépendance externe.

## Lancer le jeu

- Ouvrir directement `index.html` dans un navigateur récent, ou
- utiliser **Live Server** dans VS Code sur le dossier du projet.

Le jeu utilise des scripts classiques chargés avec `defer`, donc l’ouverture via `file://` fonctionne également.

Au lancement, un lobby permet de choisir entre **2 et 4 joueurs** ainsi que la faction commandée. Le premier joueur est humain et les autres factions participantes sont contrôlées par l’ordinateur. La carte et la simulation en temps réel ne démarrent qu’après avoir cliqué sur **Lancer la partie**.

Le rythme normal est réglé à 72 % de la vitesse de simulation initiale. La production, les armées et les décisions de l’ordinateur ralentissent ensemble afin de laisser davantage de temps au joueur pour lire la carte et réagir.

Après l’envoi d’une attaque, d’un renfort ou d’un ordre logistique, le territoire d’origine est automatiquement désélectionné afin d’éviter une seconde commande accidentelle.

La carte étendue se parcourt en maintenant le clic gauche et en faisant glisser la souris. La molette contrôle le zoom autour du pointeur. Les boutons `−`, `+` et `⌖` permettent respectivement de dézoomer, zoomer et revenir sur un territoire de l’Empire.

## Jouer

1. Cliquer sur un territoire jaune de l’Empire.
2. Cliquer sur un territoire voisin, sur la carte ou dans la liste **Frontières**.
3. Choisir le nombre d’unités avec le curseur, puis lancer l’offensive.
4. Les unités voyagent jusqu’à la cible avant la résolution du combat.

Un voisin déjà contrôlé peut également être choisi comme destination : le bouton devient **Envoyer le renfort** et les unités rejoignent le territoire allié après leur déplacement.

Pour acheminer des renforts plus loin :

1. sélectionner le territoire d’origine avec le clic gauche ;
2. faire un **clic droit** sur n’importe quel territoire allié relié au premier ;
3. vérifier le trajet affiché, choisir les unités, puis cliquer sur **Acheminer les renforts**.

Le convoi traverse vos territoires un par un et contourne automatiquement les montagnes. Si un relais prévu est conquis pendant le trajet, les unités s’arrêtent au dernier territoire encore sûr.

Pour un transfert immédiat à la souris, maintenir **Ctrl**, appuyer avec le **bouton droit** sur le territoire d’origine, glisser jusqu’à un autre territoire allié puis relâcher. Un aperçu indique le trajet et le nombre envoyé. Le geste transfère 50 % des unités disponibles en laissant au moins une unité en garnison ; le convoi avance ensuite de territoire en territoire par un chemin allié qui contourne les montagnes.

### Flux de renfort continu

Le raccourci direct consiste à maintenir **Alt**, appuyer avec le **bouton droit** sur le territoire d’origine, glisser jusqu’à la destination alliée puis relâcher. Le trajet apparaît en cyan et la ligne continue est créée immédiatement. Refaire ce geste depuis la même origine redirige le flux.

Il reste également possible de préparer un trajet au clic droit, d’activer **Flux continu**, puis de cliquer sur **Activer le flux continu**. Dans les deux cas, chaque unité produite ensuite par le territoire d’origine part automatiquement vers la destination. La garnison déjà présente n’est pas prélevée.

La fiche **Flux logistique actif** permet de suivre les expéditions et les livraisons, puis d’arrêter la ligne. Choisir une nouvelle destination depuis la même origine redirige les productions futures. Une ligne coupée par la perte d’un relais se met en pause et reprend automatiquement si un itinéraire allié redevient disponible.

Le bouton **Nouvelle carte** recrée la côte, les 78 à 86 cellules de Voronoï, les ressources, les six sites rares, les chaînes montagneuses et les positions de départ. Le bouton **Pause** suspend toute la simulation.

Les triangles clairs placés sur certaines frontières représentent des montagnes infranchissables. Ces passages sont interdits aux armées du joueur comme à celles de l’ordinateur. La génération vérifie néanmoins que tous les territoires restent accessibles par au moins un itinéraire terrestre.

Les Technocrates, la Horde et les Nomades sont contrôlés par l’ordinateur. Chaque faction évalue périodiquement ses frontières, conquiert les cibles accessibles et renforce ses territoires menacés en utilisant les mêmes commandes que le joueur. À partir de trois territoires, elle peut aussi ouvrir des lignes de renfort continues entre ses régions productives et ses fronts. Le nombre de lignes augmente avec la taille de la faction, jusqu’à trois, et les destinations sont réévaluées lorsque la situation militaire change.

Lorsqu’une cible est trop forte pour être attaquée depuis un seul territoire, l’IA peut désormais préparer une offensive coordonnée. Elle choisit un territoire frontalier, y rassemble les surplus de plusieurs territoires alliés, attend l’arrivée réelle des convois, puis attaque lorsque la force combinée atteint le seuil calculé. Les garnisons de sécurité sont conservées et aucune unité n’est créée artificiellement pendant le rassemblement.

## Architecture

```text
index.html
css/style.css
js/
  data/       Définitions des factions, terrains et sites rares
  utils/      Géométrie, clipping Voronoï et utilitaires déterministes
  game/       État, modèles, génération, simulation et combats
  render/     Lecture de l’état et rendu Canvas uniquement
  input/      Conversion des interactions pointeur en sélections
  ui/         Panneaux, commandes et journal
  main.js     Boucle d’exécution et assemblage des composants
tests/
  smoke.html  Vérifications exécutables directement dans le navigateur
```

La logique de `Game` et `GameState` ne connaît pas le Canvas. Une action passe par une commande sérialisable :

```js
game.executeCommand({
    type: "SEND_ARMY",
    playerId: 1,
    fromTerritoryId: 12,
    toTerritoryId: 13,
    units: 20
});
```

Les convois utilisent une seconde commande sérialisable :

```js
game.executeCommand({
    type: "SEND_REINFORCEMENT_ROUTE",
    playerId: 1,
    fromTerritoryId: 4,
    toTerritoryId: 27,
    units: 12
});
```

Une ligne permanente est elle aussi créée par commande :

```js
game.executeCommand({
    type: "CREATE_CONTINUOUS_REINFORCEMENT_ROUTE",
    playerId: 1,
    fromTerritoryId: 4,
    toTerritoryId: 27
});
```

Cette frontière permet de remplacer plus tard les commandes locales par des commandes validées par un serveur.

## Vérification

Ouvrir `tests/smoke.html`. La page contrôle la génération, la connexité du graphe, les départs des factions, la production, une attaque complète et la sérialisation de l’état.
