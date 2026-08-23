# Frontières

Prototype de conquête en temps réel dans le navigateur, sans framework ni dépendance externe. Par Alain Bellavance

## Lancer le jeu

- Ouvrir directement `index.html` dans un navigateur récent, ou
- utiliser **Live Server** dans VS Code sur le dossier du projet.

Le jeu utilise des scripts classiques chargés avec `defer`, donc l’ouverture via `file://` fonctionne également.

Le mode **Multijoueur Firebase** doit être lancé avec Live Server (ou un autre serveur HTTP). Le lobby permet de créer un code à six caractères ou de rejoindre un salon existant en **1v1, 2v2 ou 3v3**. L’hôte peut choisir une équipe adverse composée de joueurs humains ou entièrement contrôlée par l’IA. Dans un salon 2v2 contre l’IA, seuls les deux membres de l’équipe humaine doivent se connecter; l’hôte simule les deux adversaires dès le lancement. Plusieurs joueurs peuvent choisir la même race : chaque commandant garde néanmoins sa couleur, sa recherche, ses territoires et ses unités. Consultez [`firebase/README.md`](firebase/README.md) avant le premier essai en ligne.

La simulation multijoueur est autoritaire chez l’hôte. Les autres navigateurs envoient des commandes sérialisées et reçoivent uniquement l’état dynamique; la carte est reconstruite localement depuis une graine commune. Les équipiers partagent leur vision, peuvent se donner des renforts et autorisent le passage des convois alliés. Les renforts donnés s’ajoutent à la garnison de l’allié sans transférer le territoire. Après 30 secondes de déconnexion, l’IA prend temporairement le relais de la faction et rend le contrôle dès la reconnexion.

Pendant cette prise de relais, l’IA coopère défensivement avec son équipe. Elle peut envoyer un convoi ponctuel vers une capitale, une installation, un site rare ou un territoire alimentaire allié lorsque les forces ennemies voisines deviennent dangereuses. Elle conserve ses propres garnisons, ne mobilise jamais plus de 25 % de son surplus, limite son aide à deux convois simultanés et attend 20 secondes avant de soutenir de nouveau la même position. Elle évite aussi de provoquer une pénurie chez le destinataire, sauf pour sauver une capitale en situation critique.

Au lancement, un lobby permet de choisir entre **2 et 4 joueurs** ainsi que la faction commandée. Le premier joueur est humain et les autres factions participantes sont contrôlées par l’ordinateur. La carte et la simulation en temps réel ne démarrent qu’après avoir cliqué sur **Lancer la partie**.

Les musiques `Musique/Music1.mp3` à `Musique/Music4.mp3` démarrent avec la partie et jouent successivement. La playlist recommence après le quatrième morceau. Si un navigateur bloque la première tentative, le système réessaie automatiquement à la prochaine interaction du joueur. Son volume baisse brièvement pendant le carillon de fin de recherche afin de conserver une alerte claire.

La perte d’un territoire humain déclenche une alerte grave de trois notes descendantes et affiche le nom du territoire perdu. Cette alerte fonctionne également lors d’une victoire barbare, mais les pertes territoriales des factions contrôlées par l’ordinateur restent silencieuses.

Le rythme normal est réglé à 72 % de la vitesse de simulation initiale. La production, les armées et les décisions de l’ordinateur ralentissent ensemble afin de laisser davantage de temps au joueur pour lire la carte et réagir.

La cadence de recrutement possède en plus un ajustement d’équilibrage global de **-12,5 %**. Les bonus des terrains, factions, sites rares et recherches restent appliqués normalement, et les valeurs `+/min` affichées tiennent compte de cette réduction.

## Nourriture et ravitaillement

La nourriture représente une **capacité permanente**, pas un stock consommé avec le temps. Chaque unité en garnison ou en déplacement utilise un point de nourriture. La capitale fournit 200 points tant que la faction possède au moins un territoire et peut y maintenir une capitale. Chaque autre territoire contrôlé fournit aussi **10 points de nourriture passifs**, même lorsqu’il reste affecté au recrutement. La recherche **Agriculture intensive**, dans l’axe Construction, fait passer cette contribution passive à **20 points par territoire**.

Un territoire contrôlé peut être affecté au **recrutement** ou à la **production alimentaire** depuis son panneau latéral. En mode nourriture, il conserve sa contribution passive, cesse de recruter et ajoute une capacité dépendant de son terrain : agriculture 80, plaine 50, industrie/science/centrale 40, mine 30, forteresse/radar/aéroport 25. Une Métropole ajoute 50 et un Grand barrage 20 à la valeur du terrain. Un anneau vert et le marqueur `F` permettent de reconnaître ces territoires sur la carte.

