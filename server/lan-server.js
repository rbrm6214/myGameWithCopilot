import http from 'node:http';
import os from 'node:os';
import { createGameState, stepGame } from '../src/game/core/GameSimulation.js';

const PORT = 3010;
const TICK_MS = 120;
const FULL_TICK_MS = 50;   // ~20 fps for full mode server simulation
const WORLD_WIDTH = 48;
const WORLD_HEIGHT = 30;
const START_LENGTH = 6;
const MAX_FOOD = 3;

const connections = new Set();
const lastInputs = new Map();

// Full-mode simulation state (only active when gameMode === 'full')
const fullMatch = {
    active: false,
    tick: 0,
    stateNonce: 0,
    timer: null,
    simState: null,       // GameState from createGameState()
    idToConnection: {}    // snakeId -> ownerConnectionId
};

const lobby = {
    hostConnectionId: null,
    maxPlayers: 4,
    fillWithBots: false,
    gameMode: 'light',
    botDifficulty: 5,
    players: [],
    chatMessages: [],
    serverIp: getPrimaryLocalIp(),
    statusMessage: 'En attente du host...',
    matchPayload: null,
    matchNonce: 0
};

const match = {
    active: false,
    tick: 0,
    startedAt: 0,
    players: [],
    food: [],
    winnerName: null,
    timer: null,
    stateNonce: 0
};

const httpServer = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

    if (request.method === 'OPTIONS')
    {
        writeJson(response, 200, { ok: true });
        return;
    }

    try
    {
        if (request.method === 'GET' && url.pathname === '/api/network-info')
        {
            writeJson(response, 200, { ip: getPrimaryLocalIp(), port: PORT, serverAvailable: true });
            return;
        }

        if (request.method === 'POST' && url.pathname === '/api/connect')
        {
            const connectionId = `peer-${Math.random().toString(36).slice(2, 10)}`;
            connections.add(connectionId);
            writeJson(response, 200, { connectionId });
            return;
        }

        if (request.method === 'GET' && url.pathname === '/api/state')
        {
            const connectionId = url.searchParams.get('connectionId');
            writeJson(response, 200, {
                connectionId,
                lobbyState: buildLobbyState(),
                matchPayload: lobby.matchPayload,
                matchNonce: lobby.matchNonce,
                matchState: lobby.gameMode === 'full' ? buildFullMatchState() : buildMatchState(),
                connectionView: buildConnectionView(connectionId)
            });
            return;
        }

        const body = request.method === 'POST' ? await readJsonBody(request) : {};

        if (request.method === 'POST' && url.pathname === '/api/create-lobby')
        {
            createLobby(body.connectionId, body.config || {});
            writeJson(response, 200, { ok: true });
            return;
        }

        if (request.method === 'POST' && url.pathname === '/api/join-lobby')
        {
            joinLobby(body.connectionId, body.config || {});
            writeJson(response, 200, { ok: true });
            return;
        }

        if (request.method === 'POST' && url.pathname === '/api/update-options')
        {
            updateOptions(body.connectionId, body.options || {});
            writeJson(response, 200, { ok: true });
            return;
        }

        if (request.method === 'POST' && url.pathname === '/api/chat')
        {
            addChatMessage(body.connectionId, body.message || '');
            writeJson(response, 200, { ok: true });
            return;
        }

        if (request.method === 'POST' && url.pathname === '/api/start-match')
        {
            startMatch(body.connectionId);
            writeJson(response, 200, { ok: true });
            return;
        }

        if (request.method === 'POST' && url.pathname === '/api/input')
        {
            applyInput(body.connectionId, body.inputProfile, body.direction);
            writeJson(response, 200, { ok: true });
            return;
        }

        if (request.method === 'POST' && url.pathname === '/api/disconnect')
        {
            disconnect(body.connectionId);
            writeJson(response, 200, { ok: true });
            return;
        }

        writeJson(response, 404, { message: 'Route inconnue.' });
    }
    catch (error)
    {
        writeJson(response, 400, { message: error.message || 'Erreur serveur.' });
    }
});

httpServer.listen(PORT, () => {
    console.log(`LAN server ready on http://${getPrimaryLocalIp()}:${PORT}`);
});

