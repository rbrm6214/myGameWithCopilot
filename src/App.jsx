import { useEffect, useMemo, useRef, useState } from 'react';
import { PhaserGame } from './PhaserGame';
import { EventBus } from './game/EventBus';

const MINIMAP_CANVAS_SIZE = 240;

function formatTimer (elapsedMs)
{
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
}

function App ()
{
    const phaserRef = useRef();
    const minimapCanvasRef = useRef(null);
    const [activeSceneKey, setActiveSceneKey] = useState('');
    const [hud, setHud] = useState({
        playerName: 'Joueur',
        score: 0,
        aliveCount: 0,
        totalSnakes: 10,
        elapsedTimeMs: 0,
        world: { width: 1, height: 1 },
        oranges: [],
        snakes: []
    });

    const currentScene = (scene) => {
        setActiveSceneKey(scene.scene.key);

        if (scene.scene.key !== 'Game')
        {
            setHud((previous) => ({
                ...previous,
                score: 0,
                aliveCount: 0,
                elapsedTimeMs: 0,
                oranges: [],
                snakes: []
            }));
        }
    };

    useEffect(() => {
        const onHudUpdate = (nextHud) => {
            setHud(nextHud);
        };

        EventBus.on('game-hud-update', onHudUpdate);

        return () => {
            EventBus.off('game-hud-update', onHudUpdate);
        };
    }, []);

    useEffect(() => {
        const canvas = minimapCanvasRef.current;

        if (!canvas)
        {
            return;
        }

        const ctx = canvas.getContext('2d');
        const size = MINIMAP_CANVAS_SIZE;

        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = '#07131e';
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, size - 1, size - 1);

        if (!hud.world || !hud.world.width || !hud.world.height)
        {
            return;
        }

        const sx = size / hud.world.width;
        const sy = size / hud.world.height;

        ctx.fillStyle = '#ff8c00';
        for (const orange of hud.oranges)
        {
            ctx.beginPath();
            ctx.arc(orange.x * sx, orange.y * sy, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        for (const snake of hud.snakes)
        {
            const color = snake.isPlayer ? '#18ff4a' : '#ff2d2d';

            if (snake.segments.length > 0)
            {
                ctx.beginPath();
                ctx.strokeStyle = color;
                ctx.lineWidth = snake.isPlayer ? 2.2 : 1.6;
                ctx.moveTo(snake.head.x * sx, snake.head.y * sy);

                for (const segment of snake.segments)
                {
                    ctx.lineTo(segment.x * sx, segment.y * sy);
                }

                ctx.stroke();
            }

            ctx.beginPath();
            ctx.fillStyle = color;
            ctx.arc(snake.head.x * sx, snake.head.y * sy, snake.isPlayer ? 3 : 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }, [hud]);

    const timerText = useMemo(() => formatTimer(hud.elapsedTimeMs || 0), [hud.elapsedTimeMs]);

    return (
        <div id="app">
            <aside className="hudPanel">
                <h2 className="hudTitle">Basilics - Tableau de bord</h2>
                <div className="hudLine"><span>Scene:</span><strong>{activeSceneKey || 'Chargement'}</strong></div>
                <div className="hudLine"><span>Joueur:</span><strong>{hud.playerName}</strong></div>
                <div className="hudLine"><span>Score:</span><strong>{hud.score}</strong></div>
                <div className="hudLine"><span>Serpents vivants:</span><strong>{hud.aliveCount}/{hud.totalSnakes}</strong></div>
                <div className="hudLine"><span>Timer:</span><strong>{timerText}</strong></div>

                <div className="minimapWrap">
                    <div className="minimapLabel">Mini-map</div>
                    <canvas
                        ref={minimapCanvasRef}
                        width={MINIMAP_CANVAS_SIZE}
                        height={MINIMAP_CANVAS_SIZE}
                        className="minimapCanvas"
                    />
                    <div className="legend">
                        <span className="legendGreen">Vert: toi</span>
                        <span className="legendRed">Rouge: adversaires</span>
                        <span className="legendOrange">Orange: oranges</span>
                        <span>Affichage live: position + taille actuelle</span>
                    </div>
                </div>
            </aside>

            <PhaserGame ref={phaserRef} currentActiveScene={currentScene} />
        </div>
    );
}

export default App;
