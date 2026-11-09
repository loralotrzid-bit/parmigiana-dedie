# Plan de travail A à Z

Préparation documentaire du 31 octobre 2026. Ce plan organise la suite ; les fonctionnalités futures sont des propositions à sélectionner selon la demande utilisateur, pas une réécriture automatique.

| Phase | Livrable / actions | Fichiers concernés | Critère de sortie |
| --- | --- | --- | --- |
| A. Repères | AGENTS, contexte et index technique | AGENTS.md, docs/PROJECT_CONTEXT.md, docs/TECHNICAL_MAP.json | Références locales vérifiées |
| B. Choisir le projet | Préciser marketplace ou copie dédiée, résultat visible et invariants | Contexte et git status | Périmètre clair, modifications existantes préservées |
| C. État de départ | Lire seulement les modules concernés ; vérifier le diff et les dépendances | Index puis fichiers ciblés | Hypothèses séparées des faits |
| D. Décision backend | Si nécessaire, décider base commune ou séparée ; vérifier les accès | Configuration, fonctions et droits | Ne pas confondre clonage local et isolation distante |
| E. Priorités techniques | Corriger un seul problème : QR, impression ou commande selon besoin | Voir recettes ci-dessous | Critères testables définis |
| F. Implémentation | Petits changements cohérents, conservation des contrats | Module et dépendances nécessaires | Diff relisable, sans nettoyage hors sujet |
| G. Validation locale | Tests ciblés, types/build si pertinents, parcours mobile | Tests et écrans concernés | Résultats réels consignés |
| H. Validation métier | Invité/externe, prix, options, réception admin si concernée | Tunnel complet pertinent | Aucune régression connue non signalée |
| I. Préparer livraison | Version, environnement public, aperçu et retour arrière | Build/config/docs | Livrable prêt et limites explicites |
| J. Publication | Seulement dans le périmètre autorisé ; domaine/Auth/QR final | Hébergement et backend | Vérification réelle après publication |
| K. Maintenance | Mettre à jour mémoire et index, bref rapport | Documents concernés | Prochaine tâche sans nouvel audit global |

## Recettes de modification
- QR invité : RestaurantSettings.tsx (qrUrl), QrModePopup.tsx, DigitalMenu.tsx et digitalMenuService.ts ; tester QR historique, QR invité, table et extérieur. Risque : élargir par erreur l'accès sans compte.
- Impression : printService.ts / printOrderTicket, POS.tsx / handlePayment, Dashboard.tsx ; un seul déclenchement, fallback sans doublon, échec explicite. Les essais simulés ne certifient pas une imprimante physique.
- Commande classique/POS : create-order/index.ts, orderService.ts / createOrder, future migration après audit du schéma ; tester atomicité, idempotence, concurrence, stock, refus sans écrit et rôles. Ne pas casser le RPC invité.
- Tarif/options : menuPricing.ts, orderPricing.ts / priceOptions, useProductConfigurator.ts, catalogue ; tester mode, gratuités, réduction enfant, inconnus, doublons et total persisté.
- Administration : Dashboard.tsx, OrderDetail.tsx, useRealtimeOrders.ts, RLS ; rôle du bon restaurant, commande sans coordonnées et changement d'état. Configurer un vrai compte plutôt que contourner les droits.
- Nouvelle base dédiée : d'abord inventaire/sauvegarde du schéma et données autorisées, rapprochement migrations, secrets serveur et Auth/stockage ; ensuite import vérifié, fonctions, frontend, essais et retour arrière. Aucun rejeu aveugle des anciens SQL.

## Rapport bref après chaque tâche
Objectif réalisé ; fichiers/fonctions modifiés ; contrôles exécutés et résultats ; limites ou décision restante. Ne jamais annoncer un test non effectué, un compte configuré ou un déploiement sur la seule base des sources.

## Préparation réalisée
- Lecture ciblée des deux projets et des zones commande/QR/admin/POS/impression.
- Règles permanentes, mémoire et index statique créés dans chaque projet.
- Aucune modification applicative ni opération distante dans cette étape.

## Tables et téléphone
Sources, migrations et tests locaux ajoutés; tables/appels téléphoniques migrés sur le Supabase dédié. Les limites opérationnelles restent dans `docs/tables-et-commandes-telephoniques.md`.
