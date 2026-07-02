export const histologyQuestionBankKey = "histology-osh-2025-2026";

const knownQuestionBankHashes: Record<string, string> = {
  "05D1068327A1C622AB891E4BFCF9EA8ACFD1253B20FD22637E3DDD25E8AC8F79": histologyQuestionBankKey,
  "5721B308CFC95AE89B8780106F5C8DA6E531B747407836E60FC0D06A49793B8B": histologyQuestionBankKey
};

export function knownQuestionBankForHash(sha256: string) {
  return knownQuestionBankHashes[sha256.trim().toUpperCase()] || "";
}
