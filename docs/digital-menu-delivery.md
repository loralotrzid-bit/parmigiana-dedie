# Menu digital La Parmigiana

## Parcours livré

Entrée QR/NFC : `/menu/la-parmigiana`. Le support QR et la puce NFC ouvrent la
même URL. Le choix initial est sur place ou à emporter. La sélection est préparée
côté serveur puis transmise au panier RZ Food existant. Le nom, le téléphone,
l'email et l'adresse sont facultatifs, sur place et à emporter, uniquement dans
ce parcours La Parmigiana. Un bouton permet de continuer sans coordonnées.
Le client choisit ensuite espèces ou carte au comptoir.
Le numéro de table est facultatif pour une commande sur place.

Le compte n'est pas requis dans ce parcours. Une capacité aléatoire de 256 bits,
valable 24 h et conservée dans l'onglet, autorise une seule commande et son suivi.
Seule son empreinte SHA-256 est en base. Le serveur vérifie le restaurant, la
session du panier et le canal QR. Le parcours direct reste soumis à connexion.
Un lien QR peut être partagé : ce mécanisme identifie le parcours d'entrée,
il ne prouve pas une présence physique dans le restaurant.
Les coordonnées et l'authentification de l'accès extérieur conservent leurs règles.
Le bouton Google est visible mais désactivé, marqué « En cours (pas encore disponible) »
dans la fenêtre de connexion et les écrans de connexion/inscription.

## Tarifs et catalogue

Le PDF fourni est conservé dans `public/menu-la-parmigiana.pdf`. Ses tarifs sont
les prix sur place. L'instruction du propriétaire applique 1 € de moins à chaque
article à emporter, y compris boissons et cafés. Les suppléments ne sont pas
réduits. La formule enfant déduit 1,50 € conformément au PDF.

93 articles dans 7 catégories, avec les identifiants des 68 produits existants
conservés. Ajout des références absentes ; correction des tarifs divergents,
notamment Focaccia, Caprissosa, Bianca neve, Mari e monti, desserts et boissons.
Les pâtes et escalopes sont indiquées uniquement le week-end dans le PDF ; cette
restriction est contrôlée avec le fuseau Europe/Brussels. Sauces, accompagnements,
parmesan et ingrédients inclus du Calzone farcito reprennent les indications du PDF.

Le catalogue reste dans les tables existantes. `docs/pdf-menu-transcription.json`
documente la transcription ; l'interface lit Supabase, pas ce fichier.
Les promotions figurant sur la couverture ne sont pas activées automatiquement.
La livraison reste désactivée. Les horaires importés n'ont pas été remplacés.

## Serveur et persistance

Nouveau projet dédié : `aehfmqoxvfuizcloowlj`, application locale reliée
par `.env.local` (ignoré par Git). Le site public et sa base historique sont inchangés.

Fonctions actives pour ce parcours : `digital-menu`, `cart-api`, `create-order`.
Le serveur recalcule produits et options depuis les données du catalogue.
Le panier est repricé à chaque lecture pour ce restaurant. Les commandes invitées
utilisent une transaction SQL avec verrouillage de la session et du stock : une
soumission répétée retrouve la même commande. Le suivi invité exige sa capacité.

Le schéma et les données publiques du catalogue Parmigiana ont été importés sur
le nouveau projet. État distant : 1 restaurant, 7 catégories, 93 produits,
116 groupes d'options, 1 919 options, 1 configuration de livraison et 10 tables.
Deux migrations sont enregistrées et les fonctions `digital-menu`, `cart-api` et
`create-order` sont actives. Le projet source n'a pas été modifié.

Les commandes/historiques privés, les utilisateurs Auth et rôles, les identifiants
Google/Apple, les secrets TOTP/IA et les objets photo Storage n'ont pas été migrés.
Le nouveau projet compte zéro utilisateur Auth et zéro rôle : créer/configurer un
compte administrateur avant utilisation des écrans admin. Les liens image importés
peuvent encore pointer vers l'ancien Storage. Ce transfert porte sur le schéma,
le catalogue et le parcours menu/salle/téléphone, pas sur toutes les données RZ Food.

## Vérifications

- 52 tests Vitest réussis ; contrôle TypeScript réussi.
- Build de production réussi (avertissement existant de taille du bundle).
- Lint ciblé des nouveaux fichiers frontend et des calculs réussi.
- Test HTTP sur le nouveau projet : 2 Margherita = 22 € sur place / 20 € à emporter ;
  tarif navigateur falsifié ignoré ; formule enfant = 8,50 € à emporter.
- Livraison refusée, capacité absente/falsifiée refusée, suivi d'une autre commande
  refusé, double soumission sans doublon ; panier persistent vérifié.
- Commandes sur place et à emporter sans nom, téléphone ni adresse validées par HTTP
  sur le nouveau projet ; coordonnées obligatoires du formulaire extérieur conservées.
- Vérification navigateur : fenêtre de choix, tarifs à emporter, panier et formulaire
  de coordonnées sans écran de création de compte. Affichages mobile et ordinateur inspectés.
- Les commandes de test portent une note explicite et existent uniquement dans le
  nouveau projet. Aucun paiement réel ni message au restaurant envoyé.

La publication du frontend et le QR/NFC définitif attendent le choix d'hébergement
et l'accord de mise en production. Pour tester : `npm run dev`, puis
`http://127.0.0.1:8080/menu/la-parmigiana`.
