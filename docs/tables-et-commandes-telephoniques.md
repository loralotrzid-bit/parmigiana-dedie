# Tables, service en salle et commandes téléphoniques

Version locale du 31 octobre 2026, uniquement dans `parmigiana-dedie`.

## Parcours livré dans les sources

- Dix tables, numérotées de 1 à 10, initialisées par la nouvelle migration pour le slug `la-parmigiana`.
- Chaque table possède un QR à jeton UUID aléatoire : `/table/:token`. Le même lien convient au NFC.
- Après scan : « Commander sur RZ Food » ou « Demander au serveur ».
- La commande passe au menu digital en mode sur place ; la session serveur porte la table. Un numéro de table falsifié au checkout ne remplace pas cette valeur. À emporter, le numéro de table n'est pas enregistré sur la commande.
- L'appel est unique tant qu'il est en attente ou pris en charge. Après clôture, délai minimal de 30 secondes depuis l'appel précédent.
- `/admin/service` : vue salle adaptée au téléphone, appels et téléchargement du ZIP des QR actifs des tables 1 à 5. Les QR utilisent le domaine actuellement ouvert ; générer le ZIP depuis le domaine public avant impression.
- Boutons « Je m'en occupe », puis « Terminer l'appel ». Les états sont communs aux appareils ; actualisation toutes les cinq secondes lorsque la page est ouverte. Pas de notification push écran verrouillé ni garantie d'actualisation en arrière-plan mobile.
- Les accès staff utilisent les rôles administrateurs actifs existants et leur restaurant. Aucun nouveau rôle serveur limité n'est créé : un compte restaurant_admin conserve les autres permissions de ce rôle.
- POS : « Saisir une commande téléphonique » demande maintenant le numéro, recherche les commandes précédentes de ce restaurant et peut reprendre le nom et les adresses de livraison historiques. Les adresses trouvées sont sélectionnables ; en absence d'historique, la livraison demande code postal/localité puis adresse. Le choix emporter/livraison suit la recherche. La livraison téléphonique a sa grille et son tarif hors zone distincts. Un tarif actif de la grille s'applique, sinon le serveur utilise le tarif hors zone (15 € par défaut). Les exemples initiaux pour les codes 6000–6042 restent à régler dans Configuration → Livraison. L'Edge Function recalcule le tarif depuis Supabase et enregistre le code avec la commande. Le moyen de règlement choisi est prévu, pas encaissé.
- Les routes personnel `/delivery/service` et `/delivery/caisse` partagent maintenant un écran avec les onglets Salle/Appels et Caisse/Tables ; l'ancienne route caisse redirige vers l'espace commun.
- Source `phone`, statut `pending`, paiement `unpaid` : ces commandes arrivent dans la liste de préparation, contrairement aux ventes POS immédiates. Numéro et nom figurent dans les informations de la commande (nom dans la note).
- La validation serveur contrôle le personnel, le restaurant, les prix et les modes. Une RPC transactionnelle et une clé de requête empêchent le doublon d'une nouvelle tentative identique ; le panier téléphone et la clé ne sont pas restaurés après fermeture de la page.
- Les numéros quotidiens sont réservés atomiquement par restaurant, avec reset à 05:00 Europe/Brussels et limite 9 999 ; la migration ajoute des index aux listes de commandes et aux jointures d'articles.

## État de migration

Le schéma et les tables service sont migrés sur le nouveau Supabase dédié `aehfmqoxvfuizcloowlj`. Les 10 tables QR sont créées, et les fonctions `digital-menu`, `create-order` et `cart-api` sont actives. L'ancienne base n'a pas été modifiée. Les tests d'intégration sur deux appareils et la création d'un compte administrateur restent à faire avant usage réel.

Le frontend doit être publié sur le domaine définitif avant de distribuer les QR ; ceux générés depuis localhost ne sont pas utilisables par les clients sur leur téléphone.

Ne pas distribuer les QR avant publication du frontend sur le domaine définitif et test réel sur deux appareils. Une URL de table partagée peut être réutilisée à distance : elle identifie une table, pas la présence physique du client. En cas de fuite, un administrateur backend peut désactiver la table ou renouveler son jeton, puis réimprimer le QR.

## Fichiers et responsabilités

| Fichier | Rôle |
| --- | --- |
| `src/pages/client/TableEntry.tsx` | Entrée publique, choix commande/appel, erreur explicite si non transmis |
| `src/services/tableService.ts` | Client typé des tables et RPC de service |
| `src/components/admin/ServiceCallsPanel.tsx` | Liste partagée et transitions |
| `src/pages/admin/TableService.tsx` | Vue téléphone et QR téléchargeables |
| `src/pages/admin/Dashboard.tsx` | Même panneau sur le poste restaurant |
| `src/pages/admin/POS.tsx` | Formulaire téléphone, tarif selon mode, clé de requête et envoi |
| `src/components/admin/PhoneDeliveryRatesManager.tsx` | Gestion admin des codes postaux, montants, activation et tarif hors grille |
| `src/services/phoneDeliveryRatesService.ts` | Lecture et mutations de la grille via RLS |
| `src/services/orderService.ts` | Identité staff même si un panier QR est actif dans le navigateur |
| `src/services/digitalMenuService.ts` | Transmission du jeton de table et conservation du numéro retourné |
| `supabase/functions/digital-menu/index.ts` | Résolution serveur du jeton et rattachement à la session |
| `supabase/functions/create-order/index.ts` | Autorisation staff, table liée et soumission téléphone atomique |
| `supabase/migrations/20261031190000_phone_delivery_postcode_rates.sql` | Grille par restaurant, tarif de secours et champ code postal |
| `supabase/migrations/20261031105539_table_service_calls.sql` | Schéma, droits, initialisation des tables et RPC |

## Vérifications reproductibles

- `npm test` : tests unitaires/composants, dont contrôles API simulés, identité staff/QR et appels.
- `npm run test:tables` : PostgreSQL embarqué PGlite isolé ; exécute la vraie nouvelle migration sur un schéma de test minimal. Vérifie RLS, déduplication, transitions et transaction/idempotence/rollback téléphone. Aucun réseau ni écrit distant. Ne remplace pas les tests du schéma Supabase réel et de ses triggers.
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json`.
- `npm run build`.

Principes de contrôle : [fonctions SQL Supabase](https://supabase.com/docs/guides/database/functions), [droits par ligne](https://supabase.com/docs/guides/database/postgres/row-level-security). Les RPC publiques sont une exception volontaire et étroite aux écritures privées : elles résolvent un jeton sans exposer les tables ou l'historique.

Les anciennes archives ZIP ne contiennent pas ces évolutions. Le projet RZ Food voisin n'a pas été modifié pour cette fonctionnalité.
