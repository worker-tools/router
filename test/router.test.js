import './fixes';
import { jest } from '@jest/globals'
import { ok } from '@worker-tools/response-creators';
import { WorkerRouter } from '../dist/router.js';

Object.defineProperty(globalThis, 'tick', {
  get: () => new Promise(r => setTimeout(r)),
});

test('environment', () => {
  expect(Request).toBeDefined();
  expect(Response).toBeDefined();
  expect(WorkerRouter).toBeDefined();
  expect(location).toBeDefined();
});

test('request', () => {
  expect(new Request('/item')).toBeDefined()
  expect(new Request('/item').url).toBe(new URL('/item', location.origin).href)
})

test('routes', async () => {
  const router = new WorkerRouter();

  const getCallback = jest.fn(() => ok());
  const postCallback = jest.fn(() => ok());
  const putCallback = jest.fn(() => ok());
  const patchCallback = jest.fn(() => ok());
  const deleteCallback = jest.fn(() => ok());
  const optionsCallback = jest.fn(() => ok());
  const headCallback = jest.fn(() => ok());

  router
    .get('/item', getCallback)
    .post('/item', postCallback)
    .put('/item', putCallback)
    .patch('/item', patchCallback)
    .delete('/item', deleteCallback)
    .options('/item', optionsCallback)
    .head('/item', headCallback)

  const { handler: route } = router;
  route(new Request('/item'))
  route(new Request('/item', { method: 'POST' }))
  route(new Request('/item', { method: 'PUT' }))
  route(new Request('/item', { method: 'PATCH' }))
  route(new Request('/item', { method: 'DELETE' }))
  route(new Request('/item', { method: 'OPTIONS' }))
  route(new Request('/item', { method: 'HEAD' }))

  await tick

  expect(getCallback).toHaveBeenCalled()
  expect(postCallback).toHaveBeenCalled()
  expect(putCallback).toHaveBeenCalled()
  expect(patchCallback).toHaveBeenCalled()
  expect(deleteCallback).toHaveBeenCalled()
  expect(optionsCallback).toHaveBeenCalled()
  expect(headCallback).toHaveBeenCalled()
})

test('handler', () => {
  expect.hasAssertions();
  const router = new WorkerRouter().get('/', (req, ctx) => {
    expect(req).toBeInstanceOf(Request)
    expect(req.method).toBe('GET')
    expect(req.url).toBe(new URL('/item', location.origin).href)
    expect(ctx).toMatchObject({})
    return ok();
  })
  router.handler(new Request('/'))
})

test('all methods', () => {
  expect.hasAssertions()
  const router = new WorkerRouter().all('/', (req) => {
    expect(req).toBeInstanceOf(Request)
    return ok();
  })
  router.handler(new Request('/', { method: 'POST' }))
  router.handler(new Request('/', { method: 'PUT' }))
  router.handler(new Request('/', { method: 'PATCH' }))
  router.handler(new Request('/', { method: 'DELETE' }))
  router.handler(new Request('/', { method: 'OPTIONS' }))
  router.handler(new Request('/', { method: 'HEAD' }))
})

test('patterns', () => {
  expect.assertions(3)
  const router = new WorkerRouter().get('/item/:id', (req, ctx) => {
    expect(ctx.match).toBeDefined()
    expect(ctx.match.input).toBe('/item/3')
    expect(ctx.match.groups).toMatchObject({ id: '3' })
    return ok();
  })
  router.handler(new Request('/item/3'))
})

test('multi patterns', () => {
  expect.assertions(3)
  const router = new WorkerRouter().get('/item/:type/:id', (req, ctx) => {
    expect(ctx.match).toBeDefined()
    expect(ctx.match.input).toBe('/item/soap/3')
    expect(ctx.match.groups).toMatchObject({ type: 'soap', id: '3' })
    return ok();
  })
  router.handler(new Request('/item/soap/3'))
})

test('wildcards *', () => {
  expect.assertions(3)
  const router = new WorkerRouter().get('*', (req, ctx) => {
    expect(ctx.match).toBeDefined()
    expect(ctx.match.input).toBe('/item/soap/3')
    expect(ctx.match.groups).toMatchObject({ 0: '/item/soap/3' })
    return ok();
  })
  router.handler(new Request('/item/soap/3'))
})

test('wildcards /*', () => {
  expect.assertions(1);
  const router = new WorkerRouter().get('/*', (req, ctx) => {
    expect(ctx.match.groups).toMatchObject({ 0: 'item/soap/3' })
    return ok();
  })
  router.handler(new Request('/item/soap/3'))
})

test('ignores search params and hashes', () => {
  expect.assertions(1);
  const router = new WorkerRouter().get('/item/soap/:id', (req, ctx) => {
    expect(ctx.match.groups['id']).toBe('3')
    return ok();
  })
  router.handler(new Request('/item/soap/3?foo=bar#L2'))
})

test('middleware', async () => {
  expect.assertions(2);
  const mw = jest.fn(x => ({ ...x, foo: 'bar' }))
  const router = new WorkerRouter().get('/', mw, (req, ctx) => {
    console.log(ctx.foo)
    expect(ctx.foo).toBe('barx') // dafuq??
  })
  router.handler(new Request('/'))
  expect(mw).toHaveBeenCalled()
})

test('delegation', () => {
  expect.hasAssertions();
  const itemRouter = new WorkerRouter()
    .get('/:type/:id', (req, ctx) => {
      expect(ctx.match.groups).toMatchObject({ type: 'soap', id: '3' })
    })
  const router = new WorkerRouter()
    .use('/item*', itemRouter)

  router.handler(new Request('/other/soap/3'))
  router.handler(new Request('/item/soap/3'))
})