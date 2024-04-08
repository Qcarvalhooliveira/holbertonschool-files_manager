const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { ObjectId } = require('mongodb');
const Bull = require('bull');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');

class FilesController {
  static async postUpload(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(userId) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const {
      name, type, parentId = 0, isPublic = false, data,
    } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing or invalid type' });
    }
    if (!data && type !== 'folder') return res.status(400).json({ error: 'Missing data' });

    const parentObjectId = parentId === '0' ? 0 : ObjectId(parentId);
    if (parentObjectId !== 0) {
      const parentFile = await dbClient.db.collection('files').findOne({ _id: parentObjectId });
      if (!parentFile) return res.status(400).json({ error: 'Parent not found' });
      if (parentFile.type !== 'folder') return res.status(400).json({ error: 'Parent is not a folder' });
    }

    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    await fs.mkdir(folderPath, { recursive: true });

    let localPath = '';
    if (type === 'file' || type === 'image') {
      const filename = uuidv4();
      localPath = path.join(folderPath, filename);
      await fs.writeFile(localPath, Buffer.from(data, 'base64'));
    }

    const fileData = {
      userId: ObjectId(userId),
      name,
      type,
      isPublic,
      parentId: parentObjectId,
      localPath,
    };

    const result = await dbClient.db.collection('files').insertOne(fileData);

    res.status(201).json({
      id: result.insertedId,
      userId: fileData.userId,
      name: fileData.name,
      type: fileData.type,
      isPublic: fileData.isPublic,
      parentId: fileData.parentId.toString(),
    });
  }
}

module.exports = FilesController;
