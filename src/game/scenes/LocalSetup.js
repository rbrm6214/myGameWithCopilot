import { Scene } from 'phaser';
import { resolveLocalNetworkInfo } from '../network/LanClient';

const MAX_SNAKES = 100;
const DEFAULT_LOCAL_PLAYERS = 1;
const MAX_LOCAL_PLAYERS = 4;
const DEFAULT_BOT_LEVEL = 5;
const ESPACEMENT = 5;
const SEUIL_DANGER = 550;
const AGRESSIVITE_ACTIVE_NIVEAU = 11;
const INPUT_PROFILE_OPTIONS = ['keyboard-arrows', 'keyboard-zqsd', 'keyboard-ijkl', 'joypad-1', 'joypad-2'];
const POWER_OPTIONS = ['sans', 'lunette', 'lezard'];
const DEFAULT_PLAYER_COLORS = [0x2f6bff, 0x7dff7a, 0xff47d7, 0xffe45a];

function generateSnakeColors (count)
{
    const colors = [];
    for (let i = 0; i < count; i++)
    {
        const hue = (i * 360 / count) % 360;
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
        colors.push((redInt << 16) | (greenInt << 8) | blueInt);
    }

    for (let index = 0; index < DEFAULT_PLAYER_COLORS.length && index < colors.length; index++)
    {
        colors[index] = DEFAULT_PLAYER_COLORS[index];
    }

    return colors;
}

const SNAKE_COLORS = generateSnakeColors(MAX_SNAKES);

function clampInteger (value, min, max, fallback)
{
    const parsed = Number.isFinite(value) ? Math.floor(value) : Number.parseInt(value, 10);
    const safeValue = Number.isFinite(parsed) ? parsed : fallback;
    return Math.max(min, Math.min(max, safeValue));
}

function defaultPlayerConfig (index)
{
    const defaults = [
        { name: 'Joueur 1', snakeIndex: 0, input: 'keyboard-zqsd', power: 'sans' },
        { name: 'Joueur 2', snakeIndex: 1, input: 'keyboard-arrows', power: 'sans' },
        { name: 'Joueur 3', snakeIndex: 2, input: 'keyboard-ijkl', power: 'sans' },
        { name: 'Joueur 4', snakeIndex: 3, input: 'joypad-1', power: 'sans' }
    ];

    return defaults[index] || {
        name: `Joueur ${index + 1}`,
        snakeIndex: index,
        input: INPUT_PROFILE_OPTIONS[index % INPUT_PROFILE_OPTIONS.length],
        power: 'sans'
    };
}

export class LocalSetup extends Scene
{
    constructor ()
    {
        super('LocalSetup');
        this.mode = 'local';
        this.localPlayersCount = DEFAULT_LOCAL_PLAYERS;
        this.playerConfigs = Array.from({ length: MAX_LOCAL_PLAYERS }, (_, index) => defaultPlayerConfig(index));
        this.botCount = 3;
        this.botDifficulty = DEFAULT_BOT_LEVEL;
        this.maxPlayers = 4;
        this.lizardBoostDurationSec = 3;
        this.lizardCooldownSec = 50;
        this.localIp = '127.0.0.1';
        this.serverIp = '';
        this.serverStatus = 'Serveur LAN non detecte';
        this.playerRowElements = [];
        this.sceneActive = false;
        this.colorPaletteVisible = false;
        this.colorPalettePlayerIndex = -1;
        this.colorPaletteSwatches = [];
    }

    init (data)
    {
        this.mode = data?.mode === 'multi' ? 'multi' : 'local';
    }

    create ()
    {
        this.sceneActive = true;
        this.playerRowElements = [];
        this.events.once('shutdown', () => {
            this.sceneActive = false;
            this.playerRowElements = [];
        });

        this.add.image(512, 384, 'background').setAlpha(0.25);
        this.add.rectangle(512, 384, 940, 700, 0x05121d, 0.86)
            .setStrokeStyle(2, 0xffffff, 0.16);

        this.add.text(512, 54, this.mode === 'multi' ? 'Jeu Multi Internet - Configuration' : 'Jeu Local - Configuration', {
            fontFamily: 'Arial Black',
            fontSize: 36,
            color: '#ffffff',
            stroke: '#12283a',
            strokeThickness: 8
        }).setOrigin(0.5);

        this.add.text(512, 96, this.mode === 'multi'
            ? 'Configure les joueurs locaux, l\'acces reseau et le nombre max de participants.'
            : 'Configure les joueurs locaux puis le nombre de bots et leur difficulte globale.', {
            fontFamily: 'Arial',
            fontSize: 20,
            color: '#c4d8e7'
        }).setOrigin(0.5);

        if (this.mode === 'multi')
        {
            this.createNetworkSection();
        }

        this.createPlayerSection();
        this.createBottomSettings();
        this.createFooterButtons();
        this.createColorPalettePanel();
        this.refreshUi();

        if (this.mode === 'multi')
        {
            this.refreshLocalNetworkInfo();
        }
    }

