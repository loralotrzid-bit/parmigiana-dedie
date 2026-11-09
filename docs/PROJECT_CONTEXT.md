# PROJECT_CONTEXT - La Parmigiana - application dediee

Mise à jour : 31 octobre 2026. Référence de départ : `81cb225` ; la copie dédiée comporte des adaptations locales non commitées. Source de vérité : checkout actuel, puis serveur pour les faits distants. Cette mémoire n'est pas une sauvegarde de données.

## 1. Choisir le bon projet
- `../rzfood` : copie locale RZ Food, routes marketplace et parcours Parmigiana déjà intégré.
- `../parmigiana-dedie` : clone local adapté au restaurant ; pas de dépôt GitHub séparé créé, remote local retiré pour éviter de pousser dans l'original.
- `../rzfood` reste sur son Supabase d'origine ; `../parmigiana-dedie` utilise le nouveau projet dédié `aehfmqoxvfuizcloowlj` (`https://aehfmqoxvfuizcloowlj.supabase.co`). Aucun write sur l'ancienne base n'a été fait.
- Le checkout RZ Food local ne prouve pas que la production GitHub/Lovable est synchronisée. Vérifier branche/remote/diff avant synchronisation.

## 2. Architecture
React 18, TypeScript, Vite 5, React Router 6, React Query 5, Tailwind et primitives shadcn/Radix, Supabase JS, PWA Workbox. Installation npm avec `package-lock.json`.

`main.tsx → App.tsx → AuthProvider + CartProvider + routes → pages → services → REST / Edge Functions → Postgres`.

| Besoin | Fichiers à ouvrir en premier |
| --- | --- |
| Routes/providers | `src/App.tsx`, `src/main.tsx` |
| Menu digital | `src/pages/client/DigitalMenu.tsx`, `src/services/digitalMenuService.ts` |
| Restaurant/catalogue | `src/pages/client/Restaurant.tsx`, `src/services/restaurantService.ts`, `src/services/menuService.ts` |
| Options/tarifs | `src/components/product/ProductModal.tsx`, `src/hooks/useProductConfigurator.ts`, `supabase/functions/_shared/orderPricing.ts`, `supabase/functions/_shared/menuPricing.ts` |
| Panier | `src/contexts/CartContext.tsx`, `src/services/cartService.ts`, `supabase/functions/cart-api/index.ts` |
| Validation commande | `src/pages/client/Cart.tsx` (`handleProceed`, `handleOrder`), `src/components/client/CustomerInfoForm.tsx`, `src/services/orderService.ts` (`createOrder`), `supabase/functions/create-order/index.ts` |
| Suivi/reçu | `src/pages/client/OrderTracking.tsx`, `src/hooks/useRealtimeOrder.ts`, `src/services/digitalMenuService.ts` (`readMenuReceipt`) |
| Connexion | `src/contexts/AuthContext.tsx`, `src/pages/auth/`, `src/components/client/AuthModal.tsx`, `src/lib/authSession.ts` |
| Admin commandes | `src/pages/admin/Dashboard.tsx`, `src/pages/admin/OrderDetail.tsx`, `src/hooks/useRealtimeOrders.ts`, `src/services/orderService.ts` |
| Catalogue admin | `src/pages/admin/MenuManager.tsx`, `src/services/adminMenuService.ts`, `src/components/admin/OptionGroupConfigurator.tsx` |
| Caisse/impression | `src/pages/admin/POS.tsx` (`handlePayment`), `src/services/printService.ts` (`printOrderTicket`) |
| QR/table | `src/pages/admin/RestaurantSettings.tsx`, `src/components/client/QrModePopup.tsx` |
| Livraison | `src/pages/delivery/`, `src/services/deliveryApiService.ts`, `src/services/deliveryAssignmentService.ts`, `src/hooks/useDriverGps.ts` |
| Transport/config | `src/lib/restClient.ts`, `src/lib/edgeFunctionFallback.ts`, `src/integrations/supabase/client.ts`, `vite.config.ts` |

## 3. Routes et différences
`/` et `/home` redirigent vers `/restaurant/la-parmigiana` (accès classique). `/menu/la-parmigiana` est le menu QR/NFC invité. `/super-admin` charge le tableau superadmin derrière `SuperAdminRoute`; l'API et RLS gardent leurs contrôles serveur. Pas de routes publiques multi-restaurants. Admin et livraison historiques encore présents. Ce sont des limites de navigation, pas une isolation serveur complète.

