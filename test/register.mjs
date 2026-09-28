// Loaded with `node --import ./test/register.mjs`. functions/** use
// extensionless relative imports ('./_lib/env'), which the bundler Pages uses
// resolves but Node ESM doesn't. This hook tries '<spec>.ts' and
// '<spec>/index.ts' for a relative specifier that doesn't exist as written.
import { statSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
      const exists = (s) => statSync(fileURLToPath(new URL(s, context.parentURL)), { throwIfNoEntry: false })?.isFile()
      if (!exists(specifier)) {
        const match = [`${specifier}.ts`, `${specifier}/index.ts`].find(exists)
        if (match) return nextResolve(match, context)
      }
    }
    return nextResolve(specifier, context)
  },
})
