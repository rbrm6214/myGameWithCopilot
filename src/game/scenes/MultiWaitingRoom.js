import { Scene } from 'phaser';
import { LanClient } from '../network/LanClient';

const LOBBY_PORT = 3010;

export class MultiWaitingRoom extends Scene
{
    constructor ()
    {
        super('MultiWaitingRoom');
        this.connectionId = null;
        this.lobbyClient = null;
        this.lobbyConfig = null;
        this.lobbyState = null;
    }

    init (data)
    {
        this.lobbyConfig = data?.lobbyConfig || null;
        this.lobbyState = null;
        this.connectionId = null;
        this.handoverToMatch = false;
        this.chatInputValue = '';
        this.chatCursorTimer = null;
        this.chatKeydownHandler = null;
    }

    create ()
    {
        this.events.once('shutdown', () => {
            if (this.chatCursorTimer)
            {
                this.chatCursorTimer.remove();
            }

            if (this.chatKeydownHandler)
            {
                this.input.keyboard.off('keydown', this.chatKeydownHandler);
            }

            if (!this.handoverToMatch)
            {
                this.lobbyClient?.disconnect();
            }
        });

        this.add.image(512, 384, 'background').setAlpha(0.2);
        this.add.rectangle(512, 384, 960, 710, 0x07131f, 0.9)
            .setStrokeStyle(2, 0xffffff, 0.18);

        this.add.text(512, 58, 'Salle d\'attente multi', {
            fontFamily: 'Arial Black',
            fontSize: 34,
            color: '#ffffff',
            stroke: '#12283a',
            strokeThickness: 8
        }).setOrigin(0.5);

        this.serverIpText = this.add.text(70, 104, `IP serveur: ${this.lobbyConfig?.network?.serverIp || '-'}`, {
            fontFamily: 'Arial',
            fontSize: 20,
            color: '#c4d8e7'
        });

        this.maxPlayersText = this.add.text(760, 104, `Max joueurs: ${this.lobbyConfig?.maxPlayers || 0}`, {
            fontFamily: 'Arial',
            fontSize: 20,
            color: '#c4d8e7'
        }).setOrigin(1, 0);

        this.add.text(70, 132, 'Joueurs connectes', {
            fontFamily: 'Arial Black',
            fontSize: 22,
            color: '#ffffff'
        });

        this.add.text(570, 132, 'Options de lobby', {
            fontFamily: 'Arial Black',
            fontSize: 22,
            color: '#ffffff'
        });

        this.add.text(570, 300, 'Chat', {
            fontFamily: 'Arial Black',
            fontSize: 22,
            color: '#ffffff'
        });

        this.playersContainer = this.add.container(70, 150);
        this.chatContainer = this.add.container(570, 320);
        this.createLobbyOptionControls();
        this.createFooterButtons();
        this.createChatInputField();

        this.statusText = this.add.text(512, 710, 'Connexion au lobby...', {
            fontFamily: 'Arial',
            fontSize: 18,
            color: '#ffce80',
            align: 'center'
        }).setOrigin(0.5);

        this.connectToLobby();
    }