## 4. Parcours commande et contrats
1. DigitalMenu lit catalogue/options ; ProductModal prépare la sélection.
2. `prepareMenuCart` appelle `digital-menu` action `prepare` avec slug, mode, product_id, quantité et options. Le serveur recalcule le prix.
3. Une capacité aléatoire est retournée ; seule l'empreinte SHA-256 est enregistrée. Le navigateur associe sessionStorage au projet/panier ; localStorage porte `rzfood_cart_session_id`.
4. CartContext évite la fusion automatique du panier invité avec celui d'un compte. cart-api reprice le panier Parmigiana à la lecture.
5. Cart distingue session invitée et accès connecté. `optionalContact` est faux par défaut ; vrai seulement dans le parcours autorisé.
6. orderService envoie capacité ou identité ; create-order contrôle restaurant, panier, disponibilité, quantité, options, tarifs et paiement.
7. Invité : RPC `submit_digital_menu_order` verrouille session/stock, insère commande/lignes/choix et lie la session ; répétition retourne la même commande.
8. `markMenuOrder` conserve le reçu par order_id. Le suivi privé n'utilise que le jeton correspondant ; polling de 10 secondes. Nouvelle commande retourne au menu.

Le QR historique `?source=qr&table=...` et le nouveau menu invité sont distincts. `RestaurantSettings` génère actuellement le lien historique. Le paramètre QR n'est jamais une autorisation serveur ni une preuve de présence physique.

## 5. Supabase : faits locaux et limites
- Catalogue : restaurants → categories → products ; groupes/choix product_option_groups et product_options.
- Panier : carts/cart_items. Commandes : orders → order_items → order_item_choices.
- Session privée : digital_menu_sessions (restaurant_id, token_hash, cart_session_id, order_id, expires_at). Expiration 24h ; accès serveur.
- Types : `src/integrations/supabase/types.ts`. Un type généré n'établit pas le schéma distant actuel.
- Fonctions actives vérifiées le 31 octobre 2026 : `digital-menu` v4, `create-order` v3 (validation des tarifs de livraison téléphone par code postal), `cart-api` v4 et `sql-console` v1. Les autres sources historiques ne prouvent pas leur déploiement.
- Fonctions avec verify_jwt=false : vérifier les contrôles d'identité/capacité propres au code, ne pas les retirer.
- Migrations du 26 octobre : sécurité backend, transaction invitée, vue publique. L'historique API restauré diffère des fichiers historiques : rapprochement requis avant db push. Le journal Supabase créé via MCP ne reprend pas les timestamps des fichiers locaux; il contient aussi deux entrées `atomic_dual_rate_limit` dont les DDL sont idempotents. Ne pas lancer `supabase db push` avant rapprochement/repair explicite de l'historique.
- Revue distante du 31 octobre : lookup de rôle limité à l'utilisateur courant ; la vérification simulée du compte admin Parmigiana passe pour son restaurant et échoue pour superadmin/autres utilisateurs. La connexion réelle du personnel reste à tester.
- Le RPC de quota pairé est exécutable uniquement par `service_role` (vérification ACL distante : anon=false, authenticated=false, service_role=true). Vérifier les avis Auth/RLS et les fonctions distantes à chaque évolution sécurité.

## 6. Règles métier à préserver
Prix PDF sur place ; à emporter -1 EUR sur le prix de base de chaque article, boissons/cafés inclus, pas sur les suppléments. Réduction enfant 1,50 EUR selon catalogue. Pâtes/escalopes week-end Bruxelles. Catalogue documenté à la livraison : 93 articles, 7 catégories, IDs historiques conservés ; pas de nouvelle lecture distante pour ce document.

Invité Parmigiana : compte et coordonnées facultatifs, table facultative ; pas de livraison, fidélité/chat liés au compte ni promo invitée non validée serveur. Cash/card_counter sont des paiements physiques, initialement unpaid. Extérieur : règles de compte/profil conservées. Google visible mais désactivé « En cours ».

## 7. État des fonctionnalités
- CONFIRMÉ dans les sources : catalogue, commande, panier persistant, admin, POS, suivi, notifications, Realtime, livraison.
- PARTIEL : gestion des tables (numéro, pas de plan de salle identifié), paiement (au comptoir, pas de prestataire en ligne établi), configuration de compte admin.
- NON IDENTIFIÉ dans la recherche ciblée : pilote ESC/POS/Bluetooth/USB/réseau direct et file d'impression persistante. Impression actuelle : iframe HTML + print() navigateur.
- À VÉRIFIER : réception admin avec vrai compte, périphériques d'impression, configuration Auth et activation des fonctions historiques. Ne pas convertir une présence de code en validation opérationnelle.

## 8. Risques concrets pour les prochains chantiers
- printOrderTicket a un déclenchement onload et un fallback temporisé sans verrou commun : double impression possible.
- La branche historique connectée/POS de create-order effectue des insertions séparées ; garanties atomiques/idempotentes inférieures à l'invité.
- QR des réglages ne pointe pas sur le menu invité.
- Promotions historiques : total affiché et validation serveur à rapprocher avant extension. Options identifiées par noms : ambiguïtés possibles, IDs stables préférables pour une refonte.
- Photos historiques, comptes et secrets de services ne sont pas tous inclus dans les exports. Ne pas annoncer une migration complète.
- Le clone Parmigiana a une base indépendante ; ne pas confondre les deux projets quand on change des variables ou déploie.

