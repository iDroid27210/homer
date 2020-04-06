const Provider = require('./Provider');

const TABLE_COLUMNS = [
  ['id', 'SERIAL', 'PRIMARY KEY'],
  ['caller', 'INT', 'NOT NULL'],
  ['called', 'INT', 'NOT NULL'],
  ['state', 'INT', 'NOT NULL'],
  ['updated', 'TIMESTAMP', null],
  ['created', 'TIMESTAMP', 'NOT NULL'],
];

class CallProvider extends Provider {
  constructor(client) {
    super(client, 'calls', TABLE_COLUMNS);

    /**
     * States for a call
     * @type {object}
     */
    this.states = {
      PENDING: 0,
      ONGOING: 1,
      TERMINATED: 2,
      ERROR: 4,
    };
  }

  /**
   * Contract provider for this client
   * @type {ContractProvider}
   */
  get contracts() {
    return this.client.telephone.contracts;
  }

  /**
   * Creates a call
   * @param {number} caller Caller's contract ID
   * @param {number} called Called's contract ID
   * @returns {Promise<number>} Call ID
   */
  async createCall(caller, called) {
    const ongoing = await Promise.all([this.findCall(caller), this.findCall(called)]);
    if (ongoing[0]) throw new Error('CALLER_BUSY');
    if (ongoing[1]) throw new Error('CALLED_BUSY');

    const callerContract = await this.contracts.getRow(caller);
    if (!callerContract || callerContract.state !== this.contracts.states.ACTIVE) throw new Error('UNKNOWN_CALLER');

    const calledContract = await this.contracts.getRow(called);
    if (!calledContract || calledContract.state !== this.contracts.states.ACTIVE) throw new Error('UNKNOWN_CALLED');

    const id = await this.insertRow({
      caller,
      called,
      state: this.states.PENDING,
      created: new Date(),
    })
      .catch((error) => {
        this.client.logger.error(`[calls->createCall] Cannot create call between ${caller} and ${called}`, error);
        throw new Error('DATABASE_ERROR');
      });

    await this.contracts.notify(caller, true, 'telephone.notifications.outgoing', calledContract.number);
    await this.contracts.notify(called, true, 'telephone.notifications.incoming', callerContract.number);

    return id;
  }

  /**
   * Picks up a call
   * @param {number} id Call ID
   */
  async pickupCall(id) {
    const call = await this.getRow(id);
    if (!call) throw new Error('UNKNOWN_CALL');

    if (call.state > this.states.PENDING) throw new Error('ALREADY_PICKED');

    await this.updateRow(id, {
      state: this.states.ONGOING,
      updated: new Date(),
    });

    await this.contracts.notify(call.caller, true, 'telephone.notifications.pickedCaller');
    await this.contracts.notify(call.called, true, 'telephone.notifications.pickedCalled');

    return null;
  }

  /**
   * Terminates an ongoing call
   * @param {number} id Call ID
   * @param {'TERMINATED'|'ERROR'} type Termination type
   */
  async endCall(id, type) {
    if (!this.states[type]) throw new Error('UNKNOWN_TYPE');

    const call = await this.getRow(id);
    if (!call) throw new Error('UNKNOWN_CALL');

    if (call.state > this.states.ONGOING) throw new Error('ALREADY_TERMINATED');

    await this.updateRow(id, {
      state: this.states[type],
      updated: new Date(),
    });

    await this.contracts.notify(call.caller, true, 'telephone.notifications.terminated');
    await this.contracts.notify(call.called, true, 'telephone.notifications.terminated');

    return null;
  }

  /**
   * Finds a call involving a contract
   * @param {number} contract Contract ID
   * @returns {Promise<?object>} Call
   */
  async findCall(contract) {
    const call = await this.getRows([
      ['state', '<', this.states.TERMINATED],
      [['caller', '=', contract], ['called', '=', contract]],
    ]);
    return call[0] || null;
  }

  /**
   * Handles a message
   * @param {Message} message Message instance
   */
  async handleMessage(message) {
    if (!this.database.ready || message.author.bot) return;

    const contract = await this.contracts.fetchContract(message.channel.id);
    if (!contract) return;

    const call = await this.findCall(contract.id);
    if (!call) return;

    const correspondent = await this.contracts.getRow(call.caller === contract.id
      ? call.called
      : call.caller);
    if (!correspondent) return;

    let content = message.cleanContent;
    const linkTest = content.match(/(?:(?:https?|ftp|file):\/\/|www\.|ftp\.)(?:\([-A-Z0-9+&@#/%=~_|$?!:,.]*\)|[-A-Z0-9+&@#/%=~_|$?!:,.])*(?:\([-A-Z0-9+&@#/%=~_|$?!:,.]*\)|[A-Z0-9+&@#/%=~_|$])/igm);
    for (let i = 0; i < (linkTest || []).length; i += 1) {
      content = content.replace(linkTest[i], `<${linkTest[i]}>`);
    }

    const inviteTest = content.match(/discord(?:app\.com\/invite|\.gg(?:\/invite)?)\/([\w-]{2,255})/igm);
    for (let i = 0; i < (inviteTest || []).length; i += 1) {
      content = content.replace(inviteTest[i], `<${inviteTest[i]}>`);
    }

    const attachments = message.attachments
      .map((a) => `${message.dot} ${a.spoiler ? '||' : ''}**${a.name}** (**${Math.ceil(a.size / 1024)}**KB): <${a.url}>${a.spoiler ? '||' : ''}`)
      .join('\n');

    await this.contracts.notify(correspondent.id, false, `📞 ${message.author.tag}: ${content}${attachments ? `\n${attachments}` : ''}`);
  }
}

module.exports = CallProvider;