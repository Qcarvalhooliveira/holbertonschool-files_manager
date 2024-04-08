const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');

// Function to check if the given parent ID corresponds to a folder
const parentIsFolder = async (parentId) => {
    try {
        const parentFile = await db.db.collection('files').findOne({ _id: parentId, type: 'folder' });
        return !!parentFile; // Returns true if parentFile exists and is a folder, false otherwise
    } catch (error) {
        console.error('Error checking parent folder:', error);
        return false;
    }
};

// Function to save a file in the database
const saveFileInDB = async (fileData) => {
    try {
        const result = await db.db.collection('files').insertOne(fileData);
        return result.ops[0]; // Return the newly inserted file object
    } catch (error) {
        console.error('Error saving file in database:', error);
        throw error; // Rethrow the error to handle it in the calling function
    }
};

// Function to create a new file or folder in the database and on disk
const postUpload = async (req, res) => {
    const { name, type, data, parentId = 0, isPublic = false } = req.body;

    // Check if user is authorized
    const { user } = req;

    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if name and type are provided
    if (!name) {
        return res.status(400).json({ error: 'Missing name' });
    }

    if (!type || !['folder', 'file', 'image'].includes(type)) {
        return res.status(400).json({ error: 'Missing type' });
    }

    // Check if data is provided for file or image type
    if (type !== 'folder' && !data) {
        return res.status(400).json({ error: 'Missing data' });
    }

    // Check if parent exists and is a folder
    if (parentId !== 0 && !(await parentIsFolder(parentId))) {
        return res.status(400).json({ error: 'Parent is not a folder' });
    }

    // Save file or folder in database
    const newFile = {
        userId: user.id,
        name,
        type,
        isPublic,
        parentId,
        localPath: null // Will be set below if needed
    };

    // If type is folder, save directly to database
    if (type === 'folder') {
        // Save to database and return
        const newFolder = await saveFileInDB(newFile);
        return res.status(201).json(newFolder);
    }

    // For file or image type, store locally and then save to database
    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    const filePath = path.join(folderPath, `${uuidv4()}`);

    // Decode and save file content
    const fileContent = Buffer.from(data, 'base64');
    fs.writeFile(filePath, fileContent, async (err) => {
        if (err) {
            return res.status(500).json({ error: 'Internal server error' });
        }

        newFile.localPath = filePath;

        // Save to database and return
        try {
            const newFileInDB = await saveFileInDB(newFile);
            return res.status(201).json(newFileInDB);
        } catch (error) {
            return res.status(500).json({ error: 'Internal server error' });
        }
    });
};

module.exports = { postUpload };
