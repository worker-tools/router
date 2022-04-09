// deno-lint-ignore-file no-explicit-any
class ErrorEventPolyfill extends Event implements ErrorEvent {
  #dict?: ErrorEventInit;
  constructor(type: string, eventInitDict?: ErrorEventInit) {
    super(type);
    this.#dict = { ...eventInitDict };
  }
  get message() { return this.#dict?.message ?? '' }
  get filename() { return this.#dict?.filename ?? '' }
  get lineno() { return this.#dict?.lineno ?? 0 }
  get colno() { return this.#dict?.colno ?? 0 }
  get error() { return this.#dict?.error }
}

export const ErrorEvent: typeof ErrorEventPolyfill = 'ErrorEvent' in self 
  ? (<any>self).ErrorEvent 
  : ErrorEventPolyfill

