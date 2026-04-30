import { Input, Scene } from 'phaser';
import { LanClient } from '../network/LanClient';

const LOBBY_PORT = 3010;

export class MultiGame extends Scene
{
    constructor ()
    {
        super('MultiGame');
        this.matchPayload = null;
        this.lobbyClient = null;
        this.connectionId = null;
        this.serverIp = 'localhost';
        this.matchState = null;
        this.connectionView = null;
        this.lastSentByProfile = new Map();
    }

    init (data)
    {
        this.matchPayload = data?.matchPayload || null;
        this.lobbyClient = data?.lobbyClient || null;
        this.connectionId = data?.connectionId || null;
        this.serverIp = data?.serverIp || 'localhost';
        this.matchState = null;
        this.connectionView = null;
        this.lastSentByProfile.clear();
    }

    async create ()
    {
        this.events.once('shutdown', this.onSceneShutdown, this);
        this.events.once('destroy', this.onSceneShutdown, this);

        this.add.image(512, 384, 'background').setAlpha(0.16);
        this.add.rectangle(512, 384, 1000, 730, 0x07131f, 0.86)
            .setStrokeStyle(2, 0xffffff, 0.18);

        this.add.text(512, 44, 'Partie multi synchronisee (serveur autoritaire)', {
            fontFamily: 'Arial Black',
            fontSize: 30,
            color: '#ffffff',
            stroke: '#12283a',
            strokeThickness: 8
        }).setOrigin(0.5);

        this.statusText = this.add.text(512, 80, 'Connexion au flux de simulation...', {
            fontFamily: 'Arial',
            fontSize: 18,
            color: '#ffce80',
            align: 'center'
        }).setOrigin(0.5);

        this.worldFrame = this.add.rectangle(120, 108, 768, 576, 0x07131f, 0.94)
            .setOrigin(0, 0)
            .setStrokeStyle(2, 0xffffff, 0.2);

        this.worldGraphics = this.add.graphics();
        this.hudText = this.add.text(904, 120, '', {
            fontFamily: 'Arial',
            fontSize: 16,
            color: '#d9efff',
            lineSpacing: 6,
            wordWrap: { width: 220 }
        }).setOrigin(0, 0);

        const backButton = this.add.rectangle(904, 650, 220, 52, 0x6b2a2a, 1)
            .setStrokeStyle(2, 0xffffff, 0.35)
            .setInteractive({ useHandCursor: true });

        this.add.text(904, 650, 'Quitter lobby', {
            fontFamily: 'Arial Black',
            fontSize: 20,
            color: '#ffffff'
        }).setOrigin(0.5);

        backButton.on('pointerdown', () => {
            this.lobbyClient?.disconnect();
            this.scene.start('MainMenu');
        });

        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys('W,A,S,D,Q,Z');
        this.ijkl = this.input.keyboard.addKeys('I,J,K,L');

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

        this.lobbyClient.startPolling(100, 'match');
        this.statusText.setText('Simulation en cours.');
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
        case 'lobby:state':
            break;
        default:
            break;
        }
    }

    update ()
    {
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
    }

    renderSnapshot ()
    {
        if (!this.matchState)
        {
            return;
        }

        const worldWidth = this.matchState.world.width;
        const worldHeight = this.matchState.world.height;
        const drawWidth = 768;
        const drawHeight = 576;
        const cellSize = Math.max(4, Math.floor(Math.min(drawWidth / worldWidth, drawHeight / worldHeight)));
        const offsetX = this.worldFrame.x + Math.floor((drawWidth - (worldWidth * cellSize)) / 2);
        const offsetY = this.worldFrame.y + Math.floor((drawHeight - (worldHeight * cellSize)) / 2);

        this.worldGraphics.clear();
        this.worldGraphics.fillStyle(0x0d2437, 1);
        this.worldGraphics.fillRect(this.worldFrame.x, this.worldFrame.y, drawWidth, drawHeight);

        for (const food of this.matchState.food)
        {
            this.worldGraphics.fillStyle(0xffa540, 1);
            this.worldGraphics.fillRect(offsetX + (food.x * cellSize), offsetY + (food.y * cellSize), cellSize, cellSize);
        }

        for (const player of this.matchState.players)
        {
            const color = Number.isFinite(player.color) ? player.color : 0xffffff;
            const alpha = player.alive ? 1 : 0.4;
            this.worldGraphics.fillStyle(color, alpha);

            for (const segment of player.segments)
            {
                this.worldGraphics.fillRect(offsetX + (segment.x * cellSize), offsetY + (segment.y * cellSize), cellSize, cellSize);
            }
        }

        const lines = [];
        lines.push(`Tick: ${this.matchState.tick}`);
        lines.push(`Etat: ${this.matchState.active ? 'En cours' : 'Terminee'}`);
        lines.push('');
        lines.push('Scores');

        const sorted = [...this.matchState.players]
            .sort((left, right) => right.score - left.score);
        for (const player of sorted)
        {
            const suffix = player.alive ? '' : ' (KO)';
            lines.push(`${player.name}: ${player.score}${suffix}`);
        }

        if (this.matchState.winnerName)
        {
            lines.push('');
            lines.push(`Vainqueur: ${this.matchState.winnerName}`);
        }

        this.hudText.setText(lines.join('\n'));
        this.statusText.setText(this.matchState.active ? 'Simulation autoritaire active.' : 'Partie terminee.');
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

    onSceneShutdown ()
    {
        if (this.lobbyClient)
        {
            this.lobbyClient.stopPolling();
            this.lobbyClient.onMessage = null;
            this.lobbyClient.onClose = null;
            this.lobbyClient.onError = null;
        }
    }
}