function createLobby (connectionId, payload)
{
    ensureConnection(connectionId);
    resetMatch();
    lobby.hostConnectionId = connectionId;
    lobby.maxPlayers = clampInteger(payload.maxPlayers, Math.max(1, payload.humanPlayers?.length || 1), 100, 4);
    lobby.fillWithBots = false;
    lobby.gameMode = payload.gameMode === 'full' ? 'full' : 'light';
    lobby.botDifficulty = 5;
    lobby.chatMessages = [];
    lobby.players = buildHumanPlayers(payload.humanPlayers || [], connectionId, true);
    lobby.serverIp = payload.network?.serverIp || getPrimaryLocalIp();
    lobby.statusMessage = 'Lobby cree. En attente des joueurs distants...';
    lobby.matchPayload = null;
}

function joinLobby (connectionId, payload)
{
    ensureConnection(connectionId);

    if (!lobby.hostConnectionId)
    {
        throw new Error('Aucun lobby disponible sur ce serveur.');
    }

    const incomingPlayers = buildHumanPlayers(payload.humanPlayers || [], connectionId, false);
    const availableSlots = Math.max(0, lobby.maxPlayers - lobby.players.length);
    if (incomingPlayers.length > availableSlots)
    {
        throw new Error(`Pas assez de places (${availableSlots} restantes).`);
    }

    lobby.players = lobby.players.filter((player) => player.ownerConnectionId !== connectionId).concat(incomingPlayers);
    lobby.statusMessage = 'Un joueur distant a rejoint le lobby.';
}

function updateOptions (connectionId, payload)
{
    if (connectionId !== lobby.hostConnectionId)
    {
        return;
    }

    lobby.fillWithBots = Boolean(payload.fillWithBots);
    if (payload.gameMode === 'light' || payload.gameMode === 'full')
    {
        lobby.gameMode = payload.gameMode;
    }
    lobby.botDifficulty = clampInteger(payload.botDifficulty, 1, 10, 5);
    lobby.statusMessage = 'Options du lobby mises a jour.';
}

function addChatMessage (connectionId, message)
{
    const trimmed = String(message || '').trim();
    if (!trimmed)
    {
        return;
    }

    const author = lobby.players.find((player) => player.ownerConnectionId === connectionId)?.name || 'Inconnu';
    lobby.chatMessages.push({ author, message: trimmed.slice(0, 140) });
    lobby.chatMessages = lobby.chatMessages.slice(-24);
}

function startMatch (connectionId)
{
    if (connectionId !== lobby.hostConnectionId)
    {
        return;
    }

    const roster = buildRoster();
    lobby.matchPayload = {
        serverIp: lobby.serverIp,
        gameMode: lobby.gameMode,
        maxPlayers: lobby.maxPlayers,
        fillWithBots: lobby.fillWithBots,
        botDifficulty: lobby.botDifficulty,
        roster
    };
    lobby.matchNonce += 1;
    lobby.statusMessage = 'La partie est lancee.';

    if (lobby.gameMode === 'full')
    {
        createFullMatchState();
        startFullTickLoop();
    }
    else
    {
        createMatchStateFromRoster(roster);
        startTickLoop();
    }
}

function buildRoster ()
{
    const roster = lobby.players.map((player) => ({
        id: player.id,
        name: player.name,
        snakeColorIndex: player.snakeColorIndex,
        input: player.input,
        color: player.color,
        kind: 'human',
        ownerConnectionId: player.ownerConnectionId
    }));

    const missingPlayers = Math.max(0, lobby.maxPlayers - roster.length);
    if (lobby.fillWithBots)
    {
        for (let index = 0; index < missingPlayers; index++)
        {
            roster.push({
                id: `bot-${index + 1}`,
                name: `Bot ${index + 1}`,
                snakeColorIndex: (roster.length + index) % 100,
                kind: 'bot',
                botLevel: lobby.botDifficulty,
                color: snakeColorFromIndex((roster.length + index) % 100)
            });
        }
    }

    return roster;
}

function createMatchStateFromRoster (roster)
{
    resetMatch();
    match.active = true;
    match.startedAt = Date.now();
    match.tick = 0;

    const spawnRows = [4, 10, 16, 22, 26];
    match.players = roster.map((player, index) => {
        const fromLeft = index % 2 === 0;
        const spawnY = spawnRows[index % spawnRows.length];
        const startX = fromLeft ? 6 : WORLD_WIDTH - 7;
        const direction = fromLeft ? { x: 1, y: 0 } : { x: -1, y: 0 };
        const segments = [];
        for (let i = 0; i < START_LENGTH; i++)
        {
            segments.push({
                x: startX - (direction.x * i),
                y: spawnY
            });
        }

        return {
            id: player.id,
            name: player.name,
            ownerConnectionId: player.ownerConnectionId || null,
            input: player.input || null,
            kind: player.kind,
            botLevel: player.botLevel || 0,
            color: Number.isFinite(player.color) ? player.color : snakeColorFromIndex(player.snakeColorIndex || index),
            alive: true,
            score: 0,
            direction,
            nextDirection: direction,
            segments,
            grow: 0
        };
    });

    match.food = [];
    for (let i = 0; i < MAX_FOOD; i++)
    {
        spawnFood();
    }
}

