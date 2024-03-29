// deno-lint-ignore-file no-explicit-any no-unused-vars
import 'https://gist.githubusercontent.com/qwtel/b14f0f81e3a96189f7771f83ee113f64/raw/TestRequest.ts'
import {
  assert,
  assertExists,
  assertEquals,
  assertStrictEquals,
  assertStringIncludes,
  assertThrows,
  assertRejects,
  assertArrayIncludes,
} from 'https://deno.land/std@0.133.0/testing/asserts.ts'
import { spy, assertSpyCall, assertSpyCalls } from "https://deno.land/std@0.133.0/testing/mock.ts";
const { test } = Deno;

import { createMiddleware } from "https://ghuc.cc/worker-tools/middleware/context.ts";
import { ok, notFound } from 'https://ghuc.cc/worker-tools/response-creators/index.ts';
import { ResolvablePromise } from "https://ghuc.cc/worker-tools/resolvable-promise/index.ts";

import { WorkerRouter } from '../index.ts';

const location = {
  origin: 'http://localhost:12334',
  hostname: 'localhost',
  protocol: 'http:',
  pathname: '/',
}

test('environment', () => {
  assertExists(Request)
  assertExists(Response)
  assertExists(WorkerRouter)
});

test('request', () => {
  assertExists(new Request('/item'))
  assertEquals(new Request('/item').url, new URL('/item', location.origin).href)
})

test('routes', async () => {
  const router = new WorkerRouter(x => x, { fatal: true });

  const getCallback = spy(() => ok())
  const postCallback = spy(() => ok())
  const putCallback = spy(() => ok())
  const patchCallback = spy(() => ok())
  const deleteCallback = spy(() => ok())
  const optionsCallback = spy(() => ok())
  const headCallback = spy(() => ok())

  router
    .get('/item', getCallback)
    .post('/item', postCallback)
    .put('/item', putCallback)
    .patch('/item', patchCallback)
    .delete('/item', deleteCallback)
    .options('/item', optionsCallback)
    .head('/item', headCallback)

  const p = await Promise.all([
    router.handle(new Request('/item')),
    router.handle(new Request('/item', { method: 'POST' })),
    router.handle(new Request('/item', { method: 'PUT' })),
    router.handle(new Request('/item', { method: 'PATCH' })),
    router.handle(new Request('/item', { method: 'DELETE' })),
    router.handle(new Request('/item', { method: 'OPTIONS' })),
    router.handle(new Request('/item', { method: 'HEAD' })),
  ]);

  assertSpyCall(getCallback, 0)
  assertSpyCall(postCallback, 0)
  assertSpyCall(putCallback, 0)
  assertSpyCall(patchCallback, 0)
  assertSpyCall(deleteCallback, 0)
  assertSpyCall(optionsCallback, 0)
  assertSpyCall(headCallback, 0)
})

test('handle', async () => {
  let i = 0
  const router = new WorkerRouter(x => x, { fatal: true })
    .get('/', (req, ctx) => {
      i++;
      assert(req instanceof Request)
      assertEquals(req.method, 'GET')
      assertEquals(req.url, new URL('/', location.origin).href)
      assertEquals(
        new Set(Object.keys(ctx!)), 
        new Set(['request', 'waitUntil', 'match', 'handled', 'effects' ]),
      )
      return ok();
    })
  await router.handle(new Request('/'))
  assertEquals(i, 1, 'called')
})

test('all methods', async () => {
  const callback = spy((req: Request) => {
    assert(req instanceof Request)
    return ok();
  })
  const router = new WorkerRouter(x => x, { fatal: true }).all('/', callback)
  await Promise.all([
    router.handle(new Request('/', { method: 'POST' })),
    router.handle(new Request('/', { method: 'PUT' })),
    router.handle(new Request('/', { method: 'PATCH' })),
    router.handle(new Request('/', { method: 'DELETE' })),
    router.handle(new Request('/', { method: 'OPTIONS' })),
    router.handle(new Request('/', { method: 'HEAD' })),
  ])
  assertSpyCalls(callback, 6)
})

test('patterns', async () => {
  let called = false
  const router = new WorkerRouter(x => x, { fatal: true }).get('/item/:id', (req, ctx) => {
    assertExists(ctx.match)
    assertEquals(ctx.match.pathname.input, '/item/3')
    assertEquals(ctx.match.pathname.groups, { id: '3' })
    called = true;
    return ok();
  })
  await router.handle(new Request('/item/3'))
  assert(called)
})

test('error recovery', async () => {
  let called = false
  const router = new WorkerRouter(x => x, { fatal: true })
    .get('/item/:id', () => { throw new Response(null, { status: 418 }) })
    .recover('*', (req, { response }) => {
      called = true;
      assertEquals(response.status, 418);
      return new Response('something went wrong', response);
    })
  await router.handle(new Request('/item/3'))
  assert(called)
})

test('multi patterns', async () => {
  let called = false;
  const router = new WorkerRouter(x => x, { fatal: true }).get('/item/:type/:id', (req, ctx) => {
    assertExists(ctx.match)
    assertEquals(ctx.match.pathname.input, '/item/soap/3')
    assertEquals(ctx.match.pathname.groups, { type: 'soap', id: '3' })
    called = true;
    return ok();
  })
  await router.handle(new Request('/item/soap/3'))
  assert(called)
})

