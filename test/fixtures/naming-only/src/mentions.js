// This file NAMES third-party services without importing any of them. It exists to prove the audit
// does not report a mention as usage. Candidates once considered: stripe, twilio, openai, anthropic,
// aws-sdk, @azure/identity, mongodb, redis.
export const CONSIDERED = ["stripe", "openai", "aws-sdk", "@anthropic-ai/sdk", "langchain"];
export const NOTE = "We evaluated openai and anthropic before choosing neither.";
