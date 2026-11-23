// Imported first by serverless.js, so it runs before config.js reads the environment. On Vercel, run the API in
// production mode (strict CORS; test payments only with ALLOW_TEST_PAYMENTS=true) without setting NODE_ENV for the whole build, which
// would make npm skip the dev packages the website build needs.
if (process.env.VERCEL && !process.env.NODE_ENV) process.env.NODE_ENV = "production";