    createNetworkSection ()
    {
        this.add.text(84, 136, 'Reseau', {
            fontFamily: 'Arial Black',
            fontSize: 24,
            color: '#ffffff'
        });

        this.localIpText = this.add.text(84, 176, 'IP locale (hote): detection...', {
            fontFamily: 'Arial',
            fontSize: 18,
            color: '#d9efff'
        });

        const copyButton = this.add.rectangle(334, 186, 112, 30, 0x1e5aa8, 1)
            .setStrokeStyle(1, 0xffffff, 0.35)
            .setInteractive({ useHandCursor: true });

        this.add.text(334, 186, 'Copier IP', {
            fontFamily: 'Arial Black',
            fontSize: 14,
            color: '#ffffff'
        }).setOrigin(0.5);

        copyButton.on('pointerdown', async () => {
            if (navigator?.clipboard?.writeText)
            {
                await navigator.clipboard.writeText(this.localIp);
                this.statusText.setText('IP locale copiee dans le presse-papiers.');
            }
        });

        this.serverIpText = this.add.text(84, 216, 'IP serveur: non renseignee', {
            fontFamily: 'Arial',
            fontSize: 18,
            color: '#d9efff'
        });

        const editIpButton = this.add.rectangle(350, 226, 146, 30, 0x44647a, 1)
            .setStrokeStyle(1, 0xffffff, 0.35)
            .setInteractive({ useHandCursor: true });

        this.add.text(350, 226, 'Editer IP serveur', {
            fontFamily: 'Arial Black',
            fontSize: 13,
            color: '#ffffff'
        }).setOrigin(0.5);

        editIpButton.on('pointerdown', () => {
            const rawIp = window.prompt('Entre l\'IP du serveur a rejoindre:', this.serverIp || this.localIp);
            if (rawIp === null)
            {
                return;
            }

            this.serverIp = rawIp.trim();
            this.refreshUi();
        });

        this.networkInfoText = this.add.text(520, 176, '', {
            fontFamily: 'Arial',
            fontSize: 16,
            color: '#ffce80',
            wordWrap: { width: 340 }
        });
    }

    createPlayerSection ()
    {
        const sectionTop = this.mode === 'multi' ? 270 : 150;
        this.add.text(84, sectionTop, 'Profils joueurs', {
            fontFamily: 'Arial Black',
            fontSize: 24,
            color: '#ffffff'
        });

        this.add.text(84, sectionTop + 38, 'Nombre de joueurs locaux', {
            fontFamily: 'Arial',
            fontSize: 18,
            color: '#c4d8e7'
        });

        this.createStepper(344, sectionTop + 50, () => {
            this.localPlayersCount = Math.max(DEFAULT_LOCAL_PLAYERS, this.localPlayersCount - 1);
            this.refreshUi();
        }, () => {
            this.localPlayersCount = Math.min(MAX_LOCAL_PLAYERS, this.localPlayersCount + 1);
            this.refreshUi();
        });

        this.localPlayersCountText = this.add.text(380, sectionTop + 38, '1', {
            fontFamily: 'Arial Black',
            fontSize: 20,
            color: '#ffce80'
        }).setOrigin(0.5, 0);

        const rowTop = sectionTop + 76;
        for (let index = 0; index < MAX_LOCAL_PLAYERS; index++)
        {
            const y = rowTop + (index * 54);
            const title = this.add.text(84, y, `Joueur ${index + 1}`, {
                fontFamily: 'Arial Black',
                fontSize: 18,
                color: '#ffffff'
            });

            const colorField = this.createSelectorField(220, y + 14, 132, () => {
                this.openColorPaletteForPlayer(index);
            });

            const nameField = this.createSelectorField(364, y + 14, 156, () => {
                const rawValue = window.prompt(`Pseudo du joueur ${index + 1}:`, this.playerConfigs[index].name);
                if (rawValue === null)
                {
                    return;
                }

                this.playerConfigs[index].name = this.sanitizePlayerName(rawValue, index);
                this.refreshUi();
            });

            const inputField = this.createSelectorField(532, y + 14, 156, () => {
                const usedProfiles = this.playerConfigs
                    .slice(0, this.localPlayersCount)
                    .filter((_, playerIndex) => playerIndex !== index)
                    .map((config) => config.input);
                this.playerConfigs[index].input = this.cycleInputProfile(this.playerConfigs[index].input, 1, usedProfiles);
                this.refreshUi();
            });

            const powerField = this.createSelectorField(700, y + 14, 150, () => {
                this.playerConfigs[index].power = this.cyclePower(this.playerConfigs[index].power, 1);
                this.refreshUi();
            });

            this.playerRowElements.push({
                title,
                colorField,
                nameField,
                inputField,
                powerField
            });
        }

        this.warningText = this.add.text(84, rowTop + (MAX_LOCAL_PLAYERS * 54) + 8, '', {
            fontFamily: 'Arial',
            fontSize: 14,
            color: '#ffce80',
            wordWrap: { width: 780 }
        });
    }

