const Bull = require('bull');
const imageThumbnail = require('image-thumbnail');
const path = require('path');

// Créer une file d'attente Bull
const fileQueue = new Bull('fileQueue');

// Processus de la file d'attente
fileQueue.process(async (job) => {
    const { userId, fileId } = job.data;

    // Vérifier si userId et fileId sont présents dans le travail
    if (!userId) {
        throw new Error('Missing userId');
    }
    if (!fileId) {
        throw new Error('Missing fileId');
    }

    // Rechercher le document dans la base de données
    const fileDocument = await DBClient.db.collection('files').findOne({ _id: ObjectId(fileId), userId });

    if (!fileDocument) {
        throw new Error('File not found');
    }

    // Générer les miniatures
    const sizes = [500, 250, 100];
    const originalFilePath = path.join(process.env.FOLDER_PATH || '/tmp/files_manager', `${fileId}`);

    await Promise.all(sizes.map(async (size) => {
        try {
            const thumbnail = await imageThumbnail(originalFilePath, { width: size });
            const thumbnailFilePath = path.join(process.env.FOLDER_PATH || '/tmp/files_manager', `${fileId}_${size}`);
            await fs.writeFile(thumbnailFilePath, thumbnail);
        } catch (error) {
            console.error(`Error generating thumbnail for size ${size}: ${error.message}`);
        }
    }));
});
