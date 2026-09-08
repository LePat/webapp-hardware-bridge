# Signer whb.exe (supprimer l'avertissement SmartScreen)

L'avertissement "Windows a protégé votre PC / Éditeur inconnu" apparaît parce que
`whb.exe` n'est pas signé avec un certificat de signature de code. Aucune astuce de
build ne peut contourner ça : il faut une identité vérifiée par une autorité de
certification. Ce projet utilise le programme gratuit de
[SignPath.io](https://signpath.io/) pour les projets open-source.

Le pipeline (`.github/workflows/release.yml`) est déjà prêt à signer automatiquement
dès que les secrets/variables ci-dessous sont configurés sur le repo GitHub. Sans eux,
la release contient quand même `whb.exe`, mais **non signé** (avertissement toujours
présent).

## Étapes à faire une seule fois

1. **Créer le repo GitHub public** (le programme SignPath Foundation exige un projet
   open-source visible publiquement).

2. **Candidater à SignPath Foundation** : https://signpath.io/product/open-source
   - Décrire le projet (WebApp Hardware Bridge - pont impression/série pour WebApps).
   - Lien vers le repo GitHub.
   - Délai habituel : quelques jours ouvrés.

3. Une fois approuvé, dans le **dashboard SignPath** :
   - Créer un projet (ex. slug `webapp-hardware-bridge`).
   - Créer une "Signing Policy" pour release (ex. slug `release-signing`) - c'est elle
     qui définit le certificat Authenticode utilisé et les règles d'approbation.
   - Créer une "Artifact Configuration" décrivant `whb.exe` comme exécutable Windows à
     signer (slug ex. `whb-installer`).
   - Récupérer l'**Organization ID** et générer un **API Token** (Settings → API
     Tokens) avec la permission "Submit signing requests".

4. **Connecter GitHub ↔ SignPath** : dans SignPath, section "CI Integrations", ajouter
   ce repo GitHub pour que SignPath puisse valider l'origine des workflow runs.

5. Dans les **Settings du repo GitHub** :
   - `Settings → Secrets and variables → Actions → Secrets` :
     ajouter `SIGNPATH_API_TOKEN`.
   - `Settings → Secrets and variables → Actions → Variables` :
     ajouter `SIGNPATH_ORGANIZATION_ID`, et si différent des valeurs par défaut du
     workflow, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_SIGNING_POLICY_SLUG`,
     `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG`.

6. Pousser un tag (`git tag v1.0.3 && git push origin v1.0.3`) ou lancer le workflow
   manuellement ("Run workflow" dans l'onglet Actions) : le job `build-windows`
   soumettra automatiquement `whb.exe` à SignPath, attendra la signature, et publiera
   la version signée dans la Release GitHub.

## À savoir

- Un certificat "standard" (non-EV) signé via SignPath peut encore mettre un certain
  temps/volume de téléchargements avant que la réputation SmartScreen de Microsoft
  supprime complètement l'avertissement - mais l'éditeur ne sera plus "inconnu", ce
  qui est déjà un net progrès, et SignPath entretient une réputation "publisher" à
  l'échelle de tous les projets qu'ils signent.
- Pour une confiance immédiate dès le premier téléchargement, il faudrait passer à un
  certificat EV (payant, ~300-600$/an, token matériel) ou à Azure Trusted Signing
  (~10$/mois, nécessite un compte Azure vérifié) - possible à ajouter plus tard sans
  changer la structure du pipeline, juste l'étape de signature.