    createBottomSettings ()
    {
        const top = this.mode === 'multi' ? 540 : 500;
        this.add.text(84, top, this.mode === 'multi' ? 'Configuration multi' : 'Configuration bots', {
            fontFamily: 'Arial Black',
            fontSize: 24,
            color: '#ffffff'
        });

        this.primaryLabelText = this.add.text(84, top + 42, '', {
            fontFamily: 'Arial',
            fontSize: 18,
            color: '#c4d8e7'
        });

        this.createStepper(320, top + 54, () => {
            if (this.mode === 'multi')
            {
                this.maxPlayers = Math.max(this.localPlayersCount, this.maxPlayers - 1);
            }
            else
            {
                this.botCount = Math.max(0, this.botCount - 1);
            }
            this.refreshUi();
        }, () => {
            if (this.mode === 'multi')
            {
                this.maxPlayers = Math.min(MAX_SNAKES, this.maxPlayers + 1);
            }
            else
            {
                this.botCount = Math.min(MAX_SNAKES - this.localPlayersCount, this.botCount + 1);
            }
            this.refreshUi();
        });

        this.primaryValueText = this.add.text(356, top + 42, '', {
            fontFamily: 'Arial Black',
            fontSize: 20,
            color: '#ffce80'
        }).setOrigin(0.5, 0);

        const editPrimaryButton = this.add.rectangle(476, top + 54, 132, 28, 0x44647a, 1)
            .setStrokeStyle(1, 0xffffff, 0.35)
            .setInteractive({ useHandCursor: true });

        this.add.text(476, top + 54, 'Editer valeur', {
            fontFamily: 'Arial Black',
            fontSize: 13,
            color: '#ffffff'
        }).setOrigin(0.5);

        editPrimaryButton.on('pointerdown', () => {
            const label = this.mode === 'multi' ? 'nombre max de joueurs' : 'nombre de bots';
            const currentValue = this.mode === 'multi' ? this.maxPlayers : this.botCount;
            const rawValue = window.prompt(`Entre ${label}:`, String(currentValue));
            if (rawValue === null)
            {
                return;
            }

            const parsed = clampInteger(rawValue, this.mode === 'multi' ? this.localPlayersCount : 0, MAX_SNAKES, currentValue);
            if (this.mode === 'multi')
            {
                this.maxPlayers = parsed;
            }
            else
            {
                this.botCount = Math.min(MAX_SNAKES - this.localPlayersCount, parsed);
            }
            this.refreshUi();
        });

        this.secondaryLabelText = this.add.text(84, top + 92, '', {
            fontFamily: 'Arial',
            fontSize: 18,
            color: '#c4d8e7'
        });

        this.secondaryMinus = this.add.rectangle(320, top + 104, 28, 28, 0x44647a, 1)
            .setStrokeStyle(1, 0xffffff, 0.35)
            .setInteractive({ useHandCursor: true });

        this.add.text(320, top + 104, '-', {
            fontFamily: 'Arial Black',
            fontSize: 22,
            color: '#ffffff'
        }).setOrigin(0.5);

        this.secondaryValueText = this.add.text(356, top + 92, '', {
            fontFamily: 'Arial Black',
            fontSize: 20,
            color: '#ffce80'
        }).setOrigin(0.5, 0);

        this.secondaryPlus = this.add.rectangle(392, top + 104, 28, 28, 0x44647a, 1)
            .setStrokeStyle(1, 0xffffff, 0.35)
            .setInteractive({ useHandCursor: true });

        this.add.text(392, top + 104, '+', {
            fontFamily: 'Arial Black',
            fontSize: 22,
            color: '#ffffff'
        }).setOrigin(0.5);

        this.secondaryMinus.on('pointerdown', () => {
            this.botDifficulty = Math.max(1, this.botDifficulty - 1);
            this.refreshUi();
        });

        this.secondaryPlus.on('pointerdown', () => {
            this.botDifficulty = Math.min(10, this.botDifficulty + 1);
            this.refreshUi();
        });

    }