    createLobbyOptionControls ()
    {
        this.add.text(570, 170, 'Completer joueurs par bot ?', {
            fontFamily: 'Arial',
            fontSize: 18,
            color: '#c4d8e7'
        });

        const toggleButton = this.add.rectangle(870, 182, 110, 34, 0x44647a, 1)
            .setStrokeStyle(1, 0xffffff, 0.4)
            .setInteractive({ useHandCursor: true });

        this.fillBotsValueText = this.add.text(870, 182, 'Non', {
            fontFamily: 'Arial Black',
            fontSize: 18,
            color: '#ffffff'
        }).setOrigin(0.5);

        toggleButton.on('pointerdown', () => {
            if (!this.isHostSession())
            {
                return;
            }

            this.lobbyClient?.updateLobbyOptions({
                fillWithBots: !this.lobbyState?.fillWithBots,
                botDifficulty: this.lobbyState?.botDifficulty || 5
            });
        });

        this.add.text(570, 206, 'Mode de jeu', {
            fontFamily: 'Arial',
            fontSize: 18,
            color: '#c4d8e7'
        });

        this.gameModeButton = this.add.rectangle(870, 218, 110, 34, 0x44647a, 1)
            .setStrokeStyle(1, 0xffffff, 0.4)
            .setInteractive({ useHandCursor: true });

        this.gameModeValueText = this.add.text(870, 218, 'Light', {
            fontFamily: 'Arial Black',
            fontSize: 16,
            color: '#ffffff'
        }).setOrigin(0.5);

        this.gameModeButton.on('pointerdown', () => {
            if (!this.isHostSession())
            {
                return;
            }

            const currentMode = this.lobbyState?.gameMode === 'full' ? 'full' : 'light';
            const nextMode = currentMode === 'light' ? 'full' : 'light';

            this.lobbyClient?.updateLobbyOptions({
                fillWithBots: Boolean(this.lobbyState?.fillWithBots),
                botDifficulty: this.lobbyState?.botDifficulty || 5,
                gameMode: nextMode
            });
        });

        this.botDifficultyRow = this.add.container(570, 230);
        const difficultyLabel = this.add.text(0, 0, 'Difficulte bots', {
            fontFamily: 'Arial',
            fontSize: 18,
            color: '#c4d8e7'
        });

        const minusButton = this.add.rectangle(170, 14, 28, 28, 0x44647a, 1)
            .setStrokeStyle(1, 0xffffff, 0.4)
            .setInteractive({ useHandCursor: true });

        const minusLabel = this.add.text(170, 14, '-', {
            fontFamily: 'Arial Black',
            fontSize: 22,
            color: '#ffffff'
        }).setOrigin(0.5);

        this.botDifficultyValueText = this.add.text(210, 2, '5', {
            fontFamily: 'Arial Black',
            fontSize: 20,
            color: '#ffce80'
        });

        const plusButton = this.add.rectangle(250, 14, 28, 28, 0x44647a, 1)
            .setStrokeStyle(1, 0xffffff, 0.4)
            .setInteractive({ useHandCursor: true });

        const plusLabel = this.add.text(250, 14, '+', {
            fontFamily: 'Arial Black',
            fontSize: 22,
            color: '#ffffff'
        }).setOrigin(0.5);

        minusButton.on('pointerdown', () => this.changeBotDifficulty(-1));
        plusButton.on('pointerdown', () => this.changeBotDifficulty(1));
        this.botDifficultyRow.add([difficultyLabel, minusButton, minusLabel, this.botDifficultyValueText, plusButton, plusLabel]);
    }

    createFooterButtons ()
    {
        const leaveButton = this.add.rectangle(170, 650, 220, 52, 0x6b2a2a, 1)
            .setStrokeStyle(2, 0xffffff, 0.35)
            .setInteractive({ useHandCursor: true });

        this.add.text(170, 650, 'Quitter', {
            fontFamily: 'Arial Black',
            fontSize: 22,
            color: '#ffffff'
        }).setOrigin(0.5);

        leaveButton.on('pointerdown', () => {
            this.lobbyClient?.disconnect();
            this.scene.start('MainMenu');
        });

        this.startButton = this.add.rectangle(834, 650, 220, 52, 0x1fa44a, 1)
            .setStrokeStyle(2, 0xffffff, 0.35)
            .setInteractive({ useHandCursor: true });

        this.startLabel = this.add.text(834, 650, 'Demarrer', {
            fontFamily: 'Arial Black',
            fontSize: 22,
            color: '#ffffff'
        }).setOrigin(0.5);

        this.startButton.on('pointerdown', () => {
            if (this.isHostSession())
            {
                this.lobbyClient?.startMatch();
            }
        });
    }

