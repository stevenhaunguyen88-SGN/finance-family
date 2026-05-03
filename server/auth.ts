import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users, type User } from "@shared/schema";

const MemoryStore = createMemoryStore(session);

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type SafeUser = Pick<User, "id" | "username">;

function toSafe(user: User): SafeUser {
  return { id: user.id, username: user.username };
}

function getUserByUsername(username: string): User | undefined {
  return db.select().from(users).where(eq(users.username, username)).get();
}

function getUserById(id: number): User | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Bootstrap an admin account from environment variables on first boot.
 * If `ADMIN_USERNAME` and `ADMIN_PASSWORD` are set and the user does not exist,
 * creates the account. Idempotent: if the user already exists, does nothing.
 *
 * In production this is the ONLY way to create the first user — there is no
 * public registration endpoint.
 */
export async function bootstrapAdminFromEnv() {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    const userCount = db.select().from(users).all().length;
    if (userCount === 0) {
      console.warn(
        "[auth] No users in DB and ADMIN_USERNAME/ADMIN_PASSWORD not set. " +
          "Set both in .env and restart to create the first account."
      );
    }
    return;
  }
  const existing = getUserByUsername(username);
  if (existing) return;
  const passwordHash = await hashPassword(password);
  db.insert(users).values({ username, passwordHash }).run();
  console.log(`[auth] Bootstrapped admin user "${username}" from environment.`);
}

function resolveSessionSecret(): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set to a value of at least 16 chars in production. " +
        "Generate one with: openssl rand -hex 32"
    );
  }
  console.warn(
    "[auth] SESSION_SECRET not set — using an insecure default for development. " +
      "Set SESSION_SECRET in .env for any real deployment."
  );
  return "dev-only-insecure-secret-change-me";
}

export function setupAuth(app: Express) {
  app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : 0);

  const isProduction = process.env.NODE_ENV === "production";

  app.use(
    session({
      name: "ff.sid",
      secret: resolveSessionSecret(),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        maxAge: 7 * ONE_DAY_MS,
      },
      store: new MemoryStore({
        checkPeriod: ONE_DAY_MS,
      }),
    })
  );

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = getUserByUsername(username);
        if (!user) return done(null, false, { message: "Sai tên đăng nhập hoặc mật khẩu" });
        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return done(null, false, { message: "Sai tên đăng nhập hoặc mật khẩu" });
        return done(null, toSafe(user));
      } catch (err) {
        return done(err as Error);
      }
    })
  );

  passport.serializeUser((user, done) => {
    done(null, (user as SafeUser).id);
  });

  passport.deserializeUser((id: number, done) => {
    const user = getUserById(id);
    if (!user) return done(null, false);
    done(null, toSafe(user));
  });

  app.use(passport.initialize());
  app.use(passport.session());

  // ── Auth routes ──────────────────────────────────────────────────
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Quá nhiều lần thử. Vui lòng thử lại sau 15 phút." },
  });

  app.post("/api/auth/login", loginLimiter, (req, res, next) => {
    passport.authenticate(
      "local",
      (err: Error | null, user: SafeUser | false, info: { message?: string } | undefined) => {
        if (err) return next(err);
        if (!user) {
          return res.status(401).json({ message: info?.message || "Đăng nhập thất bại" });
        }
        req.logIn(user, (loginErr) => {
          if (loginErr) return next(loginErr);
          return res.json({ user });
        });
      }
    )(req, res, next);
  });

  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        res.clearCookie("ff.sid");
        res.json({ success: true });
      });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Chưa đăng nhập" });
    }
    res.json({ user: req.user as SafeUser });
  });
}

/**
 * Express middleware that gates a request behind a logged-in session.
 * Mounted on `/api/*` after the auth routes.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    return next();
  }
  return res.status(401).json({ message: "Chưa đăng nhập" });
}
