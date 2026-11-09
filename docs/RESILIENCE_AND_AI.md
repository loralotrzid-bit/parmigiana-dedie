# Fiabilité, sécurité et préparation IA

## Repli en cas d'indisponibilité

- Le catalogue peut rester visible à partir du cache React Query pendant une navigation courte; le service worker ne met jamais les réponses API/Auth en cache.
- Aucun panier ne doit être présenté comme une commande acceptée sans confirmation du serveur. La sélection du menu QR est conservée en `sessionStorage` à travers un rechargement; un échec de préparation laisse le client sur le menu pour réessayer. Ne jamais simuler un paiement, une commande acceptée ou un appel serveur.
- Les écritures de commande reposent sur la transaction/idempotence serveur existante. Les appels de table sont dédupliqués par table tant qu'un appel est actif et limités par un délai côté base.
- Le journal de migrations Supabase a été créé par le connecteur avec des versions différentes des fichiers locaux (dont une double entrée idempotente pour le rate limiter). Ne pas faire `supabase db push` avant rapprochement explicite.
- Un vrai PRA DB exige des sauvegardes Supabase restaurables et testées. Un cache local ne remplace pas les sauvegardes; aucune réplication de base automatique n'est configurée actuellement.
- Le projet Free ne fournit pas de sauvegarde automatique quotidienne selon l'offre Supabase actuelle. Pour créer le filet de sécurité, exporter le schéma, les rôles et les données avec la CLI, chiffrer les fichiers hors de ce dépôt et faire un essai de restauration dans un projet séparé. L'export logique ne contient pas les objets Storage; ceux-ci doivent avoir leur propre copie.

## Limites des protections anti-abus actuelles

- Les quotas des fonctions actuellement actives — commande 3/min/session, préparation menu 20/min/IP, statut menu 180/min/IP, panier 120/min/identité et 300/min/IP — sont stockés atomiquement dans Postgres, partagés entre les instances, et utilisent des clés HMAC (pas d'IP ni d'identifiant brut). Les limites IP utilisent uniquement `CF-Connecting-IP` injecté par le proxy Cloudflare de Supabase; les valeurs fournies par le client dans `X-Forwarded-For` et `X-Real-IP` sont ignorées. Le menu échoue fermé si le header de confiance manque; le panier reste limité par identité. Ces fenêtres fixes peuvent autoriser une rafale à leur frontière; les limites globales de l'API Gateway/WAF restent utiles contre un déni de service volumétrique.
- Les quotas TOTP (5/5 min/admin), validation livreur (10/min/IP) et codes livraison (5/5 min/livreur) sont préparés dans les sources, mais ces trois Edge Functions n'étaient pas déployées/actives lors de la dernière vérification Supabase. Ne pas les considérer comme activés avant leur déploiement contrôlé. Le flux GPS conserve un garde-fou local en mémoire pour éviter une écriture SQL par point.
- Les pages sont chargées par route et leurs bundles JS passent par le cache runtime du service worker; l'installation ne télécharge donc plus toutes les pages d'administration et de livraison au premier affichage. Les APIs restent exclues de tout cache.
- L'attribution de points est suspendue côté navigateur et limitée à `service_role` jusqu'à l'ajout d'un flux serveur idempotent lié à une commande validée.
- Les codes promo sont temporairement masqués dans le checkout Parmigiana : l'ancien client affichait une remise locale non recalculée par `create-order` et incrémentait le quota via un RPC direct. Les RPC de validation et consommation sont maintenant réservés à `service_role`, jusqu'à leur intégration atomique dans la création de commande.
- L'affichage et la réclamation des récompenses sont également masqués/fermés tant que le programme Parmigiana est annoncé comme inactif.
- Un `HTTP 200` ne prouve pas qu'une lecture est sûre : valider le contenu et l'identité des lignes renvoyées.
- La politique RLS des restaurants masqués est limitée au restaurant propre de l’admin; les demandes RGPD sont réservées au propriétaire et au superadmin. `can_manage_table_service` fonctionne désormais en SECURITY INVOKER et reste utilisable dans les politiques RLS. Test SQL simulé : l’admin Parmigiana ne peut pas sonder le rôle du superadmin, lire son restaurant ni invoquer la suppression cascade. Un test React verrouille aussi la redirection hors des routes superadmin. Les sondes de sécurité ne remplacent pas des tests avec des sessions de chaque rôle. Vérifier explicitement qu'un restaurant_admin reçoit 403/aucune ligne sur tous les parcours super-admin et qu'un utilisateur ordinaire ne peut pas gérer les appels/tableaux.
- Les rapports `reports/monitor-*` et `reports/fuzz-*` sont des vérifications à faible cadence, pas un test de charge ni un audit de pénétration exhaustif.

