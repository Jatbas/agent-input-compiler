// Branded type utility — zero runtime cost, compile-time nominal typing.
declare const __brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [__brand]: B };
