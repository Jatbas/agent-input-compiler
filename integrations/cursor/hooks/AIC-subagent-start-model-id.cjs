// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// Validates Cursor subagentStart `subagent_model` for aic_compile modelId (aligned with AIC-compile-context.cjs).

const { normalizeModelId } = require("../../shared/session-model-cache.cjs");

function modelIdFromSubagentStartPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload.subagent_model;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 256) return null;
  if (!/^[\x20-\x7E]+$/.test(trimmed)) return null;
  return normalizeModelId(trimmed);
}

module.exports = { modelIdFromSubagentStartPayload };
