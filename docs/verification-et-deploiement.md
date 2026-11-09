# Vérification du flux et livraison — 26 octobre 2026

## Commande utilisateur 008

Vérifiée en lecture dans le nouveau projet Supabase. Commande sur place, canal QR,
statut en attente, paiement carte au comptoir non encaissé. Total : 8 €, identique
à la somme des lignes. Aucune coordonnée fournie. La session est bien rattachée au
restaurant, au panier et à cette commande. Aucune modification de cette commande
ni de la base effectuée pendant cette revue.

## Administration

Le tableau de bord charge les commandes par restaurant, sans imposer de compte
client ni de téléphone. La commande 008 répond aux filtres des commandes actives.
Les politiques RLS autorisent sa lecture et le changement d'état à l'admin actif
de ce restaurant ou à un super-admin. Les lignes et suppléments suivent ces droits.

**Aucun compte administrateur actif n'est actuellement configuré dans la nouvelle
base.** La revue a vérifié le code et les politiques, pas une session admin réelle.
Avant exploitation, créer/identifier le compte propriétaire puis lui attribuer les
droits appropriés. Cette action n'a pas été réalisée, conformément au souhait de
conserver la base telle quelle. Ne pas ouvrir les tables au public pour y remédier.

## Corrections issues de la revue

- Conservation du reçu invité dans son onglet lorsqu'une nouvelle sélection est
  commencée ; un reçu invité ne détourne plus la lecture d'une commande ordinaire.
- Le chat, qui exige une identité connectée, n'est pas proposé sur le reçu invité.
  Le suivi continue par lecture privée toutes les dix secondes.
- Les codes promotionnels, non reliés à la validation serveur de ce parcours,
  ne sont pas proposés dans le paiement invité. Les règles tarifaires validées
  restent celles du menu : prix sur place, moins 1 € à emporter, options du catalogue.
- Un échec d'enregistrement d'usage promotionnel après création d'une commande
  ordinaire ne fait plus annoncer à tort un échec de création.
- Le bouton « Nouvelle commande » du reçu invité retourne au menu digital.

## Limites connues avant publication

- La session invitée et son reçu expirent au bout de 24 h. Le lien de suivi doit
  être rouvert dans le même onglet/navigateur ; aucun compte n'est créé.
- Le QR/NFC ouvre un lien : il identifie le parcours, pas une présence physique.
- Nom, téléphone et adresse facultatifs : l'identification sur place repose sur le
  numéro de commande et, si renseigné, le numéro de table.
- Google est uniquement visuel (« En cours »). Email/mot de passe et les autres
  fonctions historiques demandent leur configuration Auth avant usage réel.
- Le nouveau projet conserve les comptes, photos et secrets manquants de l'export
  comme points à configurer. Les images historiques peuvent encore dépendre de
  l'ancien stockage. Le menu digital n'a pas besoin de ces photos pour s'afficher.
- Le parcours invité est transactionnel et idempotent. Le parcours historique
  connecté/POS garde certaines limites décrites dans l'audit initial ; cette
  livraison ne constitue pas une certification de toute la plateforme RZ Food.

## Archive unique Lovable / Netlify

Le ZIP de livraison contient :

- `app/` : sources React/Vite, tests, fonctions serveur, PDF, documentation ;
- `site/` : build statique du même code, prêt pour un dépôt manuel Netlify ;
- `netlify.toml` : configuration de build avec `app/` comme dossier de base ;
- `ENVIRONNEMENT.md` : les trois variables publiques du Supabase actuel ;
- `LISEZMOI.md` : les étapes adaptées à chaque hébergeur.

Les dépendances `node_modules`, le dépôt `.git`, les caches, journaux, exports CSV,
commandes clients et sessions privées ne sont pas inclus. Les données restent
dans le Supabase actuel : aucun import ou rejeu de migrations n'est nécessaire.

Le fichier `app/.env` de l'archive contient uniquement l'URL du projet, sa référence
et sa clé publique. Aucune clé service-role ni mot de passe de base n'est fourni.
Les variables `VITE_*` sont publiques et intégrées au JavaScript lors du build.
Après un changement de Supabase, modifier les trois variables puis reconstruire.

### Lovable

Transmettre le ZIP et utiliser les sources `app/`. Conserver le Supabase externe
actuel, les fonctions `digital-menu`, `cart-api`, `create-order`, les contrôles de
session et les règles tarifaires. Ne pas créer une seconde base automatiquement.
Lovable peut devoir adapter son mode d'import ; l'archive ne garantit pas un
import automatique en un clic. Google reste désactivé tant qu'il n'est pas configuré.

### Netlify

Déploiement manuel : dézipper, puis déposer le dossier `site/` dans Netlify Deploy.
Ne pas déposer le ZIP universel entier : il contient aussi les sources.

Build continu : placer l'ensemble dans le dépôt utilisé par Netlify. La configuration
racine utilise `app/`, Node 22, `npm ci && npm run build`, sortie `app/dist/`.
Pour un dépôt contenant seulement les sources de `app/`, son propre `netlify.toml`
prévoit le build depuis cette racine. Renseigner au besoin les trois variables
publiques dans l'interface Netlify avec les valeurs d'`ENVIRONNEMENT.md`.

URL d'entrée après publication : `https://VOTRE-DOMAINE/menu/la-parmigiana`.
Configurer le QR/NFC avec cette URL définitive, puis tester commande et réception
administrateur. Pour l'authentification extérieure, mettre à jour Site URL et URLs
de redirection Supabase avec le domaine retenu. Aucun domaine public ni réglage
Auth n'a été modifié pendant la préparation de l'archive.
