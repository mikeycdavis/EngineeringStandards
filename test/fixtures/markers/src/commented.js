// This file is real code that only *mentions* code signals, inside comments and strings.
// A file-extension filter cannot save you here: this is a .js file. Only a use/mention split can.

// Commented-out route, left behind during a refactor:
//   app.get("/legacy", legacyHandler);
//   router.post("/legacy", legacyHandler);

/* An abandoned worker:
     import { Queue } from "bullmq";
     const q = new Queue("legacy");
     cron.schedule("0 * * * *", run);
*/

// We deliberately do not use openai or @anthropic-ai/sdk here.

export const MESSAGES = {
  todo: "TODO: this string mentions a marker but is not a marker",
  note: "@Scheduled and IHostedService appear here as data, not as annotations",
};