## Rôles et alertes

Rôles cibles : `super_admin` global; `restaurant_admin` limité à son restaurant; personnel avec rôle d'équipe (`server` ou `driver`) à modéliser et autoriser par restaurant. Ne jamais faire confiance aux rôles stockés côté navigateur. Les fonctions d'administration vérifient le rôle actif dans Postgres.

Le polling d'écran garde le tableau d'appels à jour uniquement lorsque l'application tourne. Les notifications système lorsque l'app est en arrière-plan nécessitent Web Push (VAPID, table d'abonnements, endpoint authentifié de notification, gestion de révocation) et un essai sur iOS/Android installé. Ce n'est pas encore configuré; ne pas promettre de réveil garanti d'un téléphone.

## Préparer OpenRouter sans l'activer

- Prévoir `OPENROUTER_API_KEY` et `OPENROUTER_MODEL` comme secrets serveur Supabase seulement. Ne jamais utiliser un préfixe `VITE_` pour une clé.
- Lors de l'implémentation future, appeler OpenRouter uniquement depuis une Edge Function avec authentification/rôle, quotas, timeout, limite de taille, journalisation sans données personnelles et réponse de repli déterministe.
- Aucun appel OpenRouter n'est ajouté au parcours actuel; le service reste désactivé tant que les secrets et un cas d'usage ne sont pas validés.

## Vérification avant production

1. Exécuter les suites unitaires et de build.
2. Tester le statut d'appel après refresh sur plusieurs navigateurs; vérifier le déblocage seulement après résolution admin.
3. Auditer les fonctions `SECURITY DEFINER` connectées signalées par Supabase et garder un `search_path` fixe; les permissions doivent suivre le moindre privilège. Les fonctions QR anonymes ont été retirées de PostgREST et transitent désormais par `digital-menu` v4, avec quotas IP; le reste des appels QR n'est pas simulé en local.
4. Tester chaque écran avec une session super_admin, restaurant_admin, driver/server, puis sans session.
5. Configurer et vérifier sauvegardes/restauration, domaines Auth, notifications Web Push et secrets avant mise en production.

## Réglages Supabase restant à faire dans le tableau de bord

- Activer `password_hibp_enabled` dans Auth > Password Security. L'advisor Supabase le signale encore désactivé; aucun jeton Management API n'est présent et l'automatisation UI des réglages de sécurité n'est pas disponible dans cet environnement.
- Sauvegardes Free : effectuer des exports réguliers et un restore d'exercice. Supabase recommande `supabase db dump`; l'offre Free ne garde pas automatiquement des backups quotidiens.

Runbook minimal (à lancer avec le Supabase CLI installé, Docker disponible et le mot de passe DB fourni par un administrateur) :

```powershell
npx supabase login
npx supabase link --project-ref aehfmqoxvfuizcloowlj
New-Item -ItemType Directory -Force backups | Out-Null
npx supabase db dump --linked --file backups/schema.sql
npx supabase db dump --linked --role-only --file backups/roles.sql
npx supabase db dump --linked --data-only --use-copy --file backups/data.sql
```

Chiffrer et copier les trois fichiers vers un stockage hors du dépôt. Pour un exercice, restaurer d'abord vers un projet Supabase séparé, puis vérifier catalogue, commandes, rôles/RLS, Auth et objets Storage (les objets Storage exigent un export distinct). Ne jamais utiliser `db reset --linked` sur la production.

Références officielles : [Backups Supabase](https://supabase.com/docs/guides/platform/backups), [dump et restauration CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [réglage Auth Management API](https://supabase.com/docs/reference/api/v1-update-auth-service-config).

Netlify (`netlify.toml`) et Vercel (`vercel.json`) ajoutent les en-têtes de sécurité de base en production. Si Lovable héberge le build, reporter ces mêmes en-têtes dans sa configuration d'hébergement; les en-têtes Vite ne couvrent que le serveur de développement.
