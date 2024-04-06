import sha1 from 'sha1';
import dbClient from '../utils/db';

class UsersController {
  static async postNew(request, response) {
    try {
      const { email, password } = request.body;

      if (!email) {
        return response.status(400).json({ error: 'Missing email' });
      }

      if (!password) {
        return response.status(400).json({ error: 'Missing password' });
      }

      const userExists = await dbClient.getUser({ email });
      if (userExists) {
        return response.status(400).json({ error: 'Already exist' });
      }

      const hashedPassword = sha1(password);
      const newUser = await dbClient.db.collection('users').insertOne({
        email,
        password: hashedPassword,
      });

      return response.status(201).json({ id: newUser.insertedId, email });
    } catch (error) {
      console.error(error);
      return response.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

module.exports = UsersController;
