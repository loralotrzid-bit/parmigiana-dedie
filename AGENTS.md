# Instructions de travail - La Parmigiana - application dediee

## Commencer ici
- Lire `docs/PROJECT_CONTEXT.md` avant une nouvelle tâche ; ouvrir seulement la section et les fichiers concernés.
- Consulter `docs/WORK_PLAN.md` pour les chantiers et `docs/TECHNICAL_MAP.json` pour les symboles, routes et numéros de ligne.
- Vérifier `git status --short` : préserver les modifications déjà présentes. Ne pas toucher au projet voisin par défaut.
- La cartographie est un index, pas une preuve du comportement actuel. Revérifier les symboles et lignes avec `rg -n` avant édition.

## Exécution économe
- Une fonctionnalité cohérente à la fois. Commencer par les points d'entrée et élargir aux dépendances seulement si nécessaire.
- Utiliser `rg` et des lectures ciblées ; ne pas relire tout le dépôt, les types générés ou les migrations pour une retouche visuelle.
- Préserver les conventions ; éviter réécriture, mise à jour de dépendances et nettoyage hors périmètre.
- Donner un plan court puis exécuter le périmètre autorisé. Ne redemander une décision que si elle est indispensable ; ne pas inventer une autorisation de publication.
- Après changement : fichiers et fonctions concernés, résultat, vérifications réellement effectuées, limites restantes. Réponse concise en français.
- Actualiser le contexte et la carte si les routes, responsabilités, contrats ou règles changent. Ne pas charger les rapports historiques en entier par défaut.

## Invariants
- Prix, options, modes et identité validés au serveur ; un prix navigateur ou `source=qr` n'autorise pas une commande.
- Commande invitée uniquement pour la capacité La Parmigiana correspondant au panier ; coordonnées facultatives dans ce parcours, sur place/emporter. L'accès extérieur conserve ses règles.
- Prix PDF sur place ; à emporter -1 EUR par base article, suppléments inchangés ; réduction enfant du catalogue ; week-end Europe/Brussels.
- Conserver la transaction/idempotence invitée et les reçus privés par commande. Livraison désactivée pour ce parcours ; cash/card_counter, sans prétendre à un encaissement en ligne.
- Google reste visuel et désactivé jusqu'à une activation explicitement demandée et vérifiée.
- Ne jamais afficher/copier secrets ou jetons. Les VITE_* sont publics ; service_role reste serveur.
- Ne pas rejouer les migrations historiques sur la base restaurée. La restriction frontend ne remplace pas les droits serveur.
- Aucun déploiement, push ou changement distant n'est impliqué par une tâche documentaire/visuelle. Les instructions explicites de l'utilisateur priment.

## Vérification
- Local : `npm run dev -- --host localhost --port 8082 --strictPort`.
- Selon le changement : `npm test`, `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json`, `npm run build`.
- Documentation seule : vérifier les chemins, références et diff ; pas de tests applicatifs inutiles.
- `scripts/test-digital-menu.mjs` peut créer des commandes distantes. Les scripts de préparation peuvent produire des mutations SQL : ne pas les lancer comme contrôles en lecture seule.
- Le lint global a une dette historique ; contrôler les fichiers touchés et signaler la portée réelle.

## Périmètre dédié
- Garder les routes publiques limitées à La Parmigiana. Les sources historiques non routées ne sont pas toutes supprimées.
- Le Supabase dédié de ce clone est `aehfmqoxvfuizcloowlj`, distinct de `../rzfood` (`lgdzjqmxyjahyvnkdoxv`). Ne modifier le projet RZ Food que si l'utilisateur l'autorise explicitement.

## Tables et commandes téléphoniques
- Consulter docs/tables-et-commandes-telephoniques.md pour ces fonctionnalités. Le backend dédié est actif sur `aehfmqoxvfuizcloowlj`; les tests de réception réelle, les comptes staff et le domaine publié restent à valider avant usage restaurant.
- Préserver les capacités de table, le scoping staff/restaurant et la RPC téléphone transactionnelle/idempotente. Une commande phone est pending/unpaid ; ne pas la traiter comme une vente POS encaissée.
- Tests SQL sans réseau : npm run test:tables.