// ---------------------------------------------------------------------------
// Full mode — GameSimulation engine
// ---------------------------------------------------------------------------

function buildFullGameSetup ()
{
    const maxSnakes = lobby.fillWithBots
        ? Math.max(lobby.players.length, lobby.maxPlayers)
        : lobby.players.length;

    const humanPlayers = lobby.players.map((player, index) => ({
        id: player.id,
        name: player.name,
        snakeColorIndex: player.snakeColorIndex != null ? player.snakeColorIndex : index,
        input: player.input || 'keyboard-arrows',
        isLocal: false,
        isPlayerControlled: true,
        playerSlot: index,
        power: 'sans'
    }));

    return {
        maxSnakes,
        humanPlayers,
        botSettings: {
            extraBotDefaultLevel: lobby.botDifficulty,
            defaultLevel: lobby.botDifficulty,
            levelsBySnake: []
        },
        gameplay: {}
    };
}

function createFullMatchState ()
{
    if (fullMatch.timer)
    {
        clearInterval(fullMatch.timer);
        fullMatch.timer = null;
    }

    fullMatch.active = true;
    fullMatch.tick = 0;
    fullMatch.stateNonce = 0;
    fullMatch.idToConnection = {};

    for (const player of lobby.players)
    {
        fullMatch.idToConnection[player.id] = player.ownerConnectionId;
    }

    fullMatch.simState = createGameState(buildFullGameSetup());
}

function startFullTickLoop ()
{
    if (fullMatch.timer)
    {
        clearInterval(fullMatch.timer);
    }

    let lastTime = Date.now();

    fullMatch.timer = setInterval(() => {
        const now = Date.now();
        const dt = (now - lastTime) / 1000;
        lastTime = now;
        tickFullMatch(dt, now);
    }, FULL_TICK_MS);
}

function tickFullMatch (dt, now)
{
    if (!fullMatch.active || !fullMatch.simState)
    {
        return;
    }

    const inputDirections = new Map();

    for (const snake of fullMatch.simState.snakes)
    {
        if (!snake.isPlayer || !snake.inputProfile)
        {
            continue;
        }

        const ownerConnectionId = fullMatch.idToConnection[snake.id];
        if (!ownerConnectionId)
        {
            continue;
        }

        const key = `${ownerConnectionId}:${snake.inputProfile}`;
        const dir = lastInputs.get(key);
        if (dir)
        {
            inputDirections.set(snake.id, dir);
        }
    }

    stepGame(fullMatch.simState, dt, now, inputDirections);
    syncFullMatchOutcome();

    fullMatch.tick += 1;
    fullMatch.stateNonce += 1;

    if (fullMatch.simState.isGameOver)
    {
        clearInterval(fullMatch.timer);
        fullMatch.timer = null;
        fullMatch.active = false;
        lobby.statusMessage = fullMatch.simState.winnerName
            ? `Partie terminee. Vainqueur: ${fullMatch.simState.winnerName}`
            : 'Partie terminee sans vainqueur.';
    }
}

function syncFullMatchOutcome ()
{
    if (!fullMatch.simState || fullMatch.simState.isGameOver)
    {
        return;
    }

    const aliveSnakes = fullMatch.simState.snakes.filter((snake) => snake.alive);
    const alivePlayers = fullMatch.simState.snakes.filter((snake) => snake.isPlayer && snake.alive);

    if (aliveSnakes.length <= 1)
    {
        const winner = aliveSnakes[0] || null;
        fullMatch.simState.isGameOver = true;
        fullMatch.simState.winnerName = winner?.name || null;
        fullMatch.simState.finalScore = winner?.score || 0;
        return;
    }

    if (alivePlayers.length === 0)
    {
        const bestHuman = fullMatch.simState.snakes
            .filter((snake) => snake.isPlayer)
            .sort((left, right) => right.score - left.score)[0] || null;

        fullMatch.simState.isGameOver = true;
        fullMatch.simState.winnerName = bestHuman?.name || null;
        fullMatch.simState.finalScore = bestHuman?.score || 0;
    }
}