    createFooterButtons ()
    {
        const buttonY = 684;
        const backButton = this.add.rectangle(230, buttonY, 220, 52, 0x6b2a2a, 1)
            .setStrokeStyle(2, 0xffffff, 0.35)
            .setInteractive({ useHandCursor: true });

        this.add.text(230, buttonY, 'Retour menu', {
            fontFamily: 'Arial Black',
            fontSize: 20,
            color: '#ffffff'
        }).setOrigin(0.5);

        backButton.on('pointerdown', () => {
            this.scene.start('MainMenu');
        });

        if (this.mode === 'multi')
        {
            const createButton = this.add.rectangle(602, buttonY, 220, 52, 0x1fa44a, 1)
                .setStrokeStyle(2, 0xffffff, 0.35)
                .setInteractive({ useHandCursor: true });

            this.add.text(602, buttonY, 'Creer', {
                fontFamily: 'Arial Black',
                fontSize: 22,
                color: '#ffffff'
            }).setOrigin(0.5);

            createButton.on('pointerdown', () => {
                this.openMultiLobby('host');
            });

            const joinButton = this.add.rectangle(816, buttonY, 220, 52, 0x1e5aa8, 1)
                .setStrokeStyle(2, 0xffffff, 0.35)
                .setInteractive({ useHandCursor: true });

            this.add.text(816, buttonY, 'Rejoindre', {
                fontFamily: 'Arial Black',
                fontSize: 22,
                color: '#ffffff'
            }).setOrigin(0.5);

            joinButton.on('pointerdown', () => {
                this.openMultiLobby('client');
            });
        }
        else
        {
            const startButton = this.add.rectangle(750, buttonY, 290, 52, 0x1fa44a, 1)
                .setStrokeStyle(2, 0xffffff, 0.35)
                .setInteractive({ useHandCursor: true });

            this.add.text(750, buttonY, 'Demarrer la partie', {
                fontFamily: 'Arial Black',
                fontSize: 22,
                color: '#ffffff'
            }).setOrigin(0.5);

            startButton.on('pointerdown', () => {
                this.launchGame();
            });
        }

        this.statusText = this.add.text(512, 720, '', {
            fontFamily: 'Arial',
            fontSize: 15,
            color: '#ffce80',
            align: 'center'
        }).setOrigin(0.5);
    }

    createStepper (x, y, onMinus, onPlus)
    {
        const minusButton = this.add.rectangle(x, y, 28, 28, 0x44647a, 1)
            .setStrokeStyle(1, 0xffffff, 0.45)
            .setInteractive({ useHandCursor: true });

        this.add.text(x, y, '-', {
            fontFamily: 'Arial Black',
            fontSize: 22,
            color: '#ffffff'
        }).setOrigin(0.5);

        const plusButton = this.add.rectangle(x + 72, y, 28, 28, 0x44647a, 1)
            .setStrokeStyle(1, 0xffffff, 0.45)
            .setInteractive({ useHandCursor: true });

        this.add.text(x + 72, y, '+', {
            fontFamily: 'Arial Black',
            fontSize: 22,
            color: '#ffffff'
        }).setOrigin(0.5);

        minusButton.on('pointerdown', onMinus);
        plusButton.on('pointerdown', onPlus);
    }

    createSelectorField (x, y, width, onClick)
    {
        const background = this.add.rectangle(x, y, width, 34, 0x102435, 1)
            .setOrigin(0, 0)
            .setStrokeStyle(1, 0xffffff, 0.22)
            .setInteractive({ useHandCursor: true });
        const label = this.add.text(x + 10, y + 8, '', {
            fontFamily: 'Arial',
            fontSize: 15,
            color: '#ffffff'
        });
        const hint = this.add.text(x + width - 12, y + 8, '>', {
            fontFamily: 'Arial Black',
            fontSize: 16,
            color: '#ffce80'
        }).setOrigin(1, 0);
        background.on('pointerdown', onClick);
        label.setInteractive({ useHandCursor: true });
        label.on('pointerdown', onClick);
        return { background, label, hint };
    }

