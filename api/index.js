// Vercel routes every /api/* request here (see vercel.json). The handler lives in server/ so it shares that
// folder's packages, including the same mongoose instance the models are registered on.
export { default } from "../server/serverless.js";
