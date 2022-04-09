// deno-lint-ignore-file no-explicit-any
class AggregateErrorPolyfill extends Error {
  #errors: unknown[];
  get name() { return 'AggregateError' }
  get errors() { return [...this.#errors] }
	constructor(errors: Iterable<unknown>, message = '') {
		super(message);
		this.#errors = [...errors];
	}
}

export const AggregateError: typeof AggregateErrorPolyfill = 'AggregateError' in self 
  ? (<any>self).AggregateError 
  : AggregateErrorPolyfill