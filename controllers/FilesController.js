import { v4 as uuid4 } from 'uuid';
import RedisClient from '../utils/redis';
import DBClient from '../utils/db';

const { ObjectId } = require('mongodb');
const fs = require('fs');
const Bull = require('bull');
const mime = require('mime-types');

class FilesController {
  static async postUpload(req, res) {
    const fileQueue = new Bull('fileQueue');

    const token = req.header('X-Token') || null;
    if (!token) return res.status(401).send({ error: 'Unauthorized' });

    const redisToken = await RedisClient.get(`auth_${token}`);
    if (!redisToken) return res.status(401).send({ error: 'Unauthorized' });

    const user = await DBClient.db
      .collection('users')
      .findOne({ _id: ObjectId(redisToken) });
    if (!user) return res.status(401).send({ error: 'Unauthorized' });

    const fileName = req.body.name;
    if (!fileName) return res.status(400).send({ error: 'Missing name' });

    const fileType = req.body.type;
    if (!fileType || !['folder', 'file', 'image'].includes(fileType)) return res.status(400).send({ error: 'Missing type' });

    const fileData = req.body.data;
    if (!fileData && ['file', 'image'].includes(fileType)) return res.status(400).send({ error: 'Missing data' });

    const fileIsPublic = req.body.isPublic || false;

    let fileParentId = req.body.parentId || 0;
    fileParentId = fileParentId === '0' ? 0 : fileParentId;

    if (fileParentId !== 0) {
      const parentFile = await DBClient.db
        .collection('files')
        .findOne({ _id: ObjectId(fileParentId) });
      if (!parentFile) return res.status(400).send({ error: 'Parent not found' });
      if (parentFile.type !== 'folder') return res.status(400).send({ error: 'Parent is not a folder' });
    }

    const fileDataDb = {
      userId: user._id,
      name: fileName,
      type: fileType,
      isPublic: fileIsPublic,
      parentId: fileParentId,
    };

    if (fileDataDb.type === 'folder') {
      await DBClient.db.collection('files').insertOne(fileDataDb);
      return res.status(201).send({
        id: fileDataDb._id,
        userId: fileDataDb.userId,
        name: fileDataDb.name,
        type: fileDataDb.type,
        isPublic: fileDataDb.isPublic,
        parentId: fileDataDb.parentId,
      });
    }

    const pathDir = process.env.FOLDER_PATH || '/tmp/files_manager';
    const fileUuid = uuid4();

    const buff = Buffer.from(fileData, 'base64');
    const pathFile = `${pathDir}/${fileUuid}`;

    // eslint-disable-next-line consistent-return
    fs.mkdir(pathDir, { recursive: true }, (error) => {
      if (error) return res.status(400).send({ error: error.message });
      // eslint-disable-next-line consistent-return
      fs.writeFile(pathFile, buff, (error) => {
        if (error) return res.status(400).send({ error: error.message });
      });
    });

    fileDataDb.localPath = pathFile;
    await DBClient.db.collection('files').insertOne(fileDataDb);

    fileQueue.add({
      userId: fileDataDb.userId,
      fileId: fileDataDb._id,
    });

    return res.status(201).send({
      id: fileDataDb._id,
      userId: fileDataDb.userId,
      name: fileDataDb.name,
      type: fileDataDb.type,
      isPublic: fileDataDb.isPublic,
      parentId: fileDataDb.parentId,
    });
  }

  static async getShow(request, response) {
    const token = request.header('X-Token') || null;
    if (!token) return response.status(401).send({ error: 'Unauthorized' });

    const redisToken = await RedisClient.get(`auth_${token}`);
    if (!redisToken) return response.status(401).send({ error: 'Unauthorized' });

    const user = await DBClient.db
      .collection('users')
      .findOne({ _id: ObjectId(redisToken) });
    if (!user) return response.status(401).send({ error: 'Unauthorized' });

    const idFile = request.params.id || '';
    // if (!idFile) return response.status(404).send({ error: 'Not found' });

    const fileDocument = await DBClient.db
      .collection('files')
      .findOne({ _id: ObjectId(idFile), userId: user._id });
    if (!fileDocument) return response.status(404).send({ error: 'Not found' });

    return response.send({
      id: fileDocument._id,
      userId: fileDocument.userId,
      name: fileDocument.name,
      type: fileDocument.type,
      isPublic: fileDocument.isPublic,
      parentId: fileDocument.parentId,
    });
  }

