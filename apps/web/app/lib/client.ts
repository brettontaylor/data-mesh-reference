import { DctClient } from "@dct/sdk";

// Server-side client → the control-plane API. Configurable via env.
export const dct = new DctClient({
  baseUrl: process.env.DCT_API_URL ?? "http://localhost:4400",
});
