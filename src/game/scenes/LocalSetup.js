import { Scene } from 'phaser';

const TOTAL_SNAKES = 10;
const DEFAULT_BOT_LEVEL = 8;
const ESPACEMENT = 5;
const SEUIL_DANGER = 550; // min: 300 (prudent), max: 1100(risque)
const AGRESSIVITE_ACTIVE_NIVEAU = 11; // Active le mode agressif des bots a partir de ce niveau (entre 1 et 11): 1 = tous agressifs, 11 = aucun agressif.

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

function formatSnakeName (index)
{
    return `Serpent ${index + 1}`;
}

export class LocalSetup extends Scene
{
    constructor ()
    {
        super('LocalSetup');
        this.selectedSnakeIndex = 0;
        this.playerName = 'Player';
        this.botLevelsBySnake = new Array(TOTAL_SNAKES).fill(DEFAULT_BOT_LEVEL);
        this.difficultyRows = [];
    }

    create ()
    {
        this.add.image(512, 384, 'background').setAlpha(0.25);

        this.add.rectangle(512, 384, 930, 690, 0x05121d, 0.84)
            .setStrokeStyle(2, 0xffffff, 0.16);

        this.add.text(512, 54, 'Jeu Local - Configuration', {
            fontFamily: 'Arial Black',
            fontSize: 38,
            color: '#ffffff',
            stroke: '#12283a',
            strokeThickness: 8
        }).setOrigin(0.5);

        this.add.text(512, 98, 'Choisis ton serpent, ton pseudo, puis la difficulte des bots (1 a 10).', {
            fontFamily: 'Arial',
            fontSize: 20,
            color: '#c4d8e7'
        }).setOrigin(0.5);

        this.createSnakeSelector();
        this.createPlayerSettings();
        this.createBotDifficultyPanel();
        this.createFooterButtons();
        this.refreshUi();
    }

    createSnakeSelector ()
    {
        this.add.text(116, 144, 'Choix du serpent', {
            fontFamily: 'Arial Black',
            fontSize: 24,
            color: '#ffffff'
        });

        this.snakeCardBorders = [];
        this.snakeCards = [];

        const baseX = 116;
        const baseY = 186;
        const columns = 5;
        const cardWidth = 150;
        const cardHeight = 82;
        const spacingX = 162;
        const spacingY = 92;

        for (let index = 0; index < TOTAL_SNAKES; index++)
        {
            const column = index % columns;
            const row = Math.floor(index / columns);
            const x = baseX + (column * spacingX);
            const y = baseY + (row * spacingY);

            const card = this.add.rectangle(x, y, cardWidth, cardHeight, 0x0b1f30, 0.92)
                .setOrigin(0, 0)
                .setStrokeStyle(2, 0x4c738e, 0.9)
                .setInteractive({ useHandCursor: true });

            const colorPreview = this.add.circle(x + 26, y + 41, 14, SNAKE_COLORS[index]);
            const label = this.add.text(x + 48, y + 30, formatSnakeName(index), {
                fontFamily: 'Arial',
                fontSize: 16,
                color: '#ffffff'
            });

            card.on('pointerdown', () => {
                this.selectedSnakeIndex = index;
                this.refreshUi();
            });

            this.snakeCardBorders.push(card);
            this.snakeCards.push({ card, colorPreview, label, index });
        }
    }

    createPlayerSettings ()
    {
        this.add.text(116, 392, 'Profil joueur', {
            fontFamily: 'Arial Black',
            fontSize: 24,
            color: '#ffffff'
        });

        this.playerSnakeText = this.add.text(116, 430, '', {
            fontFamily: 'Arial',
            fontSize: 20,
            color: '#ffffff'
        });

        this.playerNameText = this.add.text(116, 466, '', {
            fontFamily: 'Arial',
            fontSize: 20,
            color: '#ffffff'
        });

        const editNameButton = this.add.rectangle(432, 462, 172, 44, 0x19557a, 1)
            .setStrokeStyle(2, 0xffffff, 0.35)
            .setInteractive({ useHandCursor: true });

        const editNameLabel = this.add.text(432, 462, 'Modifier pseudo', {
            fontFamily: 'Arial Black',
            fontSize: 17,
            color: '#ffffff'
        }).setOrigin(0.5);

        editNameButton.on('pointerover', () => {
            editNameButton.setFillStyle(0x2270a0, 1);
            editNameLabel.setScale(1.03);
        });

        editNameButton.on('pointerout', () => {
            editNameButton.setFillStyle(0x19557a, 1);
            editNameLabel.setScale(1);
        });

        editNameButton.on('pointerdown', () => {
            const rawValue = window.prompt('Entre ton pseudo (max 16 caracteres):', this.playerName);
            if (rawValue === null)
            {
                return;
            }

            const safeName = rawValue.trim().replace(/\s+/g, ' ').slice(0, 16);
            this.playerName = safeName.length > 0 ? safeName : 'Player';
            this.refreshUi();
        });
    }

    createBotDifficultyPanel ()
    {
        this.add.text(604, 392, 'Bots - difficulte (1 a 10)', {
            fontFamily: 'Arial Black',
            fontSize: 24,
            color: '#ffffff'
        });

        this.botListContainer = this.add.container(604, 430);
    }