## 9. Vérifier sans gaspiller
Commandes disponibles : npm ci, npm test, npm run build, npm run lint ; TypeScript : `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json`.
Vérifications du 31 octobre : `npm run test:rate-limits` (10 assertions SQL isolées), `npm run test:tables` (28 assertions SQL isolées), `npm test -- --run` (76 tests), TypeScript et build de production. Elles ne garantissent pas la sécurité globale. Les tests HTTP distants peuvent créer des commandes. Pour un changement visuel, tester le chemin touché et mobile ; pour prix/commande, vérifier frontend ET serveur.

Netlify : dist, réécriture SPA, variables VITE publiques au build. PWA : ressources statiques en cache, API/Auth NetworkOnly. Vérifier aussi une ancienne session après mise à jour. Pour Lovable, conserver le Supabase externe si tel est le périmètre autorisé.

Passe npm post-correctifs: Vite 6.4.5, Zod 4.6.7, React Router 7, Vitest 5 et vite-plugin-pwa 1.1.0; 85 tests, TypeScript, build PWA et tests SQL repassés. `npm audit`: 20 avis faibles/modérés restants uniquement côté développement, zéro haut/critique; `npm audit --omit=dev`: zéro avis. La dette lint globale est encore de 431 diagnostics. Serveur Vite local limité à loopback `127.0.0.1:8082`.

## 10. Maintenir cette mémoire
Mettre à jour seulement les sections concernées après évolution réelle. Rechercher les symboles avec rg -n ; lignes de TECHNICAL_MAP.json indicatives. Le PDF et les anciens audits restent références longues, inutiles à recharger pour chaque tâche. WORK_PLAN.md contient les chantiers proposés, pas une autorisation de tout réaliser.


## 11. Évolution tables et téléphone - 31 octobre 2026
Implémentée localement et migrée sur le Supabase dédié : voir `docs/tables-et-commandes-telephoniques.md`. Routes ajoutées : `/table/:token` et `/admin/service`. Appels communs aux écrans via polling 5s, pas de push écran verrouillé. Dix QR générés depuis les tables serveur.

La source `phone` requiert un rôle staff actif du restaurant ; commandes pending/unpaid via `submit_phone_order`, transaction et clé d'idempotence. Les comptes du personnel restent dans `delivery_drivers` avec les capacités `can_serve` et `can_deliver`, séparées du rôle restaurant_admin. Une nouvelle caisse lit les appels actifs, présélectionne leur table et transmet l'identifiant de l'appel avec la commande serveur.

Nouvelles tables : restaurant_tables, table_service_calls, phone_order_requests. Nouvelle colonne de session : table_number. RPC : get_service_table, request_table_service, advance_table_service, can_manage_table_service, submit_phone_order et submit_staff_order. `submit_staff_order` crée la commande et clôture l'appel de table dans une transaction idempotente. La migration locale `20261109182639_allow_server_table_service_calls.sql` autorise `can_serve` et ajoute cette clôture atomique ; elle n'a pas encore été appliquée au Supabase distant. Ne pas rejouer l'historique complet ni utiliser `db reset --linked`.

Tests SQL isolés : `npm run test:tables` (dépendance de développement PGlite). Ne pas confondre validation locale et activation réelle. Les archives et le PDF antérieurs ne documentent pas cette fonctionnalité.

### Tarifs téléphoniques par code postal
Migrations `20261031190000_phone_delivery_postcode_rates.sql` et `20261031194500_atomic_order_number_allocator.sql` appliquées au projet dédié ; `create-order` v3 déployée. La grille RLS est modifiable par l'admin restaurant, ses 10 exemples de codes 6xxx ont des prix provisoires, et le fallback est 15 €. POS fournit code postal + adresse, la fonction serveur recalcule frais et total, la commande pending/unpaid conserve le code postal. L'attribution des numéros est atomique et testée sous 100 demandes concurrentes. Les flux de commande complets n'ont pas été chargés en masse en production.


## 12. Sécurité et résilience - 31 octobre 2026
Le modèle de défense suit la segmentation d'un routeur : UI publique, fonctions serveur, données privées et administration ont des frontières distinctes. Une URL/QR n'est jamais une identité ; capacités invitées à durée limitée pour le parcours de commande. Les contrôles sensibles sont côté serveur et les rôles sont vérifiés contre l'utilisateur authentifié. Le superadmin est isolé par une garde dédiée côté route et des contrôles de rôle côté serveur/RPC.