    createColorPalettePanel ()
    {
        this.colorPaletteBackdrop = this.add.rectangle(512, 384, 1024, 768, 0x000000, 0.68)
            .setDepth(1600)
            .setScrollFactor(0)
            .setInteractive({ useHandCursor: true })
            .setVisible(false);

        this.colorPalettePanel = this.add.rectangle(512, 384, 840, 560, 0x0a1b2b, 0.96)
            .setDepth(1610)
            .setScrollFactor(0)
            .setStrokeStyle(2, 0xffffff, 0.25)
            .setVisible(false);

        this.colorPaletteTitle = this.add.text(512, 126, 'Choix de la couleur', {
            fontFamily: 'Arial Black',
            fontSize: 28,
            color: '#ffffff'
        }).setOrigin(0.5).setDepth(1615).setScrollFactor(0).setVisible(false);

        this.colorPaletteHint = this.add.text(512, 156, 'Clique une couleur pour ce joueur', {
            fontFamily: 'Arial',
            fontSize: 16,
            color: '#c4d8e7'
        }).setOrigin(0.5).setDepth(1615).setScrollFactor(0).setVisible(false);

        this.colorPaletteCloseButton = this.add.rectangle(848, 126, 84, 34, 0x6b2a2a, 1)
            .setDepth(1620)
            .setScrollFactor(0)
            .setStrokeStyle(1, 0xffffff, 0.35)
            .setInteractive({ useHandCursor: true })
            .setVisible(false);

        this.colorPaletteCloseLabel = this.add.text(848, 126, 'Fermer', {
            fontFamily: 'Arial Black',
            fontSize: 13,
            color: '#ffffff'
        }).setOrigin(0.5).setDepth(1621).setScrollFactor(0).setVisible(false);

        this.colorPaletteBackdrop.on('pointerdown', () => {
            this.closeColorPalette();
        });
        this.colorPaletteCloseButton.on('pointerdown', () => {
            this.closeColorPalette();
        });

        const columns = 10;
        const rows = 10;
        const swatchSize = 56;
        const spacing = 8;
        const gridWidth = (columns * swatchSize) + ((columns - 1) * spacing);
        const gridHeight = (rows * swatchSize) + ((rows - 1) * spacing);
        const startX = 512 - (gridWidth / 2) + (swatchSize / 2);
        const startY = 204;

        this.colorPaletteSwatches = [];

        for (let index = 0; index < Math.min(MAX_SNAKES, columns * rows); index++)
        {
            const col = index % columns;
            const row = Math.floor(index / columns);
            const x = startX + (col * (swatchSize + spacing));
            const y = startY + (row * (swatchSize + spacing));

            const swatch = this.add.rectangle(x, y, swatchSize, swatchSize, SNAKE_COLORS[index], 1)
                .setDepth(1615)
                .setScrollFactor(0)
                .setStrokeStyle(2, 0xffffff, 0.32)
                .setInteractive({ useHandCursor: true })
                .setVisible(false);

            swatch.on('pointerdown', () => {
                if (!this.colorPaletteVisible || this.colorPalettePlayerIndex < 0)
                {
                    return;
                }

                if (this.isSnakeIndexUsedByOtherPlayer(index, this.colorPalettePlayerIndex))
                {
                    return;
                }

                this.playerConfigs[this.colorPalettePlayerIndex].snakeIndex = index;
                this.closeColorPalette();
                this.refreshUi();
            });

            this.colorPaletteSwatches.push({ index, swatch });
        }

        this.colorPaletteFooter = this.add.text(512, startY + gridHeight + 18, 'Couleurs deja prises: assombries', {
            fontFamily: 'Arial',
            fontSize: 14,
            color: '#7ab0cc'
        }).setOrigin(0.5).setDepth(1615).setScrollFactor(0).setVisible(false);
    }

    openColorPaletteForPlayer (playerIndex)
    {
        this.colorPaletteVisible = true;
        this.colorPalettePlayerIndex = playerIndex;

        this.colorPaletteBackdrop.setVisible(true);
        this.colorPalettePanel.setVisible(true);
        this.colorPaletteTitle.setVisible(true).setText(`Choix de la couleur - Joueur ${playerIndex + 1}`);
        this.colorPaletteHint.setVisible(true);
        this.colorPaletteCloseButton.setVisible(true);
        this.colorPaletteCloseLabel.setVisible(true);
        this.colorPaletteFooter.setVisible(true);

        for (const item of this.colorPaletteSwatches)
        {
            item.swatch.setVisible(true);
        }

        this.refreshColorPaletteSwatches();
    }

