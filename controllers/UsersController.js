import sha1 from 'sha1';
import Queue from 'bull';
import dbClient from '../utils/db';

const userQueue = new Queue('userQueue');

class UsersController {
    static async postNew(request, response) {
      const { email, password } = request.body;
  
      // Vérifie si l'email est présent
      if (!email) {
        return response.status(400).send({ error: 'Missing email' });
      }
  
      // Vérifie si le mot de passe est présent
      if (!password) {
        return response.status(400).send({ error: 'Missing password' });
      }
  
      // Vérifie si l'email existe déjà dans la base de données
      const emailExists = await dbClient.db
        .collection('users')
        .findOne({ email });
  
      if (emailExists) {
        return response.status(400).send({ error: 'Already exist' });
      }
  
      // Hache le mot de passe avec SHA1
      const sha1Password = sha1(password);
  
      let result;
      try {
        // Insère le nouvel utilisateur dans la base de données
        result = await dbClient.db.collection('users').insertOne({
          email,
          password: sha1Password,
        });
      } catch (err) {
        // En cas d'erreur, ajoute une tâche vide à la file d'attente et retourne une erreur 500
        await userQueue.add({});
        return response.status(500).send({ error: 'Error creating user' });
      }
  
      // Crée et retourne l'objet utilisateur avec l'ID et l'email
      const user = {
        id: result.insertedId,
        email,
      };
  
      // Ajoute une tâche à la file d'attente avec l'ID de l'utilisateur
      await userQueue.add({
        userId: result.insertedId.toString(),
      });
  
      return response.status(201).send(user);
    }
  }
  

module.exports = UsersController;