Une charge allant jusqu’à 110 % de la capacité reste tolérée. Ensuite, le recrutement passe à 75 % entre 110 et 125 % de charge, à 40 % entre 125 et 140 %, puis à seulement 10 % entre 140 et 160 %. Au-delà de 160 %, il s’arrête complètement. À partir de 140 %, l’attrition retire toutes les dix secondes 5 % du déficit alimentaire, puis 8 % au-delà de 160 %, en visant les plus grandes concentrations sans jamais retirer la dernière unité d’une garnison territoriale. Une famine suspend temporairement la contribution d’un territoire alimentaire, mais ne retire pas les 200 points de base de la capitale.

L’ordinateur utilise la commande sérialisable `SET_TERRITORY_MODE` comme un joueur humain. Il accepte une pénurie modérée et ne sacrifie un territoire au mode nourriture que lorsque la demande militaire dépasse **110 % de sa capacité alimentaire**. Il privilégie alors les territoires agricoles intérieurs et attend au moins 45 secondes avant de modifier de nouveau leur affectation. La part de villes alimentaires est plafonnée à **20 %** en situation normale, **30 %** en pénurie importante et **40 %** seulement en crise critique. Les capitales, frontières, installations, aéroports et sites rares restent militaires sauf en crise critique. Après une crise, les villes alimentaires excédentaires reprennent progressivement le recrutement dès que la couverture demeure au-dessus du seuil toléré. Les recherches, combats et décisions logistiques continuent de suivre les mêmes règles alimentaires que celles du joueur.

Après l’envoi d’une attaque, d’un renfort ou d’un ordre logistique, le territoire d’origine est automatiquement désélectionné afin d’éviter une seconde commande accidentelle.

La carte étendue se parcourt en maintenant le clic gauche et en faisant glisser la souris. La molette contrôle le zoom autour du pointeur. Les boutons `−`, `+` et `⌖` permettent respectivement de dézoomer, zoomer et revenir sur un territoire de l’Empire.

## Brouillard de guerre

Chaque territoire contrôlé révèle la carte jusqu’à **deux frontières de distance**. Le premier voisinage est parfaitement éclairé; le deuxième forme un anneau de renseignement légèrement assombri mais conserve les informations complètes. Au-delà, la géographie générale reste lisible, tandis que le propriétaire, les unités, les ressources, les installations, les marqueurs d’événements locaux et les armées ennemies sont masqués. La visibilité est recalculée immédiatement après chaque conquête ou perte de territoire.

Les routes logistiques adverses ne sont jamais affichées. Une armée ennemie devient visible lorsqu’elle entre dans une liaison touchant la zone de renseignement du joueur, puis disparaît si elle retourne entièrement dans le brouillard. Cette règle est calculée dans la simulation et ne dépend pas du Canvas, afin de pouvoir produire plus tard une vue filtrée côté serveur multijoueur.

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

Pour un transfert immédiat à la souris, maintenir **Ctrl**, appuyer avec le **bouton droit** sur le territoire d’origine, glisser jusqu’à un autre territoire allié puis relâcher. Un aperçu indique le trajet et le nombre envoyé. Le geste transfère **80 % des unités disponibles** en laissant au moins une unité en garnison ; le convoi avance ensuite de territoire en territoire par un chemin allié qui contourne les montagnes.

### Flux de renfort continu

Le raccourci direct consiste à maintenir **Alt**, appuyer avec le **bouton droit** sur le territoire d’origine, glisser jusqu’à la destination alliée puis relâcher. Le trajet apparaît en cyan et la ligne continue est créée immédiatement. Refaire ce geste depuis la même origine redirige le flux.

Il reste également possible de préparer un trajet au clic droit, d’activer **Flux continu**, puis de cliquer sur **Activer le flux continu**. Dans les deux cas, chaque unité produite ensuite par le territoire d’origine part automatiquement vers la destination. La garnison déjà présente n’est pas prélevée.

La case **Tout relayer · Hub** transforme l’origine en relais logistique. Lors de l’activation, toute sa garnison disponible est expédiée en laissant une unité sur place. Ensuite, sa production et tous les renforts alliés qui y arrivent repartent automatiquement vers la destination. Les convois mémorisent les territoires déjà traversés afin d’interrompre une éventuelle boucle entre plusieurs hubs.

