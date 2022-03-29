# Worker Router
A better router for Worker Environments such as Cloudflare Workers and Deno Deploy.

This router is inspired by previous work such as `tiny-request-router` and `itty-router`. 
It improves on them by providing more comprehensive middleware with better support for type inference. 
Specifically, the goal is to infer types based on usage so that the benefits can be even *without* using Typescript --- just a editor with type inference support is enough.

```js
import { WorkersRouter } from '@worker-tools/router'
import { basics, unsignedCookies } from '@worker-tools/middleware'

const router = new WorkersRouter(basics())
  .get('/item', unsignedCookies(), (_, { userAgent, cookies, cookieStore }) => ok())
```

In this example, your editor can infer the types (and documentation for)
  - `userAgent`, provided by `basics` middleware for the entire router
  - `cookies`, provided by `unsignedCookies` middleware for this route only

Worker Router middlewares are *just functions* and can be mixed and matched using standard tools from functional programming.
For convenience, worker router provides the `combine` utility to combine multiple middlewares into one:

```js
const myReusableMW = combine(
  basics(), 
  cookies(), 
  cookieSession({ defaultSession: { foo: '' } })
);
const router = new WorkersRouter(myReusableMW)
```

<br>

**This router makes use of `URLPattern` for path matching.**






[^1]: I shouldn't say impossible, because there's probabl -->