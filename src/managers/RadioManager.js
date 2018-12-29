const Manager = require('../structures/Manager');
const request = require('superagent');
//const { writeFileSync } = require('fs');

class RadioManager extends Manager {
  constructor(client) {
    super(client);

    // Data
    this.ERROR_URL = `${this.client.constants.CDN}/assets/radios/ERROR.mp3`;

    // Broadcasts
    this.broadcasts = [];
  }

  createBroadcast(playError = true) {
    const broadcast = this.client.createVoiceBroadcast();
    broadcast.on('unsubscribe', this.clearBroadcasts);
    broadcast.on('error', error => this.stopBroadcast(broadcast, error, playError));
    broadcast.on('warn', warn => null); //this.client.debug(`RADIO: Broadcast warning (${broadcast.radio || '?'}): ${warn instanceof Error ? warn.message : warn}`)
    return broadcast;
  }

  async getBroadcast(frequency) {
    const radio = await this.client.database.getDocument('radios', frequency);
    if (!radio) return null;
    const url = await parseURL(radio.url);

    const broadcast = this.createBroadcast();
    broadcast.name = radio.name;
    broadcast.radio = radio.id;
    broadcast.playStream(url, { bitrate: 64 });
    this.broadcasts.push(broadcast);
    //this.client.debug(`RADIO: Created voice broadcast for ${radio.name} (${radio.id})`);
    return broadcast;
  }

  playError(dispatchers) {
    const broadcast = this.createBroadcast(false);
    dispatchers.forEach(d => d.player.voiceConnection.playBroadcast(broadcast));
    broadcast.playStream(this.ERROR_URL, { bitrate: 64 });
    broadcast.on('end', () => {
      dispatchers.forEach(d => d.player.voiceConnection.channel.leave());
      broadcast.destroy();
    });
  }

  stopBroadcast(broadcast, error, play = true) {
    broadcast.destroy();
    this.broadcasts.splice(this.broadcasts.findIndex(b => b.radio === broadcast.radio), 1);
    broadcast.dispatchers.forEach(d => d.player.voiceConnection.channel.leave());

    //const now = Date.now();
    //this.client.debug(`RADIO: Voice broadcast error for ${broadcast.radio} (see ERROR_${now}.txt file)`);
    //writeFileSync(`./errors/ERROR_${now}.txt`, `Date: ${new Date(now).toUTCString()}\r\nCode: ${error.code || 'None'}\r\nMessage: ${error.message}`);
  }

  clearBroadcasts(broadcasts = this.broadcasts) {
    const list = broadcasts.filter(b => b.dispatchers.length === 0);
    if (list.length === 0) return;

    list.forEach((broadcast) => {
      broadcast.destroy();
      broadcasts.splice(broadcasts.findIndex(b => b.radio === broadcast.radio), 1);
      //this.client.debug(`RADIO: Cleared ${list.length} broadcasts: ${list.map(b => b.radio).join(', ')}`);
    });
  }

  dispatcherError(context, dispatcher, error) {
    //this.client.debug(`RADIO: Dispatcher error (guild ${context.message.guild.id}): ${error.message}`);

    context.replyWarning(context.__('radio.dispatcherError'));
    dispatcher.end();
    dispatcher.player.voiceConnection.channel.leave();
  }
}

async function parseURL(url) {
  const path = url.split('?')[0];
  const extension = ['pls', 'm3u'].find(e => path.toLowerCase().endsWith(e));

  if (extension) {
    const data = await request.get(url).then(r => r.text).catch(() => '');
    return parser[extension.toUpperCase()].parse(data)[0].file;
  }

  return url;
}

module.exports = RadioManager;