import { Kart } from './Kart.js';

export class PlayerKart extends Kart {
  constructor() {
    super('player', {
      name: 'You',
      isPlayer: true,
      color: 0xffd23f,
      accent: 0x10161d,
      maxSpeed: 58,
      accelerationForce: 76,
      brakeForce: 104,
      reverseForce: 24,
      grip: 15.8,
      boostPower: 36,
    });
  }
}
