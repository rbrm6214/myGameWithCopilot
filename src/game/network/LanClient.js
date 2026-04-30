const DEFAULT_LAN_PORT = 3010;

export function getLanServerUrl (serverIp, port = DEFAULT_LAN_PORT)
{
    const trimmed = String(serverIp || '').trim();
    const host = trimmed.length > 0 ? trimmed : 'localhost';
    return `http://${host}:${port}`;
}

export async function resolveLocalNetworkInfo (port = DEFAULT_LAN_PORT)
{
    const locationHost = typeof window !== 'undefined' ? window.location.hostname : '';
    const directHost = locationHost && locationHost !== 'localhost' && locationHost !== '127.0.0.1'
        ? locationHost
        : '';

    try
    {
        const response = await fetch(`http://localhost:${port}/api/network-info`);
        if (response.ok)
        {
            return await response.json();
        }
    }
    catch
    {
        // Fallback keeps the setup UI usable when the LAN server is not running yet.
    }

    return {
        ip: directHost || '127.0.0.1',
        port,
        serverAvailable: false
    };
}

export class LanClient
{
    constructor ({ serverIp, port = DEFAULT_LAN_PORT, onOpen, onClose, onError, onMessage } = {})
    {
        this.serverIp = serverIp;
        this.port = port;
        this.onOpen = onOpen;
        this.onClose = onClose;
        this.onError = onError;
        this.onMessage = onMessage;
        this.connectionId = null;
        this.pollTimer = null;
        this.lastMatchNonce = 0;
        this.pollMode = 'lobby';
    }

    async request (path, options = {})
    {
        const response = await fetch(`${getLanServerUrl(this.serverIp, this.port)}${path}`, {
            headers: {
                'Content-Type': 'application/json'
            },
            ...options
        });

        if (!response.ok)
        {
            const payload = await response.json().catch(() => ({ message: 'Erreur reseau' }));
            throw new Error(payload.message || 'Erreur reseau');
        }

        return response.json();
    }

    async connect ()
    {
        const response = await this.request('/api/connect', {
            method: 'POST',
            body: JSON.stringify({})
        });

        this.connectionId = response.connectionId;
        this.onOpen?.();
        this.onMessage?.({ type: 'session:hello', payload: { connectionId: this.connectionId } });
        return response;
    }

    startPolling (intervalMs = 800, mode = 'lobby')
    {
        this.pollMode = mode;
        this.stopPolling();
        this.pollTimer = window.setInterval(async () => {
            try
            {
                const state = await this.request(`/api/state?connectionId=${encodeURIComponent(this.connectionId || '')}`);
                if (this.pollMode === 'lobby')
                {
                    this.onMessage?.({ type: 'lobby:state', payload: state.lobbyState });
                }

                if (state.matchState)
                {
                    this.onMessage?.({
                        type: 'match:state',
                        payload: {
                            matchState: state.matchState,
                            connectionView: state.connectionView || null
                        }
                    });
                }

                if (state.matchPayload && state.matchNonce > this.lastMatchNonce)
                {
                    this.lastMatchNonce = state.matchNonce;
                    this.onMessage?.({ type: 'match:started', payload: state.matchPayload });
                }
            }
            catch (error)
            {
                this.onError?.(error);
                this.stopPolling();
            }
        }, intervalMs);
    }

    stopPolling ()
    {
        if (this.pollTimer !== null)
        {
            window.clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    createLobby (config)
    {
        return this.request('/api/create-lobby', {
            method: 'POST',
            body: JSON.stringify({ connectionId: this.connectionId, config })
        });
    }

    joinLobby (config)
    {
        return this.request('/api/join-lobby', {
            method: 'POST',
            body: JSON.stringify({ connectionId: this.connectionId, config })
        });
    }

    updateLobbyOptions (options)
    {
        return this.request('/api/update-options', {
            method: 'POST',
            body: JSON.stringify({ connectionId: this.connectionId, options })
        });
    }

    sendChatMessage (message)
    {
        return this.request('/api/chat', {
            method: 'POST',
            body: JSON.stringify({ connectionId: this.connectionId, message })
        });
    }

    startMatch ()
    {
        return this.request('/api/start-match', {
            method: 'POST',
            body: JSON.stringify({ connectionId: this.connectionId })
        });
    }

    sendPlayerInput (inputProfile, direction)
    {
        return this.request('/api/input', {
            method: 'POST',
            body: JSON.stringify({
                connectionId: this.connectionId,
                inputProfile,
                direction
            })
        });
    }

    disconnect ()
    {
        this.stopPolling();
        if (this.connectionId)
        {
            this.request('/api/disconnect', {
                method: 'POST',
                body: JSON.stringify({ connectionId: this.connectionId })
            }).catch(() => undefined);
        }

        this.connectionId = null;
        this.onClose?.();
    }
}