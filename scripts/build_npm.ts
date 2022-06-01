#!/usr/bin/env -S deno run --allow-read --allow-write=./,/Users/qwtel/Library/Caches/deno --allow-net --allow-env=HOME,DENO_AUTH_TOKENS,DENO_DIR --allow-run=git,pnpm

import { basename } from "https://deno.land/std@0.133.0/path/mod.ts";
import { build, emptyDir } from "https://deno.land/x/dnt@0.24.0/mod.ts";

import { 
  copyMdFiles, mkPackage,
} from 'https://gist.githubusercontent.com/qwtel/ecf0c3ba7069a127b3d144afc06952f5/raw/latest-version.ts'

await emptyDir("./npm");

const name = basename(Deno.cwd())

await build({
  entryPoints: ["./index.ts"],
  outDir: "./npm",
  shims: {},
  test: false,
  typeCheck: false,
  package: await mkPackage(name),
  declaration: true,
  packageManager: 'pnpm',
  compilerOptions: {
    lib: ["lib.es2021.d.ts", "lib.webworker.d.ts", "lib.webworker.iterable.d.ts"],
    sourceMap: true,
    target: 'ES2019',
  },
  mappings: {
    "https://ghuc.cc/worker-tools/middleware/context.ts": {
      name: "@worker-tools/middleware",
      version: "latest",
      // subPath: 'context', // most node tooling doesn't respect exports, so why bother...
    },
    "https://ghuc.cc/worker-tools/response-creators/index.ts": {
      name: "@worker-tools/response-creators",
      version: "latest",
    },
    "https://ghuc.cc/worker-tools/resolvable-promise/index.ts": {
      name: "@worker-tools/resolvable-promise",
      version: "latest",
    },
  },
});

// post build steps
await copyMdFiles()
