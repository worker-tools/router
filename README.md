# Worker Router
A router for [Worker Runtimes](https://workers.js.org) such as Cloudflare Workers and Service Workers.

This router is inspired by previous work, specifically `tiny-request-router` and `itty-router`, but it
improves on them by providing better support for middleware, type inference, nested routing, and broader URL matching for use in service workers.

## 🆓 Type Inference
The goal of Worker Router is to *infer types based on usage* so that **no explicit typing** is required for standard use cases.
This allows even JavaScript users to benefit from inline documentation and API discoverability. For example,

```js
const router = new WorkersRouter()
  .get('/about', basics(), (req, { userAgent }) => ok())
  .get('/login', unsignedCookies(), (req, { cookies }) => ok())
```

In this example your editor can infer the types and documentation for
  - `userAgent`, provided by the `basics` middleware 
  - `cookies`, provided by the `unsignedCookies` middleware 


## 🔋 Functional Middleware
Worker Router [middlewares](https://workers.tools/middleware) are *just function* that add properties to a generic context object. 
As such, they can be *mixed and matched* using standard tools from functional programming.

For convenience, this module provides a `combine` utility to combine multiple middlewares into one.

```js
const myReusableMW = combine(
  basics(), 
  signedCookies({ secret: 'password123' }), 
  cookieSession({ user: '' })
);

const router = new WorkersRouter()
  .get('/', myReusableMW, () => ok())
  .post('/', combine(myReusableMW, bodyParser()), () => ok())
```

Note that type inference is maintained when combining middleware!


## 🪆 Nested Routing
Worker Router supports delegating entire sub routes to another router:

```js
const itemRouter = new WorkerRouter()
  .get('/', (req, { params }) => ok(`Matched "/item/`))
  .get('/:id', (req, { params }) => ok(`Matched "/item/${params.id}`))

const router = new WorkersRouter()
  .get('/', () => ok('Main Page'))
  .use('/item*', itemRouter)
```


## ⚙️ Ready for Service... Worker
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

## 💥 Error Handling Without Even Trying
Worker Router has first class support for error handling. Its main purpose is to let you write your handlers without having to wrap everything inside a massive `try {} catch` block. Instead, you can define special recover routes that get invoked when something goes wrong. 

```js
const router = new WorkersRouter()
  .get('/', () => ok('Main Page'))
  .get('/about', () => { throw Error('bang') })
  .recover('*', (req, { error, response }) => 
    new Response(`Something went wrong: ${error.message}`, response)
  );
```

## ✅ Works with Workers
Worker Router comes with out of the box support for a variety of Worker Runtimes:

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

<!-- While Worker Router is influenced by earlier work, it is __not in the tradition__ of express, koa and other modify-in-place routers, save for aspects of its high level  API.
At it's core, Worker Router is a function of `(req: Request, ctx: Context) => Promise<Response>`. In this model, 
middleware is another function that *adds* properties to the context, which is fully tracked by the type system. Conversely, middleware that is not applied is also absent and not polluting the context object. -->

--------

<center>
  <a href="https://workers.tools"><img src="https://workers.tools/assets/img/logo.svg" width="100" height="100" /></a>
  <h2>Part of <a href="https://workers.tools">Worker Tools</a></h2>
  <p><small>This module is part of the Worker Tools collection.</small><br/>⚙</p>
</center>

Worker Tools are a collection of TypeScript libraries for writing web servers in [Worker Runtimes](https://workers.js.org) such as Cloudflare Workers, Deno Deploy and Service Workers. 

If you liked this module, you might also like:

- 🧭 [__Worker Router__][router] --- Complete routing solution that works across CF Workers, Deno and Service Workers
- 🔋 [__Worker Middleware__][middleware] --- A suite of standalone HTTP server-side middleware with TypeScript support
- 📄 [__Worker HTML__][html] --- HTML templating and streaming response library
- 📦 [__Storage Area__][kv-storage] --- Key-value store abstraction across [Cloudflare KV][cloudflare-kv-storage], [Deno][deno-kv-storage] and browsers.
- 🆗 [__Response Creators__][response-creators] --- Factory functions for responses with pre-filled status and status text
- 🎏 [__Stream Response__][stream-response] --- Use async generators to build streaming responses for SSE, etc...
- 🥏 [__JSON Fetch__][json-fetch] --- Drop-in replacements for Fetch API classes with first class support for JSON.
- 🦑 [__JSON Stream__][json-stream] --- Streaming JSON parser/stingifier with first class support for web streams.

Worker Tools also includes a number of polyfills that help bridge the gap between Worker Runtimes:
- ✏️ [__HTML Rewriter__][html-rewriter] --- Cloudflare's HTML Rewriter for use in Deno, browsers, etc...
- 📍 [__Location Polyfill__][location-polyfill] --- A `Location` polyfill for Cloudflare Workers.
- 🦕 [__Deno Fetch Event Adapter__][deno-fetch-event-adapter] --- Dispatches global `fetch` events using Deno’s native HTTP server.

[router]: https://workers.tools/router
[middleware]: https://workers.tools/middleware
[html]: https://workers.tools/html
[kv-storage]: https://workers.tools/kv-storage
[cloudflare-kv-storage]: https://workers.tools/cloudflare-kv-storage
[deno-kv-storage]: https://workers.tools/deno-kv-storage
[kv-storage-polyfill]: https://workers.tools/kv-storage-polyfill
[response-creators]: https://workers.tools/response-creators
[stream-response]: https://workers.tools/stream-response
[json-fetch]: https://workers.tools/json-fetch
[json-stream]: https://workers.tools/json-stream
[request-cookie-store]: https://workers.tools/request-cookie-store
[extendable-promise]: https://workers.tools/extendable-promise
[html-rewriter]: https://workers.tools/html-rewriter
[location-polyfill]: https://workers.tools/location-polyfill
[deno-fetch-event-adapter]: https://workers.tools/deno-fetch-event-adapter

Fore more visit [workers.tools](https://workers.tools).