function buildFullMatchState ()
{
    if (!fullMatch.simState)
    {
        return null;
    }

    const sim = fullMatch.simState;

    return {
        mode: 'full',
        active: fullMatch.active,
        tick: fullMatch.tick,
        stateNonce: fullMatch.stateNonce,
        winnerName: sim.winnerName,
        finalScore: sim.finalScore,
        world: {
            width: 4000,
            height: 4000,
            tickMs: FULL_TICK_MS
        },
        oranges: sim.oranges,
        snakes: sim.snakes.map((snake) => ({
            id: snake.id,
            name: snake.name,
            color: snake.color,
            alive: snake.alive,
            score: snake.score,
            x: snake.x,
            y: snake.y,
            segments: snake.segments,
            isPlayer: snake.isPlayer,
            power: snake.power
        }))
    };
}

function startTickLoop ()
{
    if (match.timer)
    {
        clearInterval(match.timer);
    }

    match.timer = setInterval(() => {
        tickMatch();
    }, TICK_MS);
}

function tickMatch ()
{
    if (!match.active)
    {
        return;
    }

    match.tick += 1;

    for (const player of match.players)
    {
        if (!player.alive)
        {
            continue;
        }

        if (player.kind === 'human')
        {
            const inputKey = `${player.ownerConnectionId}:${player.input}`;
            const queued = lastInputs.get(inputKey);
            if (queued && !isOppositeDirection(player.direction, queued))
            {
                player.nextDirection = queued;
            }
        }
        else
        {
            const botDirection = chooseBotDirection(player);
            if (botDirection && !isOppositeDirection(player.direction, botDirection))
            {
                player.nextDirection = botDirection;
            }
        }
    }

    const occupied = new Set();
    const tailKeys = new Map();
    for (const player of match.players)
    {
        if (!player.alive)
        {
            continue;
        }

        for (const segment of player.segments)
        {
            occupied.add(keyFromPoint(segment));
        }

        const tail = player.segments[player.segments.length - 1];
        if (tail)
        {
            tailKeys.set(player.id, keyFromPoint(tail));
        }
    }

    const moves = [];
    for (const player of match.players)
    {
        if (!player.alive)
        {
            continue;
        }

        const desired = player.nextDirection || player.direction;
        const head = player.segments[0];
        const nextHead = {
            x: head.x + desired.x,
            y: head.y + desired.y
        };
        player.direction = desired;
        moves.push({ player, nextHead, dead: false });
    }

    for (const move of moves)
    {
        if (!isInsideWorld(move.nextHead))
        {
            move.dead = true;
        }
    }

    const nextHeadCounts = new Map();
    for (const move of moves)
    {
        const key = keyFromPoint(move.nextHead);
        nextHeadCounts.set(key, (nextHeadCounts.get(key) || 0) + 1);
    }

    for (const move of moves)
    {
        if ((nextHeadCounts.get(keyFromPoint(move.nextHead)) || 0) > 1)
        {
            move.dead = true;
        }
    }

    for (const move of moves)
    {
        if (move.dead)
        {
            continue;
        }

        const key = keyFromPoint(move.nextHead);
        const tailKey = tailKeys.get(move.player.id);
        const movingIntoOwnTail = move.player.grow <= 0 && tailKey === key;
        if (occupied.has(key) && !movingIntoOwnTail)
        {
            move.dead = true;
        }
    }

    for (const move of moves)
    {
        if (move.dead)
        {
            move.player.alive = false;
            continue;
        }

        move.player.segments.unshift(move.nextHead);

        const foodIndex = match.food.findIndex((food) => food.x === move.nextHead.x && food.y === move.nextHead.y);
        if (foodIndex >= 0)
        {
            match.food.splice(foodIndex, 1);
            move.player.grow += 2;
            move.player.score += 1;
            spawnFood();
        }
        else if (move.player.grow > 0)
        {
            move.player.grow -= 1;
        }
        else
        {
            move.player.segments.pop();
        }
    }

    const alivePlayers = match.players.filter((player) => player.alive);
    if (alivePlayers.length <= 1)
    {
        match.active = false;
        match.winnerName = alivePlayers.length === 1 ? alivePlayers[0].name : null;
        clearInterval(match.timer);
        match.timer = null;
        lobby.statusMessage = match.winnerName
            ? `Partie terminee. Vainqueur: ${match.winnerName}`
            : 'Partie terminee sans vainqueur.';
    }

    match.stateNonce += 1;
}

