import { EventBus } from '../EventBus';
import { Input, Math as PhaserMath, Scene } from 'phaser';
import { GameAudioEngine } from '../audio/GameAudioEngine';

const WORLD_WIDTH = 4000;
const WORLD_HEIGHT = 4000;
const DEFAULT_TOTAL_SNAKES = 10;
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
const GAMEPAD_AXIS_DEADZONE = 0.35;
const DEFAULT_LIZARD_BOOST_MULTIPLIER = 2;
const DEFAULT_LIZARD_BOOST_DURATION_SEC = 3;
const DEFAULT_LIZARD_COOLDOWN_SEC = 50;
const DEFAULT_PLAYER_COLORS = [0x2f6bff, 0x7dff7a, 0xff47d7, 0xffe45a];

function generateSnakeColors (count)
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
        if (hue < 60) { r = c; g = x; b = 0; }
        else if (hue < 120) { r = x; g = c; b = 0; }
        else if (hue < 180) { r = 0; g = c; b = x; }
        else if (hue < 240) { r = 0; g = x; b = c; }
        else if (hue < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        const ri = Math.round((r + m) * 255);
        const gi = Math.round((g + m) * 255);
        const bi = Math.round((b + m) * 255);
        colors.push((ri << 16) | (gi << 8) | bi);
    }
    for (let index = 0; index < DEFAULT_PLAYER_COLORS.length && index < colors.length; index++)
    {
        colors[index] = DEFAULT_PLAYER_COLORS[index];
    }

    return colors;
}

