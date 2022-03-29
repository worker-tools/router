import { URLPattern } from 'urlpattern-polyfill';

export { URLPattern }

export const URLPatternImpl: typeof URLPattern = 'URLPattern' in globalThis 
  ? (<any>globalThis).URLPattern
  : URLPattern