    closeColorPalette ()
    {
        this.colorPaletteVisible = false;
        this.colorPalettePlayerIndex = -1;

        this.colorPaletteBackdrop.setVisible(false);
        this.colorPalettePanel.setVisible(false);
        this.colorPaletteTitle.setVisible(false);
        this.colorPaletteHint.setVisible(false);
        this.colorPaletteCloseButton.setVisible(false);
        this.colorPaletteCloseLabel.setVisible(false);
        this.colorPaletteFooter.setVisible(false);

        for (const item of this.colorPaletteSwatches)
        {
            item.swatch.setVisible(false);
        }
    }

    refreshColorPaletteSwatches ()
    {
        if (!this.colorPaletteVisible || this.colorPalettePlayerIndex < 0)
        {
            return;
        }

        const selectedIndex = this.playerConfigs[this.colorPalettePlayerIndex]?.snakeIndex;

        for (const item of this.colorPaletteSwatches)
        {
            const usedByOther = this.isSnakeIndexUsedByOtherPlayer(item.index, this.colorPalettePlayerIndex);
            const isSelected = item.index === selectedIndex;
            item.swatch.setAlpha(usedByOther ? 0.28 : 1);
            item.swatch.setStrokeStyle(
                isSelected ? 4 : 2,
                isSelected ? 0xffffff : (usedByOther ? 0x6b2a2a : 0xffffff),
                isSelected ? 1 : (usedByOther ? 0.4 : 0.32)
            );
        }
    }

    isSnakeIndexUsedByOtherPlayer (snakeIndex, excludedPlayerIndex)
    {
        for (let index = 0; index < this.localPlayersCount; index++)
        {
            if (index === excludedPlayerIndex)
            {
                continue;
            }

            if (this.playerConfigs[index].snakeIndex === snakeIndex)
            {
                return true;
            }
        }

        return false;
    }

    async refreshLocalNetworkInfo ()
    {
        const info = await resolveLocalNetworkInfo();
        if (!this.sceneActive)
        {
            return;
        }

        this.localIp = info.ip || this.localIp;
        if (!this.serverIp)
        {
            this.serverIp = this.localIp;
        }
        this.serverStatus = info.serverAvailable
            ? `Serveur LAN detecte sur le port ${info.port}.`
            : 'Serveur LAN non detecte. Lance npm run lan-server sur la machine hote.';
        this.refreshUi();
    }

    refreshUi ()
    {
        this.localPlayersCount = clampInteger(this.localPlayersCount, DEFAULT_LOCAL_PLAYERS, MAX_LOCAL_PLAYERS, DEFAULT_LOCAL_PLAYERS);
        this.botCount = clampInteger(this.botCount, 0, MAX_SNAKES - this.localPlayersCount, 0);
        this.maxPlayers = clampInteger(this.maxPlayers, this.localPlayersCount, MAX_SNAKES, Math.max(4, this.localPlayersCount));
        this.botDifficulty = clampInteger(this.botDifficulty, 1, 10, DEFAULT_BOT_LEVEL);
        this.lizardBoostDurationSec = clampInteger(this.lizardBoostDurationSec, 1, 15, 3);
        this.lizardCooldownSec = clampInteger(this.lizardCooldownSec, 5, 120, 50);

        const usedSnakeIndexes = new Set();
        for (let index = 0; index < this.localPlayersCount; index++)
        {
            const config = this.playerConfigs[index];
            config.name = this.sanitizePlayerName(config.name, index);
            config.input = this.ensureInputProfile(config.input, index);
            config.power = this.ensurePower(config.power);
            config.snakeIndex = this.reserveSnakeIndex(clampInteger(config.snakeIndex, 0, MAX_SNAKES - 1, index), usedSnakeIndexes, MAX_SNAKES);
        }

        this.localPlayersCountText.setText(String(this.localPlayersCount));

        this.playerRowElements.forEach((row, index) => {
            const isVisible = index < this.localPlayersCount;
            const config = this.playerConfigs[index];
            row.title.setVisible(isVisible);
            row.colorField.background.setVisible(isVisible);
            row.colorField.label.setVisible(isVisible);
            row.colorField.hint.setVisible(isVisible);
            row.nameField.background.setVisible(isVisible);
            row.nameField.label.setVisible(isVisible);
            row.nameField.hint.setVisible(isVisible);
            row.inputField.background.setVisible(isVisible);
            row.inputField.label.setVisible(isVisible);
            row.inputField.hint.setVisible(isVisible);
            row.powerField.background.setVisible(isVisible);
            row.powerField.label.setVisible(isVisible);
            row.powerField.hint.setVisible(isVisible);

            if (isVisible)
            {
                row.colorField.label.setText(this.getColorLabel(config.snakeIndex));
                row.colorField.label.setColor(`#${SNAKE_COLORS[config.snakeIndex].toString(16).padStart(6, '0')}`);
                row.nameField.label.setText(config.name);
                row.inputField.label.setText(this.getInputProfileLabel(config.input));
                row.powerField.label.setText(this.getPowerLabel(config.power));
            }
        });

        this.warningText.setText(this.getInputAvailabilityWarning());
        this.refreshColorPaletteSwatches();

        if (this.mode === 'multi')
        {
            this.primaryLabelText.setText('Nombre max de joueurs');
            this.primaryValueText.setText(String(this.maxPlayers));
            this.secondaryLabelText.setVisible(false);
            this.secondaryValueText.setVisible(false);
            this.secondaryMinus.setVisible(false);
            this.secondaryPlus.setVisible(false);
            this.localIpText.setText(`IP locale (hote): ${this.localIp}`);
            this.serverIpText.setText(`IP serveur: ${this.serverIp || 'non renseignee'}`);
            this.networkInfoText.setText(this.serverStatus);
        }
        else
        {
            this.primaryLabelText.setText(`Nombre de bots (max ${MAX_SNAKES - this.localPlayersCount})`);
            this.primaryValueText.setText(String(this.botCount));
            this.secondaryLabelText.setText('Difficulte globale des bots');
            this.secondaryLabelText.setVisible(true);
            this.secondaryValueText.setVisible(true);
            this.secondaryValueText.setText(String(this.botDifficulty));
            this.secondaryMinus.setVisible(true);
            this.secondaryPlus.setVisible(true);
        }

    }

