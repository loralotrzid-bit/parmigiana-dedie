# La Parmigiana - application dédiée

Copie indépendante du projet RZ Food, limitée au restaurant La Parmigiana.

- `/` : entrée classique, redirection vers `/restaurant/la-parmigiana`.
- `/menu/la-parmigiana` : entrée QR/NFC, commande invitée avec coordonnées facultatives.
- `/admin` : administration protégée ; rôles Supabase nécessaires.
- Aucune route publique permettant de sélectionner un autre restaurant.

## Local
`npm ci` puis `npm run dev -- --host localhost --port 8082 --strictPort`.

Le clone local utilise le projet Supabase dédié `aehfmqoxvfuizcloowlj` via `.env.local` (ignoré par Git).
Le schéma, le catalogue Parmigiana et les fonctions du parcours menu sont migrés sur cette base.
La base source et le projet RZ Food restent inchangés. Comptes, historique privé et images Storage
ne sont pas importés ; voir `docs/digital-menu-delivery.md` pour les limites.

Les sources historiques non routées sont conservées pour reprise ; aucune migration historique ne doit être rejouée automatiquement.
