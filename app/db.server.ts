import "./env.server";
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

const rawDatabaseUrl = process.env.DATABASE_URL?.trim() || "";
const isLocalDbOnVercel =
  Boolean(process.env.VERCEL) &&
  (rawDatabaseUrl.includes("@localhost") || rawDatabaseUrl.includes("@127.0.0.1"));
const hasDatabaseUrl = Boolean(rawDatabaseUrl) && !isLocalDbOnVercel;

function getRawClient(): PrismaClient | null {
  if (!hasDatabaseUrl) return null;
  try {
    if (process.env.NODE_ENV !== "production") {
      if (!global.prismaGlobal) {
        global.prismaGlobal = new PrismaClient();
      }
      return global.prismaGlobal;
    }
    if (!global.prismaGlobal) {
      global.prismaGlobal = new PrismaClient();
    }
    return global.prismaGlobal;
  } catch (err) {
    console.warn("[db] Failed to initialize PrismaClient:", (err as Error).message);
    return null;
  }
}

function defaultForMethod(method: string): unknown {
  switch (method) {
    case "findMany":
    case "groupBy":
      return [];
    case "count":
      return 0;
    case "findUnique":
    case "findFirst":
      return null;
    case "deleteMany":
    case "updateMany":
      return { count: 0 };
    default:
      return null;
  }
}

function createModelProxy(modelName: string) {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== "string") return undefined;
        return async (...args: unknown[]) => {
          const client = getRawClient() as Record<string, Record<string, (...a: unknown[]) => unknown>> | null;
          const delegate = client?.[modelName];
          if (!delegate || typeof delegate[prop] !== "function") {
            return defaultForMethod(prop);
          }
          try {
            return await delegate[prop](...args);
          } catch (err) {
            console.warn(`[db] ${modelName}.${prop} fallback:`, (err as Error).message);
            if (prop in { findMany: 1, groupBy: 1, count: 1, findUnique: 1, findFirst: 1, deleteMany: 1, updateMany: 1 }) {
              return defaultForMethod(prop);
            }
            throw err;
          }
        };
      },
    },
  );
}

const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (prop === "then") return undefined;
    if (prop === "$queryRaw" || prop === "$queryRawUnsafe") {
      return async (...args: unknown[]) => {
        const client = getRawClient() as unknown as Record<string, (...a: unknown[]) => unknown> | null;
        if (!client || typeof client[prop as string] !== "function") return [];
        try {
          return await client[prop as string](...args);
        } catch (err) {
          console.warn(`[db] ${String(prop)} fallback:`, (err as Error).message);
          return [];
        }
      };
    }
    if (prop === "$transaction") {
      return async (arg: unknown) => {
        const client = getRawClient();
        if (!client) return Array.isArray(arg) ? [] : null;
        if (Array.isArray(arg)) {
          return Promise.all(arg);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (client.$transaction as any)(arg);
      };
    }
    if (typeof prop === "string") {
      return createModelProxy(prop);
    }
    return undefined;
  },
});

export default prisma;