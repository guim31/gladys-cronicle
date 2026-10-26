# Cronicle

[Cronicle](https://github.com/jhuckaby/Cronicle) est un planificateur de tâches
libre et auto-hébergé, avec une interface web : chaque « événement » est une
tâche (un script shell, une requête HTTP…) qui tourne selon un horaire ou à la
demande, sur un ou plusieurs serveurs. Cette intégration amène Cronicle dans
Gladys : le serveur et chaque événement suivi deviennent des appareils avec le
résultat de la dernière tâche, les scènes peuvent réagir quand une tâche
**réussit**, **échoue** ou est **bloquée**, ou quand Cronicle **ne répond
plus**, une scène peut **lancer un événement** (et attendre sa fin), **lire**
son dernier résultat ou **interrompre** sa tâche, et un widget du tableau de
bord affiche les dernières exécutions.

Testée contre un vrai Cronicle 0.9.80 (Docker, événements qui réussissent,
échouent et durent, lancés par l'API et par l'horaire) ; pas encore sur une
vraie instance Gladys : vos retours sont bienvenus dans
[les issues](https://github.com/guim31/gladys-cronicle/issues).

## Ce qu'il vous faut

- Gladys Assistant 5.1.0 ou plus récent.
- Cronicle 0.9.x, son serveur principal joignable depuis la machine de Gladys.
- Une clé d'API Cronicle. La lecture ne demande aucun privilège. Lancer et
  interrompre depuis Gladys demandent les privilèges **Run events** et **Abort
  jobs** de la clé.

Lancer un événement exécute du code sur vos serveurs. C'est pourquoi rien n'est
lançable depuis Gladys tant que vous n'activez pas **Gladys peut lancer et
interrompre les événements suivis**, et pourquoi l'intégration ne lit jamais le
journal d'une tâche ni le script d'un événement (ils peuvent contenir des
secrets) : seulement le statut, le code de sortie, le message d'erreur et la
durée.

À chaque actualisation (une minute par défaut), l'intégration lit le
planning, les tâches en cours et les 100 dernières tâches terminées ; toutes
les 5 secondes pendant qu'une tâche d'un événement suivi tourne. Cronicle ne
limite pas le débit de son API.

## Mise en route

### 1. Créer une clé d'API

Dans Cronicle, ouvrez **Admin → API Keys → Add API Key**. Donnez-lui un titre
(« Gladys ») ; laissez tous les privilèges décochés pour un usage en lecture
seule, ou cochez **Run events** et **Abort jobs** pour lancer et interrompre
des événements depuis Gladys.

### 2. Configurer l'intégration

Dans Gladys, **Intégrations → Cronicle → Configuration** :

- **Adresse de Cronicle** : l'adresse du serveur principal, ex.
  `http://192.168.1.2:3012` (le port 3012 est ajouté à une adresse IP seule).
  Un serveur secondaire redirige vers le principal : saisissez le principal.
- **Clé d'API** : la clé de l'étape 1.
- **Langue des noms** : français par défaut ; elle fixe les noms des
  fonctionnalités à l'ajout d'un appareil, les statuts et les résultats de
  scène.

Enregistrez, puis cliquez sur **Tester la connexion** : elle liste tous les
événements que voit la clé, avec leur identifiant, ex.
`emvpg2mmu03 : Sauvegarde nocturne ✓ suivi`.

### 3. Choisir les événements

Tous les événements sont suivis par défaut (50 au plus). Pour n'en suivre que
certains, saisissez leurs identifiants dans **Événements suivis
(identifiants)**, séparés par des virgules. Pour les lancer ou les interrompre
depuis Gladys, activez **Gladys peut lancer et interrompre les événements
suivis**. Dans **Options**, **Une tâche est bloquée après** fixe le seuil du
déclencheur de blocage (1 heure par défaut, ou jamais).

### 4. Ajouter les appareils

Dans l'onglet **Découverte**, ajoutez le serveur et les événements voulus
comme appareils. Les déclencheurs, les actions et le widget fonctionnent pour
tout événement suivi ; les appareils apportent les états et l'historique.

## Les appareils

**Cronicle** (le serveur) :

| Fonctionnalité  | Signification                                                                            |
| --------------- | ---------------------------------------------------------------------------------------- |
| Joignable       | 1 tant que Cronicle répond                                                               |
| Tâches en cours | tâches qui tournent en ce moment, tous événements confondus                              |
| Échecs (24 h)   | tâches en échec ou interrompues terminées dans les dernières 24 h (100 dernières tâches) |

Un appareil par événement suivi, à son nom :

| Fonctionnalité             | Signification                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Dernière tâche             | statut de la dernière tâche : Réussi, En échec, Interrompu, En cours, Jamais lancé |
| Dernière tâche réussie     | 1 quand la dernière tâche terminée a fini avec le code 0                           |
| En cours                   | 1 tant qu'une tâche de l'événement tourne                                          |
| Dernier lancement          | début de la dernière tâche (jour/mois heures:minutes, fuseau de Gladys)            |
| Durée de la dernière tâche | durée de la dernière tâche terminée, en secondes                                   |

Les appareils n'ont aucune commande : lancer une tâche sur des serveurs n'est
pas un interrupteur qu'un assistant vocal ou un appui malheureux devrait
atteindre. Un événement se lance depuis une scène ou depuis le widget, qui
demande une confirmation.

## Tableau de bord

Le widget **Dernières tâches Cronicle** liste les dernières tâches des
événements suivis (ou des événements choisis dans ses réglages), celles en
cours d'abord, puis les terminées, des plus récentes aux plus anciennes :
statut, début, durée. Si le lancement est autorisé, chaque événement choisi
dans les réglages (trois au plus) a un bouton : **Lancer**, ou **Interrompre**
pendant qu'une tâche tourne. Gladys demande une confirmation avant de
l'envoyer. **Actualiser** relit Cronicle.

## Scènes

### Déclencheurs

- **Une tâche Cronicle réussit** : une tâche d'un événement suivi se termine
  avec le code 0. Variables : nom de l'événement, durée (s), identifiant de la
  tâche.
- **Une tâche Cronicle échoue** : une tâche d'un événement suivi se termine
  avec un autre code ou est interrompue (à la main, délai dépassé, serveur
  perdu). Variables : nom de l'événement, message d'erreur (ex.
  `Script exited with code: 3: disk full`), code de sortie, durée (s),
  identifiant de la tâche.
- **Une tâche Cronicle est bloquée** : une tâche d'un événement suivi tourne
  plus longtemps que le seuil de la configuration, une fois par tâche.
  Variables : nom de l'événement, en cours depuis (min), identifiant de la
  tâche.
- **Cronicle ne répond plus** : Cronicle répondait à la lecture précédente et
  ne répond plus, une fois. Variable : la raison.
- **Cronicle répond de nouveau** : après une coupure. Variable : durée de la
  coupure (min).

Les déclencheurs de tâche peuvent se limiter à certains événements. Les tâches
lancées par l'horaire, à la main dans Cronicle ou par un autre outil comptent
aussi. La première lecture après l'installation n'annonce rien du passé ; une
tâche terminée pendant un redémarrage de Gladys ou de l'intégration est
annoncée une fois.

### Actions

- **Lancer un événement Cronicle** : lance un événement suivi, si le lancement
  est autorisé. Avec **Attendre la fin (90 s au plus)**, la scène attend la
  tâche et les actions suivantes reçoivent son résultat. Sorties : identifiant
  de la tâche, mis en file par Cronicle (l'événement tournait déjà), terminée,
  réussie, statut, code de sortie, message d'erreur, durée (s).
- **Lire un événement Cronicle** : l'état d'un événement suivi, pour une
  condition. Sorties : statut, en cours, dernière tâche réussie, code de
  sortie, message d'erreur, durée (s), dernier lancement, événement activé.
- **Interrompre une tâche Cronicle** : interrompt la tâche en cours d'un
  événement suivi, si le lancement est autorisé. Sorties : une tâche a été
  interrompue (oui/non), identifiant de la tâche.

Elles refusent un événement qui n'est plus suivi, même si son appareil existe
encore dans Gladys.

### Idées de scènes

- Quand **Une tâche Cronicle échoue** pour « Sauvegarde nocturne », envoyer un
  message Telegram : « {{triggerEvent.data.event}} a échoué :
  {{triggerEvent.data.message}} ».
- Quand **Une tâche Cronicle est bloquée**, passer la lumière du couloir en
  orange.
- En quittant la maison, **Lancer un événement Cronicle** « Synchro photos »
  avec **Attendre la fin**, puis vous prévenir seulement si « Réussie » est
  faux.

## Dépannage

- **Clé d'API refusée ou désactivée** : la clé a été supprimée, désactivée ou
  mal recopiée ; vérifiez-la dans Admin → API Keys.
- **La clé d'API n'a pas le privilège** : cochez **Run events** (et **Abort
  jobs**) sur la clé.
- **Le lancement d'événements depuis Gladys est désactivé** : activez **Gladys
  peut lancer et interrompre les événements suivis** dans la configuration.
- **Suivis mais introuvables** : l'identifiant est faux ou l'événement a été
  supprimé. **Tester la connexion** liste ce que voit la clé.
- **Aucune API Cronicle à cette adresse** : vérifiez l'adresse et le port ;
  derrière un proxy inverse, incluez son chemin.
- **L'adresse redirige** : saisissez l'adresse en `https://`, ou celle du
  serveur principal.
- Une tâche n'apparaît pas tout de suite : l'intégration lit Cronicle toutes
  les minutes (réglable), toutes les 5 secondes pendant qu'une tâche tourne.

## Limites

- Les 100 dernières tâches terminées sont lues à chaque actualisation : sur un
  Cronicle très chargé (plus de 100 tâches entre deux lectures), des fins
  peuvent être manquées, et **Échecs (24 h)** ne compte que dans ces 100
  tâches.
- Le journal des tâches n'est jamais lu ni affiché, par choix ; le message
  d'erreur est celui que Cronicle affiche dans son historique (toute clé d'API
  y est masquée).
- « Attendre la fin » attend 90 s au plus (la limite d'une action de scène dans
  Gladys) ; une tâche plus longue continue, et les déclencheurs annoncent sa
  fin.
- Un événement limité à une tâche à la fois est mis en file par Cronicle quand
  il tourne déjà : l'action répond alors « mis en file », sans identifiant de
  tâche.
- Développée et testée contre Cronicle 0.9.80 ; les autres versions 0.9.x
  devraient fonctionner (même API), sans test. Sans lien avec Cronicle ni son
  auteur.