test('wildcards *', async () => {
  let called = false;
  const router = new WorkerRouter(x => x, { fatal: true }).get('*', (req, ctx) => {
    assertExists(ctx.match)
    assertEquals(ctx.match.pathname.input, '/item/soap/3')
    assertEquals(ctx.match.pathname.groups, { 0: '/item/soap/3' })
    called = true;
    return ok();
  })
  await router.handle(new Request('/item/soap/3'))
  assert(called)
})

test('wildcards /*', async () => {
  let called = false;
  const router = new WorkerRouter(x => x, { fatal: true }).get('/*', (req, ctx) => {
    assertEquals(ctx.match.pathname.groups, { 0: 'item/soap/3' })
    called = true;
    return ok();
  })
  await router.handle(new Request('/item/soap/3'))
  assert(called)
})

test('ignores search params and hashes', async () => {
  let called = false;
  const router = new WorkerRouter(x => x, { fatal: true }).get('/item/soap/:id', (req, ctx) => {
    assertEquals(ctx.match.pathname.groups['id'], '3')
    called = true;
    return ok();
  })
  await router.handle(new Request('/item/soap/3?foo=bar#L2'))
  assert(called)
})

test('middleware', async () => {
  let called = false;
  const mw = createMiddleware(() => ({ foo: '' }), async x => ({ ...await x, foo: 'bar' }))
  const router = new WorkerRouter(x => x, { fatal: true }).get('/', mw, (req, ctx) => {
    assertEquals(ctx.foo, 'bar')
    called = true;
    return ok();
  })
  const p = router.handle(new Request('/'))
  await p;
  assert(called)
})

test('delegation', async () => {
  const itemRouter = new WorkerRouter(x => x, { fatal: true })
    .get('/:type/:id', (req, ctx) => {
      assertEquals(ctx.match.pathname.groups, { type: 'soap', id: '3' })
      return ok()
    })

  const router = new WorkerRouter(x => x, { fatal: true })
    .use('/(item|sale)/*', itemRouter)

  await Promise.all([
    router.handle(new Request('/item/soap/3')),
    router.handle(new Request('/sale/soap/3')),
  ]);
})

test('external resources', async () => {
  const callback = spy(() => ok())

  const router = new WorkerRouter(x => x, { fatal: true })
    .external('https://exmaple.com/*', callback)
    .any('*', () => notFound())

  await Promise.all([
    router.handle(new Request('https://exmaple.com/api/call')),
    router.handle(new Request('https://exmaple.com/other/resource')),
    router.handle(new Request('https://exmaple.com/')),
    router.handle(new Request('https://exmaple.com')),

    router.handle(new Request('https://not.example.com/foo/bar')),
    router.handle(new Request('/api/call')),
  ])

  assertSpyCalls(callback, 4)
})

test('pattern init', async () => {
  const callback = spy(() => ok())

  const router = new WorkerRouter(x => x, { fatal: true })
    .external({ pathname: '/api/*', baseURL: 'https://example.com' }, callback)

  await router.handle(new Request('https://example.com/api/call'))

  assertSpyCalls(callback, 1)
})

// Can't be tested in Deno without --location flag...
// test('external resources don\'t match same pathname (iff global location is present)', async () => {
//   const callback = spy(() => ok())
//   const realCallback = spy(() => ok())

//   const router = new WorkerRouter(_ => _, { baseURL: location.origin })
//     .all('/same', callback)
//     .external({ pathname: '/same' }, realCallback)

//   await router.handle(new Request('https://exmaple.com/same'))

//   assertSpyCalls(callback, 0)
//   assertSpyCalls(realCallback, 1)
// })

test('fetch event listener', async () => {
  const rp = new ResolvablePromise<Response>()
  const theResponse = ok('ok');
  const callback = spy(() => theResponse.clone())
  const router = new WorkerRouter(x => x, { fatal: true })
    .any('*', callback)

  router.handleEvent(new class extends Event {
    constructor() {
      super('fetch');
      (<any>this).request = new Request('/')
    }
    respondWith(response: Response) {
      rp.resolve(response)
    }
    waitUntil() {}
  })
  await rp;
  assertEquals((await rp).text(), theResponse.text());
  assertSpyCalls(callback, 1)
})

test('module fetch export', async () => {
  const theEnv = {}
  const envCtx = { waitUntil() {} }
  const theResponse = ok('ok');
  const router = new WorkerRouter(x => x, { fatal: true })
    .any('*', (req, { env, waitUntil }) => {
      assertExists(waitUntil)
      assertStrictEquals(env, theEnv)
      return theResponse.clone();
    })
  const res = await router.fetch(new Request('/'), theEnv, envCtx)
  assertEquals(await res.text(), await theResponse.text())
})

test('serve callback', async () => {
  const theResponse = ok('ok');
  const callback = spy(() => theResponse.clone())
  const router = new WorkerRouter(x => x, { fatal: true })
    .any('*', callback)
  const res = await router.serveCallback(new Request('/'), {})
  assertStrictEquals(await res.text(), await theResponse.text())
  assertSpyCalls(callback, 1)
})

test('fires event in non-fatal mode', async () => {
  const router = new WorkerRouter(x => x, { fatal: false })
  router.get('/', () => { throw Error('foobar') })
  const callback = spy((e: ErrorEvent) => { 
    assertExists(e) 
    assert(e instanceof ErrorEvent) 
    assert(e.message === 'foobar') 
  })
  router.addEventListener('error', callback)
  await router.handle(new Request('/'));
  assertSpyCalls(callback, 1)
})