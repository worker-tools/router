import { Context, EffectsList, executeEffects } from '../middleware/index.ts';
import { internalServerError, notFound } from '../response-creators/index.ts';

export type Awaitable<T> = T | PromiseLike<T>;

export interface MatchContext extends Context {
  match: URLPatternResult
}

export type BaseMiddleware<X extends MatchContext> = (x: Awaitable<MatchContext>) => Awaitable<X>
export type Middleware<RX extends MatchContext, X extends MatchContext> = (x: Awaitable<RX>) => Awaitable<X>
export type Handler<X extends MatchContext> = (request: Request, ctx: X) => Awaitable<Response>;

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
type MethodWildcard = 'ANY';

type RouteHandler = (x: MatchContext) => Awaitable<Response> 
interface Route {
  method: Method | MethodWildcard
  pattern: URLPattern
  handler: RouteHandler
}

if (!('URLPattern' in globalThis)) {
  await import(/* webpackMode: "eager" */ 'https://esm.sh/urlpattern-polyfill@3.0.0/dist/index.js')
}

/** 
 * Turns a pathname pattern into a `URLPattern` that works across worker environments.
 * Specifically in the case of Service Workers, this ensures requests to external domains that happen to have the same
 * pathname aren't matched. 
 * If a worker environment has a location set (e.g. deno with `--location` or CF workers with a location polyfill), 
 * this is essentially a noop since only matching requests can reach deployed workers in the first place.
 */
function toPattern(pathname: string) {
  const pattern = new URLPattern({ 
    pathname, 
    protocol: globalThis.location?.protocol,
    hostname: globalThis.location?.hostname,
    port: globalThis.location?.port,
  })
  return pattern;
}

// const anyResult = Object.freeze(toPattern('*').exec(new Request('/').url)!);
// const anyPathResult = Object.freeze(toPattern('/*').exec(new Request('/').url)!);

export class WorkerRouter<RX extends MatchContext = MatchContext> implements EventListenerObject {
  #middleware: BaseMiddleware<RX>
  #routes: Route[] = [];

  constructor(middleware: BaseMiddleware<RX> = _ => _ as RX) {
    this.#middleware = middleware;
  }

