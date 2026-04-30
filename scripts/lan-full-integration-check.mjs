const base = 'http://127.0.0.1:3010';

async function request(path, options = {})
{
    const response = await fetch(`${base}${path}`, {
        headers: {
            'Content-Type': 'application/json'
        },
        ...options
    });

    const payload = await response.json();

    if (!response.ok)
    {
        throw new Error(payload.message || `HTTP ${response.status}`);
    }

    return payload;
}

async function delay(ms)
{
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function main()
{
    const host = await request('/api/connect', { method: 'POST', body: '{}' });
    const guest = await request('/api/connect', { method: 'POST', body: '{}' });

    await request('/api/create-lobby', {
        method: 'POST',
        body: JSON.stringify({
            connectionId: host.connectionId,
            config: {
                gameMode: 'full',
                maxPlayers: 2,
                humanPlayers: [
                    {
                        name: 'Host',
                        snakeColorIndex: 0,
                        input: 'keyboard-zqsd',
                        color: 0x2f6bff
                    }
                ],
                network: {
                    serverIp: '127.0.0.1'
                }
            }
        })
    });

    await request('/api/join-lobby', {
        method: 'POST',
        body: JSON.stringify({
            connectionId: guest.connectionId,
            config: {
                humanPlayers: [
                    {
                        name: 'Guest',
                        snakeColorIndex: 1,
                        input: 'keyboard-arrows',
                        color: 0x7dff7a
                    }
                ]
            }
        })
    });

    await request('/api/start-match', {
        method: 'POST',
        body: JSON.stringify({ connectionId: host.connectionId })
    });

    await delay(250);

    const before = await request(`/api/state?connectionId=${encodeURIComponent(host.connectionId)}`);

    await request('/api/input', {
        method: 'POST',
        body: JSON.stringify({
            connectionId: host.connectionId,
            inputProfile: 'keyboard-zqsd',
            direction: { x: 0, y: -1 }
        })
    });

    await delay(300);

    const after = await request(`/api/state?connectionId=${encodeURIComponent(host.connectionId)}`);
    const controlledId = after.connectionView.controlledPlayerIds[0];
    const beforeSnake = before.matchState?.snakes?.find((snake) => snake.id === controlledId) || null;
    const afterSnake = after.matchState?.snakes?.find((snake) => snake.id === controlledId) || null;
    const moved = Boolean(beforeSnake && afterSnake && (beforeSnake.x !== afterSnake.x || beforeSnake.y !== afterSnake.y));

    console.log(JSON.stringify({
        mode: after.matchState?.mode,
        controlledProfiles: after.connectionView.controlledProfiles,
        controlledPlayerIds: after.connectionView.controlledPlayerIds,
        before: beforeSnake ? { x: beforeSnake.x, y: beforeSnake.y } : null,
        after: afterSnake ? { x: afterSnake.x, y: afterSnake.y } : null,
        moved,
        snakes: after.matchState?.snakes?.length || 0,
        oranges: after.matchState?.oranges?.length || 0
    }, null, 2));

    await request('/api/disconnect', {
        method: 'POST',
        body: JSON.stringify({ connectionId: host.connectionId })
    });
    await request('/api/disconnect', {
        method: 'POST',
        body: JSON.stringify({ connectionId: guest.connectionId })
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});