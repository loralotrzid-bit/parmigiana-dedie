# La Parmigiana — audit et préparation de l'intégration

Audit du 26 octobre 2026, base Git `b60e22c90044abbcf3e85961e967cd359ae9fa5c`.

## Identité et données vérifiées en lecture publique

- Page fournie : https://rz-food.com/restaurant/la-parmigiana
- Restaurant : `012aae54-7638-491a-8c69-b3186a10ffaa`, slug `la-parmigiana`.
- Nom : La Parmigiana. Adresse publiée : Avenue Marius Meurée, 6001 Charleroi.
- Livraison `disabled`, sur place activé, programmation `today_only`.
- Paiements configurés : `cash`, `card_counter`.
- Quatre catégories publiées : Pizzas, Entrées, Desserts, Boissons.
- 68 produits, dont 67 publiés ; aucun signalé indisponible lors de la lecture.
- Aucun prix, produit, horaire ou supplément commercial créé ou modifié.

## Architecture existante

React 18 / TypeScript / Vite, React Query, Tailwind et PWA. Catalogue unique dans
Supabase (`categories`, `products`, `product_option_groups`, `product_options`).
Panier persistant via `cart-api`, fusion après connexion via `CartContext`.
Commandes via `orderService` → Edge Function `create-order` → tables `orders`,
`order_items`, `order_item_choices`. Suivi temps réel, administration et caisse
déjà présents dans les sources ; leur présence ne constitue pas un test fonctionnel.

À la date de cet audit initial, la configuration pointait vers `vsskguaheiaogznzhpud`.
Depuis, le clone Parmigiana a été basculé vers son projet Supabase dédié
`aehfmqoxvfuizcloowlj`; `.env`, `.env.local` et `supabase/config.toml` doivent tous
rester alignés sur cette référence. Le projet RZ Food voisin demeure distinct.

## Plan et corrections préparées

1. Rendre l'installation npm reproductible : corriger l'override contradictoire
   `serialize-javascript` et synchroniser le verrou npm.
2. Fermer les contournements à l'entrée de `create-order` : vérifier le jeton avec
   Auth, rattacher l'identité de commande à l'utilisateur, vérifier le rôle actif
   et le restaurant pour la caisse. La fonction utilise un client service-role.
3. Appliquer côté serveur les modes de commande, moyens de paiement et dates
   autorisés ; refuser une livraison désactivée et les produits non publiés côté client.
4. Recalculer les options depuis le catalogue selon les règles existantes de
   l'interface (`free_count`, `group_price`, `pricing_mode=pair`, formule menu).
   Refuser les options inconnues, ambiguës, indisponibles ou répétées ; conserver
   uniquement les suppléments calculés côté serveur dans les choix de commande.
5. Vérifier le stock cumulé des lignes d'un même produit. Ajouter un verrou
   synchrone contre les doubles clics au paiement et bloquer le panier si sa
   configuration n'autorise plus la livraison ou le paiement sélectionné.
6. Corriger la caisse : une carte au comptoir est `card_counter`, pas `card_delivery`.
7. Tester les requêtes contre une base simulée et le calcul pur, puis compiler.

Critères : aucun écrit pour les requêtes refusées ; prix navigateur ignorés ;
commandes à emporter et caisse autorisée conservées ; livraison désactivée refusée.

## Risques restant à traiter avant validation complète en production

- Les insertions de commande, lignes et choix ne sont pas transactionnelles : une
  erreur intermédiaire peut laisser une commande incomplète. Préparer une fonction
  SQL transactionnelle après vérification du schéma réellement déployé.
- Pas d'idempotence durable côté serveur : le verrou d'interface ne protège pas
  d'un retry réseau, de plusieurs onglets ou d'appels concurrents. Une contrainte
  unique et une clé de requête sont nécessaires avec la transaction.
- Le stock est vérifié mais n'est pas réservé atomiquement : concurrence possible.
- La promotion est affichée et son usage incrémenté côté client, mais aucun code
  promotionnel n'est transmis à `create-order`. Le total serveur n'applique pas
  la remise affichée. À intégrer dans la même transaction ; ne pas considérer
  les promotions comme validées par cet ensemble de corrections.
- `cart-api` reste à aligner avec le calcul complet des options : l'ajout vérifie
  le produit mais le panier ne constitue pas encore un devis serveur complet.
- Les horaires, minimums de commande, pauses de livraison et zones doivent faire
  l'objet d'un contrôle serveur complet ; les protections ajoutées ne couvrent
  pas toutes ces règles pour les autres restaurants.
- Les options des anciens paniers sont identifiées par nom. Les noms ambigus
  sont refusés ; une évolution vers des identifiants stables reste souhaitable.
- Un audit approfondi des RLS, fonctions SQL privilégiées et accès administration
  nécessite le schéma vivant et ses privilèges. Ne pas exécuter les anciennes
  migrations ou fonctions destructrices pour vérifier leur comportement.
- Aucun prestataire de paiement en ligne n'a été confirmé dans le parcours lu.
  Les moyens configurés ici sont réglés physiquement ; leur encaissement réel
  ne peut pas être déduit d'un test de code.

## Accès et export utiles

Pour compléter la revue, demander à Lovable un export **de structure seulement**
du projet courant : tables, contraintes/index, vues, fonctions, triggers, politiques
RLS et GRANT/REVOKE, plus la liste des migrations appliquées. Ne pas exporter de
clients, commandes, comptes Auth, secrets ou clés privées. Les migrations du dépôt
sont déjà disponibles ; cet export sert à détecter les différences avec la base.

Le déploiement production reste soumis à l'accord explicite du propriétaire et à
l'accès au projet courant. Aucun déploiement ni mutation de production effectué.
