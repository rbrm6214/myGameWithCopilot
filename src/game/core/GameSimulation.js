/**
 * GameSimulation.js — Pure game simulation core (no Phaser dependency).
 *
 * Exports:
 *   - GAME_CONSTANTS                : configuration constants
 *   - generateSnakeColors(count)    : color palette helper
 *   - buildRoster(setup)            : build normalized snake roster from a setup object
 *   - createUniformSpawnPoints(n)   : evenly distributed spawn points around center
 *   - createGameState(setup)        : build a full initial game state (plain objects)
 *   - stepGame(state, dt, now, inputDirections) : advance one tick; returns {events}
 *
 * State shape (GameState):
 *   {
 *     config: GameConfig,
 *     snakes: Snake[],
 *     oranges: Orange[],
 *     isGameOver: boolean,
 *     winnerName: string|null,
 *     finalScore: number,
 *     elapsedTimeMs: number,
 *     _nextOrangeId: number
 *   }
 *
 * Snake shape:
 *   { id, name, type, isPlayer, isLocalHuman, inputProfile, power, color, alive,
 *     score, x, y, direction:{x,y}, segments:[{x,y}],
 *     turnCooldown, botLevel, lizardBoostUntil, lizardCooldownUntil,
 *     pendingLizardRestoreSegments, pendingLizardRestoreAt, history:[{x,y}] }
 *
 * Orange shape: { id, x, y }
 *
 * Events returned by stepGame:
 *   { type: 'score_popup',    x, y, label, color }
 *   { type: 'impact_flash',   x, y, major: bool }
 *   { type: 'orange_spawned', id, x, y }
 *   { type: 'orange_removed', id }
 *   { type: 'snake_died',     snakeId, spawnOranges: bool }
 *   { type: 'lezard_boost',   snakeId }
 *   { type: 'lezard_restored',snakeId, added: number }
 *   { type: 'game_over',      reason, winnerName, score }
 *
 * inputDirections: Map<snakeId, {x, y}> — desired direction per player this tick.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GAME_CONSTANTS = {
    WORLD_WIDTH: 4000,
    WORLD_HEIGHT: 4000,
    INITIAL_SCORE: 3,
    SNAKE_SPEED: 165,
    DEFAULT_SEGMENT_SPACING: 3,
    HEAD_RADIUS: 10,
    HEAD_TO_HEAD_DISTANCE: 18,   // (HEAD_RADIUS * 2) - 2
    HEAD_TO_BODY_DISTANCE: 18,
    ORANGE_COUNT: 100,
    DEFAULT_TOTAL_SNAKES: 10,
    DEFAULT_BOT_LEVEL: 4,
    BOT_VISION_UNIT: 200,
    BOT_LOOK_AHEAD: 110,
    BOT_TRAP_STEP: 80,
    DEFAULT_BOT_DANGER_THRESHOLD: 640,
    BOT_DANGER_THRESHOLD_MIN: 300,
    BOT_DANGER_THRESHOLD_MAX: 1100,
    DEFAULT_BOT_AGGRESSIVITY_ACTIVE_LEVEL: 6,
    DEFAULT_LIZARD_BOOST_MULTIPLIER: 2,
    DEFAULT_LIZARD_BOOST_DURATION_SEC: 3,
    DEFAULT_LIZARD_COOLDOWN_SEC: 50
};

const {
    WORLD_WIDTH, WORLD_HEIGHT, INITIAL_SCORE, SNAKE_SPEED,
    DEFAULT_SEGMENT_SPACING, HEAD_RADIUS, HEAD_TO_HEAD_DISTANCE,
    HEAD_TO_BODY_DISTANCE, ORANGE_COUNT, DEFAULT_TOTAL_SNAKES,
    DEFAULT_BOT_LEVEL, BOT_VISION_UNIT, BOT_LOOK_AHEAD, BOT_TRAP_STEP,
    DEFAULT_BOT_DANGER_THRESHOLD, BOT_DANGER_THRESHOLD_MIN,
    BOT_DANGER_THRESHOLD_MAX, DEFAULT_BOT_AGGRESSIVITY_ACTIVE_LEVEL,
    DEFAULT_LIZARD_BOOST_MULTIPLIER, DEFAULT_LIZARD_BOOST_DURATION_SEC,
    DEFAULT_LIZARD_COOLDOWN_SEC
} = GAME_CONSTANTS;

const DEFAULT_PLAYER_COLORS = [0x2f6bff, 0x7dff7a, 0xff47d7, 0xffe45a];

const DIRECTIONS = [
    { x: 1,  y: 0  },
    { x: -1, y: 0  },
    { x: 0,  y: 1  },
    { x: 0,  y: -1 }
];

// ---------------------------------------------------------------------------
// Utility helpers (pure)
// ---------------------------------------------------------------------------

function clamp (value, min, max)
{
    return Math.max(min, Math.min(max, value));
}

function distanceBetween (ax, ay, bx, by)
{
    const dx = bx - ax;
    const dy = by - ay;
    return Math.sqrt(dx * dx + dy * dy);
}

function distancePointToSegment (px, py, ax, ay, bx, by)
{
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const abLenSq = abx * abx + aby * aby;

    if (abLenSq <= 0.0001)
    {
        return Math.hypot(px - ax, py - ay);
    }

    const t = clamp((apx * abx + apy * aby) / abLenSq, 0, 1);
    return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

function randomBetween (min, max)
{
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomInWorld (padding, dimension)
{
    return randomBetween(padding, dimension - padding);
}

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

export function generateSnakeColors (count)
{
    const colors = [];

    for (let i = 0; i < count; i++)
    {
        const hue = (i * 360 / count) % 360;
        const s = 0.90;
        const l = 0.52;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
        const m = l - c / 2;
        let r = 0, g = 0, b = 0;

        if (hue < 60)        { r = c; g = x; b = 0; }
        else if (hue < 120)  { r = x; g = c; b = 0; }
        else if (hue < 180)  { r = 0; g = c; b = x; }
        else if (hue < 240)  { r = 0; g = x; b = c; }
        else if (hue < 300)  { r = x; g = 0; b = c; }
        else                 { r = c; g = 0; b = x; }

        colors.push(
            (Math.round((r + m) * 255) << 16) |
            (Math.round((g + m) * 255) << 8)  |
             Math.round((b + m) * 255)
        );
    }

    for (let i = 0; i < DEFAULT_PLAYER_COLORS.length && i < colors.length; i++)
    {
        colors[i] = DEFAULT_PLAYER_COLORS[i];
    }

    return colors;
}

const SNAKE_COLORS = generateSnakeColors(100);

// ---------------------------------------------------------------------------
// Spawn points
// ---------------------------------------------------------------------------

export function createUniformSpawnPoints (count)
{
    const points = [];
    const centerX = WORLD_WIDTH / 2;
    const centerY = WORLD_HEIGHT / 2;
    const radius = Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.35;

    for (let i = 0; i < count; i++)
    {
        const angle = (Math.PI * 2 * i) / count;
        points.push({
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius,
            directionIndex: i % DIRECTIONS.length
        });
    }

    return points;
}

// ---------------------------------------------------------------------------
// Roster builder
// ---------------------------------------------------------------------------

export function buildRoster (setup)
{
    const maxSnakes = Number.isFinite(setup?.maxSnakes)
        ? Math.max(1, Math.floor(setup.maxSnakes))
        : DEFAULT_TOTAL_SNAKES;

    const humans = Array.isArray(setup?.humanPlayers) && setup.humanPlayers.length > 0
        ? setup.humanPlayers
        : [{
            id: 'player-1',
            name: setup?.playerName || 'Joueur',
            snakeColorIndex: Number.isFinite(setup?.playerSnakeIndex) ? setup.playerSnakeIndex : 0,
            input: 'keyboard-zqsd',
            isLocal: true
        }];

    const botLevelMap = {};
    const configuredBotLevels = setup?.botSettings?.levelsBySnake || setup?.botLevels || [];

    for (const entry of configuredBotLevels)
    {
        botLevelMap[entry.snakeIndex] = entry.level;
    }

    const defaultBotLevel = Number.isFinite(setup?.botSettings?.extraBotDefaultLevel)
        ? clamp(Math.floor(setup.botSettings.extraBotDefaultLevel), 1, 10)
        : (Number.isFinite(setup?.botSettings?.defaultLevel)
            ? clamp(Math.floor(setup.botSettings.defaultLevel), 1, 10)
            : DEFAULT_BOT_LEVEL);

    const roster = [];

    const normalizedHumans = humans.map((player, index) =>
    {
        const snakeIndex = clamp(
            Number.isFinite(player?.playerSlot) ? Math.floor(player.playerSlot) : index,
            0,
            maxSnakes - 1
        );
        const snakeColorIndex = Number.isFinite(player?.snakeColorIndex)
            ? Math.max(0, Math.floor(player.snakeColorIndex))
            : index;

        return {
            id: player?.id || `player-${index + 1}`,
            name: player?.name || `Joueur ${index + 1}`,
            input: player?.input || 'keyboard-arrows',
            power: player?.power || 'sans',
            isLocal: player?.isLocal !== false,
            isPlayerControlled: player?.isPlayerControlled !== false,
            snakeIndex,
            snakeColorIndex,
            playerSlot: Number.isFinite(player?.playerSlot) ? Math.max(0, Math.floor(player.playerSlot)) : index
        };
    });

    for (const human of normalizedHumans)
    {
        roster[human.snakeIndex] = {
            id: human.id,
            name: human.name,
            type: 'human',
            isPlayer: human.isPlayerControlled,
            isLocalHuman: human.isLocal,
            inputProfile: human.input,
            power: human.power,
            playerSlot: human.playerSlot,
            colorIndex: human.snakeColorIndex,
            botLevel: null
        };
    }

    for (let i = 0; i < maxSnakes; i++)
    {
        if (roster[i])
        {
            continue;
        }

        roster[i] = {
            id: `bot-${i + 1}`,
            name: `Bot ${i + 1}`,
            type: 'bot',
            isPlayer: false,
            isLocalHuman: false,
            inputProfile: null,
            power: 'sans',
            playerSlot: Number.MAX_SAFE_INTEGER,
            colorIndex: i,
            botLevel: botLevelMap[i] !== undefined ? botLevelMap[i] : defaultBotLevel
        };
    }

    return roster;
}

// ---------------------------------------------------------------------------
// Initial snake state (data only — no display objects)
// ---------------------------------------------------------------------------

function createInitialHistory (spawnX, spawnY, direction, segmentSpacing)
{
    const historyLength = (INITIAL_SCORE + 20) * segmentSpacing;
    const history = [];

    for (let i = 0; i < historyLength; i++)
    {
        history.push({
            x: spawnX - direction.x * i,
            y: spawnY - direction.y * i
        });
    }

    return history;
}

function createSnakeState (rosterEntry, spawn, segmentSpacing)
{
    const color = SNAKE_COLORS[rosterEntry.colorIndex % SNAKE_COLORS.length];
    const direction = { ...DIRECTIONS[spawn.directionIndex % DIRECTIONS.length] };
    const history = createInitialHistory(spawn.x, spawn.y, direction, segmentSpacing);

    const segments = [];

    for (let i = 0; i < INITIAL_SCORE - 1; i++)
    {
        segments.push({
            x: spawn.x - direction.x * segmentSpacing * (i + 1),
            y: spawn.y - direction.y * segmentSpacing * (i + 1)
        });
    }

    return {
        id: rosterEntry.id,
        name: rosterEntry.name,
        type: rosterEntry.type,
        isPlayer: rosterEntry.isPlayer,
        isLocalHuman: rosterEntry.isLocalHuman,
        inputProfile: rosterEntry.inputProfile,
        power: rosterEntry.power || 'sans',
        playerSlot: Number.isFinite(rosterEntry.playerSlot) ? rosterEntry.playerSlot : Number.MAX_SAFE_INTEGER,
        botLevel: rosterEntry.botLevel,
        color,
        alive: true,
        score: INITIAL_SCORE,
        x: spawn.x,
        y: spawn.y,
        direction,
        segments,
        turnCooldown: 0,
        lizardBoostUntil: 0,
        lizardCooldownUntil: 0,
        pendingLizardRestoreSegments: 0,
        pendingLizardRestoreAt: 0,
        history
    };
}

// ---------------------------------------------------------------------------
// Game state factory
// ---------------------------------------------------------------------------

export function createGameState (setup)
{
    const gameplay = setup?.gameplay || {};
    const botSettings = setup?.botSettings || {};

    const config = {
        maxSnakes: Number.isFinite(setup?.maxSnakes) ? Math.max(1, Math.floor(setup.maxSnakes)) : DEFAULT_TOTAL_SNAKES,
        segmentSpacing: Number.isFinite(gameplay.segmentSpacing)
            ? Math.max(1, Math.floor(gameplay.segmentSpacing))
            : (Number.isFinite(setup?.espacement) ? Math.max(1, Math.floor(setup.espacement)) : DEFAULT_SEGMENT_SPACING),
        botDangerThreshold: Number.isFinite(botSettings.dangerThreshold)
            ? clamp(Math.floor(botSettings.dangerThreshold), BOT_DANGER_THRESHOLD_MIN, BOT_DANGER_THRESHOLD_MAX)
            : (Number.isFinite(setup?.seuilDanger)
                ? clamp(Math.floor(setup.seuilDanger), BOT_DANGER_THRESHOLD_MIN, BOT_DANGER_THRESHOLD_MAX)
                : DEFAULT_BOT_DANGER_THRESHOLD),
        botAggressivityActiveLevel: Number.isFinite(botSettings.aggressivityActiveLevel)
            ? clamp(Math.floor(botSettings.aggressivityActiveLevel), 1, 11)
            : (Number.isFinite(setup?.['agressivité_active_niveau'])
                ? clamp(Math.floor(setup['agressivité_active_niveau']), 1, 11)
                : DEFAULT_BOT_AGGRESSIVITY_ACTIVE_LEVEL),
        lizardBoostMultiplier: Number.isFinite(gameplay.lizardBoostMultiplier)
            ? clamp(Number(gameplay.lizardBoostMultiplier), 1.2, 4)
            : DEFAULT_LIZARD_BOOST_MULTIPLIER,
        lizardBoostDurationSec: Number.isFinite(gameplay.lizardBoostDurationSec)
            ? clamp(Math.floor(gameplay.lizardBoostDurationSec), 1, 15)
            : DEFAULT_LIZARD_BOOST_DURATION_SEC,
        lizardCooldownSec: Number.isFinite(gameplay.lizardCooldownSec)
            ? clamp(Math.floor(gameplay.lizardCooldownSec), 5, 120)
            : DEFAULT_LIZARD_COOLDOWN_SEC,
        orangeCount: ORANGE_COUNT
    };

    const roster = buildRoster(setup);
    config.maxSnakes = roster.length;
    const spawnPoints = createUniformSpawnPoints(config.maxSnakes);

    const snakes = roster.map((entry, index) =>
        createSnakeState(entry, spawnPoints[index], config.segmentSpacing)
    );

    let nextOrangeId = 1;
    const oranges = [];

    for (let i = 0; i < config.orangeCount; i++)
    {
        oranges.push({
            id: nextOrangeId++,
            x: randomInWorld(20, WORLD_WIDTH),
            y: randomInWorld(20, WORLD_HEIGHT)
        });
    }

    return {
        config,
        snakes,
        oranges,
        isGameOver: false,
        winnerName: null,
        finalScore: 0,
        elapsedTimeMs: 0,
        _nextOrangeId: nextOrangeId
    };
}

// ---------------------------------------------------------------------------
// stepGame — advances simulation by one tick
// ---------------------------------------------------------------------------

/**
 * @param {object}  state           - mutable GameState
 * @param {number}  dt              - delta time in seconds
 * @param {number}  now             - current timestamp in ms (e.g. Date.now() or server tick time)
 * @param {Map}     inputDirections - Map<snakeId, {x,y}> desired directions from player input
 * @returns {{ events: object[] }}
 */
