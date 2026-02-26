/**
 * Branded type utility — zero runtime cost, compile-time nominal typing.
 *
 * Usage:
 *   type TokenCount = Brand<number, "TokenCount">;
 *   const tokens = 42 as TokenCount; // explicit cast at construction boundary
 */
declare const __brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [__brand]: B };