const SNAKE_COLORS = generateSnakeColors(100);

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
        this.localPlayers = [];
        this.roster = [];
        this.botTurnDelayMs = 250;
        this.setup = null;
        this.playerName = 'Joueur';
        this.elapsedTimeMs = 0;
        this.hudEmitTimer = 0;
        this.segmentSpacing = DEFAULT_SEGMENT_SPACING;
        this.botDangerThreshold = DEFAULT_BOT_DANGER_THRESHOLD;
        this.botAggressivityActiveLevel = DEFAULT_BOT_AGGRESSIVITY_ACTIVE_LEVEL;
        this.matchConfig = null;
        this.maxSnakes = DEFAULT_TOTAL_SNAKES;
        this.extraCameras = [];
        this.lizardBoostMultiplier = DEFAULT_LIZARD_BOOST_MULTIPLIER;
        this.lizardBoostDurationSec = DEFAULT_LIZARD_BOOST_DURATION_SEC;
        this.lizardCooldownSec = DEFAULT_LIZARD_COOLDOWN_SEC;
        this.audioEngine = null;
    }

    init (data)
    {
        this.matchConfig = (data && data.matchConfig) ? data.matchConfig : null;
        this.setup = this.matchConfig || ((data && data.localSetup) ? data.localSetup : null);

        const gameplay = this.setup?.gameplay || {};
        const botSettings = this.setup?.botSettings || {};

        this.maxSnakes = Number.isFinite(this.setup?.maxSnakes)
            ? Math.max(1, Math.floor(this.setup.maxSnakes))
            : DEFAULT_TOTAL_SNAKES;
        this.segmentSpacing = Number.isFinite(gameplay.segmentSpacing)
            ? Math.max(1, Math.floor(gameplay.segmentSpacing))
            : (Number.isFinite(this.setup?.espacement)
                ? Math.max(1, Math.floor(this.setup.espacement))
                : DEFAULT_SEGMENT_SPACING);
        this.botDangerThreshold = Number.isFinite(botSettings.dangerThreshold)
            ? PhaserMath.Clamp(Math.floor(botSettings.dangerThreshold), BOT_DANGER_THRESHOLD_MIN, BOT_DANGER_THRESHOLD_MAX)
            : DEFAULT_BOT_DANGER_THRESHOLD;
        if (!Number.isFinite(botSettings.dangerThreshold))
        {
            this.botDangerThreshold = Number.isFinite(this.setup?.seuilDanger)
                ? PhaserMath.Clamp(Math.floor(this.setup.seuilDanger), BOT_DANGER_THRESHOLD_MIN, BOT_DANGER_THRESHOLD_MAX)
                : DEFAULT_BOT_DANGER_THRESHOLD;
        }
        this.botAggressivityActiveLevel = Number.isFinite(botSettings.aggressivityActiveLevel)
            ? PhaserMath.Clamp(Math.floor(botSettings.aggressivityActiveLevel), 1, 11)
            : (Number.isFinite(this.setup?.['agressivité_active_niveau'])
                ? PhaserMath.Clamp(Math.floor(this.setup['agressivité_active_niveau']), 1, 11)
                : DEFAULT_BOT_AGGRESSIVITY_ACTIVE_LEVEL);
        this.lizardBoostMultiplier = Number.isFinite(gameplay.lizardBoostMultiplier)
            ? PhaserMath.Clamp(Number(gameplay.lizardBoostMultiplier), 1.2, 4)
            : DEFAULT_LIZARD_BOOST_MULTIPLIER;
        this.lizardBoostDurationSec = Number.isFinite(gameplay.lizardBoostDurationSec)
            ? PhaserMath.Clamp(Math.floor(gameplay.lizardBoostDurationSec), 1, 15)
            : DEFAULT_LIZARD_BOOST_DURATION_SEC;
        this.lizardCooldownSec = Number.isFinite(gameplay.lizardCooldownSec)
            ? PhaserMath.Clamp(Math.floor(gameplay.lizardCooldownSec), 5, 120)
            : DEFAULT_LIZARD_COOLDOWN_SEC;
    }

    create ()
    {
        this.isGameOver = false;
        this.snakes = [];
        this.oranges = [];
        this.localPlayer = null;
        this.localPlayers = [];
        this.roster = [];
        this.elapsedTimeMs = 0;
        this.hudEmitTimer = 0;
        this.audioEngine = GameAudioEngine.get();
        this.audioEngine.ensureStarted();
        this.audioEngine.startMusic();

        this.events.once('shutdown', () => {
            this.audioEngine?.stopMusic();
        });
        this.events.once('destroy', () => {
            this.audioEngine?.stopMusic();
        });

        this.cameras.main.setBackgroundColor(0x102030);
        this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        this.cameras.main.setZoom(CAMERA_ZOOM);
        this.cameras.main.setRoundPixels(true);

        this.drawWorldBounds();
        this.createOranges(ORANGE_COUNT);

        this.roster = this.buildRoster();
        this.maxSnakes = this.roster.length;
        const spawnPoints = this.createUniformSpawnPoints(this.maxSnakes);

        for (let index = 0; index < this.roster.length; index++)
        {
            const snake = this.createSnake(this.roster[index], spawnPoints[index]);
            this.snakes.push(snake);

            if (snake.isLocalHuman)
            {
                this.localPlayers.push(snake);

                if (!this.localPlayer)
                {
                    this.localPlayer = snake;
                }
            }
        }

        this.localPlayers.sort((leftSnake, rightSnake) => leftSnake.playerSlot - rightSnake.playerSlot);
        this.localPlayer = this.localPlayers[0] || this.localPlayer;
        this.createSnakeViewerLabels();

        this.playerName = this.localPlayer?.name || 'Joueur';

        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys('W,A,S,D,Z,Q');
        this.ijkl = this.input.keyboard.addKeys('I,J,K,L');
        this.restartKey = this.input.keyboard.addKey('R');

        this.input.once('pointerdown', () => {
            this.audioEngine?.ensureStarted();
        });
        this.input.keyboard.once('keydown', () => {
            this.audioEngine?.ensureStarted();
        });

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

        this.configureLocalCameras(this.scale.width, this.scale.height);

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
            this.processPendingLizardRestore(snake);
            this.updateSnakeSegments(snake);
            this.updateSnakeScoreLabel(snake);
        }

        this.refreshCameraTargets();

        this.updateHud(delta);
    }

    buildRoster ()
    {
        const roster = [];
        const humans = Array.isArray(this.setup?.humanPlayers) && this.setup.humanPlayers.length > 0
            ? this.setup.humanPlayers
            : [{
                id: 'player-1',
                name: this.setup?.playerName || 'Joueur',
                snakeColorIndex: Number.isFinite(this.setup?.playerSnakeIndex) ? this.setup.playerSnakeIndex : 0,
                input: 'keyboard-zqsd',
                isLocal: true
            }];
        const botLevelMap = {};
        const configuredBotLevels = this.setup?.botSettings?.levelsBySnake || this.setup?.botLevels || [];

        for (const entry of configuredBotLevels)
        {
            botLevelMap[entry.snakeIndex] = entry.level;
        }

        const normalizedHumans = humans.map((player, index) => {
            const snakeIndex = PhaserMath.Clamp(
                Number.isFinite(player?.playerSlot) ? Math.floor(player.playerSlot) : index,
                0,
                this.maxSnakes - 1
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
                isPlayer: human.isLocal,
                isLocalHuman: human.isLocal,
                inputProfile: human.input,
                power: human.power,
                playerSlot: human.playerSlot,
                colorIndex: human.snakeColorIndex,
                botLevel: null
            };
        }

        const extraBotDefaultLevel = Number.isFinite(this.setup?.botSettings?.extraBotDefaultLevel)
            ? PhaserMath.Clamp(Math.floor(this.setup.botSettings.extraBotDefaultLevel), 1, 10)
            : (Number.isFinite(this.setup?.botSettings?.defaultLevel)
                ? PhaserMath.Clamp(Math.floor(this.setup.botSettings.defaultLevel), 1, 10)
                : DEFAULT_BOT_LEVEL);

        for (let snakeIndex = 0; snakeIndex < this.maxSnakes; snakeIndex++)
        {
            if (roster[snakeIndex])
            {
                continue;
            }

            roster[snakeIndex] = {
                id: `bot-${snakeIndex + 1}`,
                name: `Bot ${snakeIndex + 1}`,
                type: 'bot',
                isPlayer: false,
                isLocalHuman: false,
                inputProfile: null,
                power: 'sans',
                playerSlot: Number.MAX_SAFE_INTEGER,
                colorIndex: snakeIndex,
                botLevel: botLevelMap[snakeIndex] !== undefined ? botLevelMap[snakeIndex] : extraBotDefaultLevel
            };
        }

        return roster;
    }
    createSnake (snakeConfig, spawn)
    {
        const color = SNAKE_COLORS[snakeConfig.colorIndex % SNAKE_COLORS.length];
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

        const power = snakeConfig.power || 'sans';

        const snake = {
            id: snakeConfig.id,
            type: snakeConfig.type,
            name: snakeConfig.name,
            isPlayer: snakeConfig.isPlayer,
            isLocalHuman: snakeConfig.isLocalHuman,
            inputProfile: snakeConfig.inputProfile,
            playerSlot: Number.isFinite(snakeConfig.playerSlot) ? snakeConfig.playerSlot : Number.MAX_SAFE_INTEGER,
            power,
            color,
            alive: true,
            score: INITIAL_SCORE,
            head,
            segments,
            viewerLabels: [],
            direction: { ...initialDirection },
            turnCooldown: 0,
            botLevel: snakeConfig.botLevel,
            lizardBoostUntil: 0,
            lizardCooldownUntil: 0,
            pendingLizardRestoreSegments: 0,
            pendingLizardRestoreAt: 0,
            history: this.createInitialHistory(spawn, initialDirection)
        };

        return snake;
    }

    createSnakeViewerLabels ()
    {
        const viewerCount = Math.max(1, this.localPlayers.length);

        for (const snake of this.snakes)
        {
            snake.viewerLabels = [];

            for (let viewerIndex = 0; viewerIndex < viewerCount; viewerIndex++)
            {
                const label = this.add.text(snake.head.x, snake.head.y - 40, '', {
                    fontFamily: 'Arial Black',
                    fontSize: 13,
                    color: toHexColor(snake.color),
                    stroke: '#111111',
                    strokeThickness: 4,
                    align: 'center'
                }).setOrigin(0.5).setDepth(30);

                snake.viewerLabels.push(label);
            }

            this.updateSnakeScoreLabel(snake);
        }
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

        if (snake.inputProfile === 'joypad-1')
        {
            desired = this.getDirectionFromGamepad(0);
        }
        else if (snake.inputProfile === 'joypad-2')
        {
            desired = this.getDirectionFromGamepad(1);
        }
        else if (snake.inputProfile === 'keyboard-ijkl' || snake.inputProfile === 'keyboard-2')
        {
            if (this.ijkl.J.isDown)
            {
                desired = { x: -1, y: 0 };
            }
            else if (this.ijkl.L.isDown)
            {
                desired = { x: 1, y: 0 };
            }
            else if (this.ijkl.I.isDown)
            {
                desired = { x: 0, y: -1 };
            }
            else if (this.ijkl.K.isDown)
            {
                desired = { x: 0, y: 1 };
            }
        }
        else if (snake.inputProfile === 'keyboard-zqsd')
        {
            if (this.wasd.A.isDown || this.wasd.Q.isDown)
            {
                desired = { x: -1, y: 0 };
            }
            else if (this.wasd.D.isDown)
            {
                desired = { x: 1, y: 0 };
            }
            else if (this.wasd.W.isDown || this.wasd.Z.isDown)
            {
                desired = { x: 0, y: -1 };
            }
            else if (this.wasd.S.isDown)
            {
                desired = { x: 0, y: 1 };
            }
        }
        else if (snake.inputProfile === 'keyboard-arrows' || snake.inputProfile === 'keyboard-1')
        {
            if (this.cursors.left.isDown)
            {
                desired = { x: -1, y: 0 };
            }
            else if (this.cursors.right.isDown)
            {
                desired = { x: 1, y: 0 };
            }
            else if (this.cursors.up.isDown)
            {
                desired = { x: 0, y: -1 };
            }
            else if (this.cursors.down.isDown)
            {
                desired = { x: 0, y: 1 };
            }
        }
        else
        {
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

    getDirectionFromGamepad (padIndex)
    {
        const pad = this.input?.gamepad?.getPad ? this.input.gamepad.getPad(padIndex) : null;

        if (!pad || !pad.connected)
        {
            return null;
        }

        const leftButton = pad.left || pad.buttons?.[14];
        const rightButton = pad.right || pad.buttons?.[15];
        const upButton = pad.up || pad.buttons?.[12];
        const downButton = pad.down || pad.buttons?.[13];

        const isPressed = (button) => !!(button && (button.pressed || button.isDown || button.value > 0.5));

        if (isPressed(leftButton))
        {
            return { x: -1, y: 0 };
        }

        if (isPressed(rightButton))
        {
            return { x: 1, y: 0 };
        }

        if (isPressed(upButton))
        {
            return { x: 0, y: -1 };
        }

        if (isPressed(downButton))
        {
            return { x: 0, y: 1 };
        }

        const axisX = pad.axes?.[0]?.getValue ? pad.axes[0].getValue() : (pad.axes?.[0]?.value ?? pad.axes?.[0] ?? 0);
        const axisY = pad.axes?.[1]?.getValue ? pad.axes[1].getValue() : (pad.axes?.[1]?.value ?? pad.axes?.[1] ?? 0);

        if (Math.abs(axisX) > Math.abs(axisY) && Math.abs(axisX) >= GAMEPAD_AXIS_DEADZONE)
        {
            return axisX < 0 ? { x: -1, y: 0 } : { x: 1, y: 0 };
        }

        if (Math.abs(axisY) >= GAMEPAD_AXIS_DEADZONE)
        {
            return axisY < 0 ? { x: 0, y: -1 } : { x: 0, y: 1 };
        }

        return null;
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

        const speedMultiplier = (snake.power === 'lezard' && this.time.now < snake.lizardBoostUntil)
            ? this.lizardBoostMultiplier
            : 1;

        snake.head.x += snake.direction.x * SNAKE_SPEED * speedMultiplier * dt;
        snake.head.y += snake.direction.y * SNAKE_SPEED * speedMultiplier * dt;

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
        snake.viewerLabels.forEach((label, viewerIndex) => {
            const lines = [snake.name];

            if (this.viewerCanSeeSnakeSize(viewerIndex))
            {
                lines.push(`${snake.score}`);
            }

            if (snake.power === 'lezard')
            {
                const remaining = Math.max(0, Math.ceil((snake.lizardCooldownUntil - this.time.now) / 1000));
                if (remaining > 0)
                {
                    lines.push(`Lezard: ${remaining}s`);
                }
            }

            label.setVisible(snake.alive);
            label.setText(lines.join('\n'));
            label.setPosition(snake.head.x, snake.head.y - 40);
        });
    }

    viewerCanSeeSnakeSize (viewerIndex)
    {
        const viewerSnake = this.getCameraFollowTarget(viewerIndex);
        return viewerSnake?.alive === true && viewerSnake.power === 'lunette';
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

                if (snake.isLocalHuman)
                {
                    this.audioEngine?.playEat();
                }
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

        const canTriggerLizard = snake.power === 'lezard' && this.time.now >= snake.lizardCooldownUntil;

        if (canTriggerLizard)
        {
            snake.lizardBoostUntil = this.time.now + (this.lizardBoostDurationSec * 1000);
            snake.lizardCooldownUntil = this.time.now + (this.lizardCooldownSec * 1000);
            this.showScorePopup(snake.head.x, snake.head.y - 30, 'LEZARD!', snake.color);
        }

        const firstRemoved = snake.segments[startIndex];
        if (firstRemoved)
        {
            this.showImpactFlash(firstRemoved.x, firstRemoved.y);
        }

        const removed = snake.segments.splice(startIndex);
        const removedCount = removed.length;

        for (const segment of removed)
        {
            this.spawnOrange(segment.x, segment.y);
            segment.destroy();
        }

        snake.score = Math.max(1, snake.segments.length + 1);

        if (snake.isLocalHuman && removedCount > 0)
        {
            this.audioEngine?.playCut();
        }

        if (canTriggerLizard && removedCount > 0)
        {
            snake.pendingLizardRestoreSegments = removedCount;
            snake.pendingLizardRestoreAt = this.time.now + (this.lizardBoostDurationSec * 1000);
        }

        snake.history.length = Math.max(250, (snake.score + 10) * this.segmentSpacing);
    }

    processPendingLizardRestore (snake)
    {
        if (!snake.alive || snake.pendingLizardRestoreSegments <= 0)
        {
            return;
        }

        if (this.time.now < snake.pendingLizardRestoreAt)
        {
            return;
        }

        snake.score += snake.pendingLizardRestoreSegments;
        this.showScorePopup(
            snake.head.x,
            snake.head.y - 36,
            `QUEUE +${snake.pendingLizardRestoreSegments}`,
            snake.color
        );
        snake.pendingLizardRestoreSegments = 0;
        snake.pendingLizardRestoreAt = 0;
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

        if (snake.isLocalHuman)
        {
            this.audioEngine?.playDeath();
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
        snake.viewerLabels.forEach((label) => label.destroy());
        snake.viewerLabels = [];

        this.refreshCameraTargets();

        if (snake.isLocalHuman && !this.isGameOver)
        {
            const aliveLocalPlayers = this.getAliveLocalPlayers();

            if (aliveLocalPlayers.length === 0)
            {
                const bestLocalResult = this.getBestLocalResult();
                this.finishGame(bestLocalResult.score, 'Tous les joueurs locaux sont elimines !', bestLocalResult.name);
            }
        }
    }

    checkVictoryCondition ()
    {
        if (this.isGameOver)
        {
            return;
        }

        const aliveSnakes = this.snakes.filter((snake) => snake.alive);
        const aliveLocalPlayers = this.getAliveLocalPlayers();

        if (aliveLocalPlayers.length === 1 && aliveSnakes.length === 1 && aliveSnakes[0] === aliveLocalPlayers[0])
        {
            const winner = aliveLocalPlayers[0];
            this.finishGame(winner.score, `Victoire ! ${winner.name} est le dernier basilic en vie.`, winner.name);
        }
    }

    finishGame (finalScore, title, playerNameOverride = null)
    {
        this.isGameOver = true;
        this.audioEngine?.stopMusic();
        this.audioEngine?.playMatchEnd();
        const scoreOwnerName = this.sanitizeName(playerNameOverride || this.playerName);

        const highscores = this.readHighscores();
        const qualifies = this.qualifiesForHighscore(finalScore, highscores);

        if (qualifies)
        {
            highscores.push({
                name: scoreOwnerName,
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
        const localBoard = this.localPlayers
            .slice()
            .sort((a, b) => b.score - a.score)
            .map((snake) => `${snake.name}: ${snake.score}`)
            .join('\n');

        this.expandGameOverCamera(this.scale.width, this.scale.height);

        this.endPanel.setAlpha(0).setVisible(true);
        this.endText
            .setAlpha(0)
            .setVisible(true)
            .setText(`${title}\nScore retenu: ${finalScore} (${scoreOwnerName})\n${statusText}\n\nScores locaux:\n${localBoard || 'Aucun joueur local'}\n\nTop ${HIGHSCORE_LIMIT}:\n${topText}\n\nAppuie sur R pour retourner au menu`);

        this.tweens.add({
            targets: [this.endPanel, this.endText],
            alpha: { from: 0, to: 1 },
            duration: 260,
            ease: 'Sine.easeOut'
        });
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
        const primaryLocalPlayer = this.getPrimaryLocalPlayer();
        const score = primaryLocalPlayer && primaryLocalPlayer.alive ? primaryLocalPlayer.score : 0;
        const leftCameraTarget = this.getCameraFollowTarget(0);
        const rightCameraTarget = this.getCameraFollowTarget(1);
        const localPlayers = this.localPlayers.map((snake) => ({
            id: snake.id,
            name: snake.name,
            score: snake.score,
            alive: snake.alive,
            inputProfile: snake.inputProfile,
            color: snake.color,
            power: snake.power
        }));

        const allCameras = [this.cameras.main, ...this.extraCameras];
        const cameraFrames = allCameras.map((camera, index) => {
            const target = this.getCameraFollowTarget(index);
            return {
                x: camera.x,
                y: camera.y,
                width: camera.width,
                height: camera.height,
                color: target?.color || 0xffffff,
                playerName: target?.name || 'Aucun'
            };
        });

        EventBus.emit('game-hud-update', {
            playerName: primaryLocalPlayer?.name || this.playerName,
            score,
            aliveCount,
            totalSnakes: this.maxSnakes,
            viewMode: this.localPlayers.length > 1 ? 'split' : 'single',
            cameraTargets: {
                left: leftCameraTarget ? leftCameraTarget.name : 'Aucun',
                right: rightCameraTarget ? rightCameraTarget.name : 'Aucun'
            },
            cameraFrames,
            localPlayers,
            elapsedTimeMs: this.elapsedTimeMs,
            world: {
                width: WORLD_WIDTH,
                height: WORLD_HEIGHT
            },
            oranges: this.oranges.map((orange) => ({ x: orange.x, y: orange.y })),
            snakes: this.snakes.filter((snake) => snake.alive).map((snake) => ({
                isPlayer: snake.isPlayer,
                name: snake.name,
                color: snake.color,
                score: snake.score,
                head: { x: snake.head.x, y: snake.head.y },
                segments: snake.segments.map((segment) => ({ x: segment.x, y: segment.y }))
            }))
        });
    }

    getPrimaryLocalPlayer ()
    {
        if (this.localPlayers.length > 0)
        {
            return this.localPlayers[0];
        }

        return this.localPlayer;
    }

    getAliveLocalPlayers ()
    {
        return this.localPlayers.filter((snake) => snake.alive);
    }

    getBestLocalResult ()
    {
        if (this.localPlayers.length === 0)
        {
            return {
                name: this.playerName,
                score: 0
            };
        }

        let best = this.localPlayers[0];

        for (const snake of this.localPlayers)
        {
            if (snake.score > best.score)
            {
                best = snake;
            }
        }

        return {
            name: best.name,
            score: best.score
        };
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
        if (this.isGameOver)
        {
            this.expandGameOverCamera(gameSize.width, gameSize.height);
        }
        else
        {
            this.configureLocalCameras(gameSize.width, gameSize.height);
        }

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

    expandGameOverCamera (width = this.scale.width, height = this.scale.height)
    {
        for (const camera of this.extraCameras)
        {
            this.cameras.remove(camera, false);
        }
        this.extraCameras = [];

        this.cameras.main.setViewport(0, 0, width, height);
        this.cameras.main.setZoom(CAMERA_ZOOM);
        this.cameras.main.setRoundPixels(true);
        this.cameras.main.stopFollow();
    }

    configureLocalCameras (width, height)
    {
        for (const camera of this.extraCameras)
        {
            this.cameras.remove(camera, false);
        }
        this.extraCameras = [];

        const localCount = Math.max(1, this.localPlayers.length);
        let viewports = [];

        if (localCount === 1)
        {
            viewports = [{ x: 0, y: 0, width, height }];
        }
        else if (localCount === 2)
        {
            const halfWidth = Math.floor(width / 2);
            viewports = [
                { x: 0, y: 0, width: halfWidth, height },
                { x: halfWidth, y: 0, width: width - halfWidth, height }
            ];
        }
        else
        {
            const halfWidth = Math.floor(width / 2);
            const halfHeight = Math.floor(height / 2);
            viewports = [
                { x: 0, y: 0, width: halfWidth, height: halfHeight },
                { x: halfWidth, y: 0, width: width - halfWidth, height: halfHeight },
                { x: 0, y: halfHeight, width: halfWidth, height: height - halfHeight },
                { x: halfWidth, y: halfHeight, width: width - halfWidth, height: height - halfHeight }
            ];
        }

        const mainViewport = viewports[0];
        this.cameras.main.setViewport(mainViewport.x, mainViewport.y, mainViewport.width, mainViewport.height);
        this.cameras.main.setZoom(CAMERA_ZOOM);
        this.cameras.main.setRoundPixels(true);
        this.cameras.main.setBackgroundColor(0x102030);
        this.applyCameraLabelIsolation(this.cameras.main, 0);

        for (let index = 1; index < viewports.length; index++)
        {
            const viewport = viewports[index];
            const camera = this.cameras.add(viewport.x, viewport.y, viewport.width, viewport.height);
            camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
            camera.setRoundPixels(true);
            camera.setZoom(CAMERA_ZOOM);
            camera.setBackgroundColor(0x102030);
            if (this.endPanel && this.endText)
            {
                camera.ignore([this.endPanel, this.endText]);
            }
            this.applyCameraLabelIsolation(camera, index);
            this.extraCameras.push(camera);
        }

        this.refreshCameraTargets();
    }

    refreshCameraTargets ()
    {
        const allCameras = [this.cameras.main, ...this.extraCameras];

        for (let slotIndex = 0; slotIndex < allCameras.length; slotIndex++)
        {
            const target = this.getCameraFollowTarget(slotIndex);
            const camera = allCameras[slotIndex];

            if (target?.head)
            {
                camera.startFollow(target.head, true, 1, 1);
            }
        }
    }

    applyCameraLabelIsolation (camera, viewerIndex)
    {
        const labelsToIgnore = [];

        for (const snake of this.snakes)
        {
            snake.viewerLabels.forEach((label, labelIndex) => {
                if (labelIndex !== viewerIndex)
                {
                    labelsToIgnore.push(label);
                }
            });
        }

        if (labelsToIgnore.length > 0)
        {
            camera.ignore(labelsToIgnore);
        }
    }

    getCameraFollowTarget (slotIndex)
    {
        if (this.localPlayers.length === 0)
        {
            return null;
        }

        const slotPlayer = this.localPlayers[slotIndex];
        if (slotPlayer && slotPlayer.alive)
        {
            return slotPlayer;
        }

        for (const snake of this.localPlayers)
        {
            if (snake.alive)
            {
                return snake;
            }
        }

        return this.localPlayers[0] || null;
    }

    changeScene ()
    {
        this.scene.start('GameOver');
    }
}