Anti-abus déployé : quotas atomiques persistants en base, HMAC-hashés, service_role seulement. Les quotas IP utilisent uniquement `CF-Connecting-IP` injecté par le proxy Cloudflare de Supabase ; `X-Forwarded-For` et `X-Real-IP` sont ignorés car ils peuvent être fournis par le client. Le menu échoue fermé si l’IP de confiance manque ; le panier conserve alors uniquement le quota d’identité. `digital-menu`: préparation 20/minute par IP et état 180/minute par IP ; `create-order`: 3/minute par session/utilisateur ; `cart-api`: 120/minute par identité et 300/minute par IP avec RPC pairé. Ce sont des fenêtres fixes, susceptibles d'un pic à leur frontière. Pas de promesse d'immunité au déni de service réseau.

Le menu et la sélection peuvent rester lisibles lors d'une panne, mais commande, statut de table et appel serveur ne sont jamais simulés localement. Les sessions de table échouent de façon fermée. Les headers Netlify/Vercel ajoutent HSTS, anti-frame, permissions minimales et CSP partielle ; la politique CSP complète reste à établir après inventaire des domaines tiers.

Revue du 31 octobre après optimisations : les 18 clés étrangères sans index ont maintenant des index, et les politiques RLS évaluent `(select auth.uid())` via un initplan ; l'avis `auth_rls_initplan` a disparu. Six tables sans policy restent intentionnellement fermées par leurs ACL (paniers/session/quota/idempotence/counters privés) ; les privilèges `anon` et `authenticated` ont été retirés des six, avec accès `service_role` vérifié. `get_user_restaurant_id` et `has_role` restent exécutables par `anon` car des politiques publiques les utilisent ; les fonctions vérifient `auth.uid()` non nul et limitent les résultats à soi-même ou au superadmin. L'appel anonyme direct renvoie `false`/`NULL`. `advance_table_service` et `delete_restaurant_cascade` restent réservées à `authenticated` et vérifient respectivement le staff du restaurant et le superadmin ; le `search_path` de la suppression cascade est maintenant vide et toutes ses tables sont qualifiées. Ces fonctions SECURITY DEFINER restent signalées par l'advisor, mais leurs gardes sont intentionnelles et leurs tests d'isolation précédents restent requis.

## 13. Correctifs et déploiements — 31 octobre 2026
OAuth limite maintenant les redirections à la même origine. `cart-api` v5 limite les lignes au panier courant et ne crée plus un panier vide lors d'une lecture. Les logs debug sont désactivés par défaut et expurgés. Le panneau des appels notifie aussi à l'ouverture et peut jouer une alarme répétée après activation audio; pas de push lorsque l'app est fermée.

Quotas atomiques par session + IP et garde d'appartenance restaurant pour l'enrôlement chauffeur déployés. Fonctions actives après le contrôle du 31 octobre : digital-menu v7, create-order v5, cart-api v6, delivery-api v2, driver-session v2, site-diagnostic v2, sql-console v2, totp-api v1. Le diagnostic exige JWT + rôle superadmin; `AI_API_KEY` n'a pas été inspectée et reste à configurer. La route `/super-admin` charge le tableau derrière `SuperAdminRoute`.

Nettoyage SQL des paniers abandonnés planifié quotidiennement à 03:15 UTC, suppression par lots après 7 jours, service_role uniquement. Vérifications récentes : 85 tests applicatifs, 37 contrôles SQL table, test SQL quotas (100 sessions), Deno, TypeScript, lint (0 erreur/avertissement) et build passés. L'audit npm de production retourne zéro vulnérabilité ; l'audit complet relève encore 20 vulnérabilités de faible/modérée gravité dans les outils de développement. Détails et limites dans `reports/audit-complet-2026-10-31.md`. Push PWA app fermée, charge de 100 écritures, restauration hors site et clé IA restent ouverts.

Le contrôle HIBP des mots de passe demeure désactivé : le projet Supabase est au plan Free, alors que Supabase indique que cette fonction nécessite Pro ou supérieur ([documentation Supabase](https://supabase.com/docs/guides/auth/password-security)). Aucune mise à niveau payante n'a été faite. L'advisor signale aussi 7 groupes de politiques permissives multiples et 32 index inutilisés selon les statistiques courantes ; ne pas supprimer ces index sans mesure de charge durable, notamment les 18 nouveaux. Le monitoring 30 min (1 204 sondes), le fuzz (1 288 requêtes), le test lecture à 100 utilisateurs (2 100 requêtes), les 76 tests applicatifs, 37 tests SQL isolés, TypeScript et le build ont passé. Les essais de charge n'ont pas créé de commandes réelles ni testé 100 écritures simultanées. La sauvegarde distante hors site et un exercice de restauration ne sont pas configurés.
