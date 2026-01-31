import { sql } from "bun";
import {
  UserInputSchema,
  LoginInputSchema,
  GameInputSchema,
  UserPatchSchema,
  GamePatchSchema,
} from "./schemas";

await sql`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    street_address TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS games (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    publisher TEXT NOT NULL,
    year INTEGER NOT NULL,
    gaming_system TEXT NOT NULL,
    condition TEXT NOT NULL CHECK(condition IN ('mint', 'good', 'fair', 'poor')),
    previous_owners INTEGER,
    owner_id INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  )
`;

const sessions = new Map<string, number>(); // token -> userId

function generateToken(): string {
  return crypto.randomUUID();
}

function authenticate(req: Request): number | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  const userId = sessions.get(token);
  return userId ?? null;
}

function requireAuth(req: Request): Response | number {
  const userId = authenticate(req);
  if (userId === null) {
    return errorResponse(401, "Unauthorized: Please login first");
  }
  return userId;
}

function createUserLinks(userId: number) {
  return {
    self: { href: `/users/${userId}` },
    games: { href: `/games?ownerId=${userId}` },
  };
}

function createGameLinks(gameId: number, ownerId: number) {
  return {
    self: { href: `/games/${gameId}` },
    owner: { href: `/users/${ownerId}` },
  };
}

function formatUserResponse(user: any) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    streetAddress: user.street_address,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    _links: createUserLinks(user.id),
  };
}

function formatGameResponse(game: any) {
  return {
    id: game.id,
    name: game.name,
    publisher: game.publisher,
    year: game.year,
    gamingSystem: game.gaming_system,
    condition: game.condition,
    previousOwners: game.previous_owners,
    ownerId: game.owner_id,
    createdAt: game.created_at,
    updatedAt: game.updated_at,
    _links: createGameLinks(game.id, game.owner_id),
  };
}

function errorResponse(code: number, message: string) {
  return Response.json({ code, message }, { status: code });
}

