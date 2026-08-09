import { Queue } from "bullmq";
export const nightly = new Queue("nightly");