  async #route(fqURL: string, ctx: Omit<Context, 'effects'>): Promise<Response> {
    const result = this.#execPatterns(fqURL, ctx.request)
    if (result) {
      try {
        const [handler, match] = result;
        const effects = new EffectsList();
        return await handler(Object.assign(ctx, { effects, match }));
      } catch (err) {
        if (err instanceof Response) {
          return err; // TODO: customization??
        } 
        throw err;
      }
    }
    // TODO: customization??
    return notFound();
  }

  #execPatterns(fqURL: string, request: Request): readonly [RouteHandler, URLPatternResult] | null {
    for (const { method, pattern, handler } of this.#routes) {
      if (method !== 'ANY' && method !== request.method.toUpperCase()) continue

      // FIXME: make work with external. Or maybe just drop...
      // if (pattern.pathname === '*') {
      //   const { pathname: input } = new URL(url)
      //   return [handler, { ...anyResult, pathname: { input, groups: { '0': input } } }]
      // }
      // if (pattern.pathname === '/*') {
      //   const { pathname: input } = new URL(url)
      //   return [handler, { ...anyPathResult, pathname: { input, groups: { '0': input.substring(1) } } }]
      // }
      
      const match = pattern.exec(fqURL);
      if (!match) continue

      return [handler, match] as const;
    }
    return null
  }

  #pushRoute(
    method: Method | MethodWildcard,
    pattern: URLPattern,
    handler: Handler<RX>,
  ) {
    this.#routes.push({
      method,
      pattern,
      handler: async event => {
        const ctx = await this.#middleware(event);
        const response = handler(event.request, ctx);
        return executeEffects(event.effects!, response)
      },
    })
  }

  #pushMiddlewareRoute<X extends RX>(
    method: Method | MethodWildcard,
    pattern: URLPattern,
    middleware: Middleware<RX, X>,
    handler: Handler<X>,
  ) {
    this.#routes.push({
      method,
      pattern,
      handler: async event => {
        const ctx = await middleware(this.#middleware(event))
        const response = handler(event.request, ctx);
        return executeEffects(event.effects!, response)
      },
    })
  }

  #registerPattern<X extends RX>(
    method: Method | MethodWildcard,
    argsN: number,
    pattern: URLPattern,
    middlewareOrHandler: Middleware<RX, X> | Handler<X>,
    handler?: Handler<X>,
  ): this {
    if (argsN === 2) {
      const handler = middlewareOrHandler as Handler<RX>
      this.#pushRoute(method, pattern, handler)
    } else if (argsN === 3) {
      const middleware = middlewareOrHandler as Middleware<RX, X>
      this.#pushMiddlewareRoute(method, pattern, middleware, handler!)
    } else {
      throw Error(`Router '${method.toLowerCase()}' called with invalid number of arguments`)
    }
    return this;
  }

  /** Add a route that matches *any* HTTP method. */
  any<X extends RX>(path: string, handler: Handler<X>): this;
  any<X extends RX>(path: string, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  any<X extends RX>(path: string, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerPattern('ANY', arguments.length, toPattern(path), middlewareOrHandler, handler);
  }
  /** Alias for for the more appropriately named `any` method */
  all<X extends RX>(path: string, handler: Handler<X>): this;
  all<X extends RX>(path: string, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  all<X extends RX>(path: string, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerPattern('ANY', arguments.length, toPattern(path), middlewareOrHandler, handler);
  }
  /** Add a route that matches the `GET` method. */
  get<X extends RX>(path: string, handler: Handler<X>): this;
  get<X extends RX>(path: string, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  get<X extends RX>(path: string, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerPattern('GET', arguments.length, toPattern(path), middlewareOrHandler, handler);
  }
  /** Add a route that matches the `POST` method. */
  post<X extends RX>(path: string, handler: Handler<X>): this;
  post<X extends RX>(path: string, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  post<X extends RX>(path: string, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerPattern('POST', arguments.length, toPattern(path), middlewareOrHandler, handler);
  }
  /** Add a route that matches the `PUT` method. */
  put<X extends RX>(path: string, handler: Handler<X>): this;
  put<X extends RX>(path: string, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  put<X extends RX>(path: string, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerPattern('PUT', arguments.length, toPattern(path), middlewareOrHandler, handler);
  }
  /** Add a route that matches the `PATCH` method. */
  patch<X extends RX>(path: string, handler: Handler<X>): this;
  patch<X extends RX>(path: string, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  patch<X extends RX>(path: string, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerPattern('PATCH', arguments.length, toPattern(path), middlewareOrHandler, handler);
  }
  /** Add a route that matches the `DELETE` method. */
  delete<X extends RX>(path: string, handler: Handler<X>): this;
  delete<X extends RX>(path: string, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  delete<X extends RX>(path: string, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerPattern('DELETE', arguments.length, toPattern(path), middlewareOrHandler, handler);
  }
  /** Add a route that matches the `HEAD` method. */
  head<X extends RX>(path: string, handler: Handler<X>): this;
  head<X extends RX>(path: string, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  head<X extends RX>(path: string, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerPattern('HEAD', arguments.length, toPattern(path), middlewareOrHandler, handler);
  }
  /** Add a route that matches the `OPTIONS` method. */
  options<X extends RX>(path: string, handler: Handler<X>): this;
  options<X extends RX>(path: string, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  options<X extends RX>(path: string, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerPattern('OPTIONS', arguments.length, toPattern(path), middlewareOrHandler, handler);
  }

  /** 
   * Add a route that matches *any* method with the provided pattern. 
   * Note that the pattern here is interpreted as a `URLPatternInit` which has important implication for matching. 
   * Mostly, this is for use in Service Workers to intercept requests to external resources.
   * 
   * The name `external` is a bit of a misnomer. It simply forwards `init` to the `URLPattern` constructor,
   * instead of being limited to the `pathname` property in the general case.
   * @deprecated Might change name/API
   */
  external<X extends RX>(init: string | URLPatternInit, handler: Handler<X>): this;
  external<X extends RX>(init: string | URLPatternInit, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  external<X extends RX>(init: string | URLPatternInit, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerPattern('ANY', arguments.length, new URLPattern(init), middlewareOrHandler, handler);
  }

  /** Like `.external`, but only matches `GET` 
   * @deprecated Might change name/API */
  externalGET<X extends RX>(init: string | URLPatternInit, handler: Handler<X>): this;
  externalGET<X extends RX>(init: string | URLPatternInit, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  externalGET<X extends RX>(init: string | URLPatternInit, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerPattern('GET', arguments.length, new URLPattern(init), middlewareOrHandler, handler);
  }

  /** Like `.external`, but only matches `POST` 
   * @deprecated Might change name/API */
  externalPOST<X extends RX>(init: string | URLPatternInit, handler: Handler<X>): this;
  externalPOST<X extends RX>(init: string | URLPatternInit, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  externalPOST<X extends RX>(init: string | URLPatternInit, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerPattern('POST', arguments.length, new URLPattern(init), middlewareOrHandler, handler);
  }

  /** Like `.external`, but only matches `PUT` 
   * @deprecated Might change name/API */
  externalPUT<X extends RX>(init: string | URLPatternInit, handler: Handler<X>): this;
  externalPUT<X extends RX>(init: string | URLPatternInit, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  externalPUT<X extends RX>(init: string | URLPatternInit, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerPattern('PUT', arguments.length, new URLPattern(init), middlewareOrHandler, handler);
  }

  /** Like `.external`, but only matches `PATCH` 
   * @deprecated Might change name/API */
  externalPATCH<X extends RX>(init: string | URLPatternInit, handler: Handler<X>): this;
  externalPATCH<X extends RX>(init: string | URLPatternInit, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  externalPATCH<X extends RX>(init: string | URLPatternInit, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerPattern('PATCH', arguments.length, new URLPattern(init), middlewareOrHandler, handler);
  }

  /** Like `.external`, but only matches `DELETE` 
   * @deprecated Might change name/API */
  externalDELETE<X extends RX>(init: string | URLPatternInit, handler: Handler<X>): this;
  externalDELETE<X extends RX>(init: string | URLPatternInit, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  externalDELETE<X extends RX>(init: string | URLPatternInit, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerPattern('DELETE', arguments.length, new URLPattern(init), middlewareOrHandler, handler);
  }

  /** Like `.external`, but only matches `OPTIONS` 
   * @deprecated Might change name/API */
  externalOPTIONS<X extends RX>(init: string | URLPatternInit, handler: Handler<X>): this;
  externalOPTIONS<X extends RX>(init: string | URLPatternInit, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  externalOPTIONS<X extends RX>(init: string | URLPatternInit, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerPattern('OPTIONS', arguments.length, new URLPattern(init), middlewareOrHandler, handler);
  }

  /** Like `.external`, but only matches `HEAD` 
   * @deprecated Might change name/API */
  externalHEAD<X extends RX>(init: string | URLPatternInit, handler: Handler<X>): this;
  externalHEAD<X extends RX>(init: string | URLPatternInit, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  externalHEAD<X extends RX>(init: string | URLPatternInit, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerPattern('HEAD', arguments.length, new URLPattern(init), middlewareOrHandler, handler);
  }

  /**
   * Use a different `WorkerRouter` for the provided pattern. Keep in mind that:
   * 
   * - The pattern must end in a wildcard `*` 
   * - The corresponding match is the only part used for matching in the `subRouter`
   * - Forwards all HTTP methods
   * - Does not apply any middleware
   * 
   * #### Why does it not apply middleware?
   * 
   * There are 2 reasons: First, it interferes with type inference of middleware.
   * As a developer you'd have to provide the correct types at the point of defining the sub router, 
   * which is at least as cumbersome as providing the middleware itself.
   * 
   * Second, without this there would be no way to opt a route out of the router-level middleware. 
   * For example you might want to opt out all `/public*` urls from cookie parsing, authentication, etc.
   * but add a different caching policy instead.
   * 
   * @param path A pattern ending in a wildcard, e.g. `/items*`
   * @param subRouter A `WorkerRouter` that handles the remaining part of the URL, e.g. `/:category/:id`
   * @deprecated The name of this method might change 
   */
  use<Y extends MatchContext>(path: string, subRouter: WorkerRouter<Y>): this {
    if ((<any>globalThis).process?.env?.NODE_ENVIRONMENT === 'development' || (<any>globalThis).DEBUG) {
      if (!path.endsWith('*')) {  
        console.warn('Path for \'use\' does not appear to end in a wildcard (*). This is likely to produce unexpected results.');
      }
    }

    const pattern = new URLPattern(toPattern(path))
    this.#routes.push({
      method: 'ANY',
      pattern,
      handler: subRouter.#routeHandler,
    })
    return this;
  };

  /** See `.external` and `.use`. 
   * @deprecated Might change name/API 
   */
  useExternal<Y extends MatchContext>(init: string | URLPatternInit, subRouter: WorkerRouter<Y>): this {
    const pattern = new URLPattern(init)

    if ((<any>globalThis).process?.env?.NODE_ENVIRONMENT === 'development' || (<any>globalThis).DEBUG) {
      if (!pattern.pathname.endsWith('*')) {  
        console.warn('Pathname pattern for \'use\' does not appear to end in a wildcard (*). This is likely to produce unexpected results.');
      }
    }
    this.#routes.push({
      method: 'ANY',
      pattern,
      handler: subRouter.#routeHandler,
    })
    return this;
  }

  #routeHandler: RouteHandler = (ctx) => {
    // TODO: are these guaranteed to be ordered correctly??
    const values = Object.values(ctx.match?.pathname.groups ?? {});
    if (values.length) {
      const baseURL = new URL(ctx.request.url).origin;
      const subURL = new URL(values.at(-1)!, baseURL);
      return this.#route(subURL.href, ctx);
    }
    throw Error('Pattern not suitable for nested routing. Did you forget to add a wildcard (*)?')
  }

  /** @deprecated Name/API might change */
  handle = (request: Request, ctx?: Omit<Context, 'effects'>) => {
    return this.#route(request.url, { 
      ...ctx,
      request, 
      waitUntil: ctx?.waitUntil?.bind(ctx) ?? ((_f: any) => {}) 
    })
  }

  /**
   * Implements the (ancient) event listener object interface to allow passing to fetch event directly,
   * e.g. `self.addEventListener('fetch', router)`.
   */
  handleEvent = (object: Event) => {
    const event = object as FetchEvent;
    event.respondWith(this.#route(event.request.url, { 
      request: event.request, 
      waitUntil: event.waitUntil.bind(event), 
      event,
    }));
  };

  /**
   * Callback compatible with Cloudflare Worker's `fetch` module export.
   * E.g. `export default router`.
   */
  fetch = (request: Request, env?: any, ctx?: any): Promise<Response> => {
    return this.#route(request.url, { 
      request, 
      waitUntil: ctx?.waitUntil?.bind(ctx) ?? ((_f: any) => {}), 
      env, 
      ctx,
    });
  }

  /**
   * Callback that is compatible with Deno's `serve` function.
   * E.g. `serve(router.serveCallback)`.
   */
  serveCallback = (request: Request, connInfo: any): Promise<Response> => {
    return this.#route(request.url, { request, waitUntil: (_f: any) => {}, connInfo });
  }
}
