const sha1 = require('sha1');
const { v4: uuidv4 } = require('uuid');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');

class AuthController {
  static async getConnect(req, res) {
    const authorization = req.headers.authorization || null;
    if (!authorization) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const buff = Buffer.from(authorization.replace('Basic ', ''), 'base64');
    const [email, password] = buff.toString('utf-8').split(':');

    if (!email || !password) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const hashedPassword = sha1(password);
    const credentials = { email, password: hashedPassword };

    const userExist = await dbClient.db
      .collection('users')
      .findOne(credentials);

    if (!userExist) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = uuidv4();
    const key = `auth_${token}`;

    await redisClient.set(key, userExist._id.toString(), 24 * 60 * 60);

    return res.status(200).json({ token });
  }

  static async getDisconnect(req, res) {
    const token = req.headers['x-token'] || null;
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const redisToken = await redisClient.get(`auth_${token}`);
    if (!redisToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await redisClient.del(`auth_${token}`);
    return res.status(204).send();
  }
}

module.exports = AuthController;
