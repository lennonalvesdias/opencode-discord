  /**
   * Inicia a sessão obtendo ou criando um servidor para o projeto e
   * registrando uma sessão na API do OpenCode.
   * @param {ServerManager} serverManager
   * @throws {Error} Quando falha ao iniciar o servidor ou criar a sessão API
   */
  async start(serverManager) {
    this.status = 'idle';

    try {
      this.server = await serverManager.getOrCreate(this.projectPath);
    } catch (err) {
      this.status = 'error';
      this.emit('status', 'error');
      this.emit('error', new Error(`Falha ao iniciar servidor: ${err?.message ?? err}`));
      throw err;
    }

    try {
      const apiSession = await this.server.client.createSession();
      this.apiSessionId = apiSession.id;
    } catch (err) {
      this.status = 'error';
      this.emit('status', 'error');
      this.emit('error', new Error(`Falha ao criar sessão na API: ${err?.message ?? err}`));
      throw err;
    }

    this.server.registerSession(this.apiSessionId, this);

    debug('OpenCodeSession', '✅ Sessão API criada: %s (sessão interna: %s)', this.apiSessionId, this.sessionId);

    this.emit('status', 'idle');

    this.server.on('restart', () => {
      this.emit('server-restart');
    });

    this.server.on('fatal', (err) => {
      this.status = 'error';
      this.emit('status', 'error');
      this.emit('error', new Error(`Servidor fatal: ${err?.message ?? err}`));
    });
  }