const server = Bun.serve({
  port: 3001,
  routes: {
    "/auth/login": {
      POST: async (req) => {
        try {
          const body: any = await req.json();

          const validation = LoginInputSchema.safeParse(body);
          if (!validation.success) {
            return errorResponse(400, validation.error.message);
          }

          const { email, password } = validation.data;

          const users = await sql`SELECT * FROM users WHERE email = ${email}`;
          if (users.length === 0) {
            return errorResponse(401, "Invalid email or password");
          }
          const user = users[0];

          const isMatch = await Bun.password.verify(password, user.password);
          if (!isMatch) {
            return errorResponse(401, "Invalid email or password");
          }

          const token = generateToken();
          sessions.set(token, user.id);

          return Response.json({
            token,
            userId: user.id,
            message: "Login successful",
            _links: {
              self: { href: "/auth/login" },
              user: { href: `/users/${user.id}` },
            },
          });
        } catch (error) {
          return errorResponse(400, "Invalid input");
        }
      },
    },
    "/auth/logout": {
      POST: (req) => {
        const authHeader = req.headers.get("Authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
          const token = authHeader.substring(7);
          sessions.delete(token);
        }
        return Response.json({ message: "Logged out successfully" });
      },
    },
    "/users": {
      POST: async (req) => {
        try {
          const body: any = await req.json();

          const validation = UserInputSchema.safeParse(body);
          if (!validation.success) {
            return errorResponse(400, validation.error.message);
          }

          const { name, email, password, streetAddress } = validation.data;

          const existingUsers = await sql`SELECT id FROM users WHERE email = ${email}`;
          if (existingUsers.length > 0) {
            return errorResponse(409, "User with this email already exists");
          }

          const hashedPassword = await Bun.password.hash(password);
          const now = new Date();

          const result = await sql`
            INSERT INTO users (name, email, password, street_address, created_at, updated_at)
            VALUES (${name}, ${email}, ${hashedPassword}, ${streetAddress}, ${now}, ${now})
            RETURNING *
          `;

          const user = result[0];
          return Response.json(formatUserResponse(user), { status: 201 });
        } catch (error) {
          return errorResponse(400, "Invalid input");
        }
      },
    },
    "/users/:id": {
      GET: async (req) => {
        const authResult = requireAuth(req);
        if (authResult instanceof Response) return authResult;

        const userId = parseInt(req.params.id);
        const users = await sql`SELECT * FROM users WHERE id = ${userId}`;

        if (users.length === 0) {
          return errorResponse(404, "User not found");
        }

        return Response.json(formatUserResponse(users[0]));
      },
      PATCH: async (req) => {
        const authResult = requireAuth(req);
        if (authResult instanceof Response) return authResult;
        const authenticatedUserId = authResult;

        try {
          const userId = parseInt(req.params.id);

          if (userId !== authenticatedUserId) {
            return errorResponse(403, "Forbidden: You can only update your own profile");
          }

          const users = await sql`SELECT * FROM users WHERE id = ${userId}`;

          if (users.length === 0) {
            return errorResponse(404, "User not found");
          }

          const body: any = await req.json();

          const validation = UserPatchSchema.safeParse(body);
          if (!validation.success) {
            return errorResponse(400, validation.error.message);
          }

          const updates: any = { updated_at: new Date() };

          if (validation.data.name !== undefined) {
            updates.name = validation.data.name;
          }
          if (validation.data.streetAddress !== undefined) {
            updates.street_address = validation.data.streetAddress;
          }

          if (Object.keys(updates).length === 1) {
            return errorResponse(400, "No valid fields to update");
          }

          const updatedUsers = await sql`
            UPDATE users
            SET ${sql(updates)}
            WHERE id = ${userId}
            RETURNING *
          `;

          return Response.json(formatUserResponse(updatedUsers[0]));
        } catch (error) {
          return errorResponse(400, "Invalid input");
        }
      },
      DELETE: (req) => {
        const authResult = requireAuth(req);
        if (authResult instanceof Response) return authResult;
        const authenticatedUserId = authResult;

        const userId = parseInt(req.params.id);

        if (userId !== authenticatedUserId) {
          return errorResponse(403, "Forbidden: You can only delete your own profile");
        }

        const users = await sql`SELECT id FROM users WHERE id = ${userId}`;

        if (users.length === 0) {
          return errorResponse(404, "User not found");
        }

        await sql`DELETE FROM users WHERE id = ${userId}`;
        return new Response(null, { status: 204 });
      },
    },
    "/games": {
      GET: async (req) => {
        const authResult = requireAuth(req);
        if (authResult instanceof Response) return authResult;

        const url = new URL(req.url);
        const params = url.searchParams;

        const nameParam = params.has("name") ? '%' + params.get("name") + '%' : null;
        const publisherParam = params.has("publisher") ? params.get("publisher") : null;
        const yearParam = params.has("year") ? parseInt(params.get("year")!) : null;
        const gamingSystemParam = params.has("gamingSystem") ? params.get("gamingSystem") : null;
        const conditionParam = params.has("condition") ? params.get("condition") : null;
        const ownerIdParam = params.has("ownerId") ? parseInt(params.get("ownerId")!) : null;

        const games = await sql`
          SELECT * FROM games
          WHERE (${nameParam} IS NULL OR name ILIKE ${nameParam})
            AND (${publisherParam} IS NULL OR publisher = ${publisherParam})
            AND (${yearParam} IS NULL OR year = ${yearParam})
            AND (${gamingSystemParam} IS NULL OR gamingSystem = ${gamingSystemParam})
            AND (${conditionParam} IS NULL OR condition = ${conditionParam})
            AND (${ownerIdParam} IS NULL OR ownerId = ${ownerIdParam})
        `;

        return Response.json({
          games: games.map(formatGameResponse),
          _links: {
            self: { href: url.pathname + (url.search || "") },
          },
        });
      },
      POST: async (req) => {
        const authResult = requireAuth(req);
        if (authResult instanceof Response) return authResult;
        const authenticatedUserId = authResult;

        try {
          const body: any = await req.json();

          const validation = GameInputSchema.safeParse(body);
          if (!validation.success) {
            return errorResponse(400, validation.error.message);
          }

          const { name, publisher, year, gamingSystem, condition, previousOwners } = validation.data;

          const ownerId = authenticatedUserId;

          const now = new Date();

          const result = await sql`
            INSERT INTO games (name, publisher, year, gaming_system, condition, previous_owners, owner_id, created_at, updated_at)
            VALUES (${name}, ${publisher}, ${year}, ${gamingSystem}, ${condition}, ${previousOwners ?? null}, ${ownerId}, ${now}, ${now})
            RETURNING *
          `;

          const game = result[0];
          return Response.json(formatGameResponse(game), { status: 201 });
        } catch (error) {
          return errorResponse(400, "Invalid input");
        }
      },
    },
    "/games/:id": {
      GET: async (req) => {
        const authResult = requireAuth(req);
        if (authResult instanceof Response) return authResult;

        const gameId = parseInt(req.params.id);
        const games = await sql`SELECT * FROM games WHERE id = ${gameId}`;

        if (games.length === 0) {
          return errorResponse(404, "Game not found");
        }

        return Response.json(formatGameResponse(games[0]));
      },
      PUT: async (req) => {
        const authResult = requireAuth(req);
        if (authResult instanceof Response) return authResult;
        const authenticatedUserId = authResult;

        try {
          const gameId = parseInt(req.params.id);
          const games = await sql`SELECT * FROM games WHERE id = ${gameId}`;

          if (games.length === 0) {
            return errorResponse(404, "Game not found");
          }

          const game = games[0];

          if (game.owner_id !== authenticatedUserId) {
            return errorResponse(403, "Forbidden: You can only update your own games");
          }

          const body: any = await req.json();

          const validation = GameInputSchema.safeParse(body);
          if (!validation.success) {
            return errorResponse(400, validation.error.message);
          }

          const { name, publisher, year, gamingSystem, condition, previousOwners } = validation.data;

          const now = new Date();

          const updatedGames = await sql`
            UPDATE games
            SET name = ${name}, publisher = ${publisher}, year = ${year}, gaming_system = ${gamingSystem},
                condition = ${condition}, previous_owners = ${previousOwners ?? null}, updated_at = ${now}
            WHERE id = ${gameId}
            RETURNING *
          `;

          return Response.json(formatGameResponse(updatedGames[0]));
        } catch (error) {
          return errorResponse(400, "Invalid input");
        }
      },
      PATCH: async (req) => {
        const authResult = requireAuth(req);
        if (authResult instanceof Response) return authResult;
        const authenticatedUserId = authResult;

        try {
          const gameId = parseInt(req.params.id);
          const games = await sql`SELECT * FROM games WHERE id = ${gameId}`;

          if (games.length === 0) {
            return errorResponse(404, "Game not found");
          }

          const game = games[0];

          if (game.owner_id !== authenticatedUserId) {
            return errorResponse(403, "Forbidden: You can only update your own games");
          }

          const body: any = await req.json();

          const validation = GamePatchSchema.safeParse(body);
          if (!validation.success) {
            return errorResponse(400, validation.error.message);
          }

          const updates: any = { updatedAt: new Date() };

          if (validation.data.name !== undefined) {
            updates.name = validation.data.name;
          }
          if (validation.data.publisher !== undefined) {
            updates.publisher = validation.data.publisher;
          }
          if (validation.data.year !== undefined) {
            updates.year = validation.data.year;
          }
          if (validation.data.gamingSystem !== undefined) {
            updates.gaming_system = validation.data.gamingSystem;
          }
          if (validation.data.condition !== undefined) {
            updates.condition = validation.data.condition;
          }
          if (validation.data.previousOwners !== undefined) {
            updates.previous_owners = validation.data.previousOwners;
          }

          if (Object.keys(updates).length === 1) {
            return errorResponse(400, "No valid fields to update");
          }

          const updatedGames = await sql`
            UPDATE games
            SET ${sql(updates)}
            WHERE id = ${gameId}
            RETURNING *
          `;

          return Response.json(formatGameResponse(updatedGames[0]));
        } catch (error) {
          return errorResponse(400, "Invalid input");
        }
      },
      DELETE: (req) => {
        const authResult = requireAuth(req);
        if (authResult instanceof Response) return authResult;
        const authenticatedUserId = authResult;

        const gameId = parseInt(req.params.id);
        const games = await sql`SELECT * FROM games WHERE id = ${gameId}`;

        if (games.length === 0) {
          return errorResponse(404, "Game not found");
        }

        const game = games[0];

        if (game.owner_id !== authenticatedUserId) {
          return errorResponse(403, "Forbidden: You can only delete your own games");
        }

        await sql`DELETE FROM games WHERE id = ${gameId}`;
        return new Response(null, { status: 204 });
      },
    },
  },
});

console.log(`Running at http://localhost:${server.port}`);
