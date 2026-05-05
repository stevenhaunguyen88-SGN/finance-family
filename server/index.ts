import "dotenv/config";
import express, { Response, NextFunction } from 'express';
import type { Request } from 'express';
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { setupAuth, bootstrapAdminFromEnv, requireAuth } from "./auth";
import { serveStatic } from "./static";
import { createServer } from "node:http";
import { databaseMode, resolvePort } from "./config";
import { initializeDatabase } from "./db";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Security headers. CSP is intentionally relaxed in development so Vite's HMR works;
// in production the bundled client only loads same-origin assets, so the default CSP is fine.
app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    database: databaseMode,
    uptime: Math.round(process.uptime()),
  });
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await initializeDatabase();
  setupAuth(app);
  await bootstrapAdminFromEnv();

  // Every /api/* route requires authentication except the auth endpoints themselves.
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth/")) return next();
    return requireAuth(req, res, next);
  });

  await registerRoutes(httpServer, app);

  // Process any recurring transactions that are due (catch-up after downtime).
  try {
    const { storage } = await import("./storage");
    const count = await storage.processDueRecurringTransactions(1);
    if (count > 0) {
      log(`Processed ${count} due recurring transaction(s)`, "recurring");
    }
  } catch (err) {
    console.error("[recurring] Failed to process due recurring transactions:", err);
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Only stack-log unexpected (5xx) errors. Expected 4xx responses (e.g. validation,
    // restrict-on-delete) are user-visible and don't need a server-side stack trace.
    if (status >= 500) {
      console.error("Internal Server Error:", err);
    }

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = resolvePort();
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