    launchGame ()
    {
        const matchConfig = this.buildLocalMatchConfig();
        this.scene.start('Game', {
            localSetup: matchConfig,
            matchConfig
        });
    }

    openMultiLobby (role)
    {
        if (role === 'client' && !this.serverIp.trim())
        {
            this.statusText.setText('Renseigne une IP serveur avant de rejoindre.');
            return;
        }

        this.scene.start('MultiWaitingRoom', {
            lobbyConfig: this.buildMultiConfig(role)
        });
    }

    buildLocalMatchConfig ()
    {
        const humanPlayers = this.buildHumanPlayers();
        const maxSnakes = humanPlayers.length + this.botCount;
        const botLevels = [];

        for (let index = humanPlayers.length; index < maxSnakes; index++)
        {
            botLevels.push({ snakeIndex: index, level: this.botDifficulty });
        }

        const primaryPlayer = humanPlayers[0];
        return {
            mode: humanPlayers.length > 1 ? 'local-multi' : 'local-solo',
            maxSnakes,
            humanPlayers,
            botSettings: {
                defaultLevel: this.botDifficulty,
                extraBotDefaultLevel: this.botDifficulty,
                dangerThreshold: clampInteger(SEUIL_DANGER, 300, 1100, 550),
                aggressivityActiveLevel: clampInteger(AGRESSIVITE_ACTIVE_NIVEAU, 1, 11, 11),
                levelsBySnake: botLevels
            },
            gameplay: {
                segmentSpacing: clampInteger(ESPACEMENT, 1, 20, 5),
                lizardBoostMultiplier: 2,
                lizardBoostDurationSec: this.lizardBoostDurationSec,
                lizardCooldownSec: this.lizardCooldownSec
            },
            playerName: primaryPlayer?.name || 'Joueur 1',
            playerSnakeIndex: Number.isFinite(primaryPlayer?.snakeColorIndex) ? primaryPlayer.snakeColorIndex : 0,
            botLevels,
            espacement: clampInteger(ESPACEMENT, 1, 20, 5),
            seuilDanger: clampInteger(SEUIL_DANGER, 300, 1100, 550),
            'agressivité_active_niveau': clampInteger(AGRESSIVITE_ACTIVE_NIVEAU, 1, 11, 11)
        };
    }

    buildMultiConfig (role)
    {
        return {
            mode: 'multi-internet',
            gameMode: 'light',
            role,
            maxPlayers: this.maxPlayers,
            humanPlayers: this.buildHumanPlayers(),
            fillWithBots: false,
            botDifficulty: DEFAULT_BOT_LEVEL,
            network: {
                localIp: this.localIp,
                serverIp: role === 'host' ? this.localIp : this.serverIp.trim(),
                connectionHost: role === 'host' ? 'localhost' : this.serverIp.trim()
            }
        };
    }

    buildHumanPlayers ()
    {
        return this.playerConfigs.slice(0, this.localPlayersCount).map((config, index) => ({
            id: `player-${index + 1}`,
            name: this.sanitizePlayerName(config.name, index),
            snakeColorIndex: config.snakeIndex,
            input: this.ensureInputProfile(config.input, index),
            power: this.ensurePower(config.power),
            playerSlot: index,
            isLocal: true,
            color: SNAKE_COLORS[config.snakeIndex]
        }));
    }

