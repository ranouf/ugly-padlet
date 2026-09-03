# Instructions IA pour UglyPadlet

## Release notes

Pour chaque branche qui modifie le comportement, l'interface ou le packaging de l'extension, maintenir une note dans `release-notes/vX.Y.Z.md`, ou `X.Y.Z` correspond a la version de `manifest.json`.

La note doit rester concise et contenir ces sections:

- `## Summary`: une phrase sur l'objectif utilisateur.
- `## Changes`: les changements importants, sans journal exhaustif de commits.
- `## Validation`: les tests, captures ou controles executes.
- `## Screenshots`: les chemins des captures pertinentes quand il y a un changement UI.

A chaque commit, verifier que la release note de la version courante reflete encore les modifications de la branche. Ajouter des captures Playwright ou des chemins de screenshots quand le changement touche au visuel.

Ne pas inclure de fichiers de test, captures ou release notes dans le package Chrome Store. Le package publie doit rester limite aux fichiers necessaires a l'extension.

## GitHub branch protection

La branche `main` doit etre protegee sur GitHub. Le merge doit exiger que le status check `Validate Chrome Extension` soit valide.

Si la protection doit etre reappliquee, utiliser `pnpm github:protect-main` avec `GITHUB_TOKEN` defini. Le token doit avoir le droit `Administration: Read and write` sur le repository.
