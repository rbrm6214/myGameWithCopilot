import { EventBus } from '../EventBus';
import { Scene } from 'phaser';

export class MainMenu extends Scene
{
    logoTween;

    constructor ()
    {
        super('MainMenu');
    }

    create ()
    {
        this.add.image(512, 384, 'background').setAlpha(0.35);

        this.logo = this.add.text(512, 250, 'BASILICS', {
            fontFamily: 'Arial Black',
            fontSize: 84,
            color: '#f8ff9a',
            stroke: '#102030',
            strokeThickness: 10,
            align: 'center'
        }).setOrigin(0.5).setDepth(100);

        this.add.text(512, 390, 'Menu principal', {
            fontFamily: 'Arial Black',
            fontSize: 44,
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 8,
            align: 'center'
        }).setDepth(100).setOrigin(0.5);

        const playButton = this.add.rectangle(512, 500, 260, 78, 0x1fa44a, 1)
            .setDepth(100)
            .setStrokeStyle(4, 0xffffff, 0.85)
            .setInteractive({ useHandCursor: true });

        const playLabel = this.add.text(512, 500, 'JEU LOCAL', {
            fontFamily: 'Arial Black',
            fontSize: 34,
            color: '#ffffff',
            stroke: '#0a5f2a',
            strokeThickness: 6
        }).setOrigin(0.5).setDepth(110);

        playButton.on('pointerover', () => {
            playButton.setFillStyle(0x26bf57, 1);
            this.tweens.add({
                targets: [playButton, playLabel],
                scaleX: 1.05,
                scaleY: 1.05,
                duration: 80,
                ease: 'Sine.easeOut'
            });
        });

        playButton.on('pointerout', () => {
            playButton.setFillStyle(0x1fa44a, 1);
            this.tweens.add({
                targets: [playButton, playLabel],
                scaleX: 1,
                scaleY: 1,
                duration: 80,
                ease: 'Sine.easeOut'
            });
        });

        playButton.on('pointerdown', () => {
            this.changeScene();
        });

        EventBus.emit('current-scene-ready', this);
    }

    changeScene ()
    {
        if (this.logoTween)
        {
            this.logoTween.stop();
            this.logoTween = null;
        }

        this.scene.start('LocalSetup');
    }

    moveLogo (reactCallback)
    {
        if (this.logoTween)
        {
            if (this.logoTween.isPlaying())
            {
                this.logoTween.pause();
            }
            else
            {
                this.logoTween.play();
            }
        }
        else
        {
            this.logoTween = this.tweens.add({
                targets: this.logo,
                x: { value: 750, duration: 3000, ease: 'Back.easeInOut' },
                y: { value: 80, duration: 1500, ease: 'Sine.easeOut' },
                yoyo: true,
                repeat: -1,
                onUpdate: () => {
                    if (reactCallback)
                    {
                        reactCallback({
                            x: Math.floor(this.logo.x),
                            y: Math.floor(this.logo.y)
                        });
                    }
                }
            });
        }
    }
}
