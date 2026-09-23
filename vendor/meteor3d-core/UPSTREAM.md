# Vendored Meteor3D Core

This directory is a source snapshot of the public `@meteor3d/core` package.
It is committed to this repository so installing the editor does not require
access to the upstream GitHub repository.

- Upstream repository: `https://github.com/nikonikoCW/Meteor3DEditor`
- Upstream path: `packages/core`
- Upstream commit: `34cb34712ba25b09732dd646c6d1203084eb055a`
- License: MIT, preserved in `LICENSE`

Application code must continue to import the package through its public entry:

```js
import { SceneManager } from '@meteor3d/core'
```

Do not import files from this vendor directory directly. When updating
Meteor3D, replace the complete snapshot, record the new upstream commit here,
regenerate `pnpm-lock.yaml`, and run the project verification commands.
