/**
 * Shared contracts version for Demo V1 analysis payloads.
 * Unknown versions must fail closed at validation boundaries.
 */
export const CONTRACTS_VERSION = "1.0.0" as const;

export type ContractsVersion = typeof CONTRACTS_VERSION;