La fiche **Flux logistique actif** permet de suivre les expéditions et les livraisons, puis d’arrêter la ligne. Choisir une nouvelle destination depuis la même origine redirige les productions futures. Une ligne coupée par la perte d’un relais se met en pause et reprend automatiquement si un itinéraire allié redevient disponible.

Les arrivées normales de renforts, les livraisons périodiques des flux et les relais automatiques des hubs ne sont pas inscrits dans le journal des événements. Leurs unités et compteurs sont toujours actualisés dans l’interface, tandis que le journal conserve les ordres initiaux et les incidents logistiques importants.

La logistique des factions contrôlées par l’ordinateur est également silencieuse : transferts, convois, rassemblements et lignes continues ne surchargent plus le journal. Leurs attaques, conquêtes, recherches et frappes importantes restent annoncées. Les ordres de renfort donnés par un joueur humain demeurent visibles.

Le bouton **Nouvelle carte** recrée une carte de **2800 × 1800** unités comprenant **110 à 120 cellules de Voronoï**, les ressources, les six sites rares, quatre à six lacs, de grandes chaînes montagneuses et les positions de départ. Le bouton **Pause** suspend toute la simulation.

Le lobby propose deux géographies. **Continent** conserve des fronts ouverts et plusieurs itinéraires. **Sablier** place les équipes dans deux grandes moitiés opposées et bloque les autres traversées par une chaîne montagneuse, en conservant un passage central marqué par le symbole `⌛`. Ce point d’étranglement devient naturellement un objectif pour les renforts, les canons et les capacités stratégiques. Le choix est stocké dans le salon Firebase afin que tous les clients reconstruisent la même carte.

Sur une carte Sablier, l’IA consolide en priorité sa propre moitié. Une attaque clairement gagnante contre un territoire neutre adjacent utilise un créneau d’expansion réservé et passe avant les capacités, les plans offensifs et les flux logistiques. Elle peut donc poursuivre cette conquête même lorsque ses autres armées sont déjà mobilisées au passage central.

L’IA redistribue aussi les grandes garnisons éloignées du danger. Un territoire intérieur possédant au moins douze unités au-delà de sa réserve peut envoyer environ 70 % de ce surplus par un convoi traversant plusieurs territoires alliés. Deux convois de redistribution peuvent circuler simultanément; les capitales, canons et sites rares conservent une réserve supplémentaire.

La capacité de manœuvre tactique de l’IA augmente avec son territoire : une armée simultanée par groupe de trois territoires, jusqu’à un maximum de **huit**. Les petits empires restent lisibles, tandis que les grandes puissances peuvent soutenir plusieurs fronts sans attendre la fin de quatre déplacements lointains.

Son réseau de flux continus peut compter jusqu’à **dix-huit villes sources**. Chaque ville intérieure affectée au recrutement établit progressivement sa propre ligne vers l’une des trois frontières les plus urgentes. Les destinations sont réparties pour éviter un seul point congestionné. Une ligne est automatiquement arrêtée si sa source passe en mode nourriture ou devient elle-même frontalière, puis peut être recréée ailleurs lorsque la situation évolue.

Les triangles clairs placés sur certaines frontières représentent des montagnes infranchissables. Ces passages sont interdits aux armées du joueur comme à celles de l’ordinateur. La génération vérifie néanmoins que tous les territoires restent accessibles par au moins un itinéraire terrestre.

### Lacs intérieurs

Chaque nouvelle carte contient entre **trois et cinq lacs** polygonaux, répartis dans l’intérieur du continent. Ces zones d’eau restent neutres, ne possèdent aucune unité et ne peuvent jamais être capturées ou traversées par une armée, un convoi ou une ligne de renfort. La génération ne conserve un lac que si toutes les terres jouables restent reliées par un chemin permettant de le contourner.

### Canons de campagne

Chaque carte contient exactement **deux canons de campagne**, placés sur des territoires neutres ordinaires. Après la capture du territoire, son propriétaire prend automatiquement le contrôle du canon. Toutes les cinq secondes de simulation, il vise le territoire ennemi adjacent le plus menaçant — même de l’autre côté d’une montagne — et possède 75 % de chances d’y détruire **trois unités**. Si la garnison est trop petite, les dégâts sont limités afin de conserver un défenseur. Un canon ne peut donc jamais éliminer la dernière unité d’un territoire ni provoquer une conquête à distance. Sa cadence recommence à zéro chaque fois qu’il change de propriétaire.