    async connectToLobby ()
    {
        const serverIp = this.lobbyConfig?.network?.connectionHost || this.lobbyConfig?.network?.serverIp || 'localhost';
        this.lobbyClient = new LanClient({
            serverIp,
            port: LOBBY_PORT,
            onMessage: (message) => this.handleLobbyMessage(message),
            onClose: () => {
                this.statusText.setText('Connexion fermee.');
            },
            onError: () => {
                this.statusText.setText('Serveur LAN introuvable. Lance npm run lan-server sur la machine hote.');
            }
        });

        try
        {
            await this.lobbyClient.connect();
            this.lobbyClient.startPolling(800, 'lobby');
            this.statusText.setText('Connecte. Initialisation du lobby...');
            if (this.lobbyConfig?.role === 'host')
            {
                this.lobbyClient.createLobby(this.lobbyConfig);
            }
            else
            {
                this.lobbyClient.joinLobby(this.lobbyConfig);
            }
        }
        catch
        {
            this.statusText.setText('Impossible de se connecter au lobby LAN.');
        }
    }

    handleLobbyMessage (message)
    {
        switch (message.type)
        {
        case 'session:hello':
            this.connectionId = message.payload.connectionId;
            break;
        case 'lobby:state':
            this.lobbyState = message.payload;
            this.renderLobbyState();
            break;
        case 'system:error':
            this.statusText.setText(message.payload.message || 'Erreur reseau');
            break;
        case 'match:started':
            this.handoverToMatch = true;
            this.lobbyClient?.stopPolling();
            this.scene.start(message.payload?.gameMode === 'full' ? 'MultiGameFull' : 'MultiGame', {
                matchPayload: message.payload,
                lobbyClient: this.lobbyClient,
                connectionId: this.connectionId,
                serverIp: this.lobbyConfig?.network?.serverIp || 'localhost'
            });
            break;
        default:
            break;
        }
    }

    renderLobbyState ()
    {
        if (!this.lobbyState)
        {
            return;
        }

        this.serverIpText.setText(`IP serveur: ${this.lobbyState.serverIp}`);
        this.maxPlayersText.setText(`Max joueurs: ${this.lobbyState.players.length}/${this.lobbyState.maxPlayers}`);
        this.fillBotsValueText.setText(this.lobbyState.fillWithBots ? 'Oui' : 'Non');
        this.gameModeValueText.setText(this.lobbyState.gameMode === 'full' ? 'Full' : 'Light');
        this.botDifficultyValueText.setText(String(this.lobbyState.botDifficulty));
        this.botDifficultyRow.setVisible(Boolean(this.lobbyState.fillWithBots));
        this.gameModeButton.setAlpha(this.isHostSession() ? 1 : 0.45);
        this.gameModeValueText.setAlpha(this.isHostSession() ? 1 : 0.85);
        this.startButton.setAlpha(this.isHostSession() ? 1 : 0.45);
        this.startLabel.setAlpha(this.isHostSession() ? 1 : 0.45);
        this.statusText.setText(this.lobbyState.statusMessage || 'En attente des joueurs...');

        this.playersContainer.removeAll(true);
        const title = this.add.text(0, 0, `${this.lobbyState.players.length} / ${this.lobbyState.maxPlayers} joueurs`, {
            fontFamily: 'Arial',
            fontSize: 18,
            color: '#ffce80'
        });
        this.playersContainer.add(title);

        this.lobbyState.players.forEach((player, index) => {
            const y = 44 + (index * 34);
            const isLocalOwner = player.ownerConnectionId === this.connectionId;
            const roleText = player.isHost ? 'Host' : (isLocalOwner ? 'Local' : 'Distant');
            const colorChip = this.add.circle(12, y + 10, 8, player.color || 0xffffff);
            const label = this.add.text(28, y, `${player.name} (${roleText})`, {
                fontFamily: 'Arial',
                fontSize: 18,
                color: '#d9efff'
            });
            this.playersContainer.add([colorChip, label]);
        });

        this.chatContainer.removeAll(true);
        const chatBox = this.add.rectangle(0, 0, 330, 220, 0x07131f, 0.96)
            .setOrigin(0, 0)
            .setStrokeStyle(1, 0xffffff, 0.18);
        this.chatContainer.add(chatBox);

        const chatLines = this.lobbyState.chatMessages.length > 0
            ? this.lobbyState.chatMessages.slice(-7).map((entry) => `${entry.author}: ${entry.message}`)
            : ['Aucun message'];
        const chatText = this.add.text(12, 12, chatLines.join('\n'), {
            fontFamily: 'Arial',
            fontSize: 16,
            color: '#ffffff',
            wordWrap: { width: 306 },
            lineSpacing: 6
        });
        this.chatContainer.add(chatText);
    }

