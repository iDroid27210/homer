const { Player } = require('lavacord');

class CustomPlayer extends Player {
  constructor(node, id, radio) {
    super(node, id);

    /**
     * ID of the radio being broadcasted
     * @type {number}
     */
    this.radio = radio;

    /**
     * Time this player was created at
     * @type {number}
     */
    this.start = Date.now();
  }
}

module.exports = CustomPlayer;