    createFooterButtons ()
    {
        const backButton = this.add.rectangle(250, 700, 210, 56, 0x6b2a2a, 1)
            .setStrokeStyle(2, 0xffffff, 0.35)
            .setInteractive({ useHandCursor: true });

        const backLabel = this.add.text(250, 700, 'Retour menu', {
            fontFamily: 'Arial Black',
            fontSize: 22,
            color: '#ffffff'
        }).setOrigin(0.5);

        backButton.on('pointerover', () => {
            backButton.setFillStyle(0x8a3434, 1);
        });

        backButton.on('pointerout', () => {
            backButton.setFillStyle(0x6b2a2a, 1);
        });

        backButton.on('pointerdown', () => {
            this.scene.start('MainMenu');
        });

        const startButton = this.add.rectangle(774, 700, 290, 56, 0x1fa44a, 1)
            .setStrokeStyle(2, 0xffffff, 0.4)
            .setInteractive({ useHandCursor: true });

        const startLabel = this.add.text(774, 700, 'Demarrer la partie', {
            fontFamily: 'Arial Black',
            fontSize: 22,
            color: '#ffffff'
        }).setOrigin(0.5);

        startButton.on('pointerover', () => {
            startButton.setFillStyle(0x27c257, 1);
            startLabel.setScale(1.03);
        });

        startButton.on('pointerout', () => {
            startButton.setFillStyle(0x1fa44a, 1);
            startLabel.setScale(1);
        });

        startButton.on('pointerdown', () => {
            this.launchGame();
        });
    }

    refreshUi ()
    {
        for (const snakeCard of this.snakeCards)
        {
            const isSelected = snakeCard.index === this.selectedSnakeIndex;
            snakeCard.card.setStrokeStyle(isSelected ? 4 : 2, isSelected ? 0xffffff : 0x4c738e, isSelected ? 1 : 0.9);
            snakeCard.card.setFillStyle(isSelected ? 0x16354b : 0x0b1f30, isSelected ? 1 : 0.92);
        }

        this.playerSnakeText.setText(`Serpent joueur: ${formatSnakeName(this.selectedSnakeIndex)}`);
        this.playerSnakeText.setColor(`#${SNAKE_COLORS[this.selectedSnakeIndex].toString(16).padStart(6, '0')}`);
        this.playerNameText.setText(`Pseudo: ${this.playerName}`);

        this.refreshBotDifficultyRows();
    }

    refreshBotDifficultyRows ()
    {
        this.botListContainer.removeAll(true);
        this.difficultyRows = [];

        const botSnakeIndexes = [];

        for (let index = 0; index < TOTAL_SNAKES; index++)
        {
            if (index !== this.selectedSnakeIndex)
            {
                botSnakeIndexes.push(index);
            }
        }

        botSnakeIndexes.forEach((snakeIndex, listIndex) => {
            const y = listIndex * 32;
            const level = this.botLevelsBySnake[snakeIndex];

            const colorChip = this.add.circle(16, y + 16, 8, SNAKE_COLORS[snakeIndex]);
            const label = this.add.text(32, y + 6, formatSnakeName(snakeIndex), {
                fontFamily: 'Arial',
                fontSize: 16,
                color: '#ffffff'
            });

            const minusButton = this.add.rectangle(170, y + 15, 24, 22, 0x44647a, 1)
                .setStrokeStyle(1, 0xffffff, 0.45)
                .setInteractive({ useHandCursor: true });

            const minusLabel = this.add.text(170, y + 15, '-', {
                fontFamily: 'Arial Black',
                fontSize: 20,
                color: '#ffffff'
            }).setOrigin(0.5);

            const levelText = this.add.text(200, y + 6, String(level), {
                fontFamily: 'Arial Black',
                fontSize: 16,
                color: '#ffce80'
            });

            const plusButton = this.add.rectangle(232, y + 15, 24, 22, 0x44647a, 1)
                .setStrokeStyle(1, 0xffffff, 0.45)
                .setInteractive({ useHandCursor: true });

            const plusLabel = this.add.text(232, y + 15, '+', {
                fontFamily: 'Arial Black',
                fontSize: 20,
                color: '#ffffff'
            }).setOrigin(0.5);

            minusButton.on('pointerdown', () => {
                this.botLevelsBySnake[snakeIndex] = Math.max(1, this.botLevelsBySnake[snakeIndex] - 1);
                levelText.setText(String(this.botLevelsBySnake[snakeIndex]));
            });

            plusButton.on('pointerdown', () => {
                this.botLevelsBySnake[snakeIndex] = Math.min(10, this.botLevelsBySnake[snakeIndex] + 1);
                levelText.setText(String(this.botLevelsBySnake[snakeIndex]));
            });

            this.botListContainer.add([
                colorChip,
                label,
                minusButton,
                minusLabel,
                levelText,
                plusButton,
                plusLabel
            ]);

            this.difficultyRows.push({ snakeIndex, levelText });
        });
    }

    launchGame ()
    {
        const botLevels = [];

        for (let index = 0; index < TOTAL_SNAKES; index++)
        {
            if (index === this.selectedSnakeIndex)
            {
                continue;
            }

            botLevels.push({
                snakeIndex: index,
                level: this.botLevelsBySnake[index]
            });
        }

        this.scene.start('Game', {
            localSetup: {
                playerName: this.playerName,
                playerSnakeIndex: this.selectedSnakeIndex,
                botLevels,
                espacement: ESPACEMENT,
                seuilDanger: SEUIL_DANGER,
                'agressivité_active_niveau': AGRESSIVITE_ACTIVE_NIVEAU
            }
        });
    }
}
