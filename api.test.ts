// Generated with the help of Claude Code

import { describe, test, expect, beforeAll } from "bun:test";

const BASE_URL = "http://localhost:3001";

interface TestContext {
	user1Token: string;
	user1Id: number;
	user2Token: string;
	user2Id: number;
	game1Id: number;
	game2Id: number;
}

async function makeRequest(
	method: string,
	path: string,
	options?: { body?: any; token?: string }
) {
	const headers: any = { "Content-Type": "application/json" };
	if (options?.token) {
		headers["Authorization"] = `Bearer ${options.token}`;
	}

	const config: RequestInit = {
		method,
		headers,
	};

	if (options?.body) {
		config.body = JSON.stringify(options.body);
	}

	const response = await fetch(`${BASE_URL}${path}`, config);
	let body;
	const text = await response.text();
	body = text ? JSON.parse(text) : null;

	return { response, body };
}

describe("Video Game Exchange API", () => {
	let ctx: Partial<TestContext> = {};

	describe("User Registration", () => {
		test("should allow user registration with valid data", async () => {
			const userData = {
				name: "Alice Johnson",
				email: `alice-${Date.now()}@example.com`,
				password: "password123",
				streetAddress: "123 Main St, Springfield, IL",
			};

			const { response, body } = await makeRequest("POST", "/users", {
				body: userData,
			});

			expect(response.status).toBe(201);
			expect(body.id).toBeDefined();
			expect(body.name).toBe(userData.name);
			expect(body.email).toBe(userData.email);
			expect(body.streetAddress).toBe(userData.streetAddress);
			expect(body.password).toBeUndefined();
			expect(body._links).toBeDefined();
			expect(body._links.self).toBeDefined();
			expect(body._links.games).toBeDefined();

			ctx.user1Id = body.id;
			ctx.user1Token = ""; // Will be set after login
		});

		test("should reject duplicate email registration", async () => {
			const duplicateUser = {
				name: "Bob Smith",
				email: `bob-duplicate-${Date.now()}@example.com`,
				password: "password456",
				streetAddress: "456 Oak Ave, Chicago, IL",
			};

			// First registration
			await makeRequest("POST", "/users", { body: duplicateUser });

			// Duplicate registration
			const { response, body } = await makeRequest("POST", "/users", {
				body: duplicateUser,
			});

			expect(response.status).toBe(409);
			expect(body.message).toBeDefined();
		});
	});

	describe("Authentication", () => {
		let testEmail: string;
		let testPassword: string;
		let testUserId: number;

		beforeAll(async () => {
			testEmail = `auth-test-${Date.now()}@example.com`;
			testPassword = "testpass123";

			const { body } = await makeRequest("POST", "/users", {
				body: {
					name: "Auth Test User",
					email: testEmail,
					password: testPassword,
					streetAddress: "123 Test St",
				},
			});

			testUserId = body.id;
		});

		test("should login with valid credentials", async () => {
			const { response, body } = await makeRequest("POST", "/auth/login", {
				body: { email: testEmail, password: testPassword },
			});

			expect(response.status).toBe(200);
			expect(body.token).toBeDefined();
			expect(body.userId).toBe(testUserId);
			expect(body._links).toBeDefined();
			expect(body._links.user).toBeDefined();
		});

		test("should reject invalid credentials", async () => {
			const { response, body } = await makeRequest("POST", "/auth/login", {
				body: { email: testEmail, password: "wrongpassword" },
			});

			expect(response.status).toBe(401);
			expect(body.message).toContain("Invalid");
		});

		test("should block unauthenticated access to protected routes", async () => {
			const { response, body } = await makeRequest("GET", "/games");

			expect(response.status).toBe(401);
			expect(body.message).toContain("Unauthorized");
		});
	});

	describe("Game Management", () => {
		let userToken: string;
		let userId: number;
		let gameId: number;

		beforeAll(async () => {
			const email = `game-mgmt-${Date.now()}@example.com`;
			const { body: userBody } = await makeRequest("POST", "/users", {
				body: {
					name: "Game Manager",
					email,
					password: "pass123",
					streetAddress: "456 Game St",
				},
			});
			userId = userBody.id;

			const { body: loginBody } = await makeRequest("POST", "/auth/login", {
				body: { email, password: "pass123" },
			});
			userToken = loginBody.token;
		});

		test("should create game with all fields", async () => {
			const gameData = {
				name: "Super Mario Bros.",
				publisher: "Nintendo",
				year: 1985,
				gamingSystem: "NES",
				condition: "good",
				previousOwners: 2,
			};

			const { response, body } = await makeRequest("POST", "/games", {
				body: gameData,
				token: userToken,
			});

			expect(response.status).toBe(201);
			expect(body.id).toBeDefined();
			expect(body.ownerId).toBe(userId);
			expect(body.name).toBe(gameData.name);
			expect(body.previousOwners).toBe(2);
			expect(body._links).toBeDefined();
			expect(body._links.self).toBeDefined();
			expect(body._links.owner).toBeDefined();

			gameId = body.id;
		});

		test("should create game without optional previousOwners", async () => {
			const gameData = {
				name: "The Legend of Zelda",
				publisher: "Nintendo",
				year: 1986,
				gamingSystem: "NES",
				condition: "mint",
			};

			const { response, body } = await makeRequest("POST", "/games", {
				body: gameData,
				token: userToken,
			});

			expect(response.status).toBe(201);
			expect(body.previousOwners).toBeNull();
		});

		test("should reject invalid game condition", async () => {
			const invalidGame = {
				name: "Sonic the Hedgehog",
				publisher: "Sega",
				year: 1991,
				gamingSystem: "Genesis",
				condition: "excellent",
			};

			const { response, body } = await makeRequest("POST", "/games", {
				body: invalidGame,
				token: userToken,
			});

			expect(response.status).toBe(400);
			expect(body.message).toBeDefined();
		});

		test("should get specific game by id", async () => {
			const { response, body } = await makeRequest("GET", `/games/${gameId}`, {
				token: userToken,
			});

			expect(response.status).toBe(200);
			expect(body.id).toBe(gameId);
			expect(body._links).toBeDefined();
		});

		test("should update own game with PATCH", async () => {
			const updates = {
				condition: "fair",
				previousOwners: 3,
			};

			const { response, body } = await makeRequest("PATCH", `/games/${gameId}`, {
				body: updates,
				token: userToken,
			});

			expect(response.status).toBe(200);
			expect(body.condition).toBe("fair");
			expect(body.previousOwners).toBe(3);
		});

		test("should replace entire game with PUT", async () => {
			const replacement = {
				name: "Super Mario Bros. 3",
				publisher: "Nintendo",
				year: 1988,
				gamingSystem: "NES",
				condition: "mint",
				previousOwners: 1,
			};

			const { response, body } = await makeRequest("PUT", `/games/${gameId}`, {
				body: replacement,
				token: userToken,
			});

			expect(response.status).toBe(200);
			expect(body.name).toBe(replacement.name);
			expect(body.year).toBe(replacement.year);
		});

		test("should delete own game", async () => {
			const { response } = await makeRequest("DELETE", `/games/${gameId}`, {
				token: userToken,
			});

			expect(response.status).toBe(204);
		});

		test("should return 404 for deleted game", async () => {
			const { response } = await makeRequest("GET", `/games/${gameId}`, {
				token: userToken,
			});

			expect(response.status).toBe(404);
		});
	});

	describe("Game Search", () => {
		let userToken: string;

		beforeAll(async () => {
			const email = `search-${Date.now()}@example.com`;
			const { body: userBody } = await makeRequest("POST", "/users", {
				body: {
					name: "Search Tester",
					email,
					password: "pass123",
					streetAddress: "789 Search St",
				},
			});

			const { body: loginBody } = await makeRequest("POST", "/auth/login", {
				body: { email, password: "pass123" },
			});
			userToken = loginBody.token;

			// Create games for searching
			await makeRequest("POST", "/games", {
				body: {
					name: "Metroid",
					publisher: "Nintendo",
					year: 1986,
					gamingSystem: "NES",
					condition: "good",
				},
				token: userToken,
			});

			await makeRequest("POST", "/games", {
				body: {
					name: "Castlevania",
					publisher: "Konami",
					year: 1986,
					gamingSystem: "NES",
					condition: "fair",
				},
				token: userToken,
			});
		});

		test("should search games by name", async () => {
			const { response, body } = await makeRequest("GET", "/games?name=Metroid", {
				token: userToken,
			});

			expect(response.status).toBe(200);
			expect(Array.isArray(body.games)).toBe(true);
			expect(body.games.length).toBeGreaterThan(0);
			expect(body._links).toBeDefined();
			expect(body._links.self).toBeDefined();
		});

		test("should search games by multiple criteria", async () => {
			const { response, body } = await makeRequest(
				"GET",
				"/games?gamingSystem=NES&condition=good",
				{ token: userToken }
			);

			expect(response.status).toBe(200);
			expect(Array.isArray(body.games)).toBe(true);
		});

		test("should search games by owner", async () => {
			const { response, body } = await makeRequest("GET", "/games", {
				token: userToken,
			});

			expect(response.status).toBe(200);
			expect(Array.isArray(body.games)).toBe(true);
		});
	});

	describe("Authorization & Multi-User", () => {
		let user1Token: string;
		let user2Token: string;
		let user2Id: number;
		let user2GameId: number;

		beforeAll(async () => {
			// Create user 1
			const email1 = `multi1-${Date.now()}@example.com`;
			const { body: user1Body } = await makeRequest("POST", "/users", {
				body: {
					name: "User One",
					email: email1,
					password: "pass123",
					streetAddress: "111 First St",
				},
			});

			const { body: login1 } = await makeRequest("POST", "/auth/login", {
				body: { email: email1, password: "pass123" },
			});
			user1Token = login1.token;

			// Create user 2
			const email2 = `multi2-${Date.now()}@example.com`;
			const { body: user2Body } = await makeRequest("POST", "/users", {
				body: {
					name: "User Two",
					email: email2,
					password: "pass456",
					streetAddress: "222 Second St",
				},
			});
			user2Id = user2Body.id;

			const { body: login2 } = await makeRequest("POST", "/auth/login", {
				body: { email: email2, password: "pass456" },
			});
			user2Token = login2.token;

			// Create a game for user 2
			const { body: gameBody } = await makeRequest("POST", "/games", {
				body: {
					name: "Contra",
					publisher: "Konami",
					year: 1987,
					gamingSystem: "NES",
					condition: "good",
				},
				token: user2Token,
			});
			user2GameId = gameBody.id;
		});

		test("should prevent non-owner from updating game", async () => {
			const updates = { condition: "poor" };

			const { response } = await makeRequest("PATCH", `/games/${user2GameId}`, {
				body: updates,
				token: user1Token,
			});

			expect(response.status).toBe(403);
		});

		test("should prevent non-owner from deleting game", async () => {
			const { response } = await makeRequest("DELETE", `/games/${user2GameId}`, {
				token: user1Token,
			});

			expect(response.status).toBe(403);
		});

		test("should allow authenticated users to search any games", async () => {
			const { response, body } = await makeRequest(
				"GET",
				`/games?ownerId=${user2Id}`,
				{ token: user1Token }
			);

			expect(response.status).toBe(200);
			expect(body.games.length).toBeGreaterThan(0);
		});
	});

	describe("User Profile Management", () => {
		let user1Token: string;
		let user1Id: number;
		let user2Token: string;

		beforeAll(async () => {
			// Create user 1
			const email1 = `profile1-${Date.now()}@example.com`;
			const { body: user1Body } = await makeRequest("POST", "/users", {
				body: {
					name: "Profile User 1",
					email: email1,
					password: "pass123",
					streetAddress: "111 Profile St",
				},
			});
			user1Id = user1Body.id;

			const { body: login1 } = await makeRequest("POST", "/auth/login", {
				body: { email: email1, password: "pass123" },
			});
			user1Token = login1.token;

			// Create user 2
			const email2 = `profile2-${Date.now()}@example.com`;
			await makeRequest("POST", "/users", {
				body: {
					name: "Profile User 2",
					email: email2,
					password: "pass456",
					streetAddress: "222 Profile St",
				},
			});

			const { body: login2 } = await makeRequest("POST", "/auth/login", {
				body: { email: email2, password: "pass456" },
			});
			user2Token = login2.token;
		});

		test("should update own user profile", async () => {
			const updates = {
				name: "Updated Name",
				streetAddress: "999 New Address Ln",
			};

			const { response, body } = await makeRequest("PATCH", `/users/${user1Id}`, {
				body: updates,
				token: user1Token,
			});

			expect(response.status).toBe(200);
			expect(body.name).toBe(updates.name);
			expect(body.streetAddress).toBe(updates.streetAddress);
			expect(body._links).toBeDefined();
		});

		test("should prevent updating another user's profile", async () => {
			const updates = { name: "Hacker" };

			const { response } = await makeRequest("PATCH", `/users/${user1Id}`, {
				body: updates,
				token: user2Token,
			});

			expect(response.status).toBe(403);
		});

		test("should get user by id", async () => {
			const { response, body } = await makeRequest("GET", `/users/${user1Id}`, {
				token: user1Token,
			});

			expect(response.status).toBe(200);
			expect(body.id).toBe(user1Id);
			expect(body._links).toBeDefined();
		});
	});

	describe("Session Management", () => {
		let token: string;

		beforeAll(async () => {
			const email = `session-${Date.now()}@example.com`;
			await makeRequest("POST", "/users", {
				body: {
					name: "Session Tester",
					email,
					password: "pass123",
					streetAddress: "Session St",
				},
			});

			const { body } = await makeRequest("POST", "/auth/login", {
				body: { email, password: "pass123" },
			});
			token = body.token;
		});

		test("should logout successfully", async () => {
			const { response, body } = await makeRequest("POST", "/auth/logout", {
				token,
			});

			expect(response.status).toBe(200);
			expect(body.message).toContain("Logged out");
		});
	});

	describe("HATEOAS Compliance", () => {
		let token: string;
		let userId: number;
		let gameId: number;

		beforeAll(async () => {
			const email = `hateoas-${Date.now()}@example.com`;
			const { body: userBody } = await makeRequest("POST", "/users", {
				body: {
					name: "HATEOAS Tester",
					email,
					password: "pass123",
					streetAddress: "HATEOAS St",
				},
			});
			userId = userBody.id;

			const { body: loginBody } = await makeRequest("POST", "/auth/login", {
				body: { email, password: "pass123" },
			});
			token = loginBody.token;

			const { body: gameBody } = await makeRequest("POST", "/games", {
				body: {
					name: "Test Game",
					publisher: "Test Pub",
					year: 2000,
					gamingSystem: "Test System",
					condition: "mint",
				},
				token,
			});
			gameId = gameBody.id;
		});

		test("user responses include proper HATEOAS links", async () => {
			const { body } = await makeRequest("GET", `/users/${userId}`, { token });

			expect(body._links).toBeDefined();
			expect(body._links.self).toBeDefined();
			expect(body._links.self.href).toBe(`/users/${userId}`);
			expect(body._links.games).toBeDefined();
			expect(body._links.games.href).toBe(`/games?ownerId=${userId}`);
		});

		test("game responses include proper HATEOAS links", async () => {
			const { body } = await makeRequest("GET", `/games/${gameId}`, { token });

			expect(body._links).toBeDefined();
			expect(body._links.self).toBeDefined();
			expect(body._links.self.href).toBe(`/games/${gameId}`);
			expect(body._links.owner).toBeDefined();
			expect(body._links.owner.href).toBe(`/users/${userId}`);
		});

		test("login responses include HATEOAS links", async () => {
			const email = `login-hateoas-${Date.now()}@example.com`;
			await makeRequest("POST", "/users", {
				body: {
					name: "Login HATEOAS",
					email,
					password: "pass123",
					streetAddress: "Login St",
				},
			});

			const { body } = await makeRequest("POST", "/auth/login", {
				body: { email, password: "pass123" },
			});

			expect(body._links).toBeDefined();
			expect(body._links.self).toBeDefined();
			expect(body._links.user).toBeDefined();
		});

		test("search responses include HATEOAS links", async () => {
			const { body } = await makeRequest("GET", "/games?name=Test", { token });

			expect(body._links).toBeDefined();
			expect(body._links.self).toBeDefined();
			expect(body._links.self.href).toContain("/games");
		});
	});

	describe("Assignment: Multi-Node Deployment & Load Balancing", () => {
		test("NGINX container routes requests to API services", async () => {
			const { response } = await makeRequest("POST", "/users", {
				body: {
					name: "Load Balancer Test",
					email: `loadbalancer-${Date.now()}@example.com`,
					password: "test123",
					streetAddress: "123 Test St",
				},
			});

			expect(response.status).toBe(201);
		});

		test("Database persists data across API instances", async () => {
			const email = `persist-test-${Date.now()}@example.com`;

			const { body: user } = await makeRequest("POST", "/users", {
				body: {
					name: "Persistence Test",
					email,
					password: "test123",
					streetAddress: "123 Persist St",
				},
			});

			const { response: loginResponse, body: loginBody } = await makeRequest("POST", "/auth/login", {
				body: { email, password: "test123" },
			});

			expect(loginResponse.status).toBe(200);
			expect(loginBody.userId).toBe(user.id);
		});
	});

	describe("Assignment: Trade Offers Feature", () => {
		let user1Token: string;
		let user1Id: number;
		let user2Token: string;
		let user2Id: number;
		let user1GameId: number;
		let user2GameId: number;

		beforeAll(async () => {
			const email1 = `trade-user1-${Date.now()}@example.com`;
			const { body: user1Body } = await makeRequest("POST", "/users", {
				body: {
					name: "Trade User 1",
					email: email1,
					password: "pass123",
					streetAddress: "111 Trade St",
				},
			});
			user1Id = user1Body.id;

			const { body: login1 } = await makeRequest("POST", "/auth/login", {
				body: { email: email1, password: "pass123" },
			});
			user1Token = login1.token;

			const email2 = `trade-user2-${Date.now()}@example.com`;
			const { body: user2Body } = await makeRequest("POST", "/users", {
				body: {
					name: "Trade User 2",
					email: email2,
					password: "pass456",
					streetAddress: "222 Trade St",
				},
			});
			user2Id = user2Body.id;

			const { body: login2 } = await makeRequest("POST", "/auth/login", {
				body: { email: email2, password: "pass456" },
			});
			user2Token = login2.token;

			const { body: game1Body } = await makeRequest("POST", "/games", {
				body: {
					name: "Zelda",
					publisher: "Nintendo",
					year: 1986,
					gamingSystem: "NES",
					condition: "mint",
				},
				token: user1Token,
			});
			user1GameId = game1Body.id;

			const { body: game2Body } = await makeRequest("POST", "/games", {
				body: {
					name: "Metroid",
					publisher: "Nintendo",
					year: 1986,
					gamingSystem: "NES",
					condition: "good",
				},
				token: user2Token,
			});
			user2GameId = game2Body.id;
		});

		test("users can browse games owned by others", async () => {
			const { response, body } = await makeRequest("GET", `/games?ownerId=${user2Id}`, {
				token: user1Token,
			});

			expect(response.status).toBe(200);
			expect(body.games.length).toBeGreaterThan(0);
			expect(body.games[0].ownerId).toBe(user2Id);
		});

		test("user can create trade offer for another user's game", async () => {
			const { response, body } = await makeRequest("POST", "/offers", {
				body: {
					requestedGameId: user2GameId,
					offeredGameId: user1GameId,
				},
				token: user1Token,
			});

			expect(response.status).toBe(201);
			expect(body.requestedGameId).toBe(user2GameId);
			expect(body.offeredGameId).toBe(user1GameId);
			expect(body.offererId).toBe(user1Id);
			expect(body.recipientId).toBe(user2Id);
			expect(body.status).toBe("pending");
		});

		test("game owner can view incoming offers", async () => {
			const { body: offer } = await makeRequest("POST", "/offers", {
				body: {
					requestedGameId: user2GameId,
					offeredGameId: user1GameId,
				},
				token: user1Token,
			});

			const { response, body } = await makeRequest("GET", `/offers?recipientId=${user2Id}`, {
				token: user2Token,
			});

			expect(response.status).toBe(200);
			expect(body.offers.length).toBeGreaterThan(0);
			expect(body.offers.some((o: any) => o.id === offer.id)).toBe(true);
		});

		test("game owner can accept trade offer", async () => {
			const { body: offer } = await makeRequest("POST", "/offers", {
				body: {
					requestedGameId: user2GameId,
					offeredGameId: user1GameId,
				},
				token: user1Token,
			});

			const { response, body } = await makeRequest("PATCH", `/offers/${offer.id}`, {
				body: { status: "accepted" },
				token: user2Token,
			});

			expect(response.status).toBe(200);
			expect(body.status).toBe("accepted");
		});

		test("game owner can reject trade offer", async () => {
			const { body: offer } = await makeRequest("POST", "/offers", {
				body: {
					requestedGameId: user2GameId,
					offeredGameId: user1GameId,
				},
				token: user1Token,
			});

			const { response, body } = await makeRequest("PATCH", `/offers/${offer.id}`, {
				body: { status: "rejected" },
				token: user2Token,
			});

			expect(response.status).toBe(200);
			expect(body.status).toBe("rejected");
		});

		test("offers can be retrieved by status", async () => {
			const { body: offer } = await makeRequest("POST", "/offers", {
				body: {
					requestedGameId: user2GameId,
					offeredGameId: user1GameId,
				},
				token: user1Token,
			});

			await makeRequest("PATCH", `/offers/${offer.id}`, {
				body: { status: "accepted" },
				token: user2Token,
			});

			const { response, body } = await makeRequest("GET", "/offers?status=accepted", {
				token: user1Token,
			});

			expect(response.status).toBe(200);
			expect(body.offers.every((o: any) => o.status === "accepted")).toBe(true);
		});

		test("EXTRA CREDIT: only authorized recipient can update offer", async () => {
			const { body: offer } = await makeRequest("POST", "/offers", {
				body: {
					requestedGameId: user2GameId,
					offeredGameId: user1GameId,
				},
				token: user1Token,
			});

			const { response } = await makeRequest("PATCH", `/offers/${offer.id}`, {
				body: { status: "accepted" },
				token: user1Token,
			});

			expect(response.status).toBe(403);
		});

		test("only authenticated users can create trade offers", async () => {
			const { response } = await makeRequest("POST", "/offers", {
				body: {
					requestedGameId: user2GameId,
					offeredGameId: user1GameId,
				},
			});

			expect(response.status).toBe(401);
		});

		test("only authenticated users can respond to trade offers", async () => {
			const { body: offer } = await makeRequest("POST", "/offers", {
				body: {
					requestedGameId: user2GameId,
					offeredGameId: user1GameId,
				},
				token: user1Token,
			});

			const { response } = await makeRequest("PATCH", `/offers/${offer.id}`, {
				body: { status: "accepted" },
			});

			expect(response.status).toBe(401);
		});
	});
});
