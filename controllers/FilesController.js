const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');

class FilesController {
  static async postUpload(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const {
      name, type, parentId = 0, isPublic = false, data,
    } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing or invalid type' });
    }
    if (!data && type !== 'folder') return res.status(400).json({ error: 'Missing data' });

    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    let localPath = '';
    if (type === 'file' || type === 'image') {
      const filename = uuidv4();
      localPath = path.join(folderPath, filename);
      fs.writeFileSync(localPath, Buffer.from(data, 'base64'));
    }

    const file = await dbClient.saveFile({
      userId,
      name,
      type,
      isPublic,
      parentId,
      localPath,
    });

    res.status(201).json(file);
  }
}

module.exports = FilesController;
