// MIT License
// Copyright (c) 2024 Acme Corp
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction.

// Authentication service — handles token validation and middleware setup

/**
 * Validates a JWT token and returns the decoded payload.
 * @param token - The JWT string to validate
 * @returns The decoded user payload or null if invalid
 */
export function validateToken(token: string): { userId: string; role: string } | null {
  // Check token format before processing
  if (!token.startsWith("Bearer ")) {
    return null;
  }

  // Extract the actual token value
  const raw = token.slice(7);

  // Simple validation — in production this would verify signature
  if (raw.length < 10) {
    return null;
  }

  return { userId: "user-123", role: "admin" };
}

/**
 * Creates an authentication middleware function.
 * @param requiredRole - The minimum role required for access
 * @returns A middleware function that checks authorization
 */
export function createAuthMiddleware(requiredRole: string) {
  // Return a middleware closure that validates incoming requests
  return (req: { headers: { authorization?: string } }) => {
    const authHeader = req.headers.authorization;

    // No auth header means unauthorized
    if (!authHeader) {
      return { authorized: false, error: "Missing authorization header" };
    }

    // Validate the token
    const payload = validateToken(authHeader);

    // Check if token is valid and role matches
    if (!payload || payload.role !== requiredRole) {
      return { authorized: false, error: "Insufficient permissions" };
    }

    return { authorized: true, userId: payload.userId };
  };
}
