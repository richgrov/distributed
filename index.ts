import { sql } from "bun";
import jwt from "jsonwebtoken";
import {
  UserInputSchema,
  LoginInputSchema,
  GameInputSchema,
  UserPatchSchema,
  GamePatchSchema,
  TradeOfferInputSchema,
  TradeOfferUpdateSchema,
} from "./schemas";
import { publishEmailEvent } from "./kafka-producer";
import * as EmailTemplates from "./email-templates";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

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

await sql`
  CREATE TABLE IF NOT EXISTS trade_offers (
    id SERIAL PRIMARY KEY,
    requested_game_id INTEGER NOT NULL,
    offered_game_id INTEGER NOT NULL,
    offerer_id INTEGER NOT NULL,
    recipient_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    FOREIGN KEY (requested_game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (offered_game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (offerer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
  )
`;

function generateToken(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET!, { expiresIn: "7d" });
}

function authenticate(req: Request): number | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET!) as { userId: number };
    return decoded.userId;
  } catch (error) {
    return null;
  }
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

function createTradeOfferLinks(offerId: number, requestedGameId: number, offeredGameId: number, offererId: number, recipientId: number) {
  return {
    self: { href: `/offers/${offerId}` },
    requestedGame: { href: `/games/${requestedGameId}` },
    offeredGame: { href: `/games/${offeredGameId}` },
    offerer: { href: `/users/${offererId}` },
    recipient: { href: `/users/${recipientId}` },
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

function formatTradeOfferResponse(offer: any) {
  return {
    id: offer.id,
    requestedGameId: offer.requested_game_id,
    offeredGameId: offer.offered_game_id,
    offererId: offer.offerer_id,
    recipientId: offer.recipient_id,
    status: offer.status,
    createdAt: offer.created_at,
    updatedAt: offer.updated_at,
    _links: createTradeOfferLinks(offer.id, offer.requested_game_id, offer.offered_game_id, offer.offerer_id, offer.recipient_id),
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

          const token = generateToken(user.id);

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
      POST: () => {
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
          const emailBody = EmailTemplates.userWelcomeTemplate({ name: user.name, email: user.email });
          publishEmailEvent(user.email, "Welcome to VidEX!", emailBody);
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
          let passwordChanged = false;

          if (validation.data.name !== undefined) {
            updates.name = validation.data.name;
          }
          if (validation.data.streetAddress !== undefined) {
            updates.street_address = validation.data.streetAddress;
          }
          if (validation.data.password !== undefined) {
            updates.password = await Bun.password.hash(validation.data.password);
            passwordChanged = true;
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

          if (passwordChanged) {
            const emailBody = EmailTemplates.passwordChangedTemplate({ name: updatedUsers[0].name, email: updatedUsers[0].email });
            publishEmailEvent(updatedUsers[0].email, "Your VidEX password was changed", emailBody);
          }

          return Response.json(formatUserResponse(updatedUsers[0]));
        } catch (error) {
          return errorResponse(400, "Invalid input");
        }
      },
      DELETE: async (req) => {
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
          WHERE (${nameParam}::TEXT IS NULL OR name ILIKE ${nameParam})
            AND (${publisherParam}::TEXT IS NULL OR publisher = ${publisherParam})
            AND (${yearParam}::INTEGER IS NULL OR year = ${yearParam})
            AND (${gamingSystemParam}::TEXT IS NULL OR gaming_system = ${gamingSystemParam})
            AND (${conditionParam}::TEXT IS NULL OR condition = ${conditionParam})
            AND (${ownerIdParam}::INTEGER IS NULL OR owner_id = ${ownerIdParam})
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

          const updates: any = { updated_at: new Date() };

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
      DELETE: async (req) => {
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
    "/offers": {
      GET: async (req) => {
        const authResult = requireAuth(req);
        if (authResult instanceof Response) return authResult;

        const url = new URL(req.url);
        const params = url.searchParams;

        const statusParam = params.has("status") ? params.get("status") : null;
        const offererIdParam = params.has("offererId") ? parseInt(params.get("offererId")!) : null;
        const recipientIdParam = params.has("recipientId") ? parseInt(params.get("recipientId")!) : null;

        const offers = await sql`
          SELECT * FROM trade_offers
          WHERE (${statusParam}::TEXT IS NULL OR status = ${statusParam})
            AND (${offererIdParam}::INTEGER IS NULL OR offerer_id = ${offererIdParam})
            AND (${recipientIdParam}::INTEGER IS NULL OR recipient_id = ${recipientIdParam})
          ORDER BY created_at DESC
        `;

        return Response.json({
          offers: offers.map(formatTradeOfferResponse),
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

          const validation = TradeOfferInputSchema.safeParse(body);
          if (!validation.success) {
            return errorResponse(400, validation.error.message);
          }

          const { requestedGameId, offeredGameId } = validation.data;

          const requestedGames = await sql`SELECT * FROM games WHERE id = ${requestedGameId}`;
          if (requestedGames.length === 0) {
            return errorResponse(404, "Requested game not found");
          }
          const requestedGame = requestedGames[0];

          const offeredGames = await sql`SELECT * FROM games WHERE id = ${offeredGameId}`;
          if (offeredGames.length === 0) {
            return errorResponse(404, "Offered game not found");
          }
          const offeredGame = offeredGames[0];

          if (offeredGame.owner_id !== authenticatedUserId) {
            return errorResponse(403, "Forbidden: You can only offer games you own");
          }

          if (requestedGame.owner_id === authenticatedUserId) {
            return errorResponse(400, "Cannot create trade offer for your own game");
          }

          const now = new Date();

          const result = await sql`
            INSERT INTO trade_offers (requested_game_id, offered_game_id, offerer_id, recipient_id, status, created_at, updated_at)
            VALUES (${requestedGameId}, ${offeredGameId}, ${authenticatedUserId}, ${requestedGame.owner_id}, 'pending', ${now}, ${now})
            RETURNING *
          `;

          const offer = result[0];

          const offerers = await sql`SELECT name, email FROM users WHERE id = ${offer.offerer_id}`;
          const recipients = await sql`SELECT name, email FROM users WHERE id = ${offer.recipient_id}`;

          if (offerers.length > 0 && recipients.length > 0) {
            publishEmailEvent(
              recipients[0].email,
              "You've received a trade offer!",
              EmailTemplates.offerReceivedTemplate({
                recipientName: recipients[0].name,
                offererName: offerers[0].name,
                offeredGameName: offeredGame.name,
                offeredGameYear: offeredGame.year,
                requestedGameName: requestedGame.name,
                requestedGameYear: requestedGame.year,
              })
            );

            publishEmailEvent(
              offerers[0].email,
              "Your trade offer has been sent!",
              EmailTemplates.offerCreatedConfirmationTemplate({
                offererName: offerers[0].name,
                recipientName: recipients[0].name,
                offeredGameName: offeredGame.name,
                offeredGameYear: offeredGame.year,
                requestedGameName: requestedGame.name,
                requestedGameYear: requestedGame.year,
              })
            );
          }

          return Response.json(formatTradeOfferResponse(offer), { status: 201 });
        } catch (error) {
          return errorResponse(400, "Invalid input");
        }
      },
    },
    "/offers/:id": {
      GET: async (req) => {
        const authResult = requireAuth(req);
        if (authResult instanceof Response) return authResult;

        const offerId = parseInt(req.params.id);
        const offers = await sql`SELECT * FROM trade_offers WHERE id = ${offerId}`;

        if (offers.length === 0) {
          return errorResponse(404, "Trade offer not found");
        }

        return Response.json(formatTradeOfferResponse(offers[0]));
      },
      PATCH: async (req) => {
        const authResult = requireAuth(req);
        if (authResult instanceof Response) return authResult;
        const authenticatedUserId = authResult;

        try {
          const offerId = parseInt(req.params.id);
          const offers = await sql`SELECT * FROM trade_offers WHERE id = ${offerId}`;

          if (offers.length === 0) {
            return errorResponse(404, "Trade offer not found");
          }

          const offer = offers[0];

          if (offer.recipient_id !== authenticatedUserId) {
            return errorResponse(403, "Forbidden: Only the recipient can update this offer");
          }

          if (offer.status !== "pending") {
            return errorResponse(400, "Only pending offers can be updated");
          }

          const body: any = await req.json();

          const validation = TradeOfferUpdateSchema.safeParse(body);
          if (!validation.success) {
            return errorResponse(400, validation.error.message);
          }

          const { status } = validation.data;
          const now = new Date();

          const updatedOffer = (await sql`
            UPDATE trade_offers
            SET status = ${status}, updated_at = ${now}
            WHERE id = ${offerId}
            RETURNING *
          `)[0];

          const offerers = await sql`SELECT name, email FROM users WHERE id = ${updatedOffer.offerer_id}`;
          const recipients = await sql`SELECT name, email FROM users WHERE id = ${updatedOffer.recipient_id}`;
          const requestedGames = await sql`SELECT name, year FROM games WHERE id = ${updatedOffer.requested_game_id}`;
          const offeredGames = await sql`SELECT name, year FROM games WHERE id = ${updatedOffer.offered_game_id}`;

          if (updatedOffer.status === "accepted") {
            if (offerers.length > 0 && recipients.length > 0 && requestedGames.length > 0 && offeredGames.length > 0) {
              publishEmailEvent(
                offerers[0].email,
                "Your trade offer was accepted!",
                EmailTemplates.offerAcceptedTemplate({
                  offererName: offerers[0].name,
                  recipientName: recipients[0].name,
                  offeredGameName: offeredGames[0].name,
                  offeredGameYear: offeredGames[0].year,
                  requestedGameName: requestedGames[0].name,
                  requestedGameYear: requestedGames[0].year,
                })
              );

              publishEmailEvent(
                recipients[0].email,
                "You accepted a trade offer!",
                EmailTemplates.offerAcceptedRecipientTemplate({
                  recipientName: recipients[0].name,
                  offererName: offerers[0].name,
                  offeredGameName: offeredGames[0].name,
                  offeredGameYear: offeredGames[0].year,
                  requestedGameName: requestedGames[0].name,
                  requestedGameYear: requestedGames[0].year,
                })
              );
            }
          } else if (updatedOffer.status === "rejected") {
            if (offerers.length > 0 && recipients.length > 0 && requestedGames.length > 0 && offeredGames.length > 0) {
              publishEmailEvent(
                offerers[0].email,
                "Your trade offer was declined",
                EmailTemplates.offerRejectedTemplate({
                  offererName: offerers[0].name,
                  recipientName: recipients[0].name,
                  offeredGameName: offeredGames[0].name,
                  offeredGameYear: offeredGames[0].year,
                  requestedGameName: requestedGames[0].name,
                  requestedGameYear: requestedGames[0].year,
                })
              );

              publishEmailEvent(
                recipients[0].email,
                "You declined a trade offer",
                EmailTemplates.offerRejectedRecipientTemplate({
                  recipientName: recipients[0].name,
                  offererName: offerers[0].name,
                  offeredGameName: offeredGames[0].name,
                  offeredGameYear: offeredGames[0].year,
                  requestedGameName: requestedGames[0].name,
                  requestedGameYear: requestedGames[0].year,
                })
              );
            }
          }

          return Response.json(formatTradeOfferResponse(updatedOffer));
        } catch (error) {
          return errorResponse(400, "Invalid input");
        }
      },
    },
  },
});

console.log(`Running at http://localhost:${server.port}`);