  static async getIndex(request, response) {
    const token = request.header('X-Token') || null;
    if (!token) return response.status(401).send({ error: 'Unauthorized' });

    const redisToken = await RedisClient.get(`auth_${token}`);
    if (!redisToken) return response.status(401).send({ error: 'Unauthorized' });

    const user = await DBClient.db
      .collection('users')
      .findOne({ _id: ObjectId(redisToken) });
    if (!user) return response.status(401).send({ error: 'Unauthorized' });

    let parentId = request.query.parentId || 0;
    parentId = parentId === '0' ? 0 : parentId;

    const pagination = request.query.page || 0;

    const aggregationMatch = {
      $and: [{ parentId: parentId === 0 ? 0 : ObjectId(parentId) }],
    };
    let aggregateData = [
      { $match: aggregationMatch },
      { $skip: pagination * 20 },
      { $limit: 20 },
    ];
    if (parentId === 0) aggregateData = [{ $skip: pagination * 20 }, { $limit: 20 }];

    const files = await DBClient.db
      .collection('files')
      .aggregate(aggregateData);
    const filesArray = [];
    await files.forEach((item) => {
      const fileItem = {
        id: item._id,
        userId: item.userId,
        name: item.name,
        type: item.type,
        isPublic: item.isPublic,
        parentId: item.parentId,
      };
      filesArray.push(fileItem);
    });

    return response.send(filesArray);
  }

  static async putPublish(request, response) {
    const token = request.header('X-Token') || null;
    if (!token) return response.status(401).send({ error: 'Unauthorized' });

    const redisToken = await RedisClient.get(`auth_${token}`);
    if (!redisToken) return response.status(401).send({ error: 'Unauthorized' });

    const user = await DBClient.db
      .collection('users')
      .findOne({ _id: ObjectId(redisToken) });
    if (!user) return response.status(401).send({ error: 'Unauthorized' });

    const idFile = request.params.id || '';

    let fileDocument = await DBClient.db
      .collection('files')
      .findOne({ _id: ObjectId(idFile), userId: user._id });
    if (!fileDocument) return response.status(404).send({ error: 'Not found' });

    await DBClient.db
      .collection('files')
      .update({ _id: ObjectId(idFile) }, { $set: { isPublic: true } });
    fileDocument = await DBClient.db
      .collection('files')
      .findOne({ _id: ObjectId(idFile), userId: user._id });

    return response.send({
      id: fileDocument._id,
      userId: fileDocument.userId,
      name: fileDocument.name,
      type: fileDocument.type,
      isPublic: fileDocument.isPublic,
      parentId: fileDocument.parentId,
    });
  }

  static async putUnpublish(request, response) {
    const token = request.header('X-Token') || null;
    if (!token) return response.status(401).send({ error: 'Unauthorized' });

    const redisToken = await RedisClient.get(`auth_${token}`);
    if (!redisToken) return response.status(401).send({ error: 'Unauthorized' });

    const user = await DBClient.db
      .collection('users')
      .findOne({ _id: ObjectId(redisToken) });
    if (!user) return response.status(401).send({ error: 'Unauthorized' });

    const idFile = request.params.id || '';

    let fileDocument = await DBClient.db
      .collection('files')
      .findOne({ _id: ObjectId(idFile), userId: user._id });
    if (!fileDocument) return response.status(404).send({ error: 'Not found' });

    await DBClient.db
      .collection('files')
      .update(
        { _id: ObjectId(idFile), userId: user._id },
        { $set: { isPublic: false } },
      );
    fileDocument = await DBClient.db
      .collection('files')
      .findOne({ _id: ObjectId(idFile), userId: user._id });

    return response.send({
      id: fileDocument._id,
      userId: fileDocument.userId,
      name: fileDocument.name,
      type: fileDocument.type,
      isPublic: fileDocument.isPublic,
      parentId: fileDocument.parentId,
    });
  }

  static async getFile(request, response) {
    const idFile = request.params.id || '';
    const size = request.query.size || 0;

    const fileDocument = await DBClient.db
      .collection('files')
      .findOne({ _id: ObjectId(idFile) });
    if (!fileDocument) return response.status(404).send({ error: 'Not found' });

    const { isPublic } = fileDocument;
    const { userId } = fileDocument;
    const { type } = fileDocument;

    let user = null;
    let owner = false;

    const token = request.header('X-Token') || null;
    if (token) {
      const redisToken = await RedisClient.get(`auth_${token}`);
      if (redisToken) {
        user = await DBClient.db
          .collection('users')
          .findOne({ _id: ObjectId(redisToken) });
        if (user) owner = user._id.toString() === userId.toString();
      }
    }

    if (!isPublic && !owner) return response.status(404).send({ error: 'Not found' });
    if (['folder'].includes(type)) {
      return response
        .status(400)
        .send({ error: "A folder doesn't have content" });
    }

    const realPath = size === 0 ? fileDocument.localPath : `${fileDocument.localPath}_${size}`;

    try {
      const dataFile = fs.readFileSync(realPath);
      const mimeType = mime.contentType(fileDocument.name);
      response.setHeader('Content-Type', mimeType);
      return response.send(dataFile);
    } catch (error) {
      return response.status(404).send({ error: 'Not found' });
    }
  }
}

module.exports = FilesController;