    sanitizePlayerName (value, index)
    {
        const safeName = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 16);
        return safeName.length > 0 ? safeName : `Joueur ${index + 1}`;
    }

    cycleInputProfile (currentProfile, step, excludedProfiles = [])
    {
        const startIndex = Math.max(0, INPUT_PROFILE_OPTIONS.indexOf(currentProfile));
        for (let index = 1; index <= INPUT_PROFILE_OPTIONS.length; index++)
        {
            const candidateIndex = (startIndex + (step * index) + (INPUT_PROFILE_OPTIONS.length * 4)) % INPUT_PROFILE_OPTIONS.length;
            const candidate = INPUT_PROFILE_OPTIONS[candidateIndex];
            if (!excludedProfiles.includes(candidate))
            {
                return candidate;
            }
        }

        return currentProfile;
    }

    ensureInputProfile (profile, playerIndex)
    {
        if (!INPUT_PROFILE_OPTIONS.includes(profile))
        {
            return INPUT_PROFILE_OPTIONS[playerIndex % INPUT_PROFILE_OPTIONS.length];
        }

        return profile;
    }

    ensurePower (power)
    {
        if (!POWER_OPTIONS.includes(power))
        {
            return 'sans';
        }

        return power;
    }

    cyclePower (currentPower, step)
    {
        const startIndex = Math.max(0, POWER_OPTIONS.indexOf(this.ensurePower(currentPower)));
        const nextIndex = (startIndex + step + POWER_OPTIONS.length) % POWER_OPTIONS.length;
        return POWER_OPTIONS[nextIndex];
    }

    reserveSnakeIndex (preferredIndex, reservedSnakeIndexes, maxCount)
    {
        const safeMaxCount = Math.max(1, Math.floor(maxCount));
        if (!reservedSnakeIndexes.has(preferredIndex))
        {
            reservedSnakeIndexes.add(preferredIndex);
            return preferredIndex;
        }

        for (let index = 0; index < safeMaxCount; index++)
        {
            if (!reservedSnakeIndexes.has(index))
            {
                reservedSnakeIndexes.add(index);
                return index;
            }
        }

        return preferredIndex;
    }

    cycleUniqueSnakeIndex (playerIndex, step)
    {
        const excludedIndexes = this.playerConfigs
            .slice(0, this.localPlayersCount)
            .filter((_, index) => index !== playerIndex)
            .map((config) => config.snakeIndex);

        for (let offset = 1; offset <= MAX_SNAKES; offset++)
        {
            const candidate = (this.playerConfigs[playerIndex].snakeIndex + (step * offset) + (MAX_SNAKES * 4)) % MAX_SNAKES;
            if (!excludedIndexes.includes(candidate))
            {
                return candidate;
            }
        }

        return this.playerConfigs[playerIndex].snakeIndex;
    }

    getColorLabel (snakeIndex)
    {
        return `Couleur ${snakeIndex + 1}`;
    }

    getInputProfileLabel (profile)
    {
        switch (profile)
        {
        case 'keyboard-arrows': return 'Fleches';
        case 'keyboard-zqsd': return 'ZQSD';
        case 'keyboard-ijkl': return 'IJKL';
        case 'joypad-1': return 'Joypad 1';
        case 'joypad-2': return 'Joypad 2';
        default: return profile;
        }
    }

    getPowerLabel (power)
    {
        switch (power)
        {
        case 'lunette': return 'Pouvoir: Lunette';
        case 'lezard': return 'Pouvoir: Lezard';
        default: return 'Pouvoir: Sans';
        }
    }

    getInputAvailabilityWarning ()
    {
        const profiles = this.playerConfigs.slice(0, this.localPlayersCount).map((config) => config.input);
        const connectedPads = (this.input?.gamepad?.gamepads || []).filter((pad) => pad && pad.connected).length;
        const needsPad1 = profiles.includes('joypad-1');
        const needsPad2 = profiles.includes('joypad-2');

        if ((needsPad1 && connectedPads < 1) || (needsPad2 && connectedPads < 2))
        {
            return 'Attention: joypad manquant. Le joueur garde sa direction actuelle tant que la manette est absente.';
        }

        if (this.mode === 'multi')
        {
            return 'Le mode multi utilise un serveur LAN. Le host doit lancer npm run lan-server sur sa machine.';
        }

        return '';
    }
}