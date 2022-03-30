import '@worker-tools/location-polyfill'

globalThis.Request = class FixedRequest extends Request {
  constructor(a, b) {
    super(new URL(a, location.origin).href, b)
  }
}