import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { username } from "better-auth/plugins";
import { MongoClient } from "mongodb";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAuth = any;

const globalForMongo = global as typeof globalThis & {
  _betterAuthMongoClient?: MongoClient;
  _auth?: AnyAuth;
};

function getAuthInstance(): AnyAuth {
  if (!globalForMongo._betterAuthMongoClient) {
    globalForMongo._betterAuthMongoClient = new MongoClient(
      process.env.MONGODB_URI!
    );
    // Fire-and-forget: start the Atlas TCP handshake immediately so it's
    // ready (or nearly ready) when the first auth query arrives.
    globalForMongo._betterAuthMongoClient.connect().catch(() => {});
  }
  if (!globalForMongo._auth) {
    const appUrl = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    globalForMongo._auth = betterAuth({
      database: mongodbAdapter(globalForMongo._betterAuthMongoClient.db()),
      baseURL: appUrl,
      secret: process.env.AUTH_SECRET,
      trustedOrigins: [appUrl],
      emailAndPassword: {
        enabled: true,
      },
      plugins: [username()],
      user: {
        additionalFields: {
          section: {
            type: "string",
            required: true,
            defaultValue: "stocks",
          },
        },
      },
    });
  }
  return globalForMongo._auth;
}

// Proxy defers MongoClient creation to first request, not module load time.
// This prevents build errors when env vars may be absent during Next.js build.
export const auth = new Proxy({} as AnyAuth, {
  get(_target, prop) {
    const instance = getAuthInstance();
    const value = Reflect.get(instance, prop);
    return typeof value === "function" ? value.bind(instance) : value;
  },
  has(_target, prop) {
    return Reflect.has(getAuthInstance(), prop);
  },
});
