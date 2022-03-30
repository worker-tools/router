import { URLPatternComponentResult } from 'urlpattern-polyfill/dist/url-pattern.interfaces';
import { URLPattern, URLPatternImpl } from './url-pattern';

import { Context, EffectsList, executeEffects } from '@worker-tools/middleware';
import { internalServerError, notFound } from '@worker-tools/response-creators';
import { ok } from 'assert';

export type Awaitable<T> = T | PromiseLike<T>;

export type BaseMiddleware<X extends Context> = (x: Awaitable<Context>) => Awaitable<X>
export type Middleware<RX extends Context, X extends Context> = (x: Awaitable<RX>) => Awaitable<X>
export type Handler<X extends Context> = (request: Request, ctx: X) => Awaitable<Response>;

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type MethodWildcard = 'ALL';

type RouteHandler = (x: Omit<Context, 'effects'>) => Awaitable<Response> 
interface Route {
  method: Method | MethodWildcard
  pattern: URLPattern
  handler: RouteHandler
}

export class WorkerRouter<RX extends Context = Context> {
  #middleware: BaseMiddleware<RX>
  #routes: Route[] = [];

  constructor(middleware: BaseMiddleware<RX> = _ => _ as RX) {
    this.#middleware = middleware;
  }

  async #match(url: string, ctx: Omit<Context, 'effects' | 'match'>): Promise<Response> {
    const result = this.#matchRoutes(url, ctx.request)
    if (result) {
      try {
        const [handler, match] = result;
        return await handler(Object.assign(ctx, { match }));
      } catch (err) {
        if (err instanceof Response) {
          return err; // TODO: customization??
        } 
        throw err;
      }
    }
    return notFound();
  }

  #matchRoutes(url: string, request: Request): readonly [RouteHandler, URLPatternComponentResult] | null {
    for (const { method, pattern, handler } of this.#routes) {
      // Skip immediately if method doesn't match
      if (method !== request.method.toUpperCase() && method !== 'ALL') continue

      if (pattern.pathname === '*' || pattern.pathname === '/*') {
        const { pathname: input } = new URL(url)
        return [handler, { input,
          groups: { '0': input.substring(pattern.pathname.length - 1) },
        }]
      }
      
      const match = pattern.exec(url)
      if (!match) continue
      return [handler, match.pathname] as const
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
        const effects = new EffectsList();
        const ctx = await this.#middleware({ ...event, effects });
        const response = handler(event.request, ctx);
        return executeEffects(effects, response)
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
        const effects = new EffectsList();
        const ctx = await middleware(this.#middleware({ ...event, effects }))
        const response = handler(event.request, ctx);
        return executeEffects(effects, response)
      },
    })
  }

  #registerRoute<X extends RX>(
    method: Method | MethodWildcard,
    argsN: number,
    pathname: string,
    middlewareOrHandlerOrRouter: Middleware<RX, X> | Handler<X> | WorkerRouter<X>,
    handler?: Handler<X>,
  ): this {
    const pattern = new URLPatternImpl({ pathname })
    if (argsN === 2) {
      const handler = middlewareOrHandlerOrRouter as Handler<RX>
      this.#pushRoute(method, pattern, handler)
    } else if (argsN === 3) {
      const middleware = middlewareOrHandlerOrRouter as Middleware<RX, X>
      this.#pushMiddlewareRoute(method, pattern, middleware, handler!)
    } else {
      throw Error(`Router '${method.toLowerCase()}' called with invalid number of arguments`)
    }
    return this;
  }

  /** Add a route that matches any method. */
  all<X extends RX>(path: string, handler: Handler<X>): this;
  all<X extends RX>(path: string, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  all<X extends RX>(path: string, middlewareOrHandlerOrRouter: Middleware<RX, X> | Handler<X> | WorkerRouter<X>, handler?: Handler<X>): this {
    return this.#registerRoute('ALL', arguments.length, path, middlewareOrHandlerOrRouter, handler);
  }
  /** Add a route that matches the GET method. */
  get<X extends RX>(pathname: string, handler: Handler<X>): this;
  get<X extends RX>(pathname: string, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  get<X extends RX>(pathname: string, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerRoute('GET', arguments.length, pathname, middlewareOrHandler, handler);
  }
  /** Add a route that matches the POST method. */
  post<X extends RX>(pathname: string, handler: Handler<X>): this;
  post<X extends RX>(pathname: string, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  post<X extends RX>(pathname: string, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerRoute('POST', arguments.length, pathname, middlewareOrHandler, handler);
  }
  /** Add a route that matches the PUT method. */
  put<X extends RX>(pathname: string, handler: Handler<X>): this;
  put<X extends RX>(pathname: string, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  put<X extends RX>(pathname: string, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerRoute('PUT', arguments.length, pathname, middlewareOrHandler, handler);
  }
  /** Add a route that matches the PATCH method. */
  patch<X extends RX>(pathname: string, handler: Handler<X>): this;
  patch<X extends RX>(pathname: string, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  patch<X extends RX>(pathname: string, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerRoute('PATCH', arguments.length, pathname, middlewareOrHandler, handler);
  }
  /** Add a route that matches the DELETE method. */
  delete<X extends RX>(pathname: string, handler: Handler<X>): this;
  delete<X extends RX>(pathname: string, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  delete<X extends RX>(pathname: string, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerRoute('DELETE', arguments.length, pathname, middlewareOrHandler, handler);
  }
  /** Add a route that matches the HEAD method. */
  head<X extends RX>(pathname: string, handler: Handler<X>): this;
  head<X extends RX>(pathname: string, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  head<X extends RX>(pathname: string, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerRoute('HEAD', arguments.length, pathname, middlewareOrHandler, handler);
  }
  /** Add a route that matches the OPTIONS method. */
  options<X extends RX>(pathname: string, handler: Handler<X>): this;
  options<X extends RX>(pathname: string, middleware: Middleware<RX, X>, handler: Handler<X>): this;
  options<X extends RX>(pathname: string, middlewareOrHandler: Middleware<RX, X> | Handler<X>, handler?: Handler<X>): this {
    return this.#registerRoute('OPTIONS', arguments.length, pathname, middlewareOrHandler, handler);
  }

  /**
   * Use a different `WorkerRouter` for the provided pattern. 
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
   * @param pathname A pattern ending in a wildcard, e.g. `/items*`
   * @param subRouter A `WorkerRouter` that handles the remaining part of the URL
   * @deprecated The name of this method might change 
   */
  use<Y extends Context>(pathname: `${string}*`, subRouter: WorkerRouter<Y>): this {
    // TODO: DEBUG??
    if (!pathname.endsWith('*')) {  
      console.warn('.use pattern must end with a wildcard (*)');
      pathname += '*'
    }
    const pattern = new URLPatternImpl({ pathname })
    this.#routes.push({
      method: 'ALL',
      pattern,
      handler: subRouter.#routeHandler,
    })
    return this;
  };

  get #routeHandler(): RouteHandler {
    return (ctx) => {
      // TODO: are these guaranteed to be ordered correctly??
      const values = Object.values(ctx.match.groups);
      if (values.length) {
        const baseURL = new URL(ctx.request.url).origin;
        const subURL = new URL(values.at(-1)!, baseURL).href;
        return this.#match(subURL, ctx);
      }
      throw Error('pattern not suitable for .use')
    }
  }

  private get _handle(): Handler<Context> {
    return (request, ctx) => {
      return this.#match(request.url, { request, waitUntil: ctx?.waitUntil?.bind(ctx) ?? ((_f: any) => {}) })
    }
  }

  get fetchEventCallback() {
    return (ev: FetchEvent) => {
      ev.respondWith(this.#match(ev.request.url, { request: ev.request, waitUntil: ev.waitUntil.bind(ev) }));
    }
  }

  get fetchModuleExport() {
    // TODO: do something about env?
    return async (request: Request, env: any, ctx: any): Promise<Response> => {
      return this.#match(request.url, { request, env, waitUntil: ctx.waitUntil.bind(ctx) } as any);
    }
  }

  get serveCallback() {
    return async (request: Request, connInfo: any): Promise<Response> => {
      return this.#match(request.url, { request, connInfo, waitUntil: (_f: any) => {} } as any);
    }
  }
}
