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
        this.add.image(512, 384, 'background').setAlpha(1);

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

        this.statusText = this.add.text(512, 736, '', {
            fontFamily: 'Arial',
            fontSize: 18,
            color: '#c4d8e7',
            align: 'center'
        }).setDepth(100).setOrigin(0.5);

        this.createMenuButton(300, 560, 340, 78, 0x1fa44a, 'JEU LOCAL', '#0a5f2a', () => {
            this.changeScene('local');
        });

        this.createMenuButton(748, 560, 420, 78, 0x1e5aa8, 'JEU MULTI INTERNET', '#103a74', () => {
            this.changeScene('multi');
        });

        this.createMenuButton(884, 722, 236, 58, 0x5c5f70, 'OPTIONS', '#2e3344', () => {
            this.statusText.setText('Options a definir plus tard.');
        });

        EventBus.emit('current-scene-ready', this);
    }

    createMenuButton (x, y, width, height, fillColor, labelText, strokeColor, callback)
    {
        const button = this.add.rectangle(x, y, width, height, fillColor, 1)
            .setDepth(100)
            .setStrokeStyle(4, 0xffffff, 0.85)
            .setInteractive({ useHandCursor: true });

        const label = this.add.text(x, y, labelText, {
            fontFamily: 'Arial Black',
            fontSize: labelText.length > 14 ? 28 : 34,
            color: '#ffffff',
            stroke: strokeColor,
            strokeThickness: 6
        }).setOrigin(0.5).setDepth(110);

        button.on('pointerover', () => {
            button.setAlpha(0.92);
            this.tweens.add({
                targets: [button, label],
                scaleX: 1.05,
                scaleY: 1.05,
                duration: 80,
                ease: 'Sine.easeOut'
            });
        });

        button.on('pointerout', () => {
            button.setAlpha(1);
            this.tweens.add({
                targets: [button, label],
                scaleX: 1,
                scaleY: 1,
                duration: 80,
                ease: 'Sine.easeOut'
            });
        });

        button.on('pointerdown', callback);
    }

    changeScene (mode = 'local')
    {
        if (this.logoTween)
        {
            this.logoTween.stop();
            this.logoTween = null;
        }

        this.scene.start('LocalSetup', { mode });
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
