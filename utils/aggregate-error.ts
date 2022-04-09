// deno-lint-ignore-file no-explicit-any
class AggregateErrorPolyfill extends Error {
  errors: readonly any[];
	constructor(errors: Iterable<any>, message = '') {
		super(message);
		this.errors = [...errors];
    this.name = 'AggregateError';
	}
}

export const AggregateError: typeof AggregateErrorPolyfill = 'AggregateError' in self 
  ? (<any>self).AggregateError 
  : AggregateErrorPolyfill