function chooseBotDirection (player)
{
    const head = player.segments[0];
    const current = player.direction;
    const options = [
        current,
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 }
    ].filter((candidate, index, array) => array.findIndex((item) => item.x === candidate.x && item.y === candidate.y) === index)
        .filter((candidate) => !isOppositeDirection(current, candidate));

    options.sort(() => Math.random() - 0.5);
    const preferred = Math.random() < 0.7 ? options : options.slice().reverse();

    for (const candidate of preferred)
    {
        const next = { x: head.x + candidate.x, y: head.y + candidate.y };
        if (isInsideWorld(next))
        {
            return candidate;
        }
    }

    return current;
}

function spawnFood ()
{
    for (let attempts = 0; attempts < 120; attempts++)
    {
        const candidate = {
            x: Math.floor(Math.random() * WORLD_WIDTH),
            y: Math.floor(Math.random() * WORLD_HEIGHT)
        };
        const blockedBySnake = match.players.some((player) => player.segments.some((segment) => segment.x === candidate.x && segment.y === candidate.y));
        const alreadyFood = match.food.some((food) => food.x === candidate.x && food.y === candidate.y);
        if (!blockedBySnake && !alreadyFood)
        {
            match.food.push(candidate);
            return;
        }
    }
}

function applyInput (connectionId, inputProfile, direction)
{
    ensureConnection(connectionId);
    if (!match.active && !fullMatch.active)
    {
        return;
    }

    const safeDirection = normalizeDirection(direction);
    if (!safeDirection)
    {
        return;
    }

    const key = `${connectionId}:${String(inputProfile || '')}`;
    lastInputs.set(key, safeDirection);
}

function normalizeDirection (direction)
{
    const x = Number(direction?.x || 0);
    const y = Number(direction?.y || 0);
    if (!Number.isFinite(x) || !Number.isFinite(y))
    {
        return null;
    }

    if (Math.abs(x) + Math.abs(y) !== 1)
    {
        return null;
    }

    return { x: Math.sign(x), y: Math.sign(y) };
}

function buildMatchState ()
{
    if (!match.startedAt)
    {
        return null;
    }

    return {
        active: match.active,
        tick: match.tick,
        stateNonce: match.stateNonce,
        winnerName: match.winnerName,
        world: {
            width: WORLD_WIDTH,
            height: WORLD_HEIGHT,
            tickMs: TICK_MS
        },
        food: match.food,
        players: match.players.map((player) => ({
            id: player.id,
            name: player.name,
            kind: player.kind,
            color: player.color,
            alive: player.alive,
            score: player.score,
            segments: player.segments
        }))
    };
}

function buildConnectionView (connectionId)
{
    if (!connectionId)
    {
        return { controlledProfiles: [], controlledPlayerIds: [] };
    }

    if (lobby.gameMode === 'full' && fullMatch.simState)
    {
        const controlled = fullMatch.simState.snakes.filter((snake) => {
            if (!snake.isPlayer)
            {
                return false;
            }

            return fullMatch.idToConnection[snake.id] === connectionId;
        });

        return {
            controlledProfiles: controlled.map((snake) => snake.inputProfile).filter(Boolean),
            controlledPlayerIds: controlled.map((snake) => snake.id)
        };
    }

    const controlled = match.players.filter((player) => player.ownerConnectionId === connectionId && player.kind === 'human');
    return {
        controlledProfiles: controlled.map((player) => player.input).filter(Boolean),
        controlledPlayerIds: controlled.map((player) => player.id)
    };
}

function disconnect (connectionId)
{
    if (!connectionId)
    {
        return;
    }

    connections.delete(connectionId);
    lobby.players = lobby.players.filter((player) => player.ownerConnectionId !== connectionId);
    removeConnectionInputs(connectionId);

    if (lobby.hostConnectionId === connectionId)
    {
        resetLobby('Le host a quitte la partie.');
        return;
    }

    for (const player of match.players)
    {
        if (player.ownerConnectionId === connectionId)
        {
            player.alive = false;
        }
    }

    if (fullMatch.simState)
    {
        for (const snake of fullMatch.simState.snakes)
        {
            if (fullMatch.idToConnection[snake.id] === connectionId)
            {
                snake.alive = false;
            }
        }

        syncFullMatchOutcome();
    }

    lobby.statusMessage = 'Un joueur a quitte le lobby.';
}