export function stepGame (state, dt, now, inputDirections = new Map())
{
    if (state.isGameOver)
    {
        return { events: [] };
    }

    const events = [];
    state.elapsedTimeMs += dt * 1000;

    const { config } = state;

    // --- Bot turn cooldown decrement ---
    for (const snake of state.snakes)
    {
        if (!snake.alive)
        {
            continue;
        }

        if (!snake.isPlayer)
        {
            snake.turnCooldown -= dt * 1000;
        }
    }

    // --- Apply player input ---
    for (const snake of state.snakes)
    {
        if (!snake.alive || !snake.isPlayer)
        {
            continue;
        }

        const desired = inputDirections.get(snake.id);

        if (!desired)
        {
            continue;
        }

        if ((desired.x + snake.direction.x === 0) && (desired.y + snake.direction.y === 0))
        {
            continue;
        }

        snake.direction = desired;
    }

    // --- Bot AI direction ---
    for (const snake of state.snakes)
    {
        if (!snake.alive || snake.isPlayer)
        {
            continue;
        }

        if (snake.turnCooldown > 0)
        {
            continue;
        }

        snake.turnCooldown = 250; // ms
        updateBotDirection(snake, state, now);
    }

    // --- Move snakes ---
    for (const snake of state.snakes)
    {
        if (!snake.alive)
        {
            continue;
        }

        moveSnake(snake, dt, now, config);
    }

    // --- Resolve collisions ---
    resolveCollisions(state, now, events);

    // --- Orange collection, segment sync, lezard restore ---
    for (const snake of state.snakes)
    {
        if (!snake.alive)
        {
            continue;
        }

        handleOrangeCollection(snake, state, events);
        processPendingLizardRestore(snake, now, events);
        syncSegmentPositions(snake, config.segmentSpacing);
    }

    return { events };
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

function moveSnake (snake, dt, now, config)
{
    const speedMultiplier =
        (snake.power === 'lezard' && now < snake.lizardBoostUntil)
            ? config.lizardBoostMultiplier
            : 1;

    snake.x += snake.direction.x * SNAKE_SPEED * speedMultiplier * dt;
    snake.y += snake.direction.y * SNAKE_SPEED * speedMultiplier * dt;

    snake.history.unshift({ x: snake.x, y: snake.y });

    const targetLength = Math.max(250, (snake.score + 10) * config.segmentSpacing);

    if (snake.history.length > targetLength)
    {
        snake.history.length = targetLength;
    }
}

// ---------------------------------------------------------------------------
// Segment positions sync (data only)
// ---------------------------------------------------------------------------

function syncSegmentPositions (snake, segmentSpacing)
{
    const desired = Math.max(0, snake.score - 1);

    while (snake.segments.length < desired)
    {
        snake.segments.push({ x: snake.x, y: snake.y });
    }

    while (snake.segments.length > desired)
    {
        snake.segments.pop();
    }

    for (let i = 0; i < snake.segments.length; i++)
    {
        const hi = Math.min(snake.history.length - 1, (i + 1) * segmentSpacing);
        snake.segments[i] = { ...snake.history[hi] };
    }
}

// ---------------------------------------------------------------------------
// Orange collection
// ---------------------------------------------------------------------------

function handleOrangeCollection (snake, state, events)
{
    const { config } = state;

    for (let i = state.oranges.length - 1; i >= 0; i--)
    {
        const orange = state.oranges[i];

        if (distanceBetween(snake.x, snake.y, orange.x, orange.y) <= HEAD_RADIUS + 6)
        {
            events.push({ type: 'orange_removed', id: orange.id });
            state.oranges.splice(i, 1);
            snake.score += 1;
            events.push({ type: 'score_popup', x: snake.x, y: snake.y - 20, label: '+1', color: snake.color });

            const newOrange = {
                id: state._nextOrangeId++,
                x: randomInWorld(20, WORLD_WIDTH),
                y: randomInWorld(20, WORLD_HEIGHT)
            };
            state.oranges.push(newOrange);
            events.push({ type: 'orange_spawned', id: newOrange.id, x: newOrange.x, y: newOrange.y });
        }
    }
}

// ---------------------------------------------------------------------------
// Collision resolution
// ---------------------------------------------------------------------------

function resolveCollisions (state, now, events)
{
    for (const snake of state.snakes)
    {
        if (!snake.alive)
        {
            continue;
        }

        checkWallDeath(snake, state, events);

        if (snake.alive)
        {
            checkSelfCollision(snake, state, events);
        }
    }

    // Head-to-head
    for (let a = 0; a < state.snakes.length; a++)
    {
        const snakeA = state.snakes[a];

        if (!snakeA.alive)
        {
            continue;
        }

        for (let b = a + 1; b < state.snakes.length; b++)
        {
            const snakeB = state.snakes[b];

            if (!snakeB.alive)
            {
                continue;
            }

            if (distanceBetween(snakeA.x, snakeA.y, snakeB.x, snakeB.y) <= HEAD_TO_HEAD_DISTANCE)
            {
                handleHeadToHead(snakeA, snakeB, state, events);
            }
        }
    }

    // Head-to-body
    for (let ai = 0; ai < state.snakes.length; ai++)
    {
        const attacker = state.snakes[ai];

        if (!attacker.alive)
        {
            continue;
        }

        for (let di = 0; di < state.snakes.length; di++)
        {
            if (ai === di)
            {
                continue;
            }

            const defender = state.snakes[di];

            if (!defender.alive)
            {
                continue;
            }

            const hitIndex = getBodyHitIndex(attacker, defender);

            if (hitIndex === -1)
            {
                continue;
            }

            if (defender.score > attacker.score)
            {
                killSnake(attacker, state, events, { spawnOranges: true });
            }
            else if (attacker.score > defender.score)
            {
                truncateSnakeAt(defender, hitIndex, state, now, events);
            }

            break;
        }
    }

    checkVictoryCondition(state, events);
}

function checkWallDeath (snake, state, events)
{
    if (snake.x < 0 || snake.x > WORLD_WIDTH || snake.y < 0 || snake.y > WORLD_HEIGHT)
    {
        killSnake(snake, state, events, { spawnOranges: true });
    }
}

function checkSelfCollision (snake, state, events)
{
    for (let i = 2; i < snake.segments.length; i++)
    {
        const seg = snake.segments[i];

        if (distanceBetween(snake.x, snake.y, seg.x, seg.y) <= HEAD_TO_BODY_DISTANCE)
        {
            killSnake(snake, state, events, { spawnOranges: true });
            return;
        }

        if (i > 0)
        {
            const prev = snake.segments[i - 1];
            if (distancePointToSegment(snake.x, snake.y, prev.x, prev.y, seg.x, seg.y) <= HEAD_TO_BODY_DISTANCE - 2)
            {
                killSnake(snake, state, events, { spawnOranges: true });
                return;
            }
        }
    }
}

function handleHeadToHead (snakeA, snakeB, state, events)
{
    if (!snakeA.alive || !snakeB.alive)
    {
        return;
    }

    const ix = (snakeA.x + snakeB.x) * 0.5;
    const iy = (snakeA.y + snakeB.y) * 0.5;
    events.push({ type: 'impact_flash', x: ix, y: iy, major: true });

    if (snakeA.score === snakeB.score)
    {
        killSnake(snakeA, state, events, { spawnOranges: true });
        killSnake(snakeB, state, events, { spawnOranges: true });
        return;
    }

    const bigger  = snakeA.score > snakeB.score ? snakeA : snakeB;
    const smaller = bigger === snakeA ? snakeB : snakeA;
    const absorbed = smaller.score;

    killSnake(smaller, state, events, { spawnOranges: false });

    if (bigger.alive)
    {
        bigger.score += absorbed;
        events.push({ type: 'score_popup', x: bigger.x, y: bigger.y - 25, label: `+${absorbed}`, color: bigger.color });
    }
}

function getBodyHitIndex (attacker, defender)
{
    for (let i = 0; i < defender.segments.length; i++)
    {
        const seg = defender.segments[i];

        if (distanceBetween(attacker.x, attacker.y, seg.x, seg.y) <= HEAD_TO_BODY_DISTANCE)
        {
            return i;
        }

        if (i > 0)
        {
            const prev = defender.segments[i - 1];

            if (distancePointToSegment(attacker.x, attacker.y, prev.x, prev.y, seg.x, seg.y) <= HEAD_TO_BODY_DISTANCE - 2)
            {
                return i;
            }
        }
    }

    return -1;
}

function killSnake (snake, state, events, { spawnOranges = true } = {})
{
    if (!snake.alive)
    {
        return;
    }

    snake.alive = false;

    if (spawnOranges)
    {
        for (const seg of snake.segments)
        {
            const o = { id: state._nextOrangeId++, x: seg.x, y: seg.y };
            state.oranges.push(o);
            events.push({ type: 'orange_spawned', id: o.id, x: o.x, y: o.y });
        }

        const ho = { id: state._nextOrangeId++, x: snake.x, y: snake.y };
        state.oranges.push(ho);
        events.push({ type: 'orange_spawned', id: ho.id, x: ho.x, y: ho.y });
    }

    snake.segments = [];
    events.push({ type: 'snake_died', snakeId: snake.id, spawnOranges });
}

function truncateSnakeAt (snake, startIndex, state, now, events)
{
    if (!snake.alive)
    {
        return;
    }

    const { config } = state;
    const canTriggerLizard = snake.power === 'lezard' && now >= snake.lizardCooldownUntil;

    if (canTriggerLizard)
    {
        snake.lizardBoostUntil = now + config.lizardBoostDurationSec * 1000;
        snake.lizardCooldownUntil = now + config.lizardCooldownSec * 1000;
        events.push({ type: 'score_popup', x: snake.x, y: snake.y - 30, label: 'LEZARD!', color: snake.color });
        events.push({ type: 'lezard_boost', snakeId: snake.id });
    }

    const firstSeg = snake.segments[startIndex];

    if (firstSeg)
    {
        events.push({ type: 'impact_flash', x: firstSeg.x, y: firstSeg.y, major: false });
    }

    const removed = snake.segments.splice(startIndex);
    const removedCount = removed.length;

    for (const seg of removed)
    {
        const o = { id: state._nextOrangeId++, x: seg.x, y: seg.y };
        state.oranges.push(o);
        events.push({ type: 'orange_spawned', id: o.id, x: o.x, y: o.y });
    }

    snake.score = Math.max(1, snake.segments.length + 1);

    if (canTriggerLizard && removedCount > 0)
    {
        snake.pendingLizardRestoreSegments = removedCount;
        snake.pendingLizardRestoreAt = now + config.lizardBoostDurationSec * 1000;
    }

    snake.history.length = Math.max(250, (snake.score + 10) * config.segmentSpacing);
}

// ---------------------------------------------------------------------------
// Lezard deferred restore
// ---------------------------------------------------------------------------

function processPendingLizardRestore (snake, now, events)
{
    if (!snake.alive || snake.pendingLizardRestoreSegments <= 0)
    {
        return;
    }

    if (now < snake.pendingLizardRestoreAt)
    {
        return;
    }

    const added = snake.pendingLizardRestoreSegments;
    snake.score += added;
    events.push({ type: 'score_popup', x: snake.x, y: snake.y - 36, label: `QUEUE +${added}`, color: snake.color });
    events.push({ type: 'lezard_restored', snakeId: snake.id, added });
    snake.pendingLizardRestoreSegments = 0;
    snake.pendingLizardRestoreAt = 0;
}

// ---------------------------------------------------------------------------
// Victory condition
// ---------------------------------------------------------------------------

function checkVictoryCondition (state, events)
{
    if (state.isGameOver)
    {
        return;
    }

    const aliveSnakes = state.snakes.filter((s) => s.alive);
    const aliveLocalPlayers = aliveSnakes.filter((s) => s.isLocalHuman);

    // All local players dead
    if (state.snakes.some((s) => s.isLocalHuman) && aliveLocalPlayers.length === 0)
    {
        const best = state.snakes
            .filter((s) => s.isLocalHuman)
            .reduce((prev, cur) => (cur.score > prev.score ? cur : prev), { name: 'Joueur', score: 0 });

        state.isGameOver = true;
        state.winnerName = best.name;
        state.finalScore = best.score;
        events.push({ type: 'game_over', reason: 'eliminated', winnerName: best.name, score: best.score });
        return;
    }

    // Last snake standing (local player wins)
    if (aliveLocalPlayers.length === 1 && aliveSnakes.length === 1 && aliveSnakes[0] === aliveLocalPlayers[0])
    {
        const winner = aliveLocalPlayers[0];
        state.isGameOver = true;
        state.winnerName = winner.name;
        state.finalScore = winner.score;
        events.push({ type: 'game_over', reason: 'victory', winnerName: winner.name, score: winner.score });
    }
}

// ---------------------------------------------------------------------------
// Bot AI (pure)
// ---------------------------------------------------------------------------

function updateBotDirection (snake, state, _now)
{
    const { config } = state;
    const level = snake.botLevel !== null ? snake.botLevel : DEFAULT_BOT_LEVEL;
    const visionRange = level >= 10 ? Infinity : (level + 1) * BOT_VISION_UNIT;
    const attractionWeight = level * 0.2;
    const dangerWeight = 1.1 + level * 0.2;
    const trapWeight = 1 + level * 0.35;
    const rejectDangerThreshold = getRejectDangerThreshold(level, config.botDangerThreshold);

    const target = findSafeTargetForBot(snake, state, level, visionRange, rejectDangerThreshold);

    const candidates = DIRECTIONS
        .filter((d) => !((d.x + snake.direction.x === 0) && (d.y + snake.direction.y === 0)))
        .map((d) =>
        {
            const risk = getDirectionRisk(snake, d, state);
            const trapRisk = getTrapRisk(snake, d, level, state);
            const combinedDanger = risk * dangerWeight + trapRisk * trapWeight;

            if (risk === Number.MAX_SAFE_INTEGER)
            {
                return { direction: d, score: -Number.MAX_SAFE_INTEGER, combinedDanger: Number.MAX_SAFE_INTEGER };
            }

            let attraction = 0;

            if (target)
            {
                const dx = target.x - snake.x;
                const dy = target.y - snake.y;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                attraction = (d.x * (dx / len) + d.y * (dy / len)) * 200 * attractionWeight;

                if (combinedDanger > rejectDangerThreshold)
                {
                    attraction = 0;
                }
            }

            const noise = level < 4 ? randomBetween(-40, 40) * (4 - level) : 0;

            return { direction: d, score: attraction - combinedDanger + noise, combinedDanger };
        })
        .sort((a, b) => b.score - a.score);

    if (candidates.length === 0)
    {
        return;
    }

    const safeCandidates = candidates
        .filter((c) => c.combinedDanger !== Number.MAX_SAFE_INTEGER)
        .sort((a, b) => a.combinedDanger - b.combinedDanger);

    if (safeCandidates.length === 0)
    {
        return;
    }

    if (target && candidates[0].combinedDanger > rejectDangerThreshold)
    {
        snake.direction = safeCandidates[0].direction;
        return;
    }

    snake.direction = candidates[0].direction;
}

function getRejectDangerThreshold (level, baseDangerThreshold)
{
    if (level >= 7)
    {
        const progress = Math.min(1, (level - 7) / 3);
        return Math.round(baseDangerThreshold + (BOT_DANGER_THRESHOLD_MIN - baseDangerThreshold) * progress);
    }

    return baseDangerThreshold;
}

function findSafeTargetForBot (snake, state, level, visionRange, rejectDangerThreshold)
{
    const { config } = state;
    const candidates = [];

    if (level >= config.botAggressivityActiveLevel)
    {
        for (const other of state.snakes)
        {
            if (!other.alive || other === snake || other.score >= snake.score)
            {
                continue;
            }

            const dist = distanceBetween(snake.x, snake.y, other.x, other.y);

            if (dist <= visionRange)
            {
                candidates.push({ x: other.x, y: other.y, priority: 2, distance: dist });
            }
        }
    }

    for (const orange of state.oranges)
    {
        const dist = distanceBetween(snake.x, snake.y, orange.x, orange.y);

        if (dist <= visionRange)
        {
            candidates.push({ x: orange.x, y: orange.y, priority: 1, distance: dist });
        }
    }

    candidates.sort((a, b) => a.priority !== b.priority ? b.priority - a.priority : a.distance - b.distance);

    for (const target of candidates)
    {
        const preferred = getPreferredDirections(snake, target);
        let bestDanger = Number.MAX_SAFE_INTEGER;

        for (const d of preferred)
        {
            const risk = getDirectionRisk(snake, d, state);

            if (risk === Number.MAX_SAFE_INTEGER)
            {
                continue;
            }

            const trap = getTrapRisk(snake, d, level, state);
            bestDanger = Math.min(bestDanger, risk + trap);
        }

        if (bestDanger < rejectDangerThreshold)
        {
            return target;
        }
    }

    return null;
}

function getPreferredDirections (snake, target)
{
    const dx = target.x - snake.x;
    const dy = target.y - snake.y;
    const hFirst = Math.abs(dx) >= Math.abs(dy);

    return (hFirst
        ? [{ x: dx >= 0 ? 1 : -1, y: 0 }, { x: 0, y: dy >= 0 ? 1 : -1 }]
        : [{ x: 0, y: dy >= 0 ? 1 : -1 }, { x: dx >= 0 ? 1 : -1, y: 0 }]
    ).filter((d) => !((d.x + snake.direction.x === 0) && (d.y + snake.direction.y === 0)));
}

function getTrapRisk (snake, initialDirection, level, state)
{
    const steps = Math.min(6, 2 + Math.floor(level / 2));
    let sx = snake.x;
    let sy = snake.y;
    let currentDir = initialDirection;
    let totalRisk = 0;

    for (let step = 0; step < steps; step++)
    {
        sx += currentDir.x * BOT_TRAP_STEP;
        sy += currentDir.y * BOT_TRAP_STEP;

        const possible = DIRECTIONS.filter((d) => !((d.x + currentDir.x === 0) && (d.y + currentDir.y === 0)));
        const assessed = possible
            .map((d) => ({ direction: d, risk: getDirectionRiskFromPoint(snake, d, sx, sy, state) }))
            .sort((a, b) => a.risk - b.risk);

        const valid = assessed.filter((e) => e.risk !== Number.MAX_SAFE_INTEGER);

        if (valid.length === 0)
        {
            return Number.MAX_SAFE_INTEGER;
        }

        if (valid.length === 1)  { totalRisk += 240; }
        else if (valid.length === 2) { totalRisk += 110; }

        const border = Math.min(sx, WORLD_WIDTH - sx, sy, WORLD_HEIGHT - sy);

        if (border < 140)
        {
            totalRisk += (140 - border) * 1.5;
        }

        totalRisk += valid[0].risk * 0.35;
        currentDir = valid[0].direction;
    }

    return Math.round(totalRisk);
}

function getDirectionRiskFromPoint (snake, direction, originX, originY, state)
{
    const nextX = originX + direction.x * BOT_LOOK_AHEAD;
    const nextY = originY + direction.y * BOT_LOOK_AHEAD;
    const pad = 50;

    if (nextX <= pad || nextX >= WORLD_WIDTH - pad || nextY <= pad || nextY >= WORLD_HEIGHT - pad)
    {
        return Number.MAX_SAFE_INTEGER;
    }

    let risk = 0;

    for (const other of state.snakes)
    {
        if (!other.alive)
        {
            continue;
        }

        for (let i = 0; i < other.segments.length; i++)
        {
            if (other === snake && i < 2)
            {
                continue;
            }

            const seg = other.segments[i];
            const dist = distanceBetween(nextX, nextY, seg.x, seg.y);

            if (dist <= HEAD_TO_BODY_DISTANCE + 6)
            {
                return Number.MAX_SAFE_INTEGER;
            }

            if (dist < 80)
            {
                risk += 80 - dist;
            }
        }

        if (other === snake)
        {
            continue;
        }

        const hd = distanceBetween(nextX, nextY, other.x, other.y);

        if (hd < 72)
        {
            risk += (72 - hd) * (other.score >= snake.score ? 8 : 3);
        }
    }

    return Math.round(risk);
}

function getDirectionRisk (snake, direction, state)
{
    return getDirectionRiskFromPoint(snake, direction, snake.x, snake.y, state);
}