    createChatInputField ()
    {
        const fieldY = 548;
        const inputWidth = 262;
        const btnWidth = 84;
        const fieldHeight = 30;
        const inputCenterX = 570 + inputWidth / 2;
        const btnCenterX = 570 + inputWidth + 6 + btnWidth / 2;
        const centerY = fieldY + fieldHeight / 2;

        this.add.rectangle(inputCenterX, centerY, inputWidth, fieldHeight, 0x0d1e2e, 1)
            .setStrokeStyle(1, 0x4477aa, 1);

        this.chatInputDisplay = this.add.text(578, fieldY + 7, '', {
            fontFamily: 'Arial',
            fontSize: 15,
            color: '#ffffff'
        });

        this.chatCursorVisible = true;
        this.chatCursorTimer = this.time.addEvent({
            delay: 530,
            repeat: -1,
            callback: () => {
                this.chatCursorVisible = !this.chatCursorVisible;
                this.refreshChatInputDisplay();
            }
        });

        const sendBtn = this.add.rectangle(btnCenterX, centerY, btnWidth, fieldHeight, 0x1e5aa8, 1)
            .setStrokeStyle(1, 0xffffff, 0.4)
            .setInteractive({ useHandCursor: true });

        this.add.text(btnCenterX, centerY, 'Envoyer', {
            fontFamily: 'Arial Black',
            fontSize: 13,
            color: '#ffffff'
        }).setOrigin(0.5);

        const sendMessage = () => {
            const msg = this.chatInputValue.trim();
            if (msg.length > 0)
            {
                this.lobbyClient?.sendChatMessage(msg);
                this.chatInputValue = '';
                this.refreshChatInputDisplay();
            }
        };

        sendBtn.on('pointerdown', sendMessage);

        this.chatKeydownHandler = (event) => {
            if (event.key === 'Enter')
            {
                sendMessage();
            }
            else if (event.key === 'Backspace')
            {
                this.chatInputValue = this.chatInputValue.slice(0, -1);
                this.refreshChatInputDisplay();
                event.stopPropagation();
            }
            else if (event.key.length === 1 && this.chatInputValue.length < 80)
            {
                this.chatInputValue += event.key;
                this.refreshChatInputDisplay();
            }
        };

        this.input.keyboard.on('keydown', this.chatKeydownHandler);
        this.refreshChatInputDisplay();
    }

    refreshChatInputDisplay ()
    {
        const cursor = this.chatCursorVisible ? '|' : ' ';
        this.chatInputDisplay?.setText(this.chatInputValue + cursor);
    }

    changeBotDifficulty (delta)
    {
        if (!this.isHostSession() || !this.lobbyState?.fillWithBots)
        {
            return;
        }

        this.lobbyClient?.updateLobbyOptions({
            fillWithBots: this.lobbyState.fillWithBots,
            botDifficulty: Math.max(1, Math.min(10, this.lobbyState.botDifficulty + delta))
        });
    }

    isHostSession ()
    {
        return Boolean(this.lobbyState && this.connectionId && this.lobbyState.hostConnectionId === this.connectionId);
    }
}