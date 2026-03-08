// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// Branded type utility — zero runtime cost, compile-time nominal typing.
declare const __brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [__brand]: B };
