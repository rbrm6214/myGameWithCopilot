import { EventBus } from '../EventBus';
import { Input, Math as PhaserMath, Scene } from 'phaser';

const WORLD_WIDTH = 4000;
const WORLD_HEIGHT = 4000;
const TOTAL_SNAKES = 10;
const ORANGE_COUNT = 100;
const INITIAL_SCORE = 3;
const SNAKE_SPEED = 165;
const DEFAULT_SEGMENT_SPACING = 3;
const HEAD_RADIUS = 10;
const CAMERA_ZOOM = 1.1;
const HIGHSCORE_LIMIT = 10;
const HIGHSCORE_KEY = 'basilics-highscores';
const HEAD_TO_HEAD_DISTANCE = (HEAD_RADIUS * 2) - 2;
const HEAD_TO_BODY_DISTANCE = (HEAD_RADIUS * 2) - 2;
const POPUP_LIFETIME_MS = 520;
const MAJOR_SHAKE_DURATION_MS = 130;
const MAJOR_SHAKE_INTENSITY = 0.006;
const DEFAULT_BOT_LEVEL = 4;
const BOT_VISION_UNIT = 200;
const HUD_EMIT_INTERVAL_MS = 80;
const BOT_LOOK_AHEAD = 110;
const BOT_TRAP_STEP = 80;
const DEFAULT_BOT_DANGER_THRESHOLD = 640;
const BOT_DANGER_THRESHOLD_MIN = 300;
const BOT_DANGER_THRESHOLD_MAX = 1100;
const DEFAULT_BOT_AGGRESSIVITY_ACTIVE_LEVEL = 6;

const SNAKE_COLORS = [
    0x39ff14,
    0xff3b30,
    0x00bfff,
    0xffd60a,
    0xbf5af2,
    0xff6b00,
    0x2ee6a6,
    0xff2d55,
    0x5ac8fa,
    0xff9f0a
];

const ORANGE_COLOR = 0xff8c00;

const DIRECTIONS = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
];

function toHexColor (value)
{
    return `#${value.toString(16).padStart(6, '0')}`;
}

export class Game extends Scene
{
    constructor ()
    {
        super('Game');
        this.snakes = [];
        this.oranges = [];
        this.isGameOver = false;
        this.localPlayer = null;
        this.botTurnDelayMs = 250;
        this.setup = null;
        this.playerName = 'Joueur';
        this.elapsedTimeMs = 0;
        this.hudEmitTimer = 0;
        this.segmentSpacing = DEFAULT_SEGMENT_SPACING;
        this.botDangerThreshold = DEFAULT_BOT_DANGER_THRESHOLD;
        this.botAggressivityActiveLevel = DEFAULT_BOT_AGGRESSIVITY_ACTIVE_LEVEL;
    }

    init (data)
    {
        this.setup = (data && data.localSetup) ? data.localSetup : null;
        this.segmentSpacing = Number.isFinite(this.setup?.espacement)
            ? Math.max(1, Math.floor(this.setup.espacement))
            : DEFAULT_SEGMENT_SPACING;
        this.botDangerThreshold = Number.isFinite(this.setup?.seuilDanger)
            ? PhaserMath.Clamp(Math.floor(this.setup.seuilDanger), BOT_DANGER_THRESHOLD_MIN, BOT_DANGER_THRESHOLD_MAX)
            : DEFAULT_BOT_DANGER_THRESHOLD;
        this.botAggressivityActiveLevel = Number.isFinite(this.setup?.['agressivité_active_niveau'])
            ? PhaserMath.Clamp(Math.floor(this.setup['agressivité_active_niveau']), 1, 11)
            : DEFAULT_BOT_AGGRESSIVITY_ACTIVE_LEVEL;
    }

