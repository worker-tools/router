# Worker Router
A router for [Worker Environments](https://workers.js.org) such and Cloudflare Workers or Service Workers.

This router is inspired by previous work such as `tiny-request-router` and `itty-router`, but it
improves on them by providing better support for middleware, type inference, nested routing, and broader URL matching for use in service workers.

## Type Inference 🆓
The goal of Worker Router is to *infer types based on usage* so that **no explicit typing** is required for standard use cases.
This allows even JavaScript users to benefit from inline documentation and API discoverability:

```js
import { WorkersRouter } from '@worker-tools/router'
import { withBasics, withUnsignedCookies } from '@worker-tools/middleware'

const router = new WorkersRouter(withBasics())
  .get('/about', (req, { userAgent }) => ok())
  .get('/login', withUnsignedCookies(), (req, { userAgent, cookies }) => ok())
```

In this example, your editor can infer the types and documentation for
  - `userAgent`, provided by `withBasics` for the entire router
  - `cookies`, provided by `withUnsignedCookies` middleware for this route only


## Functional Middleware 🔋
Worker Router middlewares are *just functions* that can be mixed and matched using standard tools from functional programming.
For convenience, this module provides a `combine` utility to combine multiple middlewares into one.

```js
const myReusableMW = combine(
  withBasics(), 
  withSignedCookies({ secret: 'password123' }), 
  withCookieSession({ defaultSession: { foo: '' } })
);
const router = new WorkersRouter(myReusableMW)
```

Note that type inference is still maintained when combining middleware. 

## Nested Routing 🪆
Worker Router supports delegating entire sub routes to another router:

```js
const itemRouter = new WorkerRouter()
  .get('/', (req, { params }) => ok(`Matched "/item/`))
  .get('/:id', (req, { params }) => ok(`Matched "/item/${params.id}`))

const router = new WorkersRouter()
  .get('/', () => ok('Main Page'))
  .use('/item*', itemRouter)
```

## Ready for Service... Worker ⚙️
Internally, this router uses [`URLPattern`](https://web.dev/urlpattern/) for routing, which allows it match URLs in the broadest sense. 
For example, the following router, meant to be used in a Service Worker, can handle internal requests as well as intercept calls to external resources:

```js
// file: "sw.js"
const router = new WorkersRouter()
  .get('/', () => ok('Main Page'))
  .get('/about', () => ok('About Page'))
  .external('https://plausible.io/api/*', req => {
    // intercepted
  })
```

## Works with Workers ✅
Worker Router comes with out of the box support for a variety of Worker Environments:

To use it in an environment that provides a global `fetch` event, use

```js
self.addEventListener('fetch', router)
```

(This works because the router implements the [`EventListener`](https://developer.mozilla.org/en-US/docs/Web/API/EventListener) interface)

To use it with Cloudflare's module workers, use

```js
export default router
```

(This works because the router implements a `fetch` method with compatible interface)

To use it with Deno/Deploy's `serve` function, use

```js
serve(router.serveCallback)
```

## TODO
How to handle errors in middleware? 
How to forward failure states like failed content negotiation? 
How to let appdevs provide customized error pages for the above?
Add support for nonstandard http methods?