function removeConnectionInputs (connectionId)
{
    for (const key of lastInputs.keys())
    {
        if (key.startsWith(`${connectionId}:`))
        {
            lastInputs.delete(key);
        }
    }
}

function buildHumanPlayers (humanPlayers, ownerConnectionId, isHost)
{
    return humanPlayers.map((player, index) => ({
        id: `${ownerConnectionId}-player-${index + 1}`,
        name: player.name,
        snakeColorIndex: player.snakeColorIndex,
        input: player.input,
        ownerConnectionId,
        isHost,
        color: player.color
    }));
}

function buildLobbyState ()
{
    return {
        hostConnectionId: lobby.hostConnectionId,
        maxPlayers: lobby.maxPlayers,
        fillWithBots: lobby.fillWithBots,
        gameMode: lobby.gameMode,
        botDifficulty: lobby.botDifficulty,
        players: lobby.players,
        chatMessages: lobby.chatMessages,
        serverIp: lobby.serverIp,
        statusMessage: lobby.statusMessage
    };
}

function resetLobby (statusMessage)
{
    resetMatch();
    lobby.hostConnectionId = null;
    lobby.maxPlayers = 4;
    lobby.fillWithBots = false;
    lobby.gameMode = 'light';
    lobby.botDifficulty = 5;
    lobby.players = [];
    lobby.chatMessages = [];
    lobby.serverIp = getPrimaryLocalIp();
    lobby.statusMessage = statusMessage;
    lobby.matchPayload = null;
    lobby.matchNonce += 1;
}

function resetMatch ()
{
    if (match.timer)
    {
        clearInterval(match.timer);
        match.timer = null;
    }

    match.active = false;
    match.tick = 0;
    match.startedAt = 0;
    match.players = [];
    match.food = [];
    match.winnerName = null;
    match.stateNonce = 0;
    lastInputs.clear();
}

function keyFromPoint (point)
{
    return `${point.x},${point.y}`;
}

function isInsideWorld (point)
{
    return point.x >= 0 && point.x < WORLD_WIDTH && point.y >= 0 && point.y < WORLD_HEIGHT;
}

function isOppositeDirection (currentDirection, candidate)
{
    return currentDirection.x === -candidate.x && currentDirection.y === -candidate.y;
}

function getPrimaryLocalIp ()
{
    const interfaces = os.networkInterfaces();
    for (const entries of Object.values(interfaces))
    {
        for (const entry of entries || [])
        {
            if (entry.family === 'IPv4' && !entry.internal)
            {
                return entry.address;
            }
        }
    }

    return '127.0.0.1';
}

function clampInteger (value, min, max, fallback)
{
    const parsed = Number.isFinite(value) ? Math.floor(value) : Number.parseInt(value, 10);
    const safeValue = Number.isFinite(parsed) ? parsed : fallback;
    return Math.max(min, Math.min(max, safeValue));
}

function snakeColorFromIndex (index)
{
    const hue = ((index % 100) * 360) / 100;
    const saturation = 0.9;
    const lightness = 0.52;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
    const m = lightness - chroma / 2;
    let red = 0;
    let green = 0;
    let blue = 0;

    if (hue < 60)
    {
        red = chroma;
        green = x;
    }
    else if (hue < 120)
    {
        red = x;
        green = chroma;
    }
    else if (hue < 180)
    {
        green = chroma;
        blue = x;
    }
    else if (hue < 240)
    {
        green = x;
        blue = chroma;
    }
    else if (hue < 300)
    {
        red = x;
        blue = chroma;
    }
    else
    {
        red = chroma;
        blue = x;
    }

    const redInt = Math.round((red + m) * 255);
    const greenInt = Math.round((green + m) * 255);
    const blueInt = Math.round((blue + m) * 255);
    return (redInt << 16) | (greenInt << 8) | blueInt;
}

function ensureConnection (connectionId)
{
    if (!connectionId || !connections.has(connectionId))
    {
        throw new Error('Connexion invalide. Recharge la salle d\'attente.');
    }
}

function writeJson (response, statusCode, payload)
{
    response.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    response.end(JSON.stringify(payload));
}

function readJsonBody (request)
{
    return new Promise((resolve, reject) => {
        const chunks = [];
        request.on('data', (chunk) => {
            chunks.push(chunk);
        });
        request.on('end', () => {
            if (chunks.length === 0)
            {
                resolve({});
                return;
            }

            try
            {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            }
            catch
            {
                reject(new Error('Corps JSON invalide.'));
            }
        });
        request.on('error', reject);
    });
}