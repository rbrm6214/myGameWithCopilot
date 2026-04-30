import { Input, Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { LanClient } from '../network/LanClient';
import { GameAudioEngine } from '../audio/GameAudioEngine';

const LOBBY_PORT = 3010;
const WORLD_WIDTH = 4000;
const WORLD_HEIGHT = 4000;
const CAMERA_ZOOM = 1.05;
const MIN_CAMERA_ZOOM = 0.72;
const MAX_CAMERA_ZOOM = 1.45;
const POLL_INTERVAL_MS = 100;

export class MultiGameFull extends Scene
{
    constructor ()
    {
        super('MultiGameFull');
        this.matchPayload = null;
        this.lobbyClient = null;
        this.connectionId = null;
        this.serverIp = 'localhost';
        this.matchState = null;
        this.connectionView = null;
        this.lastSentByProfile = new Map();
        this.remoteSnakes = new Map();
        this.remoteOranges = new Map();
        this.localPlayers = [];
        this.extraCameras = [];
        this.cameraFollowTargets = [];
        this.activeCameraCount = 1;
        this.hasShownMatchEnd = false;
        this.currentZoom = CAMERA_ZOOM;
        this.audioEngine = null;
        this.previousControlledState = new Map();
    }

    init (data)
    {
        this.matchPayload = data?.matchPayload || null;
        this.lobbyClient = data?.lobbyClient || null;
        this.connectionId = data?.connectionId || null;
        this.serverIp = data?.serverIp || this.matchPayload?.serverIp || 'localhost';
        this.matchState = null;
        this.connectionView = null;
        this.lastSentByProfile.clear();
        this.remoteSnakes.clear();
        this.remoteOranges.clear();
        this.localPlayers = [];
        this.extraCameras = [];
        this.cameraFollowTargets = [];
        this.activeCameraCount = 1;
        this.hasShownMatchEnd = false;
        this.currentZoom = CAMERA_ZOOM;
        this.previousControlledState.clear();
    }

    async create ()
    {
        this.events.once('shutdown', this.onSceneShutdown, this);
        this.events.once('destroy', this.onSceneShutdown, this);

        this.audioEngine = GameAudioEngine.get();
        this.audioEngine.ensureStarted();
        this.audioEngine.startMusic();

        this.cameras.main.setBackgroundColor(0x091521);
        this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        this.cameras.main.setZoom(this.currentZoom);
        this.cameras.main.setRoundPixels(true);
        this.cameras.main.setBackgroundColor(0x091521);

        this.backgroundImage = this.add.image(512, 384, 'background').setAlpha(0.1).setScrollFactor(0);

        this.worldGraphics = this.add.graphics();
        this.overlayPanel = this.add.rectangle(512, 44, 920, 56, 0x07131f, 0.72)
            .setScrollFactor(0)
            .setStrokeStyle(2, 0xffffff, 0.18);
        this.titleText = this.add.text(512, 32, 'Mode Multi Full', {
            fontFamily: 'Arial Black',
            fontSize: 28,
            color: '#ffffff',
            stroke: '#12283a',
            strokeThickness: 8
        }).setOrigin(0.5).setScrollFactor(0);
        this.statusText = this.add.text(512, 60, 'Connexion au flux full...', {
            fontFamily: 'Arial',
            fontSize: 16,
            color: '#ffce80',
            align: 'center'
        }).setOrigin(0.5).setScrollFactor(0);

        this.leaderboardPanel = this.add.rectangle(906, 240, 216, 280, 0x07131f, 0.8)
            .setScrollFactor(0)
            .setStrokeStyle(1, 0xffffff, 0.2)
            .setDepth(35);
        this.leaderboardTitle = this.add.text(906, 112, 'Classement', {
            fontFamily: 'Arial Black',
            fontSize: 20,
            color: '#ffffff'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(36);
        this.leaderboardText = this.add.text(810, 136, 'En attente de donnees...', {
            fontFamily: 'Arial',
            fontSize: 15,
            color: '#d9efff',
            lineSpacing: 5,
            wordWrap: { width: 188 }
        }).setScrollFactor(0).setDepth(36);

        this.helpText = this.add.text(136, 726, 'Molette: zoom | Echap: quitter lobby', {
            fontFamily: 'Arial',
            fontSize: 14,
            color: '#9cc8df'
        }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(36);

        this.endPanel = this.add.rectangle(512, 384, 700, 250, 0x000000, 0.82)
            .setStrokeStyle(2, 0xffffff, 0.25)
            .setScrollFactor(0)
            .setDepth(90)
            .setVisible(false);
        this.endText = this.add.text(512, 350, '', {
            fontFamily: 'Arial Black',
            fontSize: 28,
            color: '#ffffff',
            align: 'center',
            lineSpacing: 10
        }).setOrigin(0.5).setScrollFactor(0).setDepth(91).setVisible(false);
        this.endHint = this.add.text(512, 442, 'Entrer: retour menu', {
            fontFamily: 'Arial',
            fontSize: 20,
            color: '#ffce80'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(91).setVisible(false);

        this.drawWorldBounds();

        this.backButton = this.add.rectangle(888, 724, 240, 48, 0x6b2a2a, 1)
            .setStrokeStyle(2, 0xffffff, 0.35)
            .setInteractive({ useHandCursor: true })
            .setScrollFactor(0)
            .setDepth(40);

        this.backButtonLabel = this.add.text(888, 724, 'Quitter lobby', {
            fontFamily: 'Arial Black',
            fontSize: 20,
            color: '#ffffff'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(41);

        this.backButton.on('pointerdown', () => {
            this.lobbyClient?.disconnect();
            this.scene.start('MainMenu');
        });

        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys('W,A,S,D,Q,Z');
        this.ijkl = this.input.keyboard.addKeys('I,J,K,L');
        this.escapeKey = this.input.keyboard.addKey('ESC');
        this.enterKey = this.input.keyboard.addKey('ENTER');

        this.input.once('pointerdown', () => {
            this.audioEngine?.ensureStarted();
        });
        this.input.keyboard.once('keydown', () => {
            this.audioEngine?.ensureStarted();
        });

        this.input.on('wheel', (_, __, ___, deltaY) => {
            const nextZoom = deltaY > 0 ? this.currentZoom - 0.06 : this.currentZoom + 0.06;
            this.currentZoom = Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, nextZoom));
            this.cameras.main.setZoom(this.currentZoom);

            for (const camera of this.extraCameras)
            {
                camera.setZoom(this.currentZoom);
            }
        });

        this.scale.on('resize', this.handleResize, this);
        this.configureLocalCameras(this.scale.width, this.scale.height);

        EventBus.emit('current-scene-ready', this);
        await this.ensureClient();
    }

    async ensureClient ()
    {
        if (!this.lobbyClient)
        {
            this.lobbyClient = new LanClient({
                serverIp: this.serverIp,
                port: LOBBY_PORT,
                onMessage: (message) => this.handleMessage(message),
                onClose: () => {
                    this.statusText.setText('Connexion fermee.');
                },
                onError: () => {
                    this.statusText.setText('Connexion multi perdue.');
                }
            });

            await this.lobbyClient.connect();
            this.connectionId = this.lobbyClient.connectionId;
        }
        else
        {
            this.lobbyClient.onMessage = (message) => this.handleMessage(message);
            this.lobbyClient.onClose = () => {
                this.statusText.setText('Connexion fermee.');
            };
            this.lobbyClient.onError = () => {
                this.statusText.setText('Connexion multi perdue.');
            };
        }

        this.lobbyClient.startPolling(POLL_INTERVAL_MS, 'match');
        this.statusText.setText('Simulation full en cours.');
    }

    handleMessage (message)
    {
        switch (message.type)
        {
        case 'session:hello':
            this.connectionId = message.payload.connectionId;
            break;
        case 'match:state':
            this.matchState = message.payload.matchState;
            this.connectionView = message.payload.connectionView;
            this.renderSnapshot();
            break;
        default:
            break;
        }
    }

    update ()
    {
        if (Input.Keyboard.JustDown(this.escapeKey))
        {
            this.lobbyClient?.disconnect();
            this.scene.start('MainMenu');
            return;
        }

        if (this.endPanel.visible && Input.Keyboard.JustDown(this.enterKey))
        {
            this.lobbyClient?.disconnect();
            this.scene.start('MainMenu');
            return;
        }

        if (!this.connectionView)
        {
            return;
        }

        for (const inputProfile of this.connectionView.controlledProfiles || [])
        {
            const direction = this.getDesiredDirectionForProfile(inputProfile);
            if (!direction)
            {
                continue;
            }

            const previous = this.lastSentByProfile.get(inputProfile);
            if (previous && previous.x === direction.x && previous.y === direction.y)
            {
                continue;
            }

            this.lastSentByProfile.set(inputProfile, direction);
            this.lobbyClient?.sendPlayerInput(inputProfile, direction).catch(() => undefined);
        }

        this.updateCameraTarget();
    }

    renderSnapshot ()
    {
        if (!this.matchState || this.matchState.mode !== 'full')
        {
            return;
        }

        this.worldGraphics.clear();
        this.drawGrid();
        this.worldGraphics.lineStyle(6, 0xffffff, 0.18);
        this.worldGraphics.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

        const controlledIds = new Set(this.connectionView?.controlledPlayerIds || []);

        for (const orange of this.matchState.oranges || [])
        {
            this.worldGraphics.fillStyle(0xff8c00, 1);
            this.worldGraphics.fillCircle(orange.x, orange.y, 6);
        }

        for (const snake of this.matchState.snakes || [])
        {
            const color = Number.isFinite(snake.color) ? snake.color : 0xffffff;
            const alpha = snake.alive ? 1 : 0.28;
            this.worldGraphics.fillStyle(color, alpha);

            for (const segment of snake.segments || [])
            {
                this.worldGraphics.fillCircle(segment.x, segment.y, 8);
            }

            this.worldGraphics.fillCircle(snake.x, snake.y, 10);

            if (snake.alive)
            {
                this.worldGraphics.lineStyle(2, color, 0.9);
                this.worldGraphics.strokeCircle(snake.x, snake.y, 14);

                if (controlledIds.has(snake.id))
                {
                    this.worldGraphics.lineStyle(3, 0xffffff, 0.9);
                    this.worldGraphics.strokeCircle(snake.x, snake.y, 21);
                }
            }
        }

        this.localPlayers = this.resolveLocalPlayers();
        this.playControlledSnakeAudio(this.matchState);
        if (!this.matchState.active)
        {
            this.expandGameOverCamera();
            this.showMatchEndPanel();
        }
        else if (this.endPanel.visible)
        {
            this.endPanel.setVisible(false);
            this.endText.setVisible(false);
            this.endHint.setVisible(false);
            this.hasShownMatchEnd = false;
            this.configureLocalCameras(this.scale.width, this.scale.height);
        }
        else
        {
            this.ensureCameraLayout();
            this.refreshCameraTargets();
        }

        this.updateHud();
        this.updateLeaderboard();

        this.statusText.setText(
            this.matchState.active
                ? `Simulation full autoritaire active (tick ${this.matchState.tick})`
                : 'Partie terminee.'
        );
    }

    drawGrid ()
    {
        this.worldGraphics.lineStyle(1, 0xffffff, 0.05);

        for (let x = 0; x <= WORLD_WIDTH; x += 200)
        {
            this.worldGraphics.lineBetween(x, 0, x, WORLD_HEIGHT);
        }

        for (let y = 0; y <= WORLD_HEIGHT; y += 200)
        {
            this.worldGraphics.lineBetween(0, y, WORLD_WIDTH, y);
        }
    }

    resolveLocalPlayers ()
    {
        const controlledIds = new Set(this.connectionView?.controlledPlayerIds || []);
        return (this.matchState?.snakes || []).filter((snake) => controlledIds.has(snake.id));
    }

    ensureCameraLayout ()
    {
        const expectedCount = Math.max(1, this.localPlayers.length);
        if (expectedCount !== this.activeCameraCount)
        {
            this.configureLocalCameras(this.scale.width, this.scale.height);
        }
    }

    updateCameraTarget ()
    {
        if (this.cameraFollowTargets.length === 0)
        {
            return;
        }

        for (let slotIndex = 0; slotIndex < this.cameraFollowTargets.length; slotIndex++)
        {
            const followTarget = this.cameraFollowTargets[slotIndex];
            const targetSnake = this.getCameraFollowTarget(slotIndex);

            if (followTarget && targetSnake)
            {
                followTarget.setPosition(targetSnake.x, targetSnake.y);
            }
        }
    }

    updateHud ()
    {
        const aliveSnakes = (this.matchState?.snakes || []).filter((snake) => snake.alive);
        const primaryLocalPlayer = this.getCameraFollowTarget(0);
        const secondaryLocalPlayer = this.getCameraFollowTarget(1);
        const allCameras = [this.cameras.main, ...this.extraCameras];
        const isSplitView = Boolean(this.matchState?.active) && this.localPlayers.length > 1 && allCameras.length > 1;
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
            playerName: primaryLocalPlayer?.name || 'Joueur',
            score: primaryLocalPlayer?.score || 0,
            aliveCount: aliveSnakes.length,
            totalSnakes: this.matchState?.snakes?.length || 0,
            viewMode: isSplitView ? 'split' : 'single',
            cameraTargets: {
                left: primaryLocalPlayer?.name || 'Aucun',
                right: secondaryLocalPlayer?.name || 'Aucun'
            },
            cameraFrames,
            localPlayers: this.localPlayers.map((snake) => ({
                id: snake.id,
                name: snake.name,
                score: snake.score,
                alive: snake.alive,
                inputProfile: this.getInputProfileForSnake(snake.id),
                color: snake.color,
                power: snake.power
            })),
            elapsedTimeMs: (this.matchState?.tick || 0) * (this.matchState?.world?.tickMs || 0),
            world: {
                width: this.matchState?.world?.width || WORLD_WIDTH,
                height: this.matchState?.world?.height || WORLD_HEIGHT
            },
            oranges: (this.matchState?.oranges || []).map((orange) => ({ x: orange.x, y: orange.y })),
            snakes: (this.matchState?.snakes || []).filter((snake) => snake.alive).map((snake) => ({
                isPlayer: snake.isPlayer,
                name: snake.name,
                color: snake.color,
                score: snake.score,
                head: { x: snake.x, y: snake.y },
                segments: snake.segments || []
            }))
        });
    }

    updateLeaderboard ()
    {
        if (!this.matchState?.snakes)
        {
            this.leaderboardText.setText('Aucune donnee');
            return;
        }

        const lines = [];
        const sorted = [...this.matchState.snakes]
            .sort((left, right) => right.score - left.score)
            .slice(0, 8);

        for (let index = 0; index < sorted.length; index++)
        {
            const snake = sorted[index];
            const mark = snake.alive ? '' : ' (KO)';
            lines.push(`${index + 1}. ${snake.name}: ${snake.score}${mark}`);
        }

        this.leaderboardText.setText(lines.join('\n') || 'Aucune donnee');
    }

    playControlledSnakeAudio (state)
    {
        const controlledIds = new Set(this.connectionView?.controlledPlayerIds || []);
        const nextMap = new Map();

        for (const snake of state?.snakes || [])
        {
            if (!controlledIds.has(snake.id))
            {
                continue;
            }

            const previous = this.previousControlledState.get(snake.id);

            if (previous)
            {
                if (previous.alive && !snake.alive)
                {
                    this.audioEngine?.playDeath();
                }
                else if (snake.alive)
                {
                    if (snake.score > previous.score)
                    {
                        this.audioEngine?.playEat();
                    }
                    else if (snake.score < previous.score)
                    {
                        this.audioEngine?.playCut();
                    }
                }
            }

            nextMap.set(snake.id, {
                alive: Boolean(snake.alive),
                score: Number.isFinite(snake.score) ? snake.score : 0
            });
        }

        this.previousControlledState = nextMap;
    }

    showMatchEndPanel ()
    {
        if (this.hasShownMatchEnd)
        {
            return;
        }

        const winner = this.matchState?.winnerName || 'Aucun';
        const score = Number.isFinite(this.matchState?.finalScore) ? this.matchState.finalScore : 0;
        this.endText.setText(`Partie terminee\nVainqueur: ${winner}\nScore: ${score}`);
        this.audioEngine?.stopMusic();
        this.audioEngine?.playMatchEnd();

        this.endPanel.setAlpha(0).setVisible(true);
        this.endText.setAlpha(0).setVisible(true);
        this.endHint.setAlpha(0).setVisible(true);

        this.tweens.add({
            targets: [this.endPanel, this.endText, this.endHint],
            alpha: { from: 0, to: 1 },
            duration: 260,
            ease: 'Sine.easeOut'
        });

        this.hasShownMatchEnd = true;
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

        return slotPlayer || this.localPlayers[0] || null;
    }

    handleResize (gameSize)
    {
        if (this.matchState?.active)
        {
            this.configureLocalCameras(gameSize.width, gameSize.height);
        }
        else
        {
            this.expandGameOverCamera(gameSize.width, gameSize.height);
        }

        if (this.overlayPanel)
        {
            this.overlayPanel.setPosition(gameSize.width / 2, 44);
        }
        if (this.titleText)
        {
            this.titleText.setPosition(gameSize.width / 2, 32);
        }
        if (this.statusText)
        {
            this.statusText.setPosition(gameSize.width / 2, 60);
        }
        if (this.endPanel)
        {
            this.endPanel.setPosition(gameSize.width / 2, gameSize.height / 2);
        }
        if (this.endText)
        {
            this.endText.setPosition(gameSize.width / 2, (gameSize.height / 2) - 34);
        }
        if (this.endHint)
        {
            this.endHint.setPosition(gameSize.width / 2, (gameSize.height / 2) + 58);
        }
    }

    configureLocalCameras (width, height)
    {
        for (const camera of this.extraCameras)
        {
            this.cameras.remove(camera, false);
        }
        this.extraCameras = [];

        const localCount = Math.max(1, this.localPlayers.length);
        this.activeCameraCount = localCount;

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
        this.cameras.main.setZoom(this.currentZoom);
        this.cameras.main.setRoundPixels(true);
        this.cameras.main.setBackgroundColor(0x091521);

        const fixedUi = this.getFixedUiElements();

        for (let index = 1; index < viewports.length; index++)
        {
            const viewport = viewports[index];
            const camera = this.cameras.add(viewport.x, viewport.y, viewport.width, viewport.height);
            camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
            camera.setRoundPixels(true);
            camera.setZoom(this.currentZoom);
            camera.setBackgroundColor(0x091521);
            if (fixedUi.length > 0)
            {
                camera.ignore(fixedUi);
            }
            this.extraCameras.push(camera);
        }

        const totalCameras = Math.max(1, viewports.length);
        while (this.cameraFollowTargets.length < totalCameras)
        {
            this.cameraFollowTargets.push(this.add.zone(0, 0, 2, 2));
        }
        while (this.cameraFollowTargets.length > totalCameras)
        {
            const removed = this.cameraFollowTargets.pop();
            removed.destroy();
        }

        this.refreshCameraTargets();
    }

    expandGameOverCamera (width = this.scale.width, height = this.scale.height)
    {
        for (const camera of this.extraCameras)
        {
            this.cameras.remove(camera, false);
        }
        this.extraCameras = [];
        this.activeCameraCount = 1;

        this.cameras.main.setViewport(0, 0, width, height);
        this.cameras.main.setZoom(this.currentZoom);
        this.cameras.main.setRoundPixels(true);
        this.cameras.main.setBackgroundColor(0x091521);

        const followTarget = this.cameraFollowTargets[0];
        const targetSnake = this.getCameraFollowTarget(0);

        if (followTarget && targetSnake)
        {
            followTarget.setPosition(targetSnake.x, targetSnake.y);
            this.cameras.main.startFollow(followTarget, true, 0.12, 0.12);
        }
        else
        {
            this.cameras.main.stopFollow();
        }

        if (this.cameraFollowTargets.length > 1)
        {
            for (let index = this.cameraFollowTargets.length - 1; index >= 1; index--)
            {
                const removed = this.cameraFollowTargets.pop();
                removed?.destroy();
            }
        }
    }

    refreshCameraTargets ()
    {
        const allCameras = [this.cameras.main, ...this.extraCameras];

        for (let slotIndex = 0; slotIndex < allCameras.length; slotIndex++)
        {
            const camera = allCameras[slotIndex];
            const followTarget = this.cameraFollowTargets[slotIndex];
            const targetSnake = this.getCameraFollowTarget(slotIndex);

            if (!camera || !followTarget || !targetSnake)
            {
                camera?.stopFollow();
                continue;
            }

            followTarget.setPosition(targetSnake.x, targetSnake.y);
            camera.startFollow(followTarget, true, 0.12, 0.12);
        }
    }

    getFixedUiElements ()
    {
        return [
            this.backgroundImage,
            this.overlayPanel,
            this.titleText,
            this.statusText,
            this.leaderboardPanel,
            this.leaderboardTitle,
            this.leaderboardText,
            this.helpText,
            this.backButton,
            this.backButtonLabel,
            this.endPanel,
            this.endText,
            this.endHint
        ].filter(Boolean);
    }

    getInputProfileForSnake (snakeId)
    {
        const snakeIndex = (this.connectionView?.controlledPlayerIds || []).indexOf(snakeId);
        if (snakeIndex === -1)
        {
            return null;
        }

        return this.connectionView?.controlledProfiles?.[snakeIndex] || null;
    }

    getDesiredDirectionForProfile (inputProfile)
    {
        if (inputProfile === 'keyboard-arrows')
        {
            if (Input.Keyboard.JustDown(this.cursors.left)) return { x: -1, y: 0 };
            if (Input.Keyboard.JustDown(this.cursors.right)) return { x: 1, y: 0 };
            if (Input.Keyboard.JustDown(this.cursors.up)) return { x: 0, y: -1 };
            if (Input.Keyboard.JustDown(this.cursors.down)) return { x: 0, y: 1 };
        }

        if (inputProfile === 'keyboard-zqsd')
        {
            if (Input.Keyboard.JustDown(this.wasd.A) || Input.Keyboard.JustDown(this.wasd.Q)) return { x: -1, y: 0 };
            if (Input.Keyboard.JustDown(this.wasd.D)) return { x: 1, y: 0 };
            if (Input.Keyboard.JustDown(this.wasd.W) || Input.Keyboard.JustDown(this.wasd.Z)) return { x: 0, y: -1 };
            if (Input.Keyboard.JustDown(this.wasd.S)) return { x: 0, y: 1 };
        }

        if (inputProfile === 'keyboard-ijkl')
        {
            if (Input.Keyboard.JustDown(this.ijkl.J)) return { x: -1, y: 0 };
            if (Input.Keyboard.JustDown(this.ijkl.L)) return { x: 1, y: 0 };
            if (Input.Keyboard.JustDown(this.ijkl.I)) return { x: 0, y: -1 };
            if (Input.Keyboard.JustDown(this.ijkl.K)) return { x: 0, y: 1 };
        }

        if (inputProfile === 'joypad-1')
        {
            return this.getDirectionFromGamepad(0);
        }

        if (inputProfile === 'joypad-2')
        {
            return this.getDirectionFromGamepad(1);
        }

        return null;
    }

    getDirectionFromGamepad (index)
    {
        const pad = this.input?.gamepad?.gamepads?.[index];
        if (!pad || !pad.connected)
        {
            return null;
        }

        const axisX = pad.axes.length > 0 ? pad.axes[0].getValue() : 0;
        const axisY = pad.axes.length > 1 ? pad.axes[1].getValue() : 0;
        const deadZone = 0.45;

        if (Math.abs(axisX) < deadZone && Math.abs(axisY) < deadZone)
        {
            return null;
        }

        if (Math.abs(axisX) > Math.abs(axisY))
        {
            return axisX < 0 ? { x: -1, y: 0 } : { x: 1, y: 0 };
        }

        return axisY < 0 ? { x: 0, y: -1 } : { x: 0, y: 1 };
    }

    drawWorldBounds ()
    {
        const graphics = this.add.graphics();
        graphics.lineStyle(6, 0xffffff, 0.12);
        graphics.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    }

    onSceneShutdown ()
    {
        this.audioEngine?.stopMusic();
        this.scale.off('resize', this.handleResize, this);

        for (const camera of this.extraCameras)
        {
            this.cameras.remove(camera, false);
        }
        this.extraCameras = [];

        for (const target of this.cameraFollowTargets)
        {
            target.destroy();
        }
        this.cameraFollowTargets = [];

        EventBus.emit('game-hud-update', {
            playerName: 'Joueur',
            score: 0,
            aliveCount: 0,
            totalSnakes: 0,
            viewMode: 'single',
            cameraTargets: { left: 'Aucun', right: 'Aucun' },
            cameraFrames: [],
            localPlayers: [],
            elapsedTimeMs: 0,
            world: { width: 1, height: 1 },
            oranges: [],
            snakes: []
        });

        if (this.lobbyClient)
        {
            this.lobbyClient.stopPolling();
            this.lobbyClient.onMessage = null;
            this.lobbyClient.onClose = null;
            this.lobbyClient.onError = null;
        }
    }
}
