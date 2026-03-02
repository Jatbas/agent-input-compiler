// MIT License
// Copyright (c) 2024 Acme Corp

// Main entry point — re-exports auth module for external consumption

import { validateToken, createAuthMiddleware } from "./auth/service";

// Public API
export { validateToken, createAuthMiddleware };

// Default middleware for admin routes
export const adminMiddleware = createAuthMiddleware("admin");
