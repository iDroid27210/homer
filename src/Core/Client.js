const { Client } = require('discord.js');
const snekfetch = require('snekfetch');
const Dashboard = require('../Web/Dashboard');
const { readdir } = require('fs');
const config = require('../config.json');
const Constants = require('./Constants');

/* Managers */
const DatabaseManager = require('./Managers/DatabaseManager');
const CommandsManager = require('./Managers/CommandsManager');
const AbsenceManager = require('./Managers/AbsenceManager');
const PhoneManager = require('./Managers/PhoneManager');

/* Helpers */
const FinderHelper = require('./Helpers/FinderHelper');
const LastactiveHelper = require('./Helpers/LastactiveHelper');
const LisaHelper = require('./Helpers/LisaHelper');
const HandlerHelper = require('./Helpers/HandlerHelper');
const MiscHelper = require('./Helpers/MiscHelper');
const ModHelper = require('./Helpers/ModHelper');

/**
 * The main hub for interacting with the Discord API.
 * @extends {Client}
 */
class ExtendedClient extends Client {
  /**
   * @param {ClientOptions} options Options for the client
   */
  constructor(options) {
    super(options || config.clientOptions || {});

    /**
     * Date when the instance was created.
     * @type {Date}
     */
    this.initiated = new Date();

    /**
     * Configuration object associated to the client.
     * @type {Object}
     */
    this.config = config;

    /**
     * Constants for the client.
     * @type {Constants}
     */
    this.constants = Constants;

    /**
     * Cleverbot feature status (enabled or disabled).
     * @type {Boolean}
     */
    this.cleverbot = true;

    /**
     * Nickname generated by Cleverbot.io used for requests.
     * @type {?String}
     */
    this.cleverbotName = null;

    /**
     * Custom game set (when client updates it).
     * @type {?String}
     */
    this.customGame = null;

    /**
     * Disabled commands.
     * @type {Object}
     */
    this.disabledCommands = {};

    /**
     * Database manager associated to the client.
     * @type {DatabaseManager}
     */
    this.database = new DatabaseManager(this, config.database);

    /**
     * Commands manager associated to the client.
     * @type {CommandsManager}
     */
    this.commands = new CommandsManager(this);

    /**
     * Absence manager associated to the client.
     * @type {AbsenceManager}
     */
    this.absence = new AbsenceManager(this);

    /**
     * Telephone manager associated to the client.
     * @type {PhoneManager}
     */
    this.phone = new PhoneManager(this);

    /**
     * Dashboard associated to the client.
     * @type {Dashboard}
     */
    this.dashboard = new Dashboard(this, config.dashboard);

    /**
     * Finder helper associated to the client.
     * @type {FinderHelper}
     */
    this.finder = new FinderHelper(this);

    /**
     * Lastactive helper associated to the client.
     * @type {LastactiveHelper}
     */
    this.lastactive = new LastactiveHelper(this);

    /**
     * Lisa scripting language helper associated to the client.
     * @type {LisaHelper}
     */
    this.lisa = new LisaHelper(this);

    /**
     * Handler helper associated to the client.
     * @type {HandlerHelper}
     */
    this.stuffHandler = new HandlerHelper(this);

    /**
     * Miscallenaeous helper associated to the client.
     * @type {MiscHelper}
     */
    this.misc = new MiscHelper(this);

    /**
     * Moderation helper associated to the client.
     * @type {ModHelper}
     */
    this.moderation = new ModHelper(this);

    // Creating Cleverbot instance
    snekfetch
      .post('https://cleverbot.io/1.0/create')
      .set({ 'Content-Type': 'application/json' })
      .send({
        user: this.config.api.cleverbotUser,
        key: this.config.api.cleverbotKey,
      })
      .then((res) => {
        this.cleverbotName = res.body.nick;
        console.log('[Cleverbot] Created instance successfully');
      })
      .catch((res) => {
        if (res.body && res.body.status) console.log(`[Cleverbot] Failed to create instance: ${res.body.status}`);
        else console.log('[Cleverbot] Failed to create instance.');
      });
  }

  /**
   * Load all the events in the Events folder.
   */
  loadEvents() {
    readdir(`${__dirname}/../Production/Events`, (err, files) => {
      if (err) throw err;

      for (const event of files) {
        const eventFile = new (require(`${__dirname}/../Production/Events/${event}`))(this);
        this.on(eventFile.name, (...args) => eventFile.handle(...args));
        delete require.cache[require.resolve(`${__dirname}/../Production/Events/${event}`)];
      }
    });
  }

  /**
   * Update the bot game.
   */
  updateGame() {
    this.user.setActivity(this.client.customGame ?
      this.client.customGame
        .replace(/{servers}/g, this.client.guilds.size)
        .replace(/{users}/g, this.client.users.size)
        .replace(/{prefix}/g, this.client.config.discord.defaultPrefixes[0])
      : `Type ${this.config.discord.defaultPrefixes[0]}help! On ${this.guilds.size} servers with ${this.users.size} users.`);
  }

  /**
   * Escapes markdown content.
   * @param {string} string String to escape
   * @returns {string}
   */
  escapeMarkdown(string) {
    return string.replace(/[\*\(\)\[\]\+\-\\_`#<>]/g, m => this.constants.markdownCharacters[m]); // eslint-disable-line no-useless-escape
  }
}

module.exports = ExtendedClient;