### Aéroports

Chaque carte possède au minimum **quatre aéroports**, reconnaissables à leur symbole `✈` et à leur teinte bleue. Un aéroport contrôlé permet une frappe aérienne dans un rayon de quatre territoires : elle survole les montagnes, détruit 10 % de la garnison visée sans éliminer sa dernière unité, puis impose environ 38 secondes de recharge. L’ordinateur sait également employer les aéroports qu’il contrôle.

### Recherche

Le bouton **Recherche** ouvre un arbre de seize technologies réparties sur quatre axes : **Construction**, **Attaque**, **Défense** et **Capacités**. Une faction ne peut étudier qu’une technologie à la fois et doit débloquer les paliers progressifs dans l’ordre. La Mobilisation d’urgence est indépendante, tandis que l’Arme nucléaire exige d’abord le Missile tactique. Les recherches durent de 1 min 30 à 6 minutes de temps simulé et continuent pendant les combats. Un carillon à quatre notes avertit le joueur lorsque sa propre recherche est terminée; les recherches des factions contrôlées par l’ordinateur restent silencieuses.

Les bonus débloqués améliorent réellement la production, la puissance de combat, la vitesse des armées ou la cadence des canons. Les centres scientifiques, les centrales et le Centre spatial accélèrent légèrement la progression; les Technocrates tirent davantage profit de ces territoires. Toutes les factions contrôlées par l’ordinateur choisissent également leurs recherches, en privilégiant une branche adaptée à leur style.

### Capacités stratégiques

Le **Missile tactique** demande quatre minutes de recherche. Une fois débloqué, il peut viser n’importe quel territoire ennemi actuellement visible. Une alerte de cinq secondes apparaît sur la carte avant l’impact, qui détruit 25 % de la garnison avec un maximum de 40 pertes. Il laisse toujours au moins une unité et ne peut donc pas conquérir un territoire à distance. Sa recharge est de trois minutes.

La **Mobilisation d’urgence** demande trois minutes trente de recherche. Elle ajoute immédiatement 35 unités sur un territoire appartenant au joueur, puis se recharge pendant deux minutes trente. Ces unités consomment la nourriture normalement; l’interface avertit le joueur lorsque cette mobilisation risque de provoquer une pénurie.

L’**Arme nucléaire** devient accessible après le Missile tactique et demande six minutes de recherche. Après huit secondes d’alerte, elle détruit 30 % des forces sur la cible et 15 % sur chacun de ses territoires voisins. Le souffle est indiscriminé et peut donc atteindre les garnisons du lanceur ou de ses alliés; il laisse toujours au moins une unité. Sa recharge est de cinq minutes. La carte affiche la zone périphérique avant l’impact, puis un flash, des ondes de choc et un nuage ascendant.

Chaque faction possède ses propres recharges. L’IA recherche et utilise les trois capacités : elle réserve les renforts aux fronts menacés, cible avec ses missiles les grandes concentrations et ne déclenche une frappe nucléaire que si les pertes ennemies prévues justifient les dommages collatéraux alliés. Les ordres passent par la commande sérialisable `USE_ABILITY`, et les frappes en attente, leurs animations ainsi que les recharges sont incluses dans les instantanés Firebase.

### Événements mondiaux

Un événement mondial survient toutes les **60 à 120 secondes** de simulation, avec une alerte huit secondes avant son déclenchement. Le système évite de sélectionner deux fois de suite le même événement.

- **Famine** : suspend toute production d’un territoire pendant 30 à 45 secondes, puis la production reprend automatiquement.
- **Feu de forêt** : détruit immédiatement entre 10 et 25 % d’une garnison terrestre, sans jamais éliminer sa dernière unité.
- **Attaque barbare** : deux à quatre armées barbares visibles attaquent simultanément des territoires contrôlés. Une victoire barbare met le territoire à sac et le rend neutre.

Le calendrier, les effets actifs et les armées barbares sont conservés dans `GameState` afin qu’un futur serveur puisse imposer les mêmes événements à tous les joueurs.

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
  network/    Configuration Firebase, salons, présence, commandes et instantanés
  ui/         Panneaux, commandes et journal
  main.js     Boucle d’exécution et assemblage des composants
tests/
  smoke.html  Vérifications exécutables directement dans le navigateur
```

Les règles Realtime Database sont fournies comme fragment isolé dans `firebase/frontieres.rules.fragment.json` afin de préserver les namespaces Firebase déjà utilisés par les autres jeux du projet.

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