    create ()
    {
        this.isGameOver = false;
        this.snakes = [];
        this.oranges = [];
        this.elapsedTimeMs = 0;
        this.hudEmitTimer = 0;

        this.cameras.main.setBackgroundColor(0x102030);
        this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        this.cameras.main.setZoom(CAMERA_ZOOM);
        this.cameras.main.setRoundPixels(true);

        this.drawWorldBounds();
        this.createOranges(ORANGE_COUNT);

        const spawnPoints = this.createUniformSpawnPoints(TOTAL_SNAKES);

        const playerSnakeIndex = this.setup ? this.setup.playerSnakeIndex : 0;
        this.playerName = (this.setup && this.setup.playerName) ? this.setup.playerName : 'Joueur';

        const botLevelMap = {};
        if (this.setup)
        {
            for (const entry of this.setup.botLevels)
            {
                botLevelMap[entry.snakeIndex] = entry.level;
            }
        }

        for (let index = 0; index < TOTAL_SNAKES; index++)
        {
            const isPlayer = index === playerSnakeIndex;
            const color = SNAKE_COLORS[index % SNAKE_COLORS.length];
            const botLevel = isPlayer ? null : (botLevelMap[index] !== undefined ? botLevelMap[index] : DEFAULT_BOT_LEVEL);
            const snake = this.createSnake(`snake-${index + 1}`, spawnPoints[index], color, isPlayer, botLevel);
            this.snakes.push(snake);

            if (isPlayer)
            {
                this.localPlayer = snake;
            }
        }

        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys('W,A,S,D,Z,Q');
        this.restartKey = this.input.keyboard.addKey('R');

        this.cameras.main.startFollow(this.localPlayer.head, true, 1, 1);

        this.endPanel = this.add.rectangle(
            this.scale.width / 2,
            this.scale.height / 2,
            Math.min(680, this.scale.width - 40),
            240,
            0x000000,
            0.78
        ).setScrollFactor(0).setDepth(1100).setVisible(false);

        this.endText = this.add.text(this.scale.width / 2, this.scale.height / 2, '', {
            fontFamily: 'Arial Black',
            fontSize: 28,
            color: '#ffffff',
            align: 'center'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(1200).setVisible(false);

        this.scale.on('resize', this.handleResize, this);

        this.emitHudUpdate();

        EventBus.emit('current-scene-ready', this);
    }

    update (_, delta)
    {
        if (this.isGameOver)
        {
            if (Input.Keyboard.JustDown(this.restartKey))
            {
                this.scene.start('LocalSetup');
            }

            return;
        }

        this.elapsedTimeMs += delta;

        const dt = delta / 1000;

        for (const snake of this.snakes)
        {
            if (!snake.alive)
            {
                continue;
            }

            if (snake.isPlayer)
            {
                this.updatePlayerDirection(snake);
            }
            else
            {
                this.updateBotDirection(snake, delta);
            }

            this.moveSnake(snake, dt);
        }

        this.resolveSnakeCollisions();

        for (const snake of this.snakes)
        {
            if (!snake.alive)
            {
                continue;
            }

            this.handleOrangeCollection(snake);
            this.updateSnakeSegments(snake);
            this.updateSnakeScoreLabel(snake);
        }

        this.updateHud(delta);
    }

    createSnake (id, spawn, color, isPlayer, botLevel = DEFAULT_BOT_LEVEL)
    {
        const head = this.add.circle(spawn.x, spawn.y, HEAD_RADIUS, color).setDepth(20);

        const initialDirection = DIRECTIONS[spawn.directionIndex % DIRECTIONS.length];
        const segments = [];

        for (let index = 0; index < INITIAL_SCORE - 1; index++)
        {
            const segment = this.add.circle(
                spawn.x - (initialDirection.x * this.segmentSpacing * (index + 1)),
                spawn.y - (initialDirection.y * this.segmentSpacing * (index + 1)),
                HEAD_RADIUS - 2,
                color,
                0.85
            ).setDepth(10);

            segments.push(segment);
        }

        const scoreText = this.add.text(spawn.x, spawn.y - 26, String(INITIAL_SCORE), {
            fontFamily: 'Arial Black',
            fontSize: 18,
            color: toHexColor(color),
            stroke: '#111111',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(30);

        return {
            id,
            isPlayer,
            color,
            alive: true,
            score: INITIAL_SCORE,
            head,
            segments,
            scoreText,
            direction: { ...initialDirection },
            turnCooldown: 0,
            botLevel,
            history: this.createInitialHistory(spawn, initialDirection)
        };
    }

    createInitialHistory (spawn, direction)
    {
        const historyLength = (INITIAL_SCORE + 20) * this.segmentSpacing;
        const history = [];

        for (let index = 0; index < historyLength; index++)
        {
            history.push({
                x: spawn.x - (direction.x * index),
                y: spawn.y - (direction.y * index)
            });
        }

        return history;
    }

    createUniformSpawnPoints (count)
    {
        const points = [];
        const centerX = WORLD_WIDTH / 2;
        const centerY = WORLD_HEIGHT / 2;
        const radius = Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.35;

        for (let index = 0; index < count; index++)
        {
            const angle = (Math.PI * 2 * index) / count;

            points.push({
                x: centerX + Math.cos(angle) * radius,
                y: centerY + Math.sin(angle) * radius,
                directionIndex: index % DIRECTIONS.length
            });
        }

        return points;
    }

    updatePlayerDirection (snake)
    {
        let desired = null;

        if (this.cursors.left.isDown || this.wasd.A.isDown || this.wasd.Q.isDown)
        {
            desired = { x: -1, y: 0 };
        }
        else if (this.cursors.right.isDown || this.wasd.D.isDown)
        {
            desired = { x: 1, y: 0 };
        }
        else if (this.cursors.up.isDown || this.wasd.W.isDown || this.wasd.Z.isDown)
        {
            desired = { x: 0, y: -1 };
        }
        else if (this.cursors.down.isDown || this.wasd.S.isDown)
        {
            desired = { x: 0, y: 1 };
        }

        if (!desired)
        {
            return;
        }

        if ((desired.x + snake.direction.x === 0) && (desired.y + snake.direction.y === 0))
        {
            return;
        }

        snake.direction = desired;
    }

    updateBotDirection (snake, delta)
    {
        snake.turnCooldown -= delta;

        if (snake.turnCooldown > 0)
        {
            return;
        }

        snake.turnCooldown = this.botTurnDelayMs;

        const level = snake.botLevel !== null ? snake.botLevel : DEFAULT_BOT_LEVEL;
        const visionRange = level >= 10 ? Infinity : (level + 1) * BOT_VISION_UNIT;
        const attractionWeight = level * 0.2;
        const dangerWeight = 1.1 + (level * 0.2);
        const trapWeight = 1 + (level * 0.35);
        const rejectDangerThreshold = this.getRejectDangerThreshold(level);

        const target = this.findSafeTargetForBot(snake, level, visionRange, rejectDangerThreshold);

        const candidates = [...DIRECTIONS]
            .filter((direction) => !((direction.x + snake.direction.x === 0) && (direction.y + snake.direction.y === 0)))
            .map((direction) => {
                const risk = this.getDirectionRisk(snake, direction);
                const trapRisk = this.getTrapRisk(snake, direction, level);
                const combinedDanger = (risk * dangerWeight) + (trapRisk * trapWeight);

                if (risk === Number.MAX_SAFE_INTEGER)
                {
                    return {
                        direction,
                        score: -Number.MAX_SAFE_INTEGER,
                        combinedDanger: Number.MAX_SAFE_INTEGER
                    };
                }

                let attraction = 0;

                if (target)
                {
                    const dx = target.x - snake.head.x;
                    const dy = target.y - snake.head.y;
                    const len = Math.sqrt((dx * dx) + (dy * dy)) || 1;
                    attraction = ((direction.x * (dx / len)) + (direction.y * (dy / len))) * 200 * attractionWeight;

                    // Si la trajectoire est trop dangereuse, ignorer cette cible pour ce tick
                    if (combinedDanger > rejectDangerThreshold)
                    {
                        attraction = 0;
                    }
                }

                // Bots de bas niveau : injection d'aleatoire pour paraître moins efficaces
                const noise = level < 4 ? PhaserMath.Between(-40, 40) * (4 - level) : 0;

                return {
                    direction,
                    score: attraction - combinedDanger + noise,
                    combinedDanger
                };
            })
            .sort((left, right) => right.score - left.score);

        if (candidates.length === 0)
        {
            return;
        }

        const safeCandidates = candidates
            .filter((candidate) => candidate.combinedDanger !== Number.MAX_SAFE_INTEGER)
            .sort((left, right) => left.combinedDanger - right.combinedDanger);

        if (safeCandidates.length === 0)
        {
            return;
        }

        const bestCandidate = candidates[0];
        const safestCandidate = safeCandidates[0];

        // Si la meilleure option vers cible est trop risquée, on passe en mode survie
        if (target && bestCandidate.combinedDanger > rejectDangerThreshold)
        {
            snake.direction = safestCandidate.direction;
            return;
        }

        snake.direction = bestCandidate.direction;
    }

    getRejectDangerThreshold (level)
    {
        const baseThreshold = this.botDangerThreshold;

        // A partir du niveau 7, le seuil diminue progressivement jusqu'au min au niveau 10.
        if (level >= 7)
        {
            const progress = Math.min(1, (level - 7) / 3);
            return Math.round(baseThreshold + ((BOT_DANGER_THRESHOLD_MIN - baseThreshold) * progress));
        }

        return baseThreshold;
    }

    findSafeTargetForBot (snake, level, visionRange, rejectDangerThreshold)
    {
        const candidateTargets = [];

        if (level >= this.botAggressivityActiveLevel)
        {
            for (const other of this.snakes)
            {
                if (!other.alive || other === snake || other.score >= snake.score)
                {
                    continue;
                }

                const dist = PhaserMath.Distance.Between(snake.head.x, snake.head.y, other.head.x, other.head.y);
                if (dist <= visionRange)
                {
                    candidateTargets.push({
                        x: other.head.x,
                        y: other.head.y,
                        priority: 2,
                        distance: dist
                    });
                }
            }
        }

        for (const orange of this.oranges)
        {
            const dist = PhaserMath.Distance.Between(snake.head.x, snake.head.y, orange.x, orange.y);
            if (dist <= visionRange)
            {
                candidateTargets.push({
                    x: orange.x,
                    y: orange.y,
                    priority: 1,
                    distance: dist
                });
            }
        }

        candidateTargets.sort((left, right) => {
            if (left.priority !== right.priority)
            {
                return right.priority - left.priority;
            }

            return left.distance - right.distance;
        });

        for (const target of candidateTargets)
        {
            const preferredDirections = this.getPreferredDirectionsToTarget(snake, target);
            let bestApproachDanger = Number.MAX_SAFE_INTEGER;

            for (const direction of preferredDirections)
            {
                const risk = this.getDirectionRisk(snake, direction);
                if (risk === Number.MAX_SAFE_INTEGER)
                {
                    continue;
                }

                const trapRisk = this.getTrapRisk(snake, direction, level);
                const approachDanger = risk + trapRisk;
                if (approachDanger < bestApproachDanger)
                {
                    bestApproachDanger = approachDanger;
                }
            }

            if (bestApproachDanger < rejectDangerThreshold)
            {
                return target;
            }
        }

        return null;
    }

    getPreferredDirectionsToTarget (snake, target)
    {
        const dx = target.x - snake.head.x;
        const dy = target.y - snake.head.y;
        const horizontalFirst = Math.abs(dx) >= Math.abs(dy);

        const preferred = horizontalFirst
            ? [
                { x: dx >= 0 ? 1 : -1, y: 0 },
                { x: 0, y: dy >= 0 ? 1 : -1 }
            ]
            : [
                { x: 0, y: dy >= 0 ? 1 : -1 },
                { x: dx >= 0 ? 1 : -1, y: 0 }
            ];

        return preferred.filter((direction) => !((direction.x + snake.direction.x === 0) && (direction.y + snake.direction.y === 0)));
    }

    getTrapRisk (snake, initialDirection, level)
    {
        const steps = Math.min(6, 2 + Math.floor(level / 2));
        let simulatedX = snake.head.x;
        let simulatedY = snake.head.y;
        let currentDirection = initialDirection;
        let totalRisk = 0;

        for (let step = 0; step < steps; step++)
        {
            simulatedX += currentDirection.x * BOT_TRAP_STEP;
            simulatedY += currentDirection.y * BOT_TRAP_STEP;

            const possibleDirections = DIRECTIONS.filter((direction) => !((direction.x + currentDirection.x === 0) && (direction.y + currentDirection.y === 0)));
            const assessed = possibleDirections
                .map((direction) => ({
                    direction,
                    risk: this.getDirectionRiskFromPoint(snake, direction, simulatedX, simulatedY)
                }))
                .sort((left, right) => left.risk - right.risk);

            const valid = assessed.filter((entry) => entry.risk !== Number.MAX_SAFE_INTEGER);

            if (valid.length === 0)
            {
                return Number.MAX_SAFE_INTEGER;
            }

            if (valid.length === 1)
            {
                totalRisk += 240;
            }
            else if (valid.length === 2)
            {
                totalRisk += 110;
            }

            const borderDistance = Math.min(simulatedX, WORLD_WIDTH - simulatedX, simulatedY, WORLD_HEIGHT - simulatedY);
            if (borderDistance < 140)
            {
                totalRisk += (140 - borderDistance) * 1.5;
            }

            totalRisk += valid[0].risk * 0.35;
            currentDirection = valid[0].direction;
        }

        return Math.round(totalRisk);
    }

    getDirectionRiskFromPoint (snake, direction, originX, originY)
    {
        const nextX = originX + (direction.x * BOT_LOOK_AHEAD);
        const nextY = originY + (direction.y * BOT_LOOK_AHEAD);
        const borderPadding = 50;

        if (nextX <= borderPadding || nextX >= WORLD_WIDTH - borderPadding || nextY <= borderPadding || nextY >= WORLD_HEIGHT - borderPadding)
        {
            return Number.MAX_SAFE_INTEGER;
        }

        let risk = 0;

        for (const other of this.snakes)
        {
            if (!other.alive)
            {
                continue;
            }

            for (let index = 0; index < other.segments.length; index++)
            {
                if (other === snake && index < 2)
                {
                    continue;
                }

                const bodyPart = other.segments[index];
                const distance = PhaserMath.Distance.Between(nextX, nextY, bodyPart.x, bodyPart.y);

                if (distance <= HEAD_TO_BODY_DISTANCE + 6)
                {
                    return Number.MAX_SAFE_INTEGER;
                }

                if (distance < 80)
                {
                    risk += (80 - distance);
                }
            }

            if (other === snake)
            {
                continue;
            }

            const headDistance = PhaserMath.Distance.Between(nextX, nextY, other.head.x, other.head.y);
            if (headDistance < 72)
            {
                const dangerWeight = other.score >= snake.score ? 8 : 3;
                risk += (72 - headDistance) * dangerWeight;
            }
        }

        return Math.round(risk);
    }

    getDirectionRisk (snake, direction)
    {
        return this.getDirectionRiskFromPoint(snake, direction, snake.head.x, snake.head.y);
    }
    moveSnake (snake, dt)
    {
        const previousX = snake.head.x;
        const previousY = snake.head.y;
        this.checkVictoryCondition();

        if (this.isGameOver)
        {
            return;
        }

        snake.head.x += snake.direction.x * SNAKE_SPEED * dt;
        snake.head.y += snake.direction.y * SNAKE_SPEED * dt;

        snake.history.unshift({ x: snake.head.x, y: snake.head.y });

        const targetHistoryLength = Math.max(250, (snake.score + 10) * this.segmentSpacing);
        if (snake.history.length > targetHistoryLength)
        {
            snake.history.length = targetHistoryLength;
        }

        if (snake.history.length < 2)
        {
            snake.history.push({ x: previousX, y: previousY });
        }
    }

    updateSnakeSegments (snake)
    {
        const desiredSegmentCount = Math.max(0, snake.score - 1);

        while (snake.segments.length < desiredSegmentCount)
        {
            snake.segments.push(this.add.circle(snake.head.x, snake.head.y, HEAD_RADIUS - 2, snake.color, 0.85).setDepth(10));
        }

        while (snake.segments.length > desiredSegmentCount)
        {
            const removed = snake.segments.pop();
            removed.destroy();
        }

        for (let index = 0; index < snake.segments.length; index++)
        {
            const historyIndex = Math.min(snake.history.length - 1, (index + 1) * this.segmentSpacing);
            const historyPoint = snake.history[historyIndex];
            snake.segments[index].setPosition(historyPoint.x, historyPoint.y);
        }
    }

    updateSnakeScoreLabel (snake)
    {
        snake.scoreText.setText(String(snake.score));
        snake.scoreText.setPosition(snake.head.x, snake.head.y - 28);
    }

    createOranges (count)
    {
        for (let index = 0; index < count; index++)
        {
            this.spawnOrange(this.randomInWorld(20), this.randomInWorld(20, false));
        }
    }

    spawnOrange (x, y)
    {
        const orange = this.add.circle(x, y, 6, ORANGE_COLOR).setDepth(5);
        this.oranges.push(orange);
    }

    randomInWorld (padding, forX = true)
    {
        const min = padding;
        const max = (forX ? WORLD_WIDTH : WORLD_HEIGHT) - padding;
        return PhaserMath.Between(min, max);
    }

    handleOrangeCollection (snake)
    {
        for (let index = this.oranges.length - 1; index >= 0; index--)
        {
            const orange = this.oranges[index];

            if (PhaserMath.Distance.Between(snake.head.x, snake.head.y, orange.x, orange.y) <= HEAD_RADIUS + 6)
            {
                orange.destroy();
                this.oranges.splice(index, 1);
                snake.score += 1;
                this.spawnOrange(this.randomInWorld(20), this.randomInWorld(20, false));
                this.showScorePopup(snake.head.x, snake.head.y - 20, '+1', snake.color);
            }
        }
    }

    checkWallDeath (snake)
    {
        if (snake.head.x < 0 || snake.head.x > WORLD_WIDTH || snake.head.y < 0 || snake.head.y > WORLD_HEIGHT)
        {
            this.killSnake(snake);
        }
    }

    resolveSnakeCollisions ()
    {
        for (const snake of this.snakes)
        {
            if (!snake.alive)
            {
                continue;
            }

            this.checkWallDeath(snake);

            if (snake.alive)
            {
                this.checkSelfCollision(snake);
            }
        }

        for (let first = 0; first < this.snakes.length; first++)
        {
            const snakeA = this.snakes[first];
            if (!snakeA.alive)
            {
                continue;
            }

            for (let second = first + 1; second < this.snakes.length; second++)
            {
                const snakeB = this.snakes[second];
                if (!snakeB.alive)
                {
                    continue;
                }

                const headDistance = PhaserMath.Distance.Between(snakeA.head.x, snakeA.head.y, snakeB.head.x, snakeB.head.y);
                if (headDistance <= HEAD_TO_HEAD_DISTANCE)
                {
                    this.handleHeadToHead(snakeA, snakeB);
                }
            }
        }

        for (let attackerIndex = 0; attackerIndex < this.snakes.length; attackerIndex++)
        {
            const attacker = this.snakes[attackerIndex];
            if (!attacker.alive)
            {
                continue;
            }

            for (let defenderIndex = 0; defenderIndex < this.snakes.length; defenderIndex++)
            {
                if (attackerIndex === defenderIndex)
                {
                    continue;
                }

                const defender = this.snakes[defenderIndex];
                if (!defender.alive)
                {
                    continue;
                }

                const hitIndex = this.getBodyHitIndex(attacker, defender);
                if (hitIndex === -1)
                {
                    continue;
                }

                if (defender.score > attacker.score)
                {
                    this.killSnake(attacker);
                    break;
                }

                if (attacker.score > defender.score)
                {
                    this.truncateSnakeAt(defender, hitIndex);
                }

                break;
            }
        }
    }

    checkSelfCollision (snake)
    {
        for (let index = 2; index < snake.segments.length; index++)
        {
            const bodyPart = snake.segments[index];
            const distance = PhaserMath.Distance.Between(snake.head.x, snake.head.y, bodyPart.x, bodyPart.y);

            if (distance <= HEAD_TO_BODY_DISTANCE)
            {
                this.killSnake(snake);
                return;
            }

            if (index > 0)
            {
                const previous = snake.segments[index - 1];
                const gapDistance = this.distancePointToSegment(
                    snake.head.x,
                    snake.head.y,
                    previous.x,
                    previous.y,
                    bodyPart.x,
                    bodyPart.y
                );

                if (gapDistance <= HEAD_TO_BODY_DISTANCE - 2)
                {
                    this.killSnake(snake);
                    return;
                }
            }
        }
    }

    handleHeadToHead (snakeA, snakeB)
    {
        if (!snakeA.alive || !snakeB.alive)
        {
            return;
        }

        const impactX = (snakeA.head.x + snakeB.head.x) * 0.5;
        const impactY = (snakeA.head.y + snakeB.head.y) * 0.5;
        this.showImpactFlash(impactX, impactY, true);

        if (snakeA.score === snakeB.score)
        {
            this.killSnake(snakeA);
            this.killSnake(snakeB);
            return;
        }

        const bigger = snakeA.score > snakeB.score ? snakeA : snakeB;
        const smaller = bigger === snakeA ? snakeB : snakeA;
        const absorbedScore = smaller.score;

        this.killSnake(smaller, { spawnOranges: false });

        if (bigger.alive)
        {
            bigger.score += absorbedScore;
            this.showScorePopup(bigger.head.x, bigger.head.y - 25, `+${absorbedScore}`, bigger.color);
        }
    }

    getBodyHitIndex (attacker, defender)
    {
        for (let index = 0; index < defender.segments.length; index++)
        {
            const bodyPart = defender.segments[index];
            const distance = PhaserMath.Distance.Between(attacker.head.x, attacker.head.y, bodyPart.x, bodyPart.y);

            if (distance <= HEAD_TO_BODY_DISTANCE)
            {
                return index;
            }

            if (index > 0)
            {
                const previous = defender.segments[index - 1];
                const gapDistance = this.distancePointToSegment(
                    attacker.head.x,
                    attacker.head.y,
                    previous.x,
                    previous.y,
                    bodyPart.x,
                    bodyPart.y
                );

                if (gapDistance <= HEAD_TO_BODY_DISTANCE - 2)
                {
                    return index;
                }
            }
        }

        return -1;
    }

    truncateSnakeAt (snake, startIndex)
    {
        if (!snake.alive)
        {
            return;
        }

        const firstRemoved = snake.segments[startIndex];
        if (firstRemoved)
        {
            this.showImpactFlash(firstRemoved.x, firstRemoved.y);
        }

        const removed = snake.segments.splice(startIndex);

        for (const segment of removed)
        {
            this.spawnOrange(segment.x, segment.y);
            segment.destroy();
        }

        snake.score = Math.max(1, snake.segments.length + 1);
        snake.history.length = Math.max(250, (snake.score + 10) * this.segmentSpacing);
    }

    showImpactFlash (x, y, isMajor = false)
    {
        const flash = this.add.circle(x, y, 12, 0xffffff, 0.95).setDepth(60);

        if (isMajor)
        {
            this.cameras.main.shake(MAJOR_SHAKE_DURATION_MS, MAJOR_SHAKE_INTENSITY);
        }

        this.tweens.add({
            targets: flash,
            scale: { from: 1, to: 3.5 },
            alpha: { from: 0.95, to: 0 },
            duration: 180,
            ease: 'Sine.easeOut',
            onComplete: () => flash.destroy()
        });
    }

    showScorePopup (x, y, label, color)
    {
        const popup = this.add.text(x, y, label, {
            fontFamily: 'Arial Black',
            fontSize: 16,
            color: toHexColor(color),
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(70);

        this.tweens.add({
            targets: popup,
            y: y - 26,
            alpha: { from: 1, to: 0 },
            duration: POPUP_LIFETIME_MS,
            ease: 'Sine.easeOut',
            onComplete: () => popup.destroy()
        });
    }

    killSnake (snake, { spawnOranges = true } = {})
    {
        if (!snake.alive)
        {
            return;
        }

        snake.alive = false;

        for (const segment of snake.segments)
        {
            if (spawnOranges)
            {
                this.spawnOrange(segment.x, segment.y);
            }

            segment.destroy();
        }

        snake.segments = [];

        if (spawnOranges)
        {
            this.spawnOrange(snake.head.x, snake.head.y);
        }

        snake.head.destroy();
        snake.scoreText.destroy();

        if (snake.isPlayer && !this.isGameOver)
        {
            this.finishGame(snake.score, 'Tu es mort !');
        }
    }

    checkVictoryCondition ()
    {
        if (this.isGameOver || !this.localPlayer || !this.localPlayer.alive)
        {
            return;
        }

        const aliveSnakes = this.snakes.filter((snake) => snake.alive);
        if (aliveSnakes.length === 1 && aliveSnakes[0] === this.localPlayer)
        {
            this.finishGame(this.localPlayer.score, 'Victoire ! Tu es le dernier basilic en vie.');
        }
    }

    finishGame (finalScore, title)
    {
        this.isGameOver = true;

        const highscores = this.readHighscores();
        const qualifies = this.qualifiesForHighscore(finalScore, highscores);

        if (qualifies)
        {
            const rawName = this.playerName;
            const safeName = this.sanitizeName(rawName);
            highscores.push({
                name: safeName,
                score: finalScore,
                date: new Date().toISOString().slice(0, 10)
            });
            highscores.sort((a, b) => b.score - a.score);
            highscores.length = Math.min(HIGHSCORE_LIMIT, highscores.length);
            this.writeHighscores(highscores);
        }

        const top = this.readHighscores().slice(0, HIGHSCORE_LIMIT).map((entry, index) => `${index + 1}. ${entry.name} - ${entry.score}`).join('\n');
        const topText = top || 'Aucun score';
        const statusText = qualifies ? 'Nouveau highscore enregistre.' : 'Pas dans le top highscores cette fois.';

        this.endPanel.setVisible(true);
        this.endText
            .setVisible(true)
            .setText(`${title}\nScore: ${finalScore}\n${statusText}\n\nTop ${HIGHSCORE_LIMIT}:\n${topText}\n\nAppuie sur R pour retourner au menu`);
    }

    sanitizeName (value)
    {
        const trimmed = (value || '').trim().replace(/\s+/g, ' ');
        return (trimmed.length > 0 ? trimmed.slice(0, 16) : 'Anonyme');
    }

    readHighscores ()
    {
        try
        {
            const raw = window.localStorage.getItem(HIGHSCORE_KEY);
            if (!raw)
            {
                return [];
            }

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed))
            {
                return [];
            }

            return parsed
                .filter((entry) => typeof entry?.name === 'string' && Number.isFinite(entry?.score))
                .map((entry) => ({ name: entry.name, score: entry.score, date: entry.date || '' }))
                .sort((a, b) => b.score - a.score)
                .slice(0, HIGHSCORE_LIMIT);
        }
        catch
        {
            return [];
        }
    }

    writeHighscores (scores)
    {
        window.localStorage.setItem(HIGHSCORE_KEY, JSON.stringify(scores));
    }

    qualifiesForHighscore (score, highscores)
    {
        if (highscores.length < HIGHSCORE_LIMIT)
        {
            return true;
        }

        return score > highscores[highscores.length - 1].score;
    }

    updateHud (delta)
    {
        this.hudEmitTimer -= delta;

        if (this.hudEmitTimer > 0)
        {
            return;
        }

        this.hudEmitTimer = HUD_EMIT_INTERVAL_MS;
        this.emitHudUpdate();
    }

    emitHudUpdate ()
    {
        const aliveCount = this.snakes.filter((snake) => snake.alive).length;
        const score = this.localPlayer && this.localPlayer.alive ? this.localPlayer.score : 0;

        EventBus.emit('game-hud-update', {
            playerName: this.playerName,
            score,
            aliveCount,
            totalSnakes: TOTAL_SNAKES,
            elapsedTimeMs: this.elapsedTimeMs,
            world: {
                width: WORLD_WIDTH,
                height: WORLD_HEIGHT
            },
            oranges: this.oranges.map((orange) => ({ x: orange.x, y: orange.y })),
            snakes: this.snakes.filter((snake) => snake.alive).map((snake) => ({
                isPlayer: snake.isPlayer,
                head: { x: snake.head.x, y: snake.head.y },
                segments: snake.segments.map((segment) => ({ x: segment.x, y: segment.y }))
            }))
        });
    }

    distancePointToSegment (px, py, ax, ay, bx, by)
    {
        const abx = bx - ax;
        const aby = by - ay;
        const apx = px - ax;
        const apy = py - ay;
        const abLenSq = (abx * abx) + (aby * aby);

        if (abLenSq <= 0.0001)
        {
            return Math.hypot(px - ax, py - ay);
        }

        const t = Math.max(0, Math.min(1, ((apx * abx) + (apy * aby)) / abLenSq));
        const closestX = ax + (abx * t);
        const closestY = ay + (aby * t);

        return Math.hypot(px - closestX, py - closestY);
    }

    drawWorldBounds ()
    {
        const graphics = this.add.graphics();
        graphics.lineStyle(6, 0xffffff, 0.25);
        graphics.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    }

    handleResize (gameSize)
    {
        this.cameras.main.setSize(gameSize.width, gameSize.height);

        if (this.endPanel)
        {
            this.endPanel.setPosition(gameSize.width / 2, gameSize.height / 2);
            this.endPanel.setSize(Math.min(680, gameSize.width - 40), 240);
        }

        if (this.endText)
        {
            this.endText.setPosition(gameSize.width / 2, gameSize.height / 2);
        }
    }

    changeScene ()
    {
        this.scene.start('GameOver');
    }